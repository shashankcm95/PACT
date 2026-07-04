#!/usr/bin/env node
'use strict';

// PACT v0 -- independence/weak-flag.js unit tests (plans/41: the U2 DEMOTE-ONLY entanglement seam).
//
// NS-9: a DORMANT forward-contract seam. The default detector NEVER fires (byte-identical live behaviour); it
// NARROWS only when a real signal arms it, and it can ONLY DEMOTE, never PROMOTE. These tests pin the load-
// bearing VERIFY findings: the demote-only range (NO positive branch, ever -- C2), exact-set normalization of
// the detector return (C2/F6), read-path totality (a hostile detector never throws -- H1), the mayGate/convert
// STRUCTURAL exemption (a zero-arg / no-confirmerSet call returns WEAK BEFORE any detector runs -- F1/H2), and
// the object-safe `overall` collapse (F5).

const assert = require('node:assert/strict');
const { epistemicIndependence, independenceLabel, mayGate, detectEntanglement, configStability } = require('../../src/independence/weak-flag');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const SET = ['human:a', 'human:b'];
const demote = (entangled) => () => ({ flag: 'ENTANGLEMENT-DETECTED', entangled });

test('dormant default: epistemicIndependence(set) is WEAK for every input', () => {
  assert.equal(epistemicIndependence(SET), 'WEAK');
  assert.equal(epistemicIndependence([]), 'WEAK');
  assert.equal(epistemicIndependence(['x']), 'WEAK');
  assert.equal(detectEntanglement(SET), 'WEAK'); // the default detector itself never fires
});

test('undefined-guard FIRST: zero-arg / null confirmerSet -> WEAK WITHOUT reaching the detector (mayGate/convert exempt)', () => {
  const boom = () => { throw new Error('detector must not be reached'); };
  assert.equal(epistemicIndependence(), 'WEAK');                               // mayGate's zero-arg path
  assert.equal(epistemicIndependence(undefined, { detectorFn: boom }), 'WEAK');
  assert.equal(epistemicIndependence(null, { detectorFn: boom }), 'WEAK');
});

test('exact-set / NO positive branch: only {flag:ENTANGLEMENT-DETECTED, entangled:[]} is honored; all else -> WEAK', () => {
  const poison = [
    () => 'STRONG', () => ({ flag: 'STRONG' }), () => ({ flag: 'INDEPENDENT' }),
    () => true, () => 1, () => ({ independent: true }), () => ({}),
    () => ({ flag: 'ENTANGLEMENT-DETECTED' }),                    // missing entangled array
    () => ({ flag: 'ENTANGLEMENT-DETECTED', entangled: 'nope' }), // entangled not an array
    () => null, () => undefined,
  ];
  for (const detectorFn of poison) {
    assert.equal(epistemicIndependence(SET, { detectorFn }), 'WEAK', 'poison must normalize to WEAK: ' + JSON.stringify(detectorFn()));
  }
  const v = epistemicIndependence(SET, { detectorFn: demote([['human:a', 'human:b']]) });
  assert.equal(v.flag, 'ENTANGLEMENT-DETECTED');
  assert.deepEqual(v.entangled, [['human:a', 'human:b']]);
});

test('totality (H1): a throwing / trapping detector normalizes to WEAK, never throws out', () => {
  assert.equal(epistemicIndependence(SET, { detectorFn: () => { throw new Error('hostile'); } }), 'WEAK');
  const trap = new Proxy({}, { get() { throw new Error('trap'); } });
  assert.equal(epistemicIndependence(SET, { detectorFn: () => trap }), 'WEAK');
});

test('mayGate: fail-closed on high-stakes (zero-arg lift-point -> WEAK), forged label voided -- unchanged', () => {
  assert.equal(mayGate({}, { highStakes: true }), false);
  assert.equal(mayGate({ overall: 'STRONG' }, { highStakes: true }), false);
  assert.equal(mayGate({}, { highStakes: false }), true);
});

test('independenceLabel: default -> epistemic WEAK, overall WEAK', () => {
  const l = independenceLabel({ topological: 5 });
  assert.equal(l.epistemic, 'WEAK');
  assert.equal(l.overall, 'WEAK');
  assert.equal(configStability(), 'WEAK');
});

test('independenceLabel (F5): a demote verdict rides `epistemic` but `overall` stays WEAK (object-safe)', () => {
  const l = independenceLabel({ topological: 5 }, { confirmerSet: SET, detectorFn: demote([['human:a', 'human:b']]) });
  assert.equal(l.epistemic.flag, 'ENTANGLEMENT-DETECTED');
  assert.equal(l.overall, 'WEAK', 'a demote object must never flip overall to a non-WEAK');
});

test('independenceLabel: no positive verdictFn/detector can flip overall (normalized away)', () => {
  const l = independenceLabel({ topological: 5 }, { confirmerSet: SET, detectorFn: () => 'STRONG' });
  assert.equal(l.epistemic, 'WEAK');
  assert.equal(l.overall, 'WEAK');
});

console.log(`\n[weak-flag] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
