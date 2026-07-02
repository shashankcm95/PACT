// PACT v0 -- lib/arm-flags.js  (plans/28 P5-W1: the single-arming-source + asymmetric flag-parse leaf)
//
// The floor-leaf home for arm-flag parsing (NS-11: lib/ imports no upper PACT layer; the env READS stay
// in the consumer process -- broker-sign.js -- so values remain host-untamperable per the root-owned
// wrapper model; only the PARSE lives here).
//
//   * parseEnabledFlag -- the STRICT enable parse, HOISTED VERBATIM from identity/request-auth.js
//     (plans/28 charter correction 1: a PACT-internal reuse, NOT a toolkit port -- the toolkit's strict
//     parse is a different, WIDER vocabulary; PACT deliberately accepts only '1'/'0').
//   * isDeploySignalSet -- the LENIENT deployed-signal predicate (the asymmetric other half, borrowed
//     SHAPE from the toolkit's isDeployFlagSet): an unrecognized token (an operator typo like 'ture')
//     reads as SET => the caller fails CLOSED. FORWARD-CONTRACT export for P5-W2 armingCoherence (the
//     DI-injected sibling-arm predicate); UNCONSUMED by any W1 decision path -- dormant, gates nothing.
//   * assessEnableFlag -- observability for an ENABLE-class flag (deliberately NO deploySignal field:
//     an enable flag must never be gated on the lenient semantics -- the VERIFY-hacker fold): a
//     present-but-strict-invalid token emits a refuse-alert (class 'misconfig') so the silent
//     falls-to-default surprise is operator-visible. It NEVER gates and NEVER throws.
//
// NS-9: this leaf is parsing + observability. It arms nothing, narrows nothing, hardens nothing.

'use strict';

const { refuseAlert } = require('./refuse-alert');

// Strict flag parse: ONLY the literal '1' (after an ASCII-space/tab trim) enables; ONLY '0' disables;
// ANY other value (incl. 'true'/'false'/'2'/'') returns null -> the caller falls to the default. NEVER
// !!env -- '0' / 'false' / '  ' are all truthy strings, which would silently re-open the blind oracle.
function parseEnabledFlag(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/^[ \t]+|[ \t]+$/g, '');
  if (t === '1') return true;
  if (t === '0') return false;
  return null;
}

// Lenient deployed-signal parse (asymmetric to parseEnabledFlag, per the security.md flag rule): deciding
// "this box is DEPLOYED and must fail closed" needs only a non-falsey token -- an operator typo ('ture')
// is INTENT TO ARM and must refuse, never silently fall through to the unarmed path. ASCII-space/tab trim
// ONLY (deliberate divergence from the toolkit's Unicode .trim(): a Unicode-whitespace-padded '0' does NOT
// collapse to an explicit-falsey token -- it stays unrecognized and reads SET => fail closed).
function isDeploySignalSet(raw) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return false;
  const t = raw.replace(/^[ \t]+|[ \t]+$/g, '').toLowerCase();
  if (t === '') return false;                                          // unset
  if (t === '0' || t === 'false' || t === 'no' || t === 'off') return false; // explicit falsey
  return true;                                                         // truthy OR a typo => fail closed
}

/**
 * Assess an ENABLE-class arm flag ('1'/'0' vocabulary) for the consumer that reads it: the strict parse
 * plus a misconfig alert when a token is PRESENT but strict-invalid (e.g. 'false', 'ture') -- the case
 * where the flag silently falls to the caller's default, which on a persona-set box flips ON. Pure
 * observability: the alert never gates (the caller's decision comes from parseEnabledFlag alone), never
 * echoes the raw token (a future flag's value could be sensitive), and never throws (refuseAlert's
 * contract). Deliberately returns NO deploySignal field: an enable flag must never be read through the
 * lenient deployed-signal semantics.
 * @param {string} flagName  the env var name (carried in the alert; never the value).
 * @param {*} raw  the raw env value.
 * @returns {{enabled: boolean|null, misconfig: boolean}}
 */
function assessEnableFlag(flagName, raw) {
  const enabled = parseEnabledFlag(raw);
  const present = typeof raw === 'string' && raw.replace(/^[ \t]+|[ \t]+$/g, '') !== '';
  const misconfig = present && enabled === null;
  if (misconfig) {
    // guarded coercion (VALIDATE-hacker fold): String(flagName) evaluates in THIS frame, outside
    // refuseAlert's try -- a throwing toString would break the never-throws contract for a future
    // (W2) caller. Today's only call site passes a literal, but the contract must not be caller-fragile.
    let flag;
    try { flag = String(flagName); } catch { flag = 'unstringifiable-flag'; }
    refuseAlert('arm-flag-misconfig', { class: 'misconfig', flag });
  }
  return { enabled, misconfig };
}

module.exports = { parseEnabledFlag, isDeploySignalSet, assessEnableFlag };
