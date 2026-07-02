#!/usr/bin/env node
'use strict';

// PACT v0 -- signed-edge-mint integration (plans/35 W1 §5). Proves Option A end-to-end against the REAL
// minter/frame/read-gate path: the frame sig BINDS payload.freshness (integrity), the freshness fields reach
// checkFreshnessWindow (the W2 seam), and it DOCUMENTS the two ceiling behaviors the VERIFY hacker surfaced:
//   - H1 DOWNGRADE (attacker-reachable): a BARE VOUCH (no payload.freshness) is a valid frame AND yields a
//     buildVouchGraph edge UNGATED -- W2 MUST invert this (drop no-freshness; an authorization post-condition).
//   - CO-FORGE (NS-9 EXPECTED SHADOW pass): a same-uid attacker mints a fresh VOUCH under its OWN persona and it
//     passes -- integrity != provenance (#273); Option A does NOT close it.

const assert = require('node:assert/strict');
const { buildSignedVouchSpec } = require('../../src/identity/signed-edge');
const { createMinter } = require('../../src/identity/minter');
const { receiveFrame } = require('../../src/frame/frame');
const { computeRecordId } = require('../../src/lib/record');
const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const { checkFreshnessWindow } = require('../../src/lib/edge-freshness');
const { createRegistry, registerPersona } = require('../../src/identity/registry');
const { buildVouchGraph } = require('../../src/trust/convert');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const TARGET = 'did:key:zTarget';
const VOUCHER = 'did:key:zVoucher';
const HUMAN = 'human-voucher';

// a local test signer (a custody boundary is only REAL at deploy; here a same-uid key exercises the path)
const kp = generateEdgeKeypair();
const signer = (recordId) => signRecordId(recordId, { privateKeyPem: kp.privateKeyPem });
const reg = createRegistry();
registerPersona(reg, { personaDid: VOUCHER, humanUid: HUMAN, publicKeyPem: kp.publicKeyPem });
const minter = createMinter({ signer, personaDid: VOUCHER, humanUid: HUMAN });

function mintFresh(over = {}) {
  const spec = buildSignedVouchSpec({ targetPersona: TARGET, approvedAt: NOW - 1000, freshnessNonce: 'fresh-nonce-01', keyId: 'k1', seq: 0, nonce: 'frame-nonce-e2e', ...over });
  return minter.mint(spec);
}

test('end-to-end: a payload.freshness VOUCH mints; record_id covers freshness; receiveFrame accepts', () => {
  const { ok, frame } = mintFresh();
  assert.equal(ok, true);
  assert.equal(frame.type, 'VOUCH');
  assert.equal(frame.payload.freshness.approved_at, NOW - 1000);
  assert.equal(frame.payload.target_persona, TARGET);
  // the freshness lives INSIDE record_id (Option A): re-computing the content-address over the frame matches.
  assert.equal(computeRecordId(frame), frame.record_id);
  assert.equal(receiveFrame(frame, { registry: reg }).ok, true);
});

test('Attack 1 -- the frame sig BINDS payload.freshness: tampering approved_at -> receiveFrame REJECTS', () => {
  const { frame } = mintFresh();
  const tampered = { ...frame, payload: { ...frame.payload, freshness: { ...frame.payload.freshness, approved_at: NOW } } };
  assert.notEqual(computeRecordId(tampered), tampered.record_id, 'record_id no longer matches the tampered body');
  assert.equal(receiveFrame(tampered, { registry: reg }).ok, false, 'the single frame sig catches the freshness tamper (integrity)');
});

test('the W2 seam: checkFreshnessWindow reads payload.freshness.{approved_at,nonce} (fresh passes / stale rejects)', () => {
  const fresh = mintFresh().frame.payload.freshness;
  assert.equal(checkFreshnessWindow({ approvedAt: fresh.approved_at, nonce: fresh.nonce, now: NOW }).fresh, true);
  const stale = mintFresh({ approvedAt: NOW - (10 * DAY), nonce: 'frame-nonce-stale' }).frame.payload.freshness;
  assert.equal(checkFreshnessWindow({ approvedAt: stale.approved_at, nonce: stale.nonce, now: NOW }).reason, 'stale-or-future');
});

test('H1 DOWNGRADE (documented gap): a BARE VOUCH is a valid frame AND yields a buildVouchGraph edge UNGATED', () => {
  // a same-uid attacker re-mints a stale vouch as a BARE VOUCH (no payload.freshness) to dodge the TTL.
  const bare = minter.mint({ type: 'VOUCH', payload: { target_persona: TARGET }, seq: 1, nonce: 'frame-nonce-bare' });
  assert.equal(bare.ok, true);
  assert.equal(receiveFrame(bare.frame, { registry: reg }).ok, true, 'a bare VOUCH is a fully valid signed frame');
  // buildVouchGraph keys on target_persona ONLY (convert.js:22) -- it IGNORES payload.freshness, so the bare VOUCH
  // produces a real voucher->target edge. THIS IS THE DOWNGRADE. **W2 MUST invert it**: the fresh-filter drops a
  // no-freshness VOUCH from the fresh set (no-freshness => drop, NEVER skip-when-absent). Documented here so W2
  // cannot miss it; W1 (the producer) cannot close a read-side gap.
  const edges = buildVouchGraph([bare.frame]);
  assert.equal(edges.get(VOUCHER) && edges.get(VOUCHER).has(TARGET), true,
    'TODAY the bare VOUCH is counted ungated -- W2 must add the drop-no-freshness authorization post-condition');
});

test('CO-FORGE (NS-9 EXPECTED SHADOW pass): a same-uid attacker mints a fresh VOUCH under its OWN persona -> passes', () => {
  const akp = generateEdgeKeypair();
  const aSigner = (rid) => signRecordId(rid, { privateKeyPem: akp.privateKeyPem });
  registerPersona(reg, { personaDid: 'did:key:zAttacker', humanUid: 'human-attacker', publicKeyPem: akp.publicKeyPem });
  const aMinter = createMinter({ signer: aSigner, personaDid: 'did:key:zAttacker', humanUid: 'human-attacker' });
  const spec = buildSignedVouchSpec({ targetPersona: TARGET, approvedAt: NOW - 1000, freshnessNonce: 'attacker-nonce', keyId: 'k1', seq: 0, nonce: 'frame-nonce-atk' });
  const { ok, frame } = aMinter.mint(spec);
  assert.equal(ok, true);
  // EXPECTED: it passes receiveFrame + the freshness window. Integrity, NOT provenance -- the co-forge ceiling is
  // UNCHANGED by Option A (a same-uid holder mints authentic records under its OWN key; #273 / U1, not a W1 hole).
  assert.equal(receiveFrame(frame, { registry: reg }).ok, true);
  const fr = frame.payload.freshness;
  assert.equal(checkFreshnessWindow({ approvedAt: fr.approved_at, nonce: fr.nonce, now: NOW }).fresh, true);
});

console.log(`\n[signed-edge-mint] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
