// PACT P-broker — identity/broker-core.js  (plans/42 W1a — extracted from broker-sign.js)
//
// The SHARED per-process signing-broker CORE: the ONE legitimate per-process key-LOADER in src/ (allowlisted
// in the minter.test.js grep forward-guard). Extracted VERBATIM from broker-sign.js so a second broker
// entrypoint (sigma-root-broker.js, plans/42 W1b) can reuse the swap-resistant key vet + bounded stdin drain
// + caller-auth wiring + fixed-no-echo fail + empty-stdout contract WITHOUT a copy-paste that would diverge
// (a CodeRabbit Major once caught a read-vs-write mask bug in THIS exact vet — a forked copy is a divergence
// hazard; architect F1). Custody isolation is UNCHANGED: it lives at the PROCESS / uid / env boundary
// (separate executables, separate key-file envs, separate root-owned wrappers / uids). A shared LIBRARY does
// NOT co-locate the keys — only a shared PROCESS would; each entrypoint runs as its own process.
//
// runBroker is generic over the frame-specific dimensions, injected by the thin entrypoint:
//   * keyFileEnv     -- the env var naming the private key file (PACT_BROKER_KEY_FILE / PACT_ROOT_KEY_FILE).
//   * allowlistEnv   -- the env var naming the R2-WHO caller allowlist (per-broker; NEVER shared).
//   * requireMode    -- the RESOLVED require-<mode> boolean (the entrypoint reads its own arm env + resolves).
//   * authorize      -- the WHAT-gate ({requireMode, claimedRecordId, presentedBodyRaw}) -> {decision, recordIdToSign}.
//   * disabledNotice -- the LOUD-when-off residual notices ({who, what}) written verbatim to stderr.
//   * progName       -- the fixed stderr prefix (never key bytes / never err.stack).
// The two ARM-relevant env reads (REQUIRE_* + the policy DID/controller) DELIBERATELY stay in each thin
// entrypoint (read-once, threaded) -- the P5-W1 single-arming-source discipline (plans/28) AND the
// broker.test.js P5-W1 grep tripwire both require the arm reads to live in the entrypoint source.

'use strict';

const fs = require('fs');
const { isHex64, signRecordId } = require('../lib/edge-attestation');
const { authorizeCaller } = require('./caller-auth');
const { MAX_FRAME_BYTES } = require('./request-auth');

// Bounded + DEADLINED stdin read (R2-WHAT frame channel). A byte cap bounds VOLUME; the deadline bounds TIME
// (a directly-invoked broker on a never-EOF slow-loris pipe would otherwise hang forever -- fs.readFileSync(0)
// is unbounded on both axes and is FORBIDDEN). Only called in require mode (legacy never touches stdin).
const READ_DEADLINE_MS = 2000;
function readStdinBounded({ maxBytes, deadlineMs }) {
  return new Promise((resolve) => {
    const inp = process.stdin;
    const chunks = []; let len = 0; let settled = false;
    const finish = (val) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      inp.removeListener('data', onData); inp.removeListener('end', onEnd); inp.removeListener('error', onErr);
      try { inp.pause(); } catch { /* */ }
      resolve(val);
    };
    const onData = (c) => { len += c.length; if (len > maxBytes) { chunks.length = 0; return finish({ ok: false, reason: 'too-large' }); } chunks.push(c); };
    const onEnd = () => finish({ ok: true, data: Buffer.concat(chunks).toString('utf8') });
    const onErr = () => finish({ ok: false, reason: 'read-error' });
    const timer = setTimeout(() => finish({ ok: false, reason: 'read-timeout' }), deadlineMs);
    inp.on('data', onData); inp.on('end', onEnd); inp.on('error', onErr);
    try { inp.resume(); } catch { finish({ ok: false, reason: 'read-error' }); }
  });
}

// stderr ONLY (never the key / never err.stack); empty stdout; non-zero exit. progName-prefixed so each
// entrypoint keeps its own fixed message shape.
function makeFail(progName) {
  return function fail(msg) {
    process.stderr.write(progName + ': ' + msg + '\n');
    process.exit(1);
  };
}

