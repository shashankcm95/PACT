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

// ---- KNOWN DEFERRED RESIDUAL (toJSON parity): pinned so it is NOT silent ----
// toJSON is a distinct value-transform mechanism deferred to a sibling issue. It is NOT cosmetic: it reproduces the
// SAME mint-then-reject + false class:attack as #77 for a toJSON/Date value, reachable via the lenient payload
// validate. Post-fix, such a value still diverges from native (canonical serializes the object shape; native calls
// toJSON). This test DOCUMENTS the residual -- when the sibling toJSON fix lands, this assertion flips (update it then).
test('KNOWN RESIDUAL (deferred sibling): toJSON is NOT honored yet -- documents the divergence from native', () => {
  const withToJson = { d: { toJSON() { return 'iso'; } } };
  // post-fix: the toJSON method is a function value -> dropped -> the object is empty. (native: '{"d":"iso"}')
  assert.equal(canonicalJsonSerialize(withToJson), '{"d":{}}', 'toJSON parity is a DEFERRED sibling issue');
  assert.notEqual(canonicalJsonSerialize(withToJson), JSON.stringify(withToJson), 'still diverges from native -- residual is real + pinned');
});

console.log(`\n[canonical-json] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
