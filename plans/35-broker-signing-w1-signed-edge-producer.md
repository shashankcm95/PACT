---
lifecycle: persistent
status: VERIFY (architect design-exploration + hacker) -> TDD build -> VALIDATE (3-lens, folded) -> PR
plan: 35
created: 2026-07-02
depends-on: plans/34 (W0 -- the edge-freshness primitive this consumes) ; plans/29/30 (the arc scope + Open Decisions) ; the W1 design-exploration architect (Option A, this session)
audience: a build session (W1) + the USER (go-ahead gate)
title: broker-signing arc W1 -- the identity/ signed-edge producer (freshness-IN-body VOUCH, SHADOW/dormant)
---

# Plan 35 -- broker-signing W1 (the `identity/` signed-edge producer)

> **HONEST-LABELING HEADER (read first).**
> W1 adds ONE thin, KEY-FREE spec-builder (`identity/signed-edge.js`, the `stake.js` shape) that binds the W0
> freshness fields INTO a VOUCH frame body and feeds `createMinter().mint()`. **SHADOW/dormant** -- no fold
> consumes a freshness-bound VOUCH yet (W2 wires the read side). Per **NS-9** it NARROWS nothing yet and HARDENS
> nothing: a freshness-bound edge proves **INTEGRITY, not PROVENANCE** -- a same-uid host co-forges a
> byte-identical fresh edge via the same custody signer until the cross-uid deploy (#273 family; the co-forge
> ceiling is UNCHANGED by W1). It does NOT touch the deploy (NS-7).
>
> **DESIGN = Option A (freshness-IN-body), settled by the W1 design-exploration architect.** The frame model
> already signs `record_id` over the whole body, so freshness-in-`payload` is bound + authenticated by the
> EXISTING `signRecordId(record_id, {signer})` (frame.js:60) and the EXISTING `verifyRecordSig` at read-gate.js:48.
> W2 adds ONLY `checkFreshnessWindow` -- NO second signature.
>
> **LOAD-BEARING W0 finding (USER-ratified: mark-dormant):** because Option A binds freshness via the frame sig
> over `record_id`, W0's `computeEdgeFreshnessBasis` + `verifyFreshEdge` (the basis-sig half) are **VESTIGIAL for
> the VOUCH path** -- only `checkFreshnessWindow` is used. The toolkit `approvalSigBasis` idiom transferred
> structurally but was over-applied (PACT's edge IS a frame, which already signs its content-address; egress's
> approval was a SEPARATE object with no pre-existing sig). W1 MARKS the two functions DORMANT/no-consumer in the
> `edge-freshness.js` header (keeps them -- byte-lock caution -- retained only against a hypothetical DETACHED-edge
> future); a YAGNI removal review is flagged for arc-close. **W2 is NOT built on them.**

## §0 What W1 is (one paragraph)

The `identity/` signed-edge PRODUCER: a pure, key-free spec-builder that mirrors `stake.js` (plans/20). It returns
a `{type:'VOUCH', payload:{target_persona, freshness:{approved_at, nonce, key_id}}, seq, nonce}` minter spec whose
freshness fields live INSIDE `payload` (Option A). Fed to `createMinter(...).mint(spec)`, the existing `buildFrame`
folds `payload.freshness` into `record_id` (frame.js:56) and the custody `signer` signs it (frame.js:60) -- so the
one existing ed25519 signature binds the freshness. It is the first signed-edge producer PACT has (plans/29 probe
1h -- none existed pre-Phase-6). It changes NOTHING in `minter.js`/`frame.js`/`edge-attestation.js`/`record.js`.

## §1 Runtime Probes (firsthand, this session)

- **claim:** `buildFrame` signs the content-address over the WHOLE body, so any `payload` field is bound + authenticated.
  **probe:** Read `frame.js:38-60` + `record.js:52-59` + `read-gate.js:48`
  **observed:** `buildFrame` assembles `body`, `record_id = computeRecordId(withKey)` (excludes only record_id+sig),
  `sig = signRecordId(record_id, signerOpts)`; `read-gate.verifiedRecords` re-verifies `verifyRecordSig(rec.record_id,
  rec.sig, {publicKeyPem})`. A `payload.freshness` sub-object is inside `record_id`, inside the sig, re-verified on read.
