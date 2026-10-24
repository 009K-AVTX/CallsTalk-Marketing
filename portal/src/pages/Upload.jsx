import { useCallback, useEffect, useRef, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote } from '../components/Shell.jsx';
import { addDays, today } from '../format.js';
import { deleteReport, listAll, listCustomers, localKeyHint, MAX_MB, staffSession, staffSignIn, staffSignOut, staffSignInKind, uploadReport } from '../reports.js';
import { fileSize, period } from './Reports.jsx';

const ACCEPT = '.xlsx,.xls,.csv';

// A blank billing report in the format customers know from the old Telegram bill. The sums are formulas:
// Call Charges = Calls x Price, Balance = Opening - Charges + Payment, and each day opens on the last balance.
async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const head = ['Date', 'Opening Balance ($)', 'Total Calls', 'Price per Call ($)', 'Call Charges ($)', 'Payment Received ($)', 'Balance ($)'];
  const rows = [head];
  for (let i = 7; i >= 1; i--) rows.push([addDays(today(), -i), null, null, null, null, null, null]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (let r = 2; r <= 8; r++) {
    ws[`B${r}`] = r === 2 ? { t: 'n', v: 0 } : { t: 'n', f: `G${r - 1}` };
    ws[`C${r}`] = { t: 'n', v: 0 };
    ws[`D${r}`] = { t: 'n', v: 0 };
    ws[`E${r}`] = { t: 'n', f: `C${r}*D${r}` };
    ws[`F${r}`] = { t: 'n', v: 0 };
    ws[`G${r}`] = { t: 'n', f: `B${r}-E${r}+F${r}` };
    for (const c of 'BDEFG') ws[`${c}${r}`].z = '$#,##0.00;[Red]-$#,##0.00';
  }
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 17 }, { wch: 17 }, { wch: 20 }, { wch: 15 }];
  const pay = XLSX.utils.aoa_to_sheet([['Payment Date', 'Amount ($)', 'Method', 'Reference']]);
  pay['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Bills');
  XLSX.utils.book_append_sheet(wb, pay, 'Payments');
  XLSX.writeFile(wb, 'CallsTalk-billing-report-template.xlsx');
}

function Gate({ onIn }) {
  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await staffSignIn({ key, email, password });
      onIn();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <form className="access-card p-up__gate" onSubmit={submit}>
      <h2>Billing Team Sign In</h2>
      <p className="access-card__lead">This page is for the CallsTalk billing team. Reports uploaded here appear in the customer's portal straight away.</p>
      {staffSignInKind === 'key' ? (
        <label>Upload Key<input required type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" autoFocus />{localKeyHint && <small className="p-up__hint">Testing locally: the key is “{localKeyHint}”.</small>}</label>
      ) : (
        <>
          <label>Staff Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></label>
          <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        </>
      )}
      {status === 'error' && <p className="access-card__error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Checking…' : 'Sign In'}</button>
    </form>
  );
}

function UploadForm({ customers, onDone }) {
  const yesterday = addDays(today(), -1);
  const [form, setForm] = useState({ customer: '', title: '', note: '', periodFrom: yesterday, periodTo: yesterday });
  const [files, setFiles] = useState([]);
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');
  const input = useRef(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

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
      for (const file of files) {
        // With several files, each takes its own name as the title unless one title was given for a single file.
        await uploadReport({ ...form, title: files.length === 1 ? form.title : '', file });
      }
      setStatus('done');
      setMessage(`${files.length} report${files.length === 1 ? '' : 's'} uploaded for ${form.customer.trim().toLowerCase()}. They can see ${files.length === 1 ? 'it' : 'them'} in their portal now.`);
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
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.login})</option>)}
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
      {message && <p className={status === 'done' ? 'p-ok' : 'access-card__error'} role={status === 'done' ? 'status' : 'alert'}>{status === 'done' && <Icon name="check" />}{message}</p>}
      <button type="submit" className="btn btn--light" disabled={status === 'sending'}>{status === 'sending' ? 'Uploading…' : `Upload${files.length > 1 ? ` ${files.length} Reports` : ''}`}</button>
    </form>
  );
}

// The billing team's upload link: /upload. Not part of the customer portal's navigation.
export default function Upload() {
  const [signedIn, setSignedIn] = useState(Boolean(staffSession()));
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
      if (!staffSession()) setSignedIn(false);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    document.title = 'Upload Reports | CallsTalk';
    if (signedIn) load();
  }, [signedIn, load]);

  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.title}" for ${r.customer}? They will no longer see it.`)) return;
    try {
      await deleteReport(r.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const shown = (reports || []).filter((r) => !filter || r.customer.includes(filter.trim().toLowerCase()) || r.title.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <div className="p-app p-up">
      <header className="p-top">
        <div className="p-top__inner">
          <span className="p-brand"><LogoMark className="p-brand__mark" /><span>Calls<b>Talk</b></span><em>Report Upload</em></span>
          <a href="/reports" className="btn btn--quiet btn--sm p-up__portal">Open Customer Portal</a>
          {signedIn && <button type="button" className="btn btn--quiet btn--sm p-up__out" onClick={() => { staffSignOut(); setSignedIn(false); setReports(null); }}><Icon name="logout" />Sign Out</button>}
        </div>
      </header>
      <main className="p-main">
        {!signedIn ? <Gate onIn={() => setSignedIn(true)} /> : (
          <>
            <div className="p-head"><div><h1>Customer Reports</h1><p>Upload a billing report and the customer sees it in their portal under Reports.</p></div></div>
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
                          <th scope="row">{r.customer}</th>
                          <td>{r.title}<small className="p-up__file">{r.filename} · {fileSize(r.size)}</small></td>
                          <td>{period(r)}</td>
                          <td>{new Date(r.uploaded_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                          <td><button type="button" className="p-iconbtn" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}><Icon name="close" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reports && !shown.length && <p className="p-empty">{reports.length ? 'No reports match that filter.' : 'Nothing uploaded yet.'}</p>}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
