---
lifecycle: persistent
created: 2026-06-24
phase: U1 stake — phase-close residual slice (seam-tidy + the decay/permanence decision). SHADOW; NARROWS.
status: RESOLVED 2026-06-24 (doc-only) — VERIFY board OVERTURNED the prior finding: A=FALSE tidy (`storeOpts` is the receiver-view selector, documented not refactored); C=permanent-on-read CORRECT + the S6 `REINSTATE` recovery seam named. Suite 366/0.
---

# Stake seam-tidy + the slash-decay decision (the #20 phase-close residuals)

> A SHORT slice (USER-scoped — "not a phase") closing two of the three residuals the `plans/18` phase-close
> sign-off carried forward. The third (cross-network slash freshness, §7 Q6) is OWNED BY the network phase
> (`plans/19`) and is NOT in scope here. Everything stays SHADOW; per OQ-NS-6 this NARROWS, it does not harden.

## §0 The two residuals in scope

- **Finding A (architect, MED) — the `stakeOf(storeOpts, humanUid, nowMs)` "Leaky Abstraction".** The
  phase-close architect read the per-receiver `storeOpts` as an in-memory-backend detail leaked across the
  shared interface, and recommended closing it over at `createStakeAnchor` construction so the shared contract
  becomes `stakeOf(humanUid, nowMs)` (cleaner for the S6 on-chain backend).
- **Finding C (architect, LOW; `plans/18` §7 Q3) — the slash/stake decay asymmetry.** A `SLASH` is
  permanent-on-read (`stake-anchor.js` `isSlashed`), whereas DIRECT defection evidence decays (`direct.js`).
  Defensible for a forfeiture while SHADOW, but the governance question (can a wrongly-slashed root recover?)
  is unresolved. Decide the SHADOW disposition + name where a recovery path attaches at S6.

## §1 Runtime Probes (firsthand — the design hinges on these)

- **Probe 1 — every anchor is constructed store-AGNOSTIC.** `grep createStakeAnchor v0/` → every site is
  `createStakeAnchor({ registry })`; NO site passes `storeOpts`. The store is supplied PER CALL.
- **Probe 2 — the receiver-relative model REUSES one stateless anchor across MANY stores.**
  `convert-stake.test.js:190-203` (the NS-3 "no global rank" test): the SAME `w.anchor` is called with ME's
  store AND a DISTINCT receiver's store (`STATE2` / `zOther`) → `locked` vs `none`. One anchor, two receiver
  views. This is the load-bearing receiver-relative property (NS-3): the anchor is a stateless reader; the
  RECEIVER (its `storeOpts`) selects the view.
- **Probe 3 — `convert` reads `storeOpts` INDEPENDENTLY of the anchor.** `convert.js:75` —
  `disjointPaths -> verifiedRecords(meCtx.registry, meCtx.storeOpts)` (topology), separate from the
  `anchor.stakeOf(meCtx.storeOpts, ...)` call at `:103`. `convert` needs `storeOpts` regardless of the anchor.
- **Probe 4 — `issuance-policy` uses `storeOpts` ONLY to thread into `stakeOf`.** `issuance-policy.js:90-91`
  — `isKnownRoot` does not read the store; `storeOpts` is a pure pass-through to `stakeOf`.

## §2 The design question (TO BE VERIFIED — do NOT pre-decide)

Finding A's "close `storeOpts` at construction" COLLIDES with Probe 2: closing the store over at construction
forces a PER-RECEIVER anchor, which breaks "one stateless anchor serves many receiver views" — the exact
shape the NS-3 receiver-relative test exercises. So the candidate resolutions are:

- **(B1) Finding A is a FALSE tidy — `storeOpts` is the receiver-VIEW selector, NOT a leak.** Resolution =
  DOCUMENT it as such (the per-receiver view the stake-state is read FROM; an S6 backend interprets the same
  view-selector — or ignores it if the chain is global), and DROP the "close it over" recommendation. Possibly
  a rename for clarity (e.g. a `@param` doc / a `view`-flavored comment), no signature change. Zero behavior
  change; the receiver-relative test stays green by construction.
