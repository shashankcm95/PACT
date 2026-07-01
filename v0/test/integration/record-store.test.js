#!/usr/bin/env node
'use strict';

// PACT v0 — record-store.js unit tests (Stage A gate).
// Contract: append/readById round-trip; content-address integrity on WRITE (forged id
// rejected) and on READ (the #273 three-part gate — array-coercion decoy + field!=content
// planted body both skipped); INV-22 dedup; per-receiver isolation; traversal impossible by
// construction (hashed receiver key); did:web-shaped receiver key works.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../../src/lib/record-store');
const R = require('../../src/lib/record');

const STATE = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-v0-store-'));
const RX = 'did:key:zReceiver';

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// capture process.stderr.write for the duration of fn (the refuse-alert out-of-band channel).
function captureStderr(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return lines.join('');
}

function buildBody(overrides = {}) {
  return {
    ver: 'pact/0', type: 'CLAIM',
    src_persona_did: 'did:key:zAlice', parent_human_uid: 'human:alice',
    seq: 0, nonce: 'n1', payload: { content: 'the sky is blue' },
    ...overrides,
  };
}
function buildRecord(overrides = {}) {
  const body = buildBody(overrides);
  return { ...body, record_id: R.computeRecordId(body) };
}
function buildWithIdem(overrides = {}) {
  const body = buildBody(overrides);
  const withKey = { ...body, idempotency_key: R.deriveIdempotencyKey(body) };
  return { ...withKey, record_id: R.computeRecordId(withKey) };
}

test('append + readById round-trip', () => {
  const rec = buildRecord();
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.ok(res.ok, res.reason);
  assert.equal(res.record_id, rec.record_id);
  const back = S.readById(rec.record_id, { receiverId: RX, stateDir: STATE });
  assert.ok(back, 'expected the record back');
  assert.equal(back.record_id, rec.record_id);
  assert.equal(back.payload.content, 'the sky is blue');
});

test('S5: a forged record_id is rejected on write (record-id-mismatch)', () => {
  const rec = buildRecord();
  const forged = { ...rec, record_id: 'a'.repeat(64) }; // valid hex shape, wrong content hash
  const res = S.appendRecord(forged, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /record-id-mismatch/);
});

test('invalid record (missing required) is rejected on write', () => {
  const rec = buildRecord(); delete rec.src_persona_did;
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /invalid-record/);
});

test('INV-22 dedup: re-appending the same keyed record is a no-op replay', () => {
  const rec = buildWithIdem({ nonce: 'dedup-1' });
  const r1 = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.ok(r1.ok && !r1.deduped, 'first write is a real write');
  const r2 = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.ok(r2.ok && r2.deduped === true, 'replay must be deduped');
  assert.equal(r2.record_id, r1.record_id);
});

test('idempotency-key-mismatch: a record carrying a wrong key is rejected', () => {
  const body = buildBody({ nonce: 'mismatch-1' });
  const wrongKey = 'b'.repeat(64);
  const withWrong = { ...body, idempotency_key: wrongKey };
  const rec = { ...withWrong, record_id: R.computeRecordId(withWrong) };
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false);
  assert.match(res.reason, /idempotency-key-mismatch/);
});

test('verify-on-read (a): a planted array-coercion record_id decoy is SKIPPED', () => {
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  const realId = R.computeRecordId(buildBody({ nonce: 'decoy-a' }));
  // body.record_id is an ARRAY [realId] — string-coerces past a naive basename compare,
  // but gate (a) (typeof !== 'string') rejects it before coercion.
  const planted = { ...buildBody({ nonce: 'decoy-a' }), record_id: [realId] };
  fs.writeFileSync(path.join(dir, 'record-' + realId + '.json'), JSON.stringify(planted));
  assert.equal(S.readById(realId, { receiverId: RX, stateDir: STATE }), null);
});

