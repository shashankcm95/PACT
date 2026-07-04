# PACT — Premise-Anchored Coordination/Trust Protocol

A protocol blueprint for a network of authenticated AI agents rooted in scarce human identity,
designed to scale the Power Loom `kernel → runtime → evolution` substrate from a single node into
a mutually-untrusting multi-agent network.

> **Building on PACT? Start here.** The **[`docs/PRD.md`](docs/PRD.md)** anchor (what · why · principles ·
> phase order) is the PM entry point; [`docs/phases/`](docs/phases/) is how we build phase-by-phase without
> drifting (the anti-drift loop); [`docs/ADRs/`](docs/ADRs/) records the decisions. The deep,
> amend-deliberately invariants live in **[`PACT-NORTH-STAR.md`](PACT-NORTH-STAR.md)**.

**## Status: **v0 + P2 + P3 + P-minter + P-broker + R2-WHO/R2-WHAT auth + cross-uid custody + U2-seam + merkle/audit anti-equivocation + the U1-stake arc (S1-S5) BUILT + CI (2026-06-24)** — P0-minimal + P1 (ATMS) + P2 (trust) + P3 (grounding + REACH) + P-minter (require-custody) + P-broker (out-of-band custody mechanism) + R2-WHO caller-auth + R2-WHAT per-request auth + the cross-uid custody verifier + the U2 lift-point seam + the §7 merkle/audit anti-equivocation layer (`plans/15`) + the U1 issuance-stake arc (StakeAnchor → issuance-policy → funded-root axis → crater-disciplined SLASH, `plans/18`), **all SHADOW**; the suite is green — run `node test/run.js` for the live count (never quote a remembered one). CI (vacuous-pass-guarded runner + eslint + layering tripwire) on push/PR (node 20+22). **★ 2026-06-23: the R1 cross-uid custody DOGFOOD ran live — file-read non-exfiltration ESTABLISHED (scoped to that, NOT trust broadly), PACT's first world-anchored hardening signal (`plans/14` §8, PR #9).** PRs #1–#21 merged.
**
> **All weights are SHADOW (gate nothing) because residuals remain open.** **P-minter** removed the ambient env-PEM signing default and named a structurally key-free custody writer — but it **NARROWS, it does not CLOSE** integrity≠provenance: provenance is a key-custody property crypto cannot prove in-process (a same-uid attacker re-exports any in-process key), so it closes only when the signer routes to a real out-of-band boundary (separate OS uid / enclave / HSM — a *deployment* property). **Still open (loud):** **U1** (human-uniqueness — `rootOf`-keying defeats persona-multiplication, but N distinct *human* roots is the frontier); **own-key forgery** (a same-uid holder of a registered key mints authentic records — U1's issuance-cost problem); same-uid in-process custody (by physics). **U1 issuance-cost now has a SHADOW containment layer** — the slashable STAKE arc (`plans/18`, S1-S5: a custody-minted non-transferable stake, surfaced as an advisory funded-root axis, forfeitable by a crater-disciplined SLASH) — but it **CONTAINS, it does not CLOSE U1** (a wealthy attacker still buys N roots); only a really-deployed on-chain slash (S6, external/unbuilt) would harden the one issuance-cost axis. The full built substrate (v0+P2+P3+minter+broker/custody+merkle/audit+U1-stake) passed a 4-lens coherence checkpoint ([plans/25](plans/25-coherence-checkpoint-2.md) — COHERENT 4/4, all three plans/03 carry-findings RESOLVED); the original v0+P2+P3 checkpoint is [plans/03](plans/03-coherence-checkpoint.md); P-minter passed a 3-lens VERIFY that reframed it close→narrow ([plans/04](plans/04-authenticated-minter-plan.md)).

| Document | What |
|---|---|
| **[v0/](v0/)** | **the buildable node — surgical transfer + the ATMS core + the P2 trust engine + the P3 grounding engine + the P-minter custody writer; `v0/README.md` + the D1–D7 acceptance gate** ← the build |
| [plans/00-v0-build-plan.md](plans/00-v0-build-plan.md) | the v0 build plan (VERIFY + post-build VALIDATE folded; status BUILT) |
| [plans/01-p2-trust-engine-plan.md](plans/01-p2-trust-engine-plan.md) | the P2 trust-engine plan (VERIFY + post-build VALIDATE folded; status BUILT, SHADOW) |
| [plans/02-p3-grounding-reach-plan.md](plans/02-p3-grounding-reach-plan.md) | the P3 grounding-engine + REACH plan (VERIFY + post-build VALIDATE folded; status BUILT, SHADOW; both seams deferred to P4 per D8) |
| [plans/03-coherence-checkpoint.md](plans/03-coherence-checkpoint.md) | the v0+P2+P3 coherence checkpoint (3-lens CLOSEABLE; folded hygiene + the N+1 fix) |
| [plans/04-authenticated-minter-plan.md](plans/04-authenticated-minter-plan.md) | the P-minter plan (3-lens VERIFY reframed close→narrow; honest-narrow ratified; status BUILT, SHADOW) |
| [plans/05-out-of-band-broker-plan.md](plans/05-out-of-band-broker-plan.md) | the P-broker plan (out-of-band signing broker; 3-lens VERIFY + VALIDATE; VALIDATE hacker won a live TOCTOU race → O_NOFOLLOW fix; custody MECHANISM, custody-real is deployment-contingent; status BUILT, SHADOW) |
| [plans/06-ci-quality-gates-plan.md](plans/06-ci-quality-gates-plan.md) | the CI plan (borrow the toolkit's gates PACT skipped: vacuous-pass-guarded test runner + eslint + layering tripwire; 2-lens VERIFY caught a vacuous-pass CRITICAL; status BUILT) |
| [plans/07–17](plans/07-phase-close-checkpoint.md) | the post-P3 process + custody waves — phase-close checkpoint, consolidation, R2-WHO ([plans/10](plans/10-caller-auth-r2.md)) + R2-WHAT ([plans/11](plans/11-per-request-auth-r2-what.md)) auth, the U2 lift-point seam-harden, and the cross-uid custody dogfoods R1/R2 ([plans/14](plans/14-cross-uid-custody-dogfood.md) / 16 / 17) |
| [plans/15-merkle-ct-log-layer.md](plans/15-merkle-ct-log-layer.md) | the §7 merkle / CT-log anti-equivocation layer (RFC-6962 primitives + per-receiver ordered Merkle log; verify-when-present, `audited:false`-observable) — an INTEGRITY SINK that NARROWS equivocation, does NOT harden trust; status BUILT, SHADOW |
| **[plans/18-u1-issuance-stake-blueprint.md](plans/18-u1-issuance-stake-blueprint.md)** | **the U1 issuance-stake arc (S1-S5)** — StakeAnchor read-fold + custody-minted STAKE → stake-aware issuance-policy → funded-root advisory axis → crater-disciplined SLASH; built across #15–#21, all SHADOW; `## Phase-close sign-off` folded. CONTAINS the U1 issuance-cost axis, does not CLOSE U1 (S6 / on-chain is external) |
| [plans/19-network-phase-blueprint.md](plans/19-network-phase-blueprint.md) | the network-phase blueprint (design-only) — the multi-node dissemination / slash-freshness frontier the stake arc's cross-network residual feeds |
| [plans/20–24](plans/20-u1-stake-s1-s2-build.md) | the U1-stake per-wave build plans (S1-S2 / S3 / S5 / S4) + the broker key-perm vet + the seam-tidy / decay decision |
| **[plans/25-coherence-checkpoint-2.md](plans/25-coherence-checkpoint-2.md)** | **the integrated coherence checkpoint** — 4-lens (claim/residual + correctness/seam + layering/design + provenance/SHADOW) over the WHOLE built substrate; COHERENT 4/4; all three plans/03 carry-findings RESOLVED |
| **[PACT-spec-v1.1.md](PACT-spec-v1.1.md)** | **the *what to build* — BUILD-GRADE rev (supersedes v1.0); folds all 17 ratified decisions + the VALIDATE board** |
| [PACT-spec.md](PACT-spec.md) | implementation spec v1.0 — **SUPERSEDED by v1.1** (kept as the historical record) |
| [PACT-intent-and-landmines.md](PACT-intent-and-landmines.md) | the *why* — design intent, 12 landmines, 6 meta-principles |
| **[research/10-synthesis-and-recommendation.md](research/10-synthesis-and-recommendation.md)** | **the DECISION — what works, what doesn't, what to borrow, what to build** ← start here |
| [research/11-identity-layer-integration.md](research/11-identity-layer-integration.md) | identity-boundary deep-dive — AIP + enterprise IAM: integrate vs overlap (borrow 2 delegation patterns, refuse every root) |
| [research/12-feasibility-scalable-transparent-auditable.md](research/12-feasibility-scalable-transparent-auditable.md) | **feasibility verdict (adversarially verified): YES_WITH_CONDITIONS** — auditable+transparent need no frontier; only scalability's trust-conversion sub-axis is U2-gated |
| [research/13-physical-coordinates-independence-anchor.md](research/13-physical-coordinates-independence-anchor.md) | physical-coords as independence anchor: REJECT for U2 (spatial≠epistemic), SALVAGE attested-hardware for U1 scarcity + config-stability; 4-axis independence portfolio |
| [research/14-swarm-and-self-contained-unit-design-note.md](research/14-swarm-and-self-contained-unit-design-note.md) | bee/swarm inspiration: ADOPT_PARTIAL (take convergence via gossip/CRDT, refuse counting-is-safe); split dissemination from tally; "self-contained unit of truth" → rename to conditional-validity |
| [research/15-nft-provenance-anchor.md](research/15-nft-provenance-anchor.md) | NFT/token as actor provenance: REJECT (the signature already carries it, firsthand-proven); transferable=laundering; SALVAGE non-transferable SBT/DID anchor narrowly for the U1 root-registry |
| [research/16-hierarchical-trust-propagation.md](research/16-hierarchical-trust-propagation.md) | hierarchical (flat→tree past the boundary): SOUND_WITH_AMENDMENTS — verification-hierarchy (proof-carrying) not authority; necessary-not-sufficient (throne reopens at any boundary that counts/falsifies/aggregates/treats-presence-as-provenance — live HETS does 3 wrong today) |
| [research/17-per-node-memory-career-ladder.md](research/17-per-node-memory-career-ladder.md) | per-node first-person memory + novice + career-ladder-not-rank: ADOPT_WITH_AMENDMENTS — INV-2 made relational (escapes EigenTrust throne); private-model + selective vouches; 3 amendments (behavioral-not-truth, never-counts-nodes, defeasible); live tier IS the rank pathology today (farmable in 5 trivial passes); cold-start stays OPEN |
| [research/18-interim-security-u1-open.md](research/18-interim-security-u1-open.md) | **can malicious actors take control while U1 is open? NO (control structurally prevented, U1-independent, theorem-backed: Personalized Hitting Time) — only bounded influence, contained; YES_WITH_PRECONDITIONS** (fix 3 live tally holes + live WEAK flag + authenticated minter before any weight gates an action) |
| [research/19-spec-implementation-readiness-review.md](research/19-spec-implementation-readiness-review.md) | 3-lens review of **v1.0**: RESEARCH-GRADE not BUILD-GRADE — only ~4/17 ratified decisions in the spec; backlog (6 BLOCKER, 11 MAJOR), 11 FOLDs + 2 DECIDEs → the v1.1 spec-rev. **(addressed by v1.1)** |
| **[research/20-spec-v1.1-validation.md](research/20-spec-v1.1-validation.md)** | **3-lens VALIDATE of the v1.1 *draft*: BUILD-GRADE after folding** — 2 BUILD_GRADE + 1 NEEDS_REVISION; 3 MAJORs (FALSIFY/REPAIR authz+anti-ping-pong, FALSIFY-WEAK circularity, INV-13-vs-disjoint-count) + MINORs, all folded into v1.1 §13 |
| [WORKFLOW-ORPHANING-BUG.md](WORKFLOW-ORPHANING-BUG.md) | handoff bug report — background Workflow tasks orphaned on session compaction/rotation; evidence, repro, workaround, investigation steps |
| [research/00-research-plan.md](research/00-research-plan.md) | how the proto-planning research was run |

## Development

PACT has **zero runtime dependencies** (pure node); dev tooling is fetched ephemerally via `npx`, never committed.

```sh
npm test          # run all v0/test/**/*.test.js (pure-node runner, vacuous-pass-guarded)
npm run lint      # eslint (recommended ruleset, fetched via npx --yes eslint@9)
node test/run.js  # the runner directly (what CI runs)
```

CI (`.github/workflows/ci.yml`) **will run** the suite on a **node 20 + 22** matrix plus eslint, on every push/PR
to `main` (the first GitHub Actions run went GREEN on node 20+22). The runner FAILS loudly if zero
test files are discovered, if any file executes zero tests, or if the grand total is zero — a green means tests
actually **ran**, not merely "nothing failed". (It trusts each file's first-party `N passed, M failed` self-report;
it does not independently count assertions.)

### Research evidence base
- `research/prior-art/` — credible-field contrast: [a2a-protocols](research/prior-art/a2a-protocols.md) · [trust-reputation-sybil](research/prior-art/trust-reputation-sybil.md) · [epistemics](research/prior-art/epistemics.md) · [power-loom-mapping](research/prior-art/power-loom-mapping.md)
- `research/verification/` — full HETS verification: [adversarial](research/verification/adversarial.md) (hacker) · [honesty](research/verification/honesty.md) · [architect](research/verification/architect.md)

## The headline

**BUILD — with five named amendments and an inverted build order.** The thesis (machine bears
mechanical certainty; human bears the truth-burden; coupling gated by disjoint, human-accountable
evidence) is genuine and unreplicated in the agent-to-agent field. But: borrow the solved tiers
wholesale (DID/VC + A2A transport + Agent Card + RFC 6962 Merkle log + ATMS + Subjective Logic),
spend the build on the novel core, fix FALSIFY (a denial-of-grounding DoS as written), and sequence
so nothing that acts on the undefined word "independence" ships before it is estimated or flagged
WEAK. See the synthesis for the v0 definition and phased build order.

**Where it stands now.** The decision is folded into **[PACT-spec-v1.1.md](PACT-spec-v1.1.md)** — a
build-grade rev that closes the named ambiguities and survived a 3-lens HETS VALIDATE
([research/20](research/20-spec-v1.1-validation.md)). The v0 (§10.5: two distinct-keyed roots exchange
one authenticated, premise-bound, scope-checked, falsifiable claim that a fabricated counterexample
does not silently collapse) is buildable, depending on neither U1 nor U2. **Both design gates are now
RATIFIED (2026-06-21):** (1) `effective_presence()` = distinct network-facing signing identities in the
delegation closure, `MAX_DELEGATION_DEPTH = 3` (§1.3/§1.2); (2) U1 v0 issuance = invite/vouch + stake as
a DID-VC registry (§10.5). The v0 build plan (P0 + P1) is unblocked; the remaining call is *where* v0
lives — a new package in the toolkit repo (reuses the Power Loom log + ed25519 primitives) vs. a
standalone repo that vendors them (`research/10` §10 decision #3).
