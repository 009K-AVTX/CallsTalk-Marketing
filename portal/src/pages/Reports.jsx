import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import SheetViewer, { downloadReport } from '../components/SheetViewer.jsx';
import { dayLabel, monthName } from '../format.js';
import { showUploadLink, UPLOAD_PATH } from '../reports.js';
import { Link } from '../router.jsx';

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

// Reports uploaded since the customer last looked: on Reports with the newest one ready to open or download,
// on Billing with a way to Reports.
export function ReportNotice({ reports, onOpen, onError, onDismiss, toReports }) {
  if (!reports.length) return null;
  const [newest] = reports;
  const more = reports.length - 1;
  return (
    <section className="p-notice" role="status">
      <span className="p-notice__icon" aria-hidden="true"><Icon name="reports" /></span>
      <div className="p-notice__text">
        <b>Your report has been updated.</b>
        <p>You can now download it from your portal: <i>{newest.title}</i>, {period(newest)}{more > 0 && `, and ${more} more`}.</p>
      </div>
      <div className="p-notice__tools">
        {toReports ? <Link to="/reports" className="btn btn--light btn--sm">Open Reports</Link> : (
          <>
            <button type="button" className="btn btn--light btn--sm" onClick={() => onOpen(newest)}>View</button>
            <button type="button" className="btn btn--quiet btn--sm" onClick={() => downloadReport(newest).catch((e) => onError(e.message))}><Icon name="download" />Download</button>
          </>
        )}
        {onDismiss && <button type="button" className="p-iconbtn" aria-label="Dismiss" onClick={onDismiss}><Icon name="close" /></button>}
      </div>
    </section>
  );
}

// Billing reports from our team, grouped by the month they cover.
export default function Reports({ reports, unseen = [], onSeen }) {
  const { data, error, reload } = reports;
  const [open, setOpen] = useState(null);
  const [fileError, setFileError] = useState('');
  const close = useCallback(() => setOpen(null), []);

  // New reports are pointed out once they are on screen here, and counted as seen; the notice stays until
  // it is dismissed or the customer leaves the page.
  const [fresh, setFresh] = useState([]);
  useEffect(() => {
    if (!unseen.length) return;
    setFresh((shown) => [...unseen, ...shown.filter((r) => !unseen.some((u) => u.id === r.id))]);
    onSeen();
  }, [unseen, onSeen]);

  // The "report ready" email links to /reports?open=<id>: open that report once the list is in.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('open');
    const report = wanted && data?.find((r) => r.id === wanted);
    if (!report) return;
    setOpen(report);
    window.history.replaceState({}, '', '/reports');
  }, [data]);

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
      <ReportNotice reports={fresh} onOpen={setOpen} onError={setFileError} onDismiss={() => setFresh([])} />
      {!data && !error && <div className="p-card"><div className="p-rows is-skeleton" /></div>}
      {data && !data.length && (
        <section className="p-card p-empty-card">
          <span className="p-insights__icon"><Icon name="reports" /></span>
          <h2>No Reports Yet</h2>
          <p>Billing reports issued by our team will appear here as soon as they are uploaded.</p>
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
