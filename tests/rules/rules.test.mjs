import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const CODE = 'abcdefghijklmnopqrstuvwx';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'families/f1'), { owner: 'owner', joinCode: CODE });
    await setDoc(doc(db, 'families/f1/joins/owner'), { code: CODE, ts: 1 });
    await setDoc(doc(db, 'families/f1/grocery/g1'), { id: 'g1', qty: 1 });
    await setDoc(doc(db, 'families/f1/log/l1'), { id: 'l1' });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

test('owner can create a family with a long join code', async () => {
  await assertSucceeds(setDoc(doc(as('u9'), 'families/f9'), { owner: 'u9', joinCode: CODE }));
});

test('cannot create a family for someone else or with a short code', async () => {
  await assertFails(setDoc(doc(as('u9'), 'families/f8'), { owner: 'other', joinCode: CODE }));
  await assertFails(setDoc(doc(as('u9'), 'families/f7'), { owner: 'u9', joinCode: 'short' }));
});

test('outsider cannot read family or its data', async () => {
  await assertFails(getDoc(doc(as('stranger'), 'families/f1')));
  await assertFails(getDoc(doc(as('stranger'), 'families/f1/grocery/g1')));
  await assertFails(setDoc(doc(as('stranger'), 'families/f1/grocery/g2'), { id: 'g2' }));
});

test('signed-out user cannot read anything', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'families/f1/grocery/g1')));
});

test('wrong join code is rejected', async () => {
  await assertFails(setDoc(doc(as('kid'), 'families/f1/joins/kid'), { code: 'wrongwrongwrongwrongwrong', ts: 1 }));
});

test('cannot join on behalf of another phone', async () => {
  await assertFails(setDoc(doc(as('kid'), 'families/f1/joins/other'), { code: CODE, ts: 1 }));
});

test('right join code → phone can read and write family data', async () => {
  const db = as('kid');
  await assertSucceeds(setDoc(doc(db, 'families/f1/joins/kid'), { code: CODE, ts: 1 }));
  await assertSucceeds(getDoc(doc(db, 'families/f1/grocery/g1')));
  await assertSucceeds(updateDoc(doc(db, 'families/f1/grocery/g1'), { qty: 2 }));
  await assertSucceeds(setDoc(doc(db, 'families/f1/txns/t1'), { id: 't1', amount: 5 }));
});

test('history log is append-only', async () => {
  const db = as('owner');
  await assertSucceeds(setDoc(doc(db, 'families/f1/log/l2'), { id: 'l2' }));
  await assertFails(updateDoc(doc(db, 'families/f1/log/l1'), { id: 'x' }));
  await assertFails(deleteDoc(doc(db, 'families/f1/log/l1')));
});

test('unknown collections are blocked', async () => {
  await assertFails(setDoc(doc(as('owner'), 'families/f1/secrets/s1'), { a: 1 }));
});

test('member cannot change owner or join code, or delete the family', async () => {
  const db = as('owner');
  await assertFails(updateDoc(doc(db, 'families/f1'), { joinCode: 'zzzzzzzzzzzzzzzzzzzzzzzz' }));
  await assertFails(updateDoc(doc(db, 'families/f1'), { owner: 'kid' }));
  await assertFails(deleteDoc(doc(db, 'families/f1')));
});

test('joined phones cannot remove other phones from the family', async () => {
  await assertFails(deleteDoc(doc(as('owner'), 'families/f1/joins/owner')));
});

test('family phones can write cash handover records; outsiders cannot', async () => {
  await assertSucceeds(setDoc(doc(as('owner'), 'families/f1/cash/c1'), { id: 'c1', kind: 'give', from: 'a', to: 'b', amount: 5 }));
  await assertFails(setDoc(doc(as('stranger'), 'families/f1/cash/c2'), { id: 'c2', kind: 'give', from: 'a', to: 'b', amount: 5 }));
  await assertFails(getDoc(doc(as('stranger'), 'families/f1/cash/c1')));
});

test('loans, jars and contacts are family-only', async () => {
  for (const c of ['loans', 'jars', 'contacts', 'cats']) {
    await assertSucceeds(setDoc(doc(as('owner'), `families/f1/${c}/x1`), { id: 'x1' }));
    await assertFails(getDoc(doc(as('stranger'), `families/f1/${c}/x1`)));
  }
});
