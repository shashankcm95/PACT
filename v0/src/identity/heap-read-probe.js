#!/usr/bin/env node
// PACT R-heap — identity/heap-read-probe.js  (plans/26)
//
// The heap-read non-exfiltration verdict. `assessHeapRead(facts)` is a PURE verdict over the observed legs
// (L-pre wrapper, L0 ptrace-policy preconditions, L1 present-target, L2 cross-uid denial battery, L3 the
// privileged positive control HARD GATE, L4 same-uid). It mirrors custody-verify's `assessCustody`: it NEVER
// asserts custody-real / "hardened" (NS-9) — it reports `hostObservableDenialChecksHeld` + the binding-gap
// residual + `requiresOutOfBandUidConfirmation`. The LEGS themselves are Linux kernel I/O run on the deployed
// box (the r-heap runbook produces the facts JSON); this module ENFORCES the verdict discipline over them —
// most load-bearingly the L3 GATE (a cross-uid denial proves NOTHING unless a privileged reader found the key
// at the same pid, else the run is VACUOUS) and the per-vector L4 (closing the same-uid HEAP-READ channel,
// NOT the same-uid ORACLE residual — that is R2, untouched).
//
// Rule-2a: the unit suite proves THIS verdict logic; only the live VM run proves the kernel actually denies.

'use strict';

/**
 * PURE verdict over the observed legs. No I/O. The returned object is fresh each call (input never mutated).
 * @param {object} facts  the leg observations (see the r-heap runbook for the producing commands):
 *   wrapper {ok,isFile,worldOrGroupWritable}|{ok:false,errno}      (L-pre / custody-verify C2.5)
 *   ptraceScope:number, yamaActive:boolean, scopeRecheck:number    (L0 + VT-8 TOCTOU re-read)
 *   attacker {uid,hasCapSysPtrace}, borrowedCaps {capSysPtraceBinaries[],setuidReviewed}  (L0 / VT-5,9)
 *   coreLocked:boolean, swapLocked:boolean                          (L0 operator-runtime lock / M2)
 *   target {keyResidentViaProductionLoad,pid}                       (L1 present-target)
 *   denial {ptraceAttach,procMem,processVmReadv:{denied,errno}, procMaps,devMem:{denied}, coreDump:{hostReadable}, swap:{keyHitHostReadable}}  (L2)
 *   positiveControl {keyFoundPem,keyFoundSeed,samePid}              (L3 HARD GATE)
 *   sameUid {ptraceAttack,procMem,processVmReadv:{denied}, brokerSetsPtracer}  (L4)
 * @returns {{hostObservableDenialChecksHeld:boolean, vacuous:boolean, requiresOutOfBandUidConfirmation:boolean, checks:object[], residuals:string[]}}
 *   Deliberately NO `hardened` / `custodyReal` field (NS-9): the host cannot observe the process<->uid bind.
 */
