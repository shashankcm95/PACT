#!/usr/bin/env node
'use strict';

// PACT P2 — trust-engine tests (the §6 exit criteria of plans/01-p2-trust-engine-plan.md).
// INV-14 read gate · Sybil-~0 wcons · registration=zero-trust · CONVERT max-flow (not tally) ·
// WEAK flag + mayGate · vouches receiver-scoped (no rank throne) · config-binding · anti-grief ·
// decay · everything-SHADOW · cold-start novice prior.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { computeRecordId } = require('../../src/lib/record');
const { direct, decayWeight } = require('../../src/trust/direct');
const { wcons } = require('../../src/trust/consensus');
const { convert, disjointPaths } = require('../../src/trust/convert');
const { independenceLabel, mayGate, epistemicIndependence } = require('../../src/independence/weak-flag');
const { trust } = require('../../src/trust/model');
const { CRATER_MULTIPLIER } = require('../../src/trust/params');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// Drain every freshWorld() tmpdir on exit, so an assertion-failure mid-test can't leak temp state into later
// tests (the per-test w.cleanup() only runs on the success path — mirrors broker.test.js). (CodeRabbit PR#2)
const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// --- world setup: a registry + keypairs; ME's per-receiver store is the behavioral log ---
function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-p2-'));
  _allDirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {};
  let seq = 0;
  function addUnder(did, human) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    return did;
  }
  function add(did) { return addUnder(did, 'human:' + did); }
  const ME = add('did:key:zME');
  const meCtx = { registry, storeOpts: { receiverId: ME, stateDir: STATE } };
  // emit a SIGNED frame from src and append to ME's store
  function emit(src, type, payload, opts = {}) {
    const p = personas[src];
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: seq++, nonce: 'n' + seq, payload, configHash: opts.configHash, t: opts.t }, { privateKeyPem: p.kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: ME, stateDir: STATE });
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  // emit a frame for `src` SIGNED BY a different keypair (forged provenance) — read-gate must drop it
  function emitSignedBy(src, signerKp, type, payload) {
    const p = personas[src];
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: seq++, nonce: 'w' + seq, payload }, { privateKeyPem: signerKp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: ME, stateDir: STATE });
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  // plant an UNSIGNED (or forged) record straight into ME's store, bypassing sig (the store accepts it)
  function plantUnsigned(src, type, payload) {
    const p = personas[src];
    const body = { ver: 'pact/0', type, src_persona_did: src, parent_human_uid: p.human, seq: seq++, nonce: 'p' + seq, payload };
    const record_id = computeRecordId(body);
    const ap = appendRecord({ ...body, record_id }, { receiverId: ME, stateDir: STATE }); // no sig
    if (!ap.ok) throw new Error('plant: ' + ap.reason);
    return record_id;
  }
  return { STATE, registry, personas, meCtx, ME, add, addUnder, emit, emitSignedBy, plantUnsigned, cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } } };
}

// ---- INV-14: the authenticated read gate ----
test('INV-14: an UNSIGNED planted record contributes 0 to DIRECT', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'c1' } }); // 1 signed claim
  const before = direct(w.meCtx, 'did:key:zAlice').r;
  for (let i = 0; i < 5; i++) w.plantUnsigned('did:key:zAlice', 'CLAIM', { claim: { content: 'forged' + i } });
  const after = direct(w.meCtx, 'did:key:zAlice').r;
  assert.equal(before, 1);
  assert.equal(after, 1, 'planted unsigned records must NOT inflate DIRECT (read-gate drops them)');
  w.cleanup();
});

test('INV-14: a record signed by a WRONG (unregistered) key contributes 0 (integrity != provenance)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'real' } }); // 1 genuine signed claim
  const before = direct(w.meCtx, 'did:key:zAlice').r;
  const wrong = newPersonaKeypair(); // a key NOT registered for zAlice
  for (let i = 0; i < 5; i++) w.emitSignedBy('did:key:zAlice', wrong, 'CLAIM', { claim: { content: 'forged' + i } });
  assert.equal(direct(w.meCtx, 'did:key:zAlice').r, before, 'wrong-key records are dropped by the read-gate (#273)');
  w.cleanup();
});

