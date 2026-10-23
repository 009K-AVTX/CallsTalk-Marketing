import Logo from './Logo.jsx';
import { footerColumns } from '../data.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__cols">
          <div>
            <Logo light />
            <p>Attribution software that links every inquiry to the revenue it generates.</p>
          </div>
          {footerColumns.map(({ title, links }) => (
            <div key={title}>
              <h3>{title}</h3>
              {links.map((l) => <a key={l} href="#">{l}</a>)}
            </div>
          ))}
        </div>
        <div className="footer__legal">
          <span>© {new Date().getFullYear()} CallsTalk. All rights reserved.</span>
          <span className="footer__links"><a href="#">Privacy Policy</a><a href="#">Terms of Service</a><a href="#">Trust &amp; Security</a></span>
        </div>
      </div>
    </footer>
  );
}
