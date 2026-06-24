#!/usr/bin/env node
'use strict';

// PACT U1 — stake S5 tests (plans/22 §3 — the executable contract). TDD: written FIRST as the spec.
// S5 wires stake-state into convert as ONE advisory funded-root axis (`funded_root`), read via a DI-injected
// anchor. SHADOW: `convert.actionable` STAYS false; the axis NEVER feeds the gate. The load-bearing tests are the
// NON-VACUOUS SHADOW guard (a LOCKED stake + STRONG topology STILL yields actionable:false — and the test proves
// the precondition is LIVE so it can't pass against a funded_root:null build), axis separation (independence /
// topological identical with/without the axis), the hostile-anchor quarantine, and the null tri-state.
// NARROWS, does not harden (plans/22 §0).

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { computeRecordId } = require('../../src/lib/record');
const { createStakeAnchor } = require('../../src/trust/stake-anchor');
const { convert } = require('../../src/trust/convert');
const { mayGate } = require('../../src/independence/weak-flag');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-s5-'));
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
  const storeOpts = { receiverId: ME, stateDir: STATE };
  const anchor = createStakeAnchor({ registry });
  // emit a SIGNED frame from src into ME's store (a STAKE is just type:'STAKE', payload {lock_expiry}).
  function emit(src, type, payload) {
    const p = personas[src];
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: seq++, nonce: 'n' + seq, payload }, { privateKeyPem: p.kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, storeOpts);
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  // plant an UNSIGNED STAKE for src's root straight into ME's store (verifiedRecords must drop it).
  function plantUnsignedStake(src, lockExpiry) {
    const p = personas[src];
    const body = { ver: 'pact/0', type: 'STAKE', src_persona_did: src, parent_human_uid: p.human, seq: seq++, nonce: 'p' + seq, payload: { lock_expiry: lockExpiry } };
    const ap = appendRecord({ ...body, record_id: computeRecordId(body) }, storeOpts);
    if (!ap.ok) throw new Error('plant: ' + ap.reason);
  }
  // build the canonical 2-vertex-disjoint-path topology me->alice->TARGET + me->bob->TARGET (disjoint_paths=2).
  function strongTopologyTo(target) {
    add('did:key:zAlice'); add('did:key:zBob');
    emit(ME, 'VOUCH', { target_persona: 'did:key:zAlice', value: 1 });
    emit(ME, 'VOUCH', { target_persona: 'did:key:zBob', value: 1 });
    emit('did:key:zAlice', 'VOUCH', { target_persona: target, value: 1 });
    emit('did:key:zBob', 'VOUCH', { target_persona: target, value: 1 });
  }
  const baseCtx = { registry, storeOpts };
  function ctx(extra) { return { ...baseCtx, ...(extra || {}) }; } // a meCtx with optional anchor/nowMs
  return { STATE, registry, ME, anchor, storeOpts, baseCtx, ctx, add, addUnder, emit, plantUnsignedStake, strongTopologyTo,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } } };
}

// ===================== the funded-root axis surfaces =====================

test('funded_root: a custody-signed LOCKED stake for the agent root surfaces {status:locked}', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 5000 });
  const c = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  assert.equal(c.funded_root.status, 'locked');
  assert.equal(c.funded_root.lockedUntil, 5000);
  w.cleanup();
});

test('funded_root: a registered agent with NO stake surfaces {status:none}', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  const c = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  assert.deepEqual(c.funded_root, { status: 'none', lockedUntil: null });
  w.cleanup();
});

// ===================== the SHADOW guard (NON-VACUOUS — load-bearing) =====================

test('SHADOW guard: a LOCKED stake + STRONG topology STILL yields actionable:false (precondition proven LIVE)', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.strongTopologyTo('did:key:zTarget');                 // me->alice->target + me->bob->target = 2 disjoint paths
  w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 9e12 });
  const c = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  // (1) PRECONDITION is LIVE — else the guard below would pass vacuously against a funded_root:null / weak build.
  assert.equal(c.funded_root.status, 'locked', 'precondition: the stake axis is actually LOCKED');
  assert.equal(c.meets_topological, true, 'precondition: topology is actually STRONG (>= K disjoint paths)');
  // (2) and YET nothing gates — the funded + topologically-strong agent stays SHADOW.
  assert.equal(c.actionable, false, 'actionable must NOT flip (INV-16) even when funded + topologically strong');
  assert.equal(c.independence.overall, 'WEAK');
  assert.equal(mayGate(c.independence, { highStakes: true }), false, 'high-stakes stays refused; the axis unlocks nothing');
  w.cleanup();
});

