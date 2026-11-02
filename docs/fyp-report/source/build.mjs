// Builds the FYP report .docx from content.mjs.
// Usage: node build.mjs out.docx [pages.json]
// pages.json maps TOC / caption keys to printed page numbers (from a previous PDF pass).
import fs from 'node:fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, ImageRun, Header, Footer, PageNumber, NumberFormat, LevelFormat, PositionalTab,
  PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader, VerticalAlign, TableLayoutType, TableOfContents, StyleLevel,
} from 'docx';
import { meta, abstract, keywords, acknowledgement, abbreviations, body, references, apiRoutes, userManual, install } from './content.mjs';

const [, , OUT = 'report.docx', PAGES] = process.argv;
const pages = PAGES && fs.existsSync(PAGES) ? JSON.parse(fs.readFileSync(PAGES, 'utf8')) : {};
const pg = (key) => pages[key] ?? '00';

const FONT = 'Times New Roman', MONO = 'Courier New';
const TEXT_W = 8666; // A4 (11906) minus 1800 left and 1440 right margins, in DXA
const HEAD_FILL = 'DCE6F0', BORDER = '7F8C9A';

// ---------- inline markup ----------
function runs(str, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(new TextRun({ text: str.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else if (tok.startsWith('`')) out.push(new TextRun({ text: tok.slice(1, -1), font: MONO, size: (base.size || 24) - 3, ...base, ...{ font: MONO } }));
    else out.push(new TextRun({ text: tok.slice(1, -1), italics: true, ...base }));
    last = m.index + tok.length;
  }
  if (last < str.length) out.push(new TextRun({ text: str.slice(last), ...base }));
  return out;
}

const P = (text, o = {}) => new Paragraph({
  alignment: o.align ?? AlignmentType.JUSTIFIED,
  spacing: { line: o.line ?? 360, after: o.after ?? 120, before: o.before ?? 0 },
  indent: o.indent, keepNext: o.keepNext, pageBreakBefore: o.pageBreakBefore,
  children: typeof text === 'string' ? runs(text, o.run) : text,
});
const blank = (n = 1) => Array.from({ length: n }, () => new Paragraph({ children: [], spacing: { after: 0 } }));

// ---------- numbering (each list gets its own instance so ordered lists restart) ----------
let listInstance = 0;
const numbering = {
  config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ],
};
const list = (items, ordered) => {
  const instance = ++listInstance;
  return items.map((it) => new Paragraph({
    numbering: { reference: ordered ? 'numbers' : 'bullets', level: 0, instance },
    alignment: AlignmentType.JUSTIFIED, spacing: { line: 336, after: 80 }, children: runs(it),
  }));
};

// ---------- tables ----------
const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, left: { style: BorderStyle.SINGLE, size: 4, color: BORDER }, right: { style: BorderStyle.SINGLE, size: 4, color: BORDER } };
const cell = (content, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA }, borders: cellBorders, verticalAlign: VerticalAlign.CENTER,
  shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  margins: { top: 50, bottom: 50, left: 100, right: 100 },
  children: (Array.isArray(content) ? content : [content]).map((t) => new Paragraph({
    alignment: o.align ?? AlignmentType.LEFT, spacing: { line: 260, after: 20 },
    children: runs(String(t), { size: 20, bold: o.bold || undefined }),
  })),
});
const table = (head, rows, widths) => new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
  rows: [
    new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], { fill: HEAD_FILL, bold: true })) }),
    ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i])) })),
  ],
});

// ---------- figures ----------
const pngSize = (file) => { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const image = (file, inches) => {
  const { w, h } = pngSize(file);
  const width = Math.round(inches * 96), height = Math.round((width * h) / w);
  return new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
    children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width, height } })] });
};
const caption = (label, text) => new Paragraph({ style: label.startsWith('Table') ? 'TableCaption' : 'FigureCaption', alignment: AlignmentType.CENTER, spacing: { before: 60, after: 240 }, keepNext: label.startsWith('Table'),
  children: [new TextRun({ text: `${label}: `, bold: true, size: 22 }), ...runs(text, { size: 22 })] });

// ---------- code ----------
const codeBorder = { style: BorderStyle.SINGLE, size: 4, color: 'B8C2CC', space: 4 };
const code = (lines) => lines.map((l, i) => new Paragraph({
  shading: { fill: 'F4F6F8', type: ShadingType.CLEAR, color: 'auto' },
  border: { top: codeBorder, bottom: codeBorder, left: codeBorder, right: codeBorder },
  spacing: { line: 240, before: i === 0 ? 120 : 0, after: i === lines.length - 1 ? 200 : 0 }, indent: { left: 120, right: 120 },
  keepLines: true, keepNext: i < lines.length - 1,
  children: [new TextRun({ text: l || ' ', font: MONO, size: 17 })],
}));

