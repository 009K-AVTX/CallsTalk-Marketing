import { useEffect, useState } from 'react';
import { LogoMark } from '../../../src/components/Logo.jsx';
import { TelegramIcon } from '../../../src/components/ContactLinks.jsx';
import { TELEGRAM_HANDLE } from '../../../src/legal.js';
import { loadSession, previewMode, signOut } from '../../../src/lib/portal.js';
import { money, STATUS, duration, dateTime } from '../format.js';
import { Link, navigate } from '../router.jsx';
import Icon from './Icons.jsx';

export const NAV = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/calls', label: 'Calls', icon: 'calls' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/billing', label: 'Billing', icon: 'billing' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function logOut() {
  signOut();
  navigate('/login', { replace: true });
}

// The portal frame: a top bar with the sections, the live balance and the account menu.
export default function Shell({ path, statement, children }) {
  const [menu, setMenu] = useState(false);
  const email = loadSession()?.email || '';
  const owes = statement && Number(statement.balance) < 0;

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => !e.target.closest('.p-user') && setMenu(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  return (
    <div className="p-app">
      <header className="p-top">
        <div className="p-top__inner">
          <Link to="/" className="p-brand" aria-label="CallsTalk Portal home">
            <LogoMark className="p-brand__mark" />
            <span>Calls<b>Talk</b></span>
            <em>Portal</em>
          </Link>
          <nav className="p-nav" aria-label="Portal">
            {NAV.map(({ to, label, icon }) => (
              <Link key={to} to={to} className={`p-nav__link${path === to ? ' is-active' : ''}`} aria-current={path === to ? 'page' : undefined}>
                <Icon name={icon} />{label}
              </Link>
            ))}
          </nav>
          <div className="p-top__end">
            {previewMode && <span className="p-demo" title="Figures are generated for this demo">Demo · Sample Data</span>}
            {statement && (
              <Link to="/billing" className={`p-balance ${owes ? 'is-due' : 'is-ok'}`} title={owes ? 'Amount due' : 'In credit'}>
                <span className="p-balance__dot" aria-hidden="true" />
                <span className="p-balance__label">{owes ? 'Due' : 'Balance'}</span>
                <b>{money(owes ? statement.amount_due : statement.balance, statement.currency)}</b>
              </Link>
            )}
            <div className="p-user">
              <button type="button" className="p-user__btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)}>
                <span aria-hidden="true">{(statement?.customer || email || '?').slice(0, 1).toUpperCase()}</span>
                <span className="sr-only">Account menu</span>
              </button>
              {menu && (
                <div className="p-user__menu" role="menu">
                  <p><b>{statement?.customer || 'Your account'}</b><small>{email}</small></p>
                  <Link to="/settings" role="menuitem" onClick={() => setMenu(false)}><Icon name="settings" />Settings</Link>
                  <a role="menuitem" href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer"><TelegramIcon />Support on Telegram</a>
                  <button type="button" role="menuitem" onClick={logOut}><Icon name="logout" />Log Out</button>
                </div>
              )}
            </div>
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

export function RangeBar({ value, onChange, ranges }) {
  return (
    <div className="p-ranges" role="group" aria-label="Date range">
      {ranges.map((r) => (
        <button key={r.id} type="button" className={value === r.id ? 'is-on' : ''} aria-pressed={value === r.id} onClick={() => onChange(r.id)}>{r.label}</button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, note, tone = '', icon }) {
  return (
    <div className={`p-kpi ${tone}`}>
      <p className="p-kpi__label">{icon && <Icon name={icon} />}{label}</p>
      <p className="p-kpi__value">{value}</p>
      {note && <p className="p-kpi__note">{note}</p>}
    </div>
  );
}

export function StatusBadge({ call }) {
  if (call.converted) return <span className="p-badge is-converted"><Icon name="check" />Converted</span>;
  const label = STATUS[call.status] || call.status;
  return <span className={`p-badge is-${call.status}`}>{call.status === 'completed' ? <Icon name="clock" /> : <Icon name="close" />}{label}</span>;
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

// Everything about one call, slid in from the side.
export function CallDrawer({ call, price, onClose }) {
  useEffect(() => {
    if (!call) return undefined;
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [call, onClose]);
  if (!call) return null;
  const ended = new Date(new Date(call.started_at).getTime() + call.duration * 1000);
  return (
    <div className="p-drawer" role="dialog" aria-modal="true" aria-label="Call details">
      <button type="button" className="p-drawer__scrim" aria-label="Close" onClick={onClose} />
      <aside className="p-drawer__panel">
        <header>
          <div>
            <p className="p-drawer__eyebrow">Call {call.id}</p>
            <h2>{call.caller}</h2>
            <StatusBadge call={call} />
          </div>
          <button type="button" className="p-iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <dl className="p-facts">
          <div><dt>Started</dt><dd>{dateTime(call.started_at)}</dd></div>
          <div><dt>Ended</dt><dd>{call.duration ? dateTime(ended.toISOString()) : 'Not answered'}</dd></div>
          <div><dt>Duration</dt><dd>{duration(call.duration)}</dd></div>
          <div><dt>Caller State</dt><dd>{call.state}</dd></div>
          <div><dt>Charged</dt><dd>{money(call.cost)}</dd></div>
          <div><dt>Your Price</dt><dd>{money(price)} per converted call</dd></div>
        </dl>
        <ol className="p-timeline">
          <li><b>Call arrived</b><span>{dateTime(call.started_at)}</span></li>
          <li className={call.status === 'completed' ? '' : 'is-off'}><b>{call.status === 'completed' ? 'Answered by your team' : `${STATUS[call.status] || call.status}: not answered`}</b></li>
          <li className={call.converted ? '' : 'is-off'}><b>{call.converted ? 'Converted and billed' : 'Not billed'}</b><span>{call.converted ? `Reached the converted length, ${money(call.cost)} charged` : 'Only converted calls are charged'}</span></li>
        </ol>
      </aside>
    </div>
  );
}
