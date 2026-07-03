// PACT v0 -- trust/admission-gate.js  (plans/33 W2 -- the DARK sigma_root armed admission gate)
//
// The ENFORCEMENT DECISION for W1's sigma_root verifier: WHEN ARMED, turns the advisory verifier's FAIL into a
// REJECT. It ships DARK -- disarmed by default (a pure admit-all pass-through = byte-identical to today, since
// there is no admission gate today), armed ONLY by injection (PACT owns NO live arm flag -- plans/28), and WIRED
// TO NOTHING (the admission-gate-darkness-witness proves no fold pulls this into the require graph). It is the
// FIRST consumer of arming-coherence's admissionArmed arm. It arms nothing, gates nothing, hardens nothing today.
//
// It does NOT advance the trust frontier (NS-9): only the operator's out-of-band root-key attestation HARDENS
// (OQ-NS-6/NS-7), and this module does not touch it. This is ready-to-arm plumbing whose hard part is the
// fail-closed decision -- NEVER a trust advance.
//
// TRUSTED INPUTS (VERIFY hacker L1/H1 + CodeRabbit Major -- disclosed): `registry` + the arm signal
// (`admissionArmed`/`signingArmed`) are TRUSTED non-actor inputs in `input`; `grandfather` is a TRUSTED policy
// OVERRIDE passed on a SEPARATE `policy` arg -- a crypto-BYPASSING callback (`() => true` admits with no valid
// sigma_root) must NEVER be forwardable from an attacker record (a caller spreading `{...record}` into `input`
// can't smuggle a grandfather). The `input` record fields (`personaDid`/`sigmaRoot`) are attacker-influenced,
// which is why the arm is read on its OWN path, independent of them (C1). `registry` stays in `input` as a
// disclosed residual: unlike grandfather it is crypto-GATED data -- a fake registry still needs a seeded root key
// + a signed sigma_root (the root-key-squat recursion), not a bypass callback.
//
// LAYERING (NS-11): trust/ may import lib/ + identity/ (the trust ban is ['grounding']). This imports
// arming-coherence (trust/), registration-provenance (identity/), refuse-alert (lib/) -- no upward cycle.

'use strict';

const { armingDecision } = require('./arming-coherence');
const { assessRegistrationFromRegistry, R3_VERIFIES } = require('../identity/registration-provenance');
const { refuseAlert } = require('../lib/refuse-alert');

/**
 * admissionDecision(input) -> { admit:boolean, armed:boolean, reason:string, provenance?:object }. PURE
 * (no state), fail-CLOSED when armed, and NEVER throws.
 *
 * C1 CORRECTION (VERIFY hacker CRITICAL): the arm signal is read on its OWN guarded path, INDEPENDENT of the
 * attacker-influenced record fields. The W1 template (extract every field in one try, undefined-on-throw) is
 * fail-CLOSED for W1 but INVERTS to fail-OPEN here -- a poisoned personaDid/sigmaRoot/admissionArmed getter would
 * collapse the arm to undefined -> disarmed -> admit-all, so an intended-ARMED gate would silently ADMIT an
 * unverified persona. Read the arm first; the armed branch reads the record fields separately and rejects on ANY
 * read failure.
 *
 * @param {{admissionArmed?:*, signingArmed?:*, registry?:object, personaDid?:string, sigmaRoot?:string}} input  per-request: the arm signal + the attacker-influenced record fields.
 * @param {{grandfather?:Function}} [policy]  the TRUSTED policy context (a SEPARATE arg -- a grandfather OVERRIDE must not be forwardable from an actor record; CodeRabbit Major).
 */
