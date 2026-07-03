#!/usr/bin/env node
'use strict';

// PACT v0 -- registration-gate-convert integration (plans/39 §"Test controls" items 10, 11, 11b + the BEHAVIORAL
// disarmed-inertness). Drives the registration-provenance filter end-to-end through the REAL mint -> store ->
// verifiedRecords -> filterAnchoredRecords -> filterFreshVouches -> buildVouchGraph -> disjointPaths path with
// GENUINE signed records + real sigma_root bindings.
//
//   - item 10 (byte-identity / disarmed inertness): a meCtx with NO .regProvenance yields the FULL unfiltered
//     disjoint_paths -- the filter drops nothing (byte-identical to pre-plans/39 for every existing caller).
//   - item 11b (partially-migrated world / armed NARROWS / NON-VACUITY): the SAME world armed drops the two
//     UNMAPPED legit personas' edges, so dpArmed < dpDisarmed STRICTLY -- and actionable STAYS false (NS-9).
//   - item 11 (monotonicity PROPERTY): a committed seeded fuzz -- arming can only HOLD-or-LOWER the count.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { signSigmaRoot } = require('../../src/identity/sigma-root');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { convert, disjointPaths, buildVouchGraph, maxVertexDisjointPaths } = require('../../src/trust/convert');
const { filterAnchoredRecords } = require('../../src/trust/registration-gate');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
function quiet(fn) { const orig = process.stderr.write.bind(process.stderr); process.stderr.write = () => true; try { return fn(); } finally { process.stderr.write = orig; } }

const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// A world where personas can be ANCHORED (a sigma_root signed by their human's seeded root key, added to the
// injected map) or UNANCHORED (registered + sig-verifying, but NO sigma_root -- a legacy / self-register persona).
function anchoredWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-p39-'));
  _allDirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {};
  const rootPrivByHuman = {};
  const sigmaRoots = {};
  let seq = 0;
  function ensureRoot(human) {
    if (rootPrivByHuman[human]) return;
    const rk = newPersonaKeypair();
    reg.registerRoot(registry, { humanUid: human, rootPublicKeyPem: rk.publicKeyPem });
    rootPrivByHuman[human] = rk.privateKeyPem;
  }
  // add a persona; anchor=true also seeds its human root + signs+maps a sigma_root over its binding.
  function add(did, { anchor = false, human = 'human:' + did } = {}) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    if (anchor) {
      ensureRoot(human);
      const sig = signSigmaRoot({ personaDid: did, publicKeyPem: kp.publicKeyPem, controller: human }, { privateKeyPem: rootPrivByHuman[human] });
      assert.ok(sig, 'sigma_root must sign for ' + did);
      sigmaRoots[did] = sig;
    }
    return did;
  }
  function vouch(src, target) {
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: personas[src].human, type: 'VOUCH', seq: seq++, nonce: 'n' + seq, payload: { target_persona: target } }, { privateKeyPem: personas[src].kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: personas.__me, stateDir: STATE });
    if (!ap.ok) throw new Error('append: ' + ap.reason);
  }
  function meCtx() { return { registry, storeOpts: { receiverId: personas.__me, stateDir: STATE } }; }
  return { registry, sigmaRoots, add, vouch, meCtx, setMe: (did) => { personas.__me = did; } };
}

// 3-path topology so a DROP LOWERS the count: ME->A, ME->B, ME->C; A/B/C ->AGENT. ME + A anchored; B + C
// UNMAPPED legit (the partially-migrated state). disarmed dp=3; armed dp=1 (only the ME->A->AGENT path survives).
function threePathWorld() {
  const w = anchoredWorld();
  const ME = w.add('did:key:zME', { anchor: true, human: 'human:me' });
  w.setMe(ME);
  const A = w.add('did:key:zA', { anchor: true, human: 'human:a' });
  const B = w.add('did:key:zB', { anchor: false, human: 'human:b' }); // UNMAPPED legit (pre-migration)
  const C = w.add('did:key:zC', { anchor: false, human: 'human:c' }); // UNMAPPED legit
  const AGENT = w.add('did:key:zAGENT', { anchor: true, human: 'human:agent' });
  w.vouch(ME, A); w.vouch(ME, B); w.vouch(ME, C);
  w.vouch(A, AGENT); w.vouch(B, AGENT); w.vouch(C, AGENT);
  return { w, ME, AGENT };
}

