---
lifecycle: persistent
created: 2026-06-24
phase: U1 issuance-stake BLUEPRINT (design-only — NOT a build) — the Sybil-price / containment thread of the U1 frontier
status: BLUEPRINT — architect design pass folded (workflow `wf_a5ccc483`); design-only, no code; awaiting USER direction to build any step
---

# U1 issuance-stake blueprint — a slashable economic cost behind the registry seam (DESIGN ONLY)

> Authored 2026-06-24 as one of two consolidation-wave blueprints (the other is `plans/19`, the network phase),
> after north-star §2 point-10 declared the single-box custody-dogfood vein mined out. This is a **blueprint, not a
> build** (NS-9: a blueprint is not a hardening). It captures the architect design pass (`wf_a5ccc483`) so the
> design isn't re-derived; building any step is a separate, USER-gated decision.

## §0 Honest scope + the one-line verdict (read first — OQ-NS-6 / NS-7)

U1 = human-uniqueness. Persona-multiplication is ALREADY defeated (`rootOf` collapses a million personas to one
human root — `registry.js`, `presence.js` `effectivePresence`). The OPEN part is making a fresh HUMAN root
expensive / Sybil-resistant. The decided narrow fit (`research/21` Q1 + `research/18`): an **issuance STAKE** — a
slashable economic cost bound to a **non-transferable** root-registry entry, kept BEHIND the existing `registry.js`
seam.

**The one-line verdict (OQ-NS-6, brutal):** of the six steps, **S1-S5 NARROW** (they raise the *simulated* price of
a root and CONTAIN collusion rings — an in-process cost an attacker does not really bear); **only S6 — a really-
deployed on-chain slashable stake — leans toward HARDENING**, and only once a real attacker really forfeits real
value. A stake **CONTAINS** U1; it does **NOT CLOSE** it (a wealthy attacker still buys N roots — `research/18`
"contained, not eliminated"). This blueprint is design-only; **building S1-S5 must NEVER be reported as hardening U1.**

## §1 The buildable thread

A `STAKE` as a slashable economic cost attached to a non-transferable root-registry entry, implemented behind the
`registry.js` seam as: (a) a new `STAKE` record type produced ONLY through the existing authenticated minter/broker
custody path (reuse the cross-uid signer — NOT a new key path); (b) stake-state DERIVED-ON-READ (never a mutable
score store, NS-5); (c) a `SLASH` as a gated, authorized, append-only CONTEST-shaped record. The on-chain
settlement layer is an OPTIONAL pluggable backend behind a `StakeAnchor` interface — **the substrate depends on the
SEAM, never on a chain** (`research/21` constraint 4: a chain is a NEW root PACT refuses).

**The forward-contract already exists in code:** `convert.js:82-85` already NAMES "voucher stake" as part of the
per-path UNFORGEABLE bar that must exist before `actionable` can ever flip. This blueprint builds that named-but-
absent piece. (`research/18` confirms `VOUCHER_STAKE` is currently 0 hits — unbuilt.)

## §2 The build DAG (each step: SHADOW unless noted; the narrows-vs-hardens verdict is per-step)

- **S1 — `StakeAnchor` interface + InMemory backend (the SEAM).** A narrow pluggable interface
  `StakeAnchor { stakeOf(humanUid) -> {amount, lockedUntil, status}, recordStake(entry), recordSlash(entry) }`
  with an InMemory default backend (derived-on-read; NO mutable score store — recompute stake-state from the
  append-only record set). The anchor stays a **REGISTRY, never an ORACLE**: it RECORDS a stake, never auto-mints a
  DIRECT/trust edge, never returns a rank (`research/19` M7 / INV-18). _Depends on:_ none (extends the `registry.js`
  seam). _SHADOW; NARROWS._
- **S2 — `STAKE` record type, minted ONLY through custody.** Payload `{human_uid, amount, lock_expiry,
  anchor_ref}`, producible ONLY through the existing minter (`minter.js` `createMinter`) routed to the cross-uid
  broker signer (`request-auth.js` recompute-bind + persona-bind). **Reuse the custody mechanism wholesale (NS-10) —
  no new key path.** Non-transferable BY CONSTRUCTION: bound to the minter's `human_uid` at construction
  (`minter.js`, cross-root minting structurally impossible). _Depends on:_ S1. _SHADOW; NARROWS_ (provenance is REAL
  only when the broker routes to a real out-of-band boundary — the cross-uid deploy dogfooded for R1/R2).
