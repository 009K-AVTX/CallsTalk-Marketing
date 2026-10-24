import { useCallback, useEffect } from 'react';
import { useStatement } from '../../src/components/BillingPage.jsx';
import { loadSession } from '../../src/lib/portal.js';
import Shell, { NAV } from './components/Shell.jsx';
import { navigate, usePath } from './router.jsx';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Calls from './pages/Calls.jsx';
import Reports from './pages/Reports.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';

const PAGES = { '/': Overview, '/calls': Calls, '/reports': Reports, '/billing': Billing, '/settings': Settings };

// Signed in: the portal. Not signed in: the log-in page, and back to where they were after.
function Portal({ path }) {
  const toLogin = useCallback(() => navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`, { replace: true }), []);
  const statement = useStatement(toLogin);
  const Page = PAGES[path] || Overview;
  const title = NAV.find((n) => n.to === path)?.label || 'Overview';

  useEffect(() => {
    document.title = `${title} | CallsTalk Portal`;
    if (!PAGES[path]) navigate('/', { replace: true });
  }, [path, title]);

  return (
    <Shell path={path} statement={statement.data}>
      <Page statement={statement} />
    </Shell>
  );
}

export default function App() {
  const path = usePath();
  const signedIn = Boolean(loadSession()?.access);

  useEffect(() => {
    if (!signedIn && path !== '/login') navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
  }, [signedIn, path]);

  if (path === '/login') return <Login />;
  if (!signedIn) return null;
  return <Portal path={path} />;
}
