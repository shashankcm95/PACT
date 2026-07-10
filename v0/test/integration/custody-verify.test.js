#!/usr/bin/env node
'use strict';

// PACT cross-uid deployment spike — broker-launch.js + custody-verify.js unit tests (plans/09 §5).
// Contract: (launcher) crossUidSudoArgs pins command='sudo', validates the broker-user against sudo
// flag-injection + the wrapper path; (verifier) assessCustody is a PURE verdict over observed facts (the
// cross-uid TRUE branch — unreachable on a same-uid box — is tested via SYNTHETIC facts), gatherCustodyFacts
// produces those facts from real I/O, and the report NEVER asserts custodyReal (NS-9). C3 (a real sign+verify
// round-trip) is the load-bearing non-vacuity proof; the owner-uid disambiguator (keyOwnerUid !== runningUid)
// gates the verdict so a same-uid mode-000 file can never false-pass.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const L = require('../../src/identity/broker-launch');
const V = require('../../src/identity/custody-verify');
const { brokerSigner } = require('../../src/identity/broker-client');
const reg = require('../../src/identity/registry');
const kp = require('../../src/identity/keypair');

const BROKER_SIGN = path.resolve(__dirname, '../../src/identity/broker-sign.js');
const IS_ROOT = (typeof process.getuid === 'function' && process.getuid() === 0)
  || (typeof process.geteuid === 'function' && process.geteuid() === 0);

