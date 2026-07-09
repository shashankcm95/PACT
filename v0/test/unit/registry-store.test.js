#!/usr/bin/env node
'use strict';

// PACT v0 -- identity/registry-store.js unit tests (plans/43: the live root-schema registry path, DARK).
//
// NS-9 SCOPE (do NOT overclaim): this module PERSISTS the in-memory registry model (personas + rootKeys) to/from
// disk so an on-box read-path can carry a seeded root. It arms nothing, wires the sigma-root gate into no live
// fold, and does NOT verify a persisted root against Rekor/A.3 (integrity != provenance). Its security weight is:
// (1) replaying the registrars on load inherits first-writer immutability at the file boundary; (2) `loadRegistryFile`
// REFUSES an untrusted registry file (foreign owner / group-or-world-writable / symlink / oversized) with an
// OBSERVABLE reject -- because persisting `rootKeys` WIDENS the file-write surface (VERIFY-hacker H1/M1).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const reg = require('../../src/identity/registry');
const store = require('../../src/identity/registry-store');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const P_KEY_A = '-----BEGIN PUBLIC KEY-----\nAAA-persona-key-A\n-----END PUBLIC KEY-----';
const P_KEY_B = '-----BEGIN PUBLIC KEY-----\nBBB-persona-key-B\n-----END PUBLIC KEY-----';
const R_KEY_M = '-----BEGIN PUBLIC KEY-----\nRRR-root-key-merlin\n-----END PUBLIC KEY-----';
const R_KEY_A = '-----BEGIN PUBLIC KEY-----\nRRR-root-key-alice\n-----END PUBLIC KEY-----';

function seededReg() {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_M });
  reg.registerPersona(r, { personaDid: 'did:key:zHera', humanUid: 'human:merlin', publicKeyPem: P_KEY_A });
  reg.registerPersona(r, { personaDid: 'did:key:zBob', humanUid: 'human:alice', publicKeyPem: P_KEY_B });
  return r;
}

function tmpWrite(content, mode) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pact-regstore-')), 'registry.json');
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  if (mode !== undefined) fs.chmodSync(p, mode);
  return p;
}
function cleanup(p) { try { fs.rmSync(path.dirname(p), { recursive: true, force: true }); } catch (_e) { /* best-effort */ } }

// ---------- serializeRegistry ----------

test('round-trip: serialize -> parse -> deserialize preserves personas AND rootKeys', () => {
  const r = seededReg();
  const back = store.deserializeRegistry(JSON.parse(store.serializeRegistry(r)));
  assert.equal(reg.lookupPublicKey(back, 'did:key:zHera'), P_KEY_A);
  assert.equal(reg.lookupPublicKey(back, 'did:key:zBob'), P_KEY_B);
  assert.equal(reg.lookupRootKey(back, 'human:merlin'), R_KEY_M, 'the seeded root survives the round-trip');
  assert.equal(reg.rootOf(back, 'did:key:zHera'), 'human:merlin');
});

test('determinism (A1): identical content in different insertion order -> byte-identical serialization', () => {
  const r1 = reg.createRegistry();
  reg.registerPersona(r1, { personaDid: 'did:key:zB', humanUid: 'human:x', publicKeyPem: P_KEY_B });
  reg.registerPersona(r1, { personaDid: 'did:key:zA', humanUid: 'human:x', publicKeyPem: P_KEY_A });
  reg.registerRoot(r1, { humanUid: 'human:z', rootPublicKeyPem: R_KEY_A });
  reg.registerRoot(r1, { humanUid: 'human:x', rootPublicKeyPem: R_KEY_M });
  const r2 = reg.createRegistry();
  reg.registerRoot(r2, { humanUid: 'human:x', rootPublicKeyPem: R_KEY_M });
  reg.registerRoot(r2, { humanUid: 'human:z', rootPublicKeyPem: R_KEY_A });
  reg.registerPersona(r2, { personaDid: 'did:key:zA', humanUid: 'human:x', publicKeyPem: P_KEY_A });
  reg.registerPersona(r2, { personaDid: 'did:key:zB', humanUid: 'human:x', publicKeyPem: P_KEY_B });
  assert.equal(store.serializeRegistry(r1), store.serializeRegistry(r2), 'row order must not change the bytes');
});

