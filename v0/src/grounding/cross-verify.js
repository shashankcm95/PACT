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

const { authenticatedAnchoredRecords } = require('../trust/authenticated-read');
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
 * @param {object[]} [recs] the RAW/GATE set (verifiedRecords output) — pass it to avoid an O(N+1) re-scan when a
 *   caller already loaded the verified log. Used for the GATES: findBoundPremise (the subject-PREMISE binding) +
 *   earnedStandingPersonas (the earned CLAIM gate). The contract mirrors direct(): `recs` MUST be verifiedRecords
 *   output (INV-14); omit it to self-scan (falls back to the anchored chokepoint — fail-safe).
 * @param {object[]} [anchoredRecs] the F6 Wave-2 (ADR-0003 Decision 4) two-array split: the CONFIRM ACCUMULATOR
 *   set. Defaults to the GATE set (`recs` when supplied, else the anchored fallback) — so a single-array caller is
 *   byte-identical. A Wave-2 caller (creatorStanding/premiseScore) passes the ANCHORED set here + the RAW set as
 *   `recs`, so ONLY the positive CONFIRM leg anchors (condition 3: anchor the terminal accumulator, at leg
 *   granularity; the gates + the caller's s-leg stay RAW). Meaningful ONLY alongside `recs`. CONTRACT (mirrors
 *   `recs`): MUST be verifiedRecords / authenticatedAnchoredRecordsFrom output (a plain array, never a Proxy) --
 *   the accumulator loop is not species/iterator-hardened. A present-but-non-array value fails CLOSED to []
 *   (never a silent de-anchor to the raw gate). See the confirmSet resolution below.
 * @returns {{strength:number, r:number, n_confirmers:number, label:object, advisory:true}}
 */