const _dirs = [];
function freshKey(mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-custody-'));
  _dirs.push(dir);
  const pair = kp.newPersonaKeypair();
  const keyFile = path.join(dir, 'broker.key');
  fs.writeFileSync(keyFile, pair.privateKeyPem);
  fs.chmodSync(keyFile, mode === undefined ? 0o600 : mode); // deterministic perms (no ambient-umask dep)
  return { dir, keyFile, pair };
}
process.on('exit', () => { for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// ============================== launcher: crossUidSudoArgs / crossUidBrokerSigner ==============================

test('crossUidSudoArgs pins command=sudo + builds the -n -u <user> <wrapper> argv', () => {
  const a = L.crossUidSudoArgs({ brokerUser: 'pact-broker', wrapperPath: '/usr/local/bin/pact-broker-sign' });
  assert.equal(a.command, 'sudo');
  assert.deepEqual(a.args, ['-n', '-u', 'pact-broker', '/usr/local/bin/pact-broker-sign']);
});

test('crossUidSudoArgs honors an absolute sudoPath override (location seam only)', () => {
  const a = L.crossUidSudoArgs({ brokerUser: 'b_1', wrapperPath: '/opt/w', sudoPath: '/run/wrappers/bin/sudo' });
  assert.equal(a.command, '/run/wrappers/bin/sudo');
});

test('crossUidSudoArgs REJECTS a flag-injection / malformed broker-user', () => {
  for (const bad of ['-u', '-root', 'a b', 'a;b', '', 'x'.repeat(40), '1abc', 'Alice', 'a/b', 'a$b']) {
    assert.throws(() => L.crossUidSudoArgs({ brokerUser: bad, wrapperPath: '/usr/local/bin/w' }),
      /brokerUser/, 'must reject brokerUser ' + JSON.stringify(bad));
  }
});

test('crossUidSudoArgs REJECTS a non-absolute / ".."-bearing / "-"-leading wrapperPath', () => {
  for (const bad of ['relative/w', '/a/../b', '', '-flag', 'w']) {
    assert.throws(() => L.crossUidSudoArgs({ brokerUser: 'pact-broker', wrapperPath: bad }),
      /wrapperPath/, 'must reject wrapperPath ' + JSON.stringify(bad));
  }
});

test('crossUidSudoArgs REJECTS a non-absolute sudoPath override (cannot become a flag)', () => {
  assert.throws(() => L.crossUidSudoArgs({ brokerUser: 'b', wrapperPath: '/opt/w', sudoPath: '-S' }), /sudoPath/);
  assert.throws(() => L.crossUidSudoArgs({ brokerUser: 'b', wrapperPath: '/opt/w', sudoPath: 'mysudo' }), /sudoPath/);
});

test('crossUidBrokerSigner end-to-end through a stub sudo + stub wrapper + the REAL broker (Rule 2a-corollary)', () => {
  // a real exec chain: stub-sudo (drops "-n -u <user>") -> stub-wrapper (sets the key env, execs the real
  // broker) -> ed25519 sign. Proves the launcher's exact argv is consumed correctly + yields a working signer.
  // (The cross-uid leg itself is the DEPLOYMENT, not the test — real `sudo -n` would fail-fast here by design.)
  const { dir, keyFile, pair } = freshKey();
  const stubSudo = path.join(dir, 'sudo');
  fs.writeFileSync(stubSudo, '#!/bin/sh\nshift 3\nexec "$@"\n'); // drop -n -u <user>; run the rest (wrapper + argv)
  fs.chmodSync(stubSudo, 0o755);
  const wrapper = path.join(dir, 'pact-broker-sign');
  fs.writeFileSync(wrapper, '#!/bin/sh\nexport PACT_BROKER_KEY_FILE="' + keyFile + '"\nexec "' + process.execPath + '" "' + BROKER_SIGN + '" "$@"\n');
  fs.chmodSync(wrapper, 0o755);

  const registry = reg.createRegistry();
  reg.registerPersona(registry, { personaDid: 'did:key:zBroker', humanUid: 'human:h', publicKeyPem: pair.publicKeyPem });
  const signer = L.crossUidBrokerSigner({ brokerUser: 'pact-broker', wrapperPath: wrapper, sudoPath: stubSudo });

  const recordId = crypto.randomBytes(32).toString('hex');
  const sig = signer(recordId);
  assert.ok(sig, 'the launcher-wired signer must produce a signature');
  const { verifyRecordSig } = require('../../src/lib/edge-attestation');
  assert.ok(verifyRecordSig(recordId, sig, { publicKeyPem: pair.publicKeyPem }), 'the sig must verify as the broker persona');
});

// ============================== verifier: assessCustody (PURE — synthetic facts) ==============================

const SIGN_OK = { signed: true, personaMatches: true };
const STAT_DIFF = { ok: true, isFile: true, size: 120, ownerUid: 990 }; // key owned by a DIFFERENT uid
// F3 (#79): a clean wrapper is now a root-OWNED file + a root-owned, non-others-writable ancestor chain to /.
const CLEAN_CHAIN = [{ path: '/', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false }];
const WRAP_OK = { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false, ancestors: CLEAN_CHAIN };

test('assessCustody — the cross-uid TRUE branch (synthetic; unreachable same-uid)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, true, JSON.stringify(r.checks));
  assert.equal(r.requiresOutOfBandUidConfirmation, true, 'the verified path ALWAYS needs the out-of-band uid attestation');
});

test('assessCustody — same-OWNER mode-000 EACCES is MODE not uid separation -> FALSE (the F2 fix)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: { ok: true, isFile: true, size: 120, ownerUid: 501 }, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2-denied' && c.status === 'FAIL' && /MODE, not uid/i.test(c.detail)), 'must name MODE-not-uid');
});

test('assessCustody — host CAN read the key -> FALSE (R1 same-uid / over-permissive)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: true }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2-denied' && c.status === 'FAIL' && /can read/i.test(c.detail)));
});

test('assessCustody — a non-EACCES open error (ELOOP symlink) is NOT the denial leg -> FALSE (hacker F1)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: { ok: true, isFile: false, size: 0, ownerUid: 990 }, hostRead: { ok: false, errno: 'ELOOP' }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2-denied' && c.status === 'FAIL' && /establish the custody leg|symlink|FIFO/i.test(c.detail)));
});

test('assessCustody — C3 signerReturnedNull -> FALSE (sudo/wiring/exec failure diagnostic)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: { signed: false, personaMatches: false }, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C3-liveness' && c.status === 'FAIL' && /no signature|sudo|wiring/i.test(c.detail)));
});

