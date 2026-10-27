import { useCallback, useState } from 'react';
import { BillingSections } from '../../../src/components/BillingPage.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import SheetViewer from '../components/SheetViewer.jsx';
import { clock } from '../format.js';
import { showUploadLink, UPLOAD_PATH } from '../reports.js';
import { Link } from '../router.jsx';
import { ReportNotice, ReportRow } from './Reports.jsx';

// The portal's home: the latest Call Summary reports, then the same bills as the website's Buyer Dashboard
// (wallet, today, last three days, history since September, payments).
export default function Billing({ statement, reports, unseen = [], onSeen }) {
  const { data, error, loading, load } = statement;
  const [open, setOpen] = useState(null);
  const [fileError, setFileError] = useState('');
  const close = useCallback(() => setOpen(null), []);
  const latest = (reports.data || []).slice(0, 3);

  return (
    <div className="billing p-billing">
      <PageHead title={data ? data.customer : 'Billing'} sub={<><span className="p-live" aria-hidden="true" />{data ? `Live · updated ${clock(data.as_of)}` : 'Loading your bill…'}</>}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => { load(); reports.reload(); }} disabled={loading}><Icon name="refresh" />Refresh</button>
      </PageHead>
      <ErrorNote error={error || fileError} onRetry={error ? load : null} />
      <ReportNotice reports={unseen} toReports onDismiss={onSeen} />

      {latest.length > 0 && (
        <section className="p-card p-latest">
          <header className="p-card__head">
            <div><h2>Latest Reports</h2><p>Call Summary reports from our team.</p></div>
            <div className="p-head__tools">
              {showUploadLink() && <a href={UPLOAD_PATH} target="_blank" rel="noopener" className="btn btn--quiet btn--sm"><Icon name="download" className="p-icon p-icon--up" />Upload</a>}
              <Link to="/reports" className="btn btn--quiet btn--sm">All Reports</Link>
            </div>
          </header>
          <ul className="p-reports">{latest.map((r) => <ReportRow key={r.id} report={r} onOpen={setOpen} onError={setFileError} />)}</ul>
        </section>
      )}

      {(data || !error) && <BillingSections data={data} onPaid={load} />}
      {open && <SheetViewer report={open} onClose={close} />}
    </div>
  );
}
