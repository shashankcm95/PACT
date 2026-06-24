#!/usr/bin/env node
'use strict';

// PACT R-heap — heap-read-probe.test.js  (plans/26 §3 — the executable contract for the PURE verdict).
// TDD: written FIRST as the spec. assessHeapRead(facts) is the pure verdict over the observed legs (L-pre, L0,
// L1, L2, L3, L4). It is fully testable here — including the cross-uid TRUE branch a macOS box can NEVER
// produce live (synthetic facts), exactly like custody-verify's assessCustody. The LIVE kernel denial is the
// VM run (gatherHeapReadFacts, Linux-only) — these tests prove the VERDICT LOGIC, NOT that the kernel denies
// (Rule-2a: a green unit suite is a hypothesis about the mocked path, never proof of the real path).
//
// Load-bearing: the L3 HARD GATE (L2 is credited ONLY if the privileged positive control found the key) — a
// run with a failed/absent L3 is VACUOUS and NARROWS only; and the NS-9 disposition (NEVER a `hardened` field;
// the host cannot observe the process<->uid bind, so it always requires the out-of-band attestation).

const assert = require('node:assert/strict');
const { assessHeapRead } = require('../../src/identity/heap-read-probe');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// A fully-clean cross-uid run (the real-deployment TRUE branch — synthetic; a same-uid macOS box can't produce it).
function cleanFacts() {
  return {
    wrapper: { ok: true, isFile: true, worldOrGroupWritable: false },                 // L-pre C2.5
    ptraceScope: 2, yamaActive: true,                                                 // L0
    attacker: { uid: 1001, hasCapSysPtrace: false },                                  // L0/VT-5
    borrowedCaps: { capSysPtraceBinaries: [], setuidReviewed: true },                 // L0/VT-9
    coreLocked: true, swapLocked: true,                                               // L0/M2
    scopeRecheck: 2,                                                                  // VT-8 (re-read before L2)
    target: { keyResidentViaProductionLoad: true, pid: 4242 },                        // L1
    denial: {                                                                         // L2 (each denied)
      ptraceAttach: { denied: true, errno: 'EPERM' },
      procMem: { denied: true, errno: 'EACCES' },
      processVmReadv: { denied: true, errno: 'EPERM' },
      procMaps: { denied: true },
      coreDump: { hostReadable: false },
      devMem: { denied: true },
      swap: { keyHitHostReadable: false },
    },
    positiveControl: { keyFoundPem: true, keyFoundSeed: true, samePid: true },         // L3 (the hard gate)
    sameUid: {                                                                        // L4 (per vector)
      ptraceAttack: { denied: true }, procMem: { denied: true }, processVmReadv: { denied: true },
      brokerSetsPtracer: false,
    },
    brokerUid: 600,
  };
}
const idsOf = (r, status) => r.checks.filter(c => c.status === status).map(c => c.id);

// ===================== the clean cross-uid TRUE branch =====================

test('clean cross-uid run: host-observable hardening HELD, requires out-of-band uid attestation, NOT vacuous', () => {
  const r = assessHeapRead(cleanFacts());
  assert.equal(r.hostObservableDenialChecksHeld, true);
  assert.equal(r.vacuous, false);
  assert.equal(r.requiresOutOfBandUidConfirmation, true, 'the host can never observe the process<->uid bind');
  assert.equal('hardened' in r, false, 'NS-9: there is NO hardened field — the probe never self-certifies custody/hardening');
  assert.ok(idsOf(r, 'FAIL').length === 0, 'no FAIL checks on a clean run');
});

// ===================== the L3 HARD GATE (the load-bearing non-vacuity) =====================

test('L3 gate: a FAILED positive control makes the run VACUOUS and NOT held — EVEN with L2 all-denied', () => {
  const f = cleanFacts();
  f.positiveControl = { keyFoundPem: false, keyFoundSeed: false, samePid: true };  // L3 found nothing
  const r = assessHeapRead(f);
  assert.equal(r.vacuous, true, 'no positive control -> the L2 denial proves nothing (the key may never have been there)');
  assert.equal(r.hostObservableDenialChecksHeld, false, 'L2 cannot be credited without L3');
  assert.ok(idsOf(r, 'FAIL').includes('L3-positive'), 'L3 fails the run');
});

