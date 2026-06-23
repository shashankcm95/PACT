// PACT v0 — audit/audit-log.js  (spec §7 / M2 / INV-10 — the per-receiver Merkle LOG, STATEFUL PRODUCER leaf)
//
// The stateful side of the anti-equivocation layer: an append-ORDERED per-receiver leaf log + a freshness-bound
// Signed Tree Head + inclusion/consistency proofs + the sound half of fork detection. A DAG LEAF — nothing below
// imports it (the layering tripwire asserts `lib` MUST NOT import `audit`); it imports only the floor
// (lib/merkle, lib/record, lib/edge-attestation, lib/record-store, lib/atomic-write, lib/path-canonicalize).
//
// WHY a SEPARATE ordered leaf file (plans/15 §1, P1): record-store is a content-addressed FLAT set; its
// listByReceiver returns readdir order, NOT append order — so it cannot back an ordered Merkle log. The leaf log
// owns its own append sequence (the array index IS the log position).
//
// DURABILITY ORDER (architect MED, crash-consistency): appendAudited writes the durable RECORD first, THEN the
// leaf — a leaf never references a non-durable record. A record-without-leaf (crash between the two writes) is
// recovered by the idempotent reconcile(); leaf-without-record is structurally impossible.
//
// SHADOW (NS-8/NS-9): this is a MECHANISM that NARROWS the equivocation surface (single-node detection logic +
// the verification primitives). It does NOT by itself HARDEN trust — that needs independent cross-node STH
// gossip + a world-anchored deployment (the network phase). Nothing here gates a trust decision.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const merkle = require('../lib/merkle');
const { computeRecordId, HEX64 } = require('../lib/record');
const { signRecordId } = require('../lib/edge-attestation');
const { writeAtomicString } = require('../lib/atomic-write');
const { checkWithinRoot } = require('../lib/path-canonicalize');
const { receiverSegment, appendRecord, listByReceiver } = require('../lib/record-store');

const DEFAULT_STATE_DIR = path.join(os.homedir(), '.claude', 'pact-v0-store');
const DIR_MODE = 0o700;
const LOG_VERSION = 1;

/** The on-disk ordered leaf log for a receiver: `<base>/<seg>/audit/leaves.json`. null if receiverId invalid. */
function auditLogPath({ receiverId, stateDir } = {}) {
  const base = stateDir || DEFAULT_STATE_DIR;
  const seg = receiverSegment(receiverId);
  if (!seg) return null;
  return path.join(base, seg, 'audit', 'leaves.json');
}

/**
 * The ordered array of record_ids. An ABSENT file -> [] (a legit empty log / first append). A PRESENT but
 * corrupt/tampered file -> THROWS (fail-closed: never silently reset an append-only log to empty, which would
 * forge a fresh root and erase history).
 */
function readLeaves(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { if (e && e.code === 'ENOENT') return []; throw e; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('audit-log-corrupt: invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.leaves)) {
    throw new Error('audit-log-corrupt: bad shape');
  }
  for (const id of parsed.leaves) {
    if (typeof id !== 'string' || !HEX64.test(id)) throw new Error('audit-log-corrupt: non-hex leaf');
  }
  return parsed.leaves.slice();
}

/** record_ids -> their leaf hashes (leafHash over the RAW 32 content-address bytes). */
function leafHashesFrom(recordIds) {
  return recordIds.map((id) => merkle.leafHash(Buffer.from(id, 'hex')));
}

/**
 * Append a leaf bound to a VERIFIED record (#273 phantom-leaf discipline): re-derive record_id from the body and
 * reject a mismatch; refuse a bare id / non-object (no backing record). IDEMPOTENT — a re-append of a present
 * record_id is a no-op (INV-22 spirit; makes reconcile recovery-safe). Never throws.
 * @returns {{ok:boolean, seq?:number, tree_size?:number, deduped?:true, reason?:string}}
 */
function appendLeaf(record, opts = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'record-not-an-object' };
  const claimedId = record.record_id;
  if (typeof claimedId !== 'string' || !HEX64.test(claimedId)) return { ok: false, reason: 'record-id-not-hex' };
  let computed;
  try { computed = computeRecordId(record); } catch { return { ok: false, reason: 'record-uncomputable' }; }
  if (computed !== claimedId) return { ok: false, reason: 'record-id-mismatch' };

  const file = auditLogPath(opts);
  if (!file) return { ok: false, reason: 'invalid-receiver' };
  const base = opts.stateDir || DEFAULT_STATE_DIR;
  if (!checkWithinRoot(file, base).ok) return { ok: false, reason: 'audit-path-out-of-scope' };

  let leaves;
  try { leaves = readLeaves(file); } catch (e) { return { ok: false, reason: e.message }; }
  const at = leaves.indexOf(claimedId);
  if (at !== -1) return { ok: true, deduped: true, seq: at, tree_size: leaves.length };

  const next = [...leaves, claimedId];
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: DIR_MODE });
    writeAtomicString(file, JSON.stringify({ version: LOG_VERSION, leaves: next }, null, 2));
  } catch (err) {
    return { ok: false, reason: 'write-failed: ' + (err && err.message ? err.message : String(err)) };
  }
  return { ok: true, seq: leaves.length, tree_size: next.length };
}