// ---------- headings ----------
// The first heading of a section already starts a new page; a page break there would add a blank page.
let firstInSection = false;
const breakBefore = () => { const brk = !firstInSection; firstInSection = false; return brk; };
const h1 = (label, title, front = false) => new Paragraph({
  heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: breakBefore(), spacing: { before: 0, after: 480 },
  children: front ? [new TextRun({ text: title.toUpperCase() })] : [new TextRun({ text: label }), new TextRun({ text: title.toUpperCase(), break: 1 })],
});
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 360, after: 160 }, children: [new TextRun(text)] });
const h3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 240, after: 120 }, children: [new TextRun(text)] });

// ---------- walk the body, numbering chapters, sections, figures, tables ----------
const toc = [], lof = [], lot = [];
function render(blocks, chapterLabel) {
  const out = [];
  let ch = 0, sec = 0, sub = 0, fig = 0, tab = 0, prefix = '';
  for (const b of blocks) {
    switch (b.t) {
      case 'h1': {
        if (b.appendix) { prefix = b.appendix; out.push(h1('', `Appendix ${b.appendix}: ${b.title}`, true)); toc.push({ lvl: 0, text: `Appendix ${b.appendix}: ${b.title}`, key: `h1:APPENDIX ${b.appendix}` }); }
        else { ch += 1; prefix = String(ch); out.push(h1(`CHAPTER ${ch}`, b.title)); toc.push({ lvl: 0, text: `Chapter ${ch}: ${b.title}`, key: `h1:CHAPTER ${ch}` }); }
        sec = sub = fig = tab = 0; break;
      }
      case 'h2': { sec += 1; sub = 0; const t = `${prefix}.${sec} ${b.text}`; out.push(h2(t)); toc.push({ lvl: 1, text: t, key: `h2:${t}` }); break; }
      case 'h3': { sub += 1; out.push(h3(`${prefix}.${sec}.${sub} ${b.text}`)); break; }
      case 'p': out.push(P(b.text)); break;
      case 'ul': out.push(...list(b.items, false)); break;
      case 'ol': out.push(...list(b.items, true)); break;
      case 'eq': out.push(P([new TextRun({ text: b.text, italics: true, font: 'Cambria Math' })], { align: AlignmentType.CENTER, before: 60, after: 180 })); break;
      case 'code': out.push(...code(b.lines)); break;
      case 'fig': { fig += 1; const l = `Figure ${prefix}.${fig}`; out.push(image(b.file, b.w), caption(l, b.caption)); lof.push({ text: `${l}: ${b.caption}`, key: `cap:${l}:` }); break; }
      case 'table': { tab += 1; const l = `Table ${prefix}.${tab}`; out.push(caption(l, b.caption), table(b.head, b.rows, b.widths), P('', { after: 120 })); lot.push({ text: `${l}: ${b.caption}`, key: `cap:${l}:` }); break; }
      case 'kv': {
        tab += 1; const l = `Table ${prefix}.${tab}`;
        const rows = b.rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, 2000, { fill: HEAD_FILL, bold: true }), cell(v.split(/(?= \d+[a-z]?\. )/).map((s) => s.trim()), 6666)] }));
        out.push(caption(l, b.caption), new Table({ width: { size: 8666, type: WidthType.DXA }, columnWidths: [2000, 6666], layout: TableLayoutType.FIXED, rows }), P('', { after: 120 }));
        lot.push({ text: `${l}: ${b.caption}`, key: `cap:${l}:` }); break;
      }
      default: throw new Error(`unknown block ${b.t}`);
    }
  }
  return out;
}