test('assessCustody — C3 signedButWrongPersona -> FALSE (key<->registry mismatch diagnostic)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: { signed: true, personaMatches: false }, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C3-liveness' && c.status === 'FAIL' && /different persona|mismatch/i.test(c.detail)));
});

test('assessCustody — running as root -> FALSE (root bypasses file perms)', () => {
  const r = V.assessCustody({ isRoot: true, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 0, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C0-root' && c.status === 'FAIL'));
});

test('assessCustody — a group/world-writable wrapper -> FALSE (privesc: host runs code as the broker uid)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: true, ancestors: CLEAN_CHAIN } });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /writable|privesc|hijack/i.test(c.detail)));
});

// ------------------- F3 (#79): wrapper FILE owner + parent-dir/ancestor-chain attestation -------------------

const wrapFacts = (extra) => ({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, ...extra });

test('C2.5 F3 — a host-OWNED wrapper file (in a root-owned dir) -> FALSE (owner rewrites the sudo script; no rename needed)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 501, worldOrGroupWritable: false, ancestors: CLEAN_CHAIN } }));
  assert.equal(r.hostObservableChecksPassed, false, JSON.stringify(r.checks));
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /root-owned|chown/i.test(c.detail)));
});

test('C2.5 F3 — a THIRD-uid wrapper file (not the running uid) -> FALSE (root-owned-only allowlist, not a host-uid denylist)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 1234, worldOrGroupWritable: false, ancestors: CLEAN_CHAIN } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /root-owned|chown/i.test(c.detail)));
});

test('C2.5 F3 — a NON-ROOT ancestor dir -> FALSE (grandparent-rename privesc)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false,
    ancestors: [
      { path: '/opt/pact/bin', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false },
      { path: '/opt/pact', ok: true, isDir: true, ownerUid: 1234, worldOrGroupWritable: false },
      { path: '/opt', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false },
      { path: '/', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false },
    ] } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /ancestor|grandparent|not root-owned/i.test(c.detail)));
});

test('C2.5 F3 — a group/world-writable ancestor dir -> FALSE', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false,
    ancestors: [
      { path: '/opt/w', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: true },
      { path: '/', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false },
    ] } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /writable/i.test(c.detail)));
});

test('C2.5 F3 — a symlink/non-dir ancestor -> FALSE', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false,
    ancestors: [
      { path: '/opt/w', ok: true, isDir: false, ownerUid: 0, worldOrGroupWritable: false },
      { path: '/', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false },
    ] } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /not a directory|symlink/i.test(c.detail)));
});

test('C2.5 F3 — an unstattable ancestor -> FALSE (fail-closed)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false,
    ancestors: [
      { path: '/opt/w', ok: false, errno: 'EACCES' },
      { path: '/', ok: true, isDir: true, ownerUid: 0, worldOrGroupWritable: false },
    ] } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /not statable|cannot attest/i.test(c.detail)));
});

test('C2.5 F3 — a ROOT-owned symlink ancestor is OK (cannot be repointed); the chain still PASSes', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false,
    ancestors: [
      { path: '/var', ok: true, isDir: false, isSymlink: true, ownerUid: 0, worldOrGroupWritable: false },
      { path: '/', ok: true, isDir: true, isSymlink: false, ownerUid: 0, worldOrGroupWritable: false },
    ] } }));
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'PASS'), JSON.stringify(r.checks));
});

test('C2.5 F3 — a NON-root-owned symlink ancestor -> FALSE (the host repoints it; sudo re-resolves)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: true, isFile: true, ownerUid: 0, worldOrGroupWritable: false,
    ancestors: [
      { path: '/opt/link', ok: true, isDir: false, isSymlink: true, ownerUid: 501, worldOrGroupWritable: false },
      { path: '/', ok: true, isDir: true, isSymlink: false, ownerUid: 0, worldOrGroupWritable: false },
    ] } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /symlink|repoint/i.test(c.detail)));
});

