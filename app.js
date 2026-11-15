import { load, save, uid, loadPocket, savePocket } from './store.js';
import { OUT_CATS, IN_CATS, BILL_KINDS, FACES, PICKER, UNITS, UNIT_OF, GOALS, COUNTRIES, PHOTO_ITEMS, PHOTO_UNITS, IN_PICS, OUT_PICS } from './data.js';
import {
  monthKey, shiftMonth, monthLabel, solarDay, totals, groceryFor, addGrocery, billStatus, faDigits, money,
  roleOf, canTab, cashBalances, lastPrice, linesTotal, visibleTxns, loansView, jarTotals, abroadSummary,
  nextLevel, pantryOrder, monthCompare, jarsMonthNet, billsMonth, pocketBalance, searchPicker, findCat, catsFor, sheetEnters, canBuy, nextRole, buyLines, reportText, listText, needsPin, navTabs,
} from './logic.js';
import { firebaseConfig, emulator, emulatorConfig } from './config.js';
import { cleanRecord, safeImage, safeAudio } from './clean.js';
import { makePin, checkPin, PIN_LEN, PIN_KEYS } from './pin.js';

let S;                                   // family state (IndexedDB)
const V = { room: null, tab: 'grocery', gmode: 'add', gfilter: 'all', edit: false, month: null, modal: null, cloud: null, waiting: false };
let SY = null;                           // sync handle when Firebase is set up
const $app = document.getElementById('app');
const $cam = document.getElementById('cam');

// ---------- helpers ----------
function becomeMe(v) {
  unlockedUntil = 0; pocketOpen = false; P = null;
  S.me = v; localStorage.setItem('ff-me', v); V.modal = null;
  if (!isAdmin() && V.tab === 'admin') V.tab = 'grocery';
  commit(() => {});
}
// Opens WhatsApp with the text ready; the person picks who gets it.
const sendWhatsApp = (text) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
const rawName = (id) => { const m = member(id) || contact(id); return m?.name || m?.emoji || ''; };
function markBought(ids) {
  const now = Date.now();
  const lines = S.grocery.filter((x) => ids.includes(x.id) && !x.bought && !x.deleted);
  for (const x of lines) x.unit = unitOf(x).id;
  buyLines(S.grocery, ids, S.me, now);
  for (const x of lines) {
    const ci = itemOf(x.item);
    if (ci?.stock) { ci.stock = 'full'; ci.stockBy = S.me; ci.stockTs = now; }   // bought → full at home
    log('gbought', '✅', ci?.name);
  }
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const me = () => S.members.find((m) => m.id === S.me);
const isAdmin = () => me()?.role === 'admin';
const role = () => roleOf(me());
const ROLE_ICON = { admin: '👑', earner: '💰', helper: '🛒', orderer: '🙋' };
const ROLE_NAME = { admin: 'مدیر', earner: 'نان‌آور', helper: 'خریدار', orderer: 'سفارش' };
const buyer = () => canBuy(role()); // orderer only asks; never buys or handles money
const TAB_NAME = { grocery: 'سودا', money: 'پول', loans: 'قرض', bills: 'بل‌ها', admin: 'مدیر' };
const TAB_ICON = { grocery: '🛒', money: '💰', loans: '🤝', bills: '🧾', admin: '🗝️' };
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
const unitOf = (x) => UNITS.find((u) => u.id === (x.unit || itemOf(x.item)?.unit || UNIT_OF[x.item])) || UNITS.find((u) => u.id === 'piece');
const hands = () => cashBalances(S.cash || [], S.txns, S.currency);
const isToday = (ts) => ts && monthKey(ts) === monthKey(Date.now()) && solarDay(ts) === solarDay(Date.now());
const unpaidToday = () => S.grocery.filter((x) => x.bought && !x.deleted && x.boughtBy === S.me && !x.paidTx && isToday(x.boughtTs));
const member = (id) => S.members.find((m) => m.id === id);
const face = (m, size = 'f40') => !m ? `<span class="face ${size}">❔</span>`
  : `<span class="face ${size}">${m.photo ? `<img src="${m.photo}" alt="">` : esc(m.emoji)}</span>`;
const pic = (x) => x?.photo ? `<img src="${x.photo}" alt="">`
  : PHOTO_ITEMS.has(x?.id) ? `<img src="img/${x.id}.jpg" alt="${esc(x.name)}" loading="lazy">` : esc(x?.icon ?? '❓');
const unitPic = (u) => PHOTO_UNITS.has(u.id) ? `<img class="uimg" src="img/u_${u.id}.jpg" alt="${esc(u.name)}">` : u.icon;
// Built-in categories plus the family's own (S.cats). Own ones come from phones, so always escape.
const BASE_CATS = { in: IN_CATS, out: OUT_CATS };
const catOf = (type, id) => { const c = findCat(BASE_CATS, S.cats || [], type, id); return { ...c, icon: esc(c.icon), name: esc(c.name) }; };
const itemOf = (id) => S.catalog.find((c) => c.id === id);
const dayLabel = (ts) => new Intl.DateTimeFormat('fa-AF', { day: 'numeric', month: 'long' }).format(ts);

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
    <button class="iconbtn" data-a="pocket">${L('👛', 'جیب من')}</button>
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
  ['editGrocery', '🛒✏️', 'تغییر سودا'],
  ['editBills', '🧾✏️', 'تغییر بل‌ها'],
  ['summary', '📅', 'خلاصه برای فامیل'],
];
const backBar = (label) => `<button class="backbar" data-a="roomBack">↩️ <span>${label}</span></button>`;
function adminView() {
  if (V.room === 'report') return backBar('مدیر') + reportView();
  return `<section><div class="rooms">${ROOMS.filter(([id]) => id !== 'invite' || SY).map(([id, i, n]) =>
    `<button class="room" data-a="room" data-v="${id}"><span class="pic">${i}</span><b>${n}</b></button>`).join('')}</div></section>`;
}
function editBar() {
  return V.edit ? `<div class="editbar"><span>✏️ <b>حالت تغییر</b></span><button data-a="editDone">✅ تمام</button></div>` : '';
}

function groceryView() {
  const open = groceryFor(S.grocery, 'all');
  const seg = `<div class="seg">
    <button data-a="gmode" data-v="add" class="${V.gmode === 'add' ? 'on' : ''}">➕<small>اضافه</small></button>
    <button data-a="gmode" data-v="list" class="${V.gmode === 'list' ? 'on' : ''}">🧺 ${open.length ? faDigits(open.length) : ''}<small>لست</small></button>
    <button data-a="gmode" data-v="pantry" class="${V.gmode === 'pantry' ? 'on' : ''}">🏺<small>خانه</small></button>
  </div>`;
  const bal = buyer() && hands()[S.me];
  const hand = bal ? `<button class="handcard" data-a="hand" data-v="${S.me}">🤲 <span class="lab2">خرچی در دست من</span> <b>${money(bal, S.currency)}</b></button>` : '';
  const bodyG = V.gmode === 'add' ? groceryAdd(open) : V.gmode === 'pantry' ? pantryView() : groceryList();
  return `<section>${hand}${seg}</section><section>${bodyG}</section>`;
}

