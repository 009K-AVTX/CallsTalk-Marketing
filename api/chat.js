// CallsTalk assistant: proxies the landing-page chat to Groq's OpenAI-compatible
// endpoint so GROQ_API_KEY never reaches the browser. Models are tried in order
// because Groq retires model ids on a schedule.

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

const SYSTEM_PROMPT = `You are the CallsTalk assistant on the CallsTalk website.

CallsTalk is marketing attribution software. It links each phone call, form
submission and chat conversation to the campaign, keyword and channel that
produced it, so teams can cut wasted budget and invest in what performs.
Capabilities: call attribution with dynamic number insertion, form monitoring,
chat attribution, purchase tracking, lead scoring and labels, real-time
notifications, conversation recording, dashboards, offline conversion sync to
ad platforms, cross-channel attribution and automated reporting. It connects
to advertising networks, CRMs, analytics tools, webhooks and a developer API.
Plans exist for businesses and for agencies. There is no free trial: new
customers request access or book a demo, and a specialist helps them set up.
Never offer or promise a free trial or free plan.

Keep replies short (1 to 3 short paragraphs), warm and specific. Do not quote
exact prices; point people to the Plans section or the team. If someone wants
a person, tell them to choose "Talk to our team" in this chat. Never invent
customers, statistics or features that are not listed here.`;

function describeUpstream(status, body) {
  const code = body?.error?.code || '';
  if (status === 401 || code === 'invalid_api_key') return 'The assistant is misconfigured. Please talk to our team instead.';
  if (status === 429 || code === 'rate_limit_exceeded') return 'The assistant is busy right now. Please try again in a moment.';
  return 'The assistant is temporarily unavailable. Please try again shortly.';
}

function isModelUnavailable(status, body) {
  const code = body?.error?.code || '';
  return status === 404 || ['model_decommissioned', 'model_not_found', 'model_not_active'].includes(code)
    || (status === 400 && (body?.error?.message || '').toLowerCase().includes('model'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.error('[api/chat] GROQ_API_KEY is not set');
    return res.status(500).json({ error: 'The assistant is not configured yet. Please talk to our team instead.' });
  }

  const messages = (req.body?.messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-20);
  if (!messages.length) return res.status(400).json({ error: 'No messages.' });

  for (const model of MODELS) {
    let upstream;
    try {
      upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, max_tokens: 512, temperature: 0.6, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages] }),
      });
    } catch (err) {
      console.error(`[api/chat] network error reaching Groq (${model}):`, err);
      return res.status(502).json({ error: 'The assistant is unreachable right now.' });
    }

    if (upstream.ok) {
      const data = await upstream.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) return res.status(200).json({ reply });
      return res.status(502).json({ error: 'The assistant returned an empty reply.' });
    }

    const raw = await upstream.text();
    let body = {};
    try { body = JSON.parse(raw); } catch { /* non-JSON error body */ }
    console.error(`[api/chat] Groq ${upstream.status} for ${model}: ${raw.slice(0, 500)}`);
    if (!isModelUnavailable(upstream.status, body)) {
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: describeUpstream(upstream.status, body) });
    }
  }

  return res.status(502).json({ error: 'None of the assistant models are available right now.' });
}