/**
 * The shared broker main: drain (require mode) -> caller-auth (WHO) -> per-request-auth (WHAT) -> input gate
 * -> swap-resistant key vet -> sign -> emit ONLY the sig. Behavior-identical to the pre-extraction
 * broker-sign.js main() when invoked with the frame params (the W1a behavioral-equivalence gate).
 * @param {{progName:string, keyFileEnv:string, allowlistEnv:string, requireMode:boolean,
 *          requireCaller?:boolean|null, authorize:function, disabledNotice:{who:string, what:string},
 *          distinctFromKeyFileEnv?:string}} opts
 *   requireCaller (optional, F2/#78) -- the RESOLVED WHO-gate tri-state threaded from the entrypoint (frame:
 *   true/false/null; sigma-root: undefined -> legacy). Governs the unset-allowlist default in authorizeCaller.
 *   distinctFromKeyFileEnv (optional) -- the name of ANOTHER broker's key-file env this broker's key MUST
 *   NOT alias. The sigma-root broker (plans/42 W1b) passes 'PACT_BROKER_KEY_FILE': if K_root and K_broker
 *   resolve to the SAME inode, a single key signs both sigma-root bindings AND frame record_ids, and (since
 *   computeRecordId is field-agnostic) a binding sig verifies as a frame sig -- a cross-protocol signing
 *   oracle for the trust root (VERIFY hacker HIGH-1, proven live). Absent/unset -> the check is skipped
 *   (the frame broker passes nothing -> W1a behavior is byte-unchanged). Custody isolation is otherwise a
 *   process/uid/env property; this guard closes only the same-FILE mis-deploy.
 */
