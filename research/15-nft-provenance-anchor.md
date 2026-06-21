---
lifecycle: persistent
phase: proto-planning — design-direction probe
created: 2026-06-21
status: recommendation (adversarially verified, firsthand repo-probed)
---

# NFT / on-chain token as actor provenance anchor — verdict

> 4-agent adversarially-verified workflow (`w70rng2b9`). **Verdict: REJECT the NFT-at-spawn-time
> provenance claim; SALVAGE the instinct as a NON-transferable anchor (SBT/VC/DID) used narrowly for
> the U1 root-registry.** The hacker confirmed the core finding *firsthand against the live repo*.
> Mirrors the physical-coordinates verdict ([13](13-physical-coordinates-independence-anchor.md)):
> wrong mechanism for the stated job, narrowly-right for a different, real job — and even there a
> registry substrate, not a U1/U2 oracle.

## The load-bearing refutation (proven firsthand, not argued)
The hacker exercised the real `packages/kernel/_lib/edge-attestation.js` path: `verifyRecordSig(id,
sig, opts)` resolves the verify key from the caller/env **only** — the verifier needs the actor
**public key + the frame and nothing from any ledger** (INV-2 receiver-controlled). Swap the actor
identity in the frame, re-derive the content-address, and **the old signature verifies `false`** —
identity is *bound by the signature*, not asserted in a field. And `weight-minter.js` is the #273
authenticated-minter close already shipping ("integrity does NOT prove WHO made it … the minter
raises that bar").

⇒ **The signature does 100% of the provenance work.** It binds `actor-key → parent human-root`
(the persona's `σ_root`), the content-address binds `body → id` (verify-on-read), the authenticated
minter binds *who* minted it. **An NFT can only re-encode that same fact in a second place (the
chain) = pure information leakage, zero net provenance.** Remove the NFT, keep the signed record →
nothing lost.

## Your two specific questions, answered
- **"Transfer would include a record on the blockchain itself, right?"** — **Yes, you read it right.**
  An ERC-721 transfer updates ownership state and emits a permanent, public `Transfer` event. But
  **audit ≠ prevent**: a recorded transfer makes laundering *visible*, not *impossible* — the earned
  trust still rides to the buyer, and "visible" only helps consumers who re-check provenance on every
  interaction *and* treat a transfer as a trust-reset (an enforcement burden, not a free guarantee).
- **"A non-duplicable token attesting the unique identifier of an independent node"** — the
  non-duplicable / *soulbound* instinct is the right one (a transferable token is identity-laundering,
  strictly worse than no token). But the phrase bundles three things the token can't all deliver:
  unique *token/identifier* ✅ (free from the ledger) · *bound to that node* ✅ (via the signature,
  which is exactly why the token is redundant) · unique *node* ❌ (U1) · *independent* node ❌ (U2).

## What an on-chain token provably adds over the signed record — and why PACT doesn't need it
**Only two things, both registry/ordering properties, not provenance:** (1) global public ordering +
an immutable timestamp (anti-equivocation across receivers), and (2) censorship-resistant readability.
And PACT's **per-receiver Merkle logs + RFC 6962 consistency proofs already deliver tamper-evidence +
per-receiver equivocation-detection without a global chain.** The chain would add only *cross-receiver
global ordering* — the single global canonical log PACT consciously **removed** (INV-10 → per-receiver
logs, because a global canonical log can't exist across mutually-untrusting roots: a scaling cliff +
an INV-2 contradiction). EAS off-chain attestations and W3C VCs are, in trust content, **byte-for-byte
identical** to the existing signed authenticated-minter record (all prove WHO+UNTAMPERED via a key,
none prove the claim *true* — VC-DM 2.0 verbatim: "Verifiability of a credential does not imply the
truth of claims").

## It touches neither U1 nor U2 (the same wall, again)
- **U1 (uniqueness): untouched.** Minting is permissionless + gas-cheap = a *linear per-mint cost*,
  never a uniqueness proof (identical to the physical-coords/PoW finding). A cost multiplier is a
  containment parameter, not a solution. Even a soulbound SBT doesn't fix it — the DeSoc paper gets
  Sybil-resistance from *correlation-checking the web of SBTs* (social attestation), not the token.
- **U2 (independence): untouched, and made worse.** The same model substrate can hold N "distinct"
  on-chain identities producing byte-correlated assessments the token layer certifies as independent —
  **L4 one layer down, worse because the on-chain proof disarms skepticism** (L4/L7).

## The narrow salvage
A **non-transferable anchor (SBT / W3C VC / EAS off-chain attestation / did:ion-anchored DID)** is a
legitimate mechanization of §10 Phase-0 "pluggable HumanRoot issuance" + §9 U1 "stronger anchors" —
a public, auditable, censorship-resistant place to **record root anchors**. Three hard bounds:
1. **Registry, not oracle** — it records a root anchor; it cannot prove one-human-one-root. U1 stays open.
2. **Never per-spawn** — per-spawn provenance is already solved by the signed record; an on-chain
   write per spawn is gratuitous cost/latency *and* an INV-2 violation. Confine the chain to a
   **coarse, rarely-anchored registry** (did:ion-style: ~one tx per 10k ops, data off-chain) acting
   as a *fork-detector / anti-equivocation timestamp* over the root-registry only.
3. **A relocated, only-weakly-bindable consensus throne (L6)** — the validator/miner set becomes a
   decider over who's listed as a root (MEV, reorgs, censorship-resistance all unfinished). Must be
   **named + bound** (auditable, plural, contestable, rotating) exactly as the silicon-vendor PKI
   throne was. As proposed (per-spawn, global-consensus path) the throne is **unbindable**.

## Bottom line
**Reject "an NFT linked to the actor at spawn-time integrates provenance."** Provenance is already
carried, in full, by the signed authenticated-minter record — verified firsthand with *zero ledger
dependency*. A transferable NFT is identity-laundering in a legitimacy costume (strictly worse than no
token). The only salvageable instinct is a **non-transferable anchor for the U1 root-registry**,
batched and coarse, never per-spawn — and even that is a registry, not a uniqueness/independence
oracle. **U1 and U2 stay `[OPEN]` regardless of any token.**
