// PACT P2 — independence/weak-flag.js  (spec §4.5 — the v1.1 rev's spine; first consumed here)
//
// Independence is THREE predicates, not one word. v0 shipped no consumer; P2 was the first (plans/12/PR#7 added the DI seam + two label-consumers). Only the
// TOPOLOGICAL axis is computable; EPISTEMIC (U2) and CONFIG-STABILITY are [OPEN] → permanently WEAK
// until P5. The consumer obligation (INV-16): a WEAK record may INFORM but NEVER GATE a high-stakes
// action — and NEVER read the AND of axes 1-3 as a substitute for axis 4 (epistemic). This module
// depends ONLY on its inputs (no dependency on trust/ — a one-way DAG; it is a pure leaf).

'use strict';

/**
 * Build the independence label for a record/edge. `topological` is the computed value (a max-flow
 * disjoint-path COUNT, §convert) — a count, NEVER a verdict. The two OPEN axes (epistemic, config_stability)
 * DERIVE from their lift-points, never hardcoded literals (plans/12): so when the U2 estimator replaces
 * `epistemicIndependence()` at P5, the label lifts everywhere — the "lifts here and ONLY here" contract is
 * true in code. The optional `{ verdictFn, configFn }` is the DI seam (defaults = the lift-points): a test
 * injects a sentinel to PROVE derivation (a same-module call cannot be stubbed via `module.exports`); the
 * future per-record estimator becomes the new default `verdictFn`. Production callers pass nothing.
 * @param {{topological:number}} axes
 * @param {{verdictFn?:Function, configFn?:Function}} [seam]
 */
function independenceLabel({ topological }, { verdictFn = epistemicIndependence, configFn = configStability, confirmerSet, detectorFn } = {}) {
  const epistemic = verdictFn(confirmerSet, { detectorFn }); // SOLE U2 lift-point; threads the confirmer set +
                                          // detector (both undefined at convert/mayGate -> WEAK). A demote
                                          // verdict OBJECT may ride `epistemic`; `overall` stays WEAK (object-safe below).
  const config_stability = configFn();    // the SOLE config-stability lift-point (default) — derived
  const top = typeof topological === 'number' ? topological : 0; // computed Menger count (a count, not a verdict)
  // overall = WEAK while ANY verdict axis is WEAK. The non-WEAK branch (<computed>) is INTENTIONALLY pinned
  // 'WEAK' until a future wave defines non-WEAK overall semantics — so a strong topological COUNT can NEVER
  // alone flip overall (the L4 authenticity!=independence landmine in structural form). DERIVED, never literal.
  // NOTE: because BOTH branches are 'WEAK' today, the §3 derivation guard CANNOT prove overall is derived
  // (only epistemic/config_stability are sentinel-proven). The future wave that defines the non-WEAK branch
  // MUST add an injection assertion exercising it, or it silently re-introduces a literal (VALIDATE code-rev).
  // OBJECT-SAFE (plans/41): a demote-verdict OBJECT is `!== 'WEAK'`, so it falls to the pinned-WEAK else-branch
  // — a demotion NEVER surfaces in `overall`; it acts on the WEIGHT the sink reads off `epistemic` (research/24 §4.1).
  const overall = (epistemic === 'WEAK' || config_stability === 'WEAK') ? 'WEAK' : /* TODO(P5): <computed> */ 'WEAK';
  return { topological: top, epistemic, config_stability, overall };
}

