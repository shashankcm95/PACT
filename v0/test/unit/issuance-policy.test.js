#!/usr/bin/env node
'use strict';

// PACT U1 — stake S3 tests (plans/21 §3 — the executable contract). TDD: written FIRST as the spec.
// S3 is a stake-aware issuance-policy ADVISORY readout (`no-stake` | `stake-required`) reusing S1-S2's stakeOf
// fold. SHADOW: it gates NOTHING (registerPersona untouched; gates:false). The load-bearing tests are the
// PROVENANCE-REUSE (a forged stake never makes a root "meet" the bar — inherits the S1-S2 verifiedRecords gate),
// the FAIL-CLOSED `mode` (meets_policy is a strict boolean on every path; an unknown mode THROWS, never undefined
// — VERIFY hacker HIGH-1), and the registry-not-oracle / SHADOW guards. NARROWS, does not harden (plans/21 §0).

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
const { buildStakeSpec, STAKE_TYPE } = require('../../src/identity/stake');
const { createStakeAnchor } = require('../../src/trust/stake-anchor');
const { createIssuancePolicy, meetsPolicy, POLICY_MODES } = require('../../src/trust/issuance-policy');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

function signerFor(pem) {
  return (rid) => crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(pem)).toString('base64');
}

let SEQ = 0;
function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-issuance-'));
  const registry = reg.createRegistry();
  const personas = {};
  function addUnder(did, human) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    return did;
  }
  const ME = addUnder('did:key:zME', 'human:me');
  const storeOpts = { receiverId: ME, stateDir: STATE };
  const anchor = createStakeAnchor({ registry });
  function policy(mode) { return createIssuancePolicy({ registry, anchor, mode }); }
  // mint a STAKE through the custody minter (the legit path) and append to ME's store.
  function mintStake(src, lockExpiry) {
    const p = personas[src];
    const minter = createMinter({ signer: signerFor(p.kp.privateKeyPem), personaDid: src, humanUid: p.human });
    const r = minter.mint(buildStakeSpec({ lockExpiry, seq: SEQ++, nonce: 'n' + SEQ }));
    if (!r.ok) throw new Error('mint: ' + r.reason);
    const ap = appendRecord(r.frame, storeOpts);
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return r.frame;
  }
  // build a raw STAKE frame (the UNGUARDED production path — used to model attacks the minter would refuse).
  function rawStake(src, { parentHumanUid, signWith, sign = true, lockExpiry = 1000 }) {
    const p = personas[src];
    const spec = { srcPersonaDid: src, parentHumanUid: parentHumanUid != null ? parentHumanUid : p.human, type: STAKE_TYPE, seq: SEQ++, nonce: 'n' + SEQ, payload: { lock_expiry: lockExpiry } };
    if (!sign) {
      const body = { ver: 'pact/0', type: spec.type, src_persona_did: spec.srcPersonaDid, parent_human_uid: spec.parentHumanUid, seq: spec.seq, nonce: spec.nonce, payload: spec.payload };
      body.record_id = computeRecordId(body);
      const ap = appendRecord(body, storeOpts);
      if (!ap.ok) throw new Error('append-unsigned: ' + ap.reason);
      return body;
    }
    const pem = signWith || p.kp.privateKeyPem;
    const built = buildFrame(spec, { privateKeyPem: pem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, storeOpts);
    if (!ap.ok) throw new Error('append: ' + ap.reason);
    return built.frame;
  }
  return {
    STATE, registry, personas, ME, storeOpts, anchor, policy, addUnder, mintStake, rawStake,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } },
  };
}

const KEYS = ['advisory', 'gates', 'known', 'meets_policy', 'policy', 'reason', 'stake'];

// ===================== no-stake mode (default — S3 is a no-op here; proves non-breaking) =====================

test('no-stake: a KNOWN root with no STAKE meets the v0 bar (registration alone)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const r = w.policy('no-stake').evaluate(w.storeOpts, 'human:A', 0);
  assert.equal(r.policy, 'no-stake');
  assert.equal(r.known, true);
  assert.equal(r.meets_policy, true);
  assert.equal(r.gates, false);
  assert.equal(r.advisory, true);
  w.cleanup();
});

