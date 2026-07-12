#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/arming-manifest.js  (plans/54 / EPIC #96 Wave 1: the fail-closed arming preflight).
//
// resolveArmedContext resolves the FIXED canonical arm-set all-or-none into ONE immutable context. This suite
// pins the load-bearing fail-closed properties (VERIFY board §7): the caller CANNOT shrink the all-or-none set by
// omission (H1/A8), a garbage token can never silently arm or silently disarm (H2/A1/A2), a poisoned getter fails
// CLOSED not open (H3/A4), the context is genuinely immutable (A5 -- proven by attempted mutation, not isFrozen),
// and every fail-closed path emits OBSERVABLY (A6/A11 non-vacuity + no-spam on the honest baseline).

const assert = require('node:assert/strict');
const { resolveArmedContext, normalizeArmSignal, SIGNAL_SET } = require('../../src/trust/arming-manifest');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// Capture the OUT-OF-BAND refuse-alert emits (refuse-alert writes to process.stderr, never the return value).
function captureAlerts(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = (s) => { lines.push(String(s)); return true; };
  let out;
  try { out = fn(); } finally { process.stderr.write = orig; }
  return { out, alerts: lines.filter((l) => l.includes('[PACT-REFUSE-ALERT]')) };
}
function reasons(alerts) {
  return alerts.map((l) => { try { return JSON.parse(l.slice(l.indexOf('{'))).reason; } catch { return '?'; } });
}

// ============================ SIGNAL_SET (the fixed canonical set) ============================

test('SIGNAL_SET is the fixed, frozen canonical set {admission, signing, anchoring, freshness} (H1)', () => {
  assert.deepEqual([...SIGNAL_SET].sort(), ['admission', 'anchoring', 'freshness', 'signing']);
  assert.equal(Object.isFrozen(SIGNAL_SET), true, 'the canonical set is policy, not caller-mutable');
  // prove-by-mutation (PACT house rule -- not isFrozen alone): a push / index-write must NOT take effect.
  const before = [...SIGNAL_SET];
  try { SIGNAL_SET.push('broker'); } catch { /* strict-mode throw is fine */ }
  try { SIGNAL_SET[0] = 'x'; } catch { /* ignore */ }
  assert.deepEqual([...SIGNAL_SET], before, 'a caller cannot extend or rewrite the canonical arm-set');
});

// ============================ normalizeArmSignal (H2 -- the type-gated parse) ============================

test('A1/A10 normalizeArmSignal: strict token + boolean idioms', () => {
  // strict enable tokens
  assert.equal(normalizeArmSignal('1'), 'armed', "'1' is a LEGIT arm (NOT a misconfig -- A1 corrected)");
  assert.equal(normalizeArmSignal(' 1 '), 'armed', 'ascii-trim');
  assert.equal(normalizeArmSignal('0'), 'disarmed');
  // booleans (the in-process DI idiom admission-gate uses today)
  assert.equal(normalizeArmSignal(true), 'armed', 'boolean true arms with NO misconfig (A10)');
  assert.equal(normalizeArmSignal(false), 'disarmed');
  // absent / present-but-empty
  assert.equal(normalizeArmSignal(undefined), 'absent');
  assert.equal(normalizeArmSignal(''), 'absent', 'present-but-empty string is not a signal');
  assert.equal(normalizeArmSignal('   '), 'absent', 'whitespace-only is not a signal');
});

test('A1/A2 normalizeArmSignal: garbage of EVERY shape is misconfig (never a silent arm/disarm)', () => {
  assert.equal(normalizeArmSignal('true'), 'misconfig', "the word 'true' is NOT a strict token");
  assert.equal(normalizeArmSignal('ture'), 'misconfig', 'an operator typo');
  assert.equal(normalizeArmSignal('2'), 'misconfig');
  assert.equal(normalizeArmSignal(1), 'misconfig', 'number 1 -- the assessEnableFlag silent hole, CLOSED');
  assert.equal(normalizeArmSignal(0), 'misconfig', 'number 0 is not an explicit-disarm token here');
  assert.equal(normalizeArmSignal(null), 'misconfig');
  assert.equal(normalizeArmSignal({}), 'misconfig');
  assert.equal(normalizeArmSignal([]), 'misconfig');
});

// ============================ resolveArmedContext -- the all-or-none fold ============================

