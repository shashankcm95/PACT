---
lifecycle: persistent
status: SCOPING -> VERIFY (2-lens architect+hacker) -> TDD build (W0 = the lib/ edge-freshness primitive)
plan: 34
created: 2026-07-02
depends-on: plans/30 (the provenance-HARDEN arc scope -- this RESUMES it, registry-binding blocker cleared by plans/31-33) ; plans/29 (the freshness-leaf design, CC#1/CC#2 -- W0 folds its lib/ freshness primitive) ; plans/32-33 (the sigma_root C1 fail-open + full-type-gate + domain-separation lessons this carries)
audience: a build session (W0) + the USER (go-ahead gate)
title: broker-signing arc W0 -- the lib/ edge-freshness primitive (approvalSigBasis-equivalent, SHADOW/dormant)
---

# Plan 34 -- broker-signing W0 (the `lib/` edge-freshness primitive)

> **HONEST-LABELING HEADER (read first).**
> This is the FIRST build wave of the RESUMED provenance-HARDEN arc (plans/30), whose registry-binding blocker
> cleared with plans/31-33. W0 adds ONE pure `lib/` floor leaf: the freshness-bound signing BASIS (the
> `approvalSigBasis`-equivalent over a generic edge) + a no-env-fallback verify helper. It is **SHADOW and
> DORMANT** -- no producer mints it, no fold reads it, nothing gates on it (a darkness-witness proves nothing in
> `src/` requires it until W1/W2 wire it). Per **NS-9** it NARROWS nothing yet and HARDENS nothing: even fully
> wired, a freshness-bound signed edge proves **INTEGRITY, not PROVENANCE** -- a same-uid host co-forges a
> byte-identical edge by calling the same exported derivation until a **deployed cross-uid signer** removes the
> key from the host's reach (plans/29 §4, plans/30 §4; the #273 family). W0 raises the REPLAY bar (a bare-`record_id`
> edge sig is replayable; a freshness-bound one is not past its TTL) -- the replay residual plans/30 §7 named as
> "must close before gating". It does NOT touch the deploy, which is the USER's act (NS-7).

## §0 What W0 is (one paragraph)

