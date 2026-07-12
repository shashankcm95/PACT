'use strict';

// PACT test util — static require-scan soundness guard (#94 / F19).
//
// The darkness witnesses prove a module is "wired to nothing" (or imported by an EXACT allowlist) with a LITERAL
// `require('...target...')` text scan. That scan is only COMPLETE if every require() in the scanned files has a
// string-literal argument: a computed `require(base + name)` is invisible to it, so the darkness claim would pass
// VACUOUSLY. This guard makes that completeness ASSERTED, not assumed — it FAILS LOUD the instant any scanned file
// gains a computed require().
//
// Chosen over the issue-suggested require.cache method: that method EXECUTES the modules it inspects, which
// unconditionally `process.exit()`s PACT's self-executing CLI entrypoints (broker-sign.js / sigma-root-broker.js
// run `main()` at require-time), and cannot enumerate an exact importer-set that INCLUDES such an unloadable
// harness (e.g. the sigma-root witness expects binding-request-auth <- sigma-root-broker). A static scan needs no
// execution, so it is safe over the whole tree. Today src has ZERO computed requires, so the text-scan witnesses
// are sound now; this guard keeps them sound.

const fs = require('fs');
const path = require('path');

const IDENT = /[A-Za-z0-9_$]/;

// skip a string/template literal starting at src[start] (a quote or backtick); return the index just past the
// closing delimiter, honoring `\` escapes. A backtick is treated as a plain string — a require() inside a `${...}`
// interpolation is NOT scanned (a rare, documented limitation, no worse than a plain text scan).
function skipStringLiteral(src, start) {
  const q = src[start];
  const n = src.length;
  let j = start + 1;
  while (j < n) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return n; // unterminated -> consume to EOF
}

// true iff `src` contains a require() CALL, IN CODE CONTEXT, whose argument is not exactly one string literal —
// i.e. a computed require (`require(v)`, `require(a + b)`, `require("./" + n)`) the literal darkness-scan cannot
// resolve. A single left-to-right pass tracks string / template / line- and block-comment state, so a require()
// inside a comment or string does NOT trigger and — crucially — a `/*` or quote embedded in a STRING cannot be
// mis-read as a comment boundary (a regex-based comment strip is quote-UNAWARE and can erase real code between a
// `/*`-in-a-string and a later `*/`, a false-negative that reopens the very evasion this guard closes). Regex
// literals are NOT tracked: a `/.../` containing "require(" is a rare FAIL-LOUD false positive, never a silent miss.
function hasDynamicRequire(src) {
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { i = skipStringLiteral(src, i); continue; }
    if (c === 'r' && src.startsWith('require', i) && (i === 0 || !IDENT.test(src[i - 1]))) {
      let j = i + 'require'.length;
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '(') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const arg = src[j];
        if (arg !== '"' && arg !== "'") return true;   // not a string-literal argument -> computed
        let k = skipStringLiteral(src, j);             // consume the literal
        while (k < n && /\s/.test(src[k])) k++;
        if (src[k] !== ')') return true;               // literal followed by + / , etc -> computed
        i = k + 1; continue;                           // a lone literal require -> keep scanning after it
      }
    }
    i++;
  }
  return false;
}

// throw (fail loud) if ANY file in `files` has a computed require(). Called by a darkness witness over its own
// scanned file set so the witness's dormancy claim carries its soundness proof.
function assertOnlyLiteralRequires(files) {
  const offenders = files.filter((f) => hasDynamicRequire(fs.readFileSync(f, 'utf8')));
  if (offenders.length) {
    throw new Error('a computed require() defeats the literal darkness scan in ' + offenders.length + ' file(s): ' +
      offenders.join(', ') + ' — a require(expr) is invisible to the literal-require witness. Make it a string ' +
      'literal, or extend the witness to resolve the dynamic import before trusting the dormancy claim.');
  }
}

// recursively collect every .js file under `dir` (the darkness-scan corpus). A shared walker so a witness without
// its own file-walk (e.g. the arming witness's inline closure) can feed the guard uniformly.
function allSrcJsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allSrcJsFiles(fp));
    else if (e.name.endsWith('.js')) out.push(fp);
  }
  return out;
}

module.exports = { hasDynamicRequire, assertOnlyLiteralRequires, allSrcJsFiles };
