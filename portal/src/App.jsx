import { useCallback, useEffect, useState } from 'react';
import { useStatement } from '../../src/components/BillingPage.jsx';
import { loadSession } from '../../src/lib/portal.js';
import Shell, { ADMIN_NAV, NAV, PageHead, STAFF_NAV } from './components/Shell.jsx';
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
    document.title = `${title} | CallsTalk Portal`;
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

function Admin({ path }) {
  const userId = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(path)?.[1];
  const known = ADMIN_PAGES[path] || path === '/settings' || userId;
  const title = path === '/settings' ? 'Settings' : ADMIN_PAGES[path]?.title || 'Logins';
  const Page = ADMIN_PAGES[path]?.Page || AdminUsers;

  useEffect(() => {
    document.title = `${title} | CallsTalk Admin`;
    // Older links to the standalone upload page open Reports inside the admin portal.
    if (path === '/upload') navigate('/admin/reports', { replace: true });
    else if (!known) navigate('/admin', { replace: true });
  }, [known, title, path]);

  if (path === '/upload') return null;

  return (
    <Shell path={userId ? '/admin' : path} nav={ADMIN_NAV} team="admin">
      {path === '/settings' ? <Settings team="admin" /> : userId ? <AdminUser id={userId} onSignedOut={toLogin} /> : <Page key={path} onSignedOut={toLogin} />}
    </Shell>
  );
}

// Signed in as staff: customer reports (/upload), adding customers (/customers/new) and their own settings, in the
// same frame as admins. Nothing else.
const STAFF_TITLES = { '/upload': 'Reports', '/customers/new': 'New Customer', '/settings': 'Settings' };

function Staff({ path }) {
  const known = Boolean(STAFF_TITLES[path]);
  useEffect(() => {
    if (known) document.title = `${STAFF_TITLES[path]} | CallsTalk Staff`;
    else navigate('/upload', { replace: true });
  }, [path, known]);

  if (!known) return null;
  return (
    <Shell path={path} nav={STAFF_NAV} team="staff">
      {path === '/settings' ? <Settings team="staff" />
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
  const team = signedIn && staffSignInKind === 'login' && ['admin', 'staff'].includes(session.role);
  if (path === '/upload' && !team) return <Upload />;
  if (path === '/setup') return <Setup />;
  if (path === '/reset') return <Reset />;
  if (path === '/login') return <Login />;
  if (!signedIn) return null;
  if (session.role === 'admin') return <Admin path={path} />;
  if (session.role === 'staff') return <Staff path={path} />;
  // Customers on any other address (an /admin link, say) are sent to Billing by Portal.
  return <Portal path={path} />;
}