test('no-stake: the DEFAULT mode is no-stake (omitted mode === no-stake)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const r = createIssuancePolicy({ registry: w.registry, anchor: w.anchor }).evaluate(w.storeOpts, 'human:A', 0);
  assert.equal(r.policy, 'no-stake');
  assert.equal(r.meets_policy, true);
  w.cleanup();
});

test('no-stake: an UNKNOWN root does NOT meet (known:false)', () => {
  const w = freshWorld();
  const r = w.policy('no-stake').evaluate(w.storeOpts, 'human:nobody', 0);
  assert.equal(r.known, false);
  assert.equal(r.meets_policy, false);
  w.cleanup();
});

// ===================== stake-required mode (the new bar) =====================

test('stake-required: a known root with a custody-minted LOCKED stake meets the bar', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 5000);
  const r = w.policy('stake-required').evaluate(w.storeOpts, 'human:A', 4999);
  assert.equal(r.policy, 'stake-required');
  assert.equal(r.known, true);
  assert.equal(r.stake.status, 'locked');
  assert.equal(r.meets_policy, true);
  w.cleanup();
});

test('stake-required: an UNLOCKED stake (lock lapsed) does NOT meet the bar', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 5000);
  const r = w.policy('stake-required').evaluate(w.storeOpts, 'human:A', 5000); // nowMs >= lockedUntil
  assert.equal(r.stake.status, 'unlocked');
  assert.equal(r.meets_policy, false);
  w.cleanup();
});

test('stake-required: a known root with NO stake does NOT meet (the bootstrap/unstaked case)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const r = w.policy('stake-required').evaluate(w.storeOpts, 'human:A', 0);
  assert.equal(r.known, true);
  assert.equal(r.stake.status, 'none');
  assert.equal(r.meets_policy, false);
  w.cleanup();
});

test('stake-required: an UNKNOWN root does NOT meet', () => {
  const w = freshWorld();
  const r = w.policy('stake-required').evaluate(w.storeOpts, 'human:nobody', 0);
  assert.equal(r.known, false);
  assert.equal(r.meets_policy, false);
  w.cleanup();
});

// ===================== provenance reuse (inherits the S1-S2 gate — assert it is NOT re-opened) =====

test('provenance: a forged UNSIGNED STAKE for a victim root does NOT make it meet stake-required', () => {
  const w = freshWorld();
  w.addUnder('did:key:zAttacker', 'human:attacker');
  w.rawStake('did:key:zAttacker', { parentHumanUid: 'human:victim', sign: false, lockExpiry: 9e12 });
  const r = w.policy('stake-required').evaluate(w.storeOpts, 'human:victim', 0);
  assert.equal(r.stake.status, 'none'); // dropped by verifiedRecords (no sig)
  assert.equal(r.meets_policy, false);
  w.cleanup();
});

test('provenance: a forged parent_human_uid counts under the SIGNER\'s real root only (not the forged one)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zX', 'human:A'); // zX registered under human:A
  w.rawStake('did:key:zX', { parentHumanUid: 'human:B', lockExpiry: 5000 }); // signed by zX, claims root B
  const p = w.policy('stake-required');
  assert.equal(p.evaluate(w.storeOpts, 'human:B', 0).meets_policy, false);   // NOT under the forged root
  assert.equal(p.evaluate(w.storeOpts, 'human:A', 0).meets_policy, true);    // under the signer's real root
  w.cleanup();
});

// ===================== registry-not-oracle / SHADOW / fail-closed boundary =====================

test('shape: evaluate returns exactly {advisory,gates,known,meets_policy,policy,reason,stake} — no actionable/score/edge', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const r = w.policy('no-stake').evaluate(w.storeOpts, 'human:A', 0);
  assert.deepEqual(Object.keys(r).sort(), KEYS);
  assert.equal('actionable' in r, false);
  assert.equal(r.gates, false); // ALWAYS — documentary marker
  w.cleanup();
});

