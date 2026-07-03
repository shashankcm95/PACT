#!/usr/bin/env node
'use strict';

// PACT v0 -- vouch-freshness STRUCTURAL DARKNESS WITNESS (plans/36 W2 §3(iii)).
//
// Claim under proof: the W2 freshness FILTER (trust/vouch-freshness.js) has EXACTLY ONE live consumer --
// disjointPaths in trust/convert.js -- so its blast radius is contained to the ONE advisory readout. It arms
// nothing on its own (disarmed-by-default; the BEHAVIORAL disarmed-inertness proof is in
// vouch-freshness-convert.test.js). This structural witness goes RED the instant a SECOND src module wires the
// filter into a live path (blast-radius creep) -- the intended deliberate-update signal.
//
// NON-VACUITY (the L-2 pattern): FIRST prove the module exists AND the src enumeration is non-empty, else
// "imported by exactly convert" passes vacuously (a rename-away / empty-scan trap).

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const MODULE_REL = 'trust/vouch-freshness.js';

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

test('precondition: trust/vouch-freshness.js exists (else the witness is vacuous)', () => {
  assert.ok(fs.existsSync(path.join(SRC, MODULE_REL)), 'the module under witness must exist');
});

test('precondition: the src/ enumeration is non-empty (else "imported by exactly convert" passes vacuously)', () => {
  assert.ok(allSrcFiles(SRC).length > 0, 'src enumeration empty -- the witness would disarm silently');
});

test('CONTAINED: vouch-freshness is imported ONLY by trust/convert.js (its first + only live consumer)', () => {
  const importers = allSrcFiles(SRC)
    .filter((f) => !/vouch-freshness\.js$/.test(f))
    // match BOTH the bare and explicit `.js` form (the W0 CodeRabbit-Major lesson -- do not miss `.js` imports).
    .filter((f) => /require\(['"][^'"]*vouch-freshness(?:\.js)?['"]\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f));
  // EXACT-SET (deepEqual, NEVER .includes): the filter's ONLY legal live consumer is disjointPaths (convert.js).
  // Any SECOND importer -- a grounding fold, read-gate, a new gate -- goes RED (blast-radius creep).
  assert.deepEqual(importers.sort(), ['trust/convert.js'], 'vouch-freshness must be imported ONLY by trust/convert.js; found: ' + importers.join(', '));
});

console.log(`\n[vouch-freshness-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
