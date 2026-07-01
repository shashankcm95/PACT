#!/usr/bin/env node
'use strict';

// PACT v0 — audit-log.test.js  (plans/15 §4: the stateful PRODUCER leaf — phantom-leaf bind, freshness STH,
// proofs against the REAL verifier, detectFork sound-half, store-then-leaf crash-consistency + idempotent reconcile).

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const A = require('../../src/audit/audit-log');
const M = require('../../src/lib/merkle');
const R = require('../../src/lib/record');
const E = require('../../src/lib/edge-attestation');
const S = require('../../src/lib/record-store');

const RX = 'did:key:zReceiver';
const kp = E.generateEdgeKeypair();
const signerOpts = { privateKeyPem: kp.privateKeyPem };

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}
function freshState() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pact-v0-audit-')); }
// capture process.stderr.write for the duration of fn (the refuse-alert out-of-band channel).
function captureStderr(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return lines.join('');
}
function buildRecord(overrides = {}) {
  const body = {
    ver: 'pact/0', type: 'CLAIM', src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:alice',
    seq: 0, nonce: 'n0', payload: { content: 'claim' }, ...overrides,
  };
  return { ...body, record_id: R.computeRecordId(body) };
}
function leafOf(recordId) { return M.leafHash(Buffer.from(recordId, 'hex')); }

// ===================== appendLeaf — phantom-leaf bind (#273) + idempotent =====================
test('appendLeaf appends in order + is idempotent (a replay is a no-op)', () => {
  const stateDir = freshState();
  const r0 = buildRecord({ nonce: 'a' });
  const r1 = buildRecord({ nonce: 'b' });
  const a0 = A.appendLeaf(r0, { receiverId: RX, stateDir });
  assert.ok(a0.ok, a0.reason); assert.equal(a0.seq, 0); assert.equal(a0.tree_size, 1);
  const a1 = A.appendLeaf(r1, { receiverId: RX, stateDir });
  assert.equal(a1.seq, 1); assert.equal(a1.tree_size, 2);
  const replay = A.appendLeaf(r0, { receiverId: RX, stateDir });
  assert.ok(replay.ok && replay.deduped === true, 'replay must dedup');
  assert.equal(replay.seq, 0); assert.equal(replay.tree_size, 2);
});
test('appendLeaf RED: phantom leaf — record_id != computeRecordId(body) is rejected (#273)', () => {
  const stateDir = freshState();
  const r = buildRecord();
  const forged = { ...r, record_id: 'a'.repeat(64) }; // valid hex shape, wrong content hash
  const res = A.appendLeaf(forged, { receiverId: RX, stateDir });
  assert.equal(res.ok, false);
  assert.match(res.reason, /record-id-mismatch/);
});
test('appendLeaf RED: a bare id string / missing-id / non-object is refused (no backing record)', () => {
  const stateDir = freshState();
  assert.equal(A.appendLeaf('a'.repeat(64), { receiverId: RX, stateDir }).ok, false);
  assert.equal(A.appendLeaf(null, { receiverId: RX, stateDir }).ok, false);
  const noId = buildRecord(); delete noId.record_id;
  assert.equal(A.appendLeaf(noId, { receiverId: RX, stateDir }).ok, false);
});
test('appendLeaf RED: an invalid receiver yields invalid-receiver', () => {
  const stateDir = freshState();
  assert.equal(A.appendLeaf(buildRecord(), { receiverId: '', stateDir }).ok, false);
});

// ===================== currentSTH — freshness-bound + verifiable against lib/merkle =====================
test('currentSTH over an empty log: tree_size 0, root == sha256(""), verifies', () => {
  const stateDir = freshState();
  const { ok, sth } = A.currentSTH(signerOpts, { receiverId: RX, stateDir });
  assert.ok(ok);
  assert.equal(sth.tree_size, 0);
  assert.equal(sth.root, M.merkleRoot([]));
  assert.equal(M.verifySTH(sth, kp.publicKeyPem), true);
});
test('currentSTH root == merkleRoot of the appended leaves + verifies', () => {
  const stateDir = freshState();
  const recs = [buildRecord({ nonce: 'x' }), buildRecord({ nonce: 'y' }), buildRecord({ nonce: 'z' })];
  for (const r of recs) A.appendLeaf(r, { receiverId: RX, stateDir });
  const { ok, sth } = A.currentSTH(signerOpts, { receiverId: RX, stateDir });
  assert.ok(ok);
  assert.equal(sth.tree_size, 3);
  assert.equal(sth.root, M.merkleRoot(recs.map((r) => leafOf(r.record_id))));
  assert.equal(M.verifySTH(sth, kp.publicKeyPem), true);
});
test('currentSTH is freshness-bound: distinct (timestamp,nonce) => distinct sig, both verify', () => {
  const stateDir = freshState();
  A.appendLeaf(buildRecord({ nonce: 'one' }), { receiverId: RX, stateDir });
  const s1 = A.currentSTH(signerOpts, { receiverId: RX, stateDir, now: 1000, nonce: 'n-aaa' }).sth;
  const s2 = A.currentSTH(signerOpts, { receiverId: RX, stateDir, now: 2000, nonce: 'n-bbb' }).sth;
  assert.notEqual(s1.sig, s2.sig);
  assert.equal(M.verifySTH(s1, kp.publicKeyPem), true);
  assert.equal(M.verifySTH(s2, kp.publicKeyPem), true);
});
test('currentSTH RED: no signer => sign-failed (no ambient key)', () => {
  const stateDir = freshState();
  A.appendLeaf(buildRecord(), { receiverId: RX, stateDir });
  assert.equal(A.currentSTH({}, { receiverId: RX, stateDir }).ok, false);
});

