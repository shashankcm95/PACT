// PACT v0 -- trust/arming-coherence.js  (plans/28 P5-W2: the both-or-neither arm preflight)
//
// The reusable both-or-neither coordination PRIMITIVE for the eventual admission arm + the Phase-6 signer arm.
// BOTH are FORWARD-CONTRACTS today: neither flag exists, neither gates anything. This module is DORMANT --
// it arms nothing, narrows nothing, hardens nothing (NS-9). The darkness witness
// (test/integration/arming-darkness-witness.test.js) proves the real gates (mayGate, convert.actionable) stay
// dark even when this reports fully armed.
//
// FULLY DI (plans/28 charter correction #4; VERIFY-confirmed by both the architect + hacker lenses): the
// toolkit's armingCoherence reads ONE real deployed flag (LOOM_WORLD_ANCHOR_ARM) because it OWNS one and has
// two live consumers that must not split-brain. PACT owns NO live arm flag (its world-anchored signer is Phase 6,
// DARK/unbuilt) and has ZERO consumers -- so it reads NO env var; BOTH arms are injected by the (future) caller.
// A new PACT_* admission env var now would be a consumed-by-nothing runtime read inviting a fail-open confusion,
// worse than W1's clearly-labeled forward-contract predicate. Reading zero flags is the honest, stricter shape.
//
// LAYERING (NS-11): trust/ may import lib/ (the trust ban is ['grounding'] only); this imports ONLY
// ../lib/refuse-alert and nothing upward -- no cycle. It does NOT import arm-flags.js: W2 has a SINGLE alert
// channel (arming-incoherent); the toolkit's typo/misconfig detector + its F2 suppression do not apply here
// because this module reads no env flag.

'use strict';

const { refuseAlert } = require('../lib/refuse-alert');

/**
 * armingCoherence({admissionArmed, signingArmed}) -> { admissionArmed, coherent, reason }. The PURE
 * both-or-neither preflight (no I/O, no emit -- side-effect-free + trivially testable). BOTH params are
 * strict-coerced (=== true) BEFORE any derivation: a fully-DI port must defend BOTH inputs, not just the
 * sibling (VERIFY HIGH -- a truthy non-boolean must never fake an armed/coherent state).
 *
 * Semantics (both-or-neither): admissionArmed(out) = admission AND signing; coherent = (admission === signing).
 * The two XOR directions carry DISTINCT reason strings so a caller can emit observably:
 *   - admission-armed-without-signing : admission on, signing off -> fail-closed dark.
 *   - signing-armed-without-admission : signing on, admission off.
 * The 'legit sign-then-admit staging' asymmetry these strings carry in the toolkit (a B1-armed box accumulates
 * real signed cross-uid edges) is the intended FUTURE contract, NOT a live PACT workflow: PACT has no signer
 * producing edges to stage toward, so today BOTH XOR directions are forward-contract-only and dark (NS-9).
 *
 * @param {{admissionArmed?:*, signingArmed?:*}} [arms]
 * @returns {{admissionArmed:boolean, coherent:boolean, reason:(string|null)}}
 */
function armingCoherence({ admissionArmed, signingArmed } = {}) {
  const admission = admissionArmed === true;   // strict-coerce BOTH (VERIFY HIGH) -- derive from these only
  const signing = signingArmed === true;
  let reason = null;
  if (admission && !signing) reason = 'admission-armed-without-signing';
  else if (!admission && signing) reason = 'signing-armed-without-admission';
  return { admissionArmed: admission && signing, coherent: admission === signing, reason };
}

/**
 * armingDecision(input) -> the SAME struct as armingCoherence, but compute-THEN-EMIT: the intended consumer
 * entry point. A live gater MUST call armingDecision (never raw armingCoherence) so a `coherent:false` is never
 * a SILENT fail-closed (security.md: a fail-closed decision must be OBSERVABLE; VERIFY-hacker MEDIUM). Both XOR
 * states emit (both are `!coherent`, both operator-relevant). The alert is CAUSE-keyed, never reason-keyed:
 * refuseAlert writes `reason` LAST/positional, so the fixed token 'arming-incoherent' is authoritative and the
 * distinct XOR enum rides in `cause` (a `reason` detail key would be clobbered -- the egress-alert lesson).
 * @param {{admissionArmed?:*, signingArmed?:*}} [input]
 * @returns {{admissionArmed:boolean, coherent:boolean, reason:(string|null)}}
 */
function armingDecision(input = {}) {
  const coh = armingCoherence(input);
  if (!coh.coherent) refuseAlert('arming-incoherent', { class: 'misconfig', cause: coh.reason });
  return coh;
}

module.exports = { armingCoherence, armingDecision };
