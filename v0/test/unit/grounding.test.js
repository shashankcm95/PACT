#!/usr/bin/env node
'use strict';

// PACT P3 — grounding-engine + REACH tests (the §6 exit criteria of
// plans/02-p3-grounding-reach-plan.md). Each test is an INV or a Sybil defense from the §5 table:
//   creator-bind (slander + cross-uid self-inflation -> 0) · cross-verify (real-target, no-self-confirm,
//   earned-standing floor, rootOf-keyed, k-minted-roots -> WEAK) · premise-score (rises/falls, CONTESTED
//   is a flag) · creator-standing (human-keyed, asymmetric crater >=2 earned, decays, NO stake field) ·
//   verification-strength (weakest-link MIN, empty -> 0 NOT +Infinity) · reach (rootOf-union, empty
//   accepts -> empty envelope, INV-9 threshold flag never reads size) · SHADOW/structural ·
//   "U1 residual is real". TDD: written FIRST (red), then implemented to green.
//
// THE PREMISE ID SPACE (load-bearing): a premise's canonical id is the ATMS content-address of its
// {statement, scope, creator} body (makePremise.id). The SAME id space is what the claim graph walks
// (verification-strength), what CONFIRM/CONTEST records target (target_premise_id), and what
// crossVerify reads. The signed PREMISE record is the PROVENANCE carrier; crossVerify re-derives the
// content-address from its payload and binds the creator on read (rootOf(src)===creator).

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { makePremise, makeClaim, createGraph, addNode } = require('../../src/atms/claim');

const { crossVerify } = require('../../src/grounding/cross-verify');
const { premiseScore } = require('../../src/grounding/premise-score');
const { creatorStanding } = require('../../src/grounding/creator-standing');
const { verificationStrength } = require('../../src/grounding/verification-strength');
const { reach } = require('../../src/grounding/reach');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// --- world setup: a registry + keypairs; ME's per-receiver store is the behavioral log ---
function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-p3-'));
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
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type, seq: seq++, nonce: 'n' + seq, payload, t: opts.t }, { privateKeyPem: p.kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: ME, stateDir: STATE });
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  return {
    STATE, registry, personas, meCtx, ME, add, addUnder, emit,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } },
  };
}

const SCOPE = { constraints: {}, edge_confidence: 1 };

// Mint a legit PREMISE (creator === the signer's human root). Returns { record, id } where id is the
// ATMS content-address (makePremise.id) — the canonical premise id the engine + graph share.
function emitPremise(w, src, statement, scopeObj = SCOPE, opts = {}) {
  const creator = w.personas[src].human; // rootOf(src) === this (the legit creator-binding)
  const record = w.emit(src, 'PREMISE', { statement, scope: scopeObj, creator }, opts);
  const id = makePremise({ statement, scope: scopeObj, creator }).id;
  return { record, id };
}

// ============================ creator-bind (the PACT-original tier) ============================

test('creator-bind: a SLANDER premise (creator=victim, signed by attacker) contributes 0', () => {
  const w = freshWorld();
  w.add('did:key:zVictim'); w.add('did:key:zAttacker'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'earns standing' } });
  // attacker SIGNS a premise but names the VICTIM as creator (rootOf(attacker) !== victim-human)
  const victimHuman = w.personas['did:key:zVictim'].human;
  w.emit('did:key:zAttacker', 'PREMISE', { statement: 'slander', scope: SCOPE, creator: victimHuman });
  const slanderId = makePremise({ statement: 'slander', scope: SCOPE, creator: victimHuman }).id;
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: slanderId });
  const cv = crossVerify(slanderId, w.meCtx);
  assert.equal(cv.strength, 0, 'an unbound (rootOf(src)!==creator) premise floors to 0');
  // ... and it scores for NOBODY: the named victim accrues nothing
  const cs = creatorStanding(victimHuman, w.meCtx);
  assert.equal(cs.n_premises, 0, 'a slander premise contributes to neither the victim nor the attacker');
  w.cleanup();
});

