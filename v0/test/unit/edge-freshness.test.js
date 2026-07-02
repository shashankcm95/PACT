#!/usr/bin/env node
'use strict';

// PACT v0 -- lib/edge-freshness.test.js  (plans/34 W0 -- the freshness-bound edge primitive)
//
// The RED-first spec for the approvalSigBasis-equivalent freshness leaf. Tests are written to the plans/34 §7
// VERIFY-board folds (the failing set IS the behavioral contract):
//   - C1 (hacker CRITICAL): verifyFreshEdge SNAPSHOTS each field ONCE -- a read-twice getter differential
//     (window-fresh / basis-stale) MUST NOT verify a stale edge as fresh; the getter fires EXACTLY ONCE.
//   - H1 (hacker): a non-finite/non-positive ttlMs fails CLOSED (Infinity must NOT widen the window).
//   - H2 (hacker, NS-9): the same signed edge replays within TTL -- documented residual, not a bug.
//   - M1 (hacker): the nonce predicate is UNIFIED across basis + window (trim + MIN_NONCE_LEN) -- a signable
//     nonce is always verifiable (no self-DoS).
//   - M-2 (architect): checkFreshnessWindow reason ORDER is pinned (bad-ttl -> no-clock -> no-approvedAt ->
//     no-nonce -> stale-or-future).
//   - full type-gate (sigma_root M1): [] / {} / undefined for a field MUST throw, never pass a bare !v.

const assert = require('node:assert/strict');
const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const {
  computeEdgeFreshnessBasis,
  checkFreshnessWindow,
  verifyFreshEdge,
  EDGE_FRESHNESS_TYPE,
  DEFAULT_TTL_MS,
  MIN_NONCE_LEN,
} = require('../../src/lib/edge-freshness');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// --- fixtures ---
const REC = 'a'.repeat(64);          // a valid 64-hex record_id
const REC2 = 'b'.repeat(64);
const NONCE = 'nonce-0001';          // >= MIN_NONCE_LEN non-space chars
const KEYID = 'broker-key-1';
const NOW = 1_700_000_000_000;
const FRESH = NOW - 1000;            // 1s ago -> fresh under any sane TTL
const STALE = NOW - (10 * DEFAULT_TTL_MS); // 10 TTL ago -> stale
const kp = generateEdgeKeypair();

function goodFields(over = {}) {
  return { recordId: REC, approvedAt: FRESH, nonce: NONCE, keyId: KEYID, ...over };
}

// ============================ 1. basis binds WHAT+WHEN+nonce+keyId ============================

test('basis: deterministic for identical inputs', () => {
  assert.equal(computeEdgeFreshnessBasis(goodFields()), computeEdgeFreshnessBasis(goodFields()));
});
test('basis: changing recordId changes the basis', () => {
  assert.notEqual(computeEdgeFreshnessBasis(goodFields()), computeEdgeFreshnessBasis(goodFields({ recordId: REC2 })));
});
test('basis: changing approvedAt changes the basis (WHEN is bound)', () => {
  assert.notEqual(computeEdgeFreshnessBasis(goodFields()), computeEdgeFreshnessBasis(goodFields({ approvedAt: FRESH - 1 })));
});
test('basis: changing nonce changes the basis (one-shot is bound)', () => {
  assert.notEqual(computeEdgeFreshnessBasis(goodFields()), computeEdgeFreshnessBasis(goodFields({ nonce: 'nonce-0002' })));
});
test('basis: changing keyId changes the basis', () => {
  assert.notEqual(computeEdgeFreshnessBasis(goodFields()), computeEdgeFreshnessBasis(goodFields({ keyId: 'broker-key-2' })));
});
test('basis: returns a 64-hex', () => {
  assert.match(computeEdgeFreshnessBasis(goodFields()), /^[0-9a-f]{64}$/);
});

// ============================ 2. injective / domain-separated ============================

test('basis: is domain-separated by the _type tag (not a bare record hash)', () => {
  // A caller cannot reproduce the basis by hashing the same field object WITHOUT the _type tag: the tag is in the
  // preimage, so the honest freshness-basis preimage space is disjoint from a tagless {record_id,...} hash.
  const { sha256hex, canonicalJsonSerialize } = require('../../src/lib/record');
  const tagless = sha256hex(canonicalJsonSerialize({ approved_at: FRESH, key_id: KEYID, nonce: NONCE, record_id: REC }));
  assert.notEqual(computeEdgeFreshnessBasis(goodFields()), tagless, 'the _type tag must be load-bearing in the preimage');
  assert.equal(typeof EDGE_FRESHNESS_TYPE, 'string');
  assert.ok(/\.v1$/.test(EDGE_FRESHNESS_TYPE), 'the type tag is versioned (.v1)');
});

