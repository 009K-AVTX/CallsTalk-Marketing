import { useState } from 'react';
import Logo from './Logo.jsx';
import { navLinks } from '../data.js';

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
          <a href="#pricing">Plans</a>
          <span className="nav__actions">
            <a href="#">Sign In</a>
            <a href="#trial" className="btn btn--light btn--sm">Try It Free</a>
          </span>
        </nav>
      </div>
    </header>
  );
}