test('C2.5 F3 — a non-absolute / ".."-bearing wrapperPath -> FALSE (pathInvalid)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: false, pathInvalid: true, reason: 'contains-..' } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /absolute|\.\./i.test(c.detail)));
});

test('C2.5 F3 — an ABSENT/unstattable wrapper (explicitly provided) -> FAIL, not a soft NOTE', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: { ok: false, errno: 'ENOENT', ancestors: CLEAN_CHAIN } }));
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /not statable|absent|unreachable/i.test(c.detail)));
});

test('C2.5 F3 — a clean wrapper (root file + root chain) -> PASS + a snapshot residual', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: WRAP_OK }));
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'PASS'), JSON.stringify(r.checks));
  assert.ok(r.residuals.some((s) => /snapshot|openat|swap|this instant/i.test(s)), 'a snapshot/TOCTOU residual must ride the wrapper PASS');
});

test('C2.6 F3 — a host-writable key dir is a NOTE, never flips the verdict (C3 backstops substitution)', () => {
  const r = V.assessCustody(wrapFacts({ wrapper: WRAP_OK, keyDir: { ok: true, isDir: true, ownerUid: 990, worldOrGroupWritable: true } }));
  assert.equal(r.hostObservableChecksPassed, true, 'the key-dir NOTE must not gate the verdict');
  assert.ok(r.checks.some((c) => c.id === 'C2.6-keydir' && c.status === 'NOTE' && /C3|substitut|writable/i.test(c.detail)));
});

test('assessCustody — an empty key file -> FALSE (vacuous: no key to protect)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: { ok: true, isFile: true, size: 0, ownerUid: 990 }, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C1-keypresent' && c.status === 'FAIL' && /empty|vacuous/i.test(c.detail)));
});

test('assessCustody — a LOCKED key dir (owner UNREADABLE) -> FALSE (VALIDATE hacker C1: cannot prove separation)', () => {
  // the CRITICAL fix: owner-unknown is NOT an auto-pass — a same-uid box with a 000 key-dir is
  // indistinguishable from a real cross-uid key from the host, so it must fail-closed (not report passed).
  const r = V.assessCustody({ isRoot: false, keyStat: { ok: false, errno: 'EACCES' }, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false, JSON.stringify(r.checks));
  assert.ok(r.checks.some((c) => c.id === 'C2-denied' && c.status === 'FAIL' && /OWNER is unreadable|0755|cannot distinguish/i.test(c.detail)));
});

test('assessCustody — a null runningUid (no getuid) -> FALSE (the disambiguator cannot run; CR/H2)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: null, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false);
  assert.ok(r.checks.some((c) => c.id === 'C0-root' && c.status === 'FAIL' && /uid model unavailable/i.test(c.detail)));
});

test('assessCustody — a null facts arg fails CLOSED, never crashes (default param fires only for undefined; ported from assessHeapRead)', () => {
  let r;
  assert.doesNotThrow(() => { r = V.assessCustody(null); }, 'null must not crash on the first property access');
  assert.equal(r.hostObservableChecksPassed, false, 'null facts -> every leg fails closed');
  assert.equal(r.requiresOutOfBandUidConfirmation, false, 'no denial leg can be taken from empty facts');
});

test('assessCustody — the report NEVER asserts custodyReal OR custodyMechanismVerified (NS-9 honesty)', () => {
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: 501, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.ok(!('custodyReal' in r), 'no custodyReal field');
  assert.ok(!('custodyMechanismVerified' in r), 'no custodyMechanismVerified field — the host cannot claim the mechanism VERIFIED, only that its checks passed');
  assert.ok('hostObservableChecksPassed' in r && 'requiresOutOfBandUidConfirmation' in r);
  // the bind-gap (C2 file-owner vs C3 signer) must be a LOUD residual on the passed path
  assert.ok(r.residuals.some((s) => /bind|out-of-band|SOLE determiner/i.test(s)), 'must carry the bind-gap residual');
});