// ============================ 3. full type-gate (M1 non-vacuity: [] / {} must throw) ============================

test('basis: full type-gate -- each malformed field THROWS (bare !v would pass [] / {})', () => {
  // full matrix (CodeRabbit): [] / {} / undefined for every field, plus the field-specific bad shapes.
  for (const bad of ['not-hex', [], {}, undefined]) {
    assert.throws(() => computeEdgeFreshnessBasis(goodFields({ recordId: bad })), TypeError);
  }
  for (const bad of [NaN, Infinity, '123', [], {}, undefined]) {
    assert.throws(() => computeEdgeFreshnessBasis(goodFields({ approvedAt: bad })), TypeError);
  }
  for (const bad of ['', [], {}, undefined]) {
    assert.throws(() => computeEdgeFreshnessBasis(goodFields({ nonce: bad })), TypeError);
  }
  for (const bad of ['', [], {}, undefined]) {
    assert.throws(() => computeEdgeFreshnessBasis(goodFields({ keyId: bad })), TypeError);
  }
  assert.throws(() => computeEdgeFreshnessBasis(undefined), TypeError);
});

// ============================ 3b. M1 -- nonce gate unified across basis + window ============================

test('M1: a whitespace-only nonce THROWS in the basis (matching the window, no self-DoS)', () => {
  assert.throws(() => computeEdgeFreshnessBasis(goodFields({ nonce: '   ' })), TypeError);
  // and the window rejects the same whitespace nonce -> a producer can never mint a window-rejected edge
  assert.equal(checkFreshnessWindow({ approvedAt: FRESH, nonce: '   ', now: NOW }).reason, 'no-nonce');
});
test('M1: a sub-MIN_NONCE_LEN nonce is rejected in BOTH basis and window', () => {
  const short = 'n'.repeat(MIN_NONCE_LEN - 1);
  assert.throws(() => computeEdgeFreshnessBasis(goodFields({ nonce: short })), TypeError);
  assert.equal(checkFreshnessWindow({ approvedAt: FRESH, nonce: short, now: NOW }).reason, 'no-nonce');
});
test('code-reviewer LOW: a surrounding-whitespace nonce is rejected in BOTH (gate-value == hash-value)', () => {
  // `'  nonce-0001  '` trims to a >= MIN_NONCE_LEN token but the basis would hash the RAW padded string; rejecting
  // surrounding whitespace makes the gated value equal the hashed value -- no padded-nonce normalization surprise.
  const padded = '  nonce-0001  ';
  assert.throws(() => computeEdgeFreshnessBasis(goodFields({ nonce: padded })), TypeError);
  assert.equal(checkFreshnessWindow({ approvedAt: FRESH, nonce: padded, now: NOW }).reason, 'no-nonce');
});

// ============================ 4. checkFreshnessWindow (replay-rejection + pinned order) ============================

test('window: a fresh edge PASSES', () => {
  assert.deepEqual(checkFreshnessWindow({ approvedAt: FRESH, nonce: NONCE, now: NOW }), { fresh: true, reason: null });
});
test('window: stale (now - approvedAt > ttlMs) -> stale-or-future', () => {
  assert.equal(checkFreshnessWindow({ approvedAt: STALE, nonce: NONCE, now: NOW }).reason, 'stale-or-future');
});
test('window: future-dated approvedAt (now < approvedAt) -> stale-or-future', () => {
  assert.equal(checkFreshnessWindow({ approvedAt: NOW + 5000, nonce: NONCE, now: NOW }).reason, 'stale-or-future');
});
test('window: TTL boundary -- exactly at ttlMs is FRESH, one past is stale', () => {
  const at = NOW - DEFAULT_TTL_MS;      // now - approvedAt == ttlMs -> NOT > ttlMs -> fresh
  assert.equal(checkFreshnessWindow({ approvedAt: at, nonce: NONCE, now: NOW }).fresh, true);
  assert.equal(checkFreshnessWindow({ approvedAt: at - 1, nonce: NONCE, now: NOW }).reason, 'stale-or-future');
});
test('window H1: a non-finite ttlMs fails CLOSED (Infinity must NOT widen the window)', () => {
  assert.equal(checkFreshnessWindow({ approvedAt: STALE, nonce: NONCE, now: NOW, ttlMs: Infinity }).reason, 'bad-ttl');
  assert.equal(checkFreshnessWindow({ approvedAt: STALE, nonce: NONCE, now: NOW, ttlMs: NaN }).reason, 'bad-ttl');
  assert.equal(checkFreshnessWindow({ approvedAt: FRESH, nonce: NONCE, now: NOW, ttlMs: 0 }).reason, 'bad-ttl');
  assert.equal(checkFreshnessWindow({ approvedAt: FRESH, nonce: NONCE, now: NOW, ttlMs: -1 }).reason, 'bad-ttl');
});
test('window: no-clock / no-approvedAt', () => {
  assert.equal(checkFreshnessWindow({ approvedAt: FRESH, nonce: NONCE, now: NaN }).reason, 'no-clock');
  assert.equal(checkFreshnessWindow({ approvedAt: NaN, nonce: NONCE, now: NOW }).reason, 'no-approvedAt');
});
test('window M-2: reason order pinned -- bad-ttl before no-clock before no-approvedAt before no-nonce', () => {
  // two simultaneous defects (bad-ttl AND non-finite now) -> the FIRST (bad-ttl) wins
  assert.equal(checkFreshnessWindow({ approvedAt: NaN, nonce: '', now: NaN, ttlMs: Infinity }).reason, 'bad-ttl');
  // non-finite now AND empty nonce (valid ttl) -> no-clock wins over no-nonce
  assert.equal(checkFreshnessWindow({ approvedAt: NaN, nonce: '', now: NaN }).reason, 'no-clock');
  // valid now, bad approvedAt AND empty nonce -> no-approvedAt wins over no-nonce
  assert.equal(checkFreshnessWindow({ approvedAt: NaN, nonce: '', now: NOW }).reason, 'no-approvedAt');
  // valid clock/approvedAt, empty nonce AND stale timestamp -> no-nonce wins over stale-or-future (CodeRabbit)
  assert.equal(checkFreshnessWindow({ approvedAt: STALE, nonce: '', now: NOW }).reason, 'no-nonce');
});
test('window: never throws on hostile input', () => {
  assert.doesNotThrow(() => checkFreshnessWindow(undefined));
  assert.doesNotThrow(() => checkFreshnessWindow(null));
  assert.doesNotThrow(() => checkFreshnessWindow({}));
});

