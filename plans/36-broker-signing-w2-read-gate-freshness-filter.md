---
lifecycle: persistent
status: VERIFY (architect design-exploration DONE + hacker LIVE-probe) -> TDD build -> VALIDATE (3-lens) -> PR
plan: 36
created: 2026-07-02
depends-on: plans/34 (W0 -- checkFreshnessWindow) ; plans/35 (W1 -- the payload.freshness VOUCH producer + the §7 W2-carry list) ; the W2 design-exploration architect (this session)
audience: a build session (W2) + the USER (go-ahead gate)
title: broker-signing arc W2 -- the read-gate freshness filter (disarmed-by-default; the H1 drop-no-freshness authorization post-condition)
---

# Plan 36 -- broker-signing W2 (the read-gate freshness filter)

> **HONEST-LABELING HEADER (read first).**
> W2 inserts a freshness FILTER between the existing sig-verify (`verifiedRecords`) and the structural
> graph-build (`buildVouchGraph`) in the LIVE `disjointPaths` path. The filter is **DISARMED BY DEFAULT**:
> with no `meCtx.freshness` injected (every caller today), it is an **identity pass-through -- byte-identical**
> to the pre-W2 readout. It ARMS only by injecting the deploy-constants `meCtx.freshness = {now, ttlMs}`.
>
> **Even ARMED, W2 only NARROWS the ADVISORY `disjoint_paths` count** (it drops stale + no-freshness VOUCHes,
> so the count can only stay equal or DECREASE -- you can never manufacture a path by removing edges).
> `convert.actionable` stays hard-false (INV-16); nothing gates. Per **NS-9 / OQ-NS-6** this NARROWS
> (removes replay-stale edges from an advisory readout); it does **NOT HARDEN** trust -- only a deployed
> cross-uid signer does that. The **co-forge ceiling is UNCHANGED** (a same-uid attacker mints its OWN fresh
> valid VOUCH under its OWN key -> it passes freshness; integrity != provenance, #273 family). It does NOT
> touch the deploy, a uid, /etc, a key, or an attestation (NS-7).
>
> **DESIGN settled by the W2 design-exploration architect (this session), all 6 forks decisive.** The filter
> uses `checkFreshnessWindow` ONLY (NOT the vestigial W0 `computeEdgeFreshnessBasis`/`verifyFreshEdge`); the
> frame sig, already verified in `verifiedRecords`, is what binds the `payload.freshness` fields (Option A).

## §0 What W2 is (one paragraph)

W2 adds ONE thin, pure, total (never-throws) module `trust/vouch-freshness.js` exporting
`filterFreshVouches(recs, freshnessOpts)`, and wraps `verifiedRecords(...)` in it inside `disjointPaths`
(a 2-line `convert.js` change). DISARMED (`meCtx.freshness` absent/malformed) -> identity pass-through.
ARMED (`meCtx.freshness = {now, ttlMs}`, finite `now` + finite `ttlMs > 0`) -> it DROPS every VOUCH that
does not AFFIRMATIVELY present a well-formed, in-window `payload.freshness` object (the H1 authorization
post-condition). `buildVouchGraph` is UNCHANGED (pure-structural, SRP). It changes NOTHING in
`read-gate.js`/`edge-freshness.js`/`signed-edge.js`/`minter.js`/`frame.js`/`record.js`.

## §1 Runtime Probes (firsthand, this session)

- **claim:** `buildVouchGraph` has exactly ONE live caller -- `disjointPaths` (`convert.js:75`).
  **probe:** `grep -rn buildVouchGraph v0/src v0/test`
  **observed:** def `convert.js:19`; call `convert.js:75`; export `convert.js:139`; the only other refs are in
  `signed-edge-mint.test.js` (the W1 H1-downgrade DOCUMENTING test, a test not a live fold). Sole live caller
  CONFIRMED -- W2's entire live surface is that one line.
- **claim:** zero existing callers set `meCtx.freshness` -> disarmed-by-default is byte-identical.
  **probe:** `grep -rn '\.freshness\b' v0/src v0/test` (minus payload.freshness/edge-freshness/freshnessNonce) + a
  scan of every `meCtx` construction.
  **observed:** `(no bare .freshness field reads)`. Every `meCtx` is `{registry, storeOpts, anchor?, nowMs?}`
  (`trust.test.js:52`, `convert-stake.test.js:75`, `arming-darkness-witness.test.js:60`, `minter.test.js:51`,
  `u1-stake-dod.test.js:100`, ...). None sets `.freshness`. So every existing call is DISARMED -> the graph is
  built over the identical record set -> `disjoint_paths`/`meets_topological`/`independence`/`funded_root`/
  `actionable` are byte-identical. CONFIRMED.
- **claim:** `checkFreshnessWindow` is pure, never-throws, reads `{approvedAt, nonce, now, ttlMs}`, no sig.
  **probe:** Read `edge-freshness.js:101-113`.
  **observed:** positional-arg + null-coalesce; `bad-ttl`/`no-clock`/`no-approvedAt`/`no-nonce`/`stale-or-future`;
  returns `{fresh, reason}`; never throws; NO sig check (Option A: the frame sig, verified in `verifiedRecords`,
  already authenticated the freshness fields inside `record_id`).
- **claim:** `refuseAlert(reason, detail)` -- reason positional/authoritative; `class` in `{attack,misconfig,integrity}`.
  **probe:** Read `refuse-alert.js:24,32-44`.
  **observed:** `refuseAlert('no-freshness', {class:'misconfig', sender, record_id})` is the exact shape;
  `CLASSES = ['attack','misconfig','integrity']`; reason spread LAST (un-clobberable by a hostile detail);
  never throws; pure stderr observability (NARROWS/HARDENS nothing, NS-9).
- **claim:** the W1 producer puts freshness at `payload.freshness = {approved_at, nonce, key_id}`; `key_id`
  is NOT read by the window.
  **probe:** Read `signed-edge.js` §2a + `edge-freshness.js:106`.
  **observed:** the window reads `approved_at` + `nonce` only; `key_id` is advisory (the vestigial-basis field).

## §2 The design -- `v0/src/trust/vouch-freshness.js` (NEW, pure, total, never-throws)

### 2a -- `filterFreshVouches(recs, freshnessOpts) -> object[]`

- **DISARM gate (byte-identical default).** ARMED iff `freshnessOpts` is a plain object with a finite-number
  `now` AND a finite-number `ttlMs > 0` (mirror `checkFreshnessWindow`'s own `bad-ttl` guard). Else DISARMED ->
  `return recs` unchanged (identity pass-through: no drops, no `refuseAlert`, no new array even). This is the
  plans/33 admission-gate idiom ("disarmed-by-default admit-all pass-through; armed ONLY by injection").
- **ARMED path -- the H1 positive AND-chain (a record is KEPT only if it AFFIRMATIVELY passes ALL):**
  1. NOT a VOUCH (or a non-object payload) -> **pass through unchanged** (freshness is not its concern;
     `buildVouchGraph` already ignores non-VOUCH -- SRP, and byte-identity for the non-VOUCH population).
  2. `fr = rec.payload.freshness` is a plain object (not null, not array) -- else **DROP** `no-freshness` /
     `misconfig`.
  3. `Number.isFinite(fr.approved_at)` AND `isValidNonce(fr.nonce)` (the DRY W0 floor) -- else **DROP**
     `no-freshness` / `misconfig` (a shape-malformed freshness object is the same class as absent: a producer
     that did not honestly fill it).
  4. `checkFreshnessWindow({approvedAt: fr.approved_at, nonce: fr.nonce, now, ttlMs}).fresh === true` -- else
     **DROP** `stale-or-future` / `integrity` (an authentic, sig-bound record that violates the time-bound).
- **DROP not throw -- and TOTALITY needs BOTH snapshot-once AND a try/catch (VERIFY-hacker F1).** The filter
  faces attacker-controlled store bytes; it must be TOTAL. A bad record is a skip + `refuseAlert`, NEVER a
  `throw` (a throw here propagates through `buildVouchGraph(filterFreshVouches(...))` = a `convert`-wide DoS --
  the exact failure `agentStakeAxis` guards at `convert.js:104-106`). Two guards, BOTH required:
  (1) **Snapshot `fr.approved_at`/`fr.nonce` into locals ONCE** (the `edge-freshness.js:138` C1 read-twice-getter
  lesson -- decide on the first read, never re-read a hostile getter); (2) **WRAP the ARMED per-record predicate
  body in `try { ... } catch { refuseAlert('malformed-freshness', {class:'integrity', sender, record_id}); continue; }`**
  -- snapshot-once alone does NOT catch a THROWING getter (proven by the F1 live probe: a spec-faithful bare-loop
  build throws and fails its own §5-item-8 test). The try/catch mirrors the `agentStakeAxis` idiom (cited above)
  and classes a caught throw `integrity` (the read-gate `malformed-record-in-store` class -- an exotic/hostile
  record shape). **Honest scope (F1 mitigating context -- state it in the test comment):** a throwing getter is
  UNREACHABLE via the live disk path (`listByReceiver` JSON-parses records off disk; JSON carries no getters),
  so the try/catch is defense-in-depth for in-memory callers (tests, a future pre-serialization fold), NOT a
  live-exploitable DoS -- but the spec's own totality claim + item-8 test demand it, so it lands.
- **Own-vs-prototype freshness fields (VERIFY-hacker F2, LOW -- document, do NOT over-fix).** The ONE
  malformed-shape that "survives" armed is a freshness object whose `approved_at`/`nonce` are PROTOTYPE-inherited
  (own-keys empty). It survives ONLY in-memory; it DROPS on the JSON store round-trip (JSON has no inherited
  props -- F2 live-confirmed). The disk path is therefore safe. The build MUST NOT "fix" this with an
  own-property gate that would also reject a legitimately own-keyed freshness object (breaking the co-forge test)
  -- leave the predicate reading `fr.approved_at`/`fr.nonce` directly and rely on the store round-trip; this
  clause is the documented disposition.
- **`{now, ttlMs}` are read ONLY from `freshnessOpts`** (the injected DI object), NEVER from any record field.
  The record supplies the CLAIM (`approved_at`, `nonce`); the deploy supplies the JUDGE (`now`, `ttlMs`). This
  is structural: there is no code path that reads `now`/`ttlMs` off `rec`.
- **Immutability:** the armed path builds a NEW `out[]`; `recs` is never mutated.
- **Imports** `checkFreshnessWindow` + `isValidNonce` from `../lib/edge-freshness` (DRY -- never re-implement the
  window/floor) and `refuseAlert` from `../lib/refuse-alert`. **Exported:** `{ filterFreshVouches }`.

### 2b -- the `disjointPaths` diff (2 lines, disarmed-inert)

```js
const { filterFreshVouches } = require('./vouch-freshness');   // NEW require
function disjointPaths(meCtx, meDid, agentDid) {
  const verified = verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const edges = buildVouchGraph(filterFreshVouches(verified, meCtx && meCtx.freshness));   // was: buildVouchGraph(verifiedRecords(...))
  return maxVertexDisjointPaths(edges, meDid, agentDid);
}
```

The filter sits AFTER sig-verify (plans/35 §7-item-7) and BEFORE graph-build (§7-item-6). `buildVouchGraph`
stays byte-identical. `meCtx && meCtx.freshness` -> `undefined` for every caller today -> disarmed -> inert.

### 2c -- NS-9 framing (do NOT mis-read as harden/gate)

Armed, W2 changes only WHICH records enter `buildVouchGraph`; dropping edges can only hold `disjoint_paths`
equal or LOWER (monotonic non-increase -- assert `dpArmed <= dpDisarmed` as a filter property). A
`meets_topological` true->false flip is possible and is STILL SHADOW (INV-16 -- it informs, never gates); no
consumer may read the NARROWED `meets_topological` as a STRONGER signal than the unfiltered one. Freshness is a
replay/INTEGRITY bound, never PROVENANCE (`edge-freshness.js:12`) -- "fewer stale-replay paths", not "more
trustworthy paths" (same value class, fewer members). `actionable`/`mayGate` untouched.

## §3 The darkness-witness cascade (NS-9 dormancy -- evolved to BEHAVIORAL)

W2 legitimately WIRES `edge-freshness.checkFreshnessWindow` into a LIVE module (`convert.js` via the new
filter), so the pure "nothing imports me" import-dormancy for edge-freshness BREAKS and evolves. Three
witnesses (mirror `arming-darkness-witness.test.js` -- do NOT reinvent):

- **(i) Evolve `edge-freshness-darkness-witness.test.js`** from the one-entry allowlist to the EXACT-SET
  two-entry `assert.deepEqual(importers.sort(), ['identity/signed-edge.js', 'trust/vouch-freshness.js'])`
  (`deepEqual`, NEVER `.includes`). `vouch-freshness` is edge-freshness's SECOND consumer; it is itself gated
  (disarmed-by-default), proven by (ii). Any THIRD importer -- especially a `grounding/`/`read-gate` fold
  pulling `checkFreshnessWindow` directly into a live path -- goes RED. Keep the `(?:\.js)?` regex (the W0
  CodeRabbit Major -- match both the bare and `.js` import forms).
- **(ii) NEW behavioral disarmed-inertness witness** (the plans/34-W2 "behavioral coupling, not a tautology"
  lesson). Build a world with a FRESH VOUCH + a STALE VOUCH + a NO-FRESHNESS (legacy/bare) VOUCH, all on
  COUNTED disjoint paths (so a drop actually lowers the count). Assert:
  - DISARMED (`meCtx` with NO `.freshness`) -> `disjointPaths` == the UNFILTERED count (includes the stale +
    no-freshness edges). Goes RED if the filter drops ANY edge when disarmed (byte-identity break).
  - **NON-VACUITY precondition:** ARMED (`meCtx.freshness = {now, ttlMs}`) -> `dpArmed < dpDisarmed` STRICTLY
    (the stale + no-freshness paths are gone). This proves the mechanism BITES, so `dpDisarmed == unfiltered`
    genuinely witnesses inertness (not "the filter is a no-op everywhere"). Plus the monotonic invariant
    `dpArmed <= dpDisarmed`.
- **(iii) NEW `vouch-freshness-darkness-witness.test.js`** -- `trust/vouch-freshness.js` is imported by EXACTLY
  `['trust/convert.js']` (exact-set `deepEqual`; the `signed-edge`/`admission-gate` sibling pattern). Proves the
  filter's only live consumer is `disjointPaths` -> blast radius contained to the one advisory readout.
  Non-vacuous: assert module-exists + non-empty src-enumeration first (the L-2 pattern).

## §4 Layering (NS-11)

`trust/vouch-freshness.js` imports ONLY `lib/edge-freshness` + `lib/refuse-alert` (downward `trust/ -> lib/`,
legal) and is imported by `trust/convert.js` (same-layer `trust/ -> trust/`, legal). Zero reverse edge, zero
cycle (`vouch-freshness` does not import `convert`). Covered by the existing `trust`-layer bans; **NO new
layering assertion** -- but the build MUST run `layering.test.js` to confirm no accidental reverse edge.

## §5 TDD plan (RED first)

`test/unit/vouch-freshness.test.js`:
1. **DISARMED identity pass-through** -- `filterFreshVouches(recs, undefined)` / `null` / `{}` / `{now:NaN}` /
   `{now:1, ttlMs:0}` / `{now:1, ttlMs:-5}` / `{now:1, ttlMs:Infinity}` -> returns `recs` unchanged (===, no
   drops). The disarm predicate is exact (finite `now` AND finite `ttlMs > 0`).
2. **ARMED drops NO-FRESHNESS (H1 -- the inversion of plans/35 §5-item-7)** -- a bare VOUCH (no
   `payload.freshness`) is DROPPED (excluded from the return). Was: `buildVouchGraph` counted it. This is the
   authorization post-condition: absent -> DROP, NEVER skip-when-absent.
3. **ARMED drops MALFORMED freshness** -- `payload.freshness` = `null` / `[]` / `{}` (missing fields) /
   `{approved_at:'x'}` / `{approved_at:1, nonce:'short'}` / `{approved_at:NaN, nonce:validNonce}` -> DROP
   `no-freshness`. A superset/partial object cannot survive (positive AND-chain).
4. **ARMED drops STALE / FUTURE** -- `approved_at` older than `now-ttlMs`, or `> now` -> DROP `stale-or-future`.
5. **ARMED keeps FRESH well-formed** -- `approved_at` within `[now-ttlMs, now]`, valid nonce -> KEPT.
6. **ARMED passes NON-VOUCH through** -- a STAKE/CONFIRM/other record is returned unchanged (not freshness-gated).
7. **`{now, ttlMs}` never record-sourced** -- a record carrying a hostile `payload.freshness.ttlMs = Infinity`
   (or `now`) is IGNORED; the window uses `freshnessOpts.ttlMs`. Live-assert the hostile record still DROPS as
   stale under the DEPLOY `ttlMs` (proves the deploy constant governs, not the record).
8. **total / never-throws (F1 -- the try/catch guard, RED first)** -- a record with a THROWING getter on
   `payload` / `payload.freshness` / `.approved_at` / `.nonce` / `.type` (and a hostile Proxy) is a DROP via the
   armed-body `try/catch` (`refuseAlert('malformed-freshness', {class:'integrity'})`), NEVER a throw.
   `filterFreshVouches([hostile], armed)` returns `[]` and does not throw; a mixed `[hostile, freshVouch]`
   returns `[freshVouch]` (the throw of one record never drops the whole batch). Test comment records the F1
   mitigating scope: unreachable via the disk path (JSON has no getters), so this is defense-in-depth. Snapshot-
   once (C1) is NECESSARY but NOT SUFFICIENT for totality -- the try/catch is the other half.
9. **immutability** -- `recs` is not mutated; the armed path returns a NEW array.
9b. **null/undefined element DROP (VALIDATE code-reviewer MEDIUM)** -- a null/undefined array element is DROPPED
    armed (`malformed-freshness`/`integrity`), NOT forwarded to `buildVouchGraph` (which throws on `null.type`);
    symmetric with the F1 guard. Unreachable via the live path (`verifiedRecords` drops nulls first) but the
    totality claim demands it. The kept set is asserted null-free (safe for `buildVouchGraph`).
9c. **monotonicity PROPERTY (VALIDATE honesty nit b)** -- a COMMITTED seeded fuzz (150 synthetic graphs, a
    deterministic LCG, no Math.random) asserts `dpArmed <= dpDisarmed` ALWAYS + at least one STRICT narrowing
    (non-vacuity); backs the §2c filter-property claim with committed coverage, not only the VERIFY/VALIDATE
    `/tmp` probes.

`test/integration/vouch-freshness-convert.test.js` (end-to-end through the REAL mint -> read-gate -> convert):
10. **byte-identity (disarmed)** -- a `meCtx` with NO `.freshness` counts the FULL unfiltered graph over a mixed
    record set (fresh + stale + bare VOUCHes all counted; `disjoint_paths`=3, `actionable`=false). The STRONGEST
    byte-identity witness is the UNIT-level `filterFreshVouches(recs, disarmed) === recs` ref-identity (item 1) --
    ref-equality guarantees `buildVouchGraph` sees the identical input, so `convert` output is necessarily
    identical; this integration case is the end-to-end confirmation, not a captured-baseline deep-equal
    (honesty-auditor nit a).
11. **armed NARROWS** -- the SAME world with `meCtx.freshness = {now, ttlMs}` -> `disjoint_paths` DECREASES
    (the stale + bare edges dropped); `actionable` STILL false (NS-9 -- narrows, never gates).
12. **co-forge RED-test (EXPECTED SHADOW pass)** -- a same-uid attacker with its OWN registered persona mints a
    genuinely-FRESH VOUCH under its OWN key -> it passes `verifiedRecords` (valid sig) AND the freshness filter
    (real `approved_at`/`nonce`). Asserted as an EXPECTED pass (integrity != provenance; the ceiling is
    UNCHANGED), NEVER a closed hole (mirror plans/35 §5-item-8).
13. **the darkness witnesses (§3)** -- the evolved edge-freshness exact-set allowlist + the behavioral
    disarmed-inertness witness (with the `dpArmed < dpDisarmed` non-vacuity precondition) + the new
    `vouch-freshness` dormancy witness.

## §6 What W2 does NOT do (NS-9)

- Does NOT arm anything live -- disarmed-by-default; PACT owns no live arm flag; the deploy that injects
  `meCtx.freshness` is the operator's act (NS-7), out of scope. The behavioral witness proves disarmed-inertness.
- Does NOT prove PROVENANCE -- it NARROWS replay (armed: drops edges outside the `<=TTL` window); the same-uid
  co-forge of a NEW fresh edge stands until a deployed cross-uid signer (#273 family). It never "closes" replay.
- Does NOT change `read-gate.js`/`edge-freshness.js`/`signed-edge.js`/`minter.js`/`frame.js`/`record.js`/
  `buildVouchGraph` -- if any is touched, the design drifted off the settled forks.
- Does NOT flip `actionable`, touch `mayGate`, or read freshness as epistemic independence (axis 4). It is a
  scarcity/replay axis on the advisory readout only.
- Does NOT touch the deploy, a uid, /etc, a key, or an attestation (NS-7).

## §7 Architect design-exploration -- the 6 forks + 14-item punch-list (FOLDED)

The W2 design-exploration architect (this session) settled all 6 forks DECISIVELY, grounded in the real code
(sole-caller grep, zero-existing-`meCtx.freshness` grep, refuse-alert class prior art):

1. **Arming seam = a NEW `meCtx.freshness = {now, ttlMs}` opt-in** (reject reuse-`meCtx.nowMs` [accidental arm
   the instant a stake caller wires a clock] + reject `storeOpts` [a ~10-module-shared selector]). Absent/
   malformed -> disarmed -> identity pass-through. The exact analog of `meCtx.anchor` (the stake axis's own
   opt-in DI object). -- §2a + §2b.
2. **Module = a NEW pure `trust/vouch-freshness.js`** (reject inline-in-convert + reject in-read-gate [the SOLE
   sig-verify entry, consumed by direct/wcons/stakeOf/grounding -- arming freshness there over-broadly arms
   every reader]). `buildVouchGraph` stays pure-structural (SRP). -- §2a.
3. **H1 = a positive AND-chain; absent/malformed -> DROP; DROP not throw; snapshot-once (C1)** -- §2a. Refuse
   classes SPLIT (do NOT collapse): `no-freshness` -> `misconfig` (mirrors read-gate's `unsigned`/`unregistered`
   -- the honest majority at arming is un-migrated legacy; the alert surfaces it either way); `stale-or-future`
   -> `integrity` (an authentic sig-bound record violating the time-bound, mirrors `sig-verify-failed`).
4. **Witness set (3)** -- §3.
5. **NS-9 framing CORRECT** -- armed NARROWS the advisory count only; `actionable` hard-false; a
   `meets_topological` narrowing is still SHADOW; not a harden, not a gate. -- §2c.
6. **Migration = drop-all-legacy-when-armed is honest-correct; NO grandfather seam** (grandfathering legacy
   bare VOUCHes past an armed gate REOPENS the H1 downgrade). Disarmed-by-default IS the per-receiver opt-in
   migration (arm only when your senders have migrated to freshness-bound VOUCHes). -- §6.

**W1 §7 residuals -- disposition:**

| Residual | W2 disposition |
|---|---|
| DROP-no-freshness authorization post-condition (H1) | **CLOSE** -- the core of fork 3; landed with the RED inversion test (§5 item 2). |
| co-forge RED-test (EXPECTED SHADOW pass) | **CLOSE** -- read-side now live; §5 item 12 asserts the co-forged fresh VOUCH passes. |
| `targetPersona`/`nonce`/`keyId` length-cap | **CARRY** -- a store-bytes bound, not a readout concern; the filter is total over any-length strings. Do NOT scope-creep W2. |
| distinct-`approved_at` store-growth / per-sender edge cap / past-TTL GC (hacker M2) | **CARRY** -- store-side GC; the read filter drops stale edges from the READOUT, not the STORE. |
| `ttlMs`-magnitude ceiling (W0 hacker) | **PARTIAL-CLOSE / CARRY** -- the disarm gate rejects non-finite/non-positive `ttlMs` (fail-closed); an absurdly-large FINITE `ttlMs` is a deploy-config concern (a deploy constant, not an attacker vector). Carry a deploy-config note. |
| empty-frame-nonce -> NULL idempotency_key -> dedup-skipped | **CARRY (informational)** -- W2 reads `payload.freshness.nonce`, NOT the frame nonce; `disjointPaths` counts topology not distinct records, so it does not rely on VOUCH dedup. Non-blocking note. |

**Deploy-constant residual (CARRY):** at the eventual LIVE wiring wave, `meCtx.freshness` MUST be populated
from a trusted non-actor deploy source (the plans/33 admission-gate arm-signal posture) -- never an
actor-reachable `meCtx` construction. W2 is disarmed-MECHANISM only; it does not wire the deploy.

## §8 VERIFY board (pre-build) -- architect design-exploration DONE; hacker LIVE-probe DONE + FOLDED

- **architect (design-exploration):** all 6 forks settled DECISIVELY (this §7). SETTLED.
- **hacker (LIVE-probe):** built the §2a spec into a `/tmp` prototype requiring the REAL `edge-freshness`/
  `refuse-alert`, wired it into the REAL `mint -> verifiedRecords -> filter -> buildVouchGraph -> disjointPaths`
  path with GENUINE minted+signed records, and attacked it. **5/7 HELD, 1 EXPECTED-pass, 1 blocking FINDING:**
  - v1 `{now,ttlMs}` record-sourcing -- **HELD** (a minted VOUCH with `payload.freshness.ttlMs=Infinity` DROPS
    as stale under the deploy `ttlMs`; no path reads a time-bound off `rec`).
  - v2 skip-when-absent (H1) -- **HELD live** (14 malformed shapes incl. JSON `__proto__` pollution all DROP
    armed) / F2 LOW spec-robustness note (prototype-only fields, store-blocked).
  - v3 disarmed byte-identity -- **HELD** (14 disarmed shapes are identity pass-through; armed control narrows).
  - v4 total/never-throws -- **FINDING F1 (MEDIUM, blocking)** -- see fold below.
  - v5 monotonicity -- **HELD** (`dpArmed <= dpDisarmed` over 2000 random graphs, 0 violations).
  - v6 co-forge -- **HELD-AS-EXPECTED** (a same-uid fresh VOUCH under its own key passes -- ceiling UNCHANGED).
  - v7 C1 read-twice -- **HELD** (`approved_at`/`nonce` getters fire exactly once).
  - NS-9 honesty check: **no over-claim drift** (the harden/provenance framing matches what the code does).
- **FOLDS applied to the spec pre-build:**
  - **F1 (MEDIUM, blocking) -> FOLDED into §2a + §5-item-8:** the spec-faithful bare-loop build throws on a
    hostile getter (snapshot-once does not catch a THROW), failing its own totality test. Added the mandatory
    armed-body `try/catch` (`malformed-freshness`/`integrity`, the `agentStakeAxis` idiom). Honest scope:
    disk-path-unreachable (JSON has no getters) -> defense-in-depth, but the totality claim demands it.
  - **F2 (LOW) -> FOLDED into §2a:** a prototype-inherited freshness field survives in-memory but is
    store-blocked; documented, with a build caution NOT to over-fix (an own-property gate would break co-forge).
  - **F3 (INFO) -> CARRY:** `buildVouchGraph` is also non-total (pre-existing, out of W2 scope); the F1 filter
    guard runs FIRST and drops the hostile record before `buildVouchGraph` sees it -- the build MUST order the
    filter before the graph-build (it does: §2b). A future wave may apply the same try/catch idiom to
    `buildVouchGraph`.
  - **F4 (INFO) -> CONFIRMED in-spec:** keep `!Array.isArray` in the arm predicate (an array-shaped opts with
    string-keyed `now`/`ttlMs` must DISARM); already in §2a + the §5-item-1 disarmed list.

## §9 VALIDATE result (3-lens, post-build) -- DONE + FOLDED

Ran as a parallel 3-lens workflow (code-reviewer + hacker Rule-2a + honesty-auditor), each over the BUILT
`vouch-freshness.js` + the wired `convert` path. **code-reviewer SHIP-WITH-NITS · hacker SHIP · honesty-auditor
SHIP-WITH-NITS.** All three ran the suite; the hacker + code-reviewer live-probed the built module.

- **code-reviewer (SHIP-WITH-NITS) -- 1 MEDIUM, FOLDED.** **`filterFreshVouches` forwarded a null/undefined array
  element** (`!rec` was folded into the non-VOUCH pass-through branch) -> `buildVouchGraph` would throw on it,
  reopening the F1 DoS class. Unreachable on the live path (`verifiedRecords` drops nulls first) but an untested
  asymmetry with F1. **FIXED:** an explicit `if (!rec) { refuseAlert('malformed-freshness',{class:'integrity'}); continue; }`
  DROP + unit item 9b (asserts the kept set is null-free -> safe for `buildVouchGraph`). 12 confirmations
  (H1 positive gate, DROP-not-throw totality, snapshot-once C1, `isArmed` non-array + finite guards, no
  caller-overridable soft default, SRP, immutability, the 2-line diff, exact-set witnesses, layering clean,
  0 regressions).
- **hacker (Rule-2a, SHIP) -- all 8 vectors HELD via live `/tmp` probes on the BUILT module + the REAL mint path.**
  H1 skip-when-absent (12 malformed shapes DROP), `{now,ttlMs}` record-sourcing (hostile `fr.ttlMs=Infinity`
  ignored), totality (0 throws across 8 hostile shapes incl. a throw-on-every-access Proxy + the catch-path
  double-throw), disarmed byte-identity (28 shapes `=== recs`), **monotonicity (5000 random graphs, 0 violations,
  2214 strictly narrowed)**, co-forge EXPECTED pass (dp=1, ceiling unchanged), C1 read-once, F4 array-shape. 2 INFO:
  **F2 prototype-inherited freshness is STORE-BLOCKED on the live disk path** (re-probed through real
  mint->appendRecord->disk->verifiedRecords: the store JSON-serializes inherited fields to `{}` -> the record
  reads back with own `approved_at`/`nonce` undefined -> DROPS as no-freshness; `__proto__` JSON-pollution also
  contained, no global prototype pollution) -- defense-in-depth confirmed, no change; and "commit the reviewed bytes".
- **honesty-auditor (SHIP-WITH-NITS) -- all 6 sensitive claims CONFIRMED NON-VACUOUS, 2 LOW nits FOLDED.**
  Confirmed: disarmed byte-identity (the `out === recs` ref-identity is the strongest witness), the
  `dpArmed(1) < dpDisarmed(3)` non-vacuity (hand-traced the max-flow), no-freshness=>DROP genuinely inverts the W1
  documenting test (skip-when-absent structurally impossible -- no else-keep branch), co-forge asserted as an
  EXPECTED pass with ceiling UNCHANGED (no provenance/harden over-claim), NS-9 (`actionable:false` hardcoded), the
  F1 disk-unreachability claim accurate, the darkness-witness comments honest about dormancy now being BEHAVIORAL.
  Nits FOLDED: **(a)** §5-item-10 prose re-worded to credit the unit-level `out === recs` ref-identity as the
  byte-identity witness (the integration case is the end-to-end confirmation, not a captured-baseline deep-equal);
  **(b)** the monotonic-non-increase "filter property" now has COMMITTED coverage -- unit item 9c (a 150-graph
  seeded fuzz), not only the VERIFY/VALIDATE `/tmp` probes.

**Post-fold suite:** 42 files · 579/0 (11 unit + 3 convert + 3+3 witnesses + the rest), eslint clean. No
functional change beyond the null-drop fold; the folds are the null-guard + two committed tests + plan-prose accuracy.

### Pre-PR CodeRabbit CLI (secret-free diff, before opening the PR) -- 2 findings, both FOLDED

- **Major (co-forge test accuracy) -- FOLDED.** The item-12 co-forge test labeled itself "same-uid" but
  `freshWorld().add()` hardcodes `humanUid: 'human:'+did`, so the two personas had DISTINCT human roots -- the
  test never established a same-uid scenario (it only showed a fresh 2-hop chain -> dp=1, already covered by item
  11). The VALIDATE honesty lens confirmed "co-forge is an EXPECTED pass" but missed this setup gap (CodeRabbit
  complements the board -- the recurring async-bot pattern). **FIXED:** added `addUnder(did, human)` and rewrote
  item 12 as a GENUINE same-human-root Sybil (two personas, one `human:attacker` root, each own key) whose fresh
  chain is KEPT armed -- with a non-vacuity precondition asserting the shared root. Now the label is accurate and
  the ceiling claim (freshness gates neither provenance NOR U1) is actually exercised.
- **Minor (markdown) -- FOLDED.** §2b's code fence lacked a language tag; added `js` (PACT lints eslint-on-.js
  only, but keeps the plan markdownlint-clean).

### Async CodeRabbit PR bot (post-push, poll-to-completion) -- 1 Nitpick, FOLDED. CI green (ESLint + node 20/22)

- **Nitpick (Trivial, totality-contract gap) -- FOLDED.** `filterFreshVouches` guarded null elements + hostile
  getters but left the `recs`-is-non-array shape unguarded -- armed, a non-iterable `recs` throws at `for...of`
  OUTSIDE the per-record try/catch, contradicting the "TOTAL: never throws" claim. Unreachable live
  (`verifiedRecords` always returns an array) but a real contract inconsistency. **FIXED:** an armed-path
  `if (!Array.isArray(recs)) return [];` -- fail-CLOSED (diverged from CodeRabbit's `return recs`: a filter
  returns [] for garbage, and never forwards a non-array to `buildVouchGraph`, consistent with the null-drop
  fold) + unit item 9d (`null`/`undefined`/`42`/`'abc'`/`{}`/`{length:2}` -> [] no-throw; disarmed keeps identity).
  The async bot genuinely reviewed (accurate walkthrough, not skipped/rate-limited); the finding lived in the
  review body (collapsed nitpick), NOT an inline comment -- fetched via the review surface, not the green check.
