# ADR-0003 — Fold-routing eligibility: the monotonic-narrow anchoring invariant (F6)

**Status:** proposed (2026-07-14)

<!-- Proposed, not accepted: this DEFINES the criteria under which a trust/grounding fold may be routed through
the armed anchoring chokepoint without inverting NS-9. It builds nothing and arms nothing; it refines ADR-0001
Decision 4 (which named this re-derivation as "unbuilt") and is the design contract for the Wave-1 build.
Acceptance is the USER's gate. -->

## Context

ADR-0001 Decision 4 relocated the narrowing filters into the `authenticated-read.js` chokepoint and, in its
2026-07-12 amendment, corrected "route all eight folds" to "route `convert.disjointPaths` ONLY", naming the rest
as residuals because **the per-persona anchoring filter on a NEGATIVE-evidence leg (CONTEST/SLASH) INVERTS
monotonic-narrow** — a dropped un-anchored accuser RAISES the subject's trust (NS-9 violation). It flagged the
"negative-leg monotonic re-derivation that would actually achieve whole-surface coverage" as unbuilt. This ADR
is that re-derivation: it defines WHICH folds can be anchored, and under what invariant, so #83 Part 2 ("route
all trust folds through the anchoring filter") can proceed monotonically instead of inverting.

NS-9 (monotonic-narrow, load-bearing): for every subject `S`, `trust_armed(S) <= trust_disarmed(S)`. Anchoring
DROPS un-anchored records; a drop is only safe if it can HOLD-OR-LOWER the subject's trust. Everything here is
SHADOW (arms nothing); `convert.actionable` stays a literal `false`.

The map below was produced by an 8-agent fold-polarity recon + firsthand code probes, and pressure-tested by an
architect + hacker VERIFY board (see Validation) whose findings are folded — including two concrete inversions
in the first-draft map that the board caught before any code was written.

## Decision(s)

1. **Anchor-eligibility is a THREE-condition invariant.** A read may be routed through
   `authenticatedAnchoredRecords` IFF ALL hold — upholds **NS-9** / **NS-4**:
   - **(1) External positive evidence.** The record raises `S`'s trust AND does NOT double as a
     resolution / gating / enabling set for a negative leg. A third-party CONFIRM/VOUCH qualifies; the
     subject's OWN `CLAIM`/`STAKE`/`PREMISE` does NOT — it resolves its own CONTEST/SLASH, so dropping it
     un-resolves the accusation and RAISES trust.
   - **(2) Monotone aggregation.** SUM / COUNT / UNION-size / MAX / weakest-link MIN / SL-expectation with the
     disbelief leg `s=0`. A MEAN/RATIO is EXCLUDED: removing a below-mean term RAISES the result
     (`new_mean - old_mean = w_i*(mean - v_i)/(den - w_i)`, sign `= sign(mean - v_i)`).
   - **(3) No co-consumed anchored set.** The anchored set is NOT co-consumed by any negative-leg aggregation
     or gating/enabling predicate in the same fold. Anchoring is applied ONLY to the terminal
     external-positive accumulator, at LEG granularity, at the fold's internal `verifiedRecords` FALLBACK
     (`recs || authenticatedAnchoredRecords`) — **never on a caller-supplied `recs`** (else a deferred
     consumer such as `wcons`, which threads its RAW `recs` into `direct()`, is anchored through the back
     door and its mean inverts).

2. **Four named hazards make the map auditable by ROLE, not by record type.** A fold inverts under anchoring
   via exactly one of: **(a) POLARITY** — a negative record TYPE (CONTEST/SLASH); **(b) AGGREGATION** — a
   non-monotone MEAN; **(c) PROPAGATION/ROLE** — a gating/enabling/resolution record whose polarity is set by
   its CONSUMING leg, not its type (the `earnedStandingPersonas` CLAIM set, `agentClaimIds`, `stakeIds`,
   `contestedClaimIds`, the creator-bind); **(d) DOWNSTREAM-COMPOSITION** (added 2026-07-16, plan 61) — a fold that
   is fold-level-monotone but feeds a DOWNSTREAM aggregation whose WEIGHT depends on the anchored quantity. `direct`
   is monotone in `rEv`, but `model.js trust()` blends it as `alpha·directE + (1-alpha)·consE` with
   `alpha = alpha(rEv+sEv)`; anchoring `rEv` shifts the blend weight off DIRECT and can RAISE `trust()`. Hazard (c)
   is invisible to a record-type split — the SAME `earnedStandingPersonas` set gates a POSITIVE leg in
   `cross-verify` (safe to shrink) and the NEGATIVE crater in `direct` (shrinking un-craters → RAISES trust);
   hazard (d) is invisible to a per-FOLD split — a fold's monotonicity is NECESSARY-but-not-SUFFICIENT.
   **Anchor-eligibility (the 3 conditions) must therefore be checked at the SUBJECT'S-TRUST granularity (the public
   `trust()` output), NOT the fold in isolation** — trace the anchored quantity into every downstream weight/mean.
   Classification is per-consuming-leg AND per-downstream-consumer.

