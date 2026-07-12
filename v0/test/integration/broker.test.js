#!/usr/bin/env node
'use strict';

// PACT P-broker — out-of-band signing-broker tests (plans/05 §5 + §8 VERIFY-board folds).
//
// HONEST SCOPE (plans/05 §0): these prove the custody MECHANISM (the key lives in a SEPARATE process;
// the host signs through it; the seam is unchanged), NOT custody-real. Every test runs SAME-UID — which
// can demonstrate the mechanism (key absent from the host heap; sig from a separate process) but CANNOT
// demonstrate SEPARATION (the host uid still reaches the broker). Custody is real only cross-uid /
// enclave / HSM — a DEPLOYMENT property, verified out-of-band. The residual tests below assert R1
// (same-uid key-readable) and R2 (oracle-abuse) are OPEN, openly — a guard that can't be shown to fail
// is theater.

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { createMinter } = require('../../src/identity/minter');
const { buildFrame, receiveFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { makePremise } = require('../../src/atms/claim');
const { crossVerify } = require('../../src/grounding/cross-verify');
const { creatorStanding } = require('../../src/grounding/creator-standing');
const { direct } = require('../../src/trust/direct');
const { verifyRecordSig } = require('../../src/lib/edge-attestation');
const { brokerSigner, assertBrokerPersona } = require('../../src/identity/broker-client');

const BROKER = path.join(__dirname, '..', '..', 'src', 'identity', 'broker-sign.js');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// drain tmpdirs even on an assertion throw (don't leak /tmp on failure — cleanup() is best-effort per test)
const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

const SCOPE = { constraints: {}, edge_confidence: 1 };
let seq = 0;
const RID = crypto.createHash('sha256').update('a-probe-record-id').digest('hex'); // a valid 64-hex id

function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-broker-'));
  _allDirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {};
  function add(did) {
    const kp = newPersonaKeypair();
    const human = 'human:' + did;
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    const keyFile = path.join(STATE, did.replace(/[^\w]/g, '_') + '.key');
    fs.writeFileSync(keyFile, kp.privateKeyPem);
    fs.chmodSync(keyFile, 0o600); // deterministic perms (don't depend on the ambient umask — CI may be 0000)
    personas[did] = { kp, human, keyFile };
    return did;
  }
  const ME = add('did:key:zME');
  const meCtx = { registry, storeOpts: { receiverId: ME, stateDir: STATE } };
  const store = { receiverId: ME, stateDir: STATE };
  return { STATE, registry, personas, meCtx, ME, add, store,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } } };
}
const brokerFor = (keyFile, extra) => brokerSigner({ command: process.execPath, args: [BROKER], keyFile, ...(extra || {}) });

// ====================== input gate ======================

test('brokerSigner returns null on a non-hex64 id (never spawns the broker)', () => {
  const sign = brokerFor('/nonexistent');
  for (const bad of ['', '-', 'xyz', 'A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64), 123, null]) {
    assert.equal(sign(bad), null, 'rejects ' + JSON.stringify(bad));
  }
});

// ====================== the custody MECHANISM: sign through a separate process ======================

test('end-to-end: a sig from the REAL broker child verifies under the persona registered key', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  const a = w.personas['did:key:zAlice'];
  const sig = brokerFor(a.keyFile)(RID);
  assert.ok(sig, 'the broker produced a sig');
  assert.ok(verifyRecordSig(RID, sig, { publicKeyPem: a.kp.publicKeyPem }), 'verifies under Alice key');
  assert.equal(verifyRecordSig(RID, sig, { publicKeyPem: w.personas['did:key:zME'].kp.publicKeyPem }), false, 'does NOT verify under a different key');
  w.cleanup();
});

