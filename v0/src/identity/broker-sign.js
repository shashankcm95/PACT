#!/usr/bin/env node
// PACT P-broker — identity/broker-sign.js  (plans/05 §1)
//
// The custody-holding CLI: the ONE legitimate per-process key-LOADER in src/ (allowlisted in the
// minter.test.js grep forward-guard — that guard is a non-adversarial author-mistake catch, NOT custody
// enforcement; the real custody guarantee is the process boundary + cross-uid deployment + review).
// It reads its OWN private key from PACT_BROKER_KEY_FILE, validates argv is a 64-hex record_id, signs it
// via the crypto leaf, and prints ONLY the base64 signature to stdout. Errors -> stderr (a fixed message,
// NEVER key bytes, NEVER err.stack) + non-zero exit + EMPTY stdout. It NEVER prints the key.
//
// HONEST SCOPE (plans/05 §0 + plans/11 §0 — a custody MECHANISM, world-anchorABLE; NOT custody-real here):
//   * Custody is REAL only when this process runs under a SEPARATE uid / enclave / HSM — a DEPLOYMENT
//     property, verified OUT-OF-BAND. SAME-UID this is the env-pointed file-key read P-minter removed,
//     moved one process over: the host uid can still read the key file (a test demonstrates this) and —
//     by same-uid physics — ptrace this process / read /proc/<pid>/mem (open regardless; NOT separately exercised).
//   * Access-control narrows WHO + WHAT, in two opt-in gates (both SHADOW; neither closes R2):
//       - WHO (R2-WHO, gate (0)): a COARSE uid gate (PACT_BROKER_ALLOWED_UIDS) keyed on SUDO_UID, the
//         sudo-native caller signal (NOT SO_PEERCRED: a sudo-command, not a socket). See plans/10.
//       - WHAT (R2-WHAT, gate (0.5), plans/11): require-frame mode binds the signature to a RECOMPUTABLE
//         frame -- it signs the COMPUTED content-address of a presented P-frame body, never an arbitrary
//         64-hex. This NARROWS WHAT-can-be-signed; it does NOT close R2.
//   * Residuals carried LOUD (NS-9 -- do NOT report as closed): the entitled operator can still make P
//     assert ANY payload (single-operator payload authority / payload-semantics ceiling); PACT_BROKER_PERSONA_DID
//     is a policy declaration, NOT cryptographically bound to the held key broker-side (integrity != provenance,
//     NS-2). The broker's core guarantee remains NON-EXFILTRATION (HSM-shaped).

'use strict';

const fs = require('fs');
const { isHex64, signRecordId } = require('../lib/edge-attestation');
const { authorizeCaller } = require('./caller-auth');
const { authorizeRequest, resolveRequireFrame, MAX_FRAME_BYTES } = require('./request-auth');

// Bounded + DEADLINED stdin read (R2-WHAT frame channel). A byte cap bounds VOLUME; the deadline bounds TIME
// (a directly-invoked broker on a never-EOF slow-loris pipe would otherwise hang forever -- fs.readFileSync(0)
// is unbounded on both axes and is FORBIDDEN). Only called in require-frame mode (legacy never touches stdin).
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

// stderr ONLY (never the key / never err.stack); empty stdout; non-zero exit.
function fail(msg) {
  process.stderr.write('broker-sign: ' + msg + '\n');
  process.exit(1);
}

