// Small SVG charts for the admin pages: a line chart, stacked columns and a bar list.
// Colours come from the --viz-* tokens in portal.css (checked for colour-blind separation on the card surface).
// Every chart answers hover and the keyboard (arrow keys), and the pages offer the same numbers as a table.
import { useEffect, useRef, useState } from 'react';

const M = { top: 14, right: 14, bottom: 30 };

// Width of an element, kept up to date as the layout changes.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// Clean axis steps: 1, 2, 2.5 or 5 times a power of ten, about four of them. Counts step in whole numbers.
export function axisTicks(max, count = 4, whole = false) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).filter((s) => !whole || Number.isInteger(s)).find((s) => s >= raw) ?? Math.ceil(raw);
  const top = Math.ceil(max / step - 1e-9) * step;
  const out = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export const compact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(Math.round(n * 100) / 100);
};

const shortDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const longDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Which date labels fit under the axis: about one every 72px, always the last one.
function labelEvery(n, plotW) {
  const fit = Math.max(1, Math.floor(plotW / 72));
  return Math.max(1, Math.ceil(n / fit));
}

export function Legend({ items }) {
  return (
    <ul className="p-legend">
      {items.map((it) => (
        <li key={it.label}>
          <i className={`p-legend__key is-${it.kind || 'box'}`} style={{ '--c': it.color }} aria-hidden="true" />
          <span>{it.label}</span>
          {it.value !== undefined && <b>{it.value}</b>}
        </li>
      ))}
    </ul>
  );
}

function Tip({ x, width, title, rows, footer }) {
  // Kept inside the chart: flips to the left of the pointer near the right edge.
  const right = x > width - 200;
  return (
    <div className={`p-tip${right ? ' is-left' : ''}`} style={{ left: x }} role="status">
      <p className="p-tip__title">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="p-tip__row">
          <i style={{ '--c': r.color }} aria-hidden="true" />
          <b>{r.value}</b>
          <span>{r.label}</span>
        </p>
      ))}
      {footer && <p className="p-tip__foot">{footer}</p>}
    </div>
  );
}

// Arrow keys move along the days; focus shows the latest one.
function useCursor(n) {
  const [i, setI] = useState(null);
  const keys = (e) => {
    if (!n) return;
    if (e.key === 'ArrowRight') setI((v) => Math.min(n - 1, (v ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, (v ?? n) - 1));
    else if (e.key === 'Home') setI(0);
    else if (e.key === 'End') setI(n - 1);
    else if (e.key === 'Escape') setI(null);
    else return;
    e.preventDefault();
  };
  return { i, setI, keys, focus: () => setI((v) => v ?? n - 1), blur: () => setI(null) };
}

function Axis({ ticks, y, left, width, format }) {
  return (
    <g className="p-axis" aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'p-axis__base' : 'p-axis__grid'} />
          <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">{format(t)}</text>
        </g>
      ))}
    </g>
  );
}

function DayLabels({ labels, x, plotW, height }) {
  const every = labelEvery(labels.length, plotW);
  return (
    <g className="p-axis" aria-hidden="true">
      {labels.map((d, k) => ((labels.length - 1 - k) % every === 0 ? (
        <text key={d} x={x(k)} y={height - 8} textAnchor={k === 0 && labels.length > 1 ? 'start' : 'middle'}>{shortDay(d)}</text>
      ) : null))}
    </g>
  );
}

