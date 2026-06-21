// PACT P3 — grounding/creator-standing.js  (spec §6.1)
//
// creatorStanding(humanUid) = reliability AS A SOURCE for a HUMAN — the decaying, asymmetric aggregate
// of that human's premises' scores. Human-keyed via rootOf (a premise counts ONLY when
// rootOf(its signer) === its creator === humanUid, §3.0): persona-multiplication cannot inflate a
// human's standing, and a slander/cross-uid-forged premise contributes to no one.
//
// THE STAKE IS THE STANDING (D5): there is NO separate `stake` field (it was self-asserted/forgeable —
// a {stake:1e9} body scores identically). "Skin in the game" is ENDOGENOUS: a human's own standing
// CRATERS when their premises fail — reputation-at-risk, nothing to forge.
//
// Contests are EARNED-gated (symmetric with confirmations — a zero-history Sybil neither erodes nor
// flags for free; closes the post-build VALIDATE "slander cheaper than support" asymmetry). Asymmetric
// crater (reuse CRATER_MULTIPLIER): a premise CRATERS the standing when CONTESTED by >=2 distinct
// EARNED-STANDING human roots (the never-counts-nodes spirit, INV-13). Decaying (reuse
// DECAY_HALF_LIFE_MS via decayWeight). SHADOW.
//
// Returns the FULL SL opinion (carries the uncertainty u — the honest novice signal; a 1-premise and a
// 50-premise human are NOT collapsed to one scalar) + n_premises + contested.

'use strict';

const { verifiedRecords } = require('../trust/read-gate');
const { opinion, expectation } = require('../trust/opinion');
const { rootOf } = require('../identity/registry');
const { earnedStandingPersonas } = require('../trust/standing');
const { decayWeight } = require('../trust/direct');
const { CRATER_MULTIPLIER } = require('../trust/params');
const { crossVerify, premiseIdOf } = require('./cross-verify');

/** The distinct EARNED-STANDING human roots that filed a real CONTEST against premiseId. */
function earnedContesterRoots(recs, reg, premiseId, earned) {
  const roots = new Set();
  for (const r of recs) {
    if (r.type !== 'CONTEST' || !r.payload) continue;
    if (r.payload.target_premise_id !== premiseId) continue;
    if (!earned.has(r.src_persona_did)) continue; // only earned-standing humans corroborate a crater
    roots.add(rootOf(reg, r.src_persona_did) || r.src_persona_did);
  }
  return roots;
}

/** The rootOf-keyed, EARNED, decay-weighted CONTEST survival against a premise. The earned-standing gate
 *  makes slander as costly as support (symmetric with crossVerify's r-leg; closes the post-build VALIDATE
 *  "slander cheaper than support" asymmetry — a zero-history Sybil neither erodes nor flags for free). */
function contestSurvival(recs, reg, premiseId, now, earned) {
  const perHumanDecay = new Map();
  for (const r of recs) {
    if (r.type !== 'CONTEST' || !r.payload) continue;
    if (r.payload.target_premise_id !== premiseId) continue;
    if (!earned.has(r.src_persona_did)) continue; // earned-standing gate (anti-Sybil-slander)
    const human = rootOf(reg, r.src_persona_did) || r.src_persona_did;
    perHumanDecay.set(human, Math.max(perHumanDecay.get(human) || 0, decayWeight(r, now)));
  }
  let s = 0;
  for (const w of perHumanDecay.values()) s += w;
  return s;
}

/**
 * creatorStanding — a human's reliability as a premise SOURCE.
 * @param {string} humanUid the human root
 * @param {{registry:object, storeOpts:object}} meCtx
 * @param {number} [now] epoch ms for decay
 * @returns {{opinion:object, standing:number, n_premises:number, contested:boolean, advisory:true}}
 */
function creatorStanding(humanUid, meCtx, now) {
  const recs = verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const reg = meCtx.registry;
  const earned = earnedStandingPersonas(recs);

  let rAgg = 0;
  let sAgg = 0;
  let nPremises = 0;
  let contested = false;

  for (const rec of recs) {
    if (rec.type !== 'PREMISE' || !rec.payload) continue;
    // creator-bound-on-read: count only this human's OWN, signer-verified premises (§3.0).
    if (rec.payload.creator !== humanUid) continue;
    if (rootOf(reg, rec.src_persona_did) !== humanUid) continue;
    // the canonical premise id is the ATMS content-address (what CONFIRM/CONTEST target), NOT record_id.
    const premiseId = premiseIdOf(rec);
    if (!premiseId) continue; // malformed premise body — skip (fail-soft)
    nPremises += 1;

    // r-leg: the premise's confirmation survival (decay-weighted distinct humans).
    rAgg += crossVerify(premiseId, meCtx, now).r;

    // s-leg: contests (decay-weighted distinct EARNED humans), with the asymmetric crater on >=2 earned roots.
    const s = contestSurvival(recs, reg, premiseId, now, earned);
    if (s > 0) contested = true;
    const craterRoots = earnedContesterRoots(recs, reg, premiseId, earned);
    sAgg += craterRoots.size >= 2 ? s * CRATER_MULTIPLIER : s;
  }

  const op = opinion(rAgg, sAgg);
  return { opinion: op, standing: expectation(op), n_premises: nPremises, contested, advisory: true };
}

module.exports = { creatorStanding };
