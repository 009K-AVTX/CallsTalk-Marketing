// Telegram side of the support chat.
//
// Outgoing: every new chat and every visitor message is posted to each of the team's Telegram groups
// (TELEGRAM_CHAT_ID, comma-separated). Topics are in the first group only; the others get it all in their main chat.
// Incoming: the bot long-polls Telegram (no webhook or public URL needed) and turns the team's
// replies, from any of the groups, into `agent` messages that the website widget picks up on its next poll.
// What one group says to a visitor is posted in the others, so nobody answers twice.
//
// The team answers a visitor in any of these ways:
//   1. Tap "Reply >" under a visitor's message: the bot opens a reply box for that chat.
//   2. Reply (swipe / right-click > Reply) to any message about that chat.
//   3. Type inside the visitor's own topic, when TELEGRAM_TOPIC_PER_CHAT=true.
//   4. Start a message with the chat's short id: "a1b2c3d4 Thanks, we'll call you shortly."

import { config } from './config.js';
import {
  addMessage, claimTelegramUpdate, findSessionByShortId, findSessionByTelegramMessage, findSessionByThread,
  forgetHandledTelegram, getSession, getValue, linkTelegramMessage, setStatus, setValue,
} from './db.js';
import { accessDetails, chatKind, clip, escapeHtml, shortId, TEAM_ENDED_MESSAGE, transcriptLines, visitorDetails } from './format.js';

const { token, chatIds, threadId: sharedThreadId, topicPerChat } = config.telegram;
const [mainChat] = chatIds; // the group with the topics
const isTeamChat = (id) => chatIds.includes(String(id));
const MAX_TEXT = 4096;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api(method, params = {}, timeoutMs = 15000) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(`Telegram ${method} failed: ${data.description || `HTTP ${res.status}`}`);
    err.code = data.error_code;
    err.retryAfter = data.parameters?.retry_after;
    throw err;
  }
  return data.result;
}

const escape = escapeHtml;

// The bot's @username, for t.me links. Learned once (startBot, or here when this copy does not poll).
let username = null;
export async function botUsername() {
  username ||= (await api('getMe')).username;
  return username;
}

