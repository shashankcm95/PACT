#!/usr/bin/env node
'use strict';

// PACT R2-WHAT per-request auth -- request-auth.js (PURE) tests (plans/11 sec.5/9).
// Contract: in require-frame mode the broker signs ONLY a record_id it can RECOMPUTE from a presented
// frame PREIMAGE body that declares its OWN persona. recompute-bind (sign the COMPUTED id, never the
// caller-asserted one) is non-vacuous TODAY; persona-bind is LOAD-BEARING (computeRecordId does not throw
// on a persona-less array/scalar). Both persona operands must be non-empty strings (no undefined===undefined
// bypass). Default-on gated on PACT_BROKER_PERSONA_DID presence; strict '1'/'0' flag parse (never !!env).

const assert = require('node:assert/strict');
const RA = require('../../src/identity/request-auth');
const { computeRecordId } = require('../../src/lib/record');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const PERSONA = 'did:key:zBrokerPersona';
function bodyFor(persona, extra) {
  return { ver: 'pact/0', type: 'CLAIM', src_persona_did: persona, parent_human_uid: 'human:root', seq: 0, nonce: 'n1', payload: { claim: { content: 'hi' } }, ...extra };
}
const rawOf = (b) => JSON.stringify(b);
const idOf = (b) => computeRecordId(b);

// =================== resolveRequireFrame (the strict flag + default-on-gated-on-persona) ===================

test('resolveRequireFrame: unset env + persona set -> ON (default-on, dropped env fails CLOSED)', () => {
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: undefined, brokerPersonaDid: PERSONA }), true);
});
test('resolveRequireFrame: unset env + NO persona -> OFF (legacy box)', () => {
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: undefined, brokerPersonaDid: undefined }), false);
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: undefined, brokerPersonaDid: '' }), false);
});
test('resolveRequireFrame: explicit "1" -> ON regardless of persona', () => {
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: '1', brokerPersonaDid: undefined }), true);
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: '  1  ', brokerPersonaDid: undefined }), true, 'ASCII-trim');
});
test('resolveRequireFrame: explicit "0" -> OFF even with persona set (escape hatch)', () => {
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: '0', brokerPersonaDid: PERSONA }), false);
});
test('resolveRequireFrame: "0"/"false"/"  " are NOT truthy-coerced (no !!env) -> fall to default', () => {
  // with persona set the default is ON; the point is "false"/"2" do not independently force a state
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: 'false', brokerPersonaDid: undefined }), false, '"false" + no persona -> default OFF');
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: '2', brokerPersonaDid: undefined }), false, '"2" + no persona -> default OFF');
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: 'false', brokerPersonaDid: PERSONA }), true, '"false" + persona -> default ON (fail-closed)');
});

// =================== personaBinds (LOAD-BEARING; both-operands-non-empty-string) ===================

test('personaBinds: matching non-empty strings -> true', () => {
  assert.equal(RA.personaBinds({ src_persona_did: PERSONA }, PERSONA), true);
});
test('personaBinds: BOTH undefined -> false (the undefined===undefined bypass is closed)', () => {
  assert.equal(RA.personaBinds({}, undefined), false);
  assert.equal(RA.personaBinds({ src_persona_did: undefined }, undefined), false);
});
test('personaBinds: BOTH empty string -> false', () => {
  assert.equal(RA.personaBinds({ src_persona_did: '' }, ''), false);
});
test('personaBinds: one side empty/absent -> false', () => {
  assert.equal(RA.personaBinds({ src_persona_did: PERSONA }, undefined), false);
  assert.equal(RA.personaBinds({ src_persona_did: PERSONA }, ''), false);
  assert.equal(RA.personaBinds({}, PERSONA), false);
});
test('personaBinds: non-string body persona (number/object) -> false', () => {
  assert.equal(RA.personaBinds({ src_persona_did: 123 }, PERSONA), false);
  assert.equal(RA.personaBinds({ src_persona_did: { x: 1 } }, PERSONA), false);
});
test('personaBinds: mismatch / case / trailing-space -> false (exact bytes, no fold/trim)', () => {
  assert.equal(RA.personaBinds({ src_persona_did: 'did:key:zOther' }, PERSONA), false);
  assert.equal(RA.personaBinds({ src_persona_did: PERSONA.toUpperCase() }, PERSONA), false);
  assert.equal(RA.personaBinds({ src_persona_did: PERSONA + ' ' }, PERSONA), false);
});

// =================== recomputeBinds (sign the COMPUTED id) ===================

test('recomputeBinds: body hashing to claimedId -> {ok:true, recordId}', () => {
  const b = bodyFor(PERSONA);
  const r = RA.recomputeBinds(b, idOf(b));
  assert.equal(r.ok, true);
  assert.equal(r.recordId, idOf(b));
});
test('recomputeBinds: claimed id mismatch -> {ok:false}', () => {
  const b = bodyFor(PERSONA);
  assert.equal(RA.recomputeBinds(b, '0'.repeat(64)).ok, false);
});
test('recomputeBinds: returns the COMPUTED id even if body carries an embedded record_id/sig (T5 strip)', () => {
  const clean = bodyFor(PERSONA);
  const dirty = { ...clean, record_id: 'd'.repeat(64), sig: 'AAAA' };
  const r = RA.recomputeBinds(dirty, idOf(clean));
  assert.equal(r.ok, true, 'embedded record_id/sig are stripped -> still binds to the true preimage');
  assert.equal(r.recordId, idOf(clean));
  assert.notEqual(r.recordId, 'd'.repeat(64), 'never the embedded record_id');
});

