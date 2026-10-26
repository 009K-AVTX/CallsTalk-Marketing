import Logo from './Logo.jsx';
import ChatButton from './ChatButton.jsx';
import { footerColumns } from '../data.js';
import ContactLinks from './ContactLinks.jsx';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__card">
          <div className="footer__card-copy">
            <h2>Get in Touch</h2>
            <p>Questions or setup help? Message us on Telegram, SimpleX or Zangi, send an email or start a chat, and our team will get back to you.</p>
          </div>
          <div className="footer__card-actions">
            <ContactLinks />
            <ChatButton />
          </div>
        </div>
        <div className="footer__cols">
          <div>
            <Logo light />
            <p>Every Conversation, Traced Back to the Campaign That Started It.</p>
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
