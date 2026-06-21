// PACT P3 — grounding/premise-score.js  (spec §6.1)
//
// premiseScore(premiseId) = a Subjective Logic opinion on a premise's STANDING:
//   r = crossVerify survival (the decay-weighted distinct-human confirmation evidence, §3.1).
//   s = real-target, rootOf-keyed CONTEST evidence (decay-weighted).
// CONTESTED is a FLAG: a real contest raises disbelief (lowers the score) but NEVER erases the
// survival belief (spec §3.5 — a contested premise stays valid, only its grounding is flagged).
// DERIVED-ON-READ over the SIG-verified log (INV-14). SHADOW/advisory.
//
// Sybil defenses on the s-leg are SYMMETRIC with crossVerify's r-leg (post-build VALIDATE — closes the
// "slander cheaper than support" asymmetry): a CONTEST contributes disbelief WEIGHT only when (F3) its
// target_premise_id resolves to the SAME creator-bound premise, (F2) contesters are keyed by HUMAN
// (rootOf) so persona-multiplication collapses to one, AND (earned) the contester authored >=1 CLAIM —
// a zero-history Sybil can neither support nor slander for free. (The ATMS CONTESTED *flag* itself,
// falsify.js, stays open per surface-not-suppress §3.5; this is the trust-SCORING weight only.)

'use strict';

const { verifiedRecords } = require('../trust/read-gate');
const { opinion } = require('../trust/opinion');
const { rootOf } = require('../identity/registry');
const { earnedStandingPersonas } = require('../trust/standing');
const { decayWeight } = require('../trust/direct');
const { crossVerify, findBoundPremise } = require('./cross-verify');

/**
 * The rootOf-keyed, real-target, EARNED, decay-weighted CONTEST evidence (s) against a creator-bound
 * premise. Returns 0 when the premise is not creator-bound (its contests cannot be attributed to a real
 * target). The earned-standing gate makes slander exactly as costly as support (symmetric with the r-leg).
 * @returns {number} the summed decay-weighted distinct-EARNED-human contest weight
 */
function contestEvidence(recs, reg, premiseId, now) {
  const premise = findBoundPremise(recs, reg, premiseId);
  if (!premise) return 0;
  const earned = earnedStandingPersonas(recs);
  const perHumanDecay = new Map();
  for (const r of recs) {
    if (r.type !== 'CONTEST' || !r.payload) continue;
    if (r.payload.target_premise_id !== premiseId) continue;       // real-target-required (F3)
    if (!earned.has(r.src_persona_did)) continue;                  // earned-standing gate (anti-Sybil-slander)
    const human = rootOf(reg, r.src_persona_did) || r.src_persona_did;
    perHumanDecay.set(human, Math.max(perHumanDecay.get(human) || 0, decayWeight(r, now)));
  }
  let s = 0;
  for (const w of perHumanDecay.values()) s += w; // distinct EARNED humans inform
  return s;
}

/**
 * premiseScore — a Subjective Logic opinion on a premise's standing (carries b,d,u,a,expectation).
 * @param {string} premiseId
 * @param {{registry:object, storeOpts:object}} meCtx
 * @param {number} [now] epoch ms for decay
 * @returns {object} an SL opinion (carries b,d,u,a,expectation) + advisory:true (SHADOW, §0)
 */
function premiseScore(premiseId, meCtx, now) {
  const recs = verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const reg = meCtx.registry;
  const r = crossVerify(premiseId, meCtx, now).r; // confirmation survival (the r-leg)
  const s = contestEvidence(recs, reg, premiseId, now);
  return { ...opinion(r, s), advisory: true }; // SHADOW marker — uniform with the other score-objects
}

module.exports = { premiseScore, contestEvidence };
