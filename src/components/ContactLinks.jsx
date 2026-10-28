import { useEffect, useRef, useState } from 'react';
import { SIMPLEX_LINK, SIMPLEX_NAME, SUPPORT_EMAIL, TELEGRAM_HANDLE, ZANGI_ID } from '../legal.js';

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

// WhatsApp and Signal use the brands' own marks (from Simple Icons, CC0), drawn in the 24-unit box and shrunk
// into the circle.
const BRAND_MARK = 'translate(5.4 5.4) scale(.55)';

// WhatsApp: the handset in a speech bubble.
export function WhatsAppIcon() {
  return (
    <svg className="contact__icon contact__icon--app" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="contact__bg" cx="12" cy="12" r="12" />
      <path className="contact__mark" transform={BRAND_MARK} d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

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

// Signal: a speech bubble inside a dashed ring, its tail breaking the ring.
export function SignalIcon() {
  return (
    <svg className="contact__icon contact__icon--app" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="contact__bg" cx="12" cy="12" r="12" />
      <path className="contact__mark" transform={BRAND_MARK} d="M12 0q-.934 0-1.83.139l.17 1.111a11 11 0 0 1 3.32 0l.172-1.111A12 12 0 0 0 12 0M9.152.34A12 12 0 0 0 5.77 1.742l.584.961a10.8 10.8 0 0 1 3.066-1.27zm5.696 0-.268 1.094a10.8 10.8 0 0 1 3.066 1.27l.584-.962A12 12 0 0 0 14.848.34M12 2.25a9.75 9.75 0 0 0-8.539 14.459c.074.134.1.292.064.441l-1.013 4.338 4.338-1.013a.62.62 0 0 1 .441.064A9.7 9.7 0 0 0 12 21.75c5.385 0 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25m-7.092.068a12 12 0 0 0-2.59 2.59l.909.664a11 11 0 0 1 2.345-2.345zm14.184 0-.664.909a11 11 0 0 1 2.345 2.345l.909-.664a12 12 0 0 0-2.59-2.59M1.742 5.77A12 12 0 0 0 .34 9.152l1.094.268a10.8 10.8 0 0 1 1.269-3.066zm20.516 0-.961.584a10.8 10.8 0 0 1 1.27 3.066l1.093-.268a12 12 0 0 0-1.402-3.383M.138 10.168A12 12 0 0 0 0 12q0 .934.139 1.83l1.111-.17A11 11 0 0 1 1.125 12q0-.848.125-1.66zm23.723.002-1.111.17q.125.812.125 1.66c0 .848-.042 1.12-.125 1.66l1.111.172a12.1 12.1 0 0 0 0-3.662M1.434 14.58l-1.094.268a12 12 0 0 0 .96 2.591l-.265 1.14 1.096.255.36-1.539-.188-.365a10.8 10.8 0 0 1-.87-2.35m21.133 0a10.8 10.8 0 0 1-1.27 3.067l.962.584a12 12 0 0 0 1.402-3.383zm-1.793 3.848a11 11 0 0 1-2.345 2.345l.664.909a12 12 0 0 0 2.59-2.59zm-19.959 1.1L.357 21.48a1.8 1.8 0 0 0 2.162 2.161l1.954-.455-.256-1.095-1.953.455a.675.675 0 0 1-.81-.81l.454-1.954zm16.832 1.769a10.8 10.8 0 0 1-3.066 1.27l.268 1.093a12 12 0 0 0 3.382-1.402zm-10.94.213-1.54.36.256 1.095 1.139-.266c.814.415 1.683.74 2.591.961l.268-1.094a10.8 10.8 0 0 1-2.35-.869zm3.634 1.24-.172 1.111a12.1 12.1 0 0 0 3.662 0l-.17-1.111q-.812.125-1.66.125a11 11 0 0 1-1.66-.125" />
    </svg>
  );
}

// SimpleX: two interlocking X marks.
export function SimplexIcon() {
  return (
    <svg className="contact__icon contact__icon--app" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="contact__bg" cx="12" cy="12" r="12" />
      <path className="contact__line contact__line--bold" d="M7 8.2l5 7.6M12 8.2l-5 7.6M12 8.2l5 7.6M17 8.2l-5 7.6" />
    </svg>
  );
}

const copy = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // clipboard blocked: the text is on screen
  }
};

// The SimpleX invitation: the QR code to scan from a phone, or the link to open the app on this device.
function SimplexDialog({ open, onClose }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="simplex" aria-labelledby="simplex-title" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <button type="button" className="simplex__close" aria-label="Close" onClick={onClose}>×</button>
      <h3 id="simplex-title">Chat with Us on SimpleX</h3>
      <p>Scan the code with the SimpleX app, or open the link on this device.</p>
      <img src="/simplex-qr.svg" width="220" height="220" alt={`SimpleX QR code for ${SIMPLEX_NAME}`} />
      <b className="simplex__name"><SimplexIcon />{SIMPLEX_NAME}</b>
      <div className="simplex__actions">
        <a className="btn btn--light btn--sm" href={SIMPLEX_LINK} target="_blank" rel="noopener noreferrer">Open in SimpleX</a>
        <button type="button" className="btn btn--quiet btn--sm" onClick={async () => setCopied(await copy(SIMPLEX_LINK))}>{copied ? 'Link Copied' : 'Copy Link'}</button>
      </div>
    </dialog>
  );
}

// Telegram, SimpleX, Zangi and email, used in the pricing section and the footer.
export default function ContactLinks({ className = '' }) {
  const [simplex, setSimplex] = useState(false);
  const [zangiCopied, setZangiCopied] = useState(false);
  const copyZangi = async () => {
    if (!await copy(ZANGI_ID)) return;
    setZangiCopied(true);
    setTimeout(() => setZangiCopied(false), 2000);
  };

  return (
    <ul className={`contact ${className}`}>
      <li>
        <a href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer">
          <TelegramIcon />
          <span><small>Telegram</small>@{TELEGRAM_HANDLE}</span>
        </a>
      </li>
      <li>
        <button type="button" className="contact__item" onClick={() => setSimplex(true)} aria-haspopup="dialog">
          <SimplexIcon />
          <span><small>SimpleX · Link and QR Code</small>{SIMPLEX_NAME}</span>
        </button>
        <SimplexDialog open={simplex} onClose={() => setSimplex(false)} />
      </li>
      <li>
        <button type="button" className="contact__item" onClick={copyZangi} title="Copy the Zangi ID">
          <ZangiIcon />
          <span><small aria-live="polite">{zangiCopied ? 'Zangi · ID Copied' : 'Zangi ID'}</small>{ZANGI_ID}</span>
        </button>
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
