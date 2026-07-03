#!/usr/bin/env node
'use strict';

// PACT v0 -- signed-edge DARKNESS WITNESS (plans/35 W1 §3; the NS-9 dormancy proof).
//
// Claim under proof: the W1 signed-edge PRODUCER (identity/signed-edge.js) is DORMANT -- no src module requires it
// (no fold mints a freshness-bound VOUCH yet; W3's harness will). It is a pure key-free spec-builder consumed only
// by tests today, so the whole freshness-edge path is SHADOW until W2 (read-gate wiring) + W3 (the harness). It
// goes RED the instant a fold or harness legitimately wires it -- the intended deliberate-update signal.
//
// NON-VACUITY (the L-2 pattern): FIRST prove the module exists AND the src enumeration is non-empty, else "nothing
// requires it" passes vacuously.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const MODULE_REL = 'identity/signed-edge.js';

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

test('precondition: identity/signed-edge.js exists (else the witness is vacuous)', () => {
  assert.ok(fs.existsSync(path.join(SRC, MODULE_REL)), 'the module under witness must exist');
});

test('precondition: the src/ enumeration is non-empty (else "nothing requires it" passes vacuously)', () => {
  assert.ok(allSrcFiles(SRC).length > 0, 'src enumeration empty -- the witness would disarm silently');
});

test('DORMANT: signed-edge is imported ONLY by the W3 mint harness (its FIRST + only src consumer -- W3 exact-set allowlist)', () => {
  const importers = allSrcFiles(SRC)
    .filter((f) => !/signed-edge\.js$/.test(f))
    // match BOTH the bare and the explicit `.js` form (the W0 CodeRabbit-Major lesson -- do not miss `.js` imports).
    .filter((f) => /require\(['"][^'"]*signed-edge(?:\.js)?['"]\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f));
  // W3 UPDATE (plans/37): identity/mint-fresh-vouch.js is signed-edge's FIRST src consumer (it composes
  // buildSignedVouchSpec -> createMinter -> mint). It is the DELIBERATE one-entry allowlist -- the harness is
  // ITSELF dormant (mint-fresh-vouch-darkness-witness proves nothing in src requires IT either), so the "nothing
  // LIVE mints via signed-edge" guarantee holds transitively. EXACT-SET (deepEqual, NEVER .includes): any SECOND
  // consumer -- a live-path fold pulling the producer -- goes RED, the intended deliberate-update signal.
  assert.deepEqual(importers.sort(), ['identity/mint-fresh-vouch.js'], 'signed-edge must be imported ONLY by the W3 mint harness; found: ' + importers.join(', '));
});

console.log(`\n[signed-edge-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
