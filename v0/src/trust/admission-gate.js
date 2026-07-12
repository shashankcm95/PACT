// PACT v0 -- trust/admission-gate.js  (plans/55 W2a -- the DARK sigma_root armed admission gate, now keyed to the
// fail-closed arming MANIFEST)
//
// The ENFORCEMENT DECISION for W1's sigma_root verifier: WHEN ARMED, turns the advisory verifier's FAIL into a
// REJECT. It ships DARK -- import-dark (the admission-gate-darkness-witness proves no fold pulls it into the
// require graph) and arms nothing. It is the FIRST live CONSUMER of the Wave-1 arming manifest (plans/54):
// admission-gate reads its enable state from resolveArmedContext (ADR-0001 Dec 1/3) instead of the 2-signal
// armingDecision. This closes #82 (F7): a garbage admission token can no longer silently disarm to admit-all.
//
// THE FOUR-STATE DECISION (VERIFY board §6 CRITICAL -- a two-way `armed ? verify : admit-all` is the fail-open):
//   (1) ctx.armed                            -> ARMED: verify the root-signed sigma_root (unchanged from today);
//   (2) disarmedBaseline && !hadMisconfig    -> admit-all pass-through = byte-identical to today (CLEAN baseline);
//   (3) disarmedBaseline && hadMisconfig     -> REJECT (the #82 close: a garbage arm token is a DIRTY baseline);
//   (4) else (partial arm)                   -> REJECT (F9-narrow: an incoherent/partial arm fails closed).
// States (3)+(4) are the fail-closed else. ADR-Dec-3 all-or-none: admission arms ONLY when the whole 4-signal
// surface {admission,signing,anchoring,freshness} is coherently armed -- so a PARTIAL arm (was admit-all, F4-A)
// now REJECTS. NS-9: this NARROWS F9 (admission refuses an incoherent arm) but does not CLOSE it until
// anchoring/freshness/broker also route through the manifest (they still hold their fail-open defaults). Under no
// live arm the gate is the CLEAN baseline -> admit-all, byte-identical to today.
//
// TRUSTED INPUTS + C1 (VERIFY hacker, disclosed): the arm signals (`*Armed`) + `registry` are TRUSTED non-actor
// inputs; `grandfather` is a TRUSTED policy OVERRIDE on a SEPARATE `policy` arg (a crypto-BYPASSING callback must
// NEVER be forwardable from an attacker record). The `input` record fields (`personaDid`/`sigmaRoot`) are
// attacker-influenced. C1 is preserved on a TWO-PHASE structure: (a) the arm read is guarded + OWN-property-only
// (a polluted Object.prototype must not flip the gate armed; a throwing arm getter fails CLOSED, never disarms) and
// passes PLAIN values to the manifest; (e) the armed-path record read is a SEPARATE guarded try (a poisoned record
// getter REJECTS, never collapses the arm to admit).
//
// LAYERING (NS-11): trust/ may import lib/ + identity/. This imports arming-manifest (trust/),
// registration-provenance (identity/), refuse-alert (lib/) -- no upward cycle. It no longer imports
// arming-coherence: the 4-signal manifest supersedes the 2-signal armingDecision for this consumer.

'use strict';

const { resolveArmedContext } = require('./arming-manifest');
const { assessRegistrationFromRegistry, R3_VERIFIES } = require('../identity/registration-provenance');
const { refuseAlert } = require('../lib/refuse-alert');

/**
 * admissionDecision(input) -> { admit:boolean, armed:boolean, reason:string, provenance?:object }. PURE
 * (no state), fail-CLOSED when armed, and NEVER throws.
 *
 * NOTE on the returned `armed`: it means "the gate acted in ENFORCING / fail-closed mode" -- true for the
 * ARMED-verify path AND for every fail-closed REJECT (arm-read-failed / partial / garbage / armed-unverified).
 * It is NOT a mirror of the manifest's `ctx.armed`; only the CLEAN `disarmed-passthrough` returns `armed:false`.
 *
 * @param {{admissionArmed?:*, signingArmed?:*, anchoringArmed?:*, freshnessArmed?:*, registry?:object, personaDid?:string, sigmaRoot?:string}} input
 *   per-request: the 4 arm signals + the attacker-influenced record fields.
 * @param {{grandfather?:Function}} [policy]  the TRUSTED policy context (a SEPARATE arg -- a grandfather OVERRIDE must not be forwardable from an actor record; CodeRabbit Major).
 */
