// PACT sigma-root broker WHAT-gate -- identity/binding-request-auth.js  (plans/42 W1b)
//
// PURE per-REQUEST authorization for the SIGMA-ROOT broker (no I/O): given a presented sigma-root BINDING
// preimage body, the caller-asserted record_id, and the broker's configured root CONTROLLER, decide
// allow / deny / disabled. sigma-root-broker.js drains stdin (bounded, via broker-core) and calls this as
// its gate (0.5), BEFORE opening the root key. SHADOW.
//
// A SIBLING to request-auth.js, deliberately NOT unified with it (architect Q2): the two recompute-binders
// have OPPOSITE throw contracts -- computeRecordId (frames) is PERMISSIVE on arrays/scalars (returns a valid
// 64-hex), while computeBindingId (bindings) THROWS on any missing field. A hasher-parameterized core would
// hide that security-relevant divergence, so the gates stay separate.
//
// DOMAIN SEPARATION (VERIFY hacker HIGH-1 -- the load-bearing invariant): the ONLY thing that defuses
// cross-protocol signature reuse is KEY SEPARATION (the root key != the frame broker key -- guarded against
// an inode alias by sigma-root-broker.js's same-inode refusal; full key-material distinctness is operator
// custody), NOT the _type tag. computeRecordId is field-AGNOSTIC, so under a SINGLE key a sigma-root sig
// verifies as a frame sig (proven live at VERIFY -- plans/42). This gate's recompute-bind uses
// computeBindingId, which THROWS on a frame body (no controller/publicKeyPem/personaDid) -> fail closed; the
// _type tag + the disjoint required-field set are defense-in-depth ON TOP of key separation.
//
// HONEST SCOPE (NS-9 -- do NOT report as closed). RAISED-STAKES #273 (hacker MED-2): computeBindingId is
// exported and k_pub (publicKeyPem) is a CALLER-SUPPLIED string the root never independently authorized.
// controller-bind narrows to ONE controller, but WITHIN that controller a same-uid caller who reaches the
// root broker can mint "K_root authorized MY key as persona P" for any P -- the payload-semantics ceiling,
// RAISED to the trust root. This closes ONLY with a deployed + attested cross-uid signer (the #273-close
// direction for the whole substrate); until then, integrity != provenance. All SHADOW (gates no action).

'use strict';

const { computeBindingId } = require('./sigma-root');
const { MAX_FRAME_BYTES } = require('./request-auth');
const { parseEnabledFlag, isDeploySignalSet } = require('../lib/arm-flags');

