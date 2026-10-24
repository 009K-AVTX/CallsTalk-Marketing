import { useEffect, useRef, useState } from 'react';

// Chart colours, validated for the dark surface (#0e0b12) with the dataviz palette checker:
// both slots inside the lightness band, CVD separation 17.1, contrast >= 3:1.
export const SERIES = { converted: '#a873e6', other: '#199e70' };
const GRID = '#241d2c';
const AXIS = '#8c8396';

function Tooltip({ tip, x }) {
  if (!tip) return null;
  return (
    <div className="p-tip" style={{ left: `${Math.min(Math.max(x, 8), 92)}%` }} role="status">
      <b>{tip.title}</b>
      {tip.lines.map(([label, value, color]) => (
        <span key={label}>{color && <i style={{ background: color }} />}{label}<em>{value}</em></span>
      ))}
    </div>
  );
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((n) => n >= v);
};

// Vertical bars, one per row; each row may stack up to two series (bottom first).
// rows: [{ label, values: [a, b?], tip }]; series: [{ name, color }].
export function Bars({ rows, series, height = 220, yFormat = String, labelEvery = 1, ariaLabel }) {
  const [hover, setHover] = useState(null);
  // Thin the x labels to what the chart's width can hold (about one per 56px).
  const box = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const every = Math.max(labelEvery, width ? Math.ceil(rows.length / Math.max(1, Math.floor((width - 52) / 56))) : labelEvery);
  const W = 1000;
  const H = height;
  const pad = { t: 10, r: 4, b: 26, l: 0 }; // the y labels sit in their own HTML column
  const max = niceMax(Math.max(0, ...rows.map((r) => r.values.reduce((a, b) => a + b, 0))));
  const slot = (W - pad.l - pad.r) / Math.max(rows.length, 1);
  const bw = Math.max(2, Math.min(slot - 2, 46));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];

  return (
    <div className="p-chart" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = pad.l + slot * i + slot / 2;
          let base = 0;
          const total = r.values.reduce((a, b) => a + b, 0);
          return (
            <g key={r.label + i} opacity={hover === null || hover === i ? 1 : 0.45}>
              {r.values.map((v, k) => {
                if (!v) return null;
                const top = y(base + v);
                const bottom = y(base);
                base += v;
                const isTop = base === total;
                const h = Math.max(bottom - top - (k > 0 ? 2 : 0), 0.5); // 2px surface gap between stacked fills
                const rr = isTop ? Math.min(4, bw / 2, h) : 0;
                const x0 = cx - bw / 2;
                const y0 = top;
                return (
                  <path
                    key={k}
                    fill={series[k].color}
                    d={`M${x0},${y0 + h} V${y0 + rr} Q${x0},${y0} ${x0 + rr},${y0} H${x0 + bw - rr} Q${x0 + bw},${y0} ${x0 + bw},${y0 + rr} V${y0 + h} Z`}
                  />
                );
              })}
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      <div className="p-chart__y" aria-hidden="true">
        {ticks.slice().reverse().map((t) => <span key={t} style={{ top: `${(y(t) / H) * 100}%` }}>{yFormat(t)}</span>)}
      </div>
      <div className="p-chart__x" aria-hidden="true">
        {rows.map((r, i) => <span key={r.label + i}>{i % every === 0 ? r.label : ''}</span>)}
      </div>
      <div className="p-chart__tips"><Tooltip tip={hover !== null && rows[hover]?.tip} x={hover !== null ? ((pad.l + slot * hover + slot / 2) / W) * 100 : 0} /></div>
    </div>
  );
}

export function Legend({ items }) {
  return (
    <ul className="p-legend">
      {items.map(({ name, color }) => <li key={name}><i style={{ background: color }} />{name}</li>)}
    </ul>
  );
}

// Weekday x hour grid: one violet hue, lighter for more calls (dark surface).
const ramp = (t) => {
  const a = [29, 22, 38];
  const b = [214, 163, 255];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Heatmap({ grid, format = (h) => h }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="p-heat" onMouseLeave={() => setHover(null)}>
      <div className="p-heat__grid" role="img" aria-label="Calls by weekday and hour">
        {grid.map((row, d) => (
          <div className="p-heat__row" key={DAYS[d]}>
            <span className="p-heat__day">{DAYS[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className={`p-heat__cell${hover && hover[0] === d && hover[1] === h ? ' is-on' : ''}`}
                style={{ background: v ? ramp(0.08 + 0.92 * (v / max)) : '#15111a' }}
                onMouseEnter={() => setHover([d, h])}
              />
            ))}
          </div>
        ))}
        <div className="p-heat__row p-heat__hours" aria-hidden="true">
          <span className="p-heat__day" />
          {Array.from({ length: 24 }, (_, h) => <span key={h}>{h % 3 === 0 ? format(h) : ''}</span>)}
        </div>
      </div>
      <div className="p-heat__foot">
        <span>{hover ? <><b>{DAYS[hover[0]]}, {format(hover[1])}</b> · {grid[hover[0]][hover[1]].toLocaleString('en-US')} calls</> : 'Hover a cell to see its calls.'}</span>
        <span className="p-heat__scale" aria-hidden="true">Fewer<i />More</span>
      </div>
    </div>
  );
}

// A card holding a chart with a Chart / Table switch, so every figure can be read without colour.
export function ChartCard({ title, sub, legend, table, children, className = '' }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`p-card ${className}`}>
      <header className="p-card__head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="p-card__tools">
          {legend && !asTable && <Legend items={legend} />}
          {table && (
            <button type="button" className="p-switch" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
              {asTable ? 'Chart' : 'Table'}
            </button>
          )}
        </div>
      </header>
      {asTable && table ? (
        <div className="p-tablewrap">
          <table className="p-table">
            <thead><tr>{table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, k) => (k ? <td key={k}>{c}</td> : <th key={k} scope="row">{c}</th>))}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}
