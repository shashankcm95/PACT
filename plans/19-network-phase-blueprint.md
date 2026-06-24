---
lifecycle: persistent
created: 2026-06-24
phase: Network-phase BLUEPRINT (design-only — NOT a build) — cross-network falsification-propagation + the CONFIRM evidence-provenance dual
status: BLUEPRINT — architect design pass folded (workflow `wf_a5ccc483`); design-only; MOSTLY design-freeze (preconditions unbuilt); carrier was USER-DEFERRED at `plans/13` FORK-3 — re-confirm before any build
---

# Network-phase blueprint — falsification-propagation, the freshness bound, the CONFIRM evidence-provenance dual (DESIGN ONLY)

> Authored 2026-06-24 as one of two consolidation-wave blueprints (the other is `plans/18`, U1 stake), after
> north-star §2 point-10 declared the single-box custody-dogfood vein mined out. **This blueprint is asymmetric to
> `plans/18`: almost all of it is design-freeze, not buildable now** — its load-bearing preconditions (a network/
> dissemination layer; U2 gating) are unbuilt and, for U2, research-closed. It captures the architect design pass
> (`wf_a5ccc483`) so the design isn't re-derived. **A blueprint is not a hardening (NS-9); "design-frozen" is never
> "built".**

## §0 Honest scope + the one-line verdict (read first — OQ-NS-6 / NS-7)

