#!/usr/bin/env node
'use strict';

// PACT v0 -- the SIGMA-ROOT PROVENANCE PROOF BOARD (plans/42 W3; the sigma-root analog of plans/38 W4).
//
// SHADOW throughout. This proves the composed registration-provenance read-side properties of the sigma-root signer
// + the sigma-root broker custody-boundary deny -- WITHOUT deploying (the cross-uid legs run ONLY at the operator
// deploy, NS-7; here they are NOTE/residual). It adds NO src/ module, arms NO live flag, and does NOT deploy, seed a
// genesis root, install a key, or set an arm flag (the operator's act).
//
// The genuinely-NEW property is the APEX integrity-not-provenance SPLIT (leg d). A same-uid host that
// SELF-registerRoots its OWN human_uid + self-signs a valid sigma_root over its own binding is KEPT by the armed
// registration filter (assessRegistrationFromRegistry verifies the ed25519 against the attacker's OWN seeded root
// key -- INTEGRITY holds), BUT it cannot anchor a binding to a DISTINCT GENUINE root's controller without that
// root's key (d2 -- API-squat blocked + wrong-key crypto-drop). "root-privileged standing" := "a record
// filterAnchoredRecords KEEPS whose sigma_root verifies under a GENUINE seeded root key the attacker does not hold."
// The positive control + armed-narrows mechanics are ALREADY PROVEN in registration-gate-convert.test.js (SCAR-#30);
// W3 does NOT re-prove them -- its net-new is the apex split + the custody-boundary deny + the composed verdict.
//
// NS-9: nothing here HARDENS or gates. The verdict field is `inProcessProvenanceControlsPassed` (NEVER `hardened`,
// mirroring custody-verify.js hostObservableChecksPassed + registration-provenance.js's omitted sigmaRootWorldAnchored).
// The in-process reg.rootKeys.set / reg.personas.set mutation leg stays OPEN and is carried as a NOTE/residual (the
// host-writable registry -- registry.js:38-41 discloses the persona analog, rootKeys by extension); it closes ONLY
// with a deployed + attested cross-uid signer (the #273 authenticated-minter direction), NOT this arc.

const assert = require('node:assert/strict');

const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const { registerRoot } = require('../../src/identity/registry');
const { computeBindingId, signSigmaRoot } = require('../../src/identity/sigma-root');
const { assessRegistrationFromRegistry, R3_VERIFIES } = require('../../src/identity/registration-provenance');
const { filterAnchoredRecords } = require('../../src/trust/registration-gate');
const { authorizeBindingRequest } = require('../../src/identity/binding-request-auth');
const { convert, disjointPaths } = require('../../src/trust/convert');
const { world, FRESH } = require('./_world');
const { assessControls } = require('./_assess-controls');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
// silence the intentional-DROP refuseAlerts (a dropped record emits [PACT-REFUSE-ALERT] to stderr by design).
function quiet(fn) { const orig = process.stderr.write.bind(process.stderr); process.stderr.write = () => true; try { return fn(); } finally { process.stderr.write = orig; } }

// the W3 board's pass-field alias over the shared fail-closed helper (fold F1). NO `hardened` field (NS-9).
const assessProvenanceControls = (checks) => assessControls(checks, 'inProcessProvenanceControlsPassed');

const ATTACKER = 'did:key:zAttacker';
const VICTIM = 'did:key:zVictim';

// ---- local sigma-root anchoring cap over world() (fold F6: a thin local cap; do NOT extend the shared _world.js,
// and do NOT arm freshness -- these controls test filterAnchoredRecords DIRECTLY / regProvenance-armed only, F5).
function seedRoot(w, human) {
  const rk = generateEdgeKeypair();               // an ed25519 root keypair (distinct from every persona key)
  registerRoot(w.registry, { humanUid: human, rootPublicKeyPem: rk.publicKeyPem });
  return rk;                                       // { publicKeyPem, privateKeyPem }
}
// sign persona P's binding under an ARBITRARY root privkey (fold F6: neither world() nor anchoredWorld can sign a
// persona's binding under a NON-own-controller root -- d2b requires it).
function signBindingUnderRoot(w, personaDid, controller, rootPrivPem) {
  return signSigmaRoot({ personaDid, publicKeyPem: w.personas[personaDid].kp.publicKeyPem, controller }, { privateKeyPem: rootPrivPem });
}
// a synthetic sig-verified record for the direct filterAnchoredRecords KEEP/DROP controls (the filter reads only
// src_persona_did + record_id; mirror registration-gate-convert.test.js:143's shape).
function vrec(src, i) { return { type: 'VOUCH', src_persona_did: src, record_id: 'w3-rec-' + i, payload: { target_persona: 'did:key:zSink' } }; }

