// PACT P-minter -- identity/mint-fresh-vouch.js  (plans/37 W3 -- the live-edge minting harness)
//
// The thin composition that wires the W1 producer (signed-edge.buildSignedVouchSpec) into the real mint path:
// buildSignedVouchSpec -> createMinter(...).mint() -> a signed, freshness-bound VOUCH frame. MINT-ONLY -- it does
// NOT appendRecord / verify / weight (those are receiver/context-relative, a different responsibility -- they live
// in the proof + the deploy). It adds NO validation of its own: both callees fail-closed at the boundary
// (createMinter rejects a non-function signer / a binding override / raw key material; buildSignedVouchSpec rejects
// malformed freshness). Its SINGLE responsibility is composition.
//
// SHADOW / DORMANT (NS-9): no src module requires this (mint-fresh-vouch-darkness-witness); its consumers are the
// W3 proof, W4's proof board, and the future deploy runbook -- NEVER the live convert/read-gate path. It proves
// the MECHANISM, NOT provenance: the `signer` is INJECTED -- a local SAME-UID keypair in the SHADOW test, a
// cross-uid broker/enclave/HSM signer ONLY at deploy (NS-7). A same-uid holder mints AUTHENTIC fresh VOUCHes under
// its OWN key, so the co-forge ceiling is UNCHANGED (integrity != provenance, the #273 family; signed-edge.js:14-16).
// Provenance is real ONLY when the signer routes to a cross-uid boundary. The minted edge lands in a store but
// GATES NOTHING (convert.actionable is hard-false). "The edge proves WHO signed it" is FALSE in general -- the
// registry P<->key binding is host-writable (plans/30 §2 leg 5); this proves key-custody of the frame sig ONLY.

'use strict';

const { buildSignedVouchSpec } = require('./signed-edge');
const { createMinter } = require('./minter');

/**
 * Mint a freshness-bound VOUCH via the injected signer. Composition only -- no append, no verify, no key material.
 * @param {{signer:Function, personaDid:string, humanUid:string, targetPersona:string, approvedAt:number,
 *          freshnessNonce:string, keyId:string, seq:number, nonce:string}} opts
 *   signer/personaDid/humanUid -> createMinter (the custody boundary + the throne binding).
 *   targetPersona/approvedAt/freshnessNonce/keyId/seq/nonce -> buildSignedVouchSpec (the W1 producer, deploy-sourced;
 *   NEVER hardcoded here). `approvedAt` is the PRODUCER-side deploy constant -- orthogonal to W2's READER-side
 *   {now, ttlMs}.
 * @returns {{ok:false,reason:string}|{ok:true,frame:object}}
 * @throws {TypeError} on malformed opts -- fail-CLOSED FROM the callee (a producer, not the total read-side filter):
 *   buildSignedVouchSpec is called FIRST so a freshness error surfaces before the minter is constructed.
 */
function mintFreshVouch(opts) {
  const { signer, personaDid, humanUid, targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce } = opts || {};
  const spec = buildSignedVouchSpec({ targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce });
  const minter = createMinter({ signer, personaDid, humanUid });
  return minter.mint(spec);   // buildFrame folds payload.freshness into record_id; the injected signer signs it
}

module.exports = { mintFreshVouch };
