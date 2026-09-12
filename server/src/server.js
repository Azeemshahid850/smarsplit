import 'dotenv/config';
import cron from 'node-cron';
import app from './app.js';
import { connectDB } from './config/db.js';
import { assertEnv } from './config/env.js';
import { runDueRecurring } from './services/recurring.js';

const PORT = process.env.PORT || 5000;

try {
  assertEnv();
  await connectDB(process.env.MONGO_URI);
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}/api/v1`));

  // Materialise due recurring transactions every day at 02:00.
  cron.schedule('0 2 * * *', async () => {
    const { created } = await runDueRecurring();
    if (created) console.log(`recurring: created ${created} transactions`);
  });
} catch (err) {
  console.error('Startup failed:', err.message);
  process.exit(1);
}
