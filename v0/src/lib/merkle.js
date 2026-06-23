// PACT v0 — lib/merkle.js  (spec §7 / MAJOR M2 / INV-10 — RFC-6962 / RFC-9162 primitives)
//
// The PURE, crypto-only DAG FLOOR for the anti-equivocation audit layer: everything a VERIFIER needs over
// passed-in values — no I/O, no state, no key custody (that is audit/audit-log.js, the stateful PRODUCER leaf).
//
// CROSS-SUBSTRATE (plans/15 §9 — the standing toolkit<->PACT entanglement directive): the parent Power Loom
// kernel has the SAME gap (a linear post_state_hash chain, no Merkle layer). The RFC-6962 primitives here
// (leafHash / nodeHash / merkleRoot / inclusion / consistency / verifyInclusion / verifyConsistency) are
// dependency-free (crypto only) — a candidate to PORT into packages/kernel/_lib/. Only verifySTH/sthBasis pull
// in the PACT floor (canonical-json + edge-attestation), both of which the toolkit also has.
//
// HASHING (plans/15 P3, hacker LOW): RAW-BYTE domain separation per RFC-6962 §2.1 —
//   leafHash(d) = SHA-256(0x00 || d)        nodeHash(l,r) = SHA-256(0x01 || l || r)
// over Buffers via crypto.createHash, NOT sha256hex(string-of-canonical-JSON). The 0x00/0x01 prefixes close the
// second-preimage attack (an internal node cannot be presented as a leaf without a real SHA-256 collision).
//
// ALL public hashes are 64-hex strings at the API boundary (clean JSON for STH / frame.inclusion_proof);
// internal hashing decodes to Buffers. Fail-CLOSED on bad input (throw on producer paths; return false on the
// verify predicates — a malformed proof is a verification FAILURE, never an accept-all).

'use strict';

const crypto = require('crypto');
const { canonicalJsonSerialize } = require('./canonical-json');
const { verifyRecordSig } = require('./edge-attestation');

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);
const HEX64 = /^[0-9a-f]{64}$/;

function isHex64(v) { return typeof v === 'string' && HEX64.test(v); }
function sha256(...buffers) {
  const h = crypto.createHash('sha256');
  for (const b of buffers) h.update(b);
  return h.digest();
}

// ---------------------------------------------------------------------------------------------------------
// leafHash / nodeHash — the domain-separated hash primitives (RFC-6962 §2.1)
// ---------------------------------------------------------------------------------------------------------

/** leafHash(d) = SHA-256(0x00 || d). `d` is a Buffer (raw leaf data); returns 64-hex. */
function leafHash(buf) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('leafHash: buf must be a Buffer');
  return sha256(LEAF_PREFIX, buf).toString('hex');
}

/** nodeHash(l,r) = SHA-256(0x01 || l || r). `l`,`r` are 64-hex child hashes; returns 64-hex. */
function nodeHash(leftHex, rightHex) {
  if (!isHex64(leftHex) || !isHex64(rightHex)) throw new TypeError('nodeHash: children must be 64-hex');
  return sha256(NODE_PREFIX, Buffer.from(leftHex, 'hex'), Buffer.from(rightHex, 'hex')).toString('hex');
}

