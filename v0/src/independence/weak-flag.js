// PACT P2 — independence/weak-flag.js  (spec §4.5 — the v1.1 rev's spine; first consumed here)
//
// Independence is THREE predicates, not one word. v0 shipped no consumer; P2 is the first. Only the
// TOPOLOGICAL axis is computable; EPISTEMIC (U2) and CONFIG-STABILITY are [OPEN] → permanently WEAK
// until P5. The consumer obligation (INV-16): a WEAK record may INFORM but NEVER GATE a high-stakes
// action — and NEVER read the AND of axes 1-3 as a substitute for axis 4 (epistemic). This module
// depends ONLY on its inputs (no dependency on trust/ — a one-way DAG; it is a pure leaf).

'use strict';

/**
 * Build the independence label for a record/edge. `topological` is the computed value (a max-flow
 * disjoint-path count, §convert). Every other axis is WEAK in P2.
 * @param {{topological:number}} axes
 */
function independenceLabel({ topological }) {
  return {
    topological: typeof topological === 'number' ? topological : 0, // computed (Menger max-flow)
    epistemic: 'WEAK',         // U2 — no substrate-diversity estimator (P5)
    config_stability: 'WEAK',  // self-asserted config_hash, no attestation (P5)
    overall: 'WEAK',           // ANY WEAK axis ⇒ overall WEAK (always WEAK until P5)
  };
}

/**
 * The consumer obligation. A WEAK record may inform, never GATE a high-stakes action. The CALLER
 * asserts `highStakes` — P2 owns NO stakes threshold (that relocated throne is named + bound at P3).
 * In P2 every label is WEAK, so this refuses every high-stakes caller (fail-closed).
 * @param {object} label  an independenceLabel
 * @param {{highStakes:boolean}} ctx
 * @returns {boolean} true iff acting is permitted
 */
function mayGate(label, { highStakes } = {}) {
  // AUTHORITATIVE: do NOT trust a caller-supplied label.overall (a forged {overall:'STRONG'} must not
  // unlock a gate — post-build VALIDATE MINOR). In P2 the epistemic axis (axis 4) is ALWAYS WEAK
  // (U2 open), independent of any label, so a high-stakes action is ALWAYS refused (fail-closed).
  void label; // kept for the P3 interface (real axes); the P2 gate decision does not depend on it
  if (highStakes && epistemicIndependence() === 'WEAK') return false;
  return true;
}

/**
 * Guard against the live correctness cliff: NEVER read AND(axis1, axis2, axis3) as epistemic
 * independence (axis 4). Returns the honest epistemic verdict, which is always WEAK in P2 regardless
 * of how strong the scarcity/topology/stability axes look.
 *
 * *** P5 LIFT-POINT (the single most load-bearing line of the forward contract): this is the SOLE
 * function the U2 substrate-diversity estimator replaces. Everything downstream (mayGate, every
 * SHADOW weight, the eventual convert.actionable flip) reads through here — so the WEAK flag lifts
 * here and ONLY here. Do not scatter epistemic judgments elsewhere. ***
 */
function epistemicIndependence() {
  return 'WEAK'; // axis 4 is OPEN; the cheap axes can never substitute for it (until P5 replaces THIS fn)
}

module.exports = { independenceLabel, mayGate, epistemicIndependence };
