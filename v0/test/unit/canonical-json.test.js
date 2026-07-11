#!/usr/bin/env node
'use strict';

// PACT v0 -- lib/canonical-json.js unit tests (issue #77 / F1).
//
// canonicalJsonSerialize is the SOLE content-address hash primitive under the whole trust store. The F1 bug:
// a nested `undefined` (and function/symbol) fell through to a BAREWORD (`{"b":undefined}` / `[1,,2]`) -- invalid
// JSON in the hash preimage -- while the native-JSON.stringify WRITE path drops/nulls it, so the build-time hash
// disagreed with the read-back hash -> false `content-address-mismatch` (class:attack) + a null read. The fix makes
// canonical MATCH NATIVE for the JSON-absent SCALAR class (undefined/function/symbol). toJSON parity is a DEFERRED
// sibling (a distinct value-transform mechanism) -- pinned below as a KNOWN residual so it is not silent.

const assert = require('node:assert/strict');
const { canonicalJsonSerialize } = require('../../src/lib/canonical-json');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// ---- the NO-OP proof: undefined-FREE values are byte-stable (every existing content-address unchanged) ----
test('NO-OP: an undefined-free value serializes byte-identically (sorted keys), == native round-trip', () => {
  const v = { z: 1, a: [1, 2, { k: 'v' }], m: { b: true, a: null } };
  assert.equal(canonicalJsonSerialize(v), '{"a":[1,2,{"k":"v"}],"m":{"a":null,"b":true},"z":1}');
  // the content-address invariant: canonical(x) === canonical(JSON.parse(JSON.stringify(x))) for JSON-clean x
  assert.equal(canonicalJsonSerialize(v), canonicalJsonSerialize(JSON.parse(JSON.stringify(v))));
});

// ---- undefined (the filed F1) ----
test('F1: a nested undefined OBJECT value is DROPPED (matches native), not a bareword', () => {
  assert.equal(canonicalJsonSerialize({ a: 1, b: undefined }), '{"a":1}');
  assert.equal(canonicalJsonSerialize({ a: 1, b: undefined }), canonicalJsonSerialize(JSON.parse(JSON.stringify({ a: 1, b: undefined }))));
});
test('F1: a nested undefined ARRAY element becomes null (matches native), not an empty slot', () => {
  assert.equal(canonicalJsonSerialize([1, undefined, 2]), '[1,null,2]');
});
test('F1: a DEEP nested undefined is dropped at its own level', () => {
  assert.equal(canonicalJsonSerialize({ a: { b: undefined, c: 2 } }), '{"a":{"c":2}}');
  assert.equal(canonicalJsonSerialize({ a: [1, { d: undefined, e: 3 }] }), '{"a":[1,{"e":3}]}');
});

// ---- function / symbol (same JSON-absent scalar class; native drops/nulls them too) ----
test('function value: dropped in an object, null in an array (matches native)', () => {
  assert.equal(canonicalJsonSerialize({ a: 1, f: function () {} }), '{"a":1}');
  assert.equal(canonicalJsonSerialize([1, function () {}, 2]), '[1,null,2]');
});
test('symbol value: dropped in an object, null in an array (matches native)', () => {
  assert.equal(canonicalJsonSerialize({ a: 1, s: Symbol('x') }), '{"a":1}');
  assert.equal(canonicalJsonSerialize([1, Symbol('x'), 2]), '[1,null,2]');
});

// ---- determinism: a getter returning undefined is dropped (single-read; not a bareword) ----
test('determinism: a getter that returns undefined is dropped, not read into a bareword', () => {
  const o = { a: 1 };
  Object.defineProperty(o, 'b', { get() { return undefined; }, enumerable: true });
  assert.equal(canonicalJsonSerialize(o), '{"a":1}');
});

// ---- the collision the fix creates is the CORRECT native-consistent identity ----
test('{a,b:undefined} and {a} hash identically -- the storage layer always collapsed them', () => {
  assert.equal(canonicalJsonSerialize({ a: 1, b: undefined }), canonicalJsonSerialize({ a: 1 }));
});