// ============================ 5. verifyFreshEdge round-trip ============================

function signedFresh(over = {}) {
  const fields = goodFields(over);
  const basis = computeEdgeFreshnessBasis(fields);
  const sig = signRecordId(basis, { privateKeyPem: kp.privateKeyPem });
  return { fields, sig };
}

test('verify: a validly-signed fresh edge -> {ok:true}', () => {
  const { fields, sig } = signedFresh();
  assert.deepEqual(verifyFreshEdge({ fields, sig, publicKeyPem: kp.publicKeyPem, now: NOW }), { ok: true, reason: null });
});
test('verify: bumping approvedAt AFTER signing -> sig-invalid (the replay defense)', () => {
  const { fields, sig } = signedFresh({ approvedAt: STALE });          // signed while stale
  // attacker re-dates to fresh to beat the TTL; the sig binds the basis, so the edited field flips it
  const forged = { ...fields, approvedAt: FRESH };
  assert.equal(verifyFreshEdge({ fields: forged, sig, publicKeyPem: kp.publicKeyPem, now: NOW }).reason, 'sig-invalid');
});
test('verify: swapping the nonce AFTER signing -> sig-invalid', () => {
  const { fields, sig } = signedFresh();
  const forged = { ...fields, nonce: 'nonce-swap' };
  assert.equal(verifyFreshEdge({ fields: forged, sig, publicKeyPem: kp.publicKeyPem, now: NOW }).reason, 'sig-invalid');
});
test('verify: a wrong verify key -> sig-invalid', () => {
  const { fields, sig } = signedFresh();
  const other = generateEdgeKeypair();
  assert.equal(verifyFreshEdge({ fields, sig, publicKeyPem: other.publicKeyPem, now: NOW }).reason, 'sig-invalid');
});
test('verify: a stale-but-validly-signed edge -> stale-or-future (freshness gates BEFORE sig passes)', () => {
  const { fields, sig } = signedFresh({ approvedAt: STALE });
  assert.equal(verifyFreshEdge({ fields, sig, publicKeyPem: kp.publicKeyPem, now: NOW }).reason, 'stale-or-future');
});
test('verify H1: ttlMs:Infinity does NOT let a stale signed edge verify fresh', () => {
  const { fields, sig } = signedFresh({ approvedAt: STALE });
  assert.equal(verifyFreshEdge({ fields, sig, publicKeyPem: kp.publicKeyPem, now: NOW, ttlMs: Infinity }).ok, false);
});

// ============================ 6. C1 -- the read-twice getter differential (the CRITICAL) ============================