// ===================== axis separation (axis-1 != axis-4 — TEST-ENFORCED) =====================

test('axis separation: funded_root does NOT change disjoint_paths / meets_topological / independence', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.strongTopologyTo('did:key:zTarget');
  w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 9e12 });
  const withAxis = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  const without = convert(w.ctx(), w.ME, 'did:key:zTarget'); // no anchor
  assert.equal(withAxis.disjoint_paths, without.disjoint_paths);
  assert.equal(withAxis.meets_topological, without.meets_topological);
  assert.deepEqual(withAxis.independence, without.independence);
  assert.equal(withAxis.actionable, without.actionable);
  // only funded_root differs: the locked axis vs the unavailable null.
  assert.equal(withAxis.funded_root.status, 'locked');
  assert.equal(without.funded_root, null);
  w.cleanup();
});

test('hostile-anchor quarantine: a LYING anchor corrupts only the advisory field, never the gate', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.strongTopologyTo('did:key:zTarget'); // NO real stake minted
  const lyingAnchor = { stakeOf: () => ({ status: 'locked', lockedUntil: 9e12 }) }; // claims locked for anyone
  const lied = convert(w.ctx({ anchor: lyingAnchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  const honest = convert(w.ctx(), w.ME, 'did:key:zTarget');
  assert.equal(lied.funded_root.status, 'locked', 'the lie reaches the advisory field');
  // ...but the gate is unmoved: actionable/independence identical to the no-anchor world.
  assert.equal(lied.actionable, false);
  assert.deepEqual(lied.independence, honest.independence);
  assert.equal(mayGate(lied.independence, { highStakes: true }), false);
  w.cleanup();
});

// ===================== S5 x S4 composition: 'slashed' flows through the open-enum axis (phase-close gate) =====================

test('S4 composition: slashing the agent root flips funded_root locked -> slashed; actionable STAYS false', () => {
  // The cross-PR seam the per-wave VALIDATEs could not assert (S5 #17 built before S4 #18): a slashed root must
  // surface through the S5 open-enum passthrough unchanged, and STILL never gate. Non-vacuous: proven LIVE pre-slash.
  const w = freshWorld();
  w.add('did:key:zTarget');
  const X = w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 9e12 }).record_id; // the agent's REAL locked stake
  // (1) PRECONDITION proven LIVE: before any slash the funded axis reads 'locked' (so the flip below is non-vacuous).
  const before = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  assert.equal(before.funded_root.status, 'locked', 'precondition: the agent root is funded (locked) pre-slash');
  // (2) 2 distinct EARNED-STANDING human roots crater X (each: a CLAIM for standing + a SLASH naming the real stake id).
  w.add('did:key:zS1'); w.emit('did:key:zS1', 'CLAIM', { claim: { content: 'interacted' } });
  w.add('did:key:zS2'); w.emit('did:key:zS2', 'CLAIM', { claim: { content: 'interacted' } });
  w.emit('did:key:zS1', 'SLASH', { target_stake_id: X, reason: 'defected on the commitment' });
  w.emit('did:key:zS2', 'SLASH', { target_stake_id: X, reason: 'corroborated defection' });
  // (3) the open-enum axis passes the new S4 'slashed' status through unchanged (NEVER a closed-set switch)...
  const after = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  assert.equal(after.funded_root.status, 'slashed', 'S4 slashed flows through the S5 passthrough (cross-PR seam)');
  // ...and YET nothing gates — a slashed root never flips actionable (INV-16; the axis informs, never gates).
  assert.equal(after.actionable, false, 'a slashed root NEVER flips the gate');
  w.cleanup();
});

// ===================== provenance reuse (inherits the S1-S2 gate) =====================

test('provenance: a forged UNSIGNED stake for the agent root does NOT surface as funded', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.plantUnsignedStake('did:key:zTarget', 9e12); // unsigned -> dropped by verifiedRecords
  const c = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  assert.equal(c.funded_root.status, 'none', 'an unsigned stake is dropped; the axis does not launder it into funded');
  w.cleanup();
});

// ===================== receiver-relative (NS-3 — no global rank) =====================

