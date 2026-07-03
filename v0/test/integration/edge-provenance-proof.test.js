#!/usr/bin/env node
'use strict';

// PACT v0 -- the PROVENANCE PROOF BOARD (plans/38 W4 = plans/30 §5-W1/W2; the broker-signing arc CLOSER).
//
// SHADOW throughout. This proves the composed READ-SIDE properties of a cross-uid-custodied broker signing a live
// VOUCH edge -- WITHOUT deploying (the cross-uid legs run only at the operator deploy, NS-7; here they are
// NOTE/residual). The one genuinely-NEW property is the apex control (leg e): a same-uid attacker that
// SELF-REGISTERS its OWN persona + self-signs gets EQUAL own-persona standing (the 5th co-forge leg is OPEN --
// EXPECTED SHADOW pass), but cannot forge a broker-ATTRIBUTED edge via the registerPersona API path or without the
// broker key (e2). "broker-EQUIVALENT standing" := "an edge verifiedRecords attributes to the broker persona DID".
//
// NS-9: nothing here HARDENS or gates. The verdict field is `inProcessReadControlsPassed` (NEVER `hardened`,
// mirroring custody-verify.js hostObservableChecksPassed). The in-process reg.personas.set/delete mutation leg
// (VERIFY-hacker H1) stays OPEN and is carried as a NOTE/residual -- the disclosed 5th leg (registry.js:38-41,
// plans/30 §2 leg 5); it closes with plans/31, NOT this arc.

const assert = require('node:assert/strict');

const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const { registerPersona } = require('../../src/identity/registry');
const { buildFrame } = require('../../src/frame/frame');
const { computeRecordId } = require('../../src/lib/record');
const { verifiedRecords } = require('../../src/trust/read-gate');
const { disjointPaths, convert } = require('../../src/trust/convert');
const { authorizeRequest } = require('../../src/identity/request-auth');
const { assertBrokerPersona } = require('../../src/identity/broker-client');
const { world, FRESH } = require('./_world');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const BROKER = 'did:key:zBroker';
const ATTACKER = 'did:key:zAttacker';

// ---- the in-test machine-checkable verdict helper (mirrors custody-verify.js assessCustody; NO `hardened` field).
// FAIL-CLOSED on an unknown status + empty checks (VERIFY-hacker H2; the security.md "typo fails CLOSED" +
// arm-flags.js asymmetric-parse): a status not in {PASS,FAIL,NOTE} counts as FAIL AND surfaces in residuals (never
// swallowed), and an empty checks array is NOT a pass (never a vacuous [].every()===true).
const READ_CONTROL_STATUSES = new Set(['PASS', 'FAIL', 'NOTE']);
function assessReadControls(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return { inProcessReadControlsPassed: false, checks: checks || [], residuals: ['no checks recorded -- vacuous'] };
  }
  // snapshot each element's status ONCE (security.md C1: a toggling/hostile getter must not be read twice across
  // the .every()/.filter()/.map() passes) + null-ELEMENT guard: a null / non-string status normalizes to a
  // sentinel that is neither PASS nor NOTE -> fail-CLOSED (VALIDATE-hacker nits 1+2, forward-hardening).
  const rows = checks.map((c) => ({
    id: (c && c.id) || '<no-id>',
    status: (c && typeof c.status === 'string') ? c.status : '__MISSING__',
    detail: (c && c.detail) || '',
  }));
  const passed = rows.every((r) => r.status === 'PASS' || r.status === 'NOTE');
  // residuals = EVERY non-PASS leg (NOTE deploy-only, a real FAIL, and any unknown status) so the audit trail
  // NAMES a FAIL, never just counts it (CodeRabbit: a FAIL must not disappear from the fail-closed report).
  const residuals = rows
    .filter((r) => r.status !== 'PASS')
    .map((r) => r.id + ': ' + (READ_CONTROL_STATUSES.has(r.status) ? r.detail : 'UNKNOWN-STATUS(' + r.status + ') -- fail-closed'));
  return { inProcessReadControlsPassed: passed, checks, residuals };
}

