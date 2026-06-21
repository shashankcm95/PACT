---
lifecycle: persistent
lens: claim-vs-evidence (honesty-auditor)
phase: proto-planning verification
created: 2026-06-21
---

# Honesty Audit — PACT Blueprint (claim-vs-evidence lens)

> HETS verification lens 2 of 3. The spec+intent pair treated as a self-attestation surface:
> the tags (`[SOLVED]`/`[BUILD]`/`[OPEN]`) + §8 invariants are the *claims*; the mechanism
> prose is the *evidence*. Evidence standard is internal (no code yet).

**Fairness up front:** this blueprint is unusually honest by construction — a whole companion
doc of failure modes (self-satisfies its own L10 distrust-curriculum), U1-U4 marked `[OPEN]`
loudly, an explicit meta-note disclaiming what it does NOT do. The audit finds where that
honesty is *mechanized* vs *performative*.

## Part 1 — the `[SOLVED]` tags
- **1.1 P1 transport `[SOLVED]` → OPTIMISTIC.** `verify ∧ chains` reduce to mature crypto (JUSTIFIED),
  but the third conjunct `root_valid(parent)` (spec:72-73 "This is all of P1. [SOLVED]") smuggles
  the U1 `[OPEN]` uniqueness predicate into a `[SOLVED]` claim. Root *signature* is checkable;
  root *uniqueness* is U1. **The most important missing [SOLVED] caveat in the document.**
- **1.2 PACT frame `[SOLVED]` → JUSTIFIED.** Standard signed/sequenced/hash-chained envelope.
- **1.3 Session FSM `[SOLVED]` → JUSTIFIED.** Textbook handshake; honesty correctly kept out-of-session.
- **1.4 §7 audit log `[SOLVED]` → JUSTIFIED** for *tamper-evidence*. Latent MEDIUM gap (negative
  attestation): single-writer log is not fork-evident / availability-guaranteed; across
  mutually-untrusting roots "whose log is canonical" is unaddressed while INV-10 leans on it.

## Part 2 — the `[OPEN]` containments
- **2.1 U1 → OPTIMISTIC.** "cap × disjoint-paths" is a real named lever, but issuance
  ("pluggable, start invite/vouch + stake") is a TODO + "EXPENSIVE and BOUNDED" is unquantified.
- **2.2 U2 (correlated consensus) → OPTIMISTIC bordering OVERCLAIMED.** "IMPLEMENT independence
  estimation" is the *entire hard problem restated as an imperative verb.* No estimator, no
  metric, no definition. Asserted twice (§6.2 + §9), specified zero times. **The sharpest
  "TODO wearing a containment costume."**
- **2.3 U3 (scope-boundary) → OPTIMISTIC.** `edge_confidence` is a real typed field; "boundary-
  probing tests" is undefined and its own stated failure mode (testing sparsest at the mis-drawn
  edge) is not contained by the proposed containment.
- **2.4 U4 (patient sleeper) → JUSTIFIED.** The model of honest scoping: names the existing
  mechanism, states the residual precisely ("Bounds damage, not the con"). The template the other 3 should follow.

## Part 3 — internal consistency (intent ↔ spec)
- **L9 (no stability gate): CLEAN** — measures defection/falsification, not volatility.
- **M5 (show don't resolve): CLEAN** — receiver-controlled throughout; consensus advisory.
- **3.3 L6 relocated throne: minor CONTRADICTION** — the **cap-setter / "effective"-presence
  definer** is an un-named, unbound decider. The spec forbids a central verifier but introduces
  an unbound boundary-drawer, violating its own L6 ("name where power relocated, bind it").
- **3.1 L8 repair-default: PARTIAL** — penalty side mechanized (defection craters); the
  "voluntary disclosure is trust-positive / repair not penalty" side is asserted in intent,
  absent in spec. (Echoes R3's "FALSIFY is only 1/3 of AGM — no un-falsify/revision operator.")
- **INV→mechanism trace:** 9/12 trace cleanly. **INV-9, INV-11, INV-12** are stated as "MUST hold"
  while their load-bearing term (disjoint / independent / effective) points at an unbuilt
  estimator. The most rhetorically load-bearing invariants are exactly the un-mechanized ones.

## Part 4 — §11 Power Loom mapping (paper check)
- **4.1 CONTRADICTION (self-aware):** line 341 files persona-provenance as *reuse* ("→ §6.1");
  line 351 admits the same data is "non-discriminating → needs hardening" (a *gap*). Same
  subsystem filed as both "reuse it" and "this is the build." Recoverable via the doc's own gap-block.
- **4.2 "contract verification … already premise-bound!" → OPTIMISTIC** — verb-inflation; §3 is Phase-1 [BUILD].
- **4.3 "≥2-distinct JOIN … SAME mechanism" → OPTIMISTIC/CONTRADICTION** — same *attack*, different
  *mechanism* (inter-node needs the unbuilt independence estimator); line 349 says so itself.

## Part 5 — build roadmap honesty
- Phase 1, 2, 4(cap-mechanic): EXIT criteria JUSTIFIED / testable.
- **Phase 0 "independently-rooted" → OPTIMISTIC** — testable property is *distinct-keyed*, not human-independent (U1).
- **Phase 3 EXIT → OPTIMISTIC** — "well-verified"/"disjoint" depend on the Phase-5 independence
  estimator; a Phase-3 gate smuggles a Phase-5 frontier dependency.

## Compliance: 9/14 fully-followed (~64%); 4 partial (L4,L8,L11,L12 — named-then-deferred); 1 minor violation (L6)
The diagnostic pattern: **the spec reliably names the right guard and forbids the wrong one,
but the four hardest guards (independence, repair-default, effective-presence, boundary-probing)
are named-then-deferred rather than mechanized.**

## Grade: B · Verdict: MINOR-OVERCLAIMS — trustworthy in direction, optimistic in degree
It does not lie about what's open. It over-claims at the *seams*: `[SOLVED]` absorbing an
adjacent `[OPEN]` (root_valid/U1); invariants "MUST hold" whose enforcing term is unbuilt
(INV-9/11/12); an admitted gap filed in the reuse table. An implementer who reads spec + intent
+ U-block won't be misled; one who reads only §8 + §10 EXITs + §11 reuse table would build the
path-counting, mark INV-11 satisfied, and ship the L4 failure the whole design exists to prevent.
**Fix is small + additive:** annotate the 3 U2-dependent invariants + the 4 EXIT criteria with
their frontier dependency; move persona-provenance from reuse→gap; split `root_valid` into
signature-check `[SOLVED]` vs uniqueness `U1`.
