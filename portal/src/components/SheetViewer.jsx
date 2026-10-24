import { useEffect, useState } from 'react';
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

// The report opened in the page: one tab per sheet, values as the sheet formats them.
export default function SheetViewer({ report, onClose }) {
  const [book, setBook] = useState(null);
  const [sheet, setSheet] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [XLSX, data] = await Promise.all([import('xlsx'), fetchFile(report)]); // SheetJS loads only when a report is opened
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheets = wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: '' }) }));
        if (live) setBook(sheets);
      } catch (err) {
        if (live) setError(err.message || 'This file could not be opened.');
      }
    })();
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => { live = false; document.removeEventListener('keydown', esc); };
  }, [report, onClose]);

  const rows = book?.[sheet]?.rows || [];
  const width = Math.max(0, ...rows.slice(0, MAX_ROWS).map((r) => r.length));
  const [head, ...body] = rows;

  return (
    <div className="p-viewer" role="dialog" aria-modal="true" aria-label={report.title}>
      <button type="button" className="p-drawer__scrim" aria-label="Close" onClick={onClose} />
      <section className="p-viewer__panel">
        <header className="p-viewer__head">
          <div>
            <p className="p-drawer__eyebrow">{dayLabel(report.period_from)}{report.period_to !== report.period_from && ` to ${dayLabel(report.period_to)}`}</p>
            <h2>{report.title}</h2>
            {report.note && <p className="p-viewer__note">{report.note}</p>}
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
                <thead><tr>{Array.from({ length: width }, (_, i) => <th key={i} scope="col">{head?.[i] ?? ''}</th>)}</tr></thead>
                <tbody>
                  {body.slice(0, MAX_ROWS).map((r, i) => (
                    <tr key={i}>{Array.from({ length: width }, (_, k) => <td key={k}>{r[k] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {body.length > MAX_ROWS && <p className="p-empty">Showing the first {MAX_ROWS.toLocaleString('en-US')} of {body.length.toLocaleString('en-US')} rows. Download the file to see them all.</p>}
            </div>
          ) : <p className="p-empty">This sheet is empty.</p>
        )}
      </section>
    </div>
  );
}
