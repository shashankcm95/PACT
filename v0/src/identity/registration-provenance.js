// PACT v0 -- identity/registration-provenance.js  (plans/32 W1 -- the SHADOW sigma_root verifier)
//
// The registration-provenance analog of custody-verify.js's assessCustody. It reports the host-checkable
// NECESSARY conditions (sigmaRootChecksPassed) + the still-pending SUFFICIENT condition
// (requiresOutOfBandRootAttestation), and DELIBERATELY carries NO `sigmaRootWorldAnchored` / `provenanceReal`
// field (NS-9) -- exactly as assessCustody has no `custodyReal` field. Passing the crypto check proves the root
// KEY authorized the binding; it NEVER proves the root key belongs to a distinct real human root (a same-uid host
// can self-generate + seed + self-sign one). Only the operator's out-of-band root-key attestation HARDENS it
// (OQ-NS-6/NS-7); this tool checks the necessary, never the sufficient. W1 is SHADOW: nothing in the trust fold
// reads this (witnessed by sigma-root-darkness-witness.test.js).

'use strict';

const { verifySigmaRoot } = require('./sigma-root');
const { lookupPublicKey, lookupRootKey, rootOf } = require('./registry');

const isStr = (v) => typeof v === 'string' && v.length > 0;

/**
 * PURE verdict over caller-supplied fields. No I/O, no registry read. COMPUTES the crypto check from the
 * primitive (never trusts a pre-passed boolean -- the #273 lesson: verify the thing, don't read a self-asserted
 * field). Fail-CLOSED and NEVER throws.
 *
 * @returns {{sigmaRootChecksPassed:boolean, requiresOutOfBandRootAttestation:boolean, checks:object[], residuals:string[]}}
 *   NOTE (NS-9): deliberately NO `sigmaRootWorldAnchored`/`provenanceReal` field -- the tool cannot observe
 *   whether the root key is world-anchored, so it never claims it.
 */
function assessRegistrationProvenance(facts) {
  // Safe field extraction (VALIDATE hacker H-1): destructuring in the signature throws on a null arg / a throwing
  // getter OUTSIDE any try. Extract inside a try so a poisoned arg fails CLOSED to an all-FAIL readout, never
  // throws (this function claims "NEVER throws").
  let personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem;
  try {
    if (facts && typeof facts === 'object') ({ personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem } = facts);
  } catch { /* throwing getter -> leave all undefined -> every check FAILs (fail-closed) */ }
  const checks = [];
  const residuals = [];

  const r0 = isStr(personaDid) && isStr(publicKeyPem) && isStr(controller);
  checks.push({ id: 'R0-binding', status: r0 ? 'PASS' : 'FAIL', detail: r0 ? 'binding well-formed (persona/key/controller)' : 'binding fields must be non-empty strings' });

  const r1 = isStr(sigmaRoot);
  checks.push({ id: 'R1-sigma-present', status: r1 ? 'PASS' : 'FAIL', detail: r1 ? 'sigma_root present' : 'no sigma_root -- the binding carries no root authorization (the self-register leg is open)' });

  const r2 = isStr(rootPublicKeyPem);
  checks.push({ id: 'R2-rootkey-present', status: r2 ? 'PASS' : 'FAIL', detail: r2 ? 'a root key is present to anchor to' : 'no root key -- nothing to verify the binding against' });

  // R3 -- the load-bearing crypto check. verifySigmaRoot is itself fail-closed + never-throws.
  const r3 = r0 && r1 && r2 && verifySigmaRoot({ personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem });
  checks.push({ id: 'R3-verifies', status: r3 ? 'PASS' : 'FAIL', detail: r3 ? 'sigma_root verifies over the binding under the root key' : 'sigma_root does NOT verify (absent / tampered / wrong root key)' });

  const sigmaRootChecksPassed = r3; // r3 already ANDs r0..r2; kept as the single source of the pass-leg

  // requiresOutOfBandRootAttestation IS the pass-leg (= sigmaRootChecksPassed). Unlike custody-verify -- where
  // requiresOutOfBandUidConfirmation tracks a SEPARATE denial leg (denialLegTaken, custody-verify.js:128) that can
  // diverge from `verified` -- sigma_root has a SINGLE pass-leg (R3 already ANDs R0..R2), so custody-verify's
  // structural DECOUPLING does not apply here and the invariant `sigmaRootChecksPassed === true => this flag ===
  // true` holds BY IDENTITY (tested). Semantics (VERIFY hacker H1): a PASS is NECESSARY-not-SUFFICIENT -- the root
  // PUBLIC key can be host-self-generated (the recursion), so out-of-band attestation of the root key stays the
  // SOLE determiner of a world-anchored HARDEN. A consumer MUST branch on sigmaRootChecksPassed;
  // `!requiresOutOfBandRootAttestation` is NEVER "clean" -- on a FAIL it is also false ("fix the binding", not
  // "nothing pending").
  const requiresOutOfBandRootAttestation = sigmaRootChecksPassed;
  if (sigmaRootChecksPassed) {
    residuals.push('out-of-band root attestation (the SOLE determiner): the crypto proves the root KEY authorized this binding, NOT that the key belongs to a distinct real human root. A same-uid host can self-generate + seed + self-sign a root key and pass here. Only the operator attesting K_root_pub out-of-band HARDENS it (NS-7).');
  }
  return { sigmaRootChecksPassed, requiresOutOfBandRootAttestation, checks, residuals };
}

