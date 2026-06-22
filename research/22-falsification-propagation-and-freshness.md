---
lifecycle: persistent
created: 2026-06-22
status: DEFERRED requirement (intra-node GUARANTEED today; cross-network bound future) + §4 the CONFIRM dual (cross-agent premise validation) BUILT, hardening-blocked on U2-at-the-evidence-level
topic: falsification-propagation, freshness-gate, dissemination, CRDT-fold
---

# 22 — Falsified-premise propagation + the cross-network freshness bound

A design question (side-chat, then code-verified in the main thread): once a premise is falsified, the
network must not keep acting on / re-spreading it for long. Verdict: **intra-node invalidation is
STRUCTURALLY guaranteed today; the cross-network latency bound is a real future requirement, correctly
not-yet-built (v0 = single node, all SHADOW). Record it now so it's designed-in.**

## §1 What's guaranteed today (verified against the code, not memory)

- **Transitive, derived-on-read invalidation.** `atms/validate.js:_collectPremises` is an iterative-DFS
  that gathers the FULL **transitive ancestral** premise set; `validate()` folds `CONTESTED` over all of it
  (`premises.some(p => p.status === 'CONTESTED')`). So falsifying one premise flips EVERY transitively-
  grounded claim on its next `validate` — automatically, because validity is always re-derived from current
  premise state (INV-18: no mutable score store, no stale cached "valid").
- **Flag, not collapse** (`status:CONTESTED` but `valid:true`); **gated** (only an authorized + in-scope
  counterexample falsifies — D4/D5); **repairable** (D6, escalating + anti-ping-pong); **cycles rejected
  fail-closed** (the DFS is iterative so a deep adversarial chain can't `RangeError` the acyclicity gate open).
- **Integrity ≠ validity ≠ provenance** (three orthogonal layers; same family as integrity≠provenance):
  | Layer | Structure | Falsification's effect |
  |---|---|---|
  | Integrity | content-addressed store + verify-on-read + `post_state_hash` chain (a literal RFC-6962 Merkle tree is NOT in v0 — a planned ADOPT tier) | a CONTEST record is APPENDED; the log only grows; old commitments stay valid |
  | Validity | ATMS (VALID_GIVEN / CONTESTED) | dependent claims read CONTESTED (derived on read) |
  | Provenance | signature + custody | unchanged |
  Falsification lives ONLY in the validity layer. Invalidating an integrity root on falsification would be
  a category error (it would mutate tamper-evident history to express a semantic judgment).
- **The propagation vehicle is the CONTEST record** — `target_premise_id` (premise-contest) vs
  `target_claim_id` (claim-contest) — the exact pair [[plans/08]]'s discriminant just hardened (type-blind,
  fires on write AND read). So this path and that wave are the same seam.

## §2 What is NOT yet bounded (the future requirement)

Derived-on-read gives intra-node safety: a node that HOLDS the contestation cannot re-derive "valid", and
self-heals on re-read. It does NOT bound: (a) in-flight propagations already sent before the falsification
existed (unrecallable in any distributed system — only convergence speed matters); (b) a not-yet-synced node
that keeps treating the premise as valid until the contestation reaches it — **that latency is the bound**.
Harmless today: v0 is single-node (no window) AND all SHADOW (a stale re-spread gates no irreversible act).
The danger appears only when BOTH the network layer AND gating (U2) land. So this is a **two-precondition
trigger** — record now, design-in then.

## §3 The requirement (to enshrine when network + gating arrive)

Three controls — and they are **coupled**, not independent:

1. **Read-recency / freshness gate before any high-stakes action.** A node must not gate on a premise unless
   its view is fresh enough that it WOULD have seen a contestation (a TTL on the evidence). **The TTL must be
   ≥ the dissemination-latency bound (req 2) — you cannot pick the TTL without that guarantee.** (Gated behind
   U2 anyway; nothing gates until then. Same shape as a read-recency-TTL on any evidence-gated action.)
