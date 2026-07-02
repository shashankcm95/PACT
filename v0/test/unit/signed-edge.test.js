#!/usr/bin/env node
'use strict';

// PACT v0 -- identity/signed-edge.test.js  (plans/35 W1 -- the signed-edge producer)
//
// The RED-first spec for the pure, key-free VOUCH producer (Option A: freshness IN payload.freshness). Tests are
// written to the plans/35 design + the §8 VERIFY-board folds:
//   - spec shape: freshness nested under payload.freshness (the frame sig then binds it via record_id).
//   - full type-gate (mirror stake.js/W0): [] / {} / undefined / wrong-type for each field -> TypeError.
//   - DRY: freshnessNonce rejects EXACTLY what W0's isValidNonce rejects (no re-implemented floor, no drift).
//   - key-free: the producer holds no signer/key; a stray one in opts never lands in the spec.

const assert = require('node:assert/strict');
const { buildSignedVouchSpec, VOUCH_TYPE } = require('../../src/identity/signed-edge');
const { isValidNonce, MIN_NONCE_LEN } = require('../../src/lib/edge-freshness');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const TARGET = 'did:key:zTarget';
const APPROVED = 1_700_000_000_000;
const FNONCE = 'fresh-nonce-01';   // whitespace-clean, >= MIN_NONCE_LEN
const KEYID = 'broker-key-1';
const SEQ = 3;
const NONCE = 'frame-nonce-01';

function good(over = {}) {
  return { targetPersona: TARGET, approvedAt: APPROVED, freshnessNonce: FNONCE, keyId: KEYID, seq: SEQ, nonce: NONCE, ...over };
}

test('spec shape: freshness nested under payload.freshness; frame seq/nonce pass through', () => {
  assert.deepEqual(buildSignedVouchSpec(good()), {
    type: 'VOUCH',
    payload: { target_persona: TARGET, freshness: { approved_at: APPROVED, nonce: FNONCE, key_id: KEYID } },
    seq: SEQ,
    nonce: NONCE,
  });
});

test('VOUCH_TYPE is exported', () => { assert.equal(VOUCH_TYPE, 'VOUCH'); });

test('immutable: a fresh object per call; the input opts is NOT mutated', () => {
  const input = good();
  const snapshot = { ...input };
  const a = buildSignedVouchSpec(input);
  const b = buildSignedVouchSpec(good());
  assert.deepEqual(input, snapshot, 'the producer must not mutate its input opts');
  assert.notEqual(a, b);
  assert.notEqual(a.payload, b.payload);
  assert.notEqual(a.payload.freshness, b.payload.freshness);
});

test('full type-gate: each malformed field THROWS ([] / {} / undefined / wrong-type)', () => {
  for (const bad of ['', [], {}, undefined, 5]) assert.throws(() => buildSignedVouchSpec(good({ targetPersona: bad })), TypeError);
  for (const bad of [NaN, Infinity, '123', [], {}, undefined]) assert.throws(() => buildSignedVouchSpec(good({ approvedAt: bad })), TypeError);
  for (const bad of ['', '   ', 'short', [], {}, undefined]) assert.throws(() => buildSignedVouchSpec(good({ freshnessNonce: bad })), TypeError);
  for (const bad of ['', [], {}, undefined, 5]) assert.throws(() => buildSignedVouchSpec(good({ keyId: bad })), TypeError);
  assert.throws(() => buildSignedVouchSpec(undefined), TypeError);
});

test('CodeRabbit: a whitespace-only targetPersona / keyId is REJECTED (trim-clean, consistent with the nonce)', () => {
  assert.throws(() => buildSignedVouchSpec(good({ targetPersona: '   ' })), TypeError);
  assert.throws(() => buildSignedVouchSpec(good({ keyId: '  \t ' })), TypeError);
});

test('DRY nonce floor: freshnessNonce rejects EXACTLY what isValidNonce rejects (no drift)', () => {
  for (const n of ['', '   ', 'x', 'n'.repeat(MIN_NONCE_LEN - 1), '  padded-nonce  ']) {
    assert.equal(isValidNonce(n), false, 'precondition: isValidNonce rejects ' + JSON.stringify(n));
    assert.throws(() => buildSignedVouchSpec(good({ freshnessNonce: n })), TypeError);
  }
  assert.equal(isValidNonce(FNONCE), true);
  assert.doesNotThrow(() => buildSignedVouchSpec(good()));
});

test('key-free: a stray signer / privateKeyPem in opts NEVER lands in the spec', () => {
  const spec = buildSignedVouchSpec(good({ signer: () => 'x', privateKeyPem: 'SECRET-PEM' }));
  assert.equal('signer' in spec, false);
  assert.equal('privateKeyPem' in spec, false);
  assert.equal(/signer|privateKeyPem|SECRET-PEM/.test(JSON.stringify(spec)), false);
});

console.log(`\n[signed-edge] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
