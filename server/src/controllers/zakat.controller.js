import mongoose from 'mongoose';
import { Group } from '../models/Group.js';
import { SavingsGoal } from '../models/SavingsGoal.js';
import { PersonalExpense } from '../models/PersonalExpense.js';
import { MetalRate } from '../models/MetalRate.js';
import { summariseGroupsFor } from '../services/balances.js';
import { calculateZakat } from '../services/zakat.js';
import { isSuperAdmin } from '../config/env.js';
import { ok } from '../utils/ok.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const publicRates = (rates) =>
  rates ? { goldPerTola: rates.goldPerTola, silverPerTola: rates.silverPerTola, updatedAt: rates.updatedAt } : null;

/** What the app already knows about the user's money, to start the form with. */
export async function overview(req, res) {
  const userId = new mongoose.Types.ObjectId(String(req.user._id));
  const [goals, groups, lastYear, rates] = await Promise.all([
    SavingsGoal.find({ userId }).select('contributions.amount').lean(),
    Group.find({ members: { $elemMatch: { user: userId, status: 'active' } } }).select('_id').lean(),
    PersonalExpense.aggregate([
      { $match: { userId, date: { $gte: new Date(Date.now() - YEAR_MS) } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
    MetalRate.findOne({ base: 'PKR' }).lean(),
  ]);

  const goalsSaved = goals.reduce(
    (sum, goal) => sum + goal.contributions.reduce((runningTotal, contribution) => runningTotal + contribution.amount, 0),
    0,
  );
  const balances = Object.values(await summariseGroupsFor(userId, groups.map((groupRow) => groupRow._id))).map((row) => row.myBalance);
  const totalOf = (type) => lastYear.find((row) => row._id === type)?.total ?? 0;

  ok(res, {
    known: {
      goalsSaved,
      owedToYou: balances.filter((balance) => balance > 0).reduce((sum, balance) => sum + balance, 0),
      youOwe: -balances.filter((balance) => balance < 0).reduce((sum, balance) => sum + balance, 0),
      savedLast12Months: totalOf('CREDIT') - totalOf('DEBIT'),
    },
    rates: publicRates(rates),
    canEditRates: isSuperAdmin(req.user),
  });
}

export async function calculate(req, res) {
  const saved = await MetalRate.findOne({ base: 'PKR' }).lean();
  const result = calculateZakat({
    ...req.body,
    goldPerTola: req.body.goldPerTola ?? saved?.goldPerTola ?? null,
    silverPerTola: req.body.silverPerTola ?? saved?.silverPerTola ?? null,
  });
  ok(res, { result });
}

export async function saveRates(req, res) {
  const rates = await MetalRate.findOneAndUpdate(
    { base: 'PKR' },
    { ...req.body, updatedAt: new Date(), updatedBy: req.user._id },
    { upsert: true, new: true },
  ).lean();
  ok(res, { rates: publicRates(rates) });
}
