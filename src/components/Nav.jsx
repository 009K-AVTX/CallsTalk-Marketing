import ChatButton from './ChatButton.jsx';
import { useState } from 'react';
import Logo from './Logo.jsx';
import { TelegramIcon } from './ContactLinks.jsx';
import { navLinks } from '../data.js';
import { PORTAL_LOGIN, TELEGRAM_HANDLE } from '../legal.js';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
            {/* Customers log in to the portal, the same login as app.callstalk.io. */}
            <a href={PORTAL_LOGIN}>Log In</a>
            <a href="/request-access">Request Access</a>
            <ChatButton className="btn btn--light btn--sm" />
          </span>
        </nav>
      </div>
    </header>
  );
}
