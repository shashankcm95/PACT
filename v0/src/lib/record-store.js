// PACT v0 — record-store.js
//
// SURGICALLY DERIVED from kernel record-store.js (see TRANSFER-PROVENANCE.md): the
// content-addressed, verify-on-read, path-safe append-only store + INV-22 dedup.
//
// ADAPTED for the PACT inter-node boundary:
//   * KEYING is PER-RECEIVER (spec §7 — per-receiver logs, no global canonical log, INV-10),
//     replacing the kernel's single-node runId scoping.
//   * the per-receiver dir key is HASHED to a guaranteed-safe 16-hex segment
//     (sha256(receiverId).slice(0,16)). Traversal is impossible BY CONSTRUCTION — a '../' or
//     NUL receiverId cannot escape `stateDir` — and did:key / did:web / base64 pubkeys are all
//     handled uniformly. (Refinement over the plan's reject-on-hostile-runId: PACT NEUTRALIZES
//     the input rather than rejecting it, because a legit did:web carries '/'. The
//     isSafePathSegment PRE-join guard is kept as a defense-in-depth assertion — it never fails
//     for a 16-hex segment, but documents the invariant. See VERIFY board cluster 3.)
//   * the primary key / filename is the record_id content-address (record.js), not a kernel txid.
//
// Security posture preserved from the kernel original:
//   S1  filename derived from a record_id is hex-gated BEFORE any path.join.
//   S1b receiver key hashed → no traversal; checkWithinRoot anchored to `base` as defense-in-depth.
//   S2  validateRecord on EVERY load; an invalid record is skipped (fail-soft).
//   S5  content-address verified on WRITE and on READ (record_id === computeRecordId(body)); a
//       filename<->field check ALONE is bypassable (#273) — the body must hash to the id.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { writeAtomicString } = require('./atomic-write');
const { deepFreeze } = require('./deep-freeze');
const { computeRecordId, validateRecord, deriveIdempotencyKey, HEX64 } = require('./record');
const { checkWithinRoot, isSafePathSegment } = require('./path-canonicalize');
const { refuseAlert } = require('./refuse-alert');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.claude', 'pact-v0-store');
const DIR_MODE = 0o700;
const RECORD_FILE_RE = /^record-[a-f0-9]{64}\.json$/;

// A DoS-prevention read cap (NOT a policy bound): reject a hostile oversize file BEFORE readSync can OOM
// the reader. "The store is not a sandbox" — a same-uid write foothold can plant a multi-GB file at a
// valid record-<64hex>.json name, and listByReceiver / readByIdempotencyKey scan the whole dir. PACT
// already bounds a SIGNED frame to MAX_FRAME_BYTES (256 KB, identity/request-auth.js) at the sign
// boundary; the on-disk record is that frame plus a few content-address fields, pretty-printed
// (JSON.stringify(record, null, 2)). 1 MB is generous headroom that never false-rejects a legit record
// yet refuses a multi-GB plant. Defined LOCAL (not imported from request-auth) so lib/ never depends UP
// into identity/ — the NS-11 acyclic DAG (lib -> atms -> trust -> grounding) stays intact.
const MAX_RECORD_FILE_BYTES = 1024 * 1024;

/**
 * The per-receiver directory segment: sha256(receiverId).slice(0,16). Always a safe 16-hex
 * token, so traversal is impossible by construction. Returns null for a non-string/empty id.
 * isSafePathSegment is a defense-in-depth assertion (never fails for 16-hex).
 */
function receiverSegment(receiverId) {
  if (typeof receiverId !== 'string' || receiverId.length === 0) return null;
  const seg = crypto.createHash('sha256').update(receiverId).digest('hex').slice(0, 16);
  return isSafePathSegment(seg) ? seg : null;
}

/**
 * The on-disk dir for a receiver's records: `<base>/<seg>/records/`. null if receiverId invalid.
 */
function recordStoreDir({ receiverId, stateDir } = {}) {
  const base = stateDir || DEFAULT_STATE_DIR;
  const seg = receiverSegment(receiverId);
  if (!seg) return null;
  return path.join(base, seg, 'records');
}

function recordFilePath(recordId, opts) {
  const dir = recordStoreDir(opts);
  if (!dir) return null;
  return path.join(dir, 'record-' + recordId + '.json');
}

/**
 * Append a record to a receiver's store (one file per record_id).
 * Order is LOAD-BEARING: (1) validate; (2) content-address integrity (S5); (2b) idempotency-key
 * integrity; (3) defense-in-depth scope; (4) INV-22 dedup; then write. Never throws.
 *
 * @returns {{ok:boolean, file?:string, record_id?:string, deduped?:true, reason?:string}}
 */
