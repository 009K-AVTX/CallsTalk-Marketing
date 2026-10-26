import { useEffect, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { TelegramIcon } from '../../../src/components/ContactLinks.jsx';
import { TELEGRAM_HANDLE } from '../../../src/legal.js';
import { loadSession, previewMode, signOut } from '../../../src/lib/portal.js';
import { money } from '../format.js';
import { Link, navigate } from '../router.jsx';
import Icon from './Icons.jsx';
import { MyAvatar } from '../avatar.jsx';

export const NAV = [
  { to: '/', label: 'Billing', icon: 'billing' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

// Admins: logins and customers' billing, money across customers, the audit log and customer reports.
export const ADMIN_NAV = [
  { to: '/admin', label: 'Logins', icon: 'users' },
  { to: '/admin/finance', label: 'Finance', icon: 'finance' },
  { to: '/admin/audit', label: 'Audit Log', icon: 'audit' },
  { to: '/admin/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

// Staff: customer reports only.
export const STAFF_NAV = [
  { to: '/upload', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const TEAM = {
  admin: { home: '/admin', label: 'Admin', menu: 'CallsTalk Admin' },
  staff: { home: '/upload', label: 'Staff', menu: 'CallsTalk Staff' },
};

// Billing page, payment form in view and the amount ready to type.
export function goToPay() {
  navigate('/');
  setTimeout(() => {
    const field = document.getElementById('pay-amount');
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    field?.focus({ preventScroll: true });
  }, 350);
}

export function logOut() {
  signOut();
  navigate('/login', { replace: true });
}

// The portal frame: a top bar with the sections, the live balance and the account menu.
// `team` ("admin" or "staff") swaps the customer's balance and Pay Now for that team's sections.
// `badges`: a count beside a section, by its path (new reports, say).
export default function Shell({ path, statement, children, nav = NAV, team, badges = {} }) {
  const [menu, setMenu] = useState(false);
  // Admin and staff on small screens: the sections fold into a menu behind a button, as on the website.
  const [navOpen, setNavOpen] = useState(false);
  const email = loadSession()?.email || '';
  const crew = TEAM[team];
  const home = crew ? crew.home : '/';
  const owes = statement && Number(statement.balance) < 0;

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => !e.target.closest('.p-user') && setMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  // The menu closes on a new page, on Escape and on a tap outside it.
  useEffect(() => setNavOpen(false), [path]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const outside = (e) => !e.target.closest('.p-nav, .p-nav__toggle') && setNavOpen(false);
    const escape = (e) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('click', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [navOpen]);

  return (
    <div className="p-app">
      <header className={`p-top${crew ? ' p-top--team' : ''}`}>
        <div className="p-top__inner">
          <Link to={home} className="p-brand" aria-label="CallsTalk Portal home">
            <LogoMark className="p-brand__mark" />
            <span>Calls<b>Talk</b></span>
            <em>{crew ? crew.label : 'Portal'}</em>
          </Link>
          <nav id="portal-nav" className={`p-nav${navOpen ? ' is-open' : ''}`} aria-label="Portal">
            {nav.map(({ to, href, label, icon }) => (href ? (
              <a key={href} href={href} className="p-nav__link"><Icon name={icon} />{label}</a>
            ) : (
              <Link key={to} to={to} onClick={() => setNavOpen(false)} className={`p-nav__link${path === to ? ' is-active' : ''}`} aria-current={path === to ? 'page' : undefined}>
                <Icon name={icon} />{label}
                {badges[to] > 0 && <span className="p-nav__badge"><span className="sr-only">, new: </span>{badges[to]}</span>}
              </Link>
            )))}
          </nav>
          <div className="p-top__end">
            {previewMode && <span className="p-demo" title="Figures are generated for this demo">Demo · Sample Data</span>}
            {statement && (
              <Link to="/" className={`p-balance ${owes ? 'is-due' : 'is-ok'}`} title={owes ? 'Amount due' : 'In credit'}>
                <span className="p-balance__dot" aria-hidden="true" />
                <span className="p-balance__label">{owes ? 'Due' : 'Balance'}</span>
                <b>{money(owes ? statement.amount_due : statement.balance, statement.currency)}</b>
              </Link>
            )}
            {crew ? <span className="p-role">{crew.label}</span> : <button type="button" className="btn btn--light btn--sm p-paynow" onClick={goToPay}>Pay Now</button>}
            <div className="p-user">
              <button type="button" className="p-user__btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}>
                <MyAvatar size="sm" fallback={statement?.customer || email} />
                <span className="sr-only">Account menu</span>
              </button>
              {menu && (
                <div className="p-user__menu" role="menu">
                  <div className="p-user__who">
                    <MyAvatar size="md" fallback={statement?.customer || email} />
                    <p><b>{statement?.customer || (crew ? crew.menu : 'Your Account')}</b><small>{email}</small></p>
                  </div>
                  <Link to="/settings" role="menuitem" onClick={() => setMenu(false)}><Icon name="settings" />Settings</Link>
                  {!crew && <a role="menuitem" href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer"><TelegramIcon />Support on Telegram</a>}
                  <button type="button" role="menuitem" onClick={logOut}><Icon name="logout" />Log Out</button>
                </div>
              )}
            </div>
            {crew && (
              <button type="button" className="p-nav__toggle" aria-label={navOpen ? 'Close menu' : 'Open menu'} aria-expanded={navOpen} aria-controls="portal-nav" onClick={() => setNavOpen(!navOpen)}>
                <span /><span />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="p-main">{children}</main>
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="p-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="p-head__tools">{children}</div>}
    </div>
  );
}




export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <p className="p-error" role="alert">
      <Icon name="alert" />{error}
      {onRetry && <button type="button" onClick={onRetry}>Try Again</button>}
    </p>
  );
}
