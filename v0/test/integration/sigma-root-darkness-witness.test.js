#!/usr/bin/env node
'use strict';

// PACT v0 -- sigma_root DARKNESS WITNESS (plans/32 W1, VERIFY architect F4).
//
// W1's headline claim is "SHADOW: gates no action, byte-identical live behavior." That claim must be WITNESSED
// mechanically, not asserted in prose -- especially because registry.js (a module the LIVE fold imports) gains
// new exports here. Two witnesses:
//   (A) STRUCTURAL: no module under trust/** or grounding/** require()s sigma-root or registration-provenance.
//   (B) BEHAVIORAL: seeding a root key (registerRoot) changes NONE of the predicates the fold reads
//       (isKnownRoot / lookupPublicKey / rootOf) -- the new writer touches only the independent rootKeys Map.
// If either witness ever fires RED, the wave is no longer dark and the SHADOW claim is false.

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

test('(A) STRUCTURAL: no live-fold module (trust/grounding/frame) pulls a W1 module into the require GRAPH', () => {
  // Cover trust/ + grounding/ + FRAME/ -- frame.js:94 reads isKnownRoot (the live root_valid gate), the most
  // safety-relevant registry consumer the earlier trust+grounding-only witness was blind to (VALIDATE honesty
  // HIGH-2). And inspect the ACTUAL resolved require.cache GRAPH, not a textual grep -- immune to a string-built
  // / obfuscated require path a regex would miss (VALIDATE code-reviewer HIGH). This test file itself requires
  // NEITHER W1 module, so any W1 key in require.cache after loading the fold means a fold module pulled it in.
  const foldFiles = [
    ...jsFilesUnder(path.join(SRC, 'trust')),
    ...jsFilesUnder(path.join(SRC, 'grounding')),
    ...jsFilesUnder(path.join(SRC, 'frame')),
  ];
  assert.ok(foldFiles.length >= 9, 'sanity: found the live-fold modules incl. frame/ (' + foldFiles.length + ')');
  for (const f of foldFiles) require(f);
  const leaked = Object.keys(require.cache).filter((p) => /[/\\]identity[/\\](sigma-root|registration-provenance)\.js$/.test(p));
  assert.deepEqual(leaked, [], 'NO fold module may pull a W1 module into the require graph while the wave is SHADOW -- leaked: ' + leaked.join(', '));
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
