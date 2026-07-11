// packages/kernel/_lib/canonical-json.js
//
// Pure, stateless canonical JSON serialization (sorted keys, no whitespace).
//
// EXTRACTED from transaction-record.js (v3.4 Wave 0) so non-state callers — e.g. the Lab's
// ADVISORY negative-attestation store — can depend on the canonical-encoding RULE without
// importing the kernel record-STATE module (the Lab containment boundary, RFC §2 Layer 3 /
// store.test.js Test 8 forbids importing transaction-record). transaction-record.js re-exports
// this verbatim for back-compat — the output is byte-identical (INV-22 / M1 forward-coupling:
// a drift in these bytes silently breaks idempotency dedup substrate-wide).
//
// Required for stable content hashing per v6 §4.2 transaction_id derivation, and for
// cross-node-reproducible ids generally (sorted keys → key-insertion-order-independent).

'use strict';

// Hardening (3-lens hacker re-verify HIGH + L1 follow-up): bound the recursion on BOTH axes.
// A transaction record is FLAT and SMALL (scalar fields + a small evidence_refs string-array —
// depth <= 2, a few dozen nodes); legitimate input never approaches either limit. An UNBOUNDED
// walk let a pathological field overflow the stack (DEEP nesting -> RangeError; the PR-4 crash)
// OR burn O(n) CPU at the S5 hash (WIDE structure, e.g. a 1M-entry evidence_refs; the L1 gap).
// Both are crash/DoS-flavored record-suppression surfaces (the store is not a sandbox —
// p-writescope). Past EITHER bound we throw a CONTROLLED TypeError that callers catch +
// fail-closed (appendRecord S5 -> record-uncomputable; deriveIdempotencyKey -> null), never an
// uncaught RangeError and never a multi-hundred-ms hash. The node budget is a call-local
// accumulator (a closed-over counter, NOT shared/persisted state); the public signature stays
// single-arg so every caller (computeTransactionId/computeContentHash/computeIdempotencyKey) is
// unaffected and a legit record hashes to the SAME bytes (M1 forward-coupling preserved).
const MAX_CANONICAL_DEPTH = 100;
const MAX_CANONICAL_NODES = 10000;

// F1 (#77) -- the JSON-ABSENT scalar class. Native JSON.stringify produces NO token for `undefined`, a function, or
// a symbol: in an OBJECT the key is OMITTED, in an ARRAY the element becomes `null`. The record WRITE path uses
// native JSON.stringify, so canonical MUST match that or the build-time content-address hash disagrees with the
// read-back hash (a false `content-address-mismatch` / class:attack + a null read -- the F1 bug). NO-OP for any
// value with none of these (a value already free of them is byte-stable -- the deductive proof: every on-disk body
// was written via native JSON.stringify, so every parsed-back body is already JSON-absent-free, so the fix is
// identity for it; every existing READABLE content-address is unchanged).
// SIBLING (#99) -- `toJSON`: a distinct value-TRANSFORM mechanism native applies FIRST (Date -> ISO string). Handled by
// applyToJSON below (mirrors SerializeJSONProperty step 2a), closing the SAME mint-then-reject + false class:attack as
// #77 for the toJSON/Date value class.
function isJsonAbsent(x) {
  return x === undefined || typeof x === 'function' || typeof x === 'symbol';
}