// ============================ (b)-logic-1: controller-mismatch DENY (board-assembly re-exercise, unit-covered W1b) ============================
test('(b)-logic-1: authorizeBindingRequest DENIES a foreign-controller binding as controller-mismatch (id computed FIRST -- M2 ordering)', () => {
  // recomputeBindingId runs BEFORE controllerBinds (binding-request-auth.js:134-136); compute the id FIRST so the
  // deny is genuinely controller-mismatch, not the masking record-id-mismatch.
  const kpub = generateEdgeKeypair().publicKeyPem;
  const foreign = { personaDid: 'did:key:zP', publicKeyPem: kpub, controller: 'human:foreign' };
  const claimedRecordId = computeBindingId(foreign);
  const d = authorizeBindingRequest({ requireBinding: true, brokerController: 'human:me', presentedBodyRaw: JSON.stringify(foreign), claimedRecordId });
  assert.equal(d.decision, 'deny', 'a foreign-controller binding is DENIED');
  assert.equal(d.reason, 'controller-mismatch', 'the RIGHT gate fired (controller-mismatch, NOT record-id-mismatch)');
  assert.equal(d.recordIdToSign, null, 'a deny NEVER carries a signable id');
  // non-vacuity: a MATCHING-controller binding with the correct id is ALLOWED -> the deny above is controller-caused.
  const own = { personaDid: 'did:key:zP', publicKeyPem: kpub, controller: 'human:me' };
  const ok = authorizeBindingRequest({ requireBinding: true, brokerController: 'human:me', presentedBodyRaw: JSON.stringify(own), claimedRecordId: computeBindingId(own) });
  assert.equal(ok.decision, 'allow', 'the matching-controller binding is ALLOWED (the deny was controller-caused, not blanket)');
  assert.equal(ok.recordIdToSign, computeBindingId(own), 'allow signs the COMPUTED binding id');
});

// ============================ (b)-logic-2: domain separation -- a FRAME body is refused (board-assembly re-exercise) ============================
test('(b)-logic-2: a FRAME-shaped body is DENIED binding-uncomputable AND computeBindingId THROWS on it (domain separation)', () => {
  // a real VOUCH frame preimage: no controller / publicKeyPem / personaDid. computeBindingId THROWS on it (the
  // load-bearing companion to KEY SEPARATION -- binding-request-auth.js:13-19).
  const frameBody = { src_persona_did: 'did:key:zP', type: 'VOUCH', payload: { target_persona: 'did:key:zT' }, seq: 0, nonce: 'frame-nonce-01' };
  assert.throws(() => computeBindingId(frameBody), /required \(non-empty string\)/, 'computeBindingId THROWS on a frame body (no binding fields) -- non-vacuous domain separation');
  const d = authorizeBindingRequest({ requireBinding: true, brokerController: 'human:me', presentedBodyRaw: JSON.stringify(frameBody), claimedRecordId: 'a'.repeat(64) });
  assert.equal(d.decision, 'deny', 'a frame body is DENIED');
  assert.equal(d.reason, 'binding-uncomputable', 'the frame body fails recompute-bind (computeBindingId threw -> fail closed)');
  assert.equal(d.recordIdToSign, null, 'a deny NEVER carries a signable id');
});

// ============================ (c): an in-process attacker with NO key cannot sign (board-assembly re-exercise) ============================
test('(c): signRecordId with no key / a garbage key returns null (an in-process attacker cannot forge a sig)', () => {
  const id = 'a'.repeat(64);
  assert.equal(signRecordId(id, {}), null, 'no key -> null');
  assert.equal(signRecordId(id, { privateKeyPem: 'not-a-real-pem' }), null, 'a garbage key -> null');
  const kp = generateEdgeKeypair();
  assert.equal(typeof signRecordId(id, { privateKeyPem: kp.privateKeyPem }), 'string', 'with a real key -> a signature (non-vacuity)');
});

