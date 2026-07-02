---
lifecycle: persistent
status: SCOPING -- awaiting USER go-ahead
plan: 29
created: 2026-07-01
supersedes: none
depends-on: plans/27 (borrow-arc charter, Phase 6 row) ; plans/28 (Phase 5 arming precedent for the "arm-before-code" layering pattern)
audience: the USER (go-ahead gate) + a future build session
phase: PACT borrow-arc Phase 6 -- the LAST borrow-arc phase
title: The freshness-bound AUTHENTICATED-MINTER template (design-only until deployment)
---

# Phase 6 -- the freshness-bound authenticated-minter template (SCOPING)

> **HONEST-LABELING HEADER (read this before anything else).**
> This document is **DESIGN-ONLY** and describes a **SHADOW** build. Everything scoped here
> **gates NOTHING**. Even a fully-built, signed, freshness-bound edge proves **INTEGRITY, NOT
> PROVENANCE** -- a same-uid writer co-forges a byte-indistinguishable edge by calling the same
> exported derivation, until a **deployed cross-uid signer** physically removes the signing key
> from the host uid's reach (NS-2 / NS-7 / OQ-NS-6 / the #273 family; the toolkit's own v3.11 W3
> finding). Per **NS-9**, nothing in this doc reports a NARROW as a hardening/close: a SHADOW build
> NARROWS the forgery bar (in-process co-forge -> key-holder); ONLY a real deployment HARDENS.
> **The build does NOT start on this doc.** This is a scoping deliverable for an explicit USER
> go-ahead. The SHIPPABLE portion is bounded (a template + a verify half + a SHADOW edge record +
> a LOUD residual); any actual provenance unlock is **BLOCKED on a real deployment**.

## §0 What this phase is (one paragraph)

The `plans/27` charter, Phase 6 row (verbatim, `plans/27:172-180`), asks to COMBINE the toolkit's
`kernel/egress/approval.js` freshness/replay half (`computeEmissionHash` + `approvalSigBasis` over
hash+approvedAt+nonce+key_id + `verifyApproval`, no env-fallback key) with PACT's AHEAD
throw-on-raw-key `minter.js`, to yield PACT's deferred authenticated signed-edge minter --
receiver-relative (per-sender-key, `read-gate.js` the home), derived-on-read (the WEIGHT never
materialized, do NOT borrow `reputation/materialize.js`), SHADOW, gating nothing, LOUD residual,
never importing `emit-pr.js`/`gh-emit.js`. Four probed recon lenses (A: PACT minter/verify state;
B: the toolkit borrow source; C: layering/home; D: the integrity-vs-provenance ceiling) confirm the
charter's SHAPE but surface **three corrections** to the charter's framing -- flagged
`[CHARTER CORRECTION]` below. The largest: **PACT is further along than the charter's "PACT lacks
the replay half" implies** -- it already borrowed the toolkit's approval pattern once (for the
Merkle STH).

## §1 Runtime Probes

> **Evidence basis: firsthand -- this session, against the repo NOW** (LENS A/B/C read the PACT +
> toolkit trees in full; LENS D had Bash and ran the grep/Read commands in each `probe` field). A
> probe result decays like a stale line number -- re-probe at point-of-use (PLAN-CONVENTIONS.md:48-50).

The strongest (claim, probe, observed) tuples, carried VERBATIM from the lenses:

### 1a -- PACT's AHEAD half already exists (the throw-on-raw-key minter) [LENS A / LENS D]

- **claim:** minter.js is a throw-on-raw-key authenticated writer that produces signed frames via
  buildFrame, signing ed25519 over the record_id content-address; it holds NO raw key material and
  rejects any option outside {signer,personaDid,humanUid}.
- **probe:** Read `/Users/shashankchandrashekarmurigappa/Documents/PACT/v0/src/identity/minter.js` (full, 79 lines)
- **observed:** createMinter opts ALLOWED Set + extra filter THROWS on privateKeyPem (minter.js:39-43);
  signer must be a function or THROW (44-46); mint() delegates to buildFrame(bound,{signer}) (73);
  binding forced srcPersonaDid=personaDid,parentHumanUid=humanUid (72); returns {mint,personaDid} (76).
  Header lines 8-16: NARROWS not CLOSES integrity!=provenance; custody real only via out-of-band signer.

### 1b -- PACT ALREADY BORROWED the toolkit approval pattern once (for the STH) [LENS A]  `[CHARTER CORRECTION #1]`