function groceryAdd(open) {
  const qty = Object.fromEntries(open.map((x) => [x.item, x.qty]));
  const tiles = S.catalog.map((c) => `
    <button class="tile ${qty[c.id] ? 'sel' : ''}" data-a="${V.edit ? 'noop' : 'gadd'}" data-v="${c.id}">
      ${V.edit ? `<span class="xbtn" data-a="rmItem" data-v="${c.id}">✖</span>
        <span class="micbtn ${c.voice ? 'has' : ''} ${V.recItem === c.id ? 'rec' : ''}" data-a="itemVoice" data-v="${c.id}">${V.recItem === c.id ? '⏹️' : '🎤'}</span>`
        : c.voice ? '<span class="spk">🔊</span>' : ''}
      ${qty[c.id] ? `<span class="badge">${faDigits(qty[c.id])}</span>` : ''}
      <span class="pic">${pic(c)}</span><small>${esc(c.name)}</small>
    </button>`).join('');
  const newTile = V.edit ? '' : '<button class="tile add newitem" data-a="newItem"><span class="pic">➕</span><small>چیز نو</small></button>';
  const editBtns = V.edit ? `
    <div class="row" style="margin-top:14px">
      <button class="tile add" data-a="editDone" style="flex:1"><span class="pic">✅</span><small>تمام</small></button>
    </div>` : '';
  return `<div class="grid">${tiles}${newTile}</div>${editBtns}`;
}

// How much is left at home: 🟢 full · 🟡 half · 🔴 empty (empty goes on the list).
function pantryView() {
  const dot = { full: '🟢', half: '🟡', empty: '🔴' };
  return `<div class="grid">${pantryOrder(S.catalog).map((c) => `
    <button class="tile lvl-${c.stock || 'none'}" data-a="stock" data-v="${c.id}">
      <span class="badge lvl">${dot[c.stock] || '⚪'}</span>
      <span class="pic">${pic(c)}</span><small>${esc(c.name)}</small></button>`).join('')}</div>
    <p class="lbl" style="margin-top:14px;text-align:center">🟢 پُر · 🟡 نیم · 🔴 خلاص · ⚪</p>`;
}

function groceryList() {
  const chips = [['all', '🧺', 'همه'], ['free', '✋', 'بی‌صاحب'], ...S.members.filter((m) => !m.deleted).map((m) => [m.id, null, esc(m.name)])].map(([id, ic, nm]) => {
    const n = groceryFor(S.grocery, id).length;
    return `<button class="chip col ${V.gfilter === id ? 'on' : ''}" data-a="gfilter" data-v="${id}">
      <span class="row1">${ic ?? face(member(id), 'f40')}<b>${faDigits(n)}</b></span><span class="lab">${nm}</span></button>`;
  }).join('');
  const rows = groceryFor(S.grocery, V.gfilter);
  const today = monthKey(Date.now()) + solarDay(Date.now());
  const done = S.grocery.filter((x) => x.bought && !x.deleted && (monthKey(x.boughtTs) + solarDay(x.boughtTs)) === today);
  const row = (x, isDone) => {
    const c = itemOf(x.item) || { icon: '❓' };
    const cl = member(x.claimedBy);
    const u = unitOf(x);
    const lp = isDone || !buyer() ? null : lastPrice(S.grocery, x.item);
    return `<div class="item ${isDone ? 'done' : ''}">
      <span class="pic" data-a="play" data-v="${x.item}">${pic(c)}</span>
      ${isDone ? '' : `<button class="round" data-a="gminus" data-v="${x.id}">${L('➖', 'کم')}</button>`}
      <span class="qty">${faDigits(x.qty)}</span>
      <button class="unit" data-a="${isDone ? 'noop' : 'gunit'}" data-v="${x.id}">${unitPic(u)}<small>${u.name}</small></button>
      <span class="meta grow">
        <span class="faces">${x.addedBy.map((id) => face(member(id), 'f24')).join('')}</span>
        ${isDone ? (x.price ? `<small class="lp">${money(x.price, x.currency || S.currency)}</small>` : '')
          : lp ? `<small class="lp">قیمت قبلی ${money(lp.price, S.currency)}</small>` : ''}
      </span>
      ${!buyer() ? (cl ? `<span class="claim">${face(cl, 'f40')}<span class="lab">${esc(cl.name) || 'گرفته'}</span></span>` : '')
        : isDone ? `<button class="round" data-a="gundo" data-v="${x.id}">${L('↩️', 'پس')}</button>` : `
        <button class="claim ${x.claimedBy === S.me ? 'mine' : ''}" data-a="gclaim" data-v="${x.id}">${cl ? face(cl, 'f40') : '✋'}<span class="lab">${cl ? esc(cl.name) || 'گرفته' : 'من می‌خرم'}</span></button>
        <button class="round ok" data-a="gbought" data-v="${x.id}">${L('✅', 'خریدم')}</button>`}
    </div>`;
  };
  const unpaid = buyer() ? unpaidToday() : [];
  return `<div class="chips">${chips}<button class="chip col wa" data-a="waList"><span class="row1">💬</span><span class="lab">واتساپ</span></button><button class="chip col" data-a="shareList"><span class="row1">📤</span><span class="lab">عکس لست</span></button></div>
    <div class="list">${rows.length ? rows.map((x) => row(x, false)).join('') : '<div class="empty">🧺</div>'}</div>
    ${buyer() && rows.length > 1 ? `<button class="save buyall" data-a="gbuyAll">✅✅ همه را خریدم</button>` : ''}
    ${done.length && buyer() ? `<div class="list" style="margin-top:18px">${done.map((x) => row(x, true)).join('')}</div>` : ''}
    ${unpaid.length ? `<button class="save paytrip" data-a="shopPay">🛒💸 <span>${faDigits(unpaid.length)} چیز خریدی · چند پول دادی؟</span></button>` : ''}`;
}

