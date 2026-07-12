#!/usr/bin/env node
'use strict';

// PACT v0 -- edge-freshness DARKNESS WITNESS (plans/34 W0 §3; the NS-9 dormancy proof).
//
// Claim under proof: the W0 freshness primitive (lib/edge-freshness.js) is DORMANT -- no src module requires it.
// It arms nothing, narrows nothing, hardens nothing today (NS-9). It goes RED the instant W1 (the identity/
// producer) or W2 (the read-gate verify) legitimately wires it -- at which point THIS going RED is the intended
// deliberate-update signal (evolve to a one-entry allowlist, the arming-witness cascade pattern).
//
// NON-VACUITY (architect L-2): a source-text require-scan passes VACUOUSLY if the enumeration is empty or the
// module was renamed away (the layering.test.js:50-59 trap). So FIRST prove the module exists AND the src
// enumeration is non-empty; only then is "nothing requires it" a meaningful assertion.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const { assertOnlyLiteralRequires, allSrcJsFiles } = require('../_util/require-scan');
const MODULE_REL = 'lib/edge-freshness.js';

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

function allSrcFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allSrcFiles(fp));
    else if (e.name.endsWith('.js')) out.push(fp);
  }
  return out;
}

test('precondition: lib/edge-freshness.js exists (else the witness is vacuous)', () => {
  assert.ok(fs.existsSync(path.join(SRC, MODULE_REL)), 'the module under witness must exist');
});

test('precondition: the src/ enumeration is non-empty (else "nothing requires it" passes vacuously)', () => {
  assert.ok(allSrcFiles(SRC).length > 0, 'src enumeration empty -- the witness would disarm silently');
});

test('DORMANT: edge-freshness is imported ONLY by signed-edge + the disarmed vouch-freshness filter (W2 exact-set allowlist)', () => {
  // #94/F19 SOUNDNESS: the literal-require scan below is complete only if NO computed require() exists in the tree
  // (a require(base+name) would slip past silently). Fail RED the instant one is added.
  assertOnlyLiteralRequires(allSrcJsFiles(SRC));
  const importers = allSrcFiles(SRC)
    .filter((f) => !/edge-freshness\.js$/.test(f))
    // match BOTH the bare `require('.../edge-freshness')` and the explicit `.js` form (CodeRabbit Major): a regex
    // anchored to `edge-freshness['"]` alone misses `require('.../edge-freshness.js')` -> the witness would pass
    // VACUOUSLY when an importer uses the extension. `(?:\.js)?` closes the hole.
    .filter((f) => /require\(['"][^'"]*edge-freshness(?:\.js)?['"]\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f));
  // W2 UPDATE (plans/36): trust/vouch-freshness.js is edge-freshness's SECOND consumer (it imports
  // checkFreshnessWindow + isValidNonce, DRY). UNLIKE signed-edge (structurally dormant --
  // signed-edge-darkness-witness), vouch-freshness IS wired into a live module (convert via disjointPaths), so
  // the dormancy for its path is now BEHAVIORAL: disarmed-by-default => the filter is inert => byte-identical
  // (proven by vouch-freshness-convert.test.js's disarmed==unfiltered assertion + the dpArmed<dpDisarmed
  // non-vacuity precondition). EXACT-SET (deepEqual, NEVER .includes): any THIRD importer -- a grounding/read-gate
  // fold pulling checkFreshnessWindow DIRECTLY into a live path (bypassing the disarmed filter) -- goes RED.
  assert.deepEqual(importers.sort(), ['identity/signed-edge.js', 'trust/vouch-freshness.js'], 'edge-freshness must be imported ONLY by signed-edge + vouch-freshness; found: ' + importers.join(', '));
});

console.log(`\n[edge-freshness-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