test('creator-bind: cross-uid SELF-INFLATION (creator=other-uid, self-confirm) contributes 0', () => {
  const w = freshWorld();
  w.add('did:key:zAtk');
  // attacker signs a premise naming a DIFFERENT human as creator to launder a self-confirm later
  w.emit('did:key:zAtk', 'PREMISE', { statement: 'inflated', scope: SCOPE, creator: 'human:someone-else' });
  const forgedId = makePremise({ statement: 'inflated', scope: SCOPE, creator: 'human:someone-else' }).id;
  const cv = crossVerify(forgedId, w.meCtx);
  assert.equal(cv.strength, 0, 'cross-uid creator mismatch floors to 0 (creator-bound-on-read)');
  w.cleanup();
});

test('creator-bind: a LEGIT premise (signer-root===creator) is read as a real target', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'earns standing' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'a legit premise');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  const cv = crossVerify(prem.id, w.meCtx);
  assert.ok(cv.strength > 0, 'a legit premise with a distinct earned confirmer scores > 0');
  assert.equal(cv.n_confirmers, 1);
  w.cleanup();
});

test('creator-bind: a same-id DECOY premise does NOT shadow the legit one (first-match poison, DETERMINISTIC)', () => {
  // post-build VALIDATE CRITICAL (#273 family): premise id = hash(statement,scope,creator) and the body
  // is PUBLIC, so an attacker mints a byte-identical-body PREMISE (creator=victim, signed by attacker)
  // that hashes to the victim's id. The fix must CONTINUE past the decoy, never short-circuit to null.
  const { findBoundPremise } = require('../../src/grounding/cross-verify');
  const w = freshWorld();
  w.add('did:key:zVictim'); w.add('did:key:zAttacker'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'earns standing' } });
  const victimHuman = w.personas['did:key:zVictim'].human;
  const statement = 'the contested truth';
  // same body => same content-address id; decoy signed by the ATTACKER (rootOf(src) !== creator), legit by VICTIM
  const decoy = w.emit('did:key:zAttacker', 'PREMISE', { statement, scope: SCOPE, creator: victimHuman });
  const prem = emitPremise(w, 'did:key:zVictim', statement); // the VICTIM's legit same-body premise
  // DETERMINISTIC guard: decoy explicitly FIRST in the scanned list. The OLD `return null` returns null here
  // (victim denied); the fix CONTINUES and returns the victim-signed record.
  const found = findBoundPremise([decoy, prem.record], w.registry, prem.id);
  assert.ok(found, 'the scan continues past the attacker decoy (no first-match short-circuit)');
  assert.equal(found.src_persona_did, 'did:key:zVictim', 'it returns the VICTIM-signed record, not the decoy');
  // and end-to-end the victim still accrues grounding despite the decoy in the store.
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  assert.ok(crossVerify(prem.id, w.meCtx).strength > 0, 'the victim premise is NOT denied grounding by the decoy');
  assert.equal(creatorStanding(victimHuman, w.meCtx).n_premises, 1, 'the victim accrues their own legit premise');
  w.cleanup();
});

// ============================ cross-verify (the LEAF primitive) ============================

test('cross-verify: a CONFIRM not resolving to a real premise is IGNORED (real-target-required)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'standing' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'real premise');
  // a confirm pointing at a NON-EXISTENT premise id must not move the real premise's strength
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: 'f'.repeat(64) });
  const cv = crossVerify(prem.id, w.meCtx);
  assert.equal(cv.n_confirmers, 0, 'a bogus-target confirm is ignored');
  assert.equal(cv.strength, 0);
  w.cleanup();
});

test('cross-verify: NO self-confirmation (the creator confirming their own premise -> 0)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman');
  w.emit('did:key:zHuman', 'CLAIM', { claim: { content: 'standing' } }); // creator HAS standing
  const prem = emitPremise(w, 'did:key:zHuman', 'self-vouched premise');
  // the creator's OWN confirm (rootOf(confirmer) === premise.creator) must not count
  w.emit('did:key:zHuman', 'CONFIRM', { target_premise_id: prem.id });
  const cv = crossVerify(prem.id, w.meCtx);
  assert.equal(cv.n_confirmers, 0, 'you cannot vouch for your own premise surviving');
  assert.equal(cv.strength, 0);
  w.cleanup();
});

