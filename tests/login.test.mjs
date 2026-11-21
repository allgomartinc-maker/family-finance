import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPassword, normUser, normPass, loginKeys, sealLogin, openLogin } from '../login.js';

const P = { fid: 'fam123', code: 'secretjoincode0123456789', memberId: 'm1' };

test('new password looks like abcd-2345 and uses easy letters', () => {
  for (let i = 0; i < 20; i++) assert.match(newPassword(), /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
});

test('username and password are forgiving: case, spaces, dashes', () => {
  assert.equal(normUser('  Ali  Khan '), 'ali khan');
  assert.equal(normPass('AB3K-7MPQ '), 'ab3k7mpq');
});

test('seal → open with the right username + password gives back family and member', async () => {
  const { id, code, doc } = await sealLogin('Ali', 'ab3k-7mpq', P);
  assert.match(id, /^[0-9a-f]{40}$/);
  assert.match(code, /^[0-9a-f]{40}$/);
  assert.notEqual(code, id);
  assert.deepEqual(await openLogin('ali', 'AB3K7MPQ', doc), P);
  assert.equal((await loginKeys(' ALI ', 'ab3k 7mpq')).id, id);   // same record found however it is typed
});

test('wrong password or wrong username → nothing (and a different record id)', async () => {
  const { id, doc } = await sealLogin('ali', 'ab3k-7mpq', P);
  assert.equal(await openLogin('ali', 'ab3k-7mpz', doc), null);
  assert.equal(await openLogin('ahmad', 'ab3k-7mpq', doc), null);
  assert.notEqual((await loginKeys('ali', 'ab3k-7mpz')).id, id);
  assert.notEqual((await loginKeys('ahmad', 'ab3k-7mpq')).id, id);
});

test('the stored record does not contain the join code or password in plain text', async () => {
  const { doc } = await sealLogin('ali', 'ab3k-7mpq', P);
  const s = JSON.stringify(doc);
  assert.equal(s.includes(P.code), false);
  assert.equal(s.includes('ab3k'), false);
  assert.equal(await openLogin('ali', 'ab3k-7mpq', { ...doc, ct: doc.ct.slice(0, -4) + 'AAAA' }), null);   // tampered
});
