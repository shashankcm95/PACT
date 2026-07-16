#!/usr/bin/env node
'use strict';

// PACT v0 -- F6 Wave-2-CLEAN: the two-array crossVerify (plan 60, ADR-0003 Decision 4).
//
// creatorStanding + premiseScore fold a POSITIVE r-leg (crossVerify confirmations) and a NEGATIVE s-leg
// (contests) into opinion(r,s). Anchoring the WHOLE input would drop un-anchored CONTESTERs and RAISE trust
// (the NS-9 inversion). Wave-2-CLEAN anchors ONLY the CONFIRM accumulator (crossVerify's new 5th arg
// `anchoredRecs`); the s-leg, the crater >=2 root-count, the earned CLAIM gate, and the subject PREMISE
// binding all stay on the RAW array. This suite is the ARMED (regProvenance-present) witness set the VERIFY
// board mandated -- every s-site is asserted RAW, and the two co-arming / fail-open holes the hacker found
// (A9 detector+anchoring inversion; A10 falsy-5th-arg fail-open) are pinned RED-first.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');
const { signSigmaRoot } = require('../../src/identity/sigma-root');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { makePremise } = require('../../src/atms/claim');
const { verifiedRecords } = require('../../src/trust/read-gate');
const { authenticatedAnchoredRecordsFrom } = require('../../src/trust/authenticated-read');
const { expectation } = require('../../src/trust/opinion');
const { crossVerify } = require('../../src/grounding/cross-verify');
const { premiseScore } = require('../../src/grounding/premise-score');
const { creatorStanding } = require('../../src/grounding/creator-standing');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const SCOPE = { domain: 'test' };
const ME = 'did:key:zME';
const _dirs = [];
process.on('exit', () => { for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// A world where each persona is ANCHORED (registered root + a verifying sigma_root) or UNANCHORED
// (registered persona only -> its records DROP when regProvenance.sigmaRoots is armed). Mirrors f6-wave1.
function anchWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-f6w2-'));
  _dirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {}; // did -> { kp, human }
  const sigmaRoots = {}; // did -> sigma (ONLY anchored personas)
  let seq = 0;
  function addPersona(did, anchored, human = 'human:' + did) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    if (anchored) {
      const root = generateEdgeKeypair();
      reg.registerRoot(registry, { humanUid: human, rootPublicKeyPem: root.publicKeyPem });
      const sigma = signSigmaRoot({ personaDid: did, publicKeyPem: kp.publicKeyPem, controller: human }, { privateKeyPem: root.privateKeyPem });
      if (!sigma) throw new Error('fixture: sigma failed for ' + did);
      sigmaRoots[did] = sigma;
    }
    return did;
  }
  addPersona(ME, false);
  const meCtx = { registry, storeOpts: { receiverId: ME, stateDir: STATE } };
  const armedCtx = () => ({ ...meCtx, regProvenance: { sigmaRoots } });
  function emit(src, type, payload) {
    const p = personas[src];
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: seq++, nonce: 'n' + seq, payload }, { privateKeyPem: p.kp.privateKeyPem });
    if (!built.ok) throw new Error('build ' + type + ': ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: ME, stateDir: STATE });
    if (!ap.ok) throw new Error('append ' + type + ': ' + ap.reason);
  }
  function earn(did) { emit(did, 'CLAIM', { claim: { content: 'earns standing ' + did } }); }
  function raw() { return verifiedRecords(registry, meCtx.storeOpts); }
  return { registry, personas, meCtx, armedCtx, sigmaRoots, addPersona, emit, earn, raw };
}

// ---------- A6: DISARMED reference-identity (the SHADOW-safe property) ----------

test('A6 DISARMED reference-identity: authenticatedAnchoredRecordsFrom(raw, meCtx) === raw (same array, single read)', () => {
  const w = anchWorld();
  w.addPersona('did:key:zA', true);
  w.emit('did:key:zA', 'CLAIM', { claim: { content: 'x' } });
  const raw = w.raw();
  assert.ok(raw.length >= 1, 'precondition: the store has a record (non-vacuous)');
  // both filters `return recs` unchanged disarmed -> the From-variant returns the SAME ARRAY REFERENCE, so the
  // Wave-2 callers' r-leg reads the identical array their s-leg does (byte-identity strengthened to ===).
  assert.equal(authenticatedAnchoredRecordsFrom(raw, w.meCtx.registry, w.meCtx), raw, 'disarmed From returns the input array reference');
});

// ---------- primary narrowing drivers (RED against the pre-Wave-2 impl, which never anchors these folds) ----------

