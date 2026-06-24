#!/usr/bin/env node
'use strict';

// PACT U1 — stake S4 tests (plans/23 §3 — the executable contract). TDD: written FIRST as the spec.
// A SLASH is a crater-disciplined forfeiture: stakeOf returns 'slashed' for a root whose REAL stake (by
// content-addressed target_stake_id) has been slashed by >=2 distinct EARNED-STANDING human roots, each with
// a non-empty counterexample reason. Load-bearing: the crater quorum (rootOf-keyed, earned-standing, >=2),
// the F3-analog (a slash must resolve to a real stake — pre-positioning closed), provenance (verifiedRecords),
// and the read-side reason gate (the store is not a sandbox). SHADOW; NARROWS, does not harden (plans/23 §0).

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
const { buildSlashSpec, SLASH_TYPE } = require('../../src/identity/slash');
const { createStakeAnchor } = require('../../src/trust/stake-anchor');
const { createIssuancePolicy } = require('../../src/trust/issuance-policy');

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
function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-slash-'));
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
  function earn(src) { return emit(src, 'CLAIM', { claim: { content: 'interacted' } }); } // >=1 CLAIM = earned standing
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
  // an UNGUARDED SLASH (bypasses buildSlashSpec) — models the raw-record attack (forged reason types, unsigned).
  function rawSlash(src, { targetStakeId, reason, sign = true, signWith }) {
    const p = personas[src];
    const payload = { target_stake_id: targetStakeId, reason };
    if (!sign) {
      const body = { ver: 'pact/0', type: SLASH_TYPE, src_persona_did: src, parent_human_uid: p.human, seq: SEQ++, nonce: 'u' + SEQ, payload };
      const ap = appendRecord({ ...body, record_id: computeRecordId(body) }, storeOpts);
      if (!ap.ok) throw new Error('append-unsigned: ' + ap.reason);
      return;
    }
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type: SLASH_TYPE, seq: SEQ++, nonce: 'u' + SEQ, payload }, { privateKeyPem: signWith || p.kp.privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, storeOpts);
    if (!ap.ok) throw new Error('append: ' + ap.reason);
  }
  return { STATE, registry, ME, storeOpts, anchor, personas, add, addUnder, emit, earn, mintStake, mintSlash, rawSlash,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } } };
}

// a victim with a LOCKED stake; returns the stake record_id.
function stakedVictim(w, lockExpiry = 9e12) {
  w.add('did:key:zVictim');
  return w.mintStake('did:key:zVictim', lockExpiry).record_id;
}
// register + earn standing for an earned slasher persona under its own root.
function earnedSlasher(w, did) { w.add(did); w.earn(did); return did; }

// ===================== the crater quorum (load-bearing) =====================

test('quorum: a real stake slashed by 2 distinct EARNED-STANDING roots -> slashed', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  w.mintSlash(earnedSlasher(w, 'did:key:zS1'), X, 'defected on the commitment');
  w.mintSlash(earnedSlasher(w, 'did:key:zS2'), X, 'corroborated defection');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'slashed');
  w.cleanup();
});

test('quorum: ONE earned slasher does NOT slash (informs, not crater)', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  w.mintSlash(earnedSlasher(w, 'did:key:zS1'), X, 'defected');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked');
  w.cleanup();
});

test('quorum: 2 personas of ONE human = ONE root -> NOT slashed (keyed by rootOf, F2)', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  w.addUnder('did:key:zP1', 'human:onehuman'); w.earn('did:key:zP1');
  w.addUnder('did:key:zP2', 'human:onehuman'); w.earn('did:key:zP2');
  w.mintSlash('did:key:zP1', X, 'defected'); w.mintSlash('did:key:zP2', X, 'again');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked');
  w.cleanup();
});

test('quorum: 2 ZERO-STANDING roots (no CLAIM) -> NOT slashed (a Sybil flood informs, cannot crater)', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  w.add('did:key:zZ1'); w.add('did:key:zZ2'); // registered but NEVER earned (no CLAIM)
  w.mintSlash('did:key:zZ1', X, 'defected'); w.mintSlash('did:key:zZ2', X, 'defected');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked');
  w.cleanup();
});

// ===================== the F3-analog + provenance + in-scope (the VERIFY HIGH) =====================

test('F3 / pre-positioning CLOSED: slashes minted before any stake never fire on a later stake', () => {
  const w = freshWorld();
  w.add('did:key:zVictim');
  // 2 earned roots pre-position SLASHes against a GUESSED id, BEFORE the victim has any stake.
  const guessed = 'f'.repeat(64);
  w.mintSlash(earnedSlasher(w, 'did:key:zS1'), guessed, 'pre-positioned');
  w.mintSlash(earnedSlasher(w, 'did:key:zS2'), guessed, 'pre-positioned');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'none'); // no stake yet
  // NOW the victim mints a fresh stake (a NEW content-address the pre-positioned slashes could not name).
  w.mintStake('did:key:zVictim', 9e12);
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked'); // NOT slashed
  w.cleanup();
});

