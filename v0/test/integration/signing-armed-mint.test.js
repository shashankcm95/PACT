#!/usr/bin/env node
'use strict';

// PACT v0 -- signing-armed-mint integration (plans/42 W2 -- the arming-gated compose-and-mint producer).
//
// Proves the POSITIVE safety invariant: mintFreshVouch is REACHED ONLY on the signing-armed path. A SPY signer
// (records calls) makes every no-mint path non-vacuous -- if the mint were reached, the spy would fire. Every
// non-green path returns {minted:false} (TOTAL, never-throws) + an OBSERVABLE emit (captured off stderr). The
// armed+coherent path mints a fresh VOUCH that round-trips the REAL read path (verifiedRecords -> armed
// freshness filter -> disjointPaths) exactly like mint-fresh-vouch.test.js. All SHADOW: actionable hard-false.

const assert = require('node:assert/strict');

const { signingArmedMint } = require('../../src/trust/signing-armed-mint');
const { signRecordId } = require('../../src/lib/edge-attestation');
const { computeRecordId } = require('../../src/lib/record');
const { verifiedRecords } = require('../../src/trust/read-gate');
const { filterFreshVouches } = require('../../src/trust/vouch-freshness');
const { convert, disjointPaths } = require('../../src/trust/convert');
const { world, NOW, ARMED } = require('./_world');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// capture stderr around a call so the OBSERVABLE emit (refuseAlert) is assertable.
function withStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = '';
  process.stderr.write = (s) => { buf += s; return true; };
  try { const r = fn(); return { r, stderr: buf }; } finally { process.stderr.write = orig; }
}

// a signer over a real key that RECORDS calls -- calls()===0 proves the mint was never reached (non-vacuity).
function spySignerOver(privateKeyPem) {
  let calls = 0;
  const fn = (rid) => { calls += 1; return signRecordId(rid, { privateKeyPem }); };
  fn.calls = () => calls;
  return fn;
}

// build {world, deps(spy), request} for a registered broker->target vouch.
function setup(over = {}) {
  const w = world();
  w.reg('did:key:zBroker', 'human:broker');
  w.reg('did:key:zTarget', 'human:target');
  const signer = spySignerOver(w.personas['did:key:zBroker'].kp.privateKeyPem);
  const deps = { signer, personaDid: 'did:key:zBroker', humanUid: 'human:broker', keyId: 'k1' };
  const request = { targetPersona: 'did:key:zTarget', approvedAt: NOW - 1000, freshnessNonce: 'w2-fresh-nonce-1', seq: 7, nonce: 'w2-frame-nonce-1', ...over };
  return { w, signer, deps, request };
}

// ============================== disarmed / non-armed -> NO mint (byte-identical), spy never fires ==============================

test('DISARMED (signing off, admission off) -> {minted:false}, NO frame, mint NEVER reached (spy calls==0)', () => {
  const { signer, deps, request } = setup();
  const { r, stderr } = withStderr(() => signingArmedMint({ admissionArmed: false, signingArmed: false }, deps, request));
  assert.equal(r.minted, false);
  assert.equal(r.reason, 'signing-disarmed');
  assert.ok(!('frame' in r), 'a no-mint result never carries a frame');
  assert.equal(signer.calls(), 0, 'mintFreshVouch was NEVER reached -> byte-identical (no record)');
  assert.doesNotMatch(stderr, /PACT-REFUSE-ALERT/, 'both-off is COHERENT -> no incoherence emit');
});