test('verify-on-read (c): a planted field==filename but content!=hash body is SKIPPED', () => {
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  const realId = R.computeRecordId(buildBody({ nonce: 'decoy-c' }));
  // record_id field == filename id (string, hex), but the body content does NOT hash to it
  // (attacker swapped the persona) — gate (c) (field != content) rejects it.
  const planted = { ...buildBody({ nonce: 'decoy-c', src_persona_did: 'did:key:zAttacker' }), record_id: realId };
  fs.writeFileSync(path.join(dir, 'record-' + realId + '.json'), JSON.stringify(planted));
  assert.equal(S.readById(realId, { receiverId: RX, stateDir: STATE }), null);
});

test('per-receiver isolation: receiver B cannot read receiver A record', () => {
  const rec = buildRecord({ nonce: 'iso-1' });
  S.appendRecord(rec, { receiverId: 'did:key:zAlice', stateDir: STATE });
  assert.ok(S.readById(rec.record_id, { receiverId: 'did:key:zAlice', stateDir: STATE }));
  assert.equal(S.readById(rec.record_id, { receiverId: 'did:key:zBob', stateDir: STATE }), null);
});

test('traversal impossible by construction: a ../ receiverId cannot escape stateDir', () => {
  const rec = buildRecord({ nonce: 'trav-1' });
  const res = S.appendRecord(rec, { receiverId: '../../etc/evil', stateDir: STATE });
  assert.ok(res.ok, 'a hostile receiverId is NEUTRALIZED (hashed), not an error: ' + res.reason);
  const real = fs.realpathSync(res.file);
  assert.ok(real.startsWith(fs.realpathSync(STATE)), 'the file must stay within stateDir: ' + real);
});

test('did:web-shaped receiver key (carries /) works', () => {
  const rec = buildRecord({ nonce: 'didweb-1' });
  const RID = 'did:web:example.com:agents:alice';
  const res = S.appendRecord(rec, { receiverId: RID, stateDir: STATE });
  assert.ok(res.ok, res.reason);
  assert.ok(S.readById(rec.record_id, { receiverId: RID, stateDir: STATE }));
});

test('invalid receiver (empty/non-string) is rejected', () => {
  assert.equal(S.appendRecord(buildRecord({ nonce: 'inv-1' }), { receiverId: '', stateDir: STATE }).reason, 'invalid-receiver');
  assert.equal(S.appendRecord(buildRecord({ nonce: 'inv-2' }), { receiverId: null, stateDir: STATE }).reason, 'invalid-receiver');
});

test('store boundary REJECTS a both-target_* record (the CONTEST discriminant fires at appendRecord)', () => {
  const rec = buildRecord({ type: 'CONTEST', payload: { target_claim_id: 'a'.repeat(64), target_premise_id: 'b'.repeat(64) } });
  const res = S.appendRecord(rec, { receiverId: RX, stateDir: STATE });
  assert.equal(res.ok, false, 'a both-target_* record must be rejected at the store boundary');
  assert.match(res.reason, /invalid-record/);
});

test('refuse-alert: a content-address-mismatch (co-forge) on read emits an ATTACK alert out-of-band', () => {
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  const realId = R.computeRecordId(buildBody({ nonce: 'alert-c' }));
  // field==filename id (hex string) but the body does NOT hash to it — the #273 co-forge signal.
  const planted = { ...buildBody({ nonce: 'alert-c', src_persona_did: 'did:key:zAttacker' }), record_id: realId };
  fs.writeFileSync(path.join(dir, 'record-' + realId + '.json'), JSON.stringify(planted));
  let back;
  const out = captureStderr(() => { back = S.readById(realId, { receiverId: RX, stateDir: STATE }); });
  assert.equal(back, null, 'behavior UNCHANGED — the forged record is still skipped (fail-soft)');
  assert.match(out, /\[PACT-REFUSE-ALERT\]/, 'the silent drop is now observable out-of-band');
  const line = out.split('\n').find((l) => l.includes('[PACT-REFUSE-ALERT]'));
  const json = JSON.parse(line.slice(line.indexOf('{')));
  assert.equal(json.reason, 'content-address-mismatch');
  assert.equal(json.class, 'attack', 'a co-forge is an ATTACK, not a benign integrity miss');
});