- **S3 — Stake-aware issuance policy behind the registry seam.** Extend root-issuance (`registry.js`) so a fresh
  ROOT registration OPTIONALLY requires a verified `STAKE` over its `human_uid` (invite/vouch + STAKE, the v0
  ratified policy). Pluggable: `no-stake` (current v0) | `stake-required`. Still a REGISTRY (records root + stake),
  never an ORACLE (no admission throne, no auto-edge). _Depends on:_ S2. _SHADOW; NARROWS_ (raises the root price,
  but the price is REAL only when economically slashable — S5/S6; in-memory stake = simulated cost = narrows).
- **S4 — `SLASH` as a gated, append-only, derived-on-read record.** A CONTEST-shaped record (reuse the
  falsification family, `research/22` §1) targeting a `STAKE`: authorized (an entitled slasher — a named+bound
  throne, `research/18`), in-scope, append-only (log grows; stake-state re-derives to `slashed` on read). Mirror the
  FALSIFY discipline: flag-not-collapse, gated, cycles fail-closed. **Error-is-not-malice (L8): a slash needs an
  authorized counterexample, never a popularity signal.** _Depends on:_ S2, S3. _SHADOW; NARROWS_ (meaningful only
  when the slashed amount is a REAL forfeited cost — S6).
- **S5 — Stake-as-containment wired into CONSENSUS as an ADVISORY axis (NOT a gate).** Surface stake-state as ONE
  advisory input to the per-receiver `convert`/`consensus` — a funded-root signal, receiver-relative (NS-3), per-
  path, decaying. **NEVER a global rank (NS-3/L6). NEVER read as epistemic independence (axis 4)** — it is a
  scarcity/cost axis (axis-1 family); `weak-flag.js` forbids reading AND(axes 1-3) as axis 4. `actionable` stays
  false (INV-16). _Depends on:_ S4. _SHADOW (hard requirement); NARROWS._ Could GATE only when BOTH: (1) U2 closes
  (near-unclosable positively, `research/24` — so realistically never hard-gates on positive U2), AND (2) the stake
  is really slashable (S6).
- **S6 — Optional on-chain `StakeAnchor` backend (the HARDENING candidate — DESIGN ONLY, deploy is external).** A
  backend against a real chain: non-transferable (soulbound — no transfer fn), registry-not-oracle (no on-chain
  ranking), chain-behind-the-seam (a governance/deployment decision, never a substrate root). The contract holds a
  real slashable deposit; `SLASH` (S4) settles a real forfeiture. _Depends on:_ S1 (seam) + S5 (consumer) +
  **EXTERNAL PRECONDITION: a real chain deployment with real economic value at stake (UNBUILT, out-of-scope).**
  _This is the ONLY step that leans toward HARDENING (NS-7) — and ONLY once really deployed._ Until then it NARROWS
  exactly like the in-memory backend (a testnet/unfunded stake bears no real cost). Even deployed, it hardens ONE
  axis (issuance-cost) of U1 — it does NOT close U1 uniqueness.

## §3 Hard constraints (the design MUST honor these — all from the corpus)

- **Non-transferable (soulbound).** A transferable token/NFT as provenance is identity LAUNDERING — REJECTED
  (north-star §5; `research/15`/`21`). The `STAKE` binds to `human_uid` at the minter, no transfer path.
- **Registry, NEVER an oracle** (`research/19` M7 / INV-18) — records a root+stake; never auto-mints an edge, never
  a global score, never an admission gate. If issuance granted an edge, the Sybil-~0 result collapses.
- **No on-chain global reputation / ranking** (`research/21` constraint 3) — that is the rank THRONE PACT refuses
  (NS-3/L6). Stake informs the receiver's OWN weighting, per-receiver, never a global order.
- **A chain is a NEW root** — kept BEHIND the registry seam as an OPTIONAL backend; the substrate depends on the
  `StakeAnchor` SEAM, never a chain.
- **A stake CONTAINS, it does not CLOSE U1** — a soulbound SBT/stake is a containment PARAMETER, not a solution.
  SBT-now -> Personhood-Credentials/World-ID-later is a one-seam upgrade.
- **SHADOW until residuals close (NS-8)** — `convert.actionable` stays false while U1/U2/provenance-custody are open.
- **Derived-on-read, no mutable score store (NS-5/NS-11)** — stake/slash state recomputed from the append-only set.
- **Provenance via the existing custody mechanism only (NS-10)** — reuse minter/broker; never a new key path.
- **Effective presence is the cap unit, never nominal identities (NS-4)** — stake raises per-ROOT cost, never
  per-persona.

## §4 Already built vs newly proposed (do NOT rebuild)

