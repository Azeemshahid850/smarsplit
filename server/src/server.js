import 'dotenv/config';
import cron from 'node-cron';
import app from './app.js';
import { connectDB } from './config/db.js';
import { assertEnv } from './config/env.js';
import { runDueRecurring } from './services/recurring.js';
import { refreshRates } from './services/fx.js';
import { ensurePriceBook } from './services/priceBook.js';
import { startPriceSync, syncIfStale } from './services/priceSync.js';

const PORT = process.env.PORT || 5000;

// On Render the client is served by this same service, so its public URL is the client URL.
// (Guarded: assigning undefined to process.env would store the string "undefined".)
if (!process.env.CLIENT_URL && process.env.RENDER_EXTERNAL_URL) process.env.CLIENT_URL = process.env.RENDER_EXTERNAL_URL;

try {
  assertEnv();
  await connectDB(process.env.MONGO_URI);
  const seeded = await ensurePriceBook();
  if (seeded) console.log(`price book was empty — loaded ${seeded.products} products / ${seeded.rows} prices`);
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}/api/v1`));

  // Render's free tier sleeps after 15 idle minutes and takes ~30s to wake, so
  // the first visitor sees a dead site. Render sets RENDER_EXTERNAL_URL itself;
  // hitting our own public URL counts as traffic and keeps the instance up.
  // ponytail: self-ping; move to an external uptime monitor if the tier changes.
  if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => fetch(`${process.env.RENDER_EXTERNAL_URL}/api/v1/health`).catch(() => {}), 10 * 60 * 1000);
  }

  // Materialise due recurring transactions every day at 02:00.
  cron.schedule('0 2 * * *', async () => {
    const { created } = await runDueRecurring();
    if (created) console.log(`recurring: created ${created} transactions`);
  });

  // Pull the day's exchange rates at 03:00 so foreign-currency expenses never
  // wait on the provider; requests fall back to the saved copy if this fails.
  cron.schedule('0 3 * * *', () =>
    refreshRates()
      .then(({ updatedAt }) => console.log(`fx: rates refreshed (published ${updatedAt.toISOString()})`))
      .catch((err) => console.error('fx: daily refresh failed:', err.message)),
  );

  // Refresh store prices every day at 04:00 (09:00 in Pakistan); also runs from the Admin page.
  cron.schedule('0 4 * * *', () => startPriceSync('schedule').catch((err) => console.error('price sync:', err.message)));
  // …and right after a deploy or a wake-up, unless today's refresh already ran.
  syncIfStale().catch((err) => console.error('price sync:', err.message));
} catch (err) {
  console.error('Startup failed:', err.message);
  process.exit(1);
}
