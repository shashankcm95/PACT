'use strict';

// PACT v0 -- shared integration fixture (lifted from mint-fresh-vouch.test.js at plans/38 W4).
//
// `world()` builds a reusable me-graph: ME + registered personas, ME's per-receiver store, a seed-vouch helper
// (plain buildFrame) + a harness-mint helper (mintFreshVouch). Kept structural (no broker privilege) so BOTH the
// W3 mint proof AND the W4 provenance proof board EXTEND it, not fork it (the W3 forward-contract: "the fixture is
// factored REUSABLE so W4's controls extend it"). NOT a `*.test.js` file -> the runner does not auto-run it; it is
// a helper `require()`d by the two proof test files. Each test file runs in its OWN node process (the runner shells
// each out), so the module-level `_allDirs` + exit-cleanup below is per-process -- no cross-file interference.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateEdgeKeypair, signRecordId } = require('../../src/lib/edge-attestation');
const { createRegistry, registerPersona } = require('../../src/identity/registry');
const { buildFrame } = require('../../src/frame/frame');
const { appendRecord } = require('../../src/lib/record-store');
const { mintFreshVouch } = require('../../src/identity/mint-fresh-vouch');

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const ARMED = { now: NOW, ttlMs: DAY };
const FRESH = { approved_at: NOW - 1000, nonce: 'seed-fresh-nonce' };   // >= MIN_NONCE_LEN(8), whitespace-clean

const _allDirs = [];
process.on('exit', () => { for (const d of _allDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* */ } } });

// A reusable me-graph world: ME + registered personas, ME's store, a seed-vouch (plain buildFrame) + a
// harness-mint helper. Keeps the vouch graph purely structural (no broker privilege) so the consumers'
// disjointPaths readout stays un-privileged and W4 can extend it.
function world() {
  const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-world-'));
  _allDirs.push(STATE);
  const registry = createRegistry();
  const personas = {};
  let seq = 0;
  function reg(did, human) {
    const kp = generateEdgeKeypair();
    registerPersona(registry, { personaDid: did, humanUid: human, publicKeyPem: kp.publicKeyPem });
    personas[did] = { kp, human };
    return did;
  }
  const ME = reg('did:key:zME', 'human:me');
  const storeOpts = { receiverId: ME, stateDir: STATE };
  const meCtxArmed = { registry, storeOpts, freshness: ARMED };
  function append(frame) { const ap = appendRecord(frame, storeOpts); if (!ap.ok) throw new Error('append: ' + ap.reason); return frame; }
  // a plain signed FRESH VOUCH via buildFrame (the seed edge shape -- src signs directly with its own key).
  function seedVouch(src, target, freshness) {
    const p = personas[src];
    const payload = { target_persona: target, ...(freshness !== undefined ? { freshness } : {}) };
    const built = buildFrame({ srcPersonaDid: src, parentHumanUid: p.human, type: 'VOUCH', seq: seq++, nonce: 'seed-nonce-' + seq, payload }, { privateKeyPem: p.kp.privateKeyPem });
    if (!built.ok) throw new Error('seed: ' + built.reason);
    return append(built.frame);
  }
  // mint a FRESH VOUCH via the HARNESS (an injected same-uid signer over src's own key).
  function mint(src, target, over = {}) {
    const p = personas[src];
    const signer = (rid) => signRecordId(rid, { privateKeyPem: p.kp.privateKeyPem });
    const n = seq++;
    const r = mintFreshVouch({ signer, personaDid: src, humanUid: p.human, targetPersona: target, approvedAt: NOW - 1000, freshnessNonce: 'mint-fresh-nonce-' + n, keyId: 'k1', seq: n, nonce: 'mint-frame-nonce-' + n, ...over });
    if (!r.ok) throw new Error('mint: ' + r.reason);
    return { frame: append(r.frame), result: r };
  }
  return { STATE, registry, personas, ME, storeOpts, meCtxArmed, reg, append, seedVouch, mint };
}

module.exports = { world, NOW, DAY, ARMED, FRESH };
