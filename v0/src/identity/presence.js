// PACT v0 — identity/presence.js  (spec §1.2/§1.3; RATIFIED 2026-06-21)
//
// The identity-cap parameters. DEFINED here, ENFORCED nowhere in v0 (caps are P4; v0 has two
// roots, no Sybil surface — spec §10.5). Carried so P4 is a call-site wiring, not an interface
// break (Open/Closed). effective_presence has the spec-shaped signature (human_uid, log).

'use strict';

// RATIFIED v0 default (spec §1.2). A NAMED, bounded threshold — never an unbound constant.
const MAX_DELEGATION_DEPTH = 3;

/**
 * effective_presence(human_uid, log): the count of distinct network-facing SIGNING identities in
 * the delegation closure of human_uid, computed over the (per-receiver) LOG (spec §1.3). A persona
 * that never signs a network-facing frame costs 0. RECEIVER-RELATIVE: the log is one receiver's
 * store (INV-2/INV-10) — a global cap (if ever needed) is a P4 reconciliation, not a global log.
 *
 * Decidable, pure, replayable. UNWIRED in v0 (no gate consumes it).
 *
 * @param {string} humanUid
 * @param {Array<{parent_human_uid?:string, src_persona_did?:string}>} log  per-receiver records
 * @returns {number}
 */
function effectivePresence(humanUid, log) {
  if (typeof humanUid !== 'string' || !Array.isArray(log)) return 0;
  const personas = new Set();
  for (const rec of log) {
    if (rec && rec.parent_human_uid === humanUid && typeof rec.src_persona_did === 'string') {
      personas.add(rec.src_persona_did);
    }
  }
  return personas.size;
}

module.exports = { MAX_DELEGATION_DEPTH, effectivePresence };
