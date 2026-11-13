// Pure logic — no DOM. Tested in tests/logic.test.mjs

// Afghan solar (Hijri Shamsi) calendar: months are Hamal..Hut, year starts at Nawroz.
const SOLAR = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
const solar = (ts) => {
  const p = Object.fromEntries(SOLAR.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
};
const pad = (n) => String(n).padStart(2, '0');

export const monthKey = (ts) => { const s = solar(ts); return `${s.y}-${pad(s.m)}`; };
export const solarDay = (ts) => solar(ts).d;

export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

export const MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
export const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${MONTHS[+m - 1]} ${faDigits(y)}`;
};

export function totals(txns, currency, month) {
  const t = { in: 0, out: 0, net: 0, byCat: {}, byPerson: {} };
  for (const x of txns) {
    if (x.deleted || x.currency !== currency || monthKey(x.ts) !== month) continue;
    t[x.type] += x.amount;
    if (x.type === 'out') t.byCat[x.cat] = (t.byCat[x.cat] || 0) + x.amount;
    const p = (t.byPerson[x.by] ||= { in: 0, out: 0 });
    p[x.type] += x.amount;
  }
  t.net = t.in - t.out;
  return t;
}

export const activeGrocery = (g) =>
  g.filter((x) => !x.bought && !x.deleted).sort((a, b) => a.ts - b.ts);

export function groceryFor(g, who) {
  const list = activeGrocery(g);
  if (who === 'all') return list;
  if (who === 'free') return list.filter((x) => !x.claimedBy);
  return list.filter((x) => x.claimedBy === who);
}

// Same item already on the open list → qty+1 and remember who asked for it.
export function addGrocery(g, item, by, ts, newId) {
  const open = g.find((x) => x.item === item && !x.bought && !x.deleted);
  if (open) {
    return g.map((x) => x === open
      ? { ...x, qty: x.qty + 1, addedBy: x.addedBy.includes(by) ? x.addedBy : [...x.addedBy, by] }
      : x);
  }
  return [...g, { id: newId(), item, qty: 1, addedBy: [by], ts }];
}

// bill.dueDay = day of the solar month.
// 'paid' (paid this month) | 'late' (past due day) | 'due' (≤5 days left) | 'ok'
export function billStatus(bill, txns, now) {
  const m = monthKey(now);
  if (txns.some((x) => x.billId === bill.id && !x.deleted && monthKey(x.ts) === m)) return 'paid';
  const day = solarDay(now);
  if (day > bill.dueDay) return 'late';
  if (bill.dueDay - day <= 5) return 'due';
  return 'ok';
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = (s) => String(s).replace(/[0-9]/g, (c) => FA[c]);

const nf = new Intl.NumberFormat('fa-AF', { maximumFractionDigits: 2 });
export const money = (n, cur) => `${nf.format(n)} ${cur === 'USD' ? '$' : '؋'}`;

// ---------- roles ----------
// admin: everything (PIN) · earner: groceries, own money, bills · helper: groceries only.
export const roleOf = (m) => (m?.role === 'admin' ? 'admin' : m?.role === 'earner' || m?.role === 'member' ? 'earner' : 'helper');
const TABS = { admin: ['grocery', 'money', 'bills', 'report'], earner: ['grocery', 'money', 'bills'], helper: ['grocery'] };
export const canTab = (role, tab) => (TABS[role] || TABS.helper).includes(tab);
export const visibleTxns = (txns, role, me) => (role === 'admin' ? txns : txns.filter((x) => x.by === me));

// ---------- cash in hand (خرچی) ----------
// Money handed to a person for shopping. Giving is not spending: it becomes spending
// only when that person records an expense "from hand".
export function cashBalances(cash, txns, currency) {
  const b = {};
  const add = (p, n) => { b[p] = (b[p] || 0) + n; };
  for (const c of cash) {
    if (c.deleted || c.currency !== currency) continue;
    if (c.kind === 'give') add(c.to, c.amount);
    if (c.kind === 'return') add(c.from, -c.amount);
  }
  for (const x of txns) {
    if (!x.deleted && x.type === 'out' && x.paidFrom === 'hand' && x.currency === currency) add(x.by, -x.amount);
  }
  for (const k of Object.keys(b)) if (b[k] === 0) delete b[k];
  return b;
}

// ---------- prices ----------
export function lastPrice(grocery, item) {
  const hit = grocery
    .filter((x) => x.item === item && x.bought && !x.deleted && x.price > 0)
    .sort((a, b) => b.boughtTs - a.boughtTs)[0];
  return hit ? { price: hit.price, unit: hit.unit, ts: hit.boughtTs } : null;
}
export const linesTotal = (lines) => lines.reduce((s, x) => s + (x.price > 0 ? x.price : 0), 0);
