#!/usr/bin/env node
'use strict';

// PACT v0 -- P5-W2 DARKNESS WITNESS (plans/28 §3/§6; the NS-9 proof).
//
// Claim under proof: the arming harness (W1 arm-flags + W2 arming-coherence) arms NOTHING. With the
// coherence primitive reporting FULLY ARMED + coherent, the real trust gates stay dark:
//   * mayGate(.., {highStakes:true}) still refuses (epistemicIndependence() is hardcoded WEAK -- U2 open);
//   * convert(..).actionable is still false (INV-16).
//
// NON-VACUITY (VERIFY-hacker CRITICAL -- the witness as first drawn was a tautology: armingCoherence's output
// is causally disconnected from mayGate/convert, so an assertion that "the gates are dark" would pass even if a
// future edit WRONGLY wired arming into a gate). Two mechanisms make this witness capable of going RED:
//   (1) BEHAVIORAL coupling: we AND the proven-armed flag with the real gate decision -- `armed && mayGate(..)`.
//       This witnesses the mayGate-honors-arming edit class specifically (if a future edit lifted U2 or made
//       the gate read arming, the conjunction flips true -> RED). It does NOT by itself witness arming being
//       wired into some OTHER gate -- that class is covered by (2), the honesty-lens division of labor.
//   (2) STRUCTURAL dormancy tripwire: NO src module may `require` the arming module (whole-tree computed scan).
//       This is the DURABLE form of "arms nothing today" -- it goes RED the instant someone wires arming in,
//       anywhere in src/.
//
// This test lives under test/ and is layering-exempt BY PATH (offenders() in layering.test.js scans only src/),
// which is why it may legally import across trust/ + independence/ together.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { armingCoherence } = require('../../src/trust/arming-coherence');
const { mayGate, independenceLabel } = require('../../src/independence/weak-flag');
const { convert } = require('../../src/trust/convert');
const reg = require('../../src/identity/registry');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const SRC = path.join(__dirname, '..', '..', 'src');
const { assertOnlyLiteralRequires, allSrcJsFiles } = require('../_util/require-scan');

test('ARMED == DARK (mayGate): full arming does NOT unlock a high-stakes gate', () => {
  const coh = armingCoherence({ admissionArmed: true, signingArmed: true });
  // arming is genuinely ON (non-decorative): if this were false the witness would be vacuous.
  assert.equal(coh.admissionArmed, true, 'precondition: the coherence primitive reports FULLY ARMED');
  assert.equal(coh.coherent, true);

  const label = independenceLabel({ topological: 99 }); // a strong topological count must not matter
  // BEHAVIORAL coupling (capable of RED): the most permissive plausible future wiring is
  // "armed AND the real gate" -- it is false ONLY because mayGate refuses on the always-WEAK U2 axis. If a
  // future edit lifted U2 or wired arming to bypass mayGate, `armed && mayGate` would become true -> RED.
  const armedGateDecision = coh.admissionArmed && mayGate(label, { highStakes: true });
  assert.equal(armedGateDecision, false, 'even fully armed, a high-stakes action is refused (U2 open)');
  // and the raw gate is dark irrespective of arming:
  assert.equal(mayGate(label, { highStakes: true }), false);
});

test('ARMED == DARK (convert.actionable): full arming does NOT flip actionable', () => {
  const registry = reg.createRegistry();
  const meCtx = { registry, storeOpts: { receiverId: 'did:key:zME', stateDir: null } };
  const coh = armingCoherence({ admissionArmed: true, signingArmed: true });
  assert.equal(coh.admissionArmed, true, 'precondition: fully armed');
  const out = convert(meCtx, 'did:key:zME', 'did:key:zAgent');
  // capable of RED: if a future edit read arming into convert and flipped actionable, this goes RED.
  assert.equal(out.actionable, false, 'convert.actionable stays false under full arming (INV-16, U2 open)');
});

test('STRUCTURAL dormancy tripwire: arming-coherence is imported ONLY by the dormant {signing-armed-mint} consumer', () => {
  // COMPUTED whole-tree scan, not a hardcoded pair (VALIDATE-hacker LOW: other decision-shaped trust modules
  // exist; a future edit wiring arming into read-gate/issuance-policy/... must go RED too). Anchored to a
  // require() call so a prose mention cannot false-fail.
  //
  // W2a UPDATE (plans/55): admission-gate MIGRATED off arming-coherence onto the 4-signal arming-MANIFEST
  // (resolveArmedContext), so arming-coherence now has EXACTLY ONE consumer -- signing-armed-mint (the SIGNING
  // arm's producer-consumer, plans/42), itself wired to nothing (signing-armed-mint-darkness-witness). The
  // "arms nothing" guarantee holds transitively through it. The allowlist is EXACTLY this one (deepEqual, never a
  // subset). ANY OTHER importer -- or signing-armed-mint being wired into a live gate -- goes RED. (admission-gate's
  // consumption of arming-manifest is witnessed by arming-manifest-darkness-witness instead.)
  // #94/F19 SOUNDNESS: the inline literal-require scan below is complete only if NO computed require() exists in
  // the tree (a require(base+name) would slip past silently). Fail RED the instant one is added.
  assertOnlyLiteralRequires(allSrcJsFiles(SRC));
  const importers = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.name.endsWith('.js') && e.name !== 'arming-coherence.js') {
        if (/require\(['"][^'"]*arming-coherence['"]\)/.test(fs.readFileSync(fp, 'utf8'))) importers.push(path.relative(SRC, fp));
      }
    }
  };
  walk(SRC);
  assert.deepEqual(importers.sort(), ['trust/signing-armed-mint.js'], 'arming-coherence must be imported ONLY by the dormant {signing-armed-mint}; found: ' + importers.join(', '));
});

console.log(`\n[arming-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
