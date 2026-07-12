#!/usr/bin/env node
'use strict';

// PACT v0 -- admission-gate DARKNESS WITNESS (plans/33 W2, VERIFY architect F5).
//
// W2 is DARK forward-contract infra: the armed gate is WIRED TO NOTHING and arms nothing. That claim must be
// WITNESSED mechanically, not asserted. Two witnesses:
//   (A) STRUCTURAL: no live-fold module (trust/grounding/frame, EXCLUDING admission-gate.js itself) pulls
//       admission-gate into the require GRAPH -- inspected via require.cache (robust to string-built/obfuscated
//       imports, per the plans/32 upgrade), covering frame/ (the live root_valid consumer). identity/ is NOT
//       scanned: the identity->trust layering ban (layering.test.js) already forbids an identity module from
//       importing admission-gate (trust/), and several identity/ modules are non-pure CLI harnesses.
//   (B) BEHAVIORAL non-vacuity: the DISARMED default admits a persona that would be REJECTED when armed -- so the
//       witness is capable of going RED if a future edit ever made the disarmed path reject, AND it proves the
//       gate genuinely CAN reject (not a vacuous admit-all).
// If either fires RED, the wave is no longer dark and the "arms nothing / gates nothing" claim is false.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reg = require('../../src/identity/registry');
const { generateEdgeKeypair } = require('../../src/lib/edge-attestation');
// admission-gate is required LAZILY inside test (B) -- if this test file required it at the top, it would
// pollute require.cache BEFORE test (A)'s cache check, false-positive-failing the "nothing pulls it in" scan.

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

test('(A) STRUCTURAL: no live-fold module pulls admission-gate into the require graph (it is wired to nothing)', () => {
  // require every live-fold module EXCEPT admission-gate.js itself (it lives under trust/ but is the DORMANT one);
  // if any of them pulled admission-gate in, it would appear in require.cache -> RED.
  const foldFiles = [
    ...jsFilesUnder(path.join(SRC, 'trust')),
    ...jsFilesUnder(path.join(SRC, 'grounding')),
    ...jsFilesUnder(path.join(SRC, 'frame')),
  ].filter((f) => !/[/\\]admission-gate\.js$/.test(f));
  assert.ok(foldFiles.length >= 9, 'sanity: found the live-fold modules (' + foldFiles.length + ')');
  for (const f of foldFiles) require(f);
  const leaked = Object.keys(require.cache).filter((p) => /[/\\]trust[/\\]admission-gate\.js$/.test(p));
  assert.deepEqual(leaked, [], 'NO fold module may pull admission-gate into the require graph while it is DARK -- leaked via: ' + leaked.join(', '));
});

test('(B) BEHAVIORAL non-vacuity: a FULLY-armed gate ADMITS a valid persona but REJECTS a bad sig via the VERIFIER (not the arm path)', () => {
  const A = require('../../src/trust/admission-gate'); // lazy -- AFTER test (A)'s require.cache check
  const S = require('../../src/identity/sigma-root');
  const ROOT = generateEdgeKeypair();
  const PERSONA = generateEdgeKeypair();
  const DID = 'did:key:zPersona';
  const CONTROLLER = 'human:alice';
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: CONTROLLER, rootPublicKeyPem: ROOT.publicKeyPem });
  reg.registerPersona(r, { personaDid: DID, humanUid: CONTROLLER, publicKeyPem: PERSONA.publicKeyPem });
  const goodSig = S.signSigmaRoot({ personaDid: DID, publicKeyPem: PERSONA.publicKeyPem, controller: CONTROLLER }, { privateKeyPem: ROOT.privateKeyPem });
  const badSig = 'x'.repeat(88); // present-but-invalid
  // ARM the FULL 4-signal surface (plans/55 / ADR-Dec-3 all-or-none). A 2-signal arm is a PARTIAL arm that REJECTS
  // via the ARM path -- which would make this witness VACUOUS (the sigma-root verifier could be deleted and it
  // stays green). Arming all 4 forces the reject to come from VERIFICATION, proven by the admit-on-good-sig companion.
  const ARM = { admissionArmed: true, signingArmed: true, anchoringArmed: true, freshnessArmed: true };
  const disarmed = A.admissionDecision({ registry: r, personaDid: DID, sigmaRoot: badSig }); // no arm -> clean baseline
  const armedGood = A.admissionDecision({ ...ARM, registry: r, personaDid: DID, sigmaRoot: goodSig });
  const armedBad = A.admissionDecision({ ...ARM, registry: r, personaDid: DID, sigmaRoot: badSig });
  assert.equal(disarmed.admit, true, 'the DARK default admits the persona');
  assert.equal(disarmed.armed, false);
  assert.equal(disarmed.reason, 'disarmed-passthrough', 'the clean-baseline passthrough token is anchored (byte-identical contract)');
  // NON-VACUITY: a fully-armed gate + VALID sig ADMITS (the armed VERIFICATION path is genuinely reached), and the
  // SAME fully-armed gate + BAD sig REJECTS *via the verifier* (reason sigma-root-unverified, NOT the
  // arm-indeterminate short-circuit). Delete the verifier and armedGood flips -> RED.
  assert.equal(armedGood.admit, true, 'a fully-armed gate ADMITS a valid root-signed persona (verification path reachable)');
  assert.equal(armedGood.reason, 'sigma-root-verified');
  assert.equal(armedBad.admit, false, 'the SAME fully-armed gate REJECTS a bad sig');
  assert.equal(armedBad.armed, true);
  assert.equal(armedBad.reason, 'sigma-root-unverified', 'the reject is the VERIFIER, not the partial-arm path');
});

console.log(`\n[admission-gate-darkness-witness] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
