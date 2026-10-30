import { SavingsGoal } from '../models/SavingsGoal.js';
import { ApiError } from '../middleware/ApiError.js';
import { ok } from '../utils/ok.js';
import { notify } from '../services/notifications.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const money = (rupees) => `Rs ${rupees.toLocaleString('en-PK')}`;
const savedIn = (goal) => goal.contributions.reduce((runningTotal, contribution) => runningTotal + contribution.amount, 0);

/**
 * Everything the UI shows about a goal, derived from its contributions.
 * onTrack compares what is saved with a straight line from the day the goal was
 * set (Rs 0) to the target date (the full target).
 */
export function progressOf(goal, now = new Date()) {
  const saved = savedIn(goal);
  const remaining = Math.max(goal.targetAmount - saved, 0);
  const progress = {
    saved,
    remaining,
    percent: Math.min(Math.floor((saved / goal.targetAmount) * 100), 100),
    achieved: saved >= goal.targetAmount,
    daysLeft: null,
    monthlyNeeded: null,
    onTrack: null,
  };
  if (!goal.targetDate || progress.achieved) return progress;

  const daysLeft = Math.ceil((goal.targetDate - now) / DAY_MS);
  const monthsLeft = Math.max(Math.ceil(daysLeft / 30), 1);
  const span = goal.targetDate - goal.createdAt;
  const elapsed = span > 0 ? Math.min(Math.max((now - goal.createdAt) / span, 0), 1) : 1;

  return {
    ...progress,
    daysLeft,
    monthlyNeeded: daysLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining,
    onTrack: saved >= Math.round(goal.targetAmount * elapsed),
  };
}

const publicGoal = (goal) => ({
  id: goal._id,
  title: goal.title,
  targetAmount: goal.targetAmount,
  targetDate: goal.targetDate,
  reachedAt: goal.reachedAt,
  createdAt: goal.createdAt,
  contributions: [...goal.contributions]
    .sort((left, right) => right.date - left.date)
    .map((contribution) => ({ id: contribution._id, amount: contribution.amount, note: contribution.note, date: contribution.date })),
  ...progressOf(goal),
});

async function ownGoal(req) {
  const goal = await SavingsGoal.findOne({ _id: req.params.goalId, userId: req.user._id });
  if (!goal) throw ApiError.notFound('Goal not found', 'GOAL_NOT_FOUND');
  return goal;
}

// Stamps the moment a goal is first reached; clears it if money is taken back out.
function markReached(goal) {
  const reached = savedIn(goal) >= goal.targetAmount;
  const justReached = reached && !goal.reachedAt;
  goal.reachedAt = reached ? (goal.reachedAt ?? new Date()) : null;
  return justReached;
}

export async function listGoals(req, res) {
  const goals = await SavingsGoal.find({ userId: req.user._id }).sort({ createdAt: -1 });
  ok(res, { goals: goals.map(publicGoal) });
}

export async function createGoal(req, res) {
  const goal = await SavingsGoal.create({ ...req.body, userId: req.user._id });
  ok(res, { goal: publicGoal(goal) }, 201);
}

export async function updateGoal(req, res) {
  const goal = await ownGoal(req);
  Object.assign(goal, req.body);
  markReached(goal);
  await goal.save();
  ok(res, { goal: publicGoal(goal) });
}

export async function deleteGoal(req, res) {
  const goal = await ownGoal(req);
  await goal.deleteOne();
  ok(res, { deleted: true });
}

export async function addContribution(req, res) {
  const goal = await ownGoal(req);
  const saved = savedIn(goal);
  if (saved + req.body.amount < 0) {
    throw ApiError.badRequest(`You can take out at most ${money(saved)} — that is all this goal holds`, 'GOAL_BELOW_ZERO');
  }

  goal.contributions.push(req.body);
  const justReached = markReached(goal);
  await goal.save();

  // notify() swallows its own failures, so it can never undo the deposit above.
  if (justReached) {
    await notify({
      recipients: [req.user._id],
      type: 'GOAL_REACHED',
      message: `Goal reached: ${goal.title} — ${money(savedIn(goal))} saved`,
      meta: { goalId: goal._id },
    });
  }
  ok(res, { goal: publicGoal(goal) }, 201);
}

export async function removeContribution(req, res) {
  const goal = await ownGoal(req);
  const contribution = goal.contributions.id(req.params.contributionId);
  if (!contribution) throw ApiError.notFound('Entry not found', 'CONTRIBUTION_NOT_FOUND');
  if (savedIn(goal) - contribution.amount < 0) {
    throw ApiError.badRequest('Removing this deposit would leave the goal below zero — remove the withdrawal first', 'GOAL_BELOW_ZERO');
  }

  contribution.deleteOne();
  markReached(goal);
  await goal.save();
  ok(res, { goal: publicGoal(goal) });
}
