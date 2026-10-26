import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { isAdmin } from '../../../src/lib/portal.js';
import { Avatar } from '../avatar.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote } from '../components/Shell.jsx';
import { addDays, today } from '../format.js';
import {
  canNotify, deleteReport, listAll, listCustomers, localKeyHint, MAX_MB, notifyReports, staffSession, staffSignIn, staffSignOut, staffSignInKind, uploadReport,
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

function UploadForm({ customers, onDone }) {
  const yesterday = addDays(today(), -1);
  const [form, setForm] = useState({ customer: '', title: '', note: '', periodFrom: yesterday, periodTo: yesterday });
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
    setStatus('sending');
    setMessage('');
    try {
      const uploaded = [];
      for (const file of files) {
        // With several files, each takes its own name as the title unless one title was given for a single file.
        uploaded.push(await uploadReport({ ...form, title: files.length === 1 ? form.title : '', file }));
      }
      const who = customers.find((c) => c.id === form.customer)?.login || form.customer.trim().toLowerCase();
      let notes = '';
      const telegram = byTelegram && telegramReady;
      if ((notify || telegram) && canNotify) {
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
      setMessage(`${files.length} report${files.length === 1 ? '' : 's'} uploaded for ${who}. They can see ${files.length === 1 ? 'it' : 'them'} in their portal now.${notes}`);
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
        <button type="button" className="btn btn--quiet btn--sm" onClick={downloadTemplate}><Icon name="download" />Excel Template</button>
      </header>
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
      <label><span>Title <i className="p-optional">optional</i></span><input value={form.title} onChange={set('title')} maxLength={120} placeholder={files.length > 1 ? 'Each file keeps its own name' : 'e.g. Billing Report, Oct 23'} disabled={files.length > 1} /></label>
      <label><span>Note for the Customer <i className="p-optional">optional</i></span><input value={form.note} onChange={set('note')} maxLength={300} placeholder="e.g. Includes the Oct 22 payment" /></label>
      <label
        className={`p-drop${drag ? ' is-over' : ''}${files.length ? ' has-files' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
      >
        <input ref={input} type="file" accept={ACCEPT} multiple onChange={(e) => pick(e.target.files)} />
        <Icon name="download" className="p-icon p-drop__icon" />
        {files.length ? (
          <span>{files.map((f) => <b key={f.name}>{f.name} <small>{fileSize(f.size)}</small></b>)}</span>
        ) : (
          <span><b>Drop Excel files here</b> or click to choose</span>
        )}
      </label>
      {canNotify && (
        <>
          <label className="p-check">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span><b>Email the customer</b><small>“Your report has been updated for (the report’s dates). You can now download it from your portal.” One email to their login ID, with a button that opens the report. The file itself is not attached.</small></span>
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
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Uploading…' : `Upload${files.length > 1 ? ` ${files.length} Reports` : ''}`}</button>
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
    if (!window.confirm(`Delete "${r.title}" for ${r.customer}? The customer will no longer be able to see it.`)) return;
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
      <div className="p-head"><div><h1>Customer Reports</h1><p>Upload a billing report, and it will appear in the customer's portal under Reports.</p></div></div>
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
                    <td>{r.title}<small className="p-up__file">{r.filename} · {fileSize(r.size)}</small></td>
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
