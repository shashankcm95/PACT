#!/usr/bin/env node
'use strict';

// PACT v0 -- F6 Wave-1 anchoring (plans/59, ADR-0003): route the pure-positive folds (reach,
// verification-strength, and cross-verify TRANSITIVELY) through authenticatedAnchoredRecords.
// Disarmed byte-identical; armed narrows monotonically (NS-9: trust_armed(S) <= trust_disarmed(S)).
//
// VERIFY + VALIDATE-board-STRENGTHENED (each witness is NON-VACUOUS):
//   - W1-2 (reach) + W1-3 (verificationStrength): the STRICT-narrow witnesses -- the DISARMED baseline COUNTS
//     the target, arming REMOVES exactly it (delta), STRICT armed < disarmed.
//   - W1-4 (verificationStrength): the PREMISE-BINDING drop -- an un-anchored creator floors to 0 (distinct
//     mechanism from the confirmer-count narrow).
//   - W1-2b (reach): a no-inversion guard (threshold_flag never flips provisional -> grounded).
//   - T4: the SWAPPED cross-verify fallback ANCHORS under arming (a standalone armed-to-empty crossVerify floors
//     to 0, never the raw de-anchored count).
//   - T3: an ARMED cross-fold ISOLATION witness -- the MIXED folds never read regProvenance.
//   - T1: the pure-positivity guard (a WOULD-COUNT contest leaves strength unchanged, s=0); its non-vacuity was
//     VALIDATE-hacker-confirmed by spiking a positive disbelief leg into crossVerify and watching this flip RED.

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
const { makePremise, makeClaim, createGraph, addNode } = require('../../src/atms/claim');

