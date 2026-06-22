#!/usr/bin/env node
'use strict';

// PACT v0 — record.js unit tests (Stage A gate).
// Contract: content-address round-trip; record_id excludes {record_id, sig}; INV-22
// idempotency key is LIVE (deriveIdempotencyKey !== null for a complete record) and
// content-addressed (null when identity fields are absent); lenient validation.

const assert = require('node:assert/strict');
const R = require('../../src/lib/record');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

function buildBody(overrides = {}) {
  return {
    ver: 'pact/0', type: 'CLAIM',
    src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:alice',
    seq: 0, nonce: 'n1', payload: { content: 'the sky is blue', premises: [] },
    ...overrides,
  };
}
function buildRecord(overrides = {}) {
  const body = buildBody(overrides);
  return { ...body, record_id: R.computeRecordId(body) };
}

test('computeRecordId is a 64-hex content address', () => {
  const id = R.computeRecordId(buildBody());
  assert.match(id, /^[a-f0-9]{64}$/);
});

test('computeRecordId is deterministic + content-addressed (same body -> same id)', () => {
  assert.equal(R.computeRecordId(buildBody()), R.computeRecordId(buildBody()));
});

test('computeRecordId changes when content changes', () => {
  assert.notEqual(R.computeRecordId(buildBody()), R.computeRecordId(buildBody({ nonce: 'n2' })));
});

test('computeRecordId EXCLUDES record_id and sig (id stable across signing)', () => {
  const rec = buildRecord();
  const signed = { ...rec, sig: 'AAAA', record_id: rec.record_id };
  // recomputing over the signed record (minus record_id+sig) yields the same id
  assert.equal(R.computeRecordId(signed), rec.record_id);
});

test('INV-22: deriveIdempotencyKey is LIVE (non-null) for a complete record', () => {
  const key = R.deriveIdempotencyKey(buildBody());
  assert.ok(key !== null, 'expected a non-null idempotency key (dedup would be DARK if null)');
  assert.match(key, /^[a-f0-9]{64}$/);
});

test('deriveIdempotencyKey is null when an identity field is absent', () => {
  for (const missing of ['src_persona_did', 'type', 'nonce', 'parent_human_uid']) {
    const body = buildBody(); delete body[missing];
    assert.equal(R.deriveIdempotencyKey(body), null, 'missing ' + missing + ' must yield null');
  }
});

test('deriveIdempotencyKey treats seq=0 as PRESENT (0 is a valid sequence)', () => {
  assert.ok(R.deriveIdempotencyKey(buildBody({ seq: 0 })) !== null);
});

test('idempotency key is content-addressed (changes with payload)', () => {
  assert.notEqual(
    R.deriveIdempotencyKey(buildBody()),
    R.deriveIdempotencyKey(buildBody({ payload: { content: 'different' } })),
  );
});

test('validateRecord accepts a complete record', () => {
  const v = R.validateRecord(buildRecord());
  assert.ok(v.valid, JSON.stringify(v.errors));
});

test('validateRecord rejects a missing required field', () => {
  const rec = buildRecord(); delete rec.src_persona_did;
  assert.equal(R.validateRecord(rec).valid, false);
});

test('validateRecord is LENIENT (accepts a forward-compat extra field)', () => {
  const v = R.validateRecord(buildRecord({ future_field: 'ok' }));
  assert.ok(v.valid, 'lenient validator must accept unknown fields (INV-K2-style)');
});

test('validateRecord rejects a non-hex record_id', () => {
  const rec = buildRecord();
  assert.equal(R.validateRecord({ ...rec, record_id: 'nothex' }).valid, false);
});

test('validateRecord rejects a required field set to undefined (not just absent)', () => {
  const rec = buildRecord();
  assert.equal(R.validateRecord({ ...rec, src_persona_did: undefined }).valid, false);
});

// ===== CONTEST discriminant: the one two-way seam in the lib->atms->trust->grounding DAG (plans/08 #1) =====
// A record carrying BOTH payload.target_claim_id (read by trust/direct) AND payload.target_premise_id (read
// by grounding/creator-standing) would feed both layers at once. The guard is TYPE-BLIND (the store is not
// a sandbox — a forged type must not bypass it) and keyed on the payload fields.

test('validateRecord REJECTS both payload.target_claim_id + payload.target_premise_id (cross-layer seam)', () => {
  const rec = buildRecord({ type: 'CONTEST', payload: { target_claim_id: 'a'.repeat(64), target_premise_id: 'b'.repeat(64) } });
  assert.equal(R.validateRecord(rec).valid, false, 'a both-target_* record must be rejected');
});

test('validateRecord both-target_* rejection is TYPE-BLIND (a forged CLAIM with both also fails)', () => {
  const rec = buildRecord({ type: 'CLAIM', payload: { content: 'x', target_claim_id: 'a'.repeat(64), target_premise_id: 'b'.repeat(64) } });
  assert.equal(R.validateRecord(rec).valid, false, 'store is not a sandbox — a forged type must not bypass the guard');
});

test('validateRecord ACCEPTS legit single-target records (no false positive)', () => {
  assert.ok(R.validateRecord(buildRecord({ type: 'CONTEST', payload: { target_claim_id: 'a'.repeat(64) } })).valid, 'claim-contest');
  assert.ok(R.validateRecord(buildRecord({ type: 'CONFIRM', payload: { target_premise_id: 'b'.repeat(64) } })).valid, 'premise-confirm');
  assert.ok(R.validateRecord(buildRecord({ type: 'CLAIM', payload: { content: 'x' } })).valid, 'neither field');
});

console.log(`\n[record] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
