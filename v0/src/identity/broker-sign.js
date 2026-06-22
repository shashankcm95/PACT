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
// HONEST SCOPE (plans/05 §0 — a custody MECHANISM, world-anchorABLE; NOT custody-real here):
//   * Custody is REAL only when this process runs under a SEPARATE uid / enclave / HSM — a DEPLOYMENT
//     property, verified OUT-OF-BAND. SAME-UID this is the env-pointed file-key read P-minter removed,
//     moved one process over: the host uid can still read the key file (a test demonstrates this) and —
//     by same-uid physics — ptrace this process / read /proc/<pid>/mem (open regardless; NOT separately exercised).
//   * The broker provides NON-EXFILTRATION (HSM-shaped), NOT access-control: it signs ANY 64-hex it is
//     handed (R2 oracle-abuse), so any permitted caller can forge as this persona. Caller-auth
//     (SO_PEERCRED / capability tokens) is the orthogonal NEXT frontier, not built here.

'use strict';

const fs = require('fs');
const { isHex64, signRecordId } = require('../lib/edge-attestation');

// stderr ONLY (never the key / never err.stack); empty stdout; non-zero exit.
function fail(msg) {
  process.stderr.write('broker-sign: ' + msg + '\n');
  process.exit(1);
}

function main() {
  // (1) the broker's OWN input gate — defense-in-depth: the CLI is directly invokable, so the client's
  // hex64 gate is NOT the broker's defense. A leading-'-' / uppercase / wrong-length id is refused here.
  const recordId = process.argv[2];
  if (!isHex64(recordId)) fail('record_id must be 64-hex lowercase');

  // (2) vet the key path SWAP-RESISTANTLY (VALIDATE: a lstat->read pair lost a live TOCTOU race — a
  // same-uid attacker swapped the path to a symlink between the check and the read). Open with O_NOFOLLOW
  // (refuses a symlink AT open, atomically) then fstat the RESOLVED fd (the inode, immune to a path swap)
  // and read THAT fd — no second path resolution. A private key must be tightly-permissioned: a regular
  // file, not group/world-writable. (Dir-level write is a deeper residual — out of scope; see plans/05 §8.)
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
    if (st.mode & 0o022) { try { fs.closeSync(fd); } catch { /* */ } return fail('key file must not be group- or world-writable'); }
  } catch { try { fs.closeSync(fd); } catch { /* */ } return fail('key file unstattable'); }
  try { pem = fs.readFileSync(fd, 'utf8'); } finally { try { fs.closeSync(fd); } catch { /* */ } }

  // (3) load + sign via the SAME fail-soft crypto leaf the host uses (alg-pinned ed25519, output re-gated).
  const sig = signRecordId(recordId, { privateKeyPem: pem });
  if (!sig) fail('sign failed (no / non-ed25519 key, or bad output)');

  process.stdout.write(sig + '\n'); // ONLY the sig — nothing else
}

main();
