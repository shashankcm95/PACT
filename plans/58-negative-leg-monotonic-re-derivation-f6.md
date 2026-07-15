---
lifecycle: persistent
plan: 58
epic: 96
item: F6
issue: 83-part-2
status: VERIFY-done → ADR-0003 authored (PR #121); Wave-1 build pending
---

# plans/58 — F6: the negative-leg monotonic re-derivation (EPIC #96, #83 Part 2)

## Context

W2b (#119) routed ONLY `convert.disjointPaths` through the anchoring chokepoint
(`authenticatedAnchoredRecords`) and NAMED the residual: routing the other folds would, on
NEGATIVE-evidence legs, silence un-anchored accusers and RAISE trust — inverting NS-9
("arming narrows only"). #83's fix Part 2 said "route ALL trust folds through the anchoring
filter"; W2b/W3 deferred it here as the F6 full close. This is that re-derivation.

All SHADOW / arms nothing. The goal: define the invariant under which a fold CAN be anchored
without inverting monotonic-narrow, classify every fold against it, and phase the rollout.

## The refined invariant (TWO conditions, both required)

> **⚠️ SUPERSEDED (2026-07-14) — do NOT build from this section, the map, or the rollout that follow.** The
> VERIFY board (architect + hacker) corrected the invariant to **THREE conditions** and re-cut the fold map. The
> two-condition form below, the `direct`/`stake-anchor` "Wave 2 by-type split" map rows, and the matching rollout
> entries **INVERT NS-9** (anchoring the subject's own CLAIM/STAKE un-resolves its own CONTEST/SLASH → RAISES
> trust). The authoritative design is **§"VERIFY board result … design CORRECTED"** at the END of this document,
> ratified in `docs/ADRs/0003-fold-routing-monotonic-anchoring-invariant.md`. This section is retained only as
> the pre-VERIFY draft record.

**NS-9 (monotonic-narrow):** for any subject `S`, `trust_armed(S) <= trust_disarmed(S)`.

Anchoring DROPS un-anchored records. A drop is monotonic-safe for a read IFF dropping any
record can only HOLD-OR-LOWER the subject's trust. That requires BOTH:

1. **Positive evidence** — the record's presence RAISES the subject's trust (a CLAIM/STAKE by
   the subject, a CONFIRM/VOUCH for it). A NEGATIVE record (CONTEST/SLASH against the subject)
   fails this: dropping it raises trust.
2. **Monotone-increasing aggregation** — the fold combines the record set with a
   monotone-non-decreasing function (SUM, COUNT, UNION-size, MAX, weakest-link MIN, or a monotone
   transform like SL-expectation with `s=0`). A **MEAN / RATIO is NOT monotone**: removing a
   below-mean term RAISES the result (`new_mean - old_mean = w_i*(mean - v_i)/(den - w_i)`,
   sign = `sign(mean - v_i)`), so even a positive record under a mean inverts.

**Two independent hazards fall out** (the recon's load-bearing finding):
- **Polarity hazard** — a negative record TYPE mixed with positive ones. Fixable by a per-fold
  **by-type read split** (anchor the positive leg, keep the negative leg raw).
- **Aggregation hazard** — a non-monotone aggregation (a MEAN). NOT fixable by a read split; the
  aggregation must be re-derived to a monotone form, or the fold stays raw.

## Verified fold-polarity map (8-agent recon + firsthand probe of `direct` + `cross-verify`)

| Fold | Class | Anchor disposition |
|---|---|---|
| `convert` (disjoint_paths) | pure-positive, monotone (max-flow) | **DONE** — routed W2b |
| `reach` | pure-positive, monotone (UNION size + weakest-link MIN) | **Wave 1** — route wholesale |
| `verification-strength` | pure-positive, monotone (weakest-link MIN, `s=0`) | **Wave 1** — route wholesale |
| `cross-verify` | pure-positive, monotone (SUM→SL-exp, `s=0`; no CONTEST enters) | **Wave 1** — route wholesale |
| `direct` | mixed by-TYPE | ~~**Wave 2** — anchor CLAIM~~ **SUPERSEDED (inverts NS-9 — see §VERIFY board result): Wave 2-raw-resolution; keep the subject's own CLAIM + `agentClaimIds` RAW** |
| `stake-anchor` | mixed by-TYPE | ~~**Wave 2** — anchor STAKE~~ **SUPERSEDED (inverts NS-9 — see §VERIFY board result): OPEN — no separable leg + no arm channel** |
| `creator-standing` | mixed by-TYPE + gating | **Wave 2** — anchor the CONFIRM r-leg only; keep CONTEST s-leg + CLAIM-gate + the subject's own PREMISE anchor raw |
| `premise-score` | mixed by-TYPE + gating | **Wave 2** — anchor the CONFIRM r-leg only; keep CONTEST s-leg + PREMISE-binding + CLAIM-gate raw |
| `standing` (shared leaf) | context-dependent (dual-use CLAIM gate) | NOT anchorable at the leaf — the safe/raw seam lives in the 5 CONSUMERS, not `standing.js` |
| `consensus` / `wcons` | mixed by-AGGREGATION (weighted MEAN) | **OPEN** — un-anchorable under a mean; re-derive the aggregation OR keep raw (residual) |

Firsthand-verified premises (not just the classifier's word):
- `cross-verify.js:158` builds `opinion(rConfirmers, 0)` — the negative leg is hardcoded `0`, no
  CONTEST enters; `rConfirmers` is a SUM over distinct humans (`:100`), `nConfirmers` a COUNT
  (`:101`); SL-expectation is monotone-increasing in `r`. → genuinely pure-positive + monotone.
- `direct.js:62-87` reads CONTEST as the negative `s` leg keyed on the CONTESTER's persona → the
  by-type split exemplar (CLAIM safe, CONTEST raw).
- `consensus.js:90-94` is `num/den` (a weighted MEAN); dropping a below-mean vouch raises it.

## The `standing` subtlety (load-bearing)

`earnedStandingPersonas` reads ONE dual-use record type (CLAIM) and hands the IDENTICAL earned
set to BOTH faces: it gates CONFIRM (positive) AND CONTEST/SLASH (negative). So its anchoring
is CONTEXT-dependent — anchor-safe where it gates a CONFIRM, invert-prone where it gates a
CONTEST/SLASH. The seam is therefore NOT expressible at `standing.js`; each of its 5 consumers
must anchor its own positive use and leave its negative use raw. This is why Wave 2 is per-fold
surgery, not a leaf change.

## Phased rollout (SHADOW throughout)

- **Wave 1 (immediately buildable, zero inversion):** route `reach`, `verification-strength`,
  `cross-verify` through `authenticatedAnchoredRecords` (wholesale — all pure-positive + monotone,
  firsthand-verified). Byte-identical disarmed; armed narrows only. Joins `convert` → 4 of 9 fully
  anchored. Each gets a monotonicity witness test (an un-anchored positive record → strength
  holds-or-lowers, never rises).
- **Wave 2 (per-fold by-type split):** `direct`, `stake-anchor`, `creator-standing`,
  `premise-score` — thread anchoring into the POSITIVE accumulation only (subject's own
  CLAIM/STAKE; the CONFIRM r-leg), leave the NEGATIVE + gating reads on raw `verifiedRecords`.
  Each needs an inversion-witness test (a dropped un-anchored accuser must NOT raise the subject).
  Heavier; one PR per fold or a small batch.
- **OPEN (consensus):** the mean-aggregation hazard. Options: (a) keep `wcons` raw permanently —
  a NAMED residual (a mean can't be anchored; a spoofed voucher shifts it either way, which is a
  griefing surface but the inversion makes anchoring impossible, not merely undesirable); (b)
  re-derive the aggregation to a monotone lower-bound estimator so anchoring becomes safe. (b) is
  an architecture change to the trust math — its own ADR. **USER decision.**

## ADR disposition

The monotonicity invariant (positive-evidence AND monotone-aggregation) is a genuine
architecture decision that SUPERSEDES ADR-0001 Decision 4's "route all folds" (already amended
by W2b). Recommend promoting the invariant + the fold-polarity map to a new **ADR-0003** at
ratification (PACT ADRs are amendable, but this is a new decision, not an amendment). Until then
plans/58 is the living design record.

## Open questions for the VERIFY board + USER

1. Is the invariant (positive AND monotone) sound + complete — does any fold invert for a reason
   NOT captured by these two conditions?
2. Is the pure-positive classification of `reach` / `verification-strength` airtight (no hidden
   mean/ratio on top of `cross-verify`)?
3. Is `consensus` genuinely un-anchorable, or is there a monotone re-derivation cheap enough to do now?
4. **Scope (USER):** Wave 1 only now? Wave 1 + start Wave 2? Or design the consensus re-derivation first?

## VERIFY board result (architect NEEDS-REVISION + hacker APPROVE-WITH-CHANGES) — design CORRECTED

Both lenses independently **CONFIRMED Wave 1 is safe** (hacker: exhaustive power-set deletion over
`cross-verify`/`verification-strength`/`reach` found ZERO inversion; architect: independently
re-derived the monotonicity — `cross-verify` hardcodes `s=0` at `:158`, `rConfirmers` is a SUM
`:100`, `verificationStrength`'s MIN is over graph-derived roots anchoring cannot grow). **Wave 1
ships as designed.** But the INVARIANT was incomplete and the Wave-2 map had two concrete
inversions — corrected below. This supersedes the earlier invariant + the `direct`/`stake-anchor`
rows.

### The invariant — now THREE conditions (a third hazard was missing)

A read is anchor-safe IFF ALL of:
1. **External positive evidence** — the record raises the subject's trust AND does NOT double as a
   resolution / gating / enabling set for a negative leg. (A third-party CONFIRM/VOUCH — NOT the
   subject's OWN CLAIM/STAKE/PREMISE, which resolve their own CONTEST/SLASH.)
2. **Monotone aggregation** — SUM/COUNT/UNION/MAX/MIN/SL-exp-with-`s=0`; never a MEAN/RATIO.
3. **No co-consumed anchored set** — the anchored set is NOT co-consumed by any negative-leg
   aggregation OR gating/enabling predicate in the same fold. Anchoring is applied ONLY to the
   terminal external-positive accumulator, at LEG granularity, at the fold's internal
   `verifiedRecords` FALLBACK (`recs || authenticatedAnchoredRecords`) — NEVER on caller-supplied
   `recs` (else a deferred consumer like `wcons` gets anchored through the back door — hacker MED-4).

**Three hazards (the auditable decomposition):** (a) POLARITY — a negative record TYPE
(CONTEST/SLASH); (b) AGGREGATION — a non-monotone MEAN; (c) PROPAGATION/ROLE — a gating/enabling/
resolution record whose polarity is set by its CONSUMING leg, not its type (the
`earnedStandingPersonas` set, `agentClaimIds`, `stakeIds`, `contestedClaimIds`, the creator-bind).

### Corrected fold map + re-cut rollout

- **Wave 1 (BOARD-CONFIRMED SAFE — build now):** `convert` (done) + `cross-verify` +
  `verification-strength` + `reach`. Swap each fold's internal `verifiedRecords` FALLBACK to
  `authenticatedAnchoredRecords` uniformly (incl. transitive delegates via the `recs` seam). Add a
  STRUCTURAL pure-positivity guard: assert `cross-verify` builds `opinion(r, 0)` with `s=0`, so a
  future negative term trips RED before the anchored path can invert (hacker MED — "pure-positivity
  is a guarded invariant, not an incidental fact"). `reach` is pure-DISPLAY (INV-13, never gates) —
  include for read-consistency or EXCLUDE as YAGNI (decide at build). Witness: an un-anchored
  positive record → strength holds-or-lowers.
- **Wave 2-CLEAN:** `{creator-standing, premise-score}` — anchor ONLY the external CONFIRM r-leg;
  the CONTEST s-leg, the crater-gate root-count (`earnedContesterRoots`, the sharpest 3x lever —
  hacker MED-3), the CLAIM earned-standing gate, and the subject's own PREMISE binding all stay
  RAW. Needs a `crossVerify` TWO-ARRAY signature (`anchoredRecs` for the r-leg, `rawRecs` for the
  s-leg) — NOT expressible with today's single-`recs` thread (hacker HIGH-1).
- **Wave 2-raw-resolution:** `direct` — compute `rEv` from anchored claims BUT keep `agentClaimIds`
  + `contestedClaimIds` + the crater corroboration RAW (the F3 resolution set the CONTEST binds to,
  `direct.js:64`). NOT a wholesale route.
- **OPEN (deferred, substantial re-derivation):**
  - `stake-anchor` — its only positive leg (locked/unlocked from `stakeIds`) SHARES the enumeration
    the SLASH path must read raw → no separable anchorable leg, AND no arm channel exists today
    (`createStakeAnchor` takes only `{registry}`; per ADR-0001's own 2026-07-12 amendment).
  - `consensus`/`wcons` — un-anchorable for TWO reasons: the weighted MEAN, AND the nested
    `direct()` negative leg inside each voucher weight `w_i` (`consensus.js:82-84`). A monotone
    lower-bound estimator would inherit the contest-leg → remedy (b) must re-derive BOTH the
    aggregation AND the per-voucher weight to a positive-only source (a real trust-math change +
    re-validating the Sybil theorem). No cheap fix.

### Corrected inversion-witness spec (my original test would have MISSED the bug)

The plan's original witness ("a dropped un-anchored ACCUSER must not raise trust") does NOT catch
the `direct`/`stake-anchor` inversion (that's a dropped un-anchored SUBJECT). Wave-2 witnesses MUST
include BOTH: (i) drop an un-anchored SUBJECT with existing craters/slash → trust must not rise; (ii)
drop an un-anchored CONTESTER crossing the crater `>=2` boundary → trust must not rise; (iii) `wcons`
byte-identical before/after any `direct` change (the recs-seam guard).

### ADR disposition (corrected)

ADR-0001 is `status: proposed` (unaccepted) and was amended in-place 2026-07-12 → "supersede" is the
wrong verb. Frame **ADR-0003 as REFINING ADR-0001 Decision 4** (it defines the residual-close
criteria Dec-4 deferred) and **cross-reference ADR-0002 Decision 3** (which pins the SAME
`authenticated-read.js` chokepoint for the root_valid/inclusion read-contract) so two arming-boundary
read-contract decisions at one seam cannot silently drift.

**Verdict: Wave 1 is board-confirmed safe and immediately buildable. The invariant + Wave-2 map are
corrected. consensus + stake-anchor are OPEN (substantial re-derivation).** Awaiting USER scope
decision before building.
