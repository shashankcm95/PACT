// PACT v0 — identity/stake.js  (plans/20 S2 — the U1 issuance-stake COMMITMENT record)
//
// A STAKE is a custody-signed, root-bound PRESENCE/COMMITMENT record: "this human root has posted a
// stake commitment, locked until lock_expiry". S1-S2 carry NO amount and NO anchor_ref — D5
// (creator-standing.js:8-10): a self-asserted economic-cost field is forgeable (a {stake:1e9} body scores
// identically), so the in-memory stake is HONESTLY just a presence/lock marker. The amount-at-risk is BORN
// at S6 (a chain-settled deposit), added then as an additive payload field. SHADOW — NARROWS, does not
// harden (plans/18 §0; only a really-deployed S6 leans toward hardening). This module holds NO key/signer:
// a STAKE is minted via the custody minter (createMinter(...).mint(buildStakeSpec(...))) so its root is the
// minter's bound parent_human_uid — non-transferable by construction.

'use strict';

const STAKE_TYPE = 'STAKE';

/**
 * Build a minter spec for a STAKE commitment. Boundary-validated, fail-closed.
 * @param {{lockExpiry:number, seq:number, nonce:string}} opts
 *   lockExpiry — the commitment window end (epoch ms); a non-negative SAFE integer.
 * @returns {{type:string, payload:{lock_expiry:number}, seq:number, nonce:string}}
 * @throws {TypeError} on a non-integer / negative / unsafe lockExpiry — never produce a bad spec.
 */
function buildStakeSpec(opts) {
  const { lockExpiry, seq, nonce } = opts || {}; // `|| {}` so an explicit null hits the documented validation path
  if (!Number.isSafeInteger(lockExpiry) || lockExpiry < 0) {
    throw new TypeError('buildStakeSpec: lockExpiry must be a non-negative safe integer (epoch ms)');
  }
  // type + payload + the frame's seq/nonce; the minter binds src_persona_did + parent_human_uid (the root).
  return { type: STAKE_TYPE, payload: { lock_expiry: lockExpiry }, seq, nonce };
}

module.exports = { STAKE_TYPE, buildStakeSpec };
