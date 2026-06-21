// PACT v0 — frame/frame.js  (spec §2)
//
// The minimal authenticated frame carrying a Claim payload (§3). buildFrame assembles + signs;
// receiveFrame is the §2 receipt rule: verify(SIG) ∧ content-integrity ∧ root_valid. P1 only —
// it proves WHO + UNTAMPERED + a known root, NEVER that the payload is true (that is the ATMS's
// job, §3). Per-sender verify key resolution from the U1 registry (no shared default).

'use strict';

const { computeRecordId, deriveIdempotencyKey, validateRecord } = require('../lib/record');
const { signRecordId, verifyRecordSig } = require('../lib/edge-attestation');
const { isKnownRoot, lookupPublicKey } = require('../identity/registry');

/**
 * Assemble + sign a frame. record_id is the content-address (excludes record_id + sig); sig is
 * ed25519 over record_id via the signer seam (signerOpts: {privateKeyPem} or {signer} — Option B).
 *
 * @param {{ver?:string, type?:string, srcPersonaDid:string, parentHumanUid:string, seq:number, nonce:string, payload:any}} spec
 * @param {{privateKeyPem?:string, signer?:Function}} signerOpts
 * @returns {{ok:false,reason:string}|{ok:true,frame:object}}
 */
function buildFrame(spec, signerOpts = {}) {
  const { ver = 'pact/0', type = 'CLAIM', srcPersonaDid, parentHumanUid, seq, nonce, payload } = spec || {};
  const body = {
    ver, type,
    src_persona_did: srcPersonaDid,
    parent_human_uid: parentHumanUid,
    seq, nonce, payload,
  };
  const idempotency_key = deriveIdempotencyKey(body); // internally fail-soft -> null on a deep payload
  const withKey = idempotency_key ? { ...body, idempotency_key } : { ...body };
  let record_id;
  try { record_id = computeRecordId(withKey); } // a pathologically deep payload trips the canonical
  catch { return { ok: false, reason: 'uncomputable-payload' }; } // bound — fail-closed, symmetric w/ receiveFrame
  const sig = signRecordId(record_id, signerOpts);
  if (!sig) return { ok: false, reason: 'sign-failed (no signer / non-ed25519 key / bad output)' };
  return { ok: true, frame: { ...withKey, record_id, sig } };
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
  // (1) structural validity
  const v = validateRecord(frame);
  if (!v.valid) return { ok: false, reason: 'invalid-frame: ' + (v.errors || []).join('; ') };
  // (2) content-address integrity (the sig is OVER record_id, so a mismatch is tamper/forgery)
  let computed;
  try { computed = computeRecordId(frame); } catch { return { ok: false, reason: 'uncomputable' }; }
  if (computed !== frame.record_id) return { ok: false, reason: 'record-id-mismatch' };
  // (3) root_valid (INV-18: a known root; the registry RECORDS, it does not mint trust)
  if (!isKnownRoot(registry, frame.parent_human_uid)) return { ok: false, reason: 'unknown-root' };
  // (4) P1 auth: verify under the SENDER's registered key (per-sender; fail-closed if unknown)
  const pub = lookupPublicKey(registry, frame.src_persona_did);
  if (!pub) return { ok: false, reason: 'unknown-sender' };
  if (!verifyRecordSig(frame.record_id, frame.sig, { publicKeyPem: pub })) {
    return { ok: false, reason: 'bad-signature' };
  }
  return { ok: true, frame };
}

module.exports = { buildFrame, receiveFrame };
