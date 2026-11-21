// Every record that comes from the cloud passes through cleanRecord before the app uses it.
// A family member's phone could write anything the rules allow; this keeps it from
// becoming HTML/JS on another phone. Tested in tests/clean.test.mjs.

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const IMG = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const AUDIO = /^data:audio\/[a-z0-9.+-]+(;codecs=[a-z0-9.,-]+)?;base64,[A-Za-z0-9+/=]+$/;
const MEDIA = /^media:[A-Za-z0-9_-]{1,60}$/;

export const isId = (v) => typeof v === 'string' && ID.test(v);
export const safeImage = (v) => (typeof v === 'string' && (IMG.test(v) || MEDIA.test(v)) ? v : null);
export const safeAudio = (v) => (typeof v === 'string' && (AUDIO.test(v) || MEDIA.test(v)) ? v : null);

const REFS = ['by', 'claimedBy', 'boughtBy', 'deletedBy', 'editedBy', 'loginId', 'billId', 'paidTx', 'from', 'to', 'who', 'loanId', 'jarId', 'stockBy'];
const GOALS = ['wedding', 'eid', 'health', 'hajj', 'house', 'school', 'other'];
const COUNTRIES = ['ir', 'pk', 'tr', 'de', 'gb', 'us', 'sa', 'ae', 'other'];
const UNIT_IDS = ['kg', 'sack', 'tin', 'bottle', 'pack', 'piece', 'dozen', 'liter'];
const NUMS = ['qty', 'amount', 'dueDay', 'ts', 'boughtTs', 'ord', 'price', 'fee', 'target', 'stockTs', 'editedTs'];
const TEXT = { note: 120, loginUser: 60, name: 60, extra: 60, action: 30, emoji: 16, icon: 16 };

export function cleanRecord(coll, rec) {
  if (!rec || typeof rec !== 'object' || !isId(rec.id)) return null;
  const r = { ...rec };
  const has = (k) => Object.prototype.hasOwnProperty.call(r, k);

  for (const k of REFS) if (has(k) && r[k] !== null && !isId(r[k])) r[k] = null;
  for (const k of NUMS) if (has(k) && r[k] !== null) { const n = Number(r[k]); r[k] = Number.isFinite(n) ? n : 0; }
  for (const [k, max] of Object.entries(TEXT)) if (has(k) && r[k] !== null) r[k] = String(r[k]).slice(0, max);
  if (has('photo')) r.photo = safeImage(r.photo);
  if (has('voice')) r.voice = safeAudio(r.voice);
  if (has('addedBy')) r.addedBy = Array.isArray(r.addedBy) ? r.addedBy.filter(isId) : [];
  if (has('bought')) r.bought = r.bought === true;
  if (has('noTime')) r.noTime = r.noTime === true;
  if (has('deleted')) r.deleted = r.deleted === true;

  if (coll === 'grocery' && !isId(r.item)) return null;
  if (coll === 'txns') {
    if (r.type !== 'in' && r.type !== 'out') return null;
    if (has('currency') && r.currency !== 'AFN' && r.currency !== 'USD') r.currency = 'AFN';
    if (has('cat') && !isId(r.cat)) r.cat = 'other';
  }
  if (coll === 'bills' && !isId(r.kind)) return null;
  if (coll === 'cats' && r.type !== 'in' && r.type !== 'out') return null;
  if (coll === 'members' && has('role') && !['admin', 'earner', 'helper', 'orderer', 'member'].includes(r.role)) r.role = 'helper';
  if (has('unit') && !UNIT_IDS.includes(r.unit)) r.unit = null;
  if (has('paidFrom') && r.paidFrom !== 'hand') r.paidFrom = null;
  if (coll === 'cash') {
    if (r.kind !== 'give' && r.kind !== 'return') return null;
    if (!isId(r.from) || !isId(r.to)) return null;
    if (r.currency !== 'AFN' && r.currency !== 'USD') r.currency = 'AFN';
  }
  if (has('country') && !COUNTRIES.includes(r.country)) r.country = null;
  if (has('stock') && !['full', 'half', 'empty'].includes(r.stock)) r.stock = null;
  if (coll === 'loans') {
    if (r.kind === 'loan') {
      if (r.dir !== 'lent' && r.dir !== 'borrowed') return null;
      if (!isId(r.who)) return null;
      if (r.currency !== 'AFN' && r.currency !== 'USD') r.currency = 'AFN';
      if (has('for') && r.for !== null && !isId(r.for)) r.for = 'other';
    } else if (r.kind === 'pay') {
      if (!isId(r.loanId)) return null;
    } else return null;
  }
  if (coll === 'jars') {
    if (r.kind === 'jar') {
      if (!GOALS.includes(r.goal)) r.goal = 'other';
      if (r.currency !== 'AFN' && r.currency !== 'USD') r.currency = 'AFN';
    } else if (r.kind === 'move') {
      if (!isId(r.jarId)) return null;
    } else return null;
  }
  if (has('pin')) {
    const p = r.pin;
    r.pin = p && typeof p === 'object' && /^[0-9a-f]{32}$/.test(p.salt) && /^[0-9a-f]{64}$/.test(p.hash)
      ? { salt: p.salt, hash: p.hash } : null;
  }
  return r;
}
