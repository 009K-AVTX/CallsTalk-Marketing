import { useCallback, useEffect } from 'react';
import { useStatement } from '../../src/components/BillingPage.jsx';
import { loadSession } from '../../src/lib/portal.js';
import Shell, { ADMIN_NAV, NAV, STAFF_NAV } from './components/Shell.jsx';
import { navigate, usePath } from './router.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Reports from './pages/Reports.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';
import Upload from './pages/Upload.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminUser from './pages/AdminUser.jsx';
import SupportChat from './components/SupportChat.jsx';

const PAGES = { '/': Billing, '/reports': Reports, '/settings': Settings };
const PUBLIC = ['/login', '/setup', '/upload'];
const toLogin = () => navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`, { replace: true });

// Signed in as a customer: billing, reports and settings.
function Portal({ path }) {
  const onSignedOut = useCallback(toLogin, []);
  const statement = useStatement(onSignedOut);
  const Page = PAGES[path] || Billing;
  const title = NAV.find((n) => n.to === path)?.label || 'Billing';

  useEffect(() => {
    document.title = `${title} | CallsTalk Portal`;
    if (!PAGES[path]) navigate('/', { replace: true });
  }, [path, title]);

  return (
    <Shell path={path} statement={statement.data}>
      <Page statement={statement} />
      <SupportChat company={statement.data?.customer} />
    </Shell>
  );
}

// Signed in as an admin: logins and customers' billing, plus their own settings.
function Admin({ path }) {
  const userId = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(path)?.[1];
  const known = path === '/admin' || path === '/settings' || userId;
  const title = path === '/settings' ? 'Settings' : 'Logins';

  useEffect(() => {
    document.title = `${title} | CallsTalk Admin`;
    if (!known) navigate('/admin', { replace: true });
  }, [known, title]);

  return (
    <Shell path={userId ? '/admin' : path} nav={ADMIN_NAV} team="admin">
      {path === '/settings' ? <Settings team="admin" /> : userId ? <AdminUser id={userId} onSignedOut={toLogin} /> : <AdminUsers onSignedOut={toLogin} />}
    </Shell>
  );
}

// Signed in as staff: report uploads (/upload, its own page) and their own settings. Nothing else.
function Staff({ path }) {
  useEffect(() => {
    if (path === '/settings') document.title = 'Settings | CallsTalk Staff';
    else navigate('/upload', { replace: true });
  }, [path]);

  if (path !== '/settings') return null;
  return <Shell path={path} nav={STAFF_NAV} team="staff"><Settings team="staff" /></Shell>;
}

export default function App() {
  const path = usePath();
  const session = loadSession();
  const signedIn = Boolean(session?.access);

  useEffect(() => {
    if (!signedIn && !PUBLIC.includes(path)) navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  }, [signedIn, path]);

  if (path === '/upload') return <Upload />;
  if (path === '/setup') return <Setup />;
  if (path === '/login') return <Login />;
  if (!signedIn) return null;
  if (session.role === 'admin') return <Admin path={path} />;
  if (session.role === 'staff') return <Staff path={path} />;
  // Customers on any other address (an /admin link, say) are sent to Billing by Portal.
  return <Portal path={path} />;
}