Today PACT is single-node and **intra-node falsification invalidation is STRUCTURALLY GUARANTEED** (derived-on-read:
`atms/validate.js` `_collectPremises` folds `CONTESTED` over the full transitive ancestral premise set on every
read; no mutable score store, INV-18). The frontier is the **cross-network** requirement: once a dissemination
layer exists, a not-yet-synced node keeps treating a falsified premise as valid until the contestation reaches it —
**that latency is the bound** (`research/22` §3). Its positive dual is `CONFIRM` (a confirmer re-grounds a premise
on its own evidence; the signed `CONFIRM` sets the premise's propagation weight) — BUILT today, hardening-blocked on
**U2 precisely at the EVIDENCE level**.

**The one-line verdict (OQ-NS-6, brutal):** **NOTHING in this blueprint hardens trust; everything NARROWS or merely
readies.** The CONFIRM carrier (S1) is a self-asserted field = the config_hash axis-3 class (evasion-trivial) — a
schema reservation that measures nothing real today. The trio (S3-S5) are engineered correctness controls that
narrow the cross-network stale-propagation attack surface. **Most of this frontier is correctly NOT-YET-BUILT** — a
two-precondition trigger (network layer AND U2 gating) means the trio has zero value until BOTH land, and U2 gates
nothing (research-closed, permanently WEAK).

## §1 The buildable thread (and why it's thin)

ONE thing is buildable now and U2-shaped: the **CONFIRM evidence-provenance CARRIER field** — an optional, self-
asserted payload field naming the confirmer's evidence source. It rides the already-built authenticated-minter
signal (forging "B confirmed P from source X" requires B's key) and is the named first INPUT slot of the eventual
U2 estimator (`research/23` §6).

**CRITICAL STATUS (do not re-propose as new):** this carrier was **already authored carrier-only in `plans/13`,
then DEFERRED at its VERIFY board** — `plans/13` §8 killed the `distinct_provenance` COUNT as L4 theater (asserted-
distinctness read as real independence) and the USER's `docs/FORKS.md` FORK-3 disposition was **DEFER (blocked-not-
rejected)** for lack of a world-anchored source. So S1 below is a *build-on*, and **building it requires re-
confirming the FORK-3 DEFER with the USER** — it is not a fresh greenfield slot. Everything else in the trio is
design-freeze (preconditions unbuilt).

## §2 The build DAG (each step SHADOW; almost all DESIGN-FREEZE — the precondition is named, never built against)

- **S1 — CONFIRM evidence-provenance CARRIER field, schema-only (build ON `plans/13`; the COUNT stays killed).** Add
  OPTIONAL self-asserted `payload.evidence_provenance` (free-form id of the confirmer's evidence source) to
  `record-schema.json`, documented LOUD: self-asserted / WEAK / config_hash axis-3 class / NEVER-read-as-
  independence / world-anchored-only-when-the-source-is. Validator stays lenient (`record.js` `validateRecord`
  enforces `required[]` only) so it's non-breaking. **Decide-on-purpose (HIGH):** an in-payload field enters
  `record_id` + `idempotency_key` (`record.js` hashes payload) -> two `CONFIRM`s differing only in provenance are
  DISTINCT records; document this is intended, not a collision bug. _SHADOW; NARROWS at best._ **GATED on re-
  confirming the FORK-3 DEFER.**
- **S2 — A parallel advisory disjointness readout — DEFERRED-BY-DESIGN, NOT built.** `plans/13` §8 + FORK-3 already
  ruled the `distinct_provenance` count is the L4 landmine with NO honest consumer (every read is forbidden). Named
  here ONLY so a future wave does not re-propose it as new. It may ship ONLY off the scored return object and ONLY
  once a world-anchored source exists. **Until then, do not build it.** _SHADOW + DEFERRED._
- **S3 — DESIGN-FREEZE the cross-network freshness gate (forward-contract, do NOT build).** A node MUST NOT gate a
  high-stakes action on a premise unless its view is fresh enough it WOULD have seen a contestation (a read-recency
  TTL on the evidence). **Pin the coupling law: TTL >= the multi-path dissemination-latency bound (S4) — the TTL is
  UNPICKABLE without S4's guarantee.** _Depends on:_ a network/dissemination layer (UNBUILT — no transport in
  `v0/src`) AND U2/gating (research-closed, permanently WEAK). _SHADOW; does NOT harden_ (TTL freshness is an
  in-process correctness control).
- **S4 — DESIGN-FREEZE multi-path PRIORITY dissemination (forward-contract, do NOT build).** Two parts: (a) bounded
  latency so S3's TTL is realizable (split dissemination from tally, `research/14`); (b) Byzantine-robust multi-path
  — a contestation must reach a node via INDEPENDENT (vertex-disjoint) paths so a malicious node cannot SEE-and-
  WITHHOLD a contestation while relaying the premise, PLUS the **RELAY INVARIANT: a node may not forward a record
  without forwarding the contestations it holds against it.** Reuse A2A transport for the channel; build only the
  relay invariant + disjoint-path delivery on top (NS-10 greenfield). _Depends on:_ the network layer (UNBUILT; the
  disjoint-path model ties into PACT's existing vertex-disjoint Menger machinery — that math exists, the transport
  does not). _SHADOW; NARROWS the latency attack surface, does not harden._
- **S5 — DESIGN-FREEZE the non-monotone, repair-aware contestation FOLD (forward-contract).** A grow-only G-set CRDT
  is monotone-CONTESTED and **BREAKS repair** (D6 `falsify.js`: `CONTESTED -> ACTIVE` is reversible). Specify an
  order-independent fold converging on the LATEST AUTHORIZED state, keyed on D6's escalation-level + authz (the
  anti-ping-pong ordering, `falsify.js` `evidence_floor`), NOT a timestamp and NOT a G-set. **The decay+demote+
  repair half is buildable today in isolation** (`research/25` §9), narrows, and is EXEMPT from the NS-8 stakes-
  throne gate (it only DEMOTES, never unlocks). _Depends on:_ S4 (a fold needs a layer to fold over) + the existing
  `falsify.js` D6 model (BUILT — the keying source). _SHADOW; HARDENS nothing._
- **S6 — Forward-contract knot (documentation, no code).** Tie S1's carrier to `research/23` §2 as the U2
  estimator's first per-record INPUT slot; tie S3-S5 to `research/22` §3 + `research/25` §4 as the coupled trio.
  Record that the carrier is the POSITIVE-direction analog of S4's independent-path requirement (a confirmation
  hardens to exactly the degree its evidence is disjoint), and that BOTH halves are hardening-blocked on world-
  anchored sources that don't exist. _SHADOW (documentation); keeps the design-frozen preconditions LOUD (NS-9)._

## §3 Hard constraints (the design MUST honor these)

- **NS-7 / OQ-NS-6:** in-process signals NARROW; only world-anchored signals HARDEN. The carrier + the entire trio
  are in-process -> they NARROW. Nothing here may be reported as hardening.