const { verifiedRecords } = require('../../src/trust/read-gate');
const { authenticatedAnchoredRecords } = require('../../src/trust/authenticated-read');
const { reach } = require('../../src/grounding/reach');
const { verificationStrength } = require('../../src/grounding/verification-strength');
const { crossVerify } = require('../../src/grounding/cross-verify');
const { creatorStanding } = require('../../src/grounding/creator-standing');
const { premiseScore } = require('../../src/grounding/premise-score');
const { direct } = require('../../src/trust/direct');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const SCOPE = { domain: 'test' };
const ME = 'did:key:zME';
const _dirs = [];
process.on('exit', () => { for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// A world where each persona is ANCHORED (registered root + a verifying sigma_root in sigmaRoots) or
// UNANCHORED (registered persona only -> DROPS when regProvenance.sigmaRoots is armed).
function anchWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-f6w1-'));
  _dirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {}; // did -> { kp, human }
  const sigmaRoots = {}; // did -> sigma (ONLY anchored personas)
  let seq = 0;
  function addPersona(did, anchored) {
    const human = 'human:' + did;
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
  addPersona(ME, false); // the receiver (store owner)
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
  return { registry, personas, meCtx, armedCtx, sigmaRoots, addPersona, emit, earn };
}

// ---------- T4: disarmed reference-identity + the fallback-dead pin ----------

test('T4 reference-identity DISARMED: authenticatedAnchoredRecords(meCtx) === verifiedRecords(reg, storeOpts)', () => {
  const w = anchWorld();
  w.addPersona('did:key:zA', true);
  w.emit('did:key:zA', 'ACCEPT', { target_claim_id: 'claim:x' });
  const raw = verifiedRecords(w.meCtx.registry, w.meCtx.storeOpts);
  assert.ok(raw.length >= 1, 'precondition: the store has a record (non-vacuous)');
  // DISARMED, both filters `return recs` unchanged -> the chokepoint drops NOTHING and preserves every
  // field (a SEPARATE verifiedRecords call re-parses fresh objects off disk, so deepEqual not ===).
  assert.deepEqual(authenticatedAnchoredRecords(w.meCtx), raw, 'disarmed chokepoint === verifiedRecords (byte-identical)');
});

test('T4 fallback-anchors: a STANDALONE crossVerify (no recs) under an armed-to-empty ctx ANCHORS -> floors to 0 (no de-anchoring)', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zK', true);
  w.earn('did:key:zK');
  const prem = makePremise({ statement: 'fb', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 'fb', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  // no `recs` passed -> crossVerify hits its internal fallback (= authenticatedAnchoredRecords(meCtx))
  const disarmed = crossVerify(prem.id, w.meCtx).strength;
  const armedEmpty = crossVerify(prem.id, { ...w.meCtx, regProvenance: { sigmaRoots: {} } }).strength;
  assert.ok(disarmed > 0, 'disarmed standalone: a real strength (fallback === verifiedRecords-equivalent)');
  assert.equal(armedEmpty, 0, 'armed-to-empty standalone: the swapped fallback ANCHORS to [] -> floor 0 (NOT the raw de-anchored count)');
});

// ---------- W1-2: reach armed narrows PROPORTIONALLY (non-vacuous) ----------

test('W1-2 reach armed narrows: an un-anchored ACCEPTer drops by EXACTLY 1; strict armed < disarmed', () => {
  const w = anchWorld();
  const CLAIM = 'claim:reach';
  w.addPersona('did:key:zA1', true);   // anchored
  w.addPersona('did:key:zA2', true);   // anchored
  w.addPersona('did:key:zU', false);   // UN-anchored -> drops when armed
  w.emit('did:key:zA1', 'ACCEPT', { target_claim_id: CLAIM });
  w.emit('did:key:zA2', 'ACCEPT', { target_claim_id: CLAIM });
  w.emit('did:key:zU', 'ACCEPT', { target_claim_id: CLAIM });

  const disarmed = reach(CLAIM, { meCtx: w.meCtx });
  const armed = reach(CLAIM, { meCtx: w.armedCtx() });
  // (a) baseline COUNTS the un-anchored accepter
  assert.equal(disarmed.size, 3, 'disarmed: all 3 human roots in the envelope');
  assert.ok(disarmed.envelope.includes('human:did:key:zU'), 'disarmed baseline COUNTS the un-anchored accepter');
  // (b) arming REMOVES exactly it (delta 1) and (c) strict armed < disarmed
  assert.equal(armed.size, 2, 'armed: the un-anchored accepter drops (delta 1)');
  assert.ok(!armed.envelope.includes('human:did:key:zU'), 'the un-anchored accepter is GONE armed');
  assert.ok(armed.size < disarmed.size, 'STRICT narrow: armed < disarmed');
});

test('W1-2b reach threshold_flag moves toward provisional (lower trust) never grounded when armed', () => {
  const w = anchWorld();
  const g0 = createGraph();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);           // premise creator (anchored)
  const prem = makePremise({ statement: 'p', scope: SCOPE, creator });
  // claimed grounding HIGH so the DISARMED baseline is genuinely `provisional` (claimed > actual) -- else the
  // no-inversion assertion passes vacuously (CodeRabbit). Arming lowers `actual`, so it structurally cannot flip
  // provisional -> grounded; the test proves it against a REAL provisional baseline.
  const claim = makeClaim({ content: { grounding: 0.99 }, premises: [prem.id] });
  let g = addNode(g0, prem); g = addNode(g, claim);
  w.emit('did:key:zC', 'PREMISE', { statement: 'p', scope: SCOPE, creator }); // the creator-bound PREMISE record
  w.addPersona('did:key:zA', true);
  w.addPersona('did:key:zU', false);          // un-anchored accepter + confirmer
  w.earn('did:key:zA'); w.earn('did:key:zU');
  w.emit('did:key:zA', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zU', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zA', 'ACCEPT', { target_claim_id: claim.id });
  w.emit('did:key:zU', 'ACCEPT', { target_claim_id: claim.id });
  const disarmed = reach(claim.id, { meCtx: w.meCtx, graph: g });
  const armed = reach(claim.id, { meCtx: w.armedCtx(), graph: g });
  assert.ok(armed.size <= disarmed.size, 'envelope holds-or-lowers');
  assert.equal(disarmed.threshold_flag, 'provisional', 'non-vacuous baseline: DISARMED is genuinely provisional (claimed 0.99 > actual)');
  assert.notEqual(armed.threshold_flag, 'grounded', 'arming NEVER flips a provisional claim to grounded (never raises trust)');
});

// ---------- W1-3: verification-strength armed narrows (non-vacuous) ----------

test('W1-3 verificationStrength armed narrows: dropping an un-anchored CONFIRMer strictly lowers strength', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);           // premise creator (anchored -> stays)
  w.addPersona('did:key:zK', true);           // anchored confirmer (stays)
  w.addPersona('did:key:zU', false);          // UN-anchored confirmer (drops when armed)
  w.earn('did:key:zK'); w.earn('did:key:zU'); // both earn standing
  const prem = makePremise({ statement: 'root premise', scope: SCOPE, creator });
  const claim = makeClaim({ content: { grounding: 1 }, premises: [prem.id] });
  let g = addNode(createGraph(), prem); g = addNode(g, claim);
  w.emit('did:key:zC', 'PREMISE', { statement: 'root premise', scope: SCOPE, creator }); // creator-bound PREMISE record
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zU', 'CONFIRM', { target_premise_id: prem.id });

  const disarmed = verificationStrength(claim.id, g, w.meCtx);
  const armed = verificationStrength(claim.id, g, w.armedCtx());
  // (a) baseline is a real 2-confirmer strength; (c) strict narrow; (b) it is the confirmer drop (creator stays -> not a floor-to-0)
  assert.ok(disarmed > 0, 'disarmed: a real non-zero strength from 2 confirmers');
  assert.ok(armed < disarmed, 'STRICT narrow: dropping the un-anchored confirmer lowers strength');
  assert.ok(armed > 0, 'the creator + 1 anchored confirmer survive -> not floored to 0 (proves it is the CONFIRMER drop, not a premise-drop)');
});

