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

test('member role: admin / earner / helper / member kept; anything else → helper (least access)', () => {
  assert.equal(cleanRecord('members', { id: 'm1', role: 'superuser' }).role, 'helper');
  for (const r of ['admin', 'earner', 'helper', 'member']) assert.equal(cleanRecord('members', { id: 'm1', role: r }).role, r);
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

test('cash records: kind give/return only, people must be ids, amount a number', () => {
  const ok = { id: 'c1', kind: 'give', from: 'baba', to: 'ali', amount: 5000, currency: 'AFN', by: 'baba', ts: 1 };
  assert.deepEqual(cleanRecord('cash', ok), ok);
  assert.equal(cleanRecord('cash', { ...ok, kind: 'steal' }), null);
  assert.equal(cleanRecord('cash', { ...ok, to: '"><b>' }), null);
  assert.equal(cleanRecord('cash', { ...ok, amount: 'x' }).amount, 0);
  assert.equal(cleanRecord('cash', { ...ok, currency: 'EUR' }).currency, 'AFN');
});

test('units must be known; price is a number; paidFrom is hand or null', () => {
  assert.equal(cleanRecord('grocery', { id: 'g1', item: 'rice', qty: 1, addedBy: [], unit: 'sack', price: '3200' }).price, 3200);
  assert.equal(cleanRecord('grocery', { id: 'g1', item: 'rice', qty: 1, addedBy: [], unit: '<i>' }).unit, null);
  assert.equal(cleanRecord('catalog', { id: 'rice', unit: 'kg' }).unit, 'kg');
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, paidFrom: 'hand' }).paidFrom, 'hand');
  assert.equal(cleanRecord('txns', { id: 't1', type: 'out', amount: 1, paidFrom: 'bank"' }).paidFrom, null);
});

test('catalog voice label must be audio', () => {
  assert.equal(cleanRecord('catalog', { id: 'rice', voice: 'data:audio/webm;base64,AA' }).voice, 'data:audio/webm;base64,AA');
  assert.equal(cleanRecord('catalog', { id: 'rice', voice: 'media:rice_voice' }).voice, 'media:rice_voice');
  assert.equal(cleanRecord('catalog', { id: 'rice', voice: 'data:image/png;base64,AA' }).voice, null);
});

test('loans: loan needs direction + person id; pay needs loanId', () => {
  const loan = { id: 'L1', kind: 'loan', dir: 'lent', who: 'uncle1', amount: 100, currency: 'AFN', ts: 1, by: 'baba' };
  assert.deepEqual(cleanRecord('loans', loan), loan);
  assert.equal(cleanRecord('loans', { ...loan, dir: 'gift' }), null);
  assert.equal(cleanRecord('loans', { ...loan, who: '<b>' }), null);
  assert.equal(cleanRecord('loans', { ...loan, kind: 'x' }), null);
  assert.equal(cleanRecord('loans', { id: 'P1', kind: 'pay', loanId: 'L1', amount: '5' }).amount, 5);
  assert.equal(cleanRecord('loans', { id: 'P1', kind: 'pay', loanId: '"x', amount: 5 }), null);
});

test('jars: goal from the known list, target a number; move needs jarId', () => {
  assert.equal(cleanRecord('jars', { id: 'J1', kind: 'jar', goal: 'wedding', target: '9', currency: 'AFN' }).target, 9);
  assert.equal(cleanRecord('jars', { id: 'J1', kind: 'jar', goal: '<x>', currency: 'AFN' }).goal, 'other');
  assert.equal(cleanRecord('jars', { id: 'm1', kind: 'move', jarId: 'J1', amount: -50 }).amount, -50);
  assert.equal(cleanRecord('jars', { id: 'm1', kind: 'move', jarId: '', amount: 5 }), null);
});

test('abroad income: fee number, country from list, sender id', () => {
  const t = cleanRecord('txns', { id: 't1', type: 'in', cat: 'abroad', amount: 1, from: 'son1', fee: '300', country: 'ir' });
  assert.equal(t.fee, 300); assert.equal(t.country, 'ir'); assert.equal(t.from, 'son1');
  assert.equal(cleanRecord('txns', { id: 't1', type: 'in', amount: 1, country: 'xx"' }).country, null);
});

test('pantry level on catalog: full/half/empty or null', () => {
  assert.equal(cleanRecord('catalog', { id: 'rice', stock: 'half', stockBy: 'm1', stockTs: '5' }).stock, 'half');
  assert.equal(cleanRecord('catalog', { id: 'rice', stock: 'lots<' }).stock, null);
  assert.equal(cleanRecord('catalog', { id: 'rice', stockTs: '5' }).stockTs, 5);
  assert.equal(cleanRecord('catalog', { id: 'rice', stockBy: '"x' }).stockBy, null);
});

test('own money categories: type in/out, short name and icon', () => {
  const c = cleanRecord('cats', { id: 'c1', type: 'in', icon: '🧶', name: 'قالین‌بافی', ts: 1, by: 'm1' });
  assert.equal(c.name, 'قالین‌بافی');
  assert.equal(cleanRecord('cats', { id: 'c1', type: 'x', icon: '🧶', name: 'a' }), null);
  assert.equal(cleanRecord('cats', { id: 'c1', type: 'out', icon: '<img src=x onerror=1>xxxxxxxxxxxxxxx', name: 'a' }).icon.length, 16);
});

test('member role orderer is kept from the cloud', () => {
  assert.equal(cleanRecord('members', { id: 'm1', role: 'orderer' }).role, 'orderer');
});

test('expense note: kept as plain text, cut to 120, junk types become text', () => {
  const r = cleanRecord('txns', { id: 'a1', type: 'out', note: 'برای مکتب احمد' });
  assert.equal(r.note, 'برای مکتب احمد');
  assert.equal(cleanRecord('txns', { id: 'a1', type: 'out', note: 'x'.repeat(500) }).note.length, 120);
  assert.equal(typeof cleanRecord('txns', { id: 'a1', type: 'out', note: { evil: 1 } }).note, 'string');
});
