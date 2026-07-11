---
lifecycle: persistent
plan: 52
issue: 110
finding: F1-sibling (boxed primitives)
severity: medium
lens: correctness
---

# plans/52 — canonical-json unwraps boxed primitives (native step 4), closing the residual cascade #77→#99→#110

## Problem (the pinned #110 residual)

`canonicalJsonSerialize` matches native for the JSON-absent scalar class (#77), the `toJSON` value class (#99), and
the BigInt dispatch (#111). It still does NOT unwrap **boxed primitives**: native's `SerializeJSONProperty` step 4
unwraps a `[[NumberData]]`/`[[StringData]]`/`[[BooleanData]]` object to its primitive AFTER toJSON, but canonical
serializes the raw object shape → `{}`. So `{x: Object(5)}` mints over `{"x":{}}` while the native WRITE path emits
`{"x":5}` → build-time hash ≠ read-back hash → false `content-address-mismatch` (class:attack) + null read. Same
mint-then-reject class as #77/#99, distinct value class. Reachable BOTH as a direct field AND as a `toJSON` RETURN
value (both pinned in the #99 test). Closing this makes canonical a COMPLETE faithful mirror of native's
`SerializeJSONProperty`, ending the residual cascade.

## Premise-probe (firsthand, against native)

- Native unwraps: `{x:Object(5)}`→`{"x":5}`, `{x:Object("ab")}`→`{"x":"ab"}`, `{x:Object(true)}`→`{"x":true}`, and a
  `toJSON` returning `Object(5)`→`{"x":5}` (step 4 runs on the post-toJSON value).
- **Detection = `instanceof Number/String/Boolean`** (spoof-safe): a `Symbol.toStringTag="Number"` spoof (a plain
  object) → native emits `{}` (it checks the internal [[NumberData]] slot, which the spoof lacks); `instanceof Number`
  is `false` → NOT unwrapped → matches native. `Object.prototype.toString.call(spoof)` returns the SPOOFED
  `[object Number]`, so a `toString.call`-based detector would WRONGLY unwrap it — `instanceof` is correct.
- **Realm caveat (named residual, NOT a regression):** `instanceof` is realm-bound, so a boxed primitive from another
  vm/realm would not be unwrapped (native's internal-slot check is realm-independent). PACT record payloads are
  single-realm local objects — no cross-realm boxed primitives — so this is out of scope (documented, not a live path).

## Design — a step-4 unwrap in `applyToJSON`, AFTER the toJSON step (REVISED per the VERIFY board)

**The initial `instanceof` + `out.valueOf()` design was WRONG (VERIFY board NEEDS-REVISION → revised).** Native step 4
is type-ASYMMETRIC and slot-based, NOT a uniform `valueOf`: Number → `ToNumber` (honors `@@toPrimitive`), String →
`ToString` (`toString`-first), Boolean/BigInt → the RAW internal slot (ignores an overridden `valueOf`). And
`instanceof` is a prototype-chain test, not a slot test — `Object.create(Number.prototype)` is `instanceof`-true but
slot-less, so `out.valueOf()` THROWS (regressing a currently-clean `{}` case to un-mintable). Faithful design:

**FINAL code (superseding the VERIFY-era snippet after the VALIDATE folds — a tag pre-filter was tried for perf and
REMOVED as unsound; see the VALIDATE result):**

```js
const NUM_VALUEOF = Number.prototype.valueOf, STR_VALUEOF = String.prototype.valueOf,
      BOOL_VALUEOF = Boolean.prototype.valueOf, BIGINT_VALUEOF = BigInt.prototype.valueOf; // captured at module load
// native step 4: unwrap a boxed primitive BY INTERNAL SLOT. The throw-based slot-probe is the SOLE SOUND detector
// (every cheaper check -- toString tag, instanceof, proto -- is spoofable one way or the other). Only Array.isArray is
// a sound cheap fast-skip. SPLIT the slot-probe from the CONVERSION so a throwing valueOf/@@toPrimitive fails-closed
// (propagates == native), not swallowed into a colliding {} walk. Per-slot: Number -> ToNumber (unary +; throws on a
// bigint == native, unlike Number()=ToNumeric), String -> ToString (String()), Boolean/BigInt -> RAW captured slot.
function unwrapBoxed(out) {
  if (Array.isArray(out)) return { hit: false };
  let slot = null;
  try { NUM_VALUEOF.call(out); slot = 'num'; } catch { /* no [[NumberData]] */ }
  if (slot === null) { try { STR_VALUEOF.call(out); slot = 'str'; } catch { /* no [[StringData]] */ } }
  if (slot === null) { try { return { hit: true, v: BOOL_VALUEOF.call(out) }; } catch { /* no [[BooleanData]] */ } }
  if (slot === null) { try { return { hit: true, v: BIGINT_VALUEOF.call(out) }; } catch { /* no [[BigIntData]] */ } }
  if (slot === 'num') return { hit: true, v: +out };
  if (slot === 'str') return { hit: true, v: String(out) };
  return { hit: false };
}
// applyToJSON: after the toJSON step, if the (post-toJSON) value is an object, unwrap a boxed primitive.
//   if (out !== null && typeof out === 'object') { const b = unwrapBoxed(out); if (b.hit) return b.v; }
```

**Order (probed):** toJSON (step 2) FIRST, then step-4 unwrap on the RESULT — matches native (a toJSON RETURNING a boxed
primitive is unwrapped; a boxed primitive WITH a toJSON has toJSON applied first). No interaction with the BigInt
dispatch (a primitive bigint is not an object). The slot-probe dissolves the realm caveat (realm-independent).

**Premise-probed against native across the FULL adversarial matrix (13 cases the VERIFY board found):** plain
Number/String/Boolean; Boolean `valueOf=>false` (→ slot `true`); String `valueOf`/`toString` overrides; Number
`@@toPrimitive`/`valueOf=>"5"`/`valueOf=>{}`; `Object.create(Number.prototype)` (→ `{}`, no throw); `class X extends
Number` (→ real slot); the toStringTag spoof (→ `{}`); boxed BigInt (→ throw). ALL == native.

## Scope (2 files) — CLOSES #110

1. `v0/src/lib/canonical-json.js` — add the step-4 unwrap to `applyToJSON`; update the header residuals block (boxed
   primitives now HANDLED; keep the realm caveat as a named residual).
2. `v0/test/unit/canonical-json.test.js` — FLIP the two boxed-primitive residual assertions (direct + toJSON-return)
   to `== native`; add String/Boolean, the toStringTag-spoof (stays `{}` == native), toJSON-precedence, and a
   mint-vs-read invariant.

## Test plan (RED-first)

Flip the residual assertions + add the new cases against the CURRENT impl → expect RED (the direct/toJSON-return boxed
cases still emit `{}`), then implement:
- **direct field** — `canonical({x:Object(5)}) === '{"x":5}'` == native; mint == read.
- **String / Boolean** — `Object("ab")`→`"ab"`, `Object(true)`→`true`, == native.
- **toJSON return** — `{x:{toJSON(){return Object(5)}}}` → `{"x":5}` == native.
- **toStringTag spoof stays `{}`** — a plain object faking `[object Number]` is NOT unwrapped (== native) — the
  non-vacuity guard that the detector is `instanceof`, not `toString`.
- **toJSON precedence** — a boxed primitive with a `toJSON` applies toJSON first.

## Edge cases for the VERIFY board

- detection method (`instanceof` vs `valueOf`-slot vs `toString`) + the `Symbol.toStringTag` spoof + the realm caveat.
- step-4 ORDER (after toJSON) + no interaction with the BigInt dispatch or the node budget.
- does unwrapping a boxed primitive open any NEW collision / mint-then-reject (it removes a divergence, so it should
  only ADD native-consistency — confirm)?

## Runtime Probes (claim → verification)

| Claim | Probe | Result |
|---|---|---|
| native unwraps boxed primitives | `JSON.stringify({x:Object(5)})` | ✓ `{"x":5}` |
| `instanceof` ignores a toStringTag spoof | `spoof instanceof Number` | ✓ false → `{}` == native |
| the #99 test pins the residual | `canonical-json.test.js` boxed residual test | ✓ asserts `{"x":{}}` + diverges |

## VERIFY board (architect + hacker, parallel free-text — 2026-07-11)

**architect NEEDS-REVISION, hacker PROCEED-WITH-FOLDS — both converged on the same core flaw: the initial `instanceof`
+ `out.valueOf()` design is NOT native's step-4 unwrap** (the same "the adversarial lens attacks the shapes you didn't
pick" lesson as the #99 BigInt finding — my premise-probe tested only plain boxed + the toStringTag spoof).

- **[HIGH — re-opens the mint-then-reject] `out.valueOf()` ≠ native's per-slot conversion.** Native reads the Boolean
  slot directly (ignoring an overridden `valueOf`), uses `toString`-first for String, and `ToNumber` (honoring
  `@@toPrimitive`) for Number. A boxed Boolean with `valueOf=>false` → the naive fix emits `false`, native emits `true`
  (the slot) → mint≠read with ATTACKER-CHOSEN bytes — the exact #110 class re-opened. (Fails closed; unreachable from
  wire input — JSON.parse never yields a boxed primitive — but ships wrong bytes.)
- **[HIGH — regression] `instanceof` over-matches the slot check.** `Object.create(Number.prototype)` is
  `instanceof`-true but slot-less → `out.valueOf()` throws → a value that mints+reads cleanly TODAY becomes un-mintable.
- **[MEDIUM — completeness] boxed BigInt** (`Object(1n)`) was unhandled by the naive `instanceof Number/String/Boolean`.

**Revision (applied to the Design above):** detect by INTERNAL SLOT (`X.prototype.valueOf.call` slot-probe —
realm-independent, spoof-safe, no create-proto false-positive) + convert PER-SLOT (Number→`Number()`, String→`String()`,
Boolean/BigInt→raw slot). Premise-probed against native across all 13 adversarial shapes → ALL == native. Closes the
architect's findings 1/2/3 + the hacker's H-1/H-2/M-1 together; dissolves the realm caveat.

**Test plan gains (hacker L-1 non-vacuity):** the RED-first tests MUST include the adversarial shapes (shadowed
`valueOf`/`toString`/`@@toPrimitive`, `Object.create(proto)`, `class extends`, boxed BigInt), not just plain boxed — a
green suite over only plain boxed would assert nothing about the surface that actually diverged.

## VALIDATE result (code-reviewer + hacker live-reprobe, 2-lens — 2026-07-11)

**Both PROCEED/PASS-WITH-issues, and the hacker found MORE (the third time this session the adversarial lens caught
shapes my firsthand probe missed — a consistent signal to premise-probe adversarial shapes, not convenient ones).** All
firsthand-verified + folded:

- **[hacker H1, HIGH — real content-address COLLISION] the slot-probe and the CONVERSION shared one `catch`.** A boxed
  primitive with a THROWING `valueOf`/`@@toPrimitive` had its conversion-throw SWALLOWED → walked as a plain object →
  `{a: throwingBox}` and `{a: {}}` minted the SAME record_id + idempotency_key (confirmed through the real `record.js`
  pipeline), where native THROWS. It also defeated `record.js`'s fail-closed `null` contract. Fix: SPLIT the slot-probe
  from the conversion so a throwing conversion PROPAGATES (fail-closed at mint == native). Live-verified the collision
  is closed (box THROWS, `{}` mints distinctly).
- **[hacker M1, MEDIUM] `Number(out)` = ToNumeric accepts a bigint; native step-4a = ToNumber throws.** A boxed Number
  whose `valueOf`→bigint diverged (`{"a":10}` vs native throw). Fix: unary `+out` (ToNumber) → both throw.
- **[hacker M2, MEDIUM] the slot-probe misfired under `Number.prototype.valueOf` pollution** (my "spoof-safe" claim was
  overstated). Fix: CAPTURE the built-in `valueOf`/`toString` at MODULE LOAD (`NUM_VALUEOF` etc.) so DETECTION is
  pollution-resistant, + a tag pre-filter (below) that skips a plain object before the slot-probe. Corrected the comment.
- **[code-reviewer #1, MEDIUM perf — ~38x] the 4-exception cascade ran on every object node.** For a wide plain-object
  structure (3000 objects) it was 52.9ms/call (was ~1.4ms). Fix: an `Object.prototype.toString` tag PRE-FILTER (a fast
  string compare, no throw) skips non-boxed candidates; the slot-probe stays the authority for tag-matching candidates.
  Re-measured: **1.60ms/call** (baseline restored). Confirmed non-breaking (a plain object/`Object.create(proto)` tags
  as `[object Object]` → fast-skip; the toStringTag spoof tags in but the slot-probe rejects it).
- **[code-reviewer #2, LOW] deleted a stray `plans/51-...tojson 2.md` copy.**

**Premise-probed the BUILT module against native across the full matrix (plain / shadowed valueOf+toString+@@toPrimitive
/ throwing conversion / valueOf→bigint / Object.create(proto) / class-extends / toStringTag-spoof / boxed BigInt /
polluted Number.prototype.valueOf / plain / Date): ALL == native (byte-identical or both-throw).**

### Pre-PR CodeRabbit fold (2 Major, both firsthand-probed + folded)

- **[Major, correctness] the tag pre-filter was UNSOUND** — a REAL boxed primitive with an own `Symbol.toStringTag`
  reports a non-boxed tag (`[object Foo]`) → my pre-filter skipped it → `{}` while native unwraps to `5` (the FOURTH
  time this session the async-bot/adversarial lens caught a shape I didn't probe). Confirmed firsthand. Fix: REMOVED the
  tag pre-filter — the throw-based slot-probe is the SOLE sound detector (every cheaper check is spoofable one way or
  the other); kept only a sound `Array.isArray` fast-skip. Perf trade accepted: a typical record is ~51µs/call
  (negligible); the ~57ms ceiling is only a pathological near-budget wide structure (bounded by MAX_CANONICAL_NODES).
  Correctness > the perf optimization for the integrity primitive.
- **[Major, doc] the plan's Design snippet was stale** (VERIFY-era `Number(out)`, no split) — an implementer could copy
  it and reintroduce the H1 collision. Synced the Design block to the FINAL code.

**Gate: canonical-json 37/37, full suite 830/0, eslint 0. Closes #110 → canonical is a COMPLETE mirror of native
`SerializeJSONProperty`.**
