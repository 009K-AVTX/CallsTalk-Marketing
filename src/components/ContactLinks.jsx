import { SUPPORT_EMAIL, TELEGRAM_HANDLE } from '../legal.js';

export function TelegramIcon() {
  return (
    <svg className="contact__icon contact__icon--telegram" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" />
      <path d="M5.4 11.7 17.1 7.2c.55-.2 1.03.13.85.95l-2 9.4c-.15.67-.54.83-1.1.52l-3.04-2.24-1.47 1.41c-.16.16-.3.3-.61.3l.22-3.1 5.64-5.1c.25-.22-.05-.34-.38-.12l-6.97 4.39-3-.94c-.66-.2-.67-.65.14-.97Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="contact__icon contact__icon--mail" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="m3.5 7 8.5 6 8.5-6" />
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
