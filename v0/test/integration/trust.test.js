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
const { wcons, beats } = require('../../src/trust/consensus');
const { convert, disjointPaths } = require('../../src/trust/convert');
const { independenceLabel, mayGate, epistemicIndependence, configStability } = require('../../src/independence/weak-flag');
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

// ---- CONSENSUS F4 (#80): a persona REVISION supersedes its stale vouch (recency, not readdir order) ----
test('wcons F4: a persona revision (lower value, higher t) supersedes its stale vouch', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  for (let i = 0; i < 10; i++) w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'earned' + i } });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.95 }, { t: 2000 });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.02 }, { t: 5000 });
  const r = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(r.defined);
  assert.ok(Math.abs(r.value - 0.02) < 1e-9, 'the revision (0.02 @t=5000) must win, not the stale 0.95; got ' + r.value);
  w.cleanup();
});

test('wcons F4: the revision wins regardless of EMIT order (no readdir/content-hash artifact)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  for (let i = 0; i < 10; i++) w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'e' + i } });
  // emit the NEWER (higher-t) vouch FIRST, the older one second — recency (t), not order, must decide
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.02 }, { t: 5000 });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.95 }, { t: 2000 });
  const r = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(Math.abs(r.value - 0.02) < 1e-9, 'higher-t vouch wins regardless of emission order; got ' + r.value);
  w.cleanup();
});

test('wcons F4: a REVOCATION (revise to 0) is reflected, not silently dropped', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  for (let i = 0; i < 10; i++) w.emit('did:key:zAlice', 'CLAIM', { claim: { content: 'c' + i } });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 1.0 }, { t: 1000 });
  w.emit('did:key:zAlice', 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.0 }, { t: 9000 });
  const r = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(r.defined && r.value < 1e-9, 'the revocation to 0 must be reflected; got ' + r.value);
  w.cleanup();
});

test('wcons F4: two personas of ONE human tie on w; RECENCY (not value) picks the representative (value-blind end-to-end)', () => {
  const w = freshWorld();
  // two personas of ONE human with IDENTICAL claim histories -> direct() gives an exactly-equal w for both
  const P1 = w.addUnder('did:key:zD1', 'human:dana');
  const P2 = w.addUnder('did:key:zD2', 'human:dana');
  for (let i = 0; i < 5; i++) { w.emit(P1, 'CLAIM', { claim: { content: 'h' + i } }); w.emit(P2, 'CLAIM', { claim: { content: 'h' + i } }); }
  // P1 vouches HIGH but OLD; P2 vouches LOW but NEW. If VALUE drove the tie, 0.9 would win — recency must pick 0.1.
  w.emit(P1, 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.9 }, { t: 1000 });
  w.emit(P2, 'VOUCH', { target_persona: 'did:key:zTarget', value: 0.1 }, { t: 8000 });
  const r = wcons(w.meCtx, w.ME, 'did:key:zTarget');
  assert.ok(r.defined);
  // one human collapses to ONE voucher; the NEWER (t=8000) vouch represents them -> ~0.1, not 0.9 (value-blind)
  assert.ok(Math.abs(r.value - 0.1) < 1e-9, 'recency (t), not vouch value, must pick the human representative; got ' + r.value);
  w.cleanup();
});

// ---- F4 beats() comparator — direct unit tests (deterministic; no signed-frame world needed) ----
const RID = (s) => s.padEnd(64, '0'); // a stand-in 64-char record_id for lexicographic ordering

test('beats: no incumbent -> the first record always wins', () => {
  assert.equal(beats(0.5, { t: 1, seq: 1, record_id: RID('a') }, null), true);
});

test('beats: greater weight wins; recency is irrelevant when weights differ', () => {
  assert.equal(beats(0.9, { t: 1, seq: 1, record_id: RID('a') }, { weight: 0.5, t: 999, seq: 999, record_id: RID('z') }), true);
  assert.equal(beats(0.4, { t: 999, seq: 999, record_id: RID('z') }, { weight: 0.5, t: 1, seq: 1, record_id: RID('a') }), false);
});

test('beats: weight tie -> higher t wins EVEN with a LOWER seq (t is primary; seq resets across sessions)', () => {
  const w = 0.5;
  assert.equal(beats(w, { t: 5000, seq: 1, record_id: RID('a') }, { weight: w, t: 2000, seq: 99, record_id: RID('z') }), true);
});

test('beats: weight+t tie -> higher seq wins (same-session recency hint)', () => {
  const w = 0.5;
  assert.equal(beats(w, { t: 100, seq: 7, record_id: RID('a') }, { weight: w, t: 100, seq: 3, record_id: RID('z') }), true);
});