// ============================== verifier: gatherCustodyFacts + verifyCrossUidCustody (real I/O, same-uid) ==============================

test('gatherCustodyFacts — a readable key: host CAN read (the honest same-uid result)', () => {
  const { keyFile } = freshKey(0o600);
  const facts = V.gatherCustodyFacts({ keyFile, signer: () => null, registry: reg.createRegistry(), personaDid: 'x' });
  assert.equal(facts.hostRead.ok, true, 'a 0600 key owned by us is readable by us');
});

test('gatherCustodyFacts — a mode-000 key yields EACCES + owner==runningUid (feeds the F2 fix) -> FALSE', () => {
  if (IS_ROOT) { console.log('       (skipped: running as root — mode bits do not deny the owner)'); return; }
  const { keyFile } = freshKey(0o000);
  const facts = V.gatherCustodyFacts({ keyFile, signer: () => null, registry: reg.createRegistry(), personaDid: 'x' });
  assert.equal(facts.hostRead.errno, 'EACCES', 'mode-000 same-owner -> EACCES (probed)');
  assert.equal(facts.keyStat.ownerUid, facts.runningUid, 'we own the key (same uid)');
  // synthesize a working sign onto the real facts: the verdict is still FALSE because owner==runningUid
  const r = V.assessCustody({ ...facts, sign: SIGN_OK, wrapper: WRAP_OK });
  assert.equal(r.hostObservableChecksPassed, false, 'same-owner EACCES is MODE not uid -> NOT real');
});

test('gatherCustodyFacts — a SYMLINK key path yields ELOOP on open (O_NOFOLLOW) -> custody-leg error', () => {
  const { dir, keyFile } = freshKey(0o600);
  const link = path.join(dir, 'link.key');
  fs.symlinkSync(keyFile, link);
  const facts = V.gatherCustodyFacts({ keyFile: link, signer: () => null, registry: reg.createRegistry(), personaDid: 'x' });
  assert.equal(facts.hostRead.errno, 'ELOOP', 'O_NOFOLLOW refuses a symlink at open');
});

test('gatherCustodyFacts — a group/world-writable wrapper is detected (real lstat)', () => {
  const { dir } = freshKey();
  const w = path.join(dir, 'wrapper'); fs.writeFileSync(w, '#!/bin/sh\n');
  fs.chmodSync(w, 0o662); // group-writable (0o020) + world-writable (0o002) — the 0o022 mask must catch it
  const facts = V.gatherCustodyFacts({ keyFile: path.join(dir, 'broker.key'), signer: () => null, registry: reg.createRegistry(), personaDid: 'x', wrapperPath: w });
  assert.equal(facts.wrapper.worldOrGroupWritable, true);
});

test('gatherCustodyFacts F3 — the wrapper file ownerUid + the ancestor chain to / are captured (real lstat)', () => {
  const { dir } = freshKey();
  const w = path.join(dir, 'wrapper'); fs.writeFileSync(w, '#!/bin/sh\n'); fs.chmodSync(w, 0o755);
  const facts = V.gatherCustodyFacts({ keyFile: path.join(dir, 'broker.key'), signer: () => null, registry: reg.createRegistry(), personaDid: 'x', wrapperPath: w });
  assert.equal(typeof facts.wrapper.ownerUid, 'number');
  assert.equal(facts.wrapper.ownerUid, facts.runningUid, 'a wrapper we created is owned by us');
  assert.ok(Array.isArray(facts.wrapper.ancestors) && facts.wrapper.ancestors.length >= 1, 'ancestors walked');
  assert.ok(facts.wrapper.ancestors.some((a) => a.path === path.parse(dir).root), 'the chain reaches the filesystem root');
  assert.equal(facts.wrapper.ancestors[0].ownerUid, facts.runningUid, 'the immediate parent (our temp dir) is owned by us, not root');
});

