// Username + password login for family members. Pure Web Crypto, no Firebase. Tested in tests/login.test.mjs.
//
// The admin makes a username + password for a person. From them we derive (PBKDF2, slow on purpose):
//   id, code → a tiny private "login family" in the cloud (families/{id}, join code = code).
//              Only someone who knows the username + password can work these out and get in.
//   key      → AES key that seals { fid, code, memberId } of the real family inside it.
// The cloud never sees the password, and the real family's join code inside is encrypted.
// This works with the normal family rules — nothing extra to switch on in Firebase.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ALPH = 'abcdefghjkmnpqrstuvwxyz23456789';   // no 0/o, 1/l/i: easy to read out loud
const ROUNDS = 150000;

export const normUser = (u) => String(u ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normPass = (p) => String(p ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// 8 characters shown as "abcd-2345" (about 40 bits).
export function newPassword() {
  const s = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPH[b % ALPH.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function loginKeys(user, pass) {
  const base = await crypto.subtle.importKey('raw', enc.encode(normPass(pass)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`ff-login:${normUser(user)}`), iterations: ROUNDS }, base, 512));
  const half = bits.slice(0, 32);
  const id = hex(await crypto.subtle.digest('SHA-256', half)).slice(0, 40);
  const code = hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...half, 1]))).slice(0, 40);
  const key = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id, code, key };
}

// → { id, code, doc: { iv, ct } } to store in the cloud in the login family {id}
export async function sealLogin(user, pass, payload) {
  const { id, code, key } = await loginKeys(user, pass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  return { id, code, doc: { iv: b64(iv), ct: b64(ct) } };
}

// → payload, or null when the password is wrong or the record was changed.
export async function openLogin(user, pass, doc) {
  if (!doc?.iv || !doc?.ct) return null;
  try {
    const { key } = await loginKeys(user, pass);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(doc.iv) }, key, unb64(doc.ct));
    const p = JSON.parse(dec.decode(pt));
    return p && typeof p.fid === 'string' && typeof p.code === 'string' && typeof p.memberId === 'string' ? p : null;
  } catch { return null; }
}
