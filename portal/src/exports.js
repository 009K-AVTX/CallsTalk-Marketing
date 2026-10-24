// Downloads from the admin pages: CSV files and PDF reports. Made in the browser from the figures already on
// the page, as the CRM does; the PDF library loads only when a PDF is asked for.

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A cell as CSV. Text that a spreadsheet would run as a formula (=, +, -, @) is kept as text; numbers stay numbers.
function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, head, rows) {
  const text = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  save(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }), filename); // the BOM tells Excel it is UTF-8
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const INK = [24, 20, 30];
const MUTED = [112, 104, 122];
const PLUM = [44, 28, 62]; // table heads: the portal's surface, darkened for paper
const LILAC = [236, 228, 247];
const ROW = [248, 246, 251];
const RULE = [226, 222, 232];
const MARGIN = 40;

// The PDF's built-in fonts only have Western European letters: swap the few typographic ones we use.
const plain = (v) => String(v ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...')
  .replace(/[^\x00-\xFF]/g, '?'); // eslint-disable-line no-control-regex

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Columns per day for the PDF: grouped (side by side) or stacked. series: [{ label, color: '#rrggbb', values }]
function drawColumns(doc, { x, y, w, h }, labels, series, { stacked = false, format = (v) => String(v) } = {}) {
  const totals = labels.map((_, k) => (stacked ? series.reduce((s, ser) => s + (ser.values[k] || 0), 0) : Math.max(...series.map((s) => s.values[k] || 0))));
  const max = Math.max(1, ...totals);
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const whole = series.every((s) => s.values.every(Number.isInteger));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).filter((s) => !whole || Number.isInteger(s)).find((s) => s >= raw) ?? Math.ceil(raw);
  const top = Math.ceil(max / step) * step;
  const left = x + 46;
  const plotW = w - 46;
  const plotH = h - 16;
  const yOf = (v) => y + plotH - (v / top) * plotH;

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  for (let v = 0; v <= top + step / 2; v += step) {
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(left, yOf(v), left + plotW, yOf(v));
    doc.text(plain(format(v)), left - 6, yOf(v) + 2.5, { align: 'right' });
  }
  const band = plotW / labels.length;
  const groupW = Math.min(stacked ? 14 : 22, band * 0.75);
  const every = Math.max(1, Math.ceil(labels.length / Math.floor(plotW / 48)));
  labels.forEach((d, k) => {
    const cx = left + band * k + band / 2;
    let base = 0;
    series.forEach((s, j) => {
      const v = s.values[k] || 0;
      if (v <= 0) return;
      doc.setFillColor(...hex(s.color));
      if (stacked) {
        doc.rect(cx - groupW / 2, yOf(base + v), groupW, yOf(base) - yOf(base + v) - (base ? 0.8 : 0), 'F');
        base += v;
      } else {
        const bw = groupW / series.length;
        doc.rect(cx - groupW / 2 + j * bw, yOf(v), bw - 0.8, yOf(0) - yOf(v), 'F');
      }
    });
    if ((labels.length - 1 - k) % every === 0) {
      const [yy, m, dd] = d.split('-').map(Number);
      doc.text(new Date(yy, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cx, y + h - 3, { align: 'center' });
    }
  });
  // Legend, under the chart
  let lx = left;
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  for (const s of series) {
    doc.setFillColor(...hex(s.color));
    doc.rect(lx, y + h + 7, 8, 8, 'F');
    doc.text(plain(s.label), lx + 12, y + h + 14);
    lx += doc.getTextWidth(plain(s.label)) + 30;
  }
  return y + h + 24;
}

/**
 * report: {
 *   filename, title, subtitle,
 *   figures: [[label, value]],                          a row of boxed figures under the title
 *   chart: { title, labels, series, stacked, format },  optional, drawn as columns
 *   tables: [{ title, head, body, foot, right: [column indexes aligned right] }],
 * }
 */
export async function downloadPdf(report) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - MARGIN * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...PLUM);
  doc.text(plain(report.title), MARGIN, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  if (report.subtitle) doc.text(plain(report.subtitle), MARGIN, 64);
  doc.text(plain(`Generated ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`), pageW - MARGIN, 48, { align: 'right' });
  let y = 82;

  if (report.figures?.length) {
    const gap = 8;
    const boxW = (width - gap * (report.figures.length - 1)) / report.figures.length;
    report.figures.forEach(([label, value], k) => {
      const bx = MARGIN + k * (boxW + gap);
      doc.setFillColor(...ROW);
      doc.setDrawColor(...RULE);
      doc.roundedRect(bx, y, boxW, 46, 4, 4, 'FD');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(plain(label).toUpperCase(), bx + 10, y + 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...INK);
      doc.text(plain(value), bx + 10, y + 35);
      doc.setFont('helvetica', 'normal');
    });
    y += 64;
  }

  if (report.chart && report.chart.labels.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(plain(report.chart.title), MARGIN, y + 4);
    doc.setFont('helvetica', 'normal');
    y = drawColumns(doc, { x: MARGIN, y: y + 14, w: width, h: 150 }, report.chart.labels, report.chart.series, report.chart);
  }

  for (const t of report.tables || []) {
    if (y > pageH - 120) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(plain(t.title), MARGIN, y + 10);
    doc.setFont('helvetica', 'normal');
    const right = Object.fromEntries((t.right || []).map((i) => [i, { halign: 'right' }]));
    autoTable(doc, {
      startY: y + 18,
      margin: { left: MARGIN, right: MARGIN, bottom: 40 },
      head: [t.head.map(plain)],
      body: t.body.length ? t.body.map((r) => r.map(plain)) : [[{ content: plain(t.empty || 'Nothing in this period.'), colSpan: t.head.length }]],
      foot: t.foot ? [t.foot.map(plain)] : undefined,
      showFoot: 'lastPage',
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8, textColor: INK, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, lineColor: RULE, lineWidth: { bottom: 0.5 } },
      headStyles: { fillColor: PLUM, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      footStyles: { fillColor: LILAC, textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ROW },
      columnStyles: { ...right, ...t.columns },
      didParseCell: (data) => {
        if (data.section !== 'body' && right[data.column.index]) data.cell.styles.halign = 'right';
      },
    });
    y = doc.lastAutoTable.finalY + 26;
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('CallsTalk', MARGIN, pageH - 20);
    doc.text(`Page ${p} of ${pages}`, pageW - MARGIN, pageH - 20, { align: 'right' });
  }
  doc.save(report.filename);
}
