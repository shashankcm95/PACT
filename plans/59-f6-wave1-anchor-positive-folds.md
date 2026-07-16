---
lifecycle: ephemeral
archive-after: 2026-09-01
plan: 59
epic: 96
item: F6-Wave1
issue: 83-part-2
status: BUILT — VERIFY + VALIDATE done (910/0); pre-PR
---

# plans/59 — F6 Wave 1: route the pure-positive folds through the anchoring chokepoint

## Context

ADR-0003 (merged #121; status: proposed, per the ADR-0001/0002 house pattern -- USER-ratified by the F6
scope decision) recorded the 3-condition monotonic-anchoring invariant + the fold map. Wave 1
is the board-confirmed-safe subset: `cross-verify` + `verification-strength` + `reach` — pure-positive
+ monotone, verified inversion-free (hacker: exhaustive power-set deletion found ZERO inverting
subset). This routes them through `authenticatedAnchoredRecords`, taking #83 Part 2 from 1/9 to 4/9
folds anchored. SHADOW / arms nothing; disarmed is byte-identical (the W2b chokepoint property:
`authenticatedAnchoredRecords(meCtx)` with no `regProvenance`/`freshness` === `verifiedRecords`).

## Runtime Probes (this session — they REFINE the ADR's "route cross-verify wholesale")

