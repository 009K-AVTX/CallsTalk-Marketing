import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { isAdmin } from '../../../src/lib/portal.js';
import { fetchBilling } from '../admin.js';
import { Avatar } from '../avatar.jsx';
import { enterBillingDays, planBillingDays, readBillingDays, toEnter } from '../billing-import.js';
import { readCallSummary } from '../call-summary.js';
import Icon from '../components/Icons.jsx';
import { ErrorNote } from '../components/Shell.jsx';
import { addDays, dayLabel, money, today } from '../format.js';
import {
  canNotify, deleteReport, KINDS, listAll, listCustomers, localKeyHint, MAX_MB, notifyReports, staffSession, staffSignIn, staffSignOut, staffSignInKind, uploadReport,
} from '../reports.js';
import { fileSize, period } from './Reports.jsx';

const ACCEPT = '.xlsx,.xls,.csv';

// A blank billing report in the format customers know from the old Telegram bill. The sums are formulas:
// Call Charges = (Total Calls - Replacements) x Price, Balance = Opening - Charges + Payment, and each day
// opens on the last balance. Replaced calls are not charged ("125 - 2" bills 123).
async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const head = ['Date', 'Opening Balance ($)', 'Total Calls', 'Replacements', 'Price per Call ($)', 'Call Charges ($)', 'Payment Received ($)', 'Balance ($)'];
  const rows = [head];
  for (let i = 7; i >= 1; i--) rows.push([addDays(today(), -i), null, null, null, null, null, null, null]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 2; r <= 8; r++) {
    ws[`B${r}`] = r === 2 ? { t: 'n', v: 0 } : { t: 'n', f: `H${r - 1}` };
    ws[`C${r}`] = { t: 'n', v: 0 };
    ws[`D${r}`] = { t: 'n', v: 0 };
    ws[`E${r}`] = { t: 'n', v: 0 };
    ws[`F${r}`] = { t: 'n', f: `(C${r}-D${r})*E${r}` };
    ws[`G${r}`] = { t: 'n', v: 0 };
    ws[`H${r}`] = { t: 'n', f: `B${r}-F${r}+G${r}` };
    for (const c of 'BEFGH') ws[`${c}${r}`].z = '$#,##0.00;[Red]-$#,##0.00';
  }
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 17 }, { wch: 17 }, { wch: 20 }, { wch: 15 }];
  const pay = XLSX.utils.aoa_to_sheet([['Payment Date', 'Amount ($)', 'Method', 'Reference']]);
  pay['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Bills');
  XLSX.utils.book_append_sheet(wb, pay, 'Payments');
  XLSX.writeFile(wb, 'CallsTalk-billing-report-template.xlsx');
}

