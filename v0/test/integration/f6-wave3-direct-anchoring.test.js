#!/usr/bin/env node
'use strict';

// PACT v0 -- F6 Wave-3: direct anchoring (plan 62, ADR-0004 Decision 1).
//
// `direct` was OPEN because anchoring it inverts NS-9 at model.js trust() = alpha*directE + (1-alpha)*consE with
// alpha = alpha(rEv+sEv) (hazard d). ADR-0004's re-derivation: base alpha on the RAW interaction count
// (rEv_raw + sEv), anchor the positive rEv leg into directE ONLY, keep sEv/resolution/consensus RAW. This suite is
// the RED-first obligation the ADR mandates: M0 (trust()-level monotonicity, non-vacuous), M1 (alpha
// provenance-invariant), D1-D8 (the fold witnesses), S1 (structural recs-seam). All SHADOW; arms nothing.

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
const { verifiedRecords } = require('../../src/trust/read-gate');
const { opinion, expectation } = require('../../src/trust/opinion');
const { direct } = require('../../src/trust/direct');
const { trust } = require('../../src/trust/model');
const { wcons } = require('../../src/trust/consensus');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const ME = 'did:key:zME';
const _dirs = [];
process.on('exit', () => { for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// Same anchWorld fixture as f6-wave1/2: each persona is ANCHORED (root + verifying sigma_root -> survives arming)
// or UNANCHORED (persona only -> its records DROP when regProvenance.sigmaRoots is armed).
function anchWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-f6w3-'));
  _dirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {};
  const sigmaRoots = {};
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
  function claimIdOf(agentDid) {
    const r = raw().find((x) => x.type === 'CLAIM' && x.src_persona_did === agentDid);
    if (!r) throw new Error('fixture: no CLAIM found for ' + agentDid);
    return r.record_id;
  }
  return { registry, personas, meCtx, armedCtx, sigmaRoots, addPersona, emit, earn, raw, claimIdOf };
}

// Build an un-anchored agent with N uncontested claims + a distinct-human earned voucher whose vouch value pins
// consE ABOVE the armed directE (the ADR reproducer shape: consE > directE so a broken alpha-on-anchored INVERTS).
function spammyAgentWithVoucher(nClaims, vouchValue) {
  const w = anchWorld();
  w.addPersona('did:key:zAgent', false); // un-anchored -> claims drop from posIds armed
  w.addPersona('did:key:zV', false);     // voucher: distinct human, earned
  for (let i = 0; i < nClaims; i++) w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'a' + i } });
  w.earn('did:key:zV');
  w.emit('did:key:zV', 'VOUCH', { target_persona: 'did:key:zAgent', value: vouchValue });
  return w;
}

// ---------- M0: trust()-level monotonicity (the whole point) ----------

test('M0 trust() NS-9: arming NARROWS trust (a broken alpha-on-anchored would RAISE it); non-vacuous', () => {
  const w = spammyAgentWithVoucher(3, 0.95); // directE_disarmed=E(3,0)=0.8, consE=0.95 > directE_armed=E(0,0)=0.5
  const tD = trust(w.meCtx, ME, 'did:key:zAgent', undefined, undefined);
  const tA = trust(w.armedCtx(), ME, 'did:key:zAgent', undefined, undefined);
  assert.ok(expectation(tA.direct) < expectation(tD.direct), 'NON-VACUOUS: arming narrows directE (un-anchored agent CLAIMs drop)');
  assert.ok(tA.value <= tD.value, 'NS-9: trust_armed <= trust_disarmed');
  assert.ok(tA.value < tD.value, 'trust strictly narrows here; a broken alpha(d.r) would INVERT (0.95 > 0.894, the +0.056)');
});

// ---------- M1: alpha is provenance-invariant (reads rEv_raw + sEv), non-vacuously ----------

test('M1 alpha provenance-invariant: alpha unchanged armed-vs-disarmed while direct.r strictly narrows', () => {
  const w = spammyAgentWithVoucher(3, 0.95);
  const tD = trust(w.meCtx, ME, 'did:key:zAgent', undefined, undefined);
  const tA = trust(w.armedCtx(), ME, 'did:key:zAgent', undefined, undefined);
  assert.equal(tA.alpha, tD.alpha, 'alpha reads the RAW interaction count (rEv_raw + sEv) -> invariant under arming');
  assert.ok(tA.direct.r < tD.direct.r, 'NON-VACUOUS: the anchored direct.r strictly narrowed (0 < 3) while alpha held');
});