- **`crossVerify`'s fallback is DEAD for every live caller.** All 3 call sites pass `recs`:
  `verification-strength.js:56`, `creator-standing.js:89`, `premise-score.js:59` (probe:
  `grep -n 'crossVerify(' v0/src`). So `cross-verify.js:79` `recs || verifiedRecords(...)` never hits
  `verifiedRecords` in production — "routing cross-verify" is a property of the CALL SITE's `recs`, NOT
  the leaf (exactly the design board's hacker HIGH-1). cross-verify anchors TRANSITIVELY via
  verification-strength; its fallback stays raw (the conservative default; a future standalone caller
  is a new-fold audit per ADR-0003's residual).
- **`verificationStrength` is called ONLY by `reach.js:62`** (no `recs` passed → its own `:53` load).
- **`reach` is called by no other src fold** (a top-level display read, INV-13 — never gates).
- These bound the blast radius to `reach` + `verification-strength`; the mixed folds
  (`creator-standing`/`premise-score`/`direct`/`consensus`) pass their OWN raw `recs` and are UNTOUCHED.

## The change (THREE load swaps — the recs-seam rule: swap the internal FALLBACK only)

1. **`grounding/verification-strength.js`** — swap its `verifiedRecords` load to
   `authenticatedAnchoredRecords(meCtx)`. It threads this `recs` into every `crossVerify` call, so
   cross-verify's full input anchors here (transitively). Import `authenticatedAnchoredRecords` from
   `../trust/authenticated-read`.
2. **`grounding/reach.js`** — swap the ACCEPT-scan read inside the existing `(reg && meCtx.storeOpts)`
   guard to `authenticatedAnchoredRecords(meCtx)` (keep the guard verbatim so a degenerate meCtx still
   yields `[]` with no behavior change). Import the chokepoint. reach's ACCEPT envelope anchors; its
   `threshold_flag` anchors via `verificationStrength`.
3. **`grounding/cross-verify.js`** — swap the internal FALLBACK to `recs || authenticatedAnchoredRecords`
   (ADR-0003 Decision 3). Dead for all live callers (they pass `recs`); this makes a future STANDALONE
   armed caller ANCHOR by default (fail-safe), and cross-verify is anchored on the `verification-strength`
   path via the anchored `recs` it is fed. (VALIDATE-corrected — see below; the first draft left this raw,
   which diverged from Decision 3 and left a latent de-anchoring.)

## Structural pure-positivity guard (ADR-0003 Decision 5)

cross-verify is anchor-safe only because it builds `opinion(rConfirmers, 0)` with the disbelief leg
`s=0` (`cross-verify.js:158`) — no CONTEST enters. Add a BEHAVIORAL guard test: a premise with fixed
CONFIRMs + an added CONTEST → `crossVerify.strength` is UNCHANGED (the CONTEST is ignored). If a future
edit threads a negative `s`, this test flips RED, forcing a re-classification before the anchored path
can invert. (A behavioral guard, not a brittle source-grep.)

## RED-first witness tests

`test/integration/f6-wave1-anchoring.test.js` (NEW):
- **W1-1 disarmed byte-identical:** with no `regProvenance`/`freshness`, `reach` + `verificationStrength`
  outputs === the raw-`verifiedRecords` computation (the SHADOW-safe property; a populated store,
  non-vacuous).
- **W1-2 armed narrows (reach):** arm `regProvenance.sigmaRoots` dropping an un-anchored ACCEPTer →
  `reach().size` holds-or-LOWERS (never grows); `threshold_flag` moves toward `provisional` (lower
  trust), never toward `grounded`.
- **W1-3 armed narrows (verification-strength):** arm anchoring dropping an un-anchored CONFIRMer →
  `verificationStrength` holds-or-LOWERS, never rises.
- **W1-4 monotonicity (power-set spot-check):** over a small confirmer/accepter set, no armed subset
  raises the output above disarmed (an inline exhaustive check on a 3-4 record set).
- **W1-5 pure-positivity guard (the ADR-0003 Dec-5 structural invariant):** a CONTEST against a
  confirmed premise does NOT change `crossVerify.strength`.

Regression (must stay green, UNTOUCHED): the `creator-standing` / `premise-score` / `consensus` /
`direct` / `cross-verify` unit suites — proving the mixed folds are byte-identical (no back-door
anchoring via the recs-seam).

## SHADOW / NS-9 posture

- Disarmed byte-identical (both swaps resolve to `verifiedRecords` when no `regProvenance`/`freshness`).
- Armed narrows monotonically (pure-positive + monotone; board-confirmed).
- `convert.actionable` stays `false`; nothing gates. #83 Part 2 → 4/9 folds anchored.

## Named residuals (unchanged from ADR-0003)

Wave-2 (`creator-standing`/`premise-score` leg-split via a two-array `crossVerify`; `direct`
raw-resolution split); OPEN (`consensus` mean + nested weight; `stake-anchor` no arm channel). The
arming ACT + `#86/#87/#88` operator-gated (NS-7).

## VERIFY board result (architect + hacker, both APPROVE-WITH-CHANGES; core SOUND)

Build mechanics SOUND: the 2-swap is correct + complete + disarmed-byte-identical (STRONGER than
element-equality — both disarmed filters `return recs` unchanged, so `authenticatedAnchoredRecords(meCtx)`
returns the SAME array REFERENCE as `verifiedRecords(registry, storeOpts)`). Hacker could NOT break it
(disarmed deep-equal 8/8; a 256-subset NS-9 sweep held). The fallback-is-dead claim VERIFIED (all 3
callers pass `recs`; test-only callers hit it but stay green, cross-verify unchanged). All findings are
test-non-vacuity + traceability strengthenings — FOLDED:

- **T1 (hacker HIGH — guard vacuity).** W1-5 as first-drafted is VACUOUS: `crossVerify` never reads
  CONTEST (scans only `CONFIRM`; `s=0` hardcoded at `:158`), so "a CONTEST doesn't change strength" passes
  trivially. FIX: build W1-5 with a WOULD-COUNT contest (earned author, correct `target_premise_id`,
  non-self, distinct human root — the shape the confirm-leg gate WOULD count if it read contests), and
  PROVE non-vacuity: temporarily spike a positive disbelief leg (`s>0`) and confirm the test flips RED,
  then revert.
- **T2 (architect MED — armed witnesses non-vacuous).** W1-2/W1-3 must prove the drop is REAL: assert (a)
  the DISARMED baseline COUNTS the target record, (b) arming REMOVES exactly it (count drops by the
  expected delta), (c) a STRICT `armed < disarmed` witness alongside the general `<=`.
- **T3 (architect MED — armed cross-fold isolation).** Add a witness that `creator-standing` /
  `premise-score` / `consensus` / `direct` are byte-identical ARMED-vs-disarmed (they never read
  `regProvenance`) — the direct proof arming does not back-door anchoring into a mixed/negative-leg fold.
- **T4 (architect LOW + hacker MED — reference-identity + fallback-dead pin).** Assert
  `authenticatedAnchoredRecords(meCtx) === verifiedRecords(meCtx.registry, meCtx.storeOpts)` (reference)
  disarmed; and pin that `authenticatedAnchoredRecords` armed-to-empty returns `[]` (truthy) so
  `crossVerify`'s raw fallback stays provably dead (`[] || x === []`).
- **A1 (architect MED — ADR traceability).** ADR-0003's cross-verify map row says "route wholesale" but
  the build anchors it TRANSITIVELY (fallback dead). AMEND ADR-0003's row (proposed → amend-in-place per
  its own precedent) + add a comment at `cross-verify.js:79`. (Done in this PR.)
- **N1 (hacker LOW — note only).** `reach` now reads `meCtx` twice (its own `reg` + inside the chokepoint);
  byte-identical for plain-data meCtx; the chokepoint's guarded snapshot covers hostile getters. No code
  change; noted for a future reviewer.

**Verdict: build the 2 swaps + the A1 amendment; write the STRENGTHENED (non-vacuous) tests.**

## VERIFY board result — proceed to strengthened RED-first TDD.

## VALIDATE board result (code-reviewer + hacker Rule-2a + honesty; all APPROVE-WITH-CHANGES; core SOUND)

The hacker's live probes found **NO NS-9 inversion and no mixed-fold leak across ~2,500 cases** (400 full-arm
+ 1,697 partial-arm power-set + 264 mixed-fold + 200 byte-identity worlds, 0 counterexamples), and confirmed
the pure-positivity guard is NON-VACUOUS (spiking `s>0` into crossVerify flipped T1 RED, reverting restored
green). No CRITICAL/HIGH. Folded:

- **V1 (hacker LOW + honesty NIT — the crossVerify fallback).** The first draft left `cross-verify.js`'s
  fallback RAW, which (a) DIVERGED from ADR-0003 Decision 3 (`recs || authenticatedAnchoredRecords`) and (b)
  left a latent de-anchoring — a standalone armed caller with no `recs` got the HIGHER raw value (probe:
  104/200 armed worlds). FIX: swapped the fallback (item 3 above) so a standalone armed caller anchors by
  default. Guard importer-set updated to add `cross-verify.js`; ADR-0003 cross-verify row updated. Resolves the
  traceability finding too (cross-verify is now genuinely routed).
- **V2 (reviewer MED + honesty MED — vacuous/mis-named tests).** T4 was renamed + rewired to actually exercise
  the path (a standalone armed-to-empty crossVerify floors to 0 — proving the swapped fallback anchors). Added
  **W1-4** (an un-anchored premise CREATOR floors verificationStrength to 0 — the premise-binding drop, a
  distinct mechanism from the confirmer-count narrow). T1 message + the banner corrected (accurate per-witness
  labeling).
- **V3 (honesty MED — stale module comments).** `authenticated-read.js` + `convert.js` still asserted "convert
  is the SOLE routed consumer" — updated both to name the ADR-0003 routed set (convert + reach +
  verification-strength + cross-verify) + the negative-leg residuals.
- **V4 (reviewer/honesty LOW — comment precision).** `verification-strength.js` comment now notes anchoring
  narrows crossVerify's FULL input set (premise-binding + earned-standing + confirm), not just the confirm
  count; the cross-verify.js comment corrected ("raw = HIGHER/de-anchoring under arming", not "conservative").

Full suite green post-fold; disarmed byte-identity + NS-9 monotonicity + mixed-fold isolation all confirmed by
live probe. **Proceed to pre-PR CodeRabbit + PR.**