// A message to any chat: a customer's own chat with the bot, or the team's billing chat. Telegram's error code is
// on the error (403: the person blocked the bot or never started it).
export function sendTo(chat, text, { threadId, ...extra } = {}) {
  return api('sendMessage', {
    chat_id: chat,
    message_thread_id: threadId,
    text: clip(text, MAX_TEXT),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

// Posts in every team group but `except` (the group a reply came from). `threadId` is a topic of the first group.
// -> [{ chat, message_id }] for the groups it reached. Fails only when it reached none of them.
async function send(text, threadId, extra = {}, { except } = {}) {
  const chats = chatIds.filter((c) => c !== String(except));
  const results = await Promise.allSettled(chats.map((chat) => sendTo(chat, text, { threadId: chat === mainChat ? threadId ?? sharedThreadId : undefined, ...extra })));
  const sent = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent.push({ chat: chats[i], message_id: r.value.message_id });
  });
  if (chats.length && !sent.length) throw results[0].reason;
  results.forEach((r, i) => r.status === 'rejected' && console.error(`[telegram] could not post in chat ${chats[i]}:`, r.reason.message));
  return sent;
}

// Ties the posted messages to a chat, so a reply to any of them reaches the visitor.
export const linkSent = (sent, sessionId) => Promise.all(sent.map((m) => linkTelegramMessage(m.chat, m.message_id, sessionId)));

// What the team did in one group (`msg`), posted in the others.
async function tellOtherGroups(msg, session, text) {
  if (chatIds.length < 2) return;
  const sent = await send(text, session.thread_id, {}, { except: msg.chat.id }).catch((err) => {
    console.error('[telegram] could not tell the other groups:', err.message);
    return [];
  });
  await linkSent(sent, session.id);
}

function replyTo(msg, text) {
  return api('sendMessage', {
    chat_id: msg.chat.id,
    message_thread_id: msg.is_topic_message ? msg.message_thread_id : undefined,
    text,
    parse_mode: 'HTML',
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
  });
}

const tag = (session) => `<code>#${shortId(session)}</code>`;
// The visitor's IP as its own line, in <code> so a tap copies it.
const ipLine = (ip) => (ip ? `\n<b>IP:</b> <code>${escape(ip)}</code>` : '');
const replyButton = (sessionId) => ({ inline_keyboard: [[{ text: 'Reply >', callback_data: `reply:${sessionId}` }]] });

// Posts a new chat with the visitor's details. Returns the Telegram ids to store with the session: its topic, and
// the messages posted (for linkSent once the session is saved).
export async function notifyNewChat(chat) {
  const { id, name, message, transcript } = chat;
  let threadId;
  if (topicPerChat) {
    const topic = await api('createForumTopic', { chat_id: mainChat, name: clip(`${name} · #${shortId({ id })}`, 128) });
    threadId = topic.message_thread_id;
  }

  let history = '';
  if (transcript?.length) {
    history = `\n\n<b>Earlier, with the AI assistant</b>\n<blockquote expandable>${escape(clip(transcriptLines(transcript).join('\n\n'), 1800))}</blockquote>`;
  }

  const text = `<b>New ${chatKind(chat)} chat</b> ${tag({ id })}\n\n`
    + (config.isDev ? '<b>Local test</b>\n\n' : '')
    + visitorDetails(chat).map(([label, value]) => `<b>${label}:</b> ${escape(value)}`).join('\n')
    + ipLine(chat.ip)
    + `\n\n<b>Message</b>\n<blockquote>${escape(message)}</blockquote>`
    + history;

  const sent = await send(text, threadId, { reply_markup: replyButton(id) });
  return { threadId, sent };
}

// A request-access form submission. It isn't a chat, so replies to it in Telegram go nowhere.
export async function notifyAccessRequest(request) {
  const text = '<b>New access request</b>\n\n'
    + accessDetails(request).map(([label, value]) => `<b>${label}:</b> ${escape(value)}`).join('\n')
    + ipLine(request.ip)
    + (request.message ? `\n\n<b>Message</b>\n<blockquote>${escape(request.message)}</blockquote>` : '');
  await send(text);
}

// `ip`: where this message came from; shown only when it is not the address the chat started from.
export async function notifyVisitorMessage(session, text, ip = '') {
  const moved = ip && session.ip && ip !== session.ip ? ` · new IP <code>${escape(ip)}</code>` : '';
  const head = `<b>${escape(session.name)}</b> ${tag(session)}${moved}`;
  const sent = await send(`${head}\n${escape(text)}`, session.thread_id, { reply_markup: replyButton(session.id) });
  await linkSent(sent, session.id);
}

export async function notifyVisitorEnded(session) {
  // The widget calls this when a visitor's newer chat pushes out their oldest one.
  const sent = await send(`<b>Chat ended</b> ${tag(session)}`, session.thread_id);
  await linkSent(sent, session.id);
  closeTopic(session);
}

export async function notifyAutoEnded(session, hours) {
  const sent = await send(`<b>Chat ended automatically</b> ${tag(session)}: no messages for ${hours} hours`, session.thread_id);
  await linkSent(sent, session.id);
  closeTopic(session);
}

// Keeps Telegram in the loop when someone answers from the email reply page.
export async function notifyAgentReply(session, agentName, text) {
  const sent = await send(`<b>${escape(agentName)} replied to ${escape(session.name)}</b> ${tag(session)} from email\n${escape(text)}`, session.thread_id);
  await linkSent(sent, session.id);
}

export async function notifyEndedFromEmail(session, agentName) {
  const sent = await send(`<b>${escape(agentName)} ended the chat</b> ${tag(session)} from email`, session.thread_id);
  await linkSent(sent, session.id);
  closeTopic(session);
}

function closeTopic(session) {
  if (session.thread_id) api('closeForumTopic', { chat_id: mainChat, message_thread_id: session.thread_id }).catch(() => {});
}

const HELP = `<b>Answering website chats</b>
• tap <b>Reply &gt;</b> under a visitor's message and type your answer, or
• <b>Reply</b> to any message about a chat, or
• type in the visitor's topic (when each chat has its own topic), or
• start with the chat id: <code>a1b2c3d4 Your answer</code>

<b>Commands</b> (send as a reply or in the topic)
/close: end the chat (the visitor sees your goodbye and can start a new chat)
/close Your goodbye: end it with your own last message
/buyers: every buyer, paid or pending, with what they owe or hold in credit, and the calls it covers
/chatid: show this chat's id (for setup)`;

async function handleMessage(msg) {
  if (msg.from?.is_bot) return;
  const text = (msg.text || msg.caption || '').trim();
  const command = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);

  if (command?.[1] === 'chatid') {
    const topic = msg.is_topic_message ? `\n<b>Topic ID:</b> <code>${msg.message_thread_id}</code>` : '';
    return replyTo(msg, `<b>Chat ID:</b> <code>${msg.chat.id}</code>${topic}`);
  }
  // A customer's own chat with the bot (Connect Telegram in the portal), never part of the support chat.
  // Loaded when needed: telegram-link.js uses this file to send, so a static import would be circular.
  if (msg.chat.type === 'private' && !isTeamChat(msg.chat.id)) {
    if (!await claimTelegramUpdate(`${msg.chat.id}:${msg.message_id}`)) return;
    const { handlePrivateMessage } = await import('./telegram-link.js');
    return handlePrivateMessage(msg, command);
  }
  // Every buyer as paid or pending, as of now: in a support group or a billing group (billing-notices.js,
  // loaded when needed for the same reason as above).
  if (command?.[1] === 'buyers' && (isTeamChat(msg.chat.id) || config.telegram.billingChatIds.includes(String(msg.chat.id)))) {
    if (!await claimTelegramUpdate(`${msg.chat.id}:${msg.message_id}`)) return;
    const { buyersReply } = await import('./billing-notices.js');
    return replyTo(msg, await buyersReply().catch((err) => {
      console.error('[billing] could not answer /buyers:', err.message);
      return '<b>Could not read the buyers just now.</b> Please try again, or open Finance in the portal.';
    }));
  }
  if (!isTeamChat(msg.chat.id)) {
    console.warn(`[telegram] ignored a message from chat ${msg.chat.id}; only TELEGRAM_CHAT_ID=${chatIds.join(',')} is accepted`);
    return;
  }
  // Answered once, even if Telegram delivers it twice (two copies of the server, or a restart before it was confirmed).
  if (!await claimTelegramUpdate(`${msg.chat.id}:${msg.message_id}`)) return;
  if (command?.[1] === 'help' || command?.[1] === 'start') return replyTo(msg, HELP);

  let session = null;
  let body = command ? command[2].trim() : text;
  if (msg.reply_to_message) {
    const target = msg.reply_to_message;
    session = await findSessionByTelegramMessage(msg.chat.id, target.message_id);
    // A reply to any message that names the chat (every bot message about a chat ends in its #tag) counts too.
    const tagged = !session && /#([0-9a-f]{8})\b/i.exec(target.text || target.caption || '');
    if (tagged) session = await findSessionByShortId(tagged[1]);
  }
  if (!session && String(msg.chat.id) === mainChat && msg.is_topic_message && msg.message_thread_id !== sharedThreadId) {
    session = await findSessionByThread(msg.message_thread_id);
  }
  if (!session) {
    const prefixed = body.match(/^#?([0-9a-f]{8})\b\s*([\s\S]*)$/i);
    if (prefixed) {
      session = await findSessionByShortId(prefixed[1]);
      body = prefixed[2].trim();
    }
  }
  if (!session) {
    if (command?.[1] === 'close') return replyTo(msg, '<b>Which chat?</b> Send /close as a reply to a chat message, in the visitor\'s topic, or as <code>/close a1b2c3d4</code>.');
    return; // anything else is the team talking among themselves
  }

  await linkTelegramMessage(msg.chat.id, msg.message_id, session.id);

  const ended = session.status !== 'open';
  const agentName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null;

  // Ends the chat: the visitor sees the goodbye in that chat and can no longer reply to it.
  if (command?.[1] === 'close') {
    if (ended) return replyTo(msg, `<b>Already ended</b> ${tag(session)}`);
    await addMessage(session.id, 'agent', agentName, body || TEAM_ENDED_MESSAGE);
    await setStatus(session.id, 'ended');
    await replyTo(msg, `<b>Chat ended</b> ${tag(session)}`);
    await tellOtherGroups(msg, session, `<b>${escape(agentName || 'The team')} ended the chat</b> ${tag(session)}`);
    closeTopic(session);
    return;
  }
  if (command) return replyTo(msg, `<b>Unknown command.</b> Send /help for the list.`);

  if (!msg.text) return replyTo(msg, '<b>Not sent.</b> Only text can be delivered to the website chat. Please type your answer.');
  if (!body) return;
  if (ended) {
    const followUp = session.email ? ` Email ${escape(session.name)} at <b>${escape(session.email)}</b>.` : '';
    return replyTo(msg, `<b>Not sent:</b> this chat has ended.${followUp}`);
  }

  await addMessage(session.id, 'agent', agentName, body);
  await tellOtherGroups(msg, session, `<b>${escape(agentName || 'The team')} replied to ${escape(session.name)}</b> ${tag(session)}\n${escape(body)}`);

  // Answered through "Reply >": turn the "replying to" prompt into the delivery confirmation.
  const prompt = msg.reply_to_message;
  if (prompt?.from?.is_bot && prompt.reply_markup === undefined && / replying to /.test(prompt.text || '')) {
    api('editMessageText', {
      chat_id: msg.chat.id, message_id: prompt.message_id, parse_mode: 'HTML',
      text: `<b>Sent to ${escape(session.name)}</b> ${tag(session)}`,
    }).catch(() => {});
  }
}

// "Reply >" tapped: open a reply box for that chat. Only the person who tapped gets the box
// (force_reply + selective, aimed at them by the mention), and whatever they send back is a
// reply to this prompt, which is linked to the chat.
async function handleReplyButton(query) {
  const answer = (text) => api('answerCallbackQuery', { callback_query_id: query.id, text }).catch(() => {});
  if (!await claimTelegramUpdate(`button:${query.id}`)) return undefined; // one reply box per tap
  const sessionId = /^reply:([0-9a-f-]{36})$/.exec(query.data || '')?.[1];
  const msg = query.message;
  if (!sessionId || !msg || !isTeamChat(msg.chat.id)) return answer();
  const session = await getSession(sessionId);
  if (!session) return answer('This chat no longer exists.');

  const agent = query.from;
  const mention = agent.username
    ? `@${agent.username}`
    : `<a href="tg://user?id=${agent.id}">${escape(agent.first_name || 'You')}</a>`;
  // Only in the group where it was tapped.
  const prompt = await sendTo(msg.chat.id, `${mention} <b>replying to ${escape(session.name)}</b> ${tag(session)}`, {
    threadId: msg.is_topic_message ? msg.message_thread_id : undefined,
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: clip(`Reply to ${session.name}`, 64) },
  });
  await linkTelegramMessage(msg.chat.id, prompt.message_id, session.id);
  return answer();
}

