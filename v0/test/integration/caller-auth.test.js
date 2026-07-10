#!/usr/bin/env node
'use strict';

// PACT R2 caller-auth -- caller-auth.js (PURE) + broker-sign.js gate (integration) tests (plans/10 sec.5/9).
// Contract: the broker authorizes WHO may request a signature via SUDO_UID (sudo-injected REAL caller uid;
// live-probed: sudo overwrites a host-forged value) against a broker-side allowlist. STRICT uid parse
// (fail-closed on absent/malformed/overflow); opt-in (unset -> disabled + a LOUD notice); reject is a FIXED
// no-echo message; the gate runs BEFORE the key is opened. SUDO_USER is root-spoofable -> never used.
// F2/#78: an UNSET allowlist on a DEPLOYED broker now fails CLOSED (broker-side PACT_BROKER_REQUIRE_CALLER=1, the
// primary anchor; or SUDO_UID present as an auto safety net); same-uid dev (no SUDO_UID) stays disabled. NOTE:
// these spawn-level tests inject SUDO_UID as a plain child env var to validate the DECISION LOGIC; the
// sudo-overwrite/suppression premise (a host cannot forge or blank SUDO_UID) is proven OUT-OF-BAND in
// docs/deployment/cross-uid-broker.md.

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
function runBroker({ recordId, keyFile, sudoUid, allowlist, requireCaller }) {
  const env = {};
  if (keyFile !== undefined) env.PACT_BROKER_KEY_FILE = keyFile;
  if (sudoUid !== undefined) env.SUDO_UID = sudoUid;
  if (allowlist !== undefined) env.PACT_BROKER_ALLOWED_UIDS = allowlist;
  if (requireCaller !== undefined) env.PACT_BROKER_REQUIRE_CALLER = requireCaller;
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

// ============================== F2 (#78): deployed-fail-closed WHO default ==============================

test('resolveRequireCaller -- strict 1/0 override; typo-fails-closed; unset/false -> auto(null)', () => {
  assert.equal(CA.resolveRequireCaller('1'), true);
  assert.equal(CA.resolveRequireCaller('0'), false);
  assert.equal(CA.resolveRequireCaller('ture'), true, 'a typo is intent-to-arm -> ON (typo-fails-closed)');
  assert.equal(CA.resolveRequireCaller('yes'), true);
  assert.equal(CA.resolveRequireCaller(undefined), null, 'unset -> auto');
  assert.equal(CA.resolveRequireCaller('false'), null, 'only strict 0 disables; false -> auto (asymmetric-flag rule)');
});

test('authorizeCaller F2 -- unset allowlist: requireCaller true -> deny, false -> disabled (operator opt-out)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined, requireCaller: true }).decision, 'deny');
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined, requireCaller: false }).decision, 'disabled');
});

test('authorizeCaller F2 AUTO -- unset allowlist + SUDO_UID present (cross-uid) -> deny (fail closed, the #78 fix)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined, requireCaller: null }).decision, 'deny');
});

test('authorizeCaller F2 AUTO -- unset allowlist + SUDO_UID present-but-EMPTY/whitespace -> deny (tamper/anomaly fails closed)', () => {
  // a correct env_reset,!setenv sudo NEVER yields an empty SUDO_UID -> present-but-empty is an anomaly -> fail closed.
  // presence is `typeof === string` (no trim) so ASCII-space, tab, and NBSP all count as present (no Unicode-trim gap).
  for (const bad of ['', ' ', ' ', '\t', 'garbage']) {
    assert.equal(CA.authorizeCaller({ sudoUid: bad, allowlistRaw: undefined, requireCaller: null }).decision, 'deny', 'present SUDO_UID ' + JSON.stringify(bad));
  }
});

test('authorizeCaller F2 AUTO -- unset allowlist + SUDO_UID ABSENT (same-uid dev) -> disabled (dev preserved)', () => {
  assert.equal(CA.authorizeCaller({ sudoUid: undefined, allowlistRaw: undefined, requireCaller: null }).decision, 'disabled');
});