async function main() {
  // R2-WHAT require-frame mode (plans/11). DEFAULT-ON gated on PACT_BROKER_PERSONA_DID presence: on a box
  // that opted into R2-WHAT (persona-did set), a DROPPED PACT_BROKER_REQUIRE_FRAME env fails CLOSED (ON),
  // never silently reopens the blind oracle. Strict '1'/'0' flag parse (resolveRequireFrame; never !!env).
  const requireFrame = resolveRequireFrame({
    requireFrameRaw: process.env.PACT_BROKER_REQUIRE_FRAME,
    brokerPersonaDid: process.env.PACT_BROKER_PERSONA_DID,
  });

  // In require-frame mode the caller presents the frame PREIMAGE body on stdin. DRAIN it FIRST -- before any
  // gate that can process.exit -- so the host's execFileSync `input:` write always completes (else the host
  // EPIPEs on an early refuse). Legacy mode NEVER reads stdin (preserves the pre-R2-WHAT behavior exactly).
  let presentedBodyRaw = null;
  if (requireFrame) {
    const rd = await readStdinBounded({ maxBytes: MAX_FRAME_BYTES, deadlineMs: READ_DEADLINE_MS });
    if (!rd.ok) fail('frame channel: ' + rd.reason); // too-large / timeout / read-error -> refuse, fail closed
    presentedBodyRaw = rd.data;
  }

  // (0) caller-auth gate (R2-WHO, plans/10) -- WHO may request a signature, keyed on SUDO_UID (sudo-injected
  // REAL uid; LIVE-PROBED: sudo overwrites a host-forged value under env_reset,!setenv). SUDO_USER is
  // root-spoofable (man sudoers) -- NEVER authorize on SUDO_USER. The allowlist is set BROKER-SIDE in the
  // root-owned wrapper. Reject is a FIXED no-echo message (an echo is an allowlist-probing oracle).
  const auth = authorizeCaller({ sudoUid: process.env.SUDO_UID, allowlistRaw: process.env.PACT_BROKER_ALLOWED_UIDS });
  if (auth.decision === 'deny') fail('caller not authorized');
  if (auth.decision === 'disabled') {
    // opt-in OFF: an explicit, named R2-WHO-stays-open residual (NOT an accidental fall-through). LOUD (NS-9).
    process.stderr.write('broker-sign: caller-auth DISABLED (PACT_BROKER_ALLOWED_UIDS unset) -- R2-WHO open\n');
  }

  // (0.5) per-request-auth gate (R2-WHAT, plans/11) -- WHAT may be signed. require-frame mode binds the
  // signature to a RECOMPUTABLE frame: it signs the COMPUTED content-address of the presented P-frame body
  // (never the caller-asserted argv id; an embedded record_id/sig is stripped). Reject is a FIXED no-echo
  // message. Runs BEFORE the key open (an unauthorized request never touches the key/TOCTOU surface).
  const req = authorizeRequest({
    requireFrame,
    claimedRecordId: process.argv[2],
    presentedBodyRaw,
    brokerPersonaDid: process.env.PACT_BROKER_PERSONA_DID,
  });
  if (req.decision === 'deny') fail('request not authorized');
  if (req.decision === 'disabled') {
    // require-frame OFF: the named R2-WHAT-stays-open residual. LOUD (NS-9) so a blind-oracle deployment is observable.
    process.stderr.write('broker-sign: per-request-auth DISABLED (require-frame off) -- R2-WHAT open\n');
  }

  // (1) the broker's OWN input gate -- defense-in-depth: the CLI is directly invokable, so the client's
  // hex64 gate is NOT the broker's defense. recordIdToSign is the COMPUTED id (require-frame) or the argv id
  // (legacy); either way it must be a 64-hex lowercase content-address. A bad id is refused here.
  const recordId = req.recordIdToSign;
  if (!isHex64(recordId)) fail('record_id must be 64-hex lowercase');

  // (2) vet the key path SWAP-RESISTANTLY (VALIDATE: a lstat->read pair lost a live TOCTOU race — a
  // same-uid attacker swapped the path to a symlink between the check and the read). Open with O_NOFOLLOW
  // (refuses a symlink AT open, atomically) then fstat the RESOLVED fd (the inode, immune to a path swap)
  // and read THAT fd — no second path resolution. A private key must be tightly-permissioned: a regular file,
  // OWNER-ONLY (mode 0600) — group/world-READABLE is a custody-bypass (any uid that can READ the key signs
  // directly, no broker/sudo), so the vet rejects ANY group/world bit (`& 0o077`), not just writable. The runbook
  // installs the key at 0600 (docs/deployment/cross-uid-broker.md). (Dir-level write is a deeper residual — out of
  // scope; see plans/05 §8.) [Loom->PACT cross-improvement: a CodeRabbit Major caught the read-vs-write mask gap.]
  const keyFile = process.env.PACT_BROKER_KEY_FILE;
  if (typeof keyFile !== 'string' || keyFile.length === 0) fail('PACT_BROKER_KEY_FILE is required');
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
    if (st.mode & 0o077) { try { fs.closeSync(fd); } catch { /* */ } return fail('key file must be owner-only (mode 0600) -- not group/world accessible'); }
  } catch { try { fs.closeSync(fd); } catch { /* */ } return fail('key file unstattable'); }
  try { pem = fs.readFileSync(fd, 'utf8'); } finally { try { fs.closeSync(fd); } catch { /* */ } }

  // (3) load + sign via the SAME fail-soft crypto leaf the host uses (alg-pinned ed25519, output re-gated).
  const sig = signRecordId(recordId, { privateKeyPem: pem });
  if (!sig) fail('sign failed (no / non-ed25519 key, or bad output)');

  process.stdout.write(sig + '\n'); // ONLY the sig — nothing else
}

// async main (the require-frame stdin drain is async). Any unexpected throw fails CLOSED (a fixed message,
// NEVER key bytes / err.stack), preserving the empty-stdout + non-zero-exit contract.
main().catch(() => fail('internal error'));
