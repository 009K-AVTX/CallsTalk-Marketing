import { useEffect, useMemo, useState } from 'react';
import { callKey, callOf, withCallHeader } from '../call-summary.js';
import { fetchFile } from '../reports.js';
import { dayLabel } from '../format.js';
import Icon from './Icons.jsx';

const MAX_ROWS = 1000;

export async function downloadReport(report) {
  const data = await fetchFile(report);
  const url = URL.createObjectURL(new Blob([data]));
  const a = Object.assign(document.createElement('a'), { href: url, download: report.filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The report opened in the page: one tab per sheet, values as the sheet formats them. In a Call Summary the calls
// replaced at the buyer's request are marked. `pick` (admins): { onReplace(calls, reason) -> how many were replaced }
// puts a box by each call, to choose the ones the buyer asked to have replaced and take them off their bill.
export default function SheetViewer({ report, onClose, pick }) {
  const [book, setBook] = useState(null);
  const [sheet, setSheet] = useState(0);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState(() => new Map()); // callKey -> call
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState({ status: 'idle', message: '' });

  // Loaded again only for another report: after a replacement the same report comes back with its new `replaced`.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [XLSX, data] = await Promise.all([import('xlsx'), fetchFile(report)]); // SheetJS loads only when a report is opened
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheets = wb.SheetNames.map((name) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: '' });
          return { name, rows: report.kind === 'calls' ? withCallHeader(rows) : rows }; // a call log has no header row
        });
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
  const calls = useMemo(() => (report.kind === 'calls' ? body.map(callOf) : []), [report.kind, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = calls.filter((c) => c && replaced.has(callKey(c))).length;
  const marks = report.kind === 'calls' && (Boolean(pick) || done > 0);

  const toggle = (call) => setChosen((m) => {
    const next = new Map(m);
    if (next.has(callKey(call))) next.delete(callKey(call));
    else next.set(callKey(call), call);
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
      setSending({ status: 'done', message: `${n} call${n === 1 ? '' : 's'} replaced and taken off the bill.${already ? ` ${already} ${already === 1 ? 'was' : 'were'} already replaced.` : ''}` });
    } catch (err) {
      setSending({ status: 'error', message: err.message });
    }
  };

  return (
    <div className="p-viewer" role="dialog" aria-modal="true" aria-label={report.title}>
      <button type="button" className="p-drawer__scrim" aria-label="Close" onClick={onClose} />
      <section className="p-viewer__panel">
        <header className="p-viewer__head">
          <div>
            <p className="p-drawer__eyebrow">{dayLabel(report.period_from)}{report.period_to !== report.period_from && ` to ${dayLabel(report.period_to)}`}</p>
            <h2>{report.title}</h2>
            {report.note && <p className="p-viewer__note">{report.note}</p>}
            {pick ? <p className="p-viewer__note">Tick the calls the buyer asked to have replaced. Each one comes off its day's bill.</p>
              : done > 0 && <p className="p-viewer__note">{done} call{done === 1 ? ' was' : 's were'} replaced at your request and {done === 1 ? 'is' : 'are'} not charged.</p>}
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
        {book && (
          rows.length ? (
            <div className="p-tablewrap p-viewer__sheet">
              <table className="p-table p-table--sheet">
                <thead>
                  <tr>
                    {marks && <th scope="col" className="p-viewer__mark">{pick ? 'Replace' : ''}</th>}
                    {Array.from({ length: width }, (_, i) => <th key={i} scope="col">{head?.[i] ?? ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {body.slice(0, MAX_ROWS).map((r, i) => {
                    const call = calls[i];
                    const key = call && callKey(call);
                    const isReplaced = key && replaced.has(key);
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
              {body.length > MAX_ROWS && <p className="p-empty">Showing the first {MAX_ROWS.toLocaleString('en-US')} of {body.length.toLocaleString('en-US')} rows. Download the file to see them all.</p>}
            </div>
          ) : <p className="p-empty">This sheet is empty.</p>
        )}
        {pick && book && (
          <form className="p-form p-viewer__pick" onSubmit={replace}>
            <label><span className="sr-only">Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason, shown to the buyer (optional)" /></label>
            <button type="submit" className="btn btn--light btn--sm" disabled={!chosen.size || sending.status === 'sending'}>
              {sending.status === 'sending' ? 'Replacing…' : chosen.size ? `Replace ${chosen.size} Call${chosen.size === 1 ? '' : 's'}` : 'Replace Calls'}
            </button>
            {sending.message && <p className={sending.status === 'done' ? 'p-ok' : 'access-card__error'} role={sending.status === 'done' ? 'status' : 'alert'}>{sending.status === 'done' && <Icon name="check" />}{sending.message}</p>}
          </form>
        )}
      </section>
    </div>
  );
}
