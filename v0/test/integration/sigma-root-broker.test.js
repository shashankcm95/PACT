#!/usr/bin/env node
'use strict';

// PACT sigma-root broker — identity/sigma-root-broker.js integration tests (plans/42 W1b).
//
// The SIBLING of broker.test.js: proves the cross-uid custody MECHANISM for the TRUST ROOT (K_root signs a
// sigma-root binding through a separate process; the seam is the existing { signer }). Every test runs
// SAME-UID -- which demonstrates the mechanism (key absent from the host heap; sig from a separate process)
// but CANNOT demonstrate SEPARATION (the host uid still reaches the broker). Custody is real only cross-uid /
// enclave / HSM, verified out-of-band (NS-7). All SHADOW.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { newPersonaKeypair } = require('../../src/identity/keypair');
const { signSigmaRoot, verifySigmaRoot, computeBindingId } = require('../../src/identity/sigma-root');
const { brokerSigner } = require('../../src/identity/broker-client');

const BROKER = path.join(__dirname, '..', '..', 'src', 'identity', 'sigma-root-broker.js');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// drain tmpdirs even on an assertion throw (don't leak /tmp on failure)
const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

const ROOT = newPersonaKeypair();       // K_root (the trust root)
const PERSONA = newPersonaKeypair();     // the persona being bound; its public key is k_pub
const CONTROLLER = 'human:merlin95';
const BINDING = { personaDid: 'did:key:zAlice', publicKeyPem: PERSONA.publicKeyPem, controller: CONTROLLER };
const BINDING_ID = computeBindingId(BINDING);

function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-sroot-'));
  _allDirs.push(d);
  return d;
}
function writeKey(dir, pem, mode, name) {
  const p = path.join(dir, name || 'root.key');
  fs.writeFileSync(p, pem);
  fs.chmodSync(p, mode);
  return p;
}

// spawn sigma-root-broker.js directly with a presented binding body on stdin (the require-binding channel).
// `input` always provided so stdin is a CLOSED pipe (an unprovided stdin would inherit + block on the deadline).
function runBinding({ rootKeyFile, controller, allowedUids, requireBinding, requireCaller, brokerKeyFile, recordId, body, sudoUid }) {
  const env = {};
  if (rootKeyFile !== undefined) env.PACT_ROOT_KEY_FILE = rootKeyFile;
  if (controller !== undefined) env.PACT_ROOT_CONTROLLER = controller;
  if (allowedUids !== undefined) env.PACT_ROOT_ALLOWED_UIDS = allowedUids;
  if (requireBinding !== undefined) env.PACT_ROOT_REQUIRE_BINDING = requireBinding;
  if (requireCaller !== undefined) env.PACT_ROOT_REQUIRE_CALLER = requireCaller; // F2-sibling/#106: the WHO-gate arm flag
  if (brokerKeyFile !== undefined) env.PACT_BROKER_KEY_FILE = brokerKeyFile;
  if (sudoUid !== undefined) env.SUDO_UID = sudoUid;
  return spawnSync(process.execPath, [BROKER, recordId], { env, input: body === undefined ? '' : body, encoding: 'utf8' });
}

// ====================== the custody MECHANISM: sign a binding through a separate process (full seam) ======================

test('FULL SIGNING SEAM (same-uid; mechanism, NOT custody separation): signSigmaRoot({signer}) -> the broker signs the binding -> verifySigmaRoot passes under K_root_pub', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  // the broker child runs in require-binding mode (controller set in its allowlisted env); signSigmaRoot
  // threads the binding body, brokerSigner forwards it on stdin (Piece C).
  const signer = brokerSigner({ command: process.execPath, args: [BROKER], config: { PACT_ROOT_KEY_FILE: rootKeyFile, PACT_ROOT_CONTROLLER: CONTROLLER } });
  const sig = signSigmaRoot(BINDING, { signer });
  assert.ok(sig, 'the sigma-root broker produced a sig');
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: sig, rootPublicKeyPem: ROOT.publicKeyPem }), 'verifies under K_root public key');
  assert.equal(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: sig, rootPublicKeyPem: PERSONA.publicKeyPem }), false, 'does NOT verify under a different key');
});

test('direct spawn: a valid binding on stdin (require-binding via controller) signs + verifies', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'sig over the computed binding id verifies');
});

