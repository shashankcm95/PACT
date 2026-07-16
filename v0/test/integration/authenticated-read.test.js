#!/usr/bin/env node
'use strict';

// PACT v0 -- trust/authenticated-read.js integration (plans/56 W2b: the anchoring/freshness read-gate chokepoint).
//
// authenticatedAnchoredRecords(meCtx) = filterFreshVouches(filterAnchoredRecords(verifiedRecords(...), ...), ...).
// This suite pins the load-bearing properties (VERIFY board §6):
//   - AR1 BYTE-IDENTICAL DISARMED: with no regProvenance/freshness, the chokepoint === verifiedRecords
//     element-for-element (the SHADOW-safe property that makes the convert refactor a pure DRY move).
//   - AR2 ARMED NARROWS: arming freshness drops stale/bare VOUCHes; arming anchoring (empty sigmaRoots) drops all.
//   - totality: a null / degenerate meCtx yields [] and NEVER throws.
// The end-to-end byte-identity of convert.disjointPaths through the chokepoint is pinned by the (unchanged)
// vouch-freshness-convert.test.js staying green after the refactor.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reg = require('../../src/identity/registry');
const { newPersonaKeypair } = require('../../src/identity/keypair');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { verifiedRecords } = require('../../src/trust/read-gate');
const { authenticatedAnchoredRecords } = require('../../src/trust/authenticated-read');
const { assertOnlyLiteralRequires, allSrcJsFiles } = require('../_util/require-scan');

const SRC = path.join(__dirname, '..', '..', 'src');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const FRESHNESS_ARM = { now: NOW, ttlMs: DAY };
const FRESH = { approved_at: NOW - 1000, nonce: 'fresh-nonce-01' };
const STALE = { approved_at: NOW - 10 * DAY, nonce: 'stale-nonce-01' };

const _dirs = [];
process.on('exit', () => { for (const d of _dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

function world() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-w2b-'));
  _dirs.push(STATE);
  const registry = reg.createRegistry();
  const personas = {};
  let seq = 0;
  function add(did) {
    const kp = newPersonaKeypair();
    reg.registerPersona(registry, { personaDid: did, humanUid: 'human:' + did, publicKeyPem: kp.publicKeyPem });
    personas[did] = kp;
    return did;
  }
  const ME = add('did:key:zME');
  const A = add('did:key:zA');
  const meCtx = { registry, storeOpts: { receiverId: ME, stateDir: STATE } };
  function vouch(src, target, freshness) {
    const payload = { target_persona: target, ...(freshness !== undefined ? { freshness } : {}) };
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: 'human:' + src, type: 'VOUCH', seq: seq++, nonce: 'n' + seq, payload }, { privateKeyPem: personas[src].privateKeyPem });
    if (!built.ok) throw new Error('build: ' + built.reason);
    const ap = appendRecord(built.frame, { receiverId: ME, stateDir: STATE });
    if (!ap.ok) throw new Error('append: ' + ap.reason);
  }
  vouch(A, 'did:key:zAGENT', FRESH);   // a fresh VOUCH
  vouch(A, 'did:key:zAGENT2', STALE);  // a stale VOUCH
  return { registry, meCtx, ME, A };
}

test('AR1 byte-identical DISARMED: authenticatedAnchoredRecords === verifiedRecords, element-for-element', () => {
  const { meCtx } = world();
  const viaGate = verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const viaChoke = authenticatedAnchoredRecords(meCtx);
  assert.ok(viaGate.length >= 2, 'precondition: the store has the 2 sig-verified VOUCHes (non-vacuous)');
  // FULL-record deepEqual (CodeRabbit): a record_id-only check would pass even if a field (payload/sig/...) changed.
  // deepEqual compares by VALUE, and both sides re-parse the SAME disk records disarmed -> structurally identical.
  assert.deepEqual(viaChoke, viaGate,
    'DISARMED, the chokepoint drops NOTHING and preserves order + every field (the SHADOW-safe byte-identity)');
});