test('integrated: broker-signed records flow through the real P2/P3 read path', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  const human = w.personas['did:key:zHuman'];
  const conf = w.personas['did:key:zConfirmer'];
  const humanMinter = createMinter({ signer: brokerFor(human.keyFile), personaDid: 'did:key:zHuman', humanUid: human.human });
  const confMinter = createMinter({ signer: brokerFor(conf.keyFile), personaDid: 'did:key:zConfirmer', humanUid: conf.human });
  const put = (r) => { assert.ok(r.ok, r.reason); assert.ok(appendRecord(r.frame, w.store).ok); };

  put(confMinter.mint({ type: 'CLAIM', seq: seq++, nonce: 'c1', payload: { claim: { content: 'earns' } } }));
  const statement = 'a broker-minted premise';
  put(humanMinter.mint({ type: 'PREMISE', seq: seq++, nonce: 'p1', payload: { statement, scope: SCOPE, creator: human.human } }));
  const premId = makePremise({ statement, scope: SCOPE, creator: human.human }).id;
  put(confMinter.mint({ type: 'CONFIRM', seq: seq++, nonce: 'cf1', payload: { target_premise_id: premId } }));

  assert.ok(crossVerify(premId, w.meCtx).strength > 0, 'a broker-minted premise+confirm scores via the real read path');
  assert.equal(creatorStanding(human.human, w.meCtx).n_premises, 1, 'the human accrues their broker-minted premise');
  assert.ok(direct(w.meCtx, 'did:key:zConfirmer', undefined).r > 0, 'a broker-minted CLAIM reads as DIRECT evidence');
  w.cleanup();
});

// ====================== seam UNCHANGED (mechanical: zero blast radius) ======================

test('zero blast radius: buildFrame/minter/resolveSigner are byte-unchanged (git-checkable)', () => {
  // mechanical check, NOT a threat-test (honesty MINOR): the broker plugs into the existing sync seam.
  const seamFiles = ['frame/frame.js', 'identity/minter.js', 'lib/edge-attestation.js'];
  for (const f of seamFiles) {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', f), 'utf8');
    // actual COUPLING (a require / call of the broker module), NOT a prose mention — the seam headers
    // legitimately say "a separate-uid broker / enclave / HSM client" to document the opts.signer seam.
    assert.ok(!/require\([^)]*broker|brokerSigner|assertBrokerPersona|broker-client|broker-sign/.test(src),
      f + ' has no broker coupling (the broker drops into the existing opts.signer seam)');
  }
});

// ====================== broker-side input gate (hacker MED-1: the CLI is directly invokable) ======================