test('admission-armed + signing-OFF -> {minted:false}, NO mint, XOR emit (signing is the gate, not admission)', () => {
  const { signer, deps, request } = setup();
  const { r, stderr } = withStderr(() => signingArmedMint({ admissionArmed: true, signingArmed: false }, deps, request));
  assert.equal(r.minted, false);
  assert.equal(r.reason, 'admission-armed-without-signing');
  assert.equal(signer.calls(), 0, 'admission alone does NOT mint');
  // cause-BEFORE-reason: refuse-alert serializes {...detail, reason} so `reason` is LAST (CodeRabbit: an
  // A.*B|B alternation made the reason-check a no-op; assert BOTH fields, in the real serialization order).
  assert.match(stderr, /"cause":"admission-armed-without-signing".*"reason":"arming-incoherent"/, 'the incoherence is observable (reason + cause both present)');
});

test('a truthy-non-boolean signingArmed (===true strict) does NOT arm -> {minted:false}, no mint', () => {
  const { signer, deps, request } = setup();
  const r = signingArmedMint({ admissionArmed: false, signingArmed: 1 }, deps, request).minted;
  assert.equal(r, false, 'signingArmed:1 is not === true -> disarmed');
  assert.equal(signer.calls(), 0);
});

test('arm-getter THROWS -> {minted:false, arm-read-failed}, NO mint, emitted (NOT fail-silent)', () => {
  const { signer, deps, request } = setup();
  const hostile = {}; Object.defineProperty(hostile, 'signingArmed', { get() { throw new Error('boom'); } });
  const { r, stderr } = withStderr(() => signingArmedMint(hostile, deps, request));
  assert.equal(r.minted, false);
  assert.equal(r.reason, 'arm-read-failed');
  assert.equal(signer.calls(), 0, 'an indeterminate arm never reaches the mint');
  assert.match(stderr, /"cause":"arm-getter-threw".*"reason":"signing-arm-unreadable"/, 'fail-closed AND observable (reason + cause both present)');
});

// ============================== signing armed -> MINT (staging + coherent) ==============================

test('signing-armed + admission-OFF (STAGING) -> MINTS (Q2: sign-then-admit staging), + the incoherence emit', () => {
  const { w, signer, deps, request } = setup();
  const { r, stderr } = withStderr(() => signingArmedMint({ admissionArmed: false, signingArmed: true }, deps, request));
  assert.equal(r.minted, true, 'signing armed alone MINTS -- the staging the primitive is designed for');
  assert.equal(r.frame.type, 'VOUCH');
  assert.ok(signer.calls() > 0, 'the mint was reached');
  assert.match(stderr, /"cause":"signing-armed-without-admission".*"reason":"arming-incoherent"/, 'staging is an incoherent-but-intended state -> observable emit (reason + cause both present)');
  w.append(r.frame); // the caller appends only on {minted:true}
});

test('signing-armed + admission-armed (COHERENT) -> MINTS, NO emit', () => {
  const { signer, deps, request } = setup();
  const { r, stderr } = withStderr(() => signingArmedMint({ admissionArmed: true, signingArmed: true }, deps, request));
  assert.equal(r.minted, true);
  assert.ok(signer.calls() > 0);
  assert.doesNotMatch(stderr, /PACT-REFUSE-ALERT/, 'coherent armed -> no incoherence emit');
});

// ============================== end-to-end: the minted VOUCH round-trips the REAL read path ==============================

