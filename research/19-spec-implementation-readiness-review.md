---
lifecycle: persistent
phase: proto-planning — spec implementation-readiness review
created: 2026-06-21
status: review (3-lens: PM + network-security + software-architect)
---

# PACT-spec implementation-readiness — 3-lens review

> Three independent lenses reviewed `PACT-spec.md` against the 18-note research corpus to assess how
> close it is to **an implementation blueprint with minimal design ambiguity**: PM/delivery
> (honesty-auditor), network-security (hacker), software-architect (architect). **They converged.**

## Consensus verdict: RESEARCH-GRADE, not yet BUILD-GRADE — fixable by a mostly-mechanical spec-rev (v1.1)

| Lens | Verdict |
|---|---|
| **PM / delivery** | "Research-grade, not build-grade. **Only 4 of 17 ratified research decisions are reflected in the spec (~24%).** The four that pass are the conceptual spine; the thirteen that fail are the mechanical decisions an implementer needs to build the *right* thing. The spec is a faithful statement of the *thesis* and a stale statement of the *build*." |
| **Network-security** | "NOT-READY as an implementable security blueprint. The *structure* is sound, but **every load-bearing security predicate is named-not-mechanized** — a naive guess on any BLOCKER rebuilds the exact hole the design exists to prevent. Keep every weight SHADOW until the top-5 are pinned." |
| **Software-architect** | "A strong design narrative, not yet a build blueprint. A team **cannot** implement it without making ~12 consequential decisions the spec elides; **9 are already DECIDED in research and need only a mechanical fold into v1.1**, §3 needs an ATMS re-spec, 3 are genuinely-open containments to *parameterize*." |

**The cheap, high-leverage move all three name: a `PACT-spec.md` → v1.1 spec-rev that folds the already-
decided research. It converts research-grade → build-grade WITHOUT any new research.** After it, the v0
(two roots exchange one authenticated, premise-bound, falsifiable claim) is a minimal-ambiguity blueprint.