PACT's edge sig today binds the **bare `record_id`** (edge-attestation.js `signRecordId`; no `approvedAt`/nonce),
so a same-uid host can replay a legitimately-signed edge indefinitely (plans/30 §4 replay residual; plans/29 probe
1d). W0 adds the `lib/` floor primitive that the freshness-bound VOUCH (plans/30's recorded edge-shape) needs: a
pure `computeEdgeFreshnessBasis` (the 64-hex the producer will SIGN, binding WHAT + WHEN + a one-shot nonce +
key_id) and a fail-closed `verifyFreshEdge` (the freshness window + the sig-over-basis check, no env fallback). It
re-applies an idiom PACT ALREADY borrowed once from the toolkit's `approval.js` -- the `sthBasis`/`verifySTH`
pattern in `merkle.js` (plans/29 CC#1) -- to a generic edge hash rather than the Merkle STH. It is the dependency
root of the arc: W1 (the `identity/` producer) and W2 (the `read-gate` verify wiring) build on it.

## §1 Runtime Probes (firsthand, this session)

- **claim:** the toolkit's `approvalSigBasis` binds `hash+approvedAt+nonce+key_id` and `verifyApproval` enforces a
  TTL window + non-empty nonce + sig-over-the-basis with `allowEnvFallback:false`.
  **probe:** Read `claude-toolkit/packages/kernel/egress/approval.js:103-177`
  **observed:** `approvalSigBasis` = `sha256(canonicalJsonSerialize({hash,approvedAt,nonce,key_id,...}))`;
  `verifyApproval` returns `{ok:false, reason}` on `no-nonce` (159), `no-approvedAt` (160), `stale-or-future`
  (`now - approvedAt > ttlMs || now < approvedAt`, 161), `sig-invalid` (verifyRecordSig over the BASIS under a
  custody-pinned key, `allowEnvFallback:false`, 173). `DEFAULT_TTL_MS = 24h` (31).
- **claim:** PACT already borrowed this SHAPE once (the STH) -- the primitive is not alien, just applied to a new surface.
  **probe:** Read `PACT/v0/src/lib/merkle.js:212-243`
  **observed:** `sthBasis({root,tree_size,timestamp,nonce})` = `sha256(canonicalJsonSerialize(...))` with the
  in-source comment "BORROWED from the toolkit's approval.js approvalSigBasis"; `verifySTH` shape-gates every field
  then `verifyRecordSig(basisHex, sth.sig, {publicKeyPem})`. No `_type` tag on the STH basis.
- **claim:** the canonical helpers + the no-env-fallback sig leaf already exist on the `lib/` floor.
  **probe:** Read `PACT/v0/src/lib/record.js:24-26` + `PACT/v0/src/lib/edge-attestation.js:53-116`
  **observed:** `sha256hex` + re-exported `canonicalJsonSerialize` (record.js); `verifyRecordSig(recordId, sigB64,
  {publicKeyPem})` loads the key from `opts.publicKeyPem` ONLY (no env default -- fail-closed by construction),
  alg-pinned ed25519, canonical-base64 + 64-byte gate.
- **claim:** NO edge-freshness primitive exists yet -- W0 is net-new (not a duplicate).
  **probe:** `grep -rn 'approvedAt\|freshness\|ttlMs' PACT/v0/src/lib` (the STH aside)
  **observed:** only `merkle.js`/`audit-log.js` carry the STH freshness; no generic-edge freshness basis. The
  `lib/` floor has no `edge-freshness.js`. Confirmed net-new (plans/29 probe 1b/1d).
- **claim:** the always-a-string footgun is real -- an undefined-valued key changes the basis.
  **probe:** Read `claude-toolkit/packages/kernel/egress/approval.js:89-108` (the coerce-or-throw discipline)
  **observed:** "canonicalJsonSerialize emits the LITERAL token `undefined` for an undefined-valued key, so
  undefined, '', and key-absent would be THREE distinct bases"; the toolkit COERCES undefined->'' and THROWS on a
  non-string. W0 pins every field (throw on malformed) so the footgun cannot arise.

## §2 The design -- `v0/src/lib/edge-freshness.js` (NEW, pure floor leaf)

Reuses `sha256hex` + `canonicalJsonSerialize` (record.js) + `verifyRecordSig` (edge-attestation.js) -- all `lib/`
floor, zero reverse edge. Three exports:

### 2a -- `computeEdgeFreshnessBasis({ recordId, approvedAt, nonce, keyId })` -> 64-hex

The content-address the producer will SIGN (via `signRecordId(basis, signerOpts)` at W1). Binds WHAT (`recordId`)
+ WHEN (`approvedAt`) + a one-shot (`nonce`) + the advisory `keyId`.

- **Injective canonical form** (sorted-key quoted JSON, NEVER concat) -- `sha256hex(canonicalJsonSerialize({ _type,
  approved_at, key_id, nonce, record_id }))`.
- **Domain-separation `_type` tag** `'pact.edge.freshness_basis.v1'` (carries the sigma_root NIT-1 lesson, sharper
  than the STH which OMITS one): this basis is ed25519-over-a-64-hex signed by the SAME `signRecordId` as a frame
  `record_id`, a sigma_root binding, AND (once wired) an edge sig -- a cross-protocol signature-reuse surface. The
  `_type` tag domain-separates the HONESTLY-produced preimage so an honestly-built freshness basis is disjoint from
  an honestly-built `record_id` or sigma_root binding -- defense-in-depth ON TOP OF sha256's collision resistance,
  NOT an absolute (a hand-crafted object could be made to collide but is not a reachable protocol message; §7 M-1);
  `.v1` versions the FROZEN preimage so a future field-set change is a clean `.v2`.
- **FULL type-gate on every field** (the sigma_root M1 lesson -- a bare `!v` passes `[]`/`{}`): `recordId` a 64-hex
  (`HEX64.test`), `approvedAt` a finite number (`Number.isFinite`), `nonce` a non-empty string, `keyId` a non-empty
  string. Any malformed field -> `TypeError`. This PINS every field, so the always-a-string footgun (probe 1e)
  cannot arise -- there is no undefined/''/absent ambiguity because absent is a throw.
- **@throws** on any malformed field (mirrors `sigma-root.computeBindingId`). The producer/verify WRAP it.

### 2b -- `checkFreshnessWindow({ approvedAt, nonce, now, ttlMs = DEFAULT_TTL_MS })` -> `{ fresh, reason }`

The PURE freshness/replay predicate (no key, no sig) -- the `verifyApproval` freshness half, extracted so it is
independently testable and reusable by W2's read-gate wiring. NEVER throws. `now` + `ttlMs` INJECTED (no clock
I/O -> deterministic tests). Fail-closed reasons mirror the toolkit: `no-clock` (now not finite), `no-approvedAt`
(not finite), `no-nonce` (empty/blank), `stale-or-future` (`now - approvedAt > ttlMs || now < approvedAt`).
`DEFAULT_TTL_MS = 24h` (matches the toolkit).

### 2c -- `verifyFreshEdge(fields, sig, { publicKeyPem, now, ttlMs })` -> `{ ok, reason }`

> **SIGNATURE SUPERSEDED by §7 architect H-1 (VALIDATE honesty M1):** the SHIPPED signature is a SINGLE options
> object `verifyFreshEdge({ fields, sig, publicKeyPem, now, ttlMs })` (guarded once, destructured inside the try).
> The 3-positional form shown in this header is the PRE-FOLD design; read §7 H-1 + the built `edge-freshness.js`
> for the authoritative shape.

The `verifyApproval`-equivalent: freshness window THEN sig-over-basis. Fail-CLOSED, NEVER throws. Takes
`publicKeyPem` as a PARAM (no registry lookup -- W2's read-gate sources the per-sender key; this stays a pure floor
leaf, exactly as `verifyApproval` takes `verifyKeyPem`).

- **C1 fail-open correction carried from sigma_root W1/W2** (VALIDATE-hacker H-1): read `fields` via a
  destructure-INSIDE-a-try + a positional-arg type-guard, NEVER a signature destructure (`({...} = {})` fires a
  throwing getter OUTSIDE any try -> a consumer swallowing that throw around a pre-truthy pass-flag fails OPEN).
  The WHOLE body is wrapped so ANY throw -> `{ ok:false }`.
- Order: (1) `publicKeyPem` non-empty string else `no-verify-key` (fail-closed BEFORE any derive -- the toolkit H1
  discipline: provenance roots in a custody-pinned key, never ambient); (2) `checkFreshnessWindow` -> if not fresh,
  return its reason; (3) re-derive `computeEdgeFreshnessBasis(fields)` in a try (malformed -> `basis-underivable`);
  (4) `verifyRecordSig(basis, sig, { publicKeyPem })` -> `sig-invalid` on false; (5) `{ ok:true }`.
- **Observability (security.md -- a fail-closed decision must be OBSERVABLE):** the reason-bearing return is the
  observable surface (like `verifyApproval`'s `{ok:false, reason}`); W2's read-gate is where a `refuseAlert` on the
  reject path lands (W0 is a pure predicate -- no emit on the floor, matching `verifyApproval`).

## §3 Layering + dormancy (NS-11 / NS-9)

- **Home: `lib/` floor.** Covered by the existing `lib/`-imports-no-upper-layer ban (layering.test.js:61-64) and
  the precondition non-empty test. **NO new layering assertion needed** (plans/29 §3b) -- `edge-freshness.js`
  imports only `./record` + `./edge-attestation` (both `lib/`), zero reverse edge.
- **Darkness witness (NEW):** `test/integration/edge-freshness-darkness-witness.test.js` -- a computed whole-`src/`
  scan asserting NO module `require`s `edge-freshness` yet (the sigma_root/arming witness pattern: dormant until
  W1/W2 legitimately wire it, at which point THIS going RED is the intended deliberate-update signal). Anchored to
  a `require()` call so a prose mention cannot false-fail.

## §4 TDD plan (RED first -- the failing set IS the spec)

`test/unit/edge-freshness.test.js` (self-contained harness, the PACT convention):

1. **basis binds WHAT+WHEN+nonce+keyId** -- four tests: changing each of `recordId`/`approvedAt`/`nonce`/`keyId`
   changes the basis (non-collision); identical inputs -> identical basis (determinism).
2. **basis is injective / domain-separated** -- the `_type` tag is present in the preimage (a basis can never equal
   a bare `computeRecordId` over a `{record_id,...}` object); canonical (key-order-independent).
3. **full type-gate** -- each malformed field (`recordId` not hex64, `approvedAt` NaN/Infinity/string, `nonce`
   empty, `keyId` empty, `[]`/`{}` for a string field) -> `TypeError` (the M1 non-vacuity: a bare `!v` would pass
   `[]`).
4. **checkFreshnessWindow replay-rejection** -- `stale` (`now - approvedAt > ttlMs`), `future` (`now < approvedAt`),
   `no-nonce`, `no-approvedAt`, `no-clock`; and a fresh case PASSES. TTL boundary (exactly at `ttlMs` = fresh; one
   past = stale).
5. **verifyFreshEdge round-trip** -- sign a basis with a test key (`signRecordId(basis, {privateKeyPem})`) ->
   `verifyFreshEdge` returns `{ok:true}`; a nonce-swap / approvedAt-bump AFTER signing -> `sig-invalid` (the replay
   defense -- the sig binds the basis, so editing any bound field flips it); a wrong verify key -> `sig-invalid`;
   a stale-but-validly-signed edge -> `stale-or-future` (freshness gate fires BEFORE the sig check passes).
6. **verifyFreshEdge fail-closed + never-throws (the C1 apex)** -- `null` fields, a throwing-getter field, a null
   opts, an absent `publicKeyPem` -> `{ok:false}` with a reason, NEVER a throw and NEVER `{ok:true}` (the sigma_root
   C1 poisoned-getter battery, ported: prove the fail-OPEN inversion cannot happen).
7. **darkness witness** (integration) -- nothing in `src/` requires `edge-freshness` yet.

## §5 What W0 does NOT do (NS-9)

- Does NOT sign edges (that is `signRecordId`/the W1 `identity/` producer) -- W0 is basis + freshness + verify only.
- Does NOT wire into `read-gate` (W2) -- it is DORMANT, consumed by nothing (darkness witness).
- Does NOT gate, flip `convert.actionable`, or materialize a weight -- SHADOW (INV-16 untouched).
- Does NOT prove PROVENANCE -- a freshness-bound edge still proves INTEGRITY only; the same-uid co-forge stands
  until the cross-uid deploy (plans/30 §4). W0 **NARROWS** replay (to a <=TTL window; true one-shot enforcement --
  a consume-on-first-use nonce store -- is DEFERRED to the W2 consumer, hacker H2), it does NOT eliminate replay,
  and it does NOT touch co-forge.
- Does NOT touch the deploy, a uid, /etc, a key, or an attestation (NS-7).

## §6 Carried lessons (from the sigma_root W0-W2 waves, this session's snapshot)

- **C1 fail-open inversion** -- the never-throws template is fail-closed for a VERIFIER but inverts to fail-OPEN if
  a control signal is read off an attacker-influenceable path; verify reads fields destructure-inside-try, whole
  body wrapped (§2c).
- **Full type-gate, not `!v`** -- `[]`/`{}` pass a bare truthiness test (§2a, test 3).
- **Domain-separation `_type` tag + `.v1`** -- the cross-protocol sig-reuse defense (§2a); sharper than the STH.
- **Darkness witness for a dormant floor leaf** -- the exact-form dormancy proof (§3), evolvable to a one-entry
  allowlist when W1 legitimately wires it (the arming-witness cascade pattern).

## §7 VERIFY board (2-lens architect + hacker, pre-build) -- FOLDED

**architect SOUND-WITH-CHANGES · hacker SOUND-WITH-CHANGES.** The cryptographic core is sound (the freshness-bound
basis closes the primary replay vector -- editing `approvedAt` after signing flips the sig, hacker A1 PROVEN); the
folds below sharpen the field-read discipline + the honest ceiling. **The folds are AUTHORITATIVE over §2/§4/§5
where they differ** (living-doc overlay, the plans/32-33 pattern). Each maps to a RED test.

### CRITICAL (hacker C1) -- read-twice getter differential (TOCTOU-on-field-read)

A literal §2c reads `fields.approvedAt`/`fields.nonce` TWICE (window check, then basis re-derive). A getter that
returns a fresh value on read 1 and the signed-stale value on read 2 makes a 10-TTL-stale edge verify FRESH
(window sees fresh; basis re-reads the signed value -> sig matches). PROVEN live (`attack3.js`). The borrow source
`approval.js` is safe ONLY because `JSON.parse(String(fileBytes))` (approval.js:145) snapshots first; W0 has no
such boundary.
**FOLD:** `verifyFreshEdge` SNAPSHOTS each field to a primitive-coerced local const EXACTLY ONCE (inside the try,
after the positional-arg guard), then feeds the SNAPSHOTS to both `checkFreshnessWindow` and
`computeEdgeFreshnessBasis` -- `fields.*` is NEVER re-read. Coerce approvedAt via a single read + `Number(...)`
capture; nonce via a single read + `String(...)` capture. RED test: a getter-`approvedAt` edge (window-fresh /
basis-stale) MUST yield `{ok:false}`, and each field getter MUST fire EXACTLY ONCE (count via a spy getter).

### HIGH

- **(architect H-1) collapse to a single options object.** `verifyFreshEdge(fields, sig, opts)`'s 3-positional
  shape diverges from both precedents (`verifyApproval({...})`, `verifySTH(sth, key)`) and leaves `sig`/`opts`
  poisoned-object positions unguarded. **FOLD:** `verifyFreshEdge({ fields, sig, publicKeyPem, now, ttlMs })` --
  ONE options arg, guarded once (`if (!o || typeof o !== 'object') return {ok:false, reason:'no-args'}`), then
  destructure inside the try (the sigma-root.js:74 template). Composes with C1 -- one guarded boundary, then
  snapshot. RED test: a poisoned `opts` getter (on `.publicKeyPem`/`.now`) -> `{ok:false}`.
- **(hacker H1) `ttlMs:Infinity` disables the window.** `now - approvedAt > Infinity` is always false -> every
  stale edge passes. **FOLD:** `checkFreshnessWindow` rejects a non-finite `ttlMs` FAIL-CLOSED (`if
  (!Number.isFinite(ttlMs) || ttlMs <= 0) return {fresh:false, reason:'bad-ttl'}`) -- the guard-non-bypassable
  discipline (security.md). Plus a §2b/§5 note: at the W2 live boundary `ttlMs` is a DEPLOY/kernel CONSTANT, NEVER
  a record/attacker-sourced value. RED test: `ttlMs:Infinity` and `ttlMs:NaN` -> reject.
- **(hacker H2, NS-9) the nonce is not one-shot; replay narrows to <=TTL, not eliminated.** W0 has no nonce store,
  so the identical signed edge replays freely for the whole TTL window. **FOLD:** §0/§5 wording tightened
  (`NARROWS` replay to <=TTL; one-shot enforcement DEFERRED to the W2 consume-on-first-use nonce store) -- DONE in
  §5. RED test: the same edge verifies `{ok:true}` TWICE within TTL (documents the residual, not a bug).

### MEDIUM

- **(hacker M1) nonce-gate drift + no entropy floor.** basis gates `nonce.length === 0`; window gates
  `nonce.trim().length === 0` -> a whitespace nonce is SIGNABLE but UN-verifiable (self-DoS). **FOLD:** unify the
  nonce predicate across basis + window (both reject `trim().length === 0`) and add a minimum-length floor
  (`MIN_NONCE_LEN`, e.g. 8) applied in BOTH so a producer can never mint an edge the verifier rejects. RED test:
  `nonce:'   '` MUST throw in the basis (matching the window); a sub-`MIN_NONCE_LEN` nonce MUST be rejected in both.
- **(architect M-2) pin `checkFreshnessWindow` reason ordering.** **FOLD:** order = `bad-ttl` -> `no-clock`
  (now not finite) -> `no-approvedAt` (not finite) -> `no-nonce` (empty/whitespace/too-short) -> `stale-or-future`,
  matching approval.js:159-161. RED test: two simultaneous defects (non-finite `now` AND empty `nonce`) return the
  FIRST reason (`no-clock`), locking precedence.
- **(hacker M2) strike `allowEnvFallback`.** PACT's `verifyRecordSig` has NO `allowEnvFallback` opt and NO env
  fallback of ANY kind (arity-2, `edge-attestation.js:52-59` reads `opts.publicKeyPem` only) -- the property is
  STRONGER (structural, not flag-gated). **FOLD:** strike `allowEnvFallback:false` from §2c step 4 + probe 1c; the
  build calls `verifyRecordSig(basis, sig, { publicKeyPem })` and states "env-fallback-free by construction".

### LOW

- **(architect M-1) `_type` tag is defense-in-depth, NOT collision-closure.** §2a over-claims "can never collide";
  the real collision resistance is sha256's, and the tag domain-separates the HONESTLY-produced preimage space (the
  sigma-root.js:16-23 wording). **FOLD:** the build header mirrors sigma-root.js:16-23 verbatim in spirit -- the
  tag + the disjoint field set are defense-in-depth on top of sha256 preimage resistance, not an absolute.
- **(architect L-1) supersession note.** This wave supersedes the plans/29 §8-decision Option-B (design-only)
  ruling -- the registry-binding blocker cleared with plans/31-33 and plans/30 §9 + Open Decision 1 (freshness
  default-ON) authorize building the freshness leaf now. **FOLD:** noted here (cheap continuity insurance).
- **(architect L-2) non-vacuous darkness witness.** Model the witness on layering.test.js `filesIn`+precondition:
  enumerate every `src/**/*.js`, assert the count is > 0 (non-vacuity), THEN assert none `require` `edge-freshness`
  -- so an empty scan cannot read as "nothing requires it". **FOLD:** into §4 test 7.
- **(hacker L1) keep the basis try-wrap** -- fields are scalars so the canonical-json depth bound is unreachable via
  the field set, but the §2c try-wrap catches it regardless; the C1 getter-battery covers throw-fail-closed.

### Not-a-change (both lenses)

The always-a-string footgun handling (throw-on-malformed, STRONGER than the toolkit's coerce-to-`''`), the
freshness-fires-before-sig ordering, `publicKeyPem`-as-param (no reverse edge to `registry`), and the SHADOW/
dormant honesty are all confirmed correct as-designed.

## §8 VALIDATE result (3-lens, post-build) -- FOLDED

**code-reviewer APPROVE (0 CRIT/HIGH/MED) · honesty-auditor A / NO-OVERCLAIM · hacker SOUND (0 CRIT/HIGH/MED).**
All three lenses probed the BUILT code (Rule 2a): the hacker ran 8 live probe batteries (C1 read-twice on every
field, forge/proto-pollution/Proxy, replay, domain-collision, canonical-json bounds, coercion-TOCTOU) -- every
VERIFY fold held, nothing exploitable (a `__proto__` false-positive was premise-probed away before reporting). The
code-reviewer + hacker independently confirmed C1 snapshot-once fires exactly ONCE per field including the two the
fold did not name (`recordId`/`keyId`). Full suite green.

### Folds applied (this build)

- **(code-reviewer LOW) nonce gate-value == hash-value.** The basis hashes the RAW nonce while the floor was
  trim-based, so a padded nonce could sign a differently-padded basis than a normalization-assuming caller expects.
  FIXED: `isValidNonce` now requires `v === v.trim()` (whitespace-clean) + the length floor -- gated value equals
  hashed value. Test added (a `'  nonce-0001  '` is rejected in both basis + window).
- **(code-reviewer coverage gap) snapshot-once read-count for ALL fields.** The C1 read-count test instrumented
  only `approvedAt`. Added a success-path test asserting `recordId`/`approvedAt`/`nonce`/`keyId` each fire EXACTLY
  once.
- **(honesty-auditor N1) nonce JSDoc.** "a one-shot (nonce)" -> "the nonce (one-shot ONCE the W2 consume-store
  lands; W0 only BINDS it)" -- removes the enforcement implication.
- **(honesty-auditor M1) §2c stale signature.** Annotated as SUPERSEDED by §7 H-1 (the shipped shape is the single
  options object).

### W2-carry residuals (hacker LOW-1 / LOW-2 -- NOT W0 defects; the security lens's own scoping)

A pure floor leaf must not guess deploy policy, so these are explicit obligations for the W2 read-gate wave, each
needing a RED test THERE:

- **LOW-1 -- `ttlMs` MAGNITUDE.** H1 guards the semantic-poison values (`Infinity`/`NaN`/`<=0` -> `bad-ttl`) but a
  finite-but-astronomical `ttlMs` (`Number.MAX_VALUE`) still neuters the window. BENIGN at W0 (`ttlMs` is a
  deploy/kernel CONSTANT, §2b) -- W2 MUST assert `ttlMs` is sourced from a frozen constant, never record/env, and
  SHOULD add a sane `MAX_TTL_MS` ceiling at the boundary.
- **LOW-2 -- scalar `nonce`/`keyId` LENGTH CEILING.** No upper bound on a scalar field (a 10MB nonce hashes fine ->
  CPU-amplification). W2 length-caps `nonce`/`keyId` at the producer/consumer boundary before signing/verify.