- **claim:** PACT ALREADY has a freshness-bound signature (the STH) explicitly borrowed from the
  toolkit's egress approval pattern; but lacks the approval-shaped replay half over a generic edge hash.
- **probe:** Read `/Users/.../PACT/v0/src/lib/merkle.js:205-256` + `/Users/.../PACT/v0/src/audit/audit-log.js:150-239`
  + `/Users/.../claude-toolkit/packages/kernel/egress/approval.js` (full)
- **observed:** sthBasis({root,tree_size,timestamp,nonce}) merkle.js:222-226 comment 216-220 'BORROWED
  from the toolkit's approval.js approvalSigBasis'; verifySTH 234-243; currentSTH nonce=randomBytes(16)
  audit-log.js:177-178, sign fails CLOSED 181. Toolkit approval.js has approvalSigBasis(hash+approvedAt
  +nonce+key_id+lesson_commitment) 88-92 + verifyApproval w/ stale-or-future TTL 138 + allowEnvFallback:false
  150 + #273 body re-derive 141-142 -- the replay half PACT lacks.

### 1c -- the toolkit borrow source is PURE and portable (the freshness/replay half) [LENS B]

- **claim:** verifyApproval is fail-CLOSED with the freshness/replay checks (no-verify-key, hash-mismatch,
  stale-or-future/TTL, no-nonce, body-hash-mismatch, sig-missing/sig-invalid) and NO env-fallback key.
- **probe:** Read approval.js:118-154
- **observed:** verifyApproval returns {ok:false, reason} on each defect: no-requested-hash (119),
  no-clock (120), no-verify-key (126), unparseable (128), hash-mismatch (130), no-nonce (136),
  no-approvedAt (137), stale-or-future TTL check `now-body.approvedAt>ttlMs || now<body.approvedAt` (138),
  body-hash-mismatch via re-derived computeEmissionHash(body.emission) (141-142), sig-missing (148),
  sig-invalid (151). DEFAULT_TTL_MS=24h at approval.js:31. The sig verify at approval.js:150 calls
  verifyRecordSig(basis, body.sig, {publicKeyPem: verifyKeyPem, allowEnvFallback: false}) -- env
  fallback HARD-DISABLED for this gate.

### 1d -- PACT's edge-attestation.js signs the BARE record_id (no freshness) -- the true gap [LENS D]

- **claim:** PACT's edge-attestation.js (the sign leaf) signs the BARE record_id with no approvedAt/nonce
  -- the replay half it lacks vs the toolkit.
- **probe:** Read `/Users/.../PACT/v0/src/lib/edge-attestation.js` lines 87-103 (signRecordId) + 40-49 (no env default)
- **observed:** signRecordId(recordId, opts, body) signs a 64-hex content-address only, no TTL/nonce;
  loadPrivateKey (40-49) 'the ambient env default was REMOVED at P-minter -- no LOOM_EDGE_SIGNING_KEY
  fallback' -- confirms no-env-fallback but also no freshness binding.

### 1e -- read-gate.js is the receiver-relative per-sender-key read chokepoint [LENS A / LENS C]

- **claim:** read-gate.js is the receiver-relative authenticated-read chokepoint; every derived weight
  flows through per-sender sig-verify; receiverId/storeOpts thread to a hashed per-receiver segment.
- **probe:** Read `/Users/.../PACT/v0/src/trust/read-gate.js` (full) + record-store.js (full) + registry.js (full)
- **observed:** verifiedRecords 'the SOLE entry point' (read-gate.js:22-24); verifyRecordSig under sender
  key (48); drops unsigned/unregistered/sig-fail (35-50). storeOpts={receiverId,stateDir} ->
  receiverSegment=sha256(receiverId).slice(0,16) (record-store.js:57-71); lookupPublicKey PER-SENDER no
  shared default (registry.js:37-40). loadRecordFile #273 3-part verify-on-read (record-store.js:156-212).

### 1f -- the derive-on-read norm is established; materialize.js is the anti-pattern [LENS C / LENS B]

- **claim:** the derive-on-read/no-materialized-weight pattern is the established norm (direct.js,
  convert.js, stake-anchor.js are ALL pure folds over verifiedRecords, NONE store a weight);
  reputation/materialize.js MATERIALIZES a snapshot to disk (the do-NOT-borrow).
