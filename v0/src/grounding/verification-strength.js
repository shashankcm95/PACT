// PACT P3 — grounding/verification-strength.js  (spec §6.2 — possibilistic weakest-link)
//
// verificationStrength(claimId) = the MIN over the claim's deepest empirical-root premises of their
// crossVerify strengths (all on the [0,1] scalar scale). Possibilistic weakest-link: a chain is only
// as verified as its least-confirmed empirical root.
//
// THE EMPTY-MIN CATASTROPHE (INV-9, D6): MIN of an EMPTY set = 0, NEVER a vacuous +Infinity. An
// ungrounded chain (no empirical root / no confirmations) MUST floor to 0 — it must not read as
// maximally verified. This is the load-bearing honesty-board catch; the floor is asserted by a test.
//
// The DAG walk is ITERATIVE (an explicit stack) + cycle-guarded (a colour map), matching atms/validate
// (a deep adversarial chain can never throw a RangeError that would fail OPEN). SHADOW/advisory.

'use strict';

const { getNode } = require('../atms/claim');
const { verifiedRecords } = require('../trust/read-gate');
const { crossVerify } = require('./cross-verify');

/**
 * Collect the transitive empirical-ROOT premise ids of a claim (kind 'premise' leaves), cycle-safe.
 * A dangling / unknown / cyclic antecedent is skipped fail-soft (verification is advisory, never a gate).
 * @returns {string[]} distinct empirical-root premise ids (possibly empty)
 */
function collectRootPremises(graph, startId) {
  const out = new Set();
  const colour = new Map(); // id -> 'gray' | 'black'
  const stack = [startId];
  while (stack.length) {
    const id = stack.pop();
    if (colour.get(id) === 'black') continue;
    colour.set(id, 'black');
    const node = getNode(graph, id);
    if (!node) continue;                       // dangling antecedent — skip (fail-soft)
    if (node.kind === 'premise') { out.add(id); continue; }
    if (node.kind !== 'claim' || !Array.isArray(node.premises)) continue;
    for (const dep of node.premises) if (colour.get(dep) !== 'black') stack.push(dep);
  }
  return [...out];
}

/**
 * verificationStrength — the weakest-link MIN over the claim's empirical-root premises.
 * @param {string} claimId
 * @param {object} graph an atms/claim immutable graph
 * @param {{registry:object, storeOpts:object}} meCtx
 * @param {number} [now] epoch ms for decay
 * @returns {number} a scalar on [0,1]; 0 when there is no empirical root / no confirmation (empty MIN)
 */
function verificationStrength(claimId, graph, meCtx, now) {
  const roots = collectRootPremises(graph, claimId);
  if (roots.length === 0) return 0; // MIN of an EMPTY set = 0, NEVER +Infinity (the catastrophe)
  const recs = verifiedRecords(meCtx.registry, meCtx.storeOpts); // load ONCE, pass to each root (no O(N+1))
  let min = Infinity;
  for (const premiseId of roots) {
    const strength = crossVerify(premiseId, meCtx, now, recs).strength;
    if (strength < min) min = strength;
  }
  return Number.isFinite(min) ? min : 0; // belt-and-suspenders: never leak +Infinity
}

module.exports = { verificationStrength, collectRootPremises };
