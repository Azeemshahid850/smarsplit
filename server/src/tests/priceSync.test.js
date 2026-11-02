import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser } from './helpers.js';
import { BenchmarkPrice } from '../models/BenchmarkPrice.js';
import { STORES, robotsAllows, pickListing, queriesFor, syncPrices, productFromPage, syncIfStale } from '../services/priceSync.js';
import { PriceSyncRun } from '../models/PriceSyncRun.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ADMIN_EMAILS;
});

const oil = { canonicalName: 'Cooking Oil 3L', size: 3, unit: 'L', aliases: ['cooking oil'], prices: [{ price: 1745 }, { price: 1790 }, { price: 1830 }] };

// A store whose robots.txt and search answers are scripted per test.
const fakeStore = (key, listings, robots = 'User-agent: *\nAllow: /') => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
    String(url).endsWith('/robots.txt') ? new Response(robots) : Response.json({}),
  );
  return { key, origin: `https://${key}.test`, paths: ['/search'], search: vi.fn(async () => listings) };
};

describe('robots.txt', () => {
  it('follows the User-agent * group, longest rule first', () => {
    const daraz = 'User-agent: *\nDisallow: /catalog/\nDisallow: /cart';
    expect(robotsAllows(daraz, '/catalog/?q=oil')).toBe(false);
    expect(robotsAllows(daraz, '/products/oil')).toBe(true);
    expect(robotsAllows('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\nDisallow: /admin', '/search/suggest.json')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /search\nAllow: /search/suggest', '/search/suggest.json')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow:', '/anything')).toBe(true);
    // Jalal Sons / Chase Up: wildcards block only what they spell, not the whole site.
    const blinkco = 'User-agent: *\nDisallow: /api/*\nDisallow: /*?amp=*\nDisallow: /checkout/';
    expect(robotsAllows(blinkco, '/product/dalda-oil-bottle-3ltr-2809031')).toBe(true);
    expect(robotsAllows(blinkco, '/sitemap.xml')).toBe(true);
    expect(robotsAllows(blinkco, '/api/items?q=oil')).toBe(false);
    expect(robotsAllows(blinkco, '/product/x?amp=1')).toBe(false);
  });
});

describe('matching a store listing to a price book product', () => {
  it('searches with the pack size first', () => {
    expect(queriesFor(oil)).toEqual(['Cooking Oil 3 ltr', 'Cooking Oil']);
  });

  it('takes the middle-priced listing with the same name and size', () => {
    const picked = pickListing(oil, [
      { title: 'DALDA COOKING OIL CAN 5 LTR', price: 2990 },
      { title: 'DALDA COOKING OIL BOTTLE 3 LTR', price: 1930 },
      { title: 'SUFI CANOLA COOKING OIL 3 LTR', price: 1890 },
      { title: 'KAUSAR COOKING OIL BOTTLE 3 LTR', price: 1645 },
    ]);
    expect(picked.title).toBe('SUFI CANOLA COOKING OIL 3 LTR');
  });

  it('refuses another product, a missing size and an implausible price', () => {
    expect(pickListing(oil, [{ title: 'CASTROL ENGINE OIL 3 LTR', price: 1800 }])).toBeNull();
    expect(pickListing(oil, [{ title: 'DALDA COOKING OIL', price: 1800 }])).toBeNull();
    expect(pickListing(oil, [{ title: 'DALDA COOKING OIL 3 LTR', price: 99 }])).toBeNull();
    expect(pickListing(oil, [{ title: 'DALDA COOKING OIL 3 LTR', price: 3200 }])).toBeNull();
  });

  it('refuses a listing that is something else under the same word', () => {
    // Every one of these was picked by an earlier run.
    const product = (canonicalName, size, unit, price, rivals) => ({ canonicalName, size, unit, prices: [{ price }], rivals });
    const sugar = product('Sugar 1kg', 1, 'kg', 168);
    expect(pickListing(sugar, [{ title: 'Sugar Cane Cut Pieces 0.95 - 1 kg 1 kg', price: 164 }])).toBeNull();
    expect(pickListing(sugar, [{ title: 'Dco Sugar 1Kg', price: 149 }]).title).toBe('Dco Sugar 1Kg');
    expect(pickListing(product('Beef 1kg', 1, 'kg', 1200), [{ title: 'Pk Beef Burger 1Kg', price: 1169 }, { title: 'Meaoon Cat Food Beef & Vegetable 1kg', price: 944 }])).toBeNull();
    expect(pickListing(product('Cheese Slices 200g', 200, 'g', 650), [{ title: 'FF BURGER CHEESE SLICES 200GM', price: 695 }]).price).toBe(695);
    expect(pickListing(product('Detergent 1kg', 1, 'kg', 700), [{ title: 'Spark Detergent 1Kg X 2Pcs (Promo Pack)', price: 920 }])).toBeNull();
    const tea = product('Tea 200g', 200, 'g', 500, [['face', 'wash'], ['green', 'tea']]);
    expect(pickListing(tea, [{ title: 'Derma Shine Face Wash Tea Tree 200g', price: 598 }])).toBeNull();
    expect(pickListing(tea, [{ title: 'Tapal Danedar Tea Jar 200Gm', price: 440 }]).price).toBe(440);
  });
});

