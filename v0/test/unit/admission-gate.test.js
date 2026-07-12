#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/admission-gate.js unit tests (plans/55 W2a: admission-gate now consumes the fail-closed
// arming MANIFEST, resolveArmedContext -- ADR-0001 Dec 1/3).
//
// NS-9 SCOPE: still DARK forward-contract infra -- import-dark (the darkness witness proves it), arms nothing.
// W2a CHANGE (VERIFY board §6): the arm is resolved ALL-OR-NONE over the 4-signal SIGNAL_SET, so:
//   * the CLEAN disarmed baseline (nothing armed, no garbage token) stays admit-all pass-through (byte-identical);
//   * a PARTIAL arm (>=1 armed but not all 4) now REJECTS -- was admit-all (the deliberate ADR-Dec-3 inversion);
//   * a GARBAGE arm token (dirty disarmed baseline: disarmedBaseline && hadMisconfig) now REJECTS -- the #82 close,
//     the silent-disarm-on-a-non-strict-token this wave exists to shut;
//   * the ARMED path (all 4 coherently armed) verifies the root-signed sigma_root exactly as before.
// The C1 defenses are preserved on a TWO-PHASE structure: the arm read is guarded + OWN-property-only (a polluted
// Object.prototype must not flip the gate armed); the armed-path record read is a SEPARATE guarded try.

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

function seededRegistry() {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: CONTROLLER, rootPublicKeyPem: ROOT.publicKeyPem });
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem });
  return r;
}
// the FULL 4-signal arm (ADR Dec 3: admission arms ONLY when the whole surface is coherently armed).
const ARM = { admissionArmed: true, signingArmed: true, anchoringArmed: true, freshnessArmed: true };

// ---- CLEAN disarmed baseline (the DARK default): admit-all pass-through, byte-identical to today ----

test('clean disarmed baseline (empty / null / undefined / absent-arm) -> admit-all pass-through', () => {
  for (const input of [{}, null, undefined, { registry: seededRegistry(), personaDid: DID }]) {
    const d = A.admissionDecision(input);
    assert.equal(d.admit, true, 'a clean disarmed baseline admits (byte-identical to today)');
    assert.equal(d.armed, false);
    assert.equal(d.reason, 'disarmed-passthrough');
  }
});

test('disarmed admits a would-REJECT persona (the dark default is a genuine pass-through, not a coincidence)', () => {
  const r = reg.createRegistry(); // NO root seeded, NO persona -> would REJECT when armed
  const d = A.admissionDecision({ registry: r, personaDid: 'did:key:zGhost', sigmaRoot: GOOD_SIG }); // no arm
  assert.equal(d.admit, true, 'a persona that would be rejected when armed is ADMITTED when disarmed');
  assert.equal(d.armed, false);
});

// ---- PARTIAL / garbage arm: the fail-closed else (the #82 + F9-narrow close) ----

test('AH9 legacy/partial arm (admission+signing armed, anchoring/freshness ABSENT) -> REJECT, never silent admit-all', () => {
  const { out, alerts } = capture(() => A.admissionDecision({ admissionArmed: true, signingArmed: true, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG }));
  assert.equal(out.admit, false, 'a 2-of-4 arm is a PARTIAL arm -> fail-closed REJECT (not admit-all)');
  assert.equal(out.armed, true);
  assert.equal(out.reason, 'arm-indeterminate-fail-closed');
  assert.ok(alerts.some((a) => a.reason === 'admission-rejected' && a.cause === 'arm-partial'), 'the partial arm is OBSERVABLE at the gate layer');
});

test('F4-A INVERTED: XOR-incoherent arm (admission on, signing off) -> REJECT (was admit-all; ADR-Dec-3 inversion)', () => {
  const { out } = capture(() => A.admissionDecision({ admissionArmed: true, signingArmed: false, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG }));
  assert.equal(out.admit, false, 'a half-armed input now REJECTS instead of admitting all (intended, strictly safer)');
  assert.equal(out.armed, true);
  assert.equal(out.reason, 'arm-indeterminate-fail-closed');
});

test('AH6 (the #82 close) garbage arm TOKEN -> dirty disarmed baseline -> REJECT, never silent admit-all', () => {
  // a non-strict token ('ture') and bare numbers are the operator-intent-to-arm-with-garbage cases -- each is
  // disarmedBaseline:true (armedCount 0) BUT hadMisconfig:true -> must fall to the REJECT branch, NOT admit-all.
  const g1 = capture(() => A.admissionDecision({ admissionArmed: 'ture', registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG }));
  assert.equal(g1.out.admit, false, 'a garbage admission token can NEVER silently admit-all (the #82 residual)');
  assert.equal(g1.out.reason, 'arm-indeterminate-fail-closed');
  assert.ok(g1.alerts.some((a) => a.reason === 'admission-rejected' && a.cause === 'arm-garbage-disarmed'), 'the garbage-arm reject is OBSERVABLE at the gate');
  const g2 = A.admissionDecision({ admissionArmed: 1, signingArmed: 1, anchoringArmed: 1, freshnessArmed: 1, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(g2.admit, false, 'bare numbers (intent-to-fully-arm) are garbage tokens -> REJECT, not admit-all');
});

test('AH8 near-complete arm (3 of 4 armed + 1 garbage token) -> partial -> REJECT (a single fat-finger cannot arm)', () => {
  const d = A.admissionDecision({ ...ARM, freshnessArmed: 'ture', registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(d.admit, false, '3-armed + 1-garbage is not a full coherent arm -> REJECT');
  assert.equal(d.armed, true);
});

// ---- ARMED (full 4-signal): the enforcement path is REACHABLE (witness-B non-vacuity) ----

test('armed (full 4-signal) + a VALID root-signed sigma_root -> ADMIT (the armed verification path is reachable)', () => {
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
  assert.ok(rej && rej.class === 'integrity', 'a present-but-unverified sigma_root is classed integrity (tamper), not misconfig');
});

test('armed + ABSENT sigma_root -> REJECT, classed misconfig (legacy persona, H2)', () => {
  const { out, alerts } = capture(() => A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }));
  assert.equal(out.admit, false);
  assert.equal(out.armed, true);
  const rej = alerts.find((a) => a.reason === 'admission-rejected');
  assert.ok(rej && rej.class === 'misconfig', 'an absent sigma_root is classed misconfig (likely legacy), not integrity');
});

test('F4-B: armed + UNSEEDED root (lookupRootKey null) -> REJECT (W2 uses the registry-sourced wrapper, never a caller key)', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem }); // known root, NO root key seeded
  const d = A.admissionDecision({ ...ARM, registry: r, personaDid: DID, sigmaRoot: GOOD_SIG });
  assert.equal(d.admit, false, 'a persona whose root key is unseeded must be REJECTED when armed (isKnownRoot is NOT an anchor)');
  assert.equal(d.armed, true);
});