function assessHeapRead(facts = {}) {
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) facts = {}; // null/array/scalar -> every leg fails closed (VALIDATE code-reviewer HIGH)
  const checks = [];
  const residuals = [];
  const fail = (id, detail) => checks.push({ id, status: 'FAIL', detail });
  const pass = (id, detail) => checks.push({ id, status: 'PASS', detail });
  const note = (id, detail) => checks.push({ id, status: 'NOTE', detail });
  let vacuous = false;

  // L-pre — wrapper integrity (custody-verify C2.5). The heap claim is NULL without custody-clean (hacker M1).
  const w = facts.wrapper || {};
  if (!w.ok) fail('L-pre-wrapper', 'sudo wrapper not statable (' + (w.errno || 'unknown') + ')');
  else if (!w.isFile) fail('L-pre-wrapper', 'sudo wrapper is not a regular file — hijackable');
  else if (w.worldOrGroupWritable) fail('L-pre-wrapper', 'sudo wrapper is group/world-writable — the host can run code AS the broker uid (become-broker-uid -> read own memory)');
  else pass('L-pre-wrapper', 'sudo wrapper is a regular, non-group/world-writable file');

  // L0 — the full ptrace-policy precondition (fail-closed; architect R-A1 + hacker M2).
  if (facts.ptraceScope === 2) pass('L0-scope', 'kernel.yama.ptrace_scope == 2 (admin-only attach)');
  else fail('L0-scope', 'kernel.yama.ptrace_scope is ' + facts.ptraceScope + ' (must be 2)');
  if (facts.yamaActive === true) pass('L0-yama', 'Yama is the active LSM');
  else fail('L0-yama', 'Yama is not the active LSM — ptrace_scope is not enforced');
  const at = facts.attacker || {};
  if (at.uid === 0) fail('L0-attacker-uid', 'the attacker process is root (uid 0) — bypasses ptrace_may_access');
  else if (typeof at.uid !== 'number') fail('L0-attacker-uid', 'attacker uid unknown');
  else pass('L0-attacker-uid', 'attacker is a non-root uid (' + at.uid + ')');
  if (at.hasCapSysPtrace) fail('L0-attacker-cap', 'the attacker holds CAP_SYS_PTRACE — it can ptrace regardless of scope');
  else pass('L0-attacker-cap', 'attacker holds no CAP_SYS_PTRACE');
  const bc = facts.borrowedCaps || {};
  if (!Array.isArray(bc.capSysPtraceBinaries)) fail('L0-borrowed-cap', 'borrowed-cap scan not run (getcap -r /)');
  else if (bc.capSysPtraceBinaries.length > 0) fail('L0-borrowed-cap', 'installed binaries carry cap_sys_ptrace (' + bc.capSysPtraceBinaries.join(', ') + ') — a borrowed-cap read path');
  else pass('L0-borrowed-cap', 'no installed binary carries cap_sys_ptrace');
  if (bc.setuidReviewed === true) pass('L0-setuid', 'setuid surface (find / -perm -4000) reviewed');
  else note('L0-setuid', 'setuid surface not attested reviewed');
  if (facts.coreLocked === true) pass('L0-core', 'core dumps locked (RLIMIT_CORE=0 / non-host-readable core_pattern + PR_SET_DUMPABLE 0)');
  else fail('L0-core', 'core dumps NOT locked — an induced crash could leak the key post-mortem');
  if (facts.swapLocked === true) pass('L0-swap', 'key pages kept out of host-readable swap (mlock / encrypted swap)');
  else fail('L0-swap', 'swap NOT locked — a swapped key page could leak');
  if (facts.scopeRecheck === 2) pass('L0-scope-recheck', 'ptrace_scope re-read == 2 immediately before L2 (no TOCTOU)');
  else fail('L0-scope-recheck', 'ptrace_scope re-read is ' + facts.scopeRecheck + ' (flipped after L0 — TOCTOU)');

  // L1 — present-target (vacuity #1): a proven-resident key via the PRODUCTION load path.
  const t = facts.target || {};
  if (t.keyResidentViaProductionLoad === true && t.pid != null) pass('L1-present', 'key resident in pid ' + t.pid + ' via the production load path');
  else { fail('L1-present', 'no proven-resident key via the production load path — harness unrepresentative / target absent'); vacuous = true; }

  // L3 — the HARD GATE (vacuity #2): L2 is credited ONLY if a privileged reader found the key at the SAME pid.
  // EITHER form suffices (PEM string OR the ed25519 seed; VALIDATE hacker H2): the paused harness PINS the PEM
  // string as a LIVE module const — NOT a freed-page residue (unlike production load-sign-exit) — so a PEM find
  // IS proof of live residency. The seed scan is optional belt-and-suspenders (plans/26 §3 L3).
  const pc = facts.positiveControl || {};
  const l3found = pc.keyFoundPem === true || pc.keyFoundSeed === true;
  if (l3found && pc.samePid === true) pass('L3-positive', 'privileged reader found the key (' + [pc.keyFoundPem && 'PEM', pc.keyFoundSeed && 'seed'].filter(Boolean).join('+') + ') at the same pid — the guard is real + the target present');
  else { fail('L3-positive', 'privileged positive control did NOT find the key at the same pid — the L2 denial proves nothing (VACUOUS)'); vacuous = true; }

  // L2 — the cross-uid denial battery (each vector a named-errno sub-leg; hacker H1). Credited only when !vacuous.
  const d = facts.denial || {};
  for (const [id, leg, what] of [['L2-ptrace', d.ptraceAttach, 'ptrace(PTRACE_ATTACH/SEIZE)'], ['L2-procmem', d.procMem, 'open(/proc/pid/mem)+pread'], ['L2-vmreadv', d.processVmReadv, 'process_vm_readv']]) {
    if (leg && leg.denied === true) pass(id, what + ' denied (' + (leg.errno || 'EPERM/EACCES') + ')');
    else fail(id, what + ' was NOT denied cross-uid — the key is exfiltrable' + (leg && leg.denied !== undefined && leg.denied !== false ? ' (denied=' + JSON.stringify(leg.denied) + ' — must be a literal boolean true)' : ''));
  }
  if (d.procMaps && d.procMaps.denied === true) pass('L2-maps', '/proc/pid/maps denied cross-uid');
  else fail('L2-maps', '/proc/pid/maps readable cross-uid — leaks the heap layout (the open must be denied, not "no key bytes")');
  if (d.devMem && d.devMem.denied === true) pass('L2-devmem', '/dev/mem + /dev/kmem + /proc/kcore denied');
  else fail('L2-devmem', '/dev/mem / kcore readable cross-uid');
  if (d.coreDump && d.coreDump.hostReadable === false) pass('L2-core', 'an induced crash produced no host-readable core');
  else fail('L2-core', 'an induced core dump is host-readable — the key leaks post-mortem');
  if (d.swap && d.swap.keyHitHostReadable === false) pass('L2-swap', 'no key page reached a host-readable swap device');
  else fail('L2-swap', 'a key page reached a host-readable swap device');

  // L4 — same-uid (per vector) + the PR_SET_PTRACER carve-out (hacker C1). Closes the same-uid HEAP-READ
  // channel ONLY — NOT the same-uid ORACLE residual (a same-uid allowlisted caller can still trigger a sign; R2).
  const su = facts.sameUid || {};
  for (const [id, leg, what] of [['L4-ptraceAttack', su.ptraceAttack, 'ptrace'], ['L4-procMem', su.procMem, '/proc/pid/mem'], ['L4-processVmReadv', su.processVmReadv, 'process_vm_readv']]) {
    if (leg && leg.denied === true) pass(id, 'same-uid ' + what + ' denied under scope=2');
    else fail(id, 'same-uid ' + what + ' NOT denied — the scope=2 same-uid heap-read channel is OPEN');
  }
  // INVERTED to fail-closed (VALIDATE hacker C1): a PASS requires a LITERAL boolean false. A truthy non-boolean
  // (the string 'true' the runbook grep emits, 1, {}, undefined, a missing field) FAILS — never the safe branch.
  if (su.brokerSetsPtracer === false) pass('L4-ptracer-carveout', 'the broker declares no PR_SET_PTRACER tracer');
  else fail('L4-ptracer-carveout', 'the broker may declare a PR_SET_PTRACER tracer (reported ' + JSON.stringify(su.brokerSetsPtracer) + ' — must be a literal boolean false; the carve-out re-opens scope=2 same-uid)');

  const held = !checks.some(c => c.status === 'FAIL') && !vacuous;
  if (held) {
    residuals.push('binding (out-of-band, the SOLE determiner): the probe proved the KERNEL denies a cross-uid + same-uid memory read under a proven-resident key (L1+L3); it did NOT and CANNOT prove the signing PROCESS runs as the separate uid. Attest out-of-band (`id`, `ps -o uid= -p <pid>`, `ls -l <key>`, `cat <key>` -> Permission denied). ONLY that decides custody-real (NS-9).');
  }
  return {
    // the host-observable DENIAL checks held — NOT a claim that the memory boundary is hardened-real (the host
    // cannot observe the process<->uid bind; hardening is conditional on the out-of-band attestation, NS-7/NS-9).
    // Named for the OBSERVATION (denial checks held), not the PROPERTY (hardening) — sibling custody-verify parity.
    hostObservableDenialChecksHeld: held,
    vacuous,
    requiresOutOfBandUidConfirmation: held,
    checks,
    residuals,
  };
}