// Largest power of two STRICTLY less than n (n >= 2). Safe-integer arithmetic (no 32-bit bitwise truncation).
function largestPowerOfTwoLessThan(n) {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

// The maximum audit-path length for a tree of `treeSize`: ceil(log2(treeSize)) + 1 slack (the +1 absorbs any
// float-precision edge at a power of 2 and is never long enough to admit a forged path — the algorithm's
// sn===0 length check is the real guard). Used as an O(1) length cap BEFORE the O(n) per-element hex scan, so a
// pathological multi-element proof is rejected on its length, not its bytes (VALIDATE hacker LOW: work-amp).
function maxAuditPathLen(treeSize) {
  return Math.ceil(Math.log2(treeSize)) + 1;
}

// ---------------------------------------------------------------------------------------------------------
// merkleRoot — the Merkle Tree Hash MTH(D[n]) over a list of LEAF HASHES (RFC-6962 §2.1)
// ---------------------------------------------------------------------------------------------------------

/**
 * merkleRoot(leaves) where `leaves` is the ordered array of 64-hex LEAF HASHES (already leafHash'd).
 * empty -> SHA-256("") ; single -> that leaf ; else split at the largest power of 2 < n. Returns 64-hex.
 */
function merkleRoot(leaves) {
  if (!Array.isArray(leaves)) throw new TypeError('merkleRoot: leaves must be an array');
  if (leaves.length === 0) return crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
  for (const l of leaves) if (!isHex64(l)) throw new TypeError('merkleRoot: each leaf must be 64-hex');
  return mth(leaves);
}
function mth(leaves) {
  const n = leaves.length;
  if (n === 1) return leaves[0];
  const k = largestPowerOfTwoLessThan(n);
  return nodeHash(mth(leaves.slice(0, k)), mth(leaves.slice(k)));
}

// ---------------------------------------------------------------------------------------------------------
// inclusionProof / verifyInclusion — the audit path (RFC-6962 §2.1.1 PATH(m, D[n]) + RFC-9162 §2.1.3.2 verify)
// ---------------------------------------------------------------------------------------------------------

/** PATH(m, D[n]) — the inclusion proof for 0-based leaf index `m`. Array of 64-hex sibling hashes. */
function inclusionProof(leaves, m) {
  if (!Array.isArray(leaves)) throw new TypeError('inclusionProof: leaves must be an array');
  const n = leaves.length;
  if (!Number.isSafeInteger(m) || m < 0 || m >= n) throw new RangeError('inclusionProof: index out of range');
  for (const l of leaves) if (!isHex64(l)) throw new TypeError('inclusionProof: each leaf must be 64-hex');
  return path(m, leaves);
}
function path(m, leaves) {
  const n = leaves.length;
  if (n === 1) return [];
  const k = largestPowerOfTwoLessThan(n);
  if (m < k) return [...path(m, leaves.slice(0, k)), mth(leaves.slice(k))];
  return [...path(m - k, leaves.slice(k)), mth(leaves.slice(0, k))];
}

/**
 * Verify that `leafHashHex` is the `leafIndex`-th leaf of a tree of size `treeSize` with root `rootHex`,
 * given `proof`. RFC-9162 §2.1.3.2: the child ORDER at each level is derived DETERMINISTICALLY from the
 * bit-decomposition of (leafIndex, treeSize) — the proof carries NO caller-supplied left/right flag (hacker
 * HIGH-1). Rejects out-of-range index, malformed inputs, and proofs of the wrong length (too long => an early
 * sn==0; too short => a final sn!=0). Fail-CLOSED: returns false, never throws.
 */
function verifyInclusion(leafHashHex, leafIndex, treeSize, proof, rootHex) {
  if (!isHex64(leafHashHex) || !isHex64(rootHex)) return false;
  if (!Number.isSafeInteger(leafIndex) || !Number.isSafeInteger(treeSize)) return false;
  if (leafIndex < 0 || treeSize < 0 || leafIndex >= treeSize) return false;
  if (!Array.isArray(proof)) return false;
  if (proof.length > maxAuditPathLen(treeSize)) return false;   // O(1) length cap before the O(n) hex scan
  if (!proof.every(isHex64)) return false;
  let fn = leafIndex; let sn = treeSize - 1; let r = leafHashHex;
  for (const p of proof) {
    if (sn === 0) return false;                       // proof longer than the tree is deep -> reject
    if (fn % 2 === 1 || fn === sn) {
      r = nodeHash(p, r);                             // p is the LEFT sibling
      if (fn % 2 === 0) {
        do { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); } while (fn % 2 === 0 && fn !== 0);
      }
    } else {
      r = nodeHash(r, p);                             // p is the RIGHT sibling
    }
    fn = Math.floor(fn / 2); sn = Math.floor(sn / 2);
  }
  return sn === 0 && r === rootHex;
}

// ---------------------------------------------------------------------------------------------------------
// consistencyProof / verifyConsistency — append-only no-rewrite proof (RFC-6962 §2.1.2 + RFC-9162 §2.1.4.2)
// ---------------------------------------------------------------------------------------------------------

function isPowerOfTwo(x) {
  if (!Number.isSafeInteger(x) || x < 1) return false;
  let v = x;
  while (v % 2 === 0) v /= 2;
  return v === 1;
}

/** PROOF(m, D[n]) — the consistency proof between the size-m prefix and the size-n tree (0 < m < n). */
function consistencyProof(leaves, m) {
  if (!Array.isArray(leaves)) throw new TypeError('consistencyProof: leaves must be an array');
  const n = leaves.length;
  if (m === n) return [];                              // trivial (same tree); RFC-9162 verify expects empty
  if (!Number.isSafeInteger(m) || m <= 0 || m > n) throw new RangeError('consistencyProof: require 0 < m <= n');
  for (const l of leaves) if (!isHex64(l)) throw new TypeError('consistencyProof: each leaf must be 64-hex');
  return subproof(m, leaves, true);
}
function subproof(m, leaves, b) {
  const n = leaves.length;
  if (m === n) return b ? [] : [mth(leaves)];
  const k = largestPowerOfTwoLessThan(n);
  if (m <= k) return [...subproof(m, leaves.slice(0, k), b), mth(leaves.slice(k))];
  return [...subproof(m - k, leaves.slice(k), false), mth(leaves.slice(0, k))];
}