// ---- the DoS guards still hold (undefined-free deep/wide still throws; a huge undefined-key object is fine) ----
test('DoS guards intact: a >MAX_CANONICAL_NODES undefined-FREE structure still throws controlled', () => {
  const wide = { arr: Array.from({ length: 10001 }, (_v, i) => i) };
  assert.throws(() => canonicalJsonSerialize(wide), /node budget|max/i);
});

// ---- VALIDATE HIGH: dropped absent KEYS must still count toward the node budget (guard not bypassed) ----
test('VALIDATE HIGH: a >MAX_CANONICAL_NODES wide all-ABSENT-key object STILL trips the node budget', () => {
  const wide = {};
  for (let i = 0; i < 10001; i += 1) wide['k' + i] = undefined; // all dropped, but each must still count
  assert.throws(() => canonicalJsonSerialize(wide), /node budget|max/i);
});

// ---- getter-read bound: a wide all-absent getter object reads at most ~budget getters, not all N ----
test('getter-read bound: a wide all-absent getter object reads <= ~MAX_CANONICAL_NODES getters, not all N', () => {
  // The object branch reads each value in a SINGLE sorted pass, so a value's getter is invoked at most once and
  // processing aborts at ~MAX_CANONICAL_NODES (10000) -- the getter READS are bounded, not just the final reject
  // (the prior .map()-then-.filter() read every getter before it could abort).
  let reads = 0;
  const wide = {};
  const N = 50000; // far past the 10000 budget
  for (let i = 0; i < N; i += 1) {
    // zero-pad so sort order matches insertion -> the pass hits budget on the first ~budget keys
    Object.defineProperty(wide, 'k' + String(i).padStart(7, '0'), { get() { reads += 1; return undefined; }, enumerable: true });
  }
  assert.throws(() => canonicalJsonSerialize(wide), /node budget|max/i);
  assert.ok(reads <= 10010, 'expected <= ~10000 getter reads, got ' + reads + ' (getter cost must be budget-bounded)');
});

// ---- VALIDATE MED: a SPARSE array hole is native `null`, not an invalid empty slot (fix's own array scope) ----
test('VALIDATE MED: a SPARSE array hole serializes as null (matches native), not an empty slot', () => {
  const sparse = []; sparse[0] = 1; sparse[2] = 2; // index 1 is a real hole (no sparse literal -> eslint-clean)
  assert.equal(canonicalJsonSerialize(sparse), '[1,null,2]');
  assert.equal(canonicalJsonSerialize(sparse), JSON.stringify(sparse), '== native');
});

// ---- CodeRabbit: arrays hash BY INDEX (native), ignoring a custom Symbol.iterator (Array.from would honor it) ----
test('CodeRabbit: an array with a custom Symbol.iterator hashes BY INDEX (matches native), not via the iterator', () => {
  const a = [1, 2, 3];
  Object.defineProperty(a, Symbol.iterator, { value: function* () { yield 9; yield 9; }, configurable: true });
  assert.equal(canonicalJsonSerialize(a), '[1,2,3]', 'index-based like native, not the iterator output [9,9]');
  assert.equal(canonicalJsonSerialize(a), JSON.stringify(a), '== native');
});