test('premiseScore narrows: an un-anchored CONFIRMer drops armed -> r-leg narrows -> E_armed < E_disarmed', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zK', true);    // anchored confirmer
  w.addPersona('did:key:zU', false);   // UN-anchored confirmer -> drops armed
  w.earn('did:key:zK'); w.earn('did:key:zU');
  const prem = makePremise({ statement: 'narrow', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 'narrow', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zU', 'CONFIRM', { target_premise_id: prem.id });
  const disarmed = premiseScore(prem.id, w.meCtx);
  const armed = premiseScore(prem.id, w.armedCtx());
  assert.ok(disarmed.r > armed.r, 'the un-anchored confirmer is counted disarmed, dropped armed');
  assert.ok(expectation(armed) < expectation(disarmed), 'armed E strictly narrows (NS-9)');
});

test('creatorStanding narrows: an un-anchored CONFIRMer on the human premise drops armed -> standing narrows', () => {
  const w = anchWorld();
  const H = 'human:did:key:zC';
  w.addPersona('did:key:zC', true, H);
  w.addPersona('did:key:zK', true);    // anchored confirmer
  w.addPersona('did:key:zU', false);   // UN-anchored confirmer
  w.earn('did:key:zK'); w.earn('did:key:zU');
  const prem = makePremise({ statement: 'cs', scope: SCOPE, creator: H });
  w.emit('did:key:zC', 'PREMISE', { statement: 'cs', scope: SCOPE, creator: H });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zU', 'CONFIRM', { target_premise_id: prem.id });
  const disarmed = creatorStanding(H, w.meCtx);
  const armed = creatorStanding(H, w.armedCtx());
  assert.equal(disarmed.n_premises, 1, 'the human owns 1 premise');
  assert.ok(armed.standing < disarmed.standing, 'armed standing strictly narrows (the un-anchored confirm drops)');
});

// ---------- A1: the negative s-leg stays RAW (the core anti-inversion witness) ----------

test('A1 premiseScore: an un-anchored CONTEST stays counted armed (s-leg RAW) -> E_armed == E_disarmed, no inversion', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zCon', false);   // UN-anchored contester -> WOULD drop if the s-leg anchored
  w.earn('did:key:zCon');
  const prem = makePremise({ statement: 'a1', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 'a1', scope: SCOPE, creator });
  w.emit('did:key:zCon', 'CONTEST', { target_premise_id: prem.id, target_persona: 'did:key:zC' });
  const disarmed = premiseScore(prem.id, w.meCtx);
  const armed = premiseScore(prem.id, w.armedCtx());
  assert.ok(disarmed.s > 0, 'precondition: the un-anchored contest is counted disarmed (non-vacuous)');
  assert.equal(armed.s, disarmed.s, 's-leg is RAW -> the un-anchored CONTEST is NOT dropped armed');
  assert.ok(expectation(armed) <= expectation(disarmed) + 1e-12, 'armed does not RISE (no inversion)');
});

// ---------- A2: the SUBJECT-premise SET iteration stays RAW (the aggregate must not drop a net-negative premise) ----------

test('A2 creatorStanding: an un-anchored SUBJECT premise with >=2 craters stays in the aggregate -> E_armed <= E_disarmed', () => {
  const w = anchWorld();
  const H = 'human:H';
  w.addPersona('did:key:zP1', true, H);    // anchored persona of H
  w.addPersona('did:key:zP2', false, H);   // UN-anchored persona of H -> its PREMISE record drops if the SET iteration anchored
  w.addPersona('did:key:zGood', true);     // anchored confirmer of P1
  w.addPersona('did:key:zX', true);        // anchored earned contester 1
  w.addPersona('did:key:zY', true);        // anchored earned contester 2
  w.earn('did:key:zGood'); w.earn('did:key:zX'); w.earn('did:key:zY');
  const p1 = makePremise({ statement: 'p1', scope: SCOPE, creator: H });
  const p2 = makePremise({ statement: 'p2', scope: SCOPE, creator: H });
  w.emit('did:key:zP1', 'PREMISE', { statement: 'p1', scope: SCOPE, creator: H });   // net POSITIVE
  w.emit('did:key:zGood', 'CONFIRM', { target_premise_id: p1.id });
  w.emit('did:key:zP2', 'PREMISE', { statement: 'p2', scope: SCOPE, creator: H });   // net NEGATIVE (crater)
  w.emit('did:key:zX', 'CONTEST', { target_premise_id: p2.id, target_persona: 'did:key:zP2' });
  w.emit('did:key:zY', 'CONTEST', { target_premise_id: p2.id, target_persona: 'did:key:zP2' });
  const disarmed = creatorStanding(H, w.meCtx);
  const armed = creatorStanding(H, w.armedCtx());
  assert.equal(disarmed.n_premises, 2, 'both premises are subjects disarmed');
  assert.equal(armed.n_premises, 2, 'the un-anchored SUBJECT premise STAYS in the aggregate armed (raw iteration)');
  assert.ok(armed.standing <= disarmed.standing + 1e-12, 'dropping a net-negative premise would RAISE standing -- must not (NS-9)');
});

