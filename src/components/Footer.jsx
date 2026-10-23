import Logo from './Logo.jsx';
import ChatButton from './ChatButton.jsx';
import { footerColumns } from '../data.js';
import { SUPPORT_EMAIL } from '../legal.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__card">
          <div>
            <h2>Lost us on Telegram? Find us here.</h2>
            <p>Questions, setup or a dropped conversation: our team answers in this chat.</p>
          </div>
          <div className="actions">
            <ChatButton />
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn--quiet">{SUPPORT_EMAIL}</a>
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