// ===================== proofs against the REAL verifier =====================
test('proveInclusion: every appended leaf verifies against the current STH root', () => {
  const stateDir = freshState();
  const recs = [];
  for (let i = 0; i < 6; i++) { const r = buildRecord({ nonce: 'i' + i }); recs.push(r); A.appendLeaf(r, { receiverId: RX, stateDir }); }
  const sth = A.currentSTH(signerOpts, { receiverId: RX, stateDir }).sth;
  for (let i = 0; i < recs.length; i++) {
    const p = A.proveInclusion(i, { receiverId: RX, stateDir });
    assert.ok(p.ok, p.reason);
    assert.equal(p.leaf, leafOf(recs[i].record_id));
    assert.equal(M.verifyInclusion(p.leaf, i, sth.tree_size, p.proof, sth.root), true, 'index ' + i);
  }
});
test('proveInclusion RED: out-of-range index', () => {
  const stateDir = freshState();
  A.appendLeaf(buildRecord(), { receiverId: RX, stateDir });
  assert.equal(A.proveInclusion(5, { receiverId: RX, stateDir }).ok, false);
});
test('proveConsistency: an earlier size m is consistent with the current size n (append-only)', () => {
  const stateDir = freshState();
  for (let i = 0; i < 7; i++) A.appendLeaf(buildRecord({ nonce: 'c' + i }), { receiverId: RX, stateDir });
  const c = A.proveConsistency(3, { receiverId: RX, stateDir }); // n = current (7)
  assert.ok(c.ok, c.reason);
  assert.equal(c.m, 3); assert.equal(c.n, 7);
  assert.equal(M.verifyConsistency(c.m, c.n, c.proof, c.root_m, c.root_n), true);
});

// ===================== detectFork — the sound, provenance-free half =====================
test('detectFork: same tree_size, different root => fork (no consistency proof needed)', () => {
  const a = { root: 'a'.repeat(64), tree_size: 5, timestamp: 10, nonce: 'x', sig: 'AA' };
  const b = { root: 'b'.repeat(64), tree_size: 5, timestamp: 20, nonce: 'y', sig: 'BB' };
  assert.equal(A.detectFork(a, b).fork, true);
});
test('detectFork: a later STH with a SMALLER tree_size => fork (monotonicity)', () => {
  const earlier = { root: 'a'.repeat(64), tree_size: 9, timestamp: 100, nonce: 'x', sig: 'AA' };
  const later = { root: 'b'.repeat(64), tree_size: 4, timestamp: 200, nonce: 'y', sig: 'BB' };
  assert.equal(A.detectFork(earlier, later).fork, true);
});
test('detectFork: two honest growing STHs from one append-only log => no fork', () => {
  const stateDir = freshState();
  A.appendLeaf(buildRecord({ nonce: 'g0' }), { receiverId: RX, stateDir });
  const s1 = A.currentSTH(signerOpts, { receiverId: RX, stateDir, now: 1, nonce: 'a' }).sth;
  A.appendLeaf(buildRecord({ nonce: 'g1' }), { receiverId: RX, stateDir });
  const s2 = A.currentSTH(signerOpts, { receiverId: RX, stateDir, now: 2, nonce: 'b' }).sth;
  assert.equal(A.detectFork(s1, s2).fork, false);
});
test('detectFork: a malformed STH is NOT a vacuous fork', () => {
  const ok = { root: 'a'.repeat(64), tree_size: 3, timestamp: 1, nonce: 'x', sig: 'AA' };
  assert.equal(A.detectFork(null, ok).fork, false);
  assert.equal(A.detectFork({ root: 'nothex', tree_size: 3 }, ok).fork, false);
});