test('meets_policy is a STRICT BOOLEAN on every legal path (never undefined)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 5000);
  for (const mode of ['no-stake', 'stake-required']) {
    for (const [uid, now] of [['human:A', 0], ['human:A', 9e12], ['human:nobody', 0]]) {
      const mp = w.policy(mode).evaluate(w.storeOpts, uid, now).meets_policy;
      assert.equal(typeof mp, 'boolean', mode + '/' + uid + ' meets_policy not boolean: ' + mp);
    }
  }
  w.cleanup();
});

test('fail-closed mode: meetsPolicy THROWS on an unknown mode (the evaluate-side default branch — not undefined)', () => {
  // a mode smuggled past construction must fail CLOSED in the decision fn, never yield meets_policy:undefined.
  assert.throws(() => meetsPolicy({ mode: 'admin-bypass', known: true, stake: { status: 'locked' } }), /unknown policy mode/);
  assert.equal(meetsPolicy({ mode: POLICY_MODES.NO_STAKE, known: true, stake: { status: 'none' } }), true);
  assert.equal(meetsPolicy({ mode: POLICY_MODES.STAKE_REQUIRED, known: true, stake: { status: 'locked' } }), true);
  assert.equal(meetsPolicy({ mode: POLICY_MODES.STAKE_REQUIRED, known: true, stake: { status: 'unlocked' } }), false);
});

test('registerPersona is UNMODIFIED — registering under stake-required still succeeds (the policy is separate)', () => {
  const w = freshWorld();
  // registering a persona with no pre-existing stake must NOT throw under any policy mode (registry-not-oracle).
  assert.doesNotThrow(() => w.addUnder('did:key:zFresh', 'human:fresh'));
  assert.equal(reg.isKnownRoot(w.registry, 'human:fresh'), true);
  // and the policy readout is a SEPARATE consult — it reads false, but registration already happened.
  assert.equal(w.policy('stake-required').evaluate(w.storeOpts, 'human:fresh', 0).meets_policy, false);
  w.cleanup();
});

test('construction fail-closes: bad registry / anchor / mode throw at createIssuancePolicy', () => {
  const w = freshWorld();
  assert.throws(() => createIssuancePolicy(null), /registry is required/);
  assert.throws(() => createIssuancePolicy({ anchor: w.anchor, mode: 'no-stake' }), /registry is required/);
  assert.throws(() => createIssuancePolicy({ registry: w.registry, mode: 'no-stake' }), /anchor/);
  assert.throws(() => createIssuancePolicy({ registry: w.registry, anchor: {}, mode: 'no-stake' }), /stakeOf/);
  assert.throws(() => createIssuancePolicy({ registry: w.registry, anchor: { stakeOf: 'nope' }, mode: 'no-stake' }), /stakeOf/);
  assert.throws(() => createIssuancePolicy({ registry: w.registry, anchor: w.anchor, mode: 'bogus' }), /unknown policy mode/);
  w.cleanup();
});

test('DI: a malicious anchor returning a malformed stake shape still yields meets_policy:false (strict ===)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const badAnchor = { stakeOf: () => ({ status: undefined, lockedUntil: 9e12 }) };
  const r = createIssuancePolicy({ registry: w.registry, anchor: badAnchor, mode: 'stake-required' }).evaluate(w.storeOpts, 'human:A', 0);
  assert.equal(r.meets_policy, false); // status !== 'locked' (exact equality launders nothing)
  // and a truthy-but-wrong status does not slip through either.
  const badAnchor2 = { stakeOf: () => ({ status: 'LOCKED_BUT_WRONG_CASE', lockedUntil: 9e12 }) };
  assert.equal(createIssuancePolicy({ registry: w.registry, anchor: badAnchor2, mode: 'stake-required' }).evaluate(w.storeOpts, 'human:A', 0).meets_policy, false);
  w.cleanup();
});