test('broker-sign.js has its OWN hex64 gate (direct invocation, bypassing the client)', () => {
  const w = freshWorld();
  const key = w.personas['did:key:zME'].keyFile;
  for (const bad of ['-', '--', 'A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64), 'xyz', '../etc']) {
    const r = spawnSync(process.execPath, [BROKER, bad], { env: { PACT_BROKER_KEY_FILE: key }, encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'broker exits non-zero on ' + JSON.stringify(bad));
    assert.equal((r.stdout || '').trim(), '', 'no stdout on ' + JSON.stringify(bad));
  }
  // and the broker with NO arg at all
  const none = spawnSync(process.execPath, [BROKER], { env: { PACT_BROKER_KEY_FILE: key }, encoding: 'utf8' });
  assert.notEqual(none.status, 0);
  w.cleanup();
});

// ====================== HIGH-1: env-allowlist defeats NODE_OPTIONS into the key-holding child ======================

test('PROVES the env-allowlist defeats NODE_OPTIONS injection into the broker child', () => {
  const w = freshWorld();
  const key = w.personas['did:key:zME'].keyFile;
  const preload = path.join(w.STATE, 'evil-preload.js');
  const touched = path.join(w.STATE, 'TOUCHED');
  fs.writeFileSync(preload, 'require("fs").writeFileSync(' + JSON.stringify(touched) + ', "x");');
  const prev = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--require ' + preload; // a host-env attacker
  try {
    const sig = brokerFor(key)(RID);
    assert.ok(sig, 'the happy path still works with a scrubbed (allowlisted) child env');
    assert.ok(!fs.existsSync(touched), 'NODE_OPTIONS was NOT inherited into the key-holding broker child');
  } finally {
    if (prev === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = prev;
  }
  w.cleanup();
});

// ====================== HIGH-2: key-file vet (symlink / world-writable / absent / non-ed25519) ======================

test('broker refuses a symlinked / world-or-group-readable / world-or-group-writable / absent / non-ed25519 key file', () => {
  const w = freshWorld();
  const a = w.personas['did:key:zME'];
  // absent
  assert.equal(brokerFor(path.join(w.STATE, 'nope.key'))(RID), null, 'absent key -> null');
  // symlink
  const link = path.join(w.STATE, 'key.link'); fs.symlinkSync(a.keyFile, link);
  assert.equal(brokerFor(link)(RID), null, 'symlinked key file refused (swap defense)');
  // world-writable
  const ww = path.join(w.STATE, 'ww.key'); fs.writeFileSync(ww, fs.readFileSync(a.keyFile)); fs.chmodSync(ww, 0o666);
  assert.equal(brokerFor(ww)(RID), null, 'world-writable key file refused');
  // group-writable
  const gw = path.join(w.STATE, 'gw.key'); fs.writeFileSync(gw, fs.readFileSync(a.keyFile)); fs.chmodSync(gw, 0o620);
  assert.equal(brokerFor(gw)(RID), null, 'group-writable key file refused');
  // group/world-READABLE refused (OWNER-ONLY vet, `& 0o077`): a private signing key readable by ANY other uid is a
  // custody-bypass — that uid reads the key bytes + signs directly, no broker/sudo (Loom->PACT, CodeRabbit Major).
  const wr = path.join(w.STATE, 'wr.key'); fs.writeFileSync(wr, fs.readFileSync(a.keyFile)); fs.chmodSync(wr, 0o644);
  assert.equal(brokerFor(wr)(RID), null, 'world-readable (0644) key file refused');
  const gr = path.join(w.STATE, 'gr.key'); fs.writeFileSync(gr, fs.readFileSync(a.keyFile)); fs.chmodSync(gr, 0o640);
  assert.equal(brokerFor(gr)(RID), null, 'group-readable (0640) key file refused');
  // non-ed25519 (alg-pinning survives the process boundary)
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const rsaPath = path.join(w.STATE, 'rsa.key'); fs.writeFileSync(rsaPath, rsa.privateKey);
  assert.equal(brokerFor(rsaPath)(RID), null, 'non-ed25519 key refused');
  // a directory (non-regular) -> refused at the isFile check BEFORE any read (a dir fd reads EISDIR; we
  // reject first). Closes the previously-untested isFile guard + evidences check-before-read (VERIFY F5).
  assert.equal(brokerFor(w.STATE)(RID), null, 'a directory key path is refused (non-regular, check-before-read)');
  // a FIFO -> O_NONBLOCK opens it immediately (no hang waiting for a writer) -> isFile() rejects it. Invoke
  // the broker DIRECTLY with a short timeout: a non-zero exit with NO kill-signal proves it rejected, didn't
  // hang (without O_NONBLOCK the open would block until the client timeout killed it). (VALIDATE hacker LOW)
  const fifo = path.join(w.STATE, 'key.fifo');
  const mk = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  if (mk.status === 0) {
    const r = spawnSync(process.execPath, [BROKER, RID], { env: { PACT_BROKER_KEY_FILE: fifo }, timeout: 4000, encoding: 'utf8' });
    assert.notEqual(r.status, 0, 'a FIFO key path is refused (exit non-zero)');
    assert.equal(r.signal, null, 'and it did NOT hang (no timeout kill-signal) — O_NONBLOCK + isFile reject');
  }
  // the legit OWNER-ONLY 0600 key still passes (the vet is non-vacuous — a legit key works). NOTE: a.keyFile is
  // created at 0600 (freshWorld add(): chmodSync 0o600) — the prior "0644" label was stale/wrong.
  assert.ok(brokerFor(a.keyFile)(RID), 'a normal owner-only 0600 key file is accepted');
  w.cleanup();
});

// ====================== MED-2: key never leaks (dedicated stderr-capturing spawn) ======================

test('the broker emits ONLY the sig — no key/PEM/DER fragment on stdout OR stderr', () => {
  const w = freshWorld();
  const a = w.personas['did:key:zME'];
  const keyBody = a.kp.privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '').slice(0, 40);
  // happy path: stdout is just the 88-char b64 sig; stderr carries ONLY the benign caller-auth DISABLED notice
  // (allowlist unset, plans/10 R2) — assert it leaks NO key, not that it is empty.
  const ok = spawnSync(process.execPath, [BROKER, RID], { env: { PACT_BROKER_KEY_FILE: a.keyFile }, encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(ok.stdout.trim().length, 88, 'stdout is exactly the base64 sig');
  assert.ok(!/PRIVATE KEY|BEGIN |MC4C|MII/.test(ok.stderr), 'happy path: no PEM/DER fragment on stderr');
  assert.match(ok.stderr, /caller-auth DISABLED/, 'the only stderr content is the unset-allowlist R2 notice');
  assert.ok(!ok.stdout.includes(keyBody) && !ok.stderr.includes(keyBody), 'no key body in output');
  // malformed-key error path: non-zero, empty stdout, NO PEM/DER/key fragment on stderr (no err.stack)
  const bad = path.join(w.STATE, 'bad.key'); fs.writeFileSync(bad, 'definitely not a pem');
  const er = spawnSync(process.execPath, [BROKER, RID], { env: { PACT_BROKER_KEY_FILE: bad }, encoding: 'utf8' });
  assert.notEqual(er.status, 0);
  assert.equal(er.stdout, '', 'no stdout on the error path');
  assert.ok(!/PRIVATE KEY|BEGIN |MC4C|MII/.test(er.stderr), 'no PEM/DER fragment on stderr');
  w.cleanup();
});

// ====================== client DoS bounds ======================

test('client bounds: over-maxBytes output and a hanging broker both fail closed (null)', () => {
  const w = freshWorld();
  const a = w.personas['did:key:zME'];
  // an 88-char sig overflows a 4-byte maxBuffer -> execFileSync throws -> null
  assert.equal(brokerFor(a.keyFile, { maxBytes: 4 })(RID), null, 'over-maxBytes -> null');
  // a hanging broker stub exceeds the timeout -> null
  const hang = brokerSigner({ command: process.execPath, args: ['-e', 'setTimeout(function(){}, 100000)'], timeoutMs: 200 });
  assert.equal(hang(RID), null, 'timeout -> null');
  w.cleanup();
});

test('client config guards: timeoutMs/maxBytes <= 0 fall back to defaults; opts.env refuses reserved vars', () => {
  const w = freshWorld();
  const a = w.personas['did:key:zME'];
  // timeoutMs:0 must NOT mean "no timeout" (the execFileSync footgun) — falls back to the default and signs
  assert.ok(brokerFor(a.keyFile, { timeoutMs: 0 })(RID), 'timeoutMs:0 falls back to default (not no-timeout)');
  assert.ok(brokerFor(a.keyFile, { maxBytes: 0 })(RID), 'maxBytes:0 falls back to default (not a 0-byte buffer)');
  // opts.env may NOT set a CODE-EXECUTION / code-LOAD var (env -> arbitrary code in the #!/bin/sh wrapper or the
  // node child) or shadow the dedicated key-path channel. The set covers the reachable/enumerated env->RCE vectors
  // (#85/F10): BASH_ENV/ENV (shell source), PATH/SHELLOPTS/BASHOPTS/PS4 (shell RCE), NODE_PATH/NODE_REPL_ (node
  // code-load), OPENSSL_ (engine/provider .dylib), BASH_FUNC_ (bash func-import), NODE_V8_COVERAGE (write-as-uid).
  const codeExec = ['NODE_OPTIONS', 'NODE_REPL_EXTERNAL_MODULE', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES',
    'PACT_BROKER_KEY_FILE', 'BASH_ENV', 'ENV', 'PATH', 'NODE_PATH', 'SHELLOPTS', 'BASHOPTS', 'PS4',
    // VALIDATE folds: OPENSSL_CONF (node loads an engine/provider .dylib = RCE), BASH_FUNC_* (bash func-import RCE),
    // NODE_V8_COVERAGE/NODE_COMPILE_CACHE (write-as-broker-uid)
    'OPENSSL_CONF', 'OPENSSL_MODULES', 'BASH_FUNC_x%%', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE',
    // synthetic PREFIX cases (CodeRabbit): prove the prefix families match an arbitrary suffix, not just the known
    // exact names -- an exact-only regression on any of these would otherwise slip through.
    'NODE_OPTIONS_SYNTH', 'NODE_REPL_SYNTH', 'OPENSSL_SYNTH', 'LD_SYNTH', 'DYLD_SYNTH', 'PACT_BROKER_KEY_FILE_SYNTH'];
  for (const bad of codeExec) {
    assert.throws(() => brokerSigner({ command: process.execPath, args: [BROKER], keyFile: a.keyFile, env: { [bad]: 'x' } }), /may not set a reserved broker-child environment variable/, bad + ' refused in opts.env');
  }
  // POSITIVE CONTROL (#100 channel split, plans/53): config/ARMING vars now flow through opts.config (accepted
  // there, REJECTED in the extras channel — config cannot be injected via extras); genuinely-benign vars stay on
  // opts.env. NODE_ENV is benign (must NOT be over-blocked by a NODE_ prefix).
  for (const cfg of ['PACT_ROOT_KEY_FILE', 'PACT_ROOT_CONTROLLER', 'PACT_BROKER_PERSONA_DID']) {
    assert.doesNotThrow(() => brokerSigner({ command: process.execPath, args: [BROKER], keyFile: a.keyFile, config: { [cfg]: 'x' } }), cfg + ' is a legal config var via opts.config');
    assert.throws(() => brokerSigner({ command: process.execPath, args: [BROKER], keyFile: a.keyFile, env: { [cfg]: 'x' } }), /use opts\.config/, cfg + ' is REJECTED in opts.env — no config injection via extras (#100)');
  }
  for (const benign of ['NODE_ENV', 'ENVIRONMENT']) {
    assert.doesNotThrow(() => brokerSigner({ command: process.execPath, args: [BROKER], keyFile: a.keyFile, env: { [benign]: 'x' } }), benign + ' is a benign extra (opts.env)');
  }
  assert.ok(brokerSigner({ command: process.execPath, args: [BROKER], keyFile: a.keyFile, env: { SOME_BENIGN: '1' } })(RID), 'a benign extra env var is allowed AND signs');
  w.cleanup();
});

test('#100 real-child: an INHERITED-prototype config var on opts.env NEVER reaches the broker child', () => {
  // A config var on opts.env's PROTOTYPE (not an own key) does NOT trip the dunder reject (Object.keys is own-only,
  // so nothing is iterated/copied) -> the signer builds. This is the end-to-end proof that the Object.create(null)
  // target + own-only copy hold: the REAL spawned child must NOT inherit PACT_BROKER_REQUIRE_FRAME (else it enters
  // require-frame mode and REFUSES a bare-hex id). Closes VERIFY fold 1(c) against the BUILT code (VALIDATE).
  const w = freshWorld();
  const me = w.personas[w.ME];
  const pollutedEnv = Object.create({ PACT_BROKER_REQUIRE_FRAME: '1', PACT_BROKER_PERSONA_DID: w.ME });
  assert.equal(Object.keys(pollutedEnv).length, 0, 'the config vars are inherited, not own keys (so no dunder throw)');
  const signer = brokerSigner({ command: process.execPath, args: [BROKER], keyFile: me.keyFile, env: pollutedEnv });
  // a valid sig over a BARE hex proves the child is in LEGACY mode -> the inherited PACT_BROKER_REQUIRE_FRAME never
  // reached it (had it leaked, require-frame mode would REFUSE the bare hex -> null).
  assert.ok(signer(RID), 'the child signed a bare-hex id -> legacy mode -> the inherited config var did NOT reach it');
  w.cleanup();
});

// ====================== architect #1: persona<->key binding (fail-closed + opt-in smoke check) ======================

test('mis-wired broker FAILS CLOSED (Alice key minting as Bob is rejected, not forged)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zBob');
  const alice = w.personas['did:key:zAlice']; const bob = w.personas['did:key:zBob'];
  // a minter bound to Bob but wired to a broker holding ALICE's key
  const miswired = createMinter({ signer: brokerFor(alice.keyFile), personaDid: 'did:key:zBob', humanUid: bob.human });
  const r = miswired.mint({ type: 'CLAIM', seq: seq++, nonce: 'mw', payload: {} });
  assert.ok(r.ok, 'the frame assembles (the broker signed it)');
  assert.equal(receiveFrame(r.frame, { registry: w.registry }).ok, false, 'but receiveFrame REJECTS it — fail-closed, no silent cross-persona forgery');
  w.cleanup();
});

test('assertBrokerPersona catches a mis-wire LOUDLY at wire-time (opt-in)', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zBob');
  const alice = w.personas['did:key:zAlice'];
  const sign = brokerFor(alice.keyFile);
  assert.ok(assertBrokerPersona(sign, { registry: w.registry, personaDid: 'did:key:zAlice' }), 'correctly-wired broker passes');
  assert.throws(() => assertBrokerPersona(sign, { registry: w.registry, personaDid: 'did:key:zBob' }), /does NOT sign as/, 'mis-wire caught loudly');
  assert.throws(() => assertBrokerPersona('not-a-fn', { registry: w.registry, personaDid: 'did:key:zAlice' }), /must be a function/);
  w.cleanup();
});

test('assertBrokerPersona random probe defeats a probe-special-casing decoy signer', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  const alice = w.personas['did:key:zAlice'];
  const aliceSign = brokerFor(alice.keyFile);
  const wrong = newPersonaKeypair();
  // a decoy that signs with Alice's key ONLY for the OLD fixed probe 'f'*64, and a WRONG key otherwise.
  // A fixed probe would false-PASS; the random per-call probe cannot be special-cased -> caught.
  const decoy = (rid) => (rid === 'f'.repeat(64)
    ? aliceSign(rid)
    : crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(wrong.privateKeyPem)).toString('base64'));
  assert.throws(() => assertBrokerPersona(decoy, { registry: w.registry, personaDid: 'did:key:zAlice' }), /does NOT sign as/, 'a fixed-probe decoy is caught by the random probe');
  w.cleanup();
});

