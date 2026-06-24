#!/usr/bin/env node
'use strict';

// PACT U1 — stake S1-S2 tests (plans/20 §3 — the executable contract). TDD: written FIRST as the spec.
// The load-bearing tests are the PROVENANCE gate (the VERIFY CRITICAL): stakeOf reads THROUGH verifiedRecords
// (sig under the registered key, INV-14) and keys by rootOf(src_persona_did), so a forged/unsigned STAKE
// contributes 0 and a forged parent_human_uid counts under the SIGNER's real root only. SHADOW; NARROWS.

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
const { computeRecordId, validateRecord } = require('../../src/lib/record');
const { buildStakeSpec, STAKE_TYPE } = require('../../src/identity/stake');
const { createStakeAnchor } = require('../../src/trust/stake-anchor');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// An in-process custody-boundary signer (the real boundary is a separate uid/enclave/HSM — modeled here).
function signerFor(pem) {
  return (rid) => crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(pem)).toString('base64');
}

let SEQ = 0;
function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-stake-'));
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
      // hand-build an UNSIGNED record (buildFrame always signs) — appendRecord does not require a sig.
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
    STATE, registry, personas, ME, storeOpts, anchor, addUnder, mintStake, rawStake,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } },
  };
}

// ===================== PROVENANCE GATE (the VERIFY CRITICAL — load-bearing) =====================

test('provenance: an UNSIGNED forged STAKE (valid content-address) contributes 0', () => {
  const w = freshWorld();
  w.addUnder('did:key:zAttacker', 'human:attacker');
  w.rawStake('did:key:zAttacker', { parentHumanUid: 'human:victim', sign: false, lockExpiry: 9e12 });
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:victim', 0), { status: 'none', lockedUntil: null });
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:attacker', 0), { status: 'none', lockedUntil: null });
  w.cleanup();
});

test('provenance: a STAKE signed by an UNREGISTERED sender contributes 0', () => {
  const w = freshWorld();
  // a persona NOT in the registry: build a frame with a fresh key, append, but no registry entry.
  const ghostKp = newPersonaKeypair();
  const spec = { srcPersonaDid: 'did:key:zGhost', parentHumanUid: 'human:ghost', type: STAKE_TYPE, seq: SEQ++, nonce: 'g' + SEQ, payload: { lock_expiry: 1000 } };
  const built = buildFrame(spec, { privateKeyPem: ghostKp.privateKeyPem });
  assert.ok(built.ok);
  appendRecord(built.frame, w.storeOpts);
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:ghost', 0).status, 'none'); // no registered key -> dropped
  w.cleanup();
});

test('provenance: a STAKE signed by the WRONG key (sig does not verify under registered key) contributes 0', () => {
  const w = freshWorld();
  w.addUnder('did:key:zX', 'human:x');
  const wrong = newPersonaKeypair(); // a different key than zX's registered key
  w.rawStake('did:key:zX', { signWith: wrong.privateKeyPem, lockExpiry: 1000 });
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:x', 0).status, 'none');
  w.cleanup();
});

test('provenance: a forged parent_human_uid counts under the SIGNER\'s real root, never the forged one', () => {
  const w = freshWorld();
  w.addUnder('did:key:zX', 'human:A'); // zX is registered under human:A
  w.rawStake('did:key:zX', { parentHumanUid: 'human:B', lockExpiry: 1000 }); // signed by zX, claims root B
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:B', 0).status, 'none');     // NOT under the forged root
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 0), { status: 'locked', lockedUntil: 1000 }); // under signer's real root
  w.cleanup();
});

// ===================== MINT + READ-BACK (happy path) =====================

test('mint via custody: a STAKE frame is well-formed + read back by stakeOf', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const f = w.mintStake('did:key:zA', 5000);
  assert.equal(f.type, 'STAKE');
  assert.equal(f.parent_human_uid, 'human:A');
  assert.equal(f.src_persona_did, 'did:key:zA');
  assert.equal(f.payload.lock_expiry, 5000);
  assert.equal(typeof f.sig, 'string');
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 4999), { status: 'locked', lockedUntil: 5000 });
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 5000), { status: 'unlocked', lockedUntil: 5000 });
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:other', 0).status, 'none');
  w.cleanup();
});

test('stakeOf: lockedUntil = MAX across a root\'s STAKEs; keyed per-root', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A'); w.addUnder('did:key:zB', 'human:B');
  w.mintStake('did:key:zA', 1000); w.mintStake('did:key:zA', 3000);
  w.mintStake('did:key:zB', 2000);
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 0), { status: 'locked', lockedUntil: 3000 });
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:B', 0), { status: 'locked', lockedUntil: 2000 });
  w.cleanup();
});

test('stakeOf: fold uses max+presence (NOT sum) — isolated from store dedup', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  // (a) re-appending the SAME record is a no-op (store INV-22 content-address dedup): lockedUntil stays 2000.
  const f = w.mintStake('did:key:zA', 2000);
  appendRecord(f, w.storeOpts); appendRecord(f, w.storeOpts);
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 0), { status: 'locked', lockedUntil: 2000 });
  // (b) TWO DISTINCT STAKEs (different seq/nonce) with the SAME lock_expiry are NOT deduped by the store — a
  //     SUM fold would double to 4000; MAX stays 2000. This isolates fold-idempotency from store-dedup.
  w.mintStake('did:key:zA', 2000);
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 0), { status: 'locked', lockedUntil: 2000 });
  w.cleanup();
});

