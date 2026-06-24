#!/usr/bin/env node
'use strict';

// PACT layering tripwire (plans/06 §6, architect MEDIUM). The one-way DAG lib -> atms -> trust -> grounding
// (with scope / identity / frame / independence as foundational layers) was guarded by ZERO directional
// tests — the grounding "SHADOW" grep asserts the no-gating property, NOT import direction. This asserts
// the load-bearing REVERSE-EDGE bans: lib is the floor; atms never reaches trust/grounding; trust never
// reaches grounding; grounding is a sink (no lower layer imports it). A reverse edge = a layering violation.
// (A minimal directional guard — NOT the full K12 layer-boundary port; YAGNI for 35 files.)

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const SRC = path.join(__dirname, '..', '..', 'src');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

function requiresOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = []; const re = /require\(['"]([^'"]+)['"]\)/g; let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}
function filesIn(layer) {
  const d = path.join(SRC, layer);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f));
}
// files in `layer` that import any of `bannedDirs` as a sibling layer. Matches `../<dir>/...`, a nested
// `../../<dir>/...`, AND a bare `../<dir>` (a dir-index import, no trailing slash) — a narrow startsWith
// '../<dir>/' would miss the latter two (CodeRabbit #15).
function offenders(layer, bannedDirs) {
  const bad = [];
  for (const f of filesIn(layer)) {
    for (const r of requiresOf(f)) {
      for (const b of bannedDirs) {
        // ^(../)+ <dir> (/ | end) — `(?:/|$)` stops `../trustworthy` from matching ban `trust`.
        if (new RegExp('^(?:\\.\\./)+' + b + '(?:/|$)').test(r)) bad.push(path.basename(f) + ' -> ' + r);
      }
    }
  }
  return bad;
}

// PRECONDITION (VALIDATE, convergent HIGH): the directional tests below assert "no reverse edges" via
// deepEqual(offenders, []). If a layer dir is renamed/emptied, filesIn() returns [] and offenders() returns
// [] and the assertion passes VACUOUSLY — the tripwire silently disarms exactly when the dir it guards
// moves (the same "absence reads as success" class the runner guards). So first prove every layer is real.
const DAG_LAYERS = ['lib', 'atms', 'trust', 'grounding', 'identity', 'frame', 'scope', 'independence', 'audit'];
test('precondition: every layer dir exists + is non-empty (else the directional tripwire disarms silently)', () => {
  for (const L of DAG_LAYERS) {
    assert.ok(filesIn(L).length > 0, 'layer dir missing/empty: ' + L + ' — rename regression; the directional tests would pass vacuously');
  }
});

test('lib/ is the floor — imports no upper PACT layer (incl. audit — the §7 reverse-edge ban, HIGH-2)', () => {
  const bad = offenders('lib', ['atms', 'trust', 'grounding', 'identity', 'frame', 'scope', 'independence', 'audit']);
  assert.deepEqual(bad, [], 'lib/ reverse edge(s): ' + bad.join(', '));
});

test('audit/ is a producer leaf — imports ONLY the floor (lib), no sibling upper layer', () => {
  const bad = offenders('audit', ['atms', 'trust', 'grounding', 'identity', 'frame', 'scope', 'independence']);
  assert.deepEqual(bad, [], 'audit/ cross-layer edge(s): ' + bad.join(', '));
});

test('atms/ never imports trust or grounding', () => {
  const bad = offenders('atms', ['trust', 'grounding']);
  assert.deepEqual(bad, [], 'atms/ reverse edge(s): ' + bad.join(', '));
});

test('trust/ never imports grounding', () => {
  const bad = offenders('trust', ['grounding']);
  assert.deepEqual(bad, [], 'trust/ reverse edge(s): ' + bad.join(', '));
});

test('identity/ never imports trust or grounding (it sits BELOW trust — trust/read-gate imports identity/registry)', () => {
  // closes the uncaught reverse-edge gap surfaced by the U1 stake-anchor build (plans/20): a trust-layer
  // read-fold belongs in trust/, not identity/. identity is foundational/below trust, so identity->trust
  // is a cycle (trust->identity already exists).
  const bad = offenders('identity', ['trust', 'grounding']);
  assert.deepEqual(bad, [], 'identity/ reverse edge(s): ' + bad.join(', '));
});

test('grounding/ is a sink — no lower layer imports it', () => {
  const bad = [];
  for (const layer of ['lib', 'atms', 'trust', 'identity', 'frame', 'scope', 'independence', 'audit']) {
    bad.push(...offenders(layer, ['grounding']));
  }
  assert.deepEqual(bad, [], 'grounding imported by a lower layer: ' + bad.join(', '));
});

console.log(`\n[layering] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
