import { load, save, uid, loadPocket, savePocket } from './store.js';
import { OUT_CATS, IN_CATS, LOAN_FOR, FACES, GOALS, COUNTRIES, IN_PICS, OUT_PICS } from './data.js';
import {
  monthKey, shiftMonth, monthLabel, totals, faDigits, money,
  roleOf, canTab, cashBalances, visibleTxns, loansView, jarTotals, abroadSummary,
  monthCompare, jarsMonthNet, monthCash, loanFlows, loanLedger, loanStatement, loanTotals, ledgerText, pocketBalance, searchPicker, findCat, catsFor, sheetEnters, nextRole, canWrite, reportText, needsPin, navTabs, parseInvite,
} from './logic.js';
import { firebaseConfig, emulator, emulatorConfig } from './config.js';
import { cleanRecord, safeImage, safeAudio } from './clean.js';
import { makePin, checkPin, PIN_LEN, PIN_KEYS } from './pin.js';
import { newPassword, normUser, normPass, loginKeys, sealLogin, openLogin } from './login.js';

let S;                                   // family state (IndexedDB)
const V = { room: null, tab: 'money', cashOpen: { in: true }, month: null, modal: null, cloud: null, waiting: false };
let SY = null;
let updateReady = false;                 // a new app version has taken over → reload when no pop-up is open
const $app = document.getElementById('app');
const $cam = document.getElementById('cam');