function admissionDecision(input, policy = {}) {
  // (a) read the ARM signal ONLY, on its own guarded path. A THROW here (a getter on the trusted arm input) is
  //     INDETERMINATE -> fail CLOSED (never silently disarm) + emit (VERIFY hacker C1/M1).
  let admissionArmed;
  let signingArmed;
  try {
    if (input && typeof input === 'object') { admissionArmed = input.admissionArmed; signingArmed = input.signingArmed; }
  } catch {
    refuseAlert('admission-arm-unreadable', { class: 'integrity', cause: 'arm-getter-threw' });
    return { admit: false, armed: true, reason: 'arm-read-failed-fail-closed' };
  }

  // (b) arm preflight -- both-or-neither, strict === true, OBSERVABLE on incoherent (the P5-W2 primitive). An
  //     XOR-incoherent arm yields admissionArmed(out)=false -> falls through to the DISARMED pass-through, and the
  //     incoherence emits here (VERIFY architect F4-A).
  const arm = armingDecision({ admissionArmed, signingArmed });

  // (c) DISARMED (decided from the ARM ALONE) -> admit-all pass-through = byte-identical to today (no gate).
  //     DELIBERATE fail-open (VERIFY hacker H1): the arm signal MUST come from a trusted, non-actor path.
  if (!arm.admissionArmed) return { admit: true, armed: false, reason: 'disarmed-passthrough' };

  // (d) ARMED -- read the record fields in a SEPARATE try; ANY read failure -> REJECT (fail closed, never admit).
  let registry;
  let personaDid;
  let sigmaRoot;
  try {
    ({ registry, personaDid, sigmaRoot } = input);
  } catch {
    refuseAlert('admission-rejected', { class: 'integrity', cause: 'armed-input-unreadable' });
    return { admit: false, armed: true, reason: 'armed-input-unreadable' };
  }

  // (e) verify via the W1 SAFE-PATH wrapper (registry-sourced root key -- NEVER a caller-supplied one; the H2
  //     close). It is itself never-throws + fail-closed; wrap defensively so a hostile registry cannot throw us OPEN.
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

  // (f) unverified -- consult the grandfather SEAM in a DEDICATED try (VERIFY hacker M2): a throw -> NOT
  //     grandfathered -> REJECT (fail closed); a truthy-non-boolean -> NOT grandfathered (strict === true).
  let grandfathered = false;
  try {
    // grandfather comes from the SEPARATE TRUSTED policy arg, NEVER the attacker-influenced input record
    // (CodeRabbit Major). Reading it here (inside the dedicated try) fails CLOSED on a throwing getter too.
    const grandfather = policy && typeof policy === 'object' ? policy.grandfather : undefined;
    grandfathered = typeof grandfather === 'function' && grandfather(personaDid) === true;
  } catch {
    grandfathered = false;
  }
  if (grandfathered) {
    // a grandfather admission is a NAMED policy exception, OBSERVABLE (not a silent pass). Classed `policy`
    // (a free-form class refuse-alert tolerates) -- distinct from a `misconfig` REJECT so an operator triaging
    // by class does not confuse a deliberate policy admit with a remediation gap (VALIDATE code-reviewer LOW).
    refuseAlert('admission-grandfathered', { class: 'policy', cause: 'legacy-persona-no-sigma-root', persona: personaDid });
    return { admit: true, armed: true, reason: 'grandfathered-legacy-persona', provenance: prov };
  }

  // (g) REJECT -- OBSERVABLE, CLASSED by the failing check (VERIFY hacker H2): a present-but-unverified sigma_root
  //     (ONLY R3 failed) is tamper/forgery -> `integrity`; anything else (absent sigma_root, unseeded root, a
  //     malformed binding, or the registry-source fail-closed) -> `misconfig` (a legit legacy persona / operator gap).
  const failed = (prov && Array.isArray(prov.checks) ? prov.checks : [])
    .filter((c) => c && c.status === 'FAIL')
    .map((c) => c.id);
  // WHITELIST, not an exclusion list (VALIDATE code-reviewer MED): "R3 alone failed" is the ONLY forgery shape.
  // An exclusion list (NOT R1 AND NOT R2) would mis-class an R0-binding + R3 failure as `integrity`, and would
  // need syncing with every future check id registration-provenance might add. A whitelist can never over-class.
  const isForgery = failed.length === 1 && failed[0] === R3_VERIFIES;
  refuseAlert('admission-rejected', { class: isForgery ? 'integrity' : 'misconfig', cause: 'sigma-root-unverified', persona: personaDid });
  return { admit: false, armed: true, reason: 'sigma-root-unverified', provenance: prov };
}

module.exports = { admissionDecision };
