// PACT v0 -- identity/sigma-root.js  (spec §1.1 -- the DESIGNED-but-UNBUILT persona<->key root-signature)
//
// sigma_root proves KEY-AUTHORIZATION: "the holder of root key K_root authorized K_pub as persona P under
// controller H." It is the SHADOW verification primitive of the registration-provenance apex (plans/32 W1). It
// NARROWS in-process and HARDENS only when the root key is world-anchored out-of-band (OQ-NS-6/NS-7) -- the
// primitive itself can NEVER assert that; it only computes the crypto fact. It reuses the earned ed25519
// mechanism verbatim (edge-attestation.js: alg-pinned, canonical-base64, 64-byte gate, per-key resolution,
// fail-closed -- NS-10), signing a canonical, domain-separated content-address of the (persona, key, controller)
// triple.

'use strict';

const { sha256hex, canonicalJsonSerialize } = require('../lib/record');
const { signRecordId, verifyRecordSig } = require('../lib/edge-attestation');

// A domain-separation tag (VERIFY architect HIGH; refined by VALIDATE hacker NIT-1). A sigma_root and a frame
// record_id are BOTH ed25519 over a 64-hex sha256(canonicalJson(...)) signed by the same signRecordId -- a
// cross-protocol signature-reuse surface. The load-bearing separator against a VALID frame is the DISJOINT
// required-field set (a frame REQUIRES ver/type/src_persona_did/parent_human_uid/seq/nonce -- record-schema.json;
// its canonical form can never equal a binding's). computeRecordId is field-AGNOSTIC, so a hand-crafted non-frame
// object COULD be made to collide -- but that is not a reachable frame. The _type tag is explicit defense-in-depth
// ON TOP of that disjointness (and future-proofs against a frame variant that drops a required field); the `.v1`
// versions the FROZEN preimage so a future rotation-epoch format is a clean `.v2`, never a break.
const BINDING_TYPE = 'pact.sigma_root.binding.v1';

// Full type-gate (VERIFY hacker M1): a bare `!v` truthiness test passes `[]`/`{}` (LIVE-PROVEN), letting non-key
// garbage into the signed set. Require a non-empty STRING, exactly as registry.js:46-48 / edge-attestation.js:45.
function requireField(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('sigma-root: ' + name + ' required (non-empty string)');
  }
  return v;
}

/**
 * The 64-hex content-address of a persona<->key binding = sha256(canonical({_type, controller, k_pub,
 * persona_did})). Injective (sorted-key quoted JSON, never string concat) + domain-separated (the _type tag).
 * @throws {TypeError} on any missing / non-string / empty field (M1).
 */
function computeBindingId({ personaDid, publicKeyPem, controller } = {}) {
  requireField(personaDid, 'personaDid');
  requireField(publicKeyPem, 'publicKeyPem');
  requireField(controller, 'controller');
  return sha256hex(canonicalJsonSerialize({
    _type: BINDING_TYPE,
    controller,
    k_pub: publicKeyPem,
    persona_did: personaDid,
  }));
}

/**
 * Sign a binding as its root: base64 ed25519 sigma_root, or null. rootSignerOpts = { privateKeyPem } (test /
 * provisioning) OR { signer } (a custody-boundary root signer -- the cross-uid sigma-root broker, plans/42 W1b).
 * Fail-soft -> null (NEVER throws): computeBindingId can throw on a bad field, so it is WRAPPED (VERIFY hacker C1).
 *
 * The ALREADY-VALIDATED `binding` object is threaded as signRecordId's 3rd `body` arg (plans/42 W1b Piece C):
 * a custody-boundary { signer } forwards it on the broker child's stdin so the sigma-root broker can
 * recompute-bind (computeBindingId(body) === the signed id) -- the binding analogue of R2-WHAT. Back-compat
 * (Open/Closed): the in-process { privateKeyPem } path's resolveSigner closure is single-arg and IGNORES the
 * body, so every existing { privateKeyPem } caller is unaffected (proven: all 11 call sites pass privateKeyPem).
 */
function signSigmaRoot(binding, rootSignerOpts) {
  let bindingId;
  try { bindingId = computeBindingId(binding); } catch { return null; }
  return signRecordId(bindingId, rootSignerOpts || {}, binding);
}

/**
 * Verify a sigma_root over the binding under the root PUBLIC key. Fail-CLOSED boolean, NEVER throws.
 * computeBindingId is WRAPPED in try/catch -> false (VERIFY hacker C1 -- copies the record.js:112-118
 * deriveIdempotencyKey fail-closed template): a consumer swallowing a propagated throw around a pre-truthy
 * pass-flag would fail OPEN. Any missing input, a wrong / non-ed25519 root key, or a tampered binding -> false.
 */
function verifySigmaRoot(facts) {
  // ONE positional arg + a type-guard, then destructure INSIDE the try (VALIDATE hacker H-1). Destructuring in
  // the signature (`({...} = {})`) throws on a null arg (the `= {}` default fills only undefined) and fires a
  // throwing getter OUTSIDE any try -- a consumer swallowing that throw around a pre-truthy pass-flag fails OPEN
  // (the exact failure this fold exists to prevent). The whole read+verify is wrapped so ANY throw -> false.
  if (!facts || typeof facts !== 'object') return false;
  try {
    const { personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem } = facts;
    if (typeof rootPublicKeyPem !== 'string' || rootPublicKeyPem.length === 0) return false;
    if (typeof sigmaRoot !== 'string' || sigmaRoot.length === 0) return false;
    return verifyRecordSig(computeBindingId({ personaDid, publicKeyPem, controller }), sigmaRoot, { publicKeyPem: rootPublicKeyPem });
  } catch { return false; }
}

module.exports = { BINDING_TYPE, computeBindingId, signSigmaRoot, verifySigmaRoot };