3. **The fold-routing map (this is the load-bearing artifact).**

   | Fold | Class | Disposition |
   |---|---|---|
   | `convert` (disjoint_paths) | pure-positive, monotone (max-flow) | DONE (W2b) |
   | `cross-verify` | pure-positive, monotone (SUM→SL-exp, `s=0`) | **Wave 1** — its internal fallback swapped to the chokepoint (the `recs`-or-`authenticatedAnchoredRecords` fallback, per Decision 3) AND fed anchored `recs` via `verification-strength`. The fallback is dead for all live callers (they pass `recs`); a future STANDALONE armed caller ANCHORS by default (fail-safe). Built plans/59. |
   | `verification-strength` | pure-positive, monotone (weakest-link MIN over graph-fixed roots) | **Wave 1** — swap the `:53` load to the chokepoint (feeds cross-verify anchored). Built plans/59. |
   | `reach` | pure-positive (UNION + threshold); INV-13 display-only, never gates | **Wave 1** — swap the `:46` load (in-guard). Built plans/59. |
   | `creator-standing` | mixed (role hazard) | **Wave 2-CLEAN** — anchor the external CONFIRM r-leg ONLY |
   | `premise-score` | mixed (role hazard) | **Wave 2-CLEAN** — anchor the external CONFIRM r-leg ONLY |
   | `direct` | fold-monotone BUT feeds `model.js`'s `rEv`-weighted alpha-blend MEAN | **OPEN** (reclassified 2026-07-16, plan 61 VERIFY — was "Wave 2-raw-resolution"). The raw-resolution split (anchor `rEv`, keep `agentClaimIds`/`contestedClaimIds`/crater RAW) IS fold-monotone, but `direct` is the SOLE fold consumed by `model.js trust() = alpha·directE + (1-alpha)·consE` where `alpha = alpha(rEv+sEv)`. Anchoring `rEv` lowers `alpha`, shifts weight off DIRECT onto consensus, and RAISES `trust()` when `consE > directE` — the SAME mean-hazard as consensus (hazard (d) below). Needs the alpha-blend re-derivation (base `alpha` on the RAW count). See Validation 2026-07-16. |
   | `standing` (shared leaf) | dual-use gate | NOT anchorable at the leaf — the seam lives in each of the 5 consumers |
   | `stake-anchor` | positive leg NOT separable from the SLASH resolution set; no arm channel today | **OPEN** |
   | `consensus`/`wcons` | weighted MEAN + nested `direct()` negative leg per weight | **OPEN** |

4. **Wave 2-CLEAN requires a two-array `crossVerify` signature.** The CONFIRM r-leg reads `anchoredRecs`; the
   CONTEST s-leg, the crater-gate root-count (`earnedContesterRoots`, the sharp 3x lever), the earned-standing
   CLAIM gate, and the subject's own PREMISE binding all read `rawRecs`. A single `recs` thread cannot express
   this split. (Recorded so an implementer does not attempt a wholesale route.)

5. **Pure-positivity is a GUARDED invariant, not an incidental fact.** `cross-verify` is anchor-safe only
   because it builds `opinion(rConfirmers, 0)` with `s=0` (`cross-verify.js:158`); if a future edit threads a
   CONTEST-derived `s`, every wholesale-routed consumer silently inverts. Wave 1 MUST add a structural assertion
   (a test) that the SL opinion is built with `s=0`, so a future negative leg trips RED before the anchored path
   can invert.

6. **This ADR REFINES ADR-0001 Decision 4; it does not supersede it.** ADR-0001 is `proposed` (unaccepted) and
   was amended in place — "supersede" is the wrong verb. Decision 4 keeps the *shape* (one fail-closed
   chokepoint); this ADR supplies the *eligibility criteria* Decision 4 deferred. **Cross-reference ADR-0002
   Decision 3** (the deferred `root_valid` + audit-inclusion read-contract decision), which pins the SAME
   `authenticated-read.js` seam, so the two arming-boundary read-contract decisions are co-located and cannot
   drift.

