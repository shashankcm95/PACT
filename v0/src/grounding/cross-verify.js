// PACT P3 — grounding/cross-verify.js  (spec §6.2 — the LEAF primitive)
//
// crossVerify(premiseId) = distinct EARNED-STANDING, rootOf-keyed, REAL-target, NON-SELF human
// confirmations that a premise survives. This is the PACT-original tier: a premise is creator-BOUND
// (rootOf(src)===payload.creator) ON READ — the store is not a sandbox, so a self-asserted creator is
// never trusted (a slander premise pinned on a victim, or a cross-uid self-inflation, contributes 0 to
// everyone, §6 creator-bind). DERIVED-ON-READ over the SIG-verified log (INV-14); no mutable score store.
//
// Sybil defenses (mirrored from direct.js's F2/F3 + the earned-standing gate):
//   F3-symmetric  a CONFIRM whose target does not resolve to a REAL creator-bound premise is IGNORED.
//   no-self       rootOf(confirmer) !== premise.creator (you cannot vouch for your own premise surviving).
//   earned        the confirmer authored >=1 CLAIM (a zero-history Sybil INFORMS but cannot confirm).
//   rootOf-keyed  one human = one confirmation (persona-multiplication collapses).
// correlation-discount = rootOf ONLY (D3): config_hash correlation is evasion-trivial (an attacker picks
//   distinct hashes) and is the permanently-WEAK axis-3 — it is NEVER read as independence (INV-16).
//
// HONEST RESIDUAL (U1): rootOf-keying defeats persona-mult; k CHEAP MINTED HUMAN roots can still
// fabricate k confirmers (spec §4.5.1) — so the count is topological-WEAK. independenceLabel() returns
// overall WEAK: the count INFORMS, never establishes epistemic strength. Everything is SHADOW/advisory.

'use strict';

const { verifiedRecords } = require('../trust/read-gate');
const { opinion, expectation } = require('../trust/opinion');
const { rootOf } = require('../identity/registry');
const { earnedStandingPersonas } = require('../trust/standing');
const { independenceLabel } = require('../independence/weak-flag');
const { decayWeight } = require('../trust/decay');
const { makePremise } = require('../atms/claim');

// A PREMISE record's canonical premise id = the ATMS content-address of its {statement, scope, creator}
// body (makePremise.id). This is the SAME id space the claim graph walks (verification-strength) and the
// same id CONFIRM/CONTEST records target — so a single content-address binds the signed-record provenance
// carrier to the graph node. Returns null when the payload cannot mint a premise (malformed body).
function premiseIdOf(record) {
  const p = record && record.payload;
  if (!p) return null;
  try { return makePremise({ statement: p.statement, scope: p.scope, creator: p.creator }).id; }
  catch { return null; }
}

/**
 * Find the creator-BOUND PREMISE record for premiseId (the ATMS content-address), or null. A premise
 * counts ONLY when rootOf(its signer) === its self-asserted payload.creator (creator-bound-on-read,
 * §3.0) AND its body re-derives to premiseId (content-addressed — the store is not a sandbox).
 *
 * FIRST-MATCH-POISON DEFENSE (post-build VALIDATE CRITICAL — the #273 family): a content-address binds
 * {statement, scope, creator}, and the body is PUBLIC, so an attacker can mint a same-id DECOY PREMISE
 * (creator=victim, signed by the attacker) that hashes to the victim's id. We must therefore CONTINUE
 * scanning past every mismatch (a malformed/unbound decoy must never short-circuit the search) and
 * return the FIRST record whose signer-root actually equals the claimed creator — never `return null`
 * on the first id-match. Otherwise an attacker's decoy, appearing earlier in the scan, would deny the
 * victim's legitimate premise all verification (a denial-of-grounding / slander the creator-bind exists
 * to defeat). null only after the WHOLE log yields no signer-bound record.
 */
function findBoundPremise(recs, reg, premiseId) {
  for (const r of recs) {
    if (r.type !== 'PREMISE') continue;
    if (premiseIdOf(r) !== premiseId) continue;                  // content-addressed match
    const creator = r.payload && r.payload.creator;
    if (typeof creator !== 'string' || !creator) continue;       // malformed decoy — keep scanning
    if (rootOf(reg, r.src_persona_did) !== creator) continue;    // slander / cross-uid decoy — keep scanning
    return r;                                                    // first signer-bound (legit) record wins
  }
  return null;
}

/**
 * crossVerify — the distinct earned-standing, rootOf-keyed, non-self confirmation strength of a premise.
 * @param {string} premiseId  the ATMS content-address premise id
 * @param {{registry:object, storeOpts:object}} meCtx
 * @param {number} [now] epoch ms for decay
 * @param {object[]} [recs] pre-scanned verifiedRecords output — pass it to avoid an O(N+1) re-scan when a
 *   caller (creatorStanding / verificationStrength / premiseScore) already loaded the verified log. The
 *   contract mirrors direct(): `recs` MUST be verifiedRecords output (INV-14); omit it to self-scan.
 * @returns {{strength:number, r:number, n_confirmers:number, label:object, advisory:true}}
 */