test('beats: weight+t+seq tie -> record_id lexicographic total order (the determinism FLOOR; no readdir dep)', () => {
  const w = 0.5;
  assert.equal(beats(w, { t: 1, seq: 1, record_id: RID('b') }, { weight: w, t: 1, seq: 1, record_id: RID('a') }), true);
  assert.equal(beats(w, { t: 1, seq: 1, record_id: RID('a') }, { weight: w, t: 1, seq: 1, record_id: RID('b') }), false);
});

test('beats: t/seq ABSENT on both -> falls through to record_id (never readdir order)', () => {
  const w = 0.5;
  assert.equal(beats(w, { record_id: RID('b') }, { weight: w, record_id: RID('a') }), true);
  assert.equal(beats(w, { record_id: RID('a') }, { weight: w, record_id: RID('b') }), false);
});

test('beats: NaN/Infinity/undefined t or seq fall to -Infinity (Number.isFinite guard), never crash', () => {
  const w = 0.5;
  // NaN t on the challenger -> -Infinity; incumbent has a real t -> the challenger does NOT beat it
  assert.equal(beats(w, { t: NaN, seq: NaN, record_id: RID('z') }, { weight: w, t: 10, seq: 1, record_id: RID('a') }), false);
  // Infinity is NOT finite -> both -Infinity t -> fall through to record_id ('b' > 'a')
  assert.equal(beats(w, { t: Infinity, record_id: RID('b') }, { weight: w, t: Infinity, record_id: RID('a') }), true);
});

test('beats: RESIDUAL — no-t + a session-reset (lower) seq lets a stale vouch outlive a later revision (why t is primary)', () => {
  // NAMED residual (VERIFY board): when an emitter omits t AND seq resets across a session boundary, the later
  // revision arrives with a LOWER seq and loses to the stale vouch. record_id still guarantees DETERMINISM (no
  // readdir dependence) — only the recency GUARANTEE degrades without t. Forward-contract: a kernel-stamped
  // receive-time closes this before wcons ever gates. This test PINS the current (accepted) behavior.
  const w = 0.5;
  const laterRevision = { record_id: RID('a'), seq: 1 };          // t absent; reset session-2 seq
  const staleVouch = { weight: w, record_id: RID('z'), seq: 99 }; // t absent; higher session-1 seq
  assert.equal(beats(w, laterRevision, staleVouch), false, 'without t, a reset-seq later revision cannot supersede the stale vouch — the documented residual');
});

test('beats: VALUE-BLIND by construction — the comparator takes no vouch-value parameter (Q1: no persona-mult lever)', () => {
  // structural guarantee: a weight tie between two personas of one human resolves by t/seq/record_id ONLY, so a
  // high-value vouch cannot win on value alone. beats(w, vch, prev) has exactly 3 params — value is never passed.
  assert.equal(beats.length, 3, 'beats must take exactly (w, vch, prev) — no value arg');
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

// ---- derivation guard (plans/12): independenceLabel DERIVES every open-axis verdict from its lift-point,
// never a hardcoded literal. Proves WIRING via sentinel-INJECTION (a plain === would pass vacuously today —
// both sides are literally 'WEAK'). RED against the pre-refactor hardcoded label; GREEN once the label reads
// the injected verdict fns (default = the lift-points). This is the seam the U2 estimator swaps in at P5.
test('DERIVATION GUARD: independenceLabel derives epistemic + config_stability from the lift-points (not literals)', () => {
  // sentinel-injection proves the wiring (NOT coincident 'WEAK' values): a stubbed verdict fn must reach the label.
  const injected = independenceLabel({ topological: 99 }, { verdictFn: () => 'STRONG-TEST', configFn: () => 'CONF-TEST' });
  assert.equal(injected.epistemic, 'STRONG-TEST', 'epistemic DERIVES from the injected verdict fn (the U2 lift-point seam)');
  assert.equal(injected.config_stability, 'CONF-TEST', 'config_stability DERIVES from the injected config fn (its sibling lift-point seam)');
  // default args ⇒ the label IS the lift-point verdict (the single-source-of-truth identity, the P5-swap guard)
  assert.equal(independenceLabel({ topological: 99 }).epistemic, epistemicIndependence(), 'default epistemic IS the lift-point verdict');
  assert.equal(independenceLabel({ topological: 99 }).config_stability, configStability(), 'default config_stability IS the sibling lift-point verdict');
  // a strong topological COUNT alone never flips overall (topological is a count, not a verdict — the L4 landmine).
  // NOTE: this does NOT prove `overall` is DERIVED — both ternary branches are 'WEAK' today, so this passes
  // against a hardcoded literal too. A future wave defining non-WEAK overall semantics MUST add a sentinel
  // assertion exercising the non-WEAK branch, else it silently re-introduces a literal (VALIDATE code-rev MED).
  assert.equal(independenceLabel({ topological: 999 }).overall, 'WEAK', 'a strong topological count alone does NOT flip overall');
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
