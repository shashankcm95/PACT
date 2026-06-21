#!/usr/bin/env node
'use strict';

// PACT v0 — edge-attestation.js unit tests (Stage A gate).
// Contract: ed25519 sign/verify round-trip; PER-SENDER verify keys (NO shared env default —
// verify with no opts.publicKeyPem is false even with LOOM_EDGE_VERIFY_KEY set); alg-pinning
// (RSA refused); fail-closed; the Option-B signer seam (injected signer works; no key + no
// signer -> null, no silent fall-through to a missing env key).

const assert = require('node:assert/strict');
const crypto = require('crypto');
const EA = require('../../src/lib/edge-attestation');

const ID = 'a'.repeat(64); // a valid 64-hex content-address
const ID2 = 'b'.repeat(64);

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const alice = EA.generateEdgeKeypair();
const bob = EA.generateEdgeKeypair();

test('sign/verify round-trip with a per-sender key', () => {
  const sig = EA.signRecordId(ID, { privateKeyPem: alice.privateKeyPem });
  assert.ok(sig, 'expected a signature');
  assert.equal(EA.verifyRecordSig(ID, sig, { publicKeyPem: alice.publicKeyPem }), true);
});

test("a signature does NOT verify under a different sender's key", () => {
  const sig = EA.signRecordId(ID, { privateKeyPem: alice.privateKeyPem });
  assert.equal(EA.verifyRecordSig(ID, sig, { publicKeyPem: bob.publicKeyPem }), false);
});

test('NO shared default verify key: verify with no opts.publicKeyPem is false (even with env set)', () => {
  const prev = process.env.LOOM_EDGE_VERIFY_KEY;
  process.env.LOOM_EDGE_VERIFY_KEY = alice.publicKeyPem; // a shared default WOULD make this accept
  try {
    const sig = EA.signRecordId(ID, { privateKeyPem: alice.privateKeyPem });
    assert.equal(EA.verifyRecordSig(ID, sig, {}), false, 'must NOT read an env verify default (accept-all risk)');
    assert.equal(EA.hasVerifyKey({}), false);
  } finally {
    if (prev === undefined) delete process.env.LOOM_EDGE_VERIFY_KEY; else process.env.LOOM_EDGE_VERIFY_KEY = prev;
  }
});

test('alg-pinning: an RSA key is refused (sign -> null, verify -> false)', () => {
  const rsa = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  assert.equal(EA.signRecordId(ID, { privateKeyPem: rsa.privateKey }), null);
  const edSig = EA.signRecordId(ID, { privateKeyPem: alice.privateKeyPem });
  assert.equal(EA.verifyRecordSig(ID, edSig, { publicKeyPem: rsa.publicKey }), false);
});

test('Option-B seam: an injected signer is used (separate-uid vehicle)', () => {
  let called = false;
  const signer = (recordId) => { called = true; return crypto.sign(null, Buffer.from(recordId, 'utf8'), crypto.createPrivateKey(alice.privateKeyPem)).toString('base64'); };
  const sig = EA.signRecordId(ID, { signer });
  assert.ok(called && sig, 'the injected signer must be invoked');
  assert.equal(EA.verifyRecordSig(ID, sig, { publicKeyPem: alice.publicKeyPem }), true);
});

test('OUT-OF-BAND provenance: no env key + no opts key + no signer -> sign returns null (no silent fallthrough)', () => {
  const prev = process.env.LOOM_EDGE_SIGNING_KEY;
  delete process.env.LOOM_EDGE_SIGNING_KEY;
  try {
    assert.equal(EA.signRecordId(ID, {}), null, 'with no key material, signing must FAIL, not silently succeed');
    // but an injected signer STILL works with the env cleared (proves the host need not hold the key)
    const signer = (rid) => crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(bob.privateKeyPem)).toString('base64');
    const sig = EA.signRecordId(ID, { signer });
    assert.ok(sig && EA.verifyRecordSig(ID, sig, { publicKeyPem: bob.publicKeyPem }));
  } finally {
    if (prev === undefined) delete process.env.LOOM_EDGE_SIGNING_KEY; else process.env.LOOM_EDGE_SIGNING_KEY = prev;
  }
});

test('fail-closed: non-hex id, malformed sig -> false/null, never throws', () => {
  assert.equal(EA.signRecordId('nothex', { privateKeyPem: alice.privateKeyPem }), null);
  assert.equal(EA.verifyRecordSig('nothex', 'AAAA', { publicKeyPem: alice.publicKeyPem }), false);
  assert.equal(EA.verifyRecordSig(ID, 'not base64!!', { publicKeyPem: alice.publicKeyPem }), false);
  assert.equal(EA.verifyRecordSig(ID2, EA.signRecordId(ID, { privateKeyPem: alice.privateKeyPem }), { publicKeyPem: alice.publicKeyPem }), false);
});

console.log(`\n[edge-attestation] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