// ---------- helpers ----------
// A brand-new phone must not make its own empty family: it first asks "log in" or "new family".
const CLOUD = emulator ? emulatorConfig : firebaseConfig;
const hasFamily = () => { try { return !!localStorage.getItem('ff-family'); } catch { return false; } };
const siteLink = () => `${location.origin}${location.pathname}`;
// Join that family: the page reloads and the normal join brings everything down; then "who are you?".
// The invite is kept on the phone until the join works, so nothing is lost if the app restarts.
const PENDING = 'ff-join';
const pendingInvite = () => { try { return JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch { return null; } };
function joinFamily(inv) {
  try { localStorage.setItem(PENDING, JSON.stringify({ fid: inv.fid, code: inv.code })); } catch { /* private mode */ }
  if (SY) { location.hash = `join=${inv.fid}.${inv.code}`; location.reload(); return; }   // already in another family: start clean
  connect(inv);   // brand-new phone: join right here, no restart
}
function becomeMe(v) {
  unlockedUntil = 0; pocketOpen = false; P = null;
  S.me = v; localStorage.setItem('ff-me', v); V.modal = null;
  if (!isAdmin() && V.tab === 'admin') V.tab = 'money';
  commit(() => {});
}
// Opens WhatsApp with the text ready; the person picks who gets it.
const sendWhatsApp = (text) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
const rawName = (id) => { const m = member(id) || contact(id); return m?.name || m?.emoji || ''; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const me = () => S.members.find((m) => m.id === S.me);
const isAdmin = () => me()?.role === 'admin';
const role = () => roleOf(me());
const ROLE_ICON = { admin: '👑', viewer: '👁️' };
const ROLE_NAME = { admin: 'مدیر', viewer: 'بیننده' };
const writer = () => canWrite(role());        // viewer: sees everything, changes nothing
const seesAll = () => isAdmin() || role() === 'viewer';
const viewOnly = () => (writer() ? '' : '<div class="viewonly">👁️ <b>فقط دیدن</b> — شما بیننده هستید؛ تغییر را مدیر می‌کند</div>');
const TAB_NAME = { money: 'پول', loans: 'قرض', report: 'گزارش', admin: 'مدیر' };
const TAB_ICON = { money: '💰', loans: '🤝', report: '📊', admin: '🗝️' };
// Picture + its Dari word underneath: people who read can read it and teach the picture to those who can't.
const L = (icon, word) => `${icon}<span class="lab">${word}</span>`;
const who = (id) => esc(member(id)?.name || contact(id)?.name || '');
const contact = (id) => (S.contacts || []).find((c) => c.id === id);
const goalOf = (id) => GOALS.find((g) => g.id === id) || GOALS[GOALS.length - 1];
const countryOf = (id) => COUNTRIES.find((c) => c.id === id);
// Grid of people outside the household (relatives, shopkeeper, hawala sender) + ➕ new.
const contactGrid = (action) => `<div class="grid">${(S.contacts || []).filter((c) => !c.deleted).map((c) => `
  <button class="tile" data-a="${action}" data-v="${c.id}">${face(c, 'f80')}<small>${esc(c.name)}</small></button>`).join('')}
  <button class="tile add" data-a="contactNew"><span class="pic">➕</span><small>شخص نو</small></button></div>`;
const hands = () => cashBalances(S.cash || [], S.txns, S.currency);
const member = (id) => S.members.find((m) => m.id === id);
const face = (m, size = 'f40') => !m ? `<span class="face ${size}">❔</span>`
  : `<span class="face ${size}">${m.photo ? `<img src="${m.photo}" alt="">` : esc(m.emoji)}</span>`;
// Built-in categories plus the family's own (S.cats). Own ones come from phones, so always escape.
const BASE_CATS = { in: IN_CATS, out: OUT_CATS };
const catOf = (type, id) => { const c = findCat(BASE_CATS, S.cats || [], type, id); return { ...c, icon: esc(c.icon), name: esc(c.name) }; };
// Dates show the time too (۳۰ عقرب ساعت ۱۶:۱۶). Loans entered with an older picked date have no real time: date only.
const FMT_DAY = new Intl.DateTimeFormat('fa-AF', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const FMT_DATE = new Intl.DateTimeFormat('fa-AF', { day: 'numeric', month: 'long', year: 'numeric' });
const FMT_DATE_T = new Intl.DateTimeFormat('fa-AF', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayLabel = (ts) => FMT_DAY.format(ts);
const dateLabel = (ts, noTime = false) => (noTime ? FMT_DATE : FMT_DATE_T).format(ts);
const signed = (n, cur) => `${n < 0 ? '− ' : ''}${money(Math.abs(n), cur)}`;
const forOf = (id) => LOAN_FOR.find((f) => f.id === id) || LOAN_FOR[LOAN_FOR.length - 1];
// Loans and payments: 📝 note and 📅 date (today unless an older date is picked, for old debts).
const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const pickTs = (iso) => { if (!iso || iso >= todayISO()) return Date.now(); const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const backdated = (M) => M.date && M.date < todayISO();
// Income/spending: the real date and time it came in or went out (defaults to now; never in the future).
const pad2 = (n) => String(n).padStart(2, '0');
const localISO = (ts) => { const t = new Date(ts); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}T${pad2(t.getHours())}:${pad2(t.getMinutes())}`; };
const whenTs = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) && t < Date.now() ? t : Date.now(); };
const loanExtras = (M, ph = 'یادداشت — برای چه؟ (اختیاری)') => `<div class="row" style="margin-top:12px;justify-content:center;gap:14px">
    <button class="iconbtn" data-a="lNote">${L(M.note ? '✅' : '📝', 'یادداشت')}</button>
    <button class="iconbtn" data-a="lDate">${L(backdated(M) ? '✅' : '📅', backdated(M) ? dateLabel(pickTs(M.date), true) : 'امروز')}</button></div>
  ${M.noteOpen || M.note ? `<label class="notebox">📝<input id="lnote" maxlength="120" placeholder="${ph}" value="${esc(M.note)}" autocomplete="off"></label>` : ''}
  ${M.dateOpen ? `<label class="notebox">📅<input id="ldate" type="date" max="${todayISO()}" value="${esc(M.date || todayISO())}"></label>` : ''}`;
const readLoanExtras = (M) => {
  M.note = (document.getElementById('lnote')?.value ?? M.note ?? '').trim().slice(0, 120);
  M.date = document.getElementById('ldate')?.value || M.date || null;
};

function toast(t) {
  const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: t });
  document.body.append(el);
  setTimeout(() => el.remove(), 1200);
  navigator.vibrate?.(30);
}

function log(action, icon, extra = '') {
  S.log.unshift({ id: uid(), ts: Date.now(), by: S.me, action, icon, extra });
  S.log.length = Math.min(S.log.length, 500);
}

// Saving writes the whole family state to the phone; do it once after a burst of taps.
let saveTimer = null;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; save(S); }, 300); }
function saveNow() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } return save(S); }
window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
async function commit(fn) {
  fn();
  render();
  SY?.push();
  saveSoon();
}

// Camera / gallery → compressed JPEG data URL
let photoCb = null;
function takePhoto(maxSide, cb) { photoCb = { maxSide, cb }; $cam.value = ''; $cam.click(); }
$cam.addEventListener('change', async () => {
  const f = $cam.files[0];
  if (!f || !photoCb) return;
  const img = await createImageBitmap(f);
  const k = Math.min(1, photoCb.maxSide / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: img.width * k, height: img.height * k });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  photoCb.cb(c.toDataURL('image/jpeg', 0.6));
  photoCb = null;
});

// ---------- views ----------
function top() {
  const title = TAB_ICON[V.tab];
  return `<header class="top">
    <button class="mebtn" data-a="who">${face(me(), 'f56')}<span class="lab">${esc(me()?.name) || 'من'}</span></button>
    ${writer() ? `<button class="iconbtn" data-a="pocket">${L('👛', 'جیب من')}</button>` : ''}
    <h1>${title}<span class="lab">${TAB_NAME[V.tab]}</span></h1>
    ${V.cloud ? `<span class="cloud">${{ ok: L('☁️✅', 'وصل'), pending: L('☁️⏳', 'در انتظار'), offline: L('📴', 'بی‌انترنت'), error: L('☁️❗', 'مشکل') }[V.cloud]}</span>` : ''}
  </header>`;
}

function tabs() {
  const t = navTabs(role());
  if (t.length < 2) return '';
  return `<nav class="tabs">${t.map((id) =>
    `<button data-a="tab" data-v="${id}" class="${V.tab === id ? 'on' : ''} ${id === 'admin' ? 'door' : ''}">${TAB_ICON[id]}<small>${TAB_NAME[id]}</small></button>`).join('')}</nav>`;
}

// Back of the house (admin only): every admin job is one big picture here, one tap deep.
const ROOMS = [
  ['report', '📊', 'گزارش ماه'],
  ['people', '👨‍👩‍👧', 'اعضای فامیل'],
  ['invite', '📲', 'دعوت به فامیل'],
  ['loanBook', '🤝📒', 'دفتر قرض'],
  ['summary', '📅', 'خلاصه برای فامیل'],
];
const backBar = (label) => `<button class="backbar" data-a="roomBack">↩️ <span>${label}</span></button>`;
function adminView() {
  if (V.room === 'report') return backBar('مدیر') + reportView();
  if (V.room === 'loanBook') return backBar('مدیر') + loanBookView();
  return `<section><div class="rooms">${ROOMS.filter(([id]) => id !== 'invite' || SY).map(([id, i, n]) =>
    `<button class="room" data-a="room" data-v="${id}"><span class="pic">${i}</span><b>${n}</b></button>`).join('')}</div>
    <p class="lbl" style="text-align:center;margin-top:14px" dir="ltr">${esc(V.ver || '')}</p></section>`;
}
// Money in hand as one plain sum, line by line: from last month + income − spending − loan payments = in hand.
function cashCard(c, m) {
  const cur = S.currency;
  const inMonth = (ts) => monthKey(ts) === m;
  // Every entry behind each line, oldest first, with its date and time.
  const tx = (type) => visibleTxns(S.txns.filter((x) => !x.deleted && x.type === type && x.currency === cur && inMonth(x.ts)), role(), S.me)
    .sort((a, b) => a.ts - b.ts).map((x) => ({ ts: x.ts, icon: catOf(type, x.cat).icon, word: catOf(type, x.cat).name, amount: x.amount, note: x.note, by: x.by }));
  const flows = loanFlows(S.loans, cur, true).filter((f) => inMonth(f.ts));
  const lf = (test) => flows.filter(test).map((f) => ({ ts: f.ts, icon: forOf(f.loan.for).icon, word: who(f.loan.who), amount: f.amount, note: f.pay ? f.pay.note : f.loan.note }));
  const rows = {
    in: tx('in'), out: tx('out'),
    loanPaid: lf((f) => f.pay && f.loan.dir === 'borrowed'),
    lent: lf((f) => !f.pay && f.loan.dir === 'lent'),
    repaid: lf((f) => f.pay && f.loan.dir === 'lent'),
  };
  const line = (key, ic, word, amt, sign, cls) => {
    const list = rows[key] || [];
    const open = list.length && V.cashOpen[key];
    return `<button class="mline ${cls}" ${list.length ? `data-a="cashOpen" data-v="${key}"` : ''}><span>${ic} ${word}${list.length ? ` <small class="lbl">${faDigits(list.length)} ${open ? '▴' : '▾'}</small>` : ''}</span>
        <b>${sign ? sign + ' ' : ''}${money(amt, cur)}</b></button>
      ${open ? `<div class="msubs">${list.map((r) => `<div class="msub"><span>📅 ${dayLabel(r.ts)}</span><span class="grow">${r.icon} ${esc(r.word)}${r.note ? ` · 📝 ${esc(r.note)}` : ''}</span><b>${money(r.amount, cur)}</b></div>`).join('')}</div>` : ''}`;
  };
  return `<div class="mcard">
    <div class="mtitle">💵 پول در دست — ${monthLabel(m)}</div>
    <div class="mline ${c.opening < 0 ? 'out-c' : ''}"><span>↪️ ${c.opening >= 0 ? 'از ماه قبل' : 'کم از ماه قبل'}</span><b>${c.opening < 0 ? '− ' : ''}${money(Math.abs(c.opening), cur)}</b></div>
    ${line('in', '⬇️', 'آمد این ماه', c.in, '+', 'in-c')}
    ${line('out', '⬆️', 'مصرف این ماه', c.out, '−', 'out-c')}
    ${c.loanPaid ? line('loanPaid', '🤝', 'قرض پس دادیم', c.loanPaid, '−', 'out-c') : ''}
    ${c.lent ? line('lent', '📤', 'قرض دادیم', c.lent, '−', 'out-c') : ''}
    ${c.repaid ? line('repaid', '💵', 'قرض پس آوردند', c.repaid, '+', 'in-c') : ''}
    <div class="mtotal ${c.closing >= 0 ? 'in-c' : 'out-c'}"><span>${c.closing >= 0 ? '🟢 باقی در دست' : '🔴 کم'}</span><b>${money(Math.abs(c.closing), cur)}</b></div>
    <div class="lbl" style="text-align:center">می‌رود به ماه بعد</div>
  </div>`;
}

// Loans, kept apart from money in hand: total · paid · left. Tap → Loans page with every dated payment.
function loanCard(T) {
  if (!T.people.length) return '';
  const cur = S.currency;
  const box = (t, lent) => `<span class="stmt-sum" style="margin-top:0">
      <span class="mbox"><span class="lab">کل قرض</span><b>${money(t.total, cur)}</b></span>
      <span class="mbox"><span class="lab">${lent ? 'پس آوردند' : 'پس دادیم'}</span><b>${money(t.paid, cur)}</b></span>
      <span class="mbox ${t.left ? (lent ? 'in-c' : 'out-c') : 'in-c'}"><span class="lab">${lent ? 'بالای مردم' : 'بالای ما'}</span><b>${t.left ? money(t.left, cur) : '✅'}</b></span></span>`;
  return `<button class="loancard" data-a="tab" data-v="loans">
    <span class="lc-head">🤝 <b>قرض — جدا از پول در دست</b><span class="lbl">همه جزئیات ◀️</span></span>
    ${T.borrowed.total ? `<span class="lc-sub">📥 قرض گرفتیم</span>${box(T.borrowed, false)}` : ''}
    ${T.lent.total ? `<span class="lc-sub">📤 قرض دادیم</span>${box(T.lent, true)}` : ''}
  </button>`;
}

function moneyView() {
  const m = monthKey(Date.now());
  const c = monthCash(S.txns, S.loans, S.currency, m);   // money in hand; borrowed money never counts
  const T = loanTotals(seesAll() ? S.loans : S.loans.filter((r) => r.kind === 'pay' || r.by === S.me), S.currency);
  const list = visibleTxns(S.txns.filter((x) => !x.deleted), role(), S.me).sort((a, b) => b.ts - a.ts).slice(0, 40);
  const hb = Object.entries(hands());
  return `<section>
    ${writer() ? `<div class="bigbtns">
      <button class="big in" data-a="addTx" data-v="in">⬇️<small>پول آمد</small></button>
      <button class="big out" data-a="addTx" data-v="out">⬆️<small>مصرف</small></button>
    </div>` : viewOnly()}
    ${cashCard(c, m)}
    ${loanCard(T)}
    <div class="row" style="margin-top:8px"><span class="lbl grow">${monthLabel(m)}</span>${curSwitch()}</div>
    <div class="chips" style="margin-top:10px">
      ${writer() ? '<button class="chip give" data-a="give">🤲<b>خرچی</b></button>' : ''}
      ${hb.map(([id, v]) => `<button class="chip col" data-a="hand" data-v="${id}"><span class="row1">${face(member(id), 'f40')}<b>${money(v, S.currency)}</b></span><span class="lab">خرچی ${who(id)}</span></button>`).join('')}
    </div>
    ${jarsRow()}
  </section>
  <section class="list">${list.length ? list.map((x) => txRow(x, true)).join('') : '<div class="empty">💰</div>'}</section>`;
}

const curSwitch = () => `<div class="seg cur" style="width:190px">
  <button data-a="cur" data-v="AFN" class="${S.currency === 'AFN' ? 'on' : ''}" style="font-size:24px">افغانی</button>
  <button data-a="cur" data-v="USD" class="${S.currency === 'USD' ? 'on' : ''}" style="font-size:24px">دالر</button></div>`;

// One money row; on the Money page your own rows (all rows for admin) get ✏️ edit and 🗑️ delete right under them.
const txRow = (x, actions = false) => {
  const canEdit = actions && !x.deleted && writer() && (isAdmin() || x.by === S.me);
  const acts = !canEdit ? '' : V.confirmTx === x.id
    ? `<div class="acts"><b class="out-c">پاک شود؟</b><button class="mini danger" data-a="txDelYes" data-v="${x.id}">🗑️ بلی</button><button class="mini" data-a="txDelNo">↩️ نه</button></div>`
    : `<div class="acts"><button class="mini" data-a="txEdit" data-v="${x.id}">✏️ تغییر</button><button class="mini" data-a="txDelAsk" data-v="${x.id}">🗑️ پاک</button></div>`;
  return `<div class="txw">${`<button class="tx ${x.deleted ? 'del' : ''}" data-a="txView" data-v="${x.id}">
  <span class="cat">${catOf(x.type, x.cat).icon}${x.country ? `<small>${countryOf(x.country)?.icon || ''}</small>` : ''}</span>
  <span class="grow" style="text-align:start">
    <span class="amt ${x.type}-c">${x.type === 'in' ? '⬇️' : '⬆️'} ${money(x.amount, x.currency)}</span><br>
    <span class="lbl">${catOf(x.type, x.cat).name} · ${who(x.by)} · ${dayLabel(x.ts)}</span>${x.note ? `<br><span class="note">📝 ${esc(x.note)}</span>` : ''}</span>
  ${x.paidFrom === 'hand' ? '🤲' : ''}${x.photo ? '📷' : ''}${x.voice ? '🎤' : ''} ${face(member(x.by), 'f40')}
</button>`}${acts}</div>`;
};

function jarsRow() {
  const jars = S.jars.filter((j) => j.kind === 'jar' && !j.deleted && j.currency === S.currency);
  const t = jarTotals(S.jars);
  return `<div class="jars">${jars.map((j) => {
    const g = goalOf(j.goal);
    const pct = j.target > 0 ? Math.min(100, Math.round((t[j.id] / j.target) * 100)) : 0;
    return `<button class="jar" data-a="jarOpen" data-v="${j.id}">
      <span class="glass"><span class="fillj" style="height:${pct}%"></span><span class="gi">${g.icon}</span></span>
      <small>${money(t[j.id], j.currency)}</small><span class="lab">${g.name}</span></button>`;
  }).join('')}${isAdmin() ? '<button class="jar add" data-a="jarNew"><span class="glass"><span class="gi">➕</span></span><span class="lab">پس‌انداز نو</span></button>' : ''}</div>`;
}

function loansViewUI() {
  const v = loansView(S.loans, S.currency, seesAll() ? null : S.me);
  const row = (l) => {
    const c = contact(l.who);
    return `<button class="tx ${l.done ? 'del2' : ''}" data-a="loanOpen" data-v="${l.id}">
      <span class="cat">${l.dir === 'lent' ? '📤' : '📥'}</span>${face(c, 'f40')}
      <span class="grow" style="text-align:start">
        <span class="amt ${l.dir === 'lent' ? 'in-c' : 'out-c'}">${l.done ? '✅' : money(l.left, l.currency)}</span><br>
        <span class="lbl">${forOf(l.for).icon} ${forOf(l.for).name} · ${esc(c?.name)} · ${l.dir === 'lent' ? 'قرض دادیم' : 'قرض گرفتیم'} ${money(l.amount, l.currency)} · ${dateLabel(l.ts, l.noTime)}</span>${l.note ? `<br><span class="note">📝 ${esc(l.note)}</span>` : ''}</span>
      ${face(member(l.by), 'f24')}</button>`;
  };
  // Earners see their own loans; admin sees the whole family's.
  const T = loanTotals(seesAll() ? S.loans : S.loans.filter((r) => r.kind === 'pay' || r.by === S.me), S.currency);
  const box = (t, lent) => `<div class="stmt-sum">
      <div><span class="lab">کل</span><b>${money(t.total, S.currency)}</b></div>
      <div><span class="lab">${lent ? 'پس آوردند' : 'پس دادیم'}</span><b>${money(t.paid, S.currency)}</b></div>
      <div class="${t.left ? (lent ? 'in-c' : 'out-c') : 'in-c'}"><span class="lab">باقی</span><b>${t.left ? money(t.left, S.currency) : '✅'}</b></div></div>`;
  const line = (t, lent) => !t.total ? '' : `<div class="pl ${lent ? 'in-c' : 'out-c'}">${lent ? '📤 دادیم' : '📥 گرفتیم'} ${money(t.total, S.currency)}
      <span class="lbl">· ${lent ? 'پس آورد' : 'پس دادیم'} ${money(t.paid, S.currency)} ·</span> <b>${t.left ? `باقی ${money(t.left, S.currency)}` : '✅ صاف'}</b></div>`;
  const totals = T.people.length ? `
    <div class="stmt"><div class="stmt-head">📥 قرض گرفتیم</div>${box(T.borrowed, false)}</div>
    <div class="stmt"><div class="stmt-head">📤 قرض دادیم</div>${box(T.lent, true)}</div>
    <div class="stmt"><div class="stmt-head">👥 هر نفر</div>${T.people.map((p) => `<div class="prow">${face(contact(p.who), 'f40')}
      <div class="grow"><b>${who(p.who) || '—'}</b>${line(p.borrowed, false)}${line(p.lent, true)}</div></div>`).join('')}</div>` : '';
  return `<section>
    ${writer() ? `<div class="bigbtns">
      <button class="big in" data-a="loanNew" data-v="lent">📤<small>قرض دادیم</small></button>
      <button class="big out" data-a="loanNew" data-v="borrowed">📥<small>قرض گرفتیم</small></button>
    </div>` : viewOnly()}
    <div class="row" style="margin-top:8px;justify-content:flex-end">${curSwitch()}</div>
    <div style="margin-top:12px">${totals}</div>
    ${isAdmin() ? '<button class="save" style="background:var(--sel)" data-a="room" data-v="loanBook">🤝📒 دفتر قرض — همه با تاریخ</button>' : ''}
  </section>
  <section class="list">${v.loans.length ? [...v.loans.filter((l) => !l.done), ...v.loans.filter((l) => l.done)].map(row).join('') : '<div class="empty">🤝</div>'}</section>`;
}

// One loan, plainly: who / for what / when, then total · paid · left, then every payment (date, amount, note, left after).
function statementCard(st, person = true, edit = false) {
  const l = st.loan, lent = l.dir === 'lent', f = forOf(st.for), cur = l.currency;
  const paidWord = lent ? 'پس آورد' : 'پس دادیم';
  return `<div class="stmt">
    <div class="stmt-head">${lent ? '📤 قرض دادیم' : '📥 قرض گرفتیم'}${person ? ` ${lent ? 'به' : 'از'} ${who(l.who)}` : ''}</div>
    ${edit ? `<button class="stmt-for forbtn" data-a="loanForEdit">${f.icon} برای: <b>${f.name}</b> ✏️</button><div class="stmt-for">📅 ${dateLabel(l.ts, l.noTime)}</div>`
      : `<div class="stmt-for">${f.icon} برای: <b>${f.name}</b> · 📅 ${dateLabel(l.ts, l.noTime)}</div>`}
    ${l.note ? `<div class="note">📝 ${esc(l.note)}</div>` : ''}
    <div class="stmt-sum">
      <div><span class="lab">کل قرض</span><b>${money(st.total, cur)}</b></div>
      <div><span class="lab">${paidWord}</span><b>${money(st.paid, cur)}</b></div>
      <div class="${st.left ? (lent ? 'in-c' : 'out-c') : 'in-c'}"><span class="lab">باقی</span><b>${st.left ? money(st.left, cur) : '✅ صاف'}</b></div>
    </div>
    ${st.pays.length ? `<div class="stmt-pays">${st.pays.map((x) => `<div class="stmt-pay">
      <span>📅 ${dateLabel(x.ts, x.noTime)} · ${paidWord}</span><b>💵 ${money(x.amount, cur)}</b>
      ${x.note ? `<span class="note">📝 ${esc(x.note)}</span>` : ''}
      <span class="left">بعد از این، باقی: ${money(x.leftAfter, cur)}</span>
      ${!edit ? '' : V.modal?.confirmDel === x.id ? `<span class="acts"><b class="out-c">پاک شود؟</b>
          <button class="mini danger" data-a="payDelYes" data-v="${x.id}">🗑️ بلی</button><button class="mini" data-a="payDelNo">↩️ نه</button></span>`
        : `<span class="acts"><button class="mini" data-a="payEdit" data-v="${x.id}">✏️ تغییر</button><button class="mini" data-a="payDel" data-v="${x.id}">🗑️ پاک</button></span>`}</div>`).join('')}</div>` : ''}
  </div>`;
}

// Every amount we got from / gave to each person, with dates, and what is still open (admin).
function loanBookView() {
  const L0 = loanLedger(S.loans, S.currency);
  const person = (p) => `<div class="card">
    <div class="row">${face(contact(p.who), 'f56')}<b class="grow" style="font-size:22px">${who(p.who) || '—'}</b></div>
    <div class="sum" style="margin-top:8px">
      <div class="in-c">⬇️ ${money(p.got, S.currency)}<span class="lab">از او گرفتیم</span></div>
      <div class="out-c">⬆️ ${money(p.gave, S.currency)}<span class="lab">به او دادیم</span></div></div>
    <div style="margin-top:10px">${p.loans.map((st) => statementCard(st, false)).join('')}</div>
    <div class="row" style="margin-top:10px;font-size:20px;font-weight:700">
      ${p.theyOwe ? `<span class="in-c">➡️ بالای او: ${money(p.theyOwe, S.currency)}</span>` : ''}
      ${p.weOwe ? `<span class="out-c">⬅️ بالای ما: ${money(p.weOwe, S.currency)}</span>` : ''}
      ${!p.theyOwe && !p.weOwe ? '<span>✅ حساب صاف</span>' : ''}</div></div>`;
  return `<section>
    <div class="row" style="justify-content:center;margin-bottom:12px">${curSwitch()}</div>
    <div class="sum" style="margin-top:0">
      <div class="in-c">📤 ${money(L0.total.theyOwe, S.currency)}<span class="lab">بالای مردم</span></div>
      <div class="out-c">📥 ${money(L0.total.weOwe, S.currency)}<span class="lab">بالای ما</span></div></div>
    <div class="sum">
      <div class="in-c">⬇️ ${money(L0.total.got, S.currency)}<span class="lab">همه گرفتیم</span></div>
      <div class="out-c">⬆️ ${money(L0.total.gave, S.currency)}<span class="lab">همه دادیم</span></div></div>
    ${L0.people.length ? '<button class="save wa" style="margin:12px 0" data-a="waLedger">💬 فرستادن دفتر قرض به واتساپ</button>' : ''}
    ${L0.people.map(person).join('') || '<div class="empty">🤝</div>'}
  </section>`;
}

// Viewer's 📊 tab: the month report and the whole loan book — to read, not to change.
function viewerReportView() {
  return `${reportView()}<section><div class="mtitle">🤝📒 دفتر قرض</div></section>${loanBookView()}`;
}

function reportView() {
  V.month ||= monthKey(Date.now());
  const t = totals(S.txns, S.currency, V.month);
  const c = monthCash(S.txns, S.loans, S.currency, V.month);
  const max = Math.max(t.in, t.out, c.loanPaid, c.lent, c.repaid, Math.abs(c.opening), Math.abs(c.closing), 1);
  const bar = (ic, v, color, mx = max) => `<div class="bar"><span class="ic">${ic}</span>
    <span class="track"><span class="fill" style="display:block;width:${(v / mx) * 100}%;background:${color}"></span></span>
    <span class="v">${money(v, S.currency)}</span></div>`;
  const cats = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  const cmax = Math.max(1, ...cats.map((c) => c[1]));
  const people = Object.entries(t.byPerson);
  const deleted = S.txns.filter((x) => x.deleted && monthKey(x.ts) === V.month);
  return `<section>
    <button class="save" style="margin:0 0 12px;background:var(--sel)" data-a="summary">👨‍👩‍👧 📅 خلاصهٔ ماه برای فامیل</button>
    <button class="save wa" style="margin:0 0 12px" data-a="waReport">💬 فرستادن گزارش به واتساپ</button>
    <div class="row" style="margin-bottom:12px">
      <button class="iconbtn" data-a="month" data-v="-1">${L('▶️', 'ماه قبل')}</button>
      <b class="grow" style="text-align:center;font-size:24px">${monthLabel(V.month)}</b>
      <button class="iconbtn" data-a="month" data-v="1">${L('◀️', 'ماه بعد')}</button>
    </div>
    <div class="row" style="justify-content:center;margin-bottom:12px">${curSwitch()}</div>
    <div class="card"><div class="bars">
      ${bar(L('↪️', c.opening >= 0 ? 'از ماه قبل' : 'کم از ماه قبل'), Math.abs(c.opening), c.opening >= 0 ? 'var(--in)' : 'var(--out)')}
      ${bar(L('⬇️', 'آمد'), t.in, 'var(--in)')}${bar(L('⬆️', 'مصرف'), t.out, 'var(--out)')}
      ${c.loanPaid ? bar(L('🤝', 'قرض پس دادیم'), c.loanPaid, 'var(--out)') : ''}${c.lent ? bar(L('📤', 'قرض دادیم'), c.lent, 'var(--out)') : ''}${c.repaid ? bar(L('💵', 'قرض پس آوردند'), c.repaid, 'var(--in)') : ''}
      ${bar(c.closing >= 0 ? L('🟢', 'باقی در دست — به ماه بعد') : L('🔴', 'کم به ماه بعد'), Math.abs(c.closing), c.closing >= 0 ? 'var(--in)' : 'var(--out)')}
    </div></div>
    <div class="card"><h3>⬆️ 🧩 مصرف به کدام چیز</h3><div class="bars">
      ${cats.length ? cats.map(([c, v]) => bar(L(catOf('out', c).icon, catOf('out', c).name), v, 'var(--out)', cmax)).join('') : '<div class="muted">—</div>'}
    </div></div>
    <div class="card"><h3>👨‍👩‍👧 هر نفر</h3><div class="bars">
      ${people.map(([id, p]) => `<div class="row">${face(member(id))}<span class="lbl">${who(id)}</span>
        <span class="grow in-c">⬇️ ${money(p.in, S.currency)}</span><span class="out-c">⬆️ ${money(p.out, S.currency)}</span></div>`).join('') || '<div class="muted">—</div>'}
    </div></div>
    ${(() => {
      const a = abroadSummary(S.txns, S.currency, V.month);
      return a.total ? `<div class="card"><h3>✈️ پول از خارج: ${money(a.total, S.currency)}</h3>
        <div class="lbl">🏦 کمیشن حواله: ${money(a.fees, S.currency)}</div>
        <div class="chips">${Object.entries(a.bySender).map(([id, v]) => `<span class="chip col"><span class="row1">${face(contact(id), 'f40')}<b>${money(v, S.currency)}</b></span><span class="lab">${who(id)}</span></span>`).join('')}</div></div>` : '';
    })()}
    ${(() => {
      const l = loansView(S.loans, S.currency);
      return l.open.lent || l.open.borrowed ? `<div class="card"><h3>🤝 قرض</h3><div class="sum" style="margin:0">
        <div class="in-c">📤 ${money(l.open.lent, S.currency)}<span class="lab">بالای مردم</span></div><div class="out-c">📥 ${money(l.open.borrowed, S.currency)}<span class="lab">بالای ما</span></div></div></div>` : '';
    })()}
    ${Object.keys(hands()).length ? `<div class="card"><h3>🤲 خرچی در دست</h3><div class="chips">${Object.entries(hands()).map(([id, v]) =>
      `<button class="chip col" data-a="hand" data-v="${id}"><span class="row1">${face(member(id), 'f40')}<b>${money(v, S.currency)}</b></span><span class="lab">${who(id)}</span></button>`).join('')}</div></div>` : ''}
    ${deleted.length ? `<div class="card"><h3>🗑️ پاک‌شده‌ها</h3><div class="list">${deleted.map((x) => txRow(x)).join('')}</div></div>` : ''}
    <div class="card"><h3>🕘 تاریخچه (کی، چه کرد)</h3><div class="log">
      ${S.log.slice(0, 60).map((l) => `<div class="row">${face(member(l.by), 'f24')}
        <span style="font-size:24px">${esc(l.icon)}</span><span class="grow">${esc(l.extra)}</span>
        <span class="lbl">${dayLabel(l.ts)}</span></div>`).join('') || '<div class="muted">—</div>'}
    </div></div>
    <button class="save" style="background:#555" data-a="export">💾 ذخیره (بکاپ)</button>
  </section>`;
}

// ---------- modals ----------
// Every pop-up gets a Dari title under its pictures.
function sheetTitle(M) {
  if (!M) return '';
  const nm = (id) => member(id)?.name || contact(id)?.name || '';
  switch (M.kind) {
    case 'setup': return 'خوش آمدید — شما کی هستید؟';
    case 'member': return M.self ? 'من کی هستم؟' : 'عضو نو';
    case 'who': return 'شما کی هستید؟';
    case 'welcome': return 'خوش آمدید';
    case 'paste': return 'لینک دعوت را اینجا بچسبانید';
    case 'login': return 'ورود — نام کاربری و رمز';
    case 'mlogin': return 'ورود برای ' + (nm(M.memberId) || member(M.memberId)?.emoji || '');
    case 'pinForgot': return 'رمز را فراموش کردم';
    case 'people': return 'اعضای فامیل';
    case 'pin': return (M.target === 'pocket' ? 'رمز جیب: ' : M.target === 'member' ? `رمز ${nm(M.memberId) || member(M.memberId)?.emoji || ''}: ` : 'رمز مدیر: ') + ({ set: 'رمز نو بسازید', confirm: 'دوباره بزنید', check: 'رمز را بزنید' }[M.mode]);
    case 'invite': return 'دعوت به فامیل';
    case 'tx':
      if (M.type === 'in' && M.cat === 'abroad' && !M.from) return 'پول از خارج — کی روان کرد؟';
      if (M.type === 'in' && M.cat === 'abroad' && !M.country) return 'از کدام کشور؟';
      return (M.editId ? '✏️ تغییر ' : '') + (M.type === 'in' ? 'پول آمد' : 'مصرف') + (M.cat ? ' — ' + catOf(M.type, M.cat).name : ' — برای چه؟');
    case 'txView': { const x = S.txns.find((t) => t.id === M.id); return x ? catOf(x.type, x.cat).name : ''; }
    case 'catNew': return M.type === 'in' ? 'نوع نو برای پول آمد' : 'نوع نو برای مصرف';
    case 'give': return M.to ? 'خرچی برای ' + nm(M.to) : 'خرچی — به کی؟';
    case 'hand': return 'خرچی در دست ' + nm(M.id);
    case 'return': return 'پس دادن باقی پول';
    case 'contact': return 'شخص نو';
    case 'loanNew': return (M.dir === 'lent' ? 'قرض دادیم' : 'قرض گرفتیم') + (!M.who ? ' — به/از کی؟' : !M.for ? ' — برای چه؟' : ' — ' + nm(M.who));
    case 'loan': { const l = S.loans.find((r) => r.id === M.id); return 'قرض ' + nm(l?.who); }
    case 'loanPay': { const l = S.loans.find((r) => r.id === M.id); return (M.editId ? 'تغییر پرداخت — ' : l?.dir === 'lent' ? 'پس آورد — ' : 'ما پس دادیم — ') + nm(l?.who); }
    case 'loanFor': return 'قرض برای چه بود؟';
    case 'jarNew': return M.goal ? 'هدف پس‌انداز — چقدر؟' : 'پس‌انداز نو — برای چه؟';
    case 'jar': return 'پس‌انداز ' + goalOf(S.jars.find((r) => r.id === M.id)?.goal).name;
    case 'jarMove': return M.dir === 'in' ? 'گذاشتن در پس‌انداز' : 'برداشتن از پس‌انداز';
    case 'pocket': return 'جیب من — فقط در همین تلفون';
    case 'pocketAdd': return M.type === 'in' ? 'پول آمد به جیب من' : 'خرچ از جیب من';
    case 'summary': return 'خلاصهٔ ماه برای فامیل';
    default: return '';
  }
}
const sheet = (head, body) => `<div class="sheet-bg${sheetEnters(shownKind, V.modal?.kind) ? ' enter' : ''}" data-a="closeBg"><div class="sheet">
  <div class="head">${S.members.length && !V.modal?.required ? `<button class="iconbtn" data-a="close">${L('✖', 'بستن')}</button>` : '<span style="width:56px"></span>'}<span class="t">${head}<span class="hlab">${esc(sheetTitle(V.modal))}</span></span><span style="width:56px"></span></div>
  ${body}</div></div>`;

const keypad = (val, cur) => `
  <div class="display">${val ? money(+val, cur) : '<span class="muted">۰</span>'}</div>
  <div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'].map((k) =>
    `<button data-a="key" data-v="${k}">${faDigits(k)}</button>`).join('')}</div>`;

function modalView() {
  const M = V.modal;
  if (!M) return '';
  switch (M.kind) {
    case 'setup': case 'member': {
      const first = M.kind === 'setup';
      return sheet(first ? '👋' : '➕👤', `
        <div class="row" style="justify-content:center;margin-bottom:12px">
          ${M.photo ? face({ photo: M.photo }, 'f80') : `<span class="face f80">${M.emoji ?? '❔'}</span>`}
          <button class="iconbtn" data-a="mphoto">${L('📷', 'عکس')}</button></div>
        <div class="grid" style="grid-template-columns:repeat(6,1fr)">${FACES.map((f) =>
          `<button class="tile ${M.emoji === f && !M.photo ? 'sel' : ''}" style="min-height:0;padding:6px" data-a="memoji" data-v="${f}"><span class="pic" style="font-size:36px;height:44px;line-height:44px">${f}</span></button>`).join('')}</div>
        <p><input class="name" id="mname" placeholder="نام (اختیاری)" value="${esc(M.name)}"></p>
        ${first || M.self ? '' : `<div class="seg">
          <button data-a="mrole" data-v="viewer" class="${M.role === 'viewer' ? 'on' : ''}">👁️<small>بیننده</small></button>
          <button data-a="mrole" data-v="admin" class="${M.role === 'admin' ? 'on' : ''}">👑<small>مدیر</small></button></div>`}
        <button class="save" data-a="msave" ${M.emoji || M.photo ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'welcome':
      return sheet('👋', `
        <button class="save" style="background:var(--in)" data-a="pasteInvite">📋 لینک دعوت دارم — بچسبانم</button>
        <p class="lbl" style="text-align:center">لینک را از واتساپ کاپی کنید، بعد این دکمه را بزنید</p>
        <button class="save" data-a="loginStart">🔑 ورود — نام کاربری و رمز دارم</button>
        <button class="save" style="background:#555" data-a="newFamily">🆕 فامیل نو می‌سازم — من مدیر هستم</button>`);
    case 'paste':
      return sheet('📋', `
        <label class="field">🔗<input id="invtext" placeholder="لینک دعوت را اینجا بچسبانید" autocapitalize="none" spellcheck="false" dir="ltr"></label>
        ${M.err ? `<p class="out-c" style="text-align:center;font-weight:700">❗ ${esc(M.err)}</p>` : ''}
        <button class="save" data-a="pasteGo">✅ وصل شو به فامیل</button>
        <p class="lbl" style="text-align:center">در جعبه انگشت را نگه دارید ← Paste</p>`);
    case 'login':
    case 'pinForgot': {
      const f = M.kind === 'login';
      return sheet('🔑', `
        <label class="field">👤<input id="${f ? 'luser' : 'fuser'}" placeholder="نام کاربری" autocomplete="username" autocapitalize="none" spellcheck="false" dir="auto"></label>
        <label class="field">🔑<input id="${f ? 'lpass' : 'fpass'}" placeholder="رمز — مثلاً abcd-2345" autocomplete="current-password" autocapitalize="none" spellcheck="false" dir="ltr"></label>
        ${M.err ? `<p class="out-c" style="text-align:center;font-weight:700">❗ ${esc(M.err)}</p>` : ''}
        <button class="save" data-a="${f ? 'loginGo' : 'pinForgotGo'}" ${M.busy ? 'disabled' : ''}>${M.busy ? '⏳' : '✅ ' + (f ? 'ورود' : 'رمز نو بسازم')}</button>
        ${f ? '<p class="lbl" style="text-align:center">نام کاربری و رمز را مدیر می‌سازد: 🗝️ ← اعضای فامیل ← 🔑 — رمز، PIN نیست</p>' : '<p class="lbl" style="text-align:center">نام کاربری ندارید؟ از مدیر بخواهید: اعضای فامیل ← 🔒↩️ رمز نو</p>'}
        ${f ? `<button class="save" style="background:var(--in)" data-a="pasteInvite">📋 لینک دعوت دارم — بچسبانم</button>
          ${M.back ? '<button class="save" style="background:#555" data-a="loginBack">↩️ پس</button>' : ''}` : ''}`);
    }
    case 'mlogin': {
      const m = member(M.memberId);
      if (M.pass) {
        return sheet(`🔑 ${face(m, 'f40')}`, `<div class="stmt" style="text-align:center">
            <div class="lbl">🔗 لینک</div><div class="cred" dir="ltr">${esc(siteLink())}</div>
            <div class="lbl">👤 نام کاربری</div><div class="cred cred-big" dir="auto">${esc(M.user)}</div>
            <div class="lbl">🔑 رمز</div><div class="cred cred-big" dir="ltr">${esc(M.pass)}</div></div>
          <p class="lbl" style="text-align:center">رمز فقط همین حالا دیده می‌شود — همین حالا بفرستید</p>
          <button class="save wa" data-a="mloginWa">💬 فرستادن به واتساپ</button>
          <button class="save" style="background:#555" data-a="mloginCopy">📋 کاپی</button>`);
      }
      return sheet(`🔑 ${face(m, 'f40')}`, `
        ${m?.loginUser ? `<p class="lbl" style="text-align:center">ورود فعلی: <b dir="auto">${esc(m.loginUser)}</b> — رمز نو، رمز کهنه را باطل می‌کند</p>` : ''}
        <label class="field">👤<input id="muser" placeholder="نام کاربری — مثلاً ali" value="${esc(M.user || '')}" autocapitalize="none" spellcheck="false" dir="auto"></label>
        <label class="field">🔑<input id="mpass" placeholder="رمز — حداقل ۶ حرف یا عدد" value="${esc(M.pass0 || '')}" autocapitalize="none" spellcheck="false" dir="ltr"></label>
        <p class="lbl" style="text-align:center">رمز را خودتان بنویسید یا همین را نگه دارید — حداقل ۶ حرف یا عدد (انگلیسی). این PIN نیست.</p>
        ${M.err ? `<p class="out-c" style="text-align:center;font-weight:700">❗ ${esc(M.err)}</p>` : ''}
        <button class="save" data-a="mloginMake" ${M.busy ? 'disabled' : ''}>${M.busy ? '⏳' : '🔑 ساختن ورود'}</button>
        ${SY ? '' : '<p class="out-c" style="text-align:center">☁️❗ برای ساختن ورود انترنت لازم است</p>'}`);
    }
    case 'who':
      return sheet('👤❓', `<div class="grid">${S.members.filter((m) => !m.deleted).map((m) => `
        <button class="tile ${m.id === S.me ? 'sel' : ''}" data-a="iam" data-v="${m.id}">
          <span class="badge">${ROLE_ICON[roleOf(m)]}</span>${face(m, 'f80')}<small>${esc(m.name)}</small></button>`).join('')}
        ${me() && !writer() ? '' : '<button class="tile add" data-a="newSelf"><span class="pic">➕</span><small>من نو هستم</small></button>'}</div>
        ${CLOUD ? `<button class="save" style="background:var(--in)" data-a="pasteInvite">📋 لینک دعوت دارم — بچسبانم</button>
          <button class="save" style="background:var(--sel)" data-a="loginStart">🔑 ورود با نام کاربری و رمز</button>` : ''}`);
    case 'people':
      return sheet('👨‍👩‍👧', `<div class="list">${S.members.filter((m) => !m.deleted).map((m) => `
        <div class="item">${face(m, 'f56')}<span class="grow">${esc(m.name)}</span>
          <button class="round" data-a="${m.id === S.me ? 'noop' : 'roleCycle'}" data-v="${m.id}">${L(ROLE_ICON[roleOf(m)], ROLE_NAME[roleOf(m)])}</button>
          ${m.id === S.me ? '' : `<button class="round ${m.pin ? '' : 'warn'}" data-a="memberPin" data-v="${m.id}">${m.pin ? L('🔒↩️', 'رمز نو') : L('🔓', 'رمز بده')}</button>`}
          <button class="round ${m.loginUser ? '' : 'warn'}" data-a="memberLogin" data-v="${m.id}">${L('🔑', m.loginUser ? 'ورود' : 'ورود بده')}</button>
          ${m.id === S.me ? '' : `<button class="round" data-a="rmMember" data-v="${m.id}">${L('🗑️', 'پاک')}</button>`}</div>`).join('')}</div>
        <button class="save" data-a="newMember">➕👤 عضو نو</button>
        ${SY ? '<button class="save" style="background:var(--sel)" data-a="invite">📲 دعوت با QR</button>' : ''}`);
    case 'pin': {
      const locked = Date.now() < pinLockUntil;
      const head = { set: '🔒➕', confirm: '🔒🔁', check: '🔒' }[M.mode];
      const dots = Array.from({ length: PIN_LEN }, (_, i) => (i < M.seq.length ? '●' : '○')).join(' ');
      return sheet(head, `
        <div class="display ${M.shake ? 'shake' : ''}" style="letter-spacing:8px">${locked ? '⏳' : dots}</div>
        <div class="keys pin">${PIN_KEYS.slice(0, 9).map((k, i) =>
          `<button data-a="pinTap" data-v="${i}" ${locked ? 'disabled' : ''}>${k}</button>`).join('')}
          <span></span><button data-a="pinTap" data-v="9" ${locked ? 'disabled' : ''}>${PIN_KEYS[9]}</button>
          <button data-a="pinBack">⌫</button></div>
        ${M.mode === 'check' && CLOUD ? '<button class="save" style="background:#555;margin-top:12px" data-a="pinForgot">🔑 رمز را فراموش کردم</button>' : ''}`);
    }
    case 'give':
      if (!M.to) {
        return sheet('🤲', `<div class="grid">${S.members.filter((m) => !m.deleted && m.id !== S.me).map((m) => `
          <button class="tile" data-a="giveTo" data-v="${m.id}">${face(m, 'f80')}<small>${esc(m.name)}</small></button>`).join('')}</div>`);
      }
      return sheet(`🤲 ${face(member(M.to), 'f40')}`, `${keypad(M.amount, S.currency)}
        <button class="save" data-a="giveSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    case 'hand': {
      const p = M.id;
      const bal = hands()[p] || 0;
      const ev = [
        ...(S.cash || []).filter((c) => !c.deleted && c.currency === S.currency && (c.to === p || c.from === p))
          .map((c) => ({ ts: c.ts, icon: c.kind === 'give' ? '🤲' : '↩️', amt: c.kind === 'give' && c.to === p ? c.amount : -c.amount, who: c.kind === 'give' ? c.from : c.to })),
        ...S.txns.filter((x) => !x.deleted && x.by === p && x.paidFrom === 'hand' && x.currency === S.currency)
          .map((x) => ({ ts: x.ts, icon: catOf('out', x.cat).icon, amt: -x.amount, who: null })),
      ].sort((a, b) => b.ts - a.ts).slice(0, 30);
      const canReturn = bal > 0 && writer();
      return sheet(`🤲 ${face(member(p), 'f40')}`, `
        <div class="display">${money(bal, S.currency)}</div>
        <div class="list" style="margin-top:10px">${ev.map((e) => `<div class="tx"><span class="cat">${e.icon}</span>
          <span class="grow amt ${e.amt >= 0 ? 'in-c' : 'out-c'}">${money(Math.abs(e.amt), S.currency)}</span>
          ${e.who ? face(member(e.who), 'f24') : ''}<span class="lbl">${dayLabel(e.ts)}</span></div>`).join('') || '<div class="empty">🤲</div>'}</div>
        ${canReturn ? `<button class="save" data-a="returnStart">↩️ پس دادن باقی پول</button>` : ''}`);
    }
    case 'return':
      return sheet(`↩️ ${face(member(M.from), 'f40')}`, `${keypad(M.amount, S.currency)}
        <button class="save" data-a="returnSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    case 'contact':
      return sheet('➕👤', `
        <div class="row" style="justify-content:center;margin-bottom:12px">
          ${M.photo ? face({ photo: M.photo }, 'f80') : `<span class="face f80">${M.emoji ?? '❔'}</span>`}
          <button class="iconbtn" data-a="cphoto">${L('📷', 'عکس')}</button></div>
        <div class="grid" style="grid-template-columns:repeat(6,1fr)">${FACES.map((f) =>
          `<button class="tile ${M.emoji === f && !M.photo ? 'sel' : ''}" style="min-height:0;padding:6px" data-a="cemoji" data-v="${f}"><span class="pic" style="font-size:36px;height:44px;line-height:44px">${f}</span></button>`).join('')}</div>
        <p><input class="name" id="cname" placeholder="نام" value="${esc(M.name)}"></p>
        <button class="save" data-a="csave" ${M.emoji || M.photo ? '' : 'disabled'}>✅ ثبت</button>`);
    case 'loanNew': {
      const head = M.dir === 'lent' ? '📤' : '📥';
      if (!M.who) return sheet(`${head} 👤❓`, contactGrid('loanWho'));
      if (!M.for) {
        return sheet(`${head} ${face(contact(M.who), 'f40')} ❓`, `<div class="grid">${LOAN_FOR.map((f) =>
          `<button class="tile" data-a="loanFor" data-v="${f.id}"><span class="pic">${f.icon}</span><small>${f.name}</small></button>`).join('')}</div>`);
      }
      return sheet(`${head} ${face(contact(M.who), 'f40')} ${forOf(M.for).icon}`, `
        <div class="row" style="margin-bottom:10px;justify-content:center"><div class="seg cur" style="width:190px">
          <button data-a="txCur" data-v="AFN" class="${M.currency === 'AFN' ? 'on' : ''}" style="font-size:26px">افغانی</button>
          <button data-a="txCur" data-v="USD" class="${M.currency === 'USD' ? 'on' : ''}" style="font-size:26px">دالر</button></div></div>
        ${keypad(M.amount, M.currency)}
        ${loanExtras(M)}
        <button class="save" data-a="loanSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'loan': {
      const st = loanStatement(S.loans, M.id);
      if (!st) return '';
      const l = st.loan, canEdit = writer() && (isAdmin() || l.by === S.me);
      return sheet(`${l.dir === 'lent' ? '📤' : '📥'} ${face(contact(l.who), 'f40')}`, `${statementCard(st, true, canEdit)}
        ${canEdit && st.left ? `<button class="save" data-a="loanPayStart">💵 ${l.dir === 'lent' ? 'پس آورد' : 'پس دادن قرض'}</button>` : ''}
        ${canEdit ? '<button class="save danger" data-a="loanDel">🗑️ پاک کردن</button>' : ''}`);
    }
    case 'loanFor': {
      const l = S.loans.find((r) => r.id === M.id);
      return sheet('✏️ ❓', `<div class="grid">${LOAN_FOR.map((f) =>
        `<button class="tile ${(l?.for || 'other') === f.id ? 'sel' : ''}" data-a="loanForSet" data-v="${f.id}"><span class="pic">${f.icon}</span><small>${f.name}</small></button>`).join('')}</div>`);
    }
    case 'loanPay': {
      const st = loanStatement(S.loans, M.id);
      if (!st) return '';
      const l = st.loan, lent = l.dir === 'lent', f = forOf(st.for);
      const old = M.editId ? st.pays.find((x) => x.id === M.editId)?.amount || 0 : 0;   // editing: this payment is not counted yet
      const paidBefore = st.paid - old, leftBefore = st.left + old;
      const after = leftBefore - (+M.amount || 0);
      return sheet('💵', `<div class="stmt">
          <div class="stmt-head">${M.editId ? '✏️ تغییر پرداخت — ' : '💵 '}${lent ? `${who(l.who)} پس می‌آورد` : `پس دادن به ${who(l.who)}`}</div>
          <div class="stmt-for">${f.icon} برای: <b>${f.name}</b> · قرض ${dateLabel(l.ts, l.noTime)}</div>
          ${l.note ? `<div class="note">📝 ${esc(l.note)}</div>` : ''}
          <div class="stmt-sum">
            <div><span class="lab">کل قرض</span><b>${money(st.total, l.currency)}</b></div>
            <div><span class="lab">${lent ? 'پس آورد' : 'پس دادیم'} تا حال</span><b>${money(paidBefore, l.currency)}</b></div>
            <div class="${lent ? 'in-c' : 'out-c'}"><span class="lab">باقی</span><b>${money(leftBefore, l.currency)}</b></div></div></div>
        ${keypad(M.amount, l.currency)}
        <div class="after">${after >= 0 ? `بعد از این، باقی: <b class="${after ? '' : 'in-c'}">${after ? money(after, l.currency) : '✅ صاف'}</b>` : '<b class="out-c">❗ بیشتر از باقی است</b>'}</div>
        ${loanExtras(M, 'برای چه؟ مثلاً قسط اول، نقد، حواله')}
        <button class="save" data-a="loanPaySave" ${+M.amount > 0 && after >= 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'jarNew':
      if (!M.goal) {
        return sheet('➕🫙', `<div class="grid">${GOALS.map((g) =>
          `<button class="tile" data-a="jarGoal" data-v="${g.id}"><span class="pic">${g.icon}</span><small>${g.name}</small></button>`).join('')}</div>`);
      }
      return sheet(`${goalOf(M.goal).icon} 🎯`, `${keypad(M.amount, S.currency)}
        <button class="save" data-a="jarSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    case 'jar': {
      const j = S.jars.find((r) => r.id === M.id);
      const saved = jarTotals(S.jars)[j.id] || 0;
      const pct = j.target > 0 ? Math.min(100, Math.round((saved / j.target) * 100)) : 0;
      const moves = S.jars.filter((r) => r.kind === 'move' && r.jarId === j.id && !r.deleted).sort((a, b) => b.ts - a.ts).slice(0, 20);
      return sheet(`${goalOf(j.goal).icon}`, `
        <div class="row" style="justify-content:center;gap:20px">
          <span class="glass big"><span class="fillj" style="height:${pct}%"></span><span class="gi">${faDigits(pct)}٪</span></span>
          <div><div class="amt in-c" style="font-size:28px;font-weight:700">${money(saved, j.currency)}</div>
            <div class="lbl">🎯 ${money(j.target, j.currency)}</div></div></div>
        <div class="list" style="margin-top:10px">${moves.map((m) => `<div class="tx"><span class="cat">${m.amount >= 0 ? '➕' : '➖'}</span>
          <span class="grow amt ${m.amount >= 0 ? 'in-c' : 'out-c'}">${money(Math.abs(m.amount), j.currency)}</span>${face(member(m.by), 'f24')}<span class="lbl">${dayLabel(m.ts)}</span></div>`).join('')}</div>
        <div class="row" style="gap:10px">
          ${writer() ? '<button class="save" data-a="jarMoveStart" data-v="in">➕ گذاشتن</button>' : ''}
          ${isAdmin() ? '<button class="save danger" data-a="jarMoveStart" data-v="out">➖ برداشتن</button>' : ''}</div>
        ${isAdmin() ? '<button class="save" style="background:#555" data-a="jarDel">🗑️ پاک کردن</button>' : ''}`);
    }
    case 'jarMove':
      return sheet(`${goalOf(S.jars.find((r) => r.id === M.id)?.goal).icon} ${M.dir === 'in' ? '➕' : '➖'}`, `${keypad(M.amount, S.currency)}
        <button class="save ${M.dir === 'out' ? 'danger' : ''}" data-a="jarMoveSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    case 'pocket': {
      const bal = pocketBalance(P.entries, S.currency);
      const list = P.entries.filter((e) => !e.deleted && e.currency === S.currency).sort((a, b) => b.ts - a.ts).slice(0, 40);
      return sheet('👛 📱🔒', `
        <div class="display ${bal >= 0 ? 'in-c' : 'out-c'}">${money(bal, S.currency)}</div>
        <div class="row" style="justify-content:center;margin-top:8px">${curSwitch()}</div>
        <div class="bigbtns" style="margin-top:12px">
          <button class="big in" data-a="pocketAdd" data-v="in">➕<small>پول آمد</small></button>
          <button class="big out" data-a="pocketAdd" data-v="out">➖<small>خرچ کردم</small></button></div>
        <div class="list" style="margin-top:12px">${list.map((e) => `<div class="tx"><span class="cat">${esc(e.icon)}</span>
          <span class="grow amt ${e.type}-c">${money(e.amount, e.currency)}</span><span class="lbl">${dayLabel(e.ts)}</span>
          <button class="round" data-a="pocketDel" data-v="${e.id}">${L('🗑️', 'پاک')}</button></div>`).join('') || '<div class="empty">👛</div>'}</div>
        <p class="lbl" style="text-align:center">📱🔒</p>`);
    }
    case 'pocketAdd': {
      const icons = M.type === 'in' ? [['💼', 'کار'], ['🎁', 'تحفه'], ['👨‍👩‍👧', 'فامیل'], ['🧵', 'خیاطی'], ['❓', 'دیگر']]
        : [['🛒', 'سودا'], ['👕', 'لباس'], ['💊', 'دوا'], ['🎁', 'تحفه'], ['📱', 'تیلفون'], ['🚕', 'کرایه'], ['❓', 'دیگر']];
      return sheet(`👛 ${M.type === 'in' ? '➕' : '➖'}`, `
        <div class="chips" style="justify-content:center;flex-wrap:wrap">${icons.map(([ic, nm]) =>
          `<button class="chip col ${M.icon === ic ? 'on' : ''}" data-a="pocketIcon" data-v="${ic}"><span class="row1">${ic}</span><span class="lab">${nm}</span></button>`).join('')}</div>
        ${keypad(M.amount, S.currency)}
        <button class="save" data-a="pocketSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'summary': {
      V.month ||= monthKey(Date.now());
      const t = totals(S.txns, S.currency, V.month);
      const c = monthCash(S.txns, S.loans, S.currency, V.month);
      const pages = [
        () => { const mx = Math.max(t.in, t.out, 1); const b = (ic, v, col) => `<div class="bar"><span class="ic">${ic}</span>
            <span class="track"><span class="fill" style="display:block;width:${(v / mx) * 100}%;background:${col}"></span></span>
            <span class="v">${money(v, S.currency)}</span></div>`;
          return `<div class="slide-t">${monthLabel(V.month)}<span class="lab">آمد، مصرف و باقی</span></div><div class="bars">${b('⬇️', t.in, 'var(--in)')}${b('⬆️', t.out, 'var(--out)')}</div>
            <div class="lbl" style="text-align:center">↪️ از ماه قبل: ${signed(c.opening, S.currency)}${c.loanPaid ? ` · 🤝 − ${money(c.loanPaid, S.currency)}` : ''}${c.lent ? ` · 📤 − ${money(c.lent, S.currency)}` : ''}${c.repaid ? ` · 💵 + ${money(c.repaid, S.currency)}` : ''}</div>
            <div class="slide-big ${c.closing >= 0 ? 'in-c' : 'out-c'}">${c.closing >= 0 ? '🟢' : '🔴'} ${money(Math.abs(c.closing), S.currency)}</div>`; },
        () => `<div class="slide-t">⬆️ 🧩<span class="lab">مصرف به کدام چیز (این ماه / ماه قبل)</span></div><div class="list">${monthCompare(S.txns, S.currency, V.month).slice(0, 5).map((r) => {
            const arrow = r.now > r.prev ? '<span class="out-c">⬆️</span>' : r.now < r.prev ? '<span class="in-c">⬇️</span>' : '🟰';
            return `<div class="tx"><span class="cat">${L(catOf('out', r.cat).icon, catOf('out', r.cat).name)}</span><span class="grow amt">${money(r.now, S.currency)}</span>
              ${arrow}<span class="lbl">${money(r.prev, S.currency)}</span></div>`; }).join('') || '<div class="empty">—</div>'}</div>`,
        () => { const net = jarsMonthNet(S.jars, S.currency, V.month);
          return `<div class="slide-t">🫙<span class="lab">پس‌انداز</span></div>${jarsRow()}<div class="slide-big ${net >= 0 ? 'in-c' : 'out-c'}">${net >= 0 ? '➕' : '➖'} ${money(Math.abs(net), S.currency)}</div>`; },
        () => { const l = loansView(S.loans, S.currency);
          return `<div class="slide-t">🤝<span class="lab">قرض</span></div><div class="sum"><div class="in-c">📤 ${money(l.open.lent, S.currency)}</div>
            <div class="out-c">📥 ${money(l.open.borrowed, S.currency)}</div></div>`; },
      ];
      const i = Math.max(0, Math.min(pages.length - 1, M.page));
      return sheet('👨‍👩‍👧 📅', `<div class="slide">${pages[i]()}</div>
        <div class="row" style="justify-content:space-between;margin-top:14px">
          <button class="iconbtn" data-a="sumNav" data-v="-1" ${i === 0 ? 'disabled' : ''}>${L('▶️', 'قبلی')}</button>
          <span>${pages.map((_, k) => (k === i ? '●' : '○')).join(' ')}</span>
          <button class="iconbtn" data-a="sumNav" data-v="1" ${i === pages.length - 1 ? 'disabled' : ''}>${L('◀️', 'بعدی')}</button></div>`);
    }
    case 'catNew': {
      const lib = M.type === 'in' ? IN_PICS : OUT_PICS;
      const found = searchPicker(lib, M.q);
      const list = found.length ? found : lib;
      return sheet(M.type === 'in' ? '⬇️➕' : '⬆️➕', `
        <div class="row" style="justify-content:center;margin-bottom:10px"><span class="face f80" style="border-radius:20px">${M.icon ? esc(M.icon) : '❔'}</span></div>
        <p style="margin:0 0 8px"><input class="name" id="catname" placeholder="نام را بنویسید — مثلاً قالین‌بافی" value="${esc(M.name)}" autocomplete="off"></p>
        ${M.q && !found.length ? '<p class="lbl" style="text-align:center">تصویر پیدا نشد — یک تصویر انتخاب کنید و نام خود را نگه دارید</p>' : ''}
        <div class="grid picker">${list.map((p) => `
          <button class="tile ${M.icon === p.icon ? 'sel' : ''}" data-a="catPick" data-v="${lib.indexOf(p)}">
            <span class="pic">${p.icon}</span><small>${p.name}</small></button>`).join('')}</div>
        <button class="save" data-a="catSave" ${M.icon && (M.name || '').trim() ? '' : 'disabled'}>✅ ثبت نوع نو</button>`);
    }
    case 'invite':
      return sheet('📲', `<div class="card" style="display:grid;justify-items:center">
          <div id="qr" style="width:260px;height:260px;display:grid;place-items:center">⏳</div></div>
        ${navigator.share ? '<button class="save" data-a="shareLink">📤 فرستادن لینک</button>' : ''}
        <button class="save" style="background:#555" data-a="copyLink">📋 کاپی لینک</button>
        <p class="lbl" style="text-align:center">آیکون خانه (Home Screen): لینک را کاپی کنید ← اپ را باز کنید ← 📋 لینک دعوت دارم</p>`);
    case 'tx': {
      const cats = catsFor(BASE_CATS, S.cats || [], M.type).map((c) => ({ ...c, icon: esc(c.icon), name: esc(c.name) }));
      const head = `<span class="${M.type}-c">${M.type === 'in' ? '⬇️' : '⬆️'}</span> ${M.cat ? catOf(M.type, M.cat).icon : ''}`;
      if (!M.cat) {
        return sheet(head, `<div class="grid">${cats.map((c) =>
          `<button class="tile" data-a="txCat" data-v="${c.id}"><span class="pic">${c.icon}</span><small>${c.name}</small></button>`).join('')}
          <button class="tile add newitem" data-a="catNew"><span class="pic">➕</span><small>نوع نو</small></button></div>`);
      }
      if (M.type === 'in' && M.cat === 'abroad' && !M.from) return sheet(`${head} 👤❓`, contactGrid('txSender'));
      if (M.type === 'in' && M.cat === 'abroad' && !M.country) {
        return sheet(`${head} ${face(contact(M.from), 'f40')}`, `<div class="grid">${COUNTRIES.map((c) =>
          `<button class="tile" data-a="txCountry" data-v="${c.id}"><span class="pic">${c.icon}</span><small>${c.name}</small></button>`).join('')}</div>`);
      }
      const abroad = M.type === 'in' && M.cat === 'abroad';
      return sheet(head, `
        ${M.editId ? `<div class="row" style="justify-content:center;margin-bottom:10px"><button class="chip" data-a="txCatChange">${catOf(M.type, M.cat).icon} ${catOf(M.type, M.cat).name} ✏️ <small>تغییر نوع</small></button></div>` : ''}
        ${abroad ? `<div class="row" style="justify-content:center;margin-bottom:8px">${face(contact(M.from), 'f40')}
          <span style="font-size:30px">${countryOf(M.country)?.icon || ''}</span>
          <button class="chip ${M.feeMode ? 'on' : ''}" data-a="txFeeMode">🏦 کمیشن <b>${M.fee ? money(+M.fee, M.currency) : '۰'}</b></button></div>` : ''}
        <div class="row" style="margin-bottom:10px;justify-content:center">
          <div class="seg cur" style="width:190px">
            <button data-a="txCur" data-v="AFN" class="${M.currency === 'AFN' ? 'on' : ''}" style="font-size:26px">افغانی</button>
            <button data-a="txCur" data-v="USD" class="${M.currency === 'USD' ? 'on' : ''}" style="font-size:26px">دالر</button></div></div>
        ${M.type === 'out' && hands()[S.me] ? `<div class="seg" style="margin-bottom:10px">
          <button data-a="txFrom" data-v="hand" class="${M.paidFrom === 'hand' ? 'on' : ''}">🤲<small>از خرچی ${money(hands()[S.me] || 0, M.currency)}</small></button>
          <button data-a="txFrom" data-v="home" class="${M.paidFrom !== 'hand' ? 'on' : ''}">🏠<small>از پول خانه</small></button></div>` : ''}
        ${keypad(M.feeMode ? M.fee || '' : M.amount, M.currency)}
        <div class="row" style="margin-top:12px;justify-content:center;gap:14px">
          <button class="iconbtn" data-a="txPhoto">${L(M.photo ? '✅' : '📷', 'عکس رسید')}</button>
          <button class="iconbtn" data-a="txWhen">${L(M.when ? '✅' : '📅', M.when ? dayLabel(whenTs(M.when)) : M.ts ? dayLabel(M.ts) : 'الان')}</button>
          <button class="iconbtn" data-a="txNote">${L(M.note ? '✅' : '📝', 'یادداشت')}</button>
          <button class="iconbtn" data-a="txVoice" style="${M.recording ? 'background:var(--out)' : ''}">${L(M.recording ? '⏹️' : M.voice ? '✅' : '🎤', M.recording ? 'ایستاد' : 'صدا')}</button>
        </div>
        ${M.whenOpen ? `<label class="notebox">📅<input id="txwhen" type="datetime-local" max="${localISO(Date.now())}" value="${esc(M.when || localISO(M.ts || Date.now()))}"></label>` : ''}
        ${M.noteOpen || M.note ? `<label class="notebox">📝<input id="txnote" maxlength="120" placeholder="یادداشت — چرا؟ (اختیاری)" value="${esc(M.note)}" autocomplete="off"></label>` : ''}
        ${M.photo ? `<img class="photo-prev" style="margin-top:10px;max-height:160px" ${mediaAttr(M.photo)} alt="">` : ''}
        <button class="save" data-a="txSave" ${+M.amount > 0 && !M.recording ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'txView': {
      const x = S.txns.find((t) => t.id === M.id);
      const c = catOf(x.type, x.cat);
      const canDel = writer() && (isAdmin() || x.by === S.me);
      return sheet(`${c.icon}`, `
        <div class="card" style="text-align:center">
          <div class="amt ${x.type}-c" style="font-size:40px;font-weight:700">${x.type === 'in' ? '⬇️' : '⬆️'} ${money(x.amount, x.currency)}</div>
          <div class="row" style="justify-content:center;margin-top:8px">${face(member(x.by))}<span class="lbl">${dayLabel(x.ts)} · ${c.name}</span></div>
          ${x.cat === 'abroad' ? `<div class="row" style="justify-content:center;margin-top:8px">${face(contact(x.from))}
            <span style="font-size:28px">${countryOf(x.country)?.icon || ''}</span>${x.fee ? `<span class="lbl">🏦 ${money(x.fee, x.currency)}</span>` : ''}</div>` : ''}
        </div>
        ${x.note ? `<div class="card notecard">📝 ${esc(x.note)}</div>` : ''}
        ${x.photo ? `<img class="photo-prev" ${mediaAttr(x.photo)} alt="">` : ''}
        ${x.voice ? `<audio controls ${mediaAttr(x.voice)} style="width:100%;margin-top:10px"></audio>` : ''}
        ${x.deleted && isAdmin() ? '<button class="save" data-a="txRestore">↩️ دوباره آوردن</button>'
          : canDel && !x.deleted ? `<button class="save" data-a="txEdit" data-v="${x.id}">✏️ تغییر</button><button class="save danger" data-a="txDel">🗑️ پاک کردن</button>` : ''}`);
    }
  }
  return '';
}

let shownKind = null; // pop-up kind on screen right now
function render() {
  if (updateReady && !V.modal) { location.reload(); return; }
  if (!S.members.length && !V.modal && !V.waiting) V.modal = { kind: CLOUD && !hasFamily() ? 'welcome' : 'setup' };
  if (S.members.length && !member(S.me) && !V.modal && !V.waiting) V.modal = { kind: 'who' };
  if (V.waiting && !S.members.length) { $app.innerHTML = '<div class="empty" style="opacity:1">☁️⏳</div>'; return; }
  if (!canTab(role(), V.tab)) V.tab = 'money';
  S.cash ||= []; S.loans ||= []; S.jars ||= []; S.contacts ||= []; S.cats ||= [];
  const body = S.members.length
    ? ({ money: moneyView, loans: loansViewUI, report: viewerReportView, admin: adminView }[V.tab] || moneyView)()
    : '';
  const focus = document.activeElement?.id;
  const typed = [...$app.querySelectorAll('input[id]')].map((el) => [el.id, el.value]);
  // Same pop-up redrawn after a tap: keep its scroll so the pictures don't jump away.
  const kind = V.modal?.kind || null;
  const SCROLLERS = ['.sheet', '.sheet .picker'];
  const kept = kind && kind === shownKind ? SCROLLERS.map((q) => $app.querySelector(q)?.scrollTop || 0) : [];
  $app.innerHTML = (S.members.length ? top() : '') + body + (S.members.length ? tabs() : '') + modalView();
  shownKind = $app.querySelector('.sheet') ? kind : null;
  kept.forEach((y, i) => { const el = y && $app.querySelector(SCROLLERS[i]); if (el) el.scrollTop = y; });
  for (const [id, v] of typed) { const el = document.getElementById(id); if (el) el.value = v; }
  if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  hydrate();
}

// Photos/voice stored in the cloud are fetched only when opened.
const mediaAttr = (v) => v.startsWith('media:') ? `data-media="${esc(v.slice(6))}"` : `src="${v}"`;
function hydrate() {
  for (const el of $app.querySelectorAll('[data-media]')) {
    const safe = el.tagName === 'AUDIO' ? safeAudio : safeImage;
    SY?.getMedia(el.dataset.media).then((src) => { if (safe(src) && !src.startsWith('media:')) el.src = src; });
  }
  const qr = document.getElementById('qr');
  if (qr && SY) drawQR(qr, SY.inviteLink());
}

async function drawQR(el, text) {
  if (!window.qrcode) {
    await new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', integrity: 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1', crossOrigin: 'anonymous', onload: res, onerror: rej })));
  }
  const q = window.qrcode(0, 'M');
  q.addData(text);
  q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  el.firstElementChild.style.cssText = 'width:100%;height:100%';
}

// ---------- voice recording ----------
// One recorder for receipts' voice notes (30 s) and picture names (3 s). Tap again to stop.
let rec = null;
async function record(maxMs, done) {
  if (rec) { rec.stop(); return false; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const r = new MediaRecorder(stream);
    rec = r;
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      rec = null;
      const fr = new FileReader();
      fr.onload = () => done(fr.result);
      fr.readAsDataURL(new Blob(chunks, { type: r.mimeType }));
    };
    r.start();
    setTimeout(() => r.state === 'recording' && r.stop(), maxMs);
    return true;
  } catch { toast('🎤🚫'); return false; }
}
async function toggleVoice() {
  const M = V.modal;
  const started = await record(30000, (d) => { M.voice = safeAudio(d); M.recording = false; render(); });
  if (started) { M.recording = true; render(); }
}

// ---------- actions ----------
// ---------- admin PIN ----------
// Admin screens (report, people, editing lists, deleting others' entries) need the picture PIN.
// Unlocked for 10 minutes, and locked again as soon as the app goes to the background.
let unlockedUntil = 0, pinFails = 0, pinLockUntil = 0;
let P = null, pocketOpen = false;   // this person's private pocket (this phone only)
function requireAdmin(run) {
  if (!isAdmin()) { toast('👑❌'); return; }
  if (Date.now() < unlockedUntil) { run(); return; }
  V.modal = { kind: 'pin', mode: me().pin ? 'check' : 'set', seq: [], run };
  render();
}
const pinOwner = (M) => (M.target === 'member' ? member(M.memberId) : me());
function unlock(M) {
  pinFails = 0;
  if (M.target === 'member') { V.modal = M.back || null; if (M.run) M.run(); else render(); return; }
  if (M.target === 'pocket') { pocketOpen = true; V.modal = { kind: 'pocket' }; render(); return; }
  unlockedUntil = Date.now() + 10 * 60 * 1000;
  V.modal = null;
  if (M.run) M.run(); else render();
}
async function pinTap(i) {
  const M = V.modal;
  if (!M || M.kind !== 'pin' || M.busy || Date.now() < pinLockUntil || M.seq.length >= PIN_LEN) return;
  M.seq.push(i); M.shake = false;
  navigator.vibrate?.(15);
  render();
  if (M.seq.length < PIN_LEN) return;
  M.busy = true;
  const seq = M.seq; M.seq = [];
  if (M.mode === 'set') { M.first = seq; M.mode = 'confirm'; M.busy = false; render(); return; }
  if (M.mode === 'confirm') {
    if (seq.join() !== M.first.join()) { toast('🔁❌'); Object.assign(M, { mode: 'set', first: null, shake: true, busy: false }); render(); return; }
    const pin = await makePin(seq);
    if (M.target === 'pocket') { P.pin = pin; await savePocket(S.me, P); }
    else { const o = pinOwner(M); await commit(() => { o.pin = pin; log('pinSet', '🔒✅', o.name); }); }
    toast('🔒✅');
    unlock(M);
    return;
  }
  if (await checkPin(seq, M.target === 'pocket' ? P.pin : pinOwner(M)?.pin)) { unlock(M); return; }
  pinFails += 1;
  if (pinFails >= 5) { pinLockUntil = Date.now() + 60 * 1000; pinFails = 0; setTimeout(render, 60 * 1000 + 50); }
  Object.assign(M, { shake: true, busy: false });
  navigator.vibrate?.([60, 40, 60]);
  render();
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  saveNow();   // app going to the background: write pending changes now
  unlockedUntil = 0;
  pocketOpen = false;
  if (['pocket', 'pocketAdd'].includes(V.modal?.kind) || V.modal?.target === 'pocket') { V.modal = null; render(); }
  if (V.tab === 'admin') { V.tab = 'money'; V.room = null; render(); }
});

const A = {
  tab: (v) => {
    const go = () => { V.tab = v; V.room = null; V.modal = null; render(); scrollTo(0, 0); };
    if (v === 'admin') requireAdmin(go); else go();
  },
  room: (v) => requireAdmin(() => {
    if (v === 'report' || v === 'loanBook') Object.assign(V, { tab: 'admin', room: v });
    else { if (['people', 'invite', 'summary'].includes(v)) A[v](); return; }   // these open as pop-ups
    V.modal = null; render(); scrollTo(0, 0);
  }),
  roomBack: () => { V.room = null; render(); scrollTo(0, 0); },
  who: () => { V.modal = { kind: 'who' }; render(); },
  iam: (v) => {
    if (!needsPin(member(v), S.me)) { becomeMe(v); return; }
    V.modal = { kind: 'pin', target: 'member', memberId: v, mode: 'check', seq: [], back: null,
      run: () => { becomeMe(v); if (isAdmin()) unlockedUntil = Date.now() + 10 * 60 * 1000; } };   // PIN just typed: don't ask again
    render();
  },
  memberPin: (v) => requireAdmin(() => {   // set or change a person's PIN (admin)
    V.modal = { kind: 'pin', target: 'member', memberId: v, mode: 'set', seq: [], back: { kind: 'people' } };
    render();
  }),
  people: () => requireAdmin(() => { V.modal = { kind: 'people' }; render(); }),
  pinTap: (v) => pinTap(+v),
  pinBack: () => { V.modal.seq.pop(); render(); },
  newSelf: () => { V.modal = { kind: 'member', role: 'viewer', self: true }; render(); },
  roleCycle: (v) => requireAdmin(() => commit(() => {
    const m = member(v);
    const next = nextRole(roleOf(m));
    m.role = next; log('role', ROLE_ICON[next], m.name); V.modal = { kind: 'people' };
  })),
  invite: () => { V.modal = { kind: 'invite' }; render(); },
  shareLink: () => navigator.share?.({ title: 'حساب خانواده', url: SY.inviteLink() }).catch(() => {}),
  copyLink: async () => { try { await navigator.clipboard.writeText(SY.inviteLink()); toast('📋✅'); } catch { toast('📋❌'); } },
  newMember: () => { V.modal = { kind: 'member', role: 'viewer' }; render(); },
  rmMember: (v) => commit(() => { member(v).deleted = true; log('rmMember', '👤🗑️', member(v).name); }),
  memoji: (v) => { V.modal.emoji = v; V.modal.photo = null; keepName('mname'); render(); },
  mphoto: () => { keepName('mname'); takePhoto(240, (p) => { V.modal.photo = p; render(); }); },
  mrole: (v) => { V.modal.role = v; keepName('mname'); render(); },
  msave: () => {
    keepName('mname');
    const M = V.modal, setup = M.kind === 'setup';
    const m = { id: uid(), emoji: M.emoji || '🙂', photo: M.photo || null, name: M.name || '', role: setup ? 'admin' : M.self ? 'viewer' : M.role, ts: Date.now() };
    commit(() => {
      S.members.push(m);
      if (setup || M.self) { S.me = m.id; localStorage.setItem('ff-me', m.id); }
      log('addMember', '👤➕', m.name);
      // Every new person gets a PIN right away (setup: the admin's own PIN).
      V.modal = setup ? { kind: 'pin', mode: 'set', seq: [], run: null, required: true }
        : { kind: 'pin', target: 'member', memberId: m.id, mode: 'set', seq: [], required: true, back: M.self ? null : { kind: 'people' } };
    });
    if (setup) connect();   // new family: now it can be made in the cloud
  },

  noop: () => {},

  // ---------- username + password ----------
  newFamily: () => { V.modal = { kind: 'setup' }; render(); },
  // Join with an invite link copied from WhatsApp — for the home-screen app, which can't open links itself.
  pasteInvite: async () => {
    let inv = null;
    try { inv = parseInvite(await navigator.clipboard.readText()); } catch { /* no permission: show the box */ }
    if (inv) { joinFamily(inv); return; }
    V.modal = { kind: 'paste', back: V.modal }; render();
    document.getElementById('invtext')?.focus();
  },
  pasteGo: () => {
    const inv = parseInvite(document.getElementById('invtext')?.value);
    if (!inv) { V.modal.err = 'این لینک دعوت نیست — دوباره از واتساپ کاپی کنید'; render(); return; }
    joinFamily(inv);
  },
  loginStart: () => { V.modal = { kind: 'login', back: V.modal }; render(); },
  loginGo: async () => {
    const M = V.modal;
    const user = document.getElementById('luser')?.value || '', pass = document.getElementById('lpass')?.value || '';
    if (!user.trim() || !pass.trim()) { M.err = 'نام کاربری و رمز را بنویسید'; render(); return; }
    M.busy = true; M.err = null; render();
    try {
      const { id, code } = await loginKeys(user, pass);
      const { getLogin } = await import('./sync.js');
      const p = await openLogin(user, pass, await getLogin({ config: CLOUD, emulator, id, code }));
      if (!p) { Object.assign(M, { busy: false, err: 'نام کاربری یا رمز درست نیست' }); render(); return; }
      // Join that family as that person. The page reloads and the normal join brings everything down.
      S.me = p.memberId; localStorage.setItem('ff-me', p.memberId);   // log in as that person
      joinFamily(p);
    } catch (e) {
      console.error(e);
      Object.assign(M, { busy: false, err: navigator.onLine ? `مشکل — ${e?.code || 'دوباره کوشش کنید'}` : 'انترنت نیست' }); render();
    }
  },
  loginBack: () => { V.modal = V.modal.back || null; render(); },
  memberLogin: (v) => requireAdmin(() => {
    const m = member(v);
    V.modal = { kind: 'mlogin', memberId: v, user: m.loginUser || (/^[a-z0-9 ._-]+$/i.test(m.name || '') ? normUser(m.name) : ''), pass0: newPassword() };
    render();
  }),
  mloginMake: async () => {
    const M = V.modal, m = member(M.memberId);
    const user = normUser(document.getElementById('muser')?.value);
    const pass = (document.getElementById('mpass')?.value || '').trim();
    M.user = user; M.pass0 = pass;
    if (!user) { M.err = 'نام کاربری بنویسید'; render(); return; }
    if (normPass(pass).length < 6) { M.err = 'رمز کوتاه است — حداقل ۶ حرف یا عدد انگلیسی'; render(); return; }
    if (!SY) { M.err = 'انترنت لازم است'; render(); return; }
    M.busy = true; M.err = null; render();
    try {
      const { id, code, doc } = await sealLogin(user, pass, { fid: SY.familyId, code: SY.joinCode, memberId: m.id });
      await SY.saveLogin(id, code, doc);
      if (m.loginId && m.loginId !== id) SY.deleteLogin(m.loginId).catch(() => {});   // old password stops working
      await commit(() => { m.loginUser = user; m.loginId = id; log('login', '🔑', m.name || user); });
      Object.assign(M, { busy: false, pass });
      render();
    } catch (e) {
      console.error(e);
      Object.assign(M, { busy: false, err: `ساخته نشد — ${navigator.onLine ? e?.code || e?.message || 'error' : 'انترنت نیست'}` }); render();
    }
  },
  mloginWa: () => { const M = V.modal; sendWhatsApp(`🏠 حساب خانواده\n\n🔗 ${siteLink()}\n👤 نام کاربری: ${M.user}\n🔑 رمز: ${M.pass}\n\nلینک را باز کنید ← 🔑 ورود`); },
  mloginCopy: async () => { const M = V.modal; try { await navigator.clipboard.writeText(`${siteLink()}\n${M.user}\n${M.pass}`); toast('📋✅'); } catch { toast('📋❌'); } },
  pinForgot: () => { V.modal = { kind: 'pinForgot', back: V.modal }; render(); },
  pinForgotGo: async () => {
    const M = V.modal, B = M.back;
    const user = document.getElementById('fuser')?.value || '', pass = document.getElementById('fpass')?.value || '';
    if (!user.trim() || !pass.trim()) { M.err = 'نام کاربری و رمز را بنویسید'; render(); return; }
    if (!SY) { M.err = 'انترنت لازم است'; render(); return; }
    M.busy = true; M.err = null; render();
    try {
      const { id, code } = await loginKeys(user, pass);
      const p = await openLogin(user, pass, await SY.readLogin(id, code));
      const owner = B.target === 'pocket' ? S.me : pinOwner(B)?.id;
      if (!p || p.fid !== SY.familyId || p.memberId !== owner) { Object.assign(M, { busy: false, err: 'نام کاربری یا رمز درست نیست' }); render(); return; }
      log('pinReset', '🔑🔒', member(owner)?.name || '');
      pinFails = 0; pinLockUntil = 0;
      V.modal = { ...B, mode: 'set', seq: [], first: null, shake: false, busy: false };   // proved who they are → make a new PIN
      render();
    } catch (e) {
      console.error(e);
      Object.assign(M, { busy: false, err: 'مشکل — دوباره کوشش کنید' }); render();
    }
  },
  pocket: async () => {
    if (!P || P.owner !== S.me) { P = await loadPocket(S.me); P.owner = S.me; }
    if (pocketOpen) V.modal = { kind: 'pocket' };
    else V.modal = { kind: 'pin', target: 'pocket', mode: P.pin ? 'check' : 'set', seq: [] };
    render();
  },
  pocketAdd: (v) => { V.modal = { kind: 'pocketAdd', type: v, amount: '', icon: '❓' }; render(); },
  pocketIcon: (v) => { V.modal.icon = v; render(); },
  pocketSave: async () => {
    const M = V.modal;
    P.entries.push({ id: uid(), type: M.type, amount: +M.amount, currency: S.currency, icon: M.icon, ts: Date.now() });
    await savePocket(S.me, P);
    V.modal = { kind: 'pocket' }; render();
  },
  pocketDel: async (v) => {
    const e = P.entries.find((x) => x.id === v);
    if (e) e.deleted = true;
    await savePocket(S.me, P);
    render();
  },
  summary: () => { V.modal = { kind: 'summary', page: 0 }; render(); },
  sumNav: (v) => { V.modal.page += +v; render(); },
  waLedger: () => sendWhatsApp(ledgerText(loanLedger(S.loans, S.currency), S.currency,
    { name: rawName, forName: (id) => [forOf(id).icon, forOf(id).name], date: dateLabel })),
  waReport: () => {
    V.month ||= monthKey(Date.now());
    sendWhatsApp(reportText({ txns: S.txns, currency: S.currency, month: V.month, person: rawName, cash: monthCash(S.txns, S.loans, S.currency, V.month),
      cat: (id) => { const c = findCat(BASE_CATS, S.cats || [], 'out', id); return [c.icon, c.name]; } }));
  },
  txFrom: (v) => { V.modal.paidFrom = v === 'hand' ? 'hand' : null; render(); },
  give: () => { V.modal = { kind: 'give', amount: '' }; render(); },
  giveTo: (v) => { V.modal.to = v; render(); },
  giveSave: () => commit(() => {
    const M = V.modal;
    S.cash.push({ id: uid(), kind: 'give', from: S.me, to: M.to, amount: +M.amount, currency: S.currency, by: S.me, ts: Date.now() });
    log('give', '🤲', `${member(M.to)?.name || ''} ${money(+M.amount, S.currency)}`);
    V.modal = null;
    toast('🤲✅');
  }),
  hand: (v) => { V.modal = { kind: 'hand', id: v }; render(); },
  returnStart: () => { V.modal = { kind: 'return', from: V.modal.id, amount: '' }; render(); },
  returnSave: () => commit(() => {
    const M = V.modal;
    const lastGive = (S.cash || []).filter((c) => !c.deleted && c.kind === 'give' && c.to === M.from).sort((a, b) => b.ts - a.ts)[0];
    S.cash.push({ id: uid(), kind: 'return', from: M.from, to: lastGive?.from || S.me, amount: +M.amount, currency: S.currency, by: S.me, ts: Date.now() });
    log('return', '↩️', `${member(M.from)?.name || ''} ${money(+M.amount, S.currency)}`);
    V.modal = { kind: 'hand', id: M.from };
  }),

  cur: (v) => commit(() => { S.currency = v; }),
  addTx: (v, el) => { V.modal = { kind: 'tx', type: v, cat: el.dataset.cat || null, amount: '', currency: S.currency, paidFrom: null }; render(); },
  txCat: (v) => { V.modal.cat = v; render(); },
  catNew: () => { V.modal = { kind: 'catNew', type: V.modal.type, name: '', q: '', back: V.modal }; render(); },
  catPick: (v) => {
    const M = V.modal, p = (M.type === 'in' ? IN_PICS : OUT_PICS)[+v];
    if (!p) return;
    keepName('catname');
    M.icon = p.icon;
    if (!M.name || M.autoName || p.name.includes(M.name.trim())) { M.name = p.name; M.autoName = true; }   // typed part of a picture's name → use its full name
    const box = document.getElementById('catname');
    if (box) box.value = M.name;   // render() keeps what is in the box, so update it first
    render();
  },
  catSave: () => {
    keepName('catname');
    const M = V.modal;
    const c = { id: uid(), type: M.type, icon: M.icon, name: (M.name || '').trim().slice(0, 60), by: S.me, ts: Date.now() };
    if (!c.icon || !c.name) return;
    commit(() => {
      S.cats.push(c);
      log('cat', `${M.type === 'in' ? '⬇️' : '⬆️'}${c.icon}`, c.name);
      V.modal = { ...M.back, cat: c.id };   // back to the money screen with the new category chosen
    });
  },
  txCur: (v) => { V.modal.currency = v; render(); },
  key: (k) => {
    const M = V.modal;
    const f = M.feeMode ? 'fee' : 'amount';
    M[f] = M[f] || '';
    if (k === '⌫') M[f] = M[f].slice(0, -1);
    else if (M[f].length < 10) M[f] = (M[f] + k).replace(/^0+/, '');
    render();
  },
  txSender: (v) => { V.modal.from = v; render(); },
  txCountry: (v) => { V.modal.country = v; render(); },
  txFeeMode: () => { V.modal.feeMode = !V.modal.feeMode; render(); },

  // outside people
  contactNew: () => { V.modal = { kind: 'contact', back: V.modal }; render(); },
  cemoji: (v) => { keepName('cname'); V.modal.emoji = v; V.modal.photo = null; render(); },
  cphoto: () => { keepName('cname'); takePhoto(240, (p) => { V.modal.photo = p; render(); }); },
  csave: () => {
    keepName('cname');
    const M = V.modal;
    const c = { id: uid(), emoji: M.emoji || '🙂', photo: M.photo || null, name: M.name || '', ts: Date.now() };
    commit(() => {
      S.contacts.push(c);
      log('contact', '👤➕', c.name);
      const back = M.back;
      if (back?.kind === 'loanNew') back.who = c.id;
      if (back?.kind === 'tx') back.from = c.id;
      V.modal = back || null;
    });
  },

  // qarz
  loanNew: (v) => { V.modal = { kind: 'loanNew', dir: v, amount: '', currency: S.currency }; render(); },
  loanWho: (v) => { V.modal.who = v; render(); },
  loanFor: (v) => { V.modal.for = v; render(); },
  lNote: () => { readLoanExtras(V.modal); V.modal.noteOpen = true; render(); document.getElementById('lnote')?.focus(); },
  lDate: () => { readLoanExtras(V.modal); V.modal.dateOpen = true; render(); document.getElementById('ldate')?.showPicker?.(); },
  loanSave: () => commit(() => {
    const M = V.modal;
    readLoanExtras(M);
    S.loans.push({ id: uid(), kind: 'loan', dir: M.dir, who: M.who, for: M.for || 'other', note: M.note || null, amount: +M.amount, currency: M.currency, by: S.me, ts: pickTs(M.date), ...(backdated(M) ? { noTime: true } : {}) });
    log('loan', M.dir === 'lent' ? '📤' : '📥', `${contact(M.who)?.name || ''} ${money(+M.amount, M.currency)}`);
    V.modal = null;
  }),
  loanOpen: (v) => { V.modal = { kind: 'loan', id: v }; render(); },
  loanPayStart: () => {
    const l = S.loans.find((r) => r.id === V.modal.id);
    V.modal = { kind: 'loanPay', id: l.id, amount: '', currency: l.currency, noteOpen: true };
    render();
  },
  loanPaySave: () => commit(() => {
    const M = V.modal;
    readLoanExtras(M);
    if (M.editId) {
      const p = S.loans.find((r) => r.id === M.editId);
      const was = money(p.amount, M.currency);
      p.amount = +M.amount; p.note = M.note || null;
      if (backdated(M)) { p.ts = pickTs(M.date); p.noTime = true; }
      log('payEdit', '✏️💵', `${was} → ${money(p.amount, M.currency)}`);
      V.modal = { kind: 'loan', id: M.id };
      return;
    }
    S.loans.push({ id: uid(), kind: 'pay', loanId: M.id, note: M.note || null, amount: +M.amount, by: S.me, ts: pickTs(M.date), ...(backdated(M) ? { noTime: true } : {}) });
    const l = S.loans.find((r) => r.id === M.id);
    log('loanPay', '💵', `${contact(l?.who)?.name || ''} ${money(+M.amount, M.currency)}`);
    V.modal = { kind: 'loan', id: M.id };
  }),
  loanForEdit: () => { V.modal = { kind: 'loanFor', id: V.modal.id }; render(); },
  loanForSet: (v) => {
    const l = S.loans.find((r) => r.id === V.modal.id);
    const go = () => commit(() => { l.for = v; log('loanFor', '✏️' + forOf(v).icon, contact(l.who)?.name || ''); V.modal = { kind: 'loan', id: l.id }; });
    if (l.by === S.me) go(); else requireAdmin(go);
  },
  payEdit: (v) => {
    const p = S.loans.find((r) => r.id === v), l = S.loans.find((r) => r.id === p?.loanId);
    if (!p || !l) return;
    const go = () => { V.modal = { kind: 'loanPay', id: l.id, editId: p.id, amount: String(p.amount), note: p.note || '', noteOpen: true, currency: l.currency }; render(); };
    if (p.by === S.me) go(); else requireAdmin(go);
  },
  payDel: (v) => { V.modal.confirmDel = v; render(); },
  payDelNo: () => { V.modal.confirmDel = null; render(); },
  payDelYes: (v) => {
    const p = S.loans.find((r) => r.id === v);
    const loanId = V.modal.id;
    if (!p) return;
    const del = () => commit(() => { p.deleted = true; log('payDel', '🗑️💵', money(p.amount, S.loans.find((r) => r.id === p.loanId)?.currency)); V.modal = { kind: 'loan', id: loanId }; });
    if (p.by === S.me) del(); else requireAdmin(del);
  },
  loanDel: () => {
    const l = S.loans.find((r) => r.id === V.modal.id);
    const del = () => commit(() => { l.deleted = true; log('loanDel', '🗑️🤝', `${contact(l.who)?.name || ''} ${money(l.amount, l.currency)}`); V.modal = null; });
    if (l.by === S.me) del(); else requireAdmin(del);
  },

  // savings jars
  jarNew: () => requireAdmin(() => { V.modal = { kind: 'jarNew', amount: '' }; render(); }),
  jarGoal: (v) => { V.modal.goal = v; render(); },
  jarSave: () => commit(() => {
    const M = V.modal;
    S.jars.push({ id: uid(), kind: 'jar', goal: M.goal, target: +M.amount, currency: S.currency, by: S.me, ts: Date.now() });
    log('jar', '🫙➕', goalOf(M.goal).name);
    V.modal = null;
  }),
  jarOpen: (v) => { V.modal = { kind: 'jar', id: v }; render(); },
  jarMoveStart: (v) => {
    const id = V.modal.id;
    const go = () => { V.modal = { kind: 'jarMove', id, dir: v, amount: '' }; render(); };
    if (v === 'out') requireAdmin(go); else go();   // taking money out of savings needs the admin PIN
  },
  jarMoveSave: () => commit(() => {
    const M = V.modal;
    const amt = M.dir === 'in' ? +M.amount : -M.amount;
    S.jars.push({ id: uid(), kind: 'move', jarId: M.id, amount: amt, by: S.me, ts: Date.now() });
    log('jarMove', amt >= 0 ? '🫙➕' : '🫙➖', `${goalOf(S.jars.find((r) => r.id === M.id)?.goal).name} ${money(Math.abs(amt), S.currency)}`);
    V.modal = { kind: 'jar', id: M.id };
  }),
  jarDel: () => {
    const id = V.modal.id;
    requireAdmin(() => commit(() => { const j = S.jars.find((r) => r.id === id); j.deleted = true; log('jarDel', '🗑️🫙', goalOf(j.goal).name); V.modal = null; }));
  },
  txPhoto: () => takePhoto(900, (p) => { V.modal.photo = p; render(); }),
  txVoice: () => toggleVoice(),
  txNote: () => {   // one extra tap opens the notebook line; typing keeps going across keypad taps
    const M = V.modal;
    M.note = (document.getElementById('txnote')?.value ?? M.note ?? '').trim();
    M.noteOpen = true; render();
    document.getElementById('txnote')?.focus();
  },
  txSave: () => {
    const M = V.modal;
    const note = (document.getElementById('txnote')?.value ?? M.note ?? '').trim().slice(0, 120);
    if (M.editId) {
      const x = S.txns.find((t) => t.id === M.editId);
      if (!x) return;
      const was = money(x.amount, x.currency);
      const abroad = x.type === 'in' && M.cat === 'abroad';
      commit(() => {
        Object.assign(x, { cat: M.cat, amount: +M.amount, currency: M.currency, note: note || null, photo: M.photo || null, voice: M.voice || null,
          paidFrom: x.type === 'out' && M.paidFrom === 'hand' ? 'hand' : null,
          from: abroad ? M.from || null : null, country: abroad ? M.country || null : null, fee: abroad ? +M.fee || 0 : 0, editedBy: S.me, editedTs: Date.now(), ...(M.when ? { ts: whenTs(M.when) } : {}) });
        log('txEdit', '✏️' + catOf(x.type, x.cat).icon, `${was} → ${money(x.amount, x.currency)}`);
        V.modal = null;
      });
      toast('✏️✅');
      return;
    }
    const x = { id: uid(), type: M.type, cat: M.cat, amount: +M.amount, currency: M.currency, by: S.me,
      ts: whenTs(M.when), note: note || null, photo: M.photo || null, voice: M.voice || null, billId: M.billId || null,
      paidFrom: M.type === 'out' && M.paidFrom === 'hand' ? 'hand' : null,
      ...(M.type === 'in' && M.cat === 'abroad' ? { from: M.from || null, country: M.country || null, fee: +M.fee || 0 } : {}) };
    commit(() => {
      S.txns.push(x);
      log('tx', `${M.type === 'in' ? '⬇️' : '⬆️'}${catOf(M.type, M.cat).icon}`, money(x.amount, x.currency));
      V.modal = null;
    });
    toast(M.type === 'in' ? '⬇️✅' : '⬆️✅');
  },
  txView: (v) => { V.modal = { kind: 'txView', id: v }; render(); },
  txWhen: () => { const M = V.modal; M.note = (document.getElementById('txnote')?.value ?? M.note ?? '').trim(); M.whenOpen = true; render(); document.getElementById('txwhen')?.showPicker?.(); },
  cashOpen: (v) => { V.cashOpen[v] = !V.cashOpen[v]; render(); },
  txEdit: (v) => {
    const x = S.txns.find((t) => t.id === v);
    if (!x || x.deleted) return;
    const go = () => {
      V.confirmTx = null;
      V.modal = { kind: 'tx', editId: x.id, ts: x.ts, type: x.type, cat: x.cat, amount: String(x.amount), currency: x.currency, paidFrom: x.paidFrom || null,
        note: x.note || '', noteOpen: !!x.note, photo: x.photo || null, voice: x.voice || null, from: x.from || null, country: x.country || null, fee: x.fee ? String(x.fee) : '' };
      render();
    };
    if (x.by === S.me) go(); else requireAdmin(go);   // changing someone else's entry needs the PIN
  },
  txCatChange: () => { V.modal.note = (document.getElementById('txnote')?.value ?? V.modal.note ?? '').trim(); V.modal.cat = null; render(); },
  txDelAsk: (v) => { V.confirmTx = v; render(); },
  txDelNo: () => { V.confirmTx = null; render(); },
  txDelYes: (v) => {
    const x = S.txns.find((t) => t.id === v);
    if (!x) return;
    const del = () => commit(() => {
      x.deleted = true; x.deletedBy = S.me; V.confirmTx = null;
      log('txDel', '🗑️' + catOf(x.type, x.cat).icon, money(x.amount, x.currency));
    });
    if (x.by === S.me) del(); else requireAdmin(del);
  },
  txDel: () => {
    const x = S.txns.find((t) => t.id === V.modal.id);
    const del = () => commit(() => {
      x.deleted = true; x.deletedBy = S.me;
      log('txDel', '🗑️' + catOf(x.type, x.cat).icon, money(x.amount, x.currency));
      V.modal = null;
    });
    if (x.by === S.me) del(); else requireAdmin(del); // deleting someone else's entry needs the PIN
  },
  txRestore: () => {
    const x = S.txns.find((t) => t.id === V.modal.id);
    requireAdmin(() => commit(() => {
      x.deleted = false;
      log('txRestore', '↩️' + catOf(x.type, x.cat).icon, money(x.amount, x.currency));
      V.modal = null;
    }));
  },

  month: (v) => { V.month = shiftMonth(V.month, +v); render(); },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `family-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  },
  close: () => { if (S.members.length && !V.modal?.required) { V.modal = null; render(); } },
  closeBg: (v, el, e) => { if (e.target === el) A.close(); },
};

function keepName(id) {
  const el = document.getElementById(id);
  if (el && V.modal) V.modal.name = el.value.trim();
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'catname' && V.modal?.kind === 'catNew') {
    V.modal.name = e.target.value; V.modal.q = e.target.value; V.modal.autoName = false;
    render();
  }
});

document.addEventListener('change', (e) => {
  if (!V.modal) return;
  if (e.target.id === 'ldate') { V.modal.date = e.target.value || null; render(); }
  if (e.target.id === 'txwhen') { V.modal.when = e.target.value || null; render(); }
});

// Anything that adds, changes or deletes family money is closed to viewers (buttons are hidden too).
const WRITES = new Set(['addTx', 'txSave', 'txEdit', 'txDel', 'txDelAsk', 'txDelYes', 'txRestore', 'give', 'giveTo', 'giveSave',
  'returnStart', 'returnSave', 'loanNew', 'loanSave', 'loanPayStart', 'loanPaySave', 'loanDel', 'loanForEdit', 'loanForSet',
  'payEdit', 'payDel', 'payDelYes', 'jarNew', 'jarSave', 'jarMoveStart', 'jarMoveSave', 'jarDel', 'catNew', 'catSave', 'csave',
  'pocket', 'pocketAdd', 'pocketSave', 'pocketDel', 'roleCycle', 'rmMember', 'newMember', 'memberLogin', 'memberPin']);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const blocked = WRITES.has(el.dataset.a) || (el.dataset.a === 'newSelf' && me());   // a viewer can't add people either
  if (blocked && S?.members?.length && !writer()) { toast('👁️ فقط دیدن'); return; }
  A[el.dataset.a]?.(el.dataset.v, el, e);
});

// ---------- boot ----------
S = await load();
// Who uses this phone is chosen on this phone only; never guess (could make someone admin).
S.me = localStorage.getItem('ff-me');
render();
// ---------- updates ----------
// A new version takes over by itself: reload once when it does (never in the middle of a pop-up),
// and look for a new version each time the app comes back to the screen.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return;   // first install: nothing old to replace
    updateReady = true;
    if (!V.modal) location.reload();
  });
}
// Which version this phone runs (shown on the admin page).
self.caches?.keys?.().then((k) => { V.ver = k.find((x) => x.startsWith('ff-v')) || ''; }).catch(() => {});

// ---------- cloud sync ----------
const cfg = emulator ? emulatorConfig : firebaseConfig;
const COLL_SORT = {
  log: (a, b) => b.ts - a.ts,
  catalog: (a, b) => (a.ord ?? 1e15) - (b.ord ?? 1e15),
  members: (a, b) => a.ts - b.ts,
  bills: (a, b) => a.ts - b.ts,
  grocery: (a, b) => a.ts - b.ts,
  contacts: (a, b) => a.ts - b.ts,
  cats: (a, b) => a.ts - b.ts,
};
let connecting = false;
async function connect(invite = null) {
  if (!cfg || SY || connecting) return;
  invite ||= pendingInvite();
  const joining = !!invite || location.hash.startsWith('#join=');
  if (!joining && !hasFamily() && !S.members.length) return;   // brand-new phone: wait for "log in" or "new family"
  if (joining) { S = { ...S, members: [], grocery: [], txns: [], bills: [], log: [], catalog: [], cash: [], loans: [], jars: [], contacts: [], cats: [] }; V.waiting = true; V.modal = null; render(); }
  connecting = true;
  try {
    SY = await startSyncLazy(invite);
    if (emulator) window.__sync = SY;
    try { localStorage.removeItem(PENDING); } catch { /* ignore */ }
  } catch (e) {
    console.error('sync', e);
    V.waiting = false; V.cloud = 'offline';
    // Joining failed: say why (a screenshot of this tells us the cause) and let them try again.
    if (joining) {
      try { localStorage.removeItem(PENDING); } catch { /* ignore */ }
      V.modal = { kind: 'paste', err: `وصل نشد — ${navigator.onLine ? (e?.code || e?.message || 'error') : 'انترنت نیست'}` };
    }
    render();
  } finally { connecting = false; }
}
async function startSyncLazy(invite = null) {
  const { startSync } = await import('./sync.js');
  return startSync({
    config: cfg, emulator, invite,
    getState: () => S,
    onStatus: (st) => { if (V.cloud !== st) { V.cloud = st; if (!V.modal) render(); } },
    onRemote: (c, raw) => {
      const recs = raw.map((r) => cleanRecord(c, r)).filter(Boolean);
      S[c] = COLL_SORT[c] ? recs.sort(COLL_SORT[c]) : recs;
      if (c === 'members' && V.waiting) {
        V.waiting = false;
        if (!member(S.me)) V.modal = { kind: 'who' };
      }
      render();
      saveSoon();
    },
  });
}
connect();
window.addEventListener('online', connect);
