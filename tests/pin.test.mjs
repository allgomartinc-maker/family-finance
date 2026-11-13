import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePin, checkPin, PIN_LEN, PIN_ICONS } from '../pin.js';

test('PIN is 4 pictures chosen from 9', () => {
  assert.equal(PIN_LEN, 4);
  assert.equal(PIN_ICONS.length, 9);
});

test('makePin stores salt + hash, never the PIN itself', async () => {
  const p = await makePin([0, 3, 3, 8]);
  assert.match(p.salt, /^[0-9a-f]{32}$/);
  assert.match(p.hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(p).includes('0,3,3,8'));
});

test('checkPin accepts the right sequence only', async () => {
  const p = await makePin([1, 2, 3, 4]);
  assert.equal(await checkPin([1, 2, 3, 4], p), true);
  assert.equal(await checkPin([4, 3, 2, 1], p), false);
  assert.equal(await checkPin([1, 2, 3], p), false);
});

test('same PIN gets a different hash each time (random salt)', async () => {
  const a = await makePin([5, 5, 5, 5]);
  const b = await makePin([5, 5, 5, 5]);
  assert.notEqual(a.hash, b.hash);
});

test('checkPin with missing/garbled stored pin is false', async () => {
  assert.equal(await checkPin([1, 2, 3, 4], null), false);
  assert.equal(await checkPin([1, 2, 3, 4], { salt: 'zz', hash: 'x' }), false);
});