- **(B2) Finding A is partly real — there is a clean way to make `stakeOf` backend-agnostic WITHOUT breaking
  receiver-relativity** (e.g. a thin per-call `view` object that an on-chain backend can read or ignore).
  Only if the board shows a concrete shape that does not regress Probe 2 and is not over-engineering (YAGNI).
- **(C) The decay decision:** while SHADOW, permanent-on-read is correct (a `SLASH` is an append-only
  forfeiture RECORD, NS-5 derived-on-read; nothing rewrites). The recovery/contest path is an S6 governance
  item — name the seam where it attaches (a counter-record? a `REINSTATE`? a decayed slash-weight?) without
  building it now (no premature mechanism; OQ-NS-6 — it is meaningless until the forfeiture is real).

## §3 VERIFY board ask (architect + code-reviewer, pre-build)

1. **architect** — settle B1 vs B2 firsthand against the code + Probe 2. Is `storeOpts` a leak or the
   receiver-view selector? If B1, what is the minimal honest documentation fix? If B2, show the concrete
   non-regressing shape. Then the decay decision (C): the SHADOW disposition + the S6 recovery seam.
2. **code-reviewer** — if any signature changes, scope the behavior-preserving refactor + the consumer
   threading (issuance-policy, convert) + the test impact (esp. the receiver-relative test). Confirm the
   chosen resolution does not regress the SHADOW guarantee or the provenance read path.

## §4 VERIFY board verdict + resolution (RESOLVED 2026-06-24)

Both lenses (architect + code-reviewer) returned the SAME verdict, decisively — the board OVERTURNED the prior
#20 phase-close architect Finding A on firsthand evidence.

### A — B1: FALSE tidy. `storeOpts` is the receiver-view selector, NOT a leak. DOCUMENTED, not refactored.

- The receiver-relative NS-3 test (`convert-stake.test.js:190-203`) reuses ONE stateless anchor across TWO
  stores. Closing `storeOpts` over at construction would force per-receiver anchors, BREAK receiver-relativity,
  and churn 40+ test assertions across 5 files for ZERO behavior gain (code-reviewer count). B2 REJECTED (YAGNI):
  `storeOpts` is already backend-agnostic at the type level (`{receiverId, stateDir?}`); a wrapper is a
  speculative layer still threaded per-call (`convert` reads `storeOpts` for topology regardless — Probe 3).
- Applied: `@param` clarifications in `stake-anchor.js` (+ a header note recording the FALSE-tidy verdict so it
  cannot be re-raised) + the sibling `@param` in `issuance-policy.js`. No signature change; suite green by
  construction (366/0).

### C — permanent-on-read is CORRECT while SHADOW; decay NOT added; the S6 recovery seam NAMED.

- The asymmetry (DIRECT decays via `direct.js` `decayWeight`; SLASH permanent in `isSlashed`, no clock) is
  intentional: a SLASH is the forfeiture of a SPECIFIC content-addressed commitment (a discrete event), not
  fading behavioral reputation. Permanence is a CONSEQUENCE of NS-5 (append-only, derived-on-read), gates
  nothing (INV-16). Decaying it would silently un-forfeit a stake nobody reinstated (laundering).
- Named S6 recovery seam (documented at `isSlashed`, NOT built): an append-only `REINSTATE` counter-record
  (F3-bound `target_slash_id`, L8 reason, custody-minted) that NETS against the crater quorum so an authorized
  reinstatement drops the count below 2 — recovery DERIVED, never a SLASH mutation (NS-5) nor a decay-by-clock.
  The reinstatement AUTHORITY model is deferred S6 governance (meaningless until forfeiture is real, OQ-NS-6).

### Outcome

Doc-only slice (no behavior change). Suite 22 files / 366 green; eslint clean. SHADOW preserved (actionable /
gates stay false). The third phase-close residual (cross-network freshness, §7 Q6) remains owned by the network
phase (`plans/19`). PR for the USER's merge gate.
