// PACT v0 -- lib/edge-freshness.js  (plans/34 W0 -- the freshness-bound edge primitive)
//
// The approvalSigBasis-equivalent for a GENERIC trust-graph edge: the 64-hex basis a producer SIGNS (binding
// WHAT + WHEN + a one-shot nonce + key_id) + a fail-closed verify helper (the freshness window + the sig-over-
// basis check). It re-applies an idiom PACT ALREADY borrowed once from the toolkit's egress approval.js -- the
// merkle.js sthBasis/verifySTH pattern -- to an edge hash rather than the Merkle STH (plans/29 CC#1). PACT's edge
// sig today binds the BARE record_id (edge-attestation.js signRecordId; no approvedAt/nonce), so a same-uid host
// replays a legit-signed edge indefinitely; this narrows replay to a <=TTL window.
//
// SHADOW / DORMANT: no producer mints it, no fold reads it, nothing gates on it (edge-freshness-darkness-witness).
// It NARROWS replay; it does NOT prove PROVENANCE -- a freshness-bound edge still proves INTEGRITY only, and a
// same-uid host co-forges a byte-identical edge via the same exported derivation until a deployed cross-uid signer
// removes the key from the host's reach (plans/30 §4, the #273 family). It does NOT eliminate replay: true one-shot
// enforcement (a consume-on-first-use nonce store) is DEFERRED to the W2 consumer (hacker H2).
//
// DOMAIN SEPARATION (architect M-1 -- defense-in-depth, NOT collision-closure): this basis is ed25519-over-a-
// 64-hex signed by the SAME signRecordId as a frame record_id, a sigma_root binding, and (once wired) an edge sig
// -- a cross-protocol signature-reuse surface. The `_type` tag domain-separates the HONESTLY-produced preimage so
// an honestly-built freshness basis is disjoint from an honestly-built record_id or sigma_root binding; the
// underlying collision resistance is sha256's (the sigma-root.js:16-23 wording -- a hand-crafted object COULD be
// made to collide, but is not a reachable protocol message). The `.v1` versions the FROZEN preimage so a future
// field-set change is a clean `.v2`.

'use strict';

const { sha256hex, canonicalJsonSerialize, HEX64 } = require('./record');
const { verifyRecordSig } = require('./edge-attestation');

const EDGE_FRESHNESS_TYPE = 'pact.edge.freshness_basis.v1';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;  // 24h -- matches the toolkit approval DEFAULT_TTL_MS.
const MIN_NONCE_LEN = 8;                      // a light entropy floor (hacker M1) -- unified across basis + window.

// Full type-gate (the sigma_root M1 lesson: a bare `!v` passes `[]`/`{}`, LIVE-PROVEN). Throw on any malformed
// field -- this PINS every field, so the always-a-string footgun (undefined/''/absent = 3 distinct bases) cannot
// arise: absent is a throw, never a silently-hashed token.
function requireHex64(v, name) {
  if (typeof v !== 'string' || !HEX64.test(v)) throw new TypeError('edge-freshness: ' + name + ' must be a 64-hex string');
  return v;
}
function requireFiniteNumber(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('edge-freshness: ' + name + ' must be a finite number');
  return v;
}
// The nonce predicate -- UNIFIED with checkFreshnessWindow (hacker M1): a nonce that is SIGNABLE (passes here) is
// always VERIFIABLE (passes the window), so a producer can never mint an edge the verifier rejects (no self-DoS).
// WHITESPACE-CLEAN (v === v.trim(), VALIDATE code-reviewer LOW): computeEdgeFreshnessBasis hashes the RAW nonce, so
// the GATED value must equal the HASHED value -- a padded nonce (`'  n  '`) must not pass the floor and then sign a
// differently-padded basis than a caller assuming normalization expects. Rejecting surrounding whitespace makes
// gate-value == hash-value; the entropy floor is then on the (already-clean) length.
function isValidNonce(v) {
  return typeof v === 'string' && v === v.trim() && v.length >= MIN_NONCE_LEN;
}
function requireNonce(v, name) {
  if (!isValidNonce(v)) throw new TypeError('edge-freshness: ' + name + ' must be a string of >= ' + MIN_NONCE_LEN + ' non-space chars');
  return v;
}
function requireNonEmptyString(v, name) {
  if (typeof v !== 'string' || v.length === 0) throw new TypeError('edge-freshness: ' + name + ' must be a non-empty string');
  return v;
}

/**
 * The 64-hex content-address a producer SIGNS. Binds WHAT (recordId) + WHEN (approvedAt) + the nonce (one-shot
 * ONCE the W2 consume-on-first-use store lands -- W0 only BINDS it into the basis, it does not enforce one-shot) +
 * the advisory keyId. Injective canonical form (sorted-key quoted JSON, NEVER concat) + domain-separated (_type).
 * @throws {TypeError} on any missing / malformed field (M1 full type-gate). The verify path WRAPS this.
 */
