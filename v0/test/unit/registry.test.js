#!/usr/bin/env node
'use strict';

// PACT v0 -- identity/registry.js unit tests (plans/31 W0: first-writer immutability -- the key-swap NARROW).
//
// NS-9 SCOPE (do NOT overclaim): first-writer immutability closes ATTACK (b) key-swap ONLY -- once a persona
// DID is registered, its (humanUid, publicKeyPem) row is FROZEN, so a same-uid host can no longer silently
// re-map an ESTABLISHED persona to its own key. It does NOTHING against the CRITICAL attacks the plans/31
// scoping names: self-register a FRESH attacker persona (a), N Sybil personas (c), root-spoof a fake humanUid
// (d). Those need the world-anchored sigma_root HARDEN + U1. This is a NARROW, never a close. Key ROTATION is
// deliberately deferred: until sigma_root ships a root-signed rotation path, a persona rotates by registering a
// NEW DID, not by re-keying an existing one (a documented cost of the freeze).

const assert = require('node:assert/strict');
const reg = require('../../src/identity/registry');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const KEY_A = '-----BEGIN PUBLIC KEY-----\nAAA-persona-key-A\n-----END PUBLIC KEY-----';
const KEY_B = '-----BEGIN PUBLIC KEY-----\nBBB-attacker-key-B\n-----END PUBLIC KEY-----';

test('baseline: a fresh persona records + is looked up', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A });
  assert.equal(reg.lookupPublicKey(r, 'did:key:zAlice'), KEY_A);
  assert.equal(reg.rootOf(r, 'did:key:zAlice'), 'human:alice');
  assert.ok(reg.isKnownRoot(r, 'human:alice'));
});

test('idempotent: re-registering the IDENTICAL row is a no-op, never throws', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A });
  assert.doesNotThrow(() => reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A }));
  assert.equal(reg.lookupPublicKey(r, 'did:key:zAlice'), KEY_A, 'row unchanged');
  assert.equal(r.personas.size, 1, 'no duplicate row');
});

test('ATTACK (b) key-swap: re-registering an established DID with a DIFFERENT key is REJECTED (first-writer immutability)', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A });
  assert.throws(
    () => reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_B }),
    /immutable|already registered|key-swap/i,
    'a key-swap on an established persona must throw',
  );
  assert.equal(reg.lookupPublicKey(r, 'did:key:zAlice'), KEY_A, 'the ORIGINAL key survives the rejected swap');
});

test('persona<->human immutability: re-registering an established DID under a DIFFERENT humanUid is REJECTED', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A });
  assert.throws(
    () => reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:attacker', publicKeyPem: KEY_A }),
    /immutable|already registered/i,
    'a persona<->human re-map must throw',
  );
  assert.equal(reg.rootOf(r, 'did:key:zAlice'), 'human:alice', 'the ORIGINAL root survives');
});

test('NOT a swap: two DISTINCT personas under the SAME human root is legitimate (persona-mult, keyed by rootOf)', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: 'did:key:zAlice1', humanUid: 'human:alice', publicKeyPem: KEY_A });
  assert.doesNotThrow(() => reg.registerPersona(r, { personaDid: 'did:key:zAlice2', humanUid: 'human:alice', publicKeyPem: KEY_B }));
  assert.equal(reg.rootOf(r, 'did:key:zAlice1'), 'human:alice');
  assert.equal(reg.rootOf(r, 'did:key:zAlice2'), 'human:alice', 'both personas legitimately share one root');
});

test('NEW RESIDUAL (disclosed, NS-9): first-writer SQUATTING -- pre-registering a DID under an attacker binding permanently denies the legit owner (the acknowledged cost of the freeze until sigma_root rotation ships)', () => {
  const r = reg.createRegistry();
  // the attacker squats an unclaimed DID the legit owner intended to use
  reg.registerPersona(r, { personaDid: 'did:key:zWanted', humanUid: 'human:attacker', publicKeyPem: KEY_B });
  // the legit owner's later, correct registration is REFUSED -- the DID is squatted
  assert.throws(
    () => reg.registerPersona(r, { personaDid: 'did:key:zWanted', humanUid: 'human:legit', publicKeyPem: KEY_A }),
    /immutable|already registered/i,
    'first-writer squatting: the legit owner is denied -- the disclosed cost of the freeze',
  );
  assert.equal(reg.lookupPublicKey(r, 'did:key:zWanted'), KEY_B, 'the squatter binding persists (UNMITIGATED for opaque DIDs this leaf)');
});