test('gatherCustodyFacts F3 — a SYMLINKED wrapperPath is realpath-resolved before the walk (no /var-style false positive)', () => {
  const { dir } = freshKey();
  const real = path.join(dir, 'wrapper'); fs.writeFileSync(real, '#!/bin/sh\n'); fs.chmodSync(real, 0o755);
  const link = path.join(dir, 'wrapper-link'); fs.symlinkSync(real, link);
  const facts = V.gatherCustodyFacts({ keyFile: path.join(dir, 'broker.key'), signer: () => null, registry: reg.createRegistry(), personaDid: 'x', wrapperPath: link });
  assert.equal(facts.wrapper.isFile, true, 'realpath resolves the symlink to the real regular file (isFile, not a symlink)');
  assert.ok(facts.wrapper.resolvedPath && facts.wrapper.resolvedPath.endsWith('wrapper'), 'resolvedPath is the realpath of the link target');
});

test('gatherCustodyFacts F3 — a non-absolute wrapperPath is refused (pathInvalid) without an fs op', () => {
  const facts = V.gatherCustodyFacts({ keyFile: '/x', signer: () => null, registry: reg.createRegistry(), personaDid: 'x', wrapperPath: 'relative/w' });
  assert.equal(facts.wrapper.ok, false);
  assert.equal(facts.wrapper.pathInvalid, true);
});

test('gatherCustodyFacts F3 — a ".."-bearing wrapperPath is refused (pathInvalid)', () => {
  const facts = V.gatherCustodyFacts({ keyFile: '/x', signer: () => null, registry: reg.createRegistry(), personaDid: 'x', wrapperPath: '/opt/../etc/w' });
  assert.equal(facts.wrapper.ok, false);
  assert.equal(facts.wrapper.pathInvalid, true);
});

test('gatherCustodyFacts F3 — the key dir fact is captured for the C2.6 NOTE', () => {
  const { keyFile } = freshKey(0o600);
  const facts = V.gatherCustodyFacts({ keyFile, signer: () => null, registry: reg.createRegistry(), personaDid: 'x' });
  assert.ok(facts.keyDir && typeof facts.keyDir.ownerUid === 'number', 'keyDir fact present with an owner');
  assert.equal(facts.keyDir.ownerUid, facts.runningUid, 'the temp key dir is owned by us');
});

test('gatherCustodyFacts F3 — a cross-directory symlink: the symlink\'s OWN dir is in the walked chain (VALIDATE HIGH regression)', () => {
  // DIR-A holds `wrapper` -> DIR-B/real-wrapper. sudo re-resolves the RAW path at exec, so DIR-A (where the
  // host could repoint the link) MUST appear in the ancestors — not ONLY the resolved target DIR-B's chain.
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-cvA-')); _dirs.push(a);
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-cvB-')); _dirs.push(b);
  const real = path.join(b, 'real-wrapper'); fs.writeFileSync(real, '#!/bin/sh\n'); fs.chmodSync(real, 0o755);
  const link = path.join(a, 'wrapper'); fs.symlinkSync(real, link);
  const facts = V.gatherCustodyFacts({ keyFile: path.join(a, 'broker.key'), signer: () => null, registry: reg.createRegistry(), personaDid: 'x', wrapperPath: link });
  const paths = facts.wrapper.ancestors.map((x) => x.path);
  assert.ok(paths.includes(a), 'the symlink\'s OWN dir (DIR-A) must be in the raw chain, not only the resolved target chain: ' + JSON.stringify(paths));
  assert.ok(paths.some((p) => p === b || p === fs.realpathSync(b)), 'the resolved target dir (DIR-B) is also walked');
});

