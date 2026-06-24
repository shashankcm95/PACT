#!/usr/bin/env node
'use strict';

// PACT U1 — STAKE-ARC DEFINITION-OF-DONE acceptance test (plans/18 §2; the phase-close gate's acceptance leg).
//
//   The full issuance-stake lifecycle composes end-to-end AND stays SHADOW: custody-mint a STAKE ->
//   stakeOf derives it on read -> issuance-policy + convert read it (a REGISTRY, never a gate) ->
//   2 distinct earned-standing roots SLASH it (the crater quorum) -> 'slashed' flows back into BOTH
//   consumers, and NOTHING ever gates (actionable=false, gates=false, high-stakes refused).
//
// The seam-by-seam unit/integration tests verify the PARTS; THIS asserts the WHOLE walk as one scenario.
// Each DS-property is a CONCRETE, NON-VACUOUS forcing assertion (negative controls are inline: DS1 a forged
// stake, DS4 a sub-quorum). The arc NARROWS, it does not harden (OQ-NS-6): every "funded" reading is an
// in-process, zero-cost marker until S6 deploys a really-slashable stake. SHADOW throughout.
//   DS1 provenance-gated STAKE · DS2 issuance-policy reads it (registry, not a gate) · DS3 convert axis +
//   the SHADOW invariant · DS4 the crater-quorum SLASH · DS5 'slashed' composes into both consumers ·
//   DS6 the SHADOW seal (no gate flips across the whole walk). All DS1..DS6 green = the S1-S5 arc is done.

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { createMinter } = require('../../src/identity/minter');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { computeRecordId } = require('../../src/lib/record');
const { buildStakeSpec } = require('../../src/identity/stake');
const { buildSlashSpec } = require('../../src/identity/slash');
const { createStakeAnchor } = require('../../src/trust/stake-anchor');
const { createIssuancePolicy } = require('../../src/trust/issuance-policy');
const { convert } = require('../../src/trust/convert');
const { mayGate } = require('../../src/independence/weak-flag');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
function signerFor(pem) {
  return (rid) => crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(pem)).toString('base64');
}

const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

let SEQ = 0;
function mkWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-u1-dod-'));
  _allDirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {};
  function addUnder(did, human) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    return did;
  }
  function add(did) { return addUnder(did, 'human:' + did); } // each DID its own root
  const ME = add('did:key:zME');
  const storeOpts = { receiverId: ME, stateDir: STATE };
  const anchor = createStakeAnchor({ registry });
  function emit(src, type, payload) {
    const p = personas[src];
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: SEQ++, nonce: 'n' + SEQ, payload }, { privateKeyPem: p.kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, storeOpts);
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  function mintViaCustody(src, spec) {
    const p = personas[src];
    const minter = createMinter({ signer: signerFor(p.kp.privateKeyPem), personaDid: src, humanUid: p.human });
    const r = minter.mint(spec);
    if (!r.ok) throw new Error('mint: ' + r.reason);
    const ap = appendRecord(r.frame, storeOpts);
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return r.frame;
  }
  function mintStake(src, lockExpiry) { return mintViaCustody(src, buildStakeSpec({ lockExpiry, seq: SEQ++, nonce: 's' + SEQ })); }
  function mintSlash(src, targetStakeId, reason) { return mintViaCustody(src, buildSlashSpec({ targetStakeId, reason, seq: SEQ++, nonce: 'x' + SEQ })); }
  function earn(src) { return emit(src, 'CLAIM', { claim: { content: 'interacted' } }); } // >=1 CLAIM = earned standing
  function earnedSlasher(did) { add(did); earn(did); return did; }
  function plantUnsignedStake(src, lockExpiry) { // a forged STAKE straight into the store (verifiedRecords must drop it)
    const p = personas[src];
    const body = { ver: 'pact/0', type: 'STAKE', src_persona_did: src, parent_human_uid: p.human, seq: SEQ++, nonce: 'p' + SEQ, payload: { lock_expiry: lockExpiry } };
    const ap = appendRecord({ ...body, record_id: computeRecordId(body) }, storeOpts);
    if (!ap.ok) throw new Error('plant: ' + ap.reason);
  }
  function strongTopologyTo(target) { // me->alice->target + me->bob->target = 2 vertex-disjoint paths
    add('did:key:zAlice'); add('did:key:zBob');
    emit(ME, 'VOUCH', { target_persona: 'did:key:zAlice', value: 1 });
    emit(ME, 'VOUCH', { target_persona: 'did:key:zBob', value: 1 });
    emit('did:key:zAlice', 'VOUCH', { target_persona: target, value: 1 });
    emit('did:key:zBob', 'VOUCH', { target_persona: target, value: 1 });
  }
  const baseCtx = { registry, storeOpts };
  function ctx(extra) { return { ...baseCtx, ...(extra || {}) }; }
  return { STATE, registry, ME, storeOpts, anchor, add, emit, mintStake, mintSlash, earnedSlasher, plantUnsignedStake, strongTopologyTo, ctx };
}