test('L2: a persona-less genesis root is NOT dropped on round-trip', () => {
  const r = reg.createRegistry();
  reg.registerRoot(r, { humanUid: 'human:lonely', rootPublicKeyPem: R_KEY_A });
  const back = store.deserializeRegistry(JSON.parse(store.serializeRegistry(r)));
  assert.equal(reg.lookupRootKey(back, 'human:lonely'), R_KEY_A, 'the seeded-but-persona-less root survives');
  assert.equal(reg.isKnownRoot(back, 'human:lonely'), false, 'and it is NOT a known root (no persona) -- F3');
});

// ---------- deserializeRegistry: format + backward-compat ----------

test('backward-compat: a legacy bare ARRAY of persona rows loads as personas-only (rootKeys empty)', () => {
  const legacy = [
    { personaDid: 'did:key:zHera', humanUid: 'human:merlin', publicKeyPem: P_KEY_A },
    { personaDid: 'did:key:zBob', humanUid: 'human:alice', publicKeyPem: P_KEY_B },
  ];
  const r = store.deserializeRegistry(legacy);
  assert.equal(reg.lookupPublicKey(r, 'did:key:zHera'), P_KEY_A);
  assert.equal(reg.isKnownRoot(r, 'human:merlin'), true);
  assert.equal(reg.lookupRootKey(r, 'human:merlin'), null, 'no root key in a legacy file');
  assert.equal(r.rootKeys.size, 0);
});

test('new object format {personas, rootKeys} loads both', () => {
  const obj = {
    personas: [{ personaDid: 'did:key:zHera', humanUid: 'human:merlin', publicKeyPem: P_KEY_A }],
    rootKeys: [{ humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_M }],
  };
  const r = store.deserializeRegistry(obj);
  assert.equal(reg.lookupRootKey(r, 'human:merlin'), R_KEY_M);
  assert.equal(reg.lookupPublicKey(r, 'did:key:zHera'), P_KEY_A);
});

test('M3: a personas-only OR rootKeys-only object is legit -- absent sub-array defaults to []', () => {
  const rootsOnly = store.deserializeRegistry({ rootKeys: [{ humanUid: 'human:g', rootPublicKeyPem: R_KEY_M }] });
  assert.equal(reg.lookupRootKey(rootsOnly, 'human:g'), R_KEY_M);
  assert.equal(rootsOnly.personas.size, 0);
  const personasOnly = store.deserializeRegistry({ personas: [{ personaDid: 'did:key:zX', humanUid: 'human:x', publicKeyPem: P_KEY_A }] });
  assert.equal(reg.lookupPublicKey(personasOnly, 'did:key:zX'), P_KEY_A);
  assert.equal(personasOnly.rootKeys.size, 0);
});

// ---------- deserializeRegistry: fail-closed guards ----------

test('M3: null / non-object / non-array-sub-field inputs fail CLOSED (controlled throw)', () => {
  assert.throws(() => store.deserializeRegistry(null), /registry|invalid|shape/i, 'null must not fall into the object branch');
  assert.throws(() => store.deserializeRegistry(42), /registry|invalid|shape/i);
  assert.throws(() => store.deserializeRegistry('a string'), /registry|invalid|shape/i);
  assert.throws(() => store.deserializeRegistry({ personas: 'not-an-array' }), /array|invalid|shape/i, 'a string is iterable -- must be rejected, not char-replayed');
  assert.throws(() => store.deserializeRegistry({ rootKeys: { humanUid: 'x' } }), /array|invalid|shape/i);
});

