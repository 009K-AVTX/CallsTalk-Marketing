import ChatWidget from '../../../src/components/ChatWidget.jsx';
import { configureSupportChat } from '../../../src/lib/support.js';
import { authed, loadSession, SESSION_HEADERS } from '../../../src/lib/portal.js';
import { useProfile } from '../avatar.jsx';

// The website's support chat, floating on every customer page. It talks to the same chat API as the
// website (Telegram and email to the team), through the portal's own API address and as the signed-in
// customer, so the team sees their name, company and email. Chats are kept per login on this browser.
const BASE = (import.meta.env.VITE_PORTAL_API_URL || import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const PROMPTS = ['I have a question about my bill', 'I need assistance with a payment', 'Please send me a billing report'];

export default function SupportChat({ company }) {
  const session = loadSession();
  const me = useProfile();
  if (!session?.access || !BASE) return null;

  configureSupportChat({
    base: BASE,
    headers: SESSION_HEADERS, // the session cookie goes by itself; this header lets the server use it
    storageKey: `callstalk.portalChats.${session.email}`,
    // Renews an expired session, so the team sees the customer and not "Visitor".
    refresh: () => authed('/accounts/me').catch(() => {}),
  });
  const first = (me?.first_name || '').trim();
  return (
    <ChatWidget
      key={session.email}
      customer={{ name: me?.name || '', email: session.email, company }}
      greeting={`Hello${first ? ` ${first}` : ''}, how can we help you today? Our support team will respond here and by email regarding your account, billing or payments.`}
      prompts={PROMPTS}
    />
  );
}
