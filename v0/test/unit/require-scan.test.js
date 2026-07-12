#!/usr/bin/env node
'use strict';

// PACT test util — the static require-scan soundness guard (#94 / F19). Proves the guard is NON-VACUOUS: it fires
// RED on a computed require and stays quiet on literal requires / require.* property access / commented mentions.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hasDynamicRequire, assertOnlyLiteralRequires } = require('../_util/require-scan');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

// ====================== hasDynamicRequire (string-level) ======================

test('LITERAL requires (single + double quote, multiline, leading ws, embedded paren/escape) are NOT flagged', () => {
  assert.equal(hasDynamicRequire("const x = require('./a');"), false, "single-quote literal");
  assert.equal(hasDynamicRequire('const x = require("./a");'), false, 'double-quote literal');
  assert.equal(hasDynamicRequire('const x = require(\n  "./a"\n);'), false, 'multiline + leading ws literal');
  assert.equal(hasDynamicRequire("const { a } = require('./a'), b = require('./b');"), false, 'two literals');
  assert.equal(hasDynamicRequire("const x = require('./a(b)');"), false, 'embedded paren in the literal');
  assert.equal(hasDynamicRequire("const x = require('a\\'b');"), false, 'escaped quote in the literal');
  assert.equal(hasDynamicRequire('const x = require("a\'b");'), false, 'other-quote char in the literal');
});

test('COMPUTED require(expr) IS flagged (the evasion the witnesses could pass vacuously)', () => {
  assert.equal(hasDynamicRequire('const x = require(base + name);'), true, 'concatenation');
  assert.equal(hasDynamicRequire('const x = require(mod);'), true, 'bare variable');
  assert.equal(hasDynamicRequire('const x = require(`./${name}`);'), true, 'template literal');
  assert.equal(hasDynamicRequire('const x = require( paths[i] );'), true, 'indexed + inner ws');
  // the subtle one: a require whose arg STARTS with a literal but concatenates (the guard must check the WHOLE arg,
  // not just the first char) -- else a `require("./" + n)` evasion passes.
  assert.equal(hasDynamicRequire('const x = require("./" + n);'), true, 'literal-prefixed concatenation');
  assert.equal(hasDynamicRequire("const x = require('./mods/' + name + '.js');"), true, 'literal-wrapped concatenation');
});

test('require.* property access (main/resolve/cache) is NOT a require() CALL -> not flagged', () => {
  assert.equal(hasDynamicRequire('if (require.main === module) main();'), false, 'require.main');
  assert.equal(hasDynamicRequire('const p = require.resolve(x);'), false, 'require.resolve(x) — .resolve, not require(');
  assert.equal(hasDynamicRequire('const keys = Object.keys(require.cache);'), false, 'require.cache');
});

test('a require() inside a COMMENT or STRING does NOT trigger (context-aware scan)', () => {
  assert.equal(hasDynamicRequire("// const x = require(base + name);\nconst y = require('./a');"), false, 'line comment');
  assert.equal(hasDynamicRequire('/* require(dynamic) */ const y = require("./a");'), false, 'block comment');
  assert.equal(hasDynamicRequire("const s = 'require(' + evil; const y = require('./a');"), false, 'require( opening inside a string');
  assert.equal(hasDynamicRequire('const s = `require(${x})`; const y = require("./a");'), false, 'require() inside a template literal');
});

test('a `/*` inside a STRING does NOT pair with a later `*/` to hide a real dynamic require (CodeRabbit HIGH)', () => {
  // a quote-UNAWARE regex comment-strip would erase everything between the in-string `/*` and the later `*/`,
  // including the genuine computed require between them -> a false negative that reopens the F19 evasion.
  const src = ["const marker = '/* build note';", 'const mod = require(dynamicName);', "const end = 'trailer */';"].join('\n');
  assert.equal(hasDynamicRequire(src), true, 'the real dynamic require between the two strings IS detected');
  // inverse: a LITERAL require in the same shape is NOT flagged (no false positive from the string-embedded markers).
  const okSrc = ["const marker = '/* build note';", "const mod = require('./real');", "const end = 'trailer */';"].join('\n');
  assert.equal(hasDynamicRequire(okSrc), false, 'a literal require in the same shape is clean');
});

// ====================== assertOnlyLiteralRequires (file-level) ======================

test('assertOnlyLiteralRequires: passes on literal-only files, THROWS on a computed require', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pact-reqscan-'));
  try {
    const okFile = path.join(dir, 'ok.js');
    const badFile = path.join(dir, 'bad.js');
    fs.writeFileSync(okFile, "const a = require('./x');\nmodule.exports = { a };\n");
    fs.writeFileSync(badFile, 'const n = "x";\nconst a = require("./" + n);\n');
    assert.doesNotThrow(() => assertOnlyLiteralRequires([okFile]), 'literal-only file passes');
    assert.throws(() => assertOnlyLiteralRequires([okFile, badFile]), /computed require\(\) defeats the literal darkness scan/, 'a computed require throws');
    assert.throws(() => assertOnlyLiteralRequires([badFile]), /bad\.js/, 'the offending file is named');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n[require-scan] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
