import { PersonalExpense } from '../models/PersonalExpense.js';

/** Next due date for an interval, from a given date. */
export function advance(date, interval) {
  const next = new Date(date);
  if (interval === 'weekly') next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Materialises every recurring transaction that has come due and advances its
 * schedule. Catches up properly: a template two months overdue produces two rows.
 * Pure enough to call straight from a test — the cron job is only a timer.
 * @returns {{created: number}}
 */
export async function runDueRecurring(now = new Date()) {
  const templates = await PersonalExpense.find({
    isRecurring: true,
    generatedFrom: null,
    'recurring.nextRunAt': { $ne: null, $lte: now },
  });

  let created = 0;

  for (const template of templates) {
    let due = template.recurring.nextRunAt;
    const rows = [];

    // ponytail: 120-iteration cap stops a bad nextRunAt from spinning forever.
    for (let guard = 0; due <= now && guard < 120; guard += 1) {
      rows.push({
        userId: template.userId,
        title: template.title,
        amount: template.amount,
        category: template.category,
        type: template.type,
        paymentMethod: template.paymentMethod,
        date: due,
        note: template.note,
        isRecurring: false,
        generatedFrom: template._id,
      });
      due = advance(due, template.recurring.interval);
    }

    if (rows.length) {
      await PersonalExpense.insertMany(rows);
      template.recurring.nextRunAt = due;
      await template.save();
      created += rows.length;
    }
  }

  return { created };
}