test('defense-in-depth: the stored row is frozen (an in-place row mutation does not silently swap the key)', () => {
  const r = reg.createRegistry();
  reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A });
  const row = r.personas.get('did:key:zAlice');
  assert.throws(() => { row.publicKeyPem = KEY_B; }, TypeError, 'the row is Object.frozen (module is strict-mode)');
  assert.equal(reg.lookupPublicKey(r, 'did:key:zAlice'), KEY_A, 'key unchanged by the attempted in-place mutation');
});

test('the existing input-validation throws are preserved (empty fields)', () => {
  const r = reg.createRegistry();
  assert.throws(() => reg.registerPersona(r, { personaDid: '', humanUid: 'h', publicKeyPem: KEY_A }), /personaDid required/);
  assert.throws(() => reg.registerPersona(r, { personaDid: 'did:key:z', humanUid: '', publicKeyPem: KEY_A }), /humanUid required/);
  assert.throws(() => reg.registerPersona(r, { personaDid: 'did:key:z', humanUid: 'h', publicKeyPem: '' }), /publicKeyPem required/);
});

// ===================== plans/32 W1: the root-key model (registerRoot / lookupRootKey) =====================

const ROOT_KEY_A = '-----BEGIN PUBLIC KEY-----\nAAA-root-key-A\n-----END PUBLIC KEY-----';
const ROOT_KEY_B = '-----BEGIN PUBLIC KEY-----\nBBB-root-key-B\n-----END PUBLIC KEY-----';

test('registerRoot: records a root key + is looked up per-root (no ambient default)', () => {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: ROOT_KEY_A });
  assert.equal(reg.lookupRootKey(r, 'human:alice'), ROOT_KEY_A);
  assert.equal(reg.lookupRootKey(r, 'human:nobody'), null, 'no ambient default -- unknown root -> null');
});

test('registerRoot first-writer immutability: identical re-seed is a no-op; a conflicting re-seed THROWS', () => {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: ROOT_KEY_A });
  assert.doesNotThrow(() => reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: ROOT_KEY_A }), 'idempotent re-seed');
  assert.throws(
    () => reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: ROOT_KEY_B }),
    /immutable|already registered|root-key/i,
    'root-key squatting / swap on an established root must throw (first-writer-wins)',
  );
  assert.equal(reg.lookupRootKey(r, 'human:alice'), ROOT_KEY_A, 'the ORIGINAL root key survives the rejected swap');
});

test('F3: registerRoot does NOT add to the live-gated roots Set (single-writer preserved -- isKnownRoot only via registerPersona)', () => {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: ROOT_KEY_A });
  assert.equal(reg.isKnownRoot(r, 'human:alice'), false, 'a seeded-but-persona-less root is NOT frame-admissible (roots Set untouched)');
  assert.equal(reg.lookupRootKey(r, 'human:alice'), ROOT_KEY_A, 'but its root key IS recorded');
});

test('M1 type-gate: registerRoot rejects non-string / empty fields ([] and {} pass a bare truthiness test)', () => {
  const r = reg.createRegistry();
  assert.throws(() => reg.registerRoot(r, { humanUid: [], rootPublicKeyPem: ROOT_KEY_A }), /string|required/i, 'array humanUid rejected');
  assert.throws(() => reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: {} }), /string|required/i, 'object root key rejected');
  assert.throws(() => reg.registerRoot(r, { humanUid: '', rootPublicKeyPem: ROOT_KEY_A }), /string|required/i, 'empty humanUid rejected');
  assert.throws(() => reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: '' }), /string|required/i, 'empty root key rejected');
});

test('additive: the root-key model does not disturb the existing persona functions', () => {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: 'human:alice', rootPublicKeyPem: ROOT_KEY_A });
  reg.registerPersona(r, { personaDid: 'did:key:zAlice', humanUid: 'human:alice', publicKeyPem: KEY_A });
  assert.equal(reg.lookupPublicKey(r, 'did:key:zAlice'), KEY_A, 'persona key unaffected');
  assert.equal(reg.rootOf(r, 'did:key:zAlice'), 'human:alice', 'rootOf unaffected');
  assert.equal(reg.isKnownRoot(r, 'human:alice'), true, 'the persona registration is what makes it a known root');
  assert.equal(reg.lookupRootKey(r, 'human:alice'), ROOT_KEY_A, 'the root key coexists');
});

console.log(`\n[registry] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
