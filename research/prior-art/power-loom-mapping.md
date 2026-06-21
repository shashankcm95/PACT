---
title: Power Loom → PACT §11 mapping — code-grounded verification
date: 2026-06-21
status: analysis
lifecycle: persistent
subject_repo: /Users/shashankchandrashekarmurigappa/Documents/claude-toolkit
verifier: codebase-grounded analyst (every claim cites file:line read firsthand)
---

# Power Loom as a "single PACT node" — does §11 hold up against the code?

PACT-spec §11 claims `claude-power-loom` "already implements much of the NODE
INTERIOR." This report verifies each mapping row against the **actual code** in
`/Users/shashankchandrashekarmurigappa/Documents/claude-toolkit`, marks each
ACCURATE / OVER-CLAIMED / MISSING, then assesses the honest gap to a 2-node PACT.

Convention used throughout: **"the code does X"** (cited file:line I read) is kept
strictly separate from **"a comment/doc claims X"**. Power Loom's own comments are
unusually candid about being SHADOW / advisory / integrity-not-provenance, which
makes verification easier — most over-claims are in the §11 *table*, not in the repo.

The repo's own framing (CLAUDE.md, MEMORY.md): three tiers as a "single node" —
**kernel** (enforced/mechanical hooks), **runtime** (HETS orchestration, best-effort),
**lab** (v3.x advisory/SHADOW "evolution" substrate). Almost everything PACT wants for
P2 (trust/grounding) lives in `lab` and is explicitly **SHADOW (gates nothing)**.

---

## Per-row verdict table