test('verifyCrossUidCustody F3 — INTEGRATED real pipe: a real wrapper in a non-root temp dir FAILs (host-owned file rung)', () => {
  if (IS_ROOT) { console.log('       (skipped: running as root — temp files/dirs would be root-owned)'); return; }
  const { dir, keyFile, pair } = freshKey(0o600);
  const w = path.join(dir, 'pact-broker-sign'); fs.writeFileSync(w, '#!/bin/sh\n'); fs.chmodSync(w, 0o755);
  const registry = reg.createRegistry();
  reg.registerPersona(registry, { personaDid: 'did:key:zBroker', humanUid: 'human:h', publicKeyPem: pair.publicKeyPem });
  const r = V.verifyCrossUidCustody({ keyFile, signer: () => 'x', registry, personaDid: 'did:key:zBroker', wrapperPath: w });
  assert.equal(r.hostObservableChecksPassed, false, 'a same-uid-owned wrapper must FAIL through the real gather->assess pipe');
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /root-owned|chown/i.test(c.detail)));
});

test('F3 INTEGRATED seam — REAL gathered ancestors drive the assess chain to a FAIL (gather.ancestors -> assess)', () => {
  if (IS_ROOT) { console.log('       (skipped: running as root — the temp-dir ancestors would be root-owned)'); return; }
  const { dir } = freshKey();
  const w = path.join(dir, 'wrapper'); fs.writeFileSync(w, '#!/bin/sh\n'); fs.chmodSync(w, 0o755);
  const facts = V.gatherCustodyFacts({ keyFile: path.join(dir, 'broker.key'), signer: () => 'x', registry: reg.createRegistry(), personaDid: 'x', wrapperPath: w });
  // the real wrapper file is us-owned (would fail the file rung first); override ONLY the file owner to root so
  // the verdict reaches the REAL gathered ancestor chain — whose non-root temp-dir parent must drive the FAIL.
  const r = V.assessCustody({ isRoot: false, keyStat: STAT_DIFF, hostRead: { ok: false, errno: 'EACCES' }, runningUid: facts.runningUid, sign: SIGN_OK,
    wrapper: { ...facts.wrapper, ownerUid: 0 } });
  assert.equal(r.hostObservableChecksPassed, false, 'the real gathered ancestors (non-root temp dir) must drive a FAIL through assess');
  assert.ok(r.checks.some((c) => c.id === 'C2.5-wrapper' && c.status === 'FAIL' && /ancestor|not root-owned/i.test(c.detail)), JSON.stringify(r.checks.filter((c) => c.id === 'C2.5-wrapper')));
});

test('verifyCrossUidCustody — full pipe with a REAL broker signer, same-uid: reports NOT real (host can read)', () => {
  const { keyFile, pair } = freshKey(0o600);
  const registry = reg.createRegistry();
  reg.registerPersona(registry, { personaDid: 'did:key:zBroker', humanUid: 'human:h', publicKeyPem: pair.publicKeyPem });
  const signer = brokerSigner({ command: process.execPath, args: [BROKER_SIGN], keyFile });
  const r = V.verifyCrossUidCustody({ keyFile, signer, registry, personaDid: 'did:key:zBroker' });
  // C3 signs (the broker can read the 0600 key) BUT C2 fails (host can read it too) -> NOT real, honestly.
  assert.equal(r.hostObservableChecksPassed, false, 'same-uid: the host can read the key -> custody NOT real');
  assert.ok(r.checks.some((c) => c.id === 'C3-liveness' && c.status === 'PASS'), 'but the broker DID sign (C3 proves the mechanism is live)');
  assert.ok(!('custodyReal' in r));
});

test('gatherCustodyFacts — C3 liveness PASSES against a REQUIRE-FRAME broker (deployed verifier keeps working, plans/11 §1.8)', () => {
  const { keyFile, pair } = freshKey(0o600);
  const registry = reg.createRegistry();
  reg.registerPersona(registry, { personaDid: 'did:key:zBroker', humanUid: 'human:h', publicKeyPem: pair.publicKeyPem });
  // the broker child runs in require-frame mode (persona in its allowlisted env). A bare-hex probe would be
  // REFUSED; C3 presents a P-frame body (§1.8), so the deployed verifier still passes once require-frame is on.
  const signer = brokerSigner({ command: process.execPath, args: [BROKER_SIGN], keyFile, env: { PACT_BROKER_PERSONA_DID: 'did:key:zBroker' } });
  const facts = V.gatherCustodyFacts({ keyFile, signer, registry, personaDid: 'did:key:zBroker' });
  assert.equal(facts.sign.signed, true, 'C3 presents a P-frame -> the require-frame broker signs it');
  assert.equal(facts.sign.personaMatches, true, 'the sig verifies under the broker persona key');
});