test('receiver-relative: two receivers see DIFFERENT funded_root for the same agent', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 9e12 }); // lands in ME's store only
  const meView = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  // a DISTINCT receiver over its OWN (empty) store — did NOT receive the agent's STAKE.
  const STATE2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-s5b-'));
  _allDirs.push(STATE2);
  const otherCtx = { registry: w.registry, storeOpts: { receiverId: 'did:key:zOther', stateDir: STATE2 }, anchor: w.anchor, nowMs: 0 };
  const otherView = convert(otherCtx, 'did:key:zOther', 'did:key:zTarget');
  assert.equal(meView.funded_root.status, 'locked');
  assert.equal(otherView.funded_root.status, 'none', 'a receiver without the STAKE sees no funded-root — no global rank');
  w.cleanup();
});

// ===================== clock + tri-state + backward-compat + boundary =====================

test('finite-clock: an EXPIRED stake read with a finite nowMs >= lockedUntil surfaces unlocked (convert forwards the clock)', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 5000 });
  assert.equal(convert(w.ctx({ anchor: w.anchor, nowMs: 4999 }), w.ME, 'did:key:zTarget').funded_root.status, 'locked');
  assert.equal(convert(w.ctx({ anchor: w.anchor, nowMs: 5000 }), w.ME, 'did:key:zTarget').funded_root.status, 'unlocked');
  w.cleanup();
});

test('tri-state: null (no/broken/throwing/malformed anchor) is DISTINCT from {status:none} (wired, unfunded)', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  const noAnchor = convert(w.ctx(), w.ME, 'did:key:zTarget').funded_root;
  const brokenAnchor = convert(w.ctx({ anchor: { stakeOf: 'not-a-fn' }, nowMs: 0 }), w.ME, 'did:key:zTarget').funded_root;
  const throwingAnchor = convert(w.ctx({ anchor: { stakeOf: () => { throw new Error('S6 net down'); } }, nowMs: 0 }), w.ME, 'did:key:zTarget').funded_root;
  const malformedAnchor = convert(w.ctx({ anchor: { stakeOf: () => 'allow' }, nowMs: 0 }), w.ME, 'did:key:zTarget').funded_root; // non-object return
  const unregistered = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zNobody').funded_root; // not in registry
  assert.equal(noAnchor, null, 'no anchor -> UNAVAILABLE (null)');
  assert.equal(brokenAnchor, null, 'broken anchor (no stakeOf fn) -> UNAVAILABLE (null), not a throw');
  assert.equal(throwingAnchor, null, 'a THROWING anchor -> UNAVAILABLE (null), not a convert-wide throw');
  assert.equal(malformedAnchor, null, 'a malformed (non-{status}) return is contained to null, never a raw "allow"');
  assert.deepEqual(unregistered, { status: 'none', lockedUntil: null }, 'wired but unregistered agent -> none');
  assert.notDeepEqual(noAnchor, unregistered, 'null !== {status:none} — not interchangeable');
  w.cleanup();
});

test('a THROWING anchor does NOT DoS convert: the gate-relevant fields are still computed', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.strongTopologyTo('did:key:zTarget');
  const throwing = { stakeOf: () => { throw new Error('boom'); } };
  let c;
  assert.doesNotThrow(() => { c = convert(w.ctx({ anchor: throwing, nowMs: 0 }), w.ME, 'did:key:zTarget'); }, 'a bad advisory anchor must not deny the whole readout');
  const baseline = convert(w.ctx(), w.ME, 'did:key:zTarget');
  assert.equal(c.funded_root, null);                          // axis unavailable
  assert.equal(c.disjoint_paths, baseline.disjoint_paths);    // gate fields intact
  assert.equal(c.meets_topological, baseline.meets_topological);
  assert.deepEqual(c.independence, baseline.independence);
  assert.equal(c.actionable, false);
  w.cleanup();
});

test('backward-compat: with NO anchor, the pre-S5 fields are unchanged and funded_root is null', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.strongTopologyTo('did:key:zTarget');
  const c = convert(w.ctx(), w.ME, 'did:key:zTarget');
  assert.equal(c.advisory, true);
  assert.equal(c.actionable, false);
  assert.equal(c.disjoint_paths, 2);
  assert.equal(c.meets_topological, true);
  assert.equal(c.independence.overall, 'WEAK');
  assert.equal(c.funded_root, null);
  w.cleanup();
});

test('immutable: mutating funded_root does not affect a second convert read', () => {
  const w = freshWorld();
  w.add('did:key:zTarget');
  w.emit('did:key:zTarget', 'STAKE', { lock_expiry: 9e12 });
  const c1 = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  c1.funded_root.status = 'TAMPERED';
  const c2 = convert(w.ctx({ anchor: w.anchor, nowMs: 0 }), w.ME, 'did:key:zTarget');
  assert.equal(c2.funded_root.status, 'locked');
  w.cleanup();
});

console.log('[convert-stake] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
