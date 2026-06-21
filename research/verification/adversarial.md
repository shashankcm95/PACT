---
lifecycle: persistent
lens: adversarial-security (hacker)
phase: proto-planning verification
created: 2026-06-21
---

# Adversarial-Security Verdict — PACT Protocol Blueprint

> HETS verification lens 1 of 3. Target: `PACT-spec.md` + `PACT-intent-and-landmines.md`
> (design phase, no implementation). Attacks traced through spec text with `file:line`.

## The spine
PACT's entire P2 layer rests on three nouns — `DISJOINT_PATHS`, `independence`, and
`EFFECTIVE presence` — and **none of the three is defined as a computable function
anywhere in the spec.** Every finding below descends from that.

## CRITICAL

### C1. `DISJOINT_PATHS >= k` is undefined — the load-bearing Sybil guard is a noun, not a function (INV-11, L2, L3, U2, U4)
`CONVERT` (spec:168-176) gates promotion on `DISJOINT_PATHS(me,agent) >= k`; `CROSS_VERIFY`
(spec:201-207) on `f(DISJOINT_PATH_COUNT, independence)`. The spec never defines what makes
two paths "disjoint" (vertex? edge? by human_uid? by substrate?). **Cheapest k-path forge:**
mint k human-roots via the shipped bootstrap issuance (U1: invite/vouch + stake), have each
earn ONE cheap PROBATION edge to `me`, → k vertex-disjoint, crypto-authenticated paths that
pass by construction. The spec conflates *topological* disjointness (cheap to fabricate) with
*epistemic* independence (the property it needs). INV-11 *claims* disjoint-paths defeats
correlated-consensus while U2 *admits* the independence half is `[OPEN]` — **the guard INV-11
promises is the guard U2 confesses isn't built.** Worse, Phases 2-3 ship CONVERT/CROSS_VERIFY
live BEFORE Phase 5 builds independence estimation → an exploitable topology-only window.

### C2. Bootstrap root-issuance + cheap PROBATION makes mass-root-minting affordable (U1, §1, L2)
"EXPENSIVE and BOUNDED" = `cap × disjoint-paths`. C1 already forged the disjoint-paths factor.
What remains: `cap` (numeric value never set; "effective" undefined) and `stake` (a fresh
attacker-root's DIRECT trust is ~0, so VOUCHER_STAKE risks ~nothing). The web-of-trust
bootstrap is **self-collateralizing for an attacker** — each minted root vouches for the next
at negligible staked cost. A containment whose cost is undefined cannot be claimed to bound.

## HIGH

### H1. Effective-presence cap depends on an unmeasurable quantity (INV-12, L11)
INV-12/§1 hinge on "EFFECTIVE participants, not nominal personas" but never define how
effective presence is measured. Deep delegation trees of sub-agents sign frames under one
`SRC_PERSONA`; the frame (§2) carries no field bounding delegation depth/fan-out, and no
mechanism attributes a sub-agent's wire presence to the root budget. The cap is enforceable
only if `effective_presence()` is a defined function over the §7 LOG — and it isn't.

### H2. Recursive premises-as-claims launder a weak root into far reach (INV-9, L1, §3, §6.3)
§3 allows `premises:[Premise|Claim]`. Author weak root P0 → wrap in Claim C1 (mechanically
VALID, conditional) → use C1 as a premise for C2… each step VALID. The spec never says whether
a Claim-used-as-premise contributes its *root's* verification strength or its *own mechanical
validity*. If the latter, mechanical validity launders P0's weakness into far reach — L5
layer-confusion recurring inside the grounding DAG. The §6.3 threshold is named but the
transitive `VERIFICATION_STRENGTH` computation that would enforce it is unspecified.

### H3. Falsification-propagation is a denial-of-grounding DoS — no authz on FALSIFY (§3, INV-8) — **BROKEN AS WRITTEN**
`FALSIFY` (spec:111-116) auto-propagates COLLAPSE down the DAG. The spec never says WHO may
falsify or what bar a counterexample must clear. Establishing grounding requires disjoint
cross-verification (expensive); *destroying* it requires one cheap in-scope counterexample
(spec:122) that propagates automatically — **the guard is on the wrong side of the asymmetry.**
Fabricate a counterexample to a widely-depended root → mass-collapse its sub-DAG in one move.
Fix: FALSIFY's counterexample must itself clear disjoint cross-verification; dependents mark
`CONTESTED` (reversible) not auto-`COLLAPSED`; specify who-may-falsify.

## MEDIUM
- **M1. CreatorStanding farm-then-spend (§6.1):** standing is count-flavored, not stakes-weighted
  → farm trivial-true premises, spend on one false high-stakes premise (window before falsify).
- **M2. PROBATION has no difficulty floor (U4, §5):** cheap per-edge cost is exactly what makes
  C1's k-path forge affordable; compounds C1.
- **M3. Audit LOG never gates write-admission (§7, INV-10):** integrity ≠ provenance — a
  single-party-signed favorable behavior entry is byte-valid + tamper-evident + self-authored.
  Trust-relevant entries must require the counterparty's signature + an authenticated minter
  (the repo's own #273 lesson).

## Overall verdict
- **SOUND:** the P1≠P2 layer-split at §2/§4 (signature buys WHO+UNTAMPERED never TRUE);
  the weighted-consensus `wcons` math (raw Sybil count → ~0) **while consensus stays advisory**;
  the M1/M2 containment-not-elimination honesty.
- **UNDERSPECIFIED (defense named, not mechanized):** `DISJOINT_PATHS`, `independence`,
  `EFFECTIVE presence`, transitive `VERIFICATION_STRENGTH`, CreatorStanding stakes-weighting,
  PROBATION floor, LOG write-admission.
- **BROKEN AS WRITTEN:** FALSIFY (H3); the Phase 2-3-before-5 ordering (live topology-only gate).

**One-line most-critical exploit:** PACT's entire Sybil/grounding defense reduces to
`cap × DISJOINT_PATHS`, and **both factors are undefined nouns** — the spec smeared the
unsolved `independence` problem (U2) into INV-11/INV-9 as though solved, committing the exact
L4 trap the design doc warns against.

**Rule-2a note for build time:** C1/H2/H3 each warrant a live re-probe against the built
CONVERT/CROSS_VERIFY/FALSIFY — a clean unit suite will NOT surface the topology-vs-independence
gap because a mock returns clean "disjoint" sets the real adversary fabricates.
