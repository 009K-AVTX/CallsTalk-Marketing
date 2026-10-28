import { Children, isValidElement, useEffect, useId, useRef, useState } from 'react';

// A dropdown in the site's dark theme, in place of <select>: the browser's own list ignores the theme (on Windows a
// grey first row and a bright blue highlight). Used like one, with <option> children and onChange(e) reading
// e.target.value, so the forms around it stay as they are. Keyboard: arrows, Home/End, Enter/Space, Escape, typing a
// name's first letters. `required`: a hidden input carries the value, so the browser's form check still asks for it.

// The <option> children, through arrays and fragments -> [{ value, label, disabled }].
function optionsOf(children, out = []) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === 'option') {
      const label = Children.toArray(c.props.children).join('');
      out.push({ value: String(c.props.value ?? label), label, disabled: Boolean(c.props.disabled) });
    } else optionsOf(c.props.children, out);
  });
  return out;
}

export default function Select({ value, onChange, children, disabled = false, required = false, className = '', ...rest }) {
  const id = useId();
  const options = optionsOf(children);
  const selected = Math.max(0, options.findIndex((o) => o.value === String(value ?? '')));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const [up, setUp] = useState(false);
  const box = useRef(null);
  const list = useRef(null);
  const typed = useRef({ text: '', at: 0 });

  // Opens on the chosen option, upwards when there is no room below.
  const show = () => {
    if (disabled) return;
    const r = box.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < Math.min(300, options.length * 38 + 12) && r.top > window.innerHeight - r.bottom);
    setActive(selected);
    setOpen(true);
  };
  const choose = (i) => {
    const o = options[i];
    setOpen(false);
    if (o && !o.disabled && o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } });
  };

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // The next option that can be chosen, `step` away from `from`, staying at the ends.
  const move = (from, step) => {
    for (let i = from + step; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      setActive((a) => move(a, k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Home' || k === 'End') {
      if (!open) return;
      e.preventDefault();
      setActive(move(k === 'Home' ? -1 : options.length, k === 'Home' ? 1 : -1));
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (open) choose(active); else show();
    } else if (k === 'Escape' || k === 'Tab') {
      if (open && k === 'Escape') e.preventDefault();
      setOpen(false);
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = typed.current;
      t.text = (Date.now() - t.at < 700 ? t.text : '') + k.toLowerCase();
      t.at = Date.now();
      const start = open ? active : selected;
      const order = options.map((_, i) => (start + (t.text.length > 1 ? 0 : 1) + i) % options.length);
      const hit = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(t.text));
      if (hit === undefined) return;
      if (open) setActive(hit); else choose(hit);
    }
  };

  const current = options[selected];
  const empty = !current || current.value === '';
  return (
    <span ref={box} className={`c-select${open ? ' is-open' : ''}${up ? ' is-up' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}>
      <button
        type="button"
        className={`c-select__btn${empty ? ' is-empty' : ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        {...rest}
      >
        <span className="c-select__value">{current?.label ?? ''}</span>
        <svg className="c-select__chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {required && <input className="c-select__check" tabIndex={-1} aria-hidden="true" required value={value ?? ''} onChange={() => {}} onFocus={() => box.current.querySelector('button').focus()} />}
      {open && (
        // preventDefault: keeps focus on the button, and stops the <label> around it from clicking it again
        <ul ref={list} id={`${id}-list`} role="listbox" className="c-select__list" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
          {options.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              aria-disabled={o.disabled || undefined}
              className={`c-select__opt${i === active ? ' is-active' : ''}${i === selected ? ' is-on' : ''}${o.value === '' ? ' is-empty' : ''}`}
              onPointerMove={() => !o.disabled && i !== active && setActive(i)}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
              {i === selected && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