// ====================== F2-sibling/#106: the sigma-root WHO gate fails CLOSED on a deployed box ======================
// REPLACES the #78 byte-unchanged regression test. The sigma-root entrypoint now threads
// requireCaller = resolveRequireCaller(PACT_ROOT_REQUIRE_CALLER) into the SHARED authorizeCaller, so a deployed
// K_root broker with an unset PACT_ROOT_ALLOWED_UIDS fails CLOSED -- the faithful mirror of the frame broker F2 fix
// (#78/#107). The WHO gate is the SOLE caller-scoping control over the #273 mint-under-controller residual (any uid
// that reaches the broker can mint "K_root authorized MY key as persona P" within the controller) -- the WHAT gate
// does NOT compensate on the WHO axis (VERIFY board). #78's WHAT-gate-only carve-out is deliberately reversed;
// an operator who wants WHAT-gate-only sets PACT_ROOT_REQUIRE_CALLER=0 (case d).

test('#106 (a) DEPLOYED -> DENY: cross-uid SUDO_UID + UNSET PACT_ROOT_ALLOWED_UIDS (no flag) -> WHO gate denies (status 1, no sig, "caller not authorized")', () => {
  // AUTO (flag unset) -> resolveRequireCaller(undefined)=null -> SUDO_UID present -> deny 'allowlist-unset-but-deployed'.
  // Positively assert the WHO reject message so this is provably gate (0), NOT an incidental WHAT/key-vet deny
  // (VERIFY non-vacuity fold). Controller SET so the ONLY change from case (b) is the presence of SUDO_UID.
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING), sudoUid: '501' });
  assert.equal(r.status, 1, 'a deployed sigma-root broker with an unset allowlist fails closed');
  assert.equal(r.stdout.trim(), '', 'no sig on the WHO deny');
  assert.match(r.stderr, /caller not authorized/, 'the deny is specifically the WHO gate (gate 0), not WHAT/key-vet');
  assert.doesNotMatch(r.stderr, /caller-auth DISABLED/, 'NOT the legacy disabled path -- the WHO gate is armed');
});

test('#106 (b) SAME-UID DEV preserved: NO SUDO_UID + UNSET allowlist -> disabled (still signs, LOUD notice)', () => {
  // the differential for (a): a byte-identical request with SUDO_UID ABSENT -> AUTO -> disabled -> signs. Proves the
  // (a) deny is the SUDO_UID (cross-uid) axis, not a blanket refusal that would brick same-uid dev.
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'same-uid dev still signs');
  assert.match(r.stderr, /caller-auth DISABLED/, 'the LOUD R2-WHO disabled notice (NS-9)');
});

test('#106 (c) FLAG-FORCED even without sudo: PACT_ROOT_REQUIRE_CALLER=1 + UNSET allowlist + no SUDO_UID -> DENY', () => {
  // the broker-side flag is the PRIMARY, host-untamperable deploy anchor (a non-sudo deploy sets it): strict '1'
  // forces require even when the SUDO_UID marker is absent -> fail closed (the non-sudo blind-oracle residual).
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING), requireCaller: '1' });
  assert.equal(r.status, 1, 'the flag forces the WHO gate on even with no SUDO_UID');
  assert.equal(r.stdout.trim(), '', 'no sig');
  assert.match(r.stderr, /caller not authorized/);
});

test('#106 (d) EXPLICIT OPT-OUT: PACT_ROOT_REQUIRE_CALLER=0 + cross-uid SUDO_UID + UNSET allowlist -> disabled (WHAT-gate-only deploy still signs)', () => {
  // strict '0' is the ONLY way to opt out (asymmetric-flag rule). A VALID binding body + controller so require-binding
  // (ON via controllerPresent) AUTHORIZES on the WHAT gate -- else a WHAT refuse would make the "signs" a false
  // artifact (VERIFY fold). Verify the sig under K_root to prove it actually signed.
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING), sudoUid: '501', requireCaller: '0' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'the =0 opt-out signs under K_root');
  assert.match(r.stderr, /caller-auth DISABLED/, 'the opt-out still emits the LOUD disabled notice (NS-9)');
});

test('#106 (e) TYPO fails CLOSED: PACT_ROOT_REQUIRE_CALLER="ture" + UNSET allowlist + no sudo -> DENY (intent-to-arm)', () => {
  // isDeploySignalSet: a present-but-non-strict token is intent-to-arm -> require ON -> deny; NEVER a silent
  // fall-through to the blind K_root oracle (security.md asymmetric-flag rule).
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING), requireCaller: 'ture' });
  assert.equal(r.status, 1, 'a typo is intent-to-arm -> fail closed');
  assert.equal(r.stdout.trim(), '', 'no sig');
  assert.match(r.stderr, /caller not authorized/);
});

