#!/usr/bin/env node
'use strict';

// PACT R2 caller-auth -- caller-auth.js (PURE) + broker-sign.js gate (integration) tests (plans/10 sec.5/9).
// Contract: the broker authorizes WHO may request a signature via SUDO_UID (sudo-injected REAL caller uid;
// live-probed: sudo overwrites a host-forged value) against a broker-side allowlist. STRICT uid parse
// (fail-closed on absent/malformed/overflow); opt-in (unset -> disabled + a LOUD notice); reject is a FIXED
// no-echo message; the gate runs BEFORE the key is opened. SUDO_USER is root-spoofable -> never used.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const CA = require('../../src/identity/caller-auth');
const kp = require('../../src/identity/keypair');
const { verifyRecordSig } = require('../../src/lib/edge-attestation');

const BROKER_SIGN = path.resolve(__dirname, '../../src/identity/broker-sign.js');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const _dirs = [];
function freshKey() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-r2-')); _dirs.push(dir);
  const pair = kp.newPersonaKeypair();
  const keyFile = path.join(dir, 'broker.key');
  fs.writeFileSync(keyFile, pair.privateKeyPem); fs.chmodSync(keyFile, 0o600);
  return { dir, keyFile, pair };
}
process.on('exit', () => { for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// build the child env FROM SCRATCH (never spread process.env -> the runner's own SUDO_UID, if any, can't pollute)
function runBroker({ recordId, keyFile, sudoUid, allowlist }) {
  const env = {};
  if (keyFile !== undefined) env.PACT_BROKER_KEY_FILE = keyFile;
  if (sudoUid !== undefined) env.SUDO_UID = sudoUid;
  if (allowlist !== undefined) env.PACT_BROKER_ALLOWED_UIDS = allowlist;
  return spawnSync(process.execPath, [BROKER_SIGN, recordId], { env, encoding: 'utf8' });
}
const HEX = () => crypto.randomBytes(32).toString('hex');

// ============================== PURE: authorizeCaller ==============================

test('authorizeCaller -- allowlist set + SUDO_UID in allowlist -> allow', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: '501,600' }).decision, 'allow');
});
test('authorizeCaller -- allowlist set + SUDO_UID NOT in allowlist -> deny', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '777', allowlistRaw: '501,600' }).decision, 'deny');
});
test('authorizeCaller -- allowlist set + SUDO_UID absent -> deny (fail-closed)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: undefined, allowlistRaw: '501' }).decision, 'deny');
});
test('authorizeCaller -- allowlist UNSET -> disabled (opt-in OFF, R2 open)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined }).decision, 'disabled');
});
test('authorizeCaller -- malformed allowlist fails the WHOLE parse -> deny (exact-set; no drop-and-authorize)', () => {
  for (const bad of ['a,b', ' ', '-1', '501,', '', '501,abc', '0x1f', '5 1']) {
    assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: bad }).decision, 'deny', 'allowlist ' + JSON.stringify(bad));
  }
});
test('authorizeCaller -- overflow / (uid_t)-1 sentinel rejected (regex admits 10 digits; integer-bound rejects)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '9999999999', allowlistRaw: '501' }).decision, 'deny', 'caller overflow');
  assert.equal(CA.authorizeCaller({ sudoUid: '4294967295', allowlistRaw: '501' }).decision, 'deny', '(uid_t)-1 caller');
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: '4294967295' }).decision, 'deny', '(uid_t)-1 in allowlist -> malformed');
});
test('authorizeCaller -- zero-padded + ASCII-space normalize consistently (both sides via Number)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '0000000501', allowlistRaw: '501' }).decision, 'allow');
  assert.equal(CA.authorizeCaller({ sudoUid: '600', allowlistRaw: '501, 600' }).decision, 'allow'); // ASCII space after comma OK
});
test('parseUid -- strips ONLY ASCII spaces; Unicode-whitespace / tab padding is REJECTED (VALIDATE hacker H1)', () => {
  assert.equal(CA.parseUid(' 501 '), 501, 'ASCII spaces stripped (operator convenience)');
  assert.equal(CA.parseUid('\u00A0501'), null, 'NBSP-padded -> rejected (not stripped)');
  assert.equal(CA.parseUid('\t501'), null, 'tab-padded -> rejected');
  assert.equal(CA.parseUid('\uFEFF501'), null, 'BOM-padded -> rejected');
  assert.equal(CA.parseUid('5 01'), null, 'internal space -> rejected');
});

// ============================== INTEGRATION: broker-sign.js gate ==============================

test('broker gate -- authorized caller signs (SUDO_UID in allowlist) -> sig on stdout, exit 0', () => {
  const { keyFile, pair } = freshKey();
  const rid = HEX();
  const r = runBroker({ recordId: rid, keyFile, sudoUid: '501', allowlist: '501,600' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifyRecordSig(rid, r.stdout.trim(), { publicKeyPem: pair.publicKeyPem }), 'sig must verify');
  // the allowlist IS set -> no caller-auth (R2-WHO) DISABLED notice. (require-frame is off in this legacy
  // spawn, so the R2-WHAT loud-when-off notice DOES appear -- asserted in request-auth's own integration set.)
  assert.doesNotMatch(r.stderr, /caller-auth DISABLED/, 'no R2-WHO DISABLED notice when the allowlist IS set');
  assert.doesNotMatch(r.stderr, /PRIVATE KEY|BEGIN/, 'never any key material on stderr');
});
test('broker gate -- unauthorized caller -> FIXED reject, empty stdout, exit 1', () => {
  const { keyFile } = freshKey();
  const r = runBroker({ recordId: HEX(), keyFile, sudoUid: '777', allowlist: '501,600' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '', 'no stdout on reject');
  assert.match(r.stderr, /caller not authorized/);
});
test('broker gate -- the gate runs BEFORE the key open (unauthorized + junk key -> caller error, NOT key error)', () => {
  const r = runBroker({ recordId: HEX(), keyFile: '/nonexistent/pact/key', sudoUid: '777', allowlist: '501' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /caller not authorized/);
  assert.doesNotMatch(r.stderr, /key file/, 'must reject BEFORE reaching the key-open path');
});
test('broker gate -- reject LEAKS nothing (no caller uid, no allowlist value in stderr)', () => {
  const { keyFile } = freshKey();
  const r = runBroker({ recordId: HEX(), keyFile, sudoUid: '777', allowlist: '501,600' });
  assert.doesNotMatch(r.stderr, /777|501|600/, 'reject must not echo the uid or allowlist contents');
});
test('broker gate -- allowlist UNSET -> signs (R2 open) + LOUD "caller-auth DISABLED" notice on stderr', () => {
  const { keyFile, pair } = freshKey();
  const rid = HEX();
  const r = runBroker({ recordId: rid, keyFile, sudoUid: '501' }); // no allowlist
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifyRecordSig(rid, r.stdout.trim(), { publicKeyPem: pair.publicKeyPem }));
  assert.match(r.stderr, /caller-auth DISABLED/);
});

console.log(`\n[caller-auth] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