// ====================== HONEST RESIDUALS (non-vacuous: the attack SUCCEEDS) ======================

test('PROVES R2 oracle-abuse is OPEN: anyone with broker access forges a record AS the persona', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  const alice = w.personas['did:key:zAlice'];
  // an "attacker" who only has access to Alice's broker (NOT her minter) forges a CLAIM as Alice:
  const forged = buildFrame(
    { srcPersonaDid: 'did:key:zAlice', parentHumanUid: alice.human, seq: seq++, nonce: 'forge', payload: { claim: { content: 'attacker-authored, signed as Alice' } } },
    { signer: brokerFor(alice.keyFile) },
  );
  assert.ok(forged.ok, forged.reason);
  assert.ok(receiveFrame(forged.frame, { registry: w.registry }).ok, 'the forged frame is ACCEPTED as Alice — the broker is a sign-anything oracle (R2, needs caller-auth next wave)');
  w.cleanup();
});

test('PROVES R1 (file leg): same-uid the host reads the broker key FILE directly', () => {
  // NON-VACUOUS for the file-read leg: the host reads the very key the broker loads via PACT_BROKER_KEY_FILE.
  // The header's ptrace / /proc/<pid>/mem leg is same-uid physics, NOT separately exercised — the test name
  // is narrowed to exactly what the body proves (honesty VALIDATE F1).
  const w = freshWorld();
  w.add('did:key:zAlice');
  const body = fs.readFileSync(w.personas['did:key:zAlice'].keyFile, 'utf8');
  assert.match(body, /PRIVATE KEY/, 'same-uid the host reads the very key the broker "holds" (custody-real needs cross-uid)');
  w.cleanup();
});