test('immutability preserved on load: a CONFLICTING persona row throws (first-writer)', () => {
  const obj = { personas: [
    { personaDid: 'did:key:zHera', humanUid: 'human:merlin', publicKeyPem: P_KEY_A },
    { personaDid: 'did:key:zHera', humanUid: 'human:merlin', publicKeyPem: P_KEY_B },
  ] };
  assert.throws(() => store.deserializeRegistry(obj), /IMMUTABLE|different binding|first-writer/i);
});

test('immutability preserved on load: a CONFLICTING root row throws (first-writer)', () => {
  const obj = { rootKeys: [
    { humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_M },
    { humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_A },
  ] };
  assert.throws(() => store.deserializeRegistry(obj), /IMMUTABLE|different root key|first-writer/i);
});

test('hacker#10: a legacy array cannot SMUGGLE a root (a root-shaped element lacks personaDid -> throws)', () => {
  const sneaky = [{ humanUid: 'human:evil', rootPublicKeyPem: R_KEY_A }]; // no personaDid
  assert.throws(() => store.deserializeRegistry(sneaky), /personaDid/i, 'array elements go to registerPersona; a rootless row is rejected');
});

test('a row missing a required field fails CLOSED', () => {
  assert.throws(() => store.deserializeRegistry({ rootKeys: [{ humanUid: 'human:x' }] }), /rootPublicKeyPem|required/i);
  assert.throws(() => store.deserializeRegistry({ personas: [{ personaDid: 'd', humanUid: 'h' }] }), /publicKeyPem|required/i);
});

test('L1: a rootKeys row cannot inject `roots`; a persona row makes its humanUid known (as today)', () => {
  const r = store.deserializeRegistry({ rootKeys: [{ humanUid: 'human:seed', rootPublicKeyPem: R_KEY_M }] });
  assert.equal(reg.isKnownRoot(r, 'human:seed'), false, 'a file rootKey does NOT reach the live isKnownRoot set');
  const r2 = store.deserializeRegistry({ personas: [{ personaDid: 'did:key:zP', humanUid: 'human:seed', publicKeyPem: P_KEY_A }] });
  assert.equal(reg.isKnownRoot(r2, 'human:seed'), true, 'a persona row makes its humanUid known -- unchanged from today');
});

test('proto-pollution: a "__proto__" persona DID does not pollute (Map is immune)', () => {
  const r = store.deserializeRegistry({ personas: [{ personaDid: '__proto__', humanUid: 'human:x', publicKeyPem: P_KEY_A }] });
  assert.equal(reg.lookupPublicKey(r, '__proto__'), P_KEY_A);
  assert.equal(({}).polluted, undefined, 'Object.prototype untouched');
});

test('M2: a row-count over the cap fails CLOSED (deserialize is pure but still bounded)', () => {
  const many = Array.from({ length: store.MAX_REGISTRY_ROWS + 1 }, (_v, i) => ({ personaDid: 'did:key:z' + i, humanUid: 'human:' + i, publicKeyPem: P_KEY_A }));
  assert.throws(() => store.deserializeRegistry(many), /too many|cap|rows|bound/i);
});

// ---------- assertTrustedFileStat (pure policy -- testable without root) ----------

const OWN = (typeof process.getuid === 'function') ? process.getuid() : 1000;
function statLike(over) { return Object.assign({ uid: OWN, mode: 0o100600, isFile: () => true, isSymbolicLink: () => false }, over); }

test('M1 policy: a file owned by self, mode 0600, regular -> ACCEPTED', () => {
  assert.doesNotThrow(() => store.assertTrustedFileStat(statLike({}), { selfUid: OWN }));
});
test('M1 policy: a file owned by root (uid 0) -> ACCEPTED', () => {
  assert.doesNotThrow(() => store.assertTrustedFileStat(statLike({ uid: 0 }), { selfUid: OWN }));
});
test('M1 policy: a FOREIGN owner is REFUSED, observably', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: OWN + 9999 }), { selfUid: OWN }), /owner|trust|refus/i);
});
test('M1 policy: a group- OR world-writable file is REFUSED', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({ mode: 0o100666 }), { selfUid: OWN }), /writable|refus/i);
  assert.throws(() => store.assertTrustedFileStat(statLike({ mode: 0o100620 }), { selfUid: OWN }), /writable|refus/i);
});
test('M1 policy: a symlink is REFUSED (redirection guard)', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({ isSymbolicLink: () => true }), { selfUid: OWN }), /symlink|refus/i);
});
test('M1 policy: a non-regular file is REFUSED', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({ isFile: () => false }), { selfUid: OWN }), /regular|refus/i);
});
test('M1 policy: Windows (selfUid null) SKIPS the uid check but STILL enforces writability', () => {
  assert.doesNotThrow(() => store.assertTrustedFileStat(statLike({ uid: 99999 }), { selfUid: null }), 'no uid check when platform has no uid');
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 99999, mode: 0o100666 }), { selfUid: null }), /writable|refus/i, 'mode is still enforced');
});

