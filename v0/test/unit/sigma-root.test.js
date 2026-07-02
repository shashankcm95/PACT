#!/usr/bin/env node
'use strict';

// PACT v0 -- identity/sigma-root.js unit tests (plans/32 W1: the sigma_root persona<->key root-signature).
//
// NS-9 SCOPE: this is the SHADOW verification PRIMITIVE. It proves KEY-AUTHORIZATION ("root key K_root authorized
// K_pub as persona P"), never WHO holds K_root (that is U1). The tests below prove the crypto is injective,
// replay-safe across the full (persona, key, controller) triple, fail-CLOSED on every malformed input, and
// NEVER throws (VERIFY hacker C1). They do NOT assert any world-anchored close -- the primitive cannot make one.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const S = require('../../src/identity/sigma-root');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// a genuine root keypair + a genuine persona keypair (the persona key is what the binding authorizes)
const ROOT = generateEdgeKeypair();
const OTHER_ROOT = generateEdgeKeypair();
const PERSONA = generateEdgeKeypair();

const BINDING = { personaDid: 'did:key:zPersona', publicKeyPem: PERSONA.publicKeyPem, controller: 'human:alice' };

test('round-trip: a root-signed binding verifies under the root PUBLIC key', () => {
  const sig = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });
  assert.ok(typeof sig === 'string' && sig.length > 0, 'signSigmaRoot returns a base64 signature');
  assert.equal(S.verifySigmaRoot({ ...BINDING, sigmaRoot: sig, rootPublicKeyPem: ROOT.publicKeyPem }), true);
});

test('wrong root key: a binding signed by root A does NOT verify under root B (fail-closed)', () => {
  const sig = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });
  assert.equal(S.verifySigmaRoot({ ...BINDING, sigmaRoot: sig, rootPublicKeyPem: OTHER_ROOT.publicKeyPem }), false);
});

test('replay-spanning: a sigma_root for (P,K,H) does NOT verify for a different persona / key / controller', () => {
  const sig = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });
  const rk = { sigmaRoot: sig, rootPublicKeyPem: ROOT.publicKeyPem };
  assert.equal(S.verifySigmaRoot({ ...BINDING, personaDid: 'did:key:zEVIL', ...rk }), false, 'persona swap rejected');
  assert.equal(S.verifySigmaRoot({ ...BINDING, publicKeyPem: OTHER_ROOT.publicKeyPem, ...rk }), false, 'key swap rejected');
  assert.equal(S.verifySigmaRoot({ ...BINDING, controller: 'human:attacker', ...rk }), false, 'controller swap rejected');
});

test('tampered signature: flipping a byte of sigma_root fails verify', () => {
  const sig = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });
  const raw = Buffer.from(sig, 'base64'); raw[0] ^= 0xff;
  assert.equal(S.verifySigmaRoot({ ...BINDING, sigmaRoot: raw.toString('base64'), rootPublicKeyPem: ROOT.publicKeyPem }), false);
});

test('injectivity: concat-ambiguous triples produce DISTINCT binding ids (canonical JSON, not concat)', () => {
  // "did:key:zA"+"key" and "did:key:z"+"Akey" both concat to "did:key:zAkey" -- collide under string concat, never canonical JSON
  const a = S.computeBindingId({ personaDid: 'did:key:zA', publicKeyPem: 'key', controller: 'h' });
  const b = S.computeBindingId({ personaDid: 'did:key:z', publicKeyPem: 'Akey', controller: 'h' });
  assert.notEqual(a, b, 'the two distinct triples must not collide');
  assert.match(a, /^[0-9a-f]{64}$/, 'a binding id is a 64-hex content-address');
});

test('domain separation: the binding carries a _type tag (a binding id != a bare record content-address)', () => {
  const bindingId = S.computeBindingId(BINDING);
  const { sha256hex, canonicalJsonSerialize } = require('../../src/lib/record');
  // an UNTAGGED object over the same fields must hash differently -- the _type tag is in the preimage
  const untagged = sha256hex(canonicalJsonSerialize({ controller: BINDING.controller, k_pub: BINDING.publicKeyPem, persona_did: BINDING.personaDid }));
  assert.notEqual(bindingId, untagged, 'the _type domain-separation tag must be part of the signed preimage');
});

