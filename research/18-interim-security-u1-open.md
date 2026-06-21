---
lifecycle: persistent
phase: proto-planning — security-posture verdict
created: 2026-06-21
status: recommendation (adversarially verified, live-substrate re-probed)
---

# Interim security with U1 open (soulbound anchor) — can malicious actors take control?

> 5-agent adversarially-verified workflow (`wkoib97gv`). **Verdict: YES_WITH_PRECONDITIONS —
> CONTROL is structurally prevented by construction (U1-independent); INFLUENCE is contained-not-
> eliminated.** Directly answers: *until the SBT ties to the exact person (U1 closes), can the
> network infrastructure allow trust propagation without letting malicious actors take control?*

## The clean, U1-independent answer: there is no control to take

"Take control" = one of three network-wide powers, and **each requires a global object PACT
structurally refuses to instantiate** — so none is gated on identity-count, and none opens while U1
stays open:

| Control form | Why it's prevented (by construction, U1-independent) |
|---|---|
| **(C-a) Seize a central authority** | There is none — no admission gate, no global trust score (consensus is advisory-only, INV-6), no global canonical log (per-receiver Merkle logs, INV-10), trust is receiver-controlled (INV-2). A seat that doesn't exist can't be captured by any number of minted identities. |
| **(C-b) Force a false claim to validate** | VALIDATE is mechanical, decidable, locally re-checkable — every receiver re-runs `derivation_sound(content, premises)` with no shared oracle. A derivation that doesn't follow can't be made to pass for someone else. |
| **(C-c) Dominate propagation network-wide** | REACH is gated by disjoint *verification*, never engagement/identity-count (INV-9/L1); `wcons` weights every vouch through the receiver's *own earned graph*, so a million Sybils inflate raw count but contribute ~0 to the weighted score. |