- **probe:** Read PACT `v0/src/trust/{direct.js,convert.js,stake-anchor.js}` + toolkit `packages/lab/reputation/materialize.js`
- **observed:** direct.js:1-6 'DERIVED-ON-READ (decision #5): a pure fold over the SIG-VERIFIED
  behavioral log ... No mutable trust-edge store'; convert.js:125-137 folds, actionable:false;
  stake-anchor.js:1-2 'NEVER a store, NEVER an oracle'. materialize.js:56-60 materializeSnapshot writes
  the projection via writeAtomicString to the SHARED resolveSnapshotPath() -- a persisted/materialized weight.

### 1g -- the co-forge is LIVE-EXPLOITED, not theory (the ceiling) [LENS D]

- **claim:** PACT's same-uid co-forge is not theory -- it was LIVE-EXPLOITED in the probe (proof-over-theory).
- **probe:** `grep -n co-forge /Users/.../PACT/research/12-feasibility-scalable-transparent-auditable.md`
- **observed:** line 31 'the #273 same-uid co-forge -- LIVE-EXPLOITED in the probe'; lines 72-73 'any
  same-uid caller co-forges a byte-valid record -- live-exploited, it signs a 64-hex id not a persona/human-root'.

### 1h -- no existing signed-edge minter; VOUCH/CONFIRM/CONTEST edge types already flow through read-gate [LENS A]

- **claim:** VOUCH/CONFIRM/CONTEST edge record types already exist as signed frames, flow through
  read-gate, are derived-on-read; NO existing signed-edge/confirmed-by minter exists (Phase 6 is net-new).
- **probe:** `grep VOUCH|CONFIRM|target_persona|target_premise_id` + `grep createMinter|mintEdge|signEdge|confirmedBy|signed.?edge` over PACT v0
- **observed:** VOUCH consumed consensus.js:43 + convert.js:19-24; CONFIRM consumed cross-verify.js:91-96;
  CONTEST consumed direct.js:62-65; all read via verifiedRecords, all SHADOW. Edge-minter grep returned
  ONLY generic createMinter + buildVouchGraph -- no mintEdge/signEdge/confirmedBy. record.js:160-164
  at-most-one target axis discriminant.

### 1i -- the dogfooded brokers did NOT sign live edges (real-unlock mapping) [LENS D]

- **claim:** the dogfooded brokers (R1/R2/R-heap) were non-exfiltration / caller-auth custody-VERIFY runs,
  NOT live-edge-signing; the R-heap broker uid 999 signed only the C3-liveness control and leaves the
  same-uid sign ORACLE open.
- **probe:** `grep -n 'sign|uid|oracle' /Users/.../PACT/docs/deployment/r-heap-run-2026-07-01.md`
- **observed:** line 17 'HARDENS ONE AXIS: the signing key cannot be read from the running broker memory';
  line 25 'an allowlisted same-uid caller can still trigger a SIGN' (R2 oracle OPEN); lines 46,52 the sign
  is only the C3-liveness proof through sudo->pactbroker; line 39 broker pactbroker=999.

## §2 The true delta (what PACT already has vs what Phase 6 adds)

### 2a -- ALREADY PRESENT in PACT (build ON, do not rebuild) [LENS A, confirmed LENS C/D]

1. **The throw-on-raw-key authenticated writer** -- `createMinter` (minter.js:33-77): structural
   no-raw-key, throne-free, signer-only. This IS the charter's "PACT's AHEAD minter.js" half. (Probe 1a.)
2. **The pure crypto floor** -- ed25519 sign/verify with NO env fallback, alg-pinned, malleability-gated
   (edge-attestation.js:87-103, loadPrivateKey 40-49). Charter section 4a "no-env-fallback ->
   ALREADY-SATISFIED". (Probe 1d.)
3. **A freshness-bound signed-tuple pattern ALREADY BORROWED from the toolkit's approval** -- `sthBasis` /
   `verifySTH` over {root,tree_size,timestamp,nonce} (merkle.js:212-243) + `currentSTH`
   (audit-log.js:169-183). The toolkit approval pattern is NOT novel to PACT; it exists for the STH.
   (Probe 1b.) `[CHARTER CORRECTION #1]` -- see below.
4. **The receiver-relative authenticated-read chokepoint** -- `verifiedRecords` (read-gate.js): per-receiver
   store + per-sender verify key; the confirmed HOME. (Probe 1e.)
5. **The edge record TYPES to authenticate** -- VOUCH/CONFIRM/CONTEST already exist as signed frames,
   already flow through read-gate, already derived-on-read (consensus/convert/cross-verify/direct), already
   SHADOW. (Probe 1h.)
