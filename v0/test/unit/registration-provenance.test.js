#!/usr/bin/env node
'use strict';

// PACT v0 -- identity/registration-provenance.js unit tests (plans/32 W1: the SHADOW sigma_root verifier).
//
// Mirrors custody-verify.js's assessCustody: it reports host-checkable NECESSARY conditions
// (sigmaRootChecksPassed) + a pending SUFFICIENT condition (requiresOutOfBandRootAttestation), and DELIBERATELY
// carries NO `sigmaRootWorldAnchored` / `provenanceReal` field (NS-9) -- passing the crypto check NEVER asserts
// the root key is world-anchored. The apex honesty control: a host self-generates + self-signs its own root and
// PASSES the crypto checks, yet the readout still says out-of-band attestation is required (it only NARROWS).

const assert = require('node:assert/strict');
const P = require('../../src/identity/registration-provenance');
const S = require('../../src/identity/sigma-root');
const reg = require('../../src/identity/registry');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const ROOT = generateEdgeKeypair();
const PERSONA = generateEdgeKeypair();
const CONTROLLER = 'human:alice';
const DID = 'did:key:zPersona';
const BINDING = { personaDid: DID, publicKeyPem: PERSONA.publicKeyPem, controller: CONTROLLER };
const GOOD_SIG = S.signSigmaRoot(BINDING, { privateKeyPem: ROOT.privateKeyPem });

// helper: the invariant every readout must satisfy (VERIFY hacker H1 -- never greener than the report)
function assertInvariant(r) {
  if (r.sigmaRootChecksPassed) {
    assert.equal(r.requiresOutOfBandRootAttestation, true, 'checksPassed === true MUST imply requiresOutOfBandRootAttestation === true');
  }
  assert.equal('sigmaRootWorldAnchored' in r, false, 'NS-9: no sigmaRootWorldAnchored field');
  assert.equal('provenanceReal' in r, false, 'NS-9: no provenanceReal field');
}

test('R0..R3 PASS: a valid binding + root-signed sigma_root + root key -> checksPassed, attestation-required', () => {
  const r = P.assessRegistrationProvenance({ ...BINDING, sigmaRoot: GOOD_SIG, rootPublicKeyPem: ROOT.publicKeyPem });
  assert.equal(r.sigmaRootChecksPassed, true);
  assert.equal(r.requiresOutOfBandRootAttestation, true, 'a PASS still requires the out-of-band root attestation (NARROW, not close)');
  assertInvariant(r);
});

test('R1 absent sigma_root: FAIL -- and the readout is NOT mistakable for clean (H1)', () => {
  const r = P.assessRegistrationProvenance({ ...BINDING, sigmaRoot: undefined, rootPublicKeyPem: ROOT.publicKeyPem });
  assert.equal(r.sigmaRootChecksPassed, false, 'no root authorization on the binding -> FAIL (self-register leg open)');
  // H1: a consumer MUST branch on sigmaRootChecksPassed; !requiresOutOfBand must NEVER be read as "clean"
  assert.equal(r.sigmaRootChecksPassed || false, false, 'the primary verdict is a hard false');
  assertInvariant(r);
});

test('R2 absent root key: FAIL (nothing to anchor to)', () => {
  const r = P.assessRegistrationProvenance({ ...BINDING, sigmaRoot: GOOD_SIG, rootPublicKeyPem: undefined });
  assert.equal(r.sigmaRootChecksPassed, false);
  assertInvariant(r);
});

test('R3 non-vacuity: a PLANTED bad sigma_root (wrong root key) fires RED', () => {
  const OTHER = generateEdgeKeypair();
  const r = P.assessRegistrationProvenance({ ...BINDING, sigmaRoot: GOOD_SIG, rootPublicKeyPem: OTHER.publicKeyPem });
  assert.equal(r.sigmaRootChecksPassed, false, 'a sigma_root that does not verify under the given root key must FAIL');
  assertInvariant(r);
});

test('R0 malformed binding: [] / {} / empty fields -> FAIL fail-closed, never throws', () => {
  assert.doesNotThrow(() => {
    const r1 = P.assessRegistrationProvenance({ personaDid: [], publicKeyPem: PERSONA.publicKeyPem, controller: CONTROLLER, sigmaRoot: GOOD_SIG, rootPublicKeyPem: ROOT.publicKeyPem });
    assert.equal(r1.sigmaRootChecksPassed, false, 'array persona field -> FAIL');
    const r2 = P.assessRegistrationProvenance({});
    assert.equal(r2.sigmaRootChecksPassed, false, 'empty facts -> FAIL');
  });
});