// ===================================== CLI (the operator runs this on the VM) =====================================

function formatReport(report) {
  const lines = [];
  for (const c of report.checks) lines.push('  [' + c.status.padEnd(4) + '] ' + c.id + ' — ' + c.detail);
  lines.push('');
  lines.push('hostObservableDenialChecksHeld: ' + report.hostObservableDenialChecksHeld);
  lines.push('vacuous: ' + report.vacuous);
  lines.push('requiresOutOfBandUidConfirmation: ' + report.requiresOutOfBandUidConfirmation);
  for (const r of report.residuals) lines.push('  residual: ' + r);
  lines.push('');
  if (report.vacuous) {
    lines.push('VACUOUS — the L3 positive control did not find the key at the target pid (or L1 had no resident');
    lines.push('target). The L2 denial proves NOTHING here. This run NARROWS only — do not report it as hardening.');
  } else if (report.hostObservableDenialChecksHeld) {
    lines.push('HOST-OBSERVABLE DENIAL CHECKS HELD — this is NOT a verification that the memory boundary is hardened-');
    lines.push('real. This tool cannot observe the process<->uid bind. Confirm out-of-band that the broker PROCESS');
    lines.push('runs as a genuinely DIFFERENT non-root uid (`id`, `ps -o uid= -p <pid>`, `ls -l <key>`, `cat <key>`');
    lines.push('-> Permission denied). --attested-cross-uid records that YOU attested it; it changes the exit code,');
    lines.push('NOT the proof. (Hardening is a deployment property; no flag and no green check establishes it.)');
  } else {
    lines.push('NOT HELD — a leg FAILED (see the FAIL line(s) above); the memory boundary is not protected here.');
  }
  return lines.join('\n');
}