// ====================== grep-gate: the client holds no key material ======================

test('broker-client.js references NO raw key material (the broker holds the key, not the client)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'identity', 'broker-client.js'), 'utf8');
  assert.ok(!/privateKeyPem\s*:|\.privateKeyPem/.test(src), 'broker-client.js is key-free (broker-sign.js is the sole key-loader, allowlisted in minter.test.js)');
});

// ====================== R2-WHAT: per-request auth (require-frame mode, plans/11) ======================

const { computeRecordId } = require('../../src/lib/record');

// spawn broker-sign directly with a presented frame body on stdin (the require-frame channel). `input`
// always provided so stdin is a CLOSED pipe (an unprovided stdin would inherit + block on the read deadline).
function runFrame({ keyFile, persona, recordId, body, requireFrame }) {
  const env = { PACT_BROKER_KEY_FILE: keyFile };
  if (persona !== undefined) env.PACT_BROKER_PERSONA_DID = persona;
  if (requireFrame !== undefined) env.PACT_BROKER_REQUIRE_FRAME = requireFrame;
  return spawnSync(process.execPath, [BROKER, recordId], { env, input: body === undefined ? '' : body, encoding: 'utf8' });
}
// the preimage body buildFrame would hash: src/parent/seq/nonce/payload (+ idempotency_key is added by
// buildFrame, but for these direct-spawn gate tests a minimal body that round-trips is enough).
const frameBody = (persona, extra) => ({ ver: 'pact/0', type: 'CLAIM', src_persona_did: persona, parent_human_uid: 'human:' + persona, seq: 0, nonce: 'n1', payload: { claim: { content: 'hi' } }, ...extra });