test('APEX honesty control: a host self-generates + self-signs its OWN root -> crypto PASSES but attestation still required, no world-anchored field', () => {
  // the self-register leg: an attacker owns the root key, so of course the crypto verifies. The verifier must
  // NOT report this as a close -- requiresOutOfBandRootAttestation stays TRUE, and there is NO field that could
  // read as "world-anchored". Only the operator's out-of-band act (attesting the root key is a real human root)
  // would HARDEN it, and this tool never claims that (NS-9 / OQ-NS-6).
  const evilRoot = generateEdgeKeypair();
  const evilPersona = generateEdgeKeypair();
  const evilBinding = { personaDid: 'did:key:zEVIL', publicKeyPem: evilPersona.publicKeyPem, controller: 'human:evil' };
  const evilSig = S.signSigmaRoot(evilBinding, { privateKeyPem: evilRoot.privateKeyPem });
  const r = P.assessRegistrationProvenance({ ...evilBinding, sigmaRoot: evilSig, rootPublicKeyPem: evilRoot.publicKeyPem });
  assert.equal(r.sigmaRootChecksPassed, true, 'the crypto verifies (the attacker owns the root key)');
  assert.equal(r.requiresOutOfBandRootAttestation, true, 'a self-generated root NEVER closes it -- out-of-band attestation is still required');
  assertInvariant(r);
});

test('assessRegistrationFromRegistry: sources the triple + root key from the FROZEN registry rows (H2, safe-path-by-default)', () => {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: CONTROLLER, rootPublicKeyPem: ROOT.publicKeyPem });
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem });
  const out = P.assessRegistrationFromRegistry(r, { personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(out.sigmaRootChecksPassed, true, 'registry-sourced verification passes for a correctly-seeded root');
  assertInvariant(out);
});

test('H2: assessRegistrationFromRegistry has NO root-key parameter seam (source-verified, not merely arity)', () => {
  // code-reviewer LOW: Function.length is an arity heuristic (it stops at the first defaulted param), not a proof.
  // Assert the ACTUAL signature carries no rootPublicKeyPem param -- the defense by construction is that the safe
  // wrapper cannot be fed an attacker root key (the pure verifier stays exported for already-sourced callers).
  const src = P.assessRegistrationFromRegistry.toString();
  const params = src.slice(src.indexOf('(') + 1, src.indexOf(')'));
  assert.equal(/rootpublickey/i.test(params), false, 'no rootPublicKeyPem parameter in the signature: (' + params + ')');
});

test('H-1 never-throws: assess / from-registry fail CLOSED on null / throwing-getter / malformed reg (the destructuring fail-OPEN)', () => {
  assert.doesNotThrow(() => assert.equal(P.assessRegistrationProvenance(null).sigmaRootChecksPassed, false), 'assess(null) -> FAIL, no throw');
  const poison = { get personaDid() { throw new Error('boom'); }, publicKeyPem: 'k', controller: 'h', sigmaRoot: GOOD_SIG, rootPublicKeyPem: ROOT.publicKeyPem };
  assert.doesNotThrow(() => assert.equal(P.assessRegistrationProvenance(poison).sigmaRootChecksPassed, false), 'throwing getter -> FAIL');
  const r = reg.createRegistry();
  assert.doesNotThrow(() => assert.equal(P.assessRegistrationFromRegistry(r, null).sigmaRootChecksPassed, false), 'from-registry(reg, null) -> FAIL');
  // a malformed registry (a plain object with no personas Map) must fail-closed, not throw
  assert.doesNotThrow(() => assert.equal(P.assessRegistrationFromRegistry({}, { personaDid: DID, sigmaRoot: GOOD_SIG }).sigmaRootChecksPassed, false), 'malformed reg -> FAIL');
});

test('H2: assessRegistrationFromRegistry FAIL-CLOSES when the root key is unseeded (lookupRootKey null, != isKnownRoot)', () => {
  const r = reg.createRegistry();
  // register the persona (which makes human:alice a KNOWN root via the roots Set) but do NOT seed a root KEY
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem });
  assert.equal(reg.isKnownRoot(r, CONTROLLER), true, 'persona registration makes it a known root');
  assert.equal(reg.lookupRootKey(r, CONTROLLER), null, 'but no ROOT KEY is seeded -- different predicate');
  const out = P.assessRegistrationFromRegistry(r, { personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(out.sigmaRootChecksPassed, false, 'a known root with no seeded root key must FAIL-CLOSED (never anchor on isKnownRoot)');
  assertInvariant(out);
});

test('H2: assessRegistrationFromRegistry fail-closes on an unregistered persona (no row to source)', () => {
  const r = reg.createRegistry();
  assert.doesNotThrow(() => {
    const out = P.assessRegistrationFromRegistry(r, { personaDid: 'did:key:zGhost', sigmaRoot: GOOD_SIG });
    assert.equal(out.sigmaRootChecksPassed, false);
  });
});

console.log(`\n[registration-provenance] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
