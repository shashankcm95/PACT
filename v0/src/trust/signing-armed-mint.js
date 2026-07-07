// PACT v0 -- trust/signing-armed-mint.js  (plans/42 W2 -- the signingArmed producer + compose-and-mint call site)
//
// The ARMING-GATED COMPOSITION over the already-built mint: when the deploy SIGNING arm is on, mint a
// freshness-bound VOUCH via the injected cross-uid signer (identity/mint-fresh-vouch), and return it for the
// caller to append. MINT-ONLY -- no append / verify / weight (those are receiver-relative + happen on read via
// the already-built convert.disjointPaths -> filterFreshVouches path). SHADOW / import-dark (the darkness
// witness proves no src module requires this; its consumers are the W3 proof + the deploy runbook).
//
// TOTAL contract (never-throws, like admission-gate.js / vouch-freshness): EVERY non-green path
// (disarmed, incoherent, arm-getter-throw, mint-throw, mint-not-ok) returns { minted:false } -- never an
// uncaught stack, never a silent {ok:false}. The load-bearing positive invariant: mintFreshVouch is REACHED
// ONLY on the signing-armed path.
//
// Q2 -- gate on the SIGNING arm ALONE (VERIFY architect, grounded in arming-coherence.js:35-37): the
// sign-then-admit STAGING contract has a box arm SIGNING first, accumulate signed cross-uid edges, THEN arm
// admission -- and THIS module is the edge-producer that WOULD make that staging real for PACT once the signing
// arm is deploy-set. The staging is itself a FORWARD-CONTRACT, DARK today (arming-coherence.js:36 -- "NOT a
// live PACT workflow": PACT has no live signer + this module is import-dark, so nothing stages anything yet).
// Gating the mint on BOTH arms would foreclose that staging (and deadlock against admission-gate, which also
// gates on both).
// Coherence ENFORCEMENT is the ADMISSION decision's job (admission-gate.js:60-64); the signing producer's job
// is "is signing armed? then mint." armingDecision is still called -- for the incoherence EMIT (observability,
// security.md fail-closed-must-be-OBSERVABLE) -- but its both-or-neither `admissionArmed` output does NOT gate.
//
// This MIRRORS admission-gate's arm-first-on-its-own-guarded-path discipline but INVERTS the disarmed
// direction: admission-gate disarmed -> admit-all (fail-OPEN, deliberate); the mint producer disarmed -> NO
// mint (the byte-identical default, because minting is the ACTION and not-acting adds no record). Because BOTH
// the throw path and the disarmed path converge on no-mint here, there is no divergent-fail-direction (C1) trap.
//
// CUSTODY (VERIFY architect fold 6): assertBrokerPersona is a DEPLOY-wiring step (W4), NOT run per-mint -- the
// signer is DI-injected PRE-VERIFIED, and the LOAD-BEARING custody check is the read-side sig-verify (a VOUCH
// whose frame sig does not verify under the persona's registered key is DROPPED on read). HONEST SCOPE (NS-9,
// #273 UNCHANGED, verbatim from mint-fresh-vouch.js:12-17): a same-uid holder mints an AUTHENTIC fresh VOUCH
// under its OWN key -- the arming gate adds arm-coherence + a deploy wire-check, it adds NO provenance;
// provenance is real ONLY when `signer` routes to a cross-uid boundary (NS-7). Replay-within-TTL is UNBUILT
// (checkFreshnessWindow is a <=TTL window, no consume-store), so the deploy-DI MUST supply a fresh, unique,
// high-entropy freshnessNonce + frame nonce PER MINT (MIN_NONCE_LEN is a floor, not entropy). All SHADOW:
// convert.actionable stays hard-false.

'use strict';

const { armingDecision } = require('./arming-coherence');
const { mintFreshVouch } = require('../identity/mint-fresh-vouch');
const { refuseAlert } = require('../lib/refuse-alert');

// a no-mint result NEVER carries a `frame` field -- a stray append on {minted:false} is then obviously wrong.
function noMint(reason) { return { minted: false, reason }; }

/**
 * signingArmedMint(input, deps, request) -> { minted:boolean, frame?:object, reason?:string }. TOTAL: never throws.
 * @param {{admissionArmed?:*, signingArmed?:*}} input  the deploy arm signal (TRUSTED non-actor input).
 * @param {{signer:Function, personaDid:string, humanUid:string, keyId:string}} deps  STATIC custody (deploy-DI;
 *   `signer` is PRE-VERIFIED at deploy wiring via assertBrokerPersona -- not re-checked per mint).
 * @param {{targetPersona:string, approvedAt:number, freshnessNonce:string, seq:number, nonce:string}} request
 *   PER-MINT params -- a fresh, unique freshnessNonce + frame nonce every call (the replay bound, see header).
 */
function signingArmedMint(input, deps = {}, request = {}) {
  // (a) read the ARM signal ONCE into locals, on its own guarded path (mirror admission-gate.js:46-55). A throw
  //     on a trusted-arm getter is INDETERMINATE -> fail CLOSED = no mint + emit (never silently mint; never
  //     fail-SILENT -- the raw input is NEVER passed to armingDecision, whose destructure has no try/catch).
  let admissionArmed;
  let signingArmed;
  try {
    if (input && typeof input === 'object') { admissionArmed = input.admissionArmed; signingArmed = input.signingArmed; }
  } catch {
    refuseAlert('signing-arm-unreadable', { class: 'integrity', cause: 'arm-getter-threw' });
    return noMint('arm-read-failed');
  }

  // (b) coherence EMIT side-effect ONLY (observability) -- pass the LOCALS, never the raw input. We do NOT gate
  //     on arm.admissionArmed (see the Q2 header note); armingDecision emits 'arming-incoherent' on either XOR.
  const arm = armingDecision({ admissionArmed, signingArmed });

  // (c) gate on the SIGNING arm ALONE, strict === true. DISARMED -> NO mint, byte-identical (no mintFreshVouch
  //     call, no frame). arm.reason carries the XOR direction (if any) for a caller-visible reason.
  if (signingArmed !== true) return noMint(arm.reason || 'signing-disarmed');

  // (d) SIGNING ARMED -> mint. mintFreshVouch can THROW (buildSignedVouchSpec/createMinter/mint fail-closed at
  //     the boundary) AND can return {ok:false}; the producer is TOTAL, so BOTH surface as {minted:false} + an
  //     emit. A THROW is a malformed deploy-DI param / mis-constructed signer -> `misconfig`; a returned
  //     {ok:false} is the injected signer producing no/invalid sig (a broken custody boundary) -> `integrity`.
  let r;
  try {
    r = mintFreshVouch({
      signer: deps.signer,
      personaDid: deps.personaDid,
      humanUid: deps.humanUid,
      keyId: deps.keyId,
      targetPersona: request.targetPersona,
      approvedAt: request.approvedAt,
      freshnessNonce: request.freshnessNonce,
      seq: request.seq,
      nonce: request.nonce,
    });
  } catch {
    refuseAlert('signing-mint-failed', { class: 'misconfig', cause: 'mint-threw' });
    return noMint('mint-failed');
  }
  if (!r || r.ok !== true) {
    refuseAlert('signing-mint-failed', { class: 'integrity', cause: 'mint-signer-failed' });
    return noMint((r && r.reason) || 'mint-failed');
  }
  return { minted: true, frame: r.frame };
}

module.exports = { signingArmedMint };