test('FULLY ARMED (all 4, mixed bool/token idioms) -> armed, coherent, NO emit (A9/A10)', () => {
  const { out, alerts } = captureAlerts(() =>
    resolveArmedContext({ admission: true, signing: '1', anchoring: true, freshness: '1' }));
  assert.equal(out.armed, true);
  assert.equal(out.coherent, true);
  assert.equal(out.disarmedBaseline, false);
  assert.equal(out.hadMisconfig, false, 'a clean full arm has no garbage token');
  assert.equal(out.reason, null);
  assert.deepEqual(alerts, [], 'a clean full arm emits nothing');
});

test('DISARMED BASELINE (no input / {} / all-absent) -> not armed, coherent, disarmedBaseline, NO emit (A6)', () => {
  for (const input of [undefined, {}, null, 42]) {
    const { out, alerts } = captureAlerts(() => resolveArmedContext(input));
    assert.equal(out.armed, false, 'baseline is not armed');
    assert.equal(out.coherent, true, 'baseline is coherent (nothing is mis-arming)');
    assert.equal(out.disarmedBaseline, true, 'flag distinguishes baseline from incoherent-partial');
    assert.equal(out.hadMisconfig, false, 'a clean baseline carries no garbage-token signal');
    assert.equal(out.reason, null);
    assert.deepEqual(alerts, [], 'the honest baseline never spams an alert');
  }
});

test('A8 (THE keystone) omission-shrinks-the-set: {admission,signing} armed, anchoring/freshness OMITTED -> REFUSE', () => {
  const { out, alerts } = captureAlerts(() =>
    resolveArmedContext({ admission: true, signing: true }));
  assert.equal(out.armed, false, 'a caller CANNOT shrink the all-or-none set by omission (the F9 fail-open)');
  assert.equal(out.coherent, false, 'a partial arm is INCOHERENT');
  assert.equal(out.disarmedBaseline, false, 'NOT the disarmed baseline -- an armed subset amid absent required signals');
  assert.equal(out.reason, 'partial-arm');
  assert.deepEqual(reasons(alerts), ['arming-incoherent'], 'the partial arm is OBSERVABLE');
});

test('A3 explicit partial: {admission,signing,freshness} armed, anchoring:false -> REFUSE + emit', () => {
  const { out, alerts } = captureAlerts(() =>
    resolveArmedContext({ admission: true, signing: true, anchoring: false, freshness: true }));
  assert.equal(out.armed, false);
  assert.equal(out.coherent, false);
  assert.equal(out.reason, 'partial-arm');
  assert.deepEqual(reasons(alerts), ['arming-incoherent']);
});

test('A2 truthy-non-boolean numbers: {1,1,1,1} -> baseline (armedCount 0) BUT 4 misconfig emits fire (silent hole CLOSED)', () => {
  const { out, alerts } = captureAlerts(() =>
    resolveArmedContext({ admission: 1, signing: 1, anchoring: 1, freshness: 1 }));
  assert.equal(out.armed, false, 'numbers never arm');
  assert.equal(out.coherent, true, 'nothing actually armed -> coherent baseline (arm-coherence channel)');
  assert.equal(out.disarmedBaseline, true);
  assert.equal(out.hadMisconfig, true, 'the garbage-arm intent rides the RETURN VALUE too, not just stderr (orthogonal channel)');
  assert.deepEqual(reasons(alerts), ['arm-flag-misconfig', 'arm-flag-misconfig', 'arm-flag-misconfig', 'arm-flag-misconfig'],
    'the OPERATOR-INTENT-to-arm-with-garbage is OBSERVABLE on the orthogonal token-validity channel');
});

test('A1-context single garbage token: {admission:"ture"} -> baseline + exactly ONE misconfig (orthogonal channels)', () => {
  const { out, alerts } = captureAlerts(() => resolveArmedContext({ admission: 'ture' }));
  assert.equal(out.armed, false);
  assert.equal(out.coherent, true, 'coherent tracks arm-coherence only (nothing armed); misconfig tracks token validity');
  assert.deepEqual(reasons(alerts), ['arm-flag-misconfig']);
});

test('A9/A11 mixed idiom with one garbage token: 3 armed + 1 misconfig -> partial; EXACTLY 1 misconfig + 1 coherence emit', () => {
  const { out, alerts } = captureAlerts(() =>
    resolveArmedContext({ admission: true, signing: '1', anchoring: 'ture', freshness: true }));
  assert.equal(out.armed, false);
  assert.equal(out.coherent, false, 'a garbage token amid an otherwise-full arm -> partial, fail-closed');
  assert.equal(out.reason, 'partial-arm');
  assert.deepEqual(reasons(alerts).sort(), ['arm-flag-misconfig', 'arming-incoherent'],
    'emit cardinality: per-signal misconfig + at most ONE top-level coherence emit (no double-emit)');
});