test('L3 gate: ONE key form found (seed only, PEM freed) still credits L3 — but a DIFFERENT pid does NOT', () => {
  const seedOnly = cleanFacts();
  seedOnly.positiveControl = { keyFoundPem: false, keyFoundSeed: true, samePid: true };
  assert.equal(assessHeapRead(seedOnly).hostObservableDenialChecksHeld, true, 'seed-only is a real find (createPrivateKey may free the PEM string)');
  const wrongPid = cleanFacts();
  wrongPid.positiveControl = { keyFoundPem: true, keyFoundSeed: true, samePid: false };
  const r = assessHeapRead(wrongPid);
  assert.equal(r.vacuous, true, 'L3 on a different pid than L2 proves nothing — same-pid is required');
  assert.equal(r.hostObservableDenialChecksHeld, false);
});

// ===================== L-pre + L0 fail-closed preconditions =====================

test('L-pre: a group/world-writable wrapper FAILS (the heap claim is null without custody-clean)', () => {
  const f = cleanFacts(); f.wrapper = { ok: true, isFile: true, worldOrGroupWritable: true };
  const r = assessHeapRead(f);
  assert.equal(r.hostObservableDenialChecksHeld, false);
  assert.ok(idsOf(r, 'FAIL').includes('L-pre-wrapper'));
});

test('L0: each precondition fails closed (scope!=2, yama inactive, attacker root, attacker has cap, borrowed cap, core/swap unlocked, sysctl TOCTOU)', () => {
  const mut = [
    ['ptraceScope', f => { f.ptraceScope = 1; }, 'L0-scope'],
    ['yamaActive', f => { f.yamaActive = false; }, 'L0-yama'],
    ['attacker-root', f => { f.attacker = { uid: 0, hasCapSysPtrace: false }; }, 'L0-attacker-uid'],
    ['attacker-cap', f => { f.attacker = { uid: 1001, hasCapSysPtrace: true }; }, 'L0-attacker-cap'],
    ['borrowed-cap', f => { f.borrowedCaps = { capSysPtraceBinaries: ['/usr/bin/gdb'], setuidReviewed: true }; }, 'L0-borrowed-cap'],
    ['core-unlocked', f => { f.coreLocked = false; }, 'L0-core'],
    ['swap-unlocked', f => { f.swapLocked = false; }, 'L0-swap'],
    ['sysctl-TOCTOU', f => { f.scopeRecheck = 0; }, 'L0-scope-recheck'],
  ];
  for (const [label, apply, id] of mut) {
    const f = cleanFacts(); apply(f);
    const r = assessHeapRead(f);
    assert.equal(r.hostObservableDenialChecksHeld, false, label + ' must fail the run');
    assert.ok(idsOf(r, 'FAIL').includes(id), label + ' -> expected FAIL check ' + id);
  }
});

// ===================== L1 present-target =====================

test('L1: a key NOT resident via the production load path is VACUOUS (the harness is unrepresentative)', () => {
  const f = cleanFacts(); f.target = { keyResidentViaProductionLoad: false, pid: 4242 };
  const r = assessHeapRead(f);
  assert.equal(r.vacuous, true);
  assert.ok(idsOf(r, 'FAIL').includes('L1-present'));
});

// ===================== L2 the denial battery (each vector) =====================

test('L2: ANY un-denied read vector FAILS the claim (per-vector, no subset pass)', () => {
  const vectors = ['ptraceAttach', 'procMem', 'processVmReadv', 'procMaps', 'devMem'];
  for (const v of vectors) {
    const f = cleanFacts();
    f.denial[v] = v === 'procMaps' || v === 'devMem' ? { denied: false } : { denied: false, errno: null };
    const r = assessHeapRead(f);
    assert.equal(r.hostObservableDenialChecksHeld, false, v + ' un-denied must fail');
    assert.ok(idsOf(r, 'FAIL').some(id => id.startsWith('L2-')), v + ' -> an L2 FAIL');
  }
});

