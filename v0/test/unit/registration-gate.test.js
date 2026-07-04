#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/registration-gate.test.js  (plans/39 -- the read-gate registration-provenance FILTER)
//
// RED-first spec for filterAnchoredRecords(recs, registry, regProvenanceOpts): the disarmed-by-default
// registration-provenance filter -- the read-side analog of vouch-freshness -- that, WHEN ARMED (an injected
// deploy-DI {sigmaRoots} map + the meCtx.registry judge), drops records from a src_persona_did whose sigma_root
// binding does not verify against a registry-seeded root key. It NARROWS ATTACK (a) self-register; it does NOT
// close it (a same-uid self-seed + self-sign PASSES even armed -- the NS-9 recursion, control 5). Written to
// plans/39 §"Test controls" + the VERIFY folds (MED-1 single-registry-source, F1 partial-arm-emit, F2 strict-type,
// F3 hostile-opts total, F4 prototype-pollution own-prop, LOW-4 key-spelling, LOW-5 recursion-positive).

const assert = require('node:assert/strict');
const { filterAnchoredRecords } = require('../../src/trust/registration-gate');
const { assessRegistrationFromRegistry } = require('../../src/identity/registration-provenance');
const { createRegistry, registerRoot, registerPersona } = require('../../src/identity/registry');
const { signSigmaRoot } = require('../../src/identity/sigma-root');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// Capture the out-of-band refuseAlert stderr lines emitted during fn(); returns { alerts: string[] }.
function captureAlerts(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  const alerts = [];
  process.stderr.write = (chunk) => { const s = String(chunk); if (s.includes('[PACT-REFUSE-ALERT]')) alerts.push(s); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return alerts;
}
// silence expected DROP alerts during a call whose alerts we don't assert on
function quiet(fn) { const orig = process.stderr.write.bind(process.stderr); process.stderr.write = () => true; try { return fn(); } finally { process.stderr.write = orig; } }

const HUMAN = 'did:human:root-legit';
const LEGIT = 'did:key:zLegit';
const ATTACKER = 'did:key:zAttacker';

// Build an anchored world: a registry with a legit root + persona whose sigma_root VERIFIES, plus the attacker
// persona registered (it self-registered + sig-verifies -- the 5th-leg precondition) but with NO sigma_root mapped.
function anchoredWorld() {
  const { publicKeyPem: rootPub, privateKeyPem: rootPriv } = generateEdgeKeypair();
  const { publicKeyPem: legitPub } = generateEdgeKeypair();
  const { publicKeyPem: attackerPub } = generateEdgeKeypair();
  const reg = createRegistry();
  registerRoot(reg, { humanUid: HUMAN, rootPublicKeyPem: rootPub });
  registerPersona(reg, { personaDid: LEGIT, humanUid: HUMAN, publicKeyPem: legitPub });
  registerPersona(reg, { personaDid: ATTACKER, humanUid: HUMAN, publicKeyPem: attackerPub }); // in the registry, but UNMAPPED
  const legitSigma = signSigmaRoot({ personaDid: LEGIT, publicKeyPem: legitPub, controller: HUMAN }, { privateKeyPem: rootPriv });
  assert.ok(legitSigma, 'fixture: the legit sigma_root must sign');
  return { reg, sigmaRoots: { [LEGIT]: legitSigma } };  // ONLY the legit persona is mapped/anchored
}

let _rid = 0;
function vouch(src, target) { return { type: 'VOUCH', src_persona_did: src, record_id: 'r' + (_rid++), payload: { target_persona: target } }; }

// ---- control 1: DISARMED (absent regProvenance) -> identity pass-through (=== recs), NO alert ----
test('DISARMED absent: undefined/null regProvenance -> identity pass-through (=== recs), no alert', () => {
  const { reg } = anchoredWorld();
  const recs = [vouch(LEGIT, ATTACKER), vouch(ATTACKER, LEGIT)];
  for (const opts of [undefined, null]) {
    let out;
    const alerts = captureAlerts(() => { out = filterAnchoredRecords(recs, reg, opts); });
    assert.equal(out, recs, 'disarmed-absent must return the SAME array ref: ' + JSON.stringify(opts));
    assert.equal(alerts.length, 0, 'disarmed-absent must NOT alert (byte-identical): ' + JSON.stringify(opts));
  }
});

// ---- control 10a/10b/F1/F2: PRESENT-but-malformed arm EMITS + disarms (fail-open must be observable) ----
test('PARTIAL/malformed arm: present regProvenance with bad sigmaRoots -> reg-partial-arm alert AND inert pass-through', () => {
  const { reg } = anchoredWorld();
  const recs = [vouch(LEGIT, ATTACKER), vouch(ATTACKER, LEGIT)];
  const malformed = [ {}, { sigmaRoots: undefined }, { sigmaRoots: null }, { sigmaRoots: [] }, { sigmaRoots: 'x' }, { sigmaRoots: 123 }, [] ];
  for (const opts of malformed) {
    let out;
    const alerts = captureAlerts(() => { out = filterAnchoredRecords(recs, reg, opts); });
    assert.equal(out, recs, 'partial-arm must be INERT pass-through (=== recs): ' + JSON.stringify(opts));
    assert.equal(alerts.length, 1, 'partial-arm must EMIT exactly one alert: ' + JSON.stringify(opts));
    assert.match(alerts[0], /reg-partial-arm/, 'the alert reason must be reg-partial-arm');
    assert.match(alerts[0], /"class":"misconfig"/, 'partial-arm is a misconfig');
  }
});

// ---- control 2 (i APEX) + 4 (iv): ARMED drops the UNMAPPED self-registered persona, KEEPS the anchored legit one ----
test('ARMED apex: an unmapped self-registered persona DROPS; the anchored legit persona is KEPT', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  const legitRec = vouch(LEGIT, 'did:key:zX');
  const attackerRec = vouch(ATTACKER, 'did:key:zY');   // ATTACKER is registered + would sig-verify, but is UNMAPPED
  const out = quiet(() => filterAnchoredRecords([legitRec, attackerRec], reg, { sigmaRoots }));
  assert.deepEqual(out, [legitRec], 'the anchored legit persona KEPT; the unmapped self-register DROPPED');
  assert.equal(out.includes(attackerRec), false);
});

