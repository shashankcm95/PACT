// PACT P3 — grounding/reach.js  (spec §6.3 — emergent-descriptive, INV-17)
//
// reach(claimId, claimCtx) = the rootOf-keyed UNION of independent receiver-local ACCEPTs of a claim,
// read from ME's verified log (derived-on-read, INV-14 — never a caller-supplied array).
// REACH is EMERGENT-DESCRIPTIVE: it is the union-after-the-fact of receiver decisions, nothing the
// network computes or grants (INV-2, INV-17). N personas of ONE human === ONE receiver (rootOf-keyed —
// co-forge cannot inflate the envelope). EMPTY accepts => EMPTY envelope, regardless of how verified the
// claim is (the load-bearing INV-17 forcing test). SHADOW/advisory.
//
// The INV-9 THRESHOLD flag compares the claim's CLAIMED grounding vs its ACTUAL verificationStrength;
// when claimed > actual the claim is `provisional/ungrounded` (never "hardened"). This flag is a function
// of VERIFICATION ONLY — it NEVER reads envelope.size (INV-13: REACH counts no nodes as trust). `size`
// is a distinct-HUMAN DISPLAY roll-up, loudly U1-open, that never crosses a gate as a count.

'use strict';

const { rootOf } = require('../identity/registry');
const { getNode } = require('../atms/claim');
const { authenticatedAnchoredRecords } = require('../trust/authenticated-read');
const { verificationStrength } = require('./verification-strength');

// A claim's CLAIMED grounding on [0,1]. Resolution (plan §3.5 left `groundingClaim` unbound — see the
// build report's one-line ambiguity note): read the self-asserted `content.grounding` when it is a
// number in [0,1]; ELSE default to 1 (a claim that asserts no explicit grounding implicitly claims FULL
// grounding, so the INV-9 flag fires fail-LOUD whenever actual verification is weaker — the conservative
// reading: an unannotated claim is treated as over-claiming, never under-claiming).
function groundingClaim(claim) {
  const g = claim && claim.content && claim.content.grounding;
  if (typeof g === 'number' && g >= 0 && g <= 1) return g;
  return 1;
}

/**
 * reach — the rootOf-keyed union of accepting humans + the INV-9 threshold flag. DERIVED-ON-READ: the
 * ACCEPT records are read from ME's verified log internally (INV-14), exactly like the other grounding
 * folds — never trusted from a caller-supplied array (post-build VALIDATE: that was a footgun; a careless
 * caller could pass un-SIG-checked accepts). REACH is observer-relative: it is the union of accepts as ME
 * has seen them.
 * @param {string} claimId
 * @param {{meCtx:object, graph?:object, now?:number}} claimCtx  meCtx = {registry, storeOpts}
 * @returns {{envelope:string[], size:number, threshold_flag:string, advisory:true}}
 */
function reach(claimId, claimCtx = {}) {
  const meCtx = claimCtx.meCtx || {};
  const reg = meCtx.registry;
  // F6 Wave-1 (plans/59, ADR-0003): route the ACCEPT scan through the anchoring chokepoint (guard preserved
  // verbatim -- a degenerate meCtx still yields []). DISARMED byte-identical; ARMED narrows the UNION envelope
  // (pure-positive; reach is INV-13 display-only, never gates). reach's threshold_flag anchors via
  // verificationStrength (below), which routes independently.
  const recs = (reg && meCtx.storeOpts) ? authenticatedAnchoredRecords(meCtx) : [];
  const roots = new Set();
  for (const a of recs) {
    if (a.type !== 'ACCEPT' || !a.payload) continue;
    if (a.payload.target_claim_id !== claimId) continue;          // real-target: this claim only
    const human = rootOf(reg, a.src_persona_did) || a.src_persona_did; // rootOf-keyed (one human = one)
    roots.add(human);
  }
  const envelope = [...roots]; // no accepts => empty envelope, ALWAYS (INV-17)

  // INV-9 threshold flag — VERIFICATION only, never envelope size (INV-13). Computable only when the
  // caller supplies the claim graph; otherwise the flag is 'unknown' (never a default-pass).
  let threshold_flag = 'unknown';
  if (claimCtx.graph && meCtx.registry) {
    const claim = getNode(claimCtx.graph, claimId); // canonical access (not graph.nodes[] internals)
    const claimed = groundingClaim(claim);
    const actual = verificationStrength(claimId, claimCtx.graph, meCtx, claimCtx.now);
    threshold_flag = claimed > actual ? 'provisional' : 'grounded';
  }

  return { envelope, size: envelope.length, threshold_flag, advisory: true };
}

module.exports = { reach, groundingClaim };