/**
 * The current freshness-bound Signed Tree Head over the ordered leaves. The operator signs sha256(canonical(
 * {root, tree_size, timestamp, nonce})) via the edge-attestation seam (signerOpts: {signer}|{privateKeyPem}) —
 * no ambient key, so an absent signer fails CLOSED. `opts.now`/`opts.nonce` are injectable for determinism.
 * @returns {{ok:boolean, sth?:{root,tree_size,timestamp,nonce,sig}, reason?:string}}
 */
function currentSTH(signerOpts = {}, opts = {}) {
  const file = auditLogPath(opts);
  if (!file) return { ok: false, reason: 'invalid-receiver' };
  let leaves;
  try { leaves = readLeaves(file); } catch (e) { return { ok: false, reason: e.message }; }
  const root = merkle.merkleRoot(leafHashesFrom(leaves));
  const tree_size = leaves.length;
  const timestamp = Number.isInteger(opts.now) ? opts.now : Date.now();
  const nonce = (typeof opts.nonce === 'string' && opts.nonce.length > 0)
    ? opts.nonce : crypto.randomBytes(16).toString('hex');
  const basisHex = merkle.sthBasis({ root, tree_size, timestamp, nonce });
  const sig = signRecordId(basisHex, signerOpts);
  if (!sig) return { ok: false, reason: 'sign-failed' };
  return { ok: true, sth: { root, tree_size, timestamp, nonce, sig } };
}

/**
 * An inclusion proof for the `i`-th leaf (delegates to lib/merkle over the ordered leaf hashes). The returned
 * `leaf` is leafHash(record_id) — verify with merkle.verifyInclusion(leaf, i, tree_size, proof, sth.root).
 */
function proveInclusion(i, opts = {}) {
  const file = auditLogPath(opts);
  if (!file) return { ok: false, reason: 'invalid-receiver' };
  let leaves;
  try { leaves = readLeaves(file); } catch (e) { return { ok: false, reason: e.message }; }
  if (!Number.isSafeInteger(i) || i < 0 || i >= leaves.length) return { ok: false, reason: 'index-out-of-range' };
  const hashes = leafHashesFrom(leaves);
  let proof;
  try { proof = merkle.inclusionProof(hashes, i); } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: true, leaf: hashes[i], leaf_index: i, tree_size: leaves.length, proof };
}

/**
 * A consistency proof that an earlier size `m` is an append-only prefix of size `n` (n defaults to the current
 * tree size; n <= current). Returns the proof + both roots (the producer holds the leaves; in a live flow rootM
 * comes from the earlier STH). Verify with merkle.verifyConsistency(m, n, proof, root_m, root_n).
 */
function proveConsistency(m, opts = {}) {
  const file = auditLogPath(opts);
  if (!file) return { ok: false, reason: 'invalid-receiver' };
  let leaves;
  try { leaves = readLeaves(file); } catch (e) { return { ok: false, reason: e.message }; }
  const n = Number.isSafeInteger(opts.n) ? opts.n : leaves.length;
  if (!Number.isSafeInteger(m) || m <= 0 || m > n || n > leaves.length) return { ok: false, reason: 'bad-range' };
  const hashes = leafHashesFrom(leaves);
  const upToN = hashes.slice(0, n);
  let proof;
  try { proof = merkle.consistencyProof(upToN, m); } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: true, m, n, proof, root_m: merkle.merkleRoot(hashes.slice(0, m)), root_n: merkle.merkleRoot(upToN) };
}

function validSTHShape(s) {
  return !!s && typeof s === 'object'
    && typeof s.root === 'string' && HEX64.test(s.root)
    && Number.isSafeInteger(s.tree_size) && s.tree_size >= 0
    && Number.isSafeInteger(s.timestamp);
}

