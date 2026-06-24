#!/usr/bin/env node
'use strict';

// PACT v0 — frame.test.js  (plans/15 §2.4 / §4 — the §7 audit wiring: verify-when-present + the audited:false
// observable downgrade + a present-but-invalid proof drops. Also backfills the core receiveFrame contract,
// which had no direct test before this wave.)

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildFrame, receiveFrame } = require('../../src/frame/frame');
const A = require('../../src/audit/audit-log');
const REG = require('../../src/identity/registry');
const E = require('../../src/lib/edge-attestation');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
function freshState() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pact-v0-frame-')); }

const ALICE = 'did:key:zAlice';
const HUMAN = 'human:alice';
const BOB = 'did:key:zBob'; // the receiver (per-receiver audit log)
const kp = E.generateEdgeKeypair();
const signerOpts = { privateKeyPem: kp.privateKeyPem };
function registry() {
  const reg = REG.createRegistry();
  REG.registerPersona(reg, { personaDid: ALICE, humanUid: HUMAN, publicKeyPem: kp.publicKeyPem });
  return reg;
}
function spec(overrides = {}) {
  return { srcPersonaDid: ALICE, parentHumanUid: HUMAN, seq: 0, nonce: 'n0', payload: { content: 'hi' }, ...overrides };
}

// ===================== core contract (backfill) =====================
test('buildFrame + receiveFrame round-trip: accepted, audited:false (no proof attached)', () => {
  const reg = registry();
  const { ok, frame } = buildFrame(spec(), signerOpts);
  assert.ok(ok);
  const res = receiveFrame(frame, { registry: reg });
  assert.ok(res.ok, res.reason);
  assert.equal(res.audited, false);
});
test('receiveFrame RED: tampered payload (record-id-mismatch)', () => {
  const reg = registry();
  const { frame } = buildFrame(spec(), signerOpts);
  const tampered = { ...frame, payload: { content: 'evil' } };
  assert.equal(receiveFrame(tampered, { registry: reg }).ok, false);
});
test('receiveFrame RED: unknown sender / unknown root', () => {
  const { frame } = buildFrame(spec(), signerOpts);
  assert.equal(receiveFrame(frame, { registry: REG.createRegistry() }).ok, false); // empty registry
});

// ===================== §7 audit wiring =====================
function attachValidProof(stateDir) {
  const reg = registry();
  const { frame } = buildFrame(spec({ nonce: 'audited' }), signerOpts);
  A.appendLeaf(frame, { receiverId: BOB, stateDir });
  const sth = A.currentSTH(signerOpts, { receiverId: BOB, stateDir }).sth;
  const inc = A.proveInclusion(0, { receiverId: BOB, stateDir });
  const wire = { ...frame, inclusion_proof: inc.proof, leaf_index: inc.leaf_index, sth };
  return { reg, frame, wire, sth, inc };
}
test('audit GREEN: a valid inclusion_proof + STH => accepted, audited:true', () => {
  const stateDir = freshState();
  const { reg, wire } = attachValidProof(stateDir);
  const res = receiveFrame(wire, { registry: reg });
  assert.ok(res.ok, res.reason);
  assert.equal(res.audited, true);
});
test('audit: the attached fields stay OUT of the content-address (record_id still verifies)', () => {
  const stateDir = freshState();
  const { reg, frame, wire } = attachValidProof(stateDir);
  // the wire frame carries inclusion_proof/leaf_index/sth yet still passes the content-integrity check
  assert.equal(receiveFrame(wire, { registry: reg }).ok, true);
  // and the returned verified frame is the signed body (no transport fields)
  const res = receiveFrame(wire, { registry: reg });
  assert.equal(res.frame.record_id, frame.record_id);
  assert.equal(res.frame.inclusion_proof, undefined);
  assert.equal(res.frame.sth, undefined);
});
test('audit RED: a present-but-invalid inclusion_proof DROPS (bad-inclusion-proof)', () => {
  const stateDir = freshState();
  const { reg, wire } = attachValidProof(stateDir);
  const bad = { ...wire, inclusion_proof: ['a'.repeat(64)] }; // a wrong-but-shaped proof node
  const res = receiveFrame(bad, { registry: reg });
  assert.equal(res.ok, false);
  assert.match(res.reason, /bad-inclusion-proof/);
});
test('audit RED: a tampered STH root DROPS (bad-sth)', () => {
  const stateDir = freshState();
  const { reg, wire, sth } = attachValidProof(stateDir);
  const bad = { ...wire, sth: { ...sth, root: 'b'.repeat(64) } };
  const res = receiveFrame(bad, { registry: reg });
  assert.equal(res.ok, false);
  assert.match(res.reason, /bad-sth/);
});
test('audit RED: a malformed attachment (STH without an inclusion_proof) is rejected', () => {
  const stateDir = freshState();
  const { reg, frame, sth } = attachValidProof(stateDir);
  const bad = { ...frame, sth }; // sth present, inclusion_proof + leaf_index absent
  const res = receiveFrame(bad, { registry: reg });
  assert.equal(res.ok, false);
  assert.match(res.reason, /malformed-audit-attachment/);
});
test('audit RED: a wrong leaf_index for a real proof DROPS', () => {
  const stateDir = freshState();
  const { reg, wire } = attachValidProof(stateDir);
  const bad = { ...wire, leaf_index: 5 }; // out of range for a 1-leaf tree
  assert.equal(receiveFrame(bad, { registry: reg }).ok, false);
});

console.log(`\n[frame] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
