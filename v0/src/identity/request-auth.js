// PACT R2-WHAT per-request auth -- identity/request-auth.js  (plans/11 sec.1/9)
//
// PURE per-REQUEST authorization for the broker (no I/O): given a presented frame PREIMAGE body, the
// caller-asserted record_id, and the broker's configured persona, decide allow / deny / disabled.
// broker-sign.js drains stdin (bounded) and calls this as its gate (0.5), BEFORE opening the key. SHADOW.
//
// THE CLOSURE (plans/11 sec.0, VERIFY board): today the broker is a blind signing oracle -- it signs an
// OPAQUE 64-hex. Because record_id is a preimage-resistant content-address, the broker cannot tell a
// well-formed frame's hash from any other 64-hex unless it sees the PREIMAGE. require-frame mode binds the
// signature to a recomputable frame:
//   * recompute-bind (non-vacuous TODAY): sign the COMPUTED id = computeRecordId(presentedBody), NEVER the
//     caller-asserted argv id; an embedded record_id/sig is stripped by computeRecordId (not trusted).
//   * persona-bind (LOAD-BEARING, not defense-in-depth): computeRecordId does NOT throw on a persona-less
//     array/scalar (computeRecordId([1,2,3]) -> a valid 64-hex), so persona-bind is the ONLY gate stopping
//     a non-P / non-frame body from being signed. BOTH operands must be non-empty strings (an unset
//     PACT_BROKER_PERSONA_DID must FAIL CLOSED, never undefined === undefined authorize).
//
// HONEST SCOPE (plans/11 sec.0 -- NS-9, do NOT report as closed): this NARROWS WHAT-can-be-signed; the
// entitled operator can still make P assert ANY payload (payload-semantics ceiling). PACT_BROKER_PERSONA_DID
// is a POLICY declaration, NOT cryptographically bound to the held key broker-side (integrity != provenance,
// NS-2). R2 stays open. All SHADOW (gates no action).

'use strict';

const { computeRecordId } = require('../lib/record');

// A presented body is bounded: a frame is small (persona did + payload). Beyond this is a DoS / not-a-frame
// -> refuse WITHOUT parsing. broker-sign.js ALSO caps the stdin read at this bound (volume) plus a wall-clock
// read deadline (time) -- a byte cap alone does not bound a slow-loris pipe.
const MAX_FRAME_BYTES = 256 * 1024;

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

/**
 * Resolve whether require-frame mode is ON. DEFAULT-ON gated on PACT_BROKER_PERSONA_DID presence (Q5): on a
 * box that opted into R2-WHAT (persona-did set), a DROPPED PACT_BROKER_REQUIRE_FRAME env fails CLOSED (ON),
 * never silently reopens the oracle. A legacy box (no persona-did) stays OFF. Explicit '1'/'0' override.
 * @param {{requireFrameRaw:*, brokerPersonaDid:*}} opts
 * @returns {boolean}
 */
function resolveRequireFrame(opts = {}) {
  const explicit = parseEnabledFlag(opts.requireFrameRaw);
  if (explicit !== null) return explicit;
  return typeof opts.brokerPersonaDid === 'string' && opts.brokerPersonaDid.length > 0;
}

/**
 * persona-bind: BOTH operands must be non-empty strings AND exactly equal (no case-fold, no trim -- exact
 * bytes). Closes the undefined === undefined / "" === "" bypass (VERIFY hacker CRITICAL).
 * @param {object} parsedBody
 * @param {*} brokerPersonaDid
 * @returns {boolean}
 */
function personaBinds(parsedBody, brokerPersonaDid) {
  if (typeof brokerPersonaDid !== 'string' || brokerPersonaDid.length === 0) return false;
  const src = parsedBody && parsedBody.src_persona_did;
  if (typeof src !== 'string' || src.length === 0) return false;
  return src === brokerPersonaDid;
}

/**
 * recompute-bind: the signed id is computeRecordId(parsedBody) (which strips an embedded record_id/sig), and
 * it must equal the caller-asserted claimedId. The broker signs the COMPUTED id, never the asserted one.
 * @param {object} parsedBody
 * @param {*} claimedId
 * @returns {{ok:true, recordId:string}|{ok:false, reason:string}}
 */
function recomputeBinds(parsedBody, claimedId) {
  let recordId;
  try { recordId = computeRecordId(parsedBody); } // depth-bound throw on a pathological payload -> fail closed
  catch { return { ok: false, reason: 'frame-uncomputable' }; }
  if (recordId !== claimedId) return { ok: false, reason: 'record-id-mismatch' };
  return { ok: true, recordId };
}

// a deny NEVER carries a signable id (recordIdToSign is explicitly null) -- the broker fails before signing.
function deny(reason) { return { decision: 'deny', reason, recordIdToSign: null }; }

/**
 * Decide whether the broker may sign this request, and WHAT it signs.
 * @param {{requireFrame:boolean, claimedRecordId:*, presentedBodyRaw:*, brokerPersonaDid:*}} opts
 * @returns {{decision:'allow'|'deny'|'disabled', reason:string, recordIdToSign?:string}}
 *   'disabled' -> require-frame OFF (legacy hex passthrough; broker-sign emits a LOUD notice). R2-WHAT open.
 *   'deny'     -> fail-closed (no recordIdToSign): unset/empty broker persona, no/oversized/malformed/
 *                 non-object body, recompute mismatch, or persona mismatch.
 *   'allow'    -> recordIdToSign = the COMPUTED content-address of the presented P-frame.
 */
function authorizeRequest(opts = {}) {
  if (!opts.requireFrame) {
    // legacy: the broker signs the (hex64-gated) argv id, exactly as before R2-WHAT.
    return { decision: 'disabled', reason: 'require-frame-off', recordIdToSign: opts.claimedRecordId };
  }
  // persona policy must be configured, or we cannot persona-bind -> fail CLOSED (never both-null authorize).
  // INTENTIONAL asymmetry (do NOT "fix" by trimming the body side): the BROKER-side env persona is
  // ASCII-trimmed so a whitespace-only value is treated as UNSET (fail closed) and an operator's trailing
  // space in the wrapper does not brick legit signing; the comparison below is then EXACT-bytes against the
  // (untrusted) body's src_persona_did, which is NOT trimmed. Trimming the env (trusted) can only make it
  // match the LEGIT persona it already keys -- it never lets an attacker claim a DIFFERENT persona.
  const brokerPersona = typeof opts.brokerPersonaDid === 'string' ? opts.brokerPersonaDid.replace(/^[ \t]+|[ \t]+$/g, '') : opts.brokerPersonaDid;
  if (typeof brokerPersona !== 'string' || brokerPersona.length === 0) return deny('broker-persona-unset');

  const raw = opts.presentedBodyRaw;
  if (typeof raw !== 'string' || raw.length === 0) return deny('no-frame-presented');
  if (raw.length > MAX_FRAME_BYTES) return deny('frame-too-large');

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return deny('frame-unparseable'); }
  // reject a non-plain-object body: computeRecordId accepts arrays/scalars (returns a valid 64-hex), so this
  // is load-bearing -- an array/scalar must never reach the signer (VERIFY hacker CRITICAL #2).
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return deny('frame-not-an-object');

  const bound = recomputeBinds(parsed, opts.claimedRecordId);
  if (!bound.ok) return deny(bound.reason);
  if (!personaBinds(parsed, brokerPersona)) return deny('persona-mismatch');
  return { decision: 'allow', reason: 'authorized', recordIdToSign: bound.recordId };
}

module.exports = { authorizeRequest, recomputeBinds, personaBinds, resolveRequireFrame, MAX_FRAME_BYTES };
