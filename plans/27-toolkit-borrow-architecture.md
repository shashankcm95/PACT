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
   token `[PACT-REFUSE-ALERT]`; the `class` field distinguishes an ATTACK from a MISCONFIG (the `reason`
   names the specific drop path). Never throws, never gates. **This is Phase 1 + the first PR.**
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
  rejects, of which the content-address-mismatch is the #273 co-forge signal — integrity failures are
  classed separately). Observability infra: NARROWS nothing, HARDENS nothing; report as
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
  as a read-robustness NARROW (NS-9: a same-uid in-process check narrows, it does NOT harden trust); add a
  non-vacuous test (plant an oversize file post-fstat proving the race-close fires). **Do NOT extract a
  shared leaf** the toolkit deliberately refused to share (`join-key-store.js:307` "NOT cross-store-shared")
  — inline a bounded read at each PACT read site, OR explicitly justify unifying PACT's two paths where the
  toolkit's were not.
  - **Phase-2 scope + the NAMED sibling residual (VALIDATE hacker HIGH / auditor MEDIUM, folded).** This
    wave caps `record-store.js loadRecordFile` ONLY (the store's sole record read — `readById` /
    `readByIdempotencyKey` / `listByReceiver` all funnel through it). The SIBLING `audit/audit-log.js:53
    readLeaves` is the SAME bare-`readFileSync` DoS class on an attacker-plantable per-receiver store file
    (`leaves.json`) — a live 200 MB-plant OOM was reproduced against `currentSTH` / `proveInclusion`, and it
    also follows symlinks (no `O_NOFOLLOW`). It is a **NAMED, TRACKED residual** (its own micro-wave =
    Phase 2b), NOT silently dropped: `readLeaves` is genuinely DISTINCT — it fail-CLOSES by THROW (never
    fail-soft null) and the leaf log grows LEGITIMATELY unbounded (an append-only array of ids), so a fixed
    1 MB cap would false-reject a real log (~14k leaves). Phase 2b needs a growth-aware cap (or a streaming
    parse) that PRESERVES the fail-closed-throw contract — its own TDD + VALIDATE, not a rushed in-scope fold.
    (Phase 2b SHIPPED — see the result section below; the chosen mechanism is a generous 64 MB BYTE cap, not a
    leaf-count cap.)
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

## Phase 2 — VALIDATE result (2026-07-01, branch `feat/record-store-size-cap`)

