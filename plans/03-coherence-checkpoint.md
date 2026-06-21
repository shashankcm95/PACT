---
lifecycle: persistent
kind: coherence-checkpoint
created: 2026-06-21
phases-reviewed: v0 + P2 + P3 (integrated)
verdict: CLOSEABLE (3/3 lenses)
---

# Coherence checkpoint — v0 + P2 + P3 (integrated)

The phase-close analog for PACT (no toolkit `/phase-close` infra here): three independent full-context
lenses reviewed the THREE BUILT PHASES AS AN INTEGRATED WHOLE at phase altitude — cross-phase drift,
integration seams, and accumulated debt the per-wave VALIDATE structurally cannot see. Parallel
foreground spawns (workflow-orphaning avoidance).

## Verdict: **CLOSEABLE — 3/3**
- **PM / honesty-auditor:** CLOSEABLE. "Coheres honestly as a SHADOW research artifact — no cross-phase
  contradiction, no weight escaping advisory, residuals stated consistently." The build does not
  over-claim the code's reach; if anything it under-surfaced its most important residual at the entry point.
- **Principal-SDE / code-reviewer:** CLOSEABLE. "112/112, no correctness regressions, no cross-phase
  cycle. The id-space unification (one content-address linking ATMS graph nodes to signed store records)
  is the load-bearing bridge and is proven empirically, not assumed. `verifiedRecords` is genuinely the
  single INV-14 chokepoint; `rootOf`-keying is uniform."
- **Architect:** CLOSEABLE. "The layering coheres cleanly; ATMS → trust → grounding is one-way at both
  the conceptual and compile-time level (import-grep confirmed zero reverse edges, no cycles). The
  mechanical / Sybil / human-accountability split is real, not blurred."

## Convergent next-phase recommendation (3/3): the AUTHENTICATED MINTER
All three lenses independently recommend the authenticated minter (signed / kernel-owned writer edges)
as the next phase — ahead of P4 (caps/seams) and P5 (U2) — because:
- it closes the **integrity ≠ provenance** residual that recurred loudly in ALL three phases (the #273
  family): a record verifying as self-consistent (integrity) does not prove the legitimate producer
  minted it (provenance); a same-uid co-forge still inflates an advisory weight.
- it is the **only** residual closeable NOW without the research frontier (unlike U1 human-uniqueness
  and U2 epistemic-independence), and it is the **precondition for any weight ever leaving SHADOW** —
  P4's caps, P5's U2, and any future `convert.actionable=true` all read weights that are currently
  integrity-only.
- the substrate is already **shaped** for it (Open/Closed): `read-gate.js` is the single consumer
  chokepoint, the signer seam already exists (P2's Option-B `opts.signer`), and derived-on-read means
  there is no mutable store to retrofit — the minter is a boundary swap behind an existing seam, not a
  layer re-opening.

## Findings — FOLDED at the checkpoint (cheap hygiene; behavior-preserving; 112 still green)
- **`decayWeight` misplacement** (Principal-SDE + architect, convergent) — a pure time-decay utility was
  stranded in the P2 behavioral module `direct.js`, so `grounding/` compile-depended on it for decay
  math. Extracted to `trust/decay.js` (a pure leaf, alongside `params.js`/`standing.js`); `direct.js`
  re-exports for backward compat; the 3 grounding modules now import from the leaf. The
  `grounding → trust/direct` edge for decay is gone (grep-verified 0).
- **P5 lift-point unmarked** (architect) — `weak-flag.js` `epistemicIndependence()` is the SOLE function
  the U2 estimator will replace; added a loud `*** P5 LIFT-POINT ***` signpost (the forward contract's
  most load-bearing line).
- **`standing.js` implicit invariants** (architect + Principal-SDE) — documented the two cross-phase
  invariants explicitly: (1) standing is persona-scoped evidence; all Sybil gates re-key to `rootOf`
  ("a persona earns, the human counts"); (2) earned standing keys on CLAIM authorship specifically
  (with an `earnedStandingFor(recs, kinds)` overload named as the extension seam if P4/P5 needs it).
- **`reach.js` bypassed `getNode`** (Principal-SDE) — replaced the direct `graph.nodes[id]` access with
  the canonical `getNode(graph, id)` API (decouples from the graph's internal representation).
- **README + plan honesty surface** (honesty) — added the integrity≠provenance + U1 residual clause to
  the root README headline (it was loud in every phase's own surface but missing from the entry point);
  fixed the stale `UNCOMMITTED` token on the P3 plan frontmatter (P3 is committed `23249c2`).
- **[MAJOR] O(N+1) store reads** (Principal-SDE + architect) — FOLDED (promoted from "carried" after a
  user catch that it is the textbook N+1 anti-pattern with a cheap, already-precedented fix). Added an
  optional pre-scanned `recs` param to `crossVerify` (mirroring `direct()`'s existing seam); `creatorStanding`,
  `premiseScore`, and `verificationStrength` now load `verifiedRecords` ONCE and thread it down, so a
  human with N premises is 1 scan, not N+1 (and `verificationStrength` over a K-root chain is 1, not K).
  Behavior-neutral (a new equivalence test proves threaded-`recs` == self-scan); 113 tests green. It was
  N+1 in shape and actually heavier than the textbook DB case — each repetition re-read every file AND
  re-verified every signature, i.e. O((N+1) × store-size), not O(1) round-trips.

## Findings — CARRIED to the authenticated-minter wave (integration debt; design alongside the minter)
NOT folded now — integration-debt the lenses said to "name now, fix before anything gates"
(the O(N+1) item that was here has been FOLDED — see above):
- **[MAJOR] dual-purpose `CONTEST` type** (Principal-SDE) — a `CONTEST` carrying BOTH `target_claim_id`
  (trust crater) AND `target_premise_id` (grounding contest) would feed both layers — an undocumented,
  untested cross-layer side-channel. Not exploitable in SHADOW. Fix: a JSON-schema `if/then` discriminant
  (or split `CONTEST_CLAIM` / `CONTEST_PREMISE`) + a cross-contamination test, before P4's per-path bar
  adds new CONTEST production paths.
- **[MINOR] integrated P2/P3 acceptance test** (Principal-SDE) — the `v0-dod` acceptance gate covers v0
  only; add a composed end-to-end test (emit signed frames → assert `direct`/`crossVerify`/
  `creatorStanding` return non-floor) so the composition path has a real-path gate (the Rule-2a-corollary:
  unit tests mock the store; the acceptance test exercises the real read path).
- **[MINOR] P4 sequencing guard** (architect) — when P4 is planned, it must re-bind the two deferred
  thrones (stakes-setter + per-path bar) BEFORE touching `actionable`; that ordering currently lives
  only in a `convert.js` comment.

## What COHERES (audited, holds — do not re-litigate)
- SHADOW boundary is structural across all 3 phases: no mutable score store anywhere (INV-18 by
  construction); `convert.actionable` hard-false; `mayGate` authoritative + fail-closed; `grounding/`
  imports neither `mayGate` nor `actionable` (grep-0).
- `verifiedRecords` (INV-14) is the single read chokepoint for every derived-on-read fold.
- `rootOf`-keying is the uniform Sybil unit across direct/consensus/convert/cross-verify/premise-score/
  creator-standing/reach.
- The premise-id space (ATMS content-address) is unified across atms + grounding, proven by test.
- Residuals (U1 human-mult OPEN, integrity≠provenance OPEN, U2 OPEN, both seams deferred to P4) are
  stated consistently and forced by "residual is real" tests — no phase claims defeated what another
  calls open.
