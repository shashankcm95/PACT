// PACT P-minter — identity/minter.js  (plans/04 §3.1)
//
// The authenticated-writer (custody) abstraction: a STRUCTURALLY key-free producer that is the sole
// supported src/ writer of records. It NEVER holds raw key material — it accepts ONLY an injected
// `signer` (a custody-boundary fn: a separate-uid broker / enclave / HSM client) and passes ONLY that
// signer to buildFrame. There is no code path here to a privateKeyPem or an env key.
//
// HONEST SCOPE (plans/04 §0 — this NARROWS, it does not CLOSE integrity!=provenance):
//   * Custody (and therefore provenance) is REAL only when `signer` routes to a real out-of-band
//     boundary (separate OS uid / enclave / HSM). In-process, a same-uid attacker can re-export an
//     in-process key from memory — that residual is OPEN by physics (plans/04 §7).
//   * This abstraction does NOT address OWN-KEY forgery (a same-uid attacker minting authentic records
//     as their OWN registered persona) — that is U1's issuance-cost problem, untouched here.
//
// THRONE-FREE BY CONSTRUCTION (spec §1.5): a minter is BOUND to ONE persona/root at construction, so a
// single minter physically cannot mint across roots. Per-root custody is structural, not a hope.

'use strict';

const { buildFrame } = require('../frame/frame');

/**
 * Create an authenticated writer bound to a single persona/root.
 * @param {{signer:Function, personaDid:string, humanUid:string}} opts
 *   signer    — REQUIRED custody-boundary fn (recordId:hex64) -> base64 sig. NOT raw key material.
 *   personaDid — REQUIRED the persona this minter writes as (the binding).
 *   humanUid   — REQUIRED the scarce-human root anchor.
 * @returns {{ mint: Function, personaDid: string }}
 * @throws {TypeError} if signer is not a function, or persona/human binding is missing — fail-CLOSED,
 *   so a custody-wiring bug (or an attempt to smuggle raw key material) surfaces loudly, never degrades
 *   to an ambient-key fall-through.
 */
function createMinter(opts = {}) {
  const { signer, personaDid, humanUid } = opts;
  // STRUCTURAL no-raw-key (post-build VALIDATE LOW): accept ONLY {signer, personaDid, humanUid}. Reject
  // any other option — especially `privateKeyPem` — so "the minter never touches raw key material" is
  // ENFORCED, not merely dropped by destructuring (a caller passing a stray PEM is a custody-wiring bug
  // that should surface, not silently degrade).
  const ALLOWED = new Set(['signer', 'personaDid', 'humanUid']);
  const extra = Object.keys(opts).filter((k) => !ALLOWED.has(k));
  if (extra.length) {
    throw new TypeError('createMinter: unexpected option(s) [' + extra.join(', ') + '] — the minter accepts ONLY {signer, personaDid, humanUid} and NEVER raw key material (e.g. privateKeyPem)');
  }
  if (typeof signer !== 'function') {
    throw new TypeError('createMinter: `signer` must be a function (a custody boundary) — the minter holds NO raw key material (pass a separate-uid/enclave/HSM signer, never a privateKeyPem)');
  }
  if (typeof personaDid !== 'string' || !personaDid) {
    throw new TypeError('createMinter: `personaDid` is required (the minter is bound to ONE persona — no cross-root minting, spec §1.5)');
  }
  if (typeof humanUid !== 'string' || !humanUid) {
    throw new TypeError('createMinter: `humanUid` is required (the scarce-human root anchor)');
  }

  /**
   * Mint a signed record as this minter's bound persona. src/parent are set FROM the binding; a spec
   * that names a DIFFERENT persona/root is rejected (a minter cannot write as anyone else).
   * @param {object} spec  a buildFrame spec WITHOUT key material (type, seq, nonce, payload, configHash, t)
   * @returns {{ok:false,reason:string}|{ok:true,frame:object}}
   * @throws {TypeError} if the spec tries to override the binding to a different persona/root.
   */
  function mint(spec = {}) {
    // Reject a binding override in BOTH camelCase and snake_case (don't rely on buildFrame's camelCase-only
    // field selection to silently drop a snake_case identity — enforce the binding AT the guard; VALIDATE LOW).
    const claimedSrc = spec.srcPersonaDid !== undefined ? spec.srcPersonaDid : spec.src_persona_did;
    const claimedParent = spec.parentHumanUid !== undefined ? spec.parentHumanUid : spec.parent_human_uid;
    if (claimedSrc !== undefined && claimedSrc !== personaDid) {
      throw new TypeError('mint: this minter is bound to ' + personaDid + ' — it cannot mint as ' + claimedSrc);
    }
    if (claimedParent !== undefined && claimedParent !== humanUid) {
      throw new TypeError('mint: this minter is bound to root ' + humanUid + ' — it cannot mint under ' + claimedParent);
    }
    const bound = { ...spec, srcPersonaDid: personaDid, parentHumanUid: humanUid };
    return buildFrame(bound, { signer }); // ONLY the signer — never raw key material (no opts spread)
  }

  return { mint, personaDid };
}

module.exports = { createMinter };