// ---------- W1-4: verificationStrength premise-binding drop (floors to 0, distinct from the confirmer narrow) ----------

test('W1-4 premise-floor: an UN-anchored premise CREATOR floors verificationStrength to 0 when armed (premise-binding drop)', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zCr';
  w.addPersona('did:key:zCr', false);  // UN-anchored creator -> its PREMISE record drops when armed
  w.addPersona('did:key:zK', true);    // anchored confirmer (survives)
  w.earn('did:key:zK');
  const prem = makePremise({ statement: 'floored', scope: SCOPE, creator });
  const claim = makeClaim({ content: { grounding: 1 }, premises: [prem.id] });
  let g = addNode(createGraph(), prem); g = addNode(g, claim);
  w.emit('did:key:zCr', 'PREMISE', { statement: 'floored', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  const disarmed = verificationStrength(claim.id, g, w.meCtx);
  const armed = verificationStrength(claim.id, g, w.armedCtx());
  assert.ok(disarmed > 0, 'disarmed: the creator-bound premise + confirmer give a real strength');
  assert.equal(armed, 0, 'armed: the un-anchored creator PREMISE drops -> findBoundPremise null -> FLOOR 0 (the premise-binding drop, not the confirmer-count narrow)');
});

// ---------- T1: the pure-positivity guard (would-count contest) ----------

test('T1 pure-positivity guard: a WOULD-COUNT contest does NOT change crossVerify.strength (s=0 hardcoded)', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zC';
  w.addPersona('did:key:zC', true);
  w.addPersona('did:key:zK', true);
  w.addPersona('did:key:zContester', true);   // earned, distinct human, non-self -> WOULD count if crossVerify read contests
  w.earn('did:key:zK'); w.earn('did:key:zContester');
  const prem = makePremise({ statement: 'contested premise', scope: SCOPE, creator });
  w.emit('did:key:zC', 'PREMISE', { statement: 'contested premise', scope: SCOPE, creator }); // creator-bound PREMISE record
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  const before = crossVerify(prem.id, w.meCtx).strength;
  // add a would-count CONTEST (same gating shape as a counted CONFIRM: earned + real target + non-self)
  w.emit('did:key:zContester', 'CONTEST', { target_premise_id: prem.id, target_persona: 'did:key:zC' });
  const after = crossVerify(prem.id, w.meCtx).strength;
  assert.equal(after, before, 'crossVerify is structurally pure-positive (s=0 at :212) -- it ignores CONTEST entirely; a future negative leg would flip this RED');
  assert.ok(before > 0, 'non-vacuous: there IS a positive strength to have been lowered');
});

// ---------- T3: ARMED cross-fold isolation (the mixed folds never read regProvenance) ----------

test('T3 armed isolation: creator-standing / premise-score / direct are BYTE-IDENTICAL armed-vs-disarmed', () => {
  const w = anchWorld();
  const creator = 'human:did:key:zCr';
  w.addPersona('did:key:zCr', false);         // UN-anchored creator (would drop if the fold anchored)
  w.addPersona('did:key:zK', true);
  w.addPersona('did:key:zCon', false);        // UN-anchored contester (would drop if the fold anchored)
  w.earn('did:key:zK'); w.earn('did:key:zCon');
  const prem = makePremise({ statement: 'mixed-fold premise', scope: SCOPE, creator });
  w.emit('did:key:zCr', 'PREMISE', { statement: 'mixed-fold premise', scope: SCOPE, creator });
  w.emit('did:key:zK', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zCon', 'CONTEST', { target_premise_id: prem.id, target_persona: 'did:key:zCr' });
  // direct fixture: an agent CLAIM + a CONTEST against it
  w.addPersona('did:key:zAgent', false);
  const cf = w.emit;
  cf('did:key:zAgent', 'CLAIM', { claim: { content: 'agent work' } });

  const armed = w.armedCtx();
  // precondition: the arm WOULD drop records if the fold routed through the chokepoint (non-vacuous isolation)
  const anch = authenticatedAnchoredRecords(armed);
  const raw = verifiedRecords(w.meCtx.registry, w.meCtx.storeOpts);
  assert.ok(anch.length < raw.length, 'precondition: the armed sigmaRoots WOULD drop >=1 record if routed (isolation is non-vacuous)');

  assert.deepEqual(creatorStanding(creator, w.armedCtx()), creatorStanding(creator, w.meCtx), 'creator-standing ignores regProvenance');
  assert.deepEqual(premiseScore(prem.id, w.armedCtx()), premiseScore(prem.id, w.meCtx), 'premise-score ignores regProvenance');
  assert.deepEqual(direct(w.armedCtx(), 'did:key:zAgent'), direct(w.meCtx, 'did:key:zAgent'), 'direct ignores regProvenance');
});

console.log(`\n[f6-wave1-anchoring] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
