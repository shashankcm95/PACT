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
function runBinding({ rootKeyFile, controller, allowedUids, requireBinding, brokerKeyFile, recordId, body, sudoUid }) {
  const env = {};
  if (rootKeyFile !== undefined) env.PACT_ROOT_KEY_FILE = rootKeyFile;
  if (controller !== undefined) env.PACT_ROOT_CONTROLLER = controller;
  if (allowedUids !== undefined) env.PACT_ROOT_ALLOWED_UIDS = allowedUids;
  if (requireBinding !== undefined) env.PACT_ROOT_REQUIRE_BINDING = requireBinding;
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
  const signer = brokerSigner({ command: process.execPath, args: [BROKER], env: { PACT_ROOT_KEY_FILE: rootKeyFile, PACT_ROOT_CONTROLLER: CONTROLLER } });
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

test('F2/#78 shared-gate regression: sigma-root WHO gate is BYTE-UNCHANGED -- a cross-uid SUDO_UID + UNSET PACT_ROOT_ALLOWED_UIDS still SIGNS (legacy disabled), never denies', () => {
  // the frame broker F2 fix threads requireCaller ONLY from broker-sign.js; the sigma-root entrypoint threads
  // nothing -> undefined -> authorizeCaller keeps the legacy `disabled`. A cross-uid-shaped SUDO_UID must NOT trip
  // the frame AUTO deny here (that would brick a WHAT-gate-only root deploy); the WHAT gate (require-binding) still
  // protects it. Guards a future refactor from conflating `undefined` (sigma-root) with the frame's `null` (auto).
  const dir = freshDir();
  const rootKeyFile = writeKey(dir, ROOT.privateKeyPem, 0o600);
  const r = runBinding({ rootKeyFile, controller: CONTROLLER, recordId: BINDING_ID, body: JSON.stringify(BINDING), sudoUid: '501' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifySigmaRoot({ personaDid: BINDING.personaDid, publicKeyPem: BINDING.publicKeyPem, controller: BINDING.controller, sigmaRoot: r.stdout.trim(), rootPublicKeyPem: ROOT.publicKeyPem }), 'signs under a cross-uid SUDO_UID (NOT bricked by the frame F2 change)');
  assert.match(r.stderr, /caller-auth DISABLED/, 'the sigma-root stays on the legacy R2-WHO disabled path');
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
  // never reads the frame broker's persona / allowlist
  assert.doesNotMatch(src, /PACT_BROKER_PERSONA_DID/, 'never reads the frame persona');
  assert.doesNotMatch(src, /PACT_BROKER_ALLOWED_UIDS/, 'never reads the frame allowlist');
});

test('single-arming-source: sigma-root-broker.js reads each arm env EXACTLY once (shape tripwire)', () => {
  const src = fs.readFileSync(BROKER, 'utf8');
  for (const v of ['PACT_ROOT_CONTROLLER', 'PACT_ROOT_REQUIRE_BINDING']) {
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