// ---- DIRECT: behavioral, config-bound, anti-grief, decay ----
test('DIRECT: uncontested signed claims raise belief; a never-interacted persona has belief 0', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zSybil');
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'a' } });
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'b' } });
  assert.ok(direct(w.meCtx, 'did:key:zAlice').b > 0);
  assert.equal(direct(w.meCtx, 'did:key:zSybil').b, 0, 'registration alone grants ZERO belief');
  w.cleanup();
});

test('config-binding: a config-swap does NOT inherit trust (separate bucket)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'a' } }, { configHash: 'cfgA' });
  assert.ok(direct(w.meCtx, 'did:key:zAlice', 'cfgA').b > 0);
  assert.equal(direct(w.meCtx, 'did:key:zAlice', 'cfgB').b, 0, 'a swapped config inherits NO earned trust');
  w.cleanup();
});

test('anti-grief: zero-standing contesters INFORM but do NOT crater', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zC1'); w.add('did:key:zC2'); // C1/C2 have no claims = no standing
  const claim = w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'x' } });
  w.emit('did:key:zC1', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: claim.record_id });
  w.emit('did:key:zC2', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: claim.record_id });
  assert.equal(direct(w.meCtx, 'did:key:zAlice').s, 2, 'distinct contesters inform; no earned standing → NO crater');
  w.cleanup();
});

test('crater needs >=2 distinct EARNED-STANDING humans', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zC1'); w.add('did:key:zC2');
  w.emit('did:key:zC1', 'CLAIM', { claim: { content: 'c1-work' } }); // C1 earns standing
  w.emit('did:key:zC2', 'CLAIM', { claim: { content: 'c2-work' } }); // C2 earns standing (distinct human)
  const claim = w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'x' } });
  w.emit('did:key:zC1', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: claim.record_id });
  w.emit('did:key:zC2', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: claim.record_id });
  assert.equal(direct(w.meCtx, 'did:key:zAlice').s, 2 * CRATER_MULTIPLIER, 'earned distinct-human corroboration craters');
  w.cleanup();
});

test('crater-grief DEFEATED: one human minting 2 personas is ONE contester (no crater)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  // two personas under the SAME human (the attacker), each with standing
  w.addUnder('did:key:zAtk1', 'human:attacker'); w.addUnder('did:key:zAtk2', 'human:attacker');
  w.emit('did:key:zAtk1', 'CLAIM', { claim: { content: 'a1' } });
  w.emit('did:key:zAtk2', 'CLAIM', { claim: { content: 'a2' } });
  const claim = w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'x' } });
  w.emit('did:key:zAtk1', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: claim.record_id });
  w.emit('did:key:zAtk2', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: claim.record_id });
  assert.equal(direct(w.meCtx, 'did:key:zAlice').s, 1, 'two personas of ONE human = one contester → no crater (rootOf-keyed)');
  w.cleanup();
});

test('bogus CONTEST: a contest referencing no real claim does NOT crater', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zC1'); w.add('did:key:zC2');
  w.emit('did:key:zC1', 'CLAIM', { claim: { content: 'c1' } }); w.emit('did:key:zC2', 'CLAIM', { claim: { content: 'c2' } });
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'x' } });
  // contests reference a NON-EXISTENT claim id → not a real caught defection → ignored
  w.emit('did:key:zC1', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: 'f'.repeat(64) });
  w.emit('did:key:zC2', 'CONTEST', { target_persona: 'did:key:zAlice', target_claim_id: 'deadbeef' });
  assert.equal(direct(w.meCtx, 'did:key:zAlice').s, 0, 'bogus contests do not crater (no real claim referenced)');
  w.cleanup();
});

test('decay: an older claim contributes less belief than a recent one', () => {
  const HALF = 30 * 24 * 60 * 60 * 1000;
  assert.ok(decayWeight({ t: 1000 }, 1000) === 1);
  assert.ok(Math.abs(decayWeight({ t: 0 }, HALF) - 0.5) < 1e-9, 'one half-life → weight 0.5');
  assert.ok(decayWeight({ t: 0 }, 2 * HALF) < 0.3);
});

// ---- CONSENSUS: Sybil-~0, cold-start ----
test('wcons: a Sybil flood (zero earned edges) contributes ~0', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'earned' } }); // ME earns DIRECT in Alice
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.9 });
  const baseline = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(baseline.defined);
  // 50 Sybils (registered, NO earned claims) all vouch the target with value 1.0
  for (let i = 0; i < 50; i++) {
    const s = w.add('did:key:zSybil' + i);
    w.emit(s, 'VOUCH', { target_persona: 'did:key:zTarget', value: 1.0 });
  }
  const flooded = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(Math.abs(flooded.value - baseline.value) < 1e-9, 'Sybils must not move wcons (theorem-backed)');
  w.cleanup();
});