**This is theorem-backed, not hoped.** The receiver-rooted weighted metric making Sybils contribute
~0 is **Personalized Hitting Time** (Seuken/Parkes/Liu, Thm 1: *"sybils do not bring new manipulation
ability"* — unique to PHT among the PageRank family, where Sybils *do* help), instantiated for agent
economies by **TraceRank** (2025): *"if a service receives payments from N addresses with zero seed
scores, it accumulates ZERO propagated reputation regardless of N."* PACT's `wcons` is exactly the
personalized variant — **provided** (a) it stays receiver-rooted (not global) and (b) consensus stays
advisory (INV-6), and (c) the SBT does **not** auto-mint an earned edge (an SBT is a scarcity/registry
anchor, **not a vouch** — if root-issuance granted a DIRECT edge, the ~0 result collapses).

**What U1-open leaves reachable is exactly and only bounded-local influence** — receiver-granted,
per-edge, revocable, decaying, catchable — and the SBT widens its cost/count only **linearly**. It
cannot promote any actor across the line into control, because the control-forms were never gated on
identity in the first place — they were structurally removed.

## Contained-not-eliminated (the residue, marked loud per M1/I8)
- **Earned-then-betray / patient sleeper (U4)** — earn genuine trust, defect at a high-stakes moment.
  Bounded by disjoint high-trust corroboration (single sleeper insufficient) + asymmetric crater
  (INV-8, a one-shot spend) + catchability (M6). *Bounds the damage, never the con — the first
  betrayal still lands.* Permanent by design (the price of refusing a judge of truth, M2).
- **Collusion ring of genuinely-earned identities** — bounded by disjoint-paths + voucher stake.
- **Bounded-influence accumulation under linear Sybil cost** — a funded attacker accumulates more than
  an honest one; bounded by the 4-axis portfolio + cap×disjoint-paths + decay.

## Genuinely OPEN (orthogonal to U1 — closing U1 does NOT close these)
- **U2 epistemic independence (the deepest hole):** "disjoint" is topology-only and forgeable — mint k
  roots + k cheap probation edges → k crypto-distinct, epistemically-**correlated** paths that pass a
  naive `DISJOINT_PATHS≥k` by construction. **The containments for earned-then-betray and collusion
  *depend* on disjoint corroboration, so U2-open makes them collapse toward OPEN unless the WEAK flag
  is live.** The substrate already ships the confusion (`lesson-confirm.js:25` "byte-distinct !=
  logically-independent").
- **Eclipse / cold-start (attacks graph *position*, not identity count — U1-irrelevant):** an eclipsed
  or brand-new (edge-less, α≈0) node is forced onto the advisory consensus channel and fed a
  false-but-consistent graph; conditional-validity re-checkability does **not** save it (it re-checks
  against the *attacker-supplied* premises). Cost is modest and **independent of network size**
  (Heilman: a 4600-bot botnet eclipses with ≥85% probability). Defense is transport-layer
  (diverse bootstrap + RFC 6962 STH gossip + fork-detecting witnesses), not trust-metric-layer.
  **Friedman-Resnick: free-novice-entry AND whitewashing-immunity are jointly unattainable without U1.**
- **Config-swap / fork laundering** (the unnamed third independence predicate) — until config-hash binding.

## The load-bearing caveat: spec vs live code (the hacker re-probed main firsthand)
The posture above holds for the **corrected spec**. In the **live substrate**, several bounding gates
are spec-only and three tally holes are exploitable *today*:
- `wcons` / `DISJOINT_PATHS` / `PROBATION` / `VOUCHER_STAKE` / `CROSS_VERIFY` = **0 hits** — the trust
  engine the whole story rests on isn't built.
- **Aggregation laundering** (5× inflation, no WEAK field), **farmable tier** (5 trivial passes →
  high-trust), **presence-as-provenance** (`reputation-gate` proceeds on a caller-forged source stamp)
  — all three triggered firsthand on main.
- **Containment today is by ABSENCE-OF-WIRING, not by structure** — nothing acts on the weights
  (diagnostics only). That's fragile: the moment a weight gates an action, the holes are live.
- The authenticated minter **exists** (`edge-attestation.js`, ed25519, fail-closed) but is not yet the
  lane any consumer gates on.

## Preconditions — before any weight gates an action
1. **Fix the three note-16 holes** — independence/WEAK/provenance vocabulary in the rollup;
   stakes-weighted tier; authenticated-minter read (flip the shadow signer on, gate reads on `verify`).
2. **Make the WEAK flag live AND consumer-read** — never let a gate ACT on un-flagged "independence";
   never read the AND of portfolio axes 1-3 (scarcity/topology/stability) as a substitute for axis 4
   (epistemic independence). Name all three independence predicates.
3. **Authenticated minter at every counting/weighting/gating boundary** (integrity ≠ provenance).
4. **Disjoint-corroboration, WEAK-aware, for high-stakes** (single path never enough).
5. **Real decay + asymmetric crater** (today display-only) · **receiver-relative propagation, never a
   global trusted-set** · **FALSIFY-fixed + acyclicity** · **cold-start/eclipse transport defense** ·
   **name+bind every relocated throne** (cap-setter, `effective_presence()`, root-issuer, SHOW-curator, thresholds).

Until those land, keep every lab weight **SHADOW/advisory, gating nothing.**

## The upgrade path: graceful + visible degradation (the answer to "until U1 closes")
U1 is **localized to one seam** (§1/§9 "pluggable root-issuance; upgrade path: stronger anchors"), so
SBT-now → stronger-personhood-proof-later (Personhood Credentials / World ID / a correlation-checked
web-of-SBTs) is a **near drop-in at one layer**, the rest untouched (Open/Closed). Crucially the anchor
stays a **REGISTRY, not an ORACLE** even when upgraded — it records a root, never becomes a global
score or admission throne (that would re-instantiate C-a), and stays coarse/batched, never per-spawn.
Security **degrades gracefully** because the anchor is a *containment parameter, not a precondition*: a
weaker anchor makes Sybils cheaper (more bounded-local influence to a funded attacker) but **opens no
control-form.** It degrades **visibly** through three surfaces: the WEAK flag (anchor strength legible
at point of use), the named/bound thrones (who controls issuance is auditable), and the SHOW-surface
re-runnable WHY-trace (M5). **It collapses only if the WEAK-flag discipline slips** (a consumer reads a
U1-weak/topology score as strong/epistemic) or if the portfolio AND (axes 1-3) is treated as epistemic
independence (axis 4) — those are the two moves that turn graceful into silent.

## Bottom line
**YES — rely on the infrastructure to PREVENT TAKEOVER (structurally sound, U1-independent, theorem-
backed), with preconditions before relying on it to BOUND malicious action.** A malicious actor cannot
seize authority, force a false claim to validate, or dominate propagation — those require global objects
the design refuses, and the SBT staying uniqueness-open changes none of it (it only widens bounded-local
influence linearly). So the SBT-as-U1-root decision is **safe against takeover.** But do not read
"contained" as "eliminated," and do not credit the corrected spec's guarantees to today's code — build
the preconditions, keep weights shadow until then, and render the permanent residue (earned-then-betray,
topology-forged corroboration, eclipse/cold-start, GIGO-on-a-false-root) loudly. **Next concrete step: a
code-grounded re-probe of the three live holes before wiring any weight to an action.**