function main() {
  const fs = require('fs');
  const argv = process.argv.slice(2);
  let factsPath = null; let attested = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--attested-cross-uid') { attested = true; continue; }
    if (argv[i] === '--facts') {
      const val = argv[i + 1];
      if (val === undefined || val.startsWith('-')) { process.stderr.write('heap-read-probe: --facts requires a path\n'); process.exit(2); }
      factsPath = val; i++; continue;
    }
    process.stderr.write('heap-read-probe: unknown argument: ' + argv[i] + '\n');
    process.exit(2);
  }
  if (!factsPath) {
    process.stderr.write('usage: heap-read-probe --facts <legs.json> [--attested-cross-uid]\n  (produce legs.json with the r-heap runbook commands on the deployed box)\n');
    process.exit(2);
  }
  let facts;
  try { facts = JSON.parse(fs.readFileSync(factsPath, 'utf8')); }
  catch (e) { process.stderr.write('heap-read-probe: cannot read facts JSON: ' + (e && e.message) + '\n'); process.exit(2); }
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) {
    process.stderr.write('heap-read-probe: facts JSON must be an object (got ' + JSON.stringify(facts) + ')\n'); process.exit(2);
  }
  const report = assessHeapRead(facts);
  process.stdout.write(formatReport(report) + '\n');
  // exit 0 ONLY when the legs held AND the operator attested the out-of-band uid check — never greener than the report.
  process.exit(report.hostObservableDenialChecksHeld && attested ? 0 : 1);
}

if (require.main === module) main();

module.exports = { assessHeapRead, formatReport };
