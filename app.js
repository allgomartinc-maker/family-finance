import { load, save, uid } from './store.js';
import { OUT_CATS, IN_CATS, BILL_KINDS, FACES, PICKER } from './data.js';
import {
  monthKey, shiftMonth, monthLabel, solarDay, totals, groceryFor, addGrocery, billStatus, faDigits, money,
} from './logic.js';
import { firebaseConfig, emulator, emulatorConfig } from './config.js';
import { cleanRecord, safeImage, safeAudio } from './clean.js';

let S;                                   // family state (IndexedDB)
const V = { tab: 'grocery', gmode: 'add', gfilter: 'all', edit: false, month: null, modal: null, cloud: null, waiting: false };
let SY = null;                           // sync handle when Firebase is set up
const $app = document.getElementById('app');
const $cam = document.getElementById('cam');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const me = () => S.members.find((m) => m.id === S.me);
const isAdmin = () => me()?.role === 'admin';
const member = (id) => S.members.find((m) => m.id === id);
const face = (m, size = 'f40') => !m ? `<span class="face ${size}">❔</span>`
  : `<span class="face ${size}">${m.photo ? `<img src="${m.photo}" alt="">` : esc(m.emoji)}</span>`;
const pic = (x) => x?.photo ? `<img src="${x.photo}" alt="">` : esc(x?.icon ?? '❓');
const catOf = (type, id) => (type === 'in' ? IN_CATS : OUT_CATS).find((c) => c.id === id) || { icon: '❓', name: '' };
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

async function commit(fn) {
  fn();
  render();
  SY?.push();
  await save(S);
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
  const title = { grocery: '🛒', money: '💰', bills: '🧾', report: '📊' }[V.tab];
  return `<header class="top">
    <button data-a="who">${face(me(), 'f56')}</button>
    <h1>${title}</h1>
    ${V.cloud ? `<span title="sync" style="font-size:24px">${{ ok: '☁️✅', pending: '☁️⏳', offline: '📴', error: '☁️❗' }[V.cloud]}</span>` : ''}
    ${isAdmin() ? `<button class="iconbtn" data-a="people" aria-label="اعضا">👨‍👩‍👧</button>` : ''}
  </header>`;
}

function tabs() {
  const t = [['grocery', '🛒', 'سودا'], ['money', '💰', 'پول'], ['bills', '🧾', 'بل‌ها']];
  if (isAdmin()) t.push(['report', '📊', 'گزارش']);
  return `<nav class="tabs">${t.map(([id, i, n]) =>
    `<button data-a="tab" data-v="${id}" class="${V.tab === id ? 'on' : ''}">${i}<small>${n}</small></button>`).join('')}</nav>`;
}

function groceryView() {
  const open = groceryFor(S.grocery, 'all');
  const seg = `<div class="seg">
    <button data-a="gmode" data-v="add" class="${V.gmode === 'add' ? 'on' : ''}">➕<small>اضافه</small></button>
    <button data-a="gmode" data-v="list" class="${V.gmode === 'list' ? 'on' : ''}">🧺 ${open.length ? faDigits(open.length) : ''}<small>لست</small></button>
  </div>`;
  return `<section>${seg}</section><section>${V.gmode === 'add' ? groceryAdd(open) : groceryList()}</section>`;
}

function groceryAdd(open) {
  const qty = Object.fromEntries(open.map((x) => [x.item, x.qty]));
  const tiles = S.catalog.map((c) => `
    <button class="tile ${qty[c.id] ? 'sel' : ''}" data-a="${V.edit ? 'rmItem' : 'gadd'}" data-v="${c.id}">
      ${V.edit ? '<span class="xbtn">✖</span>' : ''}
      ${qty[c.id] ? `<span class="badge">${faDigits(qty[c.id])}</span>` : ''}
      <span class="pic">${pic(c)}</span><small>${esc(c.name)}</small>
    </button>`).join('');
  const editBtns = isAdmin() ? `
    <div class="row" style="margin-top:14px">
      ${V.edit ? '<button class="tile add" data-a="newItem" style="flex:1"><span class="pic">➕</span><small>چیز نو</small></button>' : ''}
      <button class="tile add" data-a="editCat" style="flex:1"><span class="pic">${V.edit ? '✅' : '✏️'}</span></button>
    </div>` : '';
  return `<div class="grid">${tiles}</div>${editBtns}`;
}

