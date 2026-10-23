import ChatButton from './ChatButton.jsx';
import { useRef, useState } from 'react';
import { features } from '../data.js';

const inquiries = [
  { type: 'Call', channel: 'Paid Search', detail: '“same-day plumbing”', meta: '3m 12s' },
  { type: 'Form', channel: 'Organic Search', detail: 'Quote request on /plans', meta: 'New' },
  { type: 'Chat', channel: 'Paid Social', detail: 'Summer campaign', meta: '4 messages' },
  { type: 'Call', channel: 'Referral', detail: 'Partner directory listing', meta: '1m 48s' },
];

const channels = [
  { name: 'Paid Search', value: '$18,400', share: 100 },
  { name: 'Organic Search', value: '$9,200', share: 50 },
  { name: 'Paid Social', value: '$5,100', share: 28 },
];

function CaptureView() {
  return (
    <>
      <div className="screen__head">
        <b>Incoming Inquiries</b>
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
        <b>Lead Details</b>
        <span className="screen__live">Sales notified in 4 seconds</span>
      </div>
      <div className="lead-card">
        <div className="score" style={{ '--score': 86 }}>
          <span>86</span>
          <small>Lead Score</small>
        </div>
        <div className="lead-card__body">
          <b>Inbound call, (555) 014-2290</b>
          <p>Paid search, “same-day plumbing”</p>
          <ul className="tags">
            <li>High Intent</li>
            <li>Emergency Repair</li>
            <li>Booked Job</li>
          </ul>
        </div>
      </div>
      <dl className="lead-facts">
        <div><dt>Assigned To</dt><dd>Sales Team</dd></div>
        <div><dt>Lead Value</dt><dd>$420</dd></div>
        <div><dt>Recording</dt><dd>3m 12s</dd></div>
      </dl>
    </>
  );
}

function ProveView() {
  return (
    <>
      <div className="screen__head">
        <b>Revenue by Channel</b>
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
        <div><dt>Return on Ad Spend</dt><dd>4.2x</dd></div>
        <div><dt>Cost per Booked Job</dt><dd>$38</dd></div>
        <div><dt>Ad Platform Sync</dt><dd>Daily</dd></div>
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
          <h2>Hear it. Score it. Prove it.</h2>
          <p className="lead">Three jobs behind every lead, handled in one CallsTalk workspace.</p>
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
            <ChatButton className="link">{`Ask About ${f.eyebrow}`}</ChatButton>
          </div>
          <div className="app" aria-hidden="true">
            <div className="app__bar">
              <i /><i /><i />
              <span className="app__url">app.callstalk.com/{['inquiries', 'leads/4821', 'reports/revenue'][active]}</span>
            </div>
            <div className="app__body">
              <nav className="app__side">
                {['M4 6h16M4 12h16M4 18h10', 'M12 3v18M3 12h18', 'M5 19V9M12 19V5M19 19v-7'].map((d, i) => (
                  <span key={d} className={i === active ? 'is-on' : undefined}>
                    <svg viewBox="0 0 24 24"><path d={d} /></svg>
                  </span>
                ))}
              </nav>
              <div className="screen">
                <View />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
