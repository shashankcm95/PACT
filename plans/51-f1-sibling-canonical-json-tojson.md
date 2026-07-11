---
lifecycle: persistent
plan: 51
issue: 99
finding: F1-sibling
severity: medium
lens: correctness
---

# plans/51 — F1-sibling: canonical-json does not honor `toJSON` (a Date/toJSON payload reproduces the mint-then-reject)

## Problem (premise-probed at source)

`canonicalJsonSerialize` (`v0/src/lib/canonical-json.js`) is the SOLE content-address hash primitive under the trust
store. #77 (F1) made it match native `JSON.stringify` for the JSON-absent SCALAR class (undefined/function/symbol). It
still does NOT honor `toJSON` — native calls `value.toJSON(key)` FIRST (e.g. `Date` → ISO string) and serializes the
result; canonical serializes the raw object shape.

**Probe (the exact divergence):** for `new Date()`, `walk` (`canonical-json.js:62`) does not return at the scalar
branch (`typeof date === 'object'`), is not an array, so it hits the object branch → `Object.keys(date)` is `[]`
(a Date has no own enumerable props) → returns `'{}'`. Native `JSON.stringify(new Date())` → `'"<ISO>"'`. So a record
`{ payload: { created: new Date() } }` is content-address-hashed over `{ created: {} }` at mint, written to disk via
native `JSON.stringify` (Date → ISO string), and on read-back re-canonicalized over `{ created: "<ISO>" }` → build-time
hash ≠ read-back hash → false `content-address-mismatch` (class:attack) + a null read. Same mint-then-reject + false
class:attack as #77, for the toJSON value class. REACHABLE via the lenient `validateRecord` payload path.

**Pinned residual:** `v0/test/unit/canonical-json.test.js:114-119` (`KNOWN RESIDUAL (deferred sibling)`) asserts the
current buggy output `'{"d":{}}'` for `{ d: { toJSON(){return 'iso'} } }` and that it diverges from native. This test
flips when the fix lands.

## Design — mirror native `SerializeJSONProperty`'s toJSON step, resolved in the PARENT