6. **#273 verify-on-read (integrity)** -- loadRecordFile 3-part gate (record-store.js:156-212). (Probe 1e.)

### 2b -- what Phase 6 ADDS (the net-new design; the freshness/replay half from LENS B)

A. **A generic-edge `approvalSigBasis`+`verifyApproval` REPLAY HALF** -- the freshness-bound
   (approvedAt/TTL/staleness/one-shot-nonce/key_id) signed basis over an EDGE hash, ported from
   toolkit approval.js:88-154 with no-env-fallback (`allowEnvFallback:false`). PACT has the STH-shaped
   freshness basis but NOT the approval-shaped one over arbitrary edges (the "replay half PACT lacks",
   charter `plans/27:174`). PACT's edge sig today binds the bare record_id only (probe 1d) -- no TTL,
   no one-shot nonce, so a signed edge is replayable. **This is the primary borrow.**
B. **A "deferred authenticated signed-edge minter"** combining (A) with `createMinter` -- a new
   minter/verify layer. NOT a leaf flip: the toolkit's analogous arming arc took 5 PRs (charter
   `plans/27:169-171`).
C. **The verify-half wired INTO read-gate** as an additional per-sender freshness-bound predicate
   (read-gate.js is the home; derived-on-read; WEIGHT never materialized -- do NOT borrow materialize.js).

### 2c `[CHARTER CORRECTION #1]` -- "PACT lacks the replay half" is only HALF true

The charter row (`plans/27:173-174`) frames the borrow as "the replay half PACT lacks." **Probed
reality (LENS A, probe 1b): PACT already borrowed the toolkit's `approvalSigBasis` pattern once -- for
the Merkle STH** (`sthBasis` over {root,tree_size,timestamp,nonce}, merkle.js:216-226, with the
in-source comment "BORROWED from the toolkit's approval.js approvalSigBasis"). So the freshness-bound
signed-tuple SHAPE is already in PACT. What PACT genuinely lacks is the **approval-shaped basis over an
arbitrary EDGE hash** (`hash+approvedAt+nonce+key_id`) wired into the **per-record read gate** -- the STH
freshness lives in the audit-log, NOT in `read-gate.verifiedRecords` (probes 1c, 1d, 1e). The correction
matters for effort: Phase 6 is not introducing an alien pattern; it is re-applying an already-present PACT
idiom to a second surface. The LENS wins over the charter framing.

## §3 Module home + layering decision [LENS C]

### 3a -- the DECISION (pick ONE): three existing homes, NO new top-level layer

| Concern | Home | Why |
|---|---|---|
| The signed-edge **PRODUCER** (mint a freshness-bound edge spec, feed `createMinter().mint()`) | **`identity/`** (e.g. `identity/signed-edge.js`) | Same shape as `stake.js`/`slash.js` -- thin, key-free spec-builders that feed the custody minter (probe: stake.js:8-10, slash.js:7). Already covered by the existing identity ban on `['trust','grounding']`. |
| The **VERIFY/READ** half (freshness + sig check on read) | **`trust/read-gate.js`** (or a `trust/` sibling it delegates to) | `verifiedRecords` is the SOLE authenticated-minter read chokepoint (read-gate.js:22-24); every trust fold already reads through it (probe 1e). |
| The **FRESHNESS PRIMITIVE** (the approvalSigBasis-equivalent replay/TTL/nonce math) | **`lib/`** (beside `edge-attestation.js` / `canonical-json.js`) | Pure crypto/hash over {record_id, approvedAt, nonce, key_id}; no upward import. Consumed by BOTH the `identity/` producer and the `trust/` verifier downward -- the **arm-flags.js P5-W1 precedent** (a shared parse leaf on the floor so neither consumer needs a reverse edge). |

**Rejected alternative (recorded with reason): a dedicated new top-level dir for Phase 6.** LENS C
rejects it: it would require adding an entry to `DAG_LAYERS` (layering.test.js:54) + a source-ban + an
addition to every sink/floor ban list, exactly as P5-W0 did for `independence`. That is disproportionate
(KISS/YAGNI) when `identity/` (producer) + `trust/` (verify) + `lib/` (freshness math) already have legal
edges for all three concerns. **Do NOT add a new dir.**

### 3b -- is a new layering assertion needed (a la P5-W0)?

**No new assertion is required IF the three files land in `identity/`/`trust/`/`lib/`** -- all covered
by existing bans:
- `lib/` is already banned from importing every upper layer (layering.test.js:61-64); a new `lib/` leaf is
  covered, and the precondition non-empty test (L55-59) already asserts `lib/` populated.
