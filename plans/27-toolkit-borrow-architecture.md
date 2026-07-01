---
lifecycle: persistent
created: 2026-07-01
phase: Toolkit -> PACT borrow architecture — a cross-substrate reconcile plan (Phase 0 through Phase 6). SHADOW-first; no-actor; no-deploy.
status: PLAN (workflow-synthesized + 2-lens adversarial critique folded). Phases 0-4 are low-risk NARROW/enable; Phase 5 (arming) is DARK and warrants its own wave + explicit USER go-ahead; Phase 6 (minter) is design-only until a deployed cross-uid signer.
---

# Toolkit -> PACT borrow architecture

> A cross-substrate reconcile plan. The Power Loom toolkit and PACT are entangled co-evolving
> substrates (the standing directive: borrow BOTH ways, build shared primitives PORTABLE, reconcile
> at POINT-OF-USE — read the impl, never assert from a filename). This plan surveys what the toolkit's
> v3.6-v3.11 + phase-3.2 arc offers PACT, what PACT ALREADY HAS (so nothing is re-built), what PACT
> should hand BACK, and what PACT must NOT borrow. Produced by a 12-agent workflow (5-facet recon ->
> synthesis -> 3-lens design panel -> judge -> 2-lens adversarial critique); both HIGH critique findings
> and the honesty refinements are folded below.

## §0 Honesty carries (apply to EVERY phase)

- **NS-7 / OQ-NS-6** — an in-process/engineered check only NARROWS; only a world-anchored OUT-OF-BAND
  signal (real kernel enforcement / cost / custody) HARDENS. Arming an in-process gate NARROWS; it does
  not harden. The eventual cross-uid DEPLOYMENT is the hardening.
- **NS-9** — a narrowed thing is NEVER reported as closed/hardened.
- **NS-2 / #273** — integrity != provenance != validity. A store re-hash proves integrity, never
  provenance; a same-uid writer can co-forge a byte-indistinguishable record. Provenance needs an
  AUTHENTICATED (signed / kernel-owned / cross-uid) minter.
- **NS-3** — per-receiver, never a global rank or admit-allowlist ("the throne").
- **NS-5** — derived-on-read, no mutable score store.
- **NS-8** — nothing flips `convert.actionable` while U1/U2/provenance-custody are open.
- **NS-11** — the `lib -> atms -> trust -> grounding` DAG stays acyclic.
- **Posture** — SHADOW-first, no-actor, no-deploy. Nothing in this plan flips `convert.actionable`; no
  SHADOW machinery is reported as hardening; the deployment that would actually HARDEN (a real cross-uid
  custody box — cf. the 2026-07-01 R-heap `ptrace_scope=2` live run) is deliberately OUT of this plan's
  scope and is its own future wave requiring explicit USER go-ahead.

## §1 What PACT ALREADY HAS — or is AHEAD on (recon-completeness; do NOT rebuild)

The single biggest finding: PACT is more co-evolved than a naive "copy the new stuff" assumes, and is the
*reference implementation* in several places. Firsthand-confirmed; no wave re-derives these:

| Primitive | PACT location | Note |
|---|---|---|
| Vacuity-gated pure verdict (`assess*(facts) -> {held,vacuous,residuals,checks}`, NO `hardened` field) | `identity/heap-read-probe.js:32-127`, `identity/custody-verify.js:96-101` | PACT is AHEAD — this is the reference CODE for the toolkit's security.md prose. Borrow-BACK candidate. |
| Throw-on-raw-key minter | `identity/minter.js:39-43` (ALLOWED-set structurally throws on a stray `privateKeyPem`) | Stronger than the kernel `edgeSigner` default. Borrow-BACK candidate. |
| No-env-fallback crypto | `lib/edge-attestation.js:9-17` (both `LOOM_EDGE_SIGNING_KEY` + `LOOM_EDGE_VERIFY_KEY` fallbacks removed) | PACT AHEAD (greenfield, no legacy consumers). |
| From-scratch allowlisted subprocess env | `identity/broker-client.js:31,51-60` (`const env={}`, `RESERVED_ENV`) | ALREADY LIVE in the custody mechanism (custody-real only cross-uid per its header). NOT a borrow — a verification residual only. |
| Content-address verify-on-read (3-part #273 gate) | `lib/record-store.js:22-23,124-138` | + `receiverSegment` neutralize (`:46-50`) SIDESTEPS the toolkit's #215 raw-segment trap. Borrow-BACK candidate. |
| Exact-set-not-subset authorization | `identity/caller-auth.js` (`parseAllowlist` — a single malformed entry fails the WHOLE parse) | Matches the toolkit's #273 exact-set discipline. |
| Recompute-bind (verify-the-BODY) at the sign oracle | `identity/request-auth.js:77-125` | Signs `computeRecordId(parsedBody)`, never the caller-asserted id. |
| Strict-enable flag parse | `identity/request-auth.js:35-41` (`parseEnabledFlag`: only `'1'`/`'0'`) | The STRICT half of the asymmetric parse (the lenient deployed-signal half is the Phase-5 gap). |
| Derived-on-read / no-mutable-score-store | `trust/stake-anchor.js`, `trust/convert.js:134` (`actionable:false` INV-16) | NS-3/NS-5/NS-11 as hard invariants. |
| The ONE authenticated-read provenance chokepoint | `trust/read-gate.js:24-34` | Every derived weight flows through sig-verify-under-sender-key. |
| Cross-substrate provenance manifest | `v0/TRANSFER-PROVENANCE.md` | ALREADY carries source-repo + commit + disposition + per-file notes + the canonical-json byte-lock sha. Phase 0 EXTENDS this, does not build it. |

## §2 Antipatterns — must NOT borrow (recorded so no later wave revives them)

- **The global `LIVE_SOURCES` admit-allowlist SEMANTIC** (`lab/world-anchor/weight-source-gate.js`) —
  a global source allowlist violates NS-3 ("the throne") + NS-8. Borrow ONLY the arming HARNESS
  mechanics mapped onto PACT's per-receiver gate; never a `LIVE_SOURCES`-style singleton.
- **The egress kernel / `emitPR` / `gh-emit` deploy pipeline** (`kernel/egress/emit-pr.js`, `gh-emit.js`)
  — actor-egress + a deploy artifact; violates no-actor/no-deploy. Borrow ONLY the alert-emitter LEAF +
  the `approval.js` sig-basis LEAF + the shared crypto leaves; NEVER the pipeline.
- **The materialized reputation snapshot -> spawn-select pipeline** (`lab/reputation`, `lab/circuit-breaker`)
  — a materialized global score is the mutable-score-store NS-5 forbids. If PACT ever needs a down-weight,
  borrow ONLY the narrow-only circuit-breaker DISCIPLINE (monotonic-safety: a forged fail can only
  over-halt, never grant), per-receiver, never materialized.

## §3 The borrow matrix (ranked; value / effort / risk)

**Immediate, low-risk (pure NARROW/observability; near-zero apex risk):**

1. **Fail-closed OBSERVABLE emitter** (`refuse-alert.js`) — high/low/low — `kernel/egress/alert.js`
   (`emitEgressAlert`) -> new `v0/src/lib/refuse-alert.js`. Reconcile: PACT's DENY is NO-ECHO-TO-CALLER
   (anti-oracle), so this is an OUT-OF-BAND operator-side stderr signal the caller's return never carries;
   token `[PACT-REFUSE-ALERT]`; the reason token distinguishes an ATTACK from a MISCONFIG. Never throws,
   never gates. **This is Phase 1 + the first PR.**
2. **Runtime-claim probe as a CODIFIED plan gate** — high/low/low (method) — `workflow.md` Runtime-Claim
   Probe Discipline + verify-plan check #9 -> PACT's plan discipline. Turns PACT's probe REFLEX into a
   pre-approval board FLAG. Phase 3.
3. **Size-cap-before-read** — high/low/**medium** (re-rated per critique) — `kernel/egress/join-key-store.js`
   (`readBoundedText` + the enumerated `readJoinKeyRaw` fd-safe shape) -> `record-store.js loadRecordFile`.
   **Not a drop-in cap** (critique HIGH): PACT's `loadRecordFile:126` uses bare `readFileSync` with no fd —
   the borrow is the WHOLE `open(O_NOFOLLOW|O_NONBLOCK) -> fstat-same-fd -> size-reject -> bounded read`
   shape, a correctness-sensitive rewrite. Phase 2, its OWN focused wave.

**Bidirectional borrow-BACKs (PACT -> toolkit; Phase 4):** the four §1 "PACT AHEAD" primitives —
no-env-fallback crypto default, throw-on-raw-key posture, `receiverSegment` neutralize, and the
vacuity-gated pure-verdict shape.

**The two big-ticket DARK borrows (their own scoping waves + USER go-ahead):**

- **The arming harness** (single-arming-source + asymmetric-flag-parse + both-or-neither coherence) —
  Phase 5. See §4/§5 for the two critique corrections that gate its build.
- **The freshness-bound authenticated-minter template** (the #273 co-forge residual's design) — Phase 6.
  Design-now, deploy-later; SHADOW until a real cross-uid signer.

## §4 Dependency-ordered phases

- **Phase 0 — the extraction contract (EXTEND, not build).** The `v0/TRANSFER-PROVENANCE.md` manifest
  ALREADY exists with source path + commit + disposition + per-file notes + the canonical-json byte-lock
  sha (critique: do not present as from-scratch). Genuinely-new work: add `byte-locked?` /
  `parameterization-seam` / `borrow-direction` / `last-reconciled-sha` columns, and a bidirectional CI
  sha/vector-match check (grep-confirmed absent — the real gap). **Byte-lock split** (critique): VERBATIM
  primitives (canonical-json) get a full-body sha-equality check; DERIVED primitives (INV-22 idempotency,
  ed25519 signing) get OUTPUT-equivalence over shared vectors — a naive sha-equality FALSE-FAILS on the
  legitimately-different derived bodies.
- **Phase 1 — the fail-closed observable emitter.** `refuse-alert.js` + wiring into the SILENT
  fail-closed paths (`read-gate.js` drop-unverified; `record-store.js loadRecordFile` verify-on-read
  rejects — the #273 tamper signal). Observability infra: NARROWS nothing, HARDENS nothing; report as
  "the deny path is now debuggable." **This is the first PR.**
  - **Phase-1 residual (M1, VALIDATE board — deferred, acceptable-for-SHADOW):** the emit is
    un-rate-limited (matching the toolkit's `emitEgressAlert`). `verifiedRecords` / `loadRecordFile` are
    read-hot-path, so a store full of hostile files yields N emits per scan. It is NOT remote-triggerable
    (the frame path does not write the store; only content-address-enforcing `appendRecord` + the audit
    log do — a local store-write foothold the read-gate already assumes, "the store is not a sandbox").
    Per-file layers are mutually exclusive (a `loadRecordFile` reject returns null -> not in
    `listByReceiver`'s output -> `read-gate` never re-sees it), so there is no same-file double-count.
    BEFORE this stream feeds an operator alerting pipeline (a later phase), add per-scan coalescing (one
    `{reason, count}` summary per `verifiedRecords` scan).
- **Phase 2 — size-cap-before-read (the FULL fd-safe shape).** Borrow the whole `readJoinKeyRaw` shape,
  not `readBoundedText` in isolation (critique HIGH). Preserve PACT's fail-soft null-return +
  `receiverSegment` keying; note the O_NOFOLLOW behavioral change (a symlinked record file now refused)
  as an intentional hardening; add a non-vacuous test (plant an oversize file post-fstat proving the
  race-close fires). **Do NOT extract a shared leaf** the toolkit deliberately refused to share
  (`join-key-store.js:307` "NOT cross-store-shared") — inline a bounded read at each PACT read site, OR
  explicitly justify unifying PACT's two paths where the toolkit's were not.
- **Phase 3 — codify the runtime-claim probe as a plan gate.** Method, not code. Add an inline
  `Probe: <cmd> -> <observed result>` field + a pre-approval FLAG. PACT's highest-value probe-class is the
  deployed-module-sha-match (live dogfoods run against separately-deployed brokers). Advisory-strong, not a
  hard blocker (critique LOW: PACT already probes per-wave).
- **Phase 4 — the bidirectional borrow-BACKs (PACT -> toolkit).** (4a) no-env-fallback crypto — scope
  PRECISELY (critique): name `loadPublicKey` (default `allowEnvFallback:true`, flipping it REGRESSES
  edge/lesson callers) vs `loadSigningKey` (no such param); the safe borrow-back is opt-in-strict for the
  security-sensitive gates, migrate consumers first, leave the final call to the toolkit board. (4b)
  throw-on-raw-key posture -> the kernel `edgeSigner` seam. Plus `receiverSegment` neutralize + the
  vacuity-gated verdict shape as borrow-BACK rows. **Byte-lock rule:** when EITHER side hardens
  canonical-json / INV-22 / the ed25519 leaf, sync the other IN THE SAME WAVE (Phase 0's CI check).
- **Phase 5 — the arming harness (DARK; its OWN wave + USER go-ahead).** Extract an `arming` module
  parameterized over `(flagName, gatePredicate)` from `lab/_lib/world-anchor-arming.js`: (5a)
  single-arming-source (the SOLE reader/parser — collapse PACT's split-brain re-reads of
  `PACT_BROKER_REQUIRE_FRAME`/`PERSONA_DID`/`ALLOWED_UIDS` behind one predicate; REUSE the existing strict
  `parseEnabledFlag`); (5b) the LENIENT deployed-signal predicate PACT lacks (`host-claude-guard.js:82-88`
  `isDeployFlagSet` + the `world-anchor-arming.js:47-49` misconfig emit) — an operator typo fails CLOSED +
  a misconfig alert through `refuse-alert`; add typo/garbage-token FUZZING to the VALIDATE-hacker lens
  (PACT's env fuzzes sweep VALID tokens only — the #430 blind spot); (5c) both-or-neither coherence
  preflight (DI-inject the sibling arm as a param). **Re-rated HIGH effort / MEDIUM-HIGH risk** (critique):
  the toolkit's arming arc took 5 PRs (B1-B5) + an item-8 scoping wave; `custody-arming.js` fans into 4
  modules. Decompose into B1-B5-style sub-waves. Ships DARK; arming NARROWS, does not harden.
- **Phase 6 — the freshness-bound authenticated-minter template (design-only until deployment).**
  `kernel/egress/approval.js` (`computeEmissionHash` + `approvalSigBasis` over hash+approvedAt+nonce+key_id
  + `verifyApproval`, no env-fallback key — the replay half PACT lacks) COMBINED with PACT's AHEAD
  throw-on-raw-key `minter.js` -> PACT's deferred authenticated signed-edge minter. Receiver-relative
  (per-sender-key, `read-gate.js` is the home); derived-on-read (the edge is a content-addressed record;
  the WEIGHT is derived, never materialized — do NOT borrow `reputation/materialize.js`). Even a signed
  edge proves INTEGRITY not PROVENANCE until a deployed cross-uid signer (a same-uid writer co-forges via
  the same exported derivation — the toolkit's own v3.11 W3 finding); ships SHADOW, gates NOTHING, residual
  reported LOUD. NEVER import `emit-pr.js`/`gh-emit.js`.

## §5 The two HIGH critique corrections (folded; gate the Phase-5 build)

- **The NS-11 acyclic-DAG safety net does NOT exist as assumed.** `v0/test/unit/layering.test.js` has NO
  assertion for what `independence/` may import (it appears only as a *banned target* elsewhere). An
  `independence/arming.js` reaching UP into `identity/` (caller-auth/request-auth for the coherence
  preflight) would NOT be caught. **Fix (Phase-0 prerequisite for Phase 5):** ADD an
  `offenders('independence', ['trust','grounding','identity','frame','atms'])` assertion to
  `layering.test.js` so the tripwire actually exists; then decide `arming.js`'s home — either a new
  foundational leaf that only `lib/` depends on (inject ALL cross-layer arm signals as params, strict DI),
  OR place the coherence gate in `trust/` (which may legally import `identity/`, as `read-gate.js` does)
  and keep only the pure single-flag parser in a leaf.
- **`mayGate` and `convert.actionable` are DECOUPLED — "per-receiver mayGate" names a nonexistent
  construct.** `independence/weak-flag.js:47` `mayGate` is UNCONSUMED (only tests call it), takes a
  caller-asserted `{highStakes}`, and refuses on the GLOBAL `epistemicIndependence()==='WEAK'` lift-point —
  it is receiver-AGNOSTIC. `trust/convert.js:134` hardcodes `actionable:false` and never calls `mayGate`.
  Receiver-relativity lives in the `storeOpts.receiverId` selector threaded through
  `read-gate.verifiedRecords` / `stake-anchor.stakeOf`, NOT in `mayGate`. **Fix:** Phase 5 must name the
  ACTUAL surface a future gate guards — (1) `mayGate` (but receiver-scoping is NEW work, not a borrow), or
  (2) `convert.actionable` (gated on the `epistemicIndependence()` lift-point — cannot arm until U2 is
  solved, so the harness is even DARKER than drawn). Add a Runtime Probe citing `convert.js:134` /
  `weak-flag.js:47`.

## §6 Sequencing + the first PR

Dependency graph: **Phase 0** (contract) -> {**Phase 1** (emitter), **Phase 4** (borrow-backs)} in parallel
-> **Phase 2** (size-cap, needs Phase 1's alert) + **Phase 3** (probe-gate, method) -> **Phase 5** (arming,
DARK — own scoping pass + USER go-ahead; needs Phase 1's misconfig-emit + Phase 3's probe-gate) -> **Phase 6**
(minter template — design-only until the cross-uid deployment).

Phases 0/1/3/4 are pure NARROW/enable with near-zero apex risk. Phase 2 is a focused correctness wave.
Phase 5 is DARK infrastructure (its own waves). Phase 6 is a design deliverable now, a deployed hardening
later.

**The first PR (this branch) = Phase 1 only:** `refuse-alert.js` + wiring into `read-gate.js` +
`record-store.js loadRecordFile` + tests. Observability infra; no behavior change; no gate armed.
