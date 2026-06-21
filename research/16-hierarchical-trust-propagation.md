---
lifecycle: persistent
phase: proto-planning — design-direction synthesis
created: 2026-06-21
status: recommendation (adversarially verified, live-substrate probed)
---

# Hierarchical trust-propagation (flat→hierarchical past the boundary) — verdict

> 4-agent adversarially-verified workflow (`wkiadikib`). **Verdict: SOUND_WITH_AMENDMENTS.** Your
> instinct — abstract layers to scale by *verification*, go hierarchical past the flat-bee boundary,
> each layer internally verifiable before propagating — is **correct, prior-art-backed, and the only
> resolution that survives the landmines.** But layer-internal verifiability is **necessary, not
> sufficient**: it makes capture *visible + bounded*, never *immune*.

## The spine is right (and has a name): Proof-Carrying Data
"The upper layer checks a proof, it does not trust the lower" is **Proof-Carrying Data / recursive
proof composition** (Chiesa-Tromer; Valiant IVC; Nova folding). Every inter-layer message carries a
short proof that it *and all its history* complied with a predicate; the receiver verifies the proof
**without re-executing and without trusting the producer**, and the proof is **constant-size
regardless of how deep the stack is.** That's the literal mechanism for "abstract a deep lower layer
into one checkable artifact," and it's the inter-layer lift of the conditional-validity unit (the
receiver re-runs `derivation_sound(C, P)` locally — no oracle, no throne). **It transports the
machine's mechanical certainty across the boundary; it carries none of the human truth-burden** (GIGO
survives every proof — PCD certifies *compliance given inputs*, never the *truth* of inputs).

## The throne REOPENS — and the live substrate already proves it
Layer-internal verifiability **defangs the throne for *dissemination* of self-certifying claims, and
reopens it the moment a boundary does any of four things** — all four of which the proposal wants, and
the hacker found **three already wrong in the live HETS code** (probed firsthand):

1. **COUNTS (aggregation laundering — the headline, CONFIRMED).** `hierarchical-aggregate.js`
   `rollupCounts` sums child severities by *self-asserted parent* with **zero independence / diversity
   / WEAK / provenance vocabulary** (grep = 0). The probe rolled **5 byte-identical echoes of one
   source into parent `CRITICAL:5`** — 5× inflation, no flag. *A proof of correct aggregation over
   correlated inputs is the L4 trap with a certificate.* And the WEAK flag the resolution leans on
   **doesn't exist in code** — and even if built, it only *contains* (preserves lineage, caps
   inflation) because U2 independence is undefined, so the flag would be blind anyway.
2. **GATES SCRUTINY ON A FARMABLE TIER (farm-then-spend, CONFIRMED).** `trust-scoring.js` `tierOf`
   computes the tier from **raw unweighted passRate**; stakes feed only the *bonus*, never the tier.
   Probe: **5 trivial passes → high-trust → 0 challengers.**
3. **TREATS STORE-PRESENCE AS PROVENANCE (CONFIRMED).** `reputation-gate.js` self-documents its
   `source===SOURCE` check as a **mis-wire guard, not authentication** — the #273 family (a co-forged
   record passes every store re-hash). Integrity ≠ provenance.
4. **FALSIFIES cheaply** — a fabricated counterexample auto-collapsing a sub-DAG is a denial-of-
   grounding attack against the proof layer itself (the asymmetry on the wrong side).

**Throne verdict: REOPENED.** Verifiability buys *auditability + bounded, flagged, visible capture*
(real M6 "catchable betrayal" value) — it does **not** buy immunity. Sell it as **containment +
visibility (M1), never immunity** — collapsing that distinction re-creates the L4/L6 throne.

## The sharpest positive result: the conditional-validity unit is the right shared-agreement primitive
For **two goal-divergent agents**, this is arguably the *only* sound primitive: they cannot be forced
to agree on a *conclusion* (M4 — manufactured consensus is the failure mode), but they **can agree on
the implication**: "GIVEN premise P within scope S, content C follows" — re-runnable by both with no
shared oracle and no shared goal. **They agree on the implication while disagreeing on the antecedent
*and* the conclusion.** Disagreement relocates cleanly to a small, explicit, contestable root-premise
set (M5). Three corrections: keep the name *conditional validity* (not "truth"); scope is part of the
agreement (∩ ancestral scopes, graded edges); and **two valid-given-their-premises units can directly
contradict** — needs a contradiction/argumentation layer above it (ATMS nogoods + a preference
relation; ASPIC+ proves preferences are *required*).