// ============================ (b)-logic: the persona-mismatch DENY (in-process) ============================
test('(b)-logic: authorizeRequest DENIES a foreign-persona frame as persona-mismatch (NOT record-id-mismatch -- M2 ordering)', () => {
  // recomputeBinds runs BEFORE personaBinds (request-auth.js:114-116); compute the id FIRST so the deny is
  // genuinely persona-mismatch, not the masking record-id-mismatch (the cross-uid-broker.md §9-C trap).
  const foreign = { src_persona_did: ATTACKER, type: 'VOUCH', payload: { target_persona: 'did:key:zT' }, seq: 0, nonce: 'x-nonce-01' };
  const claimedRecordId = computeRecordId(foreign);
  const d = authorizeRequest({ requireFrame: true, brokerPersonaDid: BROKER, presentedBodyRaw: JSON.stringify(foreign), claimedRecordId });
  assert.equal(d.decision, 'deny', 'a foreign-persona frame is DENIED');
  assert.equal(d.reason, 'persona-mismatch', 'the RIGHT gate fired (persona-mismatch, NOT record-id-mismatch)');

  // non-vacuity: a broker-persona body with the correct id is ALLOWED -> the deny above is CAUSED by the persona
  // mismatch, not a blanket deny.
  const own = { src_persona_did: BROKER, type: 'VOUCH', payload: { target_persona: 'did:key:zT' }, seq: 0, nonce: 'x-nonce-02' };
  const ok = authorizeRequest({ requireFrame: true, brokerPersonaDid: BROKER, presentedBodyRaw: JSON.stringify(own), claimedRecordId: computeRecordId(own) });
  assert.equal(ok.decision, 'allow', 'the broker-persona frame is ALLOWED (the deny was persona-caused, not blanket)');
});

// ============================ (c): an in-process attacker with NO key cannot sign ============================
test('(c): signRecordId with no key / a garbage key returns null (an in-process attacker cannot forge a sig)', () => {
  const id = 'a'.repeat(64);   // a valid hex64 -> the null is from the no-key path, not the input gate
  assert.equal(signRecordId(id, {}), null, 'no key -> null');
  assert.equal(signRecordId(id, { privateKeyPem: 'not-a-real-pem' }), null, 'a garbage key -> null');
  // non-vacuity: WITH a real key it DOES sign (so null above is not just always-null).
  const kp = generateEdgeKeypair();
  assert.equal(typeof signRecordId(id, { privateKeyPem: kp.privateKeyPem }), 'string', 'with a real key -> a signature (non-vacuity)');
});