test('C1: a getter-approvedAt (window-fresh / basis-stale) does NOT verify a stale edge fresh, and fires ONCE', () => {
  // sign the edge while STALE (the basis is over the stale approvedAt)
  const staleFields = goodFields({ approvedAt: STALE });
  const staleBasis = computeEdgeFreshnessBasis(staleFields);
  const sig = signRecordId(staleBasis, { privateKeyPem: kp.privateKeyPem });
  // present a getter that would return FRESH on read #1 (window) and STALE on read #2 (basis) -- the classic
  // read-twice differential. A snapshot-once verifier reads approvedAt EXACTLY ONCE, so the differential closes.
  let reads = 0;
  const poisoned = {
    recordId: REC,
    get approvedAt() { reads += 1; return reads === 1 ? FRESH : STALE; },
    nonce: NONCE,
    keyId: KEYID,
  };
  const out = verifyFreshEdge({ fields: poisoned, sig, publicKeyPem: kp.publicKeyPem, now: NOW });
  assert.equal(out.ok, false, 'a 10-TTL-stale edge must NOT verify fresh via a read-twice getter');
  assert.equal(reads, 1, 'verifyFreshEdge must read fields.approvedAt EXACTLY ONCE (snapshot-once)');
});
test('C1: EVERY field (recordId/approvedAt/nonce/keyId) is read EXACTLY ONCE on the success path', () => {
  // the code-reviewer noted the read-count assertion only instrumented approvedAt; the hacker verified all four
  // live. Lock it: a valid signed edge presented via counting getters verifies {ok:true} with each getter firing once.
  const { fields } = signedFresh();
  const counts = { recordId: 0, approvedAt: 0, nonce: 0, keyId: 0 };
  const basis = computeEdgeFreshnessBasis(fields);
  const sig = signRecordId(basis, { privateKeyPem: kp.privateKeyPem });
  const spied = {};
  for (const f of ['recordId', 'approvedAt', 'nonce', 'keyId']) {
    Object.defineProperty(spied, f, { get() { counts[f] += 1; return fields[f]; }, enumerable: true });
  }
  const out = verifyFreshEdge({ fields: spied, sig, publicKeyPem: kp.publicKeyPem, now: NOW });
  assert.equal(out.ok, true, 'a valid edge via counting getters still verifies');
  assert.deepEqual(counts, { recordId: 1, approvedAt: 1, nonce: 1, keyId: 1 }, 'each field snapshotted exactly once');
});
test('C1: a poisoned (throwing) getter on any field -> {ok:false}, never a throw, never {ok:true}', () => {
  // use a VALID sig (CodeRabbit) so the ONLY reason to fail is the poisoned getter -- the field-access path is
  // genuinely exercised, not short-circuited by an invalid sig. A throw during snapshot -> the outer catch fails closed.
  for (const field of ['recordId', 'approvedAt', 'nonce', 'keyId']) {
    const { fields, sig } = signedFresh();
    const poisoned = { ...fields };
    Object.defineProperty(poisoned, field, { get() { throw new Error('poison-' + field); } });
    let out;
    assert.doesNotThrow(() => { out = verifyFreshEdge({ fields: poisoned, sig, publicKeyPem: kp.publicKeyPem, now: NOW }); }, 'field ' + field);
    assert.equal(out.ok, false, 'field ' + field + ' must fail closed');
  }
});
test('C1/H-1: a poisoned getter on the OPTS object (publicKeyPem/now) -> {ok:false}, never a throw', () => {
  const { fields, sig } = signedFresh();
  const opts = { fields, sig, now: NOW };
  Object.defineProperty(opts, 'publicKeyPem', { get() { throw new Error('poison-key'); } });
  let out;
  assert.doesNotThrow(() => { out = verifyFreshEdge(opts); });
  assert.equal(out.ok, false);
});
test('verify: fail-closed on null/absent args', () => {
  assert.equal(verifyFreshEdge(undefined).ok, false);
  assert.equal(verifyFreshEdge(null).ok, false);
  assert.equal(verifyFreshEdge({}).ok, false);
  const { fields, sig } = signedFresh();
  assert.equal(verifyFreshEdge({ fields, sig, now: NOW }).reason, 'no-verify-key');       // absent publicKeyPem
  assert.equal(verifyFreshEdge({ fields, publicKeyPem: kp.publicKeyPem, now: NOW }).reason, 'no-sig'); // absent sig
});

// ============================ 7. H2 -- the <=TTL replay residual (documented, NS-9) ============================

test('H2 residual: the SAME signed edge verifies {ok:true} TWICE within TTL (replay narrows to <=TTL, not eliminated)', () => {
  const { fields, sig } = signedFresh();
  assert.equal(verifyFreshEdge({ fields, sig, publicKeyPem: kp.publicKeyPem, now: NOW }).ok, true);
  assert.equal(verifyFreshEdge({ fields, sig, publicKeyPem: kp.publicKeyPem, now: NOW + 1000 }).ok, true,
    'W0 has no nonce store; true one-shot enforcement is DEFERRED to the W2 consumer (documented residual)');
});

console.log(`\n[edge-freshness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