test('boundary: a non-string / __proto__ humanUid yields known:false, stake.status:none, meets_policy:false', () => {
  const w = freshWorld();
  const p = w.policy('stake-required');
  for (const uid of ['__proto__', 'constructor', '', {}, null, 42]) {
    const r = p.evaluate(w.storeOpts, uid, 0);
    assert.equal(r.known, false, 'known should be false for ' + String(uid));
    assert.equal(r.stake.status, 'none');
    assert.equal(r.meets_policy, false);
  }
  w.cleanup();
});

test('the stake field for an UNKNOWN root is {status:none, lockedUntil:null} (not "known root with no stake")', () => {
  const w = freshWorld();
  const r = w.policy('stake-required').evaluate(w.storeOpts, 'human:ghost', 0);
  assert.deepEqual(r.stake, { status: 'none', lockedUntil: null });
  assert.equal(r.known, false);
  w.cleanup();
});

test('immutable: mutating the return does not affect a second read; reason is a string', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 5000);
  const p = w.policy('stake-required');
  const r1 = p.evaluate(w.storeOpts, 'human:A', 0);
  assert.equal(typeof r1.reason, 'string');
  r1.meets_policy = 'TAMPERED'; r1.gates = true; r1.stake.status = 'TAMPERED';
  const r2 = p.evaluate(w.storeOpts, 'human:A', 0);
  assert.equal(r2.meets_policy, true);
  assert.equal(r2.gates, false);
  assert.equal(r2.stake.status, 'locked');
  w.cleanup();
});

test('non-finite clock inherits stakeOf conservative-locked (a garbage clock never spuriously fails the policy)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 5000);
  const p = w.policy('stake-required');
  for (const now of [NaN, null, Infinity]) {
    assert.equal(p.evaluate(w.storeOpts, 'human:A', now).meets_policy, true, 'clock ' + String(now));
  }
  w.cleanup();
});

// ===================== SHADOW: issuance-policy has ZERO consumers this wave (whole-tree, exact-set) =====

test('SHADOW: no src/ file imports issuance-policy this wave (zero consumers — S4/S5 widens explicitly)', () => {
  // Whole-tree walk. Exclude the impl by its RELATIVE path (not basename) so a future same-basename file in another
  // dir cannot silently slip past the walk (VALIDATE code-reviewer LOW). Zero consumers this wave; S4/S5 widen it.
  const SRC = path.join(__dirname, '..', '..', 'src');
  const SELF = path.join('trust', 'issuance-policy.js');
  const offenders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      if (!e.name.endsWith('.js') || path.relative(SRC, fp) === SELF) continue;
      if (/require\([^)]*issuance-policy[^)]*\)/.test(fs.readFileSync(fp, 'utf8'))) offenders.push(path.relative(SRC, fp));
    }
  })(SRC);
  assert.deepEqual(offenders, [], 'issuance-policy has a consumer (SHADOW broken — no gating surface may read it): ' + offenders.join(', '));
});

test('SHADOW precondition: issuance-policy.js exists + is non-empty (else the walk above disarms vacuously)', () => {
  const f = path.join(__dirname, '..', '..', 'src', 'trust', 'issuance-policy.js');
  assert.ok(fs.existsSync(f), 'issuance-policy.js missing — the SHADOW walk would pass vacuously');
  assert.ok(fs.statSync(f).size > 0, 'issuance-policy.js empty');
});

test('SHADOW belt+suspenders: the gating + bootstrap-brick surfaces import NEITHER stake-state module', () => {
  const SRC = path.join(__dirname, '..', '..', 'src');
  // precompile once per banned token (the pattern depends only on the token, not the scanned file). No `g` flag,
  // so .test() is stateless and safe to reuse across files (CodeRabbit nit — hoist out of the inner loop).
  const banned = [['stake-anchor', /require\([^)]*stake-anchor[^)]*\)/], ['issuance-policy', /require\([^)]*issuance-policy[^)]*\)/]];
  for (const rel of ['trust/convert.js', 'independence/weak-flag.js', 'identity/registry.js']) {
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    for (const [b, re] of banned) {
      assert.ok(!re.test(src), rel + ' imports ' + b + ' (gating/brick surface must not read stake-state)');
    }
  }
});

console.log('[issuance-policy] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
