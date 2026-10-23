import { useEffect, useState } from 'react';
import BrandLogo from './BrandLogo.jsx';
import { LogoMark } from './Logo.jsx';
import { ALL_INTEGRATIONS, FEATURED, INTEGRATION_GROUPS } from '../integrations.js';

// Orbit diagram: CallsTalk at the centre, the featured tools on an inner ring and every other tool on
// an outer ring. The rings turn in opposite directions; each icon counter-turns so it stays upright.
const OUTER = ALL_INTEGRATIONS.filter((i) => !FEATURED.includes(i));

function Ring({ items, size, reverse, active = -1 }) {
  return (
    <div className={`orbit__ring orbit__ring--${size}${reverse ? ' is-reverse' : ''}`}>
      {size === 'inner' && (
        <svg className="orbit__spokes" viewBox="-50 -50 100 100">
          {items.map((item, i) => {
            const a = (i / items.length) * Math.PI * 2;
            const x = Math.cos(a) * 50;
            const y = Math.sin(a) * 50;
            return (
              <g key={item.name} className={i === active ? 'is-active' : undefined}>
                <line x1="0" y1="0" x2={x} y2={y} className="orbit__spoke" />
                {i === active && <line key={`p${active}`} x1="0" y1="0" x2={x} y2={y} className="orbit__pulse" pathLength="100" />}
              </g>
            );
          })}
        </svg>
      )}
      {items.map((item, i) => (
        <span key={item.name} className="orbit__slot" style={{ left: `${50 + Math.cos((i / items.length) * Math.PI * 2) * 50}%`, top: `${50 + Math.sin((i / items.length) * Math.PI * 2) * 50}%` }}>
          <span className={`orbit__icon${i === active ? ' is-active' : ''}`} title={item.name}><BrandLogo item={item} /></span>
        </span>
      ))}
    </div>
  );
}

// Syncs one featured tool at a time: a pulse leaves the core, the tool lights up, the caption names it.
function Hub() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => setActive((i) => (i + 1) % FEATURED.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="orbit-wrap">
      <div className="orbit" aria-hidden="true">
        <div className="orbit__halo" />
        <Ring items={OUTER} size="outer" reverse />
        <Ring items={FEATURED} size="inner" active={active} />
        <div className="orbit__core" key={active}><LogoMark className="orbit__mark" /></div>
      </div>
      <p className="orbit__status" aria-live="off"><span />Synced to <b key={active}>{FEATURED[active].name}</b></p>
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
        <p>Every traced call, form and chat, pushed to the tools you open each morning.</p>
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
