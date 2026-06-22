---
lifecycle: persistent
created: 2026-06-22
status: DEFERRED requirement (intra-node GUARANTEED today; cross-network bound is a future requirement)
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

## §4 Net + cross-links

The foundation is right and code-verified: a node never knowingly propagates a falsified premise; it
self-heals on re-read; the CONTEST record is the vehicle ([[plans/08]] hardened it). The cross-network
latency bound is a real requirement for the network+gating phase — coupled trio (freshness-gate TTL ≥
multi-path-priority-dissemination latency; non-monotone repair-aware fold), Byzantine-robust, U2-gated.
Related: [[research/14]] (swarm: split dissemination from tally; gossip/CRDT), [[research/21]] (the other
deferred-directions note), U2 (the gate-enabler — nothing gates until it closes).