function appendRecord(record, opts = {}) {
  if (!record || typeof record !== 'object') return { ok: false, reason: 'record-not-an-object' };
  const base = opts.stateDir || DEFAULT_STATE_DIR;
  const dir = recordStoreDir(opts);
  if (!dir) return { ok: false, reason: 'invalid-receiver' };

  // (1) validate first
  const validation = validateRecord(record);
  if (!validation.valid) return { ok: false, reason: 'invalid-record: ' + (validation.errors || []).join('; ') };

  // (2) content-address integrity (S5): the id must be the content hash of the body
  const id = record.record_id;
  if (typeof id !== 'string' || !HEX64.test(id)) return { ok: false, reason: 'record-id-not-hex' };
  let computed;
  try { computed = computeRecordId(record); } catch { return { ok: false, reason: 'record-uncomputable' }; }
  if (id !== computed) return { ok: false, reason: 'record-id-mismatch' };

  // (2b) idempotency-key content-address integrity — never trust a self-asserted key
  if (record.idempotency_key && deriveIdempotencyKey(record) !== record.idempotency_key) {
    return { ok: false, reason: 'idempotency-key-mismatch' };
  }

  // (3) defense-in-depth: confirm the derived path stays within the state root (anchored to base)
  const file = recordFilePath(id, opts);
  const scope = checkWithinRoot(file, base);
  if (!scope.ok) return { ok: false, reason: 'record-path-out-of-scope: ' + scope.reason };

  // (4) INV-22 dedup-on-append: a replay returns the existing id, writes nothing
  if (record.idempotency_key) {
    const existing = readByIdempotencyKey(record.idempotency_key, opts);
    if (existing) {
      return { ok: true, record_id: existing.record_id, deduped: true, file: recordFilePath(existing.record_id, opts) };
    }
  }

  try {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_MODE });
    writeAtomicString(file, JSON.stringify(record, null, 2));
  } catch (err) {
    return { ok: false, reason: 'write-failed: ' + (err && err.message ? err.message : String(err)) };
  }
  return { ok: true, file, record_id: id };
}

/**
 * Bounded positional read through an already-open fd: read at most cap+1 bytes (the loop handles short
 * reads) so a same-uid writer that GROWS the file after the fstat size-check cannot force an unbounded
 * read (the TOCTOU-grow close). cap+1 and Buffer.alloc(cap+1) are load-bearing — a cap-sized buffer would
 * overflow on the cap+1-n read. Returns the UTF-8 text, or null ONLY for the oversize case (so the
 * caller's `text === null` is an unambiguous oversize-race signal; a literal-'null' file returns the
 * STRING 'null', never the value). Inlined per store, NOT a shared leaf: PACT reconciles at
 * point-of-use, and (mirroring the toolkit's join-key-store) each read path is audited independently.
 */
function readBoundedText(fd, cap) {
  const buf = Buffer.alloc(cap + 1);
  let n = 0;
  let r = 0;
  do { r = fs.readSync(fd, buf, n, cap + 1 - n, n); n += r; } while (r > 0 && n <= cap);
  if (n > cap) return null;                                              // grew past the cap after fstat -> reject
  return buf.toString('utf8', 0, n);
}

/**
 * Parse + validate + content-verify a single record file. null on any failure (fail-soft).
 * READ is fd-safe (size-cap-before-read): open no-follow + no-block, fstat the SAME fd, reject a
 * non-regular / oversize object BEFORE the bounded read (a same-uid multi-GB plant cannot OOM us; a
 * symlink redirect is refused at open). The verify-on-read gate is then three-part (the #273 lesson):
 * (a) record_id is a 64-hex STRING (type before coercion); (b) filename txid == that field; (c) the
 * body CONTENT hashes to it.
 */