// ---------- A3: the crater >=2 root-count stays RAW (the sharp 3x lever) ----------

test('A3 creatorStanding: an un-anchored 2nd contester keeps the crater >=2 armed (root-count RAW) -> s does not shrink', () => {
  const w = anchWorld();
  const H = 'human:H3';
  w.addPersona('did:key:zC3', true, H);
  w.addPersona('did:key:zX3', true);      // anchored earned contester
  w.addPersona('did:key:zU3', false);     // UN-anchored earned contester -> if the root-count anchored, 2->1 loses the 3x crater
  w.earn('did:key:zX3'); w.earn('did:key:zU3');
  const prem = makePremise({ statement: 'a3', scope: SCOPE, creator: H });
  w.emit('did:key:zC3', 'PREMISE', { statement: 'a3', scope: SCOPE, creator: H });
  w.emit('did:key:zX3', 'CONTEST', { target_premise_id: prem.id, target_persona: 'did:key:zC3' });
  w.emit('did:key:zU3', 'CONTEST', { target_premise_id: prem.id, target_persona: 'did:key:zC3' });
  const disarmed = creatorStanding(H, w.meCtx);
  const armed = creatorStanding(H, w.armedCtx());
  assert.ok(disarmed.contested, 'precondition: contested disarmed');
  // the crater fires on >=2 distinct EARNED human roots; both stay counted armed (raw root-count) -> the
  // craterized s is IDENTICAL, so standing does not RISE by losing the 3x multiplier.
  assert.ok(armed.standing <= disarmed.standing + 1e-12, 'the crater holds armed (root-count RAW) -- no inversion');
  assert.equal(armed.opinion.s, disarmed.opinion.s, 's-leg (craterized) is RAW -> identical armed/disarmed');
});

// ---------- A5: the subject-PREMISE binding reads the RAW gate (regression guard vs a gate->confirmSet switch) ----------

test('A5 raw premise-binding: an UN-anchored creator PREMISE + an anchored earned CONFIRM -> armed r>0 (gate reads RAW)', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zCr';
  w.addPersona('did:key:zCr', false);   // UN-anchored creator -> its PREMISE record DROPS from the anchored set
  w.addPersona('did:key:zK', true);     // anchored earned confirmer -> its CONFIRM survives arming
  w.earn('did:key:zK');
  const prem = makePremise({ statement: 'a5', scope: SCOPE, creator });
  w.emit('did:key:zCr', 'PREMISE', { statement: 'a5', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  // ARMED: findBoundPremise reads the RAW gate, so the un-anchored creator's PREMISE is STILL found; the anchored
  // confirmer's CONFIRM counts -> r>0. If findBoundPremise were switched from `gate` to `confirmSet` (anchored),
  // the un-anchored premise would drop -> FLOOR r=0 -- this witness trips RED on that regression.
  const armed = premiseScore(prem.id, w.armedCtx());
  assert.ok(armed.r > 0, 'the subject-premise binding is found on the RAW gate even when the creator is un-anchored');
});

// ---------- A9: co-armed anchoring + entanglement-detector must NOT invert the r-leg (the HIGH the board found) ----------

test('A9 co-armed detector+anchoring: r_armed <= r_disarmed (anchoring skipped while the detector is present)', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zCr';
  w.addPersona('did:key:zCr', true);
  w.addPersona('did:key:zA', true);    // anchored earned confirmer
  w.addPersona('did:key:zB', true);    // anchored earned confirmer
  w.addPersona('did:key:zLp', false);  // UN-anchored LINCHPIN confirmer -> drops when anchoring arms
  w.earn('did:key:zA'); w.earn('did:key:zB'); w.earn('did:key:zLp');
  const prem = makePremise({ statement: 'coarm', scope: SCOPE, creator });
  w.emit('did:key:zCr', 'PREMISE', { statement: 'coarm', scope: SCOPE, creator });
  w.emit('did:key:zA', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zB', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zLp', 'CONFIRM', { target_premise_id: prem.id });
  // the detector collapses the confirmer set to ONE cluster IFF all 3 confirmers are present (the linchpin is
  // in the set). Drop the linchpin (anchoring) and the survivors ESCAPE the collapse -> r RISES. That is the
  // non-commuting anchor-then-demote inversion.
  const trioDetector = (cs) => (cs.length >= 3 ? { flag: 'ENTANGLEMENT-DETECTED', entangled: [[...cs]] } : 'WEAK');
  const raw = w.raw();
  // disarmed baseline = detector ON, anchoring OFF (confirmSet = raw {A,B,Lp}) -> collapse -> small r
  const disarmedCtx = { ...w.meCtx, entanglementDetector: trioDetector };
  const rDisarmed = crossVerify(prem.id, disarmedCtx, undefined, raw, raw).r;
  // co-armed = detector ON, anchoring ON. WITHOUT the leaf guard, confirmSet = anchored {A,B} escapes the
  // collapse (r=2 > 1). WITH the guard (detector present -> confirmSet = gate = raw), r stays collapsed (==).
  const armedCtx = { ...w.meCtx, regProvenance: { sigmaRoots: w.sigmaRoots }, entanglementDetector: trioDetector };
  const anchored = authenticatedAnchoredRecordsFrom(raw, armedCtx.registry, armedCtx);
  assert.ok(anchored.length < raw.length, 'precondition: anchoring drops the un-anchored linchpin CONFIRM (non-vacuous)');
  const rArmed = crossVerify(prem.id, armedCtx, undefined, raw, anchored).r;
  assert.ok(rArmed <= rDisarmed + 1e-12, `NS-9: co-armed r must not exceed disarmed (got armed=${rArmed} > disarmed=${rDisarmed})`);
});

