import { SUPPORT_EMAIL, TELEGRAM_HANDLE } from '../legal.js';

export function TelegramIcon() {
  return (
    <svg className="contact__icon contact__icon--telegram" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" />
      <path d="M5.4 11.7 17.1 7.2c.55-.2 1.03.13.85.95l-2 9.4c-.15.67-.54.83-1.1.52l-3.04-2.24-1.47 1.41c-.16.16-.3.3-.61.3l.22-3.1 5.64-5.1c.25-.22-.05-.34-.38-.12l-6.97 4.39-3-.94c-.66-.2-.67-.65.14-.97Z" />
    </svg>
  );
}

export function MailIcon() {
  return (
    <svg className="contact__icon contact__icon--mail" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

// Other messaging apps, drawn like the Telegram icon: the app's mark in the accent colour on a tinted circle.

// Element X: four arcs turning around the centre.
export function ElementIcon() {
  return (
    <svg className="contact__icon contact__icon--app" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="contact__bg" cx="12" cy="12" r="12" />
      {[0, 90, 180, 270].map((turn) => <path key={turn} className="contact__line" d="M10.4 7.2a4.8 4.8 0 0 1 4.8 4.8" transform={`rotate(${turn} 12 12)`} />)}
    </svg>
  );
}

// Zangi: the rounded Z.
export function ZangiIcon() {
  return (
    <svg className="contact__icon contact__icon--app" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="contact__bg" cx="12" cy="12" r="12" />
      <path className="contact__line contact__line--bold" d="M8.6 8.4h6.8l-6.8 7.2h6.8" />
    </svg>
  );
}

// Signal: a speech bubble inside a dashed ring.
export function SignalIcon() {
  return (
    <svg className="contact__icon contact__icon--app" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="contact__bg" cx="12" cy="12" r="12" />
      <circle className="contact__line contact__line--dash" cx="12" cy="12" r="6.6" />
      <path className="contact__mark" d="M12 7.9a4.1 4.1 0 1 1-2.2 7.57l-1.86.47.49-1.8A4.1 4.1 0 0 1 12 7.9Z" />
    </svg>
  );
}

// Telegram and email, used in the pricing section and the footer.
export default function ContactLinks({ className = '' }) {
  return (
    <ul className={`contact ${className}`}>
      <li>
        <a href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer">
          <TelegramIcon />
          <span><small>Telegram</small>@{TELEGRAM_HANDLE}</span>
        </a>
      </li>
      <li>
        <a href={`mailto:${SUPPORT_EMAIL}`}>
          <MailIcon />
          <span><small>Email</small>{SUPPORT_EMAIL}</span>
        </a>
      </li>
    </ul>
  );
}
