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

test('money shows the currency as a Dari word: افغانی / دالر', () => {
  assert.equal(money(12500, 'AFN'), '۱۲٬۵۰۰ افغانی');
  assert.equal(money(40, 'USD'), '۴۰ دالر');
});

// ---------- Phase 1 ----------
import { roleOf, canTab, cashBalances, lastPrice, linesTotal, visibleTxns } from '../logic.js';

test('roles: only admin and earner; everything else counts as earner', () => {
  assert.equal(roleOf({ role: 'admin' }), 'admin');
  for (const r of ['member', 'earner', 'helper', 'orderer', 'xyz']) assert.equal(roleOf({ role: r }), 'earner');
  assert.equal(roleOf({}), 'earner');
  assert.equal(roleOf(undefined), 'earner');
});

test('earner: money and loans; admin also the admin door; no grocery or bills tab', () => {
  assert.deepEqual(['grocery', 'money', 'loans', 'bills', 'admin'].filter((t) => canTab('earner', t)), ['money', 'loans']);
  assert.deepEqual(['grocery', 'money', 'loans', 'bills', 'admin'].filter((t) => canTab('admin', t)), ['money', 'loans', 'admin']);
  assert.equal(canTab('earner', 'admin'), false);
  assert.equal(canTab('helper', 'grocery'), false);
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

// ---------- Phase 2 ----------
import { loansView, jarTotals, abroadSummary } from '../logic.js';

test('loans tab: admin and earner', () => {
  assert.equal(canTab('admin', 'loans'), true);
  assert.equal(canTab('earner', 'loans'), true);
});

test('loansView: remaining per loan, open totals per direction and currency', () => {
  const r = [
    { id: 'L1', kind: 'loan', dir: 'lent', who: 'uncle', amount: 10000, currency: 'AFN', ts: 1, by: 'baba' },
    { id: 'P1', kind: 'pay', loanId: 'L1', amount: 4000, ts: 2, by: 'baba' },
    { id: 'P2', kind: 'pay', loanId: 'L1', amount: 1000, ts: 3, by: 'baba', deleted: true },
    { id: 'L2', kind: 'loan', dir: 'borrowed', who: 'shop', amount: 3000, currency: 'AFN', ts: 4, by: 'ali' },
    { id: 'P3', kind: 'pay', loanId: 'L2', amount: 3000, ts: 5, by: 'ali' },
    { id: 'L3', kind: 'loan', dir: 'borrowed', who: 'neighbor', amount: 50, currency: 'USD', ts: 6, by: 'baba' },
  ];
  const v = loansView(r, 'AFN');
  assert.deepEqual(v.loans.map((l) => [l.id, l.left, l.done]), [['L2', 0, true], ['L1', 6000, false]]);
  assert.deepEqual(v.open, { lent: 6000, borrowed: 0 });
  assert.deepEqual(loansView(r, 'USD').open, { lent: 0, borrowed: 50 });
});

test('loansView only for one person (non-admin sees loans they wrote)', () => {
  const r = [
    { id: 'L1', kind: 'loan', dir: 'lent', who: 'u', amount: 5, currency: 'AFN', ts: 1, by: 'baba' },
    { id: 'L2', kind: 'loan', dir: 'lent', who: 'u', amount: 7, currency: 'AFN', ts: 2, by: 'ali' },
  ];
  assert.deepEqual(loansView(r, 'AFN', 'ali').loans.map((l) => l.id), ['L2']);
});

test('jarTotals: deposits minus withdrawals per jar, per currency', () => {
  const r = [
    { id: 'J1', kind: 'jar', goal: 'wedding', target: 200000, currency: 'AFN' },
    { id: 'm1', kind: 'move', jarId: 'J1', amount: 50000 },
    { id: 'm2', kind: 'move', jarId: 'J1', amount: -10000 },
    { id: 'm3', kind: 'move', jarId: 'J1', amount: 999, deleted: true },
  ];
  assert.deepEqual(jarTotals(r), { J1: 40000 });
});

test('abroadSummary: money from abroad this month, fees, by sender', () => {
  const tx = [
    { type: 'in', cat: 'abroad', from: 'son', amount: 20000, fee: 500, currency: 'AFN', ts: Date.parse('2026-11-05T12:00') },
    { type: 'in', cat: 'abroad', from: 'son', amount: 10000, fee: 0, currency: 'AFN', ts: Date.parse('2026-11-10T12:00') },
    { type: 'in', cat: 'abroad', from: 'bro', amount: 5000, currency: 'AFN', ts: Date.parse('2026-11-11T12:00') },
    { type: 'in', cat: 'salary', amount: 9, currency: 'AFN', ts: Date.parse('2026-11-11T12:00') },
    { type: 'in', cat: 'abroad', from: 'son', amount: 1, currency: 'AFN', ts: Date.parse('2026-11-11T12:00'), deleted: true },
  ];
  assert.deepEqual(abroadSummary(tx, 'AFN', '1405-08'), { total: 35000, fees: 500, bySender: { son: 30000, bro: 5000 } });
});

// ---------- Phase 3 ----------
import { nextLevel, pantryOrder, monthCompare, jarsMonthNet, billsMonth, pocketBalance } from '../logic.js';

test('pantry level cycles: not tracked → full → half → empty → not tracked', () => {
  assert.equal(nextLevel(undefined), 'full');
  assert.equal(nextLevel(null), 'full');
  assert.equal(nextLevel('full'), 'half');
  assert.equal(nextLevel('half'), 'empty');
  assert.equal(nextLevel('empty'), null);
});

test('pantry order: empty first, then half, full, untracked; keeps catalog order inside', () => {
  const c = [{ id: 'a' }, { id: 'b', stock: 'full' }, { id: 'c', stock: 'empty' }, { id: 'd', stock: 'half' }, { id: 'e', stock: 'empty' }];
  assert.deepEqual(pantryOrder(c).map((x) => x.id), ['c', 'e', 'd', 'b', 'a']);
});

test('monthCompare: spending per category this month vs last month, biggest first', () => {
  const t = (cat, amount, d) => ({ type: 'out', cat, amount, currency: 'AFN', ts: Date.parse(d + 'T12:00') });
  const tx = [t('food', 8000, '2026-11-05'), t('food', 6000, '2026-10-10'), t('power', 1000, '2026-11-02'),
    t('power', 1500, '2026-10-02'), t('health', 500, '2026-10-05')];
  assert.deepEqual(monthCompare(tx, 'AFN', '1405-08'), [
    { cat: 'food', now: 8000, prev: 6000 },
    { cat: 'power', now: 1000, prev: 1500 },
    { cat: 'health', now: 0, prev: 500 },
  ]);
});

test('jarsMonthNet: money put in minus taken out of jars this month', () => {
  const j = [
    { kind: 'jar', id: 'J1', currency: 'AFN' }, { kind: 'jar', id: 'J2', currency: 'USD' },
    { kind: 'move', jarId: 'J1', amount: 5000, ts: Date.parse('2026-11-03T12:00') },
    { kind: 'move', jarId: 'J1', amount: -1000, ts: Date.parse('2026-11-04T12:00') },
    { kind: 'move', jarId: 'J1', amount: 9999, ts: Date.parse('2026-10-01T12:00') },
    { kind: 'move', jarId: 'J2', amount: 50, ts: Date.parse('2026-11-04T12:00') },
  ];
  assert.equal(jarsMonthNet(j, 'AFN', '1405-08'), 4000);
});

test('billsMonth: how many bills are paid / late now', () => {
  const bills = [{ id: 'b1', dueDay: 5 }, { id: 'b2', dueDay: 10 }, { id: 'b3', dueDay: 30 }, { id: 'b4', dueDay: 1, deleted: true }];
  const tx = [{ billId: 'b1', ts: Date.parse('2026-11-01T12:00') }];
  assert.deepEqual(billsMonth(bills, tx, Date.parse('2026-11-13T12:00')), { total: 3, paid: 1, late: 1 });
});

test('pocketBalance per currency, ignores deleted', () => {
  const e = [{ type: 'in', amount: 3000, currency: 'AFN' }, { type: 'out', amount: 500, currency: 'AFN' },
    { type: 'out', amount: 100, currency: 'AFN', deleted: true }, { type: 'in', amount: 20, currency: 'USD' }];
  assert.equal(pocketBalance(e, 'AFN'), 2500);
  assert.equal(pocketBalance(e, 'USD'), 20);
});

// ---------- new item picker ----------
import { searchPicker } from '../logic.js';

test('searchPicker finds pictures by typed Dari name (Arabic ی/ک spellings too)', () => {
  const lib = [{ icon: '🍇', name: 'انگور' }, { icon: '🍉', name: 'تربوز' }, { icon: '🧼', name: 'صابون' }, { icon: '🍪', name: 'کلچه / بیسکویت' }];
  assert.deepEqual(searchPicker(lib, 'انگ').map((x) => x.icon), ['🍇']);
  assert.deepEqual(searchPicker(lib, 'كلچه').map((x) => x.icon), ['🍪']);       // Arabic kaf
  assert.deepEqual(searchPicker(lib, 'بیسکویت').map((x) => x.icon), ['🍪']);
  assert.equal(searchPicker(lib, '').length, 4);                                     // empty → all
  assert.equal(searchPicker(lib, '  ').length, 4);
  assert.deepEqual(searchPicker(lib, 'xyz'), []);
});

// ---------- custom money categories ----------
import { findCat, catsFor } from '../logic.js';

test('findCat: built-in first, then the family\'s own categories, else "other"', () => {
  const base = { in: [{ id: 'salary', icon: '💼', name: 'معاش' }], out: [{ id: 'food', icon: '🛒', name: 'سودا' }] };
  const custom = [{ id: 'c1', type: 'in', icon: '🧶', name: 'قالین‌بافی' }, { id: 'c2', type: 'out', icon: '⛽', name: 'تیل', deleted: true }];
  assert.equal(findCat(base, custom, 'in', 'salary').name, 'معاش');
  assert.equal(findCat(base, custom, 'in', 'c1').name, 'قالین‌بافی');
  assert.equal(findCat(base, custom, 'out', 'c1').icon, '❓');          // income category not used for spending
  assert.equal(findCat(base, custom, 'out', 'c2').name, 'تیل');          // deleted still names old entries
  assert.deepEqual(findCat(base, custom, 'out', 'nope'), { id: 'nope', icon: '❓', name: '' });
});

test('catsFor: built-in plus own (not deleted) for that side, own ones after', () => {
  const base = { in: [{ id: 'salary' }], out: [{ id: 'food' }] };
  const custom = [{ id: 'c1', type: 'in', ts: 2 }, { id: 'c0', type: 'in', ts: 1 }, { id: 'c2', type: 'out', ts: 3 }, { id: 'c3', type: 'in', ts: 4, deleted: true }];
  assert.deepEqual(catsFor(base, custom, 'in').map((c) => c.id), ['salary', 'c0', 'c1']);
});

// ---------- pop-up redraw: slide in once, keep scroll ----------
import { sheetEnters } from '../logic.js';

test('pop-up slides in only when it first opens or changes kind', () => {
  assert.equal(sheetEnters(null, 'tx'), true);       // opened
  assert.equal(sheetEnters('tx', 'tx'), false);      // tap inside: no replay, keys stay put
  assert.equal(sheetEnters('tx', 'catNew'), true);   // moved to another pop-up
  assert.equal(sheetEnters('tx', null), false);      // closed
  assert.equal(sheetEnters(null, null), false);
});

// ---------- role button ----------
import { canBuy, nextRole } from '../logic.js';

test('everyone can buy', () => {
  for (const r of ['admin', 'earner', 'helper', 'orderer']) assert.equal(canBuy(r), true);
});

test('admin role button switches earner ↔ admin', () => {
  assert.equal(nextRole('earner'), 'admin');
  assert.equal(nextRole('admin'), 'earner');
  assert.equal(nextRole('helper'), 'earner');
  assert.equal(nextRole('orderer'), 'earner');
});

// ---------- buy everything, then one total ----------
import { buyLines } from '../logic.js';

test('buyLines marks every open line bought by me, skips done or deleted ones', () => {
  const g = [
    { id: 'a', item: 'rice', qty: 1, addedBy: ['x'] },
    { id: 'b', item: 'oil', qty: 2, addedBy: ['x'] },
    { id: 'c', item: 'tea', qty: 1, addedBy: ['x'], bought: true, boughtBy: 'y', boughtTs: 5 },
    { id: 'd', item: 'salt', qty: 1, addedBy: ['x'], deleted: true },
  ];
  const n = buyLines(g, ['a', 'b', 'c', 'd'], 'me', 100);
  assert.equal(n, 2);
  assert.deepEqual(g.filter((x) => x.bought && x.boughtBy === 'me').map((x) => x.id), ['a', 'b']);
  assert.equal(g[0].boughtTs, 100);
  assert.equal(g[2].boughtBy, 'y');      // already bought by someone else: untouched
  assert.ok(!g[3].bought);
});

// ---------- plain-text report and list for WhatsApp ----------
import { reportText, listText } from '../logic.js';

test('reportText: month money summary as plain Dari text', () => {
  const ts = new Date('2026-11-10T12:00:00').getTime();
  const txns = [
    { type: 'in', amount: 20000, currency: 'AFN', ts, by: 'a', cat: 'salary' },
    { type: 'out', amount: 1500, currency: 'AFN', ts, by: 'a', cat: 'food' },
    { type: 'out', amount: 500, currency: 'AFN', ts, by: 'b', cat: 'bills' },
    { type: 'out', amount: 9, currency: 'USD', ts, by: 'b', cat: 'food' },          // other currency: left out
    { type: 'out', amount: 7, currency: 'AFN', ts, by: 'b', cat: 'food', deleted: true },
  ];
  const t = reportText({ txns, currency: 'AFN', month: monthKey(ts), cat: (id) => ({ food: ['🛒', 'سودا'], bills: ['🧾', 'بل'] }[id]), person: (id) => ({ a: 'بابه', b: 'مادر' }[id]) });
  assert.match(t, /^📊 حساب خانواده — /);
  assert.ok(t.includes('⬇️ آمد: ۲۰٬۰۰۰ افغانی'));
  assert.ok(t.includes('⬆️ مصرف: ۲٬۰۰۰ افغانی'));
  assert.ok(t.includes('🟢 باقی: ۱۸٬۰۰۰ افغانی'));
  assert.ok(t.indexOf('🛒 سودا: ۱٬۵۰۰ افغانی') < t.indexOf('🧾 بل: ۵۰۰ افغانی'));   // biggest first
  assert.ok(t.includes('بابه: ⬇️ ۲۰٬۰۰۰ افغانی ⬆️ ۱٬۵۰۰ افغانی'));
  assert.ok(!t.includes('دالر'));
});

test('reportText: spending more than income shows 🔴 کم', () => {
  const ts = new Date('2026-11-10T12:00:00').getTime();
  const t = reportText({ txns: [{ type: 'out', amount: 300, currency: 'AFN', ts, by: 'a', cat: 'food' }], currency: 'AFN', month: monthKey(ts), cat: () => ['🛒', 'سودا'], person: () => 'بابه' });
  assert.ok(t.includes('🔴 کم: ۳۰۰ افغانی'));
});

test('listText: open grocery lines with amount and unit', () => {
  const g = [
    { id: '1', item: 'rice', qty: 2, ts: 1, addedBy: [] },
    { id: '2', item: 'oil', qty: 1, ts: 2, addedBy: [] },
    { id: '3', item: 'tea', qty: 1, ts: 3, addedBy: [], bought: true },
  ];
  const t = listText(g, (x) => ({ rice: 'برنج', oil: 'روغن' }[x.item]), (x) => ({ rice: 'بوری', oil: 'بوتل' }[x.item]));
  assert.equal(t, '🛒 لست سودا\n\n▫️ برنج — ۲ بوری\n▫️ روغن — ۱ بوتل');
  assert.equal(listText([], () => '', () => ''), '🛒 لست سودا\n\n—');
});

// ---------- every person has a PIN ----------
import { needsPin } from '../logic.js';

test('choosing who you are asks the PIN, unless it is already you or no PIN set yet', () => {
  assert.equal(needsPin({ id: 'a', pin: { salt: 's', hash: 'h' } }, 'b'), true);
  assert.equal(needsPin({ id: 'a', pin: { salt: 's', hash: 'h' } }, 'a'), false);
  assert.equal(needsPin({ id: 'a', pin: null }, 'b'), false);
  assert.equal(needsPin({ id: 'a' }, null), false);
  assert.equal(needsPin(undefined, null), false);
});

import { navTabs } from '../logic.js';
test('bottom bar: front places for everyone, one admin door last (admin only)', () => {
  assert.deepEqual(navTabs('admin'), ['money', 'loans', 'admin']);
  assert.deepEqual(navTabs('earner'), ['money', 'loans']);
  assert.deepEqual(navTabs('nobody'), ['money', 'loans']);
  assert.ok(navTabs('admin').length <= 5);
});

// ---------- loan book + month carry-over ----------
import { loanFlows, monthCash, loanLedger, loanStatement, loanTotals, ledgerText } from '../logic.js';

const AQRAB = d('2026-11-13'), MIZAN = d('2026-10-10'), QAWS = d('2026-12-10');
const LOANS = [
  { id: 'L1', kind: 'loan', dir: 'borrowed', who: 'c1', amount: 10000, currency: 'AFN', for: 'house', note: 'سقف', ts: MIZAN },
  { id: 'P1', kind: 'pay', loanId: 'L1', amount: 3000, note: 'نقد', ts: AQRAB },
  { id: 'P2', kind: 'pay', loanId: 'L1', amount: 2000, ts: QAWS, noTime: true },
  { id: 'L2', kind: 'loan', dir: 'lent', who: 'c2', amount: 4000, currency: 'AFN', for: 'wedding', ts: AQRAB },
  { id: 'P3', kind: 'pay', loanId: 'L2', amount: 4000, ts: QAWS },
  { id: 'L3', kind: 'loan', dir: 'lent', who: 'c1', amount: 500, currency: 'USD', ts: AQRAB },
  { id: 'L4', kind: 'loan', dir: 'lent', who: 'c3', amount: 999, currency: 'AFN', ts: AQRAB, deleted: true },
  { id: 'P4', kind: 'pay', loanId: 'L4', amount: 999, ts: AQRAB },
];

test('loanFlows: borrowing = money in, paying back = out; lending = out, getting paid = in', () => {
  const f = loanFlows(LOANS, 'AFN');
  assert.deepEqual(f.map((x) => [x.dir, x.amount]), [['in', 10000], ['out', 3000], ['out', 4000], ['out', 2000], ['in', 4000]]);
});

test('monthCash: leftover carries to next month, overspending carries as minus, loans counted separately', () => {
  const txns = [
    { type: 'in', amount: 1000, currency: 'AFN', ts: MIZAN },
    { type: 'out', amount: 9000, currency: 'AFN', ts: MIZAN },
    { type: 'out', amount: 2500, currency: 'AFN', ts: AQRAB },
    { type: 'in', amount: 777, currency: 'AFN', ts: MIZAN, deleted: true },
    { type: 'in', amount: 50, currency: 'USD', ts: MIZAN },
  ];
  const mizan = monthCash(txns, LOANS, 'AFN', monthKey(MIZAN));
  // borrowing 10,000 (L1) is a debt, not money in hand
  assert.deepEqual(mizan, { opening: 0, in: 1000, out: 9000, loanPaid: 0, lent: 0, repaid: 0, closing: -8000 });
  const aqrab = monthCash(txns, LOANS, 'AFN', monthKey(AQRAB));
  // paid 3,000 on our debt (P1) and lent 4,000 (L2) — both leave our hand
  assert.deepEqual(aqrab, { opening: -8000, in: 0, out: 2500, loanPaid: 3000, lent: 4000, repaid: 0, closing: -17500 });
  const qaws = monthCash(txns, LOANS, 'AFN', monthKey(QAWS));
  assert.equal(qaws.opening, -17500);
  assert.equal(qaws.repaid, 4000);              // they paid us back (P3)
  assert.equal(qaws.loanPaid, 0);               // P2 was entered with an older date (noTime): history, not cash
  assert.equal(qaws.closing, -17500 + 4000);
  assert.deepEqual(loanFlows(LOANS, 'AFN', true).map((x) => x.amount), [10000, 3000, 4000, 4000]);
  assert.equal(monthCash(txns, LOANS, 'USD', monthKey(AQRAB)).opening, 50);
});

test('loanStatement: total, each dated payment with balance after it, paid and left', () => {
  const st = loanStatement(LOANS, 'L1');
  assert.deepEqual([st.total, st.paid, st.left, st.for], [10000, 5000, 5000, 'house']);
  assert.deepEqual(st.pays.map((x) => [x.amount, x.note, x.leftAfter, x.noTime]), [[3000, 'نقد', 7000, false], [2000, null, 5000, true]]);
  assert.equal(loanStatement(LOANS, 'L4'), null);   // deleted
  assert.equal(loanStatement(LOANS, 'L2').left, 0);
});

test('loanLedger: per person statements, got/gave totals and what is still open', () => {
  const L = loanLedger(LOANS, 'AFN');
  assert.deepEqual(L.total, { got: 14000, gave: 9000, weOwe: 5000, theyOwe: 0 });
  const c1 = L.people.find((p) => p.who === 'c1');
  assert.deepEqual(c1.loans.map((st) => [st.loan.id, st.total, st.paid, st.left]), [['L1', 10000, 5000, 5000]]);
  assert.deepEqual([c1.got, c1.gave, c1.weOwe, c1.theyOwe], [10000, 5000, 5000, 0]);
  const c2 = L.people.find((p) => p.who === 'c2');
  assert.deepEqual([c2.got, c2.gave, c2.theyOwe], [4000, 4000, 0]);
  assert.equal(L.people[0].who, 'c1');   // biggest open debt first
  assert.equal(L.people.some((p) => p.who === 'c3'), false);   // deleted loan and its payment hidden
  assert.equal(loanLedger(LOANS, 'USD').total.theyOwe, 500);
});

test('ledgerText: WhatsApp text: each loan, its dated payments with balance after, and totals', () => {
  const t = ledgerText(loanLedger(LOANS, 'AFN'), 'AFN', {
    name: (id) => ({ c1: 'کاکا', c2: 'همسایه' }[id]), forName: (id) => ({ house: ['🏠', 'خانه'], wedding: ['💍', 'عروسی'] }[id]), date: () => 'روز' });
  assert.match(t, /👤 کاکا/);
  assert.match(t, /📥 قرض گرفتیم · روز · 🏠 خانه · سقف/);
  assert.match(t, /💵 روز · پس دادیم .* · نقد → باقی /);
  assert.match(t, /پس دادیم: .* · باقی: /);
  assert.match(t, /👤 همسایه[\s\S]*✅ حساب صاف/);
});

test('reportText with cash: shows carry-in, loan money and what goes to next month', () => {
  const ts = AQRAB;
  const t = reportText({ txns: [{ type: 'out', amount: 100, currency: 'AFN', ts, by: 'a', cat: 'food' }], currency: 'AFN', month: monthKey(ts),
    cat: () => ['🛒', 'سودا'], person: () => 'بابه', cash: { opening: -50, in: 0, out: 100, loanPaid: 200, lent: 0, repaid: 1000, closing: 650 } });
  assert.match(t, /↪️ از ماه قبل: − /);
  assert.match(t, /🤝 قرض پس دادیم: − /);
  assert.match(t, /💵 قرض پس آوردند: \+ /);
  assert.doesNotMatch(t, /📤 قرض دادیم/);
  assert.match(t, /🟢 باقی: .* \(به ماه بعد\)/);
});

test('loanTotals: borrowed and lent each have total · paid · left, overall and per person', () => {
  const t = loanTotals(LOANS, 'AFN');
  assert.deepEqual(t.borrowed, { total: 10000, paid: 5000, left: 5000 });
  assert.deepEqual(t.lent, { total: 4000, paid: 4000, left: 0 });
  assert.deepEqual(t.people.map((p) => [p.who, p.borrowed.left, p.lent.total]), [['c1', 5000, 0], ['c2', 0, 4000]]);
  assert.deepEqual(loanTotals(LOANS, 'USD').lent, { total: 500, paid: 0, left: 500 });
});

import { parseInvite } from '../logic.js';
test('parseInvite: finds the family in a pasted invite link, ignores anything else', () => {
  const link = 'https://allgomartinc-maker.github.io/family-finance/#join=abcdefghjk23456789mn.pqrstuvwxyz23456789abcde';
  assert.deepEqual(parseInvite(link), { fid: 'abcdefghjk23456789mn', code: 'pqrstuvwxyz23456789abcde' });
  assert.deepEqual(parseInvite(`سلام! ${link} ← این را باز کن`), { fid: 'abcdefghjk23456789mn', code: 'pqrstuvwxyz23456789abcde' });
  assert.equal(parseInvite('https://allgomartinc-maker.github.io/family-finance/'), null);
  assert.equal(parseInvite('#join=short.code'), null);
  assert.equal(parseInvite(''), null);
});
