// PACT P2 — trust/direct.js  (spec §5, §1.4; decisions #1/#2/#5/#6; post-build VALIDATE folds)
//
// DIRECT[me, agent@config_hash] — first-person, earned, PRIVATE. DERIVED-ON-READ (decision #5): a pure
// fold over the SIG-VERIFIED behavioral log (read-gate, INV-14). No mutable trust-edge store → nothing
// to auto-mint into (INV-18 structural).
//
// Behavioral, NOT truth (research/17 amendment A; L5): the signal is caught-vs-uncaught.
//   positive r = agent's uncontested CLAIM frames (uncaught good behavior), DEDUPED by idempotency_key,
//     time-decayed.
//   negative s = caught defections, from CONTEST records that reference a REAL claim of the agent. The
//     post-build VALIDATE board found three Sybil holes the fold below closes:
//       (F2) corroboration is keyed by HUMAN (rootOf), not cheap-to-mint persona — one human minting N
//            DIDs is ONE contester (cannot self-corroborate a crater).
//       (F3) a CONTEST whose target_claim_id does not resolve to an actual claim of the agent is IGNORED
//            (no real caught defection → no crater).
//       (arch) a crater (CRATER_MULTIPLIER) needs >=2 distinct EARNED-STANDING humans; a zero-history
//            Sybil contester INFORMS but cannot CORROBORATE (never-counts-nodes spirit, INV-13).
//   s is time-decayed too (defection FADES — the asymmetry is the crater multiplier, not permanence).
//
// HONEST RESIDUAL (U1): keying by rootOf defeats persona-multiplication; a funded attacker with N
// distinct HUMAN roots remains the U1 frontier (the registry stub does not enforce one-human-one-root).
// Everything here is SHADOW/advisory.

'use strict';

const { verifiedRecords } = require('./read-gate');
const { opinion } = require('./opinion');
const { rootOf } = require('../identity/registry');
const { earnedStandingPersonas } = require('./standing');
const { decayWeight } = require('./decay');
const { CRATER_MULTIPLIER } = require('./params');
const { authenticatedAnchoredRecordsFrom } = require('./authenticated-read');

// decayWeight now lives in ./decay (a pure leaf) — re-exported below for backward compat (trust.test.js
// imports it from here). The local definition was extracted at the coherence checkpoint.

/**
 * DIRECT opinion of `agentDid` from `meCtx`'s verified log.
 * @param {{registry:object, storeOpts:object}} meCtx
 * @param {string} agentDid
 * @param {string|undefined} configHash bucket; undefined = all buckets; else match (config_hash ?? 'unknown')
 * @param {number} [now] epoch ms for decay
 * @param {object[]} [recs] pre-scanned verified records (perf: lets wcons avoid O(N) re-scans)
 * @returns {object} a Subjective Logic opinion over the ANCHORED positive leg (.r/.b/.d/.u carry the anchored
 *   count), plus `rRaw`: the RAW (provenance-invariant) positive weight for model.js's alpha (ADR-0004). Disarmed,
 *   rRaw === r. Consumers that fold this into a weighted mean MUST weight on rRaw (Decision 2 forward contract).
 */
function direct(meCtx, agentDid, configHash, now, recs) {
  const reg = meCtx.registry;                       // snapshot once (one judge-source; MED-1)
  const all = recs || verifiedRecords(reg, meCtx.storeOpts);
  const inBucket = (r) => configHash === undefined || (r.config_hash ?? 'unknown') === configHash;

  // agent's CLAIMs in this bucket, DEDUPED by idempotency_key (the plan's counting unit).
  const claimsByKey = new Map();
  for (const r of all) {
    if (r.type === 'CLAIM' && r.src_persona_did === agentDid && inBucket(r)) {
      const k = r.idempotency_key || r.record_id;
      if (!claimsByKey.has(k)) claimsByKey.set(k, r);
    }
  }
  const agentClaims = [...claimsByKey.values()];
  const agentClaimIds = new Set(agentClaims.map((c) => c.record_id));

  // VALID contests: reference a REAL claim of the agent (F3 — a genuine caught defection).
  const validContests = all.filter((r) =>
    r.type === 'CONTEST' && r.payload && r.payload.target_persona === agentDid &&
    agentClaimIds.has(r.payload.target_claim_id));
  const contestedClaimIds = new Set(validContests.map((c) => c.payload.target_claim_id));

  // POSITIVE-leg anchoring (ADR-0004 Decision 1): anchor ONLY the rEv accumulator, at the internal `recs ||`
  // fallback (Decision 3 recs-seam) — dead when a caller passes `recs`, so `wcons` stays RAW/un-anchored. The
  // resolution set (agentClaimIds), sEv, and the crater below all read `all` (RAW), so a dropped un-anchored CLAIM
  // never un-resolves a CONTEST (the dual-role trap). Disarmed, posSet === all by reference (value-identity).
  const posSet = recs || authenticatedAnchoredRecordsFrom(all, reg, meCtx);
  const posIds = new Set(posSet.map((r) => r.record_id));

  // positive evidence (decay-weighted, uncontested). rEvRaw = the RAW interaction weight = model.js's alpha basis
  // (provenance-invariant); rEvAnchored = the anchored subset = directE's basis. Disarmed they are equal.
  let rEvRaw = 0;
  let rEvAnchored = 0;
  for (const c of agentClaims) {
    if (contestedClaimIds.has(c.record_id)) continue;
    const wgt = decayWeight(c, now);
    rEvRaw += wgt;
    if (posIds.has(c.record_id)) rEvAnchored += wgt;
  }

  // a persona has EARNED STANDING if it authored >=1 CLAIM in me's log (it has interacted — not a
  // zero-history Sybil). Non-recursive (one level).
  // (extracted to trust/standing.js (P3): DIRECT, cross-verify + creator-standing share ONE definition;
  //  behavior is identical — the 83 P2 tests prove no regression.)
  const personasWithStanding = earnedStandingPersonas(all);

  // negative evidence: keyed by HUMAN (rootOf), decay-weighted; crater only with >=2 earned-standing humans.
  const perHumanDecay = new Map(); // human -> max decayed contest weight
  const corroboratingHumans = new Set();
  for (const c of validContests) {
    const human = rootOf(reg, c.src_persona_did) || c.src_persona_did;
    perHumanDecay.set(human, Math.max(perHumanDecay.get(human) || 0, decayWeight(c, now)));
    if (personasWithStanding.has(c.src_persona_did)) corroboratingHumans.add(human);
  }
  let sEv = 0;
  for (const w of perHumanDecay.values()) sEv += w; // distinct humans inform
  if (corroboratingHumans.size >= 2) sEv *= CRATER_MULTIPLIER; // disjoint EARNED corroboration craters

  // opinion from the ANCHORED positive (directE's basis); rRaw carries the RAW interaction weight so model.js can
  // base alpha on the provenance-invariant count (ADR-0004 Decision 2). Disarmed, rEvAnchored === rEvRaw.
  return { ...opinion(rEvAnchored, sEv), rRaw: rEvRaw };
}

module.exports = { direct, decayWeight };