// ASCII space/tab trim (matches request-auth.js's trusted-side trim + arm-flags.trimAscii: Unicode
// whitespace stays significant so a Unicode-padded token never collapses to a recognized one).
function trimAscii(s) {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

/**
 * Resolve whether require-binding mode is ON for the sigma-root broker. Unlike resolveRequireFrame, this is
 * MANDATORY default-ON and a TYPO fails CLOSED (HIGH-2): the disabled branch signs the argv hex BLINDLY,
 * which for the TRUST ROOT is a universal signing oracle, so turning the gate OFF must be an UNAMBIGUOUS
 * operator act. Asymmetric parse (security.md flag rule):
 *   - explicit strict '1'/'0' override wins (the ONLY way to disable is a strict '0').
 *   - else default-ON when the box is DEPLOYED, detected two ways (either suffices): the root CONTROLLER is
 *     configured, OR the flag carries a present-but-non-falsey "intent" token (isDeploySignalSet -- a typo
 *     like 'ture' reads SET => fail CLOSED, even on a controller-unset box).
 *   - a genuinely unset flag on an un-deployed box (no controller) stays OFF (mirrors the frame legacy).
 * @param {{requireBindingRaw:*, rootController:*}} opts
 * @returns {boolean}
 */
function resolveRequireBinding(opts = {}) {
  const explicit = parseEnabledFlag(opts.requireBindingRaw); // '1'->true, '0'->false, else null
  if (explicit !== null) return explicit;
  const controllerPresent = typeof opts.rootController === 'string' && trimAscii(opts.rootController).length > 0;
  return controllerPresent || isDeploySignalSet(opts.requireBindingRaw);
}

/**
 * controller-bind (byte-mirror of request-auth.personaBinds -- hacker MED-1): BOTH operands must be
 * non-empty strings AND exactly equal (no case-fold, no trim of the untrusted side -- exact bytes). Closes
 * the undefined === undefined / "" === "" bypass. The trusted brokerController is ASCII-trimmed by the
 * caller BEFORE this; the untrusted body controller is compared verbatim.
 * @param {object} parsedBody
 * @param {*} brokerController  (already trusted-side trimmed)
 * @returns {boolean}
 */
function controllerBinds(parsedBody, brokerController) {
  if (typeof brokerController !== 'string' || brokerController.length === 0) return false;
  const c = parsedBody && parsedBody.controller;
  if (typeof c !== 'string' || c.length === 0) return false;
  return c === brokerController;
}

/**
 * recompute-bind: the signed id is computeBindingId(parsedBody) and it must equal the caller-asserted
 * claimedId. The broker signs the COMPUTED id, never the asserted one. computeBindingId THROWS on a missing
 * field (a frame body, a partial body) -> fail closed (mirrors request-auth.recomputeBinds).
 * @param {object} parsedBody
 * @param {*} claimedId
 * @returns {{ok:true, recordId:string}|{ok:false, reason:string}}
 */
function recomputeBindingId(parsedBody, claimedId) {
  let recordId;
  try {
    recordId = computeBindingId({
      personaDid: parsedBody.personaDid,
      publicKeyPem: parsedBody.publicKeyPem,
      controller: parsedBody.controller,
    });
  } catch { return { ok: false, reason: 'binding-uncomputable' }; }
  if (recordId !== claimedId) return { ok: false, reason: 'record-id-mismatch' };
  return { ok: true, recordId };
}

// a deny NEVER carries a signable id (recordIdToSign is explicitly null) -- the broker fails before signing.
function deny(reason) { return { decision: 'deny', reason, recordIdToSign: null }; }

/**
 * Decide whether the sigma-root broker may sign this binding request, and WHAT it signs.
 * @param {{requireBinding:boolean, claimedRecordId:*, presentedBodyRaw:*, brokerController:*}} opts
 * @returns {{decision:'allow'|'deny'|'disabled', reason:string, recordIdToSign:string|null}}
 *   'disabled' -> require-binding OFF (blind argv passthrough; sigma-root-broker emits a LOUD notice; gated
 *                 to a strict '0' by resolveRequireBinding -- the K_root blind-oracle residual).
 *   'deny'     -> fail-closed (recordIdToSign:null): unset/empty broker controller, no/oversized/malformed/
 *                 non-object body, uncomputable binding (e.g. a frame), recompute mismatch, controller mismatch.
 *   'allow'    -> recordIdToSign = the COMPUTED content-address of the presented binding.
 */
function authorizeBindingRequest(opts = {}) {
  if (!opts.requireBinding) {
    // disabled: sign the (hex64-gated) argv id. LOUD-when-off upstream. For K_root this is the blind oracle,
    // which resolveRequireBinding gates behind a strict '0' -- named LOUD (NS-9), not an accidental fall-through.
    return { decision: 'disabled', reason: 'require-binding-off', recordIdToSign: opts.claimedRecordId };
  }
  // controller policy must be configured, or we cannot controller-bind -> fail CLOSED (never both-null match).
  // INTENTIONAL asymmetry (mirrors request-auth.js:101): the BROKER-side env controller is ASCII-trimmed so a
  // whitespace-only value is UNSET (fail closed) and an operator's trailing space in the wrapper does not brick
  // a legit binding; the body's controller (untrusted) is compared EXACT-bytes, never trimmed.
  const brokerController = typeof opts.brokerController === 'string' ? trimAscii(opts.brokerController) : opts.brokerController;
  if (typeof brokerController !== 'string' || brokerController.length === 0) return deny('broker-controller-unset');

  const raw = opts.presentedBodyRaw;
  if (typeof raw !== 'string' || raw.length === 0) return deny('no-binding-presented');
  if (raw.length > MAX_FRAME_BYTES) return deny('binding-too-large');

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return deny('binding-unparseable'); }
  // reject a non-plain-object body EXPLICITLY (C1/MED-3): computeBindingId would throw on a missing field
  // anyway, but do NOT rely on that as the sole gate -- a future requireField refactor could reopen it, and
  // an array/scalar must never reach the recompute path.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return deny('binding-not-an-object');

  const bound = recomputeBindingId(parsed, opts.claimedRecordId);
  if (!bound.ok) return deny(bound.reason);
  if (!controllerBinds(parsed, brokerController)) return deny('controller-mismatch');
  return { decision: 'allow', reason: 'authorized', recordIdToSign: bound.recordId };
}

module.exports = { authorizeBindingRequest, resolveRequireBinding, controllerBinds, recomputeBindingId };
