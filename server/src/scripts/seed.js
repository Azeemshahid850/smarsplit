import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Group } from '../models/Group.js';
import { GroupExpense } from '../models/GroupExpense.js';
import { Settlement } from '../models/Settlement.js';
import { PersonalExpense } from '../models/PersonalExpense.js';
import { Budget } from '../models/Budget.js';
import { Receipt } from '../models/Receipt.js';
import { Notification } from '../models/Notification.js';
import { AuditLog } from '../models/AuditLog.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { SavingsGoal } from '../models/SavingsGoal.js';
import { seedBenchmarkPrices } from './seedPrices.js';
import { computeSplits } from '../services/splitCalculator.js';
import { matchLineItems } from '../services/priceMatch.js';

const DEMO_PASSWORD = 'Demo1234';

const PEOPLE = [
  { name: 'Azeem Shahid', email: 'azeem@demo.pk' },
  { name: 'Sara Khan', email: 'sara@demo.pk' },
  { name: 'Bilal Ahmed', email: 'bilal@demo.pk' },
  { name: 'Hamza Tariq', email: 'hamza@demo.pk' },
  { name: 'Ali Raza', email: 'ali@demo.pk' },
];

// The Murree Trip from the spec.
const TRIP_EXPENSES = [
  { title: 'Hotel — 2 nights', payer: 'Sara Khan', amount: 18000, category: 'Housing', day: 2 },
  { title: 'Fuel Islamabad → Murree', payer: 'Bilal Ahmed', amount: 9000, category: 'Travel', day: 2 },
  { title: 'Dinner at Pearl Continental', payer: 'Azeem Shahid', amount: 6400, category: 'Food', day: 2 },
  { title: 'Chairlift tickets', payer: 'Hamza Tariq', amount: 2500, category: 'Travel', day: 3 },
  { title: 'Breakfast at Mall Road', payer: 'Sara Khan', amount: 3400, category: 'Food', day: 3 },
  { title: 'Souvenirs', payer: 'Ali Raza', amount: 1800, category: 'Shopping', day: 3 },
  { title: 'Fuel back home', payer: 'Bilal Ahmed', amount: 8500, category: 'Travel', day: 4 },
];

const PERSONAL = [
  { title: 'Salary — September', amount: 185000, type: 'CREDIT', category: 'Misc', method: 'Bank Transfer', day: 1 },
  { title: 'Flat rent', amount: 45000, category: 'Housing', method: 'Bank Transfer', day: 2, recurring: 'monthly' },
  { title: 'K-Electric bill', amount: 8400, category: 'Utilities', method: 'Easypaisa', day: 4 },
  { title: 'Internet — StormFiber', amount: 3500, category: 'Utilities', method: 'JazzCash', day: 4, recurring: 'monthly' },
  { title: 'Groceries — Imtiaz', amount: 12600, category: 'Food', method: 'Card', day: 6 },
  { title: 'Careem rides', amount: 2800, category: 'Travel', method: 'Card', day: 8 },
  { title: 'Medicines', amount: 1900, category: 'Healthcare', method: 'Cash', day: 11 },
  { title: 'Freelance project', amount: 35000, type: 'CREDIT', category: 'Misc', method: 'Raast', day: 12 },
  { title: 'Dinner with friends', amount: 4200, category: 'Food', method: 'Card', day: 14 },
  { title: 'Winter jacket', amount: 7800, category: 'Shopping', method: 'Card', day: 16 },
  { title: 'Petrol', amount: 9000, category: 'Travel', method: 'Cash', day: 18 },
  { title: 'Gym membership', amount: 5000, category: 'Healthcare', method: 'JazzCash', day: 20, recurring: 'monthly' },
];

const BUDGETS = [
  { category: 'Food', monthlyCap: 20000 },
  { category: 'Travel', monthlyCap: 15000 },
  { category: 'Utilities', monthlyCap: 14000 },
  { category: 'Shopping', monthlyCap: 8000 },
];

const RECEIPTS = [
  {
    store: 'Imtiaz Super Market',
    items: [
      { name: 'Cooking Oil 3L', qty: 1, price: 1890 },
      { name: 'Basmati Rice 5kg', qty: 1, price: 2180 },
      { name: 'Tea 500g', qty: 1, price: 1300 },
      { name: 'Sugar 1kg', qty: 2, price: 360 },
    ],
  },
  {
    store: 'Metro Cash & Carry',
    items: [
      { name: 'Detergent 1kg', qty: 1, price: 790 },
      { name: 'Milk 1L', qty: 4, price: 960 },
      { name: 'Eggs Dozen', qty: 1, price: 380 },
    ],
  },
  {
    store: 'Al-Fatah Store',
    items: [
      { name: 'Shampoo 400ml', qty: 1, price: 1020 },
      { name: 'Toothpaste 150g', qty: 2, price: 700 },
      { name: 'Bath Soap 3 Pack', qty: 1, price: 495 },
    ],
  },
];

const dayOf = (day) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day);
};

