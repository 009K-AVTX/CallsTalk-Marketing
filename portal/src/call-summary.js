// Call Summary reports: the day's call log, as the dialer exports it, one call a row and no header:
//   2026-10-26 15:22:51 | 5743447831 | 18779642010 | 00:19:37 | Completed - With Conversion | Caller
// (when, the caller, the number they called, how long, the outcome, who hung up). This is the report buyers view
// and download; billing reports stay with the team.

// The columns the viewer shows over a log that has no header row of its own.
export const CALL_COLUMNS = ['Date & Time', 'Caller', 'Number Called', 'Duration', 'Status', 'Hung Up By'];

const WHEN = /^(\d{4}-\d{2}-\d{2})[ T]\d{1,2}:\d{2}(:\d{2})?$/;
// As the viewer shows an Excel date and time: "10/26/26 15:22".
const WHEN_US = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),? \d{1,2}:\d{2}/;

// A cell's day ("YYYY-MM-DD") when it holds a date and time: text as exported, or an Excel date number with a time
// (a whole number is a day alone, as a billing report's Date column has).
function callDay(v, XLSX) {
  if (typeof v === 'number') {
    if (!XLSX || v < 1 || Number.isInteger(v)) return null;
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const s = String(v ?? '').trim();
  const us = WHEN_US.exec(s);
  if (us) return `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return WHEN.exec(s)?.[1] ?? null;
}

// One file -> { calls, from, to }: how many calls it lists and the days they fall on, or null when it lists none.
// A row counts as a call when its first filled cell is a date and time; a header row, totals and blank rows are not.
async function readFile(file) {
  const XLSX = await import('xlsx');
  // CSV as plain text, so "2026-10-26 15:22:51" stays as written.
  const book = XLSX.read(await file.arrayBuffer(), { raw: /\.csv$/i.test(file.name) });
  const days = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet['!ref']) continue;
    for (const row of XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false, defval: null })) {
      const first = row.find((c) => c !== null && String(c).trim() !== '');
      const day = callDay(first, XLSX);
      if (day) days.push(day);
    }
  }
  if (!days.length) return null;
  days.sort();
  return { calls: days.length, from: days[0], to: days.at(-1) };
}

// Every chosen file -> { calls, from, to, unread: [file names] } across them all, or null when none lists a call.
export async function readCallSummary(files) {
  const read = await Promise.all([...files].map((f) => readFile(f).catch(() => null)));
  const found = read.filter(Boolean);
  if (!found.length) return null;
  return {
    calls: found.reduce((t, r) => t + r.calls, 0),
    from: found.map((r) => r.from).sort()[0],
    to: found.map((r) => r.to).sort().at(-1),
    unread: [...files].filter((f, i) => !read[i]).map((f) => f.name),
  };
}

// A sheet's rows (as the viewer reads them, formatted text) with the log's column names over them when it has none,
// and without the empty columns at its right edge.
export function withCallHeader(rows) {
  const used = Math.max(0, ...rows.map((r) => r.reduce((n, c, i) => (String(c ?? '').trim() ? i + 1 : n), 0)));
  const trimmed = rows.map((r) => r.slice(0, used));
  const first = trimmed[0]?.find((c) => String(c ?? '').trim());
  if (!first || !callDay(first)) return trimmed;
  return [CALL_COLUMNS.slice(0, used).concat(Array(Math.max(0, used - CALL_COLUMNS.length)).fill('')), ...trimmed];
}
