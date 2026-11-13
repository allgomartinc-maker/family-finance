import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthKey, shiftMonth, monthLabel, solarDay, totals, activeGrocery, groceryFor, billStatus, faDigits, money, addGrocery,
} from '../logic.js';

const d = (s) => new Date(s.length === 10 ? s + 'T12:00:00' : s).getTime();

test('monthKey uses the Afghan solar calendar (YYYY-MM)', () => {
  assert.equal(monthKey(d('2026-11-13')), '1405-08'); // 22 Aqrab 1405
  assert.equal(monthKey(d('2026-10-22')), '1405-07'); // 30 Mizan
  assert.equal(monthKey(d('2027-03-21')), '1406-01'); // Nawroz
});

test('solarDay gives day of the solar month', () => {
  assert.equal(solarDay(d('2026-11-13')), 22);
});

test('shiftMonth moves across years', () => {
  assert.equal(shiftMonth('1405-08', 1), '1405-09');
  assert.equal(shiftMonth('1405-01', -1), '1404-12');
  assert.equal(shiftMonth('1405-12', 1), '1406-01');
});

test('monthLabel is Dari month + Persian year', () => {
  assert.equal(monthLabel('1405-08'), 'عقرب ۱۴۰۵');
  assert.equal(monthLabel('1405-01'), 'حمل ۱۴۰۵');
});

test('totals splits in/out by currency and month, ignores deleted', () => {
  const tx = [
    { type: 'in', amount: 10000, currency: 'AFN', cat: 'salary', by: 'a', ts: d('2026-11-02') },
    { type: 'out', amount: 3000, currency: 'AFN', cat: 'food', by: 'b', ts: d('2026-11-05') },
    { type: 'out', amount: 1000, currency: 'AFN', cat: 'food', by: 'a', ts: d('2026-11-06') },
    { type: 'out', amount: 500, currency: 'AFN', cat: 'power', by: 'a', ts: d('2026-11-07'), deleted: true },
    { type: 'out', amount: 50, currency: 'USD', cat: 'food', by: 'a', ts: d('2026-11-07') },
    { type: 'out', amount: 900, currency: 'AFN', cat: 'food', by: 'a', ts: d('2026-10-20') },
  ];
  const t = totals(tx, 'AFN', '1405-08');
  assert.equal(t.in, 10000);
  assert.equal(t.out, 4000);
  assert.equal(t.net, 6000);
  assert.deepEqual(t.byCat, { food: 4000 });
  assert.deepEqual(t.byPerson, { a: { in: 10000, out: 1000 }, b: { in: 0, out: 3000 } });
});

test('activeGrocery hides bought and deleted, oldest first', () => {
  const g = [
    { id: 1, ts: 3 }, { id: 2, ts: 1, bought: true }, { id: 3, ts: 2 }, { id: 4, ts: 0, deleted: true },
  ];
  assert.deepEqual(activeGrocery(g).map((x) => x.id), [3, 1]);
});

test('groceryFor filters by claimer; "free" = unclaimed', () => {
  const g = [{ id: 1, ts: 1, claimedBy: 'a' }, { id: 2, ts: 2 }, { id: 3, ts: 3, claimedBy: 'b' }];
  assert.deepEqual(groceryFor(g, 'a').map((x) => x.id), [1]);
  assert.deepEqual(groceryFor(g, 'free').map((x) => x.id), [2]);
  assert.deepEqual(groceryFor(g, 'all').map((x) => x.id), [1, 2, 3]);
});

test('addGrocery merges same item into one line (qty+1) across people', () => {
  let g = [];
  g = addGrocery(g, 'rice', 'a', 100, () => 'x1');
  g = addGrocery(g, 'rice', 'b', 200, () => 'x2');
  g = addGrocery(g, 'oil', 'b', 300, () => 'x3');
  assert.equal(g.length, 2);
  const rice = g.find((x) => x.item === 'rice');
  assert.equal(rice.qty, 2);
  assert.deepEqual(rice.addedBy, ['a', 'b']);
});

test('addGrocery starts a new line if the old one was already bought', () => {
  let g = [{ id: 'old', item: 'rice', qty: 1, addedBy: ['a'], ts: 1, bought: true }];
  g = addGrocery(g, 'rice', 'a', 5, () => 'new');
  assert.equal(g.length, 2);
  assert.equal(g.find((x) => x.id === 'new').qty, 1);
});