2. **Multi-path PRIORITY dissemination of contestation records** — NOT just "fast". Two parts:
   - **Bounded latency** so req 1's TTL is realizable ("split dissemination from tally" — [[research/14]]).
   - **Byzantine-robust, multi-path** (the refinement beyond honest-stale latency): a malicious node can SEE
     a contestation and deliberately WITHHOLD it while relaying the premise. Latency bounds don't help —
     a contestation must reach a node via INDEPENDENT paths (ties into PACT's vertex-disjoint model), and a
     **relay invariant**: a node may not forward a record without forwarding the contestations it holds
     against it.
3. **An order-independent contestation fold that is NON-MONOTONE (repair-aware).** REPAIR (D6) means
   ACTIVE→CONTESTED→ACTIVE, so a naive grow-only "set of contestations" CRDT is monotone-CONTESTED and
   **breaks repair**. The fold must converge on the LATEST AUTHORIZED state, keyed on D6's **escalation level
   + authz** (the anti-ping-pong ordering), not a timestamp or a G-set. It must converge regardless of
   delivery order and not flap.

## §4 The positive dual — cross-agent premise VALIDATION (the `CONFIRM` anchor): BUILT, hardening-blocked on U2

Same seam, opposite sign. Where §1–3 propagate *falsification* (`CONTEST`), the receiver-side **"verify
yourself"** — agent B independently re-grounds premise P on its OWN evidence, and that becomes the anchor
that sets P's propagation weight — is the `CONFIRM` dual. Side-chat design Q (2026-06-22), then code-verified.

**The correction the design chat needed: this is NOT a slot to add — it is BUILT and consumed today.**

- `CONFIRM` + `payload.target_premise_id` → `crossVerify(premiseId)` (`grounding/cross-verify.js`) =
  decay-weighted **distinct-human** confirmation evidence (the support leg `r`); `premiseScore`
  (`grounding/premise-score.js`) = an SL opinion over `r` (crossVerify survival) and `s` (CONTEST disbelief),
  **derived-on-read over the SIG-verified log** (`INV-14`), SHADOW/advisory.
- So the propagation weight rides the **signed `CONFIRM` frame** (authenticated minter = B's key), NEVER
  store presence — the `#273` invariant (*a trust input needs an authenticated minter, never a store re-hash;
  integrity ≠ provenance*) is closed **by construction** here. Forging "B confirmed P" requires B's key.
- Sybil is already gated symmetrically with the contest leg: confirmers are `rootOf`-keyed (persona-mult
  collapses to one human) **and** earned-standing (the confirmer authored ≥1 `CLAIM`) — a zero-history
  sock-puppet can neither support nor slander for free.

**The ceiling — U2, but precisely at the EVIDENCE level, not the agent level** (the chat mis-framed it as
agent-independence; the code shows the real gap):

- `crossVerify` counts distinct **humans** (`rootOf`), NOT distinct **evidence**. Two genuinely distinct,
  non-colluding `rootOf` humans both citing the SAME upstream source each contribute FULL confirmation
  weight — over-counting correlated evidence. That is landmine **L4** (authenticity/distinctness treated as
  independence) wearing a `CONFIRM` hat. Three things, only the first two solved: distinct personas (`rootOf`
  ✓) · distinct humans (`rootOf` + earned ✓) · **disjoint evidence (U2 — unbuilt, the ceiling).**
- It bites *within* a single verifier too: if B "confirms" P by **re-reading A's record** (no new evidence),
  that is an echo, not a re-grounding, and must not harden — **L5** ("untampered = true") in `CONFIRM`
  costume. `crossVerify` cannot tell an echo from a disjoint re-grounding because **the `CONFIRM` record does
  not carry WHAT evidence the confirmer used.**
- Abuse: **mutual-confirmation weight-pump** — a ring of distinct humans confirming each other's premises on
  correlated evidence. `rootOf` kills the same-human ring; DAG cycle-rejection kills direct loops; the longer
  correlated-evidence ring is, again, U2.
- It stays honest only because `premiseScore` is **derived-on-read** — caching "P has confirm-weight X" as a
  stored field would be a mutable score store (NS-5/NS-11 drift).

**The open sub-problem (the buildable, U2-shaped next step):** give a `CONFIRM` record an
**evidence-provenance** field so disjointness becomes *measurable* instead of *assumed-from-distinct-roots*.
That is the **positive-direction analog of §3's multi-path/independent-path requirement** — a confirmation
hardens to exactly the degree its evidence is disjoint from what it confirms. Until then the signal is the
most valuable in the system *and* the one whose cross-agent hardening cannot be unlocked.

## §5 Net + cross-links

The foundation is right and code-verified: a node never knowingly propagates a falsified premise; it
self-heals on re-read; the CONTEST record is the vehicle ([[plans/08]] hardened it). The cross-network
latency bound is a real requirement for the network+gating phase — coupled trio (freshness-gate TTL ≥
multi-path-priority-dissemination latency; non-monotone repair-aware fold), Byzantine-robust, U2-gated.
Related: [[research/14]] (swarm: split dissemination from tally; gossip/CRDT), [[research/21]] (the other
deferred-directions note), U2 (the gate-enabler — nothing gates until it closes). §4 is the positive dual
(`CONFIRM` validation, built); its worked example on the OPERATOR axis is [[plans/09]]'s `custody-verify.js`
— "verify yourself" done right: a self-verifier that structurally refuses to claim it hardened (it reports
`hostObservableChecksPassed`, never custody-real, and defers the hardening to the out-of-band attestation).
