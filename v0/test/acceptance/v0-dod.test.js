#!/usr/bin/env node
'use strict';

// PACT v0 — DEFINITION-OF-DONE acceptance test (spec §10.5; plan §7 Stage D).
//
//   Two mutually-untrusting roots (distinct-keyed; human-independence is U1-OPEN) exchange ONE
//   authenticated, premise-bound, scope-checked, falsifiable claim — and a fabricated
//   counterexample does NOT silently collapse it.
//
// Each property is a CONCRETE forcing assertion (the VERIFY board's mock-green!=real-path findings):
//   D1 happy path · D2 distinct-keys triad · D3 separate-uid provenance OUT-OF-BAND ·
//   D4 FALSIFY-as-flag + authz · D5 scope is real · D6 REPAIR authz + anti-ping-pong · D7 acyclicity.
// All of D1..D7 green = v0 done.

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { newPersonaKeypair } = require('../../src/identity/keypair');
const reg = require('../../src/identity/registry');
const { buildFrame, receiveFrame } = require('../../src/frame/frame');
const store = require('../../src/lib/record-store');
const { verifyRecordSig } = require('../../src/lib/edge-attestation');
const { makePremise, makeClaim, createGraph, addNode, getNode } = require('../../src/atms/claim');
const { validate, appliesAt } = require('../../src/atms/validate');
const { falsify, repair } = require('../../src/atms/falsify');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-v0-dod-'));

// --- two mutually-untrusting roots ---
const alice = newPersonaKeypair();
const bob = newPersonaKeypair();
const ALICE_DID = 'did:key:zAlice'; const ALICE_HUMAN = 'human:alice';
const BOB_DID = 'did:key:zBob'; const BOB_HUMAN = 'human:bob';

const registry = reg.createRegistry();
reg.registerPersona(registry, { personaDid: ALICE_DID, humanUid: ALICE_HUMAN, publicKeyPem: alice.publicKeyPem });
reg.registerPersona(registry, { personaDid: BOB_DID, humanUid: BOB_HUMAN, publicKeyPem: bob.publicKeyPem });

// authz: spec §3.6 — who-may-falsify is the premise.creator OR a root STAKING against it (NOT merely
// "any registered persona" — that would prove less than the spec rule). Bob is a staking root; Mallory
// is neither. (The seam is injected, so a later phase can tighten the policy without touching falsify.)
const STAKERS = new Set([BOB_DID]);
const authz = { isAuthorized: (by, premise) => by === (premise && premise.creator) || STAKERS.has(by) };

const gravityScope = { constraints: { altitude_km: { kind: 'interval', lo: 0, hi: 10 }, v_c: { kind: 'interval', lo: 0, hi: 0.1 } }, edge_confidence: 0.95 };
const premiseSpec = { statement: 'g ~ 9.8 m/s^2 (const)', scope: gravityScope, creator: ALICE_HUMAN };
const PREMISE_ID = makePremise(premiseSpec).id; // content-address (deterministic)
const claimContent = 'a projectile follows a parabola';
// The justification edge (claim -> premise) is INSIDE the signed payload (premiseRefs), so it is
// authenticated by record_id+sig — NOT re-authored at the receiver.
const payload = { premises: [premiseSpec], claim: { content: claimContent, premiseRefs: [PREMISE_ID] } };

// Bob's ingest builds his ATMS graph STRICTLY from the signed payload — no receiver-side re-linking.
// The claim's premise binding comes from payload.claim.premiseRefs (which Alice signed), so VALIDATE
// checks the AUTHENTICATED binding, not one Bob invented.
function ingest(frame) {
  let g = createGraph();
  let premise;
  for (const spec of frame.payload.premises) {
    premise = makePremise(spec);
    g = addNode(g, premise);
  }
  const claim = makeClaim({ content: frame.payload.claim.content, premises: frame.payload.claim.premiseRefs });
  g = addNode(g, claim);
  return { g, premise, claim };
}

