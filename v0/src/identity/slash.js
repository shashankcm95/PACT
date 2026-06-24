// PACT v0 — identity/slash.js  (plans/23 S4 — the SLASH record producer)
//
// A SLASH is a CONTEST-shaped forfeiture record: an EARNED-STANDING root attests that a staked root defected
// w.r.t. a SPECIFIC stake (by its content-addressed `target_stake_id`). It is read by the SLASH-aware stakeOf
// (stake-anchor.js): a root's stake reads 'slashed' only when >=2 DISTINCT earned-standing human roots have
// slashed a REAL stake of that root (the crater quorum — a counterexample, not a popularity vote, L8). This
// module is a thin producer (imports nothing, holds no key); the SLASH is signed through the custody minter
// (minter.mint(buildSlashSpec(...))), exactly like a STAKE. The slasher's root is the minter-bound
// parent_human_uid; the slash counts under the SIGNER's registered root (rootOf), unforgeable.

'use strict';

const SLASH_TYPE = 'SLASH';

/**
 * Build a SLASH spec for the custody minter. The `target_stake_id` MUST be the content-addressed `record_id`
 * of a REAL, already-existing STAKE of the root being slashed (the F3-analog: a slash points at a real
 * forfeitable commitment, just as a CONTEST points at a real claim — a slash of a non-existent stake is
 * IGNORED on read, closing pre-positioning). `reason` is the REQUIRED in-scope counterexample (L8).
 * @param {{targetStakeId:string, reason:string, seq:number, nonce:string}} opts
 * @returns {{type:string, payload:{target_stake_id:string, reason:string}, seq:number, nonce:string}}
 */
function buildSlashSpec(opts) {
  const { targetStakeId, reason, seq, nonce } = opts || {}; // `|| {}` so an explicit null hits the documented throw
  if (typeof targetStakeId !== 'string' || targetStakeId.length === 0) {
    throw new TypeError('buildSlashSpec: target_stake_id must be a non-empty string (a STAKE record_id)');
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new TypeError('buildSlashSpec: reason must be a non-empty (non-blank) string — a slash REQUIRES a counterexample (L8)');
  }
  return { type: SLASH_TYPE, payload: { target_stake_id: targetStakeId, reason }, seq, nonce };
}

module.exports = { SLASH_TYPE, buildSlashSpec };