describe('Shopify stores', () => {
  it('reads title, rupee price and a clean link from the search JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        resources: {
          results: {
            products: [
              { title: 'DALDA COOKING OIL BOTTLE 3 LTR', price: '1930.00', url: '/products/dalda-3-ltr?_pos=1&_sid=x', available: true },
              { title: 'SOLD OUT OIL 3 LTR', price: '1500.00', url: '/products/gone', available: false },
            ],
          },
        },
      }),
    );
    const alFatah = STORES.find((store) => store.key === 'alfatah');
    expect(await alFatah.search('cooking oil 3 ltr')).toEqual([
      { title: 'DALDA COOKING OIL BOTTLE 3 LTR', price: 1930, url: 'https://alfatah.pk/products/dalda-3-ltr' },
    ]);
  });
});

describe('stores read through their sitemap', () => {
  const page = (offer) =>
    `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Dalda Cooking Oil Bottle 3L","offers":${JSON.stringify(offer)}}</script></html>`;

  it('reads the price from the schema.org Product a page embeds', () => {
    expect(productFromPage(page({ price: '1894.00', priceCurrency: 'PKR', availability: 'https://schema.org/InStock' }))).toEqual({ title: 'Dalda Cooking Oil Bottle 3L', price: 1894 });
    expect(productFromPage(page({ price: 1915, availability: 'https://schema.org/OutOfStock' }))).toBeNull();
    expect(productFromPage('<html>no structured data</html>')).toBeNull();
  });

  it('opens only the product pages whose names match the book, and stores their price', async () => {
    await BenchmarkPrice.create({ canonicalName: 'Cooking Oil 3L', aliases: ['cooking oil'], size: 3, unit: 'L', price: 1790, platform: 'metro' });
    const jalal = STORES.find((store) => store.key === 'jalal sons');
    const opened = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const href = String(url);
      if (href.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /api/*\nDisallow: /*?amp=*');
      if (href.endsWith('/sitemap.xml'))
        return new Response('<sitemapindex><sitemap><loc>https://www.jalalsons.com.pk/sitemap-products/1.xml</loc></sitemap></sitemapindex>');
      if (href.endsWith('/sitemap-products/1.xml'))
        return new Response(
          '<urlset><url><loc>https://www.jalalsons.com.pk/product/dalda-cooking-oil-bottle-3l-3007029</loc></url><url><loc>https://www.jalalsons.com.pk/product/tapal-danedar-pouch-385gm-2810141</loc></url></urlset>',
        );
      opened.push(href);
      return new Response(page({ price: '1894.00', availability: 'https://schema.org/InStock' }));
    });

    const run = await syncPrices({ stores: [jalal], gapMs: 0 });

    expect(run.stores[0]).toMatchObject({ store: 'jalal sons', matched: 1, updated: 1, error: null, skipped: null });
    expect(opened).toEqual(['https://www.jalalsons.com.pk/product/dalda-cooking-oil-bottle-3l-3007029']); // tea page never opened
    expect(await BenchmarkPrice.findOne({ platform: 'jalal sons' }).lean()).toMatchObject({ price: 1894, url: 'https://www.jalalsons.com.pk/product/dalda-cooking-oil-bottle-3l-3007029' });
  });
});

describe('GrocerApp', () => {
  it('reads name + unit, whole-rupee price and a product link from its search API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ success: true, data: [{ name: 'Eva Cooking Oil 3 Litre Bottle', unit: '3 ltr', vendor_price: 1884, seo_url: 'EVA Cooking Oil Bottle', product_id: 20723 }] }),
    );
    const grocerApp = STORES.find((store) => store.key === 'grocerapp');
    expect(await grocerApp.search('cooking oil 3 ltr')).toEqual([
      { title: 'Eva Cooking Oil 3 Litre Bottle 3 ltr', price: 1884, url: 'https://grocerapp.pk/products/eva-cooking-oil-bottle-20723/' },
    ]);
  });
});

describe('syncPrices', () => {
  const seedOil = () =>
    BenchmarkPrice.insertMany([
      { canonicalName: 'Cooking Oil 3L', aliases: ['cooking oil'], size: 3, unit: 'L', price: 1745, platform: 'daraz' },
      { canonicalName: 'Cooking Oil 3L', aliases: ['cooking oil'], size: 3, unit: 'L', price: 1790, platform: 'metro' },
    ]);

  it("writes the store's price into the book and logs the run", async () => {
    await seedOil();
    const store = fakeStore('shop', [{ title: 'DALDA COOKING OIL BOTTLE 3 LTR', price: 1930, url: 'https://shop.test/p/dalda' }]);

    const run = await syncPrices({ stores: [store], gapMs: 0 });

    expect(run.status).toBe('done');
    expect(run.stores[0]).toMatchObject({ store: 'shop', matched: 1, updated: 1, skipped: null, error: null });
    const row = await BenchmarkPrice.findOne({ canonicalName: 'Cooking Oil 3L', platform: 'shop' }).lean();
    expect(row).toMatchObject({ price: 1930, size: 3, unit: 'L', url: 'https://shop.test/p/dalda' });
    expect(row.aliases).toContain('cooking oil');
  });

  it('skips a store whose robots.txt forbids its search, touching nothing', async () => {
    await seedOil();
    const store = fakeStore('metro', [{ title: 'COOKING OIL 3 LTR', price: 1500 }], 'User-agent: *\nDisallow: /search');

    const run = await syncPrices({ stores: [store], gapMs: 0 });

    expect(run.stores[0].skipped).toBe('robots.txt disallows /search');
    expect(store.search).not.toHaveBeenCalled();
    expect((await BenchmarkPrice.findOne({ platform: 'metro' })).price).toBe(1790);
  });

  it('treats a missing robots.txt as no rules, but an unreachable one as keep out', async () => {
    await seedOil();
    const missing = fakeStore('shop', [{ title: 'DALDA COOKING OIL BOTTLE 3 LTR', price: 1930 }]);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not here', { status: 404 }));
    expect((await syncPrices({ stores: [missing], gapMs: 0 })).stores[0]).toMatchObject({ skipped: null, matched: 1 });

    const down = { ...missing, key: 'down', search: vi.fn(async () => []) };
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 503 }));
    const run = await syncPrices({ stores: [down], gapMs: 0 });
    expect(run.stores[0].skipped).toBe('robots.txt could not be read');
    expect(down.search).not.toHaveBeenCalled();
  });

  it("removes a store's synced price once the store no longer lists the product", async () => {
    await seedOil();
    await BenchmarkPrice.create({ canonicalName: 'Cooking Oil 3L', aliases: [], size: 3, unit: 'L', price: 999, platform: 'shop', url: 'https://shop.test/p/wrong' });
    const store = fakeStore('shop', [{ title: 'ENGINE OIL 3 LTR', price: 1800 }]);
    const metro = { ...store, key: 'metro' };

    await syncPrices({ stores: [store, metro], gapMs: 0 });

    expect(await BenchmarkPrice.findOne({ platform: 'shop' })).toBeNull();
    expect((await BenchmarkPrice.findOne({ platform: 'metro' })).price).toBe(1790); // no link: typed in, stays
  });

  it('tries a store that was down once more', async () => {
    await seedOil();
    await BenchmarkPrice.create({ canonicalName: 'Sugar 1kg', aliases: ['sugar'], size: 1, unit: 'kg', price: 168, platform: 'metro' });
    const store = fakeStore('shop', [{ title: 'DALDA COOKING OIL BOTTLE 3 LTR', price: 1930 }]);
    store.search.mockRejectedValueOnce(new Error('HTTP 500')).mockRejectedValueOnce(new Error('HTTP 500')).mockRejectedValueOnce(new Error('HTTP 500'));

    const run = await syncPrices({ stores: [store], gapMs: 0 });

    expect(run.stores[0]).toMatchObject({ matched: 1, error: null });
  });

  it('gives up on a failing store and keeps its old prices', async () => {
    await seedOil();
    await BenchmarkPrice.create({ canonicalName: 'Sugar 1kg', aliases: ['sugar'], size: 1, unit: 'kg', price: 168, platform: 'metro' });
    const store = fakeStore('metro', []);
    store.search.mockRejectedValue(new Error('HTTP 503'));

    const run = await syncPrices({ stores: [store], gapMs: 0 });

    expect(run.status).toBe('done');
    expect(run.stores[0].error).toMatch(/stopped after 3 failed requests \(HTTP 503\)/);
    expect((await BenchmarkPrice.findOne({ platform: 'metro' })).price).toBe(1790);
  });
});

describe('start-up refresh', () => {
  it('does not start while a recent run is done or still going', async () => {
    await PriceSyncRun.create({ trigger: 'cli', status: 'running', startedAt: new Date(Date.now() - 10 * 60 * 1000) });
    expect(await syncIfStale()).toBeNull();
    await PriceSyncRun.updateMany({}, { status: 'done' });
    expect(await syncIfStale()).toBeNull();
    await PriceSyncRun.updateMany({}, { startedAt: new Date(Date.now() - 30 * 60 * 60 * 1000) });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const started = await syncIfStale();
    expect(started.run.trigger).toBe('startup');
    for (let attempt = 0; attempt < 50 && (await PriceSyncRun.countDocuments({ status: 'running' })); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });

  it('does not wait on a run whose server stopped', async () => {
    const dead = await PriceSyncRun.create({ trigger: 'startup', status: 'running', startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    expect((await syncIfStale()).run.trigger).toBe('startup');
    expect((await PriceSyncRun.findById(dead._id)).status).toBe('failed');
    for (let attempt = 0; attempt < 50 && (await PriceSyncRun.countDocuments({ status: 'running' })); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
});

describe('/admin/price-sync', () => {
  it('is for app admins only', async () => {
    const plain = await makeUser();
    expect((await request(app).get('/api/v1/admin/price-sync').set('Authorization', `Bearer ${plain.accessToken}`)).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/price-sync').set('Authorization', `Bearer ${plain.accessToken}`)).status).toBe(403);
  });

  it('starts a run in the background and lists it', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline')); // no real store is contacted
    const boss = await makeUser();
    process.env.ADMIN_EMAILS = boss.email;
    const as = (req) => req.set('Authorization', `Bearer ${boss.accessToken}`);

    const started = await as(request(app).post('/api/v1/admin/price-sync'));
    expect(started.status).toBe(202);
    expect(started.body.data.run.status).toBe('running');

    let list;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      list = await as(request(app).get('/api/v1/admin/price-sync'));
      if (!list.body.data.running) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(list.body.data.running).toBe(false);
    expect(list.body.data.runs[0]).toMatchObject({ trigger: 'manual', status: 'done' });
    expect(list.body.data.stores.map((store) => store.key)).toEqual(['alfatah', 'grocerapp', 'metro', 'jalal sons', 'chaseup']);
  });
});