test('crossUidSudoArgs REJECTS a NUL / control-char in the wrapperPath (fail at validation, not spawn)', () => {
  assert.throws(() => L.crossUidSudoArgs({ brokerUser: 'b', wrapperPath: '/usr/local/bin/w\x00-x' }), /NUL or control/);
  assert.throws(() => L.crossUidSudoArgs({ brokerUser: 'b', wrapperPath: '/usr/local/bin/w\n-x' }), /NUL or control/);
});

test('LIVE same-uid 000-dir: gatherCustodyFacts owner-unknown -> verifyCrossUidCustody FALSE (the C1 fix, real I/O)', () => {
  if (IS_ROOT) { console.log('       (skipped: running as root — dir mode bits do not deny the owner)'); return; }
  // create the key FIRST, then chmod the DIR to 000 — a 000 dir denies even its owner traversal, so lstat(key)
  // -> EACCES (owner unknown). This is the EXACT same-uid shape the VALIDATE hacker drove to a false-pass.
  const { dir, keyFile, pair } = freshKey(0o600);
  fs.chmodSync(dir, 0o000);
  try {
    const registry = reg.createRegistry();
    reg.registerPersona(registry, { personaDid: 'did:key:zBroker', humanUid: 'human:h', publicKeyPem: pair.publicKeyPem });
    const r = V.verifyCrossUidCustody({ keyFile, signer: () => 'x', registry, personaDid: 'did:key:zBroker', wrapperPath: undefined });
    assert.equal(r.hostObservableChecksPassed, false, 'a same-uid locked dir must NOT report passed (owner unprovable)');
  } finally { fs.chmodSync(dir, 0o700); } // restore so the exit-drain can rm it
});

test('CLI arg guard: a value-flag followed by another flag exits 2 (does not swallow the next flag; CR F1)', () => {
  const { spawnSync } = require('child_process');
  const CLI = path.resolve(__dirname, '../../src/identity/custody-verify.js');
  const r = spawnSync(process.execPath, [CLI, '--key', '--persona', 'did:key:z'], { encoding: 'utf8' });
  assert.equal(r.status, 2, 'a transposed/missing value must exit 2, not run with "--persona" as the key path');
  assert.match(r.stderr, /--key requires a value/);
});

test('registry loader: a duplicate personaDid with a CONFLICTING binding exits 2 with a DISTINCT immutability-violation message (plans/31 W0, code-reviewer HIGH)', () => {
  const { spawnSync } = require('child_process');
  const CLI = path.resolve(__dirname, '../../src/identity/custody-verify.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-dupreg-')); _dirs.push(dir);
  const registryFile = path.join(dir, 'personas.json');
  // two rows for the SAME DID with DIFFERENT keys (a stale/merged/hand-edited duplicate)
  fs.writeFileSync(registryFile, JSON.stringify([
    { personaDid: 'did:key:zDup', humanUid: 'human:a', publicKeyPem: 'KEY-ONE' },
    { personaDid: 'did:key:zDup', humanUid: 'human:a', publicKeyPem: 'KEY-TWO' },
  ]));
  const r = spawnSync(process.execPath, [CLI, '--key', '/x', '--persona', 'did:key:zDup', '--broker-user', 'b', '--wrapper', '/w', '--registry', registryFile], { encoding: 'utf8' });
  assert.equal(r.status, 2, 'a conflicting-duplicate registry exits 2 (config error)');
  assert.match(r.stderr, /registry-immutability-violation/, 'the message is DISTINCT from the malformed-JSON class');
  assert.doesNotMatch(r.stderr, /malformed JSON/, 'not conflated with the parse-failure message');
});

console.log(`\n[custody-verify] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