- A producer in `identity/` is already banned from `['trust','grounding']` (layering.test.js:81-87) -- a
  `signed-edge.js` in `identity/` cannot reach up into `trust/`; covered.
- `trust/ -> identity/` and `trust/ -> lib/` are both legal (trust bans grounding only, L76); the verify
  wiring in read-gate is covered.

**A new assertion is needed ONLY if the build chooses a dedicated dir (rejected in 3a)** -- in which case
arm the ban PRE-CODE, exactly as `plans/28`/P5-W0 armed the `independence` tripwire before any arming code
existed. Recommendation: no new dir, therefore no new assertion; optionally strengthen the precondition
comment. (Precedent probe: arm-flags.js:1-13 + layering.test.js:89-97.)

### 3c -- reuse, don't rebuild (LENS C)

- Per-sender verify keys: reuse **`identity/registry.js`** (`lookupPublicKey`, PER-SENDER no shared
  default, registry.js:36-40; read-gate.js:41 already calls it). No new registry.
- Per-receiver view: reuse **`record-store.js` `receiverSegment`** (sha256(receiverId).slice(0,16),
  record-store.js:57-71). No new store.

### 3d `[CHARTER CORRECTION #2]` -- read-gate IS the right home, but the FRESHNESS math is NOT

The charter row (`plans/27:175`) says "read-gate.js is the home." Probed reality (LENS C) refines: **read-gate
is the right home for the VERIFY half only.** The freshness PRIMITIVE belongs on the `lib/` floor (so both
the `identity/` producer and the `trust/` verifier import it downward with zero reverse edge -- the arm-flags.js
precedent), and the PRODUCER belongs in `identity/` beside minter.js. "read-gate is the home" is true for
where the weight is DERIVED and where sig+freshness is CHECKED; it is not the home for where the basis is
COMPUTED or where the edge is MINTED. This is a refinement, not a contradiction -- flagged so the build does
not cram all three concerns into read-gate.

## §4 Integrity != provenance ceiling (LOUD) [LENS D]

### 4a -- the exact residual wording the scoping doc carries (NS-9)

> **RESIDUAL (LOUD, NS-2 / #273 / NS-9 -- do NOT report as closed):** Phase 6 ships the
> authenticated-minter TEMPLATE (a throw-on-raw-key minter + a freshness-bound, no-env-fallback verify +
> a SHADOW derived-on-read signed edge). A signed edge proves **INTEGRITY** (self-consistent, sig-verifies
> under the sender's registered key) and **NOT PROVENANCE**. Until a deployed cross-uid signer physically
> removes the signing key from the host uid's reach, a same-uid writer co-forges a byte-indistinguishable
> signed edge by calling the SAME exported derivation (`signRecordId`/`resolveSigner` + `computeRecordId`)
> -- the toolkit's own **v3.11 W3** finding (exported `deriveEdgeId` + a matching sidecar inflated an
> advisory confirmed-weight though every store re-verified on read), and PACT's own #273 co-forge,
> LIVE-EXPLOITED in research/12. This is TOLERABLE ONLY because the derived weight is **SHADOW and gates
> NOTHING** (NS-8); the moment it gates an action, a deployed cross-uid signer (or a kernel-owned writer
> the caller cannot invoke) is MANDATORY -- **a store re-hash is NEVER provenance.**

### 4b -- the v3.11 W3 cross-citation (how PACT inherits exactly this ceiling)

The toolkit found this class first. `kernel/_lib/edge-attestation.js:9-11`: the edge primitive "does NOT
harden trust in any world-anchored sense (OQ-NS-6); it raises the forgery bar from 'anyone who can call the
exported `deriveEdgeId`' (TRIVIAL -- proven live by the CO-FORGE RED-TEST) to 'a holder of the kernel private
key'." The exported derivation is real and importable (lesson-confirm.js:34 destructures `deriveEdgeId`;
lesson-confirm.js:121 gates on it). Codified in the toolkit's own `security.md` as the #273 family's THIRD
face: a forged confirmed-by edge minted via the exported `deriveEdgeId` + a matching sidecar inflated the
advisory confirmed-weight even though every store re-verified on read; tolerable ONLY because the weight was
shadow/advisory and never gated an action. **PACT Phase 6 inherits it identically:** a same-uid co-forger who
calls PACT's exported `signRecordId`/`resolveSigner` + `computeRecordId` mints a byte-valid signed edge that
passes `verifyRecordSig` (read-gate.js:48) and thus contributes to the derived weight (probes 1a, 1e, 1g).

