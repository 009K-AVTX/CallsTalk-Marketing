import { BillingSections } from '../../../src/components/BillingPage.jsx';
import Icon from '../components/Icons.jsx';
import { ErrorNote, PageHead } from '../components/Shell.jsx';
import { clock } from '../format.js';

// The same bills as the website's Buyer Dashboard: wallet, today, last three days, history since September.
export default function Billing({ statement }) {
  const { data, error, loading, load } = statement;
  return (
    <div className="billing p-billing">
      <PageHead title="Billing" sub={<><span className="p-live" aria-hidden="true" />{data ? `Live · updated ${clock(data.as_of)}` : 'Loading your bill…'}</>}>
        <button type="button" className="btn btn--quiet btn--sm" onClick={load} disabled={loading}><Icon name="refresh" />Refresh</button>
      </PageHead>
      <ErrorNote error={error} onRetry={load} />
      {(data || !error) && <BillingSections data={data} onPaid={load} />}
    </div>
  );
}