test('cross-verify: a zero-history (no earned standing) confirmer floors near 0', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zNobody'); // zNobody authored NO claim => no standing
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zNobody', 'CONFIRM', { target_premise_id: prem.id });
  const cv = crossVerify(prem.id, w.meCtx);
  assert.equal(cv.n_confirmers, 0, 'an unearned confirmer does not establish a confirmation');
  assert.equal(cv.strength, 0);
  w.cleanup();
});

test('cross-verify: rootOf-keyed (N personas of ONE human === ONE confirmer)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman');
  // ONE confirmer-human running THREE earned personas
  w.addUnder('did:key:zP1', 'human:confirmer'); w.addUnder('did:key:zP2', 'human:confirmer'); w.addUnder('did:key:zP3', 'human:confirmer');
  w.emit('did:key:zP1', 'CLAIM', { claim: { content: 's1' } });
  w.emit('did:key:zP2', 'CLAIM', { claim: { content: 's2' } });
  w.emit('did:key:zP3', 'CLAIM', { claim: { content: 's3' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zP1', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zP2', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zP3', 'CONFIRM', { target_premise_id: prem.id });
  const cv = crossVerify(prem.id, w.meCtx);
  assert.equal(cv.n_confirmers, 1, 'persona-multiplication collapses to one rootOf-keyed confirmer');
  w.cleanup();
});

test('cross-verify: k minted HUMAN roots yield a WEAK label and do not establish strong verification', () => {
  const w = freshWorld();
  w.add('did:key:zHuman');
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  // k=4 DISTINCT minted human roots, each an earned, distinct, non-self confirmer
  for (let i = 0; i < 4; i++) {
    const did = 'did:key:zMint' + i;
    w.addUnder(did, 'human:mint' + i);
    w.emit(did, 'CLAIM', { claim: { content: 'cheap' + i } });
    w.emit(did, 'CONFIRM', { target_premise_id: prem.id });
  }
  const cv = crossVerify(prem.id, w.meCtx);
  assert.equal(cv.n_confirmers, 4, 'distinct human roots DO each count (U1 frontier)');
  // NOTE: overall:WEAK is a STRUCTURAL constant (weak-flag.js — axes 2/3 are permanently WEAK pre-U2);
  // the BEHAVIORAL force of this test is n_confirmers===4 (k roots inform but never establish strength).
  assert.equal(cv.label.overall, 'WEAK', 'k minted roots remain topological-WEAK (informs, never establishes)');
  assert.equal(cv.advisory, true);
  w.cleanup();
});

test('cross-verify: an OLD confirmation DECAYS (reuse DECAY_HALF_LIFE_MS) but still informs', () => {
  const { DECAY_HALF_LIFE_MS } = require('../../src/trust/params');
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zC');
  w.emit('did:key:zC', 'CLAIM', { claim: { content: 'std' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  const now = 10 * DECAY_HALF_LIFE_MS;
  w.emit('did:key:zC', 'CONFIRM', { target_premise_id: prem.id }, { t: now - DECAY_HALF_LIFE_MS }); // one half-life ago
  const aged = crossVerify(prem.id, w.meCtx, now).r;                           // evaluated NOW => decayed
  const fresh = crossVerify(prem.id, w.meCtx, now - DECAY_HALF_LIFE_MS).r;     // evaluated at confirm time => full
  assert.ok(aged < fresh, 'an aged confirmation weighs less than a fresh one (decay is live in the grounding path)');
  assert.ok(aged > 0, 'but a decayed confirmation still informs — never erased');
  w.cleanup();
});

// ============================ premise-score (SL opinion) ============================

test('premise-score: rises on a distinct-human confirm; CONTESTED lowers but does not erase', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer'); w.add('did:key:zContester');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  w.emit('did:key:zContester', 'CLAIM', { claim: { content: 'std2' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  const confirmed = premiseScore(prem.id, w.meCtx);
  assert.ok(confirmed.b > 0, 'a confirm raises belief');
  // a REAL contest of the premise lowers the score but never to zero-belief-erasure of the survival
  w.emit('did:key:zContester', 'CONTEST', { target_premise_id: prem.id });
  const contested = premiseScore(prem.id, w.meCtx);
  assert.ok(contested.d > 0, 'a real contest raises disbelief');
  assert.ok(contested.b > 0, 'CONTESTED is a FLAG: the survival belief is lowered, never erased');
  assert.ok(contested.b < confirmed.b, 'the contest moves the opinion toward disbelief');
  w.cleanup();
});

test('premise-score: a bogus CONTEST (no real target premise) is ignored', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zContester');
  w.emit('did:key:zContester', 'CLAIM', { claim: { content: 'std' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zContester', 'CONTEST', { target_premise_id: 'a'.repeat(64) }); // bogus target
  const sc = premiseScore(prem.id, w.meCtx);
  assert.equal(sc.s, 0, 'a contest with no real target premise contributes no disbelief');
  w.cleanup();
});

test('premise-score: on an UNBOUND / missing premise returns a finite novice opinion (FLOOR.r, no NaN)', () => {
  const w = freshWorld();
  // no PREMISE record exists for this id; crossVerify returns the FLOOR ({r:0,...}); premiseScore must
  // not read undefined.r and produce NaN (post-build VALIDATE MINOR: the FLOOR omitted .r).
  const sc = premiseScore('0'.repeat(64), w.meCtx);
  assert.ok(Number.isFinite(sc.b) && Number.isFinite(sc.u), 'a missing premise yields a finite opinion');
  assert.equal(sc.s, 0);
  assert.equal(sc.advisory, true);
  w.cleanup();
});

test('premise-score: an UNEARNED Sybil contester does NOT erode (slander as costly as support)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer'); w.add('did:key:zNobody'); // zNobody authors nothing
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  const before = premiseScore(prem.id, w.meCtx);
  w.emit('did:key:zNobody', 'CONTEST', { target_premise_id: prem.id }); // unearned slander
  const after = premiseScore(prem.id, w.meCtx);
  assert.equal(after.s, 0, 'a zero-history contester adds no disbelief (earned-gate; symmetric with the r-leg)');
  assert.equal(after.d, before.d, 'an unearned contest cannot move the opinion (no free slander)');
  w.cleanup();
});

// ============================ creator-standing (reliability AS A SOURCE) ============================

test('creator-standing: human-keyed (persona-mint defeated) and carries u + n_premises', () => {
  const w = freshWorld();
  // ONE human running TWO premise-authoring personas
  w.addUnder('did:key:zA1', 'human:author'); w.addUnder('did:key:zA2', 'human:author');
  w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  w.emit('did:key:zA1', 'PREMISE', { statement: 'p1', scope: SCOPE, creator: 'human:author' });
  w.emit('did:key:zA2', 'PREMISE', { statement: 'p2', scope: SCOPE, creator: 'human:author' });
  const p1Id = makePremise({ statement: 'p1', scope: SCOPE, creator: 'human:author' }).id;
  const p2Id = makePremise({ statement: 'p2', scope: SCOPE, creator: 'human:author' }).id;
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: p1Id });
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: p2Id });
  const cs = creatorStanding('human:author', w.meCtx);
  assert.equal(cs.n_premises, 2, 'both personas of one human contribute to the SAME human standing');
  assert.ok(typeof cs.opinion.u === 'number', 'carries the full opinion (the honest uncertainty signal)');
  assert.ok(typeof cs.standing === 'number');
  assert.equal(cs.advisory, true);
  w.cleanup();
});

