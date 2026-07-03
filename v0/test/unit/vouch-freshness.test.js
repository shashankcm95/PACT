#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/vouch-freshness.test.js  (plans/36 W2 -- the read-gate freshness FILTER)
//
// RED-first spec for filterFreshVouches(recs, freshnessOpts): the disarmed-by-default freshness filter that,
// when ARMED (deploy-constant {now, ttlMs}), enforces the H1 authorization post-condition (no-freshness => DROP,
// a positive AND-chain, DROP-not-throw). Written to plans/36 §2a + §5 + the VERIFY-hacker F1/F2/F4 folds:
//   - DISARMED (absent/malformed {now,ttlMs}) => identity pass-through (=== recs); byte-identical for every
//     existing caller (none sets meCtx.freshness today).
//   - ARMED => a VOUCH is KEPT only if it AFFIRMATIVELY presents a well-formed, in-window payload.freshness.
//   - TOTAL / never-throws: a throwing getter is a DROP (F1 try/catch), never a convert-wide DoS.
//   - {now,ttlMs} read ONLY from freshnessOpts, NEVER from a record (a hostile fr.ttlMs=Infinity is ignored).

const assert = require('node:assert/strict');
const { filterFreshVouches } = require('../../src/trust/vouch-freshness');
const { buildVouchGraph, maxVertexDisjointPaths } = require('../../src/trust/convert');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const TTL = DAY;
const ARMED = { now: NOW, ttlMs: TTL };
const VALID_NONCE = 'fresh-nonce-01';   // whitespace-clean, >= MIN_NONCE_LEN (8)

let _rid = 0;
// a synthetic sig-verified record (filterFreshVouches inspects fields only -- it never verifies a sig).
function vouch(freshness, over = {}) {
  const payload = { target_persona: 'did:key:zT' + (_rid), ...(freshness !== undefined ? { freshness } : {}) };
  return { type: 'VOUCH', src_persona_did: 'did:key:zV', record_id: 'r' + (_rid++), payload, ...over };
}
function fresh(over = {}) { return { approved_at: NOW - 1000, nonce: VALID_NONCE, ...over }; }

// ---- item 1: DISARMED => identity pass-through (=== recs), byte-identical ----
test('DISARMED: absent/malformed {now,ttlMs} -> identity pass-through (=== recs, no drops)', () => {
  const recs = [vouch(fresh()), vouch(undefined), vouch({ approved_at: NOW - 10 * DAY, nonce: VALID_NONCE })];
  const disarmed = [
    undefined, null, {}, { now: NaN, ttlMs: TTL }, { now: NOW }, { now: NOW, ttlMs: 0 },
    { now: NOW, ttlMs: -5 }, { now: NOW, ttlMs: Infinity }, { now: NOW, ttlMs: NaN }, { now: Infinity, ttlMs: TTL },
    { now: '1700000000000', ttlMs: TTL }, { now: NOW, ttlMs: '86400000' },
    [], Object.assign([], { now: NOW, ttlMs: TTL }),   // an array-shaped opts must DISARM (F4 -- keep !Array.isArray)
  ];
  for (const opts of disarmed) {
    const out = filterFreshVouches(recs, opts);
    assert.equal(out, recs, 'disarmed must return the SAME array ref (identity pass-through): ' + JSON.stringify(opts));
  }
});

// ---- item 2: ARMED drops NO-FRESHNESS (the H1 inversion of plans/35 signed-edge-mint) ----
test('ARMED: a bare VOUCH (no payload.freshness) is DROPPED (no-freshness => drop, NEVER skip-when-absent)', () => {
  const bare = vouch(undefined);
  const good = vouch(fresh());
  const out = filterFreshVouches([bare, good], ARMED);
  assert.deepEqual(out, [good], 'the bare VOUCH must DROP; the fresh one survives');
  assert.equal(out.includes(bare), false);
});

// ---- item 3: ARMED drops MALFORMED freshness (positive AND-chain -- no superset/partial survives) ----
test('ARMED: a malformed payload.freshness is DROPPED (partial/wrong-type cannot sneak past the AND-chain)', () => {
  const good = vouch(fresh());
  const malformed = [
    vouch(null), vouch([]), vouch({}), vouch({ approved_at: NOW - 1000 }), vouch({ nonce: VALID_NONCE }),
    vouch({ approved_at: '1700', nonce: VALID_NONCE }), vouch({ approved_at: NOW - 1000, nonce: 'short' }),
    vouch({ approved_at: NaN, nonce: VALID_NONCE }), vouch({ approved_at: Infinity, nonce: VALID_NONCE }),
    vouch({ approved_at: NOW - 1000, nonce: '  padded-nonce  ' }),  // not whitespace-clean -> isValidNonce false
  ];
  const out = filterFreshVouches([...malformed, good], ARMED);
  assert.deepEqual(out, [good], 'every malformed-freshness VOUCH DROPS; only the well-formed fresh one survives');
});