// ===================== appendAudited (store-then-leaf) + crash-consistent reconcile =====================
test('appendAudited writes the record AND the leaf (durable record first)', () => {
  const stateDir = freshState();
  const r = buildRecord({ nonce: 'aa' });
  const res = A.appendAudited(r, { receiverId: RX, stateDir });
  assert.ok(res.ok, res.reason);
  assert.equal(res.tree_size, 1);
  assert.ok(S.readById(r.record_id, { receiverId: RX, stateDir }), 'record must be durable in the store');
  const p = A.proveInclusion(0, { receiverId: RX, stateDir });
  assert.ok(p.ok && p.leaf === leafOf(r.record_id));
});
test('appendAudited RED: a forged record never produces a leaf (no leaf-without-record)', () => {
  const stateDir = freshState();
  const forged = { ...buildRecord(), record_id: 'a'.repeat(64) };
  const res = A.appendAudited(forged, { receiverId: RX, stateDir });
  assert.equal(res.ok, false);
  assert.equal(A.currentSTH(signerOpts, { receiverId: RX, stateDir }).sth.tree_size, 0, 'no leaf written');
});
test('reconcile rebuilds a record-without-leaf (crash between store-write and leaf-append) + is idempotent', () => {
  const stateDir = freshState();
  // two clean appendAudited, then simulate a crash: a 3rd record written to the STORE only (no leaf).
  A.appendAudited(buildRecord({ seq: 0, nonce: 'r0' }), { receiverId: RX, stateDir });
  A.appendAudited(buildRecord({ seq: 1, nonce: 'r1' }), { receiverId: RX, stateDir });
  const orphan = buildRecord({ seq: 2, nonce: 'r2' });
  S.appendRecord(orphan, { receiverId: RX, stateDir }); // store only — the leaf write "crashed"
  assert.equal(A.currentSTH(signerOpts, { receiverId: RX, stateDir }).sth.tree_size, 2, 'leaf missing pre-reconcile');
  const rec1 = A.reconcile({ receiverId: RX, stateDir });
  assert.ok(rec1.ok); assert.equal(rec1.added, 1); assert.equal(rec1.tree_size, 3);
  // the rebuilt leaf is provable
  const sth = A.currentSTH(signerOpts, { receiverId: RX, stateDir }).sth;
  let found = -1;
  for (let i = 0; i < 3; i++) {
    const p = A.proveInclusion(i, { receiverId: RX, stateDir });
    if (p.leaf === leafOf(orphan.record_id)) found = i;
    assert.equal(M.verifyInclusion(p.leaf, i, sth.tree_size, p.proof, sth.root), true);
  }
  assert.ok(found >= 0, 'the rebuilt leaf must be present + provable');
  // idempotent: a second reconcile adds nothing
  const rec2 = A.reconcile({ receiverId: RX, stateDir });
  assert.equal(rec2.added, 0); assert.equal(rec2.tree_size, 3);
});

// ===================== readLeaves fd-safe / size-cap (Phase 2b) + the fail-closed-throw contract =====================
// "The store is not a sandbox": a same-uid write foothold can plant a hostile leaves.json. readLeaves now opens
// O_NOFOLLOW|O_NONBLOCK, fstats, and caps st.size BEFORE the read — a multi-GB plant is refused before it OOMs the
// reader; a symlink redirect is refused at open. The fail-CLOSED contract is PRESERVED: a present-but-anomalous log
// THROWS -> the caller returns {ok:false}, NEVER a silent reset to [] (which would forge a fresh root + erase history).
// Only an ABSENT (ENOENT) log -> [] (a legit empty / first append).