// Appendices and references are appended to the body as extra blocks.
const backMatter = [
  { t: 'h1', appendix: 'A', title: 'API Endpoint Reference' },
  { t: 'p', text: 'All endpoints are prefixed with `/api/v1`. Every endpoint except registration, sign-in, token refresh, Google sign-in, password reset and the health check requires a valid access token; group endpoints additionally require active membership, and admin endpoints the admin role.' },
  { t: 'table', caption: 'REST API endpoints', widths: [1350, 950, 3700, 2666], head: ['Resource', 'Method', 'Path', 'Purpose'], rows: apiRoutes.map(([r, m, p, d]) => [r, m, `\`${p}\``, d]) },
  { t: 'h1', appendix: 'B', title: 'User Manual' },
  { t: 'p', text: 'This appendix explains how to perform the main tasks in the application.' },
  { t: 'table', caption: 'Step-by-step guide to the main tasks', widths: [2200, 6466], head: ['Task', 'Steps'], rows: userManual },
  { t: 'h1', appendix: 'C', title: 'Installation Guide' },
  { t: 'p', text: 'The following commands install and run the system locally. Node.js 20 or later and a MongoDB instance (local or Atlas) are required.' },
  { t: 'code', lines: install },
  { t: 'p', text: 'Required environment variables on the server are `MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `CLIENT_URL`. Optional variables enable Google sign-in (`GOOGLE_CLIENT_ID`), the vision model (`ANTHROPIC_API_KEY`), Cloudinary (`CLOUDINARY_*`) and email (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN` for the Gmail API, or `SMTP_*`); without them the system falls back to Tesseract.js, inline images and console-printed email links, so its core features run without these services. `gmail:token` needs `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` set and prints the refresh token; `prices:sync` reads the online stores, so it needs an internet connection.' },
];

firstInSection = true;
const mainChildren = render([...body]);
// references between chapters and appendices
const refBlock = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { after: 480 }, children: [new TextRun('REFERENCES')] }),
  ...references.map((r, i) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 300, after: 120 }, indent: { left: 567, hanging: 567 }, children: [new TextRun({ text: `[${i + 1}]\t` }), ...runs(r)], tabStops: [{ type: 'left', position: 567 }] })),
];
toc.push({ lvl: 0, text: 'References', key: 'h1:REFERENCES' });
const appendixChildren = render(backMatter);

// ---------- front matter ----------
const centered = (text, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 80, before: o.before ?? 0, line: 276 }, children: runs(text, o.run || {}) });
const frontH = (title) => { toc.unshift(); return h1('', title, true); };

const titlePage = [
  ...blank(2),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new ImageRun({ type: 'png', data: fs.readFileSync('logo_white.png'), transformation: { width: 170, height: Math.round(170 * 684 / 567) } })] }),
  centered(meta.college.toUpperCase(), { run: { bold: true, size: 30 }, after: 60 }),
  centered(meta.campus, { run: { size: 24 }, after: 1000 }),
  centered('FINAL YEAR PROJECT REPORT', { run: { bold: true, size: 26, color: '444444' }, after: 480 }),
  centered(meta.title, { run: { bold: true, size: 48, color: '0F5132' }, after: 160 }),
  centered(meta.subtitle, { run: { italics: true, size: 26 }, after: 1200 }),
  centered('Submitted by', { run: { size: 22, color: '555555' }, after: 40 }),
  ...meta.members.map((m, i) => centered(`${m.name}  (${m.roll})`, { run: { bold: true, size: 26 }, after: i === meta.members.length - 1 ? 480 : 40 })),
  centered('Supervised by', { run: { size: 22, color: '555555' }, after: 40 }),
  centered(meta.supervisor, { run: { bold: true, size: 26 }, after: 900 }),
  centered(`A report submitted in partial fulfilment of the requirements for the award of the ${meta.degree}`, { run: { size: 22 }, after: 240 }),
  centered(meta.department, { run: { bold: true, size: 24 }, after: 40 }),
  centered(`${meta.college}, ${meta.campus}`, { run: { size: 22 }, after: 40 }),
  centered(`Session ${meta.session}  ·  ${meta.date}`, { run: { size: 22 }, after: 0 }),
];

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const sigTable = (people) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [4333, 4333], layout: TableLayoutType.FIXED,
  borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
  rows: people.reduce((rows, _, i) => (i % 2 ? rows : [...rows, people.slice(i, i + 2)]), []).map((pair) => new TableRow({
    children: [0, 1].map((k) => new TableCell({
      width: { size: 4333, type: WidthType.DXA }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
      margins: { top: 600, bottom: 200, left: 120, right: 240 },
      children: pair[k] ? [
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: '______________________________' })] }),
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: pair[k][0], bold: true })] }),
        new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: pair[k][1], size: 22 })] }),
      ] : [new Paragraph('')],
    })),
  })),
});

const tocLine = (text, page, lvl = 0) => new Paragraph({
  spacing: { after: lvl ? 40 : 100, before: lvl ? 0 : 80, line: 276 }, indent: { left: lvl * 440, right: 600 },
  children: [new TextRun({ text, bold: lvl === 0 }), new TextRun({ children: [new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: PositionalTabRelativeTo.MARGIN, leader: PositionalTabLeader.DOT }), String(page)], bold: lvl === 0 })],
});