// ---------- V0: DISARMED value-identity at the PUBLIC trust() surface (not just at direct()) ----------

test('V0 disarmed value-identity: the public trust().value is pinned at the pre-diff blend', () => {
  const w = spammyAgentWithVoucher(3, 0.95);
  const tD = trust(w.meCtx, ME, 'did:key:zAgent', undefined, undefined);
  // disarmed: alpha(3)=0.375, directE=E(3,0)=0.8, consE=wcons=0.95 -> 0.375*0.8 + 0.625*0.95 = 0.89375 (ADR 0.894)
  assert.ok(Math.abs(tD.value - 0.89375) < 1e-9, 'disarmed trust().value == the pre-diff blend (value-identity pinned at the PUBLIC surface, not only algebraically implied); got ' + tD.value);
  assert.equal(tD.direct.rRaw, tD.direct.r, 'disarmed: rRaw === r at the public surface too');
});

// ---------- D1: standalone direct narrows; rRaw (the alpha basis) is invariant ----------

test('D1 standalone direct narrows: an un-anchored agent CLAIM drops from rEv; rRaw invariant', () => {
  const w = anchWorld();
  w.addPersona('did:key:zAgent', false);
  w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'c' } });
  const dD = direct(w.meCtx, 'did:key:zAgent');
  const dA = direct(w.armedCtx(), 'did:key:zAgent');
  assert.ok(dD.r > 0, 'non-vacuous: disarmed direct has a positive rEv');
  assert.ok(dA.r < dD.r, 'un-anchored agent CLAIM drops from rEv armed');
  assert.equal(dA.r, 0, 'a fully un-anchored agent narrows to rEv = 0');
  assert.equal(dA.rRaw, dD.rRaw, 'rRaw (the alpha basis) is provenance-invariant');
});

// ---------- D2: raw resolution -- anchoring the un-anchored CLAIM does NOT un-resolve its CONTEST ----------

test('D2 raw resolution: an un-anchored contested CLAIM keeps its CONTEST valid (sEv stays raw)', () => {
  const w = anchWorld();
  w.addPersona('did:key:zAgent', false); // un-anchored -> its CLAIM drops from posIds armed
  w.addPersona('did:key:zCon', true);
  w.earn('did:key:zCon');
  w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'contested' } });
  w.emit('did:key:zCon', 'CONTEST', { target_persona: 'did:key:zAgent', target_claim_id: w.claimIdOf('did:key:zAgent') });
  const dD = direct(w.meCtx, 'did:key:zAgent');
  const dA = direct(w.armedCtx(), 'did:key:zAgent');
  assert.ok(dD.s > 0, 'non-vacuous: there IS disbelief (a valid contest) to preserve');
  assert.equal(dA.s, dD.s, 'RAW resolution: the dropped un-anchored CLAIM stays in agentClaimIds -> CONTEST still resolves -> sEv unchanged');
});

// ---------- D3: crater (>=2 earned) holds RAW under arming ----------

test('D3 crater raw: a >=2-earned crater is unchanged under arming (resolution/crater stay raw)', () => {
  const w = anchWorld();
  w.addPersona('did:key:zAgent', false);
  w.addPersona('did:key:zC1', true);
  w.addPersona('did:key:zC2', true);
  w.earn('did:key:zC1'); w.earn('did:key:zC2');
  w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'x' } });
  const cid = w.claimIdOf('did:key:zAgent');
  w.emit('did:key:zC1', 'CONTEST', { target_persona: 'did:key:zAgent', target_claim_id: cid });
  w.emit('did:key:zC2', 'CONTEST', { target_persona: 'did:key:zAgent', target_claim_id: cid });
  const dD = direct(w.meCtx, 'did:key:zAgent');
  const dA = direct(w.armedCtx(), 'did:key:zAgent');
  assert.ok(dD.s >= 2, 'non-vacuous: crater active (>=2 earned distinct-human contests)');
  assert.equal(dA.s, dD.s, 'the crater holds RAW under arming');
});