function plantLeaves(opts, content) {
  const file = A.auditLogPath(opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('readLeaves fail-closed (PRESERVED): a corrupt (invalid-JSON) log THROWS -> {ok:false}, never a silent reset', () => {
  const stateDir = freshState();
  plantLeaves({ receiverId: RX, stateDir }, '{ this is not json');
  const res = A.currentSTH(signerOpts, { receiverId: RX, stateDir });
  assert.equal(res.ok, false, 'a corrupt append-only log must FAIL CLOSED, not reset to a fresh empty root');
  assert.match(res.reason, /audit-log-corrupt/);
});

test('readLeaves fail-closed (PRESERVED): a bad-shape log (leaves not an array) THROWS -> {ok:false}', () => {
  const stateDir = freshState();
  plantLeaves({ receiverId: RX, stateDir }, JSON.stringify({ version: 1, leaves: 'nope' }));
  assert.equal(A.currentSTH(signerOpts, { receiverId: RX, stateDir }).ok, false);
});

test('size-cap: an OVERSIZE log is refused at fstat (fail-closed) — not read into memory, not silently reset', () => {
  const stateDir = freshState();
  const file = plantLeaves({ receiverId: RX, stateDir }, '');
  fs.truncateSync(file, A.MAX_AUDIT_LOG_BYTES + 1); // a SPARSE oversize file (metadata only; no 64 MB written)
  assert.equal(fs.statSync(file).size, A.MAX_AUDIT_LOG_BYTES + 1, 'precondition: truncate set the logical size > cap');
  const res = A.currentSTH(signerOpts, { receiverId: RX, stateDir });
  assert.equal(res.ok, false, 'oversize must fail closed (never a silent reset to a fresh root)');
  assert.match(res.reason, /oversize/);
});

test('O_NOFOLLOW: a symlinked leaves.json is REFUSED (not followed) -> fail-closed', () => {
  const stateDir = freshState();
  const target = path.join(stateDir, 'foreign-leaves.json');
  fs.writeFileSync(target, JSON.stringify({ version: 1, leaves: [] })); // a valid log the attacker points AT
  const file = A.auditLogPath({ receiverId: RX, stateDir });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.symlinkSync(target, file); } catch (e) { console.log('  (skip: symlink unsupported here: ' + e.code + ')'); return; }
  const res = A.currentSTH(signerOpts, { receiverId: RX, stateDir });
  assert.equal(res.ok, false, 'a symlinked log is refused (O_NOFOLLOW -> ELOOP), not silently followed');
  assert.match(res.reason, /audit-log-corrupt/);
});

test('non-regular: a directory at the leaves.json path is refused (fstat !isFile) -> fail-closed', () => {
  const stateDir = freshState();
  const file = A.auditLogPath({ receiverId: RX, stateDir });
  fs.mkdirSync(file, { recursive: true }); // a DIRECTORY at the leaves path
  const res = A.currentSTH(signerOpts, { receiverId: RX, stateDir });
  assert.equal(res.ok, false);
  // guard-SPECIFIC: assert the !isFile() throw, not the io-fallback (a readSync on a dir fd would ALSO throw
  // -> 'unreadable (EISDIR)', which still matches /audit-log-corrupt/, so a bare match wouldn't pin the guard).
  assert.match(res.reason, /audit-log-corrupt: non-regular file/);
});

test('observability (security.md): a fail-closed read anomaly emits an out-of-band ATTACK alert (record-store parity)', () => {
  const stateDir = freshState();
  const file = plantLeaves({ receiverId: RX, stateDir }, '');
  fs.truncateSync(file, A.MAX_AUDIT_LOG_BYTES + 1); // oversize -> the fail-closed read-layer anomaly
  let res;
  const out = captureStderr(() => { res = A.currentSTH(signerOpts, { receiverId: RX, stateDir }); });
  assert.equal(res.ok, false, 'still fail-closed');
  const line = out.split('\n').find((l) => l.includes('[PACT-REFUSE-ALERT]'));
  assert.ok(line, 'a same-uid attack on the audit log must be observable out-of-band, not a silent {ok:false}');
  const json = JSON.parse(line.slice(line.indexOf('{')));
  assert.equal(json.class, 'attack', 'an oversize/symlink/non-regular plant is an attack-class read anomaly');
  assert.match(json.detail, /oversize/);
});

test('bounded read (non-vacuous): readAllBounded reads AT MOST `size` bytes, never the whole (possibly-grown) file', () => {
  const stateDir = freshState();
  const big = path.join(stateDir, 'grow.bin');
  fs.writeFileSync(big, Buffer.alloc(4096, 0x61)); // 4 KB
  const fd = fs.openSync(big, 'r');
  try { assert.equal(A.readAllBounded(fd, 1024).length, 1024, 'reads only `size` bytes (a grow-after-fstat is bounded)'); }
  finally { fs.closeSync(fd); }
  const fd2 = fs.openSync(big, 'r');
  try { assert.equal(A.readAllBounded(fd2, 4096).length, 4096, 'reads the full file when size == length (not vacuously short)'); }
  finally { fs.closeSync(fd2); }
});

test('readAllBounded fail-closed (CodeRabbit MAJOR): a short read (size > actual length) THROWS, never a truncated prefix', () => {
  // a shrink-after-fstat (or any size mismatch) must FAIL CLOSED — never return a truncated prefix that could,
  // with crafted padding, parse as valid JSON for a DIFFERENT (smaller) log than the one fstat'd.
  const stateDir = freshState();
  const f = path.join(stateDir, 'short.bin');
  fs.writeFileSync(f, 'abc'); // 3 bytes
  const fd = fs.openSync(f, 'r');
  try { assert.throws(() => A.readAllBounded(fd, 100), /short read/, 'reading 100 from a 3-byte file must fail closed'); }
  finally { fs.closeSync(fd); }
});

console.log(`\n[audit-log] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
