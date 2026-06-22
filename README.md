# PACT — Premise-Anchored Coordination/Trust Protocol

A protocol blueprint for a network of authenticated AI agents rooted in scarce human identity,
designed to scale the Power Loom `kernel → runtime → evolution` substrate from a single node into
a mutually-untrusting multi-agent network.

## Status: **v0 + P2 + P3 + P-minter BUILT (2026-06-21)** — P0-minimal + P1 (ATMS) + P2 (trust) + P3 (grounding + REACH) + P-minter (require-custody hardening), all SHADOW; 121 tests green

> **All weights are SHADOW (gate nothing) because residuals remain open.** **P-minter** removed the ambient env-PEM signing default and named a structurally key-free custody writer — but it **NARROWS, it does not CLOSE** integrity≠provenance: provenance is a key-custody property crypto cannot prove in-process (a same-uid attacker re-exports any in-process key), so it closes only when the signer routes to a real out-of-band boundary (separate OS uid / enclave / HSM — a *deployment* property). **Still open (loud):** **U1** (human-uniqueness — `rootOf`-keying defeats persona-multiplication, but N distinct *human* roots is the frontier); **own-key forgery** (a same-uid holder of a registered key mints authentic records — U1's issuance-cost problem); same-uid in-process custody (by physics). v0+P2+P3 passed a 3-lens coherence checkpoint ([plans/03](plans/03-coherence-checkpoint.md)); P-minter passed a 3-lens VERIFY that reframed it close→narrow ([plans/04](plans/04-authenticated-minter-plan.md)).

| Document | What |
|---|---|
| **[v0/](v0/)** | **the buildable node — surgical transfer + the ATMS core + the P2 trust engine + the P3 grounding engine + the P-minter custody writer; `v0/README.md` + the D1–D7 acceptance gate** ← the build |
| [plans/00-v0-build-plan.md](plans/00-v0-build-plan.md) | the v0 build plan (VERIFY + post-build VALIDATE folded; status BUILT) |
| [plans/01-p2-trust-engine-plan.md](plans/01-p2-trust-engine-plan.md) | the P2 trust-engine plan (VERIFY + post-build VALIDATE folded; status BUILT, SHADOW) |
| [plans/02-p3-grounding-reach-plan.md](plans/02-p3-grounding-reach-plan.md) | the P3 grounding-engine + REACH plan (VERIFY + post-build VALIDATE folded; status BUILT, SHADOW; both seams deferred to P4 per D8) |
| [plans/03-coherence-checkpoint.md](plans/03-coherence-checkpoint.md) | the v0+P2+P3 coherence checkpoint (3-lens CLOSEABLE; folded hygiene + the N+1 fix) |
| [plans/04-authenticated-minter-plan.md](plans/04-authenticated-minter-plan.md) | the P-minter plan (3-lens VERIFY reframed close→narrow; honest-narrow ratified; status BUILT, SHADOW) |
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