- **NS-8:** no weight gates an irreversible action while U1/U2/provenance-custody are open. `epistemicIndependence()`
  stays permanently WEAK; `convert.actionable` stays false; `mayGate` refuses every high-stakes caller. The carrier
  MUST NOT feed `independenceLabel`; S3's freshness gate MUST stay fail-closed.
- **NS-5 / NS-11:** validity DERIVED-ON-READ; no mutable score/rank store. The carrier is a recorded field, never a
  cached "P has confirm-weight X". The fold (S5) is derived-on-read + repair-aware (non-monotone).
- **NS-2:** integrity != provenance != validity. The carrier rides the SIGNED CONFIRM frame (authenticated minter =
  confirmer's key); a self-asserted `evidence_provenance` proves integrity-of-assertion, never world-anchored
  disjointness (#273: provenance is verified body AND producer, never store presence).
- **NS-3 / NS-4:** NO global rank/score/ordering. Any propagation weight amplifies the CLAIM not the AGENT, is
  receiver-controlled + relational; the increment must come from a U1-staked/cross-uid-custodied scarce-human root,
  never raw `n_confirmers` (the Sybil megaphone).
- **CONTEST discriminant intact** (`record.js` + `plans/08`): a record carries AT MOST ONE of `{target_claim_id,
  target_premise_id}`; a both-axes contest mints TWO records. Do not reopen the two-way path.
- **The single U2 lift-point invariant** (`research/23`): `epistemicIndependence()` is the SOLE function the
  estimator replaces; consumers read the LABEL, never the lift-point. The carrier must not become a scattered second
  epistemic-judgment site.
- **The relay invariant** (`research/22` §3) is load-bearing for derived-on-read soundness at broadcast scale.

## §4 Already built vs newly proposed (do NOT rebuild)

**Reuse (cite firsthand):** intra-node falsification propagation is GUARANTEED (`atms/validate.js`
`_collectPremises` + `validate()` folding `CONTESTED` derived-on-read; `falsify.js`/repair — `CONTESTED` is a
reversible FLAG, authorized + anti-ping-pong). The CONFIRM dual FRAME is BUILT + consumed: `grounding/cross-verify.js`
(distinct EARNED-STANDING `rootOf`-keyed non-self confirmations, decay-weighted, creator-bound-on-read with the
#273 first-match-poison defense) -> `grounding/premise-score.js` (an SL opinion, derived-on-read, advisory/SHADOW).
The CONTEST/CONFIRM vehicle + discriminant (`record.js`), the U2 lift-point seam (`weak-flag.js`), and ed25519
provenance all exist. **Newly proposed:** (a) the `evidence_provenance` CARRIER (S1) — `plans/13` authored it
carrier-only then DEFERRED (FORK-3); a build-on, not greenfield. (b) **NO transport/dissemination/relay/gossip layer
exists in `v0/src`** (grep: the only "relay" is the broker sudo SIGNING relay = provenance; "gossip" is a deferred-
network comment in `audit-log.js`). So S3-S5 are pure forward-contract — their network-layer precondition is
genuinely unbuilt and must be NAMED, never built against.

## §5 Residuals (carry loud — NS-9)

U2-at-the-evidence-level stays the ceiling: `crossVerify` counts distinct HUMANS not distinct EVIDENCE; an echo-
confirm (re-reading A's record, L5) stays indistinguishable from a disjoint re-grounding EVEN AFTER S1 ships,
because a self-asserted string isn't verifiable — **S1 makes disjointness NAMEABLE, not MEASURABLE** · the world-
anchored provenance SOURCE that would populate + consume the carrier does not exist (`research/24` returned negative;
near-unclosable, not proven-impossible) · the trio stays design-frozen and inert until BOTH the network layer is
built AND U2 gates (it never does positively) · the mutual-confirmation weight-pump (a ring of distinct humans on
correlated evidence) is U2-blocked · the amplifier's positive direction is unbuildable honestly (raw count = Sybil
megaphone; only the demote-dominant, ceiling-bounded, world-anchored-increment, repair-aware form is admissible, and
its increment is U1-blocked) · the U1 scalability anchor (trusting a stranger's confirmation at broadcast scale)
stays OPEN.

## §6 Drift-rules respected (the §6 detector + §5 rejected list, and how each is avoided)

- **NS-7 / inflection — SHADOW machinery expecting it to HARDEN:** AVOIDED by the OQ-NS-6 banner on every step;
  nothing claimed to harden; each part's world-anchored precondition is named.
- **L2 (cheap-not-unforgeable) + L4 (authenticity-as-independence):** AVOIDED by keeping the `plans/13` §8 verdict
  that the `distinct_provenance` COUNT is theater (S2 DEFERRED-not-built) and labeling the carrier self-asserted/
  WEAK — recorded, never read as independence, never feeds `independenceLabel`.
- **L6 / NS-3 + §5 global PageRank/EigenTrust:** AVOIDED — the propagation weight amplifies the CLAIM not the AGENT,
  receiver-controlled + personalized; no global score.
- **NS-5/NS-11 mutable store / derived-on-read:** AVOIDED — S1 adds a recorded field; S5's fold is non-monotone +
  repair-aware + derived-on-read, never a stored monotone CONTESTED G-set.
- **NS-11 reverse edge / discriminant reopening:** AVOIDED — the carrier rides the CONFIRM payload on the existing
  grounding seam; the at-most-one discriminant is untouched.
- **NS-8 act-before-U2:** AVOIDED — `convert.actionable` stays false; `mayGate` fail-closed; the carrier forbidden
  from the lift-point; S3 design-frozen behind the still-closed gate.
- **§5 transferable-token + NS-9 reused-rejected:** AVOIDED — any U1-stake increment that anchors the amplifier is
  non-transferable / registry-not-oracle / no-on-chain-ranking.
- **NS-9 closed-when-narrowed + NS-10 reuse-over-claim:** AVOIDED — A2A reused only for the channel (relay invariant
  + disjoint-path built greenfield); residuals carry every open frontier loud; "design-frozen" is never "built".

## §7 Open questions (resolve before building the relevant step)

1. **Is S1 (the carrier) worth shipping NOW as a schema reservation, or does shipping an empty slot before a world-
   anchored source risk the §5.3 "building the forbidden-shaped thing one inch short of wiring it" drift the
   `plans/13` architect flagged?** The USER's FORK-3 choice was DEFER — **re-confirm before building.**
2. **In-payload vs top-level field** — in-payload enters `record_id`/`idempotency_key` (two CONFIRMs differing only
   in provenance are distinct records); top-level (like `config_hash`) sits outside the content-address. Changes
   dedup semantics; `plans/13` §8 flagged it [HIGH]-decide-on-purpose.
3. **Higher-value next move once the carrier is settled:** the decay+demote+repair fold half of S5 (buildable today,
   narrows, stakes-throne-exempt) OR pivoting to the U1 stake (`plans/18`, hardening-leaning, U2-independent)? Only
   one is on the apex hardening path.
4. **When a world-anchored substrate-diversity source is found**, does it populate the carrier as a DEMOTE-only
   entanglement input (`research/24`'s salvage) or could it ever support a positive disjointness measure?
   `research/24` says near-unclosable-positively — so the carrier's realistic consumer is the demote-only estimator
   (entanglement-DETECTION, not independence-PROOF).
5. **Does the network layer (S4's precondition) ever get a funded build**, or does PACT stay single-node with the
   trio permanently design-frozen? Name the trigger that would start it.

## §8 Recommendation (for the USER's direction call — this blueprint does NOT self-authorize a build)

**This frontier is mostly not-yet-buildable, and that is the honest finding.** The trio (S3-S5) is design-freeze —
its network-layer precondition is unbuilt and its gating precondition (U2) is research-closed. The one buildable-now
piece, the carrier (S1), is **already USER-deferred at FORK-3** and would, at best, narrow. The one piece buildable-
today-in-isolation that NARROWS usefully is **the S5 decay+demote+repair fold** (`research/25` §9, stakes-throne-
exempt). **The cross-blueprint recommendation:** if a build is chosen, `plans/18`'s U1 stake (S1-S2) is the higher-
value next move — it is on the apex hardening path and U2-independent, whereas this frontier narrows and waits on
unbuilt preconditions. Pursue the network phase as a **design-freeze forward-contract** (this doc) until the network
layer is a funded decision. **Nothing here should be built without an explicit USER go.**
