import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { makeUser } from './helpers.js';
import { progressOf } from '../controllers/goals.controller.js';

const api = '/api/v1';
const post = (user, url, body) => request(app).post(url).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const patch = (user, url, body) => request(app).patch(url).set('Authorization', `Bearer ${user.accessToken}`).send(body);
const del = (user, url) => request(app).delete(url).set('Authorization', `Bearer ${user.accessToken}`);
const get = (user, url) => request(app).get(url).set('Authorization', `Bearer ${user.accessToken}`);

const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

async function laptopGoal(user, overrides = {}) {
  const res = await post(user, `${api}/goals`, { title: 'New laptop', targetAmount: 80000, targetDate: inDays(120), ...overrides });
  return res.body.data.goal;
}

describe('savings goals', () => {
  it('creates a goal with nothing saved yet', async () => {
    const azeem = await makeUser();
    const res = await post(azeem, `${api}/goals`, { title: 'New laptop', targetAmount: 80000, targetDate: inDays(120) });

    expect(res.status).toBe(201);
    expect(res.body.data.goal).toMatchObject({ title: 'New laptop', saved: 0, remaining: 80000, percent: 0, achieved: false });
    expect(res.body.data.goal.monthlyNeeded).toBe(20000); // 120 days → 4 months
  });

  it('rejects a target date in the past and fractional rupees', async () => {
    const azeem = await makeUser();
    expect((await post(azeem, `${api}/goals`, { title: 'Bike', targetAmount: 50000, targetDate: inDays(-3) })).status).toBe(400);
    expect((await post(azeem, `${api}/goals`, { title: 'Bike', targetAmount: 500.5 })).status).toBe(400);
  });

  it('sums deposits and withdrawals, and never goes below zero', async () => {
    const azeem = await makeUser();
    const goal = await laptopGoal(azeem);
    const url = `${api}/goals/${goal.id}/contributions`;

    await post(azeem, url, { amount: 30000, note: 'Salary' });
    await post(azeem, url, { amount: 10000 });
    const withdrawn = await post(azeem, url, { amount: -5000, note: 'Car repair' });
    expect(withdrawn.body.data.goal).toMatchObject({ saved: 35000, remaining: 45000, percent: 43 });

    const tooMuch = await post(azeem, url, { amount: -40000 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe('GOAL_BELOW_ZERO');
  });

  it('marks a goal reached and tells its owner once', async () => {
    const azeem = await makeUser();
    const goal = await laptopGoal(azeem, { targetAmount: 10000 });
    const url = `${api}/goals/${goal.id}/contributions`;

    const reached = await post(azeem, url, { amount: 10000 });
    expect(reached.body.data.goal).toMatchObject({ achieved: true, percent: 100, remaining: 0 });
    expect(reached.body.data.goal.reachedAt).toBeTruthy();
    await post(azeem, url, { amount: 500 }); // already reached: no second notification

    const feed = await get(azeem, `${api}/notifications`);
    const goalNotes = feed.body.data.notifications.filter((note) => note.type === 'GOAL_REACHED');
    expect(goalNotes).toHaveLength(1);
    expect(goalNotes[0].message).toContain('New laptop');
  });

  it('removes a contribution and recomputes', async () => {
    const azeem = await makeUser();
    const goal = await laptopGoal(azeem);
    const first = await post(azeem, `${api}/goals/${goal.id}/contributions`, { amount: 12000 });
    const entryId = first.body.data.goal.contributions[0].id;

    const res = await del(azeem, `${api}/goals/${goal.id}/contributions/${entryId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.goal).toMatchObject({ saved: 0, contributions: [] });
  });

  it('refuses to remove a deposit a later withdrawal depends on', async () => {
    const azeem = await makeUser();
    const goal = await laptopGoal(azeem);
    const deposit = await post(azeem, `${api}/goals/${goal.id}/contributions`, { amount: 5000 });
    await post(azeem, `${api}/goals/${goal.id}/contributions`, { amount: -3000 });

    const depositId = deposit.body.data.goal.contributions[0].id;
    const res = await del(azeem, `${api}/goals/${goal.id}/contributions/${depositId}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('GOAL_BELOW_ZERO');
  });

  it('edits and deletes a goal', async () => {
    const azeem = await makeUser();
    const goal = await laptopGoal(azeem);

    const edited = await patch(azeem, `${api}/goals/${goal.id}`, { title: 'Gaming laptop', targetAmount: 120000 });
    expect(edited.body.data.goal).toMatchObject({ title: 'Gaming laptop', targetAmount: 120000 });

    expect((await del(azeem, `${api}/goals/${goal.id}`)).status).toBe(200);
    expect((await get(azeem, `${api}/goals`)).body.data.goals).toEqual([]);
  });

  it('keeps every goal private to its owner', async () => {
    const azeem = await makeUser();
    const sara = await makeUser();
    const goal = await laptopGoal(azeem);

    expect((await get(sara, `${api}/goals`)).body.data.goals).toEqual([]);
    expect((await patch(sara, `${api}/goals/${goal.id}`, { title: 'Mine now' })).status).toBe(404);
    expect((await post(sara, `${api}/goals/${goal.id}/contributions`, { amount: 100 })).status).toBe(404);
    expect((await del(sara, `${api}/goals/${goal.id}`)).status).toBe(404);
  });
});

describe('progressOf', () => {
  const goal = (saved) => ({
    targetAmount: 60000,
    createdAt: new Date('2026-01-01'),
    targetDate: new Date('2026-07-01'),
    contributions: [{ amount: saved }],
  });
  const april = new Date('2026-04-01');

  it('works out the monthly amount still needed', () => {
    // 91 days left → 4 months; 40,000 still to save.
    expect(progressOf(goal(20000), april)).toMatchObject({ daysLeft: 91, monthlyNeeded: 10000 });
  });

  it('is on track only when savings keep up with the straight line to the target', () => {
    // Halfway through the time, about half the money should be saved.
    expect(progressOf(goal(20000), april).onTrack).toBe(false);
    expect(progressOf(goal(32000), april).onTrack).toBe(true);
  });

  it('asks for everything that is left once the date has passed', () => {
    expect(progressOf(goal(20000), new Date('2026-08-01'))).toMatchObject({ monthlyNeeded: 40000, onTrack: false });
  });
});
