// PACT v0 -- trust/authenticated-read.js  (plans/56 W2b / EPIC #96 #81-F6; ADR-0001 Decision 4)
//
// THE anchoring/freshness read chokepoint. It composes the sig-only read-gate (verifiedRecords, INV-14) with the
// two authorization filters into ONE set: verified -> anchored -> fresh. A consumer that reads through here gets
// the WHOLE authenticated-anchored-fresh set, so arming the anchoring/freshness Sybil defense (NS-4) narrows every
// consumer routed through it. ROUTED SET (ADR-0003 monotonic-safe subset): convert.disjointPaths (W2b) + F6
// Wave-1 reach + verification-strength + cross-verify (all pure-positive + monotone; WHOLESALE) + F6 Wave-2-CLEAN
// creator-standing + premise-score (PARTIAL -- the CONFIRM r-leg ONLY, via the two-array crossVerify + the
// `…From` variant below; their CONTEST s-leg + crater root-count + earned gate + subject-PREMISE binding stay RAW,
// else a dropped un-anchored accuser INVERTS monotonic-narrow). The remaining NEGATIVE-evidence consumers
// (direct/stake-anchor/consensus) stay NAMED residuals (Wave-2-raw-resolution/OPEN per ADR-0003). The importer-set
// guard in authenticated-read.test.js enforces this exact set.
//
// DEEP MODULE / SRP (VERIFY board §6 Q1): this is a THIN composition ABOVE the primitives -- read-gate stays the
// minimal sig-only INV-14 chokepoint (its ADR-0002 header stays true), and the two filters keep their "sits
// between sig-verify and the graph-build" narration honest (they sit BELOW this module, ABOVE read-gate). Clean
// one-way fan-in: authenticated-read -> {read-gate, registration-gate, vouch-freshness} (acyclic).
//
// SHADOW / BYTE-IDENTICAL DISARMED (NS-9): both filters are IDENTITY pass-throughs when their opts are absent, so
// for a WELL-FORMED meCtx with no regProvenance/freshness the result === verifiedRecords(meCtx.registry,
// meCtx.storeOpts) element-for-element (the only path any live caller exercises). A DEGENERATE meCtx (null /
// non-object) OR a hostile-GETTER meCtx additionally gains fail-closed TOTALITY -- it returns [] where the old
// convert.disjointPaths threw (a deliberate widening, matching the read-gate family's "TOTAL: never throws"). It
// arms nothing.
//
// SCOPE (plans/56 W2b + plan 60 W2-CLEAN): W2b routed convert.disjointPaths WHOLESALE (pure positive VOUCH-graph
// read); F6 Wave-1 added reach + verification-strength + cross-verify (all pure-positive, WHOLESALE via the 4th-arg
// `recs`); F6 Wave-2-CLEAN adds creator-standing + premise-score PARTIALLY -- ONLY their external CONFIRM r-leg is
// anchored (via crossVerify's 5th-arg `anchoredRecs`, derived through `…From` off the same single read), because
// routing the PER-PERSONA anchoring filter onto their NEGATIVE-evidence leg (CONTEST) would INVERT monotonic-narrow
// (a dropped un-anchored accuser RAISES trust). direct is Wave-2-raw-resolution; stake-anchor/consensus stay OPEN
// (no arm channel / a non-monotone mean). F6 is NARROWED, not closed.

'use strict';

const { verifiedRecords } = require('./read-gate');
const { filterAnchoredRecords } = require('./registration-gate');
const { filterFreshVouches } = require('./vouch-freshness');

/**
 * Read the receiver's store as the sig-verified -> registration-anchored -> vouch-fresh set. TOTAL (never throws;
 * both filters are total + drop-only). Null-safe on meCtx.
 * @param {{registry?:object, storeOpts?:object, regProvenance?:{sigmaRoots:object}, freshness?:{now:number,ttlMs:number}}} [meCtx]
 *   the SAME registry feeds verifiedRecords AND filterAnchoredRecords (MED-1 -- one judge source, no divergence).
 *   `regProvenance`/`freshness` absent => the corresponding filter is a disarmed identity pass-through.
 * @returns {object[]} the authenticated-anchored-fresh records (possibly empty).
 */