- **claim:** the producer can stay KEY-FREE -- signing happens at the existing minter seam, unchanged.
  **probe:** Read `identity/stake.js:23-30` + `minter.js:61-74`
  **observed:** `buildStakeSpec` returns a pure `{type,payload,seq,nonce}`, holds no signer; `minter.mint(spec)` binds
  src/parent + delegates to `buildFrame(bound,{signer})`. The producer computes NO crypto.
- **claim:** freshness-IN-`payload` makes each fresh re-vouch a DISTINCT record; a byte-replay dedups (INV-22).
  **probe:** Read `record.js:103-119` (deriveIdempotencyKey) + `record.js:113` (payload_hash)
  **observed:** `content_hash` folds `payload_hash = sha256(canonical(payload))`; different `approved_at`/`nonce` ->
  different `idempotency_key` (distinct record); identical bytes -> same key -> dedup no-op (record.js:76-78). Correct
  for a replay-resistant VOUCH.
- **claim:** a `payload.freshness` field needs NO `required[]` change (the validator is lenient on unknown props).
  **probe:** Read `record-schema.json:6-7` + `record.js:28-29,135-138`
  **observed:** `required[]` is frame-level only; `validateRecord` enforces `required[]` and is lenient on unknown
  props (forward-compat). Documenting `payload.freshness` under `payload.properties` mirrors `lock_expiry`/`target_stake_id`.
- **claim:** the CONTEST at-most-one-target discriminant is untouched -- a VOUCH carries no target axis.
  **probe:** Read `record.js:160-164` + `convert.js:19-27`
  **observed:** the discriminant gates `payload.target_claim_id` vs `target_premise_id`; a VOUCH keys on
  `payload.target_persona` (convert.js:22), neither target axis. `payload.freshness` adds no target -> discriminant clear.

## §2 The design -- `v0/src/identity/signed-edge.js` (NEW, pure key-free spec-builder)

### 2a -- `buildSignedVouchSpec({ targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce })` -> spec

Returns `{ type: 'VOUCH', payload: { target_persona: targetPersona, freshness: { approved_at: approvedAt, nonce:
freshnessNonce, key_id: keyId } }, seq, nonce }`. PURE, key-free, fail-closed (mirror `stake.js:23-30`):