test('#106 (f) allowlist SET + member: PACT_ROOT_ALLOWED_UIDS includes SUDO_UID -> ALLOW (signs, no disabled notice)', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING), allowedUids: '501,600', sudoUid: '501' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'an allowlisted cross-uid caller signs');
  assert.doesNotMatch(r.stderr, /caller-auth DISABLED/, 'no disabled notice when the allowlist IS set + the caller is a member');
});

// ====================== the WHAT-gate refuses (frame body / blind argv / wrong controller) ======================

test('a FRAME body -> REFUSE (computeBindingId cannot compute it), empty stdout', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const frame = { ver: 'pact/0', type: 'CLAIM', src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:x', seq: 0, nonce: 'n1', payload: { claim: { content: 'hi' } } };
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: 'a'.repeat(64), body: JSON.stringify(frame) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '', 'no sig on a refuse');
});

test('a blind argv hex (NO body presented) in require-binding -> REFUSE (no-binding-presented), empty stdout', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: 'a'.repeat(64), body: '' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
});

test('a binding for a DIFFERENT controller than the broker\'s -> REFUSE (controller-mismatch), empty stdout', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const other = { ...BINDING, controller: 'human:someone-else' };
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: computeBindingId(other), body: JSON.stringify(other) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
});

// ====================== HIGH-1: same-inode refusal (K_root MUST be a distinct key from K_broker) ======================

test('same-inode refusal: PACT_ROOT_KEY_FILE == PACT_BROKER_KEY_FILE (same file) -> REFUSE, empty stdout, no sig even on an otherwise-valid binding', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  // an otherwise-VALID request (correct body + id + controller) that would sign -- but the two key envs point
  // at the SAME inode, so the vet's same-inode guard fails CLOSED before signing.
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, brokerKeyFile: rootKeyFile, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '', 'no sig -- the cross-protocol-oracle mis-deploy is refused');
  assert.match(r.stderr, /DISTINCT key/, 'the refuse names the same-inode collision');
});

test('same-inode refusal: a SYMLINK PACT_BROKER_KEY_FILE aliasing the root key -> REFUSE (statSync follows the link)', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const link = path.join(dir, 'broker-alias.key');
  fs.symlinkSync(rootKeyFile, link);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, brokerKeyFile: link, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
});

test('DISTINCT keys pass: PACT_BROKER_KEY_FILE points at a genuinely different key -> the binding still signs', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const otherKeyFile = writeKey(dir, newPersonaKeypair().privateKeyPem, 0o600, 'k_broker.key');
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, brokerKeyFile: otherKeyFile, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'distinct keys -> the vet passes and the binding signs');
});

test('ENOENT other key: PACT_BROKER_KEY_FILE points at a NONEXISTENT path -> the check SKIPS -> the binding still signs', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, brokerKeyFile: path.join(dir, 'nope.key'), recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'an ABSENT other key -> nothing to collide with -> the binding signs (ENOENT still skips)');
});

test('UNSTATTABLE other key: a non-ENOENT statSync error (ENOTDIR) -> FAIL CLOSED (cannot prove key separation), empty stdout', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  // a path THROUGH a regular file -> statSync throws ENOTDIR (NOT ENOENT) -> the guard must fail closed, not
  // silently skip (a swallowed non-ENOENT error would leave the cross-protocol oracle open -- CodeRabbit).
  const notdir = writeKey(dir, 'x', 0o600, 'a-regular-file');
  const unstattable = path.join(notdir, 'child.key');
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, brokerKeyFile: unstattable, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(r.status, 1, 'a non-ENOENT unstattable other key fails closed');
  assert.equal(r.stdout.trim(), '', 'no sig -- distinctness could not be proven');
  assert.match(r.stderr, /cannot prove key separation/, 'the refuse names the unprovable separation');
});

// ====================== key-file vet reuse (the shared broker-core vet applies to the root key too) ======================

test('the shared key vet still applies: 0640/0644 root key REFUSED, 0600 accepted, symlink refused', () => {
  const dir = freshDir();
  // 0644 world-readable root key -> refused
  const wr = writeKey(dir, ROOT.privateKeyPem, 0o644, 'wr.key');
  assert.notEqual(runBinding({ rootKeyFile: wr, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) }).status, 0, '0644 refused');
  // 0640 group-readable -> refused
  const gr = writeKey(dir, ROOT.privateKeyPem, 0o640, 'gr.key');
  assert.notEqual(runBinding({ rootKeyFile: gr, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) }).status, 0, '0640 refused');
  // a symlinked root key path -> refused (O_NOFOLLOW)
  const good = writeKey(dir, ROOT.privateKeyPem, 0o600, 'good.key');
  const link = path.join(dir, 'root.link'); fs.symlinkSync(good, link);
  assert.notEqual(runBinding({ rootKeyFile: link, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) }).status, 0, 'symlinked root key refused');
  // the legit 0600 key passes (non-vacuous)
  assert.equal(runBinding({ rootKeyFile: good, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) }).status, 0, 'a normal owner-only 0600 root key is accepted');
});

