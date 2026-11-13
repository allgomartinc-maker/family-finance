// Number PIN for admin features and the private pocket: 4 digits on a big 0–9 keypad.
// Stored on the admin's member record as { salt, hash } — PBKDF2-SHA256, never the PIN itself.
// This keeps family members from casually opening admin screens; it is not bank-grade
// (10^4 = 10,000 combinations), and the Firestore rules still trust every joined phone.

export const PIN_LEN = 4;
export const PIN_KEYS = ['۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۰'];
const ITER = 150000;
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function derive(seq, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(seq.join('-')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: ITER }, key, 256);
  return hex(bits);
}

export async function makePin(seq) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await derive(seq, salt) };
}

export async function checkPin(seq, pin) {
  if (!pin || !/^[0-9a-f]{32}$/.test(pin.salt) || !/^[0-9a-f]{64}$/.test(pin.hash)) return false;
  if (seq.length !== PIN_LEN) return false;
  return (await derive(seq, pin.salt)) === pin.hash;
}