function crossVerify(premiseId, meCtx, now, recs, anchoredRecs) {
  // GATE set (RAW): the subject-PREMISE binding + earned CLAIM gate. Standalone (no recs) -> the anchored chokepoint
  // fallback (fail-safe; ADR-0003 Dec 3). CONFIRM ACCUMULATOR set (confirmSet): the ONLY leg that anchors under the
  // Wave-2 two-array split.
  //   - anchoredRecs OMITTED (every single-array caller: verification-strength/standalone/pre-Wave-2) -> confirmSet
  //     = gate -> byte-identical (both legs read one array).
  //   - anchoredRecs an ARRAY (the Wave-2 split) -> the anchored positive-evidence set narrows ONLY the r-leg.
  //   - anchoredRecs present-but-NON-ARRAY -> fail CLOSED to [] (r=0), NEVER a silent de-anchor to the raw gate
  //     (a narrowing filter must fail closed -- VERIFY hacker MED). NOTE: the CO-ARM guard below takes PRECEDENCE
  //     -- when a detector is present, confirmSet=gate wins over the []-floor (a non-array 5th arg + a co-armed
  //     detector yields gate, not []). That is still NS-9-safe (gate=raw=the disarmed baseline for the two-array
  //     folds); the []-floor is the fail-closed path for the detector-ABSENT case (the only live shape).
  //
  // CO-ARM FAIL-CLOSE (VERIFY hacker HIGH / ADR-0003 Deferred, dated 2026-07-16): anchoring DROPS un-anchored
  // CONFIRMs from confirmSet BEFORE the entanglement-demote clusters over [...perHumanDecay.keys()] (below).
  // Removing a confirmer can change the cluster topology so survivors ESCAPE a collapse the disarmed superset
  // suffers -> the anchored r can EXCEED the disarmed r (a demonstrated NS-9 inversion: r_armed=2 > r_disarmed=1).
  // Anchoring and the demote do NOT commute. Until the joint re-derivation lands (min(r_anchored,r_raw) clamp),
  // fail SAFE: when the detector is present, force confirmSet = gate (skip anchoring) -- so under a co-armed
  // detector these folds FORFEIT their NS-4 anchoring narrowing entirely (confirmSet=gate=raw) to stay NS-9-safe.
  // For the two-array folds (creator-standing/premise-score, whose gate is RAW) this yields r_armed == r_disarmed
  // (the de-anchor direction is NS-9-safe). RESIDUAL: verification-strength passes an already-anchored `recs` as its
  // gate, so the leaf cannot de-anchor it -- its co-arming residual stays deferred (ADR-0003). SNAPSHOT the detector
  // field ONCE (VALIDATE hacker MED): reading meCtx.entanglementDetector twice (here + the demote's detectorFn) lets
  // a two-face getter desync detectorPresent from detectorFn and resurrect the inversion -- matches the module
  // family's "read the arm signal ONCE" discipline (authenticated-read.js snapshots, both evalArm variants).
  const FLOOR = { strength: 0, r: 0, n_confirmers: 0, label: independenceLabel({ topological: 0 }), advisory: true };
  // TOTALITY (CodeRabbit Major / VALIDATE): SNAPSHOT the meCtx signal reads ONCE inside a guarded try. A hostile
  // `registry`/`entanglementDetector` getter or Proxy would else THROW and ESCAPE crossVerify (pre-existing: the
  // pre-Wave-2 leaf read both unguarded). Fail CLOSED -> FLOOR, matching the authenticated-read chokepoint family's
  // "never throws" totality (meCtx is trusted DI today; this is defense-in-depth for a future non-DI caller). The
  // ONE detector read is reused for the co-arm guard AND the demote's detectorFn below (a two-face getter would
  // else desync them and resurrect the inversion -- module family's "read the arm signal ONCE" discipline).
  const mc = (meCtx && typeof meCtx === 'object') ? meCtx : null;
  if (!mc) return FLOOR; // degenerate meCtx (null/non-object) -> floor (chokepoint totality)
  let detector;
  let reg;
  try {
    detector = mc.entanglementDetector;
    reg = mc.registry;
  } catch {
    return FLOOR;
  }
  const detectorPresent = !!detector;
  const gate = recs || authenticatedAnchoredRecords(meCtx); // authenticatedAnchoredRecords is itself TOTAL
  let confirmSet;
  if (detectorPresent || anchoredRecs === undefined) confirmSet = gate;
  else confirmSet = Array.isArray(anchoredRecs) ? anchoredRecs : [];

  const premise = findBoundPremise(gate, reg, premiseId); // GATE (raw) -- subject binding is condition-1-ineligible
  if (!premise) return FLOOR; // unverified creator-claim -> floor 0 (the premise scores for no one)
  const creator = premise.payload.creator;
  const earned = earnedStandingPersonas(gate); // GATE (raw) -- the earned CLAIM gate stays raw (ADR-0003 Dec 4)

  // confirmations: real-target + earned + non-self, keyed by HUMAN (one human = one confirmation). The ACCUMULATOR
  // reads confirmSet (anchored under the Wave-2 split); the earned/creator gates above stay raw.
  const perHumanDecay = new Map();
  for (const r of confirmSet) {
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
    { confirmerSet: [...perHumanDecay.keys()], detectorFn: detector }, // the SAME single-snapshot the guard read
  );
  const verdict = label.epistemic;
  if (verdict && typeof verdict === 'object' && verdict.flag === 'ENTANGLEMENT-DETECTED') {
    // Merge the flagged clusters into CONNECTED COMPONENTS (union-find) so the collapse is ORDER-INDEPENDENT +
    // deterministic: overlapping clusters `[[A,B],[B,C]]` are ONE entangled group {A,B,C} -> one confirmation,
    // not an order-dependent partial merge (VALIDATE/CodeRabbit Major). A component collapses to its MAX member
    // weight (never a SUM — VERIFY C1); members are removed and the component's SINGLE contribution is
    // accumulated separately (clusterR/clusterN), never a synthetic map key that could collide with a real
    // rootOf id (VALIDATE M1). Union-find keys are DISTINCT, so a hostile `[[k,k]]` cannot re-read a deleted key
    // -> `Math.max(w, undefined)` = NaN (VALIDATE H1). Only PRESENT confirmers (`demoted.has`) enter a component.
    const demoted = new Map(perHumanDecay);          // NEW map — never mutate perHumanDecay (VERIFY M2)
    const parent = new Map();
    const find = (x) => {
      let r = x; while (parent.get(r) !== r) r = parent.get(r);
      while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } // path-compress
      return r;
    };
    for (const cluster of verdict.entangled) {
      const members = (Array.isArray(cluster) ? cluster : []).filter((k) => demoted.has(k));
      for (const k of members) if (!parent.has(k)) parent.set(k, k);
      for (let i = 1; i < members.length; i += 1) parent.set(find(members[i]), find(members[0]));
    }
    const components = new Map();                     // component root -> [distinct member keys]
    for (const k of parent.keys()) { const r = find(k); if (!components.has(r)) components.set(r, []); components.get(r).push(k); }
    let clusterR = 0;
    let clusterN = 0;
    for (const members of components.values()) {
      if (members.length <= 1) continue;             // a singleton component demotes nothing
      let w = 0;
      for (const k of members) { w = Math.max(w, demoted.get(k)); demoted.delete(k); }
      clusterR += w;                                 // the whole component contributes ONE entry = its MAX weight
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