test('refuse-alert: a normal miss (ENOENT — no such record) is SILENT (no false alert)', () => {
  const out = captureStderr(() => {
    assert.equal(S.readById('f'.repeat(64), { receiverId: RX, stateDir: STATE }), null);
  });
  assert.equal(out, '', 'a plain absent-record read must NOT emit a reject alert');
});

// --- Phase 2: the fd-safe bounded read (size-cap-before-read) -----------------------------------
// "The store is not a sandbox": a same-uid write foothold can plant a hostile file at a valid
// record-<64hex>.json name. loadRecordFile now opens O_NOFOLLOW|O_NONBLOCK, fstats the SAME fd, and
// caps st.size BEFORE reading — a multi-GB plant is refused before it can OOM the reader, a symlink
// redirect is refused at open, a FIFO/dir is refused at fstat. A legit record is UNCHANGED (fail-soft
// null on any anomaly; deepFrozen body on success). The read-layer anomalies class as 'attack' (a
// hostile object at a record path); the content-layer classes (integrity / attack co-forge) are unchanged.

function alertLine(out) {
  const line = out.split('\n').find((l) => l.includes('[PACT-REFUSE-ALERT]'));
  return line ? JSON.parse(line.slice(line.indexOf('{'))) : null;
}

test('size-cap: an oversize file at a valid record path is SKIPPED + emits an attack alert (before parse)', () => {
  const realId = R.computeRecordId(buildBody({ nonce: 'oversize-1' }));
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  // > MAX_RECORD_FILE_BYTES of junk: the size reject fires on fstat, BEFORE any read/parse (content irrelevant).
  fs.writeFileSync(path.join(dir, 'record-' + realId + '.json'), 'x'.repeat(S.MAX_RECORD_FILE_BYTES + 1024));
  let back;
  const out = captureStderr(() => { back = S.readById(realId, { receiverId: RX, stateDir: STATE }); });
  assert.equal(back, null, 'an oversize planted file is refused (fail-soft null)');
  const json = alertLine(out);
  assert.ok(json, 'the oversize refuse is observable out-of-band');
  assert.equal(json.reason, 'oversize-record-file');
  assert.equal(json.class, 'attack');
});

test('size-cap non-vacuity: the SAME shape UNDER the cap loads normally (the cap is what rejects)', () => {
  // a genuine in-cap record round-trips — so the oversize test rejects on SIZE, not an unrelated defect.
  const rec = buildRecord({ nonce: 'under-cap-1' });
  assert.ok(S.appendRecord(rec, { receiverId: RX, stateDir: STATE }).ok);
  assert.ok(S.readById(rec.record_id, { receiverId: RX, stateDir: STATE }), 'an in-cap record still loads');
});

test('O_NOFOLLOW: a symlink planted at a record path is REFUSED (intentional hardening) + alerts ELOOP', () => {
  // stash a real, valid record OUTSIDE the store, then symlink the in-store record path to it. The prior
  // readFileSync FOLLOWED the link (a same-uid redirect); O_NOFOLLOW refuses it atomically at open.
  const rec = buildRecord({ nonce: 'symlink-tgt' });
  const target = path.join(STATE, 'real-target.json');
  fs.writeFileSync(target, JSON.stringify(rec));
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  try { fs.symlinkSync(target, path.join(dir, 'record-' + rec.record_id + '.json')); }
  catch (e) { console.log('  (skip: symlink unsupported here: ' + e.code + ')'); return; }
  let back;
  const out = captureStderr(() => { back = S.readById(rec.record_id, { receiverId: RX, stateDir: STATE }); });
  assert.equal(back, null, 'a symlinked record file is refused (no-follow), not silently followed');
  const json = alertLine(out);
  assert.ok(json, 'the symlink refusal is observable');
  assert.equal(json.reason, 'unreadable-record-file');
  assert.equal(json.class, 'attack');
  assert.equal(json.io_code, 'ELOOP', 'O_NOFOLLOW surfaces ELOOP for a symlinked final component');
});