test('AR2 armed FRESHNESS narrows: a stale VOUCH drops (proves filterFreshVouches is composed)', () => {
  const { meCtx } = world();
  const disarmed = authenticatedAnchoredRecords(meCtx);
  const armed = authenticatedAnchoredRecords({ ...meCtx, freshness: FRESHNESS_ARM });
  assert.ok(armed.length < disarmed.length, 'arming freshness STRICTLY narrows (the stale VOUCH drops)');
  assert.ok(!armed.some((r) => r.payload && r.payload.target_persona === 'did:key:zAGENT2'), 'the STALE VOUCH is gone');
  assert.ok(armed.some((r) => r.payload && r.payload.target_persona === 'did:key:zAGENT'), 'the FRESH VOUCH survives');
});

test('AR2 armed ANCHORING narrows: empty sigmaRoots drops all un-bound personas (proves filterAnchoredRecords is composed)', () => {
  const { meCtx } = world();
  const armed = authenticatedAnchoredRecords({ ...meCtx, regProvenance: { sigmaRoots: {} } });
  assert.deepEqual(armed, [], 'armed anchoring with NO bindings drops every record (no persona verifies)');
});

test('totality: a null / degenerate meCtx yields [] and NEVER throws', () => {
  for (const mc of [undefined, null, {}, 42, { registry: reg.createRegistry() }]) {
    let out;
    assert.doesNotThrow(() => { out = authenticatedAnchoredRecords(mc); }, 'never throws');
    assert.deepEqual(out, [], 'a degenerate meCtx reads an empty set');
  }
});

test('totality (hostile getter): a throwing registry/storeOpts getter fails CLOSED -> [] (CodeRabbit Major)', () => {
  // the "never throws" contract must hold for a hostile-OBJECT meCtx too, not just null/primitives -- a throwing
  // top-level getter would else escape at the property read, before the drop-closed filters run.
  const hostileReg = {};
  Object.defineProperty(hostileReg, 'registry', { enumerable: true, get() { throw new Error('boom'); } });
  let out;
  assert.doesNotThrow(() => { out = authenticatedAnchoredRecords(hostileReg); }, 'a throwing registry getter must NOT throw');
  assert.deepEqual(out, [], 'a hostile meCtx getter fails closed to the empty set');
  const hostileStore = { registry: reg.createRegistry() };
  Object.defineProperty(hostileStore, 'storeOpts', { enumerable: true, get() { throw new Error('boom'); } });
  assert.doesNotThrow(() => authenticatedAnchoredRecords(hostileStore), 'a throwing storeOpts getter must NOT throw');
});

test('CONTAINED (monotonicity guard): the chokepoint is routed ONLY by the monotonic-safe set (convert + F6-Wave-1 pure-positive folds)', () => {
  // The routed set is the ADR-0003 monotonic-safe subset: convert.disjointPaths (positive VOUCH-graph read) +
  // F6 Wave-1 (plans/59) reach + verification-strength + cross-verify (pure-positive + monotone; cross-verify's
  // internal fallback is swapped to the chokepoint per ADR Dec-3, and it is also fed anchored recs on the
  // verification-strength path -- dead for live callers, who pass recs; a standalone armed caller anchors). Routing a
  // NEGATIVE-evidence consumer (creator-standing/premise-score/direct/stake-anchor-SLASH/consensus) through here
  // would INVERT monotonic-narrow when armed (a dropped un-anchored accuser RAISES trust) -- those stay Wave-2/OPEN.
  // A NEW importer beyond this reviewed set is a DELIBERATE-UPDATE signal requiring a monotonicity review + an
  // ADR-0003 map update, not a mechanical add. EXACT-SET (deepEqual).
  assertOnlyLiteralRequires(allSrcJsFiles(SRC));
  const MODULE_ABS = path.join(SRC, 'trust/authenticated-read.js');
  const importers = allSrcJsFiles(SRC)
    .filter((f) => path.resolve(f) !== MODULE_ABS)
    .filter((f) => /require\(['"][^'"]*authenticated-read(?:\.js)?['"]\)/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
    .sort();
  assert.deepEqual(importers, ['grounding/cross-verify.js', 'grounding/reach.js', 'grounding/verification-strength.js', 'trust/convert.js'],
    'authenticated-read must be routed ONLY by the ADR-0003 monotonic-safe set (convert + F6-Wave-1 cross-verify/reach/verification-strength); a new importer needs a monotonicity review; found: ' + importers.join(', '));
});

console.log(`\n[authenticated-read] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
