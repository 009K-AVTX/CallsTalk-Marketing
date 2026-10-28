// Loaded with `node --import` before the demo server: every call to api.telegram.org is answered here, so the demo
// never posts to the team's groups or reads the live bot. Everything else goes out as usual.
const realFetch = globalThis.fetch;
let id = 1000;

globalThis.fetch = async (url, init) => {
  const href = String(url?.url ?? url);
  if (!href.startsWith('https://api.telegram.org/')) return realFetch(url, init);
  const method = href.split('/').pop().split('?')[0];
  const result = method === 'getMe'
    ? { id: 1, is_bot: true, first_name: 'CallsTalk', username: 'CallsTalkBot' }
    : method === 'getUpdates' ? [] : { message_id: ++id, message_thread_id: id, chat: { id: 0 }, date: Math.floor(Date.now() / 1000) };
  return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
