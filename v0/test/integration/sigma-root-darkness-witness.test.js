#!/usr/bin/env node
'use strict';

// PACT v0 -- sigma_root DARKNESS WITNESS (plans/32 W1, VERIFY architect F4).
//
// W1's headline claim is "SHADOW: gates no action, byte-identical live behavior." That claim must be WITNESSED
// mechanically, not asserted in prose -- especially because registry.js (a module the LIVE fold imports) gains
// new exports here. Two witnesses:
//   (A) CONTAINED-CONSUMERS (UPDATED plans/39): registration-provenance is imported by EXACTLY {admission-gate
//       (dormant W2), registration-gate (plans/39 LIVE-but-DISARMED)}, and sigma-root by EXACTLY
//       {registration-provenance}. plans/39 DELIBERATELY SUPERSEDES the original plans/32 "no fold module pulls a
//       W1 module into the live graph" claim: it wires the verifier LIVE via registration-gate <-
//       convert.disjointPaths, DISARMED-by-default (byte-identical -- witnessed by
//       registration-gate-convert.test.js item 10; and registration-gate itself is imported ONLY by convert --
//       registration-gate-darkness-witness). The darkness is now CONTAINMENT of the consumer set + the disarmed
//       byte-identity, NOT structural absence. A THIRD, UNNAMED consumer of either W1 module fires RED (creep).
//   (B) BEHAVIORAL: seeding a root key (registerRoot) changes NONE of the predicates the fold reads
//       (isKnownRoot / lookupPublicKey / rootOf) -- the new writer touches only the independent rootKeys Map.
// If either witness ever fires RED beyond the named plans/39 wiring, the SHADOW/disarmed claim is broken.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reg = require('../../src/identity/registry');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const SRC = path.join(__dirname, '..', '..', 'src');

function jsFilesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

test('(A) CONTAINED-CONSUMERS: the W1 modules have EXACTLY their named importers (a THIRD fires RED — creep)', () => {
  // plans/39 SUPERSEDES the plans/32 "no fold module pulls a W1 module into the live graph" claim: it wires the
  // verifier LIVE-but-DISARMED via registration-gate <- convert.disjointPaths (byte-identity witnessed in
  // registration-gate-convert.test.js item 10; registration-gate's own single-consumer containment in
  // registration-gate-darkness-witness). So the darkness is now CONTAINMENT of the direct-consumer set, not
  // structural absence. Exact-set import edges (deepEqual, NEVER .includes) over the WHOLE src tree -- any UNNAMED
  // new consumer of either W1 module -> RED. (A regex on the require form, the house-style of the vouch-freshness /
  // registration-gate / edge-freshness witnesses; a string-built require would evade it, but none exists here.)
  const files = jsFilesUnder(SRC);
  assert.ok(files.length > 0, 'non-vacuity: the src enumeration must be non-empty');
  const importersOf = (name) => files
    .filter((f) => !new RegExp('[/\\\\]' + name + '\\.js$').test(f))
    .filter((f) => new RegExp('require\\([\'"][^\'"]*' + name + '(?:\\.js)?[\'"]\\)').test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
    .sort();
  assert.deepEqual(importersOf('registration-provenance'), ['trust/admission-gate.js', 'trust/registration-gate.js'],
    'registration-provenance must be imported by EXACTLY {admission-gate (dormant W2), registration-gate (plans/39 live-disarmed)}');
  assert.deepEqual(importersOf('sigma-root'), ['identity/registration-provenance.js'],
    'sigma-root must be imported by EXACTLY {registration-provenance}');
});

test('(B) BEHAVIORAL: seeding a root key changes NONE of the fold-read predicates (isKnownRoot / lookupPublicKey / rootOf)', () => {
  const ROOT = generateEdgeKeypair();
  const PERSONA = generateEdgeKeypair();
  const build = () => {
    const r = reg.createRegistry();
    reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: PERSONA.publicKeyPem });
    return r;
  };
  const before = build();
  const after = build();
  reg.registerRoot(after, { humanUid: 'human:alice', rootPublicKeyPem: ROOT.publicKeyPem });
  // every predicate the live fold reads must be identical with/without the registerRoot call
  assert.equal(reg.isKnownRoot(after, 'human:alice'), reg.isKnownRoot(before, 'human:alice'), 'isKnownRoot unchanged');
  assert.equal(reg.lookupPublicKey(after, 'did:key:zAlice'), reg.lookupPublicKey(before, 'did:key:zAlice'), 'lookupPublicKey unchanged');
  assert.equal(reg.rootOf(after, 'did:key:zAlice'), reg.rootOf(before, 'did:key:zAlice'), 'rootOf unchanged');
  // and a root seeded with NO persona is still not frame-admissible (F3)
  const solo = reg.createRegistry();
  reg.registerRoot(solo, { humanUid: 'human:ghost', rootPublicKeyPem: ROOT.publicKeyPem });
  assert.equal(reg.isKnownRoot(solo, 'human:ghost'), false, 'a persona-less seeded root does not enter the live roots Set');
});

console.log(`\n[sigma-root-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