// ---------- loadRegistryFile (impure shell -- real temp files) ----------

test('loadRegistryFile: a self-owned 0600 registry loads (happy path)', () => {
  const p = tmpWrite({ personas: [{ personaDid: 'did:key:zHera', humanUid: 'human:merlin', publicKeyPem: P_KEY_A }], rootKeys: [{ humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_M }] }, 0o600);
  try {
    const r = store.loadRegistryFile(p);
    assert.equal(reg.lookupRootKey(r, 'human:merlin'), R_KEY_M);
    assert.equal(reg.lookupPublicKey(r, 'did:key:zHera'), P_KEY_A);
  } finally { cleanup(p); }
});

test('loadRegistryFile: a WORLD-WRITABLE registry is REFUSED (M1/H1) with an observable reason', () => {
  const p = tmpWrite({ rootKeys: [{ humanUid: 'human:evil', rootPublicKeyPem: R_KEY_A }] }, 0o666);
  try {
    assert.throws(() => store.loadRegistryFile(p), /writable|refus|trust/i);
  } finally { cleanup(p); }
});

test('loadRegistryFile: an OVERSIZED registry is REFUSED before parse (M2)', () => {
  // non-JSON garbage over the cap: if the size guard were removed, JSON.parse would throw a SyntaxError that does
  // NOT match /size/ -- so this test genuinely exercises the size path, not just "any throw" (non-vacuous).
  const p = tmpWrite('x'.repeat(store.MAX_REGISTRY_BYTES + 1), 0o600);
  try {
    assert.throws(() => store.loadRegistryFile(p), /size|large|cap|refus/i);
  } finally { cleanup(p); }
});

test('loadRegistryFile: a SYMLINK registry file is REFUSED atomically (O_NOFOLLOW, VALIDATE H1)', () => {
  const p = tmpWrite({ personas: [] }, 0o600);
  const link = path.join(path.dirname(p), 'link.json');
  fs.symlinkSync(p, link);
  try {
    assert.throws(() => store.loadRegistryFile(link), /symlink|refus/i, 'O_NOFOLLOW must reject a symlinked final component');
  } finally { cleanup(p); }
});

test('loadRegistryFile: malformed JSON in a trusted file fails CLOSED (controlled)', () => {
  const p = tmpWrite('{ this is not json', 0o600);
  try { assert.throws(() => store.loadRegistryFile(p)); } finally { cleanup(p); }
});

test('serializeRegistry: a non-registry input is REFUSED', () => {
  assert.throws(() => store.serializeRegistry(null), /not a registry/i);
  assert.throws(() => store.serializeRegistry({}), /not a registry/i);
});

test('assertTrustedFileStat: opts.selfUid is REQUIRED (fail-closed, not a silent skip -- code-reviewer MED)', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({}), {}), /selfUid|required/i, 'omitting selfUid must throw, never default-skip the owner check');
  assert.throws(() => store.assertTrustedFileStat(statLike({})), /selfUid|required/i);
});

test('assertTrustedFileStat: a present-but-`undefined`/non-number selfUid VALUE is REFUSED (pre-PR CodeRabbit)', () => {
  // `{selfUid: undefined}` satisfies `'selfUid' in opts` but would else silently skip the uid check -- must throw.
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 99999 }), { selfUid: undefined }), /number or explicit null|selfUid/i);
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 99999 }), { selfUid: 'not-a-number' }), /number or explicit null|selfUid/i);
});

