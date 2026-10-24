import { useCallback, useState } from 'react';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import SheetViewer, { downloadReport } from '../components/SheetViewer.jsx';
import { dayLabel, monthName } from '../format.js';
import { listMine, showUploadLink, UPLOAD_PATH } from '../reports.js';
import useLoad from '../useLoad.js';

export const fileSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const isNew = (r) => Date.now() - new Date(r.uploaded_at).getTime() < 3 * 24 * 3600 * 1000;
export const period = (r) => (r.period_from === r.period_to ? dayLabel(r.period_from) : `${dayLabel(r.period_from)} to ${dayLabel(r.period_to)}`);

export function ReportRow({ report, onOpen, onError }) {
  return (
    <li className="p-report">
      <span className="p-report__icon" aria-hidden="true">{report.filename.split('.').pop().toUpperCase()}</span>
      <button type="button" className="p-report__main" onClick={() => onOpen(report)}>
        <b>{report.title}{isNew(report) && <em className="p-new">New</em>}</b>
        <span>{period(report)} · {fileSize(report.size)} · added {new Date(report.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        {report.note && <small>{report.note}</small>}
      </button>
      <div className="p-report__tools">
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => onOpen(report)}>View</button>
        <button type="button" className="p-iconbtn" aria-label={`Download ${report.filename}`} onClick={() => downloadReport(report).catch((e) => onError(e.message))}><Icon name="download" /></button>
      </div>
    </li>
  );
}

// Billing reports from our team, grouped by the month they cover.
export default function Reports() {
  const { data, error, reload } = useLoad(listMine, []);
  const [open, setOpen] = useState(null);
  const [fileError, setFileError] = useState('');
  const close = useCallback(() => setOpen(null), []);

  const months = {};
  for (const r of data || []) (months[r.period_to.slice(0, 7)] ||= []).push(r);
  const keys = Object.keys(months).sort().reverse();

  return (
    <>
      <PageHead title="Reports" sub="Billing reports from our team, as Excel files. Open one here or download it.">
        <button type="button" className="btn btn--quiet btn--sm" onClick={reload}><Icon name="refresh" />Refresh</button>
        {showUploadLink() && <a href={UPLOAD_PATH} target="_blank" rel="noopener" className="btn btn--light btn--sm"><Icon name="download" className="p-icon p-icon--up" />Upload Reports</a>}
      </PageHead>
      <ErrorNote error={error || fileError} onRetry={error ? reload : null} />
      {!data && !error && <div className="p-card"><div className="p-rows is-skeleton" /></div>}
      {data && !data.length && (
        <section className="p-card p-empty-card">
          <span className="p-insights__icon"><Icon name="reports" /></span>
          <h2>No Reports Yet</h2>
          <p>When our team sends you a billing report, it will appear here immediately.</p>
          {showUploadLink() && <a href={UPLOAD_PATH} target="_blank" rel="noopener" className="btn btn--light btn--sm p-empty-card__cta"><Icon name="download" className="p-icon p-icon--up" />Upload a Report</a>}
        </section>
      )}
      {keys.map((k) => (
        <section className="p-card" key={k}>
          <header className="p-card__head"><div><h2>{monthName(k)}</h2><p>{months[k].length} report{months[k].length === 1 ? '' : 's'}</p></div></header>
          <ul className="p-reports">
            {months[k].map((r) => <ReportRow key={r.id} report={r} onOpen={setOpen} onError={setFileError} />)}
          </ul>
        </section>
      ))}
      {open && <SheetViewer report={open} onClose={close} />}
    </>
  );
}
