#!/usr/bin/env node
'use strict';

// PACT v0 -- mint-fresh-vouch integration (plans/37 W3 §5; plans/30 §5-W0 the live-edge minting harness).
// Drives the DORMANT W1 producer, now wired through mintFreshVouch, END-TO-END against the real path:
//   mintFreshVouch -> appendRecord -> verifiedRecords -> filterFreshVouches(armed) -> disjointPaths.
//
// It proves the MECHANISM, NOT provenance (NS-9): a genuinely-fresh VOUCH can be minted (injected same-uid
// signer), round-trips, PASSES verifiedRecords (key-custody of the frame sig), SURVIVES the armed W2 window, and
// is WEIGHTED nonzero when it lies on a me-path. The co-forge ceiling is UNCHANGED (integrity != provenance, #273):
// a same-uid attacker's own-key fresh vouch ALSO passes (EXPECTED SHADOW pass). actionable stays hard-false.
//
// The me-graph fixture (world()) + constants (NOW/ARMED/FRESH) were LIFTED to ./_world.js (plans/38 W4) so the
// W4 provenance proof board EXTENDS the same fixture, not forks it (the W3 forward-contract). Imported below.

const assert = require('node:assert/strict');

const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const { computeRecordId } = require('../../src/lib/record');
const { verifiedRecords } = require('../../src/trust/read-gate');
const { filterFreshVouches } = require('../../src/trust/vouch-freshness');
const { convert, disjointPaths } = require('../../src/trust/convert');
const { mintFreshVouch } = require('../../src/identity/mint-fresh-vouch');
const { world, NOW, ARMED, FRESH } = require('./_world');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// ---- the POSITIVE control: the SPLIT (verified + weighted) with the INCREMENTAL non-vacuity ----
test('W3 end-to-end: mint a fresh VOUCH -> verifiedRecords + survives-armed + weighted; incremental non-vacuity', () => {
  const w = world();
  w.reg('did:key:zBroker', 'human:broker');
  w.reg('did:key:zTarget', 'human:target');
  w.seedVouch('did:key:zME', 'did:key:zBroker', FRESH);   // ME -> BROKER (fresh); the ONLY edge so far

  // NON-VACUITY (BEFORE -- distinct store STATE, not an array-drop): only ME->BROKER, no fresh path into TARGET.
  assert.equal(disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget'), 0, 'no path into TARGET before the mint (the load-bearing non-vacuity)');

  const { frame } = w.mint('did:key:zBroker', 'did:key:zTarget');   // mint BROKER -> TARGET via the harness

  // mint shape: a VOUCH with freshness INSIDE the content-address (Option A)
  assert.equal(frame.type, 'VOUCH');
  assert.equal(typeof frame.payload.freshness.approved_at, 'number');
  assert.equal(computeRecordId(frame), frame.record_id, 'freshness is bound inside record_id (Option A)');

  const verified = verifiedRecords(w.registry, w.storeOpts);
  // LEG (a) KEY-CUSTODY: the minted edge passes the sig-verify gate under the registered broker key.
  assert.ok(verified.some((r) => r.record_id === frame.record_id), 'the minted edge PASSES verifiedRecords (key-custody)');
  // LEG (a') survives the ARMED W2 freshness filter (it is genuinely fresh).
  assert.ok(filterFreshVouches(verified, ARMED).some((r) => r.record_id === frame.record_id), 'the minted fresh edge SURVIVES the armed filter');
  // LEG (b) WEIGHTED nonzero: the minted edge lies on the seeded ME->BROKER->TARGET path.
  assert.equal(disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget'), 1, 'the minted edge is WEIGHTED nonzero (on a counted me-path)');
  // SHADOW invariant (NS-9): actionable stays hard-false.
  assert.equal(convert(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget').actionable, false, 'SHADOW: actionable hard-false (NS-9 -- mechanism, not a gate)');
});

// ---- co-forge (EXPECTED SHADOW pass -- integrity != provenance, ceiling UNCHANGED) ----
test('CO-FORGE (NS-9 EXPECTED SHADOW pass): a same-uid attacker mints a fresh VOUCH under its OWN key -> passes verify + armed + weighs', () => {
  const w = world();
  w.reg('did:key:zAttacker', 'human:attacker');
  w.reg('did:key:zTarget2', 'human:target2');
  w.seedVouch('did:key:zME', 'did:key:zAttacker', FRESH);
  const { frame } = w.mint('did:key:zAttacker', 'did:key:zTarget2');   // attacker mints under its OWN registered key
  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.ok(verified.some((r) => r.record_id === frame.record_id), 'the co-forged edge PASSES verifiedRecords (integrity, NOT provenance)');
  assert.ok(filterFreshVouches(verified, ARMED).some((r) => r.record_id === frame.record_id), 'and SURVIVES the armed filter (genuinely fresh)');
  assert.equal(disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTarget2'), 1, 'and WEIGHS on its own path -- EXPECTED: the co-forge ceiling is UNCHANGED (#273); freshness+verify do NOT establish provenance');
});

// ---- fixture invariant: an UNREGISTERED broker mints fine but DROPS at the read gate (misconfig, NOT custody) ----
test('fixture invariant: an UNREGISTERED broker mints fine but DROPS at verifiedRecords (unregistered-sender misconfig, not a custody fault)', () => {
  const w = world();   // ME registered; the broker below is NOT registered
  const bkp = generateEdgeKeypair();
  const signer = (rid) => signRecordId(rid, { privateKeyPem: bkp.privateKeyPem });
  const r = mintFreshVouch({ signer, personaDid: 'did:key:zUnreg', humanUid: 'human:unreg', targetPersona: 'did:key:zT', approvedAt: NOW - 1000, freshnessNonce: 'unreg-fresh-01', keyId: 'k1', seq: 0, nonce: 'unreg-frame-01' });
  assert.equal(r.ok, true, 'the harness MINTS regardless of registration (mint-only; the read gate is the provenance check, NOT the harness)');
  w.append(r.frame);
  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.equal(verified.some((rr) => rr.record_id === r.frame.record_id), false, 'the unregistered-broker edge DROPS at verifiedRecords (unregistered-sender misconfig)');
});

// ---- fixture invariant: a REGISTERED persona signing with the WRONG key DROPS at the read gate (attack, not misconfig) ----
test('fixture invariant: a registered persona signing with the WRONG key mints fine but DROPS at verifiedRecords (sig-verify-failed attack -- the read gate is the provenance check, NOT the harness)', () => {
  const w = world();
  w.reg('did:key:zBroker', 'human:broker');           // BROKER registered with ITS OWN pubkey
  const wrongKp = generateEdgeKeypair();               // a DIFFERENT key -- not BROKER's registered one
  const signer = (rid) => signRecordId(rid, { privateKeyPem: wrongKp.privateKeyPem });
  const r = mintFreshVouch({ signer, personaDid: 'did:key:zBroker', humanUid: 'human:broker', targetPersona: 'did:key:zT', approvedAt: NOW - 1000, freshnessNonce: 'mismatch-fresh-01', keyId: 'k1', seq: 0, nonce: 'mismatch-frame-01' });
  assert.equal(r.ok, true, 'the harness MINTS regardless of the key<->persona binding (mint-only; the read gate checks the binding, NOT the harness)');
  w.append(r.frame);                                    // appends (content-address valid); the SIG is not checked on write
  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.equal(verified.some((rr) => rr.record_id === r.frame.record_id), false, 'the wrong-key edge DROPS at verifiedRecords (sig-verify-failed ATTACK class -- distinct from the unregistered-sender misconfig; NS-9: provenance is the read gate, not the harness)');
});

console.log(`\n[mint-fresh-vouch] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