test('L2: a host-readable induced core dump FAILS (the key leaks post-mortem without ptrace)', () => {
  const f = cleanFacts(); f.denial.coreDump = { hostReadable: true };
  assert.equal(assessHeapRead(f).hostObservableDenialChecksHeld, false);
});

test('L2: a key page that hit a host-readable swap device FAILS', () => {
  const f = cleanFacts(); f.denial.swap = { keyHitHostReadable: true };
  assert.equal(assessHeapRead(f).hostObservableDenialChecksHeld, false);
});

// ===================== L4 same-uid (per vector) + the PR_SET_PTRACER carve-out =====================

test('L4: each same-uid vector must be denied; an un-denied same-uid read FAILS (closes the same-uid HEAP-READ channel)', () => {
  for (const v of ['ptraceAttack', 'procMem', 'processVmReadv']) {
    const f = cleanFacts(); f.sameUid[v] = { denied: false };
    const r = assessHeapRead(f);
    assert.equal(r.hostObservableDenialChecksHeld, false, 'same-uid ' + v + ' un-denied must fail');
    assert.ok(idsOf(r, 'FAIL').includes('L4-' + v));
  }
});

test('L4: a broker that declares a tracer (PR_SET_PTRACER) FAILS — the scope=2 carve-out re-opens same-uid', () => {
  const f = cleanFacts(); f.sameUid.brokerSetsPtracer = true;
  const r = assessHeapRead(f);
  assert.equal(r.hostObservableDenialChecksHeld, false);
  assert.ok(idsOf(r, 'FAIL').includes('L4-ptracer-carveout'));
});

test('L4 carve-out is fail-closed: a truthy NON-boolean (the runbook grep emits the string "true") FAILS, never the safe PASS (VALIDATE C1)', () => {
  for (const bad of ['true', 1, 'yes', {}, undefined, null]) {
    const f = cleanFacts(); f.sameUid.brokerSetsPtracer = bad;
    const r = assessHeapRead(f);
    assert.equal(r.hostObservableDenialChecksHeld, false, 'brokerSetsPtracer=' + JSON.stringify(bad) + ' must NOT pass (only a literal boolean false passes)');
    assert.ok(idsOf(r, 'FAIL').includes('L4-ptracer-carveout'), 'a non-false carve-out value fails closed');
  }
});

test('fail-closed input: null / array / scalar facts do NOT crash and yield NOT-held (no leg credited)', () => {
  for (const bad of [null, [], 42, 'x', undefined]) {
    const r = assessHeapRead(bad);
    assert.equal(r.hostObservableDenialChecksHeld, false, JSON.stringify(bad) + ' must not be held');
    assert.ok(idsOf(r, 'FAIL').length > 0, 'malformed facts fail closed with FAIL checks, not a crash');
  }
});

// ===================== NS-9 disposition surface =====================

test('NS-9: the report carries the out-of-band-attestation residual whenever the legs are credited, never a custody/hardened claim', () => {
  const r = assessHeapRead(cleanFacts());
  assert.ok(Array.isArray(r.residuals) && r.residuals.some(s => /out-of-band/i.test(s)), 'the binding-gap residual rides with a credited run');
  assert.equal('custodyReal' in r, false);
  assert.equal('hardened' in r, false);
});

test('fresh-return: assessHeapRead does not mutate its input + returns a fresh object', () => {
  const f = cleanFacts();
  const snapshot = JSON.stringify(f);
  const r = assessHeapRead(f);
  assert.equal(JSON.stringify(f), snapshot, 'input is not mutated');
  r.checks.push({ id: 'X', status: 'FAIL' });
  assert.ok(assessHeapRead(f).checks.every(c => c.id !== 'X'), 'a second call is unaffected by mutating the first result');
});

console.log('[heap-read-probe] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
