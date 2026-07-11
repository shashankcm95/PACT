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
test('#99: a BARE BigInt throws at mint (fail-closed) == native', () => {
  assert.throws(() => canonicalJsonSerialize({ n: 10n }), /BigInt/);
  assert.throws(() => JSON.stringify({ n: 10n }), /BigInt/, 'native throws too');
});
test('#99: a toJSON RETURNING a bigint throws (fail-closed) == native -- the leaf does NOT re-serialize it', () => {
  assert.throws(() => canonicalJsonSerialize({ d: { toJSON() { return 1n; } } }), /BigInt/);
  assert.throws(() => JSON.stringify({ d: { toJSON() { return 1n; } } }), /BigInt/, 'native throws too');
});
test('#99: BigInt dispatch mirrors native when BigInt.prototype.toJSON is set (correct key at object/array/root)', () => {
  // native's step-2 dispatch is Object-OR-BigInt: applyToJSON transforms a bigint at the PARENT so its toJSON gets the
  // correct property key (a leaf JSON.stringify would pass root key ''). CodeRabbit Major, firsthand-probed. Restore in finally.
  BigInt.prototype.toJSON = function (key) { return 'K=' + key; };
  try {
    assert.equal(canonicalJsonSerialize({ n: 1n }), '{"n":"K=n"}');
    assert.equal(canonicalJsonSerialize({ n: 1n }), JSON.stringify({ n: 1n }), '== native (correct property key, not "")');
    assert.equal(canonicalJsonSerialize([1n, 2n]), JSON.stringify([1n, 2n]), '== native (array index keys)');
    assert.equal(canonicalJsonSerialize(1n), JSON.stringify(1n), '== native (root key "")');
  } finally {
    delete BigInt.prototype.toJSON;
  }
});
test('#99: a toJSON->bigint still throws EVEN WITH BigInt.prototype.toJSON set (resolve-once == native, no "7" desync)', () => {
  // the 3b divergence: native resolves the OUTER toJSON once (-> 1n) then throws; canonical must NOT re-apply
  // BigInt.prototype.toJSON at the leaf (that would emit bytes native rejects). Both throw. Restore in finally.
  BigInt.prototype.toJSON = function () { return 7; };
  try {
    assert.throws(() => canonicalJsonSerialize({ d: { toJSON() { return 1n; } } }), /BigInt/);
    assert.throws(() => JSON.stringify({ d: { toJSON() { return 1n; } } }), /BigInt/, 'native throws too (resolve-once)');
  } finally {
    delete BigInt.prototype.toJSON;
  }
});
test('#99: a toJSON function with a SHADOWED .call cannot hijack serialization (Reflect.apply, not fn.call) == native', () => {
  // `.call` is read off the untrusted toJSON; a payload-supplied own `.call` would hijack. Reflect.apply uses the
  // internal [[Call]] (CodeRabbit). Prove the hijack value never appears.
  const evil = { toJSON() { return 'real'; } };
  evil.toJSON.call = function () { return 'HIJACKED'; };
  assert.equal(canonicalJsonSerialize({ d: evil }), '{"d":"real"}');
  assert.equal(canonicalJsonSerialize({ d: evil }), JSON.stringify({ d: evil }), '== native (not hijacked)');
});

