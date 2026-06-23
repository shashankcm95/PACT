---
status: RESEARCH / design-exploration — SHADOW (gates nothing; maps a frontier, does not build it)
created: 2026-06-23
topic: trust-propagation, premise-amplifier, stigmergy, pub-sub-vs-producer-consumer, self-verifying-payload, U1-as-scalability-unlock, demote-dominant-accumulator, dissemination
provenance: two side-chat brainstorms (2026-06-23) — the stigmergic payload amplifier + the producer-consumer/pub-sub scalability question — which are the SAME mechanism from two angles
---

# 25 — Data-centric trust propagation: the premise-amplifier + the pub-sub / U1 anchor

## §0 Honest banner (read first — OQ-NS-6 / NS-9)

This is a **design-exploration** RFC. It MAPS a frontier; it does **not** harden trust and does **not** build
anything. The mechanism it describes is hardening-blocked on the SAME two foundational frontiers as everything
else: **U1** (human-uniqueness — here, the *scalability anchor*) and **U2** (epistemic independence — here, the
*amplification ceiling*). Status-honest (NS-9): the CONFIRM-dual *half* is BUILT (`research/22` §4); the
amplifier and the pub-sub-anchor model are **DESIGNED-not-built**; the anchor that makes them *scale with trust
intact* is **OPEN** (U1). Nothing here gates an action (SHADOW, NS-8).

## §1 The two questions this unifies

Two side-chat brainstorms (2026-06-23), which turn out to be one mechanism:

- **(A) The payload amplifier.** "Don't rank the users — amplify the *information signal* of a validated
  premise, based on the number of independent verifications." A stigmergic trail: the premise's accumulated
  validation strengthens with reinforcement, evaporates without it.
- **(B) The scalability shape.** "If every node only trusts its immediate relational nodes, we're
  producer-consumer (point-to-point, capped at the neighborhood), not publisher-subscriber (broadcast-scale)."

They are the same mechanism: **(A) is the payload that makes (B) scale.** The self-carried validation weight is
exactly what lets a premise be trusted by a receiver that has no relational path to its producer.

## §2 The crux — transport and evaluation are SEPARATE layers (the layer PACT keeps apart)

"Trust only immediate relational nodes" is the **evaluation** layer (NS-3: per-receiver, relational, advisory
beyond the earned edge). It does **not** describe the **transport** layer.

- **Transport = pub-sub / gossip-shaped, scales freely.** `[SOURCED]` PACT reuses **A2A transport** wholesale
  and builds only the novel trust chain on top (`PACT-NORTH-STAR.md` §2.1); `research/22`'s topic is literally
  "dissemination, CRDT-fold". A premise (or a CONTEST / CONFIRM record) propagates via any topology; this is
  not relational and not the bottleneck.
- **Evaluation = re-derived locally, per-receiver, at read time** (NS-5 derived-on-read) on the payload's
  **self-carried evidence**. A node receives a stranger's premise with *no direct edge to the producer* and
  evaluates it *locally* against its own anchors. It needs a **verifiable chain it can check**, not a relational
  *path* to the source. The relationship graph is one weight-input to local evaluation, not the transport gate.

