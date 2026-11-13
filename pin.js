// Picture PIN for admin features: 4 taps on a 3×3 grid of pictures (works for people who can't read).
// Stored on the admin's member record as { salt, hash } — PBKDF2-SHA256, never the PIN itself.
// This keeps family members from casually opening admin screens; it is not bank-grade
// (9^4 = 6561 combinations), and the Firestore rules still trust every joined phone.

export const PIN_LEN = 4;
export const PIN_ICONS = ['🍎', '🐟', '⭐', '🌙', '🌸', '🚗', '🏠', '🐐', '☀️'];
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