// ============================ (d1): self-registerRoot -> KEPT (EXPECTED SHADOW pass -- the OPEN 5th leg) ============================
test('(d1) EXPECTED SHADOW pass: a self-registerRoot+self-sign attacker is KEPT (integrity, NOT provenance; the 5th leg is OPEN)', () => {
  const w = world();
  w.reg(ATTACKER, 'human:attacker');              // the attacker SELF-REGISTERS its OWN persona
  const atkRoot = seedRoot(w, 'human:attacker');  // and SELF-registerRoots its OWN root key
  const sig = signBindingUnderRoot(w, ATTACKER, 'human:attacker', atkRoot.privateKeyPem);  // self-signs the binding
  assert.ok(sig, 'the self-signed sigma_root is produced');

  const rec = vrec(ATTACKER, 1);
  // (non-vacuity, empty-before-anchor): the SAME record is DROPPED before the sigma_root is mapped -> KEPT below is
  // load-bearing, not a disarmed pass-through (fold F5 -- filterAnchoredRecords tested DIRECTLY, freshness absent).
  assert.equal(quiet(() => filterAnchoredRecords([rec], w.registry, { sigmaRoots: {} })).length, 0, 'un-mapped -> DROPPED (armed filter is live, non-vacuous)');

  // the crypto judge PASSES (integrity): the sig verifies against the attacker's OWN seeded root key.
  const prov = assessRegistrationFromRegistry(w.registry, { personaDid: ATTACKER, sigmaRoot: sig });
  assert.equal(prov.sigmaRootChecksPassed, true, 'assessRegistrationFromRegistry PASSES (the self-seeded root key authorized the binding -- INTEGRITY holds)');

  // KEPT by the armed filter -- provably integrity-not-provenance (EXPECTED SHADOW pass; the 5th leg is OPEN).
  const kept = filterAnchoredRecords([rec], w.registry, { sigmaRoots: { [ATTACKER]: sig } });
  assert.equal(kept.some((r) => r.record_id === rec.record_id), true, 'the self-anchored record is KEPT -- EXPECTED SHADOW pass: the crypto proves the root KEY authorized the binding, NEVER that the key is a distinct real human root (the 5th leg is OPEN, NOT closed)');
});

// ============================ (d2): cannot anchor to a GENUINE root (CLOSED -- API-squat + wrong-key crypto-drop) ============================
test('(d2) CLOSED (API + key paths): cannot squat the GENUINE root key + a wrong-root-key binding DROPS as a genuine crypto FAIL', () => {
  const w = world();                              // world() registers ME under human:me
  w.reg(VICTIM, 'human:me');                      // a persona under the GENUINE controller
  const genuineRoot = seedRoot(w, 'human:me');    // the GENUINE root key, seeded FIRST (fold F3)
  const attackerRoot = generateEdgeKeypair();     // the attacker's OWN root key -- never seeded under human:me

  // (d2a) cannot SQUAT the genuine root key (first-writer immutability, registry.js:105-106). Seed-genuine-FIRST +
  // assert the throw MESSAGE (fold F3) so it fires for the RIGHT reason, not a malformed-arg TypeError.
  assert.throws(
    () => registerRoot(w.registry, { humanUid: 'human:me', rootPublicKeyPem: attackerRoot.publicKeyPem }),
    /already seeded with a DIFFERENT root key|IMMUTABLE/,
    'cannot re-seed human:me with the attacker root key (first-writer immutability)',
  );
  // (d2a non-vacuity, fold F3): WITHOUT a pre-seed, registerRoot SUCCEEDS -> the throw above is genuinely the
  // first-writer guard, not a field-validation TypeError.
  assert.doesNotThrow(() => registerRoot(w.registry, { humanUid: 'human:fresh-nv', rootPublicKeyPem: attackerRoot.publicKeyPem }), 'registerRoot SUCCEEDS on a fresh human (proves the squat throw is the immutability guard)');

  // (d2b) a VICTIM binding under human:me signed by the ATTACKER root key -> the crypto judge FAILS. Assert the
  // EXACT failed-set is [R3_VERIFIES] (fold F2 -- a store-miss ALSO reads sigmaRootChecksPassed===false but fails at
  // R-registry-source; only R3-alone proves a genuine crypto/signature FAIL, mirroring registration-gate.js:108-109).
  const sigWrong = signBindingUnderRoot(w, VICTIM, 'human:me', attackerRoot.privateKeyPem);
  const provWrong = assessRegistrationFromRegistry(w.registry, { personaDid: VICTIM, sigmaRoot: sigWrong });
  assert.equal(provWrong.sigmaRootChecksPassed, false, 'the wrong-root-key binding does NOT verify');
  assert.deepEqual(
    provWrong.checks.filter((c) => c.status === 'FAIL').map((c) => c.id), [R3_VERIFIES],
    'the FAIL is EXACTLY R3-verifies (a genuine crypto/signature FAIL) -- NOT a store-miss (R-registry-source) or a malformed binding',
  );
  const dropRec = vrec(VICTIM, 2);
  assert.equal(quiet(() => filterAnchoredRecords([dropRec], w.registry, { sigmaRoots: { [VICTIM]: sigWrong } })).length, 0, 'the wrong-root-key VICTIM record DROPS at the armed filter');

  // (d2b positive complement, fold F4): the SAME VICTIM binding signed by the GENUINE root -> PASSES + KEPT. Proves
  // the DROP above is KEY-caused (a wrong root key), not a persona/mapping construction miss.
  const sigGenuine = signBindingUnderRoot(w, VICTIM, 'human:me', genuineRoot.privateKeyPem);
  const provGenuine = assessRegistrationFromRegistry(w.registry, { personaDid: VICTIM, sigmaRoot: sigGenuine });
  assert.equal(provGenuine.sigmaRootChecksPassed, true, 'the SAME persona/binding signed by the GENUINE root PASSES -> the DROP was provably wrong-key-caused (non-vacuous pair)');
  assert.equal(filterAnchoredRecords([vrec(VICTIM, 3)], w.registry, { sigmaRoots: { [VICTIM]: sigGenuine } }).length, 1, 'the genuine-signed VICTIM record is KEPT');
});

