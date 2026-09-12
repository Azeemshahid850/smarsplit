import { Parser } from '@json2csv/plainjs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const money = (n) => `Rs ${Math.round(n || 0).toLocaleString('en-PK')}`;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export function toCsv(rows, fields) {
  return new Parser({ fields }).parse(rows);
}

export async function toXlsx(rows, columns, sheetName = 'Export') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SmartSplit';
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.value, width: Math.max(14, c.label.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Streams a PDF into a buffer — small documents, so no temp files. */
function renderPdf(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

function table(doc, headers, rows) {
  const left = 50;
  const width = 495;
  const columnWidth = width / headers.length;

  doc.font('Helvetica-Bold').fontSize(10);
  headers.forEach((h, i) => doc.text(h, left + i * columnWidth, doc.y, { width: columnWidth, continued: i < headers.length - 1 }));
  doc.moveDown(0.4);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.4);

  doc.font('Helvetica').fontSize(10);
  for (const row of rows) {
    const top = doc.y;
    row.forEach((cell, i) => doc.text(String(cell), left + i * columnWidth, top, { width: columnWidth, continued: i < row.length - 1 }));
    doc.moveDown(0.3);
    if (doc.y > 740) doc.addPage();
  }
}

export function personalMonthlyPdf(report, userName) {
  return renderPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(20).text('SmartSplit — Monthly report');
    doc.font('Helvetica').fontSize(11).fillColor('#475569').text(`${userName} · ${report.month}`);
    doc.fillColor('#0f172a').moveDown(1.2);

    doc.font('Helvetica-Bold').fontSize(13).text('Summary').moveDown(0.5);
    table(
      doc,
      ['Metric', 'Amount'],
      [
        ['Received', money(report.income)],
        ['Spent', money(report.spend)],
        ['Net', money(report.net)],
        ['Savings rate', `${report.savingsRate}%`],
        ['Vs last month', `${report.vsLastMonth.spend >= 0 ? '+' : '-'}${money(Math.abs(report.vsLastMonth.spend))}`],
      ],
    );

    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text('Where it went').moveDown(0.5);
    table(doc, ['Category', 'Total', 'Share'], report.topCategories.map((c) => [c.category, money(c.total), `${c.share}%`]));

    if (report.biggestExpense) {
      doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text('Biggest expense').moveDown(0.5);
      doc.font('Helvetica').fontSize(11)
        .text(`${report.biggestExpense.title} — ${money(report.biggestExpense.amount)} (${report.biggestExpense.category}, ${day(report.biggestExpense.date)})`);
    }
  });
}

export function groupReportPdf(report) {
  return renderPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(20).text('SmartSplit — Trip report');
    doc.font('Helvetica').fontSize(11).fillColor('#475569').text(`${report.title} · ${report.status.toLowerCase()}`);
    doc.fillColor('#0f172a').moveDown(1.2);

    doc.font('Helvetica-Bold').fontSize(13).text('Summary').moveDown(0.5);
    table(
      doc,
      ['Metric', 'Value'],
      [
        ['Total spent', money(report.total)],
        ['Per person', money(report.perPerson)],
        ['Members', String(report.members.length)],
        ['Payments after optimisation', `${report.settlementEfficiency.optimizedCount} (from ${report.settlementEfficiency.rawDebtCount})`],
        ['Transfers saved', String(report.settlementEfficiency.transfersSaved)],
      ],
    );

    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text('Paid vs consumed').moveDown(0.5);
    table(
      doc,
      ['Member', 'Paid', 'Consumed', 'Net'],
      report.members.map((m) => [m.name, money(m.paid), money(m.consumed), money(m.paid - m.consumed)]),
    );

    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text('By category').moveDown(0.5);
    table(doc, ['Category', 'Total', 'Share'], report.byCategory.map((c) => [c.category, money(c.total), `${c.share}%`]));
  });
}

export const TRANSACTION_COLUMNS = [
  { label: 'Date', value: 'date' },
  { label: 'Title', value: 'title' },
  { label: 'Type', value: 'type' },
  { label: 'Category', value: 'category' },
  { label: 'Payment method', value: 'paymentMethod' },
  { label: 'Amount', value: 'amount' },
];

export const GROUP_EXPENSE_COLUMNS = [
  { label: 'Date', value: 'date' },
  { label: 'Title', value: 'title' },
  { label: 'Category', value: 'category' },
  { label: 'Split', value: 'splitType' },
  { label: 'Paid by', value: 'paidBy' },
  { label: 'Amount', value: 'amount' },
];

export const flattenTransaction = (t) => ({
  date: day(t.date),
  title: t.title,
  type: t.type,
  category: t.category,
  paymentMethod: t.paymentMethod,
  amount: t.amount,
});

export const flattenGroupExpense = (e, nameOf) => ({
  date: day(e.date),
  title: e.title,
  category: e.category,
  splitType: e.splitType,
  paidBy: e.paidBy.map((p) => nameOf(p.userId)).join(', '),
  amount: e.totalAmount,
});