- **Full type-gate** (throw on malformed, like `buildStakeSpec`): `targetPersona` a non-empty string; `approvedAt`
  a finite number; `freshnessNonce` passes W0's `isValidNonce` (**IMPORT `edge-freshness.{isValidNonce,
  MIN_NONCE_LEN}` -- DRY, do NOT re-implement the floor**); `keyId` a non-empty string; `seq`/`nonce` pass through
  UNVALIDATED (the stake.js producer convention) -- the frame's required[] is enforced on READ by receiveFrame, NOT
  at mint (VALIDATE code-reviewer; see §9). The producer's OWN boundary is the freshness/target fields.
- **Holds NO signer/key** (`stake.js:8-10` invariant). Exports `{ VOUCH_TYPE, buildSignedVouchSpec }`.
- **TWO DISTINCT NONCES (architect flag):** the frame-level `nonce` (INV-22 identity input, frame.js:43) vs
  `payload.freshness.nonce` (the replay one-shot W2's `checkFreshnessWindow` reads). Distinct ROLES; the producer
  MAY set them to the same value, but the plan names both and W2 reads the FRESHNESS one.
  - **TWO-NONCE ROLES (RESOLVED by VERIFY-hacker M1 -- KEEP DISTINCT, do NOT collapse):** the frame-level `nonce`
    is the INV-22 IDENTITY input (record.js:111 -- it drives `idempotency_key`); `payload.freshness.nonce` is the
    REPLAY ONE-SHOT (the W2 consume-on-first-use key). INDEPENDENT by design -- reusing the frame nonce as the
    freshness one-shot would double-duty an identity field (two same-body re-vouches would need different frame
    nonces purely to satisfy freshness, muddying dedup). W2 consumes ONLY `payload.freshness.nonce`; nothing
    cross-checks it against the frame nonce (they MAY differ -- no consumer cares, hacker Attack 4 HELD).

### 2b -- schema doc: `record-schema.json` gains `payload.freshness`

Document `payload.freshness = {approved_at:int, nonce:string, key_id:string}` under `payload.properties` (like
`lock_expiry`, record-schema.json:29). **NO `required[]` change** (frame-level only; the lenient validator accepts
it). A note: `approved_at` epoch ms; `nonce` the replay one-shot (>= `MIN_NONCE_LEN`); consumed by W2's freshness
predicate on read (SHADOW until then).

### 2c -- W0 dormant-marking (the vestigial disposition, USER-ratified)

Add to `edge-freshness.js` header: `computeEdgeFreshnessBasis` + `verifyFreshEdge` are **DORMANT/no current
consumer** under the Option-A design (the VOUCH path binds freshness via the frame sig over `record_id`; only
`checkFreshnessWindow` is consumed). Retained against a hypothetical DETACHED-edge future (a signed freshness tuple
NOT inside a frame); a YAGNI removal review is flagged for arc-close. No behavior change -- a doc-only header note.

## §3 The darkness-witness cascade (NS-9 dormancy)

W1 legitimately WIRES `edge-freshness` (the producer imports `isValidNonce`/`MIN_NONCE_LEN`), so the W0 witness
MUST evolve (the sigma_root/arming cascade pattern):

- **Evolve `edge-freshness-darkness-witness.test.js`** from `assert.deepEqual(importers, [])` to an EXACT-SET
  one-entry allowlist `assert.deepEqual(importers.sort(), ['identity/signed-edge.js'])` (`deepEqual`, NEVER
  `.includes` -- a superset must go RED). The comment records: signed-edge is W0's FIRST + ONLY consumer, itself
  DORMANT (proven below), so the "arms nothing" guarantee holds transitively.
- **NEW `signed-edge-darkness-witness.test.js`** -- signed-edge.js is required by NOTHING in `src/` (no fold mints
  via it yet; W3's harness will). Non-vacuous (module-exists + non-empty-enumeration preconditions, the L-2 pattern).
  Proves the freshness-edge PRODUCER is dormant -> the whole freshness path is SHADOW until W2/W3.

## §4 Layering (NS-11)

- `identity/signed-edge.js` imports ONLY `lib/edge-freshness` (downward, `identity/ -> lib/` legal, plans/29:211)
  -- zero reverse edge. Does NOT import `trust/` (banned). Covered by the existing `identity` ban on
  `['trust','grounding']` (layering.test.js:81-87). **NO new layering assertion.**

## §5 TDD plan (RED first)

`test/unit/signed-edge.test.js`:
1. **spec shape** -- `buildSignedVouchSpec(good)` returns exactly `{type:'VOUCH', payload:{target_persona,
   freshness:{approved_at,nonce,key_id}}, seq, nonce}`; freshness fields nested under `payload.freshness`.
2. **full type-gate** -- each malformed field (`targetPersona` empty/[]/{}, `approvedAt` NaN/Infinity/string,
   `freshnessNonce` empty/whitespace/sub-`MIN_NONCE_LEN`, `keyId` empty/[]) -> `TypeError` (mirror the W0 matrix).
3. **DRY nonce floor** -- `buildSignedVouchSpec` rejects exactly what `isValidNonce` rejects (a shared-floor test:
   a whitespace/short freshnessNonce throws here AND `isValidNonce` returns false -- no drift).
4. **key-free** -- the module exports no signer path; a `privateKeyPem`/`signer` in opts is ignored (spec carries no key).
5. **end-to-end via the real minter** (integration, `test/integration/signed-edge-mint.test.js`): build a spec ->
   `createMinter({signer: a local test signer, personaDid, humanUid}).mint(spec)` -> a frame whose `record_id`
   re-computes over the body INCLUDING `payload.freshness`, and whose `sig` `verifyRecordSig`es; then flip a
   `payload.freshness.approved_at` byte -> `record_id`-mismatch / sig-invalid (the frame sig BINDS freshness -- the
   INTEGRITY-binding proof, NOT provenance; hacker Attack 1 live-RED). Plus: `checkFreshnessWindow` reads
   `payload.freshness.{approved_at,nonce}` and passes/rejects on TTL (the W2 seam previewed, not wired).
6. **darkness witnesses** (§3) -- the evolved W0 exact-set allowlist + the new signed-edge dormancy witness.
7. **DOWNGRADE documenting test (VERIFY-hacker H1 -- the sharpest vector)** -- mint a BARE VOUCH (no
   `payload.freshness`) via the real minter -> assert it (a) passes `receiveFrame` (a valid signed frame) AND (b)
   TODAY yields a `buildVouchGraph` edge UNGATED by freshness (`convert.js:22` keys on `target_persona` only,
   ignores `payload.freshness`). This DOCUMENTS the attacker-REACHABLE downgrade (a same-uid attacker re-mints a
   stale vouch as a bare VOUCH to dodge the TTL) as an EXPECTED-CURRENT gap. **W2 MUST invert it:** the fresh-filter
   DROPS a no-freshness VOUCH -- an AUTHORIZATION POST-CONDITION (`no-freshness => drop`, NEVER `skip-when-absent`,
   the "reject a token missing `exp`" analog). The test carries a comment naming the W2 obligation so the filter is
   not discovered late. (W1 CANNOT close it -- the fix is in `read-gate`/the W2 fresh-filter; W1 pins it.)
8. **co-forge RED-test (NS-9, EXPECTED SHADOW pass)** -- a same-uid attacker with its OWN registered persona mints
   a fresh VOUCH under its OWN key -> it PASSES `receiveFrame` + `checkFreshnessWindow` (integrity != provenance,
   #273; hacker Attack 6 HELD-as-expected). Asserts the pass as EXPECTED (Option A's co-forge ceiling is UNCHANGED),
   never a closed hole.

## §6 What W1 does NOT do (NS-9)

- Does NOT wire freshness into `read-gate` (W2) -- no fold consumes `payload.freshness`; the producer is DORMANT
  (witness). Gates nothing; `convert.actionable` untouched.
- Does NOT prove PROVENANCE -- Option A proves INTEGRITY (the frame sig binds freshness); the same-uid co-forge
  stands until the cross-uid deploy (plans/29:242-252). W1 NARROWS nothing yet (dormant); once W2 applies the
  window on read it NARROWS replay to a `<=TTL` window -- a BOUND, NOT one-shot enforcement (true one-shot needs
  the W2 consume-on-first-use nonce store, deferred; VERIFY-hacker H2). It never "closes" replay.
- Does NOT sign a second time / add a basis-sig -- the frame sig over `record_id` is the ONLY signature (Option A).
- Does NOT change `minter.js`/`frame.js`/`edge-attestation.js`/`record.js` -- if any is touched, the design drifted off A.
- Does NOT touch the deploy, a uid, /etc, a key, or an attestation (NS-7).

## §7 Architect design-exploration -- the 9 MUST-specify items (FOLDED)

The pre-plan architect (this session) settled the fork DECISIVELY. Its 9-item contract, mapped to this plan:

1. **Fork = A** (freshness in `payload.freshness`) -- §0 header + §2a. 2. **W0 basis-sig VESTIGIAL, mark dormant**
(USER-ratified) -- §2c. 3. **FIELD on VOUCH, no new type; no `required[]` change; discriminant untouched** -- §2b +
probe 5. 4. **Producer key-free, `stake.js` shape, imports `edge-freshness.{isValidNonce,MIN_NONCE_LEN}` (DRY)** --
§2a. 5. **Two distinct nonces (frame INV-22 vs freshness one-shot); W2 reads the freshness one** -- §2a + the OPEN
consideration. 6. **INV-22: fresh re-vouch = distinct record, byte-replay dedups; W2 filters freshness BEFORE
`buildVouchGraph`, takes freshest-valid** -- probe 3 + §6 (W2 carry). 7. **W2 seam: `storeOpts` extends `{receiverId,
stateDir}` with injected `{now, ttlMs}` DEPLOY CONSTANTS (never record-sourced); freshness predicate AFTER the
existing sig-verify; no-freshness VOUCH = DROPS-from-fresh-set (an AUTHORIZATION POST-CONDITION `no-freshness =>
drop`, NEVER skip-when-absent -- VERIFY-hacker H1 showed it is ATTACKER-REACHABLE, a deliberate downgrade, NOT a
benign misconfig)** -- recorded as a W2 carry (not built here). 8. **NO change to
minter/frame/edge-attestation/record** -- §6 scope boundary. 9. **Ceiling unchanged (NS-9): integrity not
provenance; the co-forge RED-test is an EXPECTED SHADOW pass; no weight gates** -- §6 + the W2 co-forge test carry.

**W2 carries (recorded, built in W2 not W1):** the `{now, ttlMs}` deploy-constant seam; the freshness predicate
placement; **the DROP-no-freshness authorization post-condition (H1 -- the sharpest, needs a RED test the moment
the filter lands; enabling it drops legacy VOUCHes = a migration consideration)**; the co-forge RED-test; the
distinct-`approved_at` store-growth bound (a per-sender edge cap / GC of past-TTL edges -- hacker M2); the
`targetPersona`/`nonce`/`keyId` length-cap (VALIDATE-hacker LOW: `targetPersona` flows the SAME unbounded
`payload -> record_id -> canonical-json` path as nonce/keyId -- cap all three); PLUS the ttlMs-magnitude ceiling (the
W0 hacker residual). **Note (VALIDATE-hacker informational):** an empty-string FRAME nonce yields a NULL
`idempotency_key` (record.js:111 `!nonce`) so INV-22 dedup is SKIPPED for it -- a `record.js` trait reachable via
any producer; if W2 relies on VOUCH dedup it must handle a NULL-idempotency-key VOUCH deliberately (drop / distinct
path), not assume every VOUCH dedups.

## §8 VERIFY board (pre-build) -- FOLDED

**architect (design-exploration) SETTLED the fork to Option A · hacker SOUND-WITH-CHANGES.** The hacker ran 6 live
probes against the REAL minter/frame/read-gate path: Option A's crypto binding is LIVE-CONFIRMED (Attack 1 -- the
frame sig binds nested `payload.freshness`; tamper -> `record-id-mismatch` -> DROP). Folds applied above:
- **H1 (the sharpest) STRIP/downgrade** -- reclassified from "misconfig" to attacker-reachable downgrade; §5 gains a
  documenting test (7) + the W2 DROP-no-freshness authorization post-condition is pinned (§7 carries). W1 cannot
  close it (read-side); it PINS it so W2 does not miss it.
- **H2 replay wording** -- §6 downgraded "closes REPLAY" -> "NARROWS to a `<=TTL` bound, not one-shot".
- **M1 two-nonce** -- RESOLVED: keep distinct, roles pinned (§2a).
- **M2 approved_at flood** -- added to the W2 store-growth carry (§7).
- **L1** -- §5 item-5 "Option-A proof" -> "INTEGRITY-binding proof, not provenance" + the co-forge RED-test (8).
- **L2 schema-safe** -- HELD (no `required[]` change; `payload.additionalProperties` permissive). Not a finding.

## §9 VALIDATE result (3-lens, post-build) -- FOLDED

**code-reviewer APPROVE-WITH-NITS · honesty-auditor HONEST · hacker (Rule 2a) SOUND.** All three probed the BUILT
producer through the REAL mint -> read-gate path (48/48 across 5 suites). The hacker held field-injection /
prototype-pollution (whitelist field-selection + the minter's exact-set binding guard = defense-in-depth), live-
confirmed the frame sig binds all THREE `payload.freshness` sub-fields, and confirmed the `isValidNonce` export is
0-drift additive. The honesty pass verified every sensitive claim (H1 downgrade, co-forge, W0-dormant) is backed by
a NON-VACUOUS test (grep-confirmed the vestigial W0 fns are genuinely dead). **No functional code change** -- the
producer is SOUND as-built; the folds are doc/comment + plan-carry only:

- **(code-reviewer MEDIUM, resolved by the hacker) seq/nonce JSDoc** -- the JSDoc claimed "the minter/buildFrame
  validate them"; they do NOT (only `receiveFrame` does, on read). The hacker confirmed passthrough is the UNIVERSAL
  producer convention (stake.js identical) and the footgun is fail-closed at receive. FIXED: JSDoc corrected to say
  seq/nonce pass through UNVALIDATED (convention), enforced on READ by receiveFrame -- NOT divergent validation.
- **(code-reviewer LOW) `|| {}` rationale** -- added the stake.js:24 comment.
- **(honesty NIT-1) header self-containment** -- added the `<=TTL`-narrow-not-one-shot replay clause to the header.
- **(hacker LOW) `targetPersona` length-cap** -- added to the W2 length-cap carry (§7; same unbounded path as nonce/keyId).
- **(hacker informational) empty-frame-nonce -> NULL idempotency_key -> dedup-skipped** -- recorded as a W2 note (§7).
- **(code-reviewer LOW) duplicated type-gate helpers** -- LEFT (YAGNI at 2 sites; reviewer explicitly judged premature to extract).