// ============================ (d-mutation): the DISCLOSED-OPEN in-process rootKeys.set bypass ============================
test('(d-mutation) DISCLOSED OPEN: a same-uid reg.rootKeys.set bypass flips the wrong-key binding from DROP to KEPT -- NOT closed by this arc', () => {
  const w = world();
  w.reg(VICTIM, 'human:me');
  seedRoot(w, 'human:me');                         // the genuine root
  const attackerRoot = generateEdgeKeypair();
  const sigWrong = signBindingUnderRoot(w, VICTIM, 'human:me', attackerRoot.privateKeyPem);
  const rec = vrec(VICTIM, 4);
  const smap = { sigmaRoots: { [VICTIM]: sigWrong } };   // the {sigmaRoots}-wrapped regProvenance opts (registration-gate.js:47-53)

  // strict ordering (fold F7 -- mirror edge-provenance-proof.test.js's (e2) H1-boundary assert-DROP -> mutate ->
  // assert-ADMIT block, the reg.personas.set bypass at :143-145): assert the DROP FIRST, then mutate, then assert
  // the ADMIT. Interleaving would let the mutation silently flip the FAIL assertion to true (proven live at VERIFY).
  // Demonstrated at BOTH layers -- the judge (sigmaRootChecksPassed) AND the read-side pipeline (filterAnchoredRecords).
  assert.equal(assessRegistrationFromRegistry(w.registry, { personaDid: VICTIM, sigmaRoot: sigWrong }).sigmaRootChecksPassed, false, 'BEFORE the bypass: the crypto judge FAILS (wrong root key)');
  assert.equal(quiet(() => filterAnchoredRecords([rec], w.registry, smap)).length, 0, 'BEFORE the bypass: the record DROPS at the armed filter');
  // the host-writable registry Map (reg.rootKeys, like reg.personas) is directly mutable in-process -- the disclosed
  // 5th co-forge leg. This re-homes human:me's root to the attacker key, bypassing registerRoot's first-writer guard.
  w.registry.rootKeys.set('human:me', attackerRoot.publicKeyPem);
  assert.equal(assessRegistrationFromRegistry(w.registry, { personaDid: VICTIM, sigmaRoot: sigWrong }).sigmaRootChecksPassed, true, 'AFTER the bypass: the crypto judge now PASSES (the SAME binding)');
  assert.equal(filterAnchoredRecords([rec], w.registry, smap).length, 1, 'AFTER the bypass: the SAME record is now KEPT at the pipeline -- EXPECTED-OPEN (the host-writable rootKeys leg; closes with an authenticated cross-uid minter, NOT this arc)');
});