## Validation — findings folded (2026-07-14)

Architect (NEEDS-REVISION → corrected) + hacker (APPROVE-WITH-CHANGES) VERIFY board on the first-draft design.
Both **independently CONFIRMED Wave 1 is inversion-free** (hacker: exhaustive power-set deletion over
`cross-verify`/`verification-strength`/`reach` found ZERO subset whose removal raises trust; architect:
re-derived the monotonicity from `s=0` + SUM + MIN-over-graph-fixed-roots). Folded:

- **Third hazard added** (both) — the first-draft two-hazard invariant (polarity + aggregation) missed the
  PROPAGATION/ROLE hazard; condition (3) + hazard (c) now capture it.
- **`direct`/`stake-anchor` inversion** (architect HIGH) — the first draft said "anchor the subject's CLAIM/
  STAKE", which drops the subject's own resolution set and un-resolves its CONTEST/SLASH → trust rises to
  novice. Corrected: subject-authored records stay RAW; `direct` → raw-resolution split; `stake-anchor` → OPEN.
  (`direct`'s raw-resolution split was ITSELF later reclassified OPEN on 2026-07-16 — hazard (d); see the
  2026-07-16 Validation subsection below. This 2026-07-14 line records only the first-draft correction.)
- **`consensus` un-anchorable for TWO reasons** (hacker HIGH) — the mean AND the nested `direct()` negative leg
  per voucher weight; a monotone-lower-bound estimator would inherit the contest-leg (no cheap fix).
- **The `recs`-seam rule** (hacker MED) — condition (3)'s "internal fallback only, never caller-supplied `recs`".
- **Inversion-witness spec corrected** — the original "dropped ACCUSER must not raise trust" would MISS the
  dual-role bug (a dropped SUBJECT). Witnesses must cover: a dropped un-anchored SUBJECT with craters/slash; a
  dropped CONTESTER crossing the crater `>=2` boundary; `wcons` byte-identical across any `direct` change.

### Validation — `direct` reclassified to OPEN (2026-07-16, plan 61 VERIFY board)

Architect + hacker (BOTH NEEDS-REVISION, matching HIGH) on the plan-61 `direct` raw-resolution build, with
independent concrete reproducers. **The 2026-07-14 map put `direct` in "Wave-2-raw-resolution" by analyzing the
fold in ISOLATION — it missed that `direct` feeds `model.js trust()`, a MEAN whose weight `alpha = alpha(rEv+sEv)`
depends on the anchored `rEv`.** The raw-resolution split is genuinely fold-monotone (`E(DIRECT)_armed <=
E(DIRECT)_disarmed`; the dual-role CLAIM set stays raw so a dropped un-anchored CLAIM never un-resolves a CONTEST),
but `model.js` standalone (the SOLE armed path — `consensus` passes raw `recs`) computes
`trust = alpha·directE + (1-alpha)·consE`; arming lowers `rEv` → lowers `alpha` → shifts weight onto the unchanged
`consE`, RAISING `trust()` when `consE > directE` (reproducer: `rEv=3→0`, `wcons=0.95` → `0.894 → 0.95`, +0.056).
This is **hazard (d) DOWNSTREAM-COMPOSITION** (Decision 2). `direct` is reclassified OPEN (map + Deferred);
anchor-eligibility must henceforth be checked at the SUBJECT'S-`trust()` granularity, not the fold. The fold-level
split analysis + the `reg`-single-snapshot (MED-1) and dedup-representative over-narrow LOWs are recorded in plan 61
for the eventual re-derivation.

## Consequences

- **Easier:** Wave 1 (`cross-verify` + `verification-strength` + `reach`) can be built immediately and safely,
  taking #83 Part 2 from 1/9 to 4/9 folds anchored, with a mechanical, board-confirmed monotonicity guarantee.