test('R2-WHAT: require-frame (persona set) + valid P-frame + matching id -> signs the COMPUTED id, verifies', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const b = frameBody(w.ME);
  const rid = computeRecordId(b);
  const r = runFrame({ keyFile: me.keyFile, persona: w.ME, recordId: rid, body: JSON.stringify(b) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifyRecordSig(rid, r.stdout.trim(), { publicKeyPem: me.kp.publicKeyPem }), 'sig over the computed id verifies');
  w.cleanup();
});
test('R2-WHAT: foreign-persona body -> REFUSE (persona-bind), empty stdout, fixed no-echo message', () => {
  const w = freshWorld(); w.add('did:key:zAttacker');
  const me = w.personas[w.ME];
  const b = frameBody('did:key:zAttacker'); // declares a DIFFERENT persona than the broker's
  const r = runFrame({ keyFile: me.keyFile, persona: w.ME, recordId: computeRecordId(b), body: JSON.stringify(b) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '', 'no sig on a refuse');
  assert.match(r.stderr, /request not authorized/);
  assert.doesNotMatch(r.stderr, /zAttacker|zME/, 'reject echoes neither persona');
  w.cleanup();
});
test('R2-WHAT: body hashing to a DIFFERENT id than argv -> REFUSE (sign nothing the caller asserts)', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const b = frameBody(w.ME);
  const r = runFrame({ keyFile: me.keyFile, persona: w.ME, recordId: 'b'.repeat(64), body: JSON.stringify(b) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
  w.cleanup();
});
test('R2-WHAT: no body presented (empty stdin) in require-frame -> REFUSE', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const r = runFrame({ keyFile: me.keyFile, persona: w.ME, recordId: 'a'.repeat(64), body: '' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
  w.cleanup();
});
test('R2-WHAT: REQUIRE_FRAME=1 but PACT_BROKER_PERSONA_DID UNSET -> REFUSE (both-null bypass closed, fail closed)', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const b = frameBody(w.ME);
  // explicit require-frame on, but no broker persona configured -> persona-bind cannot run -> deny
  const r = runFrame({ keyFile: me.keyFile, persona: undefined, requireFrame: '1', recordId: computeRecordId(b), body: JSON.stringify(b) });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
  w.cleanup();
});
test('R2-WHAT: a JSON ARRAY body -> REFUSE (non-plain-object; computeRecordId([..]) is a valid 64-hex)', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const r = runFrame({ keyFile: me.keyFile, persona: w.ME, recordId: computeRecordId([1, 2, 3]), body: '[1,2,3]' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout.trim(), '');
  w.cleanup();
});
test('R2-WHAT: legacy mode (no persona, no flag) STILL signs the argv hex + LOUD R2-WHAT DISABLED notice', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const rid = RID;
  // legacy: brokerFor presents no body; the broker must behave exactly as pre-R2-WHAT (sign the argv id).
  const sig = brokerFor(me.keyFile)(rid);
  assert.ok(sig && verifyRecordSig(rid, sig, { publicKeyPem: me.kp.publicKeyPem }), 'legacy still signs the argv id');
  // and the loud-when-off notice is observable on a direct spawn
  const r = spawnSync(process.execPath, [BROKER, rid], { env: { PACT_BROKER_KEY_FILE: me.keyFile }, encoding: 'utf8' });
  assert.match(r.stderr, /per-request-auth DISABLED \(require-frame off\)/);
  w.cleanup();
});

// ====================== P5-W1: single-arming-source + misconfig observability (plans/28) ======================

test('P5-W1 single-arming-source: broker-sign.js reads each arm env var EXACTLY once (mechanical shape-tripwire, NOT the enforcement -- the live legs below are the behavioral proof)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'identity', 'broker-sign.js'), 'utf8');
  // anchored to the full process.env.<NAME> token so prose mentions of the bare var name don't inflate
  // the count (the header comments name these vars without the prefix). An alias/destructure read would
  // evade this grep -- it is a cheap author-mistake tripwire; the live spawn legs are the real proof.
  for (const v of ['PACT_BROKER_PERSONA_DID', 'PACT_BROKER_REQUIRE_FRAME', 'PACT_BROKER_REQUIRE_CALLER']) {
    const n = (src.match(new RegExp('process\\.env\\.' + v, 'g')) || []).length;
    assert.equal(n, 1, v + ' must be read from process.env exactly once (found ' + n + ')');
  }
});

