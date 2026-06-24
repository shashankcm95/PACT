---
lifecycle: persistent
created: 2026-06-24
phase: U1 issuance-stake BLUEPRINT (design-only — NOT a build) — the Sybil-price / containment thread of the U1 frontier
status: S1-S5 BUILT + PHASE-CLOSED 2026-06-24 (#15-#18; see `## Phase-close sign-off` below — all NARROWING, SHADOW). S6 (on-chain) stays DESIGN-ONLY/external. Architect design pass folded (workflow `wf_a5ccc483`).
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

## Phase-close sign-off (2026-06-24 — the integrated S1-S5 BUILD arc)

> The build of S1-S5 is COMPLETE and merged: #15 (S1-S2 `StakeAnchor` + custody `STAKE`), #16 (S3 issuance-policy),
> #17 (S5 `convert.funded_root` axis), #18 (S4 `SLASH`). Main @ `facf65d`; integrated suite re-run firsthand 360/0
> (was 358 + the two close-now tests this gate added). S6 (on-chain) is DESIGN-ONLY/external and correctly NOT built.
> This is the coarse cross-PR gate the per-wave VALIDATEs cannot see — a 3-lens review of the INTEGRATED arc vs the
> §2-§6 exit criteria. **The whole arc NARROWS, it does not harden (OQ-NS-6); nothing here is a U1 closure (NS-9).**

### Verdicts (all three lenses: CLOSEABLE-WITH-NOTES; 0 CRITICAL, 0 HIGH)

| Lens | Persona | Verdict | Headline |
|---|---|---|---|
| PM / claim-honesty | `honesty-auditor` | CLOSEABLE-WITH-NOTES | "one of the most claim-honest arcs"; NS-9 honored in every artifact; SHADOW held behaviorally; exit criteria S1-S5 all delivered, no hollow step |
| Principal-SDE (phase altitude) | `code-reviewer` | CLOSEABLE-WITH-NOTES | no contract drift across the 4 PRs; the `'slashed'` addition is isolated from S3's strict `=== 'locked'` + S5's open-enum passthrough; forward-contract verified firsthand by running it |
| Architect | `architect` | CLOSEABLE-WITH-NOTES | the DI consumer seam is genuinely swappable for S6; all design constraints held (soulbound / registry-not-oracle / no-global-rank / derived-on-read); two named forward-contract gaps S6 + network inherit |

### Exit-criteria delivery (§2 build DAG)

| Step | §2 promise | Delivered | Evidence |
|---|---|---|---|
| S1 | `StakeAnchor` seam, derived-on-read, registry-not-oracle | YES | `stake-anchor.js:35-98` (`createStakeAnchor` returns `{stakeOf}`; no store/edge/rank) |
| S2 | `STAKE` minted ONLY through custody, non-transferable | YES | `stake.js:14-32` (payload `{lock_expiry}` only; minter-bound root; the forgeable `amount` field deliberately dropped, D5) |
| S3 | stake-aware issuance policy, never gates registration | YES | `issuance-policy.js:40-105` (`meetsPolicy` strict `=== 'locked'`; `gates:false`) |
| S4 | `SLASH` crater-disciplined, append-only, authorized slasher | YES | `slash.js` + `stake-anchor.js:52-65` (quorum `>= 2` distinct earned roots; F3-analog `target_stake_id`; L8 reason gate) |
| S5 | `funded_root` advisory axis, receiver-relative, never a gate | YES | `convert.js:96-110,133` (`funded_root` field; `actionable:false`; null tri-state fail-closed) |

### What this gate CLOSED (4 convergent findings folded into this sign-off PR)

- **MED (honesty F1 + code-reviewer) — the `'slashed'` -> `convert.funded_root` composition was asserted by NO test on
  merged main.** Honestly disclosed as a forward-contract in plans/23 §5 (S5 #17 was built before S4 #18), but the
  integrated seam was never exercised. CLOSED: `convert-stake.test.js` now has a NON-VACUOUS composition test (proves
  the locked -> slashed flip against a real signed `STAKE` + 2 earned-standing `SLASH`es, and `actionable` stays false).
- **LOW (all 3 lenses) — `issuance-policy.js` `reasonFor` rendered "(bootstrap or unstaked)" for a slashed root.**
  CLOSED: a dedicated `'slashed'` arm ("STAKE slashed (forfeited by the crater quorum)"). Documentary field only.
- **LOW (code-reviewer) — stale `"S4 will add 'slashed'"` comment** (S4 merged). CLOSED: -> "S4 added".
- **LOW (honesty F2 + code-reviewer) — `stake.test.js` SHADOW import-wall excluded the impl by basename, not relative
  path, and lacked the non-vacuousness precondition** the hardened S3 wall has. CLOSED: relative-path exclusion +
  a `stake-anchor.js`-exists-and-non-empty precondition test (mirrors `issuance-policy.test.js:298-318`).

### Carried forward as NAMED residuals (acceptable to close the phase with; NOT defects)

- **S6 seam-tidy (architect A, MED) — `stakeOf(storeOpts, humanUid, nowMs)` leaks the in-memory backend's per-receiver
  filesystem `storeOpts` across the shared interface (Leaky Abstraction).** The CONSUMER seam is swappable (both
  consumers take the anchor via DI, neither statically imports the impl), so S6 drops in WITHOUT a consumer rewrite —
  but the S6 author should close `storeOpts` over at construction so the shared contract is `stakeOf(humanUid, nowMs)`.
  Defer-with-eyes-open; record as the S6 seam-tidy.
- **Cross-network slash freshness (architect B, MED; blueprint §7 Q6) — inherited RAW by the network phase (plans/19).**
  `stakeOf` is receiver-relative + read-local; a slashed root reads `'slashed'` only in a view that has received the
  `SLASH`. No TTL / propagation guarantee, and no transport layer exists in v0. Correct substrate to build the relay
  invariant (TTL >= dissemination-latency) on top of; the network phase owns it.
- **Slash/stake decay asymmetry (architect C, LOW; §7 Q3) — a `SLASH` is permanent-on-read; DIRECT defection evidence
  decays.** Defensible for a settlement event while SHADOW, but the governance question (can a wrongly-slashed root
  recover?) needs a decision BEFORE S6 makes the forfeiture real-money. Carried to S6.

### The one thing the next phase (S6 / network) must NOT mis-read

`funded_root.status === 'locked'` / `meets_policy:true` prove the PRESENCE of a self-minted, zero-cost, unbounded-
`lock_expiry` commitment marker — NOT a borne cost. Every "funded" reading is in-process NARROWING. A real cost
appears only when S6 routes the stake to a really-deployed slashable deposit AND the broker routes to a real
out-of-band boundary. Any future GATING consumer MUST treat `funded_root:null` as FAIL-CLOSED (the contract is
documented at `convert.js:84-93` but enforced by nothing yet).

### Honesty process-note

The `honesty-auditor` lens has no Bash, so its "358/0" figure was orchestrator-attested; the `code-reviewer` lens
RE-RAN the suite firsthand (and ran the forward-contract probe live) — so the integrated 360/0 here is firsthand, not
self-attested. Per OQ-NS-6 this remains SHADOW-level in-process self-consistency evidence, NOT a world-anchored
hardening signal. **VERDICT: the U1-stake BUILD arc (S1-S5) is PHASE-CLOSED — CLOSEABLE, all NARROWING, S6 + the
network phase carry the three named residuals.**

### Post-sign-off (same PR) — acceptance leg + test-tier reorg

- **Acceptance leg added** — `v0/test/acceptance/u1-stake-dod.test.js` (DS1-DS6): a single end-to-end SHADOW
  lifecycle walk (custody-mint `STAKE` -> `stakeOf` -> issuance-policy + convert read it -> crater-quorum `SLASH`
  -> `'slashed'` composes back into BOTH consumers, no gate ever flips), mirroring the `v0-dod` DoD idiom. This
  discharges the gate's MED finding at ACCEPTANCE altitude (the per-wave tests verify the parts; this asserts the
  whole walk). Non-vacuous: DS1 forged-stake + DS4 sub-quorum are inline negative controls.
- **Test tiers split** — `v0/test/unit/` (6 pure single-module suites) vs `v0/test/integration/` (14 real-store /
  multi-module signed-record-flow / real-spawn suites) vs `v0/test/acceptance/` (2 DoD gates). The runner
  (`test/run.js`) discovers all three recursively (no CI change); the "unit" folder previously held mostly
  component-integration tests, so the names now match the levels. Suite: 22 files / 366 green, eslint clean.
