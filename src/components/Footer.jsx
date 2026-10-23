import Logo from './Logo.jsx';
import { footerColumns } from '../data.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__cols">
          <div>
            <Logo light />
            <p>Marketing attribution that connects every lead to revenue.</p>
          </div>
          {footerColumns.map(({ title, links }) => (
            <div key={title}>
              <h4>{title}</h4>
              {links.map((l) => <a key={l} href="#">{l}</a>)}
            </div>
          ))}
        </div>
        <div className="footer__legal">
          <span>© {new Date().getFullYear()} CallsTalk. All rights reserved.</span>
          <span><a href="#">Privacy</a> · <a href="#">Terms</a> · <a href="#">Security</a></span>
        </div>
      </div>
    </footer>
  );
}