A pure helper, applied to a value BEFORE the absent/type dispatch, resolved AT THE PARENT so a `toJSON` returning
`undefined` correctly DROPS the object key / nulls the array element (native's omit/null semantics):

```js
function applyToJSON(v, key) {
  // native SerializeJSONProperty step 2a: an object with a callable toJSON is transformed FIRST (Date -> ISO). Native
  // passes the property key; a key-dependent toJSON must match the native WRITE path byte-for-byte, so thread the key.
  // SINGLE read of `.toJSON` (mirrors native's one GetV -- VERIFY board, convergent): reading it twice would diverge
  // from the native WRITE path for a getter-valued toJSON (mint hashes read#2, disk gets read#1 -> the exact
  // content-address-mismatch this fix closes). `fn.call(v, key)` preserves `this` -- a bare `fn(key)` loses it and
  // Date.prototype.toJSON throws on EVERY Date (a naive fix worse than the bug).
  if (v !== null && typeof v === 'object') {
    const fn = v.toJSON;
    if (typeof fn === 'function') return fn.call(v, key);
  }
  return v;
}
```

Applied at exactly three sites (each reads the raw value ONCE, then transforms — the #108 single-read determinism is
preserved):
- **Entry:** `walk(applyToJSON(value, ''), 0)` — native wraps the root as `{"": value}` (root key `''`).
- **Array branch:** `const x = applyToJSON(v[i], String(i)); walk(isJsonAbsent(x) ? null : x, …)`.
- **Object branch:** `const val = applyToJSON(v[k], k); if (isJsonAbsent(val)) { …drop… } else walk(val, …)`.

**Why parent-resolve (not inside `walk`):** `walk` returns a string unconditionally; a `toJSON`→`undefined` must DROP
the key, which only the parent's `isJsonAbsent` check can do (a walk that returned `JSON.stringify(undefined)` would
emit the `undefined` bareword the #77 fix removed). This mirrors native, where `SerializeJSONProperty` resolves toJSON
and then omits/nulls on the result.

**Invariants preserved (probed):**
- **#108 node accounting** — one increment per key (present → at `walk` entry; absent-after-toJSON → the drop branch),
  so the all-present AND all-absent cases still abort at ~budget. `applyToJSON` adds NO extra increment; the toJSON
  CALL count is bounded at ~budget because the per-key increment fires immediately after each transform.
- **DoS bounds** — do NOT adopt `JSON.parse(JSON.stringify(v))` (reintroduces the unguarded RangeError/DoS the
  `MAX_CANONICAL_*` bounds prevent). A `toJSON` returning a huge/deep object is bounded by the existing `walk` budget
  (the transform result is walked, not blindly stringified).
- **Single-read determinism** — each `v[k]`/`v[i]` is read once into a local, then transformed; `applyToJSON` accesses
  `.toJSON` on the already-read local (no re-read of the source slot).
- **NO-OP for toJSON-free values** — every on-disk body was written via native `JSON.stringify`, so every parsed-back
  body is already toJSON-free (toJSON methods do not survive a JSON round-trip); the fix is identity for them → every
  existing readable content-address is UNCHANGED (the same deductive proof as #77).

## Scope (2 files)

1. `v0/src/lib/canonical-json.js` — add `applyToJSON`; apply at the entry + array + object sites; update the
   `isJsonAbsent` DEFERRED-SIBLING header note (toJSON is now handled).
2. `v0/test/unit/canonical-json.test.js` — flip the residual test to the fixed output; add RED tests (below).

## Test plan (RED-first)

Flip the residual test FIRST + add the new cases against the CURRENT impl → expect RED, then implement:
- **Date parity** — `canonical({payload:{created: new Date(0)}}) === canonical(JSON.parse(JSON.stringify(same)))`
  (the mint-vs-read invariant; no false attack) AND equals native for the single value.
- **top-level Date** — `canonical(new Date(0))` equals `JSON.stringify(new Date(0))`.
- **toJSON → undefined DROPS the key** — `canonical({a:{toJSON(){return undefined}}, b:1}) === '{"b":1}'` (native parity).
- **toJSON → undefined NULLS an array element** — `canonical([{toJSON(){return undefined}}]) === '[null]'`.
- **nested toJSON** — `canonical({a:{toJSON(){return {b:new Date(0)}}}})` resolves the inner Date too.
- **key threading** — a `toJSON(key)` that echoes its key matches native (proves the key arg is passed).
- **budget still bounds a toJSON-returned huge object** — a `toJSON` returning a 10001-wide array still throws.
- **flip the residual** — `{d:{toJSON(){return 'iso'}}}` → `'{"d":"iso"}'`, and now EQUALS native.

## Edge cases for the VERIFY board

- **byte-parity with native** across the value classes (the load-bearing property — a divergence silently breaks
  idempotency substrate-wide, M1 forward-coupling).
- **throwing / Proxy `toJSON`** — native propagates a throw; callers catch + fail-closed. Confirm no new mint-then-reject
  (a throw at mint = record never minted = no read side).
- **`toJSON` that is a non-callable** (`toJSON: 5`) — native ignores it (treats as a normal object); `typeof … ===
  'function'` matches.
- **BigInt** — native applies toJSON to BigInt too; canonical throws on a bare BigInt (no `toJSON`) same as native.
  Scope decision: restrict `applyToJSON` to non-null objects (record payloads carry no bigint-with-toJSON) — name it.
- **double toJSON at one level** — native resolves toJSON ONCE per value; confirm `applyToJSON` does not loop.

## Runtime Probes (claim → verification)

| Claim | Probe | Result |
|---|---|---|
| Date serializes to `'{}'` today (the bug) | read `canonical-json.js:62,83` + `Object.keys(new Date())` | ✓ empty keys → `'{}'` |
| the residual test pins the current output | read `canonical-json.test.js:114-119` | ✓ asserts `'{"d":{}}'` + diverges-from-native |
| callers fail-closed on a throw | read `canonical-json.js:22-28` header | ✓ appendRecord S5 → record-uncomputable |

## VERIFY board (architect + hacker, parallel free-text — 2026-07-10)

**Both lenses: PROCEED-WITH-FOLDS.** No CRITICAL — the fix is byte-consistent with native for every DETERMINISTIC
value class (hacker probed 15/15 `== native`; no forgeable collision — the Date/ISO identity is the same
storage-layer-collapsed collision as #77's `{a,b:undefined}=={a}`). Architect confirmed byte-parity against ECMA-262
`SerializeJSONProperty` step-by-step; node-accounting (#108) preserved; resolve-once = native (a `toJSON` returning a
Date/toJSON-object is NOT re-resolved at the same level).

### MANDATORY fold (convergent — architect F2 + hacker H1)

**Single-read `.toJSON` + `fn.call(v, key)`.** The plan's `applyToJSON` read `.toJSON` TWICE (`typeof v.toJSON` then
`v.toJSON(key)`); native reads it ONCE (GetV → IsCallable → Call on the same local). The double-read (a) breaks the
#108 single-read invariant and (b) opens a getter divergence: a flip-getter → mint hashes read#2, disk gets read#1 →
`content-address-mismatch` suppression (the exact bug this fix closes). Live-probed. Fixed in the Design block above:
`const fn = v.toJSON; if (typeof fn === 'function') return fn.call(v, key);`. **`.call(v, key)` is load-bearing** — a
bare `fn(key)` loses `this` → `Date.prototype.toJSON` throws → breaks EVERY Date (worse than the bug).

### Folds to apply

1. **[architect F1 — pin, don't fix] Boxed primitives are an UNPINNED same-class residual.** `new Number(5)`/`new
   String`/`new Boolean` have no `toJSON`, so `applyToJSON` passes them through → object branch → `'{}'`, but native
   unwraps (step 4) → `5`. `{x:new Number(5)}` mints `{"x":{}}`, disk/read `{"x":5}` → the SAME false
   `content-address-mismatch`. FIXING is scope-creep beyond #99 (toJSON class); PINNING is required by the codebase's
   no-silent-residual discipline (mirror how #77 pinned the toJSON residual). → a documented residual test + header
   note + a filed sibling issue.
2. **[hacker M1 — scope + pin] Non-idempotent toJSON** (counter/`Date.now`/random/mutating) still mints-then-rejects,
   but fails CLOSED (suppression, not forgery — native is equally non-deterministic; a value that changes each read is
   unhashable by definition). SCOPE the "no new mint-then-reject" claim to DETERMINISTIC toJSON; pin a test showing the
   non-idempotent class fails closed (safe-direction).
3. **[hacker M2 — name] Key-dependent toJSON breaks INV-22 dedup.** `computeRecordId` hashes payload at key `"payload"`;
   `deriveIdempotencyKey` hashes it standalone at root key `""`. A key-sensitive `payload.toJSON(key)` diverges → the
   idempotency_key is mint-vs-read inconsistent → the record is skipped as a poison record (dedup bypassed, fail-safe).
   Exotic; NAME it in the header note (no code change).
4. **[architect F3/F4] Test completeness** — resolve-once (`{a:{toJSON(){return new Date(0)}}}` → `'{"a":{}}'` ==
   native; inner-toJSON-object dropped); non-callable `{d:{toJSON:5}}` == native; throwing toJSON → throws == native
   (fail-closed at mint); a stable getter-valued toJSON == native (locks the single-read fold).
5. **[architect F5 / hacker L1,L2 — header notes] Name** the BigInt-exclusion fail-closed reasoning (native step 2 is
   Object OR BigInt; a bigint-with-toJSON throws at mint → fail-closed), the prototype-pollution note (the fix converts
   pollution-suppression into pollution-collision; both native+store are already game-over under `Object.prototype`
   pollution), and the throw-message note (a throwing toJSON's message is discarded by the bare `catch`, `record.js:116`
   — no leak; flag for a future logging caller).

### Confirmed (no action)

- **F6 caller catch scope** — a throwing toJSON is caught: `record.js:116` is a bare `catch` → null →
  record-uncomputable; the store's `appendRecord` catches the `computeRecordId` path too (hacker live-probed). A throw
  at mint = record never minted = no read side = no mint-then-reject.

**Scope stays 2 files** (+ the pins/header notes are within those 2). Severity MEDIUM (bug/correctness/security).

## VALIDATE result (code-reviewer + hacker live-reprobe + honesty-auditor, 3-lens — 2026-07-10)

**All three lenses cleared it.** hacker **PROCEED** (40000-tree randomized differential fuzz + a hand matrix on the
BUILT module → ZERO mint≠read divergences for any IN-SCOPE deterministic value (boxed primitives are the pinned #110
residual, a distinct value class explicitly out of #99 scope); single-read fold confirmed LANDED via a
flip-getter; no forgeable collision; every DoS/throw fails closed with a controlled TypeError; toJSON call-count
bounded at exactly MAX_NODES). code-reviewer **PASS-WITH-NITS**; honesty-auditor **PASS-WITH-NOTES (grade B)**.

### Post-VALIDATE folds applied

- **[code-reviewer MEDIUM + honesty Finding A — convergent] The single-read "lock" test was VACUOUS** — it used a
  STABLE getter (same fn each read), so a double-read impl passed it (the guard the honesty-auditor called "theater").
  Replaced with a FLIP+COUNT getter that asserts `reads === 1` + the output is read#1. **Proven non-vacuous**: injecting
  the double-read the VERIFY board rejected turns exactly this test RED (26/1), revert → 27/0. The regression net for the
  MANDATORY fold now actually discriminates.
- **[code-reviewer LOW + honesty Finding B] The BigInt header note (VERIFY fold #5) was MISSING** — added to the
  KNOWN RESIDUALS block + a `canonicalJsonSerialize({n:10n})` throws-at-mint == native test.
- **[honesty Finding C] The boxed-primitive residual cited no issue** — filed **#110** (the boxed-primitive
  mint-then-reject, same class, deferred); the code comment + the pinned test now cite it.
- **[honesty Finding D — INFO] The honesty-auditor lacked Bash** so flagged 818/0 + the 2-file scope as unverified-by-it;
  the orchestrator verified both directly (full suite green, `git diff --stat` = 2 files + this plan).

### Confirmed (no action)

- **No surviving mint-then-reject for a DETERMINISTIC in-scope value (boxed primitives excepted — #110); no new forgeable collision** (hacker's 40000-tree fuzz +
  matrix). The Date/ISO collapse is the intended native-consistent storage identity (same class as #77's
  `{a,b:undefined}=={a}`), not a new forge.
- **NO-OP for toJSON-free values** — every existing on-disk content-address is unchanged (deductive: a JSON round-trip
  strips methods, so read-back bodies have no callable toJSON → `applyToJSON` is identity). Full suite green corroborates.
- **#108 node accounting preserved** — one increment per key; toJSON call-count bounded at ~budget (hacker probed the
  all-present AND all-absent cases both abort at exactly MAX_NODES, no drift).

**Named residuals (pinned, NOT closed by #99):** boxed primitives (**#110**), non-idempotent toJSON (fail-closed
suppression), key-dependent toJSON (INV-22 dedup fail-safe), prototype-pollution (native-consistent, game-over anyway).

**Gate: full suite 821/0, eslint 0. Pre-PR CodeRabbit: 4 Minor (all plan/test-doc; #3 BigInt was a false positive
refuted by a firsthand probe — canonical honors a bigint-with-prototype-toJSON via scalar delegation, == native), folded.**