test('wcons: one human minting many cheap-claim personas does NOT launder (persona-mult defeated)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  for (let i = 0; i < 20; i++) w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'earned' + i } }); // a STRONG legit voucher
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.2 });
  // ONE attacker human mints 50 personas, each with ONE cheap claim, all vouch the target 1.0
  for (let i = 0; i < 50; i++) {
    const p = w.addUnder('did:key:zMint' + i, 'human:miller');
    w.emit(p, 'CLAIM', { claim: { content: 'cheap' + i } });
    w.emit(p, 'VOUCH', { target_persona: 'did:key:zTarget', value: 1.0 });
  }
  const r = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(r.defined);
  // 50 personas of one human collapse to ONE confidence-gated voucher → wcons stays near the strong
  // legit voucher's 0.2, far below the unmitigated ~0.83. Persona-multiplication defeated (human-mult = U1).
  assert.ok(r.value < 0.4, 'persona-mint must not launder wcons; got ' + r.value);
  w.cleanup();
});

test('wcons cold-start: an empty DIRECT graph → undefined (caller uses novice prior, never NaN)', () => {
  const w = freshWorld();
  w.add('did:key:zS');
  w.emit('did:key:zS', 'VOUCH', { target_persona: 'did:key:zTarget', value: 1.0 }); // voucher has b=0
  const r = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.equal(r.defined, false);
  const t = trust(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(Number.isFinite(t.value), 'TRUST must be finite at cold-start, never NaN');
  w.cleanup();
});

// ---- CONVERT: max-flow, not a tally ----
test('CONVERT: DISJOINT_PATHS is vertex-disjoint max-flow, NOT a vouch tally', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zBob'); w.add('did:key:zTarget');
  // me→alice→target and me→bob→target : 2 vertex-disjoint paths
  w.emit(w.ME, 'VOUCH', { target_persona: 'did:key:zAlice', value: 1 });
  w.emit(w.ME, 'VOUCH', { target_persona: 'did:key:zBob', value: 1 });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 1 });
  w.emit('did:key:zBob', 'VOUCH', { target_persona: 'did:key:zTarget', value: 1 });
  assert.equal(disjointPaths(w.meCtx, w.ME, 'did:key:zTarget'), 2);
  // 50 Sybils vouch the target, but ME does NOT vouch any Sybil → no path from me → still 2
  for (let i = 0; i < 50; i++) { const s = w.add('did:key:zSyb' + i); w.emit(s, 'VOUCH', { target_persona: 'did:key:zTarget', value: 1 }); }
  assert.equal(disjointPaths(w.meCtx, w.ME, 'did:key:zTarget'), 2, 'a flood of vouches is NOT counted (max-flow through MY graph)');
  w.cleanup();
});

test('CONVERT: two paths sharing an intermediary count as ONE (vertex-disjoint)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zBob'); w.add('did:key:zTarget');
  // me→alice→target  AND  me→alice→bob→target : both cross alice → 1 vertex-disjoint path
  w.emit(w.ME, 'VOUCH', { target_persona: 'did:key:zAlice', value: 1 });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 1 });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zBob', value: 1 });
  w.emit('did:key:zBob', 'VOUCH', { target_persona: 'did:key:zTarget', value: 1 });
  assert.equal(disjointPaths(w.meCtx, w.ME, 'did:key:zTarget'), 1);
  w.cleanup();
});

// ---- WEAK flag (the v1.1 spine) ----
test('WEAK flag: independence is always WEAK; mayGate refuses high-stakes; AND(axes 1-3) != axis 4', () => {
  const label = independenceLabel({ topological: 99 });
  assert.equal(label.overall, 'WEAK');
  assert.equal(label.epistemic, 'WEAK');
  assert.equal(mayGate(label, { highStakes: true }), false, 'high-stakes on a WEAK record is refused');
  assert.equal(mayGate(label, { highStakes: false }), true, 'low-stakes is permitted (WEAK may inform)');
  assert.equal(mayGate(undefined, { highStakes: true }), false, 'absent label + high-stakes → refused (fail-closed)');
  // mayGate is AUTHORITATIVE: a FORGED label cannot unlock a high-stakes gate (epistemic is always WEAK).
  assert.equal(mayGate({ overall: 'STRONG', epistemic: 'STRONG', config_stability: 'STRONG' }, { highStakes: true }), false, 'a forged label must NOT unlock a gate');
  assert.equal(epistemicIndependence(), 'WEAK', 'the cheap axes never substitute for epistemic independence');
});

