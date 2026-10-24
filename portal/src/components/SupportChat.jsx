import ChatWidget from '../../../src/components/ChatWidget.jsx';
import { configureSupportChat } from '../../../src/lib/support.js';
import { authed, loadSession } from '../../../src/lib/portal.js';
import { useProfile } from '../avatar.jsx';

// The website's support chat, floating on every customer page. It talks to the same chat API as the
// website (Telegram and email to the team), through the portal's own API address and as the signed-in
// customer, so the team sees their name, company and email. Chats are kept per login on this browser.
const BASE = (import.meta.env.VITE_PORTAL_API_URL || import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');
const PROMPTS = ['A question about my bill', 'Help with a payment', 'Please send me a billing report'];

export default function SupportChat({ company }) {
  const session = loadSession();
  const me = useProfile();
  if (!session?.access || !BASE) return null;

  configureSupportChat({
    base: BASE,
    token: () => loadSession()?.access || '',
    storageKey: `callstalk.portalChats.${session.email}`,
    // Renews an expired access token, so the team sees the customer and not "Visitor".
    refresh: () => authed('/accounts/me').catch(() => {}),
  });
  const first = (me?.first_name || '').trim();
  return (
    <ChatWidget
      key={session.email}
      customer={{ name: me?.name || '', email: session.email, company }}
      greeting={`Hello${first ? ` ${first}` : ''}. Ask us anything about your account, a bill or a payment, and our team will reply here and by email.`}
      prompts={PROMPTS}
    />
  );
}