function computeEdgeFreshnessBasis({ recordId, approvedAt, nonce, keyId } = {}) {
  requireHex64(recordId, 'recordId');
  requireFiniteNumber(approvedAt, 'approvedAt');
  requireNonce(nonce, 'nonce');
  requireNonEmptyString(keyId, 'keyId');
  return sha256hex(canonicalJsonSerialize({
    _type: EDGE_FRESHNESS_TYPE,
    approved_at: approvedAt,
    key_id: keyId,
    nonce,
    record_id: recordId,
  }));
}

/**
 * The PURE freshness/replay predicate (no key, no sig) -- the verifyApproval freshness half, extracted so it is
 * independently testable and reusable by W2's read-gate. NEVER throws; `now` + `ttlMs` INJECTED (no clock I/O).
 *
 * Reason order is PINNED (architect M-2) to mirror the toolkit approval.js: bad-ttl -> no-clock -> no-approvedAt
 * -> no-nonce -> stale-or-future. `bad-ttl` (hacker H1): a non-finite / non-positive ttlMs fails CLOSED -- Infinity
 * would make `now - approvedAt > Infinity` always false and neuter the window (guard-non-bypassable, security.md).
 * At the W2 live boundary ttlMs MUST be a DEPLOY/kernel CONSTANT, never a record/attacker-sourced value.
 * @returns {{ fresh: boolean, reason: (string|null) }}
 */
function checkFreshnessWindow(input) {
  // positional arg + null-coalesce (NOT a signature destructure with `= {}`): the `= {}` default fills only
  // `undefined`, so `checkFreshnessWindow(null)` would throw -- the same signature-destructure-throws footgun the
  // C1 fold closes in verifyFreshEdge. A non-object input degrades to an all-undefined readout (fail-closed).
  const o = input && typeof input === 'object' ? input : {};
  const { approvedAt, nonce, now, ttlMs = DEFAULT_TTL_MS } = o;
  if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) return { fresh: false, reason: 'bad-ttl' };
  if (typeof now !== 'number' || !Number.isFinite(now)) return { fresh: false, reason: 'no-clock' };
  if (typeof approvedAt !== 'number' || !Number.isFinite(approvedAt)) return { fresh: false, reason: 'no-approvedAt' };
  if (!isValidNonce(nonce)) return { fresh: false, reason: 'no-nonce' };
  if (now - approvedAt > ttlMs || now < approvedAt) return { fresh: false, reason: 'stale-or-future' };
  return { fresh: true, reason: null };
}

function failClosed(reason) { return { ok: false, reason }; }

/**
 * The verifyApproval-equivalent: the freshness window THEN the sig-over-basis. Fail-CLOSED, NEVER throws. Takes
 * `publicKeyPem` as a PARAM (no registry lookup -- W2's read-gate sources the per-sender key; this stays a pure
 * floor leaf, exactly as verifyApproval takes verifyKeyPem). PACT's verifyRecordSig is env-fallback-free BY
 * CONSTRUCTION (edge-attestation.js reads opts.publicKeyPem only) -- there is no allowEnvFallback flag to set (M2).
 *
 * SINGLE options object (architect H-1) guarded ONCE, then destructured INSIDE the try (the sigma-root.js:74 C1
 * template -- a signature-position destructure fires a throwing getter OUTSIDE any try, failing OPEN). SNAPSHOT
 * each field EXACTLY ONCE (hacker C1 CRITICAL): a read-twice getter differential (window reads fresh, basis re-reads
 * the signed-stale value) would verify a stale edge as fresh; reading each field once into a local closes it --
 * fields.* is NEVER re-read after the snapshot, so window + basis always see the SAME value.
 * @param {{ fields: object, sig: string, publicKeyPem: string, now: number, ttlMs?: number }} o
 * @returns {{ ok: boolean, reason?: (string|null) }}
 */
function verifyFreshEdge(o) {
  try {
    if (!o || typeof o !== 'object') return failClosed('no-args');
    const { fields, sig, publicKeyPem, now, ttlMs = DEFAULT_TTL_MS } = o;
    if (typeof publicKeyPem !== 'string' || publicKeyPem.length === 0) return failClosed('no-verify-key');
    if (typeof sig !== 'string' || sig.length === 0) return failClosed('no-sig');
    if (!fields || typeof fields !== 'object') return failClosed('no-fields');
    // SNAPSHOT each field EXACTLY ONCE (C1). fields.* is never re-read below -- window + basis get the same values.
    const recordId = fields.recordId;
    const approvedAt = fields.approvedAt;
    const nonce = fields.nonce;
    const keyId = fields.keyId;
    const fresh = checkFreshnessWindow({ approvedAt, nonce, now, ttlMs });
    if (!fresh.fresh) return failClosed(fresh.reason);
    let basis;
    try { basis = computeEdgeFreshnessBasis({ recordId, approvedAt, nonce, keyId }); }
    catch { return failClosed('basis-underivable'); }
    if (!verifyRecordSig(basis, sig, { publicKeyPem })) return failClosed('sig-invalid');
    return { ok: true, reason: null };
  } catch {
    return failClosed('fail-closed');
  }
}

module.exports = {
  EDGE_FRESHNESS_TYPE,
  DEFAULT_TTL_MS,
  MIN_NONCE_LEN,
  computeEdgeFreshnessBasis,
  checkFreshnessWindow,
  verifyFreshEdge,
};
