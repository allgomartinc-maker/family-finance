import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecord } from '../clean.js';

test('drops records with unsafe ids', () => {
  assert.equal(cleanRecord('grocery', { id: 'x" onclick="alert(1)', item: 'rice', qty: 1, addedBy: [] }), null);
  assert.equal(cleanRecord('grocery', { item: 'rice' }), null);
});

test('photo must be an image data URL or media pointer', () => {
  const ok = 'data:image/jpeg;base64,AAAA';
  assert.equal(cleanRecord('members', { id: 'm1', photo: ok }).photo, ok);
  assert.equal(cleanRecord('members', { id: 'm1', photo: 'x" onerror="alert(1)' }).photo, null);
  assert.equal(cleanRecord('members', { id: 'm1', photo: 'javascript:alert(1)' }).photo, null);
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, photo: 'media:t1_photo' }).photo, 'media:t1_photo');
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, photo: 'media:t1"x' }).photo, null);
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, voice: 'data:audio/webm;base64,AA' }).voice, 'data:audio/webm;base64,AA');
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, voice: 'data:text/html,<b>' }).voice, null);
});

test('base64 payload may not contain quotes or spaces', () => {
  assert.equal(cleanRecord('members', { id: 'm1', photo: 'data:image/png;base64,AA" x="' }).photo, null);
});

test('numbers are forced to numbers', () => {
  const g = cleanRecord('grocery', { id: 'g1', item: 'rice', qty: '<img src=x>', addedBy: ['a'] });
  assert.equal(g.qty, 0);
  assert.equal(cleanRecord('bills', { id: 'b1', kind: 'power', dueDay: '5"' }).dueDay, 0);
  assert.equal(cleanRecord('txns', { id: 't1', type: 'in', amount: '12' }).amount, 12);
});

test('txn type and currency limited to known values', () => {
  assert.equal(cleanRecord('txns', { id: 't1', type: 'in" x', amount: 1 }), null);
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, currency: 'EUR"' }).currency, 'AFN');
});

test('id references (by, item, addedBy, claimedBy) must be safe ids', () => {
  const g = cleanRecord('grocery', { id: 'g1', item: 'rice', qty: 1, addedBy: ['a', 'b"x'], claimedBy: '"><' });
  assert.deepEqual(g.addedBy, ['a']);
  assert.equal(g.claimedBy, null);
  assert.equal(cleanRecord('grocery', { id: 'g1', item: 'r"ice', qty: 1, addedBy: [] }), null);
});

test('member role is admin or member only', () => {
  assert.equal(cleanRecord('members', { id: 'm1', role: 'superuser' }).role, 'member');
  assert.equal(cleanRecord('members', { id: 'm1', role: 'admin' }).role, 'admin');
});

test('long strings are cut', () => {
  assert.equal(cleanRecord('members', { id: 'm1', name: 'x'.repeat(500) }).name.length, 60);
});

test('normal records pass through unchanged', () => {
  const t = { id: 't1', type: 'out', cat: 'food', amount: 750, currency: 'AFN', by: 'm1', ts: 5, photo: null, voice: null, billId: null };
  assert.deepEqual(cleanRecord('txns', t), t);
});

test('member pin: valid salt/hash kept, anything else removed', () => {
  const pin = { salt: 'a'.repeat(32), hash: 'b'.repeat(64) };
  assert.deepEqual(cleanRecord('members', { id: 'm1', role: 'admin', pin }).pin, pin);
  assert.equal(cleanRecord('members', { id: 'm1', pin: { salt: '<x>', hash: 'b'.repeat(64) } }).pin, null);
  assert.equal(cleanRecord('members', { id: 'm1', pin: 'abc' }).pin, null);
  assert.deepEqual(cleanRecord('members', { id: 'm1', pin: { ...pin, extra: '<script>' } }).pin, pin);
});