/**
 * SAFE-DEFAULT consumer (VERIFY hacker H2). The pure `assessRegistrationProvenance` trusts a caller-supplied
 * triple + root key -- a malicious consumer could pass the attacker's OWN self-generated root key and get a clean
 * pass. This wrapper takes NO root key param: it sources the binding triple + root key from the FROZEN registry
 * rows. It is the SAFE DEFAULT (VALIDATE honesty LOW-2 -- not "the only path": the pure verifier stays exported
 * for callers that already hold registry-sourced inputs; a caller that passes attacker-supplied inputs to it
 * re-opens H2, so W2's armed gate MUST use THIS wrapper).
 *   - publicKeyPem  <- lookupPublicKey(reg, personaDid)   (the frozen persona row)
 *   - controller    <- rootOf(reg, personaDid)            (the frozen persona row)
 *   - rootPublicKeyPem <- lookupRootKey(reg, controller)  (the seeded root key -- NEVER isKnownRoot, a DIFFERENT
 *                                                          predicate: a persona-seeded root is "known" with a null key)
 * Fail-CLOSED on ANY null (unregistered persona / unseeded root key) or a malformed reg/opts. NEVER throws
 * (VALIDATE hacker H-1: the whole body is wrapped -- a null opts / throwing getter / malformed registry -> fail-closed).
 */
function assessRegistrationFromRegistry(reg, opts) {
  const failClosed = (detail) => ({
    sigmaRootChecksPassed: false,
    requiresOutOfBandRootAttestation: false,
    checks: [{ id: 'R-registry-source', status: 'FAIL', detail }],
    residuals: [],
  });
  try {
    let personaDid, sigmaRoot;
    if (opts && typeof opts === 'object') ({ personaDid, sigmaRoot } = opts);
    if (!isStr(personaDid)) return failClosed('personaDid missing');
    const publicKeyPem = lookupPublicKey(reg, personaDid);
    const controller = rootOf(reg, personaDid);
    if (!publicKeyPem || !controller) return failClosed('persona not registered -- no frozen row to source the binding from');
    const rootPublicKeyPem = lookupRootKey(reg, controller);
    if (!rootPublicKeyPem) return failClosed('root key not seeded for ' + controller + ' -- fail-closed (isKnownRoot is NOT an anchor)');
    return assessRegistrationProvenance({ personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem });
  } catch { return failClosed('malformed registry or opts -- fail-closed'); }
}

module.exports = { assessRegistrationProvenance, assessRegistrationFromRegistry };