test('creator-standing: NO stake field is read (a {stake:1e9} body scores identically)', () => {
  const w = freshWorld();
  w.add('did:key:zHonest'); w.add('did:key:zBraggart'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  const honest = w.personas['did:key:zHonest'].human;
  const braggart = w.personas['did:key:zBraggart'].human;
  // identical premise statement+scope; the ONLY difference is the braggart asserts a colossal stake.
  w.emit('did:key:zHonest', 'PREMISE', { statement: 'same', scope: SCOPE, creator: honest });
  w.emit('did:key:zBraggart', 'PREMISE', { statement: 'same', scope: SCOPE, creator: braggart, stake: 1e9 });
  const phId = makePremise({ statement: 'same', scope: SCOPE, creator: honest }).id;
  const pbId = makePremise({ statement: 'same', scope: SCOPE, creator: braggart }).id;
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: phId });
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: pbId });
  const csH = creatorStanding(honest, w.meCtx);
  const csB = creatorStanding(braggart, w.meCtx);
  assert.equal(csB.standing, csH.standing, 'the self-asserted stake field is never read (standing IS the stake)');
  w.cleanup();
});

test('creator-standing: asymmetric crater requires >=2 distinct EARNED-STANDING human contesters', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  w.add('did:key:zC1'); w.add('did:key:zC2');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  w.emit('did:key:zC1', 'CLAIM', { claim: { content: 'c1-work' } }); // C1 earns standing
  w.emit('did:key:zC2', 'CLAIM', { claim: { content: 'c2-work' } }); // C2 earns standing
  const human = w.personas['did:key:zHuman'].human;
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  const before = creatorStanding(human, w.meCtx);
  // ONE earned contester => contested flag but no crater multiplier
  w.emit('did:key:zC1', 'CONTEST', { target_premise_id: prem.id });
  const oneContest = creatorStanding(human, w.meCtx);
  assert.equal(oneContest.contested, true, 'a real contest flags the standing as contested');
  // a SECOND distinct earned contester => the asymmetric crater kicks in (standing drops harder)
  w.emit('did:key:zC2', 'CONTEST', { target_premise_id: prem.id });
  const twoContest = creatorStanding(human, w.meCtx);
  assert.ok(twoContest.standing < oneContest.standing, 'the >=2-earned-human crater drops standing further');
  assert.ok(oneContest.standing <= before.standing, 'even one contest never raises standing');
  w.cleanup();
});

