// PACT P2 — trust/model.js  (spec §5, §5.2, INV-2/INV-6; research/17)
//
// The first-person trust model — the PUBLIC entry point. TRUST(me, agent) blends earned DIRECT with
// advisory CONSENSUS: TRUST = α·E(DIRECT) + (1-α)·wcons, α rising with interaction count (the SL
// uncertainty term is the novice signal). RECEIVER-LOCAL + FIRST-PERSON + PRIVATE: the model instance
// is the receiver's own; the algorithm is public (this file), the per-receiver verdict is not published.
// Vouches are RECEIVER-SCOPED: a vouch value is only interpretable relative to a specific receiver's
// DIRECT graph (wcons weights it through THAT graph), so the published vouch set has NO receiver-
// independent total order — there is no global sortable rank to capture (INV-2 / L6, the throne).
//
// EVERYTHING IS ADVISORY (SHADOW): TRUST gates no action in P2. INV-6: DIRECT outweighs CONSENSUS, and
// CONSENSUS alone can never act.

'use strict';

const { direct } = require('./direct');
const { wcons } = require('./consensus');
const { expectation, novice, alpha } = require('./opinion');

/**
 * TRUST(me, agent) — the receiver-local, first-person, ADVISORY trust point estimate.
 * @returns {{value:number, direct:object, alpha:number, wcons:object, advisory:true}}
 */
function trust(meCtx, meDid, agentDid, configHash, now) {
  const d = direct(meCtx, agentDid, configHash, now);
  // ADR-0004 (LOAD-BEARING): alpha reads the RAW interaction count (d.rRaw + d.s), NOT the anchored d.r. direct()'s
  // opinion .r is the ANCHORED positive; basing alpha on it lets arming lower alpha, shift weight onto consE, and
  // RAISE trust() when consE > directE (hazard d, the +0.056 inversion). Do NOT "clean up" by re-coupling to d.r.
  const a = alpha(d.rRaw + d.s);                     // provenance-invariant interaction count = the DIRECT evidence weight
  const wc = wcons(meCtx, meDid, agentDid, now);
  const directE = expectation(d);
  const consE = wc.defined ? wc.value : expectation(novice()); // cold-start ⇒ novice prior (never NaN)
  return {
    value: a * directE + (1 - a) * consE,
    direct: d,
    alpha: a,
    wcons: wc,
    advisory: true, // SHADOW — gates nothing in P2 (INV-16); DIRECT outweighs CONSENSUS via α (INV-6)
  };
}

module.exports = { trust, alpha };