// ---------- A10: a falsy-but-present 5th arg fails CLOSED (not silent de-anchoring to raw) ----------

test('A10 fail-closed: a present-but-non-array anchoredRecs -> confirmSet=[] (r=0), never the raw confirmer set', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zK', true);
  w.earn('did:key:zK');
  const prem = makePremise({ statement: 'a10', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 'a10', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  const raw = w.raw();
  assert.ok(crossVerify(prem.id, w.meCtx, undefined, raw, raw).r > 0, 'precondition: a real array 5th arg counts the confirm');
  assert.equal(crossVerify(prem.id, w.meCtx, undefined, raw).r, crossVerify(prem.id, w.meCtx, undefined, raw, raw).r,
    'an OMITTED 5th arg defaults to the gate (byte-identical), NOT floored');
  for (const bad of [null, 0, false, '', 42, {}]) {
    const r = crossVerify(prem.id, w.meCtx, undefined, raw, bad).r;
    assert.equal(r, 0, 'a present-but-non-array 5th arg (' + JSON.stringify(bad) + ') fails CLOSED to r=0, not the raw count');
  }
});

// ---------- co-arm PRECEDENCE over the fail-closed floor (honesty-auditor LOW: the detector-present path) ----------

test('co-arm precedence: detector PRESENT + non-array 5th arg -> confirmSet=gate (raw), NS-9-safe (not the []-floor)', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zK', true);
  w.earn('did:key:zK');
  const prem = makePremise({ statement: 'coprec', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 'coprec', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  const raw = w.raw();
  const rDisarmed = crossVerify(prem.id, w.meCtx, undefined, raw, raw).r;
  // a PRESENT (even dormant-WEAK) detector makes the co-arm guard take PRECEDENCE over the []-floor: a non-array
  // 5th arg resolves to gate (raw), NOT [] -- NS-9-safe because gate === the disarmed baseline for these folds.
  const ctxDet = { ...w.meCtx, entanglementDetector: () => 'WEAK' };
  const rCoArm = crossVerify(prem.id, ctxDet, undefined, raw, {}).r;
  assert.ok(rCoArm > 0, 'detector present: a non-array 5th arg falls to gate (raw), NOT floored to []');
  assert.equal(rCoArm, rDisarmed, 'co-arm precedence yields the raw gate count (== disarmed) -- NS-9-safe');
});

// ---------- Decision-5 s=0 structural guard on the TWO-ARRAY path ----------

test('s=0 structural guard (two-array path): a CONTEST in the anchored confirmSet does NOT change crossVerify.strength', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zK', true);
  w.addPersona('did:key:zCon', true);
  w.earn('did:key:zK'); w.earn('did:key:zCon');
  const prem = makePremise({ statement: 's0', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 's0', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  const before = crossVerify(prem.id, w.meCtx, undefined, w.raw(), w.raw()).strength;
  w.emit('did:key:zCon', 'CONTEST', { target_premise_id: prem.id, target_persona: 'did:key:zC' });
  const after = crossVerify(prem.id, w.meCtx, undefined, w.raw(), w.raw()).strength;
  assert.equal(after, before, 'crossVerify builds opinion(r,0) on the two-array path too -- a CONTEST-derived s would flip this RED');
});

console.log(`\n[f6-wave2-anchoring] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