### 4c -- the REAL unlock (OQ-NS-6): deployed cross-uid signer OR kernel-owned writer, NEVER a store re-hash

The real unlock is a DEPLOYMENT property, not more in-process code (PACT-NORTH-STAR.md:151-153): "integrity
!=provenance closes only with a REAL out-of-band custody boundary (separate uid / enclave / HSM) ...
P-minter/P-broker built the MECHANISM; the HARDENING is the deployment." An authenticated minter needs EITHER
a signed record from a deployed cross-uid signer OR a kernel-owned writer the caller cannot invoke -- NEVER a
store re-hash (the exact rule in toolkit approval.js:22-25).

### 4d -- is PACT's already-dogfooded cross-uid broker the eventual signer? [LENS D]  `[CHARTER CORRECTION #3]`

**Answer: it reuses the SAME broker MECHANISM/vehicle, but a Phase-6 provenance unlock requires a NEW
deployment posture that has NOT run.** The charter row implies "a deployed cross-uid signer" as if the arc
already stood one up. Probed reality (LENS D, probe 1i):

- The three single-box custody dogfoods (R1 file-read; R2-WHO caller-auth uid 600; R2-WHAT per-request uid)
  and the 4th R-heap run (broker `pactbroker`=999, multipass VM) were **non-exfiltration / caller-auth
  custody-VERIFY** runs. R-heap proved the signing key cannot be read from the running broker's memory
  (r-heap-run:17); its sign was only the C3-liveness non-vacuity control (r-heap-run:46,52), NOT an edge
  mint into the trust graph. r-heap-run:25 explicitly leaves OPEN "an allowlisted same-uid caller can still
  trigger a SIGN" (the R2 same-uid ORACLE).
- `cross-uid-broker.md:141-144` shows the deployed broker CAN plug into `createMinter({signer,personaDid,
  humanUid})` -- the mechanism exists -- but no deployed instance has been wired to sign the live edges that
  `read-gate.verifiedRecords` weights, out-of-band attested (the `--attested-cross-uid` step,
  cross-uid-broker.md:159-169). The deployed key is noted a "stale pre-R2-WHAT snapshot" (North-Star:56).

So: **Phase 6 REUSES the cross-uid broker VEHICLE (`broker-sign.js` + `broker-launch.crossUidBrokerSigner` +
the sudoers custody boundary), but the eventual signer is a NEW signing-into-the-graph deployment posture --
the dogfooded brokers verified custody, they did not sign live trust-graph edges.** The LENS wins over the
charter's implied framing.

## §5 What ships now vs what is deployment-blocked (the design-only boundary, crisply)

**Ships NOW (all SHADOW, gates NOTHING):**

1. The MINTER API wiring -- PACT's `createMinter` is AHEAD and already throw-on-raw-key (probe 1a); Phase 6
   wires it as the sole edge writer for the new edge.
2. The FRESHNESS-BOUND verify -- borrow the LEAF only (approval.js:88-92 `approvalSigBasis` + the crypto
   leaves; approval.js:118-154 `verifyApproval` SHAPE), with `allowEnvFallback:false` and fail-closed on an
   absent custody pin (approval.js:126,150). NEVER the emit pipeline (charter `plans/27:62`,180).
3. The SHADOW edge RECORD -- a content-addressed signed edge; the WEIGHT is DERIVED-ON-READ via
   `read-gate.verifiedRecords`, never materialized (probe 1f). Do NOT borrow `reputation/materialize.js`.
4. The LOUD residual (section 4a) recorded in-source headers + this plan.

**Deployment-blocked (any ACTUAL provenance/trust unlock):**

- Any claim that a signed edge proves PROVENANCE (blocked by the same-uid co-forge, minter.js:8-11).
- Any weight GATING an action / flipping `convert.actionable` (blocked by NS-8; `convert.js:134` hardcodes
  `actionable:false`, gated on the permanently-WEAK U2 lift-point, North-Star:150).
- The provenance HARDENING itself -- closes only with a deployed cross-uid signer SIGNING live edges +
  out-of-band attestation (section 4c/4d).