// Long-polls Telegram for the team's replies. Runs for the life of the process.
export async function startBot() {
  const prune = () => forgetHandledTelegram().catch((err) => console.error('[telegram] cleanup failed:', err.message));
  prune();
  setInterval(prune, 6 * 3_600_000).unref();
  let ready = false;
  let offset = Number((await getValue('telegram_offset')) || 0);

  for (;;) {
    try {
      if (!ready) {
        await api('deleteWebhook'); // polling and webhooks cannot be used together
        const me = await api('getMe');
        username = me.username;
        console.log(`[telegram] listening for replies as @${me.username}`);
        ready = true;
      }
      const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, 45000);
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          if (update.message) await handleMessage(update.message);
          else if (update.callback_query) await handleReplyButton(update.callback_query);
        } catch (err) {
          console.error('[telegram] failed to handle an update:', err);
        }
        await setValue('telegram_offset', offset);
      }
    } catch (err) {
      if (err.code === 401) console.error('[telegram] TELEGRAM_BOT_TOKEN was rejected. Check it with @BotFather.');
      else if (err.code === 409) console.error('[telegram] Another copy of this server is already polling with the same bot token.');
      else console.error('[telegram]', err.message);
      await sleep(err.retryAfter ? err.retryAfter * 1000 : 5000);
    }
  }
}