test('deserializeRegistry: a null/scalar ROW fails CLOSED with a clear message (code-reviewer LOW)', () => {
  assert.throws(() => store.deserializeRegistry({ personas: [null] }), /row must be an object|invalid registry shape/i);
  assert.throws(() => store.deserializeRegistry({ rootKeys: [42] }), /row must be an object|invalid registry shape/i);
});

// ---------- plans/44: the DARK ARMED loader tightening (root-owned-only + a root-owned parent) ----------
// RED-first. These describe the OPT-IN strict mode (`requireRootOwned:true`); the disarmed default is unchanged.

function dirStatLike(over) { return Object.assign({ uid: 0, mode: 0o40755, isDirectory: () => true }, over); }

// assertTrustedDirStat (pure parent-dir policy -- armed mode; synthetic stats, no root needed)
test('plan44 dir policy: a root-owned 0755 directory -> ACCEPTED', () => {
  assert.doesNotThrow(() => store.assertTrustedDirStat(dirStatLike({})));
});
test('plan44 dir policy: a NON-directory is REFUSED', () => {
  assert.throws(() => store.assertTrustedDirStat(dirStatLike({ isDirectory: () => false })), /director|refus/i);
});
test('plan44 dir policy: a group- OR world-writable parent dir is REFUSED', () => {
  assert.throws(() => store.assertTrustedDirStat(dirStatLike({ mode: 0o40777 })), /writable|refus/i);
  assert.throws(() => store.assertTrustedDirStat(dirStatLike({ mode: 0o40775 })), /writable|refus/i); // group-write (0o020)
});
test('plan44 dir policy: a NON-root-owned parent dir is REFUSED (armed requires uid 0)', () => {
  assert.throws(() => store.assertTrustedDirStat(dirStatLike({ uid: OWN + 7 })), /root|owned|uid|refus/i);
});
test('plan44 L1: a parent-dir refusal is CLASSED ERR_REGISTRY_UNTRUSTED (not a bare Error)', () => {
  try { store.assertTrustedDirStat(dirStatLike({ uid: 12345 })); assert.fail('should throw'); }
  catch (e) { assert.equal(e.code, store.ERR_REGISTRY_UNTRUSTED, 'a dir refusal must carry the untrusted class'); }
});

// assertTrustedFileStat armed mode (root-owned-ONLY narrowing)
test('plan44 armed: requireRootOwned + a root-owned file -> ACCEPTED', () => {
  assert.doesNotThrow(() => store.assertTrustedFileStat(statLike({ uid: 0 }), { selfUid: OWN, requireRootOwned: true }));
});
test('plan44 armed: requireRootOwned REFUSES a SELF-owned file (the same-uid self-seed the disarmed mode tolerates)', () => {
  assert.doesNotThrow(() => store.assertTrustedFileStat(statLike({ uid: OWN }), { selfUid: OWN }), 'disarmed accepts self-owned');
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: OWN }), { selfUid: OWN, requireRootOwned: true }), /root|uid|refus/i, 'armed refuses self-owned');
});
test('plan44 armed: the mode + symlink checks STILL fire under requireRootOwned', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 0, mode: 0o100666 }), { selfUid: OWN, requireRootOwned: true }), /writable|refus/i);
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 0, isSymbolicLink: () => true }), { selfUid: OWN, requireRootOwned: true }), /symlink|refus/i);
});
test('plan44 H1: a present-but-NON-boolean requireRootOwned is REFUSED (no split; fail-closed)', () => {
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 0 }), { selfUid: OWN, requireRootOwned: 1 }), /boolean|requireRootOwned/i);
  assert.throws(() => store.assertTrustedFileStat(statLike({ uid: 0 }), { selfUid: OWN, requireRootOwned: 'true' }), /boolean|requireRootOwned/i);
});

