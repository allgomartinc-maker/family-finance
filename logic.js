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
