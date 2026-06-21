---
lifecycle: persistent
phase: proto-planning — design-direction synthesis
created: 2026-06-21
status: recommendation (adversarially verified)
---

# Swarm/hive inspiration + the "self-contained unit of truth" — integrated verdict

> Two adversarially-verified workflows (`wq43a9zwk` swarm/stigmergy, 5 agents; `wvhk6i30r`
> physical-coordinates, 4 agents — see [13](13-physical-coordinates-independence-anchor.md)).
> **Swarm verdict: ADOPT_PARTIAL — take the swarm's CONVERGENCE, refuse its COUNTING-is-safe
> illusion. Refinement verdict: CONCEDE-AND-CORRECT — both your instincts are right in direction
> and mislabeled with the one word ("truth") the design exists to refuse. Rename, don't redesign.**

## The "lost in translation" — two senses of "hive"

The spec uses **"hive" = the villain** (top-down authoritarian monoculture). Your inspiration is the
**leaderless, signal-based, quorum mechanism** — the *opposite*. The bee *mechanism* is on PACT's
side and vindicates three of your core instincts:

| Honeybee mechanism (Seeley) | PACT analog | Verdict |
|---|---|---|
| Dance **decay** (~17 fewer circuits/return) — influence must be re-earned | **INV-8 decay** (already *sharper*: asymmetric crater) | **strong** — keep INV-8 as-is; bee = validation |
| **Quorum sensing** (threshold of bees at one site, NOT a swarm-wide vote) | **CONVERT `DISJOINT_PATHS ≥ k`** (local threshold, not popularity tally) | **partial** — adopt the shape, re-earn the guarantee |
| **Cross-inhibition** (stop-signals suppress rivals) | FALSIFY / contestation | **false-friend** — see below |
| Recruit **flies there & verifies herself**, never copies a dance | **M5 show-don't-resolve** | **strong** |
| **No leader** (queen doesn't decide) | **no central throne (L6)** | **strong (execution layer only)** |
| Dance **vigor ∝ scout's firsthand quality assessment** | claim magnitude | **reject** — single-source self-asserted quality = L1/L4 hole |

## The deepest result — a theorem, not a hunch: a leaderless quorum *consumes* Sybil-resistance, never *sources* it

Bee quorum-at-a-site and PACT's `DISJOINT_PATHS ≥ k` are **structurally identical** — but the bee
version's safety came **entirely from physics that does not transfer**:

- **Bees get independence FOR FREE FROM PHYSICAL SPACE.** A quorum of 20 = 20 real flights by 20 real
  bodies; you cannot Sybil it (a fake bee costs a real bee) and you cannot correlate two bees'
  measurements except by both physically visiting (which *is* independent measurement). Embodiment
  welds Sybil-resistance and epistemic-independence into one free gift.
- **Digital agents are disembodied.** An attacker mints k keypairs at zero marginal cost (U1), and k
  cryptographically-distinct agents can **share one model/prompt/data substrate** — one source echoed
  k times while every signature looks independent (U2/L4).

The CS lineage turns this into theorems: **Malkhi-Reiter** quorum safety presupposes known/fixed/
bounded-fault membership (n>4b); **Cachin (OPODIS 2022)** proves permissionless quorums *cannot*
achieve Byzantine safety without an **external adversary-bounding mechanism**; **Douceur (2002)**
proves Sybil is *always* possible without a central authority or a tested scarce resource. **⇒ The
quorum mechanism is a CONSUMER of Sybil-resistance (which PACT's U1 human-root must supply), never a
SOURCE of it.** PACT was already right to localize Sybil-resistance to U1; the literature proves no
emergence from quorum geometry is possible.

### This is the exact interlock with the physical-coordinates question (note 13)
Note 13 asked: *can we restore the bees' free spatial independence by tying agents to physical
coordinates?* Answer: **no — attested hardware restores the *scarcity* half of the embodiment gift
(U1), never the *epistemic-independence* half (U2)** (same model on N attested-distinct machines =
byte-correlated output). So the two notes compose: **the swarm needs embodiment's independence to be
Sybil-safe; physical coordinates can only supply its scarcity half; therefore the swarm's counting
layer must be gated by U1 + the WEAK-flagged independence portfolio + an authenticated minter — never
by quorum geometry alone.**

## The decisive architectural move: split DISSEMINATION from TALLY

This is the single highest-value transferable import, and it cleanly separates what scales free from
what is frontier-gated:

- **DISSEMINATION layer — ADOPT gossip / CRDT / Byzantine-Eventual-Consistency.** Per-receiver Merkle
  logs converging leaderlessly via gossip (O(log n) rounds; SWIM O(1)/member/round) — this **fixes the
  INV-10 "THE global log" cliff** and needs no frontier solved. The **CRDT Strong-Eventual-Consistency
  theorem (machine-checked, Kleppmann-Gomes 2017)** is the formal *license*: scope-intersection (meet)
  and falsification (monotone collapse) are semilattice-shaped, so the **grounding ledger converges
  with zero coordination.** You *verify a self-certifying record* (O(local)) instead of *polling the
  network* (O(global re-tally)) — the genuine scaling win your bee-inspiration was reaching for.
- **TALLY layer — the false-friend seam.** Byzantine-CRDT Sybil-immunity holds **ONLY for the class
  that never COUNTS NODES** (verify-the-self-certifying-record). The instant a decision depends on
  *how many* agents confirm (CONSENSUS score, CROSS_VERIFY path-count, any "collective signal"), you
  **leave the immune class and re-enter the quorum regime that presupposes U1.** ⇒ gossip/CRDT for
  *dissemination of self-certifying claims* = **ADOPT**; gossip for a *network-wide trust tally* =
  **forbidden** without U1 + an authenticated minter + the WEAK flag.

## Adopt / reject (swarm)

**ADOPT:** ① gossip/CRDT/BEC per-receiver logs (fixes INV-10; the real scaling win). ② decay = INV-8
(keep; bee validates it). ③ quorum-as-CONVERT *shape* — ship topological-only with a **visible WEAK
flag** + an EXIT that states it does NOT yet contain U2. ④ cross-inhibition → FALSIFY: adopt
"negative evidence is first-class," but **reject the bee's cheapness** (the stop-signal is *symmetric
and costly*; FALSIFY-as-written is *asymmetric and cheap* = a denial-of-grounding DoS → fix per
hard-gate #4: a counterexample clears the same disjoint bar, dependents go `CONTESTED`/reversible not
auto-`COLLAPSED`, plus acyclicity + a revision operator) **and reject the converge-to-one telos**.
⑤ "scout-independence-drives-accuracy" = the sharpest *statement* of U2 (a problem framing, not a
solution — the colony is living proof of the thesis *and* its danger). ⑥ leaderless execution =
validation of the anti-throne spine — **but BIND the rule-definition thrones the bees escape by
genetic fixity** (evolution is their un-capturable rule-author; PACT has none → who sets k, the
signal-interpreter `f`, the independence-definer, `effective_presence()` [grep = 0 hits today], the
root-issuer, the SHOW-curator are all **unbound thrones**, L6).

**REJECT:** ① **stigmergy as a trust primitive** — an unauthenticated shared-write medium where adding
fake ants *strengthens* a (possibly wrong) trail = the Sybil failure by construction. The lesson it
teaches by counter-example: **any count/weight that gates an action needs an AUTHENTICATED minter
(a signed record or a kernel-owned writer), never a store re-hash** (the repo's #273 residual).
② dance-vigor as a self-asserted quality field (keep REACH gated by *verification*, L1). ③ "quorum
like bees" as a *Sybil-resistance* claim (theorem says no). ④ the **converge-to-ONE telos** wholesale
— PACT's steady state is *metabolized, preserved disagreement* (M3/M4: the distribution IS the
signal); adopt the convergence-shape for the durable *grounding ledger* (commutative merge is
correct), explicitly NOT for the trust/opinion layer (forcing consensus = manufacturing it).

## Your refinement — CONCEDE-AND-CORRECT (the correction is load-bearing)

Both instincts are correct in *direction* and both are mislabeled with the one word — **"truth"** —
the entire design exists to refuse. **Rename, don't redesign.**

- **(A) "trustworthy can simply depend on history" → SOUND-WITHIN-A-NARROW-BOUNDARY.** The safe form:
  a **watched, decaying, asymmetric (defection craters), receiver-weighted reliability PRIOR over the
  caught-vs-uncaught BEHAVIORAL axis** — which *is* PACT's own DIRECT-trust computed from the LOG
  (INV-10), so the instinct is already the mechanism. **Never** over the *truth* of its claims (L5: a
  perfectly-authenticated liar has a flawless history); **never** a *stability* measure (L9: gate on
  what *drives* change, not the rate — a consistency-reward builds the rigid hive); **defeasible
  forward** the instant fresh evidence lands (U4 patient-sleeper); a **prior, not a proof** (L8: treat
  it as proof and you punish the honest error-discloser → drive concealment). The landmine words are
  **"simply"** (tempts the L9 stability reading) and **"trustworthy"** (tempts the L5 truth conflation).
- **(B) "a premise+context+scope-bounded validated conclusion is a self-contained unit of truth" → the
  CONSTRUCT is the BEST part of the design; the NAME is the most damaging overclaim.** It is a
  **scope-bounded CONDITIONAL-VALIDITY artifact** — `VALID_GIVEN(premise P within scope S)`, explicitly
  **defeasible**, whose validity is contingent on still-unfalsified roots **it does not itself hold**
  (so *not* self-contained). The spec says it verbatim: `PACT-spec.md:109` "NEVER TRUE. always
  conditional"; I3/INV-4 "asserts no raw truth"; I4 makes falsification *propagate down* and collapse
  dependents; M1/M5 refuse a judge of truth. Two concrete failures follow from the word "truth":
  (1) **"truth" re-imports the undecidable question** every node must now agree on → forces a
  judge-of-truth = the relocated throne (L6/M1/M5) → **destroys leaderless scaling**; (2)
  **"self-contained" erases the scope+defeasibility metadata** that makes falsification propagate (I4)
  → a falsified root would stop collapsing dependents → **kills the network's self-correction.**

**Why the rename is itself the scaling argument** (this is the payoff that vindicates your intuition):
`valid-given-P` is **portable + locally re-checkable** — any node re-runs `derivation_sound(content,
premises)` and reaches the same verdict with **no central oracle**, because I3 converts undecidable
"is it true" into decidable "does A follow from P." That decidability is *exactly* what lets a
leaderless quorum of bees emit independently-re-checkable dances. **Truth needs an oracle (doesn't
scale); conditional validity is locally re-checkable + defeasible (scales).** So your instinct — bound
premise+context+scope to a validated conclusion as the scalable unit — is precisely correct; only the
*name* must change: **from "unit of truth" → "unit of conditional validity (defeasible, scope-bound)",
and from "stable-history-as-proof" → "watched, decaying prior".**

## Does it scale better? YES on coordination-shape, NO on the trust/Sybil guarantee.

- **What it genuinely buys (real, provable, transfers to digital agents):** leaderless **O(local)
  convergence** with no node holding global state and no O(N) tally, for the **durable grounding ledger
  of self-certifying claims** — achievable **without solving U1/U2**, because convergence-shape is
  independent of whether the confirmations are genuinely independent. This is the formal license for
  per-receiver Merkle logs (fixes INV-10), bounded depth-k attenuated `wcons`, and decay-bounded state.
- **What it does NOT buy (the load-bearing break = U2):** the swarm does not *close* independence — it
  **relocates** it to the same undefined predicate, just spatially-flavored. The instant a decision
  *counts*, it presupposes U1. **It scales better at the coordination/dissemination layer; it does not
  make the network more trustworthy — because trustworthiness was always gated on independence, and
  independence is the one property a wire cannot inherit from a hive.**

**That relocation is not a failure — naming it loudly is the integrity.** Keep U1/U2 marked `[OPEN]`,
contained-not-eliminated, and never let a count that gates an action run without an authenticated
minter behind it.
