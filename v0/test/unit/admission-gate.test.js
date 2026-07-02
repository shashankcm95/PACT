#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/admission-gate.js unit tests (plans/33 W2: the DARK sigma_root armed admission gate).
//
// NS-9 SCOPE: this is DARK forward-contract infra -- disarmed by default (admit-all = byte-identical to today),
// armed only by injection, WIRED TO NOTHING (the darkness witness proves it). It does NOT advance the trust
// frontier (only the operator's out-of-band root-key attestation HARDENS). The tests below prove: the disarmed
// default is a pure pass-through; when ARMED it fail-CLOSES on every byzantine input (the CRITICAL C1: a poisoned
// record-field getter must NOT collapse the arm signal and silently admit); every reject/grandfather is OBSERVABLE
// and the reject is CLASSED (present-but-unverified = integrity/tamper, absent = misconfig).

const assert = require('node:assert/strict');
const A = require('../../src/trust/admission-gate');
const S = require('../../src/identity/sigma-root');
const reg = require('../../src/identity/registry');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// capture the operator-side stderr refuse-alert signal (the reject/grandfather is NO-ECHO to the return value)
function capture(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const lines = [];
  process.stderr.write = (s) => { lines.push(String(s)); return true; };
  let out;
  try { out = fn(); } finally { process.stderr.write = orig; }
  const alerts = lines.filter((l) => l.includes('[PACT-REFUSE-ALERT]'))
    .map((l) => { try { return JSON.parse(l.slice(l.indexOf('{'))); } catch { return null; } })
    .filter(Boolean);
  return { out, alerts };
}

const ROOT = generateEdgeKeypair();
const PERSONA = generateEdgeKeypair();
const CONTROLLER = 'human:alice';
const DID = 'did:key:zPersona';
const GOOD_SIG = S.signSigmaRoot({ personaDid: DID, publicKeyPem: PERSONA.publicKeyPem, controller: CONTROLLER }, { privateKeyPem: ROOT.privateKeyPem });

// a fully-seeded registry: root key seeded + persona registered under it
function seededRegistry() {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: CONTROLLER, rootPublicKeyPem: ROOT.publicKeyPem });
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem });
  return r;
}
const ARM = { admissionArmed: true, signingArmed: true };

// ---- DISARMED (the DARK default): admit-all pass-through, byte-identical to today ----

test('disarmed default: an empty / null / absent-arm input -> admit-all pass-through', () => {
  for (const input of [{}, null, undefined, { registry: seededRegistry(), personaDid: DID }]) {
    const d = A.admissionDecision(input);
    assert.equal(d.admit, true, 'disarmed admits');
    assert.equal(d.armed, false);
    assert.equal(d.reason, 'disarmed-passthrough');
  }
});

test('disarmed admits a would-REJECT persona (proves the dark default is a genuine pass-through, not a coincidence)', () => {
  const r = reg.createRegistry(); // NO root seeded, NO persona -> would REJECT when armed
  const d = A.admissionDecision({ registry: r, personaDid: 'did:key:zGhost', sigmaRoot: GOOD_SIG }); // disarmed (no arm)
  assert.equal(d.admit, true, 'a persona that would be rejected when armed is ADMITTED when disarmed');
  assert.equal(d.armed, false);
});

test('F4-A: XOR-incoherent arm (admission on, signing off) -> disarmed pass-through AND the incoherence EMITS', () => {
  const { out, alerts } = capture(() => A.admissionDecision({ admissionArmed: true, signingArmed: false, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG }));
  assert.equal(out.admit, true, 'incoherent arm -> admit-all-is-today, not a regression');
  assert.equal(out.armed, false);
  assert.ok(alerts.some((a) => a.reason === 'arming-incoherent'), 'the incoherence still emits (armingDecision)');
});

// ---- ARMED: the enforcement path ----

test('armed + a VALID root-signed sigma_root -> ADMIT', () => {
  const d = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(d.admit, true);
  assert.equal(d.armed, true);
  assert.equal(d.reason, 'sigma-root-verified');
});

test('armed + a TAMPERED sigma_root -> REJECT, classed integrity (present-but-unverified = tamper/forgery, H2)', () => {
  const raw = Buffer.from(GOOD_SIG, 'base64'); raw[0] ^= 0xff;
  const { out, alerts } = capture(() => A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: raw.toString('base64') }));
  assert.equal(out.admit, false, 'a present-but-invalid sigma_root is REJECTED when armed');
  assert.equal(out.armed, true);
  assert.equal(out.reason, 'sigma-root-unverified');
  const rej = alerts.find((a) => a.reason === 'admission-rejected');
  assert.ok(rej && rej.class === 'integrity', 'a present-but-unverified sigma_root is classed integrity (attack/tamper), not misconfig');
});

test('armed + ABSENT sigma_root -> REJECT, classed misconfig (legacy persona, H2)', () => {
  const { out, alerts } = capture(() => A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }));
  assert.equal(out.admit, false);
  assert.equal(out.armed, true);
  const rej = alerts.find((a) => a.reason === 'admission-rejected');
  assert.ok(rej && rej.class === 'misconfig', 'an absent sigma_root is classed misconfig (likely legacy), not integrity');
});

test('F4-B: armed + UNSEEDED root (lookupRootKey null) -> REJECT (proves W2 uses the registry-sourced wrapper, never a caller root key)', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem }); // known root, NO root key seeded
  const d = A.admissionDecision({ ...ARM, registry: r, personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(d.admit, false, 'a persona whose root key is unseeded must be REJECTED when armed (isKnownRoot is NOT an anchor)');
  assert.equal(d.armed, true);
});