// ---- control 3 (ii): the SAME self-registered persona is KEPT when DISARMED (non-vacuity of the drop) ----
test('DISARMED keep: the same self-registered persona is KEPT disarmed (proves the drop is non-vacuous)', () => {
  const { reg } = anchoredWorld();
  const attackerRec = vouch(ATTACKER, 'did:key:zY');
  const out = filterAnchoredRecords([attackerRec], reg, undefined);
  assert.deepEqual(out, [attackerRec], 'disarmed keeps the very record the armed path drops');
});

// ---- control 5 (iii NS-9 RECURSION): a same-uid self-seed + self-sign PASSES even armed (NARROW != close) ----
test('NS-9 recursion: a self-seeded-root + self-signed sigma_root PASSES even armed (proves NARROW, not close)', () => {
  // The same-uid attacker (who can write meCtx) self-registerRoots its OWN human_uid with its OWN generated root
  // key, self-signs a valid sigma_root over its own binding, and maps it. The filter KEEPS it -- the crypto proves
  // the root KEY authorized the binding, NEVER that the key belongs to a distinct real human root (the recursion).
  const { publicKeyPem: evilRootPub, privateKeyPem: evilRootPriv } = generateEdgeKeypair();
  const { publicKeyPem: evilPub } = generateEdgeKeypair();
  const EVIL_H = 'did:human:evil-self-seeded';
  const reg = createRegistry();
  registerRoot(reg, { humanUid: EVIL_H, rootPublicKeyPem: evilRootPub });
  registerPersona(reg, { personaDid: ATTACKER, humanUid: EVIL_H, publicKeyPem: evilPub });
  const evilSigma = signSigmaRoot({ personaDid: ATTACKER, publicKeyPem: evilPub, controller: EVIL_H }, { privateKeyPem: evilRootPriv });
  assert.ok(evilSigma, 'the self-seeded sigma_root signs');
  const sigmaRoots = { [ATTACKER]: evilSigma };
  // POSITIVE assertion (LOW-5): the judge itself returns sigmaRootChecksPassed === true -- kept because it VERIFIES.
  const prov = assessRegistrationFromRegistry(reg, { personaDid: ATTACKER, sigmaRoot: evilSigma });
  assert.equal(prov.sigmaRootChecksPassed, true, 'the self-seed cryptographically VERIFIES (integrity) -- that is WHY it is kept');
  const rec = vouch(ATTACKER, 'did:key:zY');
  const out = quiet(() => filterAnchoredRecords([rec], reg, { sigmaRoots }));
  assert.deepEqual(out, [rec], 'the self-seeded attacker is KEPT even armed -- the filter NARROWS, it does not close self-register');
});