test('M1 type-gate: computeBindingId REJECTS non-string / empty fields ([] and {} pass a bare truthiness test)', () => {
  assert.throws(() => S.computeBindingId({ personaDid: [], publicKeyPem: 'k', controller: 'h' }), /string|required/i, 'array field rejected');
  assert.throws(() => S.computeBindingId({ personaDid: 'did:key:z', publicKeyPem: {}, controller: 'h' }), /string|required/i, 'object field rejected');
  assert.throws(() => S.computeBindingId({ personaDid: 'did:key:z', publicKeyPem: 'k', controller: '' }), /string|required/i, 'empty string rejected');
  assert.throws(() => S.computeBindingId({ personaDid: 'did:key:z', publicKeyPem: 'k' }), /string|required/i, 'missing controller rejected');
});

test('C1 never-throws: verifySigmaRoot fail-CLOSED (false, no throw) on missing / non-string / pathological fields', () => {
  const sig = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });
  const rk = { sigmaRoot: sig, rootPublicKeyPem: ROOT.publicKeyPem };
  // a bad field would make computeBindingId THROW -- verify must SWALLOW it to false, never propagate (a consumer
  // swallowing a propagated throw around a pre-truthy pass-flag fails OPEN -- the hacker C1 exploit).
  assert.equal(S.verifySigmaRoot({ personaDid: {}, publicKeyPem: PERSONA.publicKeyPem, controller: 'h', ...rk }), false, 'object field -> false');
  assert.equal(S.verifySigmaRoot({ personaDid: 'did:key:z', controller: 'h', ...rk }), false, 'missing key field -> false');
  const deep = { a: null }; let d = deep; for (let i = 0; i < 300; i++) { d.a = { a: null }; d = d.a; }
  assert.doesNotThrow(() => S.verifySigmaRoot({ personaDid: deep, publicKeyPem: 'k', controller: 'h', ...rk }), 'a pathological field never throws out of verify');
});

test('C1 never-throws: signSigmaRoot returns null (never throws) on a malformed binding', () => {
  assert.equal(S.signSigmaRoot({ personaDid: [], publicKeyPem: 'k', controller: 'h' }, { privateKeyPem: ROOT.privateKeyPem }), null);
  assert.equal(S.signSigmaRoot({ personaDid: 'did:key:z' }, { privateKeyPem: ROOT.privateKeyPem }), null, 'missing fields -> null');
});

test('fail-closed: absent sigma_root / absent root key / empty inputs -> false', () => {
  assert.equal(S.verifySigmaRoot({ ...BINDING, sigmaRoot: undefined, rootPublicKeyPem: ROOT.publicKeyPem }), false, 'no sigmaRoot');
  assert.equal(S.verifySigmaRoot({ ...BINDING, sigmaRoot: 'x'.repeat(88), rootPublicKeyPem: undefined }), false, 'no root key');
  assert.equal(S.verifySigmaRoot({}), false, 'empty facts');
});

test('H-1 never-throws: a NULL arg or a THROWING-GETTER field fails CLOSED (false/null), never propagates (the destructuring fail-OPEN)', () => {
  // destructuring in the signature would throw on null (the `= {}` default fills only undefined) and fire a
  // throwing getter OUTSIDE any try -- a consumer swallowing that throw around a pre-truthy flag fails OPEN.
  assert.doesNotThrow(() => assert.equal(S.verifySigmaRoot(null), false), 'verifySigmaRoot(null) -> false, no throw');
  assert.doesNotThrow(() => assert.equal(S.verifySigmaRoot(undefined), false), 'verifySigmaRoot(undefined) -> false');
  const poison = { get personaDid() { throw new Error('boom'); }, publicKeyPem: 'k', controller: 'h', sigmaRoot: 'x'.repeat(88), rootPublicKeyPem: ROOT.publicKeyPem };
  assert.doesNotThrow(() => assert.equal(S.verifySigmaRoot(poison), false), 'a throwing getter field -> false, never propagates');
  assert.doesNotThrow(() => assert.equal(S.signSigmaRoot(null, { privateKeyPem: ROOT.privateKeyPem }), null), 'signSigmaRoot(null) -> null');
});

test('alg-pin: a non-ed25519 (RSA) root key cannot sign OR verify a sigma_root (ed25519 pinned end-to-end)', () => {
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  assert.equal(S.signSigmaRoot(BINDING, { privateKeyPem: rsa.privateKey }), null, 'RSA root key cannot sign');
  const edSig = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });
  assert.equal(S.verifySigmaRoot({ ...BINDING, sigmaRoot: edSig, rootPublicKeyPem: rsa.publicKey }), false, 'RSA root key cannot verify');
});

console.log(`\n[sigma-root] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