function Gate({ onIn }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await staffSignIn({ key });
      onIn();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  // On our server the billing team uses their portal staff or admin login: password, then the authenticator code.
  if (staffSignInKind === 'login') {
    return (
      <div className="access-card p-up__gate">
        <h2>Billing Team Sign In</h2>
        <p className="access-card__lead">This page is for CallsTalk staff and admins. Reports uploaded here are available in the customer's portal immediately.</p>
        <a className="btn btn--light" href={`/login?next=${encodeURIComponent('/upload')}`}>Log In</a>
      </div>
    );
  }

  return (
    <form className="access-card p-up__gate" onSubmit={submit}>
      <h2>Billing Team Sign In</h2>
      <p className="access-card__lead">This page is for the CallsTalk billing team. Reports uploaded here are available in the customer's portal immediately.</p>
      <label>Upload Key<input required type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" autoFocus />{localKeyHint && <small className="p-up__hint">Testing locally: the key is “{localKeyHint}”.</small>}</label>
      {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Checking…' : 'Sign In'}</button>
    </form>
  );
}

// "117 - 4 at $35.00": calls less replacements, and the price when there is one.
const callsText = ({ calls, replacements, price }) => `${calls}${replacements ? ` - ${replacements}` : ''}${price ? ` at ${money(price)}` : ''}`;
const ACTION = { new: ['New', 'is-wait'], change: ['Changes', 'is-warn'], same: ['Same', ''], skip: ['Skipped', 'is-off'] };

// Admins: the days read from the chosen report, set against what the buyer's billing has, and the choice to enter
// them (billing-import.js). Nothing is saved unless it is ticked, and only once the report has uploaded.
function CallsFromFile({ read, billing, plan, enter, onEnter }) {
  const todo = plan ? toEnter(plan) : [];
  const changed = todo.filter((d) => d.action === 'change').length;
  const unread = read.skipped;
  let note;
  if (billing?.error) note = `The customer's billing could not be loaded: ${billing.error}`;
  else if (billing?.data && !billing.data.account) note = 'This customer has no billing terms yet. Set them on their page first.';
  else if (!plan) note = 'Checking the customer\'s billing…';
  else if (!todo.length) note = 'Nothing to change: the billing already has these figures.';
  else note = `${todo.length} day${todo.length === 1 ? '' : 's'} to enter${changed ? `, ${changed} of them changing what is there` : ''}. Saved after the report uploads; each one is in the Audit Log.`;

  return (
    <div className="p-import">
      <label className={`p-check${todo.length ? '' : ' is-off'}`}>
        <input type="checkbox" checked={enter && todo.length > 0} onChange={(e) => onEnter(e.target.checked)} disabled={!todo.length} />
        <span><b>Enter these calls in the customer's billing</b><small>{note}</small></span>
      </label>
      {plan && (
        <div className="p-tablewrap p-tablewrap--inset p-import__table">
          <table className="p-table p-table--sheet">
            <thead><tr><th scope="col">Day</th><th scope="col">In the File</th><th scope="col">In Billing Now</th></tr></thead>
            <tbody>
              {plan.map((d) => (
                <tr key={d.date} className={`is-${d.action}`}>
                  <th scope="row">{dayLabel(d.date)}</th>
                  <td>{callsText(d)}</td>
                  <td>
                    {d.now ? callsText(d.now) : '-'} <span className={`p-pill ${ACTION[d.action][1]}`}>{ACTION[d.action][0]}</span>
                    {d.reason && <small className="p-import__why">{d.reason}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {unread.length > 0 && (
        <small className="p-import__why">
          Not read: {unread.map((s) => (s.row ? `row ${s.row}${s.file ? ` of ${s.file}` : ''}` : dayLabel(s.date)) + ` (${s.reason})`).join('; ')}.
        </small>
      )}
    </div>
  );
}

// What each kind of report is for, under the choice.
const KIND_NOTES = {
  calls: 'The day\'s call log. The customer can view and download it in their portal, and is told about it.',
  billing: 'For our team only: the customer does not see it. An admin can enter its calls in the customer\'s billing.',
};

function UploadForm({ customers, onDone }) {
  const yesterday = addDays(today(), -1);
  const [form, setForm] = useState({ customer: '', title: '', note: '', periodFrom: yesterday, periodTo: yesterday });
  const [kind, setKind] = useState('calls');
  // Tell the customer about the upload (on by default; untick e.g. when re-uploading a corrected file).
  const [notify, setNotify] = useState(true);
  const [byTelegram, setByTelegram] = useState(true);
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');
  const input = useRef(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  // Whether the chosen customer has connected Telegram in their Settings (only they can turn it on).
  const chosen = customers.find((c) => c.id === form.customer);
  const telegramReady = Boolean(chosen?.telegram);

  // The chosen files, read both ways. A billing report's days (Excel template or Financial Overview format) set its
  // period, and admins can enter them in the buyer's billing with the upload; only admins change billing. A Call
  // Summary's calls set its period. The type follows what the files turn out to be.
  const canEnterCalls = canNotify && isAdmin();
  const [read, setRead] = useState(null); // billing days: { days, skipped } or null
  const [log, setLog] = useState(null); // calls: { calls, from, to, unread } or null
  const [billing, setBilling] = useState(null); // { data } | { error } for the chosen buyer
  const [enterCalls, setEnterCalls] = useState(false);
  useEffect(() => {
    let gone = false;
    setRead(null);
    setLog(null);
    if (files.length) {
      Promise.all([readBillingDays(files), readCallSummary(files)]).then(([days, calls]) => {
        if (gone) return;
        setRead(days);
        setLog(calls);
        if (calls && !days?.days.length) setKind('calls');
        else if (days?.days.length && !calls) setKind('billing');
      });
    }
    return () => { gone = true; };
  }, [files]);
  useEffect(() => {
    const [from, to] = kind === 'calls' ? [log?.from, log?.to] : [read?.days[0]?.date, read?.days.at(-1)?.date];
    if (from) setForm((f) => ({ ...f, periodFrom: from, periodTo: to }));
  }, [kind, read, log]);
  useEffect(() => {
    let gone = false;
    setBilling(null);
    if (canEnterCalls && kind === 'billing' && chosen && read?.days.length) {
      fetchBilling(chosen.id).then((data) => !gone && setBilling({ data }), (err) => !gone && setBilling({ error: err.message }));
    }
    return () => { gone = true; };
  }, [canEnterCalls, kind, chosen?.id, read]);
  const plan = useMemo(() => (kind === 'billing' && read && billing?.data?.account ? planBillingDays(read.days, billing.data) : null), [kind, read, billing]);
  useEffect(() => setEnterCalls(false), [plan]); // a new file or buyer: ticked again only after a look at the days

  const pick = (list) => {
    const ok = [...list].filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (ok.length < list.length) setMessage('Only Excel (.xlsx, .xls) and .csv files can be uploaded.');
    else setMessage('');
    setFiles(ok);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!files.length) return setMessage('Choose a file to upload.');
    if (form.periodFrom > form.periodTo) return setMessage('The start date is after the end date.');
    // A billing report must never reach the customer, and a call log is no billing report.
    if (kind === 'calls' && read?.days.length) return setMessage('This is a billing report, not a call log. Choose Billing Report: customers do not see those.');
    if (kind === 'calls' && !log) return setMessage('This does not look like a Call Summary: no row starts with a call\'s date and time (e.g. 2026-10-26 15:22:51).');
    if (kind === 'calls' && log.unread.length) return setMessage(`No calls were found in ${log.unread.join(', ')}. Upload Call Summaries only.`);
    if (kind === 'billing' && log && !read) return setMessage(`This is a call log (${log.calls} calls). Choose Call Summary to share it with the customer.`);
    setStatus('sending');
    setMessage('');
    try {
      const uploaded = [];
      // With several files, each takes its own name as the title unless one title was given for a single file. A
      // single Call Summary without one is "Call Summary, 72 calls".
      const single = files.length === 1 && (form.title.trim() || (kind === 'calls' ? `Call Summary, ${log.calls} call${log.calls === 1 ? '' : 's'}` : ''));
      for (const file of files) uploaded.push(await uploadReport({ ...form, kind, title: single || '', file }));
      const who = customers.find((c) => c.id === form.customer)?.login || form.customer.trim().toLowerCase();
      let notes = '';
      if (kind === 'billing' && enterCalls && plan && toEnter(plan).length) {
        const { saved, failed } = await enterBillingDays(form.customer, plan, dayLabel);
        notes += saved ? ` Calls for ${saved} day${saved === 1 ? '' : 's'} entered in their billing.` : '';
        if (failed.length) notes += ` Not entered: ${failed.join('; ')}.`;
      }
      const telegram = byTelegram && telegramReady;
      if (kind === 'calls' && (notify || telegram) && canNotify) {
        // One notice per channel for the whole upload. A failed notice never undoes the upload.
        const sent = await notifyReports(form.customer, uploaded.map((r) => r.id), { email: notify, telegram })
          .catch((err) => ({ emailed: false, reason: err.message, telegram: { sent: false, reason: err.message } }));
        if (notify) notes += sent.emailed ? ` An email has been sent to ${sent.email}.` : ` The customer was not emailed: ${sent.reason}.`;
        if (telegram) {
          notes += sent.telegram?.sent
            ? ` A Telegram message has been sent${sent.telegram.username ? ` to @${sent.telegram.username}` : ''}.`
            : ` No Telegram message was sent: ${sent.telegram?.reason || 'unknown error'}.`;
        }
      }
      setStatus('done');
      const n = files.length;
      setMessage(kind === 'calls'
        ? `${n} Call Summar${n === 1 ? 'y' : 'ies'} uploaded for ${who}. They can view ${n === 1 ? 'it' : 'them'} in their portal now.${notes}`
        : `${n} billing report${n === 1 ? '' : 's'} uploaded for ${who}, for our team only.${notes}`);
      setFiles([]);
      setForm({ ...form, title: '', note: '' });
      if (input.current) input.current.value = '';
      onDone();
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  return (
    <form className="p-card p-form p-up__form" onSubmit={submit}>
      <header className="p-card__head">
        <div><h2>Upload a Report</h2><p>Excel or CSV, up to {MAX_MB} MB each.</p></div>
        {kind === 'billing' && <button type="button" className="btn btn--quiet btn--sm" onClick={downloadTemplate}><Icon name="download" />Excel Template</button>}
      </header>
      <div className="p-up__kind">
        <span className="p-up__label">Report Type</span>
        <div className="p-ranges" role="radiogroup" aria-label="Report type">
          {Object.entries(KINDS).reverse().map(([k, name]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>{name}</button>
          ))}
        </div>
        <small className="p-up__hint">{KIND_NOTES[kind]}</small>
      </div>
      <label>Customer Login ID
        {customers.some((c) => c.id !== c.login) ? (
          <select required value={form.customer} onChange={set('customer')}>
            <option value="">Choose a customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.login}){c.telegram ? ' · Telegram' : ''}</option>)}
          </select>
        ) : (
          <>
            <input required type="email" list="p-customers" value={form.customer} onChange={set('customer')} placeholder="customer@company.com" autoComplete="off" />
            <datalist id="p-customers">{customers.map((c) => <option key={c.id} value={c.login} />)}</datalist>
          </>
        )}
      </label>
      <div className="p-form__row">
        <label>From<input required type="date" value={form.periodFrom} max={today()} onChange={set('periodFrom')} /></label>
        <label>To<input required type="date" value={form.periodTo} max={today()} onChange={set('periodTo')} /></label>
      </div>
      <label><span>Title <i className="p-optional">optional</i></span><input value={form.title} onChange={set('title')} maxLength={120} placeholder={files.length > 1 ? 'Each file keeps its own name' : kind === 'calls' ? `e.g. Call Summary, ${log?.calls ?? 72} calls` : 'e.g. Billing Report, Oct 23'} disabled={files.length > 1} /></label>
      <label><span>{kind === 'calls' ? 'Note for the Customer' : 'Note'} <i className="p-optional">optional</i></span><input value={form.note} onChange={set('note')} maxLength={300} placeholder={kind === 'calls' ? 'e.g. Includes the evening calls' : 'e.g. Includes the Oct 22 payment'} /></label>
      <label
        className={`p-drop${drag ? ' is-over' : ''}${files.length ? ' has-files' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" accept={ACCEPT} multiple onChange={(e) => pick(e.target.files)} />
        <Icon name="download" className="p-icon p-drop__icon" />
        {files.length ? (
          <span>
            {files.map((f) => <b key={f.name}>{f.name} <small>{fileSize(f.size)}</small></b>)}
            {kind === 'calls' && log && <small>{log.calls.toLocaleString('en-US')} call{log.calls === 1 ? '' : 's'}, {log.from === log.to ? dayLabel(log.from) : `${dayLabel(log.from)} to ${dayLabel(log.to)}`}</small>}
          </span>
        ) : (
          <span><b>Drop Excel files here</b> or click to choose</span>
        )}
      </label>
      {kind === 'billing' && canEnterCalls && chosen && read?.days.length > 0 && (
        <CallsFromFile read={read} billing={billing} plan={plan} enter={enterCalls} onEnter={setEnterCalls} />
      )}
      {kind === 'calls' && canNotify && (
        <>
          <label className="p-check">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span><b>Email the customer</b><small>“Your report has been updated for (the report’s dates). You can view your Call Summary report from your portal: (link)” One email to their login ID, with a button that opens the report. The file itself is not attached.</small></span>
          </label>
          <label className={`p-check${chosen && !telegramReady ? ' is-off' : ''}`}>
            <input type="checkbox" checked={byTelegram && telegramReady} onChange={(e) => setByTelegram(e.target.checked)} disabled={!telegramReady} />
            <span>
              <b>Send on Telegram</b>
              <small>
                {!chosen ? 'The same message, sent to the customer’s Telegram if they have connected it.'
                  : telegramReady ? 'The same message, with a button that opens the report.'
                    : 'This customer has not connected Telegram yet. They can do it under Settings in their portal.'}
              </small>
            </span>
          </label>
        </>
      )}
      {message &&<p className={status === 'done' ? 'p-ok' : 'access-card__error'} role={status === 'done' ? 'status' : 'alert'}>{status === 'done' && <Icon name="check" />}{message}</p>}
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Uploading…' : `Upload ${kind === 'calls' ? `Call Summar${files.length > 1 ? 'ies' : 'y'}` : `Billing Report${files.length > 1 ? 's' : ''}`}`}</button>
    </form>
  );
}

// Customer reports: upload, list and remove. Shown inside the admin and staff portal (Reports in the top bar),
// and on the standalone /upload page (demo and local key sign-in). `onSignedOut` runs when the session ends.
export function ReportManager({ onSignedOut }) {
  const [reports, setReports] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [all, people] = await Promise.all([listAll(), listCustomers()]);
      setReports(all);
      setCustomers(people);
      setError('');
    } catch (err) {
      if (!staffSession()) onSignedOut?.();
      setError(err.message);
    }
  }, [onSignedOut]);

  useEffect(() => { load(); }, [load]);

  const remove = async (r) => {
    const seen = r.kind === 'calls' ? ' The customer will no longer be able to see it.' : '';
    if (!window.confirm(`Delete "${r.title}" for ${r.customer}?${seen}`)) return;
    try {
      await deleteReport(r.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const shown = (reports || []).filter((r) => !filter || r.customer.includes(filter.trim().toLowerCase()) || r.title.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <div className="p-head"><div><h1>Customer Reports</h1><p>Call Summaries appear in the customer's portal under Reports. Billing reports stay with our team.</p></div></div>
      <ErrorNote error={error} onRetry={load} />
      <div className="p-up__grid">
        <UploadForm customers={customers} onDone={load} />
        <section className="p-card p-card--flush">
          <header className="p-card__head">
            <div><h2>Uploaded</h2><p>{reports ? `${reports.length} report${reports.length === 1 ? '' : 's'}` : 'Loading…'}</p></div>
            <label className="p-search"><span className="sr-only">Filter</span><input type="search" placeholder="Filter by customer or title" value={filter} onChange={(e) => setFilter(e.target.value)} /></label>
          </header>
          <div className="p-tablewrap">
            <table className="p-table">
              <thead><tr><th scope="col">Customer</th><th scope="col">Report</th><th scope="col">Period</th><th scope="col">Added</th><th scope="col"><span className="sr-only">Delete</span></th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <span className="p-person">
                        <Avatar userId={r.user_id} version={customers.find((c) => c.id === r.user_id)?.avatar_version} name={r.customer} size="sm" />
                        {r.customer}
                      </span>
                    </th>
                    <td>{r.title}<small className="p-up__file">{KINDS[r.kind] || KINDS.billing} · {r.filename} · {fileSize(r.size)}</small></td>
                    <td>{period(r)}</td>
                    <td>{new Date(r.uploaded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td><button type="button" className="p-iconbtn" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}><Icon name="close" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reports && !shown.length && <p className="p-empty">{reports.length ? 'No reports match that filter.' : 'No reports have been uploaded yet.'}</p>}
          </div>
        </section>
      </div>
    </>
  );
}

// The standalone upload page, /upload: for the demo and local testing (shared upload key). Signed-in admins and
// staff get the same reports inside their portal instead (App.jsx), with the usual top bar.
export default function Upload() {
  const [signedIn, setSignedIn] = useState(Boolean(staffSession()));
  const signedOut = useCallback(() => setSignedIn(false), []);

  useEffect(() => {
    document.title = 'Upload Reports | CallsTalk';
  }, []);

  return (
    <div className="p-app p-up">
      <header className="p-top">
        <div className="p-top__inner">
          <span className="p-brand"><LogoMark className="p-brand__mark" /><span>Calls<b>Talk</b></span><em>Report Upload</em></span>
          {staffSignInKind === 'login'
            ? (isAdmin() ? <a href="/admin" className="btn btn--quiet btn--sm p-up__portal">Back to Admin</a>
              : signedIn && <a href="/settings" className="btn btn--quiet btn--sm p-up__portal"><Icon name="settings" />Settings</a>)
            : <a href="/reports" className="btn btn--quiet btn--sm p-up__portal">Open Customer Portal</a>}
          {signedIn && <button type="button" className="btn btn--quiet btn--sm p-up__out" onClick={() => { staffSignOut(); setSignedIn(false); }}><Icon name="logout" />Sign Out</button>}
        </div>
      </header>
      <main className="p-main">
        {signedIn ? <ReportManager onSignedOut={signedOut} /> : <Gate onIn={() => setSignedIn(true)} />}
      </main>
    </div>
  );
}