// ============================ (e1): self-register -> OWN-persona PARITY (EXPECTED SHADOW pass) ============================
test('(e1) EXPECTED SHADOW pass: a self-registered attacker weighs === a broker edge (persona-blind; the 5th leg is OPEN, NOT closed)', () => {
  const w = world();
  w.reg(BROKER, 'human:broker');
  w.reg(ATTACKER, 'human:attacker');   // the attacker SELF-REGISTERS its OWN persona in the SAME registry
  w.reg('did:key:zTgtA', 'human:tgtA');
  w.reg('did:key:zTgtB', 'human:tgtB');

  // (5a) EMPTY-GRAPH non-vacuity: no path into either target before minting.
  assert.equal(disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTgtA'), 0, 'no path into TgtA before the mint (non-vacuity)');

  // attacker path: ME -> ATTACKER (seed) -> TgtA (mint under the attacker's OWN key), single-intermediary.
  w.seedVouch('did:key:zME', ATTACKER, FRESH);
  const { frame: atk } = w.mint(ATTACKER, 'did:key:zTgtA');
  const attackerWeight = disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTgtA');

  // broker baseline: ME -> BROKER (seed) -> TgtB (mint), VERTEX-IDENTICAL single-intermediary topology.
  w.seedVouch('did:key:zME', BROKER, FRESH);
  w.mint(BROKER, 'did:key:zTgtB');
  const brokerWeight = disjointPaths(w.meCtxArmed, 'did:key:zME', 'did:key:zTgtB');

  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.ok(verified.some((r) => r.record_id === atk.record_id), 'the self-registered attacker VOUCH PASSES verifiedRecords (own-key valid: integrity, NOT provenance)');
  assert.equal(attackerWeight, 1, 'the attacker own-persona edge WEIGHS (the 5th leg is OPEN)');
  assert.equal(brokerWeight, 1, 'the broker baseline weighs the same on the vertex-identical topology');
  assert.equal(attackerWeight, brokerWeight, 'PARITY (EXPECTED): the persona-blind readout gives EQUAL standing -- the honest disclosure of the OPEN 5th leg, NOT a close');
  // SHADOW invariant (NS-9): actionable stays hard-false throughout.
  assert.equal(convert(w.meCtxArmed, 'did:key:zME', 'did:key:zTgtA').actionable, false, 'SHADOW: actionable hard-false (NS-9)');
  // M3 note: parity is on a FIXED single-intermediary topology; persona-blindness ALSO admits the spec-§4.5.1
  // k-paths property (a KNOWN topological-WEAK trait, NOT an e1 regression) -- but the attacker cannot fabricate
  // ME's OUT-edges without ME's key (proven in the next test); the containment is ME's key-authority, not a broker
  // privilege. e1 asserts PARITY only, never a bound.
});

// ============================ (e1-cont): the attacker cannot forge ME's OUT-edge (the k-paths containment) ============================
test('(e1 containment): a forged ME->A edge signed under the ATTACKER key DROPS (ME out-edges are ME-key-gated, not broker-privileged)', () => {
  const w = world();
  const A = w.reg('did:key:zA', 'human:a');
  const attackerKp = generateEdgeKeypair();
  // forge ME -> A but sign with the ATTACKER key (ME never authored it).
  const forged = buildFrame({ srcPersonaDid: 'did:key:zME', parentHumanUid: 'human:me', type: 'VOUCH', seq: 0, nonce: 'me-forge-01', payload: { target_persona: A } }, { privateKeyPem: attackerKp.privateKeyPem });
  assert.equal(forged.ok, true, 'the forged ME-out-edge BUILDS (content-address valid)');
  w.append(forged.frame);
  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.equal(verified.some((r) => r.record_id === forged.frame.record_id), false, 'the forged ME-out-edge DROPS (ME is registered under ME key; the attacker sig fails) -- so the k-paths inflation needs ME to GENUINELY vouch, a real ME-key cost');
});

// ============================ (e2): cannot mint a broker-ATTRIBUTED edge via the API + key paths ============================
test('(e2) CLOSED (API + key paths): cannot squat the broker DID + a wrong-key broker-attributed edge DROPS', () => {
  const w = world();
  w.reg(BROKER, 'human:broker');
  const attackerKp = generateEdgeKeypair();   // the attacker's OWN key -- never registered as the broker

  // (4a) cannot SQUAT the broker DID via the registerPersona API path (first-writer immutability, registry.js:54).
  assert.throws(
    () => registerPersona(w.registry, { personaDid: BROKER, humanUid: 'human:attacker', publicKeyPem: attackerKp.publicKeyPem }),
    /already registered with a different binding|IMMUTABLE/,
    'cannot re-register the BROKER DID under the attacker key (first-writer immutability)',
  );

  // (4b) a VOUCH claiming src_persona_did == BROKER but signed under the ATTACKER key DROPS at the read gate.
  const forged = buildFrame({ srcPersonaDid: BROKER, parentHumanUid: 'human:broker', type: 'VOUCH', seq: 0, nonce: 'forge-01', payload: { target_persona: 'did:key:zVictim' } }, { privateKeyPem: attackerKp.privateKeyPem });
  assert.equal(forged.ok, true, 'the forged broker-attributed frame BUILDS (content-address valid; sig under the attacker key)');
  w.append(forged.frame);
  const forgedId = forged.frame.record_id;   // (5d) TRACK the forged id explicitly (do not infer)
  const verified = verifiedRecords(w.registry, w.storeOpts);
  assert.equal(verified.some((r) => r.record_id === forgedId), false, 'the broker-attributed forgery DROPS at verifiedRecords (sig-verify-failed: attacker key != the registered BROKER key)');

  // H1 BOUNDARY (DISCLOSED OPEN -- NOT closed by this arc): a same-uid attacker HOLDING the reg handle bypasses the
  // first-writer guard via a direct Map mutation (registry.js:38-41; plans/30 §2 leg 5, the host-writable registry).
  // Demonstrated LIVE as an EXPECTED-OPEN leg, carried as a NOTE/residual in the verdict (next test).
  w.registry.personas.set(BROKER, Object.freeze({ humanUid: 'human:attacker', publicKeyPem: attackerKp.publicKeyPem }));
  const afterBypass = verifiedRecords(w.registry, w.storeOpts);
  assert.equal(afterBypass.some((r) => r.record_id === forgedId), true, 'EXPECTED-OPEN (H1/5th leg): the direct reg.personas.set bypass DOES admit the forgery -- disclosed, closes with plans/31, NOT this arc');
});

// ============================ (5b/5c) exact-set vs .includes: the superstring decoy ============================
test('(e apex non-vacuity M1): a did:key:zBroker-evil superstring is counted under its OWN DID; an exact === filter gives 1 broker edge, .includes over-counts to 2', () => {
  const w = world();
  w.reg(BROKER, 'human:broker');
  const EVIL = w.reg('did:key:zBroker-evil', 'human:evil');   // a SUPERSTRING of the broker DID, attacker-owned
  w.reg('did:key:zT1', 'human:t1');
  w.reg('did:key:zT2', 'human:t2');
  w.seedVouch('did:key:zME', BROKER, FRESH); w.mint(BROKER, 'did:key:zT1');   // a genuine broker edge
  w.seedVouch('did:key:zME', EVIL, FRESH); w.mint(EVIL, 'did:key:zT2');       // the superstring-decoy edge

  const verified = verifiedRecords(w.registry, w.storeOpts);
  const exact = verified.filter((r) => r.src_persona_did === BROKER);
  const includesHits = verified.filter((r) => typeof r.src_persona_did === 'string' && r.src_persona_did.includes(BROKER));
  assert.equal(exact.length, 1, 'exactly ONE edge is attributed to the BROKER by exact === (the -evil decoy is NOT the broker)');
  assert.equal(includesHits.length, 2, 'a .includes filter OVER-COUNTS (the -evil superstring false-matches) -- exact === is LOAD-BEARING');
  assert.ok(exact.length < includesHits.length, 'exact-set is STRICTLY safer than .includes here (the security.md exact-set-not-subset discipline)');
});

// ============================ DID-consistency wiring: assertBrokerPersona ============================
test('DID-consistency: assertBrokerPersona accepts a matched signer, THROWS on a key<->persona mismatch (the §5-W2 deploy gate, unit-scale)', () => {
  const w = world();
  w.reg(BROKER, 'human:broker');
  const brokerKp = w.personas[BROKER].kp;
  const matched = (rid) => signRecordId(rid, { privateKeyPem: brokerKp.privateKeyPem });
  assert.doesNotThrow(() => assertBrokerPersona(matched, { registry: w.registry, personaDid: BROKER }), 'a signer signing as the registered broker key is accepted');
  const wrongKp = generateEdgeKeypair();
  const mismatched = (rid) => signRecordId(rid, { privateKeyPem: wrongKp.privateKeyPem });
  assert.throws(() => assertBrokerPersona(mismatched, { registry: w.registry, personaDid: BROKER }), /does NOT sign as|mis-wired/, 'a signer whose key != the registered broker key THROWS');
});

// ============================ the verdict: deploy-only legs are NOTE/residual; the field is never `hardened` ============================
test('the verdict: in-process controls PASS; deploy-only + H1 legs are NAMED residuals; NO `hardened` field (NS-9)', () => {
  const checks = [
    { id: 'b-logic-persona-mismatch', status: 'PASS', detail: 'authorizeRequest denies a foreign-persona frame (persona-mismatch)' },
    { id: 'c-no-key-sign', status: 'PASS', detail: 'signRecordId with no key returns null' },
    { id: 'e1-own-persona-parity', status: 'PASS', detail: 'self-registered attacker weighs === a broker edge (EXPECTED -- 5th leg OPEN)' },
    { id: 'e2-broker-attribution-api-key', status: 'PASS', detail: 'cannot forge a broker-attributed edge via registerPersona or without the broker key' },
    { id: 'did-consistency', status: 'PASS', detail: 'assertBrokerPersona accepts the matched signer, throws on a mismatch' },
    { id: 'a-key-cat-eacces', status: 'NOTE', detail: 'DEPLOY-ONLY: host cat the broker key -> EACCES; proven by custody-verify.js at the cross-uid deploy, not in-process' },
    { id: 'b-live-wrapper-deny', status: 'NOTE', detail: 'DEPLOY-ONLY: the real sudo -n -u wrapper denies a foreign-persona frame with empty stdout at deploy' },
    { id: 'd-heap-extract', status: 'NOTE', detail: 'DEPLOY-ONLY: gcore / /proc/pid/mem extract denied under Linux ptrace_scope=2 (R-heap re-run)' },
    { id: 'e2-inprocess-mutation-OPEN', status: 'NOTE', detail: 'DISCLOSED OPEN (H1): the same-uid reg.personas.set/delete leg forges a broker-attributed edge (5th co-forge leg); closes with plans/31, NOT this arc' },
  ];
  const report = assessReadControls(checks);
  assert.equal(report.inProcessReadControlsPassed, true, 'the in-process read controls PASS');
  for (const id of ['a-key-cat-eacces', 'b-live-wrapper-deny', 'd-heap-extract', 'e2-inprocess-mutation-OPEN']) {
    assert.ok(report.residuals.some((r) => r.startsWith(id)), 'the report NAMES the deploy-only / disclosed-open residual: ' + id);
  }
  assert.equal('hardened' in report, false, 'NS-9: no `hardened` field -- inProcessReadControlsPassed is the only verdict, never reads as provenance-verified');
});

// ============================ H2: the verdict helper FAILS CLOSED (typo / empty / mislabel) ============================
test('(H2) assessReadControls fails CLOSED: empty is not a pass; an unknown status is FAIL and SURFACES in residuals', () => {
  assert.equal(assessReadControls([]).inProcessReadControlsPassed, false, 'empty checks is NOT a pass (vacuous)');
  assert.equal(assessReadControls(null).inProcessReadControlsPassed, false, 'null checks is NOT a pass');
  const typo = assessReadControls([{ id: 'x', status: 'NOET', detail: 'a typo of NOTE' }]);
  assert.equal(typo.inProcessReadControlsPassed, false, 'an unknown status counts as FAIL (never a silent pass)');
  assert.ok(typo.residuals.some((r) => r.startsWith('x')), 'the unknown-status leg SURFACES in residuals (never vanishes)');
  const failRep = assessReadControls([{ id: 'y', status: 'FAIL', detail: 'a real failure' }]);
  assert.equal(failRep.inProcessReadControlsPassed, false, 'a FAIL is a fail');
  assert.ok(failRep.residuals.some((r) => r.startsWith('y')), 'a real FAIL leg SURFACES in residuals (named, not just counted) -- CodeRabbit');
  assert.equal(assessReadControls([{ id: 'z', status: 'PASS', detail: 'ok' }, { id: 'w', status: 'NOTE', detail: 'deploy' }]).inProcessReadControlsPassed, true, 'all PASS/NOTE -> pass');
  // null-ELEMENT + missing-status (VALIDATE-hacker nits 1+2): a null element / a status-less check normalizes to a
  // fail-closed sentinel (never throws, never a silent pass) and SURFACES in residuals.
  const nullEl = assessReadControls([null]);
  assert.equal(nullEl.inProcessReadControlsPassed, false, 'a null element is fail-closed (never throws, never a pass)');
  assert.ok(nullEl.residuals.length > 0, 'the null element SURFACES in residuals');
  assert.equal(assessReadControls([{ id: 'q' }]).inProcessReadControlsPassed, false, 'a status-less check is fail-closed');
});

console.log(`\n[edge-provenance-proof] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
