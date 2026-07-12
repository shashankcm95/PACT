#!/usr/bin/env node
'use strict';

// PACT v0 -- arming-manifest DARKNESS WITNESS (plans/54 / EPIC #96 Wave 1; the NS-9 dormancy proof).
//
// Claim under proof: resolveArmedContext (the fail-closed all-or-none preflight) ARMS NOTHING. Even when it
// reports a FULLY ARMED, coherent context, the real trust gates stay dark:
//   * mayGate(.., {highStakes:true}) still refuses (epistemicIndependence() hardcoded WEAK -- U2 open);
//   * convert(..).actionable is still false (INV-16).
// And -- the durable form -- NO src module imports the manifest (it is import-dark; its only consumers are this
// witness + the future operator-wiring). Wave 1 is a pure primitive: no consumer, closes #84 (the preflight now
// EXISTS), arms nothing. The admission-gate rewire (#82-structural) is Wave 2 (VERIFY board §7 / Q2).
//
// NON-VACUITY (the L-2 pattern): FIRST prove the module exists AND the src enumeration is non-empty, else both
// the "arms nothing" and "imported by nothing" checks pass vacuously (a rename-away / empty-scan trap).
//
// Layering-exempt BY PATH (offenders() in layering.test.js scans only src/) -- may import across trust/ +
// independence/ together.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { resolveArmedContext } = require('../../src/trust/arming-manifest');
const { mayGate, independenceLabel } = require('../../src/independence/weak-flag');
const { convert } = require('../../src/trust/convert');
const reg = require('../../src/identity/registry');

const SRC = path.join(__dirname, '..', '..', 'src');
const MODULE_REL = 'trust/arming-manifest.js';
const { assertOnlyLiteralRequires, allSrcJsFiles } = require('../_util/require-scan');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const FULL_ARM = { admission: true, signing: true, anchoring: true, freshness: true };

test('precondition: trust/arming-manifest.js exists (else the witness is vacuous)', () => {
  assert.ok(fs.existsSync(path.join(SRC, MODULE_REL)), 'the module under witness must exist');
});

test('precondition: the src/ enumeration is non-empty (else the checks pass vacuously)', () => {
  assert.ok(allSrcJsFiles(SRC).length > 0, 'src enumeration empty -- the witness would disarm silently');
});

// NOTE (CodeRabbit / honesty): mayGate + convert do NOT consume an armed context (nothing does -- the manifest is
// import-dark by design). So the two checks below are BASELINE-SINK checks: they prove the sinks are dark, but the
// `ctx.armed` precondition cannot causally feed them, so they cannot by themselves witness the manifest being wired
// into a gate. THE durable dormancy proof is the STRUCTURAL tripwire test (no src imports arming-manifest) -- if a
// future edit wired the manifest into mayGate/convert, that file's import goes RED there. These two are the weaker,
// secondary coupling (they catch the narrower "U2 lifted / sink flips on its own" edit class).
test('BASELINE SINK is dark (mayGate): a high-stakes gate stays refused (weak coupling; structural test is the proof)', () => {
  const ctx = resolveArmedContext(FULL_ARM);
  assert.equal(ctx.armed, true, 'precondition: the manifest reports FULLY ARMED (non-decorative)');
  assert.equal(ctx.coherent, true);
  const label = independenceLabel({ topological: 99 }); // a strong topological count must not matter
  const armedGateDecision = ctx.armed && mayGate(label, { highStakes: true });
  assert.equal(armedGateDecision, false, 'even a fully-armed manifest cannot unlock a high-stakes action (U2 open)');
  assert.equal(mayGate(label, { highStakes: true }), false);
});

test('BASELINE SINK is dark (convert.actionable): actionable stays false (weak coupling; structural test is the proof)', () => {
  const registry = reg.createRegistry();
  const meCtx = { registry, storeOpts: { receiverId: 'did:key:zME', stateDir: null } };
  const ctx = resolveArmedContext(FULL_ARM);
  assert.equal(ctx.armed, true, 'precondition: fully armed');
  const out = convert(meCtx, 'did:key:zME', 'did:key:zAgent');
  assert.equal(out.actionable, false, 'convert.actionable stays false under a fully-armed manifest (INV-16, U2 open)');
});

test('STRUCTURAL dormancy tripwire (THE dormancy proof): arming-manifest is imported by NOTHING in src', () => {
  // #94/F19 SOUNDNESS: the literal-specifier scan below is complete only if NO computed require() exists in the
  // tree (a require(base+name) would slip past silently). assertOnlyLiteralRequires fails RED the instant one is added.
  assertOnlyLiteralRequires(allSrcJsFiles(SRC));
  const MODULE_ABS = path.join(SRC, MODULE_REL);
  const importers = allSrcJsFiles(SRC)
    .filter((f) => path.resolve(f) !== MODULE_ABS) // exclude the EXACT witnessed module (not a basename match)
    .filter((f) => {
      // RESOLVE literal require specifiers to absolute paths and compare EXACTLY (CodeRabbit): a whitespace/
      // newline-tolerant scan (require(\n '...' \n)) + path resolution cannot be evaded by a formatted import
      // nor false-matched by a substring-colliding specifier. Safe because assertOnlyLiteralRequires (above) has
      // already proven every require arg is a string literal, so enumerating literal specifiers is COMPLETE.
      const src = fs.readFileSync(f, 'utf8');
      const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      const dir = path.dirname(f);
      let m;
      while ((m = re.exec(src)) !== null) {
        const spec = m[1];
        if (!spec.startsWith('.')) continue; // a bare/package specifier can never resolve to a local src file
        const resolved = path.resolve(dir, spec);
        if (resolved === MODULE_ABS || resolved + '.js' === MODULE_ABS) return true;
      }
      return false;
    })
    .map((f) => path.relative(SRC, f))
    .sort();
  // EXACT-SET (deepEqual, never .includes): the Wave-1 primitive has NO live consumer (consumers are this witness
  // + the future operator-wiring / Wave-2 admission-gate rewire). ANY src importer goes RED (deliberate-update signal).
  assert.deepEqual(importers, [], 'arming-manifest must be imported by NOTHING in src; found: ' + importers.join(', '));
});

console.log(`\n[arming-manifest-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
