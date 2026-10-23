import { useEffect, useState } from 'react';
import BrandLogo from './BrandLogo.jsx';
import { LogoMark } from './Logo.jsx';
import { ALL_INTEGRATIONS, FEATURED, INTEGRATION_GROUPS } from '../integrations.js';

// Orbit diagram: CallsTalk at the centre, the featured tools on an inner ring and every other tool on
// an outer ring. The rings turn in opposite directions; each icon counter-turns so it stays upright.
const OUTER = ALL_INTEGRATIONS.filter((i) => !FEATURED.includes(i));

const pos = (i, n) => ({ x: 50 + Math.cos((i / n) * Math.PI * 2) * 50, y: 50 + Math.sin((i / n) * Math.PI * 2) * 50 });

function Ring({ items, size, reverse, active = -1, tick = 0 }) {
  return (
    <div className={`orbit__ring orbit__ring--${size}${reverse ? ' is-reverse' : ''}`}>
      {size === 'inner' && (
        <svg className="orbit__spokes" viewBox="-50 -50 100 100">
          {items.map((item, i) => {
            const { x, y } = pos(i, items.length);
            return <line key={item.name} x1="0" y1="0" x2={x - 50} y2={y - 50} className={`orbit__spoke${i === active ? ' is-active' : ''}`} />;
          })}
        </svg>
      )}
      {size === 'inner' && active >= 0 && (
        // The data packet: re-keyed each tick so its flight restarts from the core.
        <span key={tick} className="orbit__packet" style={{ '--tx': `${pos(active, items.length).x}%`, '--ty': `${pos(active, items.length).y}%` }} />
      )}
      {items.map((item, i) => {
        const { x, y } = pos(i, items.length);
        return (
          <span key={item.name} className="orbit__slot" style={{ left: `${x}%`, top: `${y}%` }}>
            <span key={i === active ? `a${tick}` : 'idle'} className={`orbit__icon${i === active ? ' is-active' : ''}`} style={{ '--brand': item.color }} title={item.name}>
              <BrandLogo item={item} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

// Each tick: the core ripples, a packet flies out to one featured tool, the tool pops when it lands,
// and the caption reports the event while the day's count ticks up.
const EVENTS = [['Call', 'Paid Search'], ['Form', 'Organic Search'], ['Chat', 'Paid Social'], ['Call', 'Email Campaign'], ['Form', 'Paid Search'], ['Chat', 'Referral']];
const START = 1284;

function Hub() {
  const [tick, setTick] = useState(0);
  const [moving, setMoving] = useState(true);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMoving(false);
      return undefined;
    }
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, []);
  const active = tick % FEATURED.length;
  const [type, source] = EVENTS[tick % EVENTS.length];
  return (
    <div className="orbit-wrap">
      <div className={`orbit${moving ? '' : ' is-still'}`} aria-hidden="true">
        <div className="orbit__halo" />
        <Ring items={OUTER} size="outer" reverse />
        <Ring items={FEATURED} size="inner" active={active} tick={tick} />
        <span key={`r${tick}`} className="orbit__ripple" />
        <div key={`c${tick}`} className="orbit__core"><LogoMark className="orbit__mark" /></div>
      </div>
      <div className="orbit__status" aria-live="off">
        <p key={tick} className="orbit__event">
          <span className={`orbit__type orbit__type--${type.toLowerCase()}`}>{type}</span>
          <span>from {source}</span>
          <span className="orbit__arrow" aria-hidden="true">→</span>
          <b>{FEATURED[active].name}</b>
        </p>
        <p className="orbit__count"><span />{(START + tick).toLocaleString('en-US')} events synced today</p>
      </div>
    </div>
  );
}

const FILTERS = [{ title: 'All', items: ALL_INTEGRATIONS }, ...INTEGRATION_GROUPS];

export default function Integrations() {
  const [active, setActive] = useState('All');
  const [expanded, setExpanded] = useState(false);
  const items = FILTERS.find((f) => f.title === active).items;
  const LIMIT = 8;
  const shown = expanded ? items : items.slice(0, LIMIT);

  return (
    <div className="integrations" id="integrations">
      <div className="integrations__intro">
        <p className="integrations__count"><b>{ALL_INTEGRATIONS.length}</b> integrations</p>
        <h3>Your attribution, delivered wherever your team works.</h3>
        <p>Every traced call, form and chat, delivered to the tools your team uses every day.</p>
        <Hub />
      </div>
      <div className="integrations__catalog">
        <div className="integrations__filters" role="tablist" aria-label="Integration categories">
          {FILTERS.map((f) => (
            <button key={f.title} role="tab" aria-selected={active === f.title} className={active === f.title ? 'is-active' : undefined} onClick={() => { setActive(f.title); setExpanded(false); }}>
              {f.title}
            </button>
          ))}
        </div>
        <ul className="integrations__tiles" key={active}>
          {shown.map((item, i) => (
            <li key={item.name} className="integration" style={{ '--brand': item.color, animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <BrandLogo item={item} size="lg" />
              <span className="integration__name">{item.name}</span>
            </li>
          ))}
        </ul>
        {items.length > LIMIT && (
          <button className="integrations__more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
            {expanded ? 'Show fewer' : `Show all ${items.length} integrations`}
          </button>
        )}
      </div>
    </div>
  );
}