// ---- item 4: ARMED drops STALE / FUTURE ----
test('ARMED: a STALE or FUTURE VOUCH is DROPPED (checkFreshnessWindow governs)', () => {
  const good = vouch(fresh());
  const stale = vouch({ approved_at: NOW - 10 * DAY, nonce: VALID_NONCE });
  const future = vouch({ approved_at: NOW + DAY, nonce: VALID_NONCE });
  const out = filterFreshVouches([stale, future, good], ARMED);
  assert.deepEqual(out, [good]);
});

// ---- item 5: ARMED keeps FRESH well-formed ----
test('ARMED: a fresh, well-formed VOUCH (approved_at in [now-ttl, now], valid nonce) is KEPT', () => {
  const atEdge = vouch({ approved_at: NOW - TTL, nonce: VALID_NONCE });   // exactly at the TTL boundary
  const atNow = vouch({ approved_at: NOW, nonce: VALID_NONCE });          // exactly now
  const mid = vouch(fresh());
  const out = filterFreshVouches([atEdge, atNow, mid], ARMED);
  assert.deepEqual(out, [atEdge, atNow, mid], 'all three in-window VOUCHes survive');
});

// ---- item 6: ARMED passes NON-VOUCH records through (freshness is not their concern -- SRP) ----
test('ARMED: a non-VOUCH record passes through UNCHANGED (not freshness-gated)', () => {
  const stake = { type: 'STAKE', src_persona_did: 'did:key:zS', record_id: 'rs', payload: { lock_expiry: NOW + DAY } };
  const claim = { type: 'CLAIM', src_persona_did: 'did:key:zC', record_id: 'rc', payload: { claim: { content: 'x' } } };
  const good = vouch(fresh());
  const out = filterFreshVouches([stake, claim, good], ARMED);
  assert.deepEqual(out, [stake, claim, good]);
  assert.equal(out[0], stake, 'non-VOUCH object identity preserved');
});

// ---- item 7: {now, ttlMs} are DEPLOY constants -- NEVER sourced off a record (F1/architect) ----
test('ARMED: a hostile payload.freshness.ttlMs / now is IGNORED (the window uses the DEPLOY {now,ttlMs})', () => {
  // a stale VOUCH that plants ttlMs=Infinity + a far-future now ON its own freshness object, trying to neuter
  // the window. The filter reads now/ttlMs ONLY from freshnessOpts, so it STILL drops as stale under the 24h deploy.
  const hostile = vouch({ approved_at: NOW - 10 * DAY, nonce: VALID_NONCE, ttlMs: Infinity, now: NOW + 999 * DAY });
  const good = vouch(fresh());
  const out = filterFreshVouches([hostile, good], ARMED);
  assert.deepEqual(out, [good], 'the record-carried ttlMs/now is inert; the deploy constant governs -> hostile DROPS');
});

// ---- item 8: TOTAL / never-throws (F1 -- the try/catch guard) ----
test('TOTAL: a throwing getter on rec.* is a DROP (try/catch), never a throw; a mixed batch keeps the good one', () => {
  const good = vouch(fresh());
  // a getter that throws on payload.freshness / .approved_at / .nonce (and on rec.type) must not escape.
  const hostileFreshness = (() => { const r = vouch(fresh()); Object.defineProperty(r.payload, 'freshness', { get() { throw new Error('boom-fr'); } }); return r; })();
  const hostileType = (() => { const r = vouch(fresh()); Object.defineProperty(r, 'type', { get() { throw new Error('boom-type'); } }); return r; })();
  assert.doesNotThrow(() => filterFreshVouches([hostileFreshness], ARMED));
  assert.deepEqual(filterFreshVouches([hostileFreshness], ARMED), [], 'a throwing-getter record DROPS to []');
  assert.deepEqual(filterFreshVouches([hostileType, good], ARMED), [good], 'the throw of one record never drops the batch');
  // approved_at / nonce getters that throw AFTER the freshness object is reached
  const frWithThrowingAt = { get approved_at() { throw new Error('boom-at'); }, nonce: VALID_NONCE };
  const frWithThrowingNonce = { approved_at: NOW - 1000, get nonce() { throw new Error('boom-nonce'); } };
  assert.deepEqual(filterFreshVouches([vouch(frWithThrowingAt), good], ARMED), [good]);
  assert.deepEqual(filterFreshVouches([vouch(frWithThrowingNonce), good], ARMED), [good]);
});