test('creator-standing: a zero-history Sybil contester INFORMS but cannot corroborate a crater', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  w.add('did:key:zC1'); w.add('did:key:zNobody'); // zNobody has no standing
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  w.emit('did:key:zC1', 'CLAIM', { claim: { content: 'c1' } });
  const human = w.personas['did:key:zHuman'].human;
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  w.emit('did:key:zC1', 'CONTEST', { target_premise_id: prem.id });      // earned
  w.emit('did:key:zNobody', 'CONTEST', { target_premise_id: prem.id });  // unearned
  // only ONE earned contester => contested, but the unearned one cannot push past the >=2 earned gate.
  const withSybil = creatorStanding(human, w.meCtx);
  assert.equal(withSybil.contested, true);
  // prove it did NOT crater: an independent world with a SECOND earned contester craters lower.
  const w2 = freshWorld();
  w2.add('did:key:zHuman'); w2.add('did:key:zConfirmer'); w2.add('did:key:zC1'); w2.add('did:key:zC2');
  w2.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  w2.emit('did:key:zC1', 'CLAIM', { claim: { content: 'c1' } });
  w2.emit('did:key:zC2', 'CLAIM', { claim: { content: 'c2' } });
  const human2 = w2.personas['did:key:zHuman'].human;
  const prem2 = emitPremise(w2, 'did:key:zHuman', 'premise');
  w2.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem2.id });
  w2.emit('did:key:zC1', 'CONTEST', { target_premise_id: prem2.id });
  w2.emit('did:key:zC2', 'CONTEST', { target_premise_id: prem2.id });
  const cratered = creatorStanding(human2, w2.meCtx);
  assert.ok(cratered.standing < withSybil.standing, 'an unearned Sybil contester does not corroborate the crater');
  w.cleanup(); w2.cleanup();
});

// ============================ verification-strength (weakest-link MIN) ============================