## Where we stand — what's already solid (blueprint-ready, all 3 lenses agree)
- **The P1≠P2 spine** (§0, INV-1) — clean SRP, internally consistent, reduces to mature crypto.
- **The conditional-validity reframe** (§3, INV-4) — "valid-given-premises, never true," the clearest idea in the doc.
- **The `wcons` weighted-consensus math** (§5) — mechanized, correct, **theorem-backed** (Personalized Hitting Time / TraceRank) *while consensus stays advisory*.
- **The two genuinely-free reuse primitives** — the content-addressed hash-chained log (`transaction-record.js`, "§7 minus a signature") and ed25519 sign/verify (`edge-attestation.js`, = §2's `SIG`).
- **The `[OPEN]` honesty discipline** (§9) — a real distrust-curriculum; tells a PM which "features" are research not build.

## The consolidated ambiguity backlog (deduped across the 3 lenses)
Severity = implementation impact. Status: **FOLD** = decided in research, mechanical spec edit · **DECIDE**
= a genuine design decision still owed · **OPEN** = frontier, parameterize + mark loud (never claim solved).

### BLOCKERS — a correct v0 cannot be built without these
| # | Ambiguity (spec §) | Lenses | Status | Fix |
|---|---|---|---|---|
| B1 | **"disjoint / independence" is undefined** — the word the whole defense rests on (§5 `DISJOINT_PATHS`, §6.2, INV-11) | PM·Sec·Arch | FOLD + OPEN(U2) | Name the **three** predicates — topological (the only one v0 computes; = Menger/Advogato), epistemic/substrate (U2, OPEN), config-stability (OPEN, *unnamed today*); mandate a **visible WEAK flag**; *never let a gate ACT on un-flagged independence*; **forbid reading the AND of axes 1-3 as a substitute for axis 4**. |
| B2 | **FALSIFY is a denial-of-grounding DoS** — auto-COLLAPSE, no authz, no symmetric verification (§3) | PM·Sec·Arch | FOLD (v0 correctness) | Counterexample clears the **same disjoint bar** as grounding; dependents → **`CONTESTED` (reversible)**, never auto-`COLLAPSED`; specify **who-may-falsify**; add the **un-falsify/repair** operator (L8). |
| B3 | **§3 is an ATMS with its load-bearing operators removed** — no acyclicity, no nogoods/contradiction, no revision (§3) | PM·Arch | FOLD | Re-spec §3 as an **ATMS** (nodes/justifications/environments/labels/**nogoods**); **enforce acyclicity** at VALIDATE (fail-closed); add the revision operator; pin the `domain_predicate` algebra + `∩` meet + edge-confidence combinator (possibilistic min). |
| B4 | **`effective_presence()` is undefined AND its definer is an unbound throne** (§1, INV-12) | PM·Sec·Arch | **DECIDE** + FOLD | Define `effective_presence()` as a **decidable pure function over the LOG** (count distinct network-facing signing identities in the delegation closure); **name + bind** the cap-setter / root-issuer / SHOW-curator thrones (auditable, plural, rotating, contestable). |
| B5 | **The WEAK flag has no defined input and no consumer obligation** (§6.2, §9 U2) | Sec | FOLD + OPEN(U2) | Define the consumer rule (*a WEAK record may inform but never gate a high-stakes action*); until the U2 estimator exists, every non-topological axis is permanently WEAK. |
| B6 | **The authenticated minter is never a READ gate** — integrity ≠ provenance (§7, INV-10) | Sec·Arch | FOLD | INV: *every counting/weighting/gating boundary reads `verify(signed-edge)` from an authenticated minter; store-presence is never provenance.* (Mechanism exists: ed25519 + Option-B custody via `resolveSigner` + gate reads on `verifyRecordSig`.) |

### MAJORS — two teams build incompatible/ambiguous things without these
| # | Ambiguity | Lenses | Status | Fix |
|---|---|---|---|---|
| M1 | **REACH (§6.3) vs receiver-controlled trust (INV-2)** — emergent vs computed undecided; the computed reading re-creates the L1 misinformation engine | PM·Sec·Arch | FOLD | One paragraph: REACH is **emergent-descriptive** (envelope of independent receiver-local accepts), never computed-prescriptive. |
| M2 | **INV-10 "THE auditable log"** assumes a global canonical log that can't exist across N untrusting roots; linear `PREV_HASH` can't detect equivocation | PM·Sec·Arch | FOLD | **Per-receiver Merkle logs + RFC 6962 inclusion/consistency proofs + STH gossip**; replace the linear chain. (A re-shape, not a bolt-on.) |
| M3 | **Config-hash binding absent** — trust binds to a keypair; a swapped model inherits trust (§1, §5) | PM·Arch | FOLD | Scope DIRECT trust to a **config-hash**; decay/re-evaluate on change. |
| M4 | **Build-vs-borrow not inverted; §10 phase order; no discovery layer** (§2/§4/§10) | PM·Sec·Arch | FOLD | DROP bespoke frame+FSM → **adopt DID/VC + A2A/JSON-RPC + mTLS/OIDC + RFC 6962 + ATMS + Subjective Logic**; **ADD an Agent-Card `/.well-known/` discovery layer**; adopt the **inverted phase table** (P0 Boundary → P1 Claim-as-ATMS [P0+P1 = v0] → P2-P5 each naming its `[OPEN]` dep as a phase contract). |
| M5 | **§11 over-claims** — "contract verification = §3 *already premise-bound!*" / "DIRECT/CONSENSUS engine" / "≥2-distinct JOIN = SAME mechanism" while §3 is **MISSING** and the trust engine is **0-hits in code** | PM·Sec·Arch | FOLD | Rewrite §11 with per-row ACCURATE/OVER-CLAIMED/MISSING verdicts; move persona-provenance reuse→gap; reframe as "real primitives (log + ed25519) + greenfield boundary." |
| M6 | **No "never-counts-nodes" invariant** — live `rollupCounts` launders 5 echoes → `CRITICAL:5` | PM·Sec | FOLD | INV: *no boundary tallies confirmation count; verification is local re-check, never a peer-count*; route hierarchical scale through Proof-Carrying Data, not aggregation. |
| M7 | **SBT-as-U1 + "registry-not-oracle" invariant absent** (§9) | PM·Arch | **DECIDE** + FOLD | Name SBT/DID-VC as the v0 root default behind the seam; INV: *the anchor is a registry, never an oracle; it never auto-mints a DIRECT edge* (else the Sybil-~0 result collapses); coarse/batched, never per-spawn. |
| M8 | **No explicit threat model / trust-boundary map**; cold-start/eclipse entirely absent (transport-layer, U1-irrelevant) | Sec | FOLD | Add a §threat-model (trust boundaries + attacker tiers); note eclipse/cold-start is a **transport-layer** defense (diverse bootstrap + STH gossip + fork-detecting witnesses), not a trust-metric gate. |
| M9 | **Scope-intersection is a glyph, not an algorithm** — `domain_predicate` type, `∩` computation, edge-confidence combination all undefined (§3.1) | Arch | FOLD | Pin a concrete predicate algebra with a defined meet + edge-confidence combinator; one worked two-premise example. |
| M10 | **`CROSS_VERIFY`'s `f(...)` and transitive `VERIFICATION_STRENGTH` undefined** (§6.2, §6.3) | Sec·Arch | FOLD | `VERIFICATION_STRENGTH` composes as **`min` (weakest-link)** to the deepest empirical root; `f` monotonically **discounts on correlation** (adopt Subjective Logic's path-independence-before-fusion). |
| M11 | **The v0 definition-of-done is not in the spec** (§10 EXITs are prose, not testable) | PM | FOLD | Add verbatim: *"Two mutually-untrusting roots exchange ONE authenticated, premise-bound, scope-checked, falsifiable claim — and a fabricated counterexample does NOT silently collapse it."* |

### MINOR / OPEN-frontier (parameterize, mark loud — never claim solved)
- **U2 epistemic/substrate-independence estimator** — the deepest open hole; ship topological + permanent WEAK flag; the estimator is the real P5 work.
- **Cold-start / eclipse** — orthogonal to U1 (closing U1 won't close it; Friedman-Resnick); transport-layer containment.
- **Scope-boundary probing test (U3)** — name `edge_confidence` + sparse-edge probing as a build item (§9 U3).
- **The spec-vs-live-code precondition** — INV: *every lab weight stays SHADOW/advisory, gating nothing, until the authenticated-minter read + stakes-weighted tier + live WEAK flag are built* (today's containment is "by absence-of-wiring, not structure").

## The genuine design DECISIONS still owed (everything else is a mechanical FOLD)
1. **`effective_presence()`'s concrete definition** (B4) — the one load-bearing function the research names a *requirement* for but never fully specifies. Needs a design decision.
2. **The U1 v0 default behind the seam** (M7) — invite/vouch+stake (true MVP) vs Personhood Credentials (stronger, heavier). You've already leaned **SBT**; this picks the issuance default. (Flagged as user-ratify in note 10.)

Everything else in the backlog (B1-B3, B5-B6, M1-M6, M8-M11) is **decided in the research and folds mechanically** — ~11 FOLD vs 2 DECIDE.

## The most damaging single overclaim to fix first (PM lens)
**§11: "contract verification → §3 VALIDATE — *already premise-bound!*"** — this tells a planner the hardest novel tier (the entire reason PACT isn't just another A2A protocol) is *done*, when it is **fully greenfield**. Ship it into a build plan and the team budgets the novel core as "reuse + wiring," then discovers mid-build it's all greenfield — schedule and the "build on Power Loom" decision both blow up.

## Recommendation
**Do the `PACT-spec.md` → v1.1 spec-rev now.** It's mostly mechanical (fold 11 already-ratified decisions + 2 design decisions), needs no new research, and converts the corpus from research-grade to a minimal-ambiguity v0 build blueprint. The architect's §-by-§ table-of-changes (in the architect-lens output) is the concrete edit list. **Two correctness items (B2 FALSIFY-fix, B3 acyclicity) must land *in* v0, not be deferred.**
