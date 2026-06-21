#!/usr/bin/env node
'use strict';

// PACT v0 — record-store.js unit tests (Stage A gate).
// Contract: append/readById round-trip; content-address integrity on WRITE (forged id
// rejected) and on READ (the #273 three-part gate — array-coercion decoy + field!=content
// planted body both skipped); INV-22 dedup; per-receiver isolation; traversal impossible by
// construction (hashed receiver key); did:web-shaped receiver key works.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../../src/lib/record-store');
const R = require('../../src/lib/record');

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-v0-store-'));
const RX = 'did:key:zReceiver';

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

function buildBody(overrides = {}) {
  return {
    ver: 'pact/0', type: 'CLAIM',
    src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:alice',
    seq: 0, nonce: 'n1', payload: { content: 'the sky is blue' },
    ...overrides,
  };
}
function buildRecord(overrides = {}) {
  const body = buildBody(overrides);
  return { ...body, record_id: R.computeRecordId(body) };
}
function buildWithIdem(overrides = {}) {
  const body = buildBody(overrides);
  const withKey = { ...body, idempotency_key: R.deriveIdempotencyKey(body) };
  return { ...withKey, record_id: R.computeRecordId(withKey) };
}

test('append + readById round-trip', () => {
  const rec = buildRecord();
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.ok(res.ok, res.reason);
  assert.equal(res.record_id, rec.record_id);
  const back = S.readById(rec.record_id, { receiverId: RX, stateDir: STATE });
  assert.ok(back, 'expected the record back');
  assert.equal(back.record_id, rec.record_id);
  assert.equal(back.payload.content, 'the sky is blue');
});

test('S5: a forged record_id is rejected on write (record-id-mismatch)', () => {
  const rec = buildRecord();
  const forged = { ...rec, record_id: 'a'.repeat(64) }; // valid hex shape, wrong content hash
  const res = S.appendRecord(forged, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /record-id-mismatch/);
});

test('invalid record (missing required) is rejected on write', () => {
  const rec = buildRecord(); delete rec.src_persona_did;
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /invalid-record/);
});

test('INV-22 dedup: re-appending the same keyed record is a no-op replay', () => {
  const rec = buildWithIdem({ nonce: 'dedup-1' });
  const r1 = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.ok(r1.ok && !r1.deduped, 'first write is a real write');
  const r2 = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.ok(r2.ok && r2.deduped === true, 'replay must be deduped');
  assert.equal(r2.record_id, r1.record_id);
});

test('idempotency-key-mismatch: a record carrying a wrong key is rejected', () => {
  const body = buildBody({ nonce: 'mismatch-1' });
  const wrongKey = 'b'.repeat(64);
  const withWrong = { ...body, idempotency_key: wrongKey };
  const rec = { ...withWrong, record_id: R.computeRecordId(withWrong) };
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /idempotency-key-mismatch/);
});

test('verify-on-read (a): a planted array-coercion record_id decoy is SKIPPED', () => {
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  const realId = R.computeRecordId(buildBody({ nonce: 'decoy-a' }));
  // body.record_id is an ARRAY [realId] — string-coerces past a naive basename compare,
  // but gate (a) (typeof !== 'string') rejects it before coercion.
  const planted = { ...buildBody({ nonce: 'decoy-a' }), record_id: [realId] };
  fs.writeFileSync(path.join(dir, 'record-' + realId + '.json'), JSON.stringify(planted));
  assert.equal(S.readById(realId, { receiverId: RX, stateDir: STATE }), null);
});

test('verify-on-read (c): a planted field==filename but content!=hash body is SKIPPED', () => {
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  const realId = R.computeRecordId(buildBody({ nonce: 'decoy-c' }));
  // record_id field == filename id (string, hex), but the body content does NOT hash to it
  // (attacker swapped the persona) — gate (c) (field != content) rejects it.
  const planted = { ...buildBody({ nonce: 'decoy-c', src_persona_did: 'did:key:zAttacker' }), record_id: realId };
  fs.writeFileSync(path.join(dir, 'record-' + realId + '.json'), JSON.stringify(planted));
  assert.equal(S.readById(realId, { receiverId: RX, stateDir: STATE }), null);
});

test('per-receiver isolation: receiver B cannot read receiver A record', () => {
  const rec = buildRecord({ nonce: 'iso-1' });
  S.appendRecord(rec, { receiverId: 'did:key:zAlice', stateDir: STATE });
  assert.ok(S.readById(rec.record_id, { receiverId: 'did:key:zAlice', stateDir: STATE }));
  assert.equal(S.readById(rec.record_id, { receiverId: 'did:key:zBob', stateDir: STATE }), null);
});

test('traversal impossible by construction: a ../ receiverId cannot escape stateDir', () => {
  const rec = buildRecord({ nonce: 'trav-1' });
  const res = S.appendRecord(rec, { receiverId: '../../etc/evil', stateDir: STATE });
  assert.ok(res.ok, 'a hostile receiverId is NEUTRALIZED (hashed), not an error: ' + res.reason);
  const real = fs.realpathSync(res.file);
  assert.ok(real.startsWith(fs.realpathSync(STATE)), 'the file must stay within stateDir: ' + real);
});

test('did:web-shaped receiver key (carries /) works', () => {
  const rec = buildRecord({ nonce: 'didweb-1' });
  const RID = 'did:web:example.com:agents:alice';
  const res = S.appendRecord(rec, { receiverId: RID, stateDir: STATE });
  assert.ok(res.ok, res.reason);
  assert.ok(S.readById(rec.record_id, { receiverId: RID, stateDir: STATE }));
});

test('invalid receiver (empty/non-string) is rejected', () => {
  assert.equal(S.appendRecord(buildRecord({ nonce: 'inv-1' }), { receiverId: '', stateDir: STATE }).reason, 'invalid-receiver');
  assert.equal(S.appendRecord(buildRecord({ nonce: 'inv-2' }), { receiverId: null, stateDir: STATE }).reason, 'invalid-receiver');
});

// cleanup
try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\n[record-store] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
