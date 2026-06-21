// PACT v0 — record.js
//
// SURGICALLY DERIVED from kernel transaction-record.js (see TRANSFER-PROVENANCE.md):
// KEEPS the field-agnostic content-address + the INV-22 idempotency machinery (a key
// re-derived from the body, never trusted as a self-asserted label); RE-AUTHORS the
// field-bound helpers to PACT frame/Claim fields; DROPS the kernel-spawn semantics PACT
// v0 does not use (genesis sentinels, post_state_hash / git-tree state edges, two-phase
// commit, A10 evidence-refs, the isGenesisPosition machinery).
//
// A v0 "record" IS a PACT frame (spec §2) carrying a Claim payload:
//   { record_id, ver, type, src_persona_did, parent_human_uid, seq, nonce, payload?, idempotency_key?, sig? }
//   record_id = content-address over the body (minus record_id + sig).
//   sig       = ed25519 over record_id (lives OUTSIDE the content-address basis — §edge-attestation).

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { canonicalJsonSerialize } = require('./canonical-json');

const HEX64 = /^[a-f0-9]{64}$/;
function sha256hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// --- lenient runtime validator: reads required[] from the schema (NOT additionalProperties
//     at runtime — forward-compat fields are accepted; the strict schema is documentation) ---
let _schemaCache = null;
function loadSchema() {
  if (_schemaCache) return _schemaCache;
  // The schema JSON is part of the transfer closure (kernel transaction-record.js:34 read
  // an analogous file via readFileSync with no try/catch — the hidden dependency the VERIFY
  // board surfaced). Lives beside this module.
  _schemaCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'record-schema.json'), 'utf8'));
  return _schemaCache;
}
function clearSchemaCache() {
  _schemaCache = null;
}

/**
 * The content-address of a record = sha256(canonical(record minus {record_id, sig})).
 * Generalized from kernel computeTransactionId (which excluded only transaction_id).
 * EXCLUDES record_id (non-circular) AND sig (the signature is OVER record_id, so it is
 * outside its own basis; including it would make the id un-recomputable post-signing).
 *
 * @param {object} record
 * @returns {string} 64-hex sha256
 */
function computeRecordId(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('computeRecordId: record must be a non-null object');
  }
  const { record_id, sig, ...rest } = record;
  void record_id;
  void sig;
  return sha256hex(canonicalJsonSerialize(rest));
}

/**
 * Bind a frame's IDENTITY for the idempotency key (PACT re-author of kernel computeContentHash).
 * Two genuinely-distinct frames (different persona / seq / nonce / payload) never collide.
 * NULL-safe by construction (canonicalJsonSerialize emits null without throwing).
 */
function computeContentHash({ srcPersonaDid, seq, nonce, payloadHash }) {
  return sha256hex(canonicalJsonSerialize({
    src_persona_did: srcPersonaDid,
    seq: seq ?? null,
    nonce: nonce ?? null,
    payload_hash: payloadHash ?? null,
  }));
}

/**
 * The idempotency key (PACT re-author of kernel computeIdempotencyKey). Two records with
 * the same key are the same frame; a replay is a no-op (INV-22).
 * @throws {TypeError} if any of the four inputs is falsy.
 */
function computeIdempotencyKey({ srcPersonaDid, type, contentHash, parentHumanUid }) {
  if (!srcPersonaDid || !type || !contentHash || !parentHumanUid) {
    throw new TypeError('computeIdempotencyKey: all four fields required');
  }
  return sha256hex(canonicalJsonSerialize({
    src_persona_did: srcPersonaDid,
    type,
    content_hash: contentHash,
    parent_human_uid: parentHumanUid,
  }));
}

/**
 * Re-derive the idempotency key FROM THE BODY — the content-address verification for INV-22.
 * The dedup gate MUST NOT trust a self-asserted idempotency_key (the store is not a sandbox).
 * Returns null if any identity input is absent (caller treats null as a verification FAILURE —
 * null !== the claimed key). Fail-CLOSED on a hash error (a pathologically deep payload tripping
 * the canonicalJsonSerialize bound) → null.
 *
 * @param {object} record
 * @returns {string|null}
 */
function deriveIdempotencyKey(record) {
  if (!record || typeof record !== 'object') return null;
  const persona = record.src_persona_did;
  const type = record.type;
  const seq = record.seq;
  const nonce = record.nonce;
  const parent = record.parent_human_uid;
  // seq may legitimately be 0; treat only null/undefined as absent.
  if (!persona || !type || seq === undefined || seq === null || !nonce || !parent) return null;
  try {
    const payloadHash = sha256hex(canonicalJsonSerialize(record.payload ?? null));
    const contentHash = computeContentHash({ srcPersonaDid: persona, seq, nonce, payloadHash });
    return computeIdempotencyKey({ srcPersonaDid: persona, type, contentHash, parentHumanUid: parent });
  } catch {
    return null;
  }
}

/**
 * Validate a record against the schema's required[] + shape spot-checks. LENIENT: it does
 * not enforce additionalProperties at runtime (forward-compat). Content-address integrity
 * (record_id === computeRecordId(body)) is enforced separately by the store on write + read.
 *
 * @param {object} record
 * @returns {{valid: boolean, errors?: string[]}}
 */
function validateRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['record must be a non-null object'] };
  }
  const schema = loadSchema();
  for (const field of (schema.required || [])) {
    // `== null` covers both absent and explicit-undefined/null (the `in` operator would pass an
    // undefined-valued required field — post-build VALIDATE MINOR).
    if (record[field] == null) errors.push('missing required field: ' + field);
  }
  if (typeof record.record_id === 'string' && !HEX64.test(record.record_id)) {
    errors.push('record_id must be 64-char lowercase hex sha256');
  }
  if (record.idempotency_key != null &&
      (typeof record.idempotency_key !== 'string' || !HEX64.test(record.idempotency_key))) {
    errors.push('idempotency_key must be 64-char lowercase hex sha256');
  }
  if (record.seq != null &&
      (typeof record.seq !== 'number' || !Number.isInteger(record.seq) || record.seq < 0)) {
    errors.push('seq must be a non-negative integer');
  }
  for (const f of ['ver', 'type', 'src_persona_did', 'parent_human_uid', 'nonce']) {
    if (record[f] != null && typeof record[f] !== 'string') errors.push(f + ' must be a string');
  }
  if (record.sig != null && typeof record.sig !== 'string') errors.push('sig must be a string');
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

module.exports = {
  canonicalJsonSerialize, // re-export (single source — never re-implement; M1 forward-coupling)
  HEX64,
  sha256hex,
  computeRecordId,
  computeContentHash,
  computeIdempotencyKey,
  deriveIdempotencyKey,
  validateRecord,
  clearSchemaCache,
};