**The design-vs-deploy line (one sentence):** Phase 6 ships the authenticated-minter TEMPLATE
(throw-on-raw-key minter + freshness-bound no-env-fallback verify + a SHADOW derived-on-read signed edge)
as a design deliverable NOW and NARROWS the forgery bar (in-process co-forge -> key-holder); the PROVENANCE
HARDENING is a separate, un-scheduled DEPLOY event (a cross-uid broker actually signing the live trust-graph
edges `read-gate.js` weights, on a genuinely separate uid, out-of-band attested) that has NOT happened and is
NOT part of Phase 6.

## §6 Sub-wave decomposition (IF the USER greenlights the SHADOW template)

The honest answer to "is the shippable template worth waves?": **yes, but small** -- 3 thin sub-waves, each
its own go-ahead, mirroring the toolkit's B-arc "arm-before-code" cadence (`plans/27:169-171`, `plans/28`).
If the USER instead prefers "pure design doc, no live crypto until deployment," collapse to **W0 only** (see
Open Decisions). Every wave ships SHADOW, gates NOTHING.

- **W0 -- layering + freshness-primitive floor leaf (`lib/`).** Add the `lib/` freshness primitive
  (`approvalSigBasis`-equivalent: pure sha256 over canonical {record_id, approvedAt, nonce, key_id}) with a
  no-env-fallback verify helper. Covered by existing lib floor-ban; NO new layering assertion needed
  (section 3b) -- confirm the precondition test still passes. TDD: the basis-binds-WHAT+WHEN+nonce test +
  the replay-rejection (TTL/nonce-swap) test. Unconsumed by any decision path (dormant, gates nothing).
- **W1 -- the `identity/` signed-edge PRODUCER.** A thin key-free spec-builder (`identity/signed-edge.js`)
  that binds the freshness fields and feeds `createMinter().mint()`. Same shape as stake.js/slash.js.
  Design decision deferred to build (see Open Decision 4): a NEW edge record TYPE vs an added freshness-bound
  field on an existing VOUCH/CONFIRM -- both slot into read-gate uniformly (LENS A handoff); a new type/field
  needs a `record-schema.json` required[] extension + respects the CONTEST at-most-one-target discriminant
  (record.js:160-164).
- **W2 -- wire the VERIFY half into `read-gate.js`.** Add the per-sender freshness-bound predicate inside
  `verifiedRecords`'s per-record loop (after the existing sig-verify, read-gate.js:48): re-derive the basis,
  verify the sig over the basis under the sender's registered key with `allowEnvFallback:false`, apply the
  TTL/staleness window + non-empty-nonce check. Derived-on-read; nothing materialized. TDD: a co-forge
  RED-TEST (a same-uid-minted edge still PASSES -- documenting the ceiling as an EXPECTED SHADOW behavior,
  NS-9), a stale-edge rejection, a nonce-replay rejection.

**Byte-lock rule (carry from charter `plans/27:159-160`):** if either side hardens canonical-json / INV-22 /
the ed25519 leaf, sync in the SAME wave.

**Named residual, per wave:** the co-forge ceiling (section 4a) -- SHADOW-tolerable, LOUD, not closed.

## §7 What this does NOT do (NS-9)

- Does NOT prove PROVENANCE. A signed edge proves INTEGRITY only until a deployed cross-uid signer exists
  (section 4).
- Does NOT gate any action, flip `convert.actionable`, or arm any weight. Ships SHADOW (probe 1f;
  convert.js:134 stays `actionable:false`).
- Does NOT claim a "per-receiver gate" exists. `mayGate` (weak-flag.js:47) is UNCONSUMED + receiver-AGNOSTIC;
  `convert.actionable` is gated on the permanently-WEAK U2 lift-point (`plans/27:193-202`, North-Star:150).
  Phase 6 names the ACTUAL surface a future gate would guard; it does NOT imply one is armable.
- Does NOT borrow `reputation/materialize.js` (a mutable snapshot-to-disk store; violates NS-5 derived-on-read;
  probe 1f).
- Does NOT import `emit-pr.js` / `gh-emit.js` (the live GitHub emit chokepoint; both confirmed present in the
  toolkit; Phase 6 is a trust-record layer BELOW any emission).
- Does NOT deploy anything, set any flag, run any `--attested-cross-uid`, or touch a cross-uid host. The
  provenance HARDENING is an operator-run DEPLOY event, out of scope here.
- Does NOT report the NARROW (in-process co-forge -> key-holder) as a hardening/close (NS-9).

## §8 Open decisions for the USER