test('billStatus: paid this month / late / due soon / ok', () => {
  const bill = { id: 'b1', dueDay: 10 };
  const paid = [{ billId: 'b1', ts: d('2026-11-03'), type: 'out' }];
  assert.equal(billStatus(bill, paid, d('2026-11-13')), 'paid');
  assert.equal(billStatus(bill, [], d('2026-11-13')), 'late');
  assert.equal(billStatus(bill, [], d('2026-10-28')), 'due'); // 6 Aqrab
  assert.equal(billStatus(bill, [], d('2026-10-23')), 'ok'); // 1 Aqrab
  const lastMonth = [{ billId: 'b1', ts: d('2026-10-20'), type: 'out' }]; // Mizan
  assert.equal(billStatus(bill, lastMonth, d('2026-11-13')), 'late');
  const deleted = [{ billId: 'b1', ts: d('2026-11-03'), type: 'out', deleted: true }];
  assert.equal(billStatus(bill, deleted, d('2026-11-13')), 'late');
});

test('faDigits converts Western digits to Persian', () => {
  assert.equal(faDigits('2026'), '۲۰۲۶');
});

test('money formats with Persian digits and currency sign', () => {
  assert.equal(money(12500, 'AFN'), '۱۲٬۵۰۰ ؋');
  assert.equal(money(40, 'USD'), '۴۰ $');
});

// ---------- Phase 1 ----------
import { roleOf, canTab, cashBalances, lastPrice, linesTotal, visibleTxns } from '../logic.js';

test('roles: old "member" counts as earner; unknown → helper', () => {
  assert.equal(roleOf({ role: 'admin' }), 'admin');
  assert.equal(roleOf({ role: 'member' }), 'earner');
  assert.equal(roleOf({ role: 'earner' }), 'earner');
  assert.equal(roleOf({ role: 'helper' }), 'helper');
  assert.equal(roleOf({}), 'helper');
  assert.equal(roleOf(undefined), 'helper');
});

test('helper sees only grocery; earner no report; admin all', () => {
  assert.deepEqual(['grocery', 'money', 'bills', 'report'].filter((t) => canTab('helper', t)), ['grocery']);
  assert.deepEqual(['grocery', 'money', 'bills', 'report'].filter((t) => canTab('earner', t)), ['grocery', 'money', 'bills']);
  assert.deepEqual(['grocery', 'money', 'bills', 'report'].filter((t) => canTab('admin', t)), ['grocery', 'money', 'bills', 'report']);
});

test('cash in hand = given − returned − spent from hand (per currency, ignores deleted)', () => {
  const cash = [
    { id: 'c1', kind: 'give', from: 'baba', to: 'ali', amount: 5000, currency: 'AFN' },
    { id: 'c2', kind: 'give', from: 'baba', to: 'ali', amount: 1000, currency: 'AFN', deleted: true },
    { id: 'c3', kind: 'return', from: 'ali', to: 'baba', amount: 700, currency: 'AFN' },
    { id: 'c4', kind: 'give', from: 'baba', to: 'mama', amount: 20, currency: 'USD' },
  ];
  const txns = [
    { id: 't1', type: 'out', amount: 3800, currency: 'AFN', by: 'ali', paidFrom: 'hand' },
    { id: 't2', type: 'out', amount: 999, currency: 'AFN', by: 'ali' },                       // not from hand
    { id: 't3', type: 'out', amount: 100, currency: 'AFN', by: 'ali', paidFrom: 'hand', deleted: true },
  ];
  assert.deepEqual(cashBalances(cash, txns, 'AFN'), { ali: 500 });
  assert.deepEqual(cashBalances(cash, txns, 'USD'), { mama: 20 });
});

test('lastPrice: newest bought line with a price for that item', () => {
  const g = [
    { item: 'rice', bought: true, boughtTs: 1, price: 3000, unit: 'sack' },
    { item: 'rice', bought: true, boughtTs: 5, price: 3200, unit: 'sack' },
    { item: 'rice', bought: true, boughtTs: 9 },                    // no price recorded
    { item: 'rice', bought: false, price: 9999 },
    { item: 'oil', bought: true, boughtTs: 7, price: 800, deleted: true },
  ];
  assert.deepEqual(lastPrice(g, 'rice'), { price: 3200, unit: 'sack', ts: 5 });
  assert.equal(lastPrice(g, 'oil'), null);
});

test('linesTotal sums recorded prices', () => {
  assert.equal(linesTotal([{ price: 3200 }, { price: 800 }, {}]), 4000);
});

test('visibleTxns: admin all, others only their own', () => {
  const t = [{ id: 1, by: 'a' }, { id: 2, by: 'b' }];
  assert.deepEqual(visibleTxns(t, 'admin', 'a').map((x) => x.id), [1, 2]);
  assert.deepEqual(visibleTxns(t, 'earner', 'a').map((x) => x.id), [1]);
  assert.deepEqual(visibleTxns(t, 'helper', 'b').map((x) => x.id), [2]);
});
