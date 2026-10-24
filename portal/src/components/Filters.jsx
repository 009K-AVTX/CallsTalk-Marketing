// Filter pieces shared by the admin's Finance and Audit Log pages: the period, and the download menu.
import { useEffect, useRef, useState } from 'react';
import { addDays, iso, today } from '../format.js';
import Icon from './Icons.jsx';

const PRESETS = {
  today: { label: 'Today', range: () => ({ from: today(), to: today() }) },
  7: { label: '7 Days', range: () => ({ from: addDays(today(), -6), to: today() }) },
  30: { label: '30 Days', range: () => ({ from: addDays(today(), -29), to: today() }) },
  90: { label: '90 Days', range: () => ({ from: addDays(today(), -89), to: today() }) },
  month: { label: 'This Month', range: () => ({ from: `${today().slice(0, 8)}01`, to: today() }) },
  'last-month': {
    label: 'Last Month',
    range: () => {
      const d = new Date();
      return { from: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: iso(new Date(d.getFullYear(), d.getMonth(), 0)) };
    },
  },
};

export const period = (preset) => ({ preset, ...PRESETS[preset].range() });

// Presets in one row; Custom opens two dates beside them. value: { preset, from, to }
export function Period({ value, onChange, presets = ['7', '30', '90', 'month', 'last-month'] }) {
  const custom = value.preset === 'custom';
  const setDay = (k) => (e) => {
    const next = { ...value, preset: 'custom', [k]: e.target.value };
    if (next.from && next.to && next.from <= next.to) onChange(next);
    else onChange({ ...next, invalid: true });
  };
  return (
    <div className="p-period">
      <div className="p-ranges" role="radiogroup" aria-label="Period">
        {[...presets, 'custom'].map((p) => (
          <button key={p} type="button" role="radio" aria-checked={value.preset === p} className={value.preset === p ? 'is-on' : ''}
            onClick={() => onChange(p === 'custom' ? { ...value, preset: 'custom' } : period(p))}>
            {p === 'custom' ? 'Custom' : PRESETS[p].label}
          </button>
        ))}
      </div>
      {custom && (
        <span className="p-period__dates">
          <label><span className="sr-only">From</span><input type="date" value={value.from} max={today()} onChange={setDay('from')} /></label>
          <span aria-hidden="true">to</span>
          <label><span className="sr-only">To</span><input type="date" value={value.to} max={today()} onChange={setDay('to')} /></label>
        </span>
      )}
    </div>
  );
}

// "Download" with its formats underneath. options: [{ label, hint, run }]; run may return a promise.
export function DownloadMenu({ options, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !box.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const run = async (o) => {
    setBusy(o.label);
    setError('');
    try {
      await o.run();
      setOpen(false);
    } catch (err) {
      setError(err.message || 'That download did not work. Try again.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-menu" ref={box}>
      <button type="button" className="btn btn--quiet btn--sm" aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}>
        <Icon name="download" />{busy ? 'Preparing…' : 'Download'}
      </button>
      {open && (
        <div className="p-menu__list" role="menu">
          {options.map((o) => (
            <button key={o.label} type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => run(o)}>
              <span className="p-menu__fmt" aria-hidden="true">{o.format}</span>
              <span>{o.label}{o.hint && <small>{o.hint}</small>}</span>
            </button>
          ))}
          {error && <p className="p-menu__error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
