#!/usr/bin/env node
'use strict';

// PACT P-minter — the authenticated-writer (custody) tests (plans/04 §6). HONEST-NARROW scope: these
// prove (a) the ambient env-PEM default is GONE (signing needs an injected custody signer), (b) the
// minter is STRUCTURALLY key-free (throws rather than touch raw key material) + per-persona bound (no
// throne by config), and (c) minted records flow through the real P2/P3 read path. They do NOT — and
// CANNOT — prove provenance against a same-uid attacker in-process (crypto can't distinguish a legit
// sign from a same-uid co-forge); own-key forgery stays OPEN (U1). A residual test asserts that openly.

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { createMinter } = require('../../src/identity/minter');
const { buildFrame, receiveFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { makePremise } = require('../../src/atms/claim');
const { direct } = require('../../src/trust/direct');
const { crossVerify } = require('../../src/grounding/cross-verify');
const { creatorStanding } = require('../../src/grounding/creator-standing');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// A custody-boundary signer MODELED in-process (the real boundary is a separate uid/enclave/HSM — a
// deployment property this test cannot cross; see the header). It signs a 64-hex id with a held key.
function signerFor(privateKeyPem) {
  return (rid) => crypto.sign(null, Buffer.from(rid, 'utf8'), crypto.createPrivateKey(privateKeyPem)).toString('base64');
}

function freshWorld() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-minter-'));
  const registry = reg.createRegistry();
  const personas = {};
  function addUnder(did, human) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    return did;
  }
  function add(did) { return addUnder(did, 'human:' + did); }
  const ME = add('did:key:zME');
  const meCtx = { registry, storeOpts: { receiverId: ME, stateDir: STATE } };
  const store = { receiverId: ME, stateDir: STATE };
  return {
    STATE, registry, personas, meCtx, ME, add, addUnder, store,
    cleanup: () => { try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* */ } },
  };
}

const SCOPE = { constraints: {}, edge_confidence: 1 };
let seq = 0;

// ====================== structural: the minter holds NO raw key material ======================

test('createMinter THROWS without a function signer (no raw-key fall-through)', () => {
  assert.throws(() => createMinter({ personaDid: 'did:key:zA', humanUid: 'human:a' }), /signer.*must be a function/);
  assert.throws(() => createMinter({ signer: 'not-a-fn', personaDid: 'did:key:zA', humanUid: 'human:a' }), /signer.*must be a function/);
  // STRUCTURAL no-raw-key: passing privateKeyPem is REFUSED outright (the Option-A smuggle path) —
  // both alone AND alongside a valid signer (a stray PEM is a custody-wiring bug, not silently dropped).
  const kp = newPersonaKeypair();
  assert.throws(() => createMinter({ privateKeyPem: kp.privateKeyPem, personaDid: 'did:key:zA', humanUid: 'human:a' }), /unexpected option/);
  assert.throws(() => createMinter({ signer: () => 'x', privateKeyPem: kp.privateKeyPem, personaDid: 'did:key:zA', humanUid: 'human:a' }), /unexpected option/, 'a stray PEM alongside a valid signer is still refused');
});

test('createMinter THROWS without a persona/root binding (no throne by config)', () => {
  const signer = signerFor(newPersonaKeypair().privateKeyPem);
  assert.throws(() => createMinter({ signer, humanUid: 'human:a' }), /personaDid.*required/);
  assert.throws(() => createMinter({ signer, personaDid: 'did:key:zA' }), /humanUid.*required/);
});

test('a minter never sees key material: mint() takes a spec, signs via the injected signer only', () => {
  const w = freshWorld();
  w.add('did:key:zAlice');
  const a = w.personas['did:key:zAlice'];
  const minter = createMinter({ signer: signerFor(a.kp.privateKeyPem), personaDid: 'did:key:zAlice', humanUid: a.human });
  const r = minter.mint({ type: 'CLAIM', seq: seq++, nonce: 'm1', payload: { claim: { content: 'hi' } } });
  assert.ok(r.ok, r.reason);
  assert.ok(receiveFrame(r.frame, { registry: w.registry }).ok, 'a minted frame is accepted by the receipt rule');
  assert.equal(r.frame.src_persona_did, 'did:key:zAlice');
  w.cleanup();
});