// ---- C1 (CRITICAL): a poisoned getter must NOT collapse the arm signal and silently admit ----

test('C1: a THROWING-GETTER admissionArmed -> fail-CLOSED reject (an unreadable arm never silently disarms)', () => {
  const input = { signingArmed: true, anchoringArmed: true, freshnessArmed: true, registry: seededRegistry(), personaDid: DID, sigmaRoot: GOOD_SIG, get admissionArmed() { throw new Error('boom'); } };
  let d;
  assert.doesNotThrow(() => { d = A.admissionDecision(input); }, 'never throws');
  assert.equal(d.admit, false, 'an unreadable arm signal fails CLOSED, never admit-all');
  assert.equal(d.armed, true);
  assert.equal(d.reason, 'arm-read-failed-fail-closed');
});

test('C1: armed + a THROWING-GETTER personaDid (armed-path record read) -> REJECT (never collapse to disarmed-admit)', () => {
  const input = { ...ARM, registry: seededRegistry(), sigmaRoot: GOOD_SIG, get personaDid() { throw new Error('boom'); } };
  let d;
  assert.doesNotThrow(() => { d = A.admissionDecision(input); });
  assert.equal(d.admit, false, 'a poisoned personaDid on an ARMED gate must REJECT');
  assert.equal(d.armed, true);
  assert.equal(d.reason, 'armed-input-unreadable');
});

test('C1: armed + a THROWING-GETTER sigmaRoot -> REJECT; armed + a THROWING-GETTER registry -> REJECT', () => {
  const sigThrow = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, get sigmaRoot() { throw new Error('boom'); } });
  assert.equal(sigThrow.admit, false);
  assert.equal(sigThrow.armed, true);
  const regThrow = A.admissionDecision({ ...ARM, personaDid: DID, sigmaRoot: GOOD_SIG, get registry() { throw new Error('boom'); } });
  assert.equal(regThrow.admit, false, 'a throwing registry getter while armed -> REJECT (record-read path)');
  assert.equal(regThrow.armed, true);
});

// ---- AH10: prototype-pollution must NOT flip the gate armed ----

test('AH10 prototype-pollution: a polluted Object.prototype arm key + {} input stays the CLEAN disarmed baseline (admit-all)', () => {
  const keys = ['admissionArmed', 'signingArmed', 'anchoringArmed', 'freshnessArmed', 'admission', 'signing', 'anchoring', 'freshness'];
  for (const k of keys) Object.prototype[k] = true; // pollute both the gate-input names AND the manifest key names
  try {
    for (const input of [{}, undefined, { registry: seededRegistry(), personaDid: DID }]) {
      const d = A.admissionDecision(input);
      assert.equal(d.admit, true, 'an inherited arm signal must NOT arm the gate (own-property read defends)');
      assert.equal(d.armed, false, 'stays the clean disarmed baseline under a polluted prototype');
    }
  } finally {
    for (const k of keys) delete Object.prototype[k];
  }
});

// ---- M2: the grandfather hook as an attack surface (armed path, unchanged) ----

test('M2: armed + unverified + THROWING grandfather -> REJECT (a throwing grandfather fails CLOSED)', () => {
  const d = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather() { throw new Error('boom'); } });
  assert.equal(d.admit, false);
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

test('CodeRabbit Major: a grandfather in the INPUT record is IGNORED; only the TRUSTED policy arg is consulted', () => {
  const smuggled = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined, grandfather: () => true });
  assert.equal(smuggled.admit, false, 'a grandfather smuggled in the input record is IGNORED -> REJECT');
  const trusted = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined }, { grandfather: () => true });
  assert.equal(trusted.admit, true, 'the same grandfather on the TRUSTED policy arg admits');
  assert.equal(trusted.reason, 'grandfathered-legacy-persona');
});

test('AH11 prototype-polluted grandfather -> NOT grandfathered -> REJECT (own-property policy read; crypto-bypass closed)', () => {
  // the NORMAL armed deployment passes NO grandfather (default {} policy). A polluted Object.prototype.grandfather
  // must NOT be inherited into `policy.grandfather` and crypto-BYPASS sigma_root verification.
  Object.prototype.grandfather = () => true; // ambient pollution; restored in finally
  try {
    const d = A.admissionDecision({ ...ARM, registry: seededRegistry(), personaDid: DID, sigmaRoot: undefined });
    assert.equal(d.admit, false, 'a prototype-inherited grandfather must NOT admit an unverified persona');
    assert.equal(d.reason, 'sigma-root-unverified', 'the reject is the verifier, not a phantom grandfather');
  } finally {
    delete Object.prototype.grandfather;
  }
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
