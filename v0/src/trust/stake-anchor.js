// PACT v0 — trust/stake-anchor.js  (plans/20 S1 — the StakeAnchor read-fold)
//
// A derived-on-read VIEW of stake-state (a TRUST-layer fold like direct.js / consensus.js), NEVER a store,
// NEVER an oracle. LAYERING (VALIDATE): it lives in trust/, NOT identity/ — it reads trust/read-gate
// (verifiedRecords) so identity/ (which sits BELOW trust: trust/read-gate imports identity/registry) cannot
// own it without a reverse edge; and the eventual S5 consumer (trust/convert.js) must import it forward.
//
// It reads THROUGH the ONE authenticated-minter read gate (read-gate.js verifiedRecords, INV-14): a STAKE
// counts only if its signature verifies under the SENDER's REGISTERED key. An unsigned / bad-sig /
// unregistered-sender STAKE contributes 0 (store-presence is never provenance — integrity != provenance,
// the #273 family). It keys by rootOf(src_persona_did) (the creator-bound pattern, creator-standing.js:38),
// so a forged parent_human_uid is structurally IGNORED — the stake counts under the SIGNER's real
// registered root, unforgeable without the registered key.
//
// SHADOW: stakeOf is a diagnostic readout — no rank, no edge, no gate. NARROWS, does not harden (plans/20
// §0). recordSlash is RESERVED for S4 and THROWS (a non-vacuous placeholder — a silent no-op could be
// mistaken for a built slash). The S6 on-chain backend swaps the stakeOf SOURCE behind this same interface;
// pluggability lives in the interface, never in the signed record body (no anchor_ref).

'use strict';

const { verifiedRecords } = require('./read-gate');
const { rootOf } = require('../identity/registry');
const { STAKE_TYPE } = require('../identity/stake');

/**
 * @param {{registry:object}} opts  the U1 registry (per-sender verify keys; rootOf keying).
 * @returns {{ stakeOf:Function, recordSlash:Function }}
 */
function createStakeAnchor(opts) {
  const { registry } = opts || {}; // `|| {}` so an explicit null hits the documented validation path
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('createStakeAnchor: a registry is required (per-sender verify keys + rootOf)');
  }

  /**
   * The stake-state of a human root, derived ON READ from the SIG-VERIFIED store. Pure over
   * (verified records, humanUid, nowMs) — deterministic; the returned object is fresh each call.
   * @param {{receiverId:string, stateDir?:string}} storeOpts  the receiver's per-receiver store.
   * @param {string} humanUid  the root whose stake-state to read.
   * @param {number} nowMs  the caller's clock (epoch ms) for the locked/unlocked status.
   * @returns {{status:('none'|'locked'|'unlocked'), lockedUntil:(number|null)}}
   */
  function stakeOf(storeOpts, humanUid, nowMs) {
    if (typeof humanUid !== 'string' || !humanUid) return { status: 'none', lockedUntil: null };
    const recs = verifiedRecords(registry, storeOpts); // (1) provenance gate: sig under registered key (INV-14)
    let lockedUntil = null;
    for (const r of recs) {
      if (!r || r.type !== STAKE_TYPE) continue;                       // (2) the STAKE discriminant (post-provenance)
      if (rootOf(registry, r.src_persona_did) !== humanUid) continue;  // (3) keyed by the SIGNER's registered root
      const le = r.payload && r.payload.lock_expiry;
      if (!Number.isSafeInteger(le) || le < 0) continue;              // skip a malformed lock_expiry (fail-closed)
      if (lockedUntil === null || le > lockedUntil) lockedUntil = le; // (4) max — idempotent under replay (no sum)
    }
    if (lockedUntil === null) return { status: 'none', lockedUntil: null };
    // 'locked' is the conservative default (a non-finite clock never reports a live stake as expired).
    const status = (Number.isFinite(nowMs) && nowMs >= lockedUntil) ? 'unlocked' : 'locked';
    return { status, lockedUntil };
  }

  /**
   * RESERVED for S4 (the gated SLASH). Throws — a non-vacuous placeholder: a silent no-op could be mistaken
   * for a built slash. When S4 lands, a SLASH is ANOTHER append-only record this SAME read-fold subtracts/
   * flips on read (status -> 'slashed'), never a mutated balance (NS-5 preserved).
   */
  function recordSlash() {
    throw new Error('recordSlash: reserved for S4 — SLASH is not built; do not call');
  }

  return { stakeOf, recordSlash };
}

module.exports = { createStakeAnchor };