/**
 * Verify a consistency proof: that the size-`m` tree (root `rootMHex`) is an append-only prefix of the size-`n`
 * tree (root `rootNHex`). RFC-9162 §2.1.4.2. A REWRITTEN past leaf breaks the proof. Fail-CLOSED on:
 *   * m === 0  -> false (a size-0 STH is NOT a usable anchor — it would accept ANY extension; hacker MED)
 *   * m > n    -> false
 *   * m === n  -> the proof MUST be empty AND the roots equal (trivial)
 * Returns false, never throws.
 */
function verifyConsistency(m, n, proof, rootMHex, rootNHex) {
  if (!isHex64(rootMHex) || !isHex64(rootNHex)) return false;
  if (!Number.isSafeInteger(m) || !Number.isSafeInteger(n)) return false;
  if (m === 0) return false;                           // size-0 cannot anchor
  if (m < 0 || n < 0 || m > n) return false;
  if (!Array.isArray(proof)) return false;
  if (proof.length > maxAuditPathLen(n) + 1) return false;   // O(1) length cap before the O(n) hex scan
  if (!proof.every(isHex64)) return false;
  if (m === n) return proof.length === 0 && rootMHex === rootNHex;

  // 0 < m < n. RFC-9162 §2.1.4.2.
  let pathArr = proof.slice();
  if (isPowerOfTwo(m)) pathArr = [rootMHex, ...pathArr];  // step 1: prepend first_hash when m is a power of 2
  if (pathArr.length === 0) return false;                // need at least the seed node

  let fn = m - 1; let sn = n - 1;                        // step 2
  while (fn % 2 === 1) { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); }  // step 3
  let fr = pathArr[0]; let sr = pathArr[0];              // step 4
  for (let i = 1; i < pathArr.length; i++) {             // step 5
    const c = pathArr[i];
    if (sn === 0) return false;
    if (fn % 2 === 1 || fn === sn) {
      fr = nodeHash(c, fr);
      sr = nodeHash(c, sr);
      if (fn % 2 === 0) {
        do { fn = Math.floor(fn / 2); sn = Math.floor(sn / 2); } while (fn % 2 === 0 && fn !== 0);
      }
    } else {
      sr = nodeHash(sr, c);
    }
    fn = Math.floor(fn / 2); sn = Math.floor(sn / 2);
  }
  return fr === rootMHex && sr === rootNHex && sn === 0; // step 6
}

// ---------------------------------------------------------------------------------------------------------
// STH — the freshness-bound Signed Tree Head (plans/15 §2.2; hacker HIGH-3)
// ---------------------------------------------------------------------------------------------------------

/**
 * The FRESHNESS-BOUND STH signing basis. BORROWED from the toolkit's ③.2.5a egress approval pattern
 * (packages/kernel/egress/approval.js approvalSigBasis): the operator signs sha256(canonical({root, tree_size,
 * timestamp, nonce})) — NOT the bare {root, tree_size}. `root`+`tree_size` bind WHAT; `timestamp`+`nonce` bind
 * WHEN + a one-shot, so a non-key-holder cannot replay an old STH relabeled as current (editing `timestamp`
 * changes the basis -> the signature fails). Returns 64-hex. PURE.
 */
function sthBasis({ root, tree_size, timestamp, nonce }) {
  return crypto.createHash('sha256')
    .update(canonicalJsonSerialize({ root, tree_size, timestamp, nonce }), 'utf8')
    .digest('hex');
}

/**
 * Verify an STH's ed25519 signature over its freshness-bound basis under `publicKeyPem` (the operator's
 * per-sender registry key — no env fallback; edge-attestation is alg-pinned + fail-closed). Shape-gates every
 * field first. Returns false on ANY defect. NOTE: this proves the (root,tree_size,timestamp,nonce) tuple is
 * AUTHENTIC — freshness (is `timestamp` recent?) and monotonicity are CONSUMER policy (audit-log.detectFork).
 */
function verifySTH(sth, publicKeyPem) {
  if (!sth || typeof sth !== 'object') return false;
  if (!isHex64(sth.root)) return false;
  if (!Number.isSafeInteger(sth.tree_size) || sth.tree_size < 0) return false;
  if (!Number.isSafeInteger(sth.timestamp)) return false;
  if (typeof sth.nonce !== 'string' || sth.nonce.length === 0) return false;
  if (typeof sth.sig !== 'string') return false;
  const basisHex = sthBasis(sth);
  return verifyRecordSig(basisHex, sth.sig, { publicKeyPem });
}

module.exports = {
  leafHash,
  nodeHash,
  merkleRoot,
  inclusionProof,
  verifyInclusion,
  consistencyProof,
  verifyConsistency,
  sthBasis,
  verifySTH,
};