// ====================== throne-free: per-persona binding ======================

test('a minter is BOUND to its persona — it cannot mint as another persona/root', () => {
  const w = freshWorld();
  w.add('did:key:zAlice'); w.add('did:key:zBob');
  const a = w.personas['did:key:zAlice'];
  const minter = createMinter({ signer: signerFor(a.kp.privateKeyPem), personaDid: 'did:key:zAlice', humanUid: a.human });
  // a spec naming a DIFFERENT persona is rejected (cannot write as Bob) — camelCase AND snake_case
  assert.throws(() => minter.mint({ srcPersonaDid: 'did:key:zBob', type: 'CLAIM', seq: seq++, nonce: 'm2', payload: {} }), /bound to did:key:zAlice/);
  assert.throws(() => minter.mint({ src_persona_did: 'did:key:zBob', type: 'CLAIM', seq: seq++, nonce: 'm2b', payload: {} }), /bound to did:key:zAlice/, 'snake_case identity override is rejected at the guard, not silently dropped');
  // a spec with no src is bound to the minter's own persona
  const r = minter.mint({ type: 'CLAIM', seq: seq++, nonce: 'm3', payload: {} });
  assert.equal(r.frame.src_persona_did, 'did:key:zAlice');
  assert.equal(r.frame.parent_human_uid, a.human);
  w.cleanup();
});

// ====================== the ambient env-PEM default is REMOVED ======================

test('env default REMOVED: LOOM_EDGE_SIGNING_KEY is IGNORED — signing needs an injected signer', () => {
  const prev = process.env.LOOM_EDGE_SIGNING_KEY;
  const kp = newPersonaKeypair();
  process.env.LOOM_EDGE_SIGNING_KEY = kp.privateKeyPem; // a would-be ambient default
  try {
    // empty opts: the env key must NOT be read — sign FAILS closed (the hardening)
    const none = buildFrame({ srcPersonaDid: 'did:key:zX', parentHumanUid: 'human:x', seq: 0, nonce: 'e1', payload: {} }, {});
    assert.equal(none.ok, false, 'an ambient env key must NOT enable signing (the P-minter hardening)');
    // an injected signer still works (custody path)
    const ok = buildFrame({ srcPersonaDid: 'did:key:zX', parentHumanUid: 'human:x', seq: 0, nonce: 'e2', payload: {} }, { signer: signerFor(kp.privateKeyPem) });
    assert.ok(ok.ok, ok.reason);
  } finally {
    if (prev === undefined) delete process.env.LOOM_EDGE_SIGNING_KEY; else process.env.LOOM_EDGE_SIGNING_KEY = prev;
  }
});

// ====================== structural no-in-process-raw-key (the grep gate) ======================

test('forward-guard (HEURISTIC, not adversarial): no non-test src/ file passes raw key material literally', () => {
  // HONEST SCOPE (post-build VALIDATE MEDIUM): this is a forward-guard against an ACCIDENTAL literal
  // re-introduction by a non-adversarial author — NOT adversarial enforcement. A determined relocation
  // (bracket-notation opts['privateKeyPem'], string-concat, process.env, fs.readFileSync) EVADES it. The
  // REAL guarantee is the structurally key-free minter (the sole src/ producer) + code review; this just
  // catches the honest mistake early.
  const SRC = path.join(__dirname, '..', '..', 'src');
  const ALLOW = new Set(['edge-attestation.js', 'keypair.js', 'frame.js']); // the crypto seam + key-gen + the buildFrame signature doc
  const offenders = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) return walk(fp);
    if (!e.name.endsWith('.js')) return;
    if (ALLOW.has(e.name)) return;
    // flag ACTUAL key-material handling — an opts key `privateKeyPem:` or a `.privateKeyPem` read —
    // NOT prose mentions of the token (the minter's own header/throw explain it never touches one).
    if (/privateKeyPem\s*:|\.privateKeyPem/.test(fs.readFileSync(fp, 'utf8'))) offenders.push(path.relative(SRC, fp));
  });
  walk(SRC);
  assert.deepEqual(offenders, [], 'a producer reintroduced raw key material: ' + offenders.join(', '));
});

