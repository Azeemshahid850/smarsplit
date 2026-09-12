import { Parser } from '@json2csv/plainjs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const money = (rupees) => `Rs ${Math.round(rupees || 0).toLocaleString('en-PK')}`;
const day = (dateValue) => (dateValue ? new Date(dateValue).toISOString().slice(0, 10) : '');

export function toCsv(rows, fields) {
  return new Parser({ fields }).parse(rows);
}

export async function toXlsx(rows, columns, sheetName = 'Export') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SmartSplit';
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((columnSpec) => ({ header: columnSpec.label, key: columnSpec.value, width: Math.max(14, columnSpec.label.length + 4) }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Streams a PDF into a buffer — small documents, so no temp files. */
function renderPdf(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (columnSpec) => chunks.push(columnSpec));
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
  headers.forEach((headerLabel, columnIndex) => doc.text(headerLabel, left + columnIndex * columnWidth, doc.y, { width: columnWidth, continued: columnIndex < headers.length - 1 }));
  doc.moveDown(0.4);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#cbd5e1').stroke();
  doc.moveDown(0.4);

  doc.font('Helvetica').fontSize(10);
  for (const row of rows) {
    const top = doc.y;
    row.forEach((cell, columnIndex) => doc.text(String(cell), left + columnIndex * columnWidth, top, { width: columnWidth, continued: columnIndex < row.length - 1 }));
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
    table(doc, ['Category', 'Total', 'Share'], report.topCategories.map((columnSpec) => [columnSpec.category, money(columnSpec.total), `${columnSpec.share}%`]));

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
      report.members.map((member) => [member.name, money(member.paid), money(member.consumed), money(member.paid - member.consumed)]),
    );

    doc.moveDown(1).font('Helvetica-Bold').fontSize(13).text('By category').moveDown(0.5);
    table(doc, ['Category', 'Total', 'Share'], report.byCategory.map((columnSpec) => [columnSpec.category, money(columnSpec.total), `${columnSpec.share}%`]));
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

export const flattenTransaction = (transaction) => ({
  date: day(transaction.date),
  title: transaction.title,
  type: transaction.type,
  category: transaction.category,
  paymentMethod: transaction.paymentMethod,
  amount: transaction.amount,
});

export const flattenGroupExpense = (expense, nameOf) => ({
  date: day(expense.date),
  title: expense.title,
  category: expense.category,
  splitType: expense.splitType,
  paidBy: expense.paidBy.map((payerEntry) => nameOf(payerEntry.userId)).join(', '),
  amount: expense.totalAmount,
});
