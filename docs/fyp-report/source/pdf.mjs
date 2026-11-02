// Typesets the report as PDF: content.mjs → HTML → Chrome print → page numbers and headers stamped with pdf-lib.
// Two passes: the first finds where every heading and caption lands, the second prints those numbers in the TOC.
// Usage: node pdf.mjs out.pdf
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { meta, abstract, keywords, acknowledgement, abbreviations, body, references, apiRoutes, userManual, install } from './content.mjs';

const OUT = process.argv[2] || 'report.pdf';
const here = path.resolve('.');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\*([^*]+)\*/g, '<i>$1</i>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

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

function renderBody(blocks, toc, lof, lot) {
  let html = '', ch = 0, sec = 0, sub = 0, fig = 0, tab = 0, prefix = '';
  const tableHtml = (head, rows, widths) => {
    const total = widths.reduce((a, b) => a + b, 0);
    return `<table><colgroup>${widths.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%">`).join('')}</colgroup>
      <thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  for (const b of blocks) {
    switch (b.t) {
      case 'h1':
        if (b.appendix) { prefix = b.appendix; const t = `Appendix ${b.appendix}: ${b.title}`; html += `<h1 class="chapter"><span>${esc(t.toUpperCase())}</span></h1>`; toc.push({ lvl: 0, text: t, key: `h1:APPENDIX ${b.appendix}:` }); }
        else { ch += 1; prefix = String(ch); html += `<h1 class="chapter"><span class="num">CHAPTER ${ch}</span><span>${esc(b.title.toUpperCase())}</span></h1>`; toc.push({ lvl: 0, text: `Chapter ${ch}: ${b.title}`, key: `h1:CHAPTER ${ch}` }); }
        sec = sub = fig = tab = 0; break;
      case 'h2': { sec += 1; sub = 0; const t = `${prefix}.${sec} ${b.text}`; html += `<h2>${esc(t)}</h2>`; toc.push({ lvl: 1, text: t, key: `h2:${t}` }); break; }
      case 'h3': sub += 1; html += `<h3>${esc(`${prefix}.${sec}.${sub} ${b.text}`)}</h3>`; break;
      case 'p': html += `<p>${inline(b.text)}</p>`; break;
      case 'ul': html += `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`; break;
      case 'ol': html += `<ol>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`; break;
      case 'eq': html += `<p class="eq">${esc(b.text)}</p>`; break;
      case 'code': html += `<pre>${b.lines.map(esc).join('\n')}</pre>`; break;
      case 'fig': { fig += 1; const l = `Figure ${prefix}.${fig}`; html += `<figure><img src="file://${here}/${b.file}" style="width:${b.w}in"><figcaption><b>${l}:</b> ${inline(b.caption)}</figcaption></figure>`; lof.push({ text: `${l}: ${b.caption}`, key: `cap:${l}:` }); break; }
      case 'table': { tab += 1; const l = `Table ${prefix}.${tab}`; html += `<div class="tbl"><div class="cap"><b>${l}:</b> ${inline(b.caption)}</div>${tableHtml(b.head, b.rows, b.widths)}</div>`; lot.push({ text: `${l}: ${b.caption}`, key: `cap:${l}:` }); break; }
      case 'kv': {
        tab += 1; const l = `Table ${prefix}.${tab}`;
        html += `<div class="tbl kv"><div class="cap"><b>${l}:</b> ${inline(b.caption)}</div><table><colgroup><col style="width:23%"><col></colgroup><tbody>${b.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v.split(/(?= \d+[a-z]?\. )/).map((s) => `<div>${inline(s.trim())}</div>`).join('')}</td></tr>`).join('')}</tbody></table></div>`;
        lot.push({ text: `${l}: ${b.caption}`, key: `cap:${l}:` }); break;
      }
      default: throw new Error(`unknown block ${b.t}`);
    }
  }
  return html;
}

function buildHtml(pages) {
  const pg = (k) => pages[k] ?? '00';
  const toc = [], lof = [], lot = [];
  const main = renderBody(body, toc, lof, lot);
  toc.push({ lvl: 0, text: 'References', key: 'h1:REFERENCES' });
  const back = renderBody(backMatter, toc, lof, lot);
  const front = ['Declaration', 'Certificate of Approval', 'Acknowledgement', 'Abstract', 'List of Figures', 'List of Tables', 'List of Abbreviations'].map((t) => ({ lvl: 0, text: t, key: `f:${t.toUpperCase()}` }));
  const line = (e) => `<div class="toc l${e.lvl}"><span class="t">${esc(e.text)}</span><span class="dots"></span><span class="n">${pg(e.key)}</span></div>`;
  const sig = (name, role) => `<div class="sig"><div class="rule"></div><b>${esc(name)}</b><div>${esc(role)}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 25mm 25mm 22mm 32mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', 'Liberation Serif', serif; font-size: 12pt; line-height: 1.5; color: #000; margin: 0; }
    p { text-align: justify; margin: 0 0 8pt; orphans: 3; widows: 3; }
    h1 { font-size: 16pt; text-align: center; margin: 0 0 24pt; break-before: page; font-weight: bold; }
    h1.chapter span { display: block; } h1.chapter .num { margin-bottom: 2pt; }
    h1.first { break-before: auto; }
    h2 { font-size: 14pt; margin: 18pt 0 8pt; break-after: avoid; }
    h3 { font-size: 12pt; font-style: italic; margin: 12pt 0 6pt; break-after: avoid; }
    ul, ol { margin: 0 0 8pt; padding-left: 26pt; } li { margin-bottom: 4pt; text-align: justify; line-height: 1.4; }
    code { font-family: 'Courier New', 'Liberation Mono', monospace; font-size: 10pt; }
    pre { font-family: 'Courier New', 'Liberation Mono', monospace; font-size: 8.6pt; line-height: 1.3; background: #f4f6f8; border: 1px solid #b8c2cc; padding: 6pt 8pt; margin: 6pt 0 12pt; white-space: pre-wrap; break-inside: avoid; }
    .eq { text-align: center; font-style: italic; margin: 4pt 0 10pt; }
    figure { margin: 10pt 0 14pt; text-align: center; break-inside: avoid; }
    figure img { max-width: 100%; display: block; margin: 0 auto 4pt; }
    figcaption, .cap { font-size: 11pt; text-align: center; line-height: 1.3; }
    .cap { margin: 8pt 0 4pt; break-after: avoid; }
    .tbl { margin-bottom: 12pt; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; line-height: 1.3; }
    th, td { border: 1px solid #7f8c9a; padding: 3pt 5pt; text-align: left; vertical-align: middle; }
    thead th, .kv th { background: #dce6f0; }
    tr { break-inside: avoid; }
    table, pre { width: calc(100% - 2px); }
    .kv td div { margin-bottom: 2pt; }
    .title { text-align: center; height: 245mm; display: flex; flex-direction: column; align-items: center; }
    .title .logo { width: 44mm; margin: 6mm 0 8mm; }
    .title .college { font-size: 15pt; font-weight: bold; line-height: 1.25; }
    .title .label { color: #555; font-size: 11pt; }
    .title .big { font-size: 26pt; font-weight: bold; color: #0f5132; margin-top: 4mm; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 26pt 30pt; margin-top: 30pt; }
    .sig .rule { border-top: 1px solid #000; width: 62mm; margin-bottom: 4pt; padding-top: 34pt; border-top: none; border-bottom: 1px solid #000; }
    .sig div { font-size: 11pt; }
    .toc { display: flex; align-items: baseline; line-height: 1.35; margin: 0; }
    .toc.l0 { font-weight: bold; margin-top: 5pt; } .toc.l1 { padding-left: 18pt; font-size: 11.5pt; }
    .toc .dots { flex: 1; border-bottom: 1px dotted #777; margin: 0 4pt; transform: translateY(-3pt); }
    .toc .n { min-width: 18pt; text-align: right; }
    .lof .toc { font-weight: normal; font-size: 11.5pt; margin-top: 3pt; }
    .refs p { text-align: left; padding-left: 26pt; text-indent: -26pt; margin-bottom: 6pt; line-height: 1.35; }
  </style></head><body>
  <section class="title">
    <img class="logo" src="file://${here}/logo.png">
    <div class="college">${esc(meta.college.toUpperCase())}</div>
    <div>${esc(meta.campus)}</div>
    <div style="height:22mm"></div>
    <div style="font-weight:bold;color:#444;letter-spacing:.5pt">FINAL YEAR PROJECT REPORT</div>
    <div class="big">${esc(meta.title)}</div>
    <div style="font-style:italic;font-size:13pt;max-width:140mm;line-height:1.35;margin-top:3mm">${esc(meta.subtitle)}</div>
    <div style="height:22mm"></div>
    <div class="label">Submitted by</div>
    ${meta.members.map((m) => `<div style="font-size:13pt"><b>${esc(m.name)}</b> &nbsp;(${esc(m.roll)})</div>`).join('')}
    <div style="height:10mm"></div>
    <div class="label">Supervised by</div>
    <div style="font-size:13pt;font-weight:bold">${esc(meta.supervisor)}</div>
    <div style="flex:1;min-height:14mm"></div>
    <div style="font-size:11pt;max-width:140mm;line-height:1.35">A report submitted in partial fulfilment of the requirements for the award of the ${esc(meta.degree)}</div>
    <div style="height:6mm"></div>
    <div style="font-weight:bold">${esc(meta.department)}</div>
    <div style="font-size:11pt">${esc(meta.college)}, ${esc(meta.campus)}</div>
    <div style="font-size:11pt">Session ${esc(meta.session)} · ${esc(meta.date)}</div>
  </section>

  <h1>DECLARATION</h1>
  <p>We, ${namesHtml()}, hereby declare that this project report titled "<i>${esc(meta.title)}: ${esc(meta.subtitle)}</i>" is our own work and has not been submitted, in whole or in part, for any other degree or qualification at this or any other institution. All sources of information used in this report have been duly acknowledged and referenced.</p>
  <div class="sigs" style="margin-top:40pt">${meta.members.map((m) => sig(m.name, `Roll No: ${m.roll}`)).join('')}</div>
  <p style="margin-top:24pt">Date: ____________________</p>

  <h1>CERTIFICATE OF APPROVAL</h1>
  <p>It is certified that the project report titled "<i>${esc(meta.title)}: ${esc(meta.subtitle)}</i>" submitted by ${namesHtml()} has been examined and found satisfactory in partial fulfilment of the requirements for the award of the ${esc(meta.degree)} at the ${esc(meta.department)}, ${esc(meta.college)}, ${esc(meta.campus)}.</p>
  <div class="sigs">${sig(meta.supervisor, 'Project Supervisor')}${sig('[Internal Examiner]', 'Internal Examiner')}${sig('[External Examiner]', 'External Examiner')}${sig('[Head of Department]', meta.department)}</div>

  <h1>ACKNOWLEDGEMENT</h1>
  ${acknowledgement.map((t) => `<p>${inline(t)}</p>`).join('')}
  <p style="text-align:right;margin-top:24pt">${meta.members.map((m) => `<b>${esc(m.name)}</b> (${esc(m.roll)})`).join('<br>')}</p>

  <h1>ABSTRACT</h1>
  ${abstract.map((t) => `<p>${inline(t)}</p>`).join('')}
  <p><b>Keywords:</b> ${esc(keywords)}</p>

  <h1>TABLE OF CONTENTS</h1>
  ${front.map(line).join('')}${toc.map(line).join('')}

  <h1>LIST OF FIGURES</h1><div class="lof">${lof.map((e) => line({ ...e, lvl: 0 })).join('')}</div>
  <h1>LIST OF TABLES</h1><div class="lof">${lot.map((e) => line({ ...e, lvl: 0 })).join('')}</div>
  <h1>LIST OF ABBREVIATIONS</h1>
  <table><colgroup><col style="width:28%"><col></colgroup><thead><tr><th>Abbreviation</th><th>Meaning</th></tr></thead><tbody>${abbreviations.map(([a, m]) => `<tr><td>${esc(a)}</td><td>${esc(m)}</td></tr>`).join('')}</tbody></table>

  <div id="main"></div>
  ${main}
  <h1>REFERENCES</h1>
  <div class="refs">${references.map((r, i) => `<p>[${i + 1}]&nbsp;&nbsp;${inline(r)}</p>`).join('')}</div>
  ${back}
  </body></html>`;
  return { html, toc, lof, lot, front };
}

// Names for prose, with each roll number kept on one line.
const namesHtml = () => meta.members.map((m) => `<b>${esc(m.name)}</b> <span style="white-space:nowrap">(Roll No. ${esc(m.roll)})</span>`).join(', ').replace(/, ([^,]*)$/, ' and $1');

const roman = (n) => [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']].reduce((acc, [v, s]) => { while (n >= v) { acc += s; n -= v; } return acc; }, '');

async function printPdf(html, file) {
  fs.writeFileSync('report.html', html);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(`file://${here}/report.html`, { waitUntil: 'load' });
  await p.pdf({ path: file, format: 'A4', preferCSSPageSize: true, printBackground: true });
  await b.close();
}

function pageTexts(file) {
  const n = Number(execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/)[1]);
  return Array.from({ length: n }, (_, i) => execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), '-layout', file, '-']).toString().replace(/\s+/g, ' '));
}

function locate(file, model) {
  const texts = pageTexts(file);
  const find = (needle, from = 0) => { for (let i = from; i < texts.length; i++) if (texts[i].includes(needle)) return i; return -1; };
  const lotPage = find('LIST OF ABBREVIATIONS');
  const mainStart = find('CHAPTER 1', lotPage + 1);
  const display = (i) => (i < mainStart ? roman(i) : String(i - mainStart + 1)); // physical page 0 is the title page
  const pages = {};
  for (const e of model.front) pages[e.key] = display(find(e.text.toUpperCase(), 1));
  for (const e of [...model.toc, ...model.lof, ...model.lot]) {
    const needle = e.key.replace(/^(h1|h2|cap):/, '');
    const at = find(needle, mainStart);
    if (at < 0) console.warn('not found', needle);
    pages[e.key] = display(at);
  }
  return { pages, mainStart, total: texts.length };
}

async function stamp(src, dst, mainStart) {
  const pdf = await PDFDocument.load(fs.readFileSync(src));
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const header = `${meta.title} — Final Year Project Report`.replace('—', '-');
  pdf.getPages().forEach((page, i) => {
    if (i === 0) return;
    const { width } = page.getSize();
    const label = i < mainStart ? roman(i) : String(i - mainStart + 1);
    const w = font.widthOfTextAtSize(label, 11);
    page.drawText(label, { x: (width - w) / 2 + 9, y: 30, size: 11, font });
    if (i >= mainStart) {
      const hw = italic.widthOfTextAtSize(header, 9);
      const right = width - 25 * 2.835;
      page.drawText(header, { x: right - hw, y: 812, size: 9, font: italic, color: rgb(0.33, 0.33, 0.33) });
      page.drawLine({ start: { x: 32 * 2.835, y: 806 }, end: { x: right, y: 806 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    }
  });
  pdf.setTitle(`${meta.title} — Final Year Project Report`);
  pdf.setAuthor(meta.author);
  pdf.setSubject(meta.subtitle);
  fs.writeFileSync(dst, await pdf.save());
}

// Re-typeset until the printed page numbers stop moving (usually two passes).
let pages = {}, loc;
for (let pass = 1; pass <= 4; pass++) {
  const model = buildHtml(pages);
  await printPdf(model.html, 'raw.pdf');
  loc = locate('raw.pdf', model);
  const stable = JSON.stringify(loc.pages) === JSON.stringify(pages);
  pages = loc.pages;
  console.log('pass', pass, stable ? 'stable' : 'moved');
  if (stable) break;
}
fs.writeFileSync('pages.json', JSON.stringify(pages, null, 1));
await stamp('raw.pdf', OUT, loc.mainStart);
console.log('wrote', OUT, 'pages', loc.total, 'main starts at physical page', loc.mainStart + 1);
