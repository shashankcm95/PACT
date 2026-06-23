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
*amplification ceiling*). Status-honest (NS-9): the CONFIRM-dual *frame* is BUILT but evidence-blind + advisory
(`research/22` §4); the amplifier and the pub-sub-anchor model are **DESIGNED-not-built**; the anchor that makes
them *scale with trust intact* is **OPEN** (U1). Nothing here gates an action (SHADOW, NS-8).

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
  "dissemination, CRDT-fold". A premise (or a CONTEST / CONFIRM record) propagates via any topology; this is not
  relational and not the *scalability* bottleneck — **but its contestation-delivery guarantee is a coupled
  *correctness* precondition** for derived-on-read at broadcast scale (`research/22` §2-3: a node that relays a
  premise while *withholding* its contestation makes a receiver derive "valid" on stale evidence; see §6.2).
- **Evaluation = re-derived locally, per-receiver, at read time** (NS-5 derived-on-read) on the payload's
  **self-carried evidence**. A node receives a stranger's premise with *no direct edge to the producer* and
  evaluates it *locally* against its own anchors. It needs a **verifiable chain it can check**, not a relational
  *path* to the source. The relationship graph is one weight-input to local evaluation, not the transport gate.

`[PACT-INFERENCE]` The closest distributed-systems shape is **content-addressed, data-centric pub-sub with
self-verifying payloads** — the **Certificate-Transparency** model: you trust a cert because of the Merkle
inclusion proof it *carries* (verifiable against a log you trust), never because of which mirror served it.
(`[SOURCED — reuse-list membership only]` RFC-6962 Merkle is in PACT's reuse list, `PACT-NORTH-STAR.md` §2.1;
`[PACT-INFERENCE]` the *CT-scales-the-web* and *existence-proof* claims are NOT sourced from §2.1.) The analogy is
**exact at the integrity layer** (Merkle inclusion → "logged + untampered") and **breaks at the validation
layer**: CT scales "trust the message" *precisely because it does not attempt what NS-1 requires of PACT* — CT
proves *publication*, never *independent validation*. The §6.1 shared-anchor floor concedes this disanalogy.

## §3 The self-verifying payload (what travels WITH a premise)

For a receiver to evaluate a premise without a relational path, the premise must carry its own evidence:

1. **The signed CONFIRM chain.** `[SOURCED]` The propagation weight "rides the signed CONFIRM frame
   (authenticated minter = the confirmer's key)" — `research/22` §4: a confirmer B independently re-grounds
   premise P on its OWN evidence, and that signed CONFIRM becomes the anchor that sets P's propagation weight.
   **The *frame* is BUILT + code-verified — but only the frame:** `research/22` §4 is emphatic that what is built
   counts distinct *humans* not distinct *evidence* (L4), cannot distinguish an echo-confirm from a real
   re-grounding (L5), and is SHADOW/advisory. The evidence-disjointness it would need to *harden* is U2-blocked.
2. **The grounding DAG** (derived-on-read validity — `research/22` §1: dependent claims read CONTESTED on
   re-read; ATMS `validate.js`). The receiver re-computes validity from current premise state; no transmitted
   score is trusted. *This is the identity-free leg — see §5.*
3. **The accumulated validation weight** (the amplifier — §4). The premise's signal, as a self-carried,
   re-verifiable quantity.

The payload is **content-addressed + signed** (NS-2 integrity-vs-provenance preserved: the receiver verifies the
body AND the producer, never a self-asserted field). Trust is in the DATA, not the channel or the relationship.

## §4 The amplifier — the ONLY honest form (demote-dominant, ceiling-bounded, world-anchored-increment, decaying)

Raw "amplify by count of independent verifications" is **unbuildable as stated** and **dangerous**:

- `[SOURCED]` Naive count is the single most-tempting **forbidden substitution** (`research/23` §5.3):
  `n_confirmers` is U1-scarcity-defeated — *"k minted roots fabricate k."* Count-based amplification is a
  **Sybil megaphone**: whoever can mint nominally-independent verifications amplifies *any* premise, true or
  false. That is the **throne through the back door** (NS-3 / NS-4) — worse than ranking agents, because a
  false-but-amplified claim then propagates *as fact* (violates NS-1).
- `[SOURCED]` And `research/24` proved positive epistemic independence is **not identifiable from in-process
  observables** — so you cannot *count* independent verifications *from observables*; the positive independence
  oracle cannot be built *on observables*. (`research/24` §6 *infers* — but pointedly does NOT prove — that no
  *world-anchored* positive oracle is currently conceivable; an open frontier, **not a foreclosure**.)

`[PACT-INFERENCE]` Natural stigmergy resists gaming because the trace is **world-anchored**: an ant *physically
walked* the path; the pheromone is a costly, embodied signal of real traversal. Digital stigmergy *without* a
cost-anchor is gamed every time (link farms, vote brigading, review-bombing). So invert the polarity — build the
amplifier as a **demote-dominant, ceiling-bounded, decaying accumulator**:

1. **Ceiling (NS-6).** The premise's signal can never exceed the *weakest disjoint-verified root* — "confidence
   never outruns evidence." A MIN bound on evidence strength; an attenuator-with-a-ceiling, not an unbounded
   megaphone.
2. **World-anchored increment (NS-7).** Each reinforcement contributes weight ≤ its real out-of-band cost — a
   signed CONFIRM from an **authenticated minter** whose identity is ultimately a **U1-staked / cross-uid-
   custodied scarce human root**, not a minted persona. `[PACT-INFERENCE]` *This is where the 2026-06-23 R1
   cross-uid custody work plugs in: a key in real custody is what makes a reinforcement world-anchored rather
   than self-asserted (`plans/14` §8).*
3. **Independence is DEMOTE-only (`research/24`).** You cannot prove two confirmations are independent, but the
   demote-only estimator can *detect entanglement* (correlated provenance) and **attenuate**. No detected
   entanglement ≠ independence → the premise stays at its weak prior; detected entanglement → demote.
   Amplification never rides raw count. **Two distinct sinks (per `research/24` §4.1):** the ceiling (part 1) is
   a MIN over evidence strength; the entanglement-demotion is a *discount on the confirmer-count weight* that
   feeds the accumulator — a different operation on a different quantity. The demotion must land on the **advisory
   weight**, NOT on `overall` / `mayGate` (which only LIFT WEAK / fail-close and would silently swallow it).
4. **Decay + repair (stigmergy evaporates, but NS-5 is non-monotone).** Signal fades without fresh reinforcement
   and propagates demotion on falsification (the freshness-gate + falsification-propagation, `research/22`
   §1-3). But NS-5's falsification is *reversible / repairable* (CONTESTED→ACTIVE), so the accumulator must be
   **repair-aware + non-monotone**: a repaired premise must *re-accumulate* signal, and the fold converges on the
   latest-authorized state (keyed per `research/22` §3 req 3), never a monotone evaporation. This
   decay+demote+repair fold is the cleanly buildable half.

**The amplifier is no more honest than its weakest increment.** A count or a self-assertion → it launders; a
signed-by-scarce-root, entanglement-discounted reinforcement under a weakest-root ceiling → it hardens (within
the R1 / U1 limits).

## §5 The scalability pivot — what U1 unlocks (and what it does NOT)

The producer-consumer worry is **correct for the purely-relational regime** — but the pivot is sharper than a
single "trust the confirmer" dichotomy. Split by *what is being scaled*:

- **A premise the receiver can independently re-ground needs NO identity substrate.** It rides §3.2's
  derived-on-read: the receiver re-computes validity from first-party evidence it *already* trusts, against its
  *own* anchors — the `research/22` §4 "verify yourself" path. This is the genuinely **identity-free pub-sub
  leg**, and it is already in the design.
- **Trust in a *stranger's confirmation* — and the §4 amplifier — DOES need U1.** The amplifier's increment must
  come from an authenticated scarce-human minter (`research/23` §5.3: `n_confirmers` is U1-defeated), and a
  premise the receiver *cannot* independently re-ground can only be trusted via the confirmer's world-anchored
  identity.

`[PACT-INFERENCE]` So U1 is the scalability unlock **for the amplifier and for any premise the receiver cannot
re-ground itself** — *sufficient* to convert producer-consumer into content-addressed pub-sub, but **not
necessary for the self-evidencing-premise leg** (which scales identity-free). Status-honest: PACT's *built* trust
leans relational and the amplifier is unbuilt, so **today the model IS producer-consumer-shaped where it matters
(the amplifier / non-re-groundable premises) and that scalability ceiling is real**; the *designed* escape is the
two legs above.

## §6 The three residual costs (so this is not an over-claim)

1. **The shared-anchor floor (NS-4).** No trustless broadcast-scale with *zero* common root. The U1 substrate is
   that root — kept **plural / contestable / auditable**, never a global reputation rank (the refused throne). It
   is "trust the *staking system*, not the individual": pub-sub at the identity layer, but a **bounded-throne
   floor**, not zero-throne. Irreducible.
2. **Verification cost + a transport-coupling cost.** (a) *Throughput:* derived-on-read means every receiver
   re-verifies every payload's chain + freshness TTL (`research/22`) — a genuine compute cost, cacheable within
   freshness bounds. (b) *Trust-coupling (the load-bearing one):* derived-on-read is only as sound as the
   transport layer's **contestation-delivery guarantee** — a node that relays a premise while *withholding* its
   contestation makes the receiver derive "valid" on stale evidence. `research/22` §2-3 makes that a coupled,
   Byzantine-robust, multi-path requirement that is *designed-not-built*. The layers are **clean** (no info leak)
   but **not independent under adversarial load**.
3. **The U2 ceiling on amplification.** Broadcast amplification by raw count is the Sybil megaphone; only the §4
   demote-dominant, ceiling-bounded form is honest at scale. U2-blocked, like everything at the evidence level.

## §7 Status — built / designed / open

| Layer | State | Anchor |
|---|---|---|
| Transport (dissemination) | `[SOURCED]` REUSED (A2A) — scales | north-star §2.1 |
| Intra-node falsification propagation (derived-on-read) | BUILT | `research/22` §1 + `validate.js` |
| Cross-network freshness / TTL bound | DESIGNED — open precondition (Byzantine multi-path dissemination) | `research/22` §2-3 |
| The CONFIRM dual (the signed *frame* only) | `[SOURCED]` frame BUILT but evidence-blind + advisory; hardening-blocked on U2 | `research/22` §4 |
| The premise-amplifier (demote-dominant accumulator) | DESIGNED-not-built | §4 here |
| Self-verifying payload envelope | DESIGNED-not-built | §3 here |
| Identity-free re-grounding leg (self-evidencing premise) | DESIGNED (rides BUILT derived-on-read) | §3.2 / §5 here |
| Pub-sub / U1 scalability anchor (non-re-groundable premises + amplifier) | OPEN (U1 frontier) | §5 here |

## §8 Cross-links + forbidden-list compliance

- **Invariants touched:** NS-1 (machine never asserts truth — why an amplified-false-premise is the worst case),
  NS-2 (integrity≠provenance — the payload verifies body AND producer), NS-3 (no global rank — amplify the
  *claim* not the *agent*), NS-4 (root-issuer throne stays bound — the §6.1 floor), NS-5 (derived-on-read +
  repairable — §3.2 / §4.4), NS-6 (confidence ≤ weakest disjoint-verified root — the §4.1 ceiling), NS-7 (only
  world-anchored hardens — the §4.2 increment), NS-9 (narrowed never reported as closed — the §0/§7 status),
  NS-11 (trust≠grounding — the signal-on-claim locus).
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

The mechanism is buildable in DEMOTE-DOMINANT, DECAYING+REPAIR-AWARE form *today* for the identity-free leg (the
falsification/freshness half is designed; the CONFIRM *frame* is built) — but its *positive* amplification and
its *scalability for non-re-groundable premises* are both hardening-blocked on the same frontiers (U2
independence; U1 as the scalability anchor). Sequencing per NS-8: nothing here gates an action until U1/U2 close.
The cheap, honest next step is the **decay + demote + repair** half (a premise loses signal on stale/falsified
evidence, re-accumulates on repair) — which tightens, never unlocks, and is exempt from the stakes-throne gate
(the same carve-out as `research/23`'s demote-only amendment).

## §10 Review — RECORDED 2026-06-23 (2-lens: architect + honesty-auditor)

Both read-only lenses reviewed the draft; all findings FOLDED into the sections above.

- **architect — SOUND-WITH-CHANGES** (agentId a1f9c552fe0606558): (F1, MED) split §6.2 into throughput vs the
  load-bearing **transport-coupling** cost (contestation-delivery is a coupled *correctness* precondition,
  `research/22` §2-3) + weakened §2 "not the bottleneck" → "not the *scalability* bottleneck"; (F2, MED) scoped
  the CT analogy to the **integrity layer** + added "CT proves publication, never independent validation"; (F3,
  MED) replaced the false "only two ways" dichotomy with the **sufficiency-not-necessity** split (the
  identity-free re-grounding leg scales without U1); (F4, LOW) located the two distinct sinks in §4.3 (ceiling
  MIN vs entanglement-discount, the latter must not feed `overall`/`mayGate`); (F5, LOW) split §7 row 2 into
  intra-node BUILT vs cross-network DESIGNED-open-precondition; (F6, LOW) added the **repair-aware non-monotone**
  fold to §4.4 (NS-5 CONTESTED→ACTIVE).
- **honesty-auditor — HONEST-WITH-FIXES, A−** (agentId ab262317c8d900461): 10/10 citation tags resolved, NS-9
  clean. (F1, MED) tightened the CT `[SOURCED]` to "reuse-list membership only", marked the CT-scales claim
  `[PACT-INFERENCE]`; (F2, MED — most-damaging) inlined the `research/22` §4 evidence-ceiling at §3.1 so "BUILT"
  cannot read, in the design section, as "evidence-independence is solved"; (F3, LOW) restored the "from
  observables" boundary on the independence-oracle claim + the not-a-foreclosure hedge; (F4, LOW) corrected the
  `research/23` quote to the literal *"k minted roots fabricate k"*.