test('verification-strength: MIN over the chain (weakest empirical root dominates)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zC1'); w.add('did:key:zC2');
  for (const c of ['did:key:zC1', 'did:key:zC2']) w.emit(c, 'CLAIM', { claim: { content: 'std-' + c } });
  // two empirical-root premises: one confirmed (strong), one with ZERO confirmers (weak -> 0)
  const strong = emitPremise(w, 'did:key:zHuman', 'strong premise');
  const weak = emitPremise(w, 'did:key:zHuman', 'weak premise');
  w.emit('did:key:zC1', 'CONFIRM', { target_premise_id: strong.id });
  w.emit('did:key:zC2', 'CONFIRM', { target_premise_id: strong.id });
  // build a claim grounded on BOTH premises (graph node ids == the canonical premise ids).
  let g = createGraph();
  const pStrong = makePremise({ statement: 'strong premise', scope: SCOPE, creator: w.personas['did:key:zHuman'].human });
  const pWeak = makePremise({ statement: 'weak premise', scope: SCOPE, creator: w.personas['did:key:zHuman'].human });
  assert.equal(pStrong.id, strong.id, 'graph premise id == engine premise id (one content-addressed space)');
  assert.equal(pWeak.id, weak.id);
  const claim = makeClaim({ content: { grounding: 1 }, premises: [pStrong.id, pWeak.id] });
  g = addNode(g, pStrong); g = addNode(g, pWeak); g = addNode(g, claim);
  const vs = verificationStrength(claim.id, g, w.meCtx);
  const cvStrong = crossVerify(strong.id, w.meCtx).strength;
  const cvWeak = crossVerify(weak.id, w.meCtx).strength;
  assert.equal(vs, Math.min(cvStrong, cvWeak), 'verification = MIN over empirical roots (weakest link)');
  assert.ok(vs <= cvStrong, 'the weak root caps the chain');
  assert.equal(vs, 0, 'the unconfirmed weak root floors the whole chain to 0');
  w.cleanup();
});

test('verification-strength: an UNGROUNDED chain (no empirical root / no confirmations) is 0, NOT +Infinity', () => {
  const w = freshWorld();
  w.add('did:key:zHuman');
  // a claim grounded on a premise with ZERO confirmations -> MIN over {0} = 0
  let g = createGraph();
  const prem = emitPremise(w, 'did:key:zHuman', 'unconfirmed premise');
  const p = makePremise({ statement: 'unconfirmed premise', scope: SCOPE, creator: w.personas['did:key:zHuman'].human });
  assert.equal(p.id, prem.id);
  const claim = makeClaim({ content: { grounding: 1 }, premises: [p.id] });
  g = addNode(g, p); g = addNode(g, claim);
  const vs = verificationStrength(claim.id, g, w.meCtx);
  assert.equal(vs, 0, 'an unconfirmed premise floors verification to 0');
  assert.ok(Number.isFinite(vs), 'NEVER +Infinity (the empty-MIN catastrophe)');
  // a claim whose premise DAG has NO empirical-root premise at all -> empty MIN -> 0
  let g2 = createGraph();
  const claimNoPrem = { id: 'c'.repeat(64), kind: 'claim', content: {}, premises: [] };
  g2 = addNode(g2, claimNoPrem);
  const vs2 = verificationStrength(claimNoPrem.id, g2, w.meCtx);
  assert.equal(vs2, 0, 'MIN of an EMPTY set of roots = 0, never +Infinity');
  assert.ok(Number.isFinite(vs2));
  w.cleanup();
});

// ============================ reach (emergent-descriptive, INV-17) ============================

test('reach: rootOf-keyed union (N personas of ONE human accepting -> envelope size 1)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zR1', 'human:receiver'); w.addUnder('did:key:zR2', 'human:receiver');
  const claimId = 'a'.repeat(64);
  w.emit('did:key:zR1', 'ACCEPT', { target_claim_id: claimId });
  w.emit('did:key:zR2', 'ACCEPT', { target_claim_id: claimId });
  const r = reach(claimId, { meCtx: w.meCtx }); // derived-on-read: accepts read from ME's verified log
  assert.equal(r.size, 1, 'two personas of one human collapse to ONE receiver (co-forge cannot inflate)');
  assert.deepEqual(r.envelope, ['human:receiver']);
  assert.equal(r.advisory, true);
  w.cleanup();
});

test('reach: NO accepts -> EMPTY envelope regardless of verification strength (INV-17)', () => {
  const w = freshWorld();
  const claimId = 'b'.repeat(64); // nothing accepted in ME's log
  const r = reach(claimId, { meCtx: w.meCtx });
  assert.deepEqual(r.envelope, [], 'no accepts => no receivers, no matter how verified the claim');
  assert.equal(r.size, 0);
  w.cleanup();
});