// One evolving world: the integrated lifecycle walk DS1 -> DS6. Negative controls are inline so each DoD
// step is NON-VACUOUS. (The exhaustive negatives live in the integration tests; this is the scenario walk.)
const W = mkWorld();
const TARGET = W.add('did:key:zTarget');
const TROOT = 'human:did:key:zTarget';
let X = null; // TARGET's real STAKE record_id (captured at DS1, slashed at DS4)

test('DS1: a custody-minted STAKE reads locked; a forged UNSIGNED stake (later expiry) is DROPPED, not laundered', () => {
  X = W.mintStake(TARGET, 9e12).record_id;
  const r1 = W.anchor.stakeOf(W.storeOpts, TROOT, 0);
  assert.equal(r1.status, 'locked', 'the custody-signed stake is derived-on-read');
  assert.equal(r1.lockedUntil, 9e12, 'the signed stake sets lockedUntil');
  W.plantUnsignedStake('did:key:zTarget', 9e13); // a LATER expiry — if it counted, max() would bump lockedUntil
  const r2 = W.anchor.stakeOf(W.storeOpts, TROOT, 0);
  assert.equal(r2.lockedUntil, 9e12, 'the forged stake is DROPPED (lockedUntil unchanged) — provenance gate, not laundered');
});

test('DS2: issuance-policy stake-required reads the stake (a REGISTRY, never a gate): staked meets, unstaked does not, gates:false', () => {
  const policy = createIssuancePolicy({ registry: W.registry, anchor: W.anchor, mode: 'stake-required' });
  const staked = policy.evaluate(W.storeOpts, TROOT, 0);
  assert.equal(staked.meets_policy, true, 'a known + staked root meets stake-required');
  assert.equal(staked.gates, false, 'issuance-policy gates NOTHING (registry, not an oracle)');
  W.add('did:key:zPoor'); // a known root with NO stake
  const unstaked = policy.evaluate(W.storeOpts, 'human:did:key:zPoor', 0);
  assert.equal(unstaked.meets_policy, false, 'a known but unstaked root does NOT meet (strict === locked, fail-closed)');
  assert.equal(unstaked.gates, false);
});

test('DS3: convert.funded_root surfaces the stake axis, and the SHADOW invariant holds (locked + strong topology, STILL actionable:false)', () => {
  W.strongTopologyTo(TARGET);
  const c = convert(W.ctx({ anchor: W.anchor, nowMs: 0 }), W.ME, TARGET);
  assert.equal(c.funded_root.status, 'locked', 'the advisory axis reflects the locked stake');
  assert.equal(c.meets_topological, true, 'precondition: topology is actually strong (so the guard below is NON-vacuous)');
  assert.equal(c.actionable, false, 'and YET nothing gates — funded + topologically strong stays SHADOW (INV-16)');
});

test('DS4: the crater quorum — 1 earned slasher does NOT crater; 2 DISTINCT earned roots DO (-> slashed)', () => {
  W.mintSlash(W.earnedSlasher('did:key:zS1'), X, 'defected on the commitment');
  assert.equal(W.anchor.stakeOf(W.storeOpts, TROOT, 0).status, 'locked', '1 slasher INFORMS, it does not crater');
  W.mintSlash(W.earnedSlasher('did:key:zS2'), X, 'corroborated defection');
  assert.equal(W.anchor.stakeOf(W.storeOpts, TROOT, 0).status, 'slashed', '2 distinct earned-standing roots crater the REAL stake');
});

test('DS5: the integrated lifecycle — slashed flows back into BOTH consumers, and STILL nothing gates', () => {
  const policy = createIssuancePolicy({ registry: W.registry, anchor: W.anchor, mode: 'stake-required' });
  const iss = policy.evaluate(W.storeOpts, TROOT, 0);
  assert.equal(iss.stake.status, 'slashed');
  assert.equal(iss.meets_policy, false, 'a slashed root FAILS stake-required (composes via the one stakeOf fold)');
  const c = convert(W.ctx({ anchor: W.anchor, nowMs: 0 }), W.ME, TARGET);
  assert.equal(c.funded_root.status, 'slashed', "and slashed flows through convert's open-enum axis unchanged");
  assert.equal(c.actionable, false, 'the slashed lifecycle is still SHADOW end-to-end');
});

test('DS6: the SHADOW seal — across the whole walk no gate flips (mayGate refuses high-stakes; the arc NARROWS, never hardens)', () => {
  const c = convert(W.ctx({ anchor: W.anchor, nowMs: 0 }), W.ME, TARGET);
  assert.equal(c.independence.overall, 'WEAK', 'independence is permanently WEAK while U2 is open');
  assert.equal(mayGate(c.independence, { highStakes: true }), false, 'high-stakes stays refused — the stake axis unlocks NOTHING');
  // DoD: the entire S1-S5 lifecycle is in-process NARROWING. A real forfeitable cost appears only at S6 (external).
});

console.log('[u1-stake-dod] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