// ============================ SHADOW invariant: a fully-anchored path SURVIVES armed, actionable STAYS false ============================
test('SHADOW (NS-9): a fully-anchored ME->ATTACKER path survives regProvenance-armed (freshness disarmed), actionable hard-false', () => {
  const w = world();
  w.reg(ATTACKER, 'human:attacker');
  w.reg('did:key:zTarget', 'human:target');
  const meRoot = seedRoot(w, 'human:me');
  const atkRoot = seedRoot(w, 'human:attacker');
  const sigmaRoots = {
    [w.ME]: signBindingUnderRoot(w, w.ME, 'human:me', meRoot.privateKeyPem),
    [ATTACKER]: signBindingUnderRoot(w, ATTACKER, 'human:attacker', atkRoot.privateKeyPem),
  };
  w.seedVouch(w.ME, ATTACKER, FRESH);             // ME -> ATTACKER (ME anchored)
  w.mint(ATTACKER, 'did:key:zTarget');            // ATTACKER -> TARGET (ATTACKER anchored)
  // arm ONLY regProvenance -- NO freshness key (fold F5), so a survival is UNAMBIGUOUSLY anchoring, not freshness.
  const armedCtx = { registry: w.registry, storeOpts: w.storeOpts, regProvenance: { sigmaRoots } };
  const dp = quiet(() => disjointPaths(armedCtx, w.ME, 'did:key:zTarget'));
  assert.ok(dp >= 1, 'the fully-anchored path SURVIVES the armed registration filter (non-vacuity: arming did not drop everything)');
  assert.equal(quiet(() => convert(armedCtx, w.ME, 'did:key:zTarget')).actionable, false, 'SHADOW: actionable is hard-false even armed (NS-9 -- nothing gates)');
});

// ============================ the verdict: in-process controls PASS; deploy-only + disclosed-open legs are NOTE/residual ============================
test('the verdict: in-process provenance controls PASS; deploy-only + disclosed-open legs are NAMED residuals; NO `hardened` field (NS-9)', () => {
  const checks = [
    { id: 'b-logic-1-controller-mismatch', status: 'PASS', detail: 'authorizeBindingRequest denies a foreign-controller binding (controller-mismatch)' },
    { id: 'b-logic-2-domain-separation', status: 'PASS', detail: 'a frame body is denied binding-uncomputable; computeBindingId throws on it' },
    { id: 'c-no-key-sign', status: 'PASS', detail: 'signRecordId with no key returns null' },
    // fold F8: the d1 PASS detail MUST carry the OPEN-leg language, else the verdict reads as "provenance established".
    { id: 'd1-self-root-KEPT', status: 'PASS', detail: 'EXPECTED SHADOW pass -- a self-registerRoot+self-sign binding is KEPT: the crypto proves the root KEY authorized the binding, NEVER that the key is a distinct real human root; the 5th leg is OPEN (integrity, NOT provenance)' },
    { id: 'd2-cannot-anchor-genuine-root', status: 'PASS', detail: 'cannot squat the genuine root key (immutability) + a wrong-root-key binding drops as an exact R3-verifies crypto FAIL; closes CROSS-CONTROLLER impersonation only -- buys NO readout-visible privilege over d1' },
    { id: 'a-key-cat-eacces', status: 'NOTE', detail: 'DEPLOY-ONLY: host cat the ROOT key -> EACCES; proven by custody-verify.js at the cross-uid deploy, not in-process' },
    { id: 'b-live-wrapper-deny', status: 'NOTE', detail: 'DEPLOY-ONLY: the real sudo -n -u sigma-root wrapper denies a foreign binding with empty stdout at deploy' },
    { id: 'd-heap-extract', status: 'NOTE', detail: 'DEPLOY-ONLY: gcore / /proc/pid/mem extract of the root key denied under Linux ptrace_scope=2 (R-heap re-run)' },
    // fold L2: name BOTH host-writable Maps so a reader does not infer the persona-mutation leg is closed here.
    { id: 'apex-inprocess-rootkey-mutation-OPEN', status: 'NOTE', detail: 'DISCLOSED OPEN: the registry Maps are host-writable in-process (reg.rootKeys.set AND reg.personas.set); registry.js:38-41 discloses the persona analog, rootKeys by extension. Closes with a deployed+attested cross-uid minter (#273), NOT this arc' },
  ];
  const report = assessProvenanceControls(checks);
  assert.equal(report.inProcessProvenanceControlsPassed, true, 'the in-process provenance controls PASS');
  for (const id of ['a-key-cat-eacces', 'b-live-wrapper-deny', 'd-heap-extract', 'apex-inprocess-rootkey-mutation-OPEN']) {
    assert.ok(report.residuals.some((r) => r.startsWith(id)), 'the report NAMES the deploy-only / disclosed-open residual: ' + id);
  }
  assert.equal('hardened' in report, false, 'NS-9: no `hardened` field -- inProcessProvenanceControlsPassed is the only verdict, never reads as provenance-verified');
  // fold L3 (VALIDATE-hacker): MACHINE-assert F8's OPEN-leg disclosure (not prose-only) -- a future edit dropping the
  // integrity-not-provenance language from the d1 detail fails RED.
  const d1Check = report.checks.find((c) => c.id === 'd1-self-root-KEPT');
  assert.match(d1Check.detail, /OPEN|integrity, NOT provenance/, 'the d1 KEPT leg detail carries the integrity-not-provenance OPEN-leg disclosure (F8 machine-enforced)');
});

