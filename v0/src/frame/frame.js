// PACT v0 — frame/frame.js  (spec §2)
//
// The minimal authenticated frame carrying a Claim payload (§3). buildFrame assembles + signs;
// receiveFrame is the §2 receipt rule: verify(SIG) ∧ content-integrity ∧ root_valid. P1 only —
// it proves WHO + UNTAMPERED + a known root, NEVER that the payload is true (that is the ATMS's
// job, §3). Per-sender verify key resolution from the U1 registry (no shared default).

'use strict';

const { computeRecordId, deriveIdempotencyKey, validateRecord } = require('../lib/record');
const { signRecordId, verifyRecordSig } = require('../lib/edge-attestation');
const { leafHash, verifyInclusion, verifySTH } = require('../lib/merkle'); // §7 audit: imports ONLY the floor
const { isKnownRoot, lookupPublicKey } = require('../identity/registry');

// Return a NEW object with undefined-valued keys removed (immutable; never mutates the input). A no-op when
// no value is undefined. See the §1.4 note at the call site for why undefined keys must not enter the hash.
function stripUndefinedKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj)) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/**
 * Assemble + sign a frame. record_id is the content-address (excludes record_id + sig); sig is
 * ed25519 over record_id via the signer seam (signerOpts: {privateKeyPem} or {signer} — Option B).
 *
 * Optionally attach the §7 audit transport (additive): `audit = {inclusion_proof, leaf_index, sth}` — the
 * sender's per-receiver Merkle proof for THIS frame. These live OUTSIDE the content-address (like `sig`): the
 * inclusion proof commits to `record_id`, so it cannot be inside `record_id`. A caller produces them via
 * audit/audit-log (NOT imported here — the frame layer stays on the floor); buildFrame only attaches them.
 *
 * @param {{ver?:string, type?:string, srcPersonaDid:string, parentHumanUid:string, seq:number, nonce:string, payload:any}} spec
 * @param {{privateKeyPem?:string, signer?:Function}} signerOpts
 * @param {{inclusion_proof?:string[], leaf_index?:number, sth?:object}} [audit]
 * @returns {{ok:false,reason:string}|{ok:true,frame:object}}
 */
function buildFrame(spec, signerOpts = {}, audit) {
  const { ver = 'pact/0', type = 'CLAIM', srcPersonaDid, parentHumanUid, seq, nonce, payload, configHash, t } = spec || {};
  const body = {
    ver, type,
    src_persona_did: srcPersonaDid,
    parent_human_uid: parentHumanUid,
    seq, nonce, payload,
  };
  // P2 (ratified): optional, authenticated (in the content-address) frame fields.
  if (configHash !== undefined) body.config_hash = configHash; // axis-3 config-stability (WEAK), §1.4
  if (t !== undefined) body.t = t;                             // created_at (epoch ms) for decay, §5 dec.6
  const idempotency_key = deriveIdempotencyKey(body); // internally fail-soft -> null on a deep payload
  // Strip undefined-valued top-level keys (the only one is `payload` when a spec omits it -- config_hash/t
  // are already conditional). canonicalJsonSerialize emits `undefined`, `null`, and an omitted key as THREE
  // distinct hashes, and only `undefined` does NOT survive a JSON round-trip; normalizing it out makes the
  // host->wire->broker recompute an identity (R2-WHAT, plans/11 §1.4) WITHOUT changing any frame whose
  // payload is defined (a no-op when nothing is undefined). Stays broker-agnostic.
  const withKey = stripUndefinedKeys(idempotency_key ? { ...body, idempotency_key } : { ...body });
  let record_id;
  try { record_id = computeRecordId(withKey); } // a pathologically deep payload trips the canonical
  catch { return { ok: false, reason: 'uncomputable-payload' }; } // bound — fail-closed, symmetric w/ receiveFrame
  // pass withKey (the EXACT preimage that hashed to record_id) as the optional body; an in-process signer
  // ignores it, a custody-boundary broker presents it for per-request recompute-binding.
  const sig = signRecordId(record_id, signerOpts, withKey);
  if (!sig) return { ok: false, reason: 'sign-failed (no signer / non-ed25519 key / bad output)' };
  const out = { ...withKey, record_id, sig };
  // additive: attach the audit transport OUTSIDE the signed basis (only when supplied; a no-op otherwise).
  if (audit && (audit.inclusion_proof !== undefined || audit.sth !== undefined || audit.leaf_index !== undefined)) {
    if (audit.inclusion_proof !== undefined) out.inclusion_proof = audit.inclusion_proof;
    if (audit.leaf_index !== undefined) out.leaf_index = audit.leaf_index;
    if (audit.sth !== undefined) out.sth = audit.sth;
  }
  return { ok: true, frame: out };
}

