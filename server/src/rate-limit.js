// Request limits for one server process: how often (rateLimit), how many at once (concurrencyLimit), and a
// queue for heavy work (workQueue). They keep floods, spam and slow scrapers from tying up the process and the
// database. A real flood is stopped earlier, by nginx (server/deploy/nginx-portal.conf); these are the second line.

// Each limiter remembers at most this many senders. Past it the oldest are forgotten, so a flood from many
// addresses costs a bounded amount of memory instead of growing until the process falls over.
const MAX_KEYS = 50_000;

const byIp = (req) => req.ip || 'unknown';

function retryAfter(res, ms) {
  res.setHeader('Retry-After', Math.max(1, Math.ceil(ms / 1000)));
}

// At most `max` requests per `windowMs` from one sender. `key` picks the sender (the IP by default; the
// signed-in login for routes behind requireUser).
export function rateLimit({ windowMs, max, key = byIp, detail = 'Too many messages in a short time. Please wait a moment and try again.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, hit] of hits) if (hit.reset < now) hits.delete(k);
  }, Math.min(windowMs, 60_000)).unref();

  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let hit = hits.get(k);
    if (!hit || hit.reset < now) {
      if (hit) hits.delete(k);
      if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value); // the oldest
      hits.set(k, (hit = { count: 0, reset: now + windowMs }));
    }
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - hit.count - 1));
    if (++hit.count > max) {
      retryAfter(res, hit.reset - now);
      return res.status(429).json({ detail });
    }
    next();
  };
}

// At most `perKey` requests in progress from one sender and `total` in all; more are turned away at once
// (503) rather than queued, so a burst cannot pile up connections and database work.
export function concurrencyLimit({ total, perKey, key = byIp, detail = 'The server is busy right now. Please try again in a moment.' }) {
  let running = 0;
  const mine = new Map();
  return (req, res, next) => {
    const k = key(req);
    const n = mine.get(k) || 0;
    if (running >= total || n >= perKey) {
      retryAfter(res, 2000);
      return res.status(running >= total ? 503 : 429).json({ detail });
    }
    running++;
    mine.set(k, n + 1);
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      running--;
      const left = (mine.get(k) || 1) - 1;
      if (left) mine.set(k, left);
      else mine.delete(k);
    };
    res.on('finish', release);
    res.on('close', release); // the client went away before the reply
    next();
  };
}

// Heavy work (reports across every customer, downloads of the whole log): at most `running` at a time, up to
// `waiting` more in line for `waitMs`. Past that the request is turned away, so these can never take all of
// the database connections from logins and billing.
export function workQueue({ running: limit, waiting: maxWaiting, waitMs = 15_000, detail = 'Many reports are being prepared right now. Please try again in a moment.' }) {
  let running = 0;
  const line = [];
  const startNext = () => {
    while (running < limit && line.length) {
      const job = line.shift();
      clearTimeout(job.timer);
      if (job.cancelled) continue;
      running++;
      job.start();
    }
  };
  return (req, res, next) => {
    const start = () => {
      let done = false;
      const release = () => {
        if (done) return;
        done = true;
        running--;
        startNext();
      };
      res.on('finish', release);
      res.on('close', release);
      next();
    };
    if (running < limit) {
      running++;
      return start();
    }
    if (line.length >= maxWaiting) {
      retryAfter(res, 5000);
      return res.status(503).json({ detail });
    }
    const job = { start, cancelled: false };
    job.timer = setTimeout(() => {
      const at = line.indexOf(job);
      if (at >= 0) line.splice(at, 1);
      if (job.cancelled || res.headersSent) return;
      job.cancelled = true;
      retryAfter(res, 5000);
      res.status(503).json({ detail });
    }, waitMs);
    res.on('close', () => { job.cancelled = true; });
    line.push(job);
  };
}

// For routes behind requireUser: limit by login, so people sharing an office address do not limit each other.
export const byUser = (req) => (req.user ? `u:${req.user.id}` : byIp(req));

// Reports across every customer and the audit log's summary and downloads share one queue: two at a time.
// Per login: 60 a minute, and 20 downloads (export=csv|pdf) in 10 minutes.
const heavyQueue = workQueue({ running: 2, waiting: 10 });
const reportRate = rateLimit({ windowMs: 60_000, max: 60, key: byUser, detail: 'Too many reports in a short time. Please wait a minute.' });
const downloadRate = rateLimit({ windowMs: 10 * 60_000, max: 20, key: byUser, detail: 'Too many downloads in a short time. Please wait a few minutes.' });
export const reportLimits = [
  reportRate,
  (req, res, next) => (req.query.export ? downloadRate(req, res, next) : next()),
  heavyQueue,
];
