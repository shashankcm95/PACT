#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/arming-coherence.js unit tests (plans/28 P5-W2: the both-or-neither arm preflight).
//
// Contract under test (all DARK -- arms nothing, gates nothing):
//   * armingCoherence({admissionArmed, signingArmed}) -> {admissionArmed, coherent, reason} -- a PURE
//     both-or-neither preflight. FULLY DI (charter correction #4, VERIFY-confirmed by both lenses): PACT owns
//     NO live arm flag (Phase 6 signer is DARK/unbuilt), so unlike the toolkit it reads NO env var -- both arms
//     are injected. BOTH params are strict-coerced (=== true) BEFORE any derivation (VERIFY HIGH: a fully-DI
//     port must defend BOTH params, not just the sibling).
//   * armingDecision(input) -> the SAME struct, but compute-then-EMIT: the intended consumer entry point. A
//     live gater MUST call armingDecision (never raw armingCoherence) so a coherent:false is never silent
//     (security.md observability; VERIFY-hacker MEDIUM).
//   * The incoherence alert is cause-keyed (NOT reason-keyed -- refuseAlert writes reason LAST/positional).

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AC = require('../../src/trust/arming-coherence');
const { TOKEN } = require('../../src/lib/refuse-alert');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
function capture(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return lines.join('');
}
function parseAlert(out) { return JSON.parse(out.slice(out.indexOf('{'))); }

// =================== armingCoherence: the four both-or-neither combos (pure; no emit) ===================

test('both-armed -> admissionArmed:true, coherent:true, reason:null', () => {
  const out = capture(() => {
    assert.deepEqual(AC.armingCoherence({ admissionArmed: true, signingArmed: true }), { admissionArmed: true, coherent: true, reason: null });
  });
  assert.equal(out, '', 'the PURE fn never emits');
});
test('neither-armed -> admissionArmed:false, coherent:true, reason:null', () => {
  assert.deepEqual(AC.armingCoherence({ admissionArmed: false, signingArmed: false }), { admissionArmed: false, coherent: true, reason: null });
});
test('admission-only (B5-only analog) -> incoherent + DARK + reason admission-armed-without-signing (fail-closed-dark)', () => {
  assert.deepEqual(AC.armingCoherence({ admissionArmed: true, signingArmed: false }), { admissionArmed: false, coherent: false, reason: 'admission-armed-without-signing' });
});
test('signing-only (B1-only analog) -> incoherent + DARK + reason signing-armed-without-admission (a FUTURE-contract staging label, not a live PACT workflow)', () => {
  // NS-9 (VERIFY architect MEDIUM): the two reason strings are the correct both-or-neither vocabulary, but the
  // 'legit staging' asymmetry is INHERITED from the toolkit's B1/B5 semantics as the intended FUTURE contract.
  // PACT has NO signer producing edges to stage toward today -- both XOR directions are forward-contract-only.
  assert.deepEqual(AC.armingCoherence({ admissionArmed: false, signingArmed: true }), { admissionArmed: false, coherent: false, reason: 'signing-armed-without-admission' });
});

// =================== DI-defensiveness: BOTH params strict-coerced (=== true) ===================

test('DI: a truthy NON-boolean admissionArmed cannot fake an armed/coherent state (both params coerced)', () => {
  for (const truthy of ['true', '1', 1, {}, [], 'yes']) {
    const r = AC.armingCoherence({ admissionArmed: truthy, signingArmed: true });
    assert.equal(r.admissionArmed, false, JSON.stringify(String(truthy)) + ' admissionArmed must coerce to false');
    // admission coerces false, signing true -> the signing-only XOR (dark, incoherent)
    assert.equal(r.coherent, false);
    assert.equal(r.reason, 'signing-armed-without-admission');
  }
});
test('DI: a truthy NON-boolean signingArmed cannot fake an armed state', () => {
  for (const truthy of ['true', '1', 1, {}, []]) {
    const r = AC.armingCoherence({ admissionArmed: true, signingArmed: truthy });
    assert.equal(r.admissionArmed, false);
    assert.equal(r.coherent, false, 'symmetric to the admissionArmed case: signing coerces false -> admission-only XOR');
    assert.equal(r.reason, 'admission-armed-without-signing');
  }
});
test('DI: two matching NON-booleans do NOT spuriously report coherent:true-with-armed', () => {
  const r = AC.armingCoherence({ admissionArmed: 1, signingArmed: 1 });
  // both coerce to false -> neither-armed -> coherent:true but admissionArmed:false (dark) -- never armed
  assert.deepEqual(r, { admissionArmed: false, coherent: true, reason: null });
});
test('DI: missing input object / missing keys -> dark, no throw', () => {
  assert.deepEqual(AC.armingCoherence(), { admissionArmed: false, coherent: true, reason: null });
  assert.deepEqual(AC.armingCoherence({}), { admissionArmed: false, coherent: true, reason: null });
});
test('reason is strictly one of the two enum literals or null across ALL boolean combos (never caller-derived)', () => {
  const allowed = new Set([null, 'admission-armed-without-signing', 'signing-armed-without-admission']);
  for (const a of [true, false]) for (const s of [true, false]) {
    assert.ok(allowed.has(AC.armingCoherence({ admissionArmed: a, signingArmed: s }).reason));
  }
});