// ---- #99 (F1-sibling): toJSON PARITY -- canonical honors toJSON like native JSON.stringify ----
// canonical now applies toJSON as a value-transform (native SerializeJSONProperty step 2a), resolved in the PARENT so
// a toJSON->undefined drops the key / nulls the element. The load-bearing property is the mint-vs-read invariant:
// canonical(x) === canonical(JSON.parse(JSON.stringify(x))) (build-time hash == read-back hash). Closes the same
// mint-then-reject as #77 for the toJSON/Date value class.
test('#99: a Date payload mints == reads (no false content-address-mismatch), == native', () => {
  const rec = { payload: { created: new Date(0) } };
  assert.equal(canonicalJsonSerialize(rec), '{"payload":{"created":"1970-01-01T00:00:00.000Z"}}');
  assert.equal(canonicalJsonSerialize(rec), canonicalJsonSerialize(JSON.parse(JSON.stringify(rec))), 'mint hash == read-back hash');
});
test('#99: a top-level Date serializes to its ISO string == native', () => {
  assert.equal(canonicalJsonSerialize(new Date(0)), JSON.stringify(new Date(0)));
  assert.equal(canonicalJsonSerialize(new Date(0)), '"1970-01-01T00:00:00.000Z"');
});
test('#99: a ROOT toJSON->undefined matches native (both -> JS undefined; the root has no parent to omit it)', () => {
  // the top-level value has no parent to drop/null it; native's root wrapper returns the JS value undefined, and
  // canonical's walk(applyToJSON(root,'')) -> walk(undefined) -> JSON.stringify(undefined) -> JS undefined. They match.
  const rootUndef = { toJSON() { return undefined; } };
  assert.equal(canonicalJsonSerialize(rootUndef), undefined);
  assert.equal(canonicalJsonSerialize(rootUndef), JSON.stringify(rootUndef), '== native (both JS undefined)');
});
test('#99: toJSON->undefined DROPS the object key / NULLS the array element (== native)', () => {
  assert.equal(canonicalJsonSerialize({ a: { toJSON() { return undefined; } }, b: 1 }), '{"b":1}');
  assert.equal(canonicalJsonSerialize({ a: { toJSON() { return undefined; } }, b: 1 }), JSON.stringify({ a: { toJSON() { return undefined; } }, b: 1 }), '== native');
  assert.equal(canonicalJsonSerialize([{ toJSON() { return undefined; } }]), '[null]');
  assert.equal(canonicalJsonSerialize([{ toJSON() { return undefined; } }]), JSON.stringify([{ toJSON() { return undefined; } }]), '== native');
});
test('#99: the flipped residual -- {d:{toJSON:()=>"iso"}} -> {"d":"iso"} == native', () => {
  const withToJson = { d: { toJSON() { return 'iso'; } } };
  assert.equal(canonicalJsonSerialize(withToJson), '{"d":"iso"}');
  assert.equal(canonicalJsonSerialize(withToJson), JSON.stringify(withToJson), '== native now (residual closed)');
});
test('#99: the key is threaded to toJSON(key) at object / array / root sites (matches the native WRITE path)', () => {
  const mk = () => ({ toJSON(k) { return 'K:' + k; } });
  assert.equal(canonicalJsonSerialize({ foo: mk() }), '{"foo":"K:foo"}');
  assert.equal(canonicalJsonSerialize({ foo: mk() }), JSON.stringify({ foo: mk() }), '== native');
  assert.equal(canonicalJsonSerialize([mk(), mk()]), '["K:0","K:1"]');
  assert.equal(canonicalJsonSerialize(mk()), '"K:"', 'root key is the empty string, like native');
});
test('#99: resolve-ONCE (native does not loop) -- inner Date resolves at its site; a returned toJSON-object is NOT re-invoked', () => {
  assert.equal(canonicalJsonSerialize({ a: { toJSON() { return { b: new Date(0) }; } } }), '{"a":{"b":"1970-01-01T00:00:00.000Z"}}');
  assert.equal(canonicalJsonSerialize({ a: { toJSON() { return { b: new Date(0) }; } } }), JSON.stringify({ a: { toJSON() { return { b: new Date(0) }; } } }), '== native');
  // the returned object's OWN toJSON is a function-valued property -> dropped, NOT re-invoked (native resolve-once).
  assert.equal(canonicalJsonSerialize({ a: { toJSON() { return { toJSON() { return 'x'; } }; } } }), '{"a":{}}');
  assert.equal(canonicalJsonSerialize({ a: { toJSON() { return { toJSON() { return 'x'; } }; } } }), JSON.stringify({ a: { toJSON() { return { toJSON() { return 'x'; } }; } } }), '== native');
});
test('#99: a non-callable toJSON (toJSON:5) is IGNORED -- serialized as a normal object (== native)', () => {
  assert.equal(canonicalJsonSerialize({ d: { toJSON: 5 } }), '{"d":{"toJSON":5}}');
  assert.equal(canonicalJsonSerialize({ d: { toJSON: 5 } }), JSON.stringify({ d: { toJSON: 5 } }), '== native');
});
test('#99: a getter-valued toJSON is honored (== native)', () => {
  const stable = () => 'iso';
  const o = {};
  Object.defineProperty(o, 'toJSON', { get() { return stable; }, enumerable: false });
  assert.equal(canonicalJsonSerialize({ d: o }), '{"d":"iso"}');
  assert.equal(canonicalJsonSerialize({ d: o }), JSON.stringify({ d: o }), '== native');
});
test('#99: single-read of .toJSON is ENFORCED -- a FLIP+COUNT getter proves it (a double-read regresses to RED)', () => {
  // the MANDATORY VERIFY fold: `.toJSON` is read ONCE. A getter returning a DIFFERENT function each read exposes a
  // double-read -- it would call read#2 while the native WRITE path used read#1 (the content-address-mismatch this fix
  // closes). A STABLE getter cannot catch this (both reads return the same fn); this FLIP+COUNT getter can.
  let reads = 0;
  const o = {};
  Object.defineProperty(o, 'toJSON', { get() { reads += 1; return reads === 1 ? () => 'first' : () => 'second'; }, enumerable: false });
  const out = canonicalJsonSerialize({ d: o });
  assert.equal(reads, 1, '.toJSON read exactly once (a double-read reopens the getter divergence)');
  assert.equal(out, '{"d":"first"}', 'the single read uses read#1, matching the native WRITE path');
});
test('#99: a THROWING toJSON propagates (fail-closed at mint, == native) -- no mint-then-reject', () => {
  const boom = { toJSON() { throw new Error('boom'); } };
  assert.throws(() => canonicalJsonSerialize({ d: boom }), /boom/);
  assert.throws(() => JSON.stringify({ d: boom }), /boom/, 'native throws too -- callers catch + fail-closed');
});
test('#99: the node budget still bounds a toJSON-returned HUGE object (no DoS escape)', () => {
  const huge = { toJSON() { return Array.from({ length: 10001 }, (_v, i) => i); } };
  assert.throws(() => canonicalJsonSerialize({ d: huge }), /node budget|max/i);
});
test('#99: a BARE BigInt (no prototype toJSON) throws at mint (fail-closed) == native (applyToJSON guards typeof object only)', () => {
  // applyToJSON guards typeof==='object' only, so a bigint falls through to walk's scalar branch -> JSON.stringify(bigint)
  // THROWS. Fail-closed at mint, byte-identical to native's own throw. (A bigint WITH a callable BigInt.prototype.toJSON
  // is honored via the SAME scalar JSON.stringify delegation -> == native; not tested here to avoid a global-prototype
  // mutation, documented in canonical-json.js.)
  assert.throws(() => canonicalJsonSerialize({ n: 10n }), /BigInt/);
  assert.throws(() => JSON.stringify({ n: 10n }), /BigInt/, 'native throws too');
});

