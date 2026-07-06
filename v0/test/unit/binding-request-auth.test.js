#!/usr/bin/env node
'use strict';

// PACT sigma-root broker WHAT-gate -- binding-request-auth.js unit tests (plans/42 W1b).
//
// The SIBLING of request-auth.test.js: the broker-side per-request gate for a sigma-root BINDING (NOT a
// frame). It recompute-binds via computeBindingId (a DIFFERENT, _type-tagged preimage than a frame's
// computeRecordId) and controller-binds (the analogue of persona-bind). All SHADOW. Every deny is proven to
// fire RED and to carry recordIdToSign:null (never a signable id on a refuse).

const assert = require('node:assert/strict');
const { authorizeBindingRequest, resolveRequireBinding } = require('../../src/identity/binding-request-auth');
const { computeBindingId } = require('../../src/identity/sigma-root');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const CONTROLLER = 'human:merlin95';
const BINDING = { personaDid: 'did:key:zAlice', publicKeyPem: '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n', controller: CONTROLLER };
const BINDING_ID = computeBindingId(BINDING);
const rawOf = (o) => JSON.stringify(o);

// ============================== resolveRequireBinding (HIGH-2: mandatory default-ON, typo fails CLOSED) ==============================

test('resolveRequireBinding: explicit "1" -> ON', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: '1', rootController: '' }), true);
});
test('resolveRequireBinding: explicit "0" -> OFF (operator-explicit oracle opt-in; the ONLY way to disable)', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: '0', rootController: CONTROLLER }), false, 'a strict 0 disables even on a deployed box');
});
test('resolveRequireBinding: unset + controller PRESENT -> ON (default-ON on a deployed root broker)', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: undefined, rootController: CONTROLLER }), true);
});
test('resolveRequireBinding: unset + controller ABSENT -> OFF (un-deployed; mirrors the frame legacy)', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: undefined, rootController: '' }), false);
});
test('resolveRequireBinding: TYPO ("ture") + controller ABSENT -> ON (HIGH-2: a garbage token must NOT drop to the blind K_root oracle)', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: 'ture', rootController: '' }), true, 'a present-but-invalid token is intent-to-deploy -> fail CLOSED');
});
test('resolveRequireBinding: loose "false" + controller PRESENT -> ON (a deployed box cannot be casually disabled by a loose token; needs strict "0")', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: 'false', rootController: CONTROLLER }), true);
});
test('resolveRequireBinding: whitespace-only controller reads as ABSENT (unset + ws-controller -> OFF)', () => {
  assert.equal(resolveRequireBinding({ requireBindingRaw: undefined, rootController: '   ' }), false);
});

// ============================== authorizeBindingRequest -- the allow path ==============================

test('valid binding + matching claimed id + matching controller -> ALLOW (signs the COMPUTED id)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: rawOf(BINDING), brokerController: CONTROLLER });
  assert.equal(r.decision, 'allow');
  assert.equal(r.recordIdToSign, BINDING_ID, 'signs computeBindingId(body), never the argv assertion');
});

// ============================== the deny paths (each proven to fire RED + recordIdToSign===null) ==============================

test('a VALID FRAME body -> DENY, and computeBindingId THROWS on it (T4: non-vacuous domain separation)', () => {
  // a real frame preimage: has src_persona_did / ver / seq / nonce, NO controller/publicKeyPem/personaDid.
  const frame = { ver: 'pact/0', type: 'CLAIM', src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:x', seq: 0, nonce: 'n1', payload: { claim: { content: 'hi' } } };
  assert.throws(() => computeBindingId({ personaDid: frame.personaDid, publicKeyPem: frame.publicKeyPem, controller: frame.controller }), /required/, 'computeBindingId cannot compute a frame -> the separation is non-vacuous');
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: rawOf(frame), brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'binding-uncomputable');
  assert.equal(r.recordIdToSign, null);
});
test('a JSON ARRAY body -> DENY (non-plain-object; not relying on the throw alone -- C1/MED-3)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: '[1,2,3]', brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'binding-not-an-object');
  assert.equal(r.recordIdToSign, null);
});
test('a scalar (JSON number) body -> DENY (non-plain-object)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: '42', brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'binding-not-an-object');
  assert.equal(r.recordIdToSign, null);
});
test('body hashing to a DIFFERENT id than the claimed argv -> DENY record-id-mismatch (sign nothing the caller asserts)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: 'b'.repeat(64), presentedBodyRaw: rawOf(BINDING), brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'record-id-mismatch');
  assert.equal(r.recordIdToSign, null);
});
test('a binding for a DIFFERENT controller -> DENY controller-mismatch (the root signs only ITS controller)', () => {
  const otherBinding = { ...BINDING, controller: 'human:someone-else' };
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: computeBindingId(otherBinding), presentedBodyRaw: rawOf(otherBinding), brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'controller-mismatch');
  assert.equal(r.recordIdToSign, null);
});
test('brokerController UNSET -> DENY broker-controller-unset (fail closed; never unset===unset)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: rawOf(BINDING), brokerController: undefined });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'broker-controller-unset');
  assert.equal(r.recordIdToSign, null);
});
test('brokerController WHITESPACE-only -> DENY (trusted side ASCII-trimmed to empty -> unset -> fail closed)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: rawOf(BINDING), brokerController: '  \t ' });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'broker-controller-unset');
  assert.equal(r.recordIdToSign, null);
});
test('trusted-side trim asymmetry: a padded env controller matches an UNPADDED body controller (trim the trusted side only)', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: rawOf(BINDING), brokerController: '  ' + CONTROLLER + ' ' });
  assert.equal(r.decision, 'allow', 'the operators trailing space in the wrapper env does not brick a legit binding');
});
test('a body whose controller is PADDED (untrusted side) does NOT match an unpadded env controller (untrusted side NOT trimmed)', () => {
  const padded = { ...BINDING, controller: ' ' + CONTROLLER };
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: computeBindingId(padded), presentedBodyRaw: rawOf(padded), brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny', 'the untrusted body controller is compared byte-exact');
  assert.equal(r.reason, 'controller-mismatch');
});
test('no body presented (empty stdin) in require-binding -> DENY no-binding-presented', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: '', brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'no-binding-presented');
  assert.equal(r.recordIdToSign, null);
});
test('an oversized body -> DENY binding-too-large (before parse)', () => {
  const huge = '{"x":"' + 'a'.repeat(300 * 1024) + '"}';
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: huge, brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'binding-too-large');
});
test('an unparseable body -> DENY binding-unparseable', () => {
  const r = authorizeBindingRequest({ requireBinding: true, claimedRecordId: BINDING_ID, presentedBodyRaw: '{not json', brokerController: CONTROLLER });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'binding-unparseable');
  assert.equal(r.recordIdToSign, null);
});

// ============================== the disabled (blind-oracle) path ==============================

test('require-binding OFF -> disabled (signs the argv id; the LOUD-when-off residual, gated to strict "0" upstream)', () => {
  const r = authorizeBindingRequest({ requireBinding: false, claimedRecordId: 'c'.repeat(64), presentedBodyRaw: null, brokerController: CONTROLLER });
  assert.equal(r.decision, 'disabled');
  assert.equal(r.recordIdToSign, 'c'.repeat(64), 'legacy/disabled passes the argv id through');
});

console.log(`\n[binding-request-auth] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
