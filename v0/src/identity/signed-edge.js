// PACT v0 -- identity/signed-edge.js  (plans/35 W1 -- the freshness-bound signed-edge PRODUCER)
//
// A pure, KEY-FREE spec-builder (the stake.js/slash.js shape): it assembles a VOUCH minter spec whose freshness
// fields live INSIDE the frame body (Option A, the W1 design-exploration architect). Fed to
// createMinter(...).mint(spec), the existing buildFrame folds payload.freshness into record_id (frame.js:56) and
// the custody signer signs THAT (frame.js:60) -- so the ONE existing ed25519 signature binds the freshness. This
// module holds NO key/signer; the minter's injected custody signer does all signing (the producer/minter split).
//
// Option A binds freshness via the frame sig over record_id, so W0's computeEdgeFreshnessBasis/verifyFreshEdge (the
// separate basis-sig half) are NOT used -- only checkFreshnessWindow is (W2's read-gate predicate). See the DORMANT
// note in lib/edge-freshness.js.
//
// HONEST SCOPE (NS-9): SHADOW/dormant -- no fold mints via this yet (signed-edge-darkness-witness). A freshness-
// bound edge proves INTEGRITY (the frame sig binds freshness), NOT PROVENANCE -- a same-uid host co-forges a
// byte-identical fresh edge under its OWN persona until a deployed cross-uid signer (the #273 family; UNCHANGED by
// W1). Once W2 reads the window this NARROWS replay to a <=TTL bound (never one-shot enforcement); today it gates nothing.

'use strict';

const { isValidNonce, MIN_NONCE_LEN } = require('../lib/edge-freshness');

const VOUCH_TYPE = 'VOUCH';

// Full type-gate, fail-closed at the boundary (mirror stake.js:25-27 / the W0 lesson: [] / {} pass a bare !v).
function requireNonEmptyString(v, name) {
  // reject whitespace-ONLY too (CodeRabbit): a '   ' target/keyId is meaningless garbage, and accepting it is
  // inconsistent with isValidNonce's trim-cleanliness for the freshness nonce (the module's fail-closed intent).
  if (typeof v !== 'string' || v.trim().length === 0) throw new TypeError('signed-edge: ' + name + ' must be a non-empty (non-whitespace) string');
  return v;
}
function requireFiniteNumber(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('signed-edge: ' + name + ' must be a finite number');
  return v;
}

/**
 * Build a minter spec for a freshness-bound VOUCH. PURE + key-free + fail-closed. The freshness triple nests under
 * `payload.freshness` so buildFrame's content-address (record_id) covers it and the frame sig binds it (Option A).
 *
 * TWO DISTINCT NONCES (VERIFY-hacker M1): the frame-level `nonce` (INV-22 identity, record.js:111) vs
 * `payload.freshness.nonce` (the replay one-shot the W2 window/consume-store reads). Independent by design; the
 * caller MAY set them equal, but they are different roles.
 *
 * @param {{targetPersona:string, approvedAt:number, freshnessNonce:string, keyId:string, seq:number, nonce:string}} opts
 *   freshnessNonce -- the replay one-shot; MUST pass W0's isValidNonce (whitespace-clean, >= MIN_NONCE_LEN). DRY:
 *   the floor is imported from edge-freshness, never re-implemented.
 * @returns {{type:string, payload:{target_persona:string, freshness:{approved_at:number, nonce:string, key_id:string}}, seq:number, nonce:string}}
 * @throws {TypeError} on any malformed freshness/target field. seq/nonce pass through UNVALIDATED (the stake.js
 *   producer convention -- no producer validates the frame nonce/seq); the frame's required[] is enforced on READ
 *   by receiveFrame, NOT at mint time -- a spec omitting seq/nonce mints a valid-looking frame that receiveFrame
 *   then REJECTS (fail-closed on read, VALIDATE code-reviewer). The producer's OWN boundary is the freshness/target fields.
 */
function buildSignedVouchSpec(opts) {
  // `|| {}` so an explicit null hits the documented validation path (mirrors stake.js:24).
  const { targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce } = opts || {};
  requireNonEmptyString(targetPersona, 'targetPersona');
  requireFiniteNumber(approvedAt, 'approvedAt');
  if (!isValidNonce(freshnessNonce)) {
    throw new TypeError('signed-edge: freshnessNonce must be a whitespace-clean string of >= ' + MIN_NONCE_LEN + ' chars (W0 isValidNonce)');
  }
  requireNonEmptyString(keyId, 'keyId');
  return {
    type: VOUCH_TYPE,
    payload: {
      target_persona: targetPersona,
      freshness: { approved_at: approvedAt, nonce: freshnessNonce, key_id: keyId },
    },
    seq,
    nonce,
  };
}

module.exports = { VOUCH_TYPE, buildSignedVouchSpec };
