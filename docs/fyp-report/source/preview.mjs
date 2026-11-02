// Renders a .docx in Chrome via docx-preview and screenshots each page, for visual checking.
// Usage: node preview.mjs file.docx outdir [firstPage] [lastPage]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , file, outDir = 'preview', first = '1', last = '999'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const here = path.resolve('.');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.setContent(`<html><body style="background:#888;margin:0"><div id="c"></div></body></html>`);
await p.addScriptTag({ path: 'node_modules/jszip/dist/jszip.min.js' });
await p.addScriptTag({ path: 'node_modules/docx-preview/dist/docx-preview.min.js' });
const b64 = fs.readFileSync(file).toString('base64');
const n = await p.evaluate(async (data) => {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  await docx.renderAsync(bytes.buffer, document.getElementById('c'), null, { breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true });
  return document.querySelectorAll('section.docx').length;
}, b64);
console.log('pages', n);
const sections = await p.$$('section.docx');
for (let i = Number(first) - 1; i < Math.min(sections.length, Number(last)); i++) {
  await sections[i].screenshot({ path: `${outDir}/p${String(i + 1).padStart(3, '0')}.png` });
}
await b.close();
