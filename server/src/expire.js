// Ends chats that have gone quiet, exactly as if the team had sent /close: the visitor sees a
// goodbye and their window resets on the next poll, and Telegram gets a notice.

import { config } from './config.js';
import { addMessage, findIdleSessions, setStatus } from './db.js';
import { notifyAutoEnded } from './telegram.js';

const CHECK_EVERY_MS = 10 * 60_000;
const hours = config.chatTimeoutHours;
const GOODBYE = `This chat ended automatically after ${hours} hours without new messages. Start a new chat any time if you need anything else.`;

export async function expireIdleChats(now = Date.now()) {
  for (const session of await findIdleSessions(new Date(now - hours * 3_600_000))) {
    await addMessage(session.id, 'agent', null, GOODBYE);
    await setStatus(session.id, 'ended');
    await notifyAutoEnded(session, hours).catch((err) => console.error('[expire] could not post to Telegram:', err.message));
  }
}

export function startExpiry() {
  if (!(hours > 0)) return; // CHAT_TIMEOUT_HOURS=0 turns it off
  const run = () => expireIdleChats().catch((err) => console.error('[expire]', err));
  run();
  setInterval(run, CHECK_EVERY_MS).unref();
}