// #99 -- native SerializeJSONProperty step 2a: an object with a callable `toJSON` is TRANSFORMED before the type
// dispatch (Date -> ISO string), and native threads the property key. Resolved in the PARENT (before isJsonAbsent) so a
// toJSON RETURNING undefined correctly DROPS the object key / NULLS the array element -- walk() returns a string
// unconditionally, so only the parent can omit/null. SINGLE read of `.toJSON` (mirrors native's one GetV): reading it
// twice diverges from the native WRITE path for a getter-valued toJSON (mint would hash read#2 while disk gets read#1 ->
// the exact content-address-mismatch this closes). `fn.call(v, key)` preserves `this` -- a bare fn(key) loses it and
// Date.prototype.toJSON throws on EVERY Date. Native resolves toJSON ONCE per value (does NOT loop): the RESULT is
// walked without re-applying toJSON at the same level (a returned toJSON-bearing object leaves that inner toJSON a
// dropped function-property, like native). A THROWING toJSON propagates -> fail-closed at mint (record uncomputable =
// never minted = no read side = no mint-then-reject); its message is discarded by the caller's bare catch (record.js).
//
// KNOWN RESIDUALS of the SAME content-address-mismatch class -- pinned in canonical-json.test.js so NOT silent:
//   * NON-IDEMPOTENT toJSON (counter/Date.now/mutating): unhashable by definition -> mint != read -> the store fails
//     CLOSED (suppression), the safe direction; native is equally non-deterministic.
//   * KEY-DEPENDENT toJSON: computeRecordId hashes payload at key "payload" but deriveIdempotencyKey hashes it at root
//     key "" (record.js) -> a key-sensitive toJSON makes the idempotency_key mint-vs-read inconsistent -> the record is
//     skipped as a poison record (INV-22 dedup fail-safe, not forgery). Exotic.
//   * PROTOTYPE POLLUTION (Object.prototype.toJSON set): every object canonicalizes to the polluted value
//     (native-consistent); both native + store are already game-over under prototype pollution.
// (BigInt + BOXED PRIMITIVES are HANDLED, not residuals: applyToJSON mirrors native's Object-OR-BigInt step-2 dispatch
// + the step-4 boxed-primitive unwrap (unwrapBoxed below), and the walk-scalar throw rejects any bigint reaching a
// leaf. #111 [BigInt] + #110 [boxed] -> canonical is now a COMPLETE mirror of native's SerializeJSONProperty.)
// Captured at module load so the boxed-primitive slot-DETECTION below resists LATER prototype pollution of these
// methods (native step-4 detection reads the true internal slot; capturing the built-in valueOf -- which reads the
// slot -- is the closest JS approximation). (VALIDATE M2.)
const OBJ_TO_STRING = Object.prototype.toString;
const NUM_VALUEOF = Number.prototype.valueOf;
const STR_VALUEOF = String.prototype.valueOf;
const BOOL_VALUEOF = Boolean.prototype.valueOf;
const BIGINT_VALUEOF = BigInt.prototype.valueOf;

// native SerializeJSONProperty step 4 (#110): unwrap a boxed primitive to its primitive, detected BY INTERNAL SLOT.
// A captured `X_VALUEOF.call(out)` throws iff `out` lacks the [[XData]] slot -> realm-independent + resists
// `Object.create(X.prototype)` (instanceof-true but SLOT-LESS -> not unwrapped -> walks as {} == native, no throw) and
// the `Symbol.toStringTag` spoof (the tag pre-filter routes it in, the slot-probe rejects it). The tag pre-filter is a
// PERF gate ONLY (VALIDATE code-reviewer: 4 thrown exceptions per non-boxed object node was ~38x on wide structures)
// and is caller-spoofable, so the slot-probe stays the authority. SPLIT the slot-probe from the CONVERSION (VALIDATE
// hacker H1): a boxed primitive whose valueOf/@@toPrimitive THROWS must fail-closed at mint (the conversion throw
// PROPAGATES == native), NOT be swallowed into a colliding plain-object walk. Per-slot conversion mirrors native:
// Number -> ToNumber via unary `+` (throws on a bigint result == native, unlike Number()=ToNumeric -- VALIDATE M1);
// String -> ToString (`String()`, toString-first); Boolean/BigInt -> the RAW captured slot (ignores an overridden
// valueOf). A boxed BigInt yields a primitive bigint -> the walk-scalar throw rejects it == native's throw.
function unwrapBoxed(out) {
  const tag = OBJ_TO_STRING.call(out);
  if (tag !== '[object Number]' && tag !== '[object String]' && tag !== '[object Boolean]' && tag !== '[object BigInt]') {
    return { hit: false }; // fast path: not a boxed-primitive candidate (the common object/array/Date case)
  }
  let slot = null;
  try { NUM_VALUEOF.call(out); slot = 'num'; } catch { /* no [[NumberData]] */ }
  if (slot === null) { try { STR_VALUEOF.call(out); slot = 'str'; } catch { /* no [[StringData]] */ } }
  if (slot === null) { try { return { hit: true, v: BOOL_VALUEOF.call(out) }; } catch { /* no [[BooleanData]] */ } }
  if (slot === null) { try { return { hit: true, v: BIGINT_VALUEOF.call(out) }; } catch { /* no [[BigIntData]] */ } }
  if (slot === 'num') return { hit: true, v: +out };            // ToNumber; a throwing conversion PROPAGATES (fail-closed)
  if (slot === 'str') return { hit: true, v: String(out) };     // ToString (toString-first)
  return { hit: false }; // tag matched but no real slot (a Symbol.toStringTag spoof) -> not unwrapped == native {}
}

