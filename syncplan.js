// Pure diff: local records vs last-synced copy → list of Firestore writes.
// Tested in tests/syncplan.test.mjs. No Firebase imports here.

const INC = { grocery: ['qty'] };            // numbers that several phones may change at once
const UNION = { grocery: ['addedBy'] };      // arrays that only grow
const MEDIA = { txns: ['photo', 'voice'] };  // big data URLs → separate media docs
const APPEND_ONLY = ['log'];

const clean = (o) => JSON.parse(JSON.stringify(o)); // drops undefined
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Replace data: URLs with media: pointers. Returns { rec, media: [{id,data}] }.
function split(coll, r) {
  const media = [];
  const rec = { ...r };
  for (const f of MEDIA[coll] || []) {
    if (typeof rec[f] === 'string' && rec[f].startsWith('data:')) {
      const id = `${r.id}_${f}`;
      media.push({ id, data: rec[f] });
      rec[f] = `media:${id}`;
    }
  }
  return { rec: clean(rec), media };
}

export function snapshotOf(recs, coll = '') {
  return Object.fromEntries(recs.map((r) => [r.id, split(coll, r).rec]));
}

export function planWrites(prev, coll, recs) {
  const ops = [];
  const seen = new Set();
  for (const r of recs) {
    seen.add(r.id);
    const { rec, media } = split(coll, r);
    const old = prev[r.id];
    if (!old) {
      for (const m of media) ops.push({ op: 'set', coll: 'media', id: m.id, data: m });
      ops.push({ op: 'set', coll, id: r.id, data: rec });
      continue;
    }
    if (same(old, rec)) continue;
    const data = {}, inc = {}, union = {};
    for (const k of new Set([...Object.keys(rec), ...Object.keys(old)])) {
      if (same(old[k], rec[k])) continue;
      if ((INC[coll] || []).includes(k) && typeof old[k] === 'number' && typeof rec[k] === 'number') {
        inc[k] = rec[k] - old[k];
      } else if ((UNION[coll] || []).includes(k) && Array.isArray(old[k]) && Array.isArray(rec[k])) {
        const added = rec[k].filter((x) => !old[k].includes(x));
        if (added.length) union[k] = added;
      } else {
        data[k] = rec[k] === undefined ? null : rec[k];
      }
    }
    for (const m of media) {
      const field = m.id.slice(r.id.length + 1);
      if (old[field] !== `media:${m.id}`) ops.push({ op: 'set', coll: 'media', id: m.id, data: m });
    }
    ops.push({ op: 'merge', coll, id: r.id, data, inc, union });
  }
  if (!APPEND_ONLY.includes(coll)) {
    for (const id of Object.keys(prev)) if (!seen.has(id)) ops.push({ op: 'delete', coll, id });
  }
  return ops;
}