// =================== authorizeRequest (the composed decision) ===================

const A = (opts) => RA.authorizeRequest(opts);

test('authorizeRequest: requireFrame OFF -> disabled, recordIdToSign = claimedRecordId (legacy hex passthrough)', () => {
  const rid = 'a'.repeat(64);
  const r = A({ requireFrame: false, claimedRecordId: rid, presentedBodyRaw: null, brokerPersonaDid: undefined });
  assert.equal(r.decision, 'disabled');
  assert.equal(r.recordIdToSign, rid);
});
test('authorizeRequest: require ON + broker persona unset/empty -> DENY (fail closed, never both-null pass)', () => {
  const b = bodyFor(PERSONA);
  for (const p of [undefined, '', '   ']) {
    const r = A({ requireFrame: true, claimedRecordId: idOf(b), presentedBodyRaw: rawOf(b), brokerPersonaDid: p });
    assert.equal(r.decision, 'deny', 'persona ' + JSON.stringify(p) + ' -> deny');
    assert.match(r.reason, /persona/);
  }
});
test('authorizeRequest: require ON + the BOTH-NULL bypass (persona-less body + unset env) -> DENY', () => {
  const b = bodyFor(undefined); // no src_persona_did after JSON round-trip (undefined drops)
  const raw = JSON.stringify({ ver: 'pact/0', type: 'CLAIM', seq: 0, nonce: 'x' }); // genuinely persona-less
  const r = A({ requireFrame: true, claimedRecordId: computeRecordId(JSON.parse(raw)), presentedBodyRaw: raw, brokerPersonaDid: undefined });
  assert.equal(r.decision, 'deny');
  void b;
});
test('authorizeRequest: require ON + no body presented -> DENY', () => {
  for (const raw of [null, undefined, '']) {
    const r = A({ requireFrame: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: raw, brokerPersonaDid: PERSONA });
    assert.equal(r.decision, 'deny', 'body ' + JSON.stringify(raw));
  }
});
test('authorizeRequest: require ON + oversized body -> DENY (DoS bound, fail closed)', () => {
  const huge = '{"src_persona_did":"' + PERSONA + '","pad":"' + 'x'.repeat(RA.MAX_FRAME_BYTES + 10) + '"}';
  const r = A({ requireFrame: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: huge, brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /large|size/);
});
test('authorizeRequest: require ON + malformed JSON -> DENY', () => {
  const r = A({ requireFrame: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: '{not json', brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'deny');
});
test('authorizeRequest: require ON + JSON ARRAY body -> DENY (non-plain-object; computeRecordId would accept it)', () => {
  const r = A({ requireFrame: true, claimedRecordId: computeRecordId([1, 2, 3]), presentedBodyRaw: '[1,2,3]', brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'deny', 'an array must be refused even though computeRecordId([1,2,3]) is a valid 64-hex');
});
test('authorizeRequest: require ON + scalar / null body -> DENY (non-plain-object)', () => {
  for (const raw of ['42', '"str"', 'null', 'true']) {
    const r = A({ requireFrame: true, claimedRecordId: 'a'.repeat(64), presentedBodyRaw: raw, brokerPersonaDid: PERSONA });
    assert.equal(r.decision, 'deny', 'scalar ' + raw);
  }
});
test('authorizeRequest: require ON + valid P-frame + matching id -> ALLOW, recordIdToSign = COMPUTED id', () => {
  const b = bodyFor(PERSONA);
  const r = A({ requireFrame: true, claimedRecordId: idOf(b), presentedBodyRaw: rawOf(b), brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'allow');
  assert.equal(r.recordIdToSign, idOf(b));
});
test('authorizeRequest: require ON + valid body but WRONG claimed id -> DENY (sign nothing the caller asserts)', () => {
  const b = bodyFor(PERSONA);
  const r = A({ requireFrame: true, claimedRecordId: '0'.repeat(64), presentedBodyRaw: rawOf(b), brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /mismatch|record-id/);
});
test('authorizeRequest: require ON + foreign-persona frame -> DENY (persona-bind)', () => {
  const b = bodyFor('did:key:zAttacker');
  const r = A({ requireFrame: true, claimedRecordId: idOf(b), presentedBodyRaw: rawOf(b), brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /persona/);
});
test('authorizeRequest: require ON + embedded record_id/sig in body -> ALLOW on the TRUE preimage id (T5)', () => {
  const clean = bodyFor(PERSONA);
  const dirty = { ...clean, record_id: 'd'.repeat(64), sig: 'AAAA' };
  const r = A({ requireFrame: true, claimedRecordId: idOf(clean), presentedBodyRaw: JSON.stringify(dirty), brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'allow');
  assert.equal(r.recordIdToSign, idOf(clean));
});
test('authorizeRequest: a deny NEVER returns a recordIdToSign (cannot accidentally sign on a refuse)', () => {
  const b = bodyFor('did:key:zAttacker');
  const r = A({ requireFrame: true, claimedRecordId: idOf(b), presentedBodyRaw: rawOf(b), brokerPersonaDid: PERSONA });
  assert.equal(r.decision, 'deny');
  assert.ok(r.recordIdToSign === undefined || r.recordIdToSign === null, 'no signable id on deny');
});

console.log(`\n[request-auth] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