function groceryList() {
  const chips = [['all', '🧺'], ['free', '✋'], ...S.members.map((m) => [m.id, null])].map(([id, ic]) => {
    const n = groceryFor(S.grocery, id).length;
    return `<button class="chip ${V.gfilter === id ? 'on' : ''}" data-a="gfilter" data-v="${id}">
      ${ic ?? face(member(id), 'f40')}<b>${faDigits(n)}</b></button>`;
  }).join('');
  const rows = groceryFor(S.grocery, V.gfilter);
  const today = monthKey(Date.now()) + solarDay(Date.now());
  const done = S.grocery.filter((x) => x.bought && !x.deleted && (monthKey(x.boughtTs) + solarDay(x.boughtTs)) === today);
  const row = (x, isDone) => {
    const c = itemOf(x.item) || { icon: '❓' };
    const cl = member(x.claimedBy);
    return `<div class="item ${isDone ? 'done' : ''}">
      <span class="pic">${pic(c)}</span>
      ${isDone ? '' : `<button class="round" data-a="gminus" data-v="${x.id}">➖</button>`}
      <span class="qty">${faDigits(x.qty)}</span>
      <span class="faces grow">${x.addedBy.map((id) => face(member(id), 'f24')).join('')}</span>
      ${isDone ? `<button class="round" data-a="gundo" data-v="${x.id}">↩️</button>` : `
        <button class="claim ${x.claimedBy === S.me ? 'mine' : ''}" data-a="gclaim" data-v="${x.id}">${cl ? face(cl, 'f56') : '✋'}</button>
        <button class="round ok" data-a="gbought" data-v="${x.id}">✅</button>`}
    </div>`;
  };
  return `<div class="chips">${chips}</div>
    <div class="list">${rows.length ? rows.map((x) => row(x, false)).join('') : '<div class="empty">🧺</div>'}</div>
    ${done.length ? `<div class="list" style="margin-top:18px">${done.map((x) => row(x, true)).join('')}</div>
      <button class="save" data-a="addTx" data-v="out" data-cat="food">🛒💸</button>` : ''}`;
}

function moneyView() {
  const m = monthKey(Date.now());
  const t = totals(S.txns, S.currency, m);
  const list = S.txns.filter((x) => !x.deleted).sort((a, b) => b.ts - a.ts).slice(0, 40);
  return `<section>
    <div class="bigbtns">
      <button class="big in" data-a="addTx" data-v="in">⬇️<small>پول آمد</small></button>
      <button class="big out" data-a="addTx" data-v="out">⬆️<small>مصرف</small></button>
    </div>
    <div class="sum">
      <div class="in-c">⬇️ ${money(t.in, S.currency)}</div>
      <div class="out-c">⬆️ ${money(t.out, S.currency)}</div>
    </div>
    <div class="row" style="margin-top:8px"><span class="lbl grow">${monthLabel(m)}</span>${curSwitch()}</div>
  </section>
  <section class="list">${list.length ? list.map(txRow).join('') : '<div class="empty">💰</div>'}</section>`;
}

const curSwitch = () => `<div class="seg" style="width:150px">
  <button data-a="cur" data-v="AFN" class="${S.currency === 'AFN' ? 'on' : ''}" style="font-size:24px">؋</button>
  <button data-a="cur" data-v="USD" class="${S.currency === 'USD' ? 'on' : ''}" style="font-size:24px">$</button></div>`;

const txRow = (x) => `<button class="tx ${x.deleted ? 'del' : ''}" data-a="txView" data-v="${x.id}">
  <span class="cat">${catOf(x.type, x.cat).icon}</span>
  <span class="grow" style="text-align:start">
    <span class="amt ${x.type}-c">${x.type === 'in' ? '⬇️' : '⬆️'} ${money(x.amount, x.currency)}</span><br>
    <span class="lbl">${dayLabel(x.ts)}</span></span>
  ${x.photo ? '📷' : ''}${x.voice ? '🎤' : ''} ${face(member(x.by), 'f40')}
</button>`;