// ---- item 10: byte-identity / disarmed inertness -- no meCtx.regProvenance -> the FULL unfiltered count ----
test('DISARMED inertness: a meCtx with no .regProvenance counts the FULL unfiltered graph (dp = 3)', () => {
  const { w, ME, AGENT } = threePathWorld();
  const dp = disjointPaths(w.meCtx(), ME, AGENT);
  assert.equal(dp, 3, 'disarmed -> all three paths counted (byte-identical to pre-plans/39)');
});

// ---- item 11b: PARTIALLY-MIGRATED world -- armed drops the two UNMAPPED legit personas; actionable stays false ----
test('ARMED partially-migrated: the two unmapped legit personas DROP -> dp 3->1 (strict), actionable STILL false', () => {
  const { w, ME, AGENT } = threePathWorld();
  const disarmedCtx = w.meCtx();
  const armedCtx = { ...w.meCtx(), regProvenance: { sigmaRoots: w.sigmaRoots } };
  const dpDisarmed = quiet(() => disjointPaths(disarmedCtx, ME, AGENT));
  const dpArmed = quiet(() => disjointPaths(armedCtx, ME, AGENT));
  assert.equal(dpDisarmed, 3, 'disarmed dp = 3');
  assert.equal(dpArmed, 1, 'armed dp = 1 (only the ME->A->AGENT anchored path survives)');
  assert.ok(dpArmed < dpDisarmed, 'armed STRICTLY narrows (non-vacuity)');
  const out = quiet(() => convert(armedCtx, ME, AGENT));
  assert.equal(out.actionable, false, 'NS-9: actionable STAYS hard-false even armed (nothing gates)');
  assert.equal(out.disjoint_paths, 1, 'the narrowed advisory count flows through convert');
});

// ---- item 11: monotonicity PROPERTY -- committed seeded fuzz, dpArmed <= dpDisarmed, non-vacuous ----
test('monotonicity PROPERTY: dpArmed <= dpDisarmed over seeded anchored/unanchored graphs (arming never adds a path)', () => {
  // Direct filterAnchoredRecords -> buildVouchGraph -> maxVertexDisjointPaths (no store I/O -- fast). A committed
  // LCG builds random vouch graphs where each persona is anchored (in the sigmaRoots map -> a passing verdict) or
  // not. We simulate the judge verdict via a registry seeded with real bindings, so the KEEP/DROP is genuine.
  let s = 0x1234abcd >>> 0;
  const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
  let strictlyNarrowed = 0;
  const TRIALS = 120;
  for (let t = 0; t < TRIALS; t++) {
    const N = 3 + rnd(4);                       // 3..6 nodes
    const registry = reg.createRegistry();
    const sigmaRoots = {};
    const ids = [];
    for (let i = 0; i < N; i++) {
      const did = 'did:key:z' + t + '_' + i;
      const human = 'human:' + did;
      const kp = newPersonaKeypair();
      reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
      if (rnd(2) === 0) {                        // ~half anchored
        const rk = newPersonaKeypair();
        reg.registerRoot(registry, { humanUid: human, rootPublicKeyPem: rk.publicKeyPem });
        sigmaRoots[did] = signSigmaRoot({ personaDid: did, publicKeyPem: kp.publicKeyPem, controller: human }, { privateKeyPem: rk.privateKeyPem });
      }
      ids.push(did);
    }
    const recs = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (i === j || rnd(2) === 0) continue;
      recs.push({ type: 'VOUCH', src_persona_did: ids[i], record_id: 'r' + t + '_' + i + '_' + j, payload: { target_persona: ids[j] } });
    }
    const src = ids[0]; const sink = ids[N - 1];
    const dpDisarmed = maxVertexDisjointPaths(buildVouchGraph(filterAnchoredRecords(recs, registry, undefined)), src, sink);
    const dpArmed = maxVertexDisjointPaths(buildVouchGraph(quiet(() => filterAnchoredRecords(recs, registry, { sigmaRoots }))), src, sink);
    assert.ok(dpArmed <= dpDisarmed, 'trial ' + t + ': arming RAISED the count (' + dpArmed + ' > ' + dpDisarmed + ') -- impossible');
    if (dpArmed < dpDisarmed) strictlyNarrowed++;
  }
  assert.ok(strictlyNarrowed > 0, 'NON-VACUITY: at least one trial must strictly narrow; got ' + strictlyNarrowed);
});

console.log(`\n[registration-gate-convert] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