test('reach: only ACCEPTs targeting THIS claim are unioned (real-target)', () => {
  const w = freshWorld();
  w.add('did:key:zR1'); w.add('did:key:zR2');
  const claimId = 'c'.repeat(64);
  w.emit('did:key:zR1', 'ACCEPT', { target_claim_id: claimId });
  w.emit('did:key:zR2', 'ACCEPT', { target_claim_id: 'd'.repeat(64) }); // a different claim
  const r = reach(claimId, { meCtx: w.meCtx });
  assert.equal(r.size, 1, 'an accept of a DIFFERENT claim is not in this claim envelope');
  w.cleanup();
});

test('reach: a TAMPERED ACCEPT is dropped on read (verify-on-read / INV-14; caller cannot inject)', () => {
  const w = freshWorld();
  w.add('did:key:zR1');
  const claimId = 'e'.repeat(64);
  w.emit('did:key:zR1', 'ACCEPT', { target_claim_id: claimId });
  // tamper the stored ACCEPT's signature anywhere under ME's store (layout-robust recursive walk). The
  // read path (verify-on-read content-address + sig gate) MUST drop it -> empty envelope. reach being
  // derived-on-read (not caller-supplied) is what makes this gate apply at all.
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const fp = path.join(d, e.name); return e.isDirectory() ? walk(fp) : [fp];
  });
  for (const fp of walk(w.STATE)) {
    if (!fp.endsWith('.json')) continue;
    const rec = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (rec.type !== 'ACCEPT') continue;
    rec.sig = (rec.sig || '0').replace(/[0-9a-f]/, (c) => (c === 'a' ? 'b' : 'a'));
    fs.writeFileSync(fp, JSON.stringify(rec));
  }
  const r = reach(claimId, { meCtx: w.meCtx });
  assert.equal(r.size, 0, 'a tampered ACCEPT is rejected on read (caller cannot inject unverified accepts)');
  w.cleanup();
});

test('reach: INV-9 threshold flag fires when CLAIMED grounding > actual verification (provisional)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zR1');
  // a claim CLAIMING full grounding (1) but grounded on an UNCONFIRMED premise (actual verification 0)
  let g = createGraph();
  const prem = emitPremise(w, 'did:key:zHuman', 'unconfirmed');
  const p = makePremise({ statement: 'unconfirmed', scope: SCOPE, creator: w.personas['did:key:zHuman'].human });
  assert.equal(p.id, prem.id);
  const claim = makeClaim({ content: { grounding: 1 }, premises: [p.id] });
  g = addNode(g, p); g = addNode(g, claim);
  w.emit('did:key:zR1', 'ACCEPT', { target_claim_id: claim.id });
  const r = reach(claim.id, { meCtx: w.meCtx, graph: g });
  assert.equal(r.threshold_flag, 'provisional', 'claimed grounding > actual verification => provisional/ungrounded');
  w.cleanup();
});

test('reach: an UNANNOTATED claim (no content.grounding) defaults to claiming FULL grounding -> provisional', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zR1');
  // a claim with NO grounding field, grounded on an unconfirmed premise (actual verification 0).
  // groundingClaim defaults to 1 (fail-LOUD: an unannotated claim is read as over-claiming).
  let g = createGraph();
  emitPremise(w, 'did:key:zHuman', 'unannotated-root'); // the PREMISE record exists but is unconfirmed (verification 0)
  const p = makePremise({ statement: 'unannotated-root', scope: SCOPE, creator: w.personas['did:key:zHuman'].human });
  const claim = makeClaim({ content: { note: 'no grounding field' }, premises: [p.id] });
  g = addNode(g, p); g = addNode(g, claim);
  w.emit('did:key:zR1', 'ACCEPT', { target_claim_id: claim.id });
  const r = reach(claim.id, { meCtx: w.meCtx, graph: g });
  assert.equal(r.threshold_flag, 'provisional', 'an unannotated claim implicitly claims FULL grounding => provisional');
  w.cleanup();
});