function loadRecordFile(file) {
  const where = path.basename(file);
  // (0) fd-safe read: broker-sign.js:130 uses the identical open idiom for the key. A symlink at a record
  // path now refuses at open (O_NOFOLLOW -> ELOOP) — a read-path hardening over the prior readFileSync, which
  // silently FOLLOWED a same-uid redirect. NS-9: this is read-ROBUSTNESS, NOT a trust hardening (a same-uid
  // in-process check NARROWS; only a world-anchored signal HARDENS). O_NOFOLLOW guards the FINAL component
  // only — a symlinked ANCESTOR dir is still followed, caught in depth by the size-cap below + readById's
  // checkWithinRoot realpath anchor (do NOT drop that layer). O_NONBLOCK so a FIFO/device planted at a record
  // path opens immediately (the fstat().isFile() below rejects it) instead of hanging.
  let raw;
  let fd = null;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const st = fs.fstatSync(fd);                                          // the OPEN fd's inode — swap-immune
    if (!st.isFile()) { refuseAlert('non-regular-record-file', { class: 'attack', file: where }); return null; }
    if (st.size > MAX_RECORD_FILE_BYTES) {
      refuseAlert('oversize-record-file', { class: 'attack', file: where, size: st.size });
      return null;
    }
    // bounded read (race-proof): the st.size check above is a fast early reject, but a same-uid writer can
    // grow the file between the fstat and the read. readBoundedText caps at MAX_RECORD_FILE_BYTES+1 and
    // returns null ONLY if the content grew past the cap after the fstat — an observable oversize-race.
    raw = readBoundedText(fd, MAX_RECORD_FILE_BYTES);
    if (raw === null) { refuseAlert('oversize-record-file', { class: 'attack', file: where, kind: 'race' }); return null; }
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;                       // a normal miss — NO alert (unchanged)
    // ELOOP (a symlink under O_NOFOLLOW), EACCES, ENXIO (a FIFO with no writer under O_NONBLOCK), ... a path
    // that previously returned null SILENTLY (a same-uid object-swap dropping a record) is now observable.
    refuseAlert('unreadable-record-file', { class: 'attack', file: where, io_code: (err && err.code) || 'error' });
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* best-effort */ } }
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { refuseAlert('unparseable-record-file', { class: 'integrity', file: where }); return null; }
  const validation = validateRecord(parsed);
  if (!validation.valid) { refuseAlert('invalid-record-on-read', { class: 'integrity', file: where }); return null; }
  const id = parsed.record_id;
  if (typeof id !== 'string' || !HEX64.test(id)) {                       // (a) type + shape, before coercion
    refuseAlert('record-id-not-hex-on-read', { class: 'integrity', file: where });
    return null;
  }
  if (path.basename(file) !== 'record-' + id + '.json') {               // (b) filename <-> field
    refuseAlert('filename-field-mismatch', { class: 'attack', file: where, record_id: id });
    return null;
  }
  let computed;
  try { computed = computeRecordId(parsed); }
  catch { refuseAlert('record-uncomputable-on-read', { class: 'integrity', file: where }); return null; }
  if (computed !== id) {                                                 // (c) field <-> content (S5-on-read)
    // the body does not hash to its id — a #273 co-forge / tamper attempt (never benign).
    refuseAlert('content-address-mismatch', { class: 'attack', file: where, record_id: id });
    return null;
  }
  return deepFreeze(parsed);
}

/**
 * Read a record by its content-addressed primary key (record_id). Hex-gated before any
 * path.join (S1); defense-in-depth scope anchored to base. null on miss / non-hex / invalid.
 */
function readById(recordId, opts = {}) {
  if (typeof recordId !== 'string' || !HEX64.test(recordId)) return null;
  const base = opts.stateDir || DEFAULT_STATE_DIR;
  const file = recordFilePath(recordId, opts);
  if (!file) return null;
  if (!checkWithinRoot(file, base).ok) return null;
  return loadRecordFile(file);
}

/**
 * Read the record whose idempotency_key === key AND whose body re-derives to that key (a
 * forged-key poison record is SKIPPED — never a dedup target). Hex-gated first. null on miss.
 */
function readByIdempotencyKey(key, opts = {}) {
  if (typeof key !== 'string' || !HEX64.test(key)) return null;
  const dir = recordStoreDir(opts);
  if (!dir) return null;
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  for (const name of names) {
    if (!RECORD_FILE_RE.test(name)) continue;
    const record = loadRecordFile(path.join(dir, name));
    if (record && record.idempotency_key === key && deriveIdempotencyKey(record) === key) return record;
  }
  return null;
}

/**
 * List every valid record for a receiver. Invalid/corrupt files are skipped (fail-soft).
 */
function listByReceiver(opts = {}) {
  const dir = recordStoreDir(opts);
  if (!dir) return [];
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (!RECORD_FILE_RE.test(name)) continue;
    const record = loadRecordFile(path.join(dir, name));
    if (record) out.push(record);
  }
  return out;
}

module.exports = {
  appendRecord,
  readById,
  readByIdempotencyKey,
  listByReceiver,
  recordStoreDir,
  receiverSegment,
  // Exported for the bounded-read test (drive the helper DIRECTLY on a >cap fd, bypassing the st.size
  // pre-check that would otherwise shadow it). MAX_RECORD_FILE_BYTES is the cap the read path enforces.
  readBoundedText,
  MAX_RECORD_FILE_BYTES,
};