test('P5-W1: REQUIRE_FRAME="ture" (operator typo) + persona set -> decision UNCHANGED (default-ON still signs a valid frame) + the misconfig alert on stderr (non-vacuous on the REAL path)', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const b = frameBody(w.ME);
  const rid = computeRecordId(b);
  const r = runFrame({ keyFile: me.keyFile, persona: w.ME, requireFrame: 'ture', recordId: rid, body: JSON.stringify(b) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(verifyRecordSig(rid, r.stdout.trim(), { publicKeyPem: me.kp.publicKeyPem }), 'still signs: the typo falls to the persona-presence default (ON); the decision path is unchanged');
  assert.match(r.stderr, /\[PACT-REFUSE-ALERT\] \{.*"class":"misconfig".*"reason":"arm-flag-misconfig"/, 'the misconfig alert is observable operator-side');
  assert.doesNotMatch(r.stderr, /ture/, 'the raw token is never echoed');
  w.cleanup();
});

test('P5-W1: legacy box (no persona, no flag) emits NO [PACT-REFUSE-ALERT] line (the alert delta is CONFINED to a present-but-invalid flag)', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const r = spawnSync(process.execPath, [BROKER, RID], { env: { PACT_BROKER_KEY_FILE: me.keyFile }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /PACT-REFUSE-ALERT/, 'no alert on the legacy path (unset flag is legal, not a misconfig)');
  w.cleanup();
});

test('R2-WHAT FULL SEAM: buildFrame -> brokerSigner presents the body -> receiveFrame ACCEPTS', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  // the broker child runs in require-frame mode (persona in its allowlisted env); buildFrame threads the body.
  const signer = brokerSigner({ command: process.execPath, args: [BROKER], keyFile: me.keyFile, config: { PACT_BROKER_PERSONA_DID: w.ME } });
  const built = buildFrame({ srcPersonaDid: w.ME, parentHumanUid: me.human, type: 'CLAIM', seq: 0, nonce: 'seam1', payload: { claim: { content: 'real' } } }, { signer });
  assert.ok(built.ok, 'buildFrame succeeds through the require-frame broker: ' + built.reason);
  assert.ok(receiveFrame(built.frame, { registry: w.registry }).ok, 'the frame the broker signed is accepted end-to-end');
  w.cleanup();
});
test('R2-WHAT FULL SEAM: a payload-less frame round-trips (A1 undefined-key normalization)', () => {
  const w = freshWorld();
  const me = w.personas[w.ME];
  const signer = brokerSigner({ command: process.execPath, args: [BROKER], keyFile: me.keyFile, config: { PACT_BROKER_PERSONA_DID: w.ME } });
  // NO payload field -> withKey would carry payload:undefined pre-normalization; the broker recompute must match.
  const built = buildFrame({ srcPersonaDid: w.ME, parentHumanUid: me.human, type: 'CLAIM', seq: 1, nonce: 'noPayload' }, { signer });
  assert.ok(built.ok, 'payload-less frame signs through the broker (undefined-key normalized): ' + built.reason);
  assert.ok(receiveFrame(built.frame, { registry: w.registry }).ok, 'payload-less frame accepted end-to-end');
  w.cleanup();
});

console.log(`\n[broker] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