// ---- C1 (CRITICAL): a poisoned record-field getter must NOT collapse the arm signal and silently admit ----

test('C1: armed + a THROWING-GETTER personaDid -> REJECT (never disarms/admits -- the fail-OPEN this fold closes)', () => {
  const input = { admissionArmed: true, signingArmed: true, registry: seededRegistry(), sigmaRoot: GOOD_SIG, get personaDid() { throw new Error('boom'); } };
  let d;
  assert.doesNotThrow(() => { d = A.admissionDecision(input); }, 'never throws');
  assert.equal(d.admit, false, 'a poisoned personaDid on an ARMED gate must REJECT, not collapse to disarmed-admit');
  assert.equal(d.armed, true);
});

test('C1: armed + a THROWING-GETTER sigmaRoot -> REJECT', () => {
  const input = { admissionArmed: true, signingArmed: true, registry: seededRegistry(), personaDid: DID, get sigmaRoot() { throw new Error('boom'); } };
  let d;
  assert.doesNotThrow(() => { d = A.admissionDecision(input); });
  assert.equal(d.admit, false);
  assert.equal(d.armed, true);
});

test('C1: a THROWING-GETTER admissionArmed -> fail-CLOSED reject (an unreadable arm never silently disarms)', () => {
  const input = { signingArmed: true, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG, get admissionArmed() { throw new Error('boom'); } };
  let d;
  assert.doesNotThrow(() => { d = A.admissionDecision(input); });
  assert.equal(d.admit, false, 'an unreadable arm signal fails CLOSED, never admit-all');
  assert.equal(d.armed, true);
  assert.equal(d.reason, 'arm-read-failed-fail-closed');
});

test('C1: a THROWING-GETTER signingArmed -> fail-CLOSED reject (arm-read path); a THROWING-GETTER registry while armed -> REJECT (record-read path)', () => {
  const armThrow = A.admissionDecision({ admissionArmed: true, personaDid: DID, sigmaRoot: GOOD_SIG, registry: seededRegistry(), get signingArmed() { throw new Error('boom'); } });
  assert.equal(armThrow.admit, false, 'a throwing signingArmed getter fails CLOSED (arm-read path)');
  assert.equal(armThrow.reason, 'arm-read-failed-fail-closed');
  const regThrow = A.admissionDecision({ admissionArmed: true, signingArmed: true, personaDid: DID, sigmaRoot: GOOD_SIG, get registry() { throw new Error('boom'); } });
  assert.equal(regThrow.admit, false, 'a throwing registry getter while armed -> REJECT (record-field read path), never admit');
  assert.equal(regThrow.armed, true);
});

// ---- M2: the grandfather hook as an attack surface ----

test('M2: armed + unverified + THROWING grandfather -> REJECT (a throwing grandfather fails CLOSED, never admits)', () => {
  const d = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather() { throw new Error('boom'); } });
  assert.equal(d.admit, false, 'a throwing grandfather -> not grandfathered -> REJECT');
  assert.equal(d.armed, true);
});

test('M2: armed + unverified + TRUTHY-NON-BOOLEAN grandfather (returns 1) -> REJECT (=== true guard)', () => {
  const d = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather: () => 1 });
  assert.equal(d.admit, false, 'a truthy-non-boolean grandfather return does NOT grandfather (strict === true)');
});

test('grandfather === true (on the trusted policy arg) -> ADMIT (grandfathered-legacy-persona) and it EMITS', () => {
  const { out, alerts } = capture(() => A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather: (did) => did === DID }));
  assert.equal(out.admit, true, 'an explicit grandfather admits');
  assert.equal(out.armed, true);
  assert.equal(out.reason, 'grandfathered-legacy-persona');
  assert.ok(alerts.some((a) => a.reason === 'admission-grandfathered'), 'a grandfather admission is OBSERVABLE');
});

test('CodeRabbit Major: a grandfather in the INPUT record is IGNORED; only the TRUSTED policy arg is consulted (no actor-forwarded override)', () => {
  // an attacker-forwarded grandfather on the input record must NOT bypass verification
  const smuggled = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined, grandfather: () => true });
  assert.equal(smuggled.admit, false, 'a grandfather smuggled in the input record is IGNORED -> REJECT');
  // the SAME grandfather on the trusted policy arg DOES admit -- proving the input-record one was structurally inert
  const trusted = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather: () => true });
  assert.equal(trusted.admit, true, 'the same grandfather on the TRUSTED policy arg admits');
  assert.equal(trusted.reason, 'grandfathered-legacy-persona');
});

test('grandfather is consulted ONLY on the armed-unverified path (0 calls disarmed, 0 calls when verified)', () => {
  let calls = 0;
  const gf = () => { calls++; return true; };
  A.admissionDecision({ registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG }, { grandfather: gf }); // disarmed
  assert.equal(calls, 0, 'disarmed -> grandfather never consulted');
  A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG }, { grandfather: gf }); // armed + verified
  assert.equal(calls, 0, 'armed + verified -> grandfather never consulted');
  A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather: gf }); // armed + unverified
  assert.equal(calls, 1, 'armed + unverified -> grandfather consulted exactly once');
});

// ---- never-throws (the whole composition) ----

test('never-throws: null / undefined / scalar / all-throwing-getters -> a decision, never a throw', () => {
  for (const input of [null, undefined, 'x', 42, [], { get admissionArmed() { throw new Error(); }, get signingArmed() { throw new Error(); } }]) {
    assert.doesNotThrow(() => A.admissionDecision(input));
  }
});

console.log(`\n[admission-gate] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