function crossVerify(premiseId, meCtx, now, recs) {
  const all = recs || verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const reg = meCtx.registry;
  const FLOOR = { strength: 0, r: 0, n_confirmers: 0, label: independenceLabel({ topological: 0 }), advisory: true };

  const premise = findBoundPremise(all, reg, premiseId);
  if (!premise) return FLOOR; // unverified creator-claim -> floor 0 (the premise scores for no one)
  const creator = premise.payload.creator;
  const earned = earnedStandingPersonas(all);

  // confirmations: real-target + earned + non-self, keyed by HUMAN (one human = one confirmation).
  const perHumanDecay = new Map();
  for (const r of all) {
    if (r.type !== 'CONFIRM' || !r.payload) continue;
    if (r.payload.target_premise_id !== premiseId) continue;       // F3-symmetric: must hit the real premise
    if (!earned.has(r.src_persona_did)) continue;                  // earned-standing gate
    const human = rootOf(reg, r.src_persona_did) || r.src_persona_did;
    if (human === creator) continue;                               // no self-confirmation
    perHumanDecay.set(human, Math.max(perHumanDecay.get(human) || 0, decayWeight(r, now)));
  }

  let rConfirmers = 0;
  for (const w of perHumanDecay.values()) rConfirmers += w; // decay-weighted distinct-human survival
  let nConfirmers = perHumanDecay.size;

  // plans/41 — the U2 DEMOTE-ONLY entanglement seam (SHADOW/dormant). The detector is dormant by default
  // (meCtx has no `entanglementDetector` -> epistemicIndependence's default detectEntanglement never fires ->
  // byte-identical). ARMED (a future DEPLOY-GATED injection, or a test), it flags correlated confirmer
  // CLUSTERS; each cluster collapses to ONE effective confirmation (the MAX member weight; ALL member keys
  // removed — never a SUM, never an add — VERIFY C1), and a monotonic clamp guarantees the demote can only
  // hold-or-LOWER every weight (can only TIGHTEN; never promote — NS-9 / research/24 §4.1). The label is the
  // SOLE derivation site (research/23 §4.3): we read the label's VERDICT, we never call the detector here.
  const label = independenceLabel(
    { topological: nConfirmers },
    { confirmerSet: [...perHumanDecay.keys()], detectorFn: meCtx && meCtx.entanglementDetector },
  );
  const verdict = label.epistemic;
  if (verdict && typeof verdict === 'object' && verdict.flag === 'ENTANGLEMENT-DETECTED') {
    // Collapse each entangled cluster to ONE effective confirmation = the MAX member weight, members REMOVED
    // (never a SUM, never an add — VERIFY C1). The cluster's contribution is accumulated SEPARATELY (clusterR/
    // clusterN), NOT written back into `demoted` under a synthetic key — so it can never collide with a real
    // rootOf key (VALIDATE M1). Members are DE-DUPLICATED first: a hostile `entangled:[[k,k]]` must not re-read
    // an already-deleted key -> `Math.max(w, undefined)` = NaN, which the clamp (NaN comparisons are false) could
    // not catch, floating strength to the forbidden novice 0.5 (VALIDATE H1).
    const demoted = new Map(perHumanDecay);          // NEW map — never mutate perHumanDecay (VERIFY M2)
    let clusterR = 0;
    let clusterN = 0;
    for (const cluster of verdict.entangled) {
      const members = [...new Set(cluster.filter((k) => demoted.has(k)))]; // present + DISTINCT (H1 dedup)
      if (members.length <= 1) continue;             // a 0/1-distinct-member cluster demotes nothing
      let w = 0;
      for (const k of members) { w = Math.max(w, demoted.get(k)); demoted.delete(k); }
      clusterR += w;                                 // the whole cluster contributes ONE entry = its MAX weight
      clusterN += 1;
    }
    let rDemoted = clusterR;
    for (const w of demoted.values()) rDemoted += w;
    const nDemoted = demoted.size + clusterN;
    // monotonic clamp (VERIFY C1): a demote can ONLY tighten. `Number.isFinite` guards a stray NaN from slipping
    // past the clamp (NaN comparisons are always false) — fail to the pre-demote value (VALIDATE H1 defense).
    rConfirmers = Number.isFinite(rDemoted) ? Math.min(rConfirmers, rDemoted) : rConfirmers;
    nConfirmers = Number.isFinite(nDemoted) ? Math.min(nConfirmers, nDemoted) : nConfirmers;
  }

  // strength = SL expectation on [0,1]. FLOOR 0 with no confirmer: an UNCONFIRMED premise has no
  // verification — it must not read as the novice base-rate 0.5 (that would let an ungrounded chain
  // float to mid-strength, defeating the INV-9 weakest-link / empty-MIN honesty floor).
  const strength = nConfirmers === 0 ? 0 : expectation(opinion(rConfirmers, 0));
  return {
    strength,
    r: rConfirmers,          // the raw decay-weighted distinct-human survival (premise-score's r-leg)
    n_confirmers: nConfirmers,
    label,                   // overall WEAK (k minted roots fabricate k); carries the demote verdict (advisory)
    advisory: true,
  };
}

module.exports = { crossVerify, findBoundPremise, premiseIdOf };
