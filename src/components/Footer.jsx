import Logo from './Logo.jsx';
import ChatButton from './ChatButton.jsx';
import { footerColumns } from '../data.js';
import { SUPPORT_EMAIL } from '../legal.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__card">
          <div className="footer__card-copy">
            <h2>Can’t reach us on Telegram?</h2>
            <p>Message our team directly. We reply in the chat or by email.</p>
          </div>
          <div className="footer__card-actions">
            <ChatButton />
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn--quiet">Email Support</a>
          </div>
        </div>
        <div className="footer__cols">
          <div>
            <Logo light />
            <p>Every conversation, traced back to the campaign that started it.</p>
          </div>
          {footerColumns.map(({ title, links }) => (
            <div key={title}>
              <h3>{title}</h3>
              {links.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
            </div>
          ))}
        </div>
        <div className="footer__legal">
          <span>© {new Date().getFullYear()} CallsTalk. All rights reserved.</span>
          <span className="footer__links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/cookies">Cookie Policy</a>
            <a href="/legal">Legal Center</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