// ---- item 9: immutability -- recs not mutated; armed returns a NEW array ----
test('immutability: the armed path returns a NEW array; recs is never mutated', () => {
  const recs = [vouch(fresh()), vouch(undefined), vouch({ approved_at: NOW - 10 * DAY, nonce: VALID_NONCE })];
  const snapshot = recs.slice();
  const out = filterFreshVouches(recs, ARMED);
  assert.notEqual(out, recs, 'armed returns a new array, not the input ref');
  assert.deepEqual(recs, snapshot, 'the input array is not mutated');
  assert.equal(recs.length, 3, 'no in-place splice of the input');
});

// ---- item 9d: TOTAL -- armed with a non-array recs returns [] without throwing (CodeRabbit nitpick) ----
test('TOTAL: armed with a non-array recs returns [] (no `for...of` throw outside the per-record try/catch)', () => {
  for (const bad of [null, undefined, 42, 'abc', {}, { length: 2 }]) {
    assert.doesNotThrow(() => filterFreshVouches(bad, ARMED));
    assert.deepEqual(filterFreshVouches(bad, ARMED), [], 'armed + non-array -> [] (fail-closed): ' + JSON.stringify(bad));
  }
  assert.equal(filterFreshVouches(null, undefined), null, 'DISARMED keeps identity even for a non-array (byte-identical contract)');
});

// ---- item 10: ARMED drops a null/undefined array element (VALIDATE code-reviewer MEDIUM) ----
test('ARMED: a null/undefined array element is DROPPED (not forwarded to buildVouchGraph, which throws on null.type)', () => {
  const good = vouch(fresh());
  const out = filterFreshVouches([null, undefined, good], ARMED);
  assert.deepEqual(out, [good], 'null/undefined elements DROP; only the fresh VOUCH survives');
  assert.doesNotThrow(() => buildVouchGraph(out), 'the kept set is null-free -> safe for buildVouchGraph (no DoS)');
});

// ---- item 11: monotonicity PROPERTY -- committed, seeded, non-vacuous (honesty-auditor nit b) ----
test('monotonicity PROPERTY: dpArmed <= dpDisarmed over seeded random graphs (arming never manufactures a path)', () => {
  // a tiny deterministic LCG (committed, reproducible -- no Math.random) builds random vouch graphs of synthetic
  // records (fresh / stale / bare) and checks that freshness-filtering can only HOLD-or-LOWER the max-flow count.
  // Backs plans/36 §2c "assert dpArmed <= dpDisarmed as a filter property" with COMMITTED coverage (not only the
  // VERIFY/VALIDATE /tmp probes). Silence the DROP alerts during the fuzz (restored in finally).
  let s = 0x9e3779b1 >>> 0;
  const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  let strictlyNarrowed = 0;
  const TRIALS = 150;
  try {
    for (let t = 0; t < TRIALS; t++) {
      const N = 3 + rnd(4);          // 3..6 nodes
      const ids = Array.from({ length: N }, (_, i) => 'did:key:z' + i);
      const recs = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (i === j || rnd(2) === 0) continue;
        const kind = rnd(3);         // 0 fresh / 1 stale / 2 bare
        const freshness = kind === 0 ? fresh() : kind === 1 ? { approved_at: NOW - 10 * DAY, nonce: VALID_NONCE } : undefined;
        recs.push({ type: 'VOUCH', src_persona_did: ids[i], record_id: 'r' + t + '_' + i + '_' + j,
          payload: { target_persona: ids[j], ...(freshness !== undefined ? { freshness } : {}) } });
      }
      const src = ids[0]; const sink = ids[N - 1];
      const dpDisarmed = maxVertexDisjointPaths(buildVouchGraph(filterFreshVouches(recs, undefined)), src, sink);
      const dpArmed = maxVertexDisjointPaths(buildVouchGraph(filterFreshVouches(recs, ARMED)), src, sink);
      assert.ok(dpArmed <= dpDisarmed, 'trial ' + t + ': arming RAISED the count (' + dpArmed + ' > ' + dpDisarmed + ') -- impossible');
      if (dpArmed < dpDisarmed) strictlyNarrowed++;
    }
  } finally {
    process.stderr.write = origWrite;
  }
  assert.ok(strictlyNarrowed > 0, 'NON-VACUITY: at least one trial must strictly narrow (else the property is trivially true); got ' + strictlyNarrowed);
});

console.log(`\n[vouch-freshness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