// ---- D1: happy path ----
let aliceFrame;
test('D1: Alice authors a premise-bound claim, signs; Bob verifies + VALIDATEs as VALID_GIVEN', () => {
  const built = buildFrame({ srcPersonaDid: ALICE_DID, parentHumanUid: ALICE_HUMAN, seq: 0, nonce: 'n1', payload }, { privateKeyPem: alice.privateKeyPem });
  assert.ok(built.ok, built.reason);
  aliceFrame = built.frame;
  assert.match(aliceFrame.idempotency_key, /^[a-f0-9]{64}$/, 'a complete frame carries the INV-22 key');
  const recv = receiveFrame(aliceFrame, { registry });
  assert.ok(recv.ok, recv.reason);
  // Bob appends to his per-receiver audit log (the "auditable" substrate)
  const ap = store.appendRecord(aliceFrame, { receiverId: BOB_DID, stateDir: STATE });
  assert.ok(ap.ok, ap.reason);
  assert.ok(store.readById(aliceFrame.record_id, { receiverId: BOB_DID, stateDir: STATE }), 'frame in audit log');
  const { g, claim } = ingest(aliceFrame);
  const v = validate(g, claim.id);
  assert.ok(v.valid, v.reason);
  assert.equal(v.status, 'VALID_GIVEN');
});

// ---- D1b: the premise-binding is AUTHENTICATED (not re-authored at the receiver) ----
test('D1b: tampering the signed claim->premise binding breaks the receipt', () => {
  const tampered = JSON.parse(JSON.stringify(aliceFrame));
  tampered.payload.claim.premiseRefs = ['f'.repeat(64)]; // point the claim at a different premise id
  const recv = receiveFrame(tampered, { registry });
  assert.equal(recv.ok, false, 'a tampered premise-binding must NOT be accepted');
  assert.match(recv.reason, /record-id-mismatch|bad-signature|invalid-frame/);
});

// ---- D2: distinct-keys triad (else "two roots" is one identity) ----
test('D2: distinct keys — cross-verification fails both ways', () => {
  assert.notEqual(alice.publicKeyPem, bob.publicKeyPem);
  // Alice's frame must NOT verify under Bob's key
  assert.equal(verifyRecordSig(aliceFrame.record_id, aliceFrame.sig, { publicKeyPem: bob.publicKeyPem }), false);
  // Bob's signature must NOT verify under Alice's key
  const bobBuilt = buildFrame({ srcPersonaDid: BOB_DID, parentHumanUid: BOB_HUMAN, seq: 0, nonce: 'nb', payload }, { privateKeyPem: bob.privateKeyPem });
  assert.ok(bobBuilt.ok);
  assert.equal(verifyRecordSig(bobBuilt.frame.record_id, bobBuilt.frame.sig, { publicKeyPem: alice.publicKeyPem }), false);
});

// ---- D3: custody REQUIRED — the ambient env key is IGNORED (P-minter). HONEST CEILING: this proves
//      env-removal + that signing requires an injected custody signer; it does NOT and CANNOT prove
//      provenance against a same-uid attacker (crypto can't distinguish a co-forge — plans/04 §0/§3.3). ----
test('D3: the env signing key is IGNORED even when SET — signing works ONLY via an injected signer', () => {
  const prev = process.env.LOOM_EDGE_SIGNING_KEY;
  process.env.LOOM_EDGE_SIGNING_KEY = alice.privateKeyPem; // SET it: the strong statement is "ignored", not "cleared"
  try {
    // an ambient env key must NOT enable signing -> build FAILS (no Option-A fall-through)
    const none = buildFrame({ srcPersonaDid: ALICE_DID, parentHumanUid: ALICE_HUMAN, seq: 1, nonce: 'n3a', payload }, {});
    assert.equal(none.ok, false, 'an ambient env key must NOT enable signing (env path removed)');
    // an injected custody signer (the host process need not hold the key) STILL works
    const signer = (rid) => crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(alice.privateKeyPem)).toString('base64');
    const inj = buildFrame({ srcPersonaDid: ALICE_DID, parentHumanUid: ALICE_HUMAN, seq: 1, nonce: 'n3b', payload }, { signer });
    assert.ok(inj.ok, inj.reason);
    assert.ok(receiveFrame(inj.frame, { registry }).ok);
    // HONEST: this is NOT a provenance proof — a same-uid process WITH the key (here, in-process) signs
    // identically. Real custody is an out-of-band deployment property; in-process it only MODELS it.
  } finally {
    if (prev === undefined) delete process.env.LOOM_EDGE_SIGNING_KEY; else process.env.LOOM_EDGE_SIGNING_KEY = prev;
  }
});