BUILT: `record-store.js loadRecordFile` bare `readFileSync` -> the fd-safe shape (`openSync(O_RDONLY|
O_NOFOLLOW|O_NONBLOCK)` -> `fstatSync` the same fd -> `!isFile` / oversize reject -> `readBoundedText`
cap+1 bounded read -> the EXISTING parse/validate/#273 gates unchanged; fd closed in `finally`). Local
`MAX_RECORD_FILE_BYTES = 1 MB` (NS-11: a local const, never imported UP from `identity/request-auth`).
TDD: 6 new tests (oversize-reject, under-cap non-vacuity, O_NOFOLLOW-symlink-ELOOP, non-regular-dir,
non-regular-FIFO, bounded-read race-proof). Suite: 25 files / 404 pass / 0 fail; eslint clean.

**3-lens VALIDATE (parallel, read-only personas per Rule 3; hacker LIVE-probed per Rule 2a):**

- **code-reviewer -> SHIP.** fd lifecycle, `raw` scoping, `readBoundedText` boundaries (empty / exactly-cap
  / cap+1 / literal-`'null'`), the 1 MB cap, and full contract-preservation all live-verified. One LOW: the
  bounded-read helper duplicates the toolkit's (DELIBERATE per this plan; documented cross-store convention).
- **hacker -> SHIP-WITH-NITS.** 9 live probes; every read-path defense held (200 MB oversize -> 0 MB heap
  reject; hardlink->size-rejected; FIFO->no-hang reject; symlink->ELOOP; unix-socket/deep-nest/empty/
  literal-null -> fail-soft, never throw). Findings folded: HIGH = the audit-log `readLeaves` sibling (see
  the NAMED Phase-2b residual under §4); LOW = `O_NOFOLLOW` guards the FINAL component only (a symlinked
  ancestor is caught in depth by the size-cap + `checkWithinRoot`) -> a durable code comment was added.
- **honesty-auditor -> SHIP-WITH-NITS.** Confirmed the wave delivers the Phase-2 spec, all 6 tests
  non-vacuous, the 256 KB-frame premise holds, NS-11 respected. Findings folded: MEDIUM = the unnamed
  audit-log sibling ("no silent caps") -> now NAMED (§4 Phase-2b); LOW = the "hardening" wording ->
  reworded to a read-robustness NARROW (NS-9) in both the code and §4; LOW = the FIFO-no-hang claim was
  untested -> a guarded FIFO test was added; NIT = the 404/404 count is orchestrator-attested (the auditor
  is read-only).

**Net:** SHIP. A focused, non-vacuous DoS-close of the record-store read path; the sibling audit-log read is
the tracked Phase-2b follow-up. No gate armed; SHADOW; no behavior change for a legit record.

## Phase 2b — VALIDATE result (2026-07-01, branch `feat/audit-log-size-cap`)

BUILT: `audit/audit-log.js readLeaves` bare `readFileSync` -> the fd-safe shape (`open(O_NOFOLLOW|O_NONBLOCK)`
-> `fstat` same fd -> `!isFile`/oversize reject -> `readAllBounded(fd, st.size)` -> existing JSON/shape/hex
checks). This is the sibling of #27 but DIVERGES in three load-bearing ways, each intentional:
(1) **fail-CLOSED by throw** (never fail-soft null) — a present-but-anomalous log THROWS -> caller `{ok:false}`,
NEVER a silent reset to `[]` (which would forge a fresh Merkle root + erase append-only history); only an ABSENT
(ENOENT) log -> `[]`. (2) a **generous 64 MB BYTE cap** (`MAX_AUDIT_LOG_BYTES`) — the leaf log grows LEGITIMATELY,
so a 1 MB cap would false-reject. (3) `readAllBounded` allocates **st.size**, not record-store's `cap+1` — a 64 MB
per-read alloc would be absurd for a tiny log; a grow-after-fstat is bounded to st.size (no OOM), a truncated/grown
body fails JSON.parse. TDD: 8 new tests (2 fail-closed regression guards that were previously UNTESTED, +
oversize/symlink/non-regular/readAllBounded/observability/short-read). Suite: 25 files / 412 pass; eslint clean.

**3-lens VALIDATE (parallel, read-only personas; hacker LIVE-probed per Rule 2a):**

- **hacker -> SHIP.** 11 live probes, ZERO bypasses. The load-bearing invariant HOLDS (the only present-file
  `[]`-return is a well-formed empty log; every anomaly — symlink/FIFO/dir/oversize/zero-byte/EACCES/corrupt —
  throws). Oversize plant fails closed at 96 KB RSS (no OOM); a 3 GB grow-after-fstat reads only st.size (16 KB
  RSS). **Recon-completeness: `readLeaves` WAS the last unbounded attacker-plantable store read — the
  size-cap-before-read CLASS is now CLOSED for both the record + audit stores.** Its 3 LOWs are positive
  verifications / named residuals (below), not defects.
- **code-reviewer -> SHIP-WITH-NITS.** fd lifecycle, ENOENT preservation, readAllBounded (size-fitted, short-read,
  size==0, shrink-after-fstat), the wrap logic all live-verified. MEDIUM (folded): the fail-closed rejects had no
  `refuseAlert` (record-store parity gap) -> WIRED (read-layer `attack`, content-layer `integrity`) + a new
  observability test. LOW (folded): the readAllBounded doc omitted the (safe) shrink case -> added.
- **honesty-auditor -> SHIP-WITH-NITS.** Confirmed fail-closed-throw genuinely preserved across all 5 readers,
  the 64 MB v0-bound + streaming-Merkle v-next residual honestly named, NS-9 respected. Folded: the same
  observability MEDIUM (LOW here); non-regular test made guard-SPECIFIC (`/non-regular file/`); oversize test now
  self-asserts the planted logical size; this plan's "max leaf count" wording -> "byte cap"; the 412/412 count is
  orchestrator-attested (read-only lens). (The CodeRabbit MAJOR — readAllBounded short-read fail-closed — is folded;
  its test is the 8th, taking the suite 411 -> 412.)

**Named residuals (hacker LOW, honest completeness — NOT wave defects):**
- **Per-op read cost of a large-but-valid log** — a valid just-under-cap (64 MB / ~900k-leaf) log costs a bounded
  ~130 MB transient + ~2.5 s per audit op (readAllBounded + parse + merkleRoot on every `currentSTH`/proof). Bounded
  (no OOM), REQUIRED (the log grows legitimately), and the fix is the already-named **streaming Merkle store (v-next)**.
- **Tamper-to-empty is the integrity layer's job, not the read layer's** — a present `{leaves:[]}` is a valid empty
  log; distinguishing it from an attacker who overwrote a populated log with `{leaves:[]}` is the append-only
  integrity layer's job (STH freshness + consistency proofs + cross-node gossip — deferred to the network phase,
  `audit-log.js:16-18`). The read layer's contract (never SILENTLY reset) holds.

**Net:** SHIP. The size-cap-before-read class is CLOSED for both attacker-plantable stores; SHADOW; no gate armed;
a legit log's behavior is unchanged.
