---
lifecycle: persistent
status: SCOPING -> VERIFY -> TDD build (a reachable-now correctness/security fix to the content-address primitive)
plan: 45
created: 2026-07-09
issue: 77 (F1)
depends-on: none (self-contained; canonicalJsonSerialize is a pure leaf)
audience: a build session (this) + the USER (merge gate)
title: canonical-json emits nested `undefined` as a bareword -> mint-then-reject data loss + false 'attack' alert (issue #77 / F1)
---

# Plan 45 -- F1: canonical-json nested-undefined (reachable-now)

## The bug (premise-probed firsthand + live-reproduced, this session)

`canonicalJsonSerialize`'s `walk()` (`v0/src/lib/canonical-json.js:48-53`) handles a nested `undefined` by falling
through to `JSON.stringify(undefined)` -> JS `undefined`, which then:
- in an OBJECT: concatenates as the **bareword** `"b":undefined` (line 53) -- invalid JSON in the hash preimage.
- in an ARRAY: becomes an empty slot `[1,,2]` (line 50 `.join(',')`) -- invalid JSON.

Meanwhile the WRITE path (`record-store.js`) uses **native `JSON.stringify`**, which DROPS an undefined object key
and converts an array `undefined -> null`. So the build-time content-address hash (canonical, with the bareword) !=
the read-time hash (recomputed over the parsed, key-dropped body) -> `computeRecordId` mismatch ->
`refuseAlert('content-address-mismatch', {class:'attack'})` + a `null` read. A legitimate optional-field record is
minted `ok:true`, then becomes **unreadable** and mislabelled an **attack** (data loss + false alarm).

Reachable-now via the ordinary `{ field: opts.value }` idiom (exactly the `target_claim_id` / `target_premise_id`
pattern `record.js:155-164` documents as legitimate optional fields). Not arming-gated, not a disclosed residual.

## The fix (match native `JSON.stringify` for `undefined`; NO-OP for undefined-free values)

In `walk()`:
1. **Object keys** -- filter out keys whose value is `undefined` BEFORE sorting:
   `Object.keys(v).filter((k) => v[k] !== undefined).sort()`. Native drops them; now the canonical hash does too.
2. **Array elements** -- map `undefined -> null` before recursing: `walk(x === undefined ? null : x, depth + 1)`.
   Native converts array `undefined -> null`; now the canonical hash does too.

**NO-OP guarantee (load-bearing):** for any value with NO `undefined` anywhere, the filter keeps all keys and the
array map is identity -> byte-identical output -> **every existing stored content-address hash is unchanged**
(INV-22 / M1 forward-coupling preserved). The change only affects the (currently-broken, unreadable) undefined case.

Top-level `undefined` (`canonicalJsonSerialize(undefined)`) already matches native (`JSON.stringify(undefined)`
returns JS `undefined`); a record is always an object, so this edge is moot -- left as-is.

## Runtime Probes (firsthand, this session)

| # | Claim | Probe | Observed |
|---|-------|-------|----------|
| 1 | Object nested-undefined -> bareword | `node -e` `canonicalJsonSerialize({a:1,b:undefined})` | `'{"a":1,"b":undefined}'` (native: `'{"a":1}'`) -- CONFIRMED |
| 2 | Array nested-undefined -> empty slot | `canonicalJsonSerialize([1,undefined,2])` | `'[1,,2]'` (native: `'[1,null,2]'`) -- CONFIRMED |
| 3 | End-to-end mint-then-reject | append a record with `target_claim_id:undefined` -> read-back | append `ok:true`; on-disk body drops the key; read-back `null` + a false `class:attack` alert -- CONFIRMED |
| 4 | The fix is a no-op for undefined-free values | (build-time) run the FULL existing suite -> 0 regressions; a same-input hash-stability assertion | pending build |

## What this does NOT do (NS-9)

- Does NOT change the hash of any undefined-FREE value (every existing valid content-address is byte-stable).
- Does NOT reject the optional-field idiom (dropping undefined = the native, least-surprising semantic; a record
  with `field:undefined` now hashes + stores + reads identically to one omitting `field`, which is correct --
  JSON cannot represent present-undefined, so no stored record ever distinguished them).
- Does NOT touch the write path, `record.js`, `frame.js`, or any consumer -- the fix is internal to the leaf.
- Is NOT arming-gated -- a reachable-now correctness/availability fix.
- Does NOT honor `toJSON` -- a Date / toJSON-bearing value still diverges from native and reproduces the SAME
  mint-then-reject + false class:attack (REACHABLE via the lenient `validateRecord` payload path). DEFERRED to a
  filed sibling issue + pinned by a residual test (a real same-severity bug, NOT cosmetic parity -- honesty fold).

## HETS Spawn Plan (VERIFY board -- pre-build; a shared content-address primitive = the Rule-2 high-stakes class)

Two read-only lenses in parallel BEFORE the TDD build:

- **architect** -- (1) is matching native `JSON.stringify` the right fix vs the alternatives (reject-undefined /
  make the write path use canonical)? (2) is the drop-undefined-key + array-undefined->null split correct + minimal?
  (3) does the fix make `frame.js`'s top-level-only `stripUndefinedKeys` redundant (note, don't necessarily remove)?
  (4) any consumer that DEPENDS on the current bareword behavior (would the fix break a stored hash)?