function billsView() {
  const now = Date.now();
  const st = { paid: '✅', due: '⏳', late: '❗', ok: '' };
  const tiles = S.bills.filter((b) => !b.deleted).map((b) => {
    const s = billStatus(b, S.txns, now);
    const k = BILL_KINDS.find((c) => c.id === b.kind) || { icon: '❓' };
    return `<button class="bill ${s}" data-a="${V.edit ? 'rmBill' : 'payBill'}" data-v="${b.id}">
      ${V.edit ? '<span class="xbtn">✖</span>' : ''}
      <span class="pic">${k.icon}</span><span class="st">${st[s]}</span>
      <small class="muted">📅 ${faDigits(b.dueDay)}</small></button>`;
  }).join('');
  return `<section><div class="grid">${tiles}
    ${isAdmin() ? `${V.edit ? '<button class="tile add" data-a="newBill"><span class="pic">➕</span></button>' : ''}
      <button class="tile add" data-a="editCat"><span class="pic">${V.edit ? '✅' : '✏️'}</span></button>` : ''}
  </div>
  ${S.bills.length ? '' : '<div class="empty">🧾</div>'}
  <p class="lbl" style="margin-top:18px">✅ پرداخت شده · ⏳ نزدیک · ❗ دیر شده</p></section>`;
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
    <div class="row" style="margin-bottom:12px">
      <button class="iconbtn" data-a="month" data-v="-1">▶️</button>
      <b class="grow" style="text-align:center;font-size:24px">${monthLabel(V.month)}</b>
      <button class="iconbtn" data-a="month" data-v="1">◀️</button>
    </div>
    <div class="row" style="justify-content:center;margin-bottom:12px">${curSwitch()}</div>
    <div class="card"><div class="bars">
      ${bar('⬇️', t.in, 'var(--in)')}${bar('⬆️', t.out, 'var(--out)')}
      ${bar(t.net >= 0 ? '🟢' : '🔴', Math.abs(t.net), t.net >= 0 ? 'var(--in)' : 'var(--out)')}
    </div></div>
    <div class="card"><h3>⬆️ 🧩</h3><div class="bars">
      ${cats.length ? cats.map(([c, v]) => bar(catOf('out', c).icon, v, 'var(--out)', cmax)).join('') : '<div class="muted">—</div>'}
    </div></div>
    <div class="card"><h3>👨‍👩‍👧</h3><div class="bars">
      ${people.map(([id, p]) => `<div class="row">${face(member(id))}
        <span class="grow in-c">⬇️ ${money(p.in, S.currency)}</span><span class="out-c">⬆️ ${money(p.out, S.currency)}</span></div>`).join('') || '<div class="muted">—</div>'}
    </div></div>
    ${deleted.length ? `<div class="card"><h3>🗑️</h3><div class="list">${deleted.map(txRow).join('')}</div></div>` : ''}
    <div class="card"><h3>🕘</h3><div class="log">
      ${S.log.slice(0, 60).map((l) => `<div class="row">${face(member(l.by), 'f24')}
        <span style="font-size:24px">${esc(l.icon)}</span><span class="grow">${esc(l.extra)}</span>
        <span class="lbl">${dayLabel(l.ts)}</span></div>`).join('') || '<div class="muted">—</div>'}
    </div></div>
    <button class="save" style="background:#555" data-a="export">💾</button>
  </section>`;
}

// ---------- modals ----------
const sheet = (head, body) => `<div class="sheet-bg" data-a="closeBg"><div class="sheet">
  <div class="head">${S.members.length ? '<button class="iconbtn" data-a="close">✖</button>' : '<span style="width:56px"></span>'}<span class="t">${head}</span><span style="width:56px"></span></div>
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
          <button class="iconbtn" data-a="mphoto">📷</button></div>
        <div class="grid" style="grid-template-columns:repeat(6,1fr)">${FACES.map((f) =>
          `<button class="tile ${M.emoji === f && !M.photo ? 'sel' : ''}" style="min-height:0;padding:6px" data-a="memoji" data-v="${f}"><span class="pic" style="font-size:36px;height:44px;line-height:44px">${f}</span></button>`).join('')}</div>
        <p><input class="name" id="mname" placeholder="نام (اختیاری)" value="${esc(M.name)}"></p>
        ${first ? '' : `<div class="seg">
          <button data-a="mrole" data-v="member" class="${M.role !== 'admin' ? 'on' : ''}">👤<small>عضو</small></button>
          <button data-a="mrole" data-v="admin" class="${M.role === 'admin' ? 'on' : ''}">👑<small>مدیر</small></button></div>`}
        <button class="save" data-a="msave" ${M.emoji || M.photo ? '' : 'disabled'}>✅</button>`);
    }
    case 'who':
      return sheet('👤❓', `<div class="grid">${S.members.filter((m) => !m.deleted).map((m) => `
        <button class="tile ${m.id === S.me ? 'sel' : ''}" data-a="iam" data-v="${m.id}">
          ${m.role === 'admin' ? '<span class="badge">👑</span>' : ''}${face(m, 'f80')}<small>${esc(m.name)}</small></button>`).join('')}
        <button class="tile add" data-a="newSelf"><span class="pic">➕</span></button></div>`);
    case 'people':
      return sheet('👨‍👩‍👧', `<div class="list">${S.members.filter((m) => !m.deleted).map((m) => `
        <div class="item">${face(m, 'f56')}<span class="grow">${esc(m.name)} ${m.role === 'admin' ? '👑' : ''}</span>
          ${m.id === S.me ? '' : `<button class="round" data-a="rmMember" data-v="${m.id}">🗑️</button>`}</div>`).join('')}</div>
        <button class="save" data-a="newMember">➕👤</button>
        ${SY ? '<button class="save" style="background:var(--sel)" data-a="invite">📲</button>' : ''}`);
    case 'invite':
      return sheet('📲', `<div class="card" style="display:grid;justify-items:center">
          <div id="qr" style="width:260px;height:260px;display:grid;place-items:center">⏳</div></div>
        ${navigator.share ? '<button class="save" data-a="shareLink">📤</button>' : ''}
        <button class="save" style="background:#555" data-a="copyLink">📋</button>`);
    case 'tx': {
      const cats = M.type === 'in' ? IN_CATS : OUT_CATS;
      const head = `<span class="${M.type}-c">${M.type === 'in' ? '⬇️' : '⬆️'}</span> ${M.cat ? catOf(M.type, M.cat).icon : ''}`;
      if (!M.cat) {
        return sheet(head, `<div class="grid">${cats.map((c) =>
          `<button class="tile" data-a="txCat" data-v="${c.id}"><span class="pic">${c.icon}</span><small>${c.name}</small></button>`).join('')}</div>`);
      }
      return sheet(head, `
        <div class="row" style="margin-bottom:10px;justify-content:center">${M.bill ? '' : ''}
          <div class="seg" style="width:170px">
            <button data-a="txCur" data-v="AFN" class="${M.currency === 'AFN' ? 'on' : ''}" style="font-size:26px">؋</button>
            <button data-a="txCur" data-v="USD" class="${M.currency === 'USD' ? 'on' : ''}" style="font-size:26px">$</button></div></div>
        ${keypad(M.amount, M.currency)}
        <div class="row" style="margin-top:12px;justify-content:center;gap:14px">
          <button class="iconbtn" data-a="txPhoto">${M.photo ? '✅' : '📷'}</button>
          <button class="iconbtn" data-a="txVoice" style="${M.recording ? 'background:var(--out)' : ''}">${M.recording ? '⏹️' : M.voice ? '✅' : '🎤'}</button>
        </div>
        ${M.photo ? `<img class="photo-prev" style="margin-top:10px;max-height:160px" src="${M.photo}" alt="">` : ''}
        <button class="save" data-a="txSave" ${+M.amount > 0 && !M.recording ? '' : 'disabled'}>✅</button>`);
    }
    case 'txView': {
      const x = S.txns.find((t) => t.id === M.id);
      const c = catOf(x.type, x.cat);
      const canDel = isAdmin() || x.by === S.me;
      return sheet(`${c.icon}`, `
        <div class="card" style="text-align:center">
          <div class="amt ${x.type}-c" style="font-size:40px;font-weight:700">${x.type === 'in' ? '⬇️' : '⬆️'} ${money(x.amount, x.currency)}</div>
          <div class="row" style="justify-content:center;margin-top:8px">${face(member(x.by))}<span class="lbl">${dayLabel(x.ts)} · ${c.name}</span></div>
        </div>
        ${x.photo ? `<img class="photo-prev" ${mediaAttr(x.photo)} alt="">` : ''}
        ${x.voice ? `<audio controls ${mediaAttr(x.voice)} style="width:100%;margin-top:10px"></audio>` : ''}
        ${x.deleted && isAdmin() ? '<button class="save" data-a="txRestore">↩️</button>'
          : canDel && !x.deleted ? '<button class="save danger" data-a="txDel">🗑️</button>' : ''}`);
    }
    case 'item':
      return sheet('➕🛒', `
        <div class="row" style="justify-content:center;margin-bottom:12px">
          <span class="face f80" style="border-radius:20px">${M.photo ? `<img src="${M.photo}" alt="">` : M.icon ?? '❔'}</span>
          <button class="iconbtn" data-a="iphoto">📷</button></div>
        <div class="grid" style="grid-template-columns:repeat(7,1fr)">${PICKER.map((p) =>
          `<button class="tile ${M.icon === p && !M.photo ? 'sel' : ''}" style="min-height:0;padding:4px" data-a="iemoji" data-v="${p}"><span class="pic" style="font-size:32px;height:40px;line-height:40px">${p}</span></button>`).join('')}</div>
        <p><input class="name" id="iname" placeholder="نام" value="${esc(M.name)}"></p>
        <button class="save" data-a="isave" ${M.icon || M.photo ? '' : 'disabled'}>✅</button>`);
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

function render() {
  if (!S.members.length && !V.modal && !V.waiting) V.modal = { kind: 'setup' };
  if (S.members.length && !member(S.me) && !V.modal && !V.waiting) V.modal = { kind: 'who' };
  if (V.waiting && !S.members.length) { $app.innerHTML = '<div class="empty" style="opacity:1">☁️⏳</div>'; return; }
  const body = S.members.length
    ? ({ grocery: groceryView, money: moneyView, bills: billsView, report: reportView }[V.tab] || groceryView)()
    : '';
  const focus = document.activeElement?.id;
  const typed = [...$app.querySelectorAll('input[id]')].map((el) => [el.id, el.value]);
  $app.innerHTML = (S.members.length ? top() : '') + body + (S.members.length ? tabs() : '') + modalView();
  for (const [id, v] of typed) { const el = document.getElementById(id); if (el) el.value = v; }
  if (focus) document.getElementById(focus)?.focus();
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
let rec = null;
async function toggleVoice() {
  const M = V.modal;
  if (rec) { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const r = new FileReader();
      r.onload = () => { M.voice = r.result; M.recording = false; rec = null; render(); };
      r.readAsDataURL(new Blob(chunks, { type: rec.mimeType }));
    };
    rec.start();
    M.recording = true;
    render();
    setTimeout(() => rec?.state === 'recording' && rec.stop(), 30000);
  } catch { toast('🎤🚫'); }
}

// ---------- actions ----------
const A = {
  tab: (v) => { V.tab = v; V.edit = false; render(); },
  who: () => { V.modal = { kind: 'who' }; render(); },
  iam: (v) => { S.me = v; localStorage.setItem('ff-me', v); V.modal = null; if (!isAdmin() && V.tab === 'report') V.tab = 'grocery'; commit(() => {}); },
  people: () => { V.modal = { kind: 'people' }; render(); },
  newSelf: () => { V.modal = { kind: 'member', role: 'member', self: true }; render(); },
  invite: () => { V.modal = { kind: 'invite' }; render(); },
  shareLink: () => navigator.share?.({ title: 'حساب خانواده', url: SY.inviteLink() }).catch(() => {}),
  copyLink: async () => { try { await navigator.clipboard.writeText(SY.inviteLink()); toast('📋✅'); } catch { toast('📋❌'); } },
  newMember: () => { V.modal = { kind: 'member', role: 'member' }; render(); },
  rmMember: (v) => commit(() => { member(v).deleted = true; log('rmMember', '👤🗑️', member(v).name); }),
  memoji: (v) => { V.modal.emoji = v; V.modal.photo = null; keepName('mname'); render(); },
  mphoto: () => { keepName('mname'); takePhoto(240, (p) => { V.modal.photo = p; render(); }); },
  mrole: (v) => { V.modal.role = v; keepName('mname'); render(); },
  msave: () => {
    keepName('mname');
    const M = V.modal, setup = M.kind === 'setup';
    const m = { id: uid(), emoji: M.emoji || '🙂', photo: M.photo || null, name: M.name || '', role: setup ? 'admin' : M.role, ts: Date.now() };
    commit(() => {
      S.members.push(m);
      if (setup || M.self) { S.me = m.id; localStorage.setItem('ff-me', m.id); }
      log('addMember', '👤➕', m.name);
      V.modal = setup || M.self ? null : { kind: 'people' };
    });
  },

  gmode: (v) => { V.gmode = v; V.edit = false; render(); },
  gfilter: (v) => { V.gfilter = v; render(); },
  gadd: (v, el) => {
    commit(() => { S.grocery = addGrocery(S.grocery, v, S.me, Date.now(), uid); log('gadd', '🛒➕', itemOf(v)?.name); });
    document.querySelector(`[data-a="gadd"][data-v="${v}"]`)?.classList.add('pop');
    navigator.vibrate?.(20);
  },
  gminus: (v) => commit(() => {
    const x = S.grocery.find((g) => g.id === v);
    if (--x.qty <= 0) x.deleted = true;
    log('gminus', '🛒➖', itemOf(x.item)?.name);
  }),
  gclaim: (v) => {
    const x = S.grocery.find((g) => g.id === v);
    if (x.claimedBy && x.claimedBy !== S.me && !isAdmin()) return toast('✋❌');
    commit(() => { x.claimedBy = x.claimedBy === S.me ? null : S.me; log('gclaim', '✋', itemOf(x.item)?.name); });
  },
  gbought: (v) => commit(() => {
    const x = S.grocery.find((g) => g.id === v);
    x.bought = true; x.boughtBy = S.me; x.boughtTs = Date.now();
    log('gbought', '✅', itemOf(x.item)?.name);
  }),
  gundo: (v) => commit(() => { const x = S.grocery.find((g) => g.id === v); x.bought = false; }),
  editCat: () => { V.edit = !V.edit; render(); },
  rmItem: (v) => commit(() => { log('rmItem', '🛒🗑️', itemOf(v)?.name); S.catalog = S.catalog.filter((c) => c.id !== v); }),
  newItem: () => { V.modal = { kind: 'item' }; render(); },
  iemoji: (v) => { keepName('iname'); V.modal.icon = v; V.modal.photo = null; render(); },
  iphoto: () => { keepName('iname'); takePhoto(300, (p) => { V.modal.photo = p; render(); }); },
  isave: () => {
    keepName('iname');
    const M = V.modal;
    commit(() => {
      S.catalog.push({ id: uid(), icon: M.icon || '📦', photo: M.photo || null, name: M.name || '', ord: Date.now() });
      log('addItem', '🛒✨', M.name);
      V.modal = null;
    });
  },

  cur: (v) => commit(() => { S.currency = v; }),
  addTx: (v, el) => { V.modal = { kind: 'tx', type: v, cat: el.dataset.cat || null, amount: '', currency: S.currency }; render(); },
  txCat: (v) => { V.modal.cat = v; render(); },
  txCur: (v) => { V.modal.currency = v; render(); },
  key: (k) => {
    const M = V.modal;
    if (k === '⌫') M.amount = M.amount.slice(0, -1);
    else if (M.amount.length < 10) M.amount = (M.amount + k).replace(/^0+/, '');
    render();
  },
  txPhoto: () => takePhoto(900, (p) => { V.modal.photo = p; render(); }),
  txVoice: () => toggleVoice(),
  txSave: () => {
    const M = V.modal;
    const x = { id: uid(), type: M.type, cat: M.cat, amount: +M.amount, currency: M.currency, by: S.me,
      ts: Date.now(), photo: M.photo || null, voice: M.voice || null, billId: M.billId || null };
    commit(() => {
      S.txns.push(x);
      log('tx', `${M.type === 'in' ? '⬇️' : '⬆️'}${catOf(M.type, M.cat).icon}`, money(x.amount, x.currency));
      V.modal = null;
    });
    toast(M.type === 'in' ? '⬇️✅' : '⬆️✅');
  },
  txView: (v) => { V.modal = { kind: 'txView', id: v }; render(); },
  txDel: () => commit(() => {
    const x = S.txns.find((t) => t.id === V.modal.id);
    x.deleted = true; x.deletedBy = S.me;
    log('txDel', '🗑️' + catOf(x.type, x.cat).icon, money(x.amount, x.currency));
    V.modal = null;
  }),
  txRestore: () => commit(() => {
    const x = S.txns.find((t) => t.id === V.modal.id);
    x.deleted = false;
    log('txRestore', '↩️' + catOf(x.type, x.cat).icon, money(x.amount, x.currency));
    V.modal = null;
  }),

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
  close: () => { if (S.members.length) { V.modal = null; render(); } },
  closeBg: (v, el, e) => { if (e.target === el) A.close(); },
};

function keepName(id) {
  const el = document.getElementById(id);
  if (el && V.modal) V.modal.name = el.value.trim();
}

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
};
async function connect() {
  if (!cfg || SY) return;
  const joining = location.hash.startsWith('#join=');
  if (joining) { S = { ...S, members: [], grocery: [], txns: [], bills: [], log: [], catalog: [] }; V.waiting = true; V.modal = null; render(); }
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
      save(S);
    },
  });
}
connect();
window.addEventListener('online', connect);