// ====================== key never leaks ======================

test('the broker emits ONLY the sig — no key/PEM/DER fragment on stdout OR stderr', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const keyBody = ROOT.privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').slice(0, 40);
  const ok = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim().length, 88, 'stdout is exactly the base64 sig');
  assert.ok(!/PRIVATE KEY|BEGIN |MC4C|MII/.test(ok.stderr), 'no PEM/DER fragment on stderr');
  assert.ok(!ok.stdout.includes(keyBody) && !ok.stderr.includes(keyBody), 'no key body in output');
  // malformed-key error path: non-zero, empty stdout, no PEM/DER fragment on stderr
  const bad = writeKey(dir, 'definitely not a pem', 0o600, 'bad.key');
  const er = runBinding({ rootKeyFile: bad, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
  assert.notEqual(er.status, 0);
  assert.equal(er.stdout, '', 'no stdout on the error path');
  assert.ok(!/PRIVATE KEY|BEGIN |MC4C|MII/.test(er.stderr), 'no PEM/DER fragment on stderr');
});

// ====================== T1: grep forward-guard (the copy-paste-wrong-key catch) ======================

test('T1 forward-guard: sigma-root-broker.js reads PACT_ROOT_* inputs, wires the same-inode guard, and NEVER reads the frame broker\'s persona/allowlist', () => {
  const src = fs.readFileSync(BROKER, 'utf8');
  // its OWN inputs are all PACT_ROOT_*
  assert.match(src, /keyFileEnv:\s*'PACT_ROOT_KEY_FILE'/, 'signs with the ROOT key');
  assert.match(src, /allowlistEnv:\s*'PACT_ROOT_ALLOWED_UIDS'/, 'its OWN WHO-allowlist');
  assert.match(src, /process\.env\.PACT_ROOT_CONTROLLER/, 'reads the ROOT controller');
  // the copy-paste-wrong-key catch: it must NOT use the frame broker's key as ITS key
  assert.doesNotMatch(src, /keyFileEnv:\s*'PACT_BROKER_KEY_FILE'/, 'never signs with the FRAME broker key');
  // the same-inode guard IS wired (references PACT_BROKER_KEY_FILE ONLY as distinctFrom, not as its key)
  assert.match(src, /distinctFromKeyFileEnv:\s*'PACT_BROKER_KEY_FILE'/, 'the same-inode guard is wired');
  // F2-sibling/#106: the WHO gate is threaded (NOT silently un-armed) -- reads its OWN root WHO-arm env + resolves it.
  assert.match(src, /process\.env\.PACT_ROOT_REQUIRE_CALLER/, 'reads its OWN root WHO-arm env');
  assert.match(src, /resolveRequireCaller/, 'resolves + threads the WHO-gate tri-state (not silently un-armed)');
  assert.match(src, /\brequireCaller\b/, 'threads requireCaller into runBroker');
  assert.doesNotMatch(src, /PACT_BROKER_REQUIRE_CALLER/, 'never reads the FRAME WHO-arm env');
  // never reads the frame broker's persona / allowlist
  assert.doesNotMatch(src, /PACT_BROKER_PERSONA_DID/, 'never reads the frame persona');
  assert.doesNotMatch(src, /PACT_BROKER_ALLOWED_UIDS/, 'never reads the frame allowlist');
});

test('single-arming-source: sigma-root-broker.js reads each arm env EXACTLY once (shape tripwire)', () => {
  const src = fs.readFileSync(BROKER, 'utf8');
  for (const v of ['PACT_ROOT_CONTROLLER', 'PACT_ROOT_REQUIRE_BINDING', 'PACT_ROOT_REQUIRE_CALLER']) {
    const n = (src.match(new RegExp('process\\.env\\.' + v, 'g')) || []).length;
    assert.equal(n, 1, v + ' must be read from process.env exactly once (found ' + n + ')');
  }
});

// ====================== fd-leak: N iterations through the shared vet do not exhaust fds ======================

test('no fd leak: 40 sign-through-broker round-trips all succeed (the shared vet closes every fd)', () => {
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  for (let i = 0; i < 40; i++) {
    const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING) });
    assert.equal(r.status, 0, 'iter ' + i + ': ' + r.stderr);
  }
});

console.log(`\n[sigma-root-broker] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