- **Harder:** whole-surface NS-4 coverage is NOT one change — it is Wave 1 (wholesale) + Wave-2-CLEAN (the
  `creator-standing`/`premise-score` leg splits, the two-array `crossVerify`, BUILT #123) + **THREE OPEN
  re-derivations** (`direct` — reclassified 2026-07-16 — plus `consensus` + `stake-anchor`). "Route all folds" is
  retired as a single step; and a fold that is fold-level-monotone can still be OPEN when a downstream consumer's
  weight moves with the anchored quantity (hazard (d), `direct`).
- **New residual (disclosed):** the anchoring boundary now carries a per-fold eligibility obligation — a new
  fold, or a new negative leg on an existing anchored fold, must be re-audited against the 3 conditions before
  it may be routed. The `s=0` guard (Decision 5) makes the most dangerous drift (a new negative leg on
  `cross-verify`) fail loudly.

## Deferred (recorded, not built)

- **`consensus`/`wcons` re-derivation** — un-anchorable as a raw mean-over-`direct()`-weights. Revisit trigger:
  a monotone re-derivation that re-derives BOTH the aggregation (a fixed-denominator / SL-cumulative-fusion
  lower bound) AND the per-voucher weight to a positive-only source — a real trust-math change that must
  re-validate the Personalized-Hitting-Time Sybil theorem. Its own ADR when pursued.
- **`stake-anchor` anchoring** — needs (i) an arm channel (`createStakeAnchor`/`stakeOf` take no `regProvenance`
  today — ADR-0001's 2026-07-12 amendment) AND (ii) a re-derivation, since its positive leg (locked/unlocked
  from `stakeIds`) is not separable from the SLASH resolution set. Revisit at the same time as `consensus`.
- **`direct` — RECLASSIFIED to OPEN (2026-07-16, plan 61 VERIFY; was "Wave-2-raw-resolution").** The
  raw-resolution split is fold-monotone, but `direct` feeds `model.js trust() = alpha·directE + (1-alpha)·consE`
  with `alpha = alpha(rEv+sEv)` (hazard (d)) — anchoring `rEv` shifts the blend weight off DIRECT onto consensus and
  RAISES `trust()` when `consE > directE`. Un-anchorable until the alpha-blend is re-derived: base `alpha` on the
  RAW interaction count (`rEv_raw + sEv`) and use the anchored `rEv` ONLY for `directE`, giving
  `trust_armed = alpha_raw·directE_armed + (1-alpha_raw)·consE <= trust_disarmed`. That is a TRUST-MATH change to
  the core blend (its own design + ADR) — co-deferred with `consensus`/`stake-anchor`. The OPEN bucket is now 3.
- **Two-array `crossVerify` (Wave-2-CLEAN)** — BUILT (#123, plan 60): `creator-standing` + `premise-score`
  anchor the CONFIRM r-leg only. #83 Part-2 at 6/9.
- **Co-arming proof obligation** — the F6 monotonicity is analyzed with the entanglement detector DORMANT
  (the default); the joint `anchoring + entanglementDetector` armed case needs its own witness. Scoped out until
  the detector arms.
  - **UPDATE (2026-07-16, plan 60 Wave-2 VERIFY hacker):** the co-arming case is no longer merely unproven — it is
    a **demonstrated inversion**. Anchoring drops un-anchored CONFIRMs from `confirmSet` BEFORE the
    entanglement-demote clusters over `[...perHumanDecay.keys()]` (`cross-verify.js:117`); removing a confirmer can
    change the cluster topology so survivors ESCAPE a collapse the disarmed superset suffers, so the anchored
    (subset) `r` can EXCEED the disarmed (superset) `r` (witness: 3 CONFIRMs {A,B,C}, detector flags `[[A,B,C]]`
    iff linchpin C present, `regProvenance` anchors A,B but not C → `r_armed=2 > r_disarmed=1`, `E=0.75 > 0.667`).
  - **Wave-2 fail-close (plan 60):** `cross-verify.js` now forces `confirmSet = gate` (skips anchoring) whenever
    `meCtx.entanglementDetector` is present (a truthy check — the guard fires when a detector is merely PRESENT, not
    only when it flags). For the **two-array folds** (`creator-standing`/`premise-score`, whose `gate` is RAW) this
    yields `r_armed == r_disarmed` — NS-9-safe by construction (the INVERSION is discharged + tested, A9 RED-first
    witness). **Cost, stated honestly:** this is fail-SAFE, not co-arming SUPPORT — under any co-armed detector these
    folds FORFEIT their NS-4 anchoring narrowing entirely (`confirmSet = gate = raw`), reverting to the disarmed
    r-leg. The detector field is dormant/SHADOW today, so nothing is lost live; the real close is the `min(r_anchored,
    r_raw)` clamp that preserves narrowing under a benign co-armed detector (deferred). **RESIDUAL (still deferred):**
    `verification-strength` passes an already-anchored `recs`
    as its 4th arg, so the leaf has no RAW baseline to de-anchor to — its co-arming residual stays deferred to a
    Wave-1 two-array revisit. The full co-arming re-derivation (preserve anchoring's narrowing under a benign
    co-armed detector via a `min(r_anchored, r_raw)` clamp) is the eventual close; the current guard is the
    fail-safe interim.
