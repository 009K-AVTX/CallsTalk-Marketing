// Small in-memory limiter: enough for one server process and keeps spam out of Telegram and email.
export function rateLimit({ windowMs, max, detail = 'Too many messages in a short time. Please wait a moment and try again.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, hit] of hits) if (hit.reset < now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let hit = hits.get(req.ip);
    if (!hit || hit.reset < now) hits.set(req.ip, (hit = { count: 0, reset: now + windowMs }));
    if (++hit.count > max) {
      res.setHeader('Retry-After', Math.ceil((hit.reset - now) / 1000));
      return res.status(429).json({ detail });
    }
    next();
  };
}