test('reach: the threshold flag is a function of VERIFICATION ONLY, never of envelope size (INV-13)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  let g = createGraph();
  const prem = emitPremise(w, 'did:key:zHuman', 'confirmed');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  const p = makePremise({ statement: 'confirmed', scope: SCOPE, creator: w.personas['did:key:zHuman'].human });
  // claim claims a LOW grounding (0) so it is never "claimed > actual" => NOT provisional
  const claim = makeClaim({ content: { grounding: 0 }, premises: [p.id] });
  g = addNode(g, p); g = addNode(g, claim);
  // grow the envelope from 1 -> 3 humans (same claim, same verification); the flag must not move.
  w.add('did:key:zR1'); w.add('did:key:zR2'); w.add('did:key:zR3');
  w.emit('did:key:zR1', 'ACCEPT', { target_claim_id: claim.id });
  const rSmall = reach(claim.id, { meCtx: w.meCtx, graph: g });
  w.emit('did:key:zR2', 'ACCEPT', { target_claim_id: claim.id });
  w.emit('did:key:zR3', 'ACCEPT', { target_claim_id: claim.id });
  const rBig = reach(claim.id, { meCtx: w.meCtx, graph: g });
  assert.ok(rSmall.size !== rBig.size, 'the envelope grew (1 -> 3 distinct humans)');
  assert.equal(rSmall.threshold_flag, rBig.threshold_flag, 'the flag never reads envelope size');
  assert.equal(rSmall.threshold_flag, 'grounded', 'value-assert (not just equality): a low-claim/confirmed chain is grounded');
  w.cleanup();
});

// ============================ SHADOW / structural ============================

test('SHADOW: grounding/ imports neither mayGate nor touches convert.actionable; all return advisory:true', () => {
  const dir = path.join(__dirname, '..', '..', 'src', 'grounding');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/\bmayGate\b/.test(src), f + ' must NOT import/call mayGate (SHADOW, §0)');
    assert.ok(!/\bactionable\b/.test(src), f + ' must NOT read/write actionable (SHADOW, §0)');
  }
  // every SCORE-OBJECT grounding function returns advisory:true (verificationStrength is a pure [0,1]
  // scalar measure — not a score-object — so it carries no field; its contract is "finite number").
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  w.emit('did:key:zConfirmer', 'CLAIM', { claim: { content: 'std' } });
  const prem = emitPremise(w, 'did:key:zHuman', 'p');
  w.emit('did:key:zConfirmer', 'CONFIRM', { target_premise_id: prem.id });
  assert.equal(crossVerify(prem.id, w.meCtx).advisory, true);
  assert.equal(premiseScore(prem.id, w.meCtx).advisory, true, 'premiseScore carries the SHADOW marker too');
  assert.equal(creatorStanding(w.personas['did:key:zHuman'].human, w.meCtx).advisory, true);
  assert.equal(reach('x'.repeat(64), { meCtx: w.meCtx }).advisory, true);
  let g = createGraph(); g = addNode(g, makePremise({ statement: 'p', scope: SCOPE, creator: w.personas['did:key:zHuman'].human }));
  assert.ok(Number.isFinite(verificationStrength('y'.repeat(64), g, w.meCtx)), 'verificationStrength is a finite scalar');
  w.cleanup();
});

// ============================ U1 residual is real (the honest frontier) ============================

test('U1 residual is REAL: N distinct human roots DO inflate cross-verify confirmations', () => {
  const w = freshWorld();
  w.add('did:key:zHuman');
  const prem = emitPremise(w, 'did:key:zHuman', 'premise');
  // ONE distinct earned human confirmer
  w.addUnder('did:key:zSolo', 'human:solo');
  w.emit('did:key:zSolo', 'CLAIM', { claim: { content: 'std' } });
  w.emit('did:key:zSolo', 'CONFIRM', { target_premise_id: prem.id });
  const one = crossVerify(prem.id, w.meCtx).n_confirmers;
  // now FOUR more distinct funded human roots each confirm (rootOf cannot stop human-mult)
  for (let i = 0; i < 4; i++) {
    const did = 'did:key:zFund' + i;
    w.addUnder(did, 'human:fund' + i);
    w.emit(did, 'CLAIM', { claim: { content: 'f' + i } });
    w.emit(did, 'CONFIRM', { target_premise_id: prem.id });
  }
  const many = crossVerify(prem.id, w.meCtx).n_confirmers;
  assert.equal(one, 1);
  assert.equal(many, 5, 'distinct human roots inflate the confirmer count — the U1 frontier is REAL, not claimed-defeated');
  w.cleanup();
});

console.log(`\n[grounding] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
