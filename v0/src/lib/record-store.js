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
 * Parse + validate + content-verify a single record file. null on any failure (fail-soft).
 * The verify-on-read gate is three-part (the #273 lesson): (a) record_id is a 64-hex STRING
 * (type before coercion); (b) filename txid == that field; (c) the body CONTENT hashes to it.
 */
function loadRecordFile(file) {
  const where = path.basename(file);
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }    // a normal miss (ENOENT) — NO alert
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
};
