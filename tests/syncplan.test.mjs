import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWrites, snapshotOf } from '../syncplan.js';

test('new record → full set', () => {
  const ops = planWrites({}, 'bills', [{ id: 'b1', kind: 'power', dueDay: 10 }]);
  assert.deepEqual(ops, [{ op: 'set', coll: 'bills', id: 'b1', data: { id: 'b1', kind: 'power', dueDay: 10 } }]);
});

test('unchanged record → no ops', () => {
  const recs = [{ id: 'b1', kind: 'power', dueDay: 10 }];
  assert.deepEqual(planWrites(snapshotOf(recs), 'bills', recs), []);
});

test('changed field → merge only that field', () => {
  const prev = snapshotOf([{ id: 't1', amount: 5, deleted: false }]);
  const ops = planWrites(prev, 'txns', [{ id: 't1', amount: 5, deleted: true }]);
  assert.deepEqual(ops, [{ op: 'merge', coll: 'txns', id: 't1', data: { deleted: true }, inc: {}, union: {} }]);
});

test('grocery qty goes up as increment, addedBy as union (safe when two phones add offline)', () => {
  const prev = snapshotOf([{ id: 'g1', item: 'rice', qty: 1, addedBy: ['a'] }]);
  const ops = planWrites(prev, 'grocery', [{ id: 'g1', item: 'rice', qty: 3, addedBy: ['a', 'b'] }]);
  assert.deepEqual(ops, [{ op: 'merge', coll: 'grocery', id: 'g1', data: {}, inc: { qty: 2 }, union: { addedBy: ['b'] } }]);
});

test('qty down is a negative increment', () => {
  const prev = snapshotOf([{ id: 'g1', qty: 2 }]);
  assert.deepEqual(planWrites(prev, 'grocery', [{ id: 'g1', qty: 1 }])[0].inc, { qty: -1 });
});

test('removed record → delete, except log (append-only)', () => {
  const prev = snapshotOf([{ id: 'c1' }]);
  assert.deepEqual(planWrites(prev, 'catalog', []), [{ op: 'delete', coll: 'catalog', id: 'c1' }]);
  assert.deepEqual(planWrites(snapshotOf([{ id: 'l1' }]), 'log', []), []);
});

test('txn photo/voice data URLs move to media docs; record keeps a media: pointer', () => {
  const ops = planWrites({}, 'txns', [{ id: 't1', amount: 5, photo: 'data:image/jpeg;base64,AAA', voice: null }]);
  assert.deepEqual(ops, [
    { op: 'set', coll: 'media', id: 't1_photo', data: { id: 't1_photo', data: 'data:image/jpeg;base64,AAA' } },
    { op: 'set', coll: 'txns', id: 't1', data: { id: 't1', amount: 5, photo: 'media:t1_photo', voice: null } },
  ]);
});

test('record already holding a media: pointer is not re-uploaded', () => {
  const recs = [{ id: 't1', photo: 'media:t1_photo' }];
  assert.deepEqual(planWrites(snapshotOf(recs), 'txns', recs), []);
});

test('undefined fields are dropped (Firestore rejects undefined)', () => {
  const ops = planWrites({}, 'bills', [{ id: 'b1', x: undefined }]);
  assert.deepEqual(ops[0].data, { id: 'b1' });
});