## "Higher trust → more validated claims" must be INVERTED
- **Landmine read (reject):** trust *backed by* a claim-count that weights/admits future claims =
  I2 volatile/durable conflation + M1 farm-then-spend (trust laundered into grounding).
- **Safe form (and HETS already mostly does it):** an actor's standing is *derived from* its
  track-record of premises that survived **disjoint, stakes-weighted** verification — and that
  standing only ever **lowers the verification burden on its next claim, never raises that claim's
  grounding.** The validated-claim substrate is *evidence for a decaying prior*, never *spendable as
  grounding* for a new claim. (Live: `verification-policy.js` already gates *scrutiny* by trust — the
  right direction; the broken part is the *farmable tier* feeding it.)

## "Only trusted actors propagate" — receiver-relative, never a global set
Safe **iff** receiver-relative + verification-gated (gate on the unforgeable *proof the message
carries* — disjoint-verification strength + signed provenance — weighted through each receiver's own
graph; Sybils contribute ~0). A **global trusted-set is a membership authority = the U1 throne in an
L7 costume.** If a bootstrap set must exist, it *is* U1 — name it, bind it, localize it, mark `[OPEN]`.

## HETS is already a verification tree wearing an org-chart costume
The "PM→Senior→Mid→Junior" framing mis-maps: HETS personas are **cognitive lenses, not ranks**
(architect/code-reviewer/hacker/honesty-auditor), the flow is a DAG of stages where findings **return
as a scout, not a gate**, the aggregator rolls up counts *descriptively*, and trust gates *scrutiny*
not credence. **So this composes mostly by PRESERVATION at intra-node scale.** The inter-node build
adds: the **authenticated minter** at each boundary (so internal verifiability becomes *provenance*
not just integrity — the intra→inter `#273` gap), the **WEAK-flag/provenance aggregator**, the
**stakes-weighted tier threshold**, the **symmetric falsifier**, and **named/bound thrones** (the
root-orchestrator seat + every threshold: `0.8/0.5/minRuns=5`, `passFloor`, the disjoint-path `k`).

## Build elements (tagged)
- **[free]** verification-tree semantics (scout-not-gate; reputation-gate never hard-excludes); descriptive roll-up; trust-gates-scrutiny — preserve these.
- **[buildable]** proof-carrying conditional-validity unit (v0: a content-addressed re-checkable conditional record; later PCD/IVC with *transparent* setup — avoid a CRS tower's shared-setup failure); WEAK-flag + provenance-lineage aggregator; stakes-weighted tier threshold; symmetric falsifier (CONTESTED not COLLAPSED + un-falsify per L8); contradiction/argumentation layer; name+bind the thrones.
- **[open_frontier]** authenticated minter (signed/kernel-writer edges); the U2 substrate-independence estimator (the WEAK flag's missing input); the U1 external Sybil anchor. Mark loudly `[OPEN]` — contained, never solved (M1/M2).

## Bottom line
**Adopt the spine** (verification-not-authority; trust buys less scrutiny not more credence; trust
stays receiver-controlled+flat while grounding aggregates descriptively; receiver-relative
propagation). **It is necessary-not-sufficient**: it reopens the throne at every boundary that counts,
falsifies, aggregates prescriptively, or treats store-presence as provenance — and the live substrate
does three of those wrong today. Build the WEAK-flag/provenance aggregator + the stakes-weighted tier
+ the symmetric falsifier + the contradiction layer; bind the orchestrator seat and every threshold;
and mark the authenticated minter, the U2 estimator, and the U1 anchor `[OPEN]`. **Your intent is
faithfully reflected once `trust→credence` is inverted to `track-record→less-scrutiny`, and
`auditable→immune` is corrected to `auditable→contained`.**
