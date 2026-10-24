import ChatButton from './ChatButton.jsx';
import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import { TelegramIcon } from './ContactLinks.jsx';
import { navLinks } from '../data.js';
import { TELEGRAM_HANDLE } from '../legal.js';
import { loadSession } from '../lib/portal.js';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Signed-in customers get Dashboard in place of Log In and Request Access.
  // Read after hydration: the pre-rendered page has no session.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const sync = () => setSignedIn(Boolean(loadSession()?.access));
    sync();
    window.addEventListener('callstalk:session', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('callstalk:session', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return (
    <header className="nav">
      <div className="container nav__inner">
        <Logo light />
        <button className="nav__toggle" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span /><span />
        </button>
        <nav className={`nav__links${open ? ' is-open' : ''}`} onClick={close}>
          {navLinks.map(({ href, label }) => (
            <a key={href} href={href}>{label}</a>
          ))}
          <a href="/#pricing">Pricing</a>
          <span className="nav__actions">
            <a className="nav__tg" href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer" aria-label="CallsTalk on Telegram">
              <TelegramIcon />
            </a>
            {signedIn ? (
              <a href="/dashboard">Dashboard</a>
            ) : (
              <>
                <a href="/login">Log In</a>
                <a href="/request-access">Request Access</a>
              </>
            )}
            <ChatButton className="btn btn--light btn--sm" />
          </span>
        </nav>
      </div>
    </header>
  );
}