// ====================== DoD honesty + the OPEN residual (own-key forgery) ======================

test('HONEST RESIDUAL: own-key forgery is OPEN — a same-uid holder of a registered key mints accepted records', () => {
  // The minter stops "forge AS another persona" (you need that persona's signer). It does NOT stop a
  // same-uid attacker who controls their OWN registered persona from minting unlimited authentic records
  // — that is U1's issuance-cost problem, untouched here. This test asserts the residual is REAL, not hidden.
  const w = freshWorld();
  w.add('did:key:zMallory');
  const m = w.personas['did:key:zMallory'];
  const minter = createMinter({ signer: signerFor(m.kp.privateKeyPem), personaDid: 'did:key:zMallory', humanUid: m.human });
  for (let i = 0; i < 5; i++) {
    const r = minter.mint({ type: 'CLAIM', seq: seq++, nonce: 'mal' + i, payload: { claim: { content: 'spam' + i } } });
    assert.ok(receiveFrame(r.frame, { registry: w.registry }).ok, 'own-key records are authentic + accepted (the open U1 residual)');
  }
  w.cleanup();
});

// ====================== integrated P2/P3 acceptance: minted frames feed the real read path ======================

test('integrated: minted records flow through the real P2/P3 read path (direct + crossVerify + creatorStanding)', () => {
  const w = freshWorld();
  w.add('did:key:zHuman'); w.add('did:key:zConfirmer');
  const human = w.personas['did:key:zHuman'];
  const conf = w.personas['did:key:zConfirmer'];
  const humanMinter = createMinter({ signer: signerFor(human.kp.privateKeyPem), personaDid: 'did:key:zHuman', humanUid: human.human });
  const confMinter = createMinter({ signer: signerFor(conf.kp.privateKeyPem), personaDid: 'did:key:zConfirmer', humanUid: conf.human });
  const put = (r) => { assert.ok(r.ok, r.reason); assert.ok(appendRecord(r.frame, w.store).ok); };

  // confirmer earns standing via a minted CLAIM; the human mints a PREMISE; the confirmer mints a CONFIRM
  put(confMinter.mint({ type: 'CLAIM', seq: seq++, nonce: 'c1', payload: { claim: { content: 'earns' } } }));
  const statement = 'a minted premise';
  put(humanMinter.mint({ type: 'PREMISE', seq: seq++, nonce: 'p1', payload: { statement, scope: SCOPE, creator: human.human } }));
  const premId = makePremise({ statement, scope: SCOPE, creator: human.human }).id;
  put(confMinter.mint({ type: 'CONFIRM', seq: seq++, nonce: 'cf1', payload: { target_premise_id: premId } }));

  // the grounding engine reads the MINTED records through verifiedRecords (INV-14)
  assert.ok(crossVerify(premId, w.meCtx).strength > 0, 'a minted premise + minted confirm scores via the real read path');
  assert.equal(creatorStanding(human.human, w.meCtx).n_premises, 1, 'the human accrues their minted premise');
  // direct() reads the confirmer's minted CLAIM as positive behavioral evidence
  assert.ok(direct(w.meCtx, 'did:key:zConfirmer', undefined).r > 0, 'a minted CLAIM is read as DIRECT evidence');
  w.cleanup();
});

console.log(`\n[minter] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
