// PACT v0 -- trust/authenticated-read.js  (plans/56 W2b / EPIC #96 #81-F6; ADR-0001 Decision 4)
//
// THE anchoring/freshness read chokepoint. It composes the sig-only read-gate (verifiedRecords, INV-14) with the
// two authorization filters into ONE set: verified -> anchored -> fresh. A consumer that reads through here gets
// the WHOLE authenticated-anchored-fresh set, so arming the anchoring/freshness Sybil defense (NS-4) narrows every
// consumer routed through it. ROUTED SET (ADR-0003 monotonic-safe subset): convert.disjointPaths (W2b) + F6
// Wave-1 reach + verification-strength + cross-verify (all pure-positive + monotone). The NEGATIVE-evidence
// consumers (creator-standing/premise-score/direct/stake-anchor/consensus) are NAMED residuals -- routing them is
// not mechanical (the monotonicity inversion; Wave-2/OPEN per ADR-0003). The importer-set guard in
// authenticated-read.test.js enforces this exact set.
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
// SCOPE (plans/56 §7, USER-ratified): W2b routes ONLY convert.disjointPaths through here (a pure positive
// VOUCH-graph read -- monotonic-safe). The other consumers are NAMED residuals: routing the PER-PERSONA anchoring
// filter onto a NEGATIVE-evidence leg (CONTEST/SLASH) INVERTS the monotonic-narrow invariant (a dropped un-anchored
// accuser RAISES trust) -- that needs a monotonic re-derivation, not a mechanical route; stake-anchor has no arm
// channel; the arm signals still flow per-meCtx (F9-at-plumbing). F6 is NARROWED, not closed.

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
  // SNAPSHOT the meCtx reads inside a guarded try (CodeRabbit Major): a hostile `registry`/`storeOpts`/
  // `regProvenance`/`freshness` GETTER or Proxy would else throw at the property read, BEFORE the drop-closed
  // filters run -- violating the "never throws" contract. Read each ONCE here; a throw fails CLOSED -> [] (the
  // read-gate family's empty=no-trust convention). Downstream then sees PLAIN snapshotted values (no getters).
  // (A real caller's meCtx is plain data built by the trust engine; this is defense-in-depth for a hostile
  // in-memory caller -- it also strengthens the pre-refactor convert.disjointPaths, which threw on such a getter.)
  let registry;
  let storeOpts;
  let regProvenance;
  let freshness;
  try {
    ({ registry, storeOpts, regProvenance, freshness } = mc);
  } catch {
    return [];
  }
  // order: verified -> anchored -> fresh (ADR Decision 4; the two filters are drop-only + commutative -- a COST
  // choice, per convert.js). An absent opt is `undefined` -> the filter disarms. Reproduces convert.disjointPaths'
  // verified->anchored->fresh composition + order.
  const verified = verifiedRecords(registry, storeOpts);
  const anchored = filterAnchoredRecords(verified, registry, regProvenance);
  return filterFreshVouches(anchored, freshness);
}

module.exports = { authenticatedAnchoredRecords };
