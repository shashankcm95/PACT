#!/usr/bin/env node
'use strict';

// PACT v0 — refuse-alert.js unit tests.
// Contract: an out-of-band operator-side emit; NEVER throws; NEVER gates (returns undefined);
// the reason token is POSITIONAL-authoritative (a hostile detail.reason cannot clobber it); a
// non-object detail is tolerated; a normal caller never sees it (stderr, not the return value).

const assert = require('node:assert/strict');
const { refuseAlert, TOKEN, CLASSES } = require('../../src/lib/refuse-alert');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// capture process.stderr.write for the duration of fn; restore unconditionally.
function capture(fn) {
  const orig = process.stderr.write;
  const lines = [];
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try { fn(); } finally { process.stderr.write = orig; }
  return lines.join('');
}
function parse(out) { return JSON.parse(out.slice(out.indexOf('{'))); }

test('emits the TOKEN prefix + JSON carrying the reason and class', () => {
  const out = capture(() => refuseAlert('sig-verify-failed', { class: 'attack' }));
  assert.ok(out.startsWith(TOKEN + ' '), 'token prefix');
  assert.ok(out.endsWith('\n'), 'newline-terminated (one line per event)');
  const json = parse(out);
  assert.equal(json.reason, 'sig-verify-failed');
  assert.equal(json.class, 'attack');
});

test('the reason token is positional-authoritative — a hostile detail.reason cannot clobber it', () => {
  const out = capture(() => refuseAlert('real-reason', { reason: 'FORGED', class: 'attack' }));
  assert.equal(parse(out).reason, 'real-reason', 'positional reason wins over detail.reason');
});

test('NEVER throws + NEVER goes fully silent — an unserializable (circular) detail degrades, not vanishes', () => {
  const circular = {}; circular.self = circular;
  let out;
  assert.doesNotThrow(() => { out = capture(() => refuseAlert('x', circular)); });
  // silence-on-failure is the exact gap this feature closes: a degraded line, not nothing.
  assert.ok(out.startsWith(TOKEN + ' '), 'a JSON.stringify failure still emits a degraded alert line');
  assert.equal(parse(out).reason, 'emit-failed');
});

test('a Symbol reason is safely coerced (String handles symbols — emits normally, never silent/throws)', () => {
  // NB: String(Symbol('x')) does NOT throw (it returns 'Symbol(x)'); only implicit coercion does.
  let out;
  assert.doesNotThrow(() => { out = capture(() => refuseAlert(Symbol('nope'), { class: 'attack' })); });
  assert.ok(out.startsWith(TOKEN + ' '), 'a Symbol reason still surfaces an alert');
  const json = parse(out);
  assert.match(json.reason, /^Symbol\(/, 'the symbol description becomes the reason');
  assert.equal(json.class, 'attack');
});

test('NEVER goes fully silent — a BigInt in detail (JSON.stringify throws) degrades, not vanishes', () => {
  let out;
  assert.doesNotThrow(() => { out = capture(() => refuseAlert('r', { record_id: 10n })); });
  assert.ok(out.startsWith(TOKEN + ' '), 'an unserializable detail still surfaces a degraded alert');
  assert.equal(parse(out).reason, 'emit-failed');
});

test('a non-object detail (null/array/scalar) is tolerated — just the reason, no stray keys', () => {
  for (const bad of [null, undefined, 'str', 42, ['a']]) {
    const json = parse(capture(() => refuseAlert('r', bad)));
    assert.equal(json.reason, 'r');
    assert.deepEqual(Object.keys(json), ['reason'], 'no keys leak from a non-object detail: ' + JSON.stringify(bad));
  }
});

test('a non-string reason is coerced (never crashes the caller)', () => {
  assert.equal(parse(capture(() => refuseAlert(123, { class: 'integrity' }))).reason, '123');
});

test('returns undefined — a pure side-effect a gate can never branch on', () => {
  let rv;
  capture(() => { rv = refuseAlert('r'); });
  assert.equal(rv, undefined);
});

test('CLASSES names the triage tags an operator alerts on', () => {
  assert.deepEqual([...CLASSES].sort(), ['attack', 'integrity', 'misconfig']);
});

console.log(`\n[refuse-alert] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
