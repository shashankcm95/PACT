---
lifecycle: persistent
created: 2026-07-12
audience: this + future sessions — EPIC #96 arming-cluster, Wave 2b
epic: 96
builds: "the #81 (F6) NARROWING (option B, USER-ratified) — extract the anchoring/freshness composition into a NEW trust/authenticated-read.js chokepoint and route ONLY convert.disjointPaths (a monotonic-safe positive VOUCH-graph read) through it. The other consumers are NAMED residuals — routing the per-persona anchoring filter onto a NEGATIVE-evidence leg INVERTS the monotonic-narrow invariant (see §6/§7). F6 NARROWED, not closed (NS-9). SHADOW / byte-identical disarmed. Arms nothing."
adr: docs/ADRs/0001-fail-closed-arming-manifest.md
predecessor: plans/55 (W2a, merged #118)
---

# plans/56 — EPIC #96 Wave 2b: the read-gate anchoring/freshness chokepoint (#81 / F6)

> **Scope guard (NS-7).** Relocates WHERE the anchoring/freshness filters compose — **arms nothing**. The filters
> are DISARMED (identity pass-through) for every caller today, so routing every consumer through the chokepoint is
> **byte-identical now**; it only changes behavior WHEN an operator arms `meCtx.regProvenance` / `meCtx.freshness`.

## Context

**#81 (F6):** `filterAnchoredRecords` (registration-gate) + `filterFreshVouches` (vouch-freshness) compose ONLY
inside `convert.disjointPaths` (`convert.js:88-90`). The `verifiedRecords` read-gate chokepoint applies
sig-verification only. So arming the anchoring/freshness Sybil defense narrows **1 of 9** consumers; the other 8
read the sig-verified-but-unanchored/unfresh log. ADR-0001 Dec 4: add `authenticatedAnchoredRecords(meCtx)` to the
read-gate returning `verified → anchored → fresh` as one set, and route the consumers through it, so arming covers
the whole trust surface (NS-4: the Sybil defense must cover every fold, not one).

## §1 Runtime Probes — firsthand, this session, against the repo NOW (2026-07-12)

| # | Claim | Probe | Observed |
|---|---|---|---|
| P1 | 9 `verifiedRecords` consumers; only convert composes the filters | `grep -rn verifiedRecords v0/src` | **HOLDS.** convert (composes) + 8 sig-only: `grounding/{reach,cross-verify,creator-standing,verification-strength,premise-score}` + `trust/{stake-anchor,direct,consensus}`. |
| P2 | the filters DISARMED = identity pass-through (no `meCtx.regProvenance`/`freshness` today) | Read `registration-gate.js:6`, `vouch-freshness.js:5`, `convert.js:81-82` | **HOLDS.** Both are identity pass-through when their opts are absent → routing all consumers through the chokepoint is BYTE-IDENTICAL today (the SHADOW-safe property). |
| P3 | no filter → read-gate require cycle | `grep require.*read-gate` in the two filters | **HOLDS.** registration-gate imports `{registration-provenance, refuse-alert}`; vouch-freshness imports `{edge-freshness, refuse-alert}`; neither imports read-gate. |
| P4 | read-gate hosting the composition is layering-legal | Read `layering.test.js:4-8` | **HOLDS.** The DAG bans only REVERSE cross-layer edges (trust→grounding etc). read-gate + both filters are all `trust/`; intra-layer imports are unbanned. (Conceptual note: the filters' comments call themselves "above" read-gate — a soft inversion, not a mechanical violation; Q1.) |
| P5 | two consumers accept PRE-SCANNED recs (O(N+1) avoidance) | Read `cross-verify.js:73-79`, `direct.js:46` | **HOLDS.** Their `recs` contract is "verifiedRecords output (INV-14)"; under this wave it becomes "authenticatedAnchoredRecords output" — a contract change to thread carefully (Q3). |

## §2 Design — `authenticatedAnchoredRecords(meCtx)`

Add to `read-gate.js` (ADR Dec 4; layering-legal per P4):

```text
authenticatedAnchoredRecords(meCtx) =
  filterFreshVouches(
    filterAnchoredRecords( verifiedRecords(meCtx.registry, meCtx.storeOpts), meCtx.registry, meCtx.regProvenance ),
    meCtx.freshness )
```

- **verified → anchored → fresh**, one set, in the ADR's declared order (both are drop-only, commutative — a COST
  choice, per convert.js:83). Gate on the returned set exactly as `verifiedRecords` is gated today.
- **Byte-identical disarmed (P2):** with no `regProvenance`/`freshness` in meCtx, both filters are identity, so
  `authenticatedAnchoredRecords(meCtx) === verifiedRecords(meCtx.registry, meCtx.storeOpts)` element-for-element.
- **`convert.disjointPaths` simplifies** to call `authenticatedAnchoredRecords(meCtx)` (dropping its inline
  filter composition — the single source now lives in the chokepoint).
- **The 8 sig-only consumers** switch `verifiedRecords(meCtx.registry, meCtx.storeOpts)` →
  `authenticatedAnchoredRecords(meCtx)` (subject to Q2). The pre-scanned-recs callers (cross-verify, direct)
  thread the new output (Q3).

## §3 Open questions for the VERIFY board (the real forks)

- **Q1 — location: read-gate.js (ADR) vs a new `trust/authenticated-read.js` composition module.** read-gate is
  layering-legal (P4) but the filters' own comments frame themselves as sitting ABOVE read-gate's sig-verify — so
  hosting the composition IN read-gate is a soft conceptual inversion (read-gate would import trust/ siblings that
  narrate themselves as its consumers). A thin new composition module above read-gate keeps read-gate purely
  sig-only. Trade-off: ADR-literal + one chokepoint vs cleaner layering. The board decides.
- **Q2 (load-bearing) — route ALL 8, or per-semantic-applicability?** ADR says all 8 "so all consumers narrow."
  But do anchoring + VOUCH-freshness semantically APPLY to every consumer? `stake-anchor` reads STAKE records, not
  VOUCHes — is `filterFreshVouches` a no-op (only touches VOUCH-typed records) or a WRONG drop for stake records?
  Confirm each consumer's record-type: a filter that is a semantic no-op for a consumer is harmless to route
  (byte-identical), but one that WRONGLY drops is a correctness bug when armed. Enumerate per-consumer.
- **Q3 — the pre-scanned-recs contract (cross-verify, direct).** Their `recs` param was "verifiedRecords output";
  it becomes "authenticatedAnchoredRecords output". Every call site that passes pre-scanned recs must pass the NEW
  output (else a consumer gets a half-filtered set). Audit the call sites + update the JSDoc contract.
- **Q4 — darkness/behavior:** confirm no darkness witness breaks (the filters gain a second consumer — read-gate —
  besides convert; update any importer-set witness) and that the byte-identical-disarmed property is TEST-pinned
  (an armed-vs-disarmed equivalence test on a real record set).

## §4 TDD-treatment + build order

1. RED-first: a test asserting `authenticatedAnchoredRecords(meCtx)` DISARMED === `verifiedRecords(...)`
   element-for-element (byte-identical property), + ARMED (with regProvenance/freshness) drops the expected
   records, + each routed consumer's disarmed output is unchanged from today.
2. Implement `authenticatedAnchoredRecords` in the board-chosen location.
3. Route the consumers (Q2 subset); simplify convert; thread the pre-scanned-recs contract (Q3).
4. Update any affected darkness/importer-set witness (Q4).
5. 3-lens VALIDATE — Rule 2 (the Sybil-defense read path = security).
6. Pre-PR CodeRabbit → PR → user merge-gate.

## §5 Adversarial shapes FIRST

> ⚠️ **AR2/AR3 below are SUPERSEDED by §6/§7** — they assume the "route all 8 → F6 closed" premise the VERIFY board
> overturned (the monotonicity inversion). In the shipped narrowed build, only `convert.disjointPaths` routes; F6 is
> NARROWED not closed (NS-9). AR1 + the chokepoint's armed-narrows/totality are what the shipped tests pin.

- **AR1 byte-identical disarmed** — every routed consumer's disarmed output === today's, element-for-element.
- **AR2 armed narrows the WHOLE surface** — with regProvenance/freshness armed, ALL routed consumers drop the
  unanchored/stale records (not just convert), proving F6 closed.
- **AR3 wrong-type drop** — a filter must NOT wrongly drop a non-VOUCH/non-anchorable record for a consumer that
  reads that type (Q2); prove `stake-anchor` (and any other) is unharmed armed.
- **AR4 pre-scanned contract** — a consumer handed pre-scanned recs gets the SAME filtered set it would self-scan
  (no half-filtered leak; Q3).
- **AR5 order/commutativity** — anchored-then-fresh === fresh-then-anchored on the kept set (both drop-only).

## §6 VERIFY board resolution (2026-07-12) — architect (APPROVE-WITH-CHANGES) + hacker (NEEDS-REVISION)

The board found the ADR's "route all 8" premise is **naive** — it would bake a known-wrong armed semantics into the
relocation. The load-bearing catches:

- **HIGH (both) — the monotonic-narrow INVERSION on negative-evidence folds.** `filterAnchoredRecords` drops
  un-anchored personas' records. On POSITIVE-evidence reads (VOUCH/CONFIRM/ACCEPT) that lowers trust (correct NS-4
  narrowing). But on NEGATIVE legs (CONTEST/SLASH/accusation — present in creator-standing, premise-score, direct,
  stake-anchor, cross-verify's demote) it SILENCES un-anchored accusers → RAISES apparent trust, violating the
  monotonic-narrow invariant (arming must never raise the signal, NS-9). **Route-all-8 is WRONG for the negative legs.**
- **Q2 → PER-SEMANTIC routing, NOT all-8.** Freshness is VOUCH-only (`vouch-freshness.js:101` passes non-VOUCH
  through) → route freshness ONLY to VOUCH readers (convert, consensus); routing it to the 6 non-VOUCH folds is pure
  no-op churn. Anchoring → apply where it NARROWS (positive-evidence reads), NOT where it inverts (negative legs);
  the fine-grained per-leg split needs a monotonic re-derivation (a dropped accuser must not RAISE a crater).
- **HIGH (hacker) — stake-anchor has NO arm channel.** It reads via a positional `stakeOf(storeOpts,...)` DI seam,
  not a meCtx bag; `convert.agentStakeAxis` + `issuance-policy.evaluate` never thread regProvenance. So it CANNOT
  narrow-when-armed → do NOT claim F6 closed for it. Route for byte-identical parity + NAME the arm-plumbing residual.
- **Q1 → new `trust/authenticated-read.js`** (both lenses): read-gate keeps its ADR-0002 sig-only SRP; the new deep
  module fans in `{read-gate, registration-gate, vouch-freshness}` (acyclic). Amend ADR-0001 Dec 4's IMPLEMENTATION
  wording (status: proposed) to name the module; the load-bearing decision (one chokepoint, whole-surface) stands.
- **Q3 — the pre-scanned contract needs PRODUCERS + RECEIVERS + self-scan defaults moved in LOCKSTEP.** Receivers:
  cross-verify:79, direct:46. Producers: creator-standing:68, premise-score:57, verification-strength:53,
  consensus:70 + reach's TWO reads (reach:46, verification-strength:53). A producer that keeps `verifiedRecords`
  while a receiver's default moves → a half-filtered armed split (AR4/AR7). Prefer cross-verify/direct default →
  ASSERT-or-throw on omitted recs rather than silently self-scan a divergent set.
- **MEDIUM (hacker) — F9 re-opens at the plumbing.** One chokepoint does NOT unify the arm signals — they still
  flow through N independent meCtx bags. The chokepoint should read the unified `armedContext` (W1
  `resolveArmedContext`) or the plan must NAME the per-meCtx-fragmentation residual.
- **MEDIUM — re-CONCEIVE the darkness witnesses, don't re-point.** The old `['trust/convert.js']` importer-set
  witnesses assert "blast radius = ONE advisory readout" — after the wave that claim is FALSE (the chokepoint fans
  to N consumers). Replace with the new true invariant (filters imported ONLY by the chokepoint), keep non-vacuity.

### Scope implication (the fork)
"Route all 8" is off the table (the inversion). The honest options: **(A)** full per-semantic reshape — route the
monotonic-safe positive/VOUCH reads, re-derive the negative legs so anchoring can't raise trust, thread stake-anchor's
arm channel (complete #81, substantial); **(B)** narrower W2b — build the `authenticated-read` chokepoint + route only
the clearly monotonic-safe VOUCH consumers (convert, consensus), NAME the negative-leg anchoring + stake-anchor arm +
F9-plumbing as residuals (honest partial, F6 NARROWED not closed, NS-9); **(C)** defer W2b, do W3 (#83) first.

## §7 Narrowed build — option B (USER-ratified 2026-07-12)

Route ONLY the genuinely monotonic-safe, non-cascading consumer; NAME the rest. Firsthand refinement of the board's
"convert + consensus": **consensus is ALSO a residual** — `wcons` reads VOUCHes but threads its `recs` into
`direct(...)` (consensus.js:78), and `direct` has a CONTEST (negative-evidence) leg, so routing consensus would
invert `direct` via the contest read (the same monotonicity break). The ONLY clean consumer is
`convert.disjointPaths` — a pure positive VOUCH-graph path count that already composes both filters in this exact
order (no `direct` cascade, no negative leg).

**W2b (narrowed) delivers:**
1. **`trust/authenticated-read.js`** — the new deep composition module (Q1): `authenticatedAnchoredRecords(meCtx)`
   = `filterFreshVouches(filterAnchoredRecords(verifiedRecords(meCtx.registry, meCtx.storeOpts), meCtx.registry,
   meCtx.regProvenance), meCtx.freshness)`. read-gate stays the sig-only INV-14 primitive. Null-safe meCtx.
2. **`convert.disjointPaths` simplifies** to call the chokepoint (drops its inline `filterAnchoredRecords` +
   `filterFreshVouches` imports) — pure DRY, byte-identical (same composition + order).
3. **Retarget the two filter darkness-witnesses** (Q4): `registration-gate-darkness-witness` +
   `vouch-freshness-darkness-witness` importer-set `['trust/convert.js']` → `['trust/authenticated-read.js']`
   (re-conceived, not just re-pointed: the invariant is "the filter is imported ONLY by the chokepoint").

**NAMED residuals (F6 NARROWED — the primitive exists — NOT closed; NS-9):**
- Negative-leg anchoring (creator-standing/premise-score/direct/cross-verify-demote/stake-anchor-SLASH): routing
  anchoring there INVERTS the monotonic-narrow invariant — needs a monotonic re-derivation (a dropped accuser must
  not RAISE trust). An ADR-level design decision, not a mechanical route.
- **consensus** — cascades into `direct`'s CONTEST leg (above).
- **stake-anchor** — no meCtx/arm channel (positional `stakeOf`); can't narrow-when-armed until convert.agentStakeAxis
  + issuance-policy thread the arm signals through the DI seam.
- **The 6 non-VOUCH folds** — freshness is a pure no-op for them (VOUCH-only); routing adds churn for zero behavior.
- **F9-at-plumbing** — the chokepoint reads a per-consumer `meCtx` bag, not the unified `resolveArmedContext`
  armedContext; unifying the arm signal across consumers is a separate step.

**Build order:** RED-first (byte-identical convert.disjointPaths + chokepoint disarmed===verifiedRecords + armed-drops)
→ build authenticated-read → simplify convert → retarget witnesses → 3-lens VALIDATE → CodeRabbit → PR.

## §8 VALIDATE result (2026-07-12) — code-reviewer + hacker live-reprobe + honesty-auditor

All three lenses **SHIP-WITH-NITS** — no HIGH/CRITICAL. The hacker's live probe CONFIRMED the build: byte-identity
holds for every OBJECT meCtx (diverging only for null/undefined, where old threw and new returns [] — the intended
totality widening); armed non-vacuity holds (freshness 3→0, anchoring→[]); the import graph matches the witnesses +
the named residuals. The honesty lens CONFIRMED F6-NARROWED honesty + all three residuals against the code. Folded:

- **MEDIUM (code-reviewer + honesty) — ADR-0001 Dec 4 + ADR-0002 §3 stale.** Amended (ADR-0001 is *proposed*): Dec 4
  gains a dated amendment (location → `authenticated-read.js`; scope → convert-only; the monotonicity-inversion
  correction to "route all 8"); ADR-0002 §3's "NOT yet built" → points at the built module.
- **MEDIUM (honesty) — the two filter witnesses guard filter-import creep, NOT the monotonicity inversion.** Added a
  COMPANION containment witness: the chokepoint (`authenticated-read`) is routed ONLY by the monotonic-safe set
  (`convert.js`) — so a future edit routing a NEGATIVE-evidence consumer through the chokepoint fires RED (the creep
  the filter-witnesses can't see).
- **LOW (honesty) — §5 AR2/AR3 + the module lead sentence over-claimed multi-consumer/F6-closed.** Marked §5
  superseded; reworded the header to "arming narrows every consumer LATER routed; this wave routes only convert".
- **NIT (both) — vestigial `mc &&` guard + imprecise "byte-identical".** Dropped the dead `mc &&` (mc is always an
  object); scoped "byte-identical" to a well-formed meCtx + named the degenerate-meCtx totality widening.

**Evidence:** full suite **883/0**; eslint clean; the unchanged `vouch-freshness-convert.test.js` green = the
convert byte-identity proof; `read-gate.js` byte-untouched (chokepoint is a NEW module).
