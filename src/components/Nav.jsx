import { useState } from 'react';
import Logo from './Logo.jsx';
import { navLinks } from '../data.js';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="nav">
      <div className="container nav__inner">
        <Logo />
        <button className="nav__toggle" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          ☰
        </button>
        <nav className={`nav__links${open ? ' is-open' : ''}`} onClick={close}>
          {navLinks.map(({ href, label }) => (
            <a key={href} href={href}>{label}</a>
          ))}
          <a href="#pricing" className="nav__pricing">Plans</a>
          <a href="#demo" className="btn btn--ghost btn--sm">Schedule a Demo</a>
          <a href="#trial" className="btn btn--primary btn--sm">Try It Free</a>
        </nav>
      </div>
    </header>
  );
}
