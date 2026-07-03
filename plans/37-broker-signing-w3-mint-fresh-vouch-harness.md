---
lifecycle: persistent
status: VERIFY (architect design-exploration DONE + hacker LIVE-probe) -> TDD build -> VALIDATE (3-lens) -> PR
plan: 37
created: 2026-07-03
depends-on: plans/34 (W0 freshness primitive) ; plans/35 (W1 signed-edge producer -- the DORMANT module this wires) ; plans/36 (W2 read-gate filter) ; plans/30 §5-W0 (the arc scope for this wave) ; the W3 design-exploration architect (this session)
audience: a build session (W3) + the USER (go-ahead gate)
title: broker-signing arc W3 -- the live-edge minting harness (mintFreshVouch; SHADOW/dormant; MECHANISM not provenance)
---

# Plan 37 -- broker-signing W3 (the `identity/` mint-fresh-vouch harness)

> **HONEST-LABELING HEADER (read first).**
> W3 = **plans/30 §5's "W0 -- the live-edge minting harness"** (the arc's internal numbering predates the
> freshness decomposition; my broker-signing W0/W1/W2 = plans/34/35/36). It wires the W1 producer
> (`buildSignedVouchSpec`, currently DORMANT -- no src consumer) into the real mint path: a NEW thin
> `identity/mint-fresh-vouch.js` composes `buildSignedVouchSpec` -> `createMinter(...).mint()` -> a signed,
> freshness-bound VOUCH frame. **SHADOW/dormant** -- nothing in the live `convert`/`read-gate` path mints via it
> (its consumers are the W3 proof test + W4's proof board + the future deploy runbook); a darkness witness proves it.
>
> **It proves the MECHANISM, NOT provenance.** The signer is INJECTED -- a local same-uid keypair for the SHADOW
> test; the cross-uid broker signer only at deploy (NS-7). So a genuinely-fresh VOUCH can be minted, round-trips
> through the real store, PASSES `verifiedRecords` (key-custody at the sig layer), SURVIVES the armed W2 freshness
> window, and is WEIGHTED nonzero at consume when it lies on a me-path -- an INTEGRITY + wiring proof.
> **The co-forge ceiling is UNCHANGED** (integrity != provenance, #273): a same-uid holder mints authentic fresh
> VOUCHes under its OWN key; provenance is real ONLY when the signer routes to a cross-uid boundary at deploy.
> The minted edge lands in a store but **gates nothing** -- `convert.actionable` is hard-false. Per NS-9 this
> NARROWS nothing and HARDENS nothing; it is ready-to-mint plumbing. It does NOT touch the deploy, a uid, /etc, a
> key, or an attestation (NS-7). **"The edge proves WHO signed it" is FALSE in general** (the registry P<->key
> binding is host-writable, plans/30 §2 leg 5) -- W3 proves key-custody of the frame sig ONLY.
>
> **DESIGN settled by the W3 design-exploration architect (this session), all 7 forks decisive.**

## §0 What W3 is (one paragraph)

W3 adds ONE thin, key-free composition module `identity/mint-fresh-vouch.js` exporting
`mintFreshVouch({signer, personaDid, humanUid, targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce})
-> {ok, frame}`. Its whole body: `buildSignedVouchSpec(...)` -> `createMinter({signer, personaDid, humanUid})`
-> `minter.mint(spec)`. **MINT-ONLY** -- no `appendRecord`, no `verifiedRecords` (those are receiver/context-
relative, a different responsibility; they live in the proof). It adds NO new validation (both callees
fail-closed: the minter rejects a non-function signer / a binding override; `buildSignedVouchSpec` rejects
malformed freshness). It changes NOTHING in `minter.js`/`signed-edge.js`/`frame.js`/`convert.js`/`read-gate.js`.

## §1 Runtime Probes (firsthand, this session)

- **claim:** `signed-edge` is DORMANT -- no src module imports it (W3 is its FIRST consumer).
  **probe:** `grep -rln "require(['\"].*signed-edge" v0/src`
  **observed:** no src importers -> DORMANT confirmed (`signed-edge-darkness-witness.test.js` asserts
  `importers == []`, green). W3 evolves that witness to a one-entry allowlist.
- **claim:** the live `convert`/`read-gate` path NEVER mints -- so the harness will be genuinely dormant.
  **probe:** `grep -nE "require\(.*(minter|signed-edge|mint-fresh)" v0/src/trust/convert.js v0/src/trust/read-gate.js`
  **observed:** none. The read/trust path imports no mint producer -> the harness's own witness (`importers == []`)
  holds; nothing live mints via it.
- **claim:** `disjointPaths` counts vertex-disjoint paths FROM `meDid`, so a bare broker->TARGET edge weighs 0;
  a seeded ME->BROKER->TARGET path weighs 1.
  **probe:** Read `convert.js:81-85` (`disjointPaths` -> `maxVertexDisjointPaths(edges, meDid, agentDid)`).
  **observed:** `maxVertexDisjointPaths` sources at `OUT(meDid)`; no path FROM me -> 0. The proof MUST seed
  ME->BROKER (a real signed VOUCH) so the minted BROKER->TARGET edge lies on a counted path.
- **claim:** `createMinter` + `buildSignedVouchSpec` compose -- the spec is a valid mint spec, the minter is
  key-free (injected signer).
  **probe:** Read `minter.js:33-77` + `signed-edge.js` (W1).
  **observed:** `createMinter({signer, personaDid, humanUid}).mint(spec)` binds src/parent + calls `buildFrame`;
  `buildSignedVouchSpec(...)` returns `{type:'VOUCH', payload:{target_persona, freshness}, seq, nonce}` -- exactly
  a `mint` spec. The minter rejects any option beyond `{signer, personaDid, humanUid}` (no raw key path).
- **claim:** `identity/mint-fresh-vouch` importing `identity/` siblings is a LEGAL layer; the reverse-edge is
  already banned.
  **probe:** Read `v0/test/unit/layering.test.js:81-87`.
  **observed:** `offenders('identity', ['trust','grounding'])` must be `[]` -- identity/ sits BELOW trust. The
  harness imports only `identity/signed-edge` + `identity/minter` (siblings); zero reverse edge -> NO new
  assertion, and the existing ban catches a future `mint-fresh-vouch -> trust/` refactor.

## §2 The design -- `v0/src/identity/mint-fresh-vouch.js` (NEW, thin key-free composition)

### 2a -- `mintFreshVouch(opts) -> {ok, frame}`

The whole body (composition only; ~15 LoC + header):

```js
function mintFreshVouch(opts) {
  const { signer, personaDid, humanUid, targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce } = opts || {};
  const spec = buildSignedVouchSpec({ targetPersona, approvedAt, freshnessNonce, keyId, seq, nonce }); // W1 validates
  const minter = createMinter({ signer, personaDid, humanUid });   // key-free; validates signer/binding
  return minter.mint(spec);   // buildFrame folds payload.freshness into record_id; the signer signs it -> {ok, frame}
}
module.exports = { mintFreshVouch };
```

- **`opts || {}`** (mirrors `buildSignedVouchSpec`'s idiom) so a `null`/`undefined` opts degrades to all-undefined ->
  a clean fail-closed TypeError FROM the callee (targetPersona undefined -> `buildSignedVouchSpec` throws), never a
  raw destructure-throw at the harness boundary.
- **PRODUCER convention (may throw, unlike the W2 read-side filter which is total).** A malformed opts propagates
  the callee's TypeError (fail-closed); a `buildFrame` failure returns `{ok:false, reason}` via `mint`. The harness
  adds NO try/catch and NO validation -- both callees are the boundary (SRP; `buildSignedVouchSpec` order FIRST so
  a freshness error surfaces before the minter is constructed).
- **Holds NO key** -- `signer` is an injected custody-boundary fn (createMinter's contract). Key-free by construction.
- **Freshness DI seam (fork 3a):** `approvedAt`/`freshnessNonce`/`keyId` are CALLER params (deploy-sourced at
  deploy; fixture values in the test) -- NEVER hardcoded (a hardcoded `approvedAt` would stamp every edge one time).
  This is the PRODUCER-side deploy constant; it is ORTHOGONAL to W2's READER-side `{now, ttlMs}` (the harness sets
  `payload.freshness.approved_at`; the armed reader sets `now`/`ttlMs`). A genuinely-fresh mint survives the window.

### 2b -- NS-9 framing (do NOT mis-read as harden/provenance/gate)

Three ways W3 could mis-read as a HARDEN, each PREVENTED:
1. If the harness were imported by a live path -> "the trust engine mints provenance." PREVENTED by the §3(ii)
   witness (`importers == []`).
2. If any assertion touched `actionable`/gating -> a gate. PREVENTED: the proof only READS `actionable` to assert
   it stays `false` (`convert.js:142` hard-false).
3. If the plan said "the edge proves who signed it" -> false in general (host-writable registry binding, plans/30
   §2 leg 5). W3 proves key-custody of the frame sig ONLY.

## §3 The darkness-witness cascade (NS-9 dormancy)

- **(i) Evolve `signed-edge-darkness-witness.test.js`** from `deepEqual(importers, [])` to the exact-set one-entry
  allowlist `deepEqual(importers.sort(), ['identity/mint-fresh-vouch.js'])` (`deepEqual`, NEVER `.includes`; keep
  the `(?:\.js)?` bare+extension match). Header: "DORMANT" -> "the W1 producer's SOLE src consumer is the W3 mint
  harness (itself dormant -- its own witness). Any SECOND consumer goes RED." (The `edge-freshness`->`vouch-freshness`
  cascade precedent.)
- **(ii) NEW `mint-fresh-vouch-darkness-witness.test.js`** -- the harness is imported by NOTHING in `src/` (its
  consumers are tests + the future deploy runbook, NOT the live path). `deepEqual(importers, [])`. Non-vacuous
  (module-exists + non-empty src-enumeration preconditions, the L-2 pattern; bare+`.js` match). This is the
  LOAD-BEARING dormancy proof: nothing in the live `convert`/`read-gate`/`disjointPaths` path mints via the harness;
  it goes RED the instant a live-path fold (or the deploy wiring) imports it.

## §4 Layering (NS-11)

`identity/mint-fresh-vouch.js` imports ONLY `identity/signed-edge` + `identity/minter` (same-layer siblings) --
zero reverse edge, zero cycle (it imports nothing from `trust`/`grounding`). Covered by the existing
`offenders('identity', ['trust','grounding'])` ban (`layering.test.js:85`); **NO new layering assertion**. The
build MUST run `layering.test.js` to confirm no accidental reverse edge. Do NOT place the module in `trust/` "for
proximity to convert" -- it is a PRODUCER, it sits BELOW the reader.

## §5 TDD plan (RED first)

`test/integration/mint-fresh-vouch.test.js` -- a reusable me-graph fixture (mirror `freshWorld()`/`threePathWorld()`
from `vouch-freshness-convert.test.js`), factored so W4's negative + apex controls EXTEND it (fork 7). The fixture:
register ME + BROKER + TARGET in ONE registry (each own keypair pub); seed `ME -> BROKER` as a real signed FRESH
VOUCH (via the `freshWorld().vouch` helper); mint `BROKER -> TARGET` via `mintFreshVouch({signer: brokerSigner,
personaDid: BROKER, humanUid: broker-root, targetPersona: TARGET, approvedAt: NOW-1000, freshnessNonce, keyId, ...})`;
append BOTH to ME's store. **Both edges FRESH** so both survive the armed filter (else the path breaks).
**Fixture invariants (VERIFY-hacker LOW):** all freshness nonces `>= MIN_NONCE_LEN (8)` + whitespace-clean (else
`isValidNonce` silently drops the edge as `malformed-freshness` and the legs under-count); register the BROKER
pubkey (item 2 -- else `unregistered-sender`); a persona/signer-key MISMATCH mints fine but DROPS at
`verifiedRecords` (the read gate is the provenance check, NOT the harness -- confirms the NS-9 framing).

1. **mint shape** -- `mintFreshVouch(...).ok === true`; the frame is a VOUCH; `payload.freshness.approved_at`
   present; `computeRecordId(frame) === frame.record_id` (freshness is inside the content-address, Option A).
2. **LEG (a) key-custody** -- the minted edge is IN `verifiedRecords(meCtx.registry, meCtx.storeOpts)` (its sig
   verifies under the registered BROKER key). **Register the BROKER pubkey** (else `unregistered-sender` drop -- a
   misconfig masquerading as a custody fault; the unit-scale analog of §5-W2's `assertBrokerPersona` gate).
3. **LEG (a') survives ARMED freshness** -- `filterFreshVouches(verified, {now:NOW, ttlMs:DAY})` KEEPS the minted
   edge (it is genuinely fresh).
4. **LEG (b) WEIGHTED nonzero** -- `disjointPaths(armedCtx, ME, TARGET) === 1` (the minted edge lies on the seeded
   ME->BROKER->TARGET path).
5. **(b) NON-VACUITY (VERIFY-hacker MEDIUM -- avoid the two false-green fixture shapes)** -- measure INCREMENTALLY
   on the growing store (a distinct store-STATE, NOT a same-store array-drop -- `disjointPaths` ALWAYS re-reads the
   store from disk, so an in-memory "remove the edge" cannot work): append ONLY `ME->BROKER` first -> assert
   `disjointPaths(armed, ME, TARGET) === 0` (no path into TARGET yet); THEN mint + append `BROKER->TARGET` ->
   assert `=== 1`. The `=== 0`-before IS the non-vacuity (the minted edge is LOAD-BEARING to the count). **The
   fixture MUST make the minted `BROKER->TARGET` the SOLE fresh path into TARGET -- NO redundant `ME->X->TARGET`
   path and NO direct `ME->TARGET` vouch** (either weighs 1 WITHOUT the mint = a false green the hacker
   live-reproduced in `04c-falsegreen-fixed.js`).
6. **SHADOW invariant (NS-9)** -- `convert(armedCtx, ME, TARGET).actionable === false` throughout (READ-only, to
   assert SHADOW; never flipped).
7. **CO-FORGE (EXPECTED SHADOW pass)** -- a same-uid attacker registers its OWN persona + mints a genuinely-fresh
   VOUCH under its OWN key (via the harness) -> it ALSO passes `verifiedRecords` + the armed filter + weighs on its
   own seeded path. Asserted as EXPECTED (integrity != provenance; the co-forge ceiling is UNCHANGED), NEVER a hole.
   This is NOT the apex control (W4's control (e) -- "a self-registered attacker does not get broker-EQUIVALENT
   standing" -- a stronger read-side property).
8. **the darkness witnesses (§3)** -- the evolved `signed-edge` one-entry allowlist + the new `mint-fresh-vouch`
   dormancy witness.

**End-to-end flow the proof walks (in order, first test to walk all five with a genuinely minted freshness edge):**
`mintFreshVouch -> appendRecord -> verifiedRecords -> filterFreshVouches(armed) -> disjointPaths`.

## §6 What W3 does NOT do (NS-9)

- Does NOT prove PROVENANCE -- the injected same-uid signer proves the MECHANISM; the co-forge ceiling is unchanged
  (a same-uid holder mints authentic fresh VOUCHes under its own key). Provenance is real only at a cross-uid deploy.
- Does NOT implement the NEGATIVE controls or the APEX control (host `cat` key -> EACCES; foreign-persona -> deny;
  in-process no-key sign -> fail; the self-register-does-not-get-broker-equivalent-standing control (e)) -- those are
  **W4** (the proof board). W3 = the mint harness + its POSITIVE control + the co-forge SHADOW-pass acknowledgment.
- Does NOT `appendRecord`/verify inside the harness (mint-only; those are the proof's job).
- Does NOT gate / flip `actionable` / privilege the broker persona (`disjointPaths` is purely structural -- keep it
  that way so W4's apex control extends the same un-privileged readout).
- Does NOT change `minter.js`/`signed-edge.js`/`frame.js`/`convert.js`/`read-gate.js`, place the module in `trust/`,
  or add a CLI (YAGNI -- the deploy runbook `require()`s the harness).
- Does NOT touch the deploy, a uid, /etc, a key, or an attestation (NS-7).

## §7 Architect design-exploration -- the 7 forks + punch-list (FOLDED)

1. **Harness SHAPE = a NEW src module `identity/mint-fresh-vouch.js`** exporting `mintFreshVouch(opts) -> {ok,
   frame}` (reject test-only -- fails the reuse-by-W4+deploy requirement + muddies the `signed-edge` witness
   cascade; reject CLI -- YAGNI). -- §2a.
2. **MINT-ONLY** (reject mint+append+verify -- those are receiver/context-relative, a different reason-to-change;
   the 5+-param multi-actor smell). Append+verify live in the proof. -- §2a + §5.
3a. **Freshness DI seam = caller params, deploy-sourced, never hardcoded**; orthogonal to W2's reader-side
    `{now,ttlMs}`. -- §2a.
3b. **Positive-control SPLIT = (a) verifiedRecords membership AND (b) `disjointPaths >= 1`**, with the me-graph
    seeding + the (b) NON-VACUITY (drop the minted edge -> dp 0). A zero-weight-but-verified edge must NOT read as
    success. -- §5 items 2-5.
4. **Darkness-witness cascade** -- §3.
5. **SHADOW/NS-9 = MECHANISM not provenance; co-forge ceiling UNCHANGED; three mis-read-as-harden flags** -- §2b + §6.
6. **Layering LEGAL as-is, no new assertion** -- §4.
7. **W3 does NOT do the negative/apex controls (W4)**; the me-graph fixture is factored REUSABLE for W4's control
   (e); the broker persona is NOT privileged in the readout (`disjointPaths` stays structural). -- §5 + §6.

**Punch-list:** (1) `mint-fresh-vouch.js` ~15 LoC composition; (2) header NS-9 (mechanism-not-provenance, co-forge
ceiling, cross-ref `signed-edge.js:14-16`); (3) the proof test with a reusable fixture + the 4 assertions + the
co-forge SHADOW-pass; (4) register the BROKER pubkey (else `unregistered-sender`); (5) evolve the `signed-edge`
witness; (6) new `mint-fresh-vouch` witness; (7) no `layering.test.js` change; (8) register both tests in the
integration runner; (9) keep the fixture reusable for W4 + do NOT privilege the broker persona.

## §8 VERIFY board (pre-build) -- architect design-exploration DONE; hacker LIVE-probe PENDING

- **architect (design-exploration):** all 7 forks settled DECISIVELY (this §7); anti-pattern audit clean
  (god-object / leaky-abstraction / premature-abstraction / false-HARDEN all mitigated). SETTLED.
- **hacker (LIVE-probe) DONE + FOLDED.** Prototyped `mintFreshVouch` (`/tmp/pact-w3-probe/`) requiring the REAL
  `signed-edge`/`minter`, wired into the real `mint -> appendRecord -> verifiedRecords -> filterFreshVouches ->
  disjointPaths` path with genuine ed25519 keypairs. **All 7 vectors HELD; 0 CRITICAL/HIGH:**
  - V1 binding-override smuggle -- **HELD** (stray `src_persona_did`/`srcPersonaDid`/`parent_human_uid`/
    `privateKeyPem`/`payload`/`type` in opts are dropped at the harness's 9-field destructure; never reach the
    callees; `createMinter` ALLOWED-set + `mint` snake+camel override-reject are belt-and-suspenders behind it).
  - V2 key/signer leak -- **HELD** (no function/PEM in the returned frame; `sig` is base64; signer invoked once).
  - V3 non-fresh/malformed -- **HELD** (malformed freshness fails CLOSED at `buildSignedVouchSpec`; a stale
    well-formed edge mints fine + DROPS armed -- W1 correctly does not close a read-side gap).
  - V4 me-graph non-vacuity -- **HELD** (the §5 fixture as specified is non-vacuous: dp=0 without / dp=1 with).
  - V5 co-forge -- **HELD** (a same-uid attacker's own-key fresh vouch passes verify+filter+weight -- EXPECTED
    SHADOW pass; design does NOT block it -> no provenance over-claim).
  - V6 harden/gate/broker-privilege -- **HELD** (a minted broker edge weighs EXACTLY as a plain `buildFrame` edge;
    `disjointPaths` is purely structural; `actionable` stays hard-false).
  - V7 dormancy witness robustness -- **HELD** (the mint-witness regex catches bare AND `.js` planted importers +
    does not false-positive on `mint-fresh-voucher`/`-v2`; the evolved signed-edge allowlist goes RED on a planted
    2nd consumer via `deepEqual`).
  - V8-b (extra) -- a persona/signer-key MISMATCH mints fine but DROPS at `verifiedRecords` (the read gate is the
    provenance check, NOT the harness) -- confirms the NS-9 framing.
  - **NS-9 over-claim check: no drift** (co-forge held OPEN, `actionable` hard-false, key-custody-of-the-sig ONLY).
- **FOLDS applied pre-build:**
  - **MEDIUM (§5 non-vacuity fixture) -> FOLDED into §5-item-5:** the drop-the-edge leg must be a distinct
    store-STATE (INCREMENTAL: dp=0 with only `ME->BROKER`, then dp=1 after minting `BROKER->TARGET`) -- NOT a
    same-store array-drop (`disjointPaths` re-reads the store). The fixture MUST make the minted edge the SOLE
    fresh path into TARGET (no redundant `ME->X->TARGET`, no direct `ME->TARGET` -- both false-green, live-reproduced).
  - **LOW (§5 fixture) -> FOLDED into §5:** nonces `>= MIN_NONCE_LEN (8)` whitespace-clean; BROKER-pubkey
    registration prominent; the persona/key-mismatch-drops-at-read note.
  - **LOW (§3(ii) witness) -> CONFIRMED in-spec:** keep the `fs.existsSync` + non-empty-src preconditions (proven
    necessary -- else the witness disarms on a rename-away).

## §9 VALIDATE result (3-lens, post-build) -- DONE + FOLDED

Ran as a parallel 3-lens workflow over the BUILT harness + proof. **code-reviewer SHIP · hacker (Rule-2a) SHIP ·
honesty-auditor SHIP-WITH-NITS.** All three ran the suite; the code-reviewer + hacker live-probed the built module.

- **code-reviewer (SHIP) -- 0 real findings** (all INFO; a self-retracted LOW). CONFIRMED via live probes:
  the harness is genuinely MINT-ONLY (4 lines, no append/verify/validation); `buildSignedVouchSpec` runs+throws
  BEFORE `createMinter` is constructed (monkey-patched-createMinter probe); `opts || {}` degrades null/undefined to
  a clean callee TypeError (not a raw destructure throw); immutability holds (opts + the returned frame unmutated);
  SRP + no store/registry leak; the incremental non-vacuity is a genuine distinct store-STATE (`disjointPaths`
  re-reads from disk); **both named false-green fixture shapes were empirically reproduced and confirmed ABSENT**
  from the real fixture; `computeRecordId === record_id` is a genuine re-derivation, not a tautology.
- **hacker (Rule-2a, SHIP) -- all 7 vectors HELD via live `/tmp` probes on the BUILT harness; 0 findings.**
  A1 binding-override (two independent layers: the 9-field destructure + createMinter's guards); A2 no key/signer
  in the frame; A3 me-graph non-vacuity GENUINE (dp=0-before on the built fixture; the 0->1 delta is solely the
  harness); A4 co-forge EXPECTED pass correctly framed (no provenance over-claim); A5 a minted broker edge weighs
  EXACTLY as a plain `buildFrame` edge (no broker privilege; `actionable` false); A6 dormancy witnesses robust
  (RED on bare+`.js` planted importers, ignore near-miss, exact-set catches a 2nd signed-edge consumer); A7
  cross-persona spoof dropped at the read gate (the harness mints without provenance; verifiedRecords drops it).
- **honesty-auditor (SHIP-WITH-NITS) -- 5 sensitive claims CONFIRMED non-vacuous; 1 LOW nit FOLDED.**
  Confirmed: leg-b non-vacuity (dp=0-before/dp=1-after, distinct store-state); co-forge asserted as an EXPECTED
  pass never as closed; `actionable` hard-false backed by the hardcoded constant; the darkness-witness cascade
  honest + non-vacuous (both preconditions, exact-set allowlist, transitive dormancy); "mechanism-not-provenance /
  key-custody-of-the-sig ONLY" -- no harden/provenance/gate drift. **Nit FOLDED:** the plan cited a persona/
  signer-key MISMATCH drop (§5 fixture invariant, §8 V8-b) that had NO committed test -- only the UNREGISTERED case
  shipped. Added the wrong-key test: a REGISTERED persona signing with a WRONG key mints fine but DROPS at
  `verifiedRecords` as `sig-verify-failed` (the ATTACK class, DISTINCT from the unregistered-sender misconfig) --
  closing the plan-vs-test gap + strengthening the NS-9 "the read gate is the provenance check, not the harness" proof.

**Post-fold suite:** 44 files · 587/0 (4 proof + 3+3 witnesses + the rest), layering 9/9, eslint clean. No
functional code change from VALIDATE (the harness was SOUND as-built); the only fold is the added wrong-key test.