const fieldTitle = (t) => new Paragraph({ style: 'FrontTitle', alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { after: 480 }, children: [new TextRun(t.toUpperCase())] });
const frontToc = ['Declaration', 'Certificate of Approval', 'Acknowledgement', 'Abstract', 'List of Figures', 'List of Tables', 'List of Abbreviations']
  .map((t) => ({ lvl: 0, text: t, key: `h1:${t.toUpperCase()}` }));

firstInSection = true;
const frontMatter = [
  h1('', 'Declaration', true),
  P(`We, ${meta.namesWithRolls}, hereby declare that this project report titled "*${meta.title}: ${meta.subtitle}*" is our own work and has not been submitted, in whole or in part, for any other degree or qualification at this or any other institution. All sources of information used in this report have been duly acknowledged and referenced.`),
  ...blank(3),
  sigTable(meta.members.map((m) => [m.name, `Roll No: ${m.roll}`])),
  P(`Date: ____________________`, { before: 240 }),

  h1('', 'Certificate of Approval', true),
  P(`It is certified that the project report titled "*${meta.title}: ${meta.subtitle}*" submitted by ${meta.namesWithRolls} has been examined and found satisfactory in partial fulfilment of the requirements for the award of the ${meta.degree} at the ${meta.department}, ${meta.college}, ${meta.campus}.`),
  ...blank(1),
  sigTable([[meta.supervisor, 'Project Supervisor'], ['[Internal Examiner]', 'Internal Examiner'], ['[External Examiner]', 'External Examiner'], ['[Head of Department]', meta.department]]),

  h1('', 'Acknowledgement', true),
  ...acknowledgement.map((t) => P(t)),
  ...blank(1),
  ...meta.members.map((m) => P(`**${m.name}**  (${m.roll})`, { align: AlignmentType.RIGHT, after: 0 })),

  h1('', 'Abstract', true),
  ...abstract.map((t) => P(t)),
  P(`**Keywords:** ${keywords}`, { before: 120 }),

  fieldTitle('Table of Contents'),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
  fieldTitle('List of Figures'),
  new TableOfContents('List of Figures', { hyperlink: true, stylesWithLevels: [new StyleLevel('FigureCaption', 1)] }),
  fieldTitle('List of Tables'),
  new TableOfContents('List of Tables', { hyperlink: true, stylesWithLevels: [new StyleLevel('TableCaption', 1)] }),

  h1('', 'List of Abbreviations', true),
  table(['Abbreviation', 'Meaning'], abbreviations, [2400, 6266]),
];

// ---------- document ----------
const page = (fmt) => ({
  size: { width: 11906, height: 16838 },
  margin: { top: 1440, right: 1440, bottom: 1300, left: 1800, header: 640, footer: 600 },
  pageNumbers: fmt ? { start: 1, formatType: fmt } : undefined,
});
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 22 })] })] });
const header = new Header({ children: [new Paragraph({
  alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 4 } },
  children: [new TextRun({ text: `${meta.title} — Final Year Project Report`, italics: true, size: 18, color: '555555' })],
})] });

const doc = new Document({
  creator: meta.author, title: `${meta.title} — Final Year Project Report`, description: meta.subtitle,
  styles: {
    default: { document: { run: { font: FONT, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, font: FONT, color: '000000' }, paragraph: { spacing: { after: 480 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: FONT, color: '000000' }, paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 1 } },
      { id: 'FrontTitle', name: 'Front Title', basedOn: 'Normal', next: 'Normal', run: { size: 32, bold: true, font: FONT } },
      { id: 'FigureCaption', name: 'Figure Caption', basedOn: 'Normal', next: 'Normal', run: { size: 22, font: FONT } },
      { id: 'TableCaption', name: 'Table Caption', basedOn: 'Normal', next: 'Normal', run: { size: 22, font: FONT } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, italics: true, font: FONT, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering,
  features: { updateFields: true },
  sections: [
    { properties: { page: page() }, children: titlePage },
    { properties: { page: page(NumberFormat.LOWER_ROMAN) }, footers: { default: footer }, children: frontMatter },
    { properties: { page: page(NumberFormat.DECIMAL) }, headers: { default: header }, footers: { default: footer }, children: [...mainChildren, ...refBlock, ...appendixChildren] },
  ],
});

fs.writeFileSync(OUT, await Packer.toBuffer(doc));
fs.writeFileSync('keys.json', JSON.stringify({ toc: [...frontToc, ...toc], lof, lot }, null, 1));
console.log('wrote', OUT, 'toc', toc.length, 'figs', lof.length, 'tables', lot.length);
