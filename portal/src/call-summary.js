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

// A toll-free number as the log shows it ("18663741511", "(866) 374-1511") -> its 11 digits, or '' when the cell is not
// a US number.
function phoneOf(c) {
  if (!/^\+?[\d\s().-]{10,18}$/.test(c)) return '';
  const digits = c.replace(/\D/g, '');
  return /^1?\d{10}$/.test(digits) ? digits.padStart(11, '1') : '';
}

// A row's call, from the row as the viewer reads it (formatted text): { date, called_at, caller, duration, call_time,
// number_called }, or null when the row is not a call. The time is the first filled cell, the caller the next one, the
// number called the first phone number after the caller and the duration the first h:mm:ss after it. `time`: the
// call's time to the second, from the cell as stored (sheetRows), which the viewer shows to the minute only.
// A call is its time to the second, caller and number called (callKey): one buyer's logs for several numbers on a day
// count each call once, even two from one caller in the same minute.
export function callOf(cells, time = '') {
  const text = cells.map((c) => String(c ?? '').trim());
  const at = text.findIndex(Boolean);
  const date = at < 0 ? null : callDay(text[at]);
  if (!date) return null;
  const rest = text.slice(at + 1);
  const by = rest.findIndex(Boolean);
  const after = rest.slice(by + 1);
  return {
    date, called_at: text[at], caller: by < 0 ? '' : rest[by], duration: after.find((c) => /^\d{1,2}:\d{2}:\d{2}$/.test(c)) || '',
    call_time: time, number_called: by < 0 ? '' : after.map(phoneOf).find(Boolean) || '',
  };
}
// A number called as shown: "18663741511" -> "1 (866) 374-1511".
export const numberLabel = (n) => (/^1\d{10}$/.test(n) ? `1 (${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7)}` : n);
export const callKey = (c) => `${c.called_at}|${c.caller}|${c.call_time || ''}|${c.number_called || ''}`;
// Whether `call` is among the replaced calls' keys (`keys`: a Set of callKey). A call replaced before calls kept their
// seconds and number called is its time to the minute and caller, and marks each call that has them.
export const isReplaced = (keys, call) => keys.has(callKey(call)) || keys.has(callKey({ called_at: call.called_at, caller: call.caller }));

const pad = (n) => String(n).padStart(2, '0');
// A call's time to the second ("2026-10-26 15:22:51"), from its cell as stored: an Excel day number, or the text as
// exported. '' when the cell has no seconds.
function exactTime(v, XLSX, date1904) {
  if (typeof v === 'number') {
    const d = v > 1 && !Number.isInteger(v) && XLSX.SSF.parse_date_code(v, { date1904 });
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)} ${pad(d.H)}:${pad(d.M)}:${pad(d.S)}` : '';
  }
  const s = String(v ?? '').trim();
  const iso = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})/.exec(s);
  if (iso) return `${iso[1]} ${pad(iso[2])}:${iso[3]}:${iso[4]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*([AaPp][Mm])?/.exec(s);
  if (!us) return '';
  const h = +us[4] % (us[7] ? 12 : 24) + (/^p/i.test(us[7] || '') ? 12 : 0);
  return `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${pad(us[1])}-${pad(us[2])} ${pad(h)}:${us[5]}:${us[6]}`;
}

// A sheet's rows as the viewer shows them (formatted text, blank rows left out) and, row for row, the time to the
// second of each one's first filled cell (exactTime). `shown`: the sheet read as the viewer reads it (cellDates);
// `stored`: the same sheet with its values as stored (Excel times as day numbers, text files as written).
function sheetRows(XLSX, shown, stored, date1904) {
  const opts = { header: 1, blankrows: true, defval: '' };
  const text = XLSX.utils.sheet_to_json(shown, { ...opts, raw: false });
  const raw = stored ? XLSX.utils.sheet_to_json(stored, { ...opts, raw: true }) : [];
  const rows = [];
  const times = [];
  text.forEach((r, i) => {
    const at = r.findIndex((c) => String(c).trim());
    if (at < 0) return;
    rows.push(r);
    times.push(exactTime(raw[i]?.[at], XLSX, date1904));
  });
  return { rows, times };
}

// A Call Summary's sheets as the viewer shows them, from the file's contents (ArrayBuffer): [{ name, rows, calls }],
// `rows` with the log's column names over them when it has none (withCallHeader) and `calls` the call in each row
// after the first (callOf; null for a row that is not a call).
export function callSheets(XLSX, data) {
  const shown = XLSX.read(data, { type: 'array', cellDates: true });
  const stored = XLSX.read(data, { type: 'array', raw: true });
  const date1904 = Boolean(stored.Workbook?.WBProps?.date1904);
  return shown.SheetNames.map((name) => {
    const { rows, times } = sheetRows(XLSX, shown.Sheets[name], stored.Sheets[name], date1904);
    const all = withCallHeader(rows);
    const added = all.length - rows.length; // 1 when the column names were put over the log
    return { name, rows: all, calls: all.slice(1).map((r, i) => callOf(r, times[i + 1 - added])) };
  });
}

// Every call in a file's contents (ArrayBuffer), read exactly as the viewer reads it (SheetViewer), so a call is the
// same in billing, in the viewer and when it is replaced.
// -> [{ date, called_at, caller, duration, call_time, number_called }]
export async function callsIn(data) {
  const XLSX = await import('xlsx');
  return callSheets(XLSX, data).flatMap((s) => s.calls).filter(Boolean);
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