- **hacker** -- (1) can the fix change ANY existing stored/valid hash (is the bareword behavior load-bearing
  anywhere)? (2) does dropping undefined keys open a COLLISION surface (two distinct inputs -> one hash) that
  matters for content-addressing -- or is `{a,b:undefined}` == `{a}` the correct + native-consistent identity?
  (3) can `undefined` be weaponized post-fix (e.g. to force a collision between two records that SHOULD differ)?
  (4) is the depth/node budget still correctly counted after the filter (a dropped key must not miscount)?

Findings fold into a `## Pre-Approval Verification` section before the RED-first TDD build.

## Pre-Approval Verification (2026-07-09 -- the 2-lens VERIFY board, pre-build)

**architect: PROCEED-WITH-FOLDS.** NO-OP-for-undefined-free-values **CONFIRMED**. Match-native is the correct fix
(reject-throw re-introduces a divergence + rejects the legit optional-field idiom; write-path-canonical is a larger
blast radius + doesn't even work without first fixing canonical). Q4: no consumer depends on the bareword such that
a stored+valid hash breaks (the round-trip argument: any stored body already went through native, which drops/nulls
undefined). **hacker: BUILD-WITH-FOLDS.** All 4 attacks HELD (no stored/valid hash changes; the `{a,b:undefined}`==`{a}`
collision is the correct native-consistent identity, always collapsed at the storage layer; node-budget safe).

**The load-bearing scope finding (hacker MEDIUM):** the fix as-planned closes only the `undefined` face of the bug
class; **function / symbol / `toJSON` values diverge from native too** (proven by probe) and reproduce the IDENTICAL
mint-then-reject + false `class:attack`. Signature bases are safe (STH `verifySTH` shape-gate, `computeBindingId`
`requireField`), but the record **payload is NOT** -- `validateRecord` (`record.js:129`) is lenient (no deep
type-check), so `{ payload: { created: new Date() } }` is `toJSON`'d to disk but canonical-hashed over raw `{}` ->
mismatch. The `toJSON`/Date case is a REACHABLE residual.

**Scope decision (folded):** fix the whole **JSON-absent scalar** class -- `undefined` + `function` + `symbol`
(native omits all three in objects / nulls them in arrays; same mechanism; they don't recurse, so zero
re-introduction risk). **DEFER `toJSON`** to a filed sibling issue: it is a distinct *value-transform* mechanism
(native calls `toJSON()` first, then serializes the result) with real edge cases (a `toJSON` returning `undefined`
must DROP the key; nested `toJSON`) that need their own careful walk() restructure + board -- NOT a rushed
extension of this fix. Do **NOT** adopt the naive `canonicalJsonSerialize(JSON.parse(JSON.stringify(v)))` shortcut
(hacker fold #2): `JSON.stringify` runs its OWN unguarded recursion before the walk, reintroducing the
`RangeError`/O(n) DoS the `MAX_CANONICAL_DEPTH`/`MAX_CANONICAL_NODES` guards exist to prevent.

| # | Sev | Lens | Finding | Disposition |
|---|-----|------|---------|-------------|
| H-MED | MED | hacker | bug class extends to function/symbol/toJSON; toJSON/Date reachable via lenient payload | **FOLDED**: fix undefined+function+symbol now (the JSON-absent scalar class via an `isJsonAbsent` helper); FILE a sibling issue for `toJSON` parity + pin it as a KNOWN residual with a test. |
| A-F1 | LOW | architect | getter double-read (`v[k]` read in filter AND map) -- non-deterministic for a hash primitive | **FOLDED**: single-read `entries` form (`Object.keys(v).map(k=>[k,v[k]]).filter(...).sort(...)`). |
| A-F2/HK | LOW/MED | both | "matches native" over-claim | **FOLDED**: reword to "matches native for JSON-absent SCALAR values (undefined/function/symbol)"; toJSON named as the deferred sibling. |
| A-F3 | INFO | architect | `frame.js stripUndefinedKeys` becomes hash-redundant; its `:49-53` comment goes stale | DEFER removal (correct); note the comment refresh for the future removal PR. |
| A-F4 | LOW | architect | add tests: (a) hash-stability for an undefined-free input (the NO-OP proof); (b) mint-then-read a nested-undefined `payload` asserting readability + no false `content-address-mismatch` alert | **FOLDED** into the RED-first set. |

**Board verdict: PROCEED to RED-first TDD.** Fix = the JSON-absent scalar class (undefined/function/symbol) via a
single-read entries walk; toJSON = a filed deferred sibling pinned by a residual test.

## VALIDATE result (2026-07-09 -- the 3-lens post-build board, on the BUILT diff)

**SHIPPED**: `canonical-json.js` (`isJsonAbsent` helper + a single-read `entries` walk that drops JSON-absent object
keys and maps JSON-absent array elements to `null`) + `canonical-json.test.js` (12 tests) + a `#77` mint-then-read
integration test in `record-store.test.js`. **Full suite 755/0; eslint clean; 0 regressions (the empirical NO-OP
corroboration -- the deductive round-trip argument is the proof).**

**3-lens board -- the Rule-2a-corollary caught 2 real defects the abstract VERIFY missed; all folded:**

- **code-reviewer: NEEDS-FIX -> FIXED.** **HIGH -- node-budget regression**: filtering JSON-absent object keys
  BEFORE `walk()` meant dropped keys never hit `++nodeCount`, so a wide all-absent object bypassed
  `MAX_CANONICAL_NODES` (2M keys completed, no throw; pre-fix threw at 200k). **FOLDED**: the filter now counts a
  dropped key toward the budget + throws past the cap (survivors still counted by `walk()`); RED test:
  a >10000 all-absent-KEY object still throws. LOW -- sparse-array holes (same as the hacker's MED, folded). Verified
  NO-OP + no key-order change (40k-key fuzz equivalent to `Object.keys().sort()`) + genuine single-read (getter fires once).
- **hacker (Rule 2a LIVE re-probe): NEEDS-FIX -> FIXED.** All 6 headline attacks HELD (NO-OP across 20+ clean shapes;
  key-order identical incl 40k random-codepoint fuzz; no exploitable collision; single-read getter; no bareword for
  the scalar class; node-budget no-evasion for arrays). **MED -- SPARSE ARRAY HOLE serializer differential**: `.map`
  SKIPS holes, so `[1,,2]` -> invalid `[1,,2]` (native `[1,null,2]`) -- the SAME F1 content-address-mismatch class,
  leaked within the fix's own array-null scope. **FOLDED**: an INDEX LOOP over `v.length` (a hole reads as
  `undefined` via `v[i]` -> null branch); RED test: a real sparse hole -> `[1,null,2]` == native.

**Pre-PR CodeRabbit CLI: 2 Major (one finding, code + plan) -> FOLDED.** The first sparse-hole fold used
`Array.from(v, ...)`, which HONORS an overridden `Symbol.iterator` (probe: `Array.from([1,2,3] with iterator
yielding 9,9)` -> `[9,9]`) -- native `JSON.stringify` walks arrays BY INDEX and IGNORES the iterator (-> `[1,2,3]`).
So `Array.from` traded the hole divergence for an iterator divergence (a poisoned array field would hash != the
native write path). **FOLDED**: switched to an explicit index loop (`for i in 0..v.length; v[i]`) -- matches native
exactly (holes -> undefined -> null; custom iterator ignored). RED test: an array with a custom `Symbol.iterator`
hashes `[1,2,3]` (== native), not `[9,9]`. Full suite 756/0.
- **honesty-auditor: B+ / PASS-WITH-CORRECTIONS.** The `#77` integration test genuinely reproduces the bug
  (non-vacuous); the toJSON residual is honestly pinned (flip-on-fix). Corrections **FOLDED**: (1) the NO-OP proof
  is the DEDUCTIVE round-trip argument (every on-disk body is native-written -> JSON-absent-free), with 755/0 as
  corroboration NOT proof (code comment reworded); (3) the toJSON residual's REACHABILITY/severity surfaced at the
  CODE layer (comment + residual-test comment: "same mint-then-reject, NOT cosmetic"); (4) toJSON named in
  `## What this does NOT do`. Filed #77 (undefined) confirmed FULLY closed; function+symbol close the same class.

**Board verdict: SHIP.** All must-fix folded (node-budget HIGH + sparse-hole MED) with RED tests; honesty
corrections applied at the code + plan layer. NO-OP CONFIRMED (0 regressions across 755). Next: pre-PR CodeRabbit -> PR.

## Cross-repo note (out of scope; follow-up)

The TOOLKIT kernel `packages/kernel/_lib/canonical-json.js` has the byte-identical `walk()` and the SAME latent bug
(PACT's copy is a port -- line 1 still reads `// packages/kernel/_lib/canonical-json.js`). Mirror this fix there
via a separate toolkit issue/PR after this lands ([[pact-toolkit-cross-substrate-sync]]).