/**
 * The §2 receipt rule. Returns { ok:true, frame } only if ALL of: structural validity;
 * content-address integrity (record_id === computeRecordId(frame)); root_valid (parent_human_uid
 * is a known root, INV-18); and a valid ed25519 signature under the SENDER's registered key.
 *
 * @param {object} frame
 * @param {{registry:object}} ctx
 * @returns {{ok:false,reason:string}|{ok:true,frame:object}}
 */
function receiveFrame(frame, { registry } = {}) {
  if (!frame || typeof frame !== 'object') return { ok: false, reason: 'frame-not-an-object' };
  // Separate the additive, NON-authenticated §7 audit transport from the signed frame. These fields live
  // OUTSIDE the content-address (like sig), so the integrity + auth checks below run over `authFrame` only.
  const { inclusion_proof, leaf_index, sth, ...authFrame } = frame;
  // (1) structural validity
  const v = validateRecord(authFrame);
  if (!v.valid) return { ok: false, reason: 'invalid-frame: ' + (v.errors || []).join('; ') };
  // (2) content-address integrity (the sig is OVER record_id, so a mismatch is tamper/forgery)
  let computed;
  try { computed = computeRecordId(authFrame); } catch { return { ok: false, reason: 'uncomputable' }; }
  if (computed !== authFrame.record_id) return { ok: false, reason: 'record-id-mismatch' };
  // (3) root_valid (INV-18: a known root; the registry RECORDS, it does not mint trust). INGRESS-ONLY: the read
  // chokepoint trust/read-gate.js:verifiedRecords does NOT re-check root_valid -- a deliberate SHADOW-era
  // asymmetry (ADR-0002). Changing the authenticated-record check-set here means revisiting that ADR.
  if (!isKnownRoot(registry, authFrame.parent_human_uid)) return { ok: false, reason: 'unknown-root' };
  // (4) P1 auth: verify under the SENDER's registered key (per-sender; fail-closed if unknown)
  const pub = lookupPublicKey(registry, authFrame.src_persona_did);
  if (!pub) return { ok: false, reason: 'unknown-sender' };
  if (!verifyRecordSig(authFrame.record_id, authFrame.sig, { publicKeyPem: pub })) {
    return { ok: false, reason: 'bad-signature' };
  }
  // (5) §7 audit attachment (additive). ABSENT -> accept with `audited:false` (the OBSERVABLE downgrade — the
  // hook the network phase escalates on). INGRESS-ONLY: verifiedRecords never re-consults the inclusion proof, so
  // the merkle/audit layer gates nothing the trust engine WEIGHTS (audit and compute are disjoint — ADR-0002 Context #1).
  // PRESENT -> it MUST verify (the spec §2 rule applied when present): the
  // sender's STH signature (under its registered key) + the inclusion proof connecting leafHash(record_id) to the
  // STH root at leaf_index. A present-but-INVALID proof => DROP. (Forward contract: the network phase flips the
  // ABSENT branch from accept(audited:false) to drop — same code path, only the absent branch changes.)
  const attached = inclusion_proof !== undefined || sth !== undefined || leaf_index !== undefined;
  if (!attached) return { ok: true, frame: authFrame, audited: false };
  if (!sth || !Array.isArray(inclusion_proof) || !Number.isSafeInteger(leaf_index)) {
    return { ok: false, reason: 'malformed-audit-attachment' };
  }
  if (!verifySTH(sth, pub)) return { ok: false, reason: 'bad-sth' };
  let leaf;
  try { leaf = leafHash(Buffer.from(authFrame.record_id, 'hex')); }
  catch { return { ok: false, reason: 'bad-record-id' }; }
  if (!verifyInclusion(leaf, leaf_index, sth.tree_size, inclusion_proof, sth.root)) {
    return { ok: false, reason: 'bad-inclusion-proof' };
  }
  return { ok: true, frame: authFrame, audited: true };
}

module.exports = { buildFrame, receiveFrame };
