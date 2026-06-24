// PACT v0 — trust/issuance-policy.js  (plans/21 S3 — the stake-aware issuance ADVISORY readout)
//
// A derived-on-read advisory VIEW of a root's issuance standing (a TRUST-layer readout like convert.js /
// creator-standing.js), NEVER a store, NEVER an oracle, NEVER a gate. Given a human root it answers ONE
// question: does the root meet a receiver's issuance bar — `no-stake` (the v0 bar: registration alone) or
// `stake-required` (a verified, currently-locked STAKE over the root exists)?
//
// LAYERING: it lives in trust/, NOT identity/ (the blueprint's nominal home). It consumes the stakeOf fold via a
// DI-INJECTED anchor (NOT a static import) and statically imports only identity/registry (isKnownRoot); identity/
// sits BELOW trust (trust/read-gate imports identity/registry), so an identity/ home would be a reverse edge. The
// DI seam (any object exposing stakeOf) is also what lets the S6 on-chain backend swap in. registry.js stays the
// pure record seam --
// registerPersona is UNTOUCHED (registry-not-oracle, INV-18). The bootstrap-brick wiring (registry.js reading
// this policy) is mechanically forbidden by the identity->trust layering ban (layering.test.js).
//
// PROVENANCE is inherited wholesale from S1-S2: stake-state enters ONLY through anchor.stakeOf, which reads
// THROUGH verifiedRecords (sig under the registered key, INV-14) keyed by rootOf(src_persona_did). A forged /
// unsigned STAKE contributes 0 — this policy cannot launder a forged stake into "meets" (integrity != provenance,
// the #273 family). No new key path, no parallel store (NS-10).
//
// SHADOW: every readout carries gates:false (a DOCUMENTARY marker — the SHADOW guarantee is the whole-tree
// import test in the suite, not this literal a caller may ignore). meets_policy is a scarcity/cost axis
// (axis-1 family) — it is NEVER read as epistemic independence (axis 4), NEVER feeds mayGate, and NEVER gates an
// action. NARROWS, does not harden (only a really-deployed S6 leans toward hardening — plans/21 §0; NS-9).

'use strict';

const { isKnownRoot } = require('../identity/registry');

/** The two issuance bars. Frozen — `mode` is compared by strict string identity, never `.includes`. */
const POLICY_MODES = Object.freeze({ NO_STAKE: 'no-stake', STAKE_REQUIRED: 'stake-required' });

/**
 * The pure issuance-policy DECISION — a STRICT BOOLEAN, fail-closed on an unknown mode. Exported so the
 * fail-closed property is directly unit-testable (a mode smuggled past createIssuancePolicy's construction
 * check must THROW here, never yield `undefined` — VERIFY hacker HIGH-1). No I/O, no gate; just the verdict.
 * @param {{mode:string, known:boolean, stake:{status?:string}}} args
 * @returns {boolean}
 */
function meetsPolicy({ mode, known, stake }) {
  switch (mode) {
    case POLICY_MODES.NO_STAKE:
      return known === true;                                                  // the v0 bar: registration alone
    case POLICY_MODES.STAKE_REQUIRED:
      // STRICT === 'locked' (never .includes/truthiness): an unlocked/none/malformed status does NOT meet.
      return known === true && !!stake && stake.status === 'locked';
    default:
      throw new Error('issuance-policy: unknown policy mode: ' + mode);       // fail-closed — no third truth-value
  }
}

/** Human-readable only — NEVER a machine-branch surface (recover outcomes from {known, stake.status, meets}). */
function reasonFor(mode, known, stake, meets) {
  if (mode === POLICY_MODES.NO_STAKE) return known ? 'no-stake: registration alone (v0 bar)' : 'no-stake: unknown root';
  if (!known) return 'stake-required: unknown root';
  if (meets) return 'stake-required: a verified locked STAKE is present (PRESENCE, not forfeitable cost -- SHADOW)';
  const status = stake && stake.status;
  if (status === 'slashed') return 'stake-required: STAKE slashed (forfeited by the crater quorum)';
  return 'stake-required: no locked STAKE (bootstrap or unstaked) -- ' + status;
}

/**
 * @param {{registry:object, anchor:{stakeOf:Function}, mode?:string}} opts
 *   registry — the U1 registry (isKnownRoot); anchor — a StakeAnchor (DI: any object exposing stakeOf, so the
 *   S6 on-chain backend swaps in behind the same interface); mode — default 'no-stake' (additive, non-breaking).
 * @returns {{ evaluate:Function }}
 */
function createIssuancePolicy(opts) {
  const { registry, anchor, mode } = opts || {}; // `|| {}` so an explicit null hits the documented validation path
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('createIssuancePolicy: a registry is required (isKnownRoot keying)');
  }
  if (!anchor || typeof anchor !== 'object' || typeof anchor.stakeOf !== 'function') {
    throw new TypeError('createIssuancePolicy: an anchor exposing a stakeOf(...) function is required (DI seam)');
  }
  const resolvedMode = mode === undefined ? POLICY_MODES.NO_STAKE : mode;
  // fail-FAST at wiring (sibling-consistent with createStakeAnchor's registry check). evaluate ALSO re-checks
  // via meetsPolicy's exhaustive switch (defense-in-depth — a mode mutated post-construction still fails closed).
  if (resolvedMode !== POLICY_MODES.NO_STAKE && resolvedMode !== POLICY_MODES.STAKE_REQUIRED) {
    throw new Error('createIssuancePolicy: unknown policy mode: ' + resolvedMode);
  }

  /**
   * The issuance standing of a human root, derived ON READ. Pure over (verified records, humanUid, nowMs, mode);
   * the return is a FRESH object each call (mutating it is harmless — two reads equal). NEVER mutates, NEVER gates.
   * @param {{receiverId:string, stateDir?:string}} storeOpts  the RECEIVER-VIEW selector threaded through to
   *   stakeOf (which receiver's verified log to read; NS-3 receiver-relative) — NOT a policy-config param. See
   *   the stake-anchor.js header: it is supplied PER CALL by design (the anchor is stateless, reused per receiver).
   * @param {string} humanUid  the root whose issuance standing to read.
   * @param {number} nowMs  the caller's clock (for the locked/unlocked status, via stakeOf).
   * @returns {{advisory:boolean, policy:string, known:boolean, stake:object, meets_policy:boolean, gates:boolean, reason:string}}
   */
  function evaluate(storeOpts, humanUid, nowMs) {
    const known = isKnownRoot(registry, humanUid);                 // the v0 admission fact (garbage uid -> false)
    const stake = anchor.stakeOf(storeOpts, humanUid, nowMs);      // provenance-clean; called UNCONDITIONALLY (KISS)
    const meets = meetsPolicy({ mode: resolvedMode, known, stake });
    return {
      advisory: true,                  // SHADOW — a diagnostic readout, never a hard promotion
      policy: resolvedMode,
      known,
      stake,                           // {status, lockedUntil} — meaningful only relative to known:true
      meets_policy: meets,             // a scarcity/cost axis (axis-1) — NEVER epistemic independence (axis 4)
      gates: false,                    // documentary marker (mirrors convert.actionable:false); enforcement = the import test
      reason: reasonFor(resolvedMode, known, stake, meets),
    };
  }

  return { evaluate };
}

module.exports = { createIssuancePolicy, meetsPolicy, POLICY_MODES };
