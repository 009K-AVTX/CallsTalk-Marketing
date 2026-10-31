// A date range picker: a button showing the range, opening presets and a month calendar. Click a day to start, a second
// day to end (the same day twice: that day alone), then Apply. As the CRM's DateRangeControl, in the portal's colours.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, dayLabel, iso, today } from '../format.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The whole calendar month `delta` months from this one.
function monthBounds(delta) {
  const now = new Date();
  return { from: iso(new Date(now.getFullYear(), now.getMonth() + delta, 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + delta + 1, 0)) };
}

export const PRESETS = [
  { label: 'Today', range: () => ({ from: today(), to: today() }) },
  { label: 'Yesterday', range: () => ({ from: addDays(today(), -1), to: addDays(today(), -1) }) },
  { label: 'Last 7 Days', range: () => ({ from: addDays(today(), -6), to: today() }) },
  { label: 'Last 30 Days', range: () => ({ from: addDays(today(), -29), to: today() }) },
  { label: 'Last 90 Days', range: () => ({ from: addDays(today(), -89), to: today() }) },
  { label: 'This Month', range: () => ({ from: `${today().slice(0, 8)}01`, to: today() }) },
  { label: 'Last Month', range: () => monthBounds(-1) },
];
export const presetRange = (label) => PRESETS.find((p) => p.label === label).range();
const presetOf = (r) => PRESETS.find((p) => {
  const x = p.range();
  return x.from === r.from && x.to === r.to;
});

// "Last 7 Days", "Oct 24, 2026", or "Oct 20, 2026 – Oct 26, 2026".
export const rangeLabel = (r) => presetOf(r)?.label || (r.from === r.to ? dayLabel(r.from) : `${dayLabel(r.from)} – ${dayLabel(r.to)}`);

function Calendar({ year, month, selecting, from, to, hover, min, max, onDay, onHover, onPrev, onNext }) {
  const first = (new Date(year, month, 1).getDay() + 6) % 7; // weeks start on Monday
  const cells = [...Array(first).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const end = to || (selecting === 'to' && hover > from ? hover : '');
  return (
    <div className="p-cal">
      <div className="p-cal__nav">
        <button type="button" onClick={onPrev} aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
        <span>{MONTHS[month]} {year}</span>
        <button type="button" onClick={onNext} aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></button>
      </div>
      <div className="p-cal__grid" role="grid">
        {DAYS.map((d) => <span key={d} className="p-cal__dow">{d}</span>)}
        {cells.map((n, i) => {
          if (!n) return <span key={i} />;
          const day = `${year}-${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
          const off = (min && day < min) || (max && day > max);
          const cls = [
            'p-cal__day',
            day === from && 'is-from',
            day === (to || '') && 'is-to',
            from && end && day > from && day < end && 'is-in',
            day === today() && 'is-today',
          ].filter(Boolean).join(' ');
          return (
            <button key={i} type="button" className={cls} disabled={off} onClick={() => onDay(day)} onMouseEnter={() => onHover(day)}
              aria-pressed={day === from || day === to} aria-label={dayLabel(day)}>
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// value: { from, to } · min, max: the days that can be chosen (max defaults to today).
export default function DateRange({ value, onChange, min, max = today(), label = 'Dates' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [selecting, setSelecting] = useState('from');
  const [hover, setHover] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });
  const [view, setView] = useState(() => {
    const [y, m] = value.to.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const trigger = useRef(null);
  const pop = useRef(null);

  const close = () => {
    setOpen(false);
    setPresetsOpen(false);
    setSelecting('from');
  };
  const apply = (r) => {
    onChange(r);
    close();
  };
  const show = () => {
    setDraft(value);
    const [y, m] = value.to.split('-').map(Number);
    setView({ year: y, month: m - 1 });
    setOpen((o) => !o);
  };

  // Under the button, inside the window; above it when there is no room below. Fixed, so it follows on scroll.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = trigger.current.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 16);
      const height = pop.current?.offsetHeight || 460;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - width));
      let top = r.bottom + 6;
      if (top + height > window.innerHeight - 8 && r.top - height - 6 > 8) top = r.top - height - 6;
      setPos({ top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !trigger.current?.contains(e.target) && !pop.current?.contains(e.target)) close();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', outside);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', outside);
    };
  }, [open]);

  const onDay = (day) => {
    if (selecting === 'from') {
      setDraft({ from: day, to: '' });
      setSelecting('to');
    } else if (day === draft.from) {
      apply({ from: day, to: day }); // the same day twice: that day alone
    } else {
      setDraft(day < draft.from ? { from: day, to: draft.from } : { ...draft, to: day });
      setSelecting('from');
    }
  };
  const month = (delta) => setView(({ year, month: m }) => {
    const d = new Date(year, m + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const active = draft.to ? presetOf(draft) : null;

  // Inside the portal's root, so its colours apply; on the body when there is none.
  const root = document.querySelector('.p-app') || document.body;
  return (
    <>
      <button type="button" ref={trigger} className={`p-range${open ? ' is-open' : ''}`} onClick={show} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${rangeLabel(value)}`}>
        <svg className="p-range__cal" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></svg>
        <span>{rangeLabel(value)}</span>
        <svg className="p-range__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && createPortal(
        <div ref={pop} className="p-range__pop" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className="p-range__presets">
            <button type="button" className="p-range__preset" aria-expanded={presetsOpen} onClick={() => setPresetsOpen((o) => !o)}>
              <span>{active?.label || 'Custom Range'}</span>
              <svg className="p-range__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {presetsOpen && (
              <div className="p-range__list" role="listbox">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" role="option" aria-selected={active?.label === p.label} className={active?.label === p.label ? 'is-on' : ''}
                    onClick={() => { setDraft(p.range()); setSelecting('from'); setPresetsOpen(false); }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Calendar year={view.year} month={view.month} selecting={selecting} from={draft.from} to={draft.to} hover={hover} min={min} max={max}
            onDay={onDay} onHover={setHover} onPrev={() => month(-1)} onNext={() => month(1)} />
          {selecting === 'to' && draft.from && (
            <p className="p-range__hint"><button type="button" className="p-linkbtn" onClick={() => apply({ from: draft.from, to: draft.from })}>Only {dayLabel(draft.from)}</button></p>
          )}
          <div className="p-range__foot">
            <button type="button" className="btn btn--quiet btn--sm" onClick={close}>Cancel</button>
            <button type="button" className="btn btn--light btn--sm" disabled={!draft.from} onClick={() => apply({ from: draft.from, to: draft.to || draft.from })}>Apply</button>
          </div>
        </div>,
        root,
      )}
    </>
  );
}
