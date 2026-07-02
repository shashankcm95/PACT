#!/usr/bin/env node
'use strict';

// PACT v0 -- lib/arm-flags.js unit tests (plans/28 P5-W1: the single-arming-source + asymmetric flag-parse leaf).
//
// Contract under test:
//   * parseEnabledFlag -- STRICT enable parse, HOISTED VERBATIM from identity/request-auth.js (charter
//     correction 1: a PACT-internal reuse, not a toolkit port). Only '1'/'0' (ASCII space/tab trim); else null.
//   * isDeploySignalSet -- the LENIENT deployed-signal predicate (asymmetric per security.md: an operator
//     typo fails CLOSED). FORWARD-CONTRACT export for P5-W2 armingCoherence; UNCONSUMED by any W1 decision.
//   * assessEnableFlag -- the observability pair for an ENABLE-class flag: {enabled, misconfig}; a
//     present-but-strict-invalid token emits a refuse-alert (class 'misconfig') and NEVER gates.
//   * The TYPO/GARBAGE FUZZ is mandatory (the #430 lesson: a valid-token-only sweep is blind to exactly
//     the typo-fails-OPEN bug the lenient predicate exists to prevent).

const assert = require('node:assert/strict');
const AF = require('../../src/lib/arm-flags');
const { TOKEN } = require('../../src/lib/refuse-alert');

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
function parseAlert(out) { return JSON.parse(out.slice(out.indexOf('{'))); }

// =================== parseEnabledFlag (hoist-identical to the former request-auth.js private) ===================

test('parseEnabledFlag: "1" -> true; "0" -> false (the only valid tokens)', () => {
  assert.equal(AF.parseEnabledFlag('1'), true);
  assert.equal(AF.parseEnabledFlag('0'), false);
});
test('parseEnabledFlag: ASCII space/tab trim only ("  1  ", "\\t0\\t")', () => {
  assert.equal(AF.parseEnabledFlag('  1  '), true);
  assert.equal(AF.parseEnabledFlag('\t0\t'), false);
});
test('parseEnabledFlag: everything else -> null (falls to the caller default; NEVER !!env)', () => {
  for (const bad of ['true', 'false', '2', '', '  ', 'on', 'yes', '01', '1x']) {
    assert.equal(AF.parseEnabledFlag(bad), null, JSON.stringify(bad) + ' must be null');
  }
});
test('parseEnabledFlag: non-string (undefined/null/number/boolean) -> null', () => {
  for (const bad of [undefined, null, 1, 0, true, false, {}]) {
    assert.equal(AF.parseEnabledFlag(bad), null);
  }
});
test('parseEnabledFlag: Unicode-whitespace padding is NOT trimmed (ASCII discipline) -> null', () => {
  assert.equal(AF.parseEnabledFlag('1\u00A0'), null, 'NBSP-padded "1" is not a valid enable token');
  assert.equal(AF.parseEnabledFlag('\u20090'), null, 'thin-space-padded "0" is not a valid disable token');
});

// =================== isDeploySignalSet (lenient; typo fails CLOSED; W2 forward contract) ===================

test('isDeploySignalSet: boolean passthrough', () => {
  assert.equal(AF.isDeploySignalSet(true), true);
  assert.equal(AF.isDeploySignalSet(false), false);
});
test('isDeploySignalSet: unset/empty/non-string -> false (not deployed)', () => {
  for (const unset of ['', '   ', '\t', undefined, null, 0, 1, {}]) {
    assert.equal(AF.isDeploySignalSet(unset), false, JSON.stringify(String(unset)) + ' reads unset');
  }
});
test('isDeploySignalSet: explicit falsey tokens -> false (case-insensitive, ASCII-trimmed)', () => {
  for (const off of ['0', 'false', 'no', 'off', 'FALSE', 'No', ' off ', '\t0\t']) {
    assert.equal(AF.isDeploySignalSet(off), false, JSON.stringify(off) + ' is explicit-falsey');
  }
});
test('isDeploySignalSet: valid truthy tokens -> true', () => {
  for (const on of ['1', 'true', 'yes', 'on', 'TRUE']) {
    assert.equal(AF.isDeploySignalSet(on), true, JSON.stringify(on) + ' is truthy');
  }
});
test('isDeploySignalSet: TYPO/GARBAGE FUZZ -> ALL true (intent to arm => fail CLOSED; the #430 class)', () => {
  const garbage = ['ture', 'enabled', '0x1', '-1', 'yes please', '[object Object]', 'tru', 'onn', '00', 'falsee', 'nope', 'of'];
  for (const g of garbage) {
    assert.equal(AF.isDeploySignalSet(g), true, JSON.stringify(g) + ' (garbage) must read as SET => fail closed');
  }
});
test('isDeploySignalSet: Unicode-whitespace-padded falsey token fails CLOSED (the ASCII-trim divergence from the toolkit .trim() is LOAD-BEARING)', () => {
  // Deliberate divergence from toolkit host-claude-guard.js isDeployFlagSet (which .trim()s Unicode):
  // PACT trims ASCII space/tab ONLY, so an NBSP-padded falsey token does NOT collapse to '0'/'false' --
  // it stays an unrecognized token and reads as SET (fail CLOSED). A future "fix the trim to match the
  // toolkit" refactor flips this posture fail-OPEN; this named test is the tripwire.
  assert.equal(AF.isDeploySignalSet('0\u00A0'), true, 'NBSP-padded "0" must fail CLOSED');
  assert.equal(AF.isDeploySignalSet('false\u2009'), true, 'thin-space-padded "false" must fail CLOSED');
  // and the parallel proof the trim is ASCII-SCOPED, not absent:
  assert.equal(AF.isDeploySignalSet(' 0 '), false, 'ASCII-space-padded "0" DOES trim => explicit-falsey');
});