| # | PACT §11 row | Verdict | Evidence (file:line) |
|---|---|---|---|
| 1 | Byzantine LLM (in+out untrusted vs ground) → INV-1 (P1≠P2) | **ACCURATE (as a posture; mechanism partial)** | The whole substrate treats LLM output as untrusted-vs-ground: `real-solve.js:21-24` "HARNESS GRADE, NEVER SELF-ASSERT … NEVER parsed from the actor's stdout"; `transaction-record.js` content-addresses every record so a record's identity is its content-hash, not a self-assertion. The untrusted-code-execution containment is real: `issue-corpus/docker-backend.js` + `ARCHITECTURE.md:133` (`--network none`, mount-ns, cgroup bounds, OOM-kill→`KILLED_FOR_DOS`). |
| 2 | filesystem-delta-as-truth → §3 delta is VALID-GIVEN-CONTRACT | **OVER-CLAIMED (wording) / ACCURATE (spirit)** | The delta IS the unit of work and IS verified, not trusted: `record-store.js:293-313` verify-on-read (filename↔field↔content re-hash); `transaction-record.js:119-127` `post_state_hash = sha256('POST_STATE\|'+treeSha)` keys a record to the resulting **git tree**. But the delta is NOT bound to a *premise* in the §3 sense — it's bound to a **test/contract outcome** and a tree hash. "VALID-GIVEN-CONTRACT" is right; "premise chain" is not present (see row 3). |
| 3 | contract verification → §3 VALIDATE (A-given-P) — "already premise-bound!" | **OVER-CLAIMED** | Two different "verification" things exist, neither is A-given-P. (a) `runtime/verify/spawn-verify.js:73-177` verifies a decomposition leaf is **structurally admissible** + (for a tdd leaf) **runs its test** — it checks "did the test pass / is the leaf well-formed", not "does claim A follow from premise P". (b) `runtime/contracts/*.contract.json` (e.g. `04-architect.contract.json:92-146`) are **per-persona output-shape checks** (`outputContainsFrontmatter`, `containsKeywords:["Principle Audit"]`, `outputLengthMin`). The real "validation" is **behavioral**: `real-solve.js:22-24,82-90` runs sealed `fail_to_pass`/`pass_to_pass` tests in a sandbox. There is **no premise object, no derivation-soundness check, no scope, no `derived_scope` intersection, no FALSIFY-propagation** anywhere. The §3 data model (`Premise`, `Claim.premises[]`, scope) is **MISSING**. |
| 4 | persistent identity reputation (on disk) → §5 DIRECT/CONSENSUS trust engine | **OVER-CLAIMED** | Reputation IS persisted on disk and per-persona: `reputation/materialize.js:56-101` writes `reputation-snapshot.json` (`evolution-snapshot-read.js:64-69`). But it is a **single flat verdict *distribution*** `{pass,partial,fail}` per persona (`reputation/project.js:33,108-135`), **NOT a DIRECT-vs-CONSENSUS split** (no first-person/earned vs third-party/propagated axis exists). Decay is **display-only** (`recency-decay.js:31`; counts undecayed). **No asymmetric crater** on defection — a `fail` is +1 like a `pass` (`project.js:110`). |
| 5 | ≥2-distinct JOIN (anti credit-laundering) → INV-11 DISJOINT paths "SAME mechanism" | **OVER-CLAIMED** | There is no single "≥2-distinct JOIN"; there are **three** different count-of-2 checks, **none a disjoint-path check**. (a) `lesson-confirm.js:91,99-101` confirmed-by lane: canonical contract is **N=1** edge; "distinctness" = content-address inequality of the delta (`lesson-confirm.js:84-85`), and the header itself flags "byte-distinct != logically-independent" (`lesson-confirm.js:25-29`). (b) `recalibrate.js:114-123` authorship: `authors.size >= 2` keyed on persona identity — but a **completeness check against a known node_id collision**, not independent derivation. (c) `lesson-merge-lift.js:103-106` harden-gate: `distinctNotUs.size < 2` = count of **normalized login *strings***. No check anywhere that two confirming chains share no common ancestor/premise. |
| 6 | persona provenance (built_by/graded_by) → §6.1 premise creator ownership + provenance DAG | **PARTIAL (built_by/graded_by yes; DAG + "creator owns premise" no)** | `built_by` + `graded_by` ARE recorded per artifact: `attribution/recall-graph.js:236-237` (`built_by:{role,roster_name,actor_kind}`, `graded_by:{leg_b,leg_c}`), plus a separate `(node_id,built_by)` authorship ledger (`authorship-store.js:65-78`) and a per-spawn verdict-emission ledger (`verdict-attestation/store.js:210-272`). **But these are explicitly UNAUTHENTICATED labels** ("a faceless `claude -p` actor LABELED with an intended persona … NEVER a trust input", `recall-graph.js:54-58`), and there is **no walkable artifact→premise→grandparent DAG** — the edges are flat single-hop relations. The §6.1 "human creator OWNS the premise + stakes reputation" coupling is **MISSING** (no human, no premise). |
| 7 | source-blind consumer / recalibration → §5 receiver-controlled, advisory consensus | **ACCURATE (as a shadow experiment)** | `persona-consumer/recalibrate.js:76-153` genuinely never reads `source` (`recalibrate.js:13-15`); it re-derives the producer from `node.built_by` (`:48-54,128`) so an attacker-named signal can't pick the persona; it recomputes a per-persona Beta(1,1) posterior over the consumer's OWN outcomes (`:147-148`). Caveat: it runs over a **mock-only** signal lane (`hardening-signal-store.js:40`) and has **no runtime selection wiring**. |
| 8 | deterministic replayable envelope → §7 audit LOG; provenance chain | **ACCURATE (the strongest "free primitive")** | `transaction-record.js` is a content-addressed, hash-chained record model: `computeTransactionId` (`:54-62`, fixed-point sha256 of body-minus-id), `computePostStateHash` (`:119-127`), `computeIdempotencyKey` (`:191-202`), `deriveIdempotencyKey` re-derives from body (`:226-252`). `record-store.js:178-268` appends with S5 integrity-on-write + INV-22 idempotent dedup, and `loadRecordFile:289-313` **verifies content-address on every read**. The chain edge `prev_state_hash → predecessor.post_state_hash` (`record-store.js:16-26`) is a real state hash-chain. This is a true append-only, tamper-evident, replayable ledger — exactly PACT §7 minus the **signature** (see gap). |
| 9 | reputation only via explicit snapshot → §5/§6 separation (volatile trust out of blocking path) | **ACCURATE** | `reputation/project.js` is a pure projection (one ledger read, `:74`); persistence is a separate `materializeSnapshot` (`materialize.js:56-101`); the kernel consumer only **records** the snapshot as an inert axiom field (`spawn-record.js:357`), never gates on it; the advisory gate `reputation-gate.js:58-145` is consulted off the blocking path and has **zero call sites in `packages/runtime`** (`docs/ROADMAP.md:430` confirms wiring deferred). Volatile trust IS out of the blocking path. |
| 10 | pure-function gates, no LLM in blocking path → §3 VALIDATE mechanical/decidable (P1, blocking) | **ACCURATE** | Every blocking `PreToolUse` hook in `hooks.json:48-173` is a deterministic Node script (`config-guard.js`, `validate-no-bare-secrets.js`, `fact-force-gate.js`, `verify-plan-gate.js`, `redirect-plan-mode-in-headless.js`, …). No LLM call sits in any blocking gate. The kernel = pure-function/decidable; the stochastic LLM is the *subject*, never the *gate*. This is the cleanest §11↔code match. |
| 11 | enforced floor / shadow ceiling / best-effort → fail-safe deterministic floor | **ACCURATE** | Explicit three-tier discipline: kernel hooks are "the ONLY enforced layer" (CLAUDE.md); runtime/lab are best-effort/SHADOW. Fail-soft-reader / fail-closed-consumer is load-bearing and real: `record-store.js:31-35,57-58` (a read miss → K9 REJECT, never silent admit). The deterministic floor holds under LLM stochasticity. |