test('ARMED end-to-end: the minted VOUCH passes verifiedRecords, survives the armed freshness filter, weighs on a me-path; actionable stays false', () => {
  const { w, deps, request } = setup();
  w.seedVouch('did:key:zME', 'did:key:zBroker', { approved_at: NOW - 1000, nonce: 'seed-fresh-nonce' }); // ME->BROKER
  assert.equal(disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget'), 0, 'non-vacuity: no path into TARGET before the mint');
  const r = signingArmedMint({ admissionArmed: true, signingArmed: true }, deps, request);
  assert.equal(r.minted, true);
  assert.equal(computeRecordId(r.frame), r.frame.record_id, 'freshness bound inside record_id (Option A)');
  w.append(r.frame);
  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.ok(verified.some((x) => x.record_id === r.frame.record_id), 'PASSES verifiedRecords (key-custody)');
  assert.ok(filterFreshVouches(verified, ARMED).some((x) => x.record_id === r.frame.record_id), 'SURVIVES the armed freshness filter');
  assert.equal(disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget'), 1, 'WEIGHTED nonzero on the ME->BROKER->TARGET path');
  assert.equal(convert(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget').actionable, false, 'SHADOW: actionable hard-false (NS-9)');
});

// ============================== mint failure surfaces TOTAL ({minted:false} + emit), never a throw ==============================

test('mint THROWS (freshnessNonce below MIN_NONCE_LEN) -> {minted:false, mint-failed} + misconfig emit, NOT an uncaught throw', () => {
  const { deps, request } = setup({ freshnessNonce: 'short' }); // < 8 chars -> buildSignedVouchSpec throws inside mintFreshVouch
  let out;
  const { r, stderr } = withStderr(() => { out = signingArmedMint({ admissionArmed: true, signingArmed: true }, deps, request); return out; });
  assert.equal(r.minted, false);
  assert.equal(r.reason, 'mint-failed');
  assert.ok(!('frame' in r));
  assert.match(stderr, /"cause":"mint-threw".*"reason":"signing-mint-failed"/, 'a mint-boundary throw is observable (misconfig; reason + cause both present)');
});

test('mint returns {ok:false} (signer yields no sig) -> {minted:false} + integrity emit', () => {
  const { deps, request } = setup();
  const nullSigner = () => null; // a wired-but-broken custody boundary: signs nothing
  const { r, stderr } = withStderr(() => signingArmedMint({ admissionArmed: true, signingArmed: true }, { ...deps, signer: nullSigner }, request));
  assert.equal(r.minted, false);
  assert.ok(!('frame' in r));
  assert.match(stderr, /"cause":"mint-signer-failed".*"reason":"signing-mint-failed"/, 'a broken signer is observable (integrity; reason + cause both present)');
});

// ============================== per-mint uniqueness + the two-nonce distinction ==============================

test('two-nonce distinction: frame nonce and payload.freshness.nonce land in their OWN slots (independent roles)', () => {
  const { deps, request } = setup({ nonce: 'FRAME-NONCE-xyz', freshnessNonce: 'FRESHNESS-NONCE-abc' });
  const r = signingArmedMint({ admissionArmed: true, signingArmed: true }, deps, request);
  assert.equal(r.minted, true);
  assert.equal(r.frame.nonce, 'FRAME-NONCE-xyz', 'the frame-identity nonce (INV-22)');
  assert.equal(r.frame.payload.freshness.nonce, 'FRESHNESS-NONCE-abc', 'the freshness nonce -- the field a FUTURE reader-side consume-store WOULD burn one-shot (unbuilt, R4); today it bounds mint-uniqueness only; distinct role from the frame nonce');
});

test('per-mint uniqueness: two mints with distinct request nonces -> distinct record_ids (the deploy-DI supplies a fresh nonce per mint)', () => {
  const { deps } = setup();
  const a = signingArmedMint({ admissionArmed: true, signingArmed: true }, deps, { targetPersona: 'did:key:zTarget', approvedAt: NOW - 1000, freshnessNonce: 'uniq-fresh-A1', seq: 1, nonce: 'uniq-frame-A1' });
  const b = signingArmedMint({ admissionArmed: true, signingArmed: true }, deps, { targetPersona: 'did:key:zTarget', approvedAt: NOW - 1000, freshnessNonce: 'uniq-fresh-B2', seq: 2, nonce: 'uniq-frame-B2' });
  assert.ok(a.minted && b.minted);
  assert.notEqual(a.frame.record_id, b.frame.record_id, 'distinct nonces -> distinct content-addresses (mint-UNIQUENESS; the replay-within-TTL bound is the UNBUILT reader-side consume-store (R4), NOT this)');
});

console.log(`\n[signing-armed-mint] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
