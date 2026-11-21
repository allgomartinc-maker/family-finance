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
export const CUR_NAME = { AFN: 'افغانی', USD: 'دالر' };
export const money = (n, cur) => `${nf.format(n)} ${CUR_NAME[cur] || CUR_NAME.AFN}`;

// ---------- roles ----------
// admin: everything (PIN) · earner: own money and loans.
// Old roles (member, helper, orderer) are read as earner.
export const roleOf = (m) => (m?.role === 'admin' ? 'admin' : 'earner');
const TABS = { admin: ['money', 'loans', 'admin'], earner: ['money', 'loans'] };
export const canBuy = () => true;
export const nextRole = (role) => (role === 'earner' ? 'admin' : 'earner');
export const canTab = (role, tab) => (TABS[role] || TABS.earner).includes(tab);
// Bottom bar order: front places first, the admin door (🗝️) always last.
export const navTabs = (role) => [...(TABS[role] || TABS.earner)];
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

// Mark open list lines as bought in one go; the total cost is asked once afterwards. Returns how many.
export function buyLines(grocery, ids, by, ts) {
  let n = 0;
  for (const x of grocery) {
    if (!ids.includes(x.id) || x.bought || x.deleted) continue;
    x.bought = true; x.boughtBy = by; x.boughtTs = ts; n++;
  }
  return n;
}

// ---------- qarz (family loans) ----------
// records: { kind:'loan', dir:'lent'|'borrowed', who, amount, currency, ts, by } and { kind:'pay', loanId, amount }.
// Loans are not income or spending; they are tracked on their own.
export function loansView(records, currency, onlyBy = null) {
  const paid = {};
  for (const r of records) if (r.kind === 'pay' && !r.deleted) paid[r.loanId] = (paid[r.loanId] || 0) + r.amount;
  const loans = records
    .filter((r) => r.kind === 'loan' && !r.deleted && r.currency === currency && (!onlyBy || r.by === onlyBy))
    .map((r) => { const left = Math.max(0, r.amount - (paid[r.id] || 0)); return { ...r, paid: paid[r.id] || 0, left, done: left === 0 }; })
    .sort((a, b) => b.ts - a.ts);
  const open = { lent: 0, borrowed: 0 };
  for (const l of loans) open[l.dir] += l.left;
  return { loans, open };
}