---

## The signing thread (the #273 residual) — verified precisely

§11's GAP note: *"your #273 residual 'store proves integrity not provenance' →
signed/kernel-writer edges = exactly this."* This is the single most important
finding, and it is **already partially built**, in SHADOW:

- **An ed25519 sign/verify primitive EXISTS**: `kernel/_lib/edge-attestation.js`
  — `generateEdgeKeypair` (`:78-84`), `signRecordId`/`verifyRecordSig` over a 64-hex
  content-address (`:113-141`), alg-pinned ed25519 (algorithm-confusion defense
  `:56-64`), canonical-base64 malleability guard (`:48-54`), fail-closed verify
  (`:131-141`). Plus a **trust-domain seam** `resolveSigner(opts)` (`:94-106`) so
  signing can route to a separate-uid broker (Option B) without a call-site edit.
- **A signed-weight minter EXISTS**: `kernel/_lib/weight-minter.js` —
  `mintWeight` signs a tuple that **commits the value** (`:200-222`, INV-MINT),
  recomputed by a pure policy from **kernel-authoritative** inputs only
  (`makeKernelRecordPolicy:129-147`); `verifyMintedWeight` re-derives + verifies
  (`:240-286`), with an opt-in freshness window.
- **HONEST RESIDUAL (verified):** both are **SHADOW** and **same-uid** by default.
  The key is `LOOM_EDGE_SIGNING_KEY` in process env, readable by any same-uid
  caller (`edge-attestation.js:8-19,58-64`) — "honestly Option-A-equivalent". The
  **live** confirmed-by consumer still uses the **unsigned** lane
  (`lesson-confirm.js:104-108`: "do NOT wire authenticatedEdgeIds … until W2
  re-mints the corpus"). So integrity is verified on read everywhere, but
  **provenance is not** — a same-uid writer co-forges a byte-valid record. No
  weight gates an action yet (`weight-minter.js:12-17`).

**This is good news for PACT.** PACT §2's `SIG = sign(src.priv, H(all_above))` and
the "signed/kernel-writer edges" requirement is the same primitive Power Loom is
already incubating. The crypto is built and reviewed; what's missing is **whose key**
and **gating on it** — which is exactly the inter-node problem (below).

---

## Gap-list assessment (§11's "build, not reuse")

### Gap A: intra-node (single trust root) → INTER-node (mutually-untrusting roots) :: needs §1+§2 signed identity

**CONFIRMED — this is the big one, and it is mostly greenfield.** Verified by an
exhaustive crypto-identity sweep of the whole repo:

- **No per-persona/per-agent keypair.** A "persona" is a *string* — `persona-store.js`
  validates `VALID_PERSONA_RE = /^\d{2}-[a-z][a-z0-9-]*$/` (`persona-store.js:62`),
  stores metadata under that name, no KeyObject. `canonical-persona-key.js`
  normalizes the *string* shape. `writer_persona_id` in a transaction-record is a
  **persona-supplied string**, not kernel-attested (`transaction-record.js:191-202`).
- **No human root / scarcity anchor / `human_uid` / `K_root`.** Zero hits in code.
- **No Sybil-resistance / identity-cap (`cap(human_uid)`) mechanism.** Zero code.
- **No PKI / mTLS / x509 / cert** in production code.
- The **only** crypto-identity surface is the two kernel modules above
  (`edge-attestation.js`, `weight-minter.js`), both content-address signers, both
  same-uid, both SHADOW.

So PACT §1 (HumanRoot, Persona keypair, caps) and §2 (the PACT frame with
`SRC_PERSONA (K_pub)`, `parent HUMAN_UID`, `SIG`) are **net-new builds**, but they sit
on a real ed25519 primitive + a real hash-chained log. The "signed identity" gap is
genuine; the cryptographic *toolbox* for it is half-stocked.

### Gap B: reputation DATA non-discriminating → needs live adversarial hardening

**CONFIRMED in the code + the repo's own docs.** The reputation gate is built but
provably non-discriminating on current data: a diagnostic spike literally tests
"do two DISTINCT personas get DIFFERENT recommendations" (`reputation-gate.js`
diagnostic spike), `docs/ROADMAP.md:430` records C7 production-wiring deferred, and
MEMORY.md states "loop does-NOT-discriminate → DATA-is-the-gap". The mechanism
exists (`reputation-gate.js:58-145`, advisory-only, never emits `exclude`); it has
no real adversarial data to discriminate on. PACT Phase 3/5 (U4 patient-sleeper,
live adversarial narrowing) is the same admission.

### Gap C: no Sybil surface (single uid) → appears at inter-node

**CONFIRMED.** Everything runs same-uid; there is one implicit trust root (the dev's
machine). There is no Sybil surface *because* there is no multi-identity surface —
which is exactly why §1 caps + U1 containment only become necessary once a second
mutually-untrusting root exists. Until then there is nothing to cap.

---

## Verdict on the core question

**Is `kernel → runtime → lab` a coherent "single PACT node" you could build the
inter-node layer on top of?  YES — as a node *interior*, with two big asterisks.**

Power Loom is a genuinely strong **P2-grounding-and-audit interior** with a
mechanical P1-style floor. It is NOT yet a PACT node, because a PACT node is defined
by its *boundary* (signed identity + frame), and that boundary is the part that's
greenfield.

### Where the code gives PACT primitives for nearly free

1. **The audit LOG / replayable envelope (row 8, §7)** — the single biggest free
   primitive. A content-addressed, hash-chained, integrity-verified-on-read,
   idempotent append-only store is *done and hardened* (`transaction-record.js` +
   `record-store.js`). PACT §7 is this minus a signature.
2. **The ed25519 signing primitive (the #273 thread)** — `edge-attestation.js` +
   `weight-minter.js` give you sign/verify, alg-pinning, malleability defense,
   fail-closed verify, and a trust-domain seam. PACT §2's `SIG` and §1's signed
   persona keys plug into this.
3. **Pure-function blocking gates with no LLM in the path (row 10, §3 mechanical
   VALIDATE / P1)** — the kernel hook layer is exactly PACT's "machine bears the
   mechanical burden" floor.
4. **Receiver-controlled, source-blind, off-blocking-path advisory reputation
   (rows 7+9, §5 separation)** — the volatile-trust-out-of-blocking-path discipline
   is real and matches I2/INV-6 cleanly (as a shadow experiment).

### Where §11 is over-claiming (do not believe the table)

- **Row 3 "contract verification = VALIDATE (A-given-P) — already premise-bound!"**
  is the worst over-claim. There is **no premise, no claim-DAG, no derivation
  soundness, no scope, no falsify-propagation**. The §3 *data model* is absent;
  what exists is behavioral test-grading + output-shape contracts. The exclamation
  mark is unearned.
- **Row 4 "DIRECT/CONSENSUS trust engine"** — it's a single flat verdict
  distribution. No DIRECT vs CONSENSUS axis, no asymmetric crater, decay is
  cosmetic. The §5 two-score model is *aspired to*, not built.
- **Row 5 "≥2-distinct JOIN = SAME mechanism as INV-11 disjoint paths"** — it's
  three different count-of-2 checks on weak distinctness keys (delta content-hash,
  persona-collision completeness, normalized login string). **None** verifies
  path-disjointness/independence. The repo's own comments admit "byte-distinct !=
  logically-independent". This is the exact L4/INV-11 landmine PACT warns about, and
  Power Loom has NOT solved it.
- **Row 6** — `built_by`/`graded_by` exist but are UNAUTHENTICATED labels with no
  walkable premise DAG and no human-creator-owns-premise coupling.
- **Row 2** — "delta-as-truth" is verified-as-contract-outcome, not premise-bound;
  spirit ACCURATE, "premise" wording OVER-CLAIMED.

### The honest build effort to a first 2-node PACT (2 nodes exchanging authenticated premise-bound claims)

Sequenced against PACT's own Phase 0→1:

1. **PACT Phase 0 — Identity + frame + signed log (the boundary).** *Moderate, not
   greenfield-from-zero.* Reuse `edge-attestation.js` for keypairs/sign/verify and
   `transaction-record.js`+`record-store.js` for the hash-chained log. **Build:**
   a per-persona keypair (today personas are strings), a `HumanRoot` issuance stub
   (pluggable invite/stake per §10), the §2 frame struct (`SRC_PERSONA K_pub`,
   `parent HUMAN_UID`, `PREV_HASH`, `SIG`), the §4 session FSM, and **wire signing
   into the log** (flip the SHADOW `signRecordId` from same-uid env to a
   per-persona key, and gate reads on `verifyRecordSig`). The #273 same-uid residual
   must be closed for two *mutually-untrusting* roots — Option B (separate-uid /
   broker key custody) via the existing `resolveSigner` seam. **Est: the largest
   single chunk, but ~half of it is wiring + key-custody rather than new crypto.**
2. **PACT Phase 1 — Claim/Premise data model + mechanical VALIDATE/FALSIFY.**
   *Mostly greenfield (row 3 is missing).* Build `Premise`/`Claim`/`Scope` types,
   `derivation_sound` (the A-given-P check Power Loom doesn't have), `derived_scope`
   = ∩ ancestral scopes, and FALSIFY downward-propagation over the DAG. The
   hash-chained store can *persist* claims for free, but the premise-binding logic
   is new.
3. **Authenticated premise-bound exchange (the 2-node EXIT).** Combine 1+2: node A
   emits a signed frame whose payload is a `Claim` with premise refs; node B
   `verify(SRC,SIG)` ∧ `chains(PREV_HASH)` ∧ `root_valid(parent)` ∧
   `VALIDATE(claim)`. The transport-integrity half (verify/chain) reuses
   Power Loom primitives directly; the `root_valid` + premise half is new.

**Deferrable to a later phase** (NOT needed for the first 2-node handshake): the
DIRECT/CONSENSUS trust engine (§5, row 4 — rebuild, don't reuse the flat
distribution), disjoint-path CONVERT (§5/INV-11, row 5 — must be built properly,
Power Loom's count-of-2 is not it), CreatorStanding/REACH gating (§6), and identity
caps (§4/§1, gap C — only bites at inter-node scale).

**Bottom line.** Power Loom is a credible **PACT node interior** and a *real* head
start on §7 (audit log) and the §2 `SIG` primitive — those two are close to free.
But §11's table over-sells the P2 engine: the premise/claim data model (§3),
DIRECT/CONSENSUS trust (§5), and genuine disjoint-path verification (INV-11) are
**not** in the code despite the table implying they are. The single hardest and most
load-bearing gap — turning a same-uid SHADOW signer into a per-persona, gating,
mutually-untrusting signed identity — is precisely the repo's own acknowledged #273
residual, and it is the right place to start (PACT Phase 0).