function admissionDecision(input, policy = {}) {
  // (a) read the 4 arm signals on their OWN guarded path, OWN-PROPERTY only (AH10 / security.md NON-BYPASSABLE):
  //     `own[k]` via Object.hasOwn, never an inherited lookup, so a polluted Object.prototype cannot supply an arm
  //     signal the caller never set. A THROW here is INDETERMINATE -> fail CLOSED + emit (never silently disarm).
  //     PLAIN values are handed to the manifest, so a throwing getter is caught HERE and never reaches it.
  let armIn;
  try {
    const own = (input && typeof input === 'object') ? input : {};
    const safe = (k) => (Object.hasOwn(own, k) ? own[k] : undefined);
    armIn = { admission: safe('admissionArmed'), signing: safe('signingArmed'), anchoring: safe('anchoringArmed'), freshness: safe('freshnessArmed') };
  } catch {
    refuseAlert('admission-arm-unreadable', { class: 'integrity', cause: 'arm-getter-threw' });
    return { admit: false, armed: true, reason: 'arm-read-failed-fail-closed' };
  }

  // (b) resolve the arm ALL-OR-NONE via the fail-closed manifest (ADR-0001 Dec 1/3). Gate on `armed` ONLY;
  //     `disarmedBaseline`/`hadMisconfig` distinguish the clean baseline from a dirty/partial one.
  const ctx = resolveArmedContext(armIn);

  // (c) CLEAN disarmed baseline (nothing armed AND no garbage token) -> admit-all = byte-identical to today. The
  //     `!hadMisconfig` gate is LOAD-BEARING: a garbage arm token is disarmedBaseline:true BUT hadMisconfig:true,
  //     so it falls THROUGH to (d) -> REJECT. Without it, a non-strict token silently admits-all (the #82 hole).
  if (!ctx.armed && ctx.disarmedBaseline && !ctx.hadMisconfig) {
    return { admit: true, armed: false, reason: 'disarmed-passthrough' };
  }

  // (d) NOT armed and NOT a clean baseline -> a garbage (dirty baseline) or PARTIAL arm -> REJECT (fail-closed),
  //     OBSERVABLE at the GATE layer with a cause DISTINCT from the manifest's own arm-resolution emit (no dup
  //     token; refuseAlert is cause-keyed, `reason` positional). The #82 + H4 close.
  if (!ctx.armed) {
    refuseAlert('admission-rejected', { class: 'misconfig', cause: ctx.disarmedBaseline ? 'arm-garbage-disarmed' : 'arm-partial' });
    return { admit: false, armed: true, reason: 'arm-indeterminate-fail-closed' };
  }

  // (e) ARMED -- read the record fields in a SEPARATE try; ANY read failure -> REJECT (fail closed, C1 preserved).
  let registry;
  let personaDid;
  let sigmaRoot;
  try {
    ({ registry, personaDid, sigmaRoot } = input);
  } catch {
    refuseAlert('admission-rejected', { class: 'integrity', cause: 'armed-input-unreadable' });
    return { admit: false, armed: true, reason: 'armed-input-unreadable' };
  }

  // (f) verify via the W1 SAFE-PATH wrapper (registry-sourced root key -- NEVER a caller-supplied one). Itself
  //     never-throws + fail-closed; wrap defensively so a hostile registry cannot throw us OPEN.
  let prov;
  try {
    prov = assessRegistrationFromRegistry(registry, { personaDid, sigmaRoot });
  } catch {
    refuseAlert('admission-rejected', { class: 'integrity', cause: 'provenance-verifier-threw' });
    return { admit: false, armed: true, reason: 'provenance-verifier-threw' };
  }

  if (prov && prov.sigmaRootChecksPassed) {
    return { admit: true, armed: true, reason: 'sigma-root-verified', provenance: prov };
  }

  // (g) unverified -- consult the grandfather SEAM in a DEDICATED try: a throw -> NOT grandfathered -> REJECT; a
  //     truthy-non-boolean -> NOT grandfathered (strict === true). grandfather comes ONLY from the SEPARATE TRUSTED
  //     policy arg, NEVER the attacker-influenced input record (CodeRabbit Major).
  let grandfathered = false;
  try {
    // OWN-property read (VALIDATE hacker HIGH), mirroring the arm read: a plain `policy.grandfather` is a
    // prototype-CHAIN access, so with a DEFAULT `{}` policy (the normal armed case, no grandfather configured) a
    // polluted `Object.prototype.grandfather = () => true` would be inherited and crypto-BYPASS verification.
    const grandfather = (policy && typeof policy === 'object' && Object.hasOwn(policy, 'grandfather')) ? policy.grandfather : undefined;
    grandfathered = typeof grandfather === 'function' && grandfather(personaDid) === true;
  } catch {
    grandfathered = false;
  }
  if (grandfathered) {
    refuseAlert('admission-grandfathered', { class: 'policy', cause: 'legacy-persona-no-sigma-root', persona: personaDid });
    return { admit: true, armed: true, reason: 'grandfathered-legacy-persona', provenance: prov };
  }

  // (h) REJECT -- OBSERVABLE, CLASSED by the failing check: a present-but-unverified sigma_root (ONLY R3 failed) is
  //     tamper/forgery -> `integrity`; anything else (absent sigma_root, unseeded root, malformed binding) ->
  //     `misconfig`. WHITELIST, never an exclusion list ("R3 alone failed" is the ONLY forgery shape).
  const failed = (prov && Array.isArray(prov.checks) ? prov.checks : [])
    .filter((c) => c && c.status === 'FAIL')
    .map((c) => c.id);
  const isForgery = failed.length === 1 && failed[0] === R3_VERIFIES;
  refuseAlert('admission-rejected', { class: isForgery ? 'integrity' : 'misconfig', cause: 'sigma-root-unverified', persona: personaDid });
  return { admit: false, armed: true, reason: 'sigma-root-unverified', provenance: prov };
}

module.exports = { admissionDecision };