function moneyView() {
  const m = monthKey(Date.now());
  const t = totals(S.txns, S.currency, m);
  const list = visibleTxns(S.txns.filter((x) => !x.deleted), role(), S.me).sort((a, b) => b.ts - a.ts).slice(0, 40);
  const hb = Object.entries(hands());
  return `<section>
    <div class="bigbtns">
      <button class="big in" data-a="addTx" data-v="in">⬇️<small>پول آمد</small></button>
      <button class="big out" data-a="addTx" data-v="out">⬆️<small>مصرف</small></button>
    </div>
    <div class="sum">
      <div class="in-c">⬇️ ${money(t.in, S.currency)}<span class="lab">آمد این ماه</span></div>
      <div class="out-c">⬆️ ${money(t.out, S.currency)}<span class="lab">مصرف این ماه</span></div>
    </div>
    <div class="row" style="margin-top:8px"><span class="lbl grow">${monthLabel(m)}</span>${curSwitch()}</div>
    <div class="chips" style="margin-top:10px">
      <button class="chip give" data-a="give">🤲<b>خرچی</b></button>
      ${hb.map(([id, v]) => `<button class="chip col" data-a="hand" data-v="${id}"><span class="row1">${face(member(id), 'f40')}<b>${money(v, S.currency)}</b></span><span class="lab">خرچی ${who(id)}</span></button>`).join('')}
    </div>
    ${jarsRow()}
  </section>
  <section class="list">${list.length ? list.map(txRow).join('') : '<div class="empty">💰</div>'}</section>`;
}

const curSwitch = () => `<div class="seg cur" style="width:190px">
  <button data-a="cur" data-v="AFN" class="${S.currency === 'AFN' ? 'on' : ''}" style="font-size:24px">افغانی</button>
  <button data-a="cur" data-v="USD" class="${S.currency === 'USD' ? 'on' : ''}" style="font-size:24px">دالر</button></div>`;

const txRow = (x) => `<button class="tx ${x.deleted ? 'del' : ''}" data-a="txView" data-v="${x.id}">
  <span class="cat">${catOf(x.type, x.cat).icon}${x.country ? `<small>${countryOf(x.country)?.icon || ''}</small>` : ''}</span>
  <span class="grow" style="text-align:start">
    <span class="amt ${x.type}-c">${x.type === 'in' ? '⬇️' : '⬆️'} ${money(x.amount, x.currency)}</span><br>
    <span class="lbl">${catOf(x.type, x.cat).name} · ${who(x.by)} · ${dayLabel(x.ts)}</span></span>
  ${x.paidFrom === 'hand' ? '🤲' : ''}${x.photo ? '📷' : ''}${x.voice ? '🎤' : ''} ${face(member(x.by), 'f40')}
</button>`;

function billsView() {
  const now = Date.now();
  const st = { paid: '✅', due: '⏳', late: '❗', ok: '' };
  const tiles = S.bills.filter((b) => !b.deleted).map((b) => {
    const s = billStatus(b, S.txns, now);
    const k = BILL_KINDS.find((c) => c.id === b.kind) || { icon: '❓' };
    return `<button class="bill ${s}" data-a="${V.edit ? 'rmBill' : 'payBill'}" data-v="${b.id}">
      ${V.edit ? '<span class="xbtn">✖</span>' : ''}
      <span class="pic">${k.icon}</span><b>${k.name || ''}</b><span class="st">${st[s]}</span>
      <small class="muted">${{ paid: 'پرداخت شد', due: 'نزدیک است', late: 'دیر شده', ok: '' }[s]}</small>
      <small class="muted">📅 روز ${faDigits(b.dueDay)}</small></button>`;
  }).join('');
  return `<section><div class="grid">${tiles}
    ${V.edit ? `<button class="tile add" data-a="newBill"><span class="pic">➕</span><small>بل نو</small></button>
      <button class="tile add" data-a="editDone"><span class="pic">✅</span><small>تمام</small></button>` : ''}
  </div>
  ${S.bills.length ? '' : '<div class="empty">🧾</div>'}
  <p class="lbl" style="margin-top:18px">✅ پرداخت شده · ⏳ نزدیک · ❗ دیر شده</p></section>`;
}

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
  const v = loansView(S.loans, S.currency, isAdmin() ? null : S.me);
  const row = (l) => {
    const c = contact(l.who);
    return `<button class="tx ${l.done ? 'del2' : ''}" data-a="loanOpen" data-v="${l.id}">
      <span class="cat">${l.dir === 'lent' ? '📤' : '📥'}</span>${face(c, 'f40')}
      <span class="grow" style="text-align:start">
        <span class="amt ${l.dir === 'lent' ? 'in-c' : 'out-c'}">${l.done ? '✅' : money(l.left, l.currency)}</span><br>
        <span class="lbl">${esc(c?.name)} · ${l.dir === 'lent' ? 'قرض دادیم' : 'قرض گرفتیم'} ${money(l.amount, l.currency)} · ${dayLabel(l.ts)}</span></span>
      ${face(member(l.by), 'f24')}</button>`;
  };
  return `<section>
    <div class="sum">
      <div class="in-c">📤 ${money(v.open.lent, S.currency)}<br><small class="lbl">بالای مردم</small></div>
      <div class="out-c">📥 ${money(v.open.borrowed, S.currency)}<br><small class="lbl">بالای ما</small></div>
    </div>
    <div class="bigbtns" style="margin-top:12px">
      <button class="big in" data-a="loanNew" data-v="lent">📤<small>قرض دادیم</small></button>
      <button class="big out" data-a="loanNew" data-v="borrowed">📥<small>قرض گرفتیم</small></button>
    </div>
    <div class="row" style="margin-top:8px;justify-content:flex-end">${curSwitch()}</div>
  </section>
  <section class="list">${v.loans.length ? [...v.loans.filter((l) => !l.done), ...v.loans.filter((l) => l.done)].map(row).join('') : '<div class="empty">🤝</div>'}</section>`;
}