// ============================ (H2): the verdict helper FAILS CLOSED (also re-proves the shared _assess-controls) ============================
test('(H2) assessProvenanceControls fails CLOSED: empty is not a pass; an unknown status is FAIL and SURFACES in residuals', () => {
  assert.equal(assessProvenanceControls([]).inProcessProvenanceControlsPassed, false, 'empty checks is NOT a pass (vacuous)');
  assert.equal(assessProvenanceControls(null).inProcessProvenanceControlsPassed, false, 'null checks is NOT a pass');
  const typo = assessProvenanceControls([{ id: 'x', status: 'NOET', detail: 'a typo of NOTE' }]);
  assert.equal(typo.inProcessProvenanceControlsPassed, false, 'an unknown status counts as FAIL (never a silent pass)');
  assert.ok(typo.residuals.some((r) => r.startsWith('x')), 'the unknown-status leg SURFACES in residuals (never vanishes)');
  const failRep = assessProvenanceControls([{ id: 'y', status: 'FAIL', detail: 'a real failure' }]);
  assert.equal(failRep.inProcessProvenanceControlsPassed, false, 'a FAIL is a fail');
  assert.ok(failRep.residuals.some((r) => r.startsWith('y')), 'a real FAIL leg SURFACES in residuals (named, not just counted)');
  assert.equal(assessProvenanceControls([{ id: 'z', status: 'PASS', detail: 'ok' }, { id: 'w', status: 'NOTE', detail: 'deploy' }]).inProcessProvenanceControlsPassed, true, 'all PASS/NOTE -> pass');
  const nullEl = assessProvenanceControls([null]);
  assert.equal(nullEl.inProcessProvenanceControlsPassed, false, 'a null element is fail-closed (never throws, never a pass)');
  assert.ok(nullEl.residuals.length > 0, 'the null element SURFACES in residuals');
  assert.equal(assessProvenanceControls([{ id: 'q' }]).inProcessProvenanceControlsPassed, false, 'a status-less check is fail-closed');
  // holey / throwing-getter (plans/42 W3 VALIDATE-hacker M1/L1): the shared helper DENSIFIES holes + normalizes a
  // throwing getter -> fail-closed, never a vacuous pass, never a throw. (Locks the shared _assess-controls hardening.)
  assert.equal(assessProvenanceControls(new Array(3)).inProcessProvenanceControlsPassed, false, 'a HOLEY array (new Array(3)) is fail-closed, NOT a vacuous pass (M1)');
  assert.equal(assessProvenanceControls([{ id: 'e', get status() { throw new Error('hostile'); } }]).inProcessProvenanceControlsPassed, false, 'a throwing status getter normalizes to fail-closed, NEVER throws (L1)');
});

console.log(`\n[sigma-root-provenance-proof] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
