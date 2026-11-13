// Firebase sync: every phone signs in anonymously, joins the family with a secret link,
// and mirrors each collection. Firestore keeps its own offline copy and uploads when online.
import { planWrites, snapshotOf } from './syncplan.js';

export const FB_VERSION = '13.1.0';
const BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
export const FB_FILES = ['app', 'auth', 'firestore'].map((m) => `${BASE}/firebase-${m}.js`);
const COLLS = ['members', 'catalog', 'grocery', 'txns', 'bills', 'log', 'cash', 'loans', 'jars', 'contacts', 'cats'];
const FAM_KEY = 'ff-family';

const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export async function startSync({ config, emulator, getState, onRemote, onStatus }) {
  // What this phone had when sync started. Anything the family changes on this phone before the
  // first cloud snapshot arrives is the difference from this, and gets uploaded then.
  const startBase = (S) => Object.fromEntries(COLLS.map((c) => [c, snapshotOf(S[c] || [], c)]));
  let base = startBase(getState());
  const [{ initializeApp }, A, F] = await Promise.all(FB_FILES.map((u) => import(u)));
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  if (emulator) A.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });
  if (emulator) F.connectFirestoreEmulator(db, '127.0.0.1', 8181);

  await auth.authStateReady();
  if (!auth.currentUser) await A.signInAnonymously(auth);
  const uid = auth.currentUser.uid;

  let fam = JSON.parse(localStorage.getItem(FAM_KEY) || 'null');
  const join = location.hash.match(/^#join=([a-z0-9]+)\.([a-z0-9]+)$/);
  let joined = false;
  if (join && fam?.fid !== join[1]) {
    fam = { fid: join[1], code: join[2] };
    await F.setDoc(F.doc(db, `families/${fam.fid}/joins/${uid}`), { code: fam.code, ts: Date.now() });
    joined = true;
  }
  if (join) history.replaceState(null, '', location.pathname + location.search);

  const prev = {};
  const ready = new Set();
  const path = (c) => `families/${fam.fid}/${c}`;

  if (!fam) {
    // First phone: create the family and upload whatever is already on this phone.
    fam = { fid: rand(20), code: rand(24) };
    await F.setDoc(F.doc(db, `families/${fam.fid}`), { owner: uid, joinCode: fam.code, ts: Date.now() });
    await F.setDoc(F.doc(db, `families/${fam.fid}/joins/${uid}`), { code: fam.code, ts: Date.now() });
    const S = getState();
    base = startBase(S);
    const ops = COLLS.flatMap((c) => planWrites({}, c, S[c] || []));
    for (let i = 0; i < ops.length; i += 20) await applyOps(ops.slice(i, i + 20));
  }
  localStorage.setItem(FAM_KEY, JSON.stringify(fam));

  function toWrite(op) {
    const ref = F.doc(db, `${path(op.coll)}/${op.id}`);
    if (op.op === 'delete') return (b) => b.delete(ref);
    if (op.op === 'set') return (b) => b.set(ref, op.data);
    const data = { ...op.data };
    for (const [k, n] of Object.entries(op.inc)) data[k] = F.increment(n);
    for (const [k, xs] of Object.entries(op.union)) data[k] = F.arrayUnion(...xs);
    return (b) => b.set(ref, data, { merge: true });
  }
  function applyOps(ops) {
    if (!ops.length) return Promise.resolve();
    const b = F.writeBatch(db);
    ops.forEach((op) => toWrite(op)(b));
    return b.commit();
  }

  // Push local changes. Not awaited: offline writes wait in Firestore's queue.
  function push() {
    const S = getState();
    const ops = [];
    for (const c of COLLS) {
      if (!ready.has(c)) continue;
      ops.push(...planWrites(prev[c], c, S[c] || []));
      prev[c] = snapshotOf(S[c] || [], c);
    }
    for (let i = 0; i < ops.length; i += 20) {
      applyOps(ops.slice(i, i + 20)).catch((e) => { console.error(e); onStatus('error'); });
    }
  }

  for (const c of COLLS) {
    const q = c === 'log'
      ? F.query(F.collection(db, path(c)), F.orderBy('ts', 'desc'), F.limit(300))
      : F.collection(db, path(c));
    F.onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const m = snap.metadata;
      onStatus(m.hasPendingWrites ? 'pending' : m.fromCache ? 'offline' : 'ok');
      if (!snap.docChanges().length && ready.has(c)) return;
      const recs = snap.docs.map((d) => d.data());
      prev[c] = snapshotOf(recs, c);
      if (!ready.has(c)) {
        ready.add(c);
        // Changes made on this phone while sync was starting → upload now.
        // Firestore then sends a new snapshot that includes them.
        const early = planWrites(base[c], c, getState()[c] || []);
        delete base[c];
        for (let i = 0; i < early.length; i += 20) {
          applyOps(early.slice(i, i + 20)).catch((e) => { console.error(e); onStatus('error'); });
        }
        if (early.length) return;
      }
      onRemote(c, recs);
    }, (e) => { console.error(c, e); onStatus('error'); });
  }

  const media = new Map();
  async function getMedia(id) {
    if (!media.has(id)) {
      media.set(id, F.getDoc(F.doc(db, `${path('media')}/${id}`)).then((d) => d.data()?.data || null));
    }
    return media.get(id);
  }

  const inviteLink = () => `${location.origin}${location.pathname}#join=${fam.fid}.${fam.code}`;
  const net = (on) => (on ? F.enableNetwork(db) : F.disableNetwork(db)); // used by emulator tests
  return { push, getMedia, inviteLink, joined, uid, net };
}
