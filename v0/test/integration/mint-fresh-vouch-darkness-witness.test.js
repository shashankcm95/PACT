#!/usr/bin/env node
'use strict';

// PACT v0 -- mint-fresh-vouch DARKNESS WITNESS (plans/37 W3 §3(ii); the NS-9 dormancy proof).
//
// Claim under proof: the W3 mint harness (identity/mint-fresh-vouch.js) is imported by NOTHING in src/. Its live
// consumers are TESTS + the future deploy runbook -- NEVER the live convert/read-gate/disjointPaths path. So
// nothing in the trust engine MINTS via it; the mint side is producer-only. This is the LOAD-BEARING dormancy
// proof for the W3 NS-9 framing (a minted edge landing in a store gates nothing). It goes RED the instant a
// live-path fold -- or the deploy wiring -- imports the harness (the intended deliberate-update signal).
//
// NON-VACUITY (the L-2 pattern): FIRST prove the module exists AND the src enumeration is non-empty, else
// "imported by nothing" passes vacuously (a rename-away / empty-scan trap).

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const MODULE_REL = 'identity/mint-fresh-vouch.js';

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

test('precondition: identity/mint-fresh-vouch.js exists (else the witness is vacuous)', () => {
  assert.ok(fs.existsSync(path.join(SRC, MODULE_REL)), 'the module under witness must exist');
});

test('precondition: the src/ enumeration is non-empty (else "imported by nothing" passes vacuously)', () => {
  assert.ok(allSrcFiles(SRC).length > 0, 'src enumeration empty -- the witness would disarm silently');
});

test('DORMANT: no src module requires mint-fresh-vouch (the mint harness is producer-only -- the live path never mints)', () => {
  const importers = allSrcFiles(SRC)
    .filter((f) => !/mint-fresh-vouch\.js$/.test(f))
    // match BOTH the bare and explicit `.js` form (the W0 CodeRabbit-Major lesson). Anchored to the closing quote
    // so `mint-fresh-voucher` / `mint-fresh-vouch-v2` do NOT false-match (VERIFY-hacker V7).
    .filter((f) => /require\(['"][^'"]*mint-fresh-vouch(?:\.js)?['"]\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(importers, [], 'mint-fresh-vouch must be imported by NOTHING in src (its consumers are tests + the deploy runbook, never the live path); found: ' + importers.join(', '));
});

console.log(`\n[mint-fresh-vouch-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
