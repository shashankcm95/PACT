# PACT — Fork Ledger

> A running record of decision **forks**: at each fork, the full option set, the chosen branch (with
> rationale), and the **deferred-with-a-home** branches carrying enough detail to pick up cold. Purpose:
> a future session can revisit a not-taken branch without re-deriving it.
>
> Distinct from **`PACT-NORTH-STAR.md` §5** (the terse "directions decided / rejected" canon — amend by
> dated edit) and from **`_SESSION-RESUME.md`** (ephemeral continuity). This ledger keeps the FULL option
> set + the why, so "we chose X over Y, Z" stays legible. Newest fork on top.
>
> Convention: each fork has a stable id (`FORK-NN`), a date, the options, the **CHOSEN** branch, the
> **DEFERRED** branches (with a one-line revisit trigger), and any **REJECTED** branch (do not revive
> without amending the north-star).

---

## FORK-3 (2026-06-22) — after the U2 seam: which FORK-2 deferred branch, post-recalibration?

The USER first picked **CONFIRM evidence-provenance**, but its VERIFY board (`plans/13` §8) recalibrated it:
the advisory disjointness COUNT is theater (no consumer; self-asserted = evasion-trivial; a `distinct_provenance`
count next to `n_confirmers` is the L4 "asserted-distinctness as real independence" landmine), and the carrier
FIELD is contingent on a world-anchored source that does NOT yet exist (the open U2 frontier) — so building it
now reserves an empty slot. The USER then chose the logically-PRIOR step:

