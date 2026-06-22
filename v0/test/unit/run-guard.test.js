#!/usr/bin/env node
'use strict';

// Regression test for the test RUNNER's own vacuous-pass guards (VALIDATE, honesty). The VERIFY board's
// CRITICAL was "a file that runs zero tests must not pass green"; PROBE 2 demonstrated the fix manually.
// This makes it PERMANENT: it invokes the REAL runner (test/run.js) against fixture dirs via PACT_TEST_DIR
// and asserts its exit code, so a future edit to run.js that silently breaks a guard goes RED here.
//
// No recursion risk: the inner runner reads PACT_TEST_DIR -> the temp fixture dir (NOT v0/test), so it runs
// only the fixtures, never this file again.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');

const RUNNER = path.join(__dirname, '..', '..', '..', 'test', 'run.js');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// run the REAL runner against a fixture dir (filename -> body); return its exit status.
function runAgainst(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-runguard-'));
  try {
    for (const name of Object.keys(files)) fs.writeFileSync(path.join(dir, name), files[name]);
    const r = spawnSync(process.execPath, [RUNNER], { encoding: 'utf8', env: { ...process.env, PACT_TEST_DIR: dir } });
    return r.status;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const OK = "console.log('[ok] 2 passed, 0 failed'); process.exit(0);\n";
const VACUOUS = "console.log('[vac] 0 passed, 0 failed'); process.exit(0);\n";
const FAILING = "console.log('[bad] 1 passed, 1 failed'); process.exit(1);\n";
const NO_SUMMARY = "console.log('ran nothing, printed no summary'); process.exit(0);\n";

test('a healthy fixture (N>0 passed, 0 failed, exit 0) -> runner PASSES (exit 0)', () => {
  assert.equal(runAgainst({ 'a.test.js': OK }), 0);
});
test('a ZERO-test file (0 passed, 0 failed, exit 0) -> runner FAILS (the per-file vacuous-pass guard)', () => {
  assert.notEqual(runAgainst({ 'a.test.js': VACUOUS }), 0);
});
test('a failing fixture (exit 1) -> runner FAILS', () => {
  assert.notEqual(runAgainst({ 'a.test.js': FAILING }), 0);
});
test('a file with NO summary line -> runner FAILS (crashed-before-report guard)', () => {
  assert.notEqual(runAgainst({ 'a.test.js': NO_SUMMARY }), 0);
});
test('zero *.test.js discovered -> runner FAILS with exit 2 (the file-count guard)', () => {
  assert.equal(runAgainst({ 'notatest.js': OK }), 2); // a .js that is NOT *.test.js -> findTests skips it
});
test('one healthy + one vacuous -> runner FAILS (a single vacuous file taints the run)', () => {
  assert.notEqual(runAgainst({ 'a.test.js': OK, 'b.test.js': VACUOUS }), 0);
});

console.log(`\n[run-guard] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
