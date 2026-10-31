import { useCallback, useEffect, useState } from 'react';
import { useStatement } from '../../src/components/BillingPage.jsx';
import { loadSession } from '../../src/lib/portal.js';
import Shell, { ADMIN_NAV, NAV, OWNER_NAV, PageHead, STAFF_NAV } from './components/Shell.jsx';
import OwnerPanel from './pages/OwnerPanel.jsx';
import { navigate, usePath } from './router.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Reset from './pages/Reset.jsx';
import Reports from './pages/Reports.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';
import Upload, { ReportManager } from './pages/Upload.jsx';
import { listMine, markReportsSeen, reportsSeenAt, staffSignInKind, unseenReports } from './reports.js';
import useLoad from './useLoad.js';
import AdminUsers, { NewLogin } from './pages/AdminUsers.jsx';
import AdminUser from './pages/AdminUser.jsx';
import AdminFinance from './pages/AdminFinance.jsx';
import AdminAudit from './pages/AdminAudit.jsx';
import Customers from './pages/Customers.jsx';
import SupportChat from './components/SupportChat.jsx';

const PAGES = { '/': Billing, '/reports': Reports, '/settings': Settings };
const PUBLIC = ['/login', '/setup', '/reset', '/upload'];
const toLogin = () => navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`, { replace: true });

// Signed in as a customer: billing, reports and settings.
function Portal({ path }) {
  const onSignedOut = useCallback(toLogin, []);
  const statement = useStatement(onSignedOut);
  // Their reports, for Billing, Reports and the count of new ones on the Reports tab. Checked again every 5 minutes.
  const reports = useLoad(listMine, []);
  const [seenAt, setSeenAt] = useState(reportsSeenAt);
  const unseen = unseenReports(reports.data, seenAt);
  const onSeen = useCallback(() => setSeenAt(markReportsSeen(reports.data)), [reports.data]);
  const Page = PAGES[path] || Billing;
  const title = NAV.find((n) => n.to === path)?.label || 'Billing';

  useEffect(() => {
    document.title = `${title} | CallsTalk Client`;
    if (!PAGES[path]) navigate('/', { replace: true });
  }, [path, title]);

  const { reload } = reports;
  useEffect(() => {
    const t = setInterval(reload, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <Shell path={path} statement={statement.data} badges={{ '/reports': unseen.length }}>
      <Page statement={statement} reports={reports} unseen={unseen} onSeen={onSeen} />
      <SupportChat company={statement.data?.customer} />
    </Shell>
  );
}

// Signed in as an admin: logins and customers' billing, finance, the audit log, plus their own settings.
const ADMIN_PAGES = {
  '/admin': { title: 'Logins', Page: AdminUsers },
  '/admin/finance': { title: 'Finance', Page: AdminFinance },
  '/admin/audit': { title: 'Audit Log', Page: AdminAudit },
  '/admin/reports': { title: 'Reports', Page: ReportManager },
};

// The Owner gets every admin page, plus the Owner Panel (`owner`).
const OWNER_PAGES = { ...ADMIN_PAGES, '/admin/owner': { title: 'Owner Panel', Page: OwnerPanel } };

function Admin({ path, owner = false }) {
  const pages = owner ? OWNER_PAGES : ADMIN_PAGES;
  const userId = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(path)?.[1];
  const known = pages[path] || path === '/settings' || userId;
  const title = path === '/settings' ? 'Settings' : pages[path]?.title || 'Logins';
  const Page = pages[path]?.Page || AdminUsers;

  useEffect(() => {
    document.title = `${title} | CallsTalk ${owner ? 'Owner' : 'Admin'}`;
    // Older links to the standalone upload page open Reports inside the admin portal.
    if (path === '/upload') navigate('/admin/reports', { replace: true });
    else if (!known) navigate(owner ? '/admin/owner' : '/admin', { replace: true });
  }, [known, title, path, owner]);

  if (path === '/upload') return null;

  return (
    <Shell path={userId ? '/admin' : path} nav={owner ? OWNER_NAV : ADMIN_NAV} team={owner ? 'owner' : 'admin'}>
      {path === '/settings' ? <Settings team={owner ? 'owner' : 'admin'} /> : userId ? <AdminUser id={userId} onSignedOut={toLogin} /> : <Page key={path} onSignedOut={toLogin} />}
    </Shell>
  );
}

// Signed in as staff: customer reports (/upload), customers (/customers) and each one's page (/customers/<id>: their
// login, billing, calls, replaced calls and payments, as admins have it), adding customers (/customers/new) and their
// own settings, in the same frame as admins. Nothing else.
const STAFF_TITLES = { '/upload': 'Reports', '/customers': 'Customers', '/customers/new': 'New Customer', '/settings': 'Settings' };

function Staff({ path }) {
  const customerId = /^\/customers\/([0-9a-f-]{36})$/.exec(path)?.[1];
  const title = customerId ? 'Customer' : STAFF_TITLES[path];
  useEffect(() => {
    if (title) document.title = `${title} | CallsTalk Billing`;
    else navigate('/upload', { replace: true });
  }, [path, title]);

  if (!title) return null;
  return (
    <Shell path={customerId ? '/customers' : path} nav={STAFF_NAV} team="staff">
      {path === '/settings' ? <Settings team="staff" />
        : customerId ? <AdminUser id={customerId} onSignedOut={toLogin} />
        : path === '/customers' ? <Customers />
        : path === '/customers/new' ? <><PageHead title="New Customer" /><NewLogin roles={['customer']} onCreated={() => {}} /></>
        : <ReportManager onSignedOut={toLogin} />}
    </Shell>
  );
}

export default function App() {
  const path = usePath();
  const session = loadSession();
  const signedIn = Boolean(session?.access);

  useEffect(() => {
    // Keeps the query too, so a link like /reports?open=<id> from an email still opens the report after logging in.
    if (!signedIn && !PUBLIC.includes(path)) navigate(`/login?next=${encodeURIComponent(path + window.location.search)}`, { replace: true });
  }, [signedIn, path]);

  // Signed-in admins and staff get reports inside their portal; the standalone page is for the demo and local key.
  const team = signedIn && staffSignInKind === 'login' && ['owner', 'admin', 'staff'].includes(session.role);
  if (path === '/upload' && !team) return <Upload />;
  if (path === '/setup') return <Setup />;
  if (path === '/reset') return <Reset />;
  if (path === '/login') return <Login />;
  if (!signedIn) return null;
  if (session.role === 'owner') return <Admin path={path} owner />;
  if (session.role === 'admin') return <Admin path={path} />;
  if (session.role === 'staff') return <Staff path={path} />;
  // Customers on any other address (an /admin link, say) are sent to Billing by Portal.
  return <Portal path={path} />;
}