// 1x1 transparent PNG — enough for the demo to render a receipt thumbnail.
const PLACEHOLDER_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function seed() {
  await connectDB(process.env.MONGO_URI);

  console.log('Clearing existing data…');
  await Promise.all(
    [User, Group, GroupExpense, Settlement, PersonalExpense, Budget, Receipt, Notification, AuditLog, RefreshToken, SavingsGoal].map((model) =>
      model.deleteMany({}),
    ),
  );

  const prices = await seedBenchmarkPrices();
  console.log(`Price book: ${prices.products} products, ${prices.rows} rows`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = await User.insertMany(
    PEOPLE.map((personSpec) => ({ ...personSpec, passwordHash, defaultCurrency: 'PKR' })),
  );
  const byName = Object.fromEntries(users.map((seededUser) => [seededUser.name, seededUser]));
  const demo = byName['Azeem Shahid'];
  console.log(`Users: ${users.length} (login ${demo.email} / ${DEMO_PASSWORD})`);

  const group = await Group.create({
    title: 'Murree Trip',
    description: 'Northern tour with the university group',
    type: 'trip',
    baseCurrency: 'PKR',
    tags: ['trip', 'winter'],
    startDate: dayOf(2),
    createdBy: demo._id,
    members: users.map((seededUser, itemSpec) => ({
      user: seededUser._id,
      email: seededUser.email,
      name: seededUser.name,
      role: itemSpec === 0 ? 'admin' : 'member',
      status: 'active',
      joinedAt: dayOf(1),
    })),
  });

  const everyone = users.map((seededUser) => String(seededUser._id));
  const expenses = TRIP_EXPENSES.map((expenseSpec) => {
    const paidBy = [{ userId: byName[expenseSpec.payer]._id, amount: expenseSpec.amount }];
    return {
      groupId: group._id,
      title: expenseSpec.title,
      totalAmount: expenseSpec.amount,
      category: expenseSpec.category,
      date: dayOf(expenseSpec.day),
      paidBy,
      splitType: 'EQUAL',
      splits: computeSplits({ splitType: 'EQUAL', totalAmount: expenseSpec.amount, participants: everyone, paidBy }),
      createdBy: byName[expenseSpec.payer]._id,
    };
  });
  await GroupExpense.insertMany(expenses);
  console.log(`Murree Trip: ${expenses.length} expenses, Rs ${expenses.reduce((transactionSpec, expenseSpec) => transactionSpec + expenseSpec.totalAmount, 0).toLocaleString('en-PK')}`);

  // A second, smaller group so the list page is not a single row.
  const flat = await Group.create({
    title: 'Flat 3B',
    type: 'home',
    baseCurrency: 'PKR',
    createdBy: demo._id,
    members: [demo, byName['Hamza Tariq']].map((seededUser, itemSpec) => ({
      user: seededUser._id,
      email: seededUser.email,
      name: seededUser.name,
      role: itemSpec === 0 ? 'admin' : 'member',
      status: 'active',
      joinedAt: dayOf(1),
    })),
  });
  const flatPaid = [{ userId: demo._id, amount: 14000 }];
  await GroupExpense.create({
    groupId: flat._id,
    title: 'Monthly groceries',
    totalAmount: 14000,
    category: 'Food',
    date: dayOf(5),
    paidBy: flatPaid,
    splitType: 'EQUAL',
    splits: computeSplits({
      splitType: 'EQUAL',
      totalAmount: 14000,
      participants: [String(demo._id), String(byName['Hamza Tariq']._id)],
      paidBy: flatPaid,
    }),
    createdBy: demo._id,
  });

  await PersonalExpense.insertMany(
    PERSONAL.map((transactionSpec) => ({
      userId: demo._id,
      title: transactionSpec.title,
      amount: transactionSpec.amount,
      type: transactionSpec.type ?? 'DEBIT',
      category: transactionSpec.category,
      paymentMethod: transactionSpec.method,
      date: dayOf(transactionSpec.day),
      isRecurring: Boolean(transactionSpec.recurring),
      recurring: transactionSpec.recurring
        ? { interval: transactionSpec.recurring, nextRunAt: new Date(dayOf(transactionSpec.day).getFullYear(), dayOf(transactionSpec.day).getMonth() + 1, transactionSpec.day) }
        : { interval: null, nextRunAt: null },
    })),
  );
  await Budget.insertMany(BUDGETS.map((budgetSpec) => ({ ...budgetSpec, userId: demo._id })));
  console.log(`Personal: ${PERSONAL.length} transactions, ${BUDGETS.length} budgets`);

  for (const [index, r] of RECEIPTS.entries()) {
    const { lineItems, potentialSavings, suggestedAlternatives } = await matchLineItems(r.items);
    const receipt = await Receipt.create({
      userId: demo._id,
      imageUrl: PLACEHOLDER_IMAGE,
      store: r.store,
      receiptDate: dayOf(6 + index * 4),
      ocrStatus: 'done',
      ocrEngine: 'vision',
      lineItems,
      totalDetected: r.items.reduce((transactionSpec, itemSpec) => transactionSpec + itemSpec.price, 0),
      totalsAgree: true,
      potentialSavings,
    });

    // Commit the first one so the dashboard's "savings found" card has a figure
    // behind it — savings live on the committed transaction, not the receipt.
    if (index === 0) {
      const transaction = await PersonalExpense.create({
        userId: demo._id,
        title: `${r.store} receipt`,
        amount: r.items.reduce((transactionSpec, itemSpec) => transactionSpec + itemSpec.price, 0),
        category: 'Food',
        type: 'DEBIT',
        paymentMethod: 'Card',
        date: receipt.receiptDate,
        receiptUrl: receipt.imageUrl,
        potentialSavings,
        suggestedAlternatives,
      });
      receipt.committedTo = 'personal';
      receipt.committedId = transaction._id;
      await receipt.save();
    }
  }
  console.log(`Receipts: ${RECEIPTS.length} scanned and price-matched`);

  await Notification.insertMany([
    {
      userId: demo._id,
      type: 'EXPENSE_ADDED',
      message: 'Bilal logged Rs 8,500 for Fuel back home in Murree Trip',
      groupId: group._id,
      createdAt: dayOf(4),
    },
    {
      userId: demo._id,
      type: 'MEMBER_JOINED',
      message: 'Ali Raza joined Murree Trip',
      groupId: group._id,
      createdAt: dayOf(1),
    },
  ]);

  console.log('\nSeed complete. Sign in as azeem@demo.pk / Demo1234');
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