// ---- #99 KNOWN RESIDUALS (same content-address-mismatch class, pinned so NOT silent -- VERIFY board) ----
test('#99 RESIDUAL (pinned): a NON-IDEMPOTENT toJSON is unhashable by definition -> mint != read (fails CLOSED, not forgery)', () => {
  // a value returning a different result each read cannot have a stable content-address (native is equally
  // non-deterministic); the store fails closed (suppression) -- the safe direction. Pinned, not fixed.
  let n = 0;
  const flip = { toJSON() { n += 1; return n; } };
  assert.notEqual(canonicalJsonSerialize({ d: flip }), canonicalJsonSerialize({ d: flip }), 'non-idempotent -> mint != read -> fail-closed');
});
test('#99 RESIDUAL (pinned, DEFERRED sibling): a BOXED primitive reproduces the mint-then-reject -- NOT closed by the toJSON fix', () => {
  // native unwraps a boxed primitive (SerializeJSONProperty step 4); canonical does not (no toJSON) -> the same
  // content-address-mismatch class as the Date bug, for a distinct value class. Tracked as #110.
  const boxed = { x: Object(5) }; // a Number wrapper object (no-new-wrappers-clean)
  assert.equal(canonicalJsonSerialize(boxed), '{"x":{}}', 'boxed primitive serializes as {} (the residual)');
  assert.notEqual(canonicalJsonSerialize(boxed), JSON.stringify(boxed), 'diverges from native "{\\"x\\":5}" -- residual is real + pinned');
});

console.log(`\n[canonical-json] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