test('CONVERT is ADVISORY: actionable=false, independence WEAK (everything SHADOW)', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  const c = convert(w.meCtx, w.ME, 'did:key:zTarget');
  assert.equal(c.actionable, false);
  assert.equal(c.advisory, true);
  assert.equal(c.independence.overall, 'WEAK');
  w.cleanup();
});

// ---- P4 sequencing guard (plans/08): the machine-readable form of the convert.js:82-85 comment + the
// weak-flag.js:47-52 P5 lift-point. `actionable` MUST NOT flip true, and high-stakes MUST stay refused,
// until the per-path bar exists AND the U2 estimator replaces epistemicIndependence(). A future edit that
// breaks ANY leg goes RED here against a NAMED guard. (Consolidates pre-existing assertions; not net-new.)
test('P4 SEQUENCING GUARD: actionable=false + mayGate refuses high-stakes + epistemicIndependence is WEAK', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  assert.equal(convert(w.meCtx, w.ME, 'did:key:zTarget').actionable, false, 'actionable must NOT flip until the P4 bar + U2 (convert.js:82-85)');
  assert.equal(mayGate(independenceLabel({ topological: 99 }), { highStakes: true }), false, 'high-stakes stays refused (symptom)');
  assert.equal(epistemicIndependence(), 'WEAK', 'the SOLE P5 lift-point — the CAUSE; U2 replaces THIS fn (weak-flag.js:52)');
  w.cleanup();
});

// ---- no rank throne: vouches are receiver-scoped ----
test('no rank throne: the SAME vouch yields DIFFERENT wcons for two receivers (no global order)', () => {
  // ME earns Alice; a SECOND receiver earns Bob. Both have Alice+Bob vouch the target with different
  // values → wcons(target) differs by receiver → no receiver-independent total order.
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zBob'); w.add('did:key:zTarget');
  // ME earns Alice only
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'earned-by-me' } });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.2 });
  w.emit('did:key:zBob', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.9 });
  const meView = wcons(w.meCtx, w.ME, 'did:key:zTarget'); // weights Alice (earned) → ~0.2
  // a second receiver OTHER that earns Bob instead, over its OWN store
  const STATE2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-p2b-'));
  _allDirs.push(STATE2);
  const otherCtx = { registry: w.registry, storeOpts: { receiverId: 'did:key:zME', stateDir: STATE2 } };
  // reuse the emit machinery against STATE2 by direct append (own seq counter)
  let s2 = 0;
  const emit2 = (src, type, payload) => {
    s2 += 1;
    const p = w.personas[src];
    const b = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: s2, nonce: 'o' + s2, payload }, { privateKeyPem: p.kp.privateKeyPem });
    appendRecord(b.frame, { receiverId: 'did:key:zME', stateDir: STATE2 });
  };
  emit2('did:key:zBob', 'CLAIM', { claim: { content: 'earned-by-other' } });
  emit2('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.2 });
  emit2('did:key:zBob', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.9 });
  const otherView = wcons(otherCtx, 'did:key:zME', 'did:key:zTarget'); // weights Bob (earned) → ~0.9
  assert.ok(meView.defined && otherView.defined);
  assert.ok(Math.abs(meView.value - otherView.value) > 0.5, 'the same vouch set yields receiver-relative wcons (no global rank)');
  try { fs.rmSync(STATE2, { recursive: true, force: true }); } catch { /* */ }
  w.cleanup();
});

// ---- everything SHADOW / advisory ----
test('TRUST is advisory (SHADOW): gates nothing, returns a finite estimate', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'a' } });
  const t = trust(w.meCtx, w.ME, 'did:key:zAlice');
  assert.equal(t.advisory, true);
  assert.ok(Number.isFinite(t.value));
  w.cleanup();
});

console.log(`\n[trust] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