- **CHOSEN → world-anchored U2 signal feasibility RFC** (`research/24`, **MERGED PR #8 2026-06-23**). Designed
  what a world-anchored substrate-diversity signal (model-family / corpus / checkpoint independence) could even
  be — the only thing that HARDENS U2 (OQ-NS-6) and the thing that would populate the CONFIRM carrier.
  **OUTCOME (NEGATIVE):** the positive direction is near-unclosable — positive independence is NOT identifiable
  from observables (`[SOURCED]` arXiv:2604.07650), and no currently-conceivable world-anchored signal is
  positively sufficient; the honest salvage is a DEMOTE-only entanglement detector (in-process → narrows). See
  the UPDATE below for what this does to the deferred carrier.
- **DEFERRED (blocked-on-open-frontier, NOT rejected) → CONFIRM evidence-provenance carrier** (`plans/13`, scoped
  to carrier-only; COUNT killed as theater). The carrier itself is SOUND — it is the provenance field that would
  close integrity≠provenance for confirmations — but it is blocked on a world-anchored source that does not yet
  exist. **Revisit when:** ANY future world-anchored substrate-diversity source is discovered that would populate
  + consume the field (research/24 explored ONE such RFC and returned negative — see the UPDATE; the frontier is
  near-unclosable but NOT proven-impossible, so this stays DEFERRED, not REJECTED). Until then, an empty schema
  reservation — not worth a wave.
- **DEFERRED → U1 stake** (unchanged from FORK-2; the hardening-leaning, U2-independent branch).

> **▶ UPDATE 2026-06-23 (post-research/24 + the recon):** research/24 RETURNED with a NEGATIVE verdict — the ONE
> world-anchored RFC it explored is not positively sufficient — so the CONFIRM-carrier revisit-trigger was
> REWORDED above to decouple from research/24 (whose specific door is now closed) onto ANY future world-anchored
> substrate-diversity source. The frontier is near-unclosable but **NOT proven-impossible**, so the carrier stays
> **DEFERRED-blocked** (a sound idea with no buildable signal yet), **NOT REJECTED**. The actionable un-park from
> research/24 is instead the **DEMOTE-only entanglement detector** (`research/24`
> §4.1 / `research/25` §9) — buildable today, narrows-only, exempt from the stakes-throne gate. The U1 stake
> remains the deferred hardening-leaning branch. **Recon 2026-06-23 chose the Merkle/CT-log anti-equivocation
> layer (the spec §7 P0 gap) as the next BUILD** over these narrowing options — see `plans/15` (forthcoming).

## FORK-2 (2026-06-22) — the foundational entry: which trust-hardening sub-direction first?

Within the foundational pivot (FORK-1 chose it), which sub-direction does the first wave take? Per OQ-NS-6,
NONE of these *harden* trust in-process — they differ in how foundational/meaty they are.

- **CHOSEN → U2 lift-point seam-harden + estimator interface-contract RFC** (`plans/12`). Make
  `independenceLabel` DERIVE the epistemic/overall verdict from the single `epistemicIndependence()`
  lift-point (today it hardcodes literals that bypass it — a confirmed latent P5-swap drift) + author
  `research/23` codifying the **world-anchored-only** estimator contract. Most actionable, zero OQ-NS-6 risk
  (pure correctness + a design doc), squarely in the U2 (gate-enabler) direction. NARROWS/readies — does NOT
  harden. *Status: PLAN authored, in the per-wave cadence.*
- **DEFERRED → CONFIRM evidence-provenance field.** Add an evidence-provenance field to the CONFIRM record so
  `cross-verify` can measure evidence DISJOINTNESS — the one direction that touches the actual open U2 axis,
  riding the authenticated-minter signal. Heavier (a producer-schema change). Honest caveat: disjointness
  only *hardens* if the provenance is world-anchored; a self-asserted provenance field only narrows.
  **Revisit when:** the `research/23` RFC needs its first concrete estimator input, or when an
  authenticated/world-anchored provenance source exists to make disjointness real.
- **DEFERRED → U1 stake.** A non-transferable, slashable issuance stake on the identity seam (`research/21`) —
  the one engineered mechanism that *leans* toward hardening (real economic cost). Different axis
  (human-uniqueness, not independence); orthogonal to U2, does NOT close when U2 closes.
  **Revisit when:** the U1 frontier (N-distinct-human-roots) becomes the priority, or a real
  registry-not-oracle stake substrate is available.

---

## FORK-1 (2026-06-22) — next frontier after R2-WHAT (per-request auth) merged

R2-WHAT narrowed the broker's WHAT axis. What does the next wave pursue?

- **CHOSEN → the foundational trust-hardening pivot** (→ FORK-2). Per OQ-NS-6 / north-star §2.6, more
  in-process SHADOW narrowing does NOT advance the apex; pivot toward the foundational frontiers
  (U1 / U2 / world-anchored). *USER directive: "more foundational ... 1 and 2 recorded as deferred."*
- **DEFERRED → multi-persona broker.** The build-ready extension present-the-frame enabled: a uid→persona
  policy map + per-persona key selection, where the uid↔persona entitlement map finally becomes load-bearing.
  Concrete SHADOW code, coherent with R2-WHAT. But it NARROWS the WHAT axis further — does not harden.
  **Revisit when:** a real deployment needs one broker to serve several personas, or when narrowing the
  WHAT axis further has concrete value.
- **DEFERRED → capability token.** Human-root-signed grants ("uid U may obtain P's signature over frames
  matching C") — the path toward the AUTHENTICATED minter the integrity≠provenance residual actually needs.
  Heavier (minting authority + key + token format + revocation). Also narrowing, not hardening — but the
  closest of the narrowing options to a real authenticated writer.
  **Revisit when:** cross-party entitlement is needed, or when closing integrity≠provenance with a signed
  (not store-re-hash) minter becomes the priority.

---

## REJECTED branches (do not revive without amending `PACT-NORTH-STAR.md` §5)

Recorded so they are not re-proposed as if new:

- **Transferable-token / NFT provenance** — laundering risk (a transferable token detaches provenance from
  the scarce human root). Smart-contracts are admitted ONLY as the U1 issuance *stake* (non-transferable,
  registry-not-oracle, chain-behind-the-seam).
- **Global PageRank / EigenTrust ranking** — the "throne." PACT uses *personalized* propagation only
  (personalized-yes / global-no); a global rank re-introduces a single trust authority.
- **Standalone-persona product** — collapses to a plugin (researched → killed; see the persona-jardin verdict).
- **Vendor-exfil cross-model review** — sends substrate deltas to a third-party vendor; the pre-egress
  scrubber + governance opt-in is the path if ever revisited.
