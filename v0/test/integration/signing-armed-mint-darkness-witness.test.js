#!/usr/bin/env node
'use strict';

// PACT v0 -- signing-armed-mint DARKNESS WITNESS (plans/42 W2; the NS-9 dormancy + containment proof).
//
// TWO claims:
//   (1) DORMANT: trust/signing-armed-mint.js is imported by NOTHING in src/. Its consumers are the W3 proof +
//       the deploy runbook -- NEVER the live convert/read-gate/disjointPaths path. So the arming-gated mint
//       producer gates nothing; disarmed = byte-identical (no live caller mints).
//   (2) CONTAINMENT: it imports EXACTLY {trust/arming-coherence, identity/mint-fresh-vouch, lib/refuse-alert}
//       -- the copy-paste / creep guard. A stray broker-launch / broker-client / registry import would signal a
//       per-mint custody-check or a wrong-layer coupling the W2 design deliberately EXCLUDES (assertBrokerPersona
//       is a deploy-wiring step, not a per-mint import). Exact-set (missing[] + unexpected[] both empty), never a
//       subset .includes.
//
// NON-VACUITY (the L-2 pattern): FIRST prove the module exists AND the src enumeration is non-empty, else the
// "imported by nothing" / "imports exactly" checks pass vacuously.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const { assertOnlyLiteralRequires, allSrcJsFiles } = require('../_util/require-scan');
const MODULE_REL = 'trust/signing-armed-mint.js';
// the require SPECIFIERS (relative to trust/) this module is allowed to hold -- exactly the three folded-in edges.
const EXPECTED_IMPORTS = ['../identity/mint-fresh-vouch', '../lib/refuse-alert', './arming-coherence'];

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

test('precondition: trust/signing-armed-mint.js exists (else the witness is vacuous)', () => {
  assert.ok(fs.existsSync(path.join(SRC, MODULE_REL)), 'the module under witness must exist');
});

test('precondition: the src/ enumeration is non-empty (else the checks pass vacuously)', () => {
  assert.ok(allSrcFiles(SRC).length > 0, 'src enumeration empty -- the witness would disarm silently');
});

test('(1) DORMANT: no src module requires signing-armed-mint (the arming-gated producer is import-dark)', () => {
  // #94/F19 SOUNDNESS: the literal-require scan below is complete only if NO computed require() exists in the tree
  // (a require(base+name) would slip past silently). Fail RED the instant one is added.
  assertOnlyLiteralRequires(allSrcJsFiles(SRC));
  const importers = allSrcFiles(SRC)
    .filter((f) => !/signing-armed-mint\.js$/.test(f))
    // anchored to the closing quote so `signing-armed-mint-v2` / `signing-armed-minter` do NOT false-match.
    .filter((f) => /require\(['"][^'"]*signing-armed-mint(?:\.js)?['"]\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f))
    .sort();
  assert.deepEqual(importers, [], 'signing-armed-mint must be imported by NOTHING in src (consumers are tests + the deploy runbook, never the live path); found: ' + importers.join(', '));
});

test('(2) CONTAINMENT: signing-armed-mint imports EXACTLY {arming-coherence, mint-fresh-vouch, refuse-alert} (exact-set; a stray broker/registry import fires RED)', () => {
  const src = fs.readFileSync(path.join(SRC, MODULE_REL), 'utf8');
  const found = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]).sort();
  const expected = [...EXPECTED_IMPORTS].sort();
  const missing = expected.filter((x) => !found.includes(x));
  const unexpected = found.filter((x) => !expected.includes(x));
  assert.deepEqual(missing, [], 'signing-armed-mint is MISSING an expected import: ' + missing.join(', '));
  assert.deepEqual(unexpected, [], 'signing-armed-mint has an UNEXPECTED import (creep -- e.g. broker-launch/broker-client/registry, deliberately excluded per architect fold 6/7): ' + unexpected.join(', '));
});

console.log(`\n[signing-armed-mint-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