async function runBroker({ progName, keyFileEnv, allowlistEnv, requireMode, requireCaller, authorize, disabledNotice, distinctFromKeyFileEnv }) {
  const fail = makeFail(progName);

  // In require mode the caller presents the PREIMAGE body on stdin. DRAIN it FIRST -- before any gate that
  // can process.exit -- so the host's execFileSync `input:` write always completes (else the host EPIPEs on
  // an early refuse). Legacy mode NEVER reads stdin (preserves the pre-R2-WHAT behavior exactly).
  let presentedBodyRaw = null;
  if (requireMode) {
    const rd = await readStdinBounded({ maxBytes: MAX_FRAME_BYTES, deadlineMs: READ_DEADLINE_MS });
    if (!rd.ok) fail('frame channel: ' + rd.reason); // too-large / timeout / read-error -> refuse, fail closed
    presentedBodyRaw = rd.data;
  }

  // (0) caller-auth gate (R2-WHO, plans/10) -- WHO may request a signature, keyed on SUDO_UID (sudo-injected
  // REAL uid; LIVE-PROBED: sudo overwrites a host-forged value under env_reset,!setenv). SUDO_USER is
  // root-spoofable (man sudoers) -- NEVER authorize on SUDO_USER. The allowlist is set BROKER-SIDE in the
  // root-owned wrapper. Reject is a FIXED no-echo message (an echo is an allowlist-probing oracle).
  // requireCaller (F2/#78) is the RESOLVED tri-state from the entrypoint (frame: true/false/null; sigma-root:
  // undefined -> legacy). Threaded so an unconfigured allowlist on a DEPLOYED frame broker fails CLOSED.
  const auth = authorizeCaller({ sudoUid: process.env.SUDO_UID, allowlistRaw: process.env[allowlistEnv], requireCaller });
  if (auth.decision === 'deny') fail('caller not authorized');
  if (auth.decision === 'disabled') {
    // opt-in OFF: an explicit, named R2-WHO-stays-open residual (NOT an accidental fall-through). LOUD (NS-9).
    process.stderr.write(disabledNotice.who);
  }

  // (0.5) per-request-auth gate (R2-WHAT, plans/11) -- WHAT may be signed. require mode binds the signature
  // to a RECOMPUTABLE preimage: it signs the COMPUTED content-address of the presented body (never the
  // caller-asserted argv id; an embedded record_id/sig is stripped). Reject is a FIXED no-echo message. Runs
  // BEFORE the key open (an unauthorized request never touches the key/TOCTOU surface).
  const req = authorize({ requireMode, claimedRecordId: process.argv[2], presentedBodyRaw });
  if (req.decision === 'deny') fail('request not authorized');
  if (req.decision === 'disabled') {
    // require mode OFF: the named R2-WHAT-stays-open residual. LOUD (NS-9) so a blind-oracle deployment is observable.
    process.stderr.write(disabledNotice.what);
  }

  // (1) the broker's OWN input gate -- defense-in-depth: the CLI is directly invokable, so the client's
  // hex64 gate is NOT the broker's defense. recordIdToSign is the COMPUTED id (require mode) or the argv id
  // (legacy); either way it must be a 64-hex lowercase content-address. A bad id is refused here.
  const recordId = req.recordIdToSign;
  if (!isHex64(recordId)) fail('record_id must be 64-hex lowercase');

  // (2) vet the key path SWAP-RESISTANTLY (VALIDATE: a lstat->read pair lost a live TOCTOU race — a
  // same-uid attacker swapped the path to a symlink between the check and the read). Open with O_NOFOLLOW
  // (refuses a symlink AT open, atomically) then fstat the RESOLVED fd (the inode, immune to a path swap)
  // and read THAT fd — no second path resolution. A private key must be tightly-permissioned: a regular file,
  // OWNER-ONLY (no group/world access; e.g. 0600/0400 — NOT exact-0600: any owner-only mode passes) — a
  // group/world-READABLE key is a custody-bypass (any uid that can READ it signs directly, no broker/sudo), so
  // the vet rejects ANY group/world bit (`& 0o077`), not just writable. The runbook
  // installs the key at 0600 (docs/deployment/cross-uid-broker.md). (Dir-level write is a deeper residual — out of
  // scope; see plans/05 §8.) [Loom->PACT cross-improvement: a CodeRabbit Major caught the read-vs-write mask gap.]
  const keyFile = process.env[keyFileEnv];
  if (typeof keyFile !== 'string' || keyFile.length === 0) fail(keyFileEnv + ' is required');
  let fd;
  // O_NONBLOCK so a FIFO/device key-path does NOT block at open waiting for a writer (POSIX) — it opens
  // immediately and the fstat().isFile() check below rejects it BEFORE any read (a no-op for a regular file).
  try { fd = fs.openSync(keyFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); }
  catch (e) { return fail(e && e.code === 'ELOOP' ? 'key file must not be a symlink' : 'key file not found / unreadable'); }
  // close-before-fail (VERIFY): fail() calls process.exit, which SKIPS a finally — so the interior reject
  // paths close the fd explicitly. CHECK-before-READ preserved (never read a FIFO/device/writable file's
  // content first). A minimal try/finally wraps ONLY the read so a readFileSync throw also closes the fd.
  let pem;
  try {
    const st = fs.fstatSync(fd);                                  // the OPEN fd's inode — swap-immune
    if (!st.isFile()) { try { fs.closeSync(fd); } catch { /* */ } return fail('key file must be a regular file'); }
    if (st.mode & 0o077) { try { fs.closeSync(fd); } catch { /* */ } return fail('key file must be owner-only -- not group/world accessible (e.g. 0600)'); }
    // (2a) same-inode refusal (HIGH-1): this broker's key MUST be a DISTINCT physical key from the OTHER
    // broker's (distinctFromKeyFileEnv). Compared against the ALREADY-OPEN fd's swap-immune (dev, ino) --
    // fs.statSync FOLLOWS symlinks so an aliasing symlink to the same key is also caught. An UNSET other-env
    // skips the check (the operator did not opt in). A statSync error is ASYMMETRIC: ENOENT -> the other key
    // is genuinely ABSENT (nothing to collide with) -> skip; ANY OTHER error (EACCES on a parent-dir traversal,
    // ELOOP, ENOTDIR) means we CANNOT prove distinctness -> fail CLOSED, never silently leave the
    // cross-protocol oracle open (a fail-open inside a fail-closed guard is a contract violation; CodeRabbit).
    if (distinctFromKeyFileEnv) {
      const otherPath = process.env[distinctFromKeyFileEnv];
      if (typeof otherPath === 'string' && otherPath.length > 0) {
        let otherStat = null;
        try { otherStat = fs.statSync(otherPath); }
        catch (e) {
          if (!e || e.code !== 'ENOENT') { try { fs.closeSync(fd); } catch { /* */ } return fail(distinctFromKeyFileEnv + ' unstattable -- cannot prove key separation from ' + keyFileEnv); }
          otherStat = null; // ENOENT: the other key is absent -> nothing to collide with -> skip
        }
        if (otherStat && otherStat.dev === st.dev && otherStat.ino === st.ino) {
          try { fs.closeSync(fd); } catch { /* */ }
          return fail(keyFileEnv + ' must be a DISTINCT key from ' + distinctFromKeyFileEnv + ' (same inode -- a cross-protocol signing oracle for the trust root)');
        }
      }
    }
  } catch { try { fs.closeSync(fd); } catch { /* */ } return fail('key file unstattable'); }
  try { pem = fs.readFileSync(fd, 'utf8'); } finally { try { fs.closeSync(fd); } catch { /* */ } }

  // (3) load + sign via the SAME fail-soft crypto leaf the host uses (alg-pinned ed25519, output re-gated).
  const sig = signRecordId(recordId, { privateKeyPem: pem });
  if (!sig) fail('sign failed (no / non-ed25519 key, or bad output)');

  process.stdout.write(sig + '\n'); // ONLY the sig — nothing else
}

module.exports = { runBroker, makeFail, readStdinBounded };
