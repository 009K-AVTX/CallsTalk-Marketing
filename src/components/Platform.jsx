import { useRef, useState } from 'react';
import { features } from '../data.js';

const inquiries = [
  { type: 'Call', channel: 'Paid search', detail: '“same-day plumbing”', meta: '3m 12s' },
  { type: 'Form', channel: 'Organic search', detail: 'Quote request on /plans', meta: 'New' },
  { type: 'Chat', channel: 'Paid social', detail: 'Summer campaign', meta: '4 messages' },
  { type: 'Call', channel: 'Referral', detail: 'Partner directory listing', meta: '1m 48s' },
];

const channels = [
  { name: 'Paid search', value: '$18,400', share: 100 },
  { name: 'Organic search', value: '$9,200', share: 50 },
  { name: 'Paid social', value: '$5,100', share: 28 },
];

function CaptureView() {
  return (
    <>
      <div className="screen__head">
        <b>Incoming inquiries</b>
        <span className="screen__live">Tracking live</span>
      </div>
      <ul className="feed">
        {inquiries.map((q) => (
          <li key={q.detail}>
            <span className={`feed__type feed__type--${q.type.toLowerCase()}`}>{q.type}</span>
            <span className="feed__source"><b>{q.channel}</b>{q.detail}</span>
            <span className="feed__meta">{q.meta}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function QualifyView() {
  return (
    <>
      <div className="screen__head">
        <b>Lead details</b>
        <span className="screen__live">Sales notified in 4 seconds</span>
      </div>
      <div className="lead-card">
        <div className="score" style={{ '--score': 86 }}>
          <span>86</span>
          <small>Lead score</small>
        </div>
        <div className="lead-card__body">
          <b>Inbound call, (555) 014-2290</b>
          <p>Paid search, “same-day plumbing”</p>
          <ul className="tags">
            <li>High intent</li>
            <li>Emergency repair</li>
            <li>Booked job</li>
          </ul>
        </div>
      </div>
      <dl className="lead-facts">
        <div><dt>Assigned to</dt><dd>Sales team</dd></div>
        <div><dt>Lead value</dt><dd>$420</dd></div>
        <div><dt>Recording</dt><dd>3m 12s</dd></div>
      </dl>
    </>
  );
}

function ProveView() {
  return (
    <>
      <div className="screen__head">
        <b>Revenue by channel</b>
        <span className="screen__muted">Last 30 days</span>
      </div>
      <ul className="channel-bars">
        {channels.map((c) => (
          <li key={c.name}>
            <span>{c.name}</span>
            <b>{c.value}</b>
            <i style={{ width: `${c.share}%` }} />
          </li>
        ))}
      </ul>
      <dl className="lead-facts">
        <div><dt>Return on ad spend</dt><dd>4.2x</dd></div>
        <div><dt>Cost per booked job</dt><dd>$38</dd></div>
        <div><dt>Synced to ad platforms</dt><dd>Daily</dd></div>
      </dl>
    </>
  );
}

const views = [CaptureView, QualifyView, ProveView];

export default function Platform() {
  const [active, setActive] = useState(0);
  const tabs = useRef([]);
  const f = features[active];
  const View = views[active];

  // Arrow keys move between pillars, as in any tab list.
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = (active + step + features.length) % features.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className="section section--white" id="features">
      <div className="container">
        <div className="platform__intro">
          <h2>One platform, from first ring to closed revenue.</h2>
          <p className="lead">Capture every inquiry, act on the best ones first, and show exactly what your marketing returned.</p>
        </div>

        <div className="pillars" role="tablist" aria-label="Platform capabilities" onKeyDown={onKeyDown}>
          {features.map((item, i) => (
            <button
              key={item.eyebrow}
              ref={(el) => (tabs.current[i] = el)}
              role="tab"
              id={`pillar-${i}`}
              aria-selected={active === i}
              aria-controls="pillar-panel"
              tabIndex={active === i ? 0 : -1}
              className={`pillar${active === i ? ' is-active' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="pillar__num">{i + 1}</span>
              <b>{item.eyebrow}</b>
            </button>
          ))}
        </div>

        <div className="stage" role="tabpanel" id="pillar-panel" aria-labelledby={`pillar-${active}`} key={active}>
          <div className="stage__copy">
            <h3>{f.title}</h3>
            <p>{f.body}</p>
            <ul className="capabilities">
              {f.links.map(({ name, text }) => (
                <li key={name}>
                  <h4>{name}</h4>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
            <a href="#" className="link">{f.cta}</a>
          </div>
          <div className="screen" aria-hidden="true">
            <View />
          </div>
        </div>
      </div>
    </section>
  );
}
