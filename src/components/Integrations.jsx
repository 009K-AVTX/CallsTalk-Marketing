import { useState } from 'react';
import BrandLogo from './BrandLogo.jsx';
import { LogoMark } from './Logo.jsx';
import { ALL_INTEGRATIONS, FEATURED, INTEGRATION_GROUPS } from '../integrations.js';

// Hub diagram: CallsTalk in the middle, the featured tools around it on one ring.
const R = 39; // ring radius, % of the square stage
const spokes = FEATURED.map((item, i) => {
  const a = (i / FEATURED.length) * Math.PI * 2 - Math.PI / 2;
  return { item, x: 50 + Math.cos(a) * R, y: 50 + Math.sin(a) * R };
});

function Hub() {
  return (
    <div className="hub" aria-hidden="true">
      <svg className="hub__lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <circle cx="50" cy="50" r={R} className="hub__ring" />
        <circle cx="50" cy="50" r={R * 0.55} className="hub__ring hub__ring--inner" />
        {spokes.map(({ item, x, y }, i) => (
          <g key={item.name}>
            <line x1="50" y1="50" x2={x} y2={y} className="hub__spoke" />
            <line x1="50" y1="50" x2={x} y2={y} className="hub__pulse" style={{ animationDelay: `${i * 0.45}s` }} pathLength="100" />
          </g>
        ))}
      </svg>
      <div className="hub__core"><LogoMark className="hub__mark" /></div>
      {spokes.map(({ item, x, y }) => (
        <span key={item.name} className="hub__node" style={{ left: `${x}%`, top: `${y}%`, '--brand': item.color }} title={item.name}>
          <BrandLogo item={item} />
        </span>
      ))}
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
        <h3>Connects seamlessly with your existing tools.</h3>
        <p>Send every attributed call, form and chat to the ad platforms, CRMs, analytics and messaging tools your team already relies on.</p>
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