// ---------- loan book ----------
// Loans move real cash: borrowing brings money in, paying it back sends it out; lending is the reverse.
// Payments belong to their loan (currency, person, purpose); payments of a deleted loan are ignored.
// cashOnly: skip entries made with an older picked date (noTime) — old debts are history, not today's cash.
export function loanFlows(records, currency, cashOnly = false) {
  const loans = {};
  for (const r of records) if (r.kind === 'loan' && !r.deleted && r.currency === currency) loans[r.id] = r;
  const out = [];
  for (const r of records) {
    if (r.deleted || (cashOnly && r.noTime)) continue;
    if (r.kind === 'loan' && loans[r.id]) out.push({ ts: r.ts, dir: r.dir === 'borrowed' ? 'in' : 'out', amount: r.amount, loan: r, pay: null });
    if (r.kind === 'pay' && loans[r.loanId]) {
      const l = loans[r.loanId];
      out.push({ ts: r.ts, dir: l.dir === 'borrowed' ? 'out' : 'in', amount: r.amount, loan: l, pay: r });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

// One month of cash: what was left from before (opening), this month's real income/spending,
// loan money in/out, and what is left to carry into next month (closing). Overspending carries as minus.
export function monthCash(txns, loans, currency, month) {
  const r = { opening: 0, in: 0, out: 0, loanIn: 0, loanOut: 0, closing: 0 };
  const add = (ts, isIn, amount, inKey, outKey) => {
    const k = monthKey(ts);
    if (k < month) r.opening += isIn ? amount : -amount;
    else if (k === month) r[isIn ? inKey : outKey] += amount;
  };
  for (const x of txns) if (!x.deleted && x.currency === currency) add(x.ts, x.type === 'in', x.amount, 'in', 'out');
  for (const f of loanFlows(loans, currency, true)) add(f.ts, f.dir === 'in', f.amount, 'loanIn', 'loanOut');
  r.closing = r.opening + r.in + r.loanIn - r.out - r.loanOut;
  return r;
}

// One loan as a statement: total, every payment (oldest first) with the balance left after it, paid, left.
export function loanStatement(records, loanId) {
  const loan = records.find((r) => r.id === loanId && r.kind === 'loan' && !r.deleted);
  if (!loan) return null;
  let left = loan.amount;
  const pays = records.filter((r) => r.kind === 'pay' && r.loanId === loanId && !r.deleted).sort((a, b) => a.ts - b.ts)
    .map((r) => { left -= r.amount; return { id: r.id, ts: r.ts, noTime: !!r.noTime, amount: r.amount, note: r.note || null, by: r.by, leftAfter: Math.max(0, left) }; });
  const paid = loan.amount - left;
  return { loan, for: loan.for || 'other', total: loan.amount, paid, left: Math.max(0, left), pays };
}

// Per person: each loan as a statement (oldest first), how much we got from / gave to them,
// and what is still open in each direction. Biggest open balance first.
export function loanLedger(records, currency) {
  const P = {};
  const total = { got: 0, gave: 0, weOwe: 0, theyOwe: 0 };
  const loans = records.filter((r) => r.kind === 'loan' && !r.deleted && r.currency === currency).sort((a, b) => a.ts - b.ts);
  for (const l of loans) {
    const st = loanStatement(records, l.id);
    const p = (P[l.who] ||= { who: l.who, loans: [], got: 0, gave: 0, weOwe: 0, theyOwe: 0, last: 0 });
    p.loans.push(st);
    const borrowed = l.dir === 'borrowed';
    const got = borrowed ? st.total : st.paid, gave = borrowed ? st.paid : st.total;
    p.got += got; p.gave += gave; total.got += got; total.gave += gave;
    p[borrowed ? 'weOwe' : 'theyOwe'] += st.left; total[borrowed ? 'weOwe' : 'theyOwe'] += st.left;
    p.last = Math.max(p.last, l.ts, ...st.pays.map((x) => x.ts));
  }
  const people = Object.values(P).sort((a, b) => (b.weOwe + b.theyOwe) - (a.weOwe + a.theyOwe) || b.last - a.last);
  return { people, total };
}

// Loans tab sums, each direction on its own: total · paid back · left, overall and per person.
export function loanTotals(records, currency) {
  const zero = () => ({ total: 0, paid: 0, left: 0 });
  const all = { borrowed: zero(), lent: zero() };
  const P = {};
  for (const l of records) {
    if (l.kind !== 'loan' || l.deleted || l.currency !== currency) continue;
    const st = loanStatement(records, l.id);
    const p = (P[l.who] ||= { who: l.who, borrowed: zero(), lent: zero() });
    for (const t of [all[l.dir], p[l.dir]]) { t.total += st.total; t.paid += st.paid; t.left += st.left; }
  }
  const people = Object.values(P).sort((a, b) => (b.borrowed.left + b.lent.left) - (a.borrowed.left + a.lent.left));
  return { ...all, people };
}

// name(id) → person's name · forName(id) → [icon, name] · date(ts, noTime) → date text
export function ledgerText(ledger, currency, { name, forName, date }) {
  const m = (n) => money(n, currency);
  const out = ['🤝 دفتر قرض', '', `📤 بالای مردم: ${m(ledger.total.theyOwe)}`, `📥 بالای ما: ${m(ledger.total.weOwe)}`];
  for (const p of ledger.people) {
    out.push('', `👤 ${name(p.who)}`);
    for (const st of p.loans) {
      const [ic, nm] = forName(st.for);
      const lent = st.loan.dir === 'lent';
      out.push(`${lent ? '📤 قرض دادیم' : '📥 قرض گرفتیم'} · ${date(st.loan.ts, !!st.loan.noTime)} · ${ic} ${nm}${st.loan.note ? ` · ${st.loan.note}` : ''}`);
      out.push(`   کل: ${m(st.total)}`);
      for (const x of st.pays) out.push(`   💵 ${date(x.ts, x.noTime)} · ${lent ? 'پس آورد' : 'پس دادیم'} ${m(x.amount)}${x.note ? ` · ${x.note}` : ''} → باقی ${m(x.leftAfter)}`);
      out.push(`   ${lent ? 'پس آورد' : 'پس دادیم'}: ${m(st.paid)} · ${st.left ? `باقی: ${m(st.left)}` : '✅ صاف'}`);
    }
    if (p.theyOwe) out.push(`➡️ بالای او: ${m(p.theyOwe)}`);
    if (p.weOwe) out.push(`⬅️ بالای ما: ${m(p.weOwe)}`);
    if (!p.theyOwe && !p.weOwe) out.push('✅ حساب صاف');
  }
  return out.join('\n');
}

// ---------- savings jars ----------
// records: { kind:'jar', goal, target, currency } and { kind:'move', jarId, amount (+in / −out) }.
export function jarTotals(records) {
  const t = {};
  for (const r of records) if (r.kind === 'jar' && !r.deleted) t[r.id] = 0;
  for (const r of records) if (r.kind === 'move' && !r.deleted && r.jarId in t) t[r.jarId] += r.amount;
  return t;
}

// ---------- money from abroad (hawala) ----------
export function abroadSummary(txns, currency, month) {
  const s = { total: 0, fees: 0, bySender: {} };
  for (const x of txns) {
    if (x.deleted || x.type !== 'in' || x.cat !== 'abroad' || x.currency !== currency || monthKey(x.ts) !== month) continue;
    s.total += x.amount;
    s.fees += x.fee > 0 ? x.fee : 0;
    if (x.from) s.bySender[x.from] = (s.bySender[x.from] || 0) + x.amount;
  }
  return s;
}

// ---------- pantry levels ----------
// Tap cycles: not tracked → full → half → empty → not tracked. Empty puts it on the list.
const NEXT = { full: 'half', half: 'empty', empty: null };
export const nextLevel = (l) => (l ? NEXT[l] : 'full');
const RANK = { empty: 0, half: 1, full: 2 };
export const pantryOrder = (catalog) => catalog
  .map((c, i) => ({ c, i }))
  .sort((a, b) => (RANK[a.c.stock] ?? 3) - (RANK[b.c.stock] ?? 3) || a.i - b.i)
  .map((x) => x.c);

// ---------- monthly family summary ----------
export function monthCompare(txns, currency, month) {
  const now = totals(txns, currency, month).byCat;
  const prev = totals(txns, currency, shiftMonth(month, -1)).byCat;
  return [...new Set([...Object.keys(now), ...Object.keys(prev)])]
    .map((cat) => ({ cat, now: now[cat] || 0, prev: prev[cat] || 0 }))
    .sort((a, b) => b.now - a.now || b.prev - a.prev);
}

export function jarsMonthNet(jars, currency, month) {
  const cur = Object.fromEntries(jars.filter((j) => j.kind === 'jar' && !j.deleted).map((j) => [j.id, j.currency]));
  return jars.reduce((s, m) => (m.kind === 'move' && !m.deleted && cur[m.jarId] === currency && monthKey(m.ts) === month ? s + m.amount : s), 0);
}

export function billsMonth(bills, txns, now) {
  const r = { total: 0, paid: 0, late: 0 };
  for (const b of bills) {
    if (b.deleted) continue;
    r.total += 1;
    const st = billStatus(b, txns, now);
    if (st === 'paid') r.paid += 1;
    if (st === 'late') r.late += 1;
  }
  return r;
}

// ---------- private pocket (stays on this phone) ----------
export const pocketBalance = (entries, currency) => entries.reduce((s, e) =>
  (e.deleted || e.currency !== currency ? s : s + (e.type === 'in' ? e.amount : -e.amount)), 0);

// ---------- picture search for new items ----------
// Typed Dari may use Arabic ي/ك or extra spaces / zero-width joiners; compare loosely.
const norm = (s) => String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌]+/g, '').toLowerCase();
export function searchPicker(lib, q) {
  const n = norm(q);
  return n ? lib.filter((x) => norm(x.name).includes(n)) : lib;
}

// ---------- the family's own money categories ----------
// base = { in: IN_CATS, out: OUT_CATS }; custom = records { id, type:'in'|'out', icon, name, ts, deleted }.
export function findCat(base, custom, type, id) {
  const hit = (base[type] || []).find((c) => c.id === id) || custom.find((c) => c.id === id && c.type === type);
  return hit || { id, icon: '❓', name: '' };
}
export const catsFor = (base, custom, type) => [
  ...(base[type] || []),
  ...custom.filter((c) => c.type === type && !c.deleted).sort((a, b) => a.ts - b.ts),
];

// A pop-up slides in only when it opens or switches to another pop-up.
// Taps inside redraw it; replaying the slide would move the buttons under the finger.
export const sheetEnters = (prevKind, kind) => !!kind && kind !== prevKind;

// ---------- plain text for WhatsApp ----------
// cat(id) → [icon, name] · person(id) → name. Biggest spending first.
export function reportText({ txns, currency, month, cat, person, cash = null }) {
  const t = totals(txns, currency, month);
  const m = (n) => money(n, currency);
  const end = (n) => (n >= 0 ? `🟢 باقی: ${m(n)}` : `🔴 کم: ${m(-n)}`);
  const out = [`📊 حساب خانواده — ${monthLabel(month)}`, ''];
  if (cash) {
    out.push(`↪️ از ماه قبل: ${cash.opening < 0 ? '− ' : ''}${m(Math.abs(cash.opening))}`, `⬇️ آمد: ${m(t.in)}`, `⬆️ مصرف: ${m(t.out)}`);
    if (cash.loanIn || cash.loanOut) out.push(`🤝 قرض آمد: ${m(cash.loanIn)}`, `🤝 قرض رفت: ${m(cash.loanOut)}`);
    out.push(`${end(cash.closing)} (به ماه بعد)`);
  } else out.push(`⬇️ آمد: ${m(t.in)}`, `⬆️ مصرف: ${m(t.out)}`, end(t.net));
  const cats = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  if (cats.length) out.push('', 'مصرف به کدام چیز:', ...cats.map(([id, v]) => { const [ic, nm] = cat(id); return `${ic} ${nm}: ${m(v)}`; }));
  const people = Object.entries(t.byPerson);
  if (people.length) out.push('', 'هر نفر:', ...people.map(([id, p]) => `${person(id)}: ⬇️ ${m(p.in)} ⬆️ ${m(p.out)}`));
  return out.join('\n');
}

export function listText(grocery, name, unit) {
  const rows = activeGrocery(grocery).map((x) => `▫️ ${name(x)} — ${faDigits(x.qty)} ${unit(x)}`);
  return `🛒 لست سودا\n\n${rows.length ? rows.join('\n') : '—'}`;
}

// Picking a person on a phone needs their PIN (people added before PINs existed: none until one is set).
export const needsPin = (m, currentMe) => !!m?.pin && m.id !== currentMe;