// ---- control 6 (v TOTALITY): hostile getters DROP fail-closed, never throw; a mixed batch keeps the good one ----
test('TOTALITY: a throwing getter on rec.src_persona_did DROPS (try/catch), never a throw; batch survives', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  const legitRec = vouch(LEGIT, 'did:key:zX');
  const hostile = (() => { const r = vouch(ATTACKER, 'did:key:zY'); Object.defineProperty(r, 'src_persona_did', { get() { throw new Error('boom-did'); } }); return r; })();
  assert.doesNotThrow(() => quiet(() => filterAnchoredRecords([hostile], reg, { sigmaRoots })));
  assert.deepEqual(quiet(() => filterAnchoredRecords([hostile], reg, { sigmaRoots })), [], 'a throwing-getter record DROPS to []');
  assert.deepEqual(quiet(() => filterAnchoredRecords([hostile, legitRec], reg, { sigmaRoots })), [legitRec], 'one throw never drops the batch');
});

// ---- control 10c (F3): a hostile-Proxy regProvenance opts -> disarm-with-alert, never throws ----
test('TOTALITY F3: a hostile-Proxy regProvenance (get-trap throws) -> disarm-with-alert, never throws through the filter', () => {
  const { reg } = anchoredWorld();
  const recs = [vouch(LEGIT, ATTACKER)];
  const hostileOpts = new Proxy({}, { get() { throw new Error('boom-opts'); } });
  let out;
  let alerts;
  assert.doesNotThrow(() => { alerts = captureAlerts(() => { out = filterAnchoredRecords(recs, reg, hostileOpts); }); });
  assert.equal(out, recs, 'a hostile opts disarms to identity pass-through');
  assert.equal(alerts.length, 1, 'a hostile opts EMITS the partial-arm alert');
  assert.match(alerts[0], /reg-partial-arm/);
});

// ---- VALIDATE hacker Finding 1 (totality): a two-face sigmaRoots getter is read ONCE -> no second-read escape ----
test('Finding 1 totality: a two-face sigmaRoots getter (valid then throws) is read EXACTLY once, no escape', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  let reads = 0;
  const opts = { get sigmaRoots() { reads += 1; if (reads >= 2) throw new Error('read2-boom'); return sigmaRoots; } };
  const legitRec = vouch(LEGIT, 'did:key:zX');
  let out;
  assert.doesNotThrow(() => { out = quiet(() => filterAnchoredRecords([legitRec], reg, opts)); }, 'a two-face getter must NOT escape (single, guarded read)');
  assert.deepEqual(out, [legitRec], 'armed with the first-read map -> the anchored persona is KEPT');
  assert.equal(reads, 1, 'sigmaRoots is read EXACTLY once (evalArm returns the validated ref; no second unguarded read)');
});

// ---- control 10d (F4): prototype-pollution -> DROP, never a KEEP-by-inheritance ----
test('F4 prototype-pollution: a magic-key src_persona_did over a polluted proto -> DROP (own-prop-only read)', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  const polluted = '__proto__ was here';
  Object.prototype.__pactPollute = polluted; // a string-valued inherited member on the sigmaRoots map
  try {
    for (const magic of ['__pactPollute', 'constructor', 'hasOwnProperty', 'toString']) {
      const rec = vouch(magic, 'did:key:zY'); // a persona whose did happens to be a magic/inherited key
      const out = quiet(() => filterAnchoredRecords([rec], reg, { sigmaRoots }));
      assert.deepEqual(out, [], 'magic-key persona ' + magic + ' must DROP (own-prop-only; never inherit a bogus sigma_root)');
    }
  } finally {
    delete Object.prototype.__pactPollute;
  }
});