test('in-scope: a target_stake_id of a DIFFERENT root\'s stake does NOT slash the victim', () => {
  const w = freshWorld();
  stakedVictim(w); // the victim's own stake is registered but not the slash target here
  w.add('did:key:zOther'); const otherStake = w.mintStake('did:key:zOther', 9e12).record_id; // a different root's stake
  w.mintSlash(earnedSlasher(w, 'did:key:zS1'), otherStake, 'wrong target');
  w.mintSlash(earnedSlasher(w, 'did:key:zS2'), otherStake, 'wrong target');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked'); // victim untouched
  w.cleanup();
});

test('provenance: a forged UNSIGNED SLASH (real target_stake_id) contributes 0', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  earnedSlasher(w, 'did:key:zS1'); w.mintSlash('did:key:zS1', X, 'defected'); // 1 legit
  w.add('did:key:zAttacker'); w.earn('did:key:zAttacker');
  w.rawSlash('did:key:zAttacker', { targetStakeId: X, reason: 'forged', sign: false }); // unsigned 2nd -> dropped
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked'); // still only 1 valid
  w.cleanup();
});

// ===================== the read-side reason gate (the VERIFY MED — store is not a sandbox) =====================

test('reason gate: a raw SLASH with a non-string / blank reason contributes 0', () => {
  for (const badReason of [{}, [], true, 1, '   ', '']) {
    const w = freshWorld();
    const X = stakedVictim(w);
    w.mintSlash(earnedSlasher(w, 'did:key:zS1'), X, 'real defection'); // 1 legit
    w.add('did:key:zS2b'); w.earn('did:key:zS2b');
    w.rawSlash('did:key:zS2b', { targetStakeId: X, reason: badReason }); // malformed reason -> not a counterexample
    assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked', 'reason=' + JSON.stringify(badReason));
    w.cleanup();
  }
});

// ===================== producer boundary =====================

test('buildSlashSpec: well-formed spec + fail-closed boundaries', () => {
  const spec = buildSlashSpec({ targetStakeId: 'a'.repeat(64), reason: 'defected', seq: 0, nonce: 'n' });
  assert.equal(spec.type, 'SLASH');
  assert.equal(spec.payload.target_stake_id, 'a'.repeat(64));
  assert.equal(spec.payload.reason, 'defected');
  assert.throws(() => buildSlashSpec({ targetStakeId: '', reason: 'r', seq: 0, nonce: 'n' }), /target_stake_id/);
  assert.throws(() => buildSlashSpec({ targetStakeId: 42, reason: 'r', seq: 0, nonce: 'n' }), /target_stake_id/);
  assert.throws(() => buildSlashSpec({ targetStakeId: 'a', reason: '', seq: 0, nonce: 'n' }), /reason/);
  assert.throws(() => buildSlashSpec({ targetStakeId: 'a', reason: '   ', seq: 0, nonce: 'n' }), /reason/);
  assert.throws(() => buildSlashSpec({ targetStakeId: 'a', reason: {}, seq: 0, nonce: 'n' }), /reason/);
  assert.throws(() => buildSlashSpec(null), /target_stake_id/);
});

// ===================== precedence + composition + backward-compat + SHADOW =====================

test('precedence: slashed overrides UNLOCKED (an expired stake is still forfeit)', () => {
  const w = freshWorld();
  w.add('did:key:zVictim');
  const X = w.mintStake('did:key:zVictim', 5000).record_id; // expires at 5000
  w.mintSlash(earnedSlasher(w, 'did:key:zS1'), X, 'defected');
  w.mintSlash(earnedSlasher(w, 'did:key:zS2'), X, 'corroborated');
  const r = w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 9999); // nowMs >= lockedUntil (expired)
  assert.equal(r.status, 'slashed');           // NOT 'unlocked'
  assert.equal(r.lockedUntil, 5000);           // value still returned for auditability
  w.cleanup();
});

test('S3 composition: a slashed root FAILS stake-required (issuance-policy, the present consumer)', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  w.mintSlash(earnedSlasher(w, 'did:key:zS1'), X, 'defected');
  w.mintSlash(earnedSlasher(w, 'did:key:zS2'), X, 'corroborated');
  const policy = createIssuancePolicy({ registry: w.registry, anchor: w.anchor, mode: 'stake-required' });
  const r = policy.evaluate(w.storeOpts, 'human:did:key:zVictim', 0);
  assert.equal(r.stake.status, 'slashed');
  assert.equal(r.meets_policy, false, 'a slashed root must NOT meet stake-required (strict === locked fails closed)');
  w.cleanup();
});

test('idempotent: one slasher minting TWO SLASHes of X is ONE root (still need 2 distinct)', () => {
  const w = freshWorld();
  const X = stakedVictim(w);
  const s1 = earnedSlasher(w, 'did:key:zS1');
  w.mintSlash(s1, X, 'first'); w.mintSlash(s1, X, 'second'); // same root twice
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked'); // size 1
  w.mintSlash(earnedSlasher(w, 'did:key:zS2'), X, 'distinct'); // now 2 distinct roots
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'slashed');
  w.cleanup();
});

test('backward-compat + fresh-return: no SLASH -> unchanged; the return is freshly built each call', () => {
  const w = freshWorld();
  stakedVictim(w);
  const r1 = w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0);
  assert.deepEqual(r1, { status: 'locked', lockedUntil: 9e12 });
  r1.status = 'TAMPERED';
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:did:key:zVictim', 0).status, 'locked');
  w.cleanup();
});

console.log('[slash] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
