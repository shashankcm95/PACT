#!/usr/bin/env node
'use strict';

// PACT v0 -- vouch-freshness-convert integration (plans/36 W2 §5 items 10-12; the BEHAVIORAL disarmed-inertness
// witness §3(ii)). Drives the freshness filter end-to-end through the REAL mint -> store -> verifiedRecords ->
// filterFreshVouches -> buildVouchGraph -> disjointPaths path with GENUINE signed records.
//
//   - item 10 (byte-identity / disarmed inertness): a meCtx with NO .freshness yields the FULL unfiltered
//     disjoint_paths -- the filter drops nothing (byte-identical to pre-W2 for every existing caller).
//   - item 11 (armed NARROWS / NON-VACUITY): the SAME world armed drops the stale + bare edges, so
//     dpArmed < dpDisarmed STRICTLY (the load-bearing non-vacuity witness) -- and actionable STAYS false (NS-9).
//   - item 12 (co-forge, EXPECTED SHADOW pass): a same-uid attacker's genuinely-fresh VOUCH under its OWN key is
//     KEPT armed -- freshness NARROWS replay, it does NOT close the co-forge (integrity != provenance, #273).

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { convert, disjointPaths } = require('../../src/trust/convert');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ARMED = { now: NOW, ttlMs: DAY };
const FRESH = { approved_at: NOW - 1000, nonce: 'fresh-nonce-01' };
const STALE = { approved_at: NOW - 10 * DAY, nonce: 'stale-nonce-01' };

const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-w2-'));
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
  // emit a SIGNED VOUCH src -> target (freshness OMITTED when undefined = a bare VOUCH), append to ME's store.
  function vouch(src, target, freshness) {
    const payload = { target_persona: target, ...(freshness !== undefined ? { freshness } : {}) };
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: personas[src].human, type: 'VOUCH', seq: seq++, nonce: 'n' + seq, payload }, { privateKeyPem: personas[src].kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: ME, stateDir: STATE });
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  return { STATE, registry, personas, meCtx, ME, add, addUnder, vouch };
}

// A 3-path topology so a DROP actually LOWERS the count (the non-vacuity precondition): ME->A(fresh),
// ME->B(stale), ME->C(bare); A/B/C ->AGENT all fresh. disarmed dp=3; armed dp=1 (only the fresh path survives).
function threePathWorld() {
  const w = freshWorld();
  w.add('did:key:zA'); w.add('did:key:zB'); w.add('did:key:zC'); w.add('did:key:zAGENT');
  w.vouch('did:key:zME', 'did:key:zA', FRESH);    // fresh -> survives armed
  w.vouch('did:key:zME', 'did:key:zB', STALE);    // stale -> drops armed
  w.vouch('did:key:zME', 'did:key:zC', undefined); // bare  -> drops armed (H1)
  w.vouch('did:key:zA', 'did:key:zAGENT', FRESH);
  w.vouch('did:key:zB', 'did:key:zAGENT', FRESH);
  w.vouch('did:key:zC', 'did:key:zAGENT', FRESH);
  return w;
}

// ---- item 10: DISARMED byte-identity (the behavioral inertness witness) ----
test('DISARMED (no meCtx.freshness): the FULL unfiltered disjoint_paths -- the filter drops nothing', () => {
  const w = threePathWorld();
  const dp = disjointPaths(w.meCtx, 'did:key:zME', 'did:key:zAGENT');
  assert.equal(dp, 3, 'disarmed must count all 3 paths (stale + bare edges NOT dropped) -- byte-identical to pre-W2');
  const out = convert(w.meCtx, 'did:key:zME', 'did:key:zAGENT');
  assert.equal(out.disjoint_paths, 3);
  assert.equal(out.actionable, false, 'SHADOW: actionable is hard-false regardless (INV-16)');
});

// ---- item 11: ARMED narrows + NON-VACUITY (dpArmed < dpDisarmed) + monotonicity + still-SHADOW ----
test('ARMED (meCtx.freshness={now,ttlMs}): drops stale + bare -> dpArmed < dpDisarmed; actionable STILL false', () => {
  const w = threePathWorld();
  const armedCtx = { ...w.meCtx, freshness: ARMED };
  const dpDisarmed = disjointPaths(w.meCtx, 'did:key:zME', 'did:key:zAGENT');
  const dpArmed = disjointPaths(armedCtx, 'did:key:zME', 'did:key:zAGENT');
  assert.equal(dpDisarmed, 3);
  assert.equal(dpArmed, 1, 'armed: only the fresh ME->A->AGENT path survives (stale + bare dropped)');
  assert.ok(dpArmed < dpDisarmed, 'NON-VACUITY: arming must strictly LOWER the count -- else the inertness witness is vacuous');
  assert.ok(dpArmed <= dpDisarmed, 'MONOTONIC: arming can only narrow, never manufacture a path');
  const out = convert(armedCtx, 'did:key:zME', 'did:key:zAGENT');
  assert.equal(out.disjoint_paths, 1);
  assert.equal(out.actionable, false, 'NS-9: armed NARROWS the advisory count only -- it does NOT gate/harden');
});

// ---- item 12: co-forge -- a SAME-ROOT Sybil's FRESH chain is KEPT armed (ceiling unchanged, integrity != provenance) ----
test('CO-FORGE (NS-9 EXPECTED SHADOW pass): a SAME-human-root Sybil FRESH chain SURVIVES armed -- freshness != provenance/U1', () => {
  const w = freshWorld();
  // an attacker controls ONE human root but registers TWO personas (a Sybil), EACH with its OWN key, under the
  // SAME humanUid. Both mint genuinely-FRESH VOUCHes. Freshness verifies the sig + the <=TTL window (INTEGRITY) --
  // it does NOT establish provenance OR human-uniqueness (U1), so every same-root fresh edge is KEPT. Freshness
  // NARROWS replay of OLD edges; it does NOT close the co-forge ceiling (a same-uid holder of registered keys
  // always mints authentic fresh records -- #273 / U1). Only a deployed cross-uid signer hardens.
  w.addUnder('did:key:zSock1', 'human:attacker');
  w.addUnder('did:key:zSock2', 'human:attacker');   // SAME human root as zSock1 (genuinely same-uid)
  w.add('did:key:zAgent2');
  w.vouch('did:key:zME', 'did:key:zSock1', FRESH);
  w.vouch('did:key:zSock1', 'did:key:zSock2', FRESH);   // a same-root co-vouch, genuinely fresh
  w.vouch('did:key:zSock2', 'did:key:zAgent2', FRESH);
  const armedCtx = { ...w.meCtx, freshness: ARMED };
  // precondition (non-vacuity): the two sock personas genuinely share ONE human root.
  assert.equal(w.personas['did:key:zSock1'].human, w.personas['did:key:zSock2'].human, 'the Sybil personas must share a human root');
  const dp = disjointPaths(armedCtx, 'did:key:zME', 'did:key:zAgent2');
  assert.equal(dp, 1, 'the same-root Sybil FRESH chain is KEPT armed -- freshness gates neither provenance nor U1 (integrity != provenance, #273)');
});

console.log(`\n[vouch-freshness-convert] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