/**
 * Detect a fork between two STHs — the SOUND, provenance-free half (plans/15 §2.2, hacker MED): two STHs at the
 * SAME tree_size with DIFFERENT roots ⇒ fork (no attacker-supplied consistency proof needed); a LATER (by
 * timestamp) STH with a SMALLER tree_size ⇒ fork (monotonicity). A malformed STH is NOT a vacuous fork. The
 * consistency-proof half (verifying an extension) is only as trustworthy as the proof's provenance — that is the
 * deferred gossip transport's job (network phase), deliberately NOT asserted here.
 *
 * CONSUMER CONTRACT (VALIDATE reviewer LOW): this checks STRUCTURAL consistency (shape + the size/root/timestamp
 * relations), NOT signature PROVENANCE — it does NOT call verifySTH. A caller MUST verifySTH(sthA) AND
 * verifySTH(sthB) under each operator's registered key BEFORE actioning a fork report; two unsigned/forged STHs
 * can otherwise trigger a false positive. (Same integrity≠provenance line as the rest of the substrate.)
 * @returns {{fork:boolean, reason?:string}}
 */
function detectFork(sthA, sthB) {
  if (!validSTHShape(sthA) || !validSTHShape(sthB)) return { fork: false, reason: 'malformed-sth' };
  if (sthA.tree_size === sthB.tree_size && sthA.root !== sthB.root) {
    return { fork: true, reason: 'same-size-different-root' };
  }
  const [earlier, later] = sthA.timestamp <= sthB.timestamp ? [sthA, sthB] : [sthB, sthA];
  if (later.tree_size < earlier.tree_size) return { fork: true, reason: 'tree-size-regressed' };
  return { fork: false };
}

/**
 * The producer-side coordinator (the dual write, orchestrated ABOVE lib so lib/record-store never imports
 * audit/ — architect HIGH-2): durable RECORD first, THEN the leaf. A failed record append produces NO leaf.
 */
function appendAudited(record, opts = {}) {
  const r = appendRecord(record, opts);
  if (!r.ok) return { ok: false, reason: 'record-append-failed: ' + r.reason };
  const l = appendLeaf(record, opts);
  if (!l.ok) return { ok: false, reason: 'leaf-append-failed: ' + l.reason, record_id: r.record_id };
  return { ok: true, record_id: r.record_id, seq: l.seq, tree_size: l.tree_size, deduped: !!(r.deduped || l.deduped) };
}

/**
 * Crash recovery: rebuild leaves for any durable record missing from the leaf log. Idempotent (appendLeaf
 * dedups). Missing records are appended in a deterministic best-effort order (frame `seq`, then record_id) — the
 * true original append order is lost on a crash, so this is recovery, not a guarantee of historical order.
 */
function reconcile(opts = {}) {
  const file = auditLogPath(opts);
  if (!file) return { ok: false, reason: 'invalid-receiver' };
  let existing;
  try { existing = readLeaves(file); } catch (e) { return { ok: false, reason: e.message }; }
  const present = new Set(existing);
  const missing = listByReceiver(opts).filter((rec) => !present.has(rec.record_id));
  missing.sort((a, b) => {
    const sa = Number.isInteger(a.seq) ? a.seq : 0;
    const sb = Number.isInteger(b.seq) ? b.seq : 0;
    if (sa !== sb) return sa - sb;
    return a.record_id < b.record_id ? -1 : (a.record_id > b.record_id ? 1 : 0);
  });
  let added = 0;
  for (const rec of missing) {
    const res = appendLeaf(rec, opts);
    if (res.ok && !res.deduped) added++;
  }
  // tree_size is `existing.length + added` AUTHORITATIVELY in the v0 single-node model: `missing` holds distinct
  // record_ids absent from the start log, so each non-deduped appendLeaf wrote exactly one new leaf. (VALIDATE
  // reviewer MED: the prior `try { readLeaves().length } catch {}` re-read added a SILENT degraded path with no
  // signal — security.md "a fail path must be observable"; dropped, since the count is exact here.) TOCTOU note
  // (reviewer LOW): readLeaves + listByReceiver are two unsynchronized reads; under a hypothetical concurrent
  // writer (out of the v0 single-node threat model) appendLeaf's idempotency is the safety net — a double-seen
  // record dedups to a no-op rather than double-appending.
  return { ok: true, added, tree_size: existing.length + added };
}

module.exports = {
  auditLogPath,
  appendLeaf,
  currentSTH,
  proveInclusion,
  proveConsistency,
  detectFork,
  appendAudited,
  reconcile,
};