function authenticatedAnchoredRecords(meCtx) {
  const mc = (meCtx && typeof meCtx === 'object') ? meCtx : {}; // TOTALITY: a degenerate meCtx normalizes to {} -> []
  // SNAPSHOT every meCtx read ONCE inside a guarded try (CodeRabbit Major + VALIDATE code-reviewer MED): a hostile
  // `registry`/`storeOpts`/`regProvenance`/`freshness` GETTER or Proxy would else throw at the property read (or
  // return two-faced values across reads) BEFORE the filters run. Read ALL FOUR here (registry is NOT re-read by
  // the composition -- it is passed as a plain value to anchorFreshCompose, so `verifiedRecords` and
  // `filterAnchoredRecords` provably use the SAME snapshotted registry: MED-1 one-judge-source). A throw fails
  // CLOSED -> [] (the read-gate family's empty=no-trust convention).
  let registry;
  let storeOpts;
  let regProvenance;
  let freshness;
  try {
    ({ registry, storeOpts, regProvenance, freshness } = mc);
  } catch {
    return [];
  }
  return anchorFreshCompose(verifiedRecords(registry, storeOpts), registry, regProvenance, freshness);
}

/**
 * The anchored/fresh composition applied to an ALREADY-READ verified array (plan 60 W2-CLEAN). Splitting this
 * out lets a two-array caller (creatorStanding/premiseScore) read `verifiedRecords` ONCE and derive the anchored
 * set from that SAME array -- so the raw s-leg and the anchored r-leg see ONE snapshot (subset-by-construction;
 * closes the double-read TOCTOU the VERIFY hacker flagged) at O(N) instead of O(2N). DISARMED (no
 * regProvenance/freshness) both filters `return recs` unchanged, so this returns the INPUT ARRAY REFERENCE --
 * the SHADOW-safe byte-identity, strengthened to `===`. TOTAL: a non-array `verified` or a degenerate armCtx fails
 * CLOSED to []. `authenticatedAnchoredRecords(meCtx)` is the thin read-then-compose wrapper.
 *
 * MED-1 (one-judge-source; CodeRabbit Major + VALIDATE code-reviewer MED): `registry` is passed EXPLICITLY -- it
 * is the caller's SINGLE snapshot of meCtx.registry (the one it already used for `verifiedRecords`), so the SAME
 * registry judges verify AND anchor. This module does NOT re-read `armCtx.registry` (a two-faced getter can no
 * longer verify under registry-A and anchor under registry-B). `armCtx` supplies ONLY the arm signals; its own
 * `registry` field, if any, is IGNORED.
 * @param {object[]} verified  the sig-verified records (verifiedRecords output)
 * @param {object} registry  the caller's snapshotted registry (authoritative — NOT re-read from armCtx)
 * @param {{regProvenance?:{sigmaRoots:object}, freshness?:{now:number,ttlMs:number}}} [armCtx]  arm signals only
 * @returns {object[]} the authenticated-anchored-fresh subset of `verified`
 */
function authenticatedAnchoredRecordsFrom(verified, registry, armCtx) {
  if (!Array.isArray(verified)) return []; // TOTALITY: a non-array verified set fails CLOSED
  const mc = (armCtx && typeof armCtx === 'object') ? armCtx : {};
  // SNAPSHOT the arm signals ONCE inside a guarded try (same hostile/two-face-getter defense as the wrapper). A
  // throw fails CLOSED -> [] (never leaks the raw verified set through an un-applied filter). registry is the
  // caller's explicit snapshot -- never re-read here (MED-1).
  let regProvenance;
  let freshness;
  try {
    ({ regProvenance, freshness } = mc);
  } catch {
    return [];
  }
  return anchorFreshCompose(verified, registry, regProvenance, freshness);
}

/**
 * PURE composition over ALREADY-SNAPSHOTTED values -- reads NO meCtx (so neither public entry re-reads a getter;
 * VALIDATE code-reviewer MED). order: verified -> anchored -> fresh (ADR-0001 Decision 4; the two filters are
 * drop-only + commutative -- a COST choice, per convert.js). An absent opt is `undefined` -> the filter disarms
 * (identity pass-through, returns the input reference).
 */
function anchorFreshCompose(verified, registry, regProvenance, freshness) {
  const anchored = filterAnchoredRecords(verified, registry, regProvenance);
  return filterFreshVouches(anchored, freshness);
}

module.exports = { authenticatedAnchoredRecords, authenticatedAnchoredRecordsFrom };
