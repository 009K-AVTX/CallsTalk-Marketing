import { useEffect, useMemo, useState } from 'react';
import { callKey, callSheets, isReplaced as replacedIn } from '../call-summary.js';
import { fetchFile } from '../reports.js';
import { dayLabel } from '../format.js';
import { callTime } from '../../../src/components/BillingPage.jsx';
import Icon from './Icons.jsx';

const MAX_ROWS = 1000;

export async function downloadReport(report) {
  const data = await fetchFile(report);
  const url = URL.createObjectURL(new Blob([data]));
  const a = Object.assign(document.createElement('a'), { href: url, download: report.filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A row matches what was typed when a cell holds it, or holds its digits ("(574) 344-7831" finds 5743447831, and
// "15:22" the call at 15:22:51).
function matches(row, needle) {
  if (!needle) return true;
  const cells = row.map((c) => String(c ?? '').toLowerCase());
  if (cells.some((c) => c.includes(needle))) return true;
  const digits = needle.replace(/\D/g, '');
  return digits.length >= 3 && cells.some((c) => c.replace(/\D/g, '').includes(digits));
}

const plural = (n, word) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

// The report opened in the page: one tab per sheet, values as the sheet formats them. In a Call Summary the calls
// replaced at the buyer's request are marked. `pick` (the team): { onReplace(calls, reason) -> how many were replaced }
// puts a box by each call, to choose the ones the buyer asked to have replaced and take them off their bill, with a
// search by caller or time.
export default function SheetViewer({ report, onClose, pick }) {
  const [book, setBook] = useState(null);
  const [sheet, setSheet] = useState(0);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState(() => new Map()); // callKey -> call
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState({ status: 'idle', message: '' });
  const [find, setFind] = useState('');

  // Loaded again only for another report: after a replacement the same report comes back with its new `replaced`.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [XLSX, data] = await Promise.all([import('xlsx'), fetchFile(report)]); // SheetJS loads only when a report is opened
        let sheets;
        if (report.kind === 'calls') sheets = callSheets(XLSX, data); // a call log has no header row, and each row is a call
        else {
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: '' }) }));
        }
        if (live) setBook(sheets);
      } catch (err) {
        if (live) setError(err.message || 'This file could not be opened.');
      }
    })();
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => { live = false; document.removeEventListener('keydown', esc); };
  }, [report.id, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const replaced = useMemo(() => new Set((report.replaced || []).map(callKey)), [report.replaced]);
  const rows = book?.[sheet]?.rows || [];
  const width = Math.max(0, ...rows.slice(0, MAX_ROWS).map((r) => r.length));
  const [head, ...body] = rows;
  // The calls on this sheet, row by row (null for a row that is not a call), and a column to mark them in.
  const calls = book?.[sheet]?.calls || [];
  const done = calls.filter((c) => c && replacedIn(replaced, c)).length;
  const marks = report.kind === 'calls' && (Boolean(pick) || done > 0);

  // What the team is shown while picking: the calls that match the search. Everyone else sees every row.
  const needle = pick ? find.trim().toLowerCase() : '';
  const shown = useMemo(() => body.map((r, i) => i).filter((i) => !needle || (calls[i] && matches(body[i], needle))), [rows, calls, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = shown.map((i) => calls[i]).filter((c) => c && !replacedIn(replaced, c)); // can still be chosen
  const allOn = open.length > 0 && open.every((c) => chosen.has(callKey(c)));

  const toggle = (call) => setChosen((m) => {
    const next = new Map(m);
    if (next.has(callKey(call))) next.delete(callKey(call));
    else next.set(callKey(call), call);
    return next;
  });
  const toggleAll = () => setChosen((m) => {
    const next = new Map(m);
    for (const c of open) {
      if (allOn) next.delete(callKey(c));
      else next.set(callKey(c), c);
    }
    return next;
  });
  const replace = async (e) => {
    e.preventDefault();
    const asked = chosen.size;
    setSending({ status: 'sending', message: '' });
    try {
      const n = await pick.onReplace([...chosen.values()], reason.trim());
      setChosen(new Map());
      setReason('');
      const already = asked - n;
      setSending({ status: 'done', message: `${plural(n, 'call')} replaced.${already ? ` ${already} already replaced.` : ''}` });
    } catch (err) {
      setSending({ status: 'error', message: err.message });
    }
  };

  return (
    <div className="p-viewer" role="dialog" aria-modal="true" aria-label={report.title}>
      <button type="button" className="p-drawer__scrim" aria-label="Close" onClick={onClose} />
      <section className={`p-viewer__panel${pick ? ' is-picking' : ''}`}>
        <header className="p-viewer__head">
          <div>
            <p className="p-drawer__eyebrow">{dayLabel(report.period_from)}{report.period_to !== report.period_from && ` to ${dayLabel(report.period_to)}`}</p>
            <h2>{report.title}</h2>
            {report.note && <p className="p-viewer__note">{report.note}</p>}
            {!pick && done > 0 && <p className="p-viewer__note">{plural(done, 'call')} replaced, not charged.</p>}
          </div>
          <div className="p-viewer__tools">
            <button type="button" className="btn btn--light btn--sm" onClick={() => downloadReport(report).catch((e) => setError(e.message))}><Icon name="download" />Download</button>
            <button type="button" className="p-iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
          </div>
        </header>
        {book && book.length > 1 && (
          <div className="p-ranges p-viewer__tabs" role="tablist">
            {book.map((s, i) => <button key={s.name} type="button" role="tab" aria-selected={i === sheet} className={i === sheet ? 'is-on' : ''} onClick={() => setSheet(i)}>{s.name}</button>)}
          </div>
        )}
        {error && <p className="p-error" role="alert"><Icon name="alert" />{error}</p>}
        {!book && !error && <div className="p-rows is-skeleton" />}
        {pick && book && rows.length > 0 && (
          <div className="p-viewer__find">
            <label className="p-search p-viewer__search">
              <span className="sr-only">Find a call</span>
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search caller or time" autoComplete="off" />
            </label>
            <p className="p-viewer__count">
              {needle ? `${plural(shown.length, 'call')} shown of ${calls.filter(Boolean).length}` : plural(calls.filter(Boolean).length, 'call')}
              {done > 0 && ` · ${done} already replaced`}
            </p>
          </div>
        )}
        {book && (
          rows.length ? (
            <div className="p-tablewrap p-viewer__sheet">
              <table className="p-table p-table--sheet">
                <thead>
                  <tr>
                    {marks && (
                      <th scope="col" className="p-viewer__mark">
                        {pick ? <input type="checkbox" checked={allOn} disabled={!open.length} onChange={toggleAll} aria-label={allOn ? 'Untick the calls shown' : 'Tick every call shown'} title={allOn ? 'Untick the calls shown' : 'Tick every call shown'} /> : ''}
                      </th>
                    )}
                    {Array.from({ length: width }, (_, i) => <th key={i} scope="col">{head?.[i] ?? ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, MAX_ROWS).map((i) => {
                    const r = body[i];
                    const call = calls[i];
                    const key = call && callKey(call);
                    const isReplaced = Boolean(call) && replacedIn(replaced, call);
                    const choosable = pick && call && !isReplaced;
                    return (
                      <tr key={i} className={isReplaced ? 'is-replaced' : choosable && chosen.has(key) ? 'is-picked' : ''} onClick={choosable ? () => toggle(call) : undefined}>
                        {marks && (
                          <td className="p-viewer__mark">
                            {isReplaced ? <span className="p-pill is-ok">Replaced</span> : choosable && (
                              <input type="checkbox" checked={chosen.has(key)} onChange={() => toggle(call)} onClick={(e) => e.stopPropagation()} aria-label={`Replace the call from ${call.caller || 'this caller'} at ${call.called_at}`} />
                            )}
                          </td>
                        )}
                        {Array.from({ length: width }, (_, k) => <td key={k}>{r[k] ?? ''}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {needle && !shown.length && <p className="p-empty">No call matches "{find.trim()}".</p>}
              {shown.length > MAX_ROWS && <p className="p-empty">Showing the first {MAX_ROWS.toLocaleString('en-US')} of {shown.length.toLocaleString('en-US')} rows. {pick ? 'Search to find a call further down.' : 'Download the file to see them all.'}</p>}
            </div>
          ) : <p className="p-empty">This sheet is empty.</p>
        )}
        {pick && book && (
          <form className="p-form p-viewer__pick" onSubmit={replace}>
            {chosen.size > 0 && (
              <div className="p-viewer__chosen">
                <span className="p-viewer__chosen-head">
                  <b>{plural(chosen.size, 'call')} ticked</b>
                  <button type="button" className="p-linkbtn" onClick={() => setChosen(new Map())}>Untick All</button>
                </span>
                <ul className="p-chips p-viewer__chips">
                  {[...chosen.values()].map((c) => (
                    <li key={callKey(c)} className="p-chip">
                      {[callTime(c), c.caller].filter(Boolean).join(' · ')}
                      <button type="button" onClick={() => toggle(c)} aria-label={`Untick the call at ${c.called_at}`}><Icon name="close" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="p-viewer__send">
              <label><span className="sr-only">Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason (optional)" /></label>
              <button type="submit" className="btn btn--light btn--sm" disabled={!chosen.size || sending.status === 'sending'}>
                {sending.status === 'sending' ? 'Replacing…' : chosen.size ? `Replace ${plural(chosen.size, 'Call')}` : 'Replace'}
              </button>
            </div>
            {sending.message && <p className={sending.status === 'done' ? 'p-ok' : 'access-card__error'} role={sending.status === 'done' ? 'status' : 'alert'}>{sending.status === 'done' && <Icon name="check" />}{sending.message}</p>}
          </form>
        )}
      </section>
    </div>
  );
}
