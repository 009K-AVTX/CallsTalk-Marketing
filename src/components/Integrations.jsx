import { useState } from 'react';
import BrandLogo from './BrandLogo.jsx';
import { LogoMark } from './Logo.jsx';
import { ALL_INTEGRATIONS, FEATURED, INTEGRATION_GROUPS } from '../integrations.js';

// Orbit diagram: CallsTalk at the centre, the featured tools on an inner ring and every other tool on
// an outer ring. The rings turn in opposite directions; each icon counter-turns so it stays upright.
const OUTER = ALL_INTEGRATIONS.filter((i) => !FEATURED.includes(i));

function Ring({ items, size, reverse }) {
  return (
    <div className={`orbit__ring orbit__ring--${size}${reverse ? ' is-reverse' : ''}`}>
      {size === 'inner' && (
        <svg className="orbit__spokes" viewBox="-50 -50 100 100">
          {items.map((item, i) => {
            const a = (i / items.length) * Math.PI * 2;
            const x = Math.cos(a) * 50;
            const y = Math.sin(a) * 50;
            return (
              <g key={item.name}>
                <line x1="0" y1="0" x2={x} y2={y} className="orbit__spoke" />
                <line x1="0" y1="0" x2={x} y2={y} className="orbit__pulse" pathLength="100" style={{ animationDelay: `${i * 0.42}s` }} />
              </g>
            );
          })}
        </svg>
      )}
      {items.map((item, i) => (
        <span key={item.name} className="orbit__slot" style={{ left: `${50 + Math.cos((i / items.length) * Math.PI * 2) * 50}%`, top: `${50 + Math.sin((i / items.length) * Math.PI * 2) * 50}%` }}>
          <span className="orbit__icon" title={item.name}><BrandLogo item={item} /></span>
        </span>
      ))}
    </div>
  );
}

function Hub() {
  return (
    <div className="orbit" aria-hidden="true">
      <div className="orbit__halo" />
      <Ring items={OUTER} size="outer" reverse />
      <Ring items={FEATURED} size="inner" />
      <div className="orbit__core"><LogoMark className="orbit__mark" /><b>{ALL_INTEGRATIONS.length}</b></div>
    </div>
  );
}

const FILTERS = [{ title: 'All', items: ALL_INTEGRATIONS }, ...INTEGRATION_GROUPS];

export default function Integrations() {
  const [active, setActive] = useState('All');
  const [expanded, setExpanded] = useState(false);
  const items = FILTERS.find((f) => f.title === active).items;
  const LIMIT = 12;
  const shown = expanded ? items : items.slice(0, LIMIT);
  const groupOf = (name) => INTEGRATION_GROUPS.find((g) => g.items.some((i) => i.name === name)).title;

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
              <span className="integration__text">
                <span className="integration__name">{item.name}</span>
                <span className="integration__group">{groupOf(item.name)}</span>
              </span>
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