// ---- #99 KNOWN RESIDUALS (same content-address-mismatch class, pinned so NOT silent -- VERIFY board) ----
test('#99 RESIDUAL (pinned): a NON-IDEMPOTENT toJSON is unhashable by definition -> mint != read (fails CLOSED, not forgery)', () => {
  // a value returning a different result each read cannot have a stable content-address (native is equally
  // non-deterministic); the store fails closed (suppression) -- the safe direction. Pinned, not fixed.
  let n = 0;
  const flip = { toJSON() { n += 1; return n; } };
  assert.notEqual(canonicalJsonSerialize({ d: flip }), canonicalJsonSerialize({ d: flip }), 'non-idempotent -> mint != read -> fail-closed');
});
// ---- #110: canonical UNWRAPS boxed primitives (native step 4) -- closes the residual cascade #77->#99->#110 ----
test('#110: a BOXED primitive is unwrapped == native (direct field + toJSON return + String/Boolean + mint==read)', () => {
  assert.equal(canonicalJsonSerialize({ x: Object(5) }), '{"x":5}');
  assert.equal(canonicalJsonSerialize({ x: Object(5) }), JSON.stringify({ x: Object(5) }), '== native');
  assert.equal(canonicalJsonSerialize({ x: Object('ab') }), '{"x":"ab"}');
  assert.equal(canonicalJsonSerialize({ x: Object(true) }), '{"x":true}');
  // a toJSON RETURNING a boxed primitive is unwrapped too (step 4 runs on the post-toJSON value)
  assert.equal(canonicalJsonSerialize({ x: { toJSON() { return Object(5); } } }), '{"x":5}');
  const rec = { x: Object(5) };
  assert.equal(canonicalJsonSerialize(rec), canonicalJsonSerialize(JSON.parse(JSON.stringify(rec))), 'mint == read (no false attack)');
});
test('#110: boxed unwrap mirrors native PER-SLOT under adversarial coercion overrides (NOT a uniform valueOf)', () => {
  // native reads the Boolean slot directly (ignores an overridden valueOf); toString-first for String; ToNumber
  // (honors @@toPrimitive) for Number. A uniform out.valueOf() would diverge -> re-open the mint-then-reject (VERIFY).
  const bt = Object(true); bt.valueOf = () => false;
  assert.equal(canonicalJsonSerialize({ x: bt }), '{"x":true}', 'Boolean reads the RAW slot, not the overridden valueOf');
  assert.equal(canonicalJsonSerialize({ x: bt }), JSON.stringify({ x: bt }), '== native');
  const sv = Object('ab'); sv.valueOf = () => 'HACKED';
  assert.equal(canonicalJsonSerialize({ x: sv }), '{"x":"ab"}', 'String uses toString-first, not valueOf');
  assert.equal(canonicalJsonSerialize({ x: sv }), JSON.stringify({ x: sv }), '== native');
  const st = Object('ab'); st.toString = () => 'TS';
  assert.equal(canonicalJsonSerialize({ x: st }), JSON.stringify({ x: st }), 'String toString-override == native');
  const np = Object(5); np[Symbol.toPrimitive] = () => 777;
  assert.equal(canonicalJsonSerialize({ x: np }), '{"x":777}', 'Number honors @@toPrimitive (ToNumber)');
  assert.equal(canonicalJsonSerialize({ x: np }), JSON.stringify({ x: np }), '== native');
});
test('#110: a boxed primitive whose conversion THROWS or yields a bigint fails CLOSED at mint == native (no swallow-to-{} collision)', () => {
  // VALIDATE hacker H1: swallowing the conversion throw would walk the box as {} -> a content-address COLLISION with a
  // plain {} that native REJECTS. The conversion throw must PROPAGATE (fail-closed). M1: Number()=ToNumeric accepts a
  // bigint; native step-4a ToNumber (unary +) throws -> both throw.
  const throwsVO = Object(5); throwsVO.valueOf = () => { throw new Error('boom'); }; throwsVO.toString = () => { throw new Error('boom'); };
  assert.throws(() => canonicalJsonSerialize({ x: throwsVO }), /boom/, 'a throwing conversion propagates, not swallowed to {}');
  assert.throws(() => JSON.stringify({ x: throwsVO }), /boom/, 'native throws too');
  const bigVO = Object(5); bigVO.valueOf = () => 10n;
  assert.throws(() => canonicalJsonSerialize({ x: bigVO }), /BigInt|convert/i, 'ToNumber (unary +) throws on a bigint');
  assert.throws(() => JSON.stringify({ x: bigVO }), /BigInt|convert/i, 'native throws too');
});
test('#110: slot-DETECTION (not instanceof) -- a slot-less prototype match / toStringTag spoof is NOT unwrapped == native', () => {
  // Object.create(Number.prototype) is instanceof-true but SLOT-LESS -> native walks it as {} (no throw); instanceof +
  // valueOf would THROW (a regression). The slot-probe matches native.
  const noSlot = Object.create(Number.prototype);
  assert.equal(canonicalJsonSerialize({ x: noSlot }), '{"x":{}}', 'slot-less instanceof match stays {} (no throw)');
  assert.equal(canonicalJsonSerialize({ x: noSlot }), JSON.stringify({ x: noSlot }), '== native');
  const spoof = {}; Object.defineProperty(spoof, Symbol.toStringTag, { value: 'Number' });
  assert.equal(canonicalJsonSerialize({ x: spoof }), '{"x":{}}', 'toStringTag spoof stays {} (slot-probe ignores it)');
  assert.equal(canonicalJsonSerialize({ x: spoof }), JSON.stringify({ x: spoof }), '== native');
  class X extends Number { constructor() { super(9); } }
  assert.equal(canonicalJsonSerialize({ x: new X() }), '{"x":9}', 'a real [[NumberData]] slot -> unwrapped');
});
test('#110: a BOXED BigInt (Object(1n)) throws at mint == native (unwrapped to a primitive bigint -> walk-scalar throw)', () => {
  assert.throws(() => canonicalJsonSerialize({ x: Object(1n) }), /BigInt/);
  assert.throws(() => JSON.stringify({ x: Object(1n) }), /BigInt/, 'native throws too');
});

console.log(`\n[canonical-json] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