function applyToJSON(v, key) {
  let out = v;
  // step 2a: native's dispatch is Object-OR-BigInt -- a bigint with a (prototype) toJSON is transformed at the PARENT
  // so its toJSON receives the correct property key (a leaf JSON.stringify would re-wrap it at root key '' and lose the
  // key -- CodeRabbit Major). Reflect.apply, NOT `fn.call(v, key)`: `.call` is read off the UNTRUSTED toJSON, so a
  // payload-supplied own `.call` would hijack serialization; Reflect.apply uses the internal [[Call]] == native.
  if ((v !== null && typeof v === 'object') || typeof v === 'bigint') {
    const fn = v.toJSON;
    if (typeof fn === 'function') out = Reflect.apply(fn, v, [key]);
  }
  // step 4: unwrap a boxed primitive from the POST-toJSON value (so a boxed value RETURNED by a toJSON is unwrapped too).
  if (out !== null && typeof out === 'object') {
    const boxed = unwrapBoxed(out);
    if (boxed.hit) return boxed.v;
  }
  return out;
}

/**
 * Canonical JSON serialization (sorted keys, no whitespace).
 * Required for stable content hashing per §4.2 transaction_id derivation.
 *
 * @param {*} value Any JSON-serializable value
 * @returns {string} Canonical JSON string with sorted keys
 */
function canonicalJsonSerialize(value) {
  let nodeCount = 0;
  function walk(v, depth) {
    if (depth > MAX_CANONICAL_DEPTH) {
      throw new TypeError('canonicalJsonSerialize: max nesting depth exceeded (' + MAX_CANONICAL_DEPTH + ')');
    }
    if (++nodeCount > MAX_CANONICAL_NODES) {
      throw new TypeError('canonicalJsonSerialize: max node budget exceeded (' + MAX_CANONICAL_NODES + ')');
    }
    // a bigint reaching a leaf is unserializable by native's rules -- a BARE bigint (native JSON.stringify throws) OR a
    // value a toJSON RETURNED (native resolves toJSON ONCE then throws on the bigint result; it does NOT re-apply
    // BigInt.prototype.toJSON). Throw here: a `JSON.stringify(bigint)` delegation would RE-resolve toJSON at the wrong
    // key and emit bytes native rejects (a content-hash desync -- CodeRabbit Major). A bigint WITH a toJSON was already
    // transformed at the parent by applyToJSON. Fail-closed at mint == native (callers catch).
    if (typeof v === 'bigint') throw new TypeError('canonicalJsonSerialize: cannot serialize a BigInt');
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) {
      // native serializes arrays BY INDEX (0..length-1): a JSON-absent element (incl. a SPARSE HOLE, read as
      // `undefined` via v[i]) becomes `null`, and any overridden `Symbol.iterator` is IGNORED. Use an index loop --
      // NOT `.map` (skips holes -> invalid `[1,,2]`, VALIDATE) and NOT `Array.from` (honors a custom iterator -> a
      // hash divergence from the native write path, e.g. a poisoned array field: pre-PR CodeRabbit).
      const parts = [];
      for (let i = 0; i < v.length; i += 1) {
        const x = applyToJSON(v[i], String(i)); // #99: native transforms each element via toJSON (index key) FIRST
        parts.push(walk(isJsonAbsent(x) ? null : x, depth + 1));
      }
      return '[' + parts.join(',') + ']';
    }
    // native: a JSON-absent object VALUE omits the key. Sort the keys FIRST, then a SINGLE pass reads each value
    // EXACTLY once (a hash primitive must be deterministic -- re-reading a getter that flips defined<->undefined
    // would re-introduce a bareword) that both drops a JSON-absent key and recurses on a present one. Every key --
    // dropped OR walked -- costs one node-budget increment (a dropped key HERE; a present key at its walk() entry),
    // so processing aborts at ~budget in BOTH the all-absent AND all-present cases: the getter READS are bounded,
    // not just the final reject (the prior .map()-then-.filter() read every value getter before it could abort).
    // Object.keys(v).sort() (default comparator) sorts by the same UTF-16 key order as the prior a[0]<b[0] key
    // comparator -- byte output unchanged (the DoS guard is not bypassed; VALIDATE).
    const sortedKeys = Object.keys(v).sort();
    const parts = [];
    for (let i = 0; i < sortedKeys.length; i += 1) {
      const k = sortedKeys[i];
      const val = applyToJSON(v[k], k); // #99: native transforms each value via toJSON (property key) FIRST; a
      if (isJsonAbsent(val)) {          // toJSON->undefined then drops the key here, exactly like native's omit.
        if (++nodeCount > MAX_CANONICAL_NODES) {
          throw new TypeError('canonicalJsonSerialize: max node budget exceeded (' + MAX_CANONICAL_NODES + ')');
        }
        continue;
      }
      parts.push(JSON.stringify(k) + ':' + walk(val, depth + 1));
    }
    return '{' + parts.join(',') + '}';
  }
  return walk(applyToJSON(value, ''), 0); // #99: native wraps the root as {"": value} -> root toJSON key is ''
}

module.exports = { canonicalJsonSerialize, MAX_CANONICAL_DEPTH, MAX_CANONICAL_NODES };
