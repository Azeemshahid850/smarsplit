import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ deviceScaleFactor: 3, viewport: { width: 1100, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERR', e.message));
await p.goto(`file://${here}/diagrams.html`);
await p.waitForTimeout(500);
for (const id of await p.$$eval('.fig', (els) => els.map((e) => e.id))) {
  await p.locator(`#${id}`).screenshot({ path: `${here}/fig/${id}.png` });
  console.log(id);
}
await b.close();