// loadRegistryFile armed mode (real temp files; tests run non-root, so a temp parent is self-owned -> refused)
test('plan44 armed load: a self-owned-PARENT deployment is REFUSED (armed requires a root-owned parent)', () => {
  const p = tmpWrite({ personas: [] }, 0o600);
  try {
    assert.throws(() => store.loadRegistryFile(p, { requireRootOwned: true }), /parent|root|owned|refus/i);
  } finally { cleanup(p); }
});
test('plan44 armed load L2: the DISARMED default still accepts a self-owned 0600 file (no-opts + explicit-false)', () => {
  const p = tmpWrite({ rootKeys: [{ humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_M }] }, 0o600);
  try {
    assert.equal(reg.lookupRootKey(store.loadRegistryFile(p), 'human:merlin'), R_KEY_M, 'no-opts default is unchanged');
    assert.equal(reg.lookupRootKey(store.loadRegistryFile(p, { requireRootOwned: false }), 'human:merlin'), R_KEY_M, 'explicit disarm too');
  } finally { cleanup(p); }
});

test('plan44 armed load: a root-owned file under a root-owned parent LOADS armed (root-gated; skipped non-root)', () => {
  if (!(typeof process.getuid === 'function' && process.getuid() === 0)) {
    console.log('       skip - armed ACCEPT needs a root-owned fixture (non-root runner)'); return;
  }
  // As root, tmpWrite's mkdtemp dir is root-owned 0700 (not others-writable) and the file is root-owned; both gates pass.
  const p = tmpWrite({ rootKeys: [{ humanUid: 'human:merlin', rootPublicKeyPem: R_KEY_M }] }, 0o600);
  try {
    assert.equal(reg.lookupRootKey(store.loadRegistryFile(p, { requireRootOwned: true }), 'human:merlin'), R_KEY_M, 'armed ACCEPT: root-owned file + root-owned parent');
  } finally { cleanup(p); }
});
test('plan44 armed load H1: a garbage-truthy requireRootOwned is REFUSED, never a split (TypeError)', () => {
  const p = tmpWrite({ personas: [] }, 0o600);
  try {
    assert.throws(() => store.loadRegistryFile(p, { requireRootOwned: 1 }), /boolean|requireRootOwned/i);
    assert.throws(() => store.loadRegistryFile(p, { requireRootOwned: 'true' }), /boolean|requireRootOwned/i);
  } finally { cleanup(p); }
});
test('plan44 armed load M2: a SYMLINKED parent dir is REFUSED, classed untrusted (ELOOP/ENOTDIR)', () => {
  const p = tmpWrite({ personas: [] }, 0o600);
  const linkDir = path.dirname(p) + '-link';
  fs.symlinkSync(path.dirname(p), linkDir);
  try {
    store.loadRegistryFile(path.join(linkDir, 'registry.json'), { requireRootOwned: true });
    assert.fail('a symlinked parent must be refused');
  } catch (e) {
    assert.equal(e.code, store.ERR_REGISTRY_UNTRUSTED, 'a symlinked parent is a classed trust refusal');
  } finally { fs.rmSync(linkDir, { force: true }); cleanup(p); }
});
test('plan44 armed load M1: the parent-open finally releases the fd on each refusal (no leak)', () => {
  const p = tmpWrite({ personas: [] }, 0o600);
  const fdDir = fs.existsSync('/dev/fd') ? '/dev/fd' : (fs.existsSync('/proc/self/fd') ? '/proc/self/fd' : null);
  try {
    const before = fdDir ? fs.readdirSync(fdDir).length : null;
    for (let i = 0; i < 24; i++) {
      assert.throws(() => store.loadRegistryFile(p, { requireRootOwned: true }), /parent|root|owned|refus/i);
    }
    if (before !== null) {
      const grew = fs.readdirSync(fdDir).length - before;
      assert.ok(grew < 12, 'the parent-open fd must be released on each refusal (finally); saw fd growth ' + grew);
    }
  } finally { cleanup(p); }
});

console.log(`\n[registry-store] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