test('stakeOf: a non-finite clock (NaN/null/Infinity) is conservatively LOCKED (a garbage clock never expires a stake)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 2000);
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:A', NaN).status, 'locked');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:A', null).status, 'locked');
  assert.equal(w.anchor.stakeOf(w.storeOpts, 'human:A', Infinity).status, 'locked');
  w.cleanup();
});

test('lock_expiry = 0 is a valid (immediately-unlocked) stake', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 0);
  assert.deepEqual(w.anchor.stakeOf(w.storeOpts, 'human:A', 1), { status: 'unlocked', lockedUntil: 0 });
  w.cleanup();
});

test('null-input: buildStakeSpec(null) + createStakeAnchor(null) hit the documented validation throw', () => {
  assert.throws(() => buildStakeSpec(null), /non-negative safe integer/);
  assert.throws(() => createStakeAnchor(null), /registry is required/);
});

test('stakeOf: immutable read — fresh object, two reads equal, mutating the return is harmless', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 2000);
  const r1 = w.anchor.stakeOf(w.storeOpts, 'human:A', 0);
  r1.status = 'TAMPERED'; r1.lockedUntil = -1;
  const r2 = w.anchor.stakeOf(w.storeOpts, 'human:A', 0);
  assert.deepEqual(r2, { status: 'locked', lockedUntil: 2000 });
  w.cleanup();
});

// ===================== NON-TRANSFERABLE + BOUNDARY + RESERVED-SLASH =====================

test('non-transferable: the minter REFUSES a STAKE spec naming a different root/persona', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const minter = createMinter({ signer: signerFor(w.personas['did:key:zA'].kp.privateKeyPem), personaDid: 'did:key:zA', humanUid: 'human:A' });
  assert.throws(() => minter.mint({ ...buildStakeSpec({ lockExpiry: 1000, seq: SEQ++, nonce: 'x' }), parent_human_uid: 'human:B' }), /bound to root human:A/);
  assert.throws(() => minter.mint({ ...buildStakeSpec({ lockExpiry: 1000, seq: SEQ++, nonce: 'y' }), src_persona_did: 'did:key:zB' }), /bound to did:key:zA/);
  w.cleanup();
});

test('buildStakeSpec fail-closes on a bad lockExpiry', () => {
  assert.throws(() => buildStakeSpec({ lockExpiry: -1, seq: 0, nonce: 'a' }), /non-negative safe integer/);
  assert.throws(() => buildStakeSpec({ lockExpiry: 1.5, seq: 0, nonce: 'a' }), /non-negative safe integer/);
  assert.throws(() => buildStakeSpec({ lockExpiry: Number.MAX_SAFE_INTEGER + 1, seq: 0, nonce: 'a' }), /non-negative safe integer/);
  assert.throws(() => buildStakeSpec({ lockExpiry: Infinity, seq: 0, nonce: 'a' }), /non-negative safe integer/);
});

test('recordSlash THROWS (reserved for S4 — non-vacuous, not a silent no-op)', () => {
  const w = freshWorld();
  assert.throws(() => w.anchor.recordSlash(), /reserved for S4/);
  w.cleanup();
});

test('createStakeAnchor requires a registry', () => {
  assert.throws(() => createStakeAnchor({}), /registry is required/);
});

// ===================== FRAMING GUARDS =====================

test('the type enum is DOCUMENTARY — validateRecord accepts a STAKE record (the discriminant is the runtime gate)', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  const f = w.mintStake('did:key:zA', 1000);
  const v = validateRecord(f);
  assert.ok(v.valid, 'a STAKE record passes the lenient runtime validator (required[] met): ' + JSON.stringify(v.errors));
  w.cleanup();
});

test('registry-not-oracle: stakeOf returns ONLY {status, lockedUntil} — no rank/edge/gate', () => {
  const w = freshWorld();
  w.addUnder('did:key:zA', 'human:A');
  w.mintStake('did:key:zA', 1000);
  const r = w.anchor.stakeOf(w.storeOpts, 'human:A', 0);
  assert.deepEqual(Object.keys(r).sort(), ['lockedUntil', 'status']); // no actionable/score/edge field
  w.cleanup();
});

test('SHADOW: no src/ file outside the impl imports the stake-anchor fold (machine-checkable, mirrors layering.test.js)', () => {
  const SRC = path.join(__dirname, '..', '..', 'src');
  const offenders = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      if (!e.name.endsWith('.js') || e.name === 'stake-anchor.js') continue;
      if (/require\([^)]*stake-anchor[^)]*\)/.test(fs.readFileSync(fp, 'utf8'))) offenders.push(path.relative(SRC, fp));
    }
  })(SRC);
  assert.deepEqual(offenders, [], 'stake-state has a consumer (SHADOW broken — convert/mayGate must not read it this wave): ' + offenders.join(', '));
});

console.log('[stake] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