// Lines over days. series: [{ key, label, color, values }], all in one unit (one axis, never two).
export function LineChart({ labels, series, format = compact, tipFormat = format, height = 240, label, tipExtra }) {
  const [ref, width] = useWidth();
  const cursor = useCursor(labels.length);
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = axisTicks(max);
  const left = Math.max(36, ...ticks.map((t) => format(t).length * 7 + 14));
  const plotW = Math.max(10, width - left - M.right);
  const plotH = height - M.top - M.bottom;
  const n = labels.length;
  const x = (k) => left + (n > 1 ? (k / (n - 1)) * plotW : plotW / 2);
  const y = (v) => M.top + plotH - (v / ticks[ticks.length - 1]) * plotH;
  const path = (values) => values.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const k = n > 1 ? Math.round(((e.clientX - box.left - left) / plotW) * (n - 1)) : 0;
    cursor.setI(Math.min(n - 1, Math.max(0, k)));
  };
  const i = cursor.i;

  return (
    <div className="p-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} tabIndex={0}
          onPointerMove={move} onPointerLeave={cursor.blur} onKeyDown={cursor.keys} onFocus={cursor.focus} onBlur={cursor.blur}>
          <Axis ticks={ticks} y={y} left={left} width={width} format={format} />
          <DayLabels labels={labels} x={x} plotW={plotW} height={height} />
          {series.map((s) => (
            <g key={s.key} style={{ '--c': s.color }}>
              <path d={`${path(s.values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} className="p-line__area" />
              <path d={path(s.values)} className="p-line" />
              {n > 0 && <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" className="p-dot" />}
            </g>
          ))}
          {i !== null && (
            <g aria-hidden="true">
              <line x1={x(i)} x2={x(i)} y1={M.top} y2={M.top + plotH} className="p-cross" />
              {series.map((s) => <circle key={s.key} cx={x(i)} cy={y(s.values[i])} r="4.5" className="p-dot" style={{ '--c': s.color }} />)}
            </g>
          )}
        </svg>
      )}
      {i !== null && width > 0 && (
        <Tip x={x(i)} width={width} title={longDay(labels[i])} rows={series.map((s) => ({ label: s.label, color: s.color, value: tipFormat(s.values[i]) }))}
          footer={tipExtra?.(i)} />
      )}
    </div>
  );
}

// A rect with its top corners rounded (the data end); square at the baseline.
const capped = (x, top, w, h, r) => {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${top + h}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${top + h}Z`;
};

// Columns per day, stacked bottom to top in the order given.
export function ColumnChart({ labels, series, format = compact, tipFormat = format, height = 240, label, totalLabel = 'Total' }) {
  const [ref, width] = useWidth();
  const cursor = useCursor(labels.length);
  const n = labels.length;
  const totals = labels.map((_, k) => series.reduce((sum, s) => sum + (s.values[k] || 0), 0));
  const ticks = axisTicks(Math.max(0, ...totals), 4, totals.every(Number.isInteger));
  const left = Math.max(36, ...ticks.map((t) => format(t).length * 7 + 14));
  const plotW = Math.max(10, width - left - M.right);
  const plotH = height - M.top - M.bottom;
  const band = plotW / Math.max(n, 1);
  const barW = Math.max(2, Math.min(24, band * 0.7));
  const x = (k) => left + band * k + band / 2;
  const y = (v) => M.top + plotH - (v / ticks[ticks.length - 1]) * plotH;
  const i = cursor.i;

  const move = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    cursor.setI(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - box.left - left) / band))));
  };

  return (
    <div className="p-chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} tabIndex={0}
          onPointerMove={move} onPointerLeave={cursor.blur} onKeyDown={cursor.keys} onFocus={cursor.focus} onBlur={cursor.blur}>
          <Axis ticks={ticks} y={y} left={left} width={width} format={format} />
          <DayLabels labels={labels} x={x} plotW={plotW} height={height} />
          {labels.map((d, k) => {
            let base = 0;
            const top = series.reduce((t, s, j) => ((s.values[k] || 0) > 0 ? j : t), -1);
            return (
              <g key={d} className={i !== null && i !== k ? 'is-dim' : ''}>
                {series.map((s, j) => {
                  const v = s.values[k] || 0;
                  if (v <= 0) return null;
                  const y0 = y(base) - (base > 0 ? 2 : 0); // 2px of card between stacked pieces
                  base += v;
                  const y1 = y(base);
                  const h = Math.max(0, y0 - y1);
                  if (h < 0.5) return null;
                  return j === top
                    ? <path key={s.key} d={capped(x(k) - barW / 2, y1, barW, h, 4)} className="p-col" style={{ '--c': s.color }} />
                    : <rect key={s.key} x={x(k) - barW / 2} y={y1} width={barW} height={h} className="p-col" style={{ '--c': s.color }} />;
                })}
              </g>
            );
          })}
        </svg>
      )}
      {i !== null && width > 0 && (
        <Tip x={x(i)} width={width} title={longDay(labels[i])}
          rows={[...series].reverse().map((s) => ({ label: s.label, color: s.color, value: tipFormat(s.values[i] || 0) }))}
          footer={series.length > 1 ? `${totalLabel}: ${tipFormat(totals[i])}` : null} />
      )}
    </div>
  );
}

// Horizontal bars, one per row, largest first. items: [{ key, label, sub, value }]
export function BarList({ items, format = compact, color = 'var(--viz-1)', empty = 'Nothing to show.' }) {
  const max = Math.max(0, ...items.map((it) => it.value));
  if (!items.length || !max) return <p className="p-empty">{empty}</p>;
  return (
    <ul className="p-bars">
      {items.map((it) => (
        <li key={it.key} title={`${it.label}: ${format(it.value)}`}>
          <span className="p-bars__label">{it.label}{it.sub && <small>{it.sub}</small>}</span>
          <span className="p-bars__track" aria-hidden="true"><i style={{ width: `${(it.value / max) * 100}%`, '--c': color }} /></span>
          <b className="p-bars__value">{format(it.value)}</b>
        </li>
      ))}
    </ul>
  );
}