// =================== armingDecision: compute-then-EMIT (the intended consumer entry) ===================

test('armingDecision: coherent states (both/neither) emit NOTHING + return the same struct', () => {
  const out = capture(() => {
    assert.deepEqual(AC.armingDecision({ admissionArmed: true, signingArmed: true }), { admissionArmed: true, coherent: true, reason: null });
    assert.deepEqual(AC.armingDecision({ admissionArmed: false, signingArmed: false }), { admissionArmed: false, coherent: true, reason: null });
  });
  assert.equal(out, '', 'no alert when coherent');
});
test('armingDecision: BOTH XOR states emit an observable cause-keyed alert (a coherent:false is never silent)', () => {
  for (const [inp, cause] of [
    [{ admissionArmed: true, signingArmed: false }, 'admission-armed-without-signing'],
    [{ admissionArmed: false, signingArmed: true }, 'signing-armed-without-admission'],
  ]) {
    let res;
    const out = capture(() => { res = AC.armingDecision(inp); });
    assert.equal(res.coherent, false);
    assert.ok(out.startsWith(TOKEN + ' '), 'alert emitted');
    const rec = parseAlert(out);
    assert.equal(rec.class, 'misconfig');
    assert.equal(rec.reason, 'arming-incoherent', 'positional reason token (un-clobberable)');
    assert.equal(rec.cause, cause, 'the distinct XOR cause is carried in the cause key');
  }
});
test('armingDecision: the cause key cannot clobber the positional reason (cause-keyed, not reason-keyed)', () => {
  // the reason enum is fixed by the pure fn; this asserts the emit uses `cause` (not `reason`) for the enum,
  // so refuseAlert's positional reason ('arming-incoherent') always wins -- the egress-alert clobber lesson.
  const out = capture(() => AC.armingDecision({ admissionArmed: true, signingArmed: false }));
  const rec = parseAlert(out);
  assert.equal(rec.reason, 'arming-incoherent');
  assert.equal(rec.cause, 'admission-armed-without-signing');
});
test('armingDecision: never throws with stderr broken (telemetry failure cannot fail the decision)', () => {
  const orig = process.stderr.write;
  process.stderr.write = () => { throw new Error('stderr broken'); };
  try {
    let res;
    assert.doesNotThrow(() => { res = AC.armingDecision({ admissionArmed: true, signingArmed: false }); });
    assert.deepEqual(res, { admissionArmed: false, coherent: false, reason: 'admission-armed-without-signing' });
  } finally { process.stderr.write = orig; }
});

// =================== DI purity guard: the module reads NO env + imports ONLY refuse-alert ===================

test('DI purity: arming-coherence.js reads NO process.env (fully-DI; PACT owns no live arm flag)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'trust', 'arming-coherence.js'), 'utf8');
  assert.doesNotMatch(src, /process\.env/, 'the module must read no env var (charter correction #4)');
});
test('DI purity: arming-coherence.js requires ONLY ../lib/refuse-alert (single alert channel; no arm-flags import)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'trust', 'arming-coherence.js'), 'utf8');
  const reqs = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(reqs, ['../lib/refuse-alert'], 'exactly one import; W2 has a SINGLE alert channel (arming-incoherent)');
});

console.log(`\n[arming-coherence] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