// =================== assessEnableFlag (observability pair; never gates, never throws) ===================

test('assessEnableFlag: valid tokens -> no misconfig, NO alert', () => {
  const out = capture(() => {
    assert.deepEqual(AF.assessEnableFlag('X_FLAG', '1'), { enabled: true, misconfig: false });
    assert.deepEqual(AF.assessEnableFlag('X_FLAG', '0'), { enabled: false, misconfig: false });
  });
  assert.equal(out, '', 'no alert for a valid token');
});
test('assessEnableFlag: absent/empty/whitespace-only -> enabled null, NOT a misconfig (unset is legal), NO alert', () => {
  const out = capture(() => {
    for (const unset of [undefined, null, '', '   ', '\t']) {
      assert.deepEqual(AF.assessEnableFlag('X_FLAG', unset), { enabled: null, misconfig: false });
    }
  });
  assert.equal(out, '', 'no alert for an unset flag');
});
test('assessEnableFlag: present-but-invalid token ("ture") -> misconfig + a structured misconfig alert', () => {
  let res;
  const out = capture(() => { res = AF.assessEnableFlag('PACT_BROKER_REQUIRE_FRAME', 'ture'); });
  assert.deepEqual(res, { enabled: null, misconfig: true });
  assert.ok(out.startsWith(TOKEN + ' '), 'alert emitted with the [PACT-REFUSE-ALERT] token');
  // parse the JSON and assert STRUCTURED fields (a bare includes('misconfig') is vacuous -- it matches
  // both the class value and a substring of the reason; the architect-LOW named this trap).
  const rec = parseAlert(out);
  assert.equal(rec.class, 'misconfig');
  assert.equal(rec.reason, 'arm-flag-misconfig');
  assert.equal(rec.flag, 'PACT_BROKER_REQUIRE_FRAME');
});
test('assessEnableFlag: "false" IS a misconfig (present, strict-invalid) -- on a persona-set box the default flips ON; that surprise is what the alert exists for', () => {
  let res;
  const out = capture(() => { res = AF.assessEnableFlag('X_FLAG', 'false'); });
  assert.deepEqual(res, { enabled: null, misconfig: true });
  assert.equal(parseAlert(out).class, 'misconfig');
});
test('assessEnableFlag: the alert NEVER echoes the raw token (a future flag value could be sensitive)', () => {
  const out = capture(() => AF.assessEnableFlag('X_FLAG', 'secret-ish-value'));
  assert.ok(out.length > 0, 'alert emitted');
  assert.ok(!out.includes('secret-ish-value'), 'the raw token is NOT echoed');
  assert.equal(parseAlert(out).flag, 'X_FLAG', 'the flag NAME is carried');
});
test('assessEnableFlag: a hostile flagName cannot clobber the reason or split the line (JSON.stringify escapes)', () => {
  const out = capture(() => AF.assessEnableFlag('EVIL\n[PACT-REFUSE-ALERT] {"reason":"forged"}', 'garbage'));
  const lines = out.split('\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 1, 'exactly ONE alert line (the newline is escaped, never emitted raw)');
  assert.equal(parseAlert(out).reason, 'arm-flag-misconfig', 'positional reason survives');
});
test('assessEnableFlag: a throwing-toString flagName cannot break the never-throws contract (guarded coercion)', () => {
  let res; let out;
  assert.doesNotThrow(() => {
    out = capture(() => { res = AF.assessEnableFlag({ toString() { throw new Error('boom'); } }, 'ture'); });
  });
  assert.deepEqual(res, { enabled: null, misconfig: true });
  assert.equal(parseAlert(out).flag, 'unstringifiable-flag', 'the alert still emits, with the fallback name');
});
test('assessEnableFlag: never throws, never gates (returns the same struct with stderr broken)', () => {
  const orig = process.stderr.write;
  process.stderr.write = () => { throw new Error('stderr broken'); };
  try {
    let res;
    assert.doesNotThrow(() => { res = AF.assessEnableFlag('X_FLAG', 'ture'); });
    assert.deepEqual(res, { enabled: null, misconfig: true }, 'the decision struct is unaffected by a telemetry failure');
  } finally { process.stderr.write = orig; }
});

// =================== hoist-consistency (request-auth delegates; behavior identical) ===================

test('hoist-consistency: resolveRequireFrame still honors the strict parse through the delegated leaf', () => {
  const RA = require('../../src/identity/request-auth');
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: '1', brokerPersonaDid: undefined }), true);
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: '0', brokerPersonaDid: 'did:key:zP' }), false);
  assert.equal(RA.resolveRequireFrame({ requireFrameRaw: 'false', brokerPersonaDid: 'did:key:zP' }), true, 'garbage + persona -> default ON (fail-closed)');
});

console.log(`\n[arm-flags] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