test('A11 single-arm partial: {admission:true} only -> partial, EXACTLY one arming-incoherent, zero misconfig', () => {
  const { out, alerts } = captureAlerts(() =>
    resolveArmedContext({ admission: true, signing: false, anchoring: false, freshness: false }));
  assert.equal(out.armed, false);
  assert.equal(out.coherent, false, '1 armed + 3 explicitly-disarmed is a partial arm');
  assert.deepEqual(reasons(alerts), ['arming-incoherent']);
});

test('A4 poisoned getter fails CLOSED (never fail-open) + emits; NEVER throws (H3)', () => {
  const hostile = {};
  Object.defineProperty(hostile, 'admission', { enumerable: true, get() { throw new Error('boom'); } });
  const { out, alerts } = captureAlerts(() => resolveArmedContext(hostile));
  assert.equal(out.armed, false, 'a throwing getter can NEVER collapse to armed / silent-disarm');
  assert.equal(out.coherent, false);
  assert.equal(out.reason, 'arm-getter-threw');
  assert.equal(out.disarmedBaseline, false);
  assert.equal(out.hadMisconfig, false, 'the throw path carries hadMisconfig:false (the read never completed)');
  assert.deepEqual(reasons(alerts), ['arm-context-unreadable'], 'the indeterminate read is OBSERVABLE');
});

test('A5 the returned context is genuinely immutable (proven by attempted mutation, not isFrozen)', () => {
  const ctx = resolveArmedContext({ admission: true, signing: true, anchoring: true, freshness: true });
  assert.equal(ctx.armed, true);
  try { ctx.armed = false; } catch { /* strict-mode throw is fine */ }
  try { ctx.reason = 'forged'; } catch { /* ignore */ }
  try { ctx.signals.admission = 'disarmed'; } catch { /* ignore */ }
  assert.equal(ctx.armed, true, 'ctx.armed cannot be flipped post-hoc');
  assert.equal(ctx.reason, null, 'ctx.reason cannot be forged');
  assert.equal(ctx.signals.admission, 'armed', 'nested signals cannot be mutated (deep-safe: flat primitives)');
});

test('A15 unknown extra keys (incl. a REAL own __proto__ key) outside SIGNAL_SET are IGNORED', () => {
  // JSON.parse creates a GENUINE own enumerable "__proto__" property (unlike the object-literal setter syntax,
  // which is a no-op) -- prove the manifest reads ONLY its own SIGNAL_SET keys and ignores everything else.
  const input = JSON.parse('{"admission":true,"signing":true,"anchoring":true,"freshness":true,"EXTRA":"whatever","__proto__":"x"}');
  assert.equal(Object.hasOwn(input, '__proto__'), true, 'precondition: the input has a REAL own __proto__ key (non-vacuous)');
  const { out, alerts } = captureAlerts(() => resolveArmedContext(input));
  assert.equal(out.armed, true, 'an extra own key (incl. __proto__) does not shrink or poison the canonical set');
  assert.equal(out.hadMisconfig, false, 'the ignored keys are not treated as garbage signals');
  assert.deepEqual(alerts, [], 'an ignored key raises no alert');
});

test('A16 prototype-pollution fail-open: a polluted Object.prototype must NOT flip the disarmed baseline to armed', () => {
  // The keystone fail-closed guarantee ('a non-object / absent input is the honest disarmed baseline') must hold
  // regardless of AMBIENT prototype state the caller never set. src[key] must be an OWN-property read, not an
  // inherited prototype-chain lookup (security.md: a guard must be NON-BYPASSABLE). RED against an inherited read.
  const keys = ['admission', 'signing', 'anchoring', 'freshness'];
  for (const k of keys) Object.prototype[k] = true; // pollute; restored in finally even if an assert throws
  try {
    assert.equal(resolveArmedContext(undefined).armed, false, 'undefined input stays disarmed under a polluted prototype');
    assert.equal(resolveArmedContext(42).armed, false, 'non-object input stays disarmed');
    assert.equal(resolveArmedContext({}).armed, false, 'empty-object input stays disarmed (own-property read, not inherited)');
    const base = resolveArmedContext({});
    assert.equal(base.disarmedBaseline, true, 'still the honest baseline, not a prototype-inherited full arm');
  } finally {
    for (const k of keys) delete Object.prototype[k];
  }
});

console.log(`\n[arming-manifest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