`[PACT-INFERENCE]` The closest distributed-systems shape is **content-addressed, data-centric pub-sub with
self-verifying payloads** — the **Certificate-Transparency** model: you trust a cert because of the Merkle
inclusion proof it *carries* (verifiable against a log you trust), never because of which mirror served it. CT
scales to the whole web's certs — an existence proof that "trust the message, not the messenger" scales.
(`[SOURCED]` RFC-6962 Merkle is already in PACT's reuse list, `PACT-NORTH-STAR.md` §2.1 — not by accident.)

## §3 The self-verifying payload (what travels WITH a premise)

For a receiver to evaluate a premise without a relational path, the premise must carry its own evidence:

1. **The signed CONFIRM chain.** `[SOURCED]` The propagation weight "rides the signed CONFIRM frame
   (authenticated minter = the confirmer's key)" — `research/22` §4: a confirmer B independently re-grounds
   premise P on its OWN evidence, and that signed CONFIRM becomes the anchor that sets P's propagation weight.
   This is the CONFIRM dual, BUILT + code-verified.
2. **The grounding DAG** (derived-on-read validity — `research/22` §1: dependent claims read CONTESTED on
   re-read; ATMS `validate.js`). The receiver re-computes validity from current premise state; no transmitted
   score is trusted.
3. **The accumulated validation weight** (the amplifier — §4). The premise's signal, as a self-carried,
   re-verifiable quantity.

The payload is **content-addressed + signed** (NS-2 integrity-vs-provenance preserved: the receiver verifies
the body AND the producer, never a self-asserted field). Trust is in the DATA, not the channel or the
relationship.

## §4 The amplifier — the ONLY honest form (demote-dominant, ceiling-bounded, world-anchored-increment, decaying)

Raw "amplify by count of independent verifications" is **unbuildable as stated** and **dangerous**:

- `[SOURCED]` Naive count is the single most-tempting **forbidden substitution** (`research/23` §5.3):
  `n_confirmers` is U1-scarcity-defeated — *"k minted roots fabricate k confirmations."* Count-based
  amplification is a **Sybil megaphone**: whoever can mint nominally-independent verifications amplifies *any*
  premise, true or false. That is the **throne through the back door** (NS-3 / NS-4) — worse than ranking
  agents, because a false-but-amplified claim then propagates *as fact* (violates NS-1).
- `[SOURCED]` And `research/24` proved positive epistemic independence is **not identifiable from in-process
  observables** — so you cannot *count* independent verifications; the positive independence oracle cannot exist.

`[PACT-INFERENCE]` Natural stigmergy resists gaming because the trace is **world-anchored**: an ant *physically
walked* the path; the pheromone is a costly, embodied signal of real traversal. Digital stigmergy *without* a
cost-anchor is gamed every time (link farms, vote brigading, review-bombing). So invert the polarity — build the
amplifier as a **demote-dominant, ceiling-bounded, decaying accumulator**:

1. **Ceiling (NS-6).** The premise's signal can never exceed the *weakest disjoint-verified root* — "confidence
   never outruns evidence." An attenuator-with-a-ceiling, not an unbounded megaphone.
2. **World-anchored increment (NS-7).** Each reinforcement contributes weight ≤ its real out-of-band cost — a
   signed CONFIRM from an **authenticated minter** whose identity is ultimately a **U1-staked / cross-uid-
   custodied scarce human root**, not a minted persona. `[PACT-INFERENCE]` *This is where the 2026-06-23 R1
   cross-uid custody work plugs in: a key in real custody is what makes a reinforcement world-anchored rather
   than self-asserted (`plans/14` §8).*
3. **Independence is DEMOTE-only (`research/24`).** You cannot prove two confirmations are independent, but the
   demote-only estimator can *detect entanglement* (correlated provenance) and **attenuate**. No detected
   entanglement ≠ independence → the premise stays at its weak prior; detected entanglement → demote.
   Amplification never rides raw count.
4. **Decay (stigmergy's evaporation).** Signal fades without fresh reinforcement and propagates demotion on
   falsification — the freshness-gate + falsification-propagation (`research/22` §1-3; NS-5). The cleanly
   buildable half.

**The amplifier is no more honest than its weakest increment.** A count or a self-assertion → it launders; a
signed-by-scarce-root, entanglement-discounted reinforcement under a weakest-root ceiling → it hardens (within
the R1 / U1 limits).

## §5 The scalability pivot — U1 is the anchor that converts producer-consumer into pub-sub

The producer-consumer worry is **correct for the purely-relational regime**, and the pivot is exact. For a
receiver to trust a *stranger's* confirmation, it must trust the **confirmer** — only two ways:

- **Relational path to the confirmer** → back to producer-consumer, capped at the transitively-reachable
  neighborhood. **The scalability ceiling genuinely applies here.**
- **A world-anchored identity substrate** → the confirmer is a U1-staked scarce *human root*, verifiable
  *without* a relational path, against a substrate everyone references → content-addressed pub-sub, scales.

`[PACT-INFERENCE]` So **U1 is also the scalability unlock**, not merely anti-Sybil — it is the thing that makes a
stranger's evidence trustable without a relationship. Status-honest: PACT's *built* trust leans relational (U1 is
a deferred frontier), so **today the model IS producer-consumer-shaped and the scalability ceiling is real**; the
*designed* escape is U1.

## §6 The three residual costs (so this is not an over-claim)

1. **The shared-anchor floor (NS-4).** No trustless broadcast-scale with *zero* common root. The U1 substrate is
   that root — kept **plural / contestable / auditable**, never a global reputation rank (the refused throne). It
   is "trust the *staking system*, not the individual": pub-sub at the identity layer, but a **bounded-throne
   floor**, not zero-throne. Irreducible.
2. **Verification cost scales with reach.** Derived-on-read means every receiver re-verifies every payload's
   chain + freshness TTL (`research/22`). The *trust* model scales; the *compute* does not come free — caching
   helps, freshness bounds how much can be cached. An engineering cost, not a trust flaw.
3. **The U2 ceiling on amplification.** Broadcast amplification by raw count is the Sybil megaphone; only the §4
   demote-dominant, ceiling-bounded form is honest at scale. U2-blocked, like everything at the evidence level.

## §7 Status — built / designed / open

| Layer | State | Anchor |
|---|---|---|
| Transport (dissemination) | `[SOURCED]` REUSED (A2A) — scales | north-star §2.1 |
| Falsification propagation + freshness | DESIGNED (intra-node derived-on-read BUILT; cross-network TTL future) | `research/22` §1-3 |
| The CONFIRM dual (propagation weight rides the signed frame) | `[SOURCED]` BUILT, hardening-blocked on U2 | `research/22` §4 |
| The premise-amplifier (demote-dominant accumulator) | DESIGNED-not-built | §4 here |
| Self-verifying payload envelope | DESIGNED-not-built | §3 here |
| Pub-sub / U1 scalability anchor | OPEN (U1 frontier) | §5 here |

## §8 Cross-links + forbidden-list compliance

- **Invariants touched:** NS-1 (machine never asserts truth — why an amplified-false-premise is the worst case),
  NS-2 (integrity≠provenance — the payload verifies body AND producer), NS-3 (no global rank — amplify the
  *claim* not the *agent*), NS-4 (root-issuer throne stays bound — the §6.1 floor), NS-5 (derived-on-read — §3.2),
  NS-6 (confidence ≤ weakest disjoint-verified root — the §4.1 ceiling), NS-7 (only world-anchored hardens — the
  §4.2 increment), NS-9 (narrowed never reported as closed — the §0/§7 status), NS-11 (trust≠grounding — the
  signal-on-claim locus).
- **Forbidden-list compliance (`research/23` §5):** the §4 amplifier explicitly REFUSES raw `n_confirmers`
  (§5.3), the topological count (§5.2), and any self-asserted provenance (§5.5) as an amplification input; the
  only admitted increment is a world-anchored, entanglement-discounted, signed reinforcement under the NS-6
  ceiling.
- **Rejected (do not revive — `docs/FORKS.md` REJECTED / north-star §5):** a *global* PageRank / EigenTrust over
  the propagation graph (= the throne; `research/21` Q2); a transferable token carrying the signal (= laundering).
- **Related:** `research/21` (the throne refusal), `research/22` (the propagation vehicle + the CONFIRM dual),
  `research/23` (the U2 estimator contract + the forbidden list), `research/24` (the demote-only U2 estimator +
  the world-anchored-only constraint), `plans/14` (the R1 cross-uid custody — the first world-anchored increment).

## §9 Open question for a future wave

The mechanism is buildable in DEMOTE-DOMINANT, DECAYING form *today* (the falsification/freshness half is
designed; the CONFIRM dual is built) — but its *positive* amplification and its *scalability* are both
hardening-blocked on the same frontiers (U2 independence; U1 as the scalability anchor). Sequencing per NS-8:
nothing here gates an action until U1/U2 close. The cheap, honest next step is the **decay + demote** half (a
premise loses signal on stale/falsified evidence) — which tightens, never unlocks, and is exempt from the
stakes-throne gate (the same carve-out as `research/23`'s demote-only amendment).

## Review

(2-lens review pending — architect for the layer-separation soundness + the U1-scalability-unlock inference;
honesty-auditor for the SOURCED-vs-INFERENCE tagging + any "designed" claim that reads as "built". Run before
this RFC is cited as a decision.)
