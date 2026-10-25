import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser } from './helpers.js';
import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { findBenchmark } from '../services/priceMatch.js';
import { ensurePriceBook } from '../services/priceBook.js';

const api = '/api/v1';
const as = (user) => (req) => req.set('Authorization', `Bearer ${user.accessToken}`);

describe('price book', () => {
  let admin;
  let member;

  beforeEach(async () => {
    admin = await makeUser({ email: 'pricebook@demo.pk' });
    member = await makeUser();
    process.env.ADMIN_EMAILS = 'Someone@else.pk, pricebook@demo.pk';
    await BenchmarkPrice.insertMany([
      { canonicalName: 'Sugar 1kg', aliases: ['sugar'], size: 1, unit: 'kg', price: 175, platform: 'imtiaz' },
      { canonicalName: 'Sugar 1kg', aliases: ['sugar'], size: 1, unit: 'kg', price: 168, platform: 'metro' },
    ]);
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  it('lists products grouped by name with every store, and says who may edit', async () => {
    const res = await request(app).get(`${api}/prices`).use(as(member));
    expect(res.status).toBe(200);
    expect(res.body.data.stores).toEqual(['imtiaz', 'metro']);
    expect(res.body.data.canEdit).toBe(false);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0].prices.map((priceRow) => [priceRow.platform, priceRow.price])).toEqual([
      ['metro', 168],
      ['imtiaz', 175],
    ]);

    const mine = await request(app).get(`${api}/prices`).use(as(admin));
    expect(mine.body.data.canEdit).toBe(true);
  });

  it('refuses writes from anyone not listed as a price admin', async () => {
    const res = await request(app).post(`${api}/prices`).use(as(member)).send({ canonicalName: 'Sugar 1kg', platform: 'carrefour', price: 160 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_SUPER_ADMIN');

    delete process.env.ADMIN_EMAILS;
    const nobody = await request(app).post(`${api}/prices`).use(as(admin)).send({ canonicalName: 'Sugar 1kg', platform: 'carrefour', price: 160 });
    expect(nobody.status).toBe(403);
  });

  it('adds a new store, updates in place on repeat, and the matcher picks it up', async () => {
    const first = await request(app)
      .post(`${api}/prices`)
      .use(as(admin))
      .send({ canonicalName: 'Sugar 1kg', platform: 'Carrefour', price: 165, aliases: ['Cheeni'], size: 1, unit: 'kg' });
    expect(first.status).toBe(201);
    expect(first.body.data.price.platform).toBe('carrefour');

    const again = await request(app).post(`${api}/prices`).use(as(admin)).send({ canonicalName: 'Sugar 1kg', platform: 'carrefour', price: 150 });
    expect(again.status).toBe(201);

    expect(await BenchmarkPrice.countDocuments({ canonicalName: 'Sugar 1kg' })).toBe(3);
    const list = await request(app).get(`${api}/prices`).use(as(member));
    expect(list.body.data.stores).toEqual(['carrefour', 'imtiaz', 'metro']);
    expect(list.body.data.products[0].aliases).toEqual(expect.arrayContaining(['sugar', 'cheeni']));

    // The new store is now the cheapest, so receipts are compared against it.
    const found = await findBenchmark('Cheeni 1kg');
    expect(found.match.platform).toBe('carrefour');
    expect(found.match.price).toBe(150);
  });

  it('deletes a single store price', async () => {
    const list = await request(app).get(`${api}/prices`).use(as(admin));
    const metro = list.body.data.products[0].prices.find((priceRow) => priceRow.platform === 'metro');

    const res = await request(app).delete(`${api}/prices/${metro.id}`).use(as(admin));
    expect(res.status).toBe(200);
    expect(await BenchmarkPrice.countDocuments()).toBe(1);

    const gone = await request(app).delete(`${api}/prices/${metro.id}`).use(as(admin));
    expect(gone.status).toBe(404);
  });

  it('validates the body', async () => {
    const res = await request(app).post(`${api}/prices`).use(as(admin)).send({ canonicalName: 'X', platform: 'metro', price: 12.5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('price book import and export', () => {
  let admin;
  beforeEach(async () => {
    admin = await makeUser({ email: 'pricebook@demo.pk' });
    process.env.ADMIN_EMAILS = 'pricebook@demo.pk';
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAILS;
  });

  const sheet = async (rows) => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Prices');
    ws.addRow(['Product', 'Shop', 'Price (Rs)', 'Pack size', 'Unit', 'Also known as', 'Link']);
    rows.forEach((row) => ws.addRow(row));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

  it('imports an Excel sheet, updating repeats and reporting bad rows', async () => {
    await BenchmarkPrice.create({ canonicalName: 'Sugar 1kg', aliases: ['sugar'], size: 1, unit: 'kg', price: 175, platform: 'imtiaz' });

    const file = await sheet([
      ['Sugar 1kg', 'Imtiaz', '170', 1, 'kg', 'cheeni', ''],
      ['Sugar 1kg', 'Carrefour', 'Rs 160', 1, 'kg', '', ''],
      ['Tea 500g', 'metro', '1180', 500, 'g', 'chai, tapal', 'https://metro.pk/tea'],
      ['', 'metro', '5', '', '', '', ''],
      ['Bad Price', 'metro', 'abc', '', '', '', ''],
    ]);

    const res = await request(app).post(`${api}/prices/import`).use(as(admin)).attach('file', file, 'prices.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ added: 2, updated: 1 });
    expect(res.body.data.skipped.map((skippedRow) => skippedRow.row)).toEqual([5, 6]);

    const sugar = await BenchmarkPrice.find({ canonicalName: 'Sugar 1kg' }).sort({ price: 1 }).lean();
    expect(sugar.map((priceRow) => [priceRow.platform, priceRow.price])).toEqual([['carrefour', 160], ['imtiaz', 170]]);
    expect(sugar[1].aliases).toEqual(expect.arrayContaining(['sugar', 'cheeni']));
    expect((await BenchmarkPrice.findOne({ canonicalName: 'Tea 500g' })).url).toBe('https://metro.pk/tea');
  });

  it('imports CSV too and rejects other files', async () => {
    const csv = Buffer.from('product,store,price\nEggs Dozen,metro,330\nEggs Dozen,daraz,360\n');
    const res = await request(app).post(`${api}/prices/import`).use(as(admin)).attach('file', csv, 'prices.csv');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ added: 2, updated: 0, skipped: [] });

    const bad = await request(app).post(`${api}/prices/import`).use(as(admin)).attach('file', Buffer.from('x'), 'prices.pdf');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_FILE_TYPE');
  });

  it('exports the book as a spreadsheet anyone can download', async () => {
    const member = await makeUser();
    await BenchmarkPrice.create({ canonicalName: 'Sugar 1kg', aliases: ['sugar'], size: 1, unit: 'kg', price: 175, platform: 'imtiaz' });

    const res = await request(app).get(`${api}/prices/export`).use(as(member)).buffer().parse((response, cb) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);

    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    const ws = workbook.worksheets[0];
    expect(ws.getRow(1).values.slice(1, 4)).toEqual(['Product', 'Store', 'Price (Rs)']);
    expect(ws.getRow(2).values.slice(1, 4)).toEqual(['Sugar 1kg', 'imtiaz', 175]);
  });
});

describe('ensurePriceBook (server start)', () => {
  it('loads the bundled catalogue into an empty book and leaves a filled one alone', async () => {
    const first = await ensurePriceBook();
    expect(first.products).toBe(100);
    expect(await BenchmarkPrice.distinct('platform')).toEqual(expect.arrayContaining(['alfatah', 'metro', 'daraz']));

    await BenchmarkPrice.deleteMany({});
    await BenchmarkPrice.create({ canonicalName: 'Only Thing', aliases: [], price: 1, platform: 'mine' });
    expect(await ensurePriceBook()).toBeNull();
    expect(await BenchmarkPrice.countDocuments()).toBe(1);
  });
});