/**
 * The consumer obligation. A WEAK record may inform, never GATE a high-stakes action. The CALLER
 * asserts `highStakes` — P2 owns NO stakes threshold (that relocated throne is named + bound at P3).
 * In P2 every label is WEAK, so this refuses every high-stakes caller (fail-closed).
 * NOTE (plans/08): mayGate is currently UNCONSUMED by any action path (only tests call it); its true-branch
 * (low-stakes) authorizes NOTHING today. A future caller wiring it into a real call-site inherits the SHADOW
 * obligation (INV-16) explicitly — it does not silently become a gate.
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
// AMENDED plans/41 (research/24 §4.1 + research/23 §1): DEMOTE-ONLY range `{WEAK, ENTANGLEMENT-DETECTED}` —
// NEVER a positive STRONG. Per-record `(confirmerSet, {detectorFn})`; the detector ships DORMANT.
function epistemicIndependence(confirmerSet, opts) {
  // `opts || {}` — a NULL second arg (not just undefined) must not throw on destructure before the totality
  // guard (a `= {}` PARAM default only covers undefined; VALIDATE/CodeRabbit). Keeps the "never throws" H1
  // contract true for the full public surface, not merely the internal object-literal caller.
  const { detectorFn = detectEntanglement } = opts || {};
  // GUARD FIRST (VERIFY F1/H2): a zero-arg call (mayGate) or a no-confirmerSet consumer (convert) is
  // STRUCTURALLY exempt — WEAK before any detector runs, so the demote path is unreachable without a confirmer
  // set and mayGate stays authoritative regardless of what a future default detector does.
  if (confirmerSet == null) return 'WEAK';
  // TOTALITY (VERIFY H1): the read path faces attacker-controlled store bytes. The detector CALL *and* the
  // shape-normalization (a hostile getter on `ret.flag`/`ret.entangled` throws on ACCESS) both sit INSIDE the
  // try — any throw fails to WEAK, never out (crossVerify calls this over verifiedRecords).
  try {
    // SINGLE-READ contract (VALIDATE M2): read `ret.flag` / `ret.entangled` ONCE each and immediately build a
    // NEW sanitized array — a future double-read of a hostile getter would reopen a TOCTOU window.
    const ret = detectorFn(confirmerSet);
    // EXACT-SET / NO POSITIVE BRANCH (VERIFY C2/F6): honor ONLY the demote shape; ANYTHING else — a positive
    // {flag:'STRONG'}, a truthy object, a non-array `entangled` — normalizes to WEAK. Strict flag equality,
    // never a truthiness test; there is no code path that returns a positive.
    if (ret && typeof ret === 'object' && ret.flag === 'ENTANGLEMENT-DETECTED' && Array.isArray(ret.entangled)) {
      const entangled = ret.entangled
        .filter((c) => Array.isArray(c))
        .map((c) => c.filter((k) => typeof k === 'string')); // NEW, sanitized — never trust the detector object
      return { flag: 'ENTANGLEMENT-DETECTED', entangled };
    }
  } catch { return 'WEAK'; }
  return 'WEAK';
}

/**
 * The DORMANT default entanglement detector (plans/41). Returns 'WEAK' for EVERY input — it never fires, so
 * the seam is byte-identical live. The real BEI/CIG behavioral measure (research/24 §4.2/§6) needs live-agent
 * outputs + a probe battery (DEFERRED); when it lands it becomes the injected detector via a DEPLOY-GATED
 * crossing (research/24-amended residual — NOT a bare default reassignment). It can only ever DEMOTE, never promote.
 */
function detectEntanglement(/* confirmerSet */) { return 'WEAK'; }

/**
 * The config-stability axis lift-point (the SIBLING of `epistemicIndependence`). Config stability is also
 * [OPEN] (a self-asserted config_hash, no attestation) → permanently WEAK until its own P5 lift. It is a
 * SEPARATE lift-point so `independenceLabel` derives this axis too — leaving it a hardcoded literal would
 * re-introduce the exact two-sources-of-truth drift this module exists to prevent (plans/12, VERIFY arch).
 * Self-asserted provenance is NOT world-anchored (integrity != provenance, NS-2): the WEAK here is honest.
 */
function configStability() {
  return 'WEAK'; // config attestation is OPEN; a self-asserted config_hash never substitutes (until P5 replaces THIS fn)
}

module.exports = { independenceLabel, mayGate, epistemicIndependence, configStability, detectEntanglement };
