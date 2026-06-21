// PACT P3 — trust/standing.js  (spec §6.1; the one behavior-preserving P2 extraction)
//
// The EARNED-STANDING predicate, lifted verbatim out of direct.js:77 so DIRECT, cross-verify and
// creator-standing all share ONE definition (DRY — the VERIFY board found the crater + the confirm
// leg + the contest leg each need the identical "has this persona earned standing" test, and a drift
// between three copies is a Sybil hole). The definition is unchanged: a persona has EARNED STANDING
// iff it authored >=1 CLAIM in me's SIG-verified log — it has actually interacted, so it is not a
// zero-history Sybil. Non-recursive (one level). A zero-history persona INFORMS (its records are read)
// but cannot CORROBORATE a crater or anchor a confirmation (never-counts-nodes spirit, INV-13).
//
// TWO cross-phase invariants the coherence board asked to name explicitly (so a future consumer does
// not have to reconstruct them):
//   (1) STANDING IS PERSONA-SCOPED EVIDENCE; ALL SYBIL GATES RE-KEY IT TO rootOf. A persona EARNS
//       (this predicate is per-DID), but every consumer (direct crater, cross-verify, premise-score,
//       creator-standing) immediately re-keys to rootOf — so "a persona earns, the human counts".
//   (2) EARNED STANDING KEYS ON CLAIM AUTHORSHIP SPECIFICALLY, not PREMISE/CONFIRM/etc. A persona that
//       only ever emitted PREMISE records (never a CLAIM) is NOT earned as a confirmer/contester. This
//       is the deliberate spec §6.2 reading (interaction = having made a falsifiable behavioral claim);
//       if P4/P5 needs a different grant set, add an `earnedStandingFor(recs, kinds)` overload rather
//       than widening this one in place.

'use strict';

/**
 * The set of persona DIDs with EARNED STANDING in `recs` (authored >=1 CLAIM). Persona-scoped — callers
 * re-key to rootOf for any Sybil gate (invariant 1 above).
 * @param {object[]} recs verifiedRecords output (the INV-14 read-gate contract)
 * @returns {Set<string>} persona DIDs that authored at least one CLAIM
 */
function earnedStandingPersonas(recs) {
  const out = new Set();
  if (!Array.isArray(recs)) return out;
  for (const r of recs) {
    if (r && r.type === 'CLAIM' && typeof r.src_persona_did === 'string') out.add(r.src_persona_did);
  }
  return out;
}

module.exports = { earnedStandingPersonas };
