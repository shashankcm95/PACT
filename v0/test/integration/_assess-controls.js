'use strict';

// PACT v0 -- shared proof-board verdict helper (lifted from edge-provenance-proof.test.js at plans/42 W3, fold F1).
//
// The machine-checkable, FAIL-CLOSED verdict for a proof board's in-process controls. Parameterized on the
// pass-field NAME so each board reads its own verdict key (edge-provenance -> inProcessReadControlsPassed;
// sigma-root-provenance -> inProcessProvenanceControlsPassed) -- and NEVER emits a `hardened`/`provenanceReal`
// field (NS-9): it reports which IN-PROCESS controls passed, NEVER that a cross-uid HARDEN or provenance was
// established (mirrors custody-verify.js hostObservableChecksPassed / registration-provenance.js's deliberate
// omission of sigmaRootWorldAnchored).
//
// EXTRACTED (fold F1 -- the arc's own extract-don't-fork precedent: the broker-core.js key-vet lift at W1a and the
// _world.js fixture lift at plans/38 W4). A copy-pasted ~20-line fail-closed helper WILL diverge (the plans/42 W1 F1
// lesson, one layer up); this is the ONE hardened copy, consumed by BOTH proof boards. Not a `*.test.js` file -> the
// runner does not auto-run it; eslint DOES lint it -- keep ASCII-clean.
//
// FAIL-CLOSED (VERIFY-hacker H2 from plans/38; the security.md "typo fails CLOSED" + arm-flags.js asymmetric-parse):
// a status not in {PASS,FAIL,NOTE} counts as FAIL AND surfaces in residuals (never swallowed); an empty/null checks
// array is NOT a pass (never a vacuous [].every()===true); a HOLEY array (new Array(n) / sparse) is DENSIFIED so its
// holes fail-closed too (plans/42 W3 VALIDATE-hacker M1 -- .map/.every SKIP holes, so a length>0 hole array would
// otherwise pass vacuously); a null element / non-string / THROWING / two-face status getter normalizes to a
// __MISSING__ sentinel = fail-closed, read exactly ONCE, NEVER throws (W3 VALIDATE-hacker L1/L2).

const CONTROL_STATUSES = new Set(['PASS', 'FAIL', 'NOTE']);

/**
 * @param {object[]} checks  [{ id, status: 'PASS'|'FAIL'|'NOTE', detail }]. Deploy-only legs are NOTE (never PASS).
 * @param {string} passField the verdict key name (e.g. 'inProcessReadControlsPassed'). NEVER 'hardened' (NS-9).
 * @returns {object} { [passField]:boolean, checks:object[], residuals:string[] } -- NO `hardened` field. `checks` is
 *   the getter-free NORMALIZED snapshot (not the raw input), always an array on every path.
 */
function assessControls(checks, passField) {
  if (!Array.isArray(checks) || checks.length === 0) {
    // checks MUST be an array on every return path (its own `object[]` contract); a truthy non-array (a string /
    // number / object) must NOT leak through `checks || []` (CodeRabbit) -- normalize to [].
    return { [passField]: false, checks: Array.isArray(checks) ? checks : [], residuals: ['no checks recorded -- vacuous'] };
  }
  // DENSIFY holes -> undefined (plans/42 W3 VALIDATE-hacker M1): a HOLEY array of length>0 would otherwise pass
  // VACUOUSLY -- .map/.every/.filter all SKIP holes, defeating the "empty is not a pass" guarantee above. Array.from
  // materializes every index, so a hole becomes an `undefined` element that normalizes to __MISSING__ = fail-closed.
  const rows = Array.from(checks).map((c) => {
    // read the status EXACTLY ONCE into a local INSIDE a try (VALIDATE-hacker L1/L2 + security.md C1): a throwing /
    // two-face getter on .status/.id/.detail must normalize to a fail-closed row, NEVER escape (the "never throws"
    // contract) and NEVER be read twice. A null element / non-string status -> the __MISSING__ sentinel.
    try {
      const s = c && c.status;
      return {
        id: (c && c.id) || '<no-id>',
        status: (typeof s === 'string') ? s : '__MISSING__',
        detail: (c && c.detail) || '',
      };
    } catch { return { id: '<unreadable>', status: '__MISSING__', detail: '' }; }
  });
  const passed = rows.every((r) => r.status === 'PASS' || r.status === 'NOTE');
  // residuals = EVERY non-PASS leg (NOTE deploy-only, a real FAIL, any unknown status) so the audit trail NAMES a
  // FAIL, never just counts it (CodeRabbit: a FAIL must not disappear from the fail-closed report).
  const residuals = rows
    .filter((r) => r.status !== 'PASS')
    .map((r) => r.id + ': ' + (CONTROL_STATUSES.has(r.status) ? r.detail : 'UNKNOWN-STATUS(' + r.status + ') -- fail-closed'));
  // return the SNAPSHOT rows as `checks`, NOT the original input (CodeRabbit): the original may carry a hostile
  // getter that a downstream `report.checks[*].status` access would RE-RUN, breaking the read-exactly-once contract.
  // The rows are getter-free plain {id, status, detail} -- the evaluated (fail-closed-normalized) view.
  return { [passField]: passed, checks: rows, residuals };
}

module.exports = { assessControls, CONTROL_STATUSES };