**Reuse (cite firsthand):** the U1 registry SEAM (`registry.js`: `createRegistry`, `registerPersona` [mints no
trust], `isKnownRoot`, `rootOf`, `lookupPublicKey`); `rootOf` + `effectivePresence` (`presence.js`); the
authenticated minter / custody path (`minter.js` + `request-auth.js` + the cross-uid broker `broker-sign.js` /
`custody-verify.js` — the provenance vehicle the `STAKE` reuses wholesale); the independence WEAK seam
(`weak-flag.js` `epistemicIndependence()` — the stake axis must NOT be read as axis 4); the advisory consensus
consumer (`convert.js`, which already names "voucher stake" at `:82-85`); the CONTEST/falsification family (for
`SLASH` discipline). **Newly proposed (grep confirms zero `STAKE`/`VOUCHER_STAKE`/slash types in `v0/src`):** S1-S6.

## §5 Residuals (carry loud — NS-9; OPEN even after the full blueprint ships)

U1 uniqueness stays OPEN (containment, not elimination — a wealthy attacker buys N roots) · S6 narrows until a real
chain is really deployed (external/unbuilt) · closing U1 does NOT close U2 (orthogonal; the advisory stake axis can
never hard-gate while `epistemicIndependence()` stays permanently WEAK) · same-uid/own-key forgery of a `STAKE` is
open by physics until the broker routes to a real out-of-band boundary (integrity != provenance, NS-2) · earned-
then-betray / patient-sleeper / collusion-ring residuals persist (stake bounds the ring-cost, never the first
betrayal) · the SLASH authority is a RELOCATED THRONE that must be named + bound (auditable/plural/contestable — L7
control-wears-the-costume risk) · eclipse/cold-start is a TRANSPORT-layer residual the stake doesn't touch.

## §6 Drift-rules respected (the §6 detector + §5 rejected list this blueprint risks tripping, and how it avoids each)

- **L2 (cheap-not-unforgeable):** a simulated/in-memory stake IS the cheap thing -> AVOIDED by keeping S1-S5 strictly
  SHADOW and being loud that only a real slashable deployment (S6, external) leans toward unforgeable.
- **L6 / §5 global PageRank/EigenTrust throne:** the stake must not become a global score -> AVOIDED by S5 as a
  per-receiver advisory axis only; no on-chain ranking.
- **§5 transferable-token-as-provenance (laundering):** AVOIDED by the soulbound constraint (no transfer path).
- **NS-7 / inflection — SHADOW machinery expecting it to HARDEN (the SHARPEST risk):** AVOIDED by the explicit
  OQ-NS-6 framing — S1-S5 declared NARROWING; only a really-deployed S6 leans toward hardening; the blueprint
  declared not-a-hardening.
- **NS-5 mutable score store:** AVOIDED by deriving stake/slash state on read.
- **NS-8 gate-before-U2:** AVOIDED — `convert.actionable` stays false; gating needs BOTH U2-closed AND really-
  slashable, neither buildable now.
- **registry-as-oracle (M7):** AVOIDED — anchor records, never auto-mints an edge.
- **L8 error-as-malice:** AVOIDED — a SLASH requires an authorized in-scope counterexample.
- **NS-10 reuse-over-claim:** AVOIDED — reuse covers integrity/custody only, NOT U1-uniqueness (the novel boundary
  stays open).

## §7 Open questions (resolve before building the relevant step)

1. **Who is the entitled SLASHER, and how is that throne bound** (plural / auditable / contestable)? Governance
   unresolved (`research/18`). Blocks S4.
2. **Stake AMOUNT / lock-duration policy** — per-root flat (narrows linearly) or risk-tiered (risks re-introducing a
   rank, L6)? Needs design before S3.
3. **Decay semantics for the advisory axis (S5)** — a stake should decay like other trust signals (NS-3), but a
   slashable deposit is binary while live; reconcile in the per-receiver weighting.
4. **Which chain (if any) for S6**, and does ANY real-value deployment clear the "a chain is a new root" bar without
   becoming a governance dependency? Deliberately deferred (`research/21`).
5. **SBT -> Personhood-Credentials/World-ID upgrade interaction** — the `StakeAnchor` interface must be anchor-
   agnostic so the seam survives the swap.
6. **Cross-network freshness of a `STAKE`** (`research/22` §2) — a slashed stake must propagate before the network
   re-acts on a stale "funded" signal. Ties to `plans/19`.

## §8 Recommendation (for the USER's direction call — this blueprint does NOT self-authorize a build)

Of the two consolidation blueprints, **U1-stake is the one with a path to hardening** (S6, even if external) and is
**U2-independent** (it does not wait on the research-closed U2 frontier). If/when a build is chosen, the natural
first slice is **S1-S2** (the `StakeAnchor` seam + the custody-minted `STAKE` record) — pure SHADOW, fully testable
in-process, reusing the dogfooded custody path, and it discharges the `convert.js:82-85` forward-contract. S3-S5
follow; S6 stays design-only until a real chain deployment is a funded decision. **Nothing here should be built
without an explicit USER go** (NS-8: it stays SHADOW regardless).