// ---- D4: FALSIFY-as-FLAG + authz ----
test('D4: an authorized in-scope counterexample flags CONTESTED — the claim is NOT silently collapsed', () => {
  const { g, premise, claim } = ingest(aliceFrame);
  const r = falsify(g, premise.id, { counterexample: { point: { altitude_km: 5, v_c: 0.01 } }, strength: 5, by: BOB_DID }, authz);
  assert.ok(r.ok, r.reason);
  assert.equal(getNode(r.graph, premise.id).status, 'CONTESTED');
  const v = validate(r.graph, claim.id);
  assert.equal(v.valid, true, 'claim remains formally derivable (NOT collapsed)');
  assert.equal(v.status, 'CONTESTED', 'grounding is FLAGGED, not erased');
});

test('D4: an UNregistered (unauthorized) falsifier is rejected; premise stays ACTIVE', () => {
  const { g, premise } = ingest(aliceFrame);
  const r = falsify(g, premise.id, { counterexample: { point: { altitude_km: 5, v_c: 0.01 } }, strength: 5, by: 'did:key:zMallory' }, authz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unauthorized/);
  assert.equal(getNode(g, premise.id).status, 'ACTIVE');
});

// ---- D5: scope is real ----
test('D5: an OUT-OF-SCOPE counterexample does NOT falsify (INV-5)', () => {
  const { g, premise } = ingest(aliceFrame);
  const r = falsify(g, premise.id, { counterexample: { point: { altitude_km: 999, v_c: 0.01 } }, strength: 5, by: BOB_DID }, authz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /out-of-scope/);
  assert.equal(getNode(g, premise.id).status, 'ACTIVE');
});

test('D5: a claim applied OUTSIDE its derived scope is BLOCKED', () => {
  const { g, claim } = ingest(aliceFrame);
  assert.equal(appliesAt(g, claim.id, { altitude_km: 5, v_c: 0.01 }).ok, true);
  const out = appliesAt(g, claim.id, { altitude_km: 999, v_c: 0.01 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /BLOCKED/);
});

// ---- D6: REPAIR authz + anti-ping-pong ----
test('D6: authorized escalating REPAIR restores ACTIVE; unauthorized + non-escalating are rejected', () => {
  const { g, premise } = ingest(aliceFrame);
  const f = falsify(g, premise.id, { counterexample: { point: { altitude_km: 5, v_c: 0.01 } }, strength: 5, by: BOB_DID }, authz);
  assert.ok(f.ok);
  // unauthorized repair rejected
  assert.match(repair(f.graph, premise.id, { strength: 6, by: 'did:key:zMallory' }, authz).reason, /unauthorized/);
  // non-escalating repair rejected (anti-ping-pong)
  assert.match(repair(f.graph, premise.id, { strength: 5, by: BOB_DID }, authz).reason, /insufficient-evidence/);
  // authorized + escalating repair restores
  const ok = repair(f.graph, premise.id, { strength: 6, by: BOB_DID }, authz);
  assert.ok(ok.ok, ok.reason);
  assert.equal(getNode(ok.graph, premise.id).status, 'ACTIVE');
});

// ---- D7: acyclicity ----
test('D7: a justification cycle is REJECTED by VALIDATE (fail-closed)', () => {
  const A = { id: 'a'.repeat(64), kind: 'claim', content: 'a', premises: ['b'.repeat(64)] };
  const B = { id: 'b'.repeat(64), kind: 'claim', content: 'b', premises: ['a'.repeat(64)] };
  let g = createGraph(); g = addNode(g, A); g = addNode(g, B);
  const v = validate(g, A.id);
  assert.equal(v.valid, false);
  assert.match(v.reason, /cycle-detected/);
});

try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\n[v0-DoD] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
