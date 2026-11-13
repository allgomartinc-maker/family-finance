// Whole family state kept in IndexedDB (big quota, works offline).
// Every record has id/ts/by and soft-delete, so a cloud sync (Firebase) can be added later.
import { GROCERY } from './data.js';

const DB = 'family-finance', KEY = 'state';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function load() {
  const db = await idb();
  return new Promise((res) => {
    const q = db.transaction('kv').objectStore('kv').get(KEY);
    q.onsuccess = () => res(q.result || fresh());
    q.onerror = () => res(fresh());
  });
}

export async function save(state) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(state, KEY);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

export const fresh = () => ({
  members: [], me: null, catalog: GROCERY.map((x) => ({ ...x })),
  grocery: [], txns: [], bills: [], log: [], cash: [], currency: 'AFN',
});

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
