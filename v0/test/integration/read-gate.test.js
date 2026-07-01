#!/usr/bin/env node
'use strict';

// PACT v0 — read-gate.js wiring tests (refuse-alert observability on the silent trust-drop path).
// Contract: verifiedRecords BEHAVIOR is unchanged (a valid record passes; an unregistered-sender
// or bad-sig record contributes 0), but the previously-SILENT drops now emit an out-of-band
// operator-side signal classed MISCONFIG (unregistered) vs ATTACK (bad sig). A valid record is
// SILENT (no false alert).

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { signRecordId } = require('../../src/lib/edge-attestation');
const { computeRecordId } = require('../../src/lib/record');
const { appendRecord } = require('../../src/lib/record-store');
const { verifiedRecords } = require('../../src/trust/read-gate');
const { createRegistry, registerPersona } = require('../../src/identity/registry');

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-v0-readgate-'));
const alice = newPersonaKeypair();
const bob = newPersonaKeypair();
const registry = createRegistry();
registerPersona(registry, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: alice.publicKeyPem });
registerPersona(registry, { personaDid: 'did:key:zBob', humanUid: 'human:bob', publicKeyPem: bob.publicKeyPem });

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
function captureStderr(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return lines.join('');
}
function alertsIn(out) {
  return out.split('\n').filter((l) => l.includes('[PACT-REFUSE-ALERT]'))
    .map((l) => JSON.parse(l.slice(l.indexOf('{'))));
}
// build a { ...body, record_id, sig } signed by `signerPriv` (default: the true sender's key).
function signedRecord({ senderDid, senderPriv, nonce }) {
  const body = {
    ver: 'pact/0', type: 'CLAIM', src_persona_did: senderDid, parent_human_uid: 'human:x',
    seq: 0, nonce, payload: { content: 'c-' + nonce },
  };
  const record_id = computeRecordId(body);
  const sig = signRecordId(record_id, { privateKeyPem: senderPriv });
  return { ...body, record_id, sig };
}

test('a valid signed record passes AND is SILENT (no false alert)', () => {
  const RX = 'did:key:zRecv-ok';
  const rec = signedRecord({ senderDid: 'did:key:zAlice', senderPriv: alice.privateKeyPem, nonce: 'ok1' });
  assert.ok(appendRecord(rec, { receiverId: RX, stateDir: STATE }).ok);
  let got;
  const out = captureStderr(() => { got = verifiedRecords(registry, { receiverId: RX, stateDir: STATE }); });
  assert.equal(got.length, 1, 'the valid record is weighted');
  assert.equal(got[0].record_id, rec.record_id);
  assert.equal(out, '', 'a passing record must NOT emit a reject alert');
});

test('an UNREGISTERED sender is dropped (unchanged) + emits a MISCONFIG alert', () => {
  const RX = 'did:key:zRecv-unreg';
  // Carol is not in the registry; sign with her own fresh key so only the registration gate fires.
  const carol = newPersonaKeypair();
  const rec = signedRecord({ senderDid: 'did:key:zCarol', senderPriv: carol.privateKeyPem, nonce: 'unreg1' });
  assert.ok(appendRecord(rec, { receiverId: RX, stateDir: STATE }).ok);
  let got;
  const out = captureStderr(() => { got = verifiedRecords(registry, { receiverId: RX, stateDir: STATE }); });
  assert.equal(got.length, 0, 'unregistered sender contributes 0 (fail-closed, unchanged)');
  const alerts = alertsIn(out);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].reason, 'unregistered-sender');
  assert.equal(alerts[0].class, 'misconfig');
});

test('a registered sender with a BAD sig is dropped (unchanged) + emits an ATTACK alert', () => {
  const RX = 'did:key:zRecv-badsig';
  // claims to be Bob (registered), but is signed with Alice's key -> verify under Bob's key fails.
  const rec = signedRecord({ senderDid: 'did:key:zBob', senderPriv: alice.privateKeyPem, nonce: 'badsig1' });
  assert.ok(appendRecord(rec, { receiverId: RX, stateDir: STATE }).ok);
  let got;
  const out = captureStderr(() => { got = verifiedRecords(registry, { receiverId: RX, stateDir: STATE }); });
  assert.equal(got.length, 0, 'a bad-sig record contributes 0 (fail-closed, unchanged)');
  const alerts = alertsIn(out);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].reason, 'sig-verify-failed');
  assert.equal(alerts[0].class, 'attack');
  assert.equal(alerts[0].sender, 'did:key:zBob');
});

test('a content-valid but UNSIGNED record is dropped + emits MISCONFIG (not integrity/attack)', () => {
  const RX = 'did:key:zRecv-unsigned';
  // a valid record body with NO sig field — appendRecord accepts it (sig is optional); the trust
  // gate drops it (needs a verifiable sig). It must read as a MISCONFIG (a producer didn't sign),
  // NOT pollute the integrity/tamper stream.
  const body = {
    ver: 'pact/0', type: 'CLAIM', src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:x',
    seq: 0, nonce: 'unsigned1', payload: { content: 'c-unsigned' },
  };
  const rec = { ...body, record_id: computeRecordId(body) }; // no sig
  assert.ok(appendRecord(rec, { receiverId: RX, stateDir: STATE }).ok);
  let got;
  const out = captureStderr(() => { got = verifiedRecords(registry, { receiverId: RX, stateDir: STATE }); });
  assert.equal(got.length, 0, 'an unsigned record contributes 0 (fail-closed, unchanged)');
  const alerts = alertsIn(out);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].reason, 'unsigned-record');
  assert.equal(alerts[0].class, 'misconfig', 'an unsigned record is a producer misconfig, not tamper');
});

// cleanup
try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\n[read-gate] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
