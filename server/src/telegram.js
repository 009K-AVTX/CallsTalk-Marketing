// Telegram side of the support chat.
//
// Outgoing: every new chat and every visitor message is posted to the team's Telegram chat.
// Incoming: the bot long-polls Telegram (no webhook or public URL needed) and turns the team's
// replies into `agent` messages that the website widget picks up on its next poll.
//
// The team answers a visitor in any of these ways:
//   1. Tap "Reply >" under a visitor's message: the bot opens a reply box for that chat.
//   2. Reply (swipe / right-click > Reply) to any message about that chat.
//   3. Type inside the visitor's own topic, when TELEGRAM_TOPIC_PER_CHAT=true.
//   4. Start a message with the chat's short id: "a1b2c3d4 Thanks, we'll call you shortly."

import { config } from './config.js';
import {
  addMessage, findSessionByShortId, findSessionByTelegramMessage, findSessionByThread,
  getSession, getValue, linkTelegramMessage, setStatus, setValue,
} from './db.js';
import { accessDetails, chatKind, clip, escapeHtml, shortId, TEAM_ENDED_MESSAGE, transcriptLines, visitorDetails } from './format.js';

const { token, chatId, threadId: sharedThreadId, topicPerChat } = config.telegram;
const MAX_TEXT = 4096;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, params = {}, timeoutMs = 15000) {
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

function send(text, threadId, extra = {}) {
  return api('sendMessage', {
    chat_id: chatId,
    message_thread_id: threadId ?? sharedThreadId,
    text: clip(text, MAX_TEXT),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  });
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
const replyButton = (sessionId) => ({ inline_keyboard: [[{ text: 'Reply >', callback_data: `reply:${sessionId}` }]] });

// Posts a new chat with the visitor's details. Returns the Telegram ids to store with the session.
export async function notifyNewChat(chat) {
  const { id, name, message, transcript } = chat;
  let threadId;
  if (topicPerChat) {
    const topic = await api('createForumTopic', { chat_id: chatId, name: clip(`${name} · #${shortId({ id })}`, 128) });
    threadId = topic.message_thread_id;
  }

  let history = '';
  if (transcript?.length) {
    history = `\n\n<b>Earlier, with the AI assistant</b>\n<blockquote expandable>${escape(clip(transcriptLines(transcript).join('\n\n'), 1800))}</blockquote>`;
  }

  const text = `<b>New ${chatKind(chat)} chat</b> ${tag({ id })}\n\n`
    + (config.isDev ? '<b>Local test</b>\n\n' : '')
    + visitorDetails(chat).map(([label, value]) => `<b>${label}:</b> ${escape(value)}`).join('\n')
    + `\n\n<b>Message</b>\n<blockquote>${escape(message)}</blockquote>`
    + history;

  const sent = await send(text, threadId, { reply_markup: replyButton(id) });
  return { threadId, messageId: sent.message_id };
}

// A request-access form submission. It isn't a chat, so replies to it in Telegram go nowhere.
export async function notifyAccessRequest(request) {
  const text = '<b>New access request</b>\n\n'
    + accessDetails(request).map(([label, value]) => `<b>${label}:</b> ${escape(value)}`).join('\n')
    + (request.message ? `\n\n<b>Message</b>\n<blockquote>${escape(request.message)}</blockquote>` : '');
  await send(text);
}

export async function notifyVisitorMessage(session, text) {
  const head = `<b>${escape(session.name)}</b> ${tag(session)}`;
  const sent = await send(`${head}\n${escape(text)}`, session.thread_id, { reply_markup: replyButton(session.id) });
  await linkTelegramMessage(chatId, sent.message_id, session.id);
}

export async function notifyVisitorEnded(session) {
  // The widget calls this when a visitor's newer chat pushes out their oldest one.
  const sent = await send(`<b>Chat ended</b> ${tag(session)}`, session.thread_id);
  await linkTelegramMessage(chatId, sent.message_id, session.id);
  closeTopic(session);
}

export async function notifyAutoEnded(session, hours) {
  const sent = await send(`<b>Chat ended automatically</b> ${tag(session)}: no messages for ${hours} hours`, session.thread_id);
  await linkTelegramMessage(chatId, sent.message_id, session.id);
  closeTopic(session);
}

// Keeps Telegram in the loop when someone answers from the email reply page.
export async function notifyAgentReply(session, agentName, text) {
  const sent = await send(`<b>${escape(agentName)} replied to ${escape(session.name)}</b> ${tag(session)} from email\n${escape(text)}`, session.thread_id);
  await linkTelegramMessage(chatId, sent.message_id, session.id);
}

export async function notifyEndedFromEmail(session, agentName) {
  const sent = await send(`<b>${escape(agentName)} ended the chat</b> ${tag(session)} from email`, session.thread_id);
  await linkTelegramMessage(chatId, sent.message_id, session.id);
  closeTopic(session);
}

function closeTopic(session) {
  if (session.thread_id) api('closeForumTopic', { chat_id: chatId, message_thread_id: session.thread_id }).catch(() => {});
}

const HELP = `<b>Answering website chats</b>
• tap <b>Reply &gt;</b> under a visitor's message and type your answer, or
• <b>Reply</b> to any message about a chat, or
• type in the visitor's topic (when each chat has its own topic), or
• start with the chat id: <code>a1b2c3d4 Your answer</code>

<b>Commands</b> (send as a reply or in the topic)
/close: end the chat (the visitor sees your goodbye and can start a new chat)
/close Your goodbye: end it with your own last message
/chatid: show this chat's id (for setup)`;

async function handleMessage(msg) {
  if (msg.from?.is_bot) return;
  const text = (msg.text || msg.caption || '').trim();
  const command = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);

  if (command?.[1] === 'chatid') {
    const topic = msg.is_topic_message ? `\n<b>Topic ID:</b> <code>${msg.message_thread_id}</code>` : '';
    return replyTo(msg, `<b>Chat ID:</b> <code>${msg.chat.id}</code>${topic}`);
  }
  if (String(msg.chat.id) !== chatId) {
    console.warn(`[telegram] ignored a message from chat ${msg.chat.id}; only TELEGRAM_CHAT_ID=${chatId} is accepted`);
    return;
  }
  if (command?.[1] === 'help' || command?.[1] === 'start') return replyTo(msg, HELP);

  let session = null;
  let body = command ? command[2].trim() : text;
  if (msg.reply_to_message) session = await findSessionByTelegramMessage(msg.chat.id, msg.reply_to_message.message_id);
  if (!session && msg.is_topic_message && msg.message_thread_id !== sharedThreadId) session = await findSessionByThread(msg.message_thread_id);
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
  const sessionId = /^reply:([0-9a-f-]{36})$/.exec(query.data || '')?.[1];
  const msg = query.message;
  if (!sessionId || !msg || String(msg.chat.id) !== chatId) return answer();
  const session = await getSession(sessionId);
  if (!session) return answer('This chat no longer exists.');

  const agent = query.from;
  const mention = agent.username
    ? `@${agent.username}`
    : `<a href="tg://user?id=${agent.id}">${escape(agent.first_name || 'You')}</a>`;
  const prompt = await send(`${mention} <b>replying to ${escape(session.name)}</b> ${tag(session)}`,
    msg.is_topic_message ? msg.message_thread_id : undefined, {
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: clip(`Reply to ${session.name}`, 64) },
    });
  await linkTelegramMessage(chatId, prompt.message_id, session.id);
  return answer();
}

// Long-polls Telegram for the team's replies. Runs for the life of the process.
export async function startBot() {
  let ready = false;
  let offset = Number((await getValue('telegram_offset')) || 0);

  for (;;) {
    try {
      if (!ready) {
        await api('deleteWebhook'); // polling and webhooks cannot be used together
        const me = await api('getMe');
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