// ---- control 10e (LOW-4): the map is keyed on src_persona_did (NOT src_persona) ----
test('LOW-4 key spelling: the sigmaRoots lookup keys on rec.src_persona_did', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  // a record carrying BOTH a (wrong) src_persona AND the real src_persona_did -> must be KEPT (keyed on _did).
  const rec = { type: 'VOUCH', src_persona: 'did:key:zWRONG', src_persona_did: LEGIT, record_id: 'rk', payload: { target_persona: 'did:key:zX' } };
  const out = quiet(() => filterAnchoredRecords([rec], reg, { sigmaRoots }));
  assert.deepEqual(out, [rec], 'keyed on src_persona_did -> the anchored LEGIT persona is KEPT (not looked up under src_persona)');
});

// ---- control 7 (vi): unseeded-root / unmapped-persona fail-CLOSED (drop) when armed ----
test('fail-CLOSED: armed + a persona with no seeded root key, and armed + a null registry -> DROP-all', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  // (a) a persona registered under a root with NO seeded root key -> lookupRootKey null -> fail-closed DROP.
  const { publicKeyPem: orphanPub } = generateEdgeKeypair();
  const ORPHAN = 'did:key:zOrphan';
  registerPersona(reg, { personaDid: ORPHAN, humanUid: 'did:human:unseeded', publicKeyPem: orphanPub });
  const rec = vouch(ORPHAN, 'did:key:zY');
  assert.deepEqual(quiet(() => filterAnchoredRecords([rec], reg, { sigmaRoots })), [], 'unseeded-root persona DROPS (fail-closed)');
  // (b) armed + a null registry judge -> fail-closed drop-all (never fail-open).
  const legitRec = vouch(LEGIT, 'did:key:zX');
  assert.deepEqual(quiet(() => filterAnchoredRecords([legitRec], null, { sigmaRoots })), [], 'a null registry judge -> drop-all (fail-closed, not fail-open)');
});

// ---- control 8: immutability -- recs not mutated; armed returns a NEW array ----
test('immutability: the armed path returns a NEW array; recs is never mutated', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  const recs = [vouch(LEGIT, 'did:key:zX'), vouch(ATTACKER, 'did:key:zY')];
  const snapshot = recs.slice();
  const out = quiet(() => filterAnchoredRecords(recs, reg, { sigmaRoots }));
  assert.notEqual(out, recs, 'armed returns a new array, not the input ref');
  assert.deepEqual(recs, snapshot, 'the input array is not mutated');
  assert.equal(recs.length, 2, 'no in-place splice of the input');
});

// ---- control 9 + TOTAL: null element drops; armed + non-array -> [] ----
test('TOTAL: a null element DROPS; armed + a non-array recs -> [] (no for..of throw)', () => {
  const { reg, sigmaRoots } = anchoredWorld();
  const legitRec = vouch(LEGIT, 'did:key:zX');
  assert.deepEqual(quiet(() => filterAnchoredRecords([null, undefined, legitRec], reg, { sigmaRoots })), [legitRec], 'null/undefined elements DROP');
  for (const bad of [null, undefined, 42, 'abc', {}, { length: 2 }]) {
    assert.doesNotThrow(() => quiet(() => filterAnchoredRecords(bad, reg, { sigmaRoots })));
    assert.deepEqual(quiet(() => filterAnchoredRecords(bad, reg, { sigmaRoots })), [], 'armed + non-array -> []: ' + JSON.stringify(bad));
  }
  assert.equal(filterAnchoredRecords(null, reg, undefined), null, 'DISARMED keeps identity even for a non-array (byte-identical contract)');
});

console.log(`\n[registration-gate] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