test('authorizeCaller F2 -- unset allowlist + requireCaller UNDEFINED (sigma-root, not threaded) -> disabled (byte-unchanged; undefined != null)', () => {
  // the SHARED gate (broker-core.js calls authorizeCaller for BOTH brokers): the sigma-root entrypoint threads no
  // requireCaller -> undefined MUST keep the legacy 'disabled', NEVER the AUTO deny (that would brick a
  // WHAT-gate-only root deploy). The crossUid deny is gated STRICTLY on requireCaller === null (frame auto).
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined }).decision, 'disabled');
  assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined, requireCaller: undefined }).decision, 'disabled');
});

test('authorizeCaller F2 -- unset allowlist + a MISWIRED requireCaller (raw string/number/object) -> deny (fail closed, non-bypassable)', () => {
  // the WHO gate's own state machine must not fall OPEN on an unrecognized state -- only resolveRequireCaller's
  // true/false/null (frame) or undefined (sigma-root) are legal; anything else is a miswiring -> fail closed.
  for (const bad of [1, '1', 'true', 'yes', 0, '', {}, []]) {
    assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: undefined, requireCaller: bad }).decision, 'deny', 'miswired requireCaller ' + JSON.stringify(bad));
  }
});

test('authorizeCaller F2 -- requireCaller has ZERO effect on the allowlist-SET path (regression: the tri-state is inside the unset guard)', () => {
  for (const rc of [true, false, null, undefined, 1, 'x']) {
    assert.equal(CA.authorizeCaller({ sudoUid: '501', allowlistRaw: '501,600', requireCaller: rc }).decision, 'allow', 'SET+member -> allow regardless of requireCaller ' + JSON.stringify(rc));
    assert.equal(CA.authorizeCaller({ sudoUid: '777', allowlistRaw: '501,600', requireCaller: rc }).decision, 'deny', 'SET+non-member -> deny regardless of requireCaller ' + JSON.stringify(rc));
  }
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
test('broker gate F2 -- allowlist UNSET + SUDO_UID present (cross-uid) -> DENY, empty stdout, exit 1 (the #78 blind-oracle fix)', () => {
  const { keyFile } = freshKey();
  const r = runBroker({ recordId: HEX(), keyFile, sudoUid: '501' }); // no allowlist, no flag, cross-uid caller
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout.trim(), '', 'a deployed signer with no allowlist must NOT sign');
  assert.match(r.stderr, /caller not authorized/);
});
test('broker gate F2 -- allowlist UNSET + NO SUDO_UID (same-uid dev) -> signs + LOUD disabled notice (dev preserved)', () => {
  const { keyFile, pair } = freshKey();
  const rid = HEX();
  const r = runBroker({ recordId: rid, keyFile }); // no allowlist, no SUDO_UID -> same-uid dev
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifyRecordSig(rid, r.stdout.trim(), { publicKeyPem: pair.publicKeyPem }));
  assert.match(r.stderr, /caller-auth DISABLED/);
});
test('broker gate F2 -- allowlist UNSET + SUDO_UID present + PACT_BROKER_REQUIRE_CALLER=0 -> signs (explicit operator opt-out)', () => {
  const { keyFile, pair } = freshKey();
  const rid = HEX();
  const r = runBroker({ recordId: rid, keyFile, sudoUid: '501', requireCaller: '0' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifyRecordSig(rid, r.stdout.trim(), { publicKeyPem: pair.publicKeyPem }));
});
test('broker gate F2 -- allowlist UNSET + NO SUDO_UID + PACT_BROKER_REQUIRE_CALLER=1 -> DENY (broker-side flag forces on; non-sudo deploy)', () => {
  const { keyFile } = freshKey();
  const r = runBroker({ recordId: HEX(), keyFile, requireCaller: '1' }); // the authoritative deploy signal
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /caller not authorized/);
});

console.log(`\n[caller-auth] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