// ---------- D4: recs-seam -- wcons is invariant under arming ----------

test('D4 recs-seam: wcons (the mean over direct) is invariant under arming (passes raw recs)', () => {
  const w = anchWorld();
  w.addPersona('did:key:zAgent', false);
  w.addPersona('did:key:zV', false);
  w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'w' } });
  w.earn('did:key:zV');
  w.emit('did:key:zV', 'VOUCH', { target_persona: 'did:key:zAgent', value: 0.9 });
  const cD = wcons(w.meCtx, ME, 'did:key:zAgent');
  const cA = wcons(w.armedCtx(), ME, 'did:key:zAgent');
  assert.ok(cD.defined, 'non-vacuous: wcons is defined (a real voucher)');
  assert.deepEqual(cA, cD, 'recs-seam: wcons invariant under arming (its nested direct(voucher) reads raw recs)');
});

// ---------- D6: DISARMED value-identity (opinion fields == pre-diff; rRaw === r) ----------

test('D6 disarmed value-identity: direct disarmed == opinion(r,s); rRaw === r (the added field is inert)', () => {
  const w = anchWorld();
  w.addPersona('did:key:zAgent', true);
  w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'p1' } });
  w.emit('did:key:zAgent', 'CLAIM', { claim: { content: 'p2' } });
  const d = direct(w.meCtx, 'did:key:zAgent');
  const e = opinion(2, 0);
  assert.equal(d.b, e.b); assert.equal(d.d, e.d); assert.equal(d.u, e.u);
  assert.equal(d.r, 2); assert.equal(d.s, 0);
  assert.equal(d.rRaw, d.r, 'disarmed: rRaw === r (value-identity; the added field equals the anchored value)');
});

// ---------- D7 (structural): posIds is a Set, not an object -> membership cannot be proto-polluted ----------
// ---------- D8: co-arming absence -- direct reads no entanglement detector (no A9 class) ----------

test('D8 co-arming absence + D7 proto-safety: no entanglement detector; posIds is a proto-safe Set', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/trust/direct.js'), 'utf8');
  assert.ok(/authenticatedAnchoredRecordsFrom/.test(src), 'positive control: the regex matcher fires on a token known to be present in direct.js');
  assert.ok(!/entanglementDetector|independenceLabel/.test(src), 'D8: direct has no entanglement-demote leg -> the anchoring o demote non-commute (A9) does not exist here');
  assert.ok(/posIds = new Set\(/.test(src), 'D7: posIds membership is a Set (structural), not an object lookup');
  assert.equal(new Set(['abc']).has('__proto__'), false, 'D7 runtime: Set membership is proto-safe -> a "__proto__" record_id cannot spoof posIds membership (record_id is also HEX64-gated on the store read)');
});

// ---------- S1: structural recs-seam -- no standalone direct feeds the consensus mean ----------

test('S1 structural: no standalone direct() feeds a weighted mean (ANY src consumer, not just consensus.js)', () => {
  const SRC = path.join(__dirname, '../../src');
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  })(SRC);
  // The ADR-0004 forward contract covers ANY future mean-consumer, not only consensus.js. Scan every src file that
  // imports ./direct and calls direct(); each call MUST pass raw `recs` (else it anchors -> hazard-d recurs).
  // model.js is the ONE intended standalone consumer (it anchors AND reads rRaw for alpha) -> excluded.
  let scanned = 0;
  for (const f of files) {
    if (path.basename(f) === 'model.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    if (!/require\(['"][^'"]*\/direct(?:\.js)?['"]\)/.test(src)) continue;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); // strip comments (commented direct() is not a call)
    for (const c of (code.match(/\bdirect\([^)]*\)/g) || [])) {
      scanned++;
      assert.ok(/,\s*recs\s*\)/.test(c), 'S1: a mean-consuming direct() in ' + path.relative(SRC, f) + ' MUST pass raw recs (else it anchors -> hazard-d recurs): ' + c);
    }
  }
  assert.ok(scanned > 0, 'non-vacuous: at least one non-model.js direct() call site (consensus.js today) was scanned');
});

console.log(`\n[f6-wave3-direct-anchoring] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
