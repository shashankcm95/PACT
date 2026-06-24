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
// §0). S4 (plans/23): stakeOf is SLASH-aware — a root's REAL stake reads 'slashed' when >=2 DISTINCT
// earned-standing human roots have slashed it (the crater quorum, reusing trust/standing.js + the
// rootOf-keyed >=2 rule, direct.js). A SLASH is an append-only RECORD the fold reads (never a mutation,
// NS-5); slashing is done by minting a SLASH (identity/slash.js + the minter), not a method — so the old
// recordSlash placeholder is removed. The S6 on-chain backend swaps the stakeOf SOURCE behind this same
// interface; pluggability lives in the interface, never in the signed record body (no anchor_ref).

'use strict';

const { verifiedRecords } = require('./read-gate');
const { rootOf } = require('../identity/registry');
const { STAKE_TYPE } = require('../identity/stake');
const { SLASH_TYPE } = require('../identity/slash');
const { earnedStandingPersonas } = require('./standing');

/**
 * @param {{registry:object}} opts  the U1 registry (per-sender verify keys; rootOf keying).
 * @returns {{ stakeOf:Function }}
 */
function createStakeAnchor(opts) {
  const { registry } = opts || {}; // `|| {}` so an explicit null hits the documented validation path
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('createStakeAnchor: a registry is required (per-sender verify keys + rootOf)');
  }

  /**
   * Is one of the root's REAL stakes (`stakeIds`) slashed by the crater quorum? TRUE iff >=2 DISTINCT human
   * roots each minted a SLASH that (a) resolves to a real STAKE of this root (the F3-analog — closes
   * pre-positioning), (b) carries a non-empty string `reason` (L8 — the read-side gate; the store is not a
   * sandbox, never trust the producer), (c) was SIGNED BY A PERSONA WITH EARNED STANDING (that persona itself
   * authored >=1 CLAIM). Earned standing is PERSONA-scoped; the COUNT is re-keyed to HUMAN `rootOf` (a Sybil's
   * N personas = ONE root) — the canonical Sybil-gate pattern (direct.js:83 + cross-verify / creator-standing
   * / premise-score all gate `earned.has(src_persona_did)` then count by `rootOf`), so slander is as costly as
   * support: the ACCUSER must have its OWN skin (a CLAIM), not merely belong to a root that earned it elsewhere.
   * Exact `>= 2` over a deduped Set.
   */
  function isSlashed(recs, stakeIds) {
    const earned = earnedStandingPersonas(recs);
    const slasherRoots = new Set();
    for (const r of recs) {
      if (!r || r.type !== SLASH_TYPE || !r.payload) continue;                  // missing-payload SLASH contributes 0
      if (!stakeIds.has(r.payload.target_stake_id)) continue;                   // F3: resolves to a REAL stake of this root
      const reason = r.payload.reason;
      if (typeof reason !== 'string' || reason.trim().length === 0) continue;   // L8: a real counterexample, not truthy
      if (!earned.has(r.src_persona_did)) continue;                            // earned standing only (anti-grief)
      const sr = rootOf(registry, r.src_persona_did);
      if (sr) slasherRoots.add(sr);                                            // keyed by HUMAN; skip a null root
    }
    return slasherRoots.size >= 2;                                            // the crater threshold (exact, deduped)
  }

  /**
   * The stake-state of a human root, derived ON READ from the SIG-VERIFIED store. Pure over
   * (verified records, humanUid, nowMs) — deterministic; the returned object is fresh each call.
   * @param {{receiverId:string, stateDir?:string}} storeOpts  the receiver's per-receiver store.
   * @param {string} humanUid  the root whose stake-state to read.
   * @param {number} nowMs  the caller's clock (epoch ms) for the locked/unlocked status.
   * @returns {{status:('none'|'locked'|'unlocked'|'slashed'), lockedUntil:(number|null)}}
   */
  function stakeOf(storeOpts, humanUid, nowMs) {
    if (typeof humanUid !== 'string' || !humanUid) return { status: 'none', lockedUntil: null };
    const recs = verifiedRecords(registry, storeOpts); // (1) provenance gate: sig under registered key (INV-14)
    let lockedUntil = null;
    const stakeIds = new Set(); // (S4) the root's real STAKE record_ids — the F3-resolution set
    for (const r of recs) {
      if (!r || r.type !== STAKE_TYPE) continue;                       // (2) the STAKE discriminant (post-provenance)
      if (rootOf(registry, r.src_persona_did) !== humanUid) continue;  // (3) keyed by the SIGNER's registered root
      const le = r.payload && r.payload.lock_expiry;
      if (!Number.isSafeInteger(le) || le < 0) continue;              // skip a malformed lock_expiry (fail-closed)
      stakeIds.add(r.record_id);                                      // a real, slashable stake of this root
      if (lockedUntil === null || le > lockedUntil) lockedUntil = le; // (4) max — idempotent under replay (no sum)
    }
    if (lockedUntil === null) return { status: 'none', lockedUntil: null }; // no stake -> no phantom slash (F3 in-scope)
    // 'slashed' overrides BOTH 'locked' and 'unlocked' — a slash forfeits the commitment whether or not the
    // lock window is live; lockedUntil is still returned for auditability.
    if (isSlashed(recs, stakeIds)) return { status: 'slashed', lockedUntil };
    // 'locked' is the conservative default (a non-finite clock never reports a live stake as expired).
    const status = (Number.isFinite(nowMs) && nowMs >= lockedUntil) ? 'unlocked' : 'locked';
    return { status, lockedUntil };
  }

  return { stakeOf };
}

module.exports = { createStakeAnchor };
