import { ElementIcon, MailIcon, SignalIcon, TelegramIcon, WhatsAppIcon, ZangiIcon } from '../../src/components/ContactLinks.jsx';

// The contact methods a customer can add in Settings (checked again on the server, server/src/contacts.js).
export const CONTACT_METHODS = [
  { key: 'telegram', label: 'Telegram', icon: TelegramIcon, placeholder: '@username or phone number', hint: 'Your @username or the phone number linked to your account.' },
  { key: 'whatsapp', label: 'WhatsApp', icon: WhatsAppIcon, placeholder: '+1 555 123 4567', hint: 'The phone number on your WhatsApp account, with the country code.', type: 'tel' },
  { key: 'element', label: 'Element X', icon: ElementIcon, placeholder: '@name:matrix.org', hint: 'Your Matrix ID, found under Settings > Account in Element X.' },
  { key: 'zangi', label: 'Zangi', icon: ZangiIcon, placeholder: 'Zangi number', hint: 'The number shown on your Zangi profile.' },
  { key: 'signal', label: 'Signal', icon: SignalIcon, placeholder: 'Phone number or username.01', hint: 'Your phone number or Signal username.' },
  { key: 'email', label: 'Email', icon: MailIcon, placeholder: 'name@company.com', hint: 'An additional address, separate from your login ID.', type: 'email' },
];

// A link that opens the app, where there is a public one (admins' view).
export function contactLink(key, value) {
  if (!value) return null;
  if (key === 'telegram') return value.startsWith('@') ? `https://t.me/${value.slice(1)}` : null;
  if (key === 'whatsapp') return /^\+?[0-9]/.test(value) ? `https://wa.me/${value.replace(/[^0-9]/g, '')}` : null;
  if (key === 'element') return `https://matrix.to/#/${encodeURIComponent(value)}`;
  if (key === 'signal') return /^\+?[0-9]/.test(value) ? `https://signal.me/#p/${value.replace(/[^0-9+]/g, '')}` : null;
  if (key === 'email') return `mailto:${value}`;
  return null;
}
