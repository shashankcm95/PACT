---
lifecycle: persistent
created: 2026-06-22
status: DEFERRED research directions (verdicts recorded; neither displaces the consolidation wave)
topic: smart-contracts-for-A2A, pagerank-navigation
---

# 21 — Two deferred directions: smart contracts for A2A + PageRank for navigation

Two design questions raised mid-session. Verdict for both: **NOT premature-blocked, but each is a
research-frontier refinement with a STRONG existing prior in the corpus — fold for later, after the
consolidation wave + the deployment spike.** Captured so the reasoning isn't lost.

## Q1 — Smart contracts to facilitate A2A communication?

**Verdict: the COMMUNICATION layer does not need them; the narrow fit is the U1 issuance STAKE + a
non-transferable registry anchor — and the corpus already constrains exactly that.**

- **A2A communication is already solved more cheaply.** PACT borrows the A2A transport + Agent Card + an
  RFC 6962 Merkle log, and authenticates messages with signed frames + a content-addressed record store.
  Integrity + provenance + ordering come from the signature + the Merkle log — **no consensus/chain
  needed** ([[research/15]] §"what an on-chain token provably adds over the signed record — and why PACT
  doesn't need it"). So smart contracts add nothing to *communication*.
- **Transferable tokens are REJECTED** ([[research/15]]): an on-chain token as a provenance claim is
  identity-**laundering** (transfer = launder; audit makes it *visible*, not *impossible*). The salvaged
  instinct is a **NON-transferable** anchor (SBT / VC / DID), used narrowly for the **U1 root-registry**.
- **Where a contract genuinely fits (the live thread):** the **stake** in PACT's `invite/vouch + stake`
  issuance. [[research/18]] already names **voucher-stake** as a collusion-ring containment. An on-chain
  stake with real **slashable** cost is one of the few *engineered* mechanisms that leans toward
  **HARDENING** rather than narrowing (OQ-NS-6: a real economic cost an attacker bears is closer to a
  world-anchored signal than any in-process check). That's the interesting bit.
- **Hard constraints (from the corpus) on any such use:**
  1. **Non-transferable** (soulbound) — else laundering ([[research/15]]).
  2. **Registry, never an oracle** — the anchor never auto-mints a DIRECT/trust edge ([[research/19]] M7);
     else the Sybil-≈0 result collapses.
  3. **No on-chain global reputation / ranking** — that is the rank throne PACT refuses (see Q2).
  4. **A chain is a NEW root** — PACT "refuses every root" ([[research/11]]); a chain dependency is a
     governance/deployment decision, kept **behind the U1 registry seam**, optional.
  5. Even a soulbound SBT does **not** close U1 uniqueness — it's a *containment parameter*, not a
     solution ([[research/18]]); SBT-now → Personhood-Credentials/World-ID-later.
- **Where it folds:** the **U1 frontier** (alongside, not before, U2). It's research/design, not a
  near-term build; the stake-as-economic-cost angle is the thread worth pulling when U1 is tackled.

## Q2 — Google's PageRank to navigate the network?

**Verdict: SPLIT. Global PageRank/EigenTrust is already EVALUATED + REFUSED; the PERSONALIZED variant is
already PACT's model — so "navigate via a personalized walk" is aligned and partly already built.**

- **Global PageRank = EigenTrust = a rank THRONE PACT consciously removed.** EigenTrust is literally the
  left-eigenvector global trust over the graph + a pre-trusted seed set ([[research/prior-art/trust-reputation-sybil]]).
  PACT removed the single global canonical ordering (INV-10 → per-receiver, [[research/15]]) and makes
  trust **relational** — *"the SAME vouch yields DIFFERENT wcons for two receivers; no global order."*
  [[research/17]] calls a global rank "the rank pathology" (farmable). [[research/10]] frames
  DIRECT-vs-CONSENSUS as *"the real improvement on EigenTrust — removes the pre-trusted-seed throne."*
  So **global PageRank is a NO** (a throne + Sybil-vulnerable).
- **Personalized PageRank / Personalized Hitting Time is ALREADY the model.** [[research/18]] adopts
  **Personalized Hitting Time** (Seuken/Parkes/Liu) precisely because it is *"unique to PHT among the
  PageRank family — sybils do NOT bring new manipulation ability"* (the rest of the family, including
  global PageRank, Sybils *help*). PACT's `wcons` weighted-consensus math is **theorem-backed by PHT /
  TraceRank** while staying advisory ([[research/19]]). So a **personalized, receiver-rooted random walk
  IS the existing trust-propagation primitive.**
- **So "navigate via PageRank":** YES in its **personalized** form (per-source, no global score) — and it's
  a natural refinement of the P2/consensus layer for path/peer selection + routing. NO in its **global**
  form. The one caveat: navigation that *gates* a route (vs advisory routing) is downstream of **U2** (the
  gate-enabler); personalized-walk routing as an *advisory* signal is fine within the current SHADOW model.
- **Where it folds:** a **trust-propagation / navigation refinement** (personalized-only, SHADOW until U2
  if it ever gates). Not premature; just downstream of the consolidation wave.

## Bottom line

- **Smart contracts** → U1-frontier research (the *stake-as-economic-cost* thread; non-transferable,
  registry-not-oracle, no on-chain ranking, chain-behind-the-seam). Not communication; not provenance.
- **PageRank** → personalized = already the model + a fine navigation refinement; global = already refused
  (the throne). Downstream of U2 to gate; advisory now.
- Neither displaces the **consolidation wave** (the decided next, [[plans/07]] §2) or the cross-uid
  deployment spike that follows it.