1. **Build the SHADOW template now, or pure design doc?** Option A (recommended default): greenlight the
   3 thin SHADOW sub-waves (section 6) -- live crypto, but gating nothing, NARROWS the bar. Option B: keep
   this as a design-only artifact (W0-only or none), defer ALL live crypto until a real cross-uid signing
   deployment is scheduled. The honest tradeoff: Option A produces a working, testable template but adds
   maintenance surface for a mechanism that HARDENS nothing until deployment; Option B keeps the tree lean
   but leaves the template unbuilt when the deploy day comes.
2. **Reuse the dogfooded cross-uid broker as the eventual signer?** Section 4d establishes the broker VEHICLE
   is reusable but no signing-into-the-graph deployment has run. Decision: when the deploy day comes, wire
   the existing `broker-launch.crossUidBrokerSigner` -> `createMinter` path (cross-uid-broker.md:141-144),
   or stand up a fresh signer? (Not needed for the SHADOW template; needed for the HARDEN event.)
3. **Sequencing vs a real deployment.** Should the SHADOW template ship BEFORE, or be HELD until, a
   cross-uid signing deployment is on the calendar? Shipping first means the verify half is ready to flip;
   holding means no dark mechanism accretes ahead of its unlock.
4. **New edge record TYPE vs an added freshness field on VOUCH/CONFIRM** (a W1 design call, surfaced now for
   USER awareness). Both slot into read-gate uniformly (LENS A). A new type/field extends
   `record-schema.json` required[] and must respect the CONTEST at-most-one-target discriminant
   (record.js:160-164). Defer to build, or decide now?

## §9 Charter corrections summary (the LENS wins over `plans/27`)

- `[CHARTER CORRECTION #1]` (section 2c) -- "PACT lacks the replay half" is only half true: PACT already
  borrowed the toolkit `approvalSigBasis` SHAPE for the STH (probe 1b). The genuine gap is the approval-shaped
  basis over an arbitrary EDGE hash wired into the per-record read gate.
- `[CHARTER CORRECTION #2]` (section 3d) -- "read-gate.js is the home" is true for the VERIFY half only; the
  freshness PRIMITIVE belongs on the `lib/` floor and the PRODUCER in `identity/` (the arm-flags.js precedent),
  else three concerns get crammed into read-gate.
- `[CHARTER CORRECTION #3]` (section 4d) -- the eventual signer reuses the dogfooded broker VEHICLE but is a
  NEW signing-into-the-graph deployment posture; the R1/R2/R-heap dogfoods verified custody, they did not sign
  live trust-graph edges (probe 1i).

## Requirements Checklist

| # | Requirement (from the scoping task) | Disposition |
|---|---|---|
| 1 | YAML frontmatter (status: SCOPING; plan: 29) | ADDRESSED in frontmatter |
| 2 | Honest-labeling header (DESIGN-ONLY / SHADOW / integrity-not-provenance, NS-9) | ADDRESSED in the header block |
| 3 | `## Runtime Probes` with strongest (claim,probe,observed) tuples VERBATIM | ADDRESSED in section 1 (1a-1i) |
| 4 | `## The true delta` (PACT-has [LENS A] vs Phase-6-adds freshness/replay [LENS B]) | ADDRESSED in section 2 (2a/2b/2c) |
| 5 | Module home + layering decision [LENS C], pick ONE, record rejected + reason, note new-assertion need | ADDRESSED in section 3 (3a table, rejected dir, 3b assertion analysis) |
| 6 | `## Integrity != provenance ceiling (LOUD)` with exact residual + v3.11 W3 + real-unlock + broker-is-signer | ADDRESSED in section 4 (4a/4b/4c/4d) |
| 7 | `## What ships now vs what is deployment-blocked` (design-only boundary crisply) | ADDRESSED in section 5 |
| 8 | Sub-wave decomposition IF worth waves, else single design-artifact | ADDRESSED in section 6 (3 thin waves + W0-only fallback) |
| 9 | `## What this does NOT do` (NS-9) | ADDRESSED in section 7 |
| 10 | `## Open decisions for the USER` (build-now-vs-doc; reuse broker; sequencing vs deploy) | ADDRESSED in section 8 (+ 4th: new-type-vs-field) |
| 11 | `[CHARTER CORRECTION]` flags where LENS contradicts charter | ADDRESSED in 2c/3d/4d, summarized in section 9 (3 corrections) |
| 12 | ASCII punctuation only (no em-dashes, no unicode arrows) | ADDRESSED throughout (ASCII `--` and `->` only) |
| 13 | Ground every factual statement in a lens probe | ADDRESSED (each claim cites a probe 1a-1i or a source line) |
