// PACT v0 — lib/refuse-alert.js
//
// Out-of-band observability for fail-closed reject paths. BORROWED from the toolkit's
// kernel/egress/alert.js (emitEgressAlert) — reconciled at point-of-use (see TRANSFER-PROVENANCE.md):
// PACT's DENY is deliberately NO-ECHO-TO-CALLER (the anti-oracle rule — "an echo is an
// allowlist-probing oracle", caller-auth.js), so this is an OPERATOR-SIDE stderr signal the
// caller's RETURN VALUE never carries. It is PURE observability:
//   * it NEVER throws — a telemetry failure can never fail the gate (the emit is wrapped);
//   * it NEVER gates and NEVER changes a reject decision — it only makes a silent fail-closed
//     path debuggable (it NARROWS nothing and HARDENS nothing, per NS-9);
//   * the `reason` token is POSITIONAL/authoritative — `detail` is spread FIRST and `reason`
//     written LAST, so a `reason` key inside a hostile `detail` cannot clobber the real token
//     (the egress-alert lesson).
//
// The `class` tag triages an ATTACK (forged sig / #273 co-forge / tamper) from a MISCONFIG (a
// legit sender left unregistered, a trust-anchor rejecting every legitimate call) — the
// distinction that is invisible today and load-bearing the moment a gate arms.

'use strict';

const TOKEN = '[PACT-REFUSE-ALERT]';

// The known triage classes. A free-form class is tolerated; these are what an operator alerts on.
const CLASSES = Object.freeze(['attack', 'misconfig', 'integrity']);

/**
 * Emit a single-line structured operator-side reject signal. Out-of-band (stderr — never the
 * caller's return value); never throws; never gates.
 * @param {string} reason  the authoritative reason token (positional — un-clobberable by detail).
 * @param {{class?:string}} [detail]  extra structured context (a class + any operator-useful fields).
 */
function refuseAlert(reason, detail = {}) {
  try {
    const base = (detail && typeof detail === 'object' && !Array.isArray(detail)) ? detail : {};
    const rec = { ...base, reason: String(reason) }; // reason LAST — authoritative, un-clobberable
    process.stderr.write(TOKEN + ' ' + JSON.stringify(rec) + '\n');
  } catch {
    // the structured emit failed — a detail JSON.stringify rejects (a circular ref, a BigInt, a
    // throwing getter). (A Symbol reason is NOT this case: String() coerces it safely.) NEVER go
    // fully silent — silence-on-failure is exactly the gap this feature closes — so emit a fixed
    // degraded line. Wrapped again so telemetry NEVER throws (a logging failure can never fail the gate).
    try { process.stderr.write(TOKEN + ' {"reason":"emit-failed"}\n'); } catch { /* nothing left to do */ }
  }
}

module.exports = { refuseAlert, TOKEN, CLASSES };
