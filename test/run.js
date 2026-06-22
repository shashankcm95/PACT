#!/usr/bin/env node
'use strict';

// PACT test runner (plans/06). Pure-node, zero-dependency. Discovers every v0/test/**/*.test.js, runs each
// in a child `node` (process isolation — each file calls process.exit() + installs its own exit-cleanup
// handlers, so they cannot share a process), captures + ECHOES its output, and PARSES its self-reported
// `[name] N passed, M failed` summary line.
//
// VACUOUS-PASS GUARDS (VERIFY board, the honesty CRITICAL): a green here must mean tests actually RAN, not
// merely "nothing failed". A file passes ONLY if: exit==0 AND a summary line is present AND failed==0 AND
// executed (passed+failed) > 0. Plus: zero test FILES discovered, or zero tests executed overall, is a LOUD
// red — never a silent green having run nothing. (Trusting exit-code + a file-COUNT alone would miss a file
// whose test() is never called: it exits 0 with passed=0,failed=0.)
//
// TRUST BOUNDARY (VALIDATE, honesty): the runner counts executed tests from each child's FIRST-PARTY
// `[name] N passed, M failed` self-report — it does NOT independently count assertions. The guard catches
// the realistic accidental-vacuity case (zero executed) but not a forged/buggy NON-zero summary; that is
// bounded by every test file sharing the same trusted `test()` harness (pass/fail incremented from real
// try/catch outcomes, never a literal). The guard itself is regression-tested by run-guard.test.js.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// TEST_DIR is overridable via PACT_TEST_DIR so the guards themselves are regression-testable
// (run-guard.test.js points it at fixture dirs). Defaults to the real suite.
const TEST_DIR = process.env.PACT_TEST_DIR ? path.resolve(process.env.PACT_TEST_DIR) : path.join(ROOT, 'v0', 'test');
const SUMMARY_RE = /\[[^\]]+\]\s+(\d+)\s+passed,\s+(\d+)\s+failed/g;

function findTests(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findTests(fp));
    else if (e.name.endsWith('.test.js')) out.push(fp);
  }
  return out;
}

function lastSummary(output) {
  let m; let last = null;
  SUMMARY_RE.lastIndex = 0;
  while ((m = SUMMARY_RE.exec(output)) !== null) last = m;
  return last ? { passed: Number(last[1]), failed: Number(last[2]) } : null;
}

function main() {
  const files = findTests(TEST_DIR).sort();
  // GUARD 1: zero test files discovered = a cwd / path / rename regression -> LOUD red, never silent green.
  if (files.length === 0) {
    console.error('[run] FATAL: zero test files discovered under ' + TEST_DIR + ' (vacuous-pass guard)');
    process.exit(2);
  }

  let totalPassed = 0; let totalFailed = 0; let badFiles = 0;
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (r.stdout) process.stdout.write(r.stdout);   // echo through so CI logs show each file's ok/FAIL detail
    if (r.stderr) process.stderr.write(r.stderr);
    // a spawn-level error (ENOBUFS on output overflow, ENOENT, …) -> a clear message, not a confusing
    // "no summary" (the summary lives at the END of output, so a truncated child loses it).
    if (r.error) console.error(`[run] ${rel}: spawn error (${r.error.code || r.error.message})`);
    const code = r.status === null ? 1 : r.status;  // null = killed by signal -> treat as failure
    const sum = lastSummary((r.stdout || '') + (r.stderr || ''));

    if (!sum) {
      console.error(`[run] FAIL ${rel}: no "[name] N passed, M failed" summary (crashed before reporting?)`);
      badFiles++; continue;
    }
    const executed = sum.passed + sum.failed;
    if (code !== 0) { console.error(`[run] FAIL ${rel}: nonzero exit (${code})`); badFiles++; }
    else if (executed === 0) { console.error(`[run] FAIL ${rel}: ZERO tests executed (per-file vacuous-pass guard)`); badFiles++; }
    else if (sum.failed > 0) { console.error(`[run] FAIL ${rel}: ${sum.failed} failed`); badFiles++; }
    totalPassed += sum.passed; totalFailed += sum.failed;
  }

  const totalExec = totalPassed + totalFailed;
  console.log(`\n[run] ${files.length} files · ${totalPassed} passed · ${totalFailed} failed · ${totalExec} executed`);
  // GUARD 2: zero tests executed across ALL files = files ran but asserted nothing -> red.
  if (totalExec === 0) {
    console.error('[run] FATAL: zero tests executed across all files (vacuous-pass guard)');
    process.exit(2);
  }
  process.exit(badFiles > 0 || totalFailed > 0 ? 1 : 0);
}

main();