function reportView() {
  V.month ||= monthKey(Date.now());
  const t = totals(S.txns, S.currency, V.month);
  const max = Math.max(t.in, t.out, 1);
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
      ${bar(L('⬇️', 'آمد'), t.in, 'var(--in)')}${bar(L('⬆️', 'مصرف'), t.out, 'var(--out)')}
      ${bar(t.net >= 0 ? L('🟢', 'باقی') : L('🔴', 'کم'), Math.abs(t.net), t.net >= 0 ? 'var(--in)' : 'var(--out)')}
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
    ${deleted.length ? `<div class="card"><h3>🗑️ پاک‌شده‌ها</h3><div class="list">${deleted.map(txRow).join('')}</div></div>` : ''}
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
    case 'people': return 'اعضای فامیل';
    case 'pin': return (M.target === 'pocket' ? 'رمز جیب: ' : M.target === 'member' ? `رمز ${nm(M.memberId) || member(M.memberId)?.emoji || ''}: ` : 'رمز مدیر: ') + ({ set: 'رمز نو بسازید', confirm: 'دوباره بزنید', check: 'رمز را بزنید' }[M.mode]);
    case 'invite': return 'دعوت به فامیل';
    case 'tx':
      if (M.type === 'in' && M.cat === 'abroad' && !M.from) return 'پول از خارج — کی روان کرد؟';
      if (M.type === 'in' && M.cat === 'abroad' && !M.country) return 'از کدام کشور؟';
      return (M.type === 'in' ? 'پول آمد' : 'مصرف') + (M.cat ? ' — ' + catOf(M.type, M.cat).name : ' — برای چه؟');
    case 'txView': { const x = S.txns.find((t) => t.id === M.id); return x ? catOf(x.type, x.cat).name : ''; }
    case 'item': return 'چیز نو برای لست';
    case 'catNew': return M.type === 'in' ? 'نوع نو برای پول آمد' : 'نوع نو برای مصرف';
    case 'bill': return M.kindId ? 'روز پرداخت در ماه' : 'بل نو — کدام بل؟';
    case 'price': { const x = S.grocery.find((g) => g.id === M.id); return 'قیمت ' + (itemOf(x?.item)?.name || ''); }
    case 'give': return M.to ? 'خرچی برای ' + nm(M.to) : 'خرچی — به کی؟';
    case 'hand': return 'خرچی در دست ' + nm(M.id);
    case 'return': return 'پس دادن باقی پول';
    case 'contact': return 'شخص نو';
    case 'loanNew': return (M.dir === 'lent' ? 'قرض دادیم' : 'قرض گرفتیم') + (M.who ? ' — ' + nm(M.who) : ' — به/از کی؟');
    case 'loan': { const l = S.loans.find((r) => r.id === M.id); return 'قرض ' + nm(l?.who); }
    case 'loanPay': return 'پرداخت قرض';
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
          <button data-a="mrole" data-v="orderer" class="${M.role === 'orderer' ? 'on' : ''}">🙋<small>سفارش</small></button>
          <button data-a="mrole" data-v="helper" class="${M.role === 'helper' ? 'on' : ''}">🛒<small>خریدار</small></button>
          <button data-a="mrole" data-v="earner" class="${M.role === 'earner' ? 'on' : ''}">💰<small>نان‌آور</small></button>
          <button data-a="mrole" data-v="admin" class="${M.role === 'admin' ? 'on' : ''}">👑<small>مدیر</small></button></div>`}
        <button class="save" data-a="msave" ${M.emoji || M.photo ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'who':
      return sheet('👤❓', `<div class="grid">${S.members.filter((m) => !m.deleted).map((m) => `
        <button class="tile ${m.id === S.me ? 'sel' : ''}" data-a="iam" data-v="${m.id}">
          <span class="badge">${ROLE_ICON[roleOf(m)]}</span>${face(m, 'f80')}<small>${esc(m.name)}</small></button>`).join('')}
        <button class="tile add" data-a="newSelf"><span class="pic">➕</span><small>من نو هستم</small></button></div>`);
    case 'people':
      return sheet('👨‍👩‍👧', `<div class="list">${S.members.filter((m) => !m.deleted).map((m) => `
        <div class="item">${face(m, 'f56')}<span class="grow">${esc(m.name)}</span>
          <button class="round" data-a="${m.id === S.me ? 'noop' : 'roleCycle'}" data-v="${m.id}">${L(ROLE_ICON[roleOf(m)], ROLE_NAME[roleOf(m)])}</button>
          ${m.id === S.me ? '' : `<button class="round ${m.pin ? '' : 'warn'}" data-a="memberPin" data-v="${m.id}">${m.pin ? L('🔒↩️', 'رمز نو') : L('🔓', 'رمز بده')}</button>`}
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
          <button data-a="pinBack">⌫</button></div>`);
    }
    case 'price': {
      const x = S.grocery.find((g) => g.id === M.id);
      const u = unitOf(x);
      return sheet(`<span class="headpic">${pic(itemOf(x.item))}</span> ${faDigits(x.qty)} ${unitPic(u)}`, `${keypad(M.amount, S.currency)}
        <div class="row" style="gap:10px">
          <button class="save" style="background:#777" data-a="close">⏭️ بعداً</button>
          <button class="save" data-a="priceSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button></div>`);
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
      const canReturn = bal > 0 && (p === S.me || role() !== 'helper');
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
      return sheet(`${head} ${face(contact(M.who), 'f40')}`, `
        <div class="row" style="margin-bottom:10px;justify-content:center"><div class="seg cur" style="width:190px">
          <button data-a="txCur" data-v="AFN" class="${M.currency === 'AFN' ? 'on' : ''}" style="font-size:26px">افغانی</button>
          <button data-a="txCur" data-v="USD" class="${M.currency === 'USD' ? 'on' : ''}" style="font-size:26px">دالر</button></div></div>
        ${keypad(M.amount, M.currency)}
        <button class="save" data-a="loanSave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'loan': {
      const l = loansView(S.loans, (S.loans.find((r) => r.id === M.id) || {}).currency || S.currency).loans.find((r) => r.id === M.id);
      if (!l) return '';
      const pays = S.loans.filter((r) => r.kind === 'pay' && r.loanId === l.id && !r.deleted).sort((a, b) => b.ts - a.ts);
      const canEdit = isAdmin() || l.by === S.me;
      return sheet(`${l.dir === 'lent' ? '📤' : '📥'} ${face(contact(l.who), 'f40')}`, `
        <div class="display ${l.dir === 'lent' ? 'in-c' : 'out-c'}">${l.done ? '✅' : money(l.left, l.currency)}</div>
        <div class="lbl" style="text-align:center;margin-top:6px">${money(l.amount, l.currency)} · ${dayLabel(l.ts)}</div>
        <div class="list" style="margin-top:10px">${pays.map((p) => `<div class="tx"><span class="cat">💵</span>
          <span class="grow amt">${money(p.amount, l.currency)}</span>${face(member(p.by), 'f24')}<span class="lbl">${dayLabel(p.ts)}</span></div>`).join('')}</div>
        ${canEdit && !l.done ? '<button class="save" data-a="loanPayStart">💵 پرداخت قرض</button>' : ''}
        ${canEdit ? '<button class="save danger" data-a="loanDel">🗑️ پاک کردن</button>' : ''}`);
    }
    case 'loanPay':
      return sheet('💵', `${keypad(M.amount, M.currency)}
        <button class="save" data-a="loanPaySave" ${+M.amount > 0 ? '' : 'disabled'}>✅ ثبت</button>`);
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
          <button class="save" data-a="jarMoveStart" data-v="in">➕ گذاشتن</button>
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
      const pages = [
        () => { const mx = Math.max(t.in, t.out, 1); const b = (ic, v, col) => `<div class="bar"><span class="ic">${ic}</span>
            <span class="track"><span class="fill" style="display:block;width:${(v / mx) * 100}%;background:${col}"></span></span>
            <span class="v">${money(v, S.currency)}</span></div>`;
          return `<div class="slide-t">${monthLabel(V.month)}<span class="lab">آمد، مصرف و باقی</span></div><div class="bars">${b('⬇️', t.in, 'var(--in)')}${b('⬆️', t.out, 'var(--out)')}</div>
            <div class="slide-big ${t.net >= 0 ? 'in-c' : 'out-c'}">${t.net >= 0 ? '🟢' : '🔴'} ${money(Math.abs(t.net), S.currency)}</div>`; },
        () => `<div class="slide-t">⬆️ 🧩<span class="lab">مصرف به کدام چیز (این ماه / ماه قبل)</span></div><div class="list">${monthCompare(S.txns, S.currency, V.month).slice(0, 5).map((r) => {
            const arrow = r.now > r.prev ? '<span class="out-c">⬆️</span>' : r.now < r.prev ? '<span class="in-c">⬇️</span>' : '🟰';
            return `<div class="tx"><span class="cat">${L(catOf('out', r.cat).icon, catOf('out', r.cat).name)}</span><span class="grow amt">${money(r.now, S.currency)}</span>
              ${arrow}<span class="lbl">${money(r.prev, S.currency)}</span></div>`; }).join('') || '<div class="empty">—</div>'}</div>`,
        () => { const net = jarsMonthNet(S.jars, S.currency, V.month);
          return `<div class="slide-t">🫙<span class="lab">پس‌انداز</span></div>${jarsRow()}<div class="slide-big ${net >= 0 ? 'in-c' : 'out-c'}">${net >= 0 ? '➕' : '➖'} ${money(Math.abs(net), S.currency)}</div>`; },
        () => { const l = loansView(S.loans, S.currency);
          return `<div class="slide-t">🤝<span class="lab">قرض</span></div><div class="sum"><div class="in-c">📤 ${money(l.open.lent, S.currency)}</div>
            <div class="out-c">📥 ${money(l.open.borrowed, S.currency)}</div></div>`; },
        () => { const b = billsMonth(S.bills, S.txns, Date.now());
          return `<div class="slide-t">🧾<span class="lab">بل‌ها پرداخت شده</span></div><div class="slide-big">✅ ${faDigits(b.paid)} / ${faDigits(b.total)}</div>
            ${b.late ? `<div class="slide-big out-c">❗ ${faDigits(b.late)}</div>` : ''}`; },
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
        <button class="save" style="background:#555" data-a="copyLink">📋 کاپی لینک</button>`);
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
        ${abroad ? `<div class="row" style="justify-content:center;margin-bottom:8px">${face(contact(M.from), 'f40')}
          <span style="font-size:30px">${countryOf(M.country)?.icon || ''}</span>
          <button class="chip ${M.feeMode ? 'on' : ''}" data-a="txFeeMode">🏦 کمیشن <b>${M.fee ? money(+M.fee, M.currency) : '۰'}</b></button></div>` : ''}
        <div class="row" style="margin-bottom:10px;justify-content:center">
          <div class="seg cur" style="width:190px">
            <button data-a="txCur" data-v="AFN" class="${M.currency === 'AFN' ? 'on' : ''}" style="font-size:26px">افغانی</button>
            <button data-a="txCur" data-v="USD" class="${M.currency === 'USD' ? 'on' : ''}" style="font-size:26px">دالر</button></div></div>
        ${M.type === 'out' && (hands()[S.me] || role() === 'helper') ? `<div class="seg" style="margin-bottom:10px">
          <button data-a="txFrom" data-v="hand" class="${M.paidFrom === 'hand' ? 'on' : ''}">🤲<small>از خرچی ${money(hands()[S.me] || 0, M.currency)}</small></button>
          <button data-a="txFrom" data-v="home" class="${M.paidFrom !== 'hand' ? 'on' : ''}">🏠<small>از پول خانه</small></button></div>` : ''}
        ${keypad(M.feeMode ? M.fee || '' : M.amount, M.currency)}
        <div class="row" style="margin-top:12px;justify-content:center;gap:14px">
          <button class="iconbtn" data-a="txPhoto">${L(M.photo ? '✅' : '📷', 'عکس رسید')}</button>
          <button class="iconbtn" data-a="txVoice" style="${M.recording ? 'background:var(--out)' : ''}">${L(M.recording ? '⏹️' : M.voice ? '✅' : '🎤', M.recording ? 'ایستاد' : 'صدا')}</button>
        </div>
        ${M.photo ? `<img class="photo-prev" style="margin-top:10px;max-height:160px" src="${M.photo}" alt="">` : ''}
        <button class="save" data-a="txSave" ${+M.amount > 0 && !M.recording ? '' : 'disabled'}>✅ ثبت</button>`);
    }
    case 'txView': {
      const x = S.txns.find((t) => t.id === M.id);
      const c = catOf(x.type, x.cat);
      const canDel = isAdmin() || x.by === S.me;
      return sheet(`${c.icon}`, `
        <div class="card" style="text-align:center">
          <div class="amt ${x.type}-c" style="font-size:40px;font-weight:700">${x.type === 'in' ? '⬇️' : '⬆️'} ${money(x.amount, x.currency)}</div>
          <div class="row" style="justify-content:center;margin-top:8px">${face(member(x.by))}<span class="lbl">${dayLabel(x.ts)} · ${c.name}</span></div>
          ${x.cat === 'abroad' ? `<div class="row" style="justify-content:center;margin-top:8px">${face(contact(x.from))}
            <span style="font-size:28px">${countryOf(x.country)?.icon || ''}</span>${x.fee ? `<span class="lbl">🏦 ${money(x.fee, x.currency)}</span>` : ''}</div>` : ''}
        </div>
        ${x.photo ? `<img class="photo-prev" ${mediaAttr(x.photo)} alt="">` : ''}
        ${x.voice ? `<audio controls ${mediaAttr(x.voice)} style="width:100%;margin-top:10px"></audio>` : ''}
        ${x.deleted && isAdmin() ? '<button class="save" data-a="txRestore">↩️ دوباره آوردن</button>'
          : canDel && !x.deleted ? '<button class="save danger" data-a="txDel">🗑️ پاک کردن</button>' : ''}`);
    }
    case 'item':
    {
      const found = searchPicker(PICKER, M.q);
      const list = found.length ? found : PICKER;
      return sheet('➕🛒', `
        <div class="row" style="justify-content:center;gap:14px;margin-bottom:10px">
          <span class="face f80" style="border-radius:20px">${M.photo ? `<img src="${M.photo}" alt="">` : M.icon ?? '❔'}</span>
          <button class="iconbtn" data-a="iphoto">${L('📷', 'عکس خود چیز')}</button></div>
        <p style="margin:0 0 8px"><input class="name" id="iname" placeholder="نام را بنویسید — مثلاً انار" value="${esc(M.name)}" autocomplete="off"></p>
        ${M.q && !found.length ? '<p class="lbl" style="text-align:center">تصویر پیدا نشد — یکی را انتخاب کنید یا 📷 عکس بگیرید</p>' : ''}
        <div class="grid picker">${list.map((p) => `
          <button class="tile ${M.icon === p.icon && !M.photo ? 'sel' : ''}" data-a="iemoji" data-v="${PICKER.indexOf(p)}">
            <span class="pic">${p.icon}</span><small>${p.name}</small></button>`).join('')}</div>
        <button class="save" data-a="isave" ${M.icon || M.photo ? '' : 'disabled'}>✅ ثبت و اضافه به لست</button>`);
    }
    case 'bill':
      if (!M.kindId) {
        return sheet('➕🧾', `<div class="grid">${BILL_KINDS.map((c) =>
          `<button class="tile" data-a="billKind" data-v="${c.id}"><span class="pic">${c.icon}</span><small>${c.name}</small></button>`).join('')}</div>`);
      }
      return sheet(`${BILL_KINDS.find((c) => c.id === M.kindId).icon} 📅`, `<div class="grid" style="grid-template-columns:repeat(6,1fr)">
        ${Array.from({ length: 31 }, (_, i) => `<button class="tile" style="min-height:0;padding:10px 0" data-a="billDay" data-v="${i + 1}"><b style="font-size:24px">${faDigits(i + 1)}</b></button>`).join('')}</div>`);
  }
  return '';
}

let shownKind = null; // pop-up kind on screen right now
function render() {
  if (!S.members.length && !V.modal && !V.waiting) V.modal = { kind: 'setup' };
  if (S.members.length && !member(S.me) && !V.modal && !V.waiting) V.modal = { kind: 'who' };
  if (V.waiting && !S.members.length) { $app.innerHTML = '<div class="empty" style="opacity:1">☁️⏳</div>'; return; }
  if (!canTab(role(), V.tab)) V.tab = 'grocery';
  S.cash ||= []; S.loans ||= []; S.jars ||= []; S.contacts ||= []; S.cats ||= [];
  const body = S.members.length
    ? ({ grocery: groceryView, money: moneyView, loans: loansViewUI, bills: billsView, admin: adminView }[V.tab] || groceryView)()
    : '';
  const focus = document.activeElement?.id;
  const typed = [...$app.querySelectorAll('input[id]')].map((el) => [el.id, el.value]);
  // Same pop-up redrawn after a tap: keep its scroll so the pictures don't jump away.
  const kind = V.modal?.kind || null;
  const SCROLLERS = ['.sheet', '.sheet .picker'];
  const kept = kind && kind === shownKind ? SCROLLERS.map((q) => $app.querySelector(q)?.scrollTop || 0) : [];
  $app.innerHTML = (S.members.length ? top() + editBar() : '') + body + (S.members.length ? tabs() : '') + modalView();
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

// Play a grocery picture's recorded name (fetched from the cloud the first time).
const voiceCache = new Map();
async function play(itemId) {
  const v = itemOf(itemId)?.voice;
  if (!v) return;
  let src = v;
  if (v.startsWith('media:')) {
    if (!voiceCache.has(v)) voiceCache.set(v, SY ? SY.getMedia(v.slice(6)) : Promise.resolve(null));
    src = await voiceCache.get(v);
  }
  if (!safeAudio(src) || src.startsWith('media:')) return;
  new Audio(src).play().catch(() => {});
}

// ---------- share list as a picture (WhatsApp) ----------
async function shareList() {
  const lines = groceryFor(S.grocery, V.gfilter);
  if (!lines.length) { toast('🧺'); return; }
  const W = 600, RH = 96, k = 2;
  const c = Object.assign(document.createElement('canvas'), { width: W * k, height: (90 + lines.length * RH + 20) * k });
  const g = c.getContext('2d');
  g.scale(k, k);
  g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, W, c.height);
  g.direction = 'rtl'; g.textBaseline = 'middle'; g.fillStyle = '#1d1d1d';
  g.font = '700 34px system-ui, sans-serif'; g.textAlign = 'right';
  g.fillText(`🛒 سودا · ${dayLabel(Date.now())}`, W - 20, 45);
  const img = async (src) => { try { return await createImageBitmap(await (await fetch(src)).blob()); } catch { return null; } };
  for (const [i, x] of lines.entries()) {
    const y = 90 + i * RH;
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(12, y + 4, W - 24, RH - 8, 18); g.fill();
    const item = itemOf(x.item) || { icon: '❓', name: '' };
    const u = unitOf(x);
    const photoSrc = item.photo && safeImage(item.photo)?.startsWith('data:') ? item.photo : PHOTO_ITEMS.has(item.id) ? `img/${item.id}.jpg` : null;
    const b = photoSrc ? await img(photoSrc) : null;
    if (b) { g.save(); g.beginPath(); g.roundRect(W - 96, y + 12, 72, 72, 12); g.clip(); g.drawImage(b, W - 96, y + 12, 72, 72); g.restore(); }
    else { g.font = '58px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(item.icon, W - 60, y + RH / 2 + 2); }
    const ub = PHOTO_UNITS.has(u.id) ? await img(`img/u_${u.id}.jpg`) : null;
    g.textAlign = 'right'; g.fillStyle = '#1d1d1d';
    g.font = '700 40px system-ui, sans-serif'; g.fillText(faDigits(x.qty), W - 115, y + RH / 2);
    if (ub) { g.save(); g.beginPath(); g.roundRect(W - 205, y + RH / 2 - 22, 44, 44, 8); g.clip(); g.drawImage(ub, W - 205, y + RH / 2 - 22, 44, 44); g.restore(); }
    else { g.font = '34px system-ui, sans-serif'; g.fillText(u.icon, W - 175, y + RH / 2); }
    g.font = '22px system-ui, sans-serif'; g.fillStyle = '#555'; g.fillText(`${u.name} · ${item.name}`, W - 225, y + RH / 2);
    const cl = member(x.claimedBy);
    if (cl && !cl.photo) { g.font = '44px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(cl.emoji, 50, y + RH / 2); }
  }
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'sawda.png', { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'سودا' }); return; }
  } catch { return; }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'sawda.png' });
  a.click();
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
  if (V.tab === 'admin' || V.edit) { V.tab = 'grocery'; V.room = null; V.edit = false; render(); }
});

const A = {
  tab: (v) => {
    const go = () => { V.tab = v; V.room = null; V.edit = false; V.modal = null; render(); scrollTo(0, 0); };
    if (v === 'admin') requireAdmin(go); else go();
  },
  room: (v) => requireAdmin(() => {
    if (v === 'editGrocery') Object.assign(V, { tab: 'grocery', gmode: 'add', edit: true });
    else if (v === 'editBills') Object.assign(V, { tab: 'bills', edit: true });
    else if (v === 'report') V.room = 'report';
    else { if (['people', 'invite', 'summary'].includes(v)) A[v](); return; }   // these open as pop-ups
    V.modal = null; render(); scrollTo(0, 0);
  }),
  roomBack: () => { V.room = null; render(); scrollTo(0, 0); },
  editDone: () => { Object.assign(V, { edit: false, tab: isAdmin() ? 'admin' : V.tab, room: null }); render(); scrollTo(0, 0); },
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
  newSelf: () => { V.modal = { kind: 'member', role: 'helper', self: true }; render(); },
  roleCycle: (v) => requireAdmin(() => commit(() => {
    const m = member(v);
    const next = nextRole(roleOf(m));
    m.role = next; log('role', ROLE_ICON[next], m.name); V.modal = { kind: 'people' };
  })),
  invite: () => { V.modal = { kind: 'invite' }; render(); },
  shareLink: () => navigator.share?.({ title: 'حساب خانواده', url: SY.inviteLink() }).catch(() => {}),
  copyLink: async () => { try { await navigator.clipboard.writeText(SY.inviteLink()); toast('📋✅'); } catch { toast('📋❌'); } },
  newMember: () => { V.modal = { kind: 'member', role: 'helper' }; render(); },
  rmMember: (v) => commit(() => { member(v).deleted = true; log('rmMember', '👤🗑️', member(v).name); }),
  memoji: (v) => { V.modal.emoji = v; V.modal.photo = null; keepName('mname'); render(); },
  mphoto: () => { keepName('mname'); takePhoto(240, (p) => { V.modal.photo = p; render(); }); },
  mrole: (v) => { V.modal.role = v; keepName('mname'); render(); },
  msave: () => {
    keepName('mname');
    const M = V.modal, setup = M.kind === 'setup';
    const m = { id: uid(), emoji: M.emoji || '🙂', photo: M.photo || null, name: M.name || '', role: setup ? 'admin' : M.self ? 'helper' : M.role, ts: Date.now() };
    commit(() => {
      S.members.push(m);
      if (setup || M.self) { S.me = m.id; localStorage.setItem('ff-me', m.id); }
      log('addMember', '👤➕', m.name);
      // Every new person gets a PIN right away (setup: the admin's own PIN).
      V.modal = setup ? { kind: 'pin', mode: 'set', seq: [], run: null, required: true }
        : { kind: 'pin', target: 'member', memberId: m.id, mode: 'set', seq: [], required: true, back: M.self ? null : { kind: 'people' } };
    });
  },

  gmode: (v) => { V.gmode = v; V.edit = false; render(); },
  gfilter: (v) => { V.gfilter = v; render(); },
  noop: () => {},
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
  stock: (v) => commit(() => {
    const c = itemOf(v);
    c.stock = nextLevel(c.stock); c.stockBy = S.me; c.stockTs = Date.now();
    log('stock', { full: '🟢', half: '🟡', empty: '🔴' }[c.stock] || '⚪', c.name);
    if (c.stock === 'empty' && !S.grocery.some((x) => x.item === v && !x.bought && !x.deleted)) {
      S.grocery = addGrocery(S.grocery, v, S.me, Date.now(), uid);   // empty at home → on the list
    }
  }),
  summary: () => { V.modal = { kind: 'summary', page: 0 }; render(); },
  sumNav: (v) => { V.modal.page += +v; render(); },
  play: (v) => play(v),
  shareList: () => shareList(),
  waList: () => sendWhatsApp(listText(S.grocery, (x) => itemOf(x.item)?.name || '', (x) => unitOf(x).name)),
  waReport: () => {
    V.month ||= monthKey(Date.now());
    sendWhatsApp(reportText({ txns: S.txns, currency: S.currency, month: V.month, person: rawName,
      cat: (id) => { const c = findCat(BASE_CATS, S.cats || [], 'out', id); return [c.icon, c.name]; } }));
  },
  gunit: (v) => commit(() => {
    const x = S.grocery.find((g) => g.id === v);
    const i = UNITS.findIndex((u) => u.id === unitOf(x).id);
    x.unit = UNITS[(i + 1) % UNITS.length].id;
  }),
  gprice: (v) => { if (!buyer()) return; V.modal = { kind: 'price', id: v, amount: String(S.grocery.find((g) => g.id === v)?.price || '') }; render(); },
  priceSave: () => commit(() => {
    const x = S.grocery.find((g) => g.id === V.modal.id);
    x.price = +V.modal.amount; x.currency = S.currency; x.unit = unitOf(x).id;
    log('price', '💲', `${itemOf(x.item)?.name} ${money(x.price, x.currency)}`);
    V.modal = null;
  }),
  shopPay: () => { if (!buyer()) return;
    const lines = unpaidToday();
    const fromHand = !!hands()[S.me] || role() === 'helper';
    V.modal = { kind: 'tx', type: 'out', cat: 'food', amount: String(linesTotal(lines) || ''), currency: S.currency,
      paidFrom: fromHand ? 'hand' : null, lines: lines.map((x) => x.id) };
    render();
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
  itemVoice: (v) => {
    if (V.recItem && V.recItem !== v) return;
    if (V.recItem === v) { record(0); return; }
    record(3000, (d) => {
      V.recItem = null;
      const safe = safeAudio(d);
      if (safe) commit(() => { itemOf(v).voice = safe; log('voice', '🎤', itemOf(v)?.name); });
      else render();
      if (safe) setTimeout(() => play(v), 200);
    }).then((ok) => { if (ok) { V.recItem = v; render(); } });
  },
  gadd: (v, el) => {
    play(v);
    commit(() => { S.grocery = addGrocery(S.grocery, v, S.me, Date.now(), uid); log('gadd', '🛒➕', itemOf(v)?.name); });
    document.querySelector(`[data-a="gadd"][data-v="${v}"]`)?.classList.add('pop');
    navigator.vibrate?.(20);
  },
  gminus: (v) => commit(() => {
    const x = S.grocery.find((g) => g.id === v);
    if (--x.qty <= 0) x.deleted = true;
    log('gminus', '🛒➖', itemOf(x.item)?.name);
  }),
  gclaim: (v) => { if (!buyer()) return;
    const x = S.grocery.find((g) => g.id === v);
    if (x.claimedBy && x.claimedBy !== S.me && !isAdmin()) return toast('✋❌');
    commit(() => { x.claimedBy = x.claimedBy === S.me ? null : S.me; log('gclaim', '✋', itemOf(x.item)?.name); });
  },
  // ✅ just marks it bought; the money is asked once for the whole trip (🛒💸 button under the list).
  gbought: (v) => buyer() && commit(() => markBought([v])),
  gbuyAll: () => buyer() && commit(() => markBought(groceryFor(S.grocery, V.gfilter).map((x) => x.id))),
  gundo: (v) => buyer() && commit(() => { const x = S.grocery.find((g) => g.id === v); x.bought = false; }),
  rmItem: (v) => commit(() => { log('rmItem', '🛒🗑️', itemOf(v)?.name); S.catalog = S.catalog.filter((c) => c.id !== v); }),
  newItem: () => { V.modal = { kind: 'item', name: '', q: '' }; render(); },
  iemoji: (v) => {
    const M = V.modal, p = PICKER[+v];
    if (!p) return;
    keepName('iname');
    M.icon = p.icon; M.photo = null;
    if (!M.name || M.autoName || p.name.includes(M.name.trim())) { M.name = p.name; M.autoName = true; }   // typed part of a picture's name → use its full name
    const box = document.getElementById(M.kind === 'item' ? 'iname' : 'catname');
    if (box) box.value = M.name;   // render() keeps what is in the box, so update it first
    render();
  },
  iphoto: () => { keepName('iname'); takePhoto(300, (p) => { V.modal.photo = p; render(); }); },
  isave: () => {
    keepName('iname');
    const M = V.modal;
    const picked = PICKER.find((p) => p.icon === M.icon);
    const item = { id: uid(), icon: M.icon || '📦', photo: M.photo || null, name: (M.name || picked?.name || '').slice(0, 60), ord: Date.now(), unit: 'piece' };
    commit(() => {
      S.catalog.push(item);
      S.grocery = addGrocery(S.grocery, item.id, S.me, Date.now(), uid);   // new item goes straight on the list
      log('addItem', '🛒✨', item.name);
      V.modal = null;
    });
    toast('🛒✅');
  },

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
    const box = document.getElementById(M.kind === 'item' ? 'iname' : 'catname');
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
  loanSave: () => commit(() => {
    const M = V.modal;
    S.loans.push({ id: uid(), kind: 'loan', dir: M.dir, who: M.who, amount: +M.amount, currency: M.currency, by: S.me, ts: Date.now() });
    log('loan', M.dir === 'lent' ? '📤' : '📥', `${contact(M.who)?.name || ''} ${money(+M.amount, M.currency)}`);
    V.modal = null;
  }),
  loanOpen: (v) => { V.modal = { kind: 'loan', id: v }; render(); },
  loanPayStart: () => {
    const l = S.loans.find((r) => r.id === V.modal.id);
    V.modal = { kind: 'loanPay', id: l.id, amount: '', currency: l.currency };
    render();
  },
  loanPaySave: () => commit(() => {
    const M = V.modal;
    S.loans.push({ id: uid(), kind: 'pay', loanId: M.id, amount: +M.amount, by: S.me, ts: Date.now() });
    const l = S.loans.find((r) => r.id === M.id);
    log('loanPay', '💵', `${contact(l?.who)?.name || ''} ${money(+M.amount, M.currency)}`);
    V.modal = { kind: 'loan', id: M.id };
  }),
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
  txSave: () => {
    const M = V.modal;
    const x = { id: uid(), type: M.type, cat: M.cat, amount: +M.amount, currency: M.currency, by: S.me,
      ts: Date.now(), photo: M.photo || null, voice: M.voice || null, billId: M.billId || null,
      paidFrom: M.type === 'out' && M.paidFrom === 'hand' ? 'hand' : null,
      ...(M.type === 'in' && M.cat === 'abroad' ? { from: M.from || null, country: M.country || null, fee: +M.fee || 0 } : {}) };
    commit(() => {
      S.txns.push(x);
      for (const id of M.lines || []) { const g = S.grocery.find((l) => l.id === id); if (g) g.paidTx = x.id; }
      log('tx', `${M.type === 'in' ? '⬇️' : '⬆️'}${catOf(M.type, M.cat).icon}`, money(x.amount, x.currency));
      V.modal = null;
    });
    toast(M.type === 'in' ? '⬇️✅' : '⬆️✅');
  },
  txView: (v) => { V.modal = { kind: 'txView', id: v }; render(); },
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

  payBill: (v) => {
    const b = S.bills.find((x) => x.id === v);
    V.modal = { kind: 'tx', type: 'out', cat: b.kind, billId: b.id, amount: '', currency: S.currency };
    render();
  },
  newBill: () => { V.modal = { kind: 'bill' }; render(); },
  billKind: (v) => { V.modal.kindId = v; render(); },
  billDay: (v) => commit(() => {
    S.bills.push({ id: uid(), kind: V.modal.kindId, dueDay: +v, ts: Date.now() });
    log('addBill', '🧾➕', BILL_KINDS.find((c) => c.id === V.modal.kindId).name);
    V.modal = null;
  }),
  rmBill: (v) => commit(() => { const b = S.bills.find((x) => x.id === v); b.deleted = true; log('rmBill', '🧾🗑️', ''); }),

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
    render(); return;
  }
  if (e.target.id !== 'iname' || V.modal?.kind !== 'item') return;
  V.modal.name = e.target.value; V.modal.q = e.target.value; V.modal.autoName = false;
  render();
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  A[el.dataset.a]?.(el.dataset.v, el, e);
});

// ---------- boot ----------
S = await load();
// Who uses this phone is chosen on this phone only; never guess (could make someone admin).
S.me = localStorage.getItem('ff-me');
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

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
async function connect() {
  if (!cfg || SY) return;
  const joining = location.hash.startsWith('#join=');
  if (joining) { S = { ...S, members: [], grocery: [], txns: [], bills: [], log: [], catalog: [], cash: [], loans: [], jars: [], contacts: [], cats: [] }; V.waiting = true; V.modal = null; render(); }
  try {
    SY = await startSyncLazy();
    if (emulator) window.__sync = SY;
  } catch (e) {
    console.error('sync', e);
    V.waiting = false; V.cloud = 'offline'; render();
    return;
  }
}
async function startSyncLazy() {
  const { startSync } = await import('./sync.js');
  return startSync({
    config: cfg, emulator,
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