test('non-regular file: a directory at a record path is SKIPPED + alerts (fstat !isFile)', () => {
  const realId = R.computeRecordId(buildBody({ nonce: 'nonreg-1' }));
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'record-' + realId + '.json')); // a DIRECTORY at the record path
  let back;
  const out = captureStderr(() => { back = S.readById(realId, { receiverId: RX, stateDir: STATE }); });
  assert.equal(back, null, 'a non-regular file at a record path is refused');
  const json = alertLine(out);
  assert.ok(json, 'the non-regular refuse is observable');
  assert.equal(json.reason, 'non-regular-record-file');
  assert.equal(json.class, 'attack');
});

test('non-regular (FIFO): a named pipe at a record path is refused via O_NONBLOCK+fstat (no hang) + alerts', () => {
  // the O_NONBLOCK claim: a FIFO planted at a record path opens IMMEDIATELY (no writer -> no hang under
  // O_RDONLY|O_NONBLOCK), then fstat().isFile() is false -> reject. (Guarded: mkfifo is POSIX-only.)
  const realId = R.computeRecordId(buildBody({ nonce: 'fifo-1' }));
  const dir = S.recordStoreDir({ receiverId: RX, stateDir: STATE });
  fs.mkdirSync(dir, { recursive: true });
  const fifo = path.join(dir, 'record-' + realId + '.json');
  try { require('node:child_process').execFileSync('mkfifo', [fifo]); } // execFile (no shell) — path as argv
  catch (e) { console.log('  (skip: mkfifo unavailable here: ' + (e && e.code) + ')'); return; }
  let back;
  const out = captureStderr(() => { back = S.readById(realId, { receiverId: RX, stateDir: STATE }); });
  assert.equal(back, null, 'a FIFO at a record path is refused without hanging');
  const json = alertLine(out);
  assert.ok(json, 'the FIFO refuse is observable');
  assert.equal(json.class, 'attack');
  // O_RDONLY|O_NONBLOCK opens the FIFO -> fstat !isFile -> 'non-regular-record-file' (ENXIO is the O_WRONLY case).
  assert.ok(['non-regular-record-file', 'unreadable-record-file'].includes(json.reason), 'reason: ' + json.reason);
});

test('bounded read (non-vacuous race proof): readBoundedText returns null when content exceeds the cap', () => {
  // the TOCTOU-grow close: a file that PASSES the fstat size-check can still grow before the read. Drive
  // readBoundedText DIRECTLY on a fd whose file is LARGER than the cap (bypassing the st.size pre-check
  // that would otherwise shadow it) — it must return null (the oversize-race signal), never read unbounded.
  const big = path.join(STATE, 'grow.bin');
  fs.writeFileSync(big, Buffer.alloc(4096, 0x61)); // 4 KB
  const fd = fs.openSync(big, 'r');
  try { assert.equal(S.readBoundedText(fd, 1024), null, 'a 4 KB file under a 1 KB cap returns null (oversize-race)'); }
  finally { fs.closeSync(fd); }
  // and UNDER the cap it returns the EXACT bytes (the helper is not vacuously always-null).
  const small = path.join(STATE, 'small.bin');
  fs.writeFileSync(small, 'hello');
  const fd2 = fs.openSync(small, 'r');
  try { assert.equal(S.readBoundedText(fd2, 1024), 'hello', 'an in-cap read returns the exact bytes'); }
  finally { fs.closeSync(fd2); }
});

// cleanup
try { fs.rmSync(STATE, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\n[record-store] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
