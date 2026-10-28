// Call Summary reports: the day's call log, as the dialer exports it, one call a row, usually with no header:
//   2026-10-26 15:22:51 | 5743447831 | 18779642010 | 00:19:37 | Completed - With Conversion | Caller
// (when, the caller, the number they called, how long, the outcome, who hung up). Some exports have a header row and
// more columns ("Call Date | Caller Id | Destination | ... | Duration"); the time comes first either way. This is the
// report buyers view and download, and where the calls they ask to have replaced are chosen; billing reports stay
// with the team.

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

// A row's call, from the row as the viewer reads it (formatted text): { date, called_at, caller, duration }, or null
// when the row is not a call. The time is the first filled cell, the caller the next one, and the duration the
// first h:mm:ss after the caller. The time and caller are what make a call one call (a replaced call is matched by them).
export function callOf(cells) {
  const text = cells.map((c) => String(c ?? '').trim());
  const at = text.findIndex(Boolean);
  const date = at < 0 ? null : callDay(text[at]);
  if (!date) return null;
  const rest = text.slice(at + 1);
  const by = rest.findIndex(Boolean);
  return {
    date, called_at: text[at], caller: by < 0 ? '' : rest[by], duration: rest.slice(by + 1).find((c) => /^\d{1,2}:\d{2}:\d{2}$/.test(c)) || '',
  };
}
export const callKey = (c) => `${c.called_at}|${c.caller}`;

// Every call in a file's contents (ArrayBuffer), read exactly as the viewer reads it (SheetViewer), so a call is the
// same time and caller in billing, in the viewer and when it is replaced. -> [{ date, called_at, caller, duration }]
export async function callsIn(data) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  return wb.SheetNames.flatMap((name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: '' }))
    .map(callOf).filter(Boolean);
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
