// PACT P2 — trust/consensus.js  (spec §5, INV-13; post-build VALIDATE fold F1)
//
// CONSENSUS is ADVISORY only (INV-6). wcons weights every vouch THROUGH the receiver's OWN earned
// DIRECT graph, so a Sybil flood inflates the raw vouch count but contributes ~0 to the weighted score
// (Personalized Hitting Time — theorem-backed; spec §5).
//
// The post-build VALIDATE board (F1) found that keying on the cheap persona let a Sybil with ONE cheap
// uncontested claim carry belief and launder wcons. Two fold-changes close the persona-multiplication
// attack:
//   * group vouchers by HUMAN (rootOf), not persona — N personas of one human count ONCE (take the
//     human's strongest persona).
//   * weight each human by a CONFIDENCE-GATED belief  w = alpha(r+s) * b  — a single cheap claim yields
//     a TINY α, so one cheap interaction cannot make a strong voucher (a probation floor). A zero-history
//     Sybil (r=s=0) has α=0 → w=0 → weightless in BOTH numerator and denominator.
//
// HONEST RESIDUAL (U1): this defeats persona-multiplication; a funded attacker with N distinct HUMAN
// roots each sustaining genuine interaction remains the U1 frontier (the registry stub does not enforce
// one-human-one-root). wcons/TRUST is SHADOW/advisory — it gates nothing.
//
// COLD-START: Σ weight = 0 (no earned graph) → wcons UNDEFINED; the caller uses the novice prior (never NaN).

'use strict';

const { verifiedRecords } = require('./read-gate');
const { direct } = require('./direct');
const { alpha } = require('./opinion');
const { rootOf } = require('../identity/registry');

function clamp01(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Weighted consensus for `agentDid` from `meDid`'s perspective. Reads only sig-verified VOUCH records.
 * @returns {{defined:false}|{defined:true, value:number}}
 */
function wcons(meCtx, meDid, agentDid, now) {
  const recs = verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const reg = meCtx.registry;
  const meHuman = rootOf(reg, meDid) || meDid;
  const agentHuman = rootOf(reg, agentDid) || agentDid;
  const vouches = recs.filter((r) => r.type === 'VOUCH' && r.payload && r.payload.target_persona === agentDid);

  // group by HUMAN; keep each human's STRONGEST (confidence-gated belief) vouching persona.
  const perHuman = new Map(); // human -> { weight, vouch }
  for (const vch of vouches) {
    const vHuman = rootOf(reg, vch.src_persona_did) || vch.src_persona_did;
    if (vHuman === meHuman || vHuman === agentHuman) continue; // exclude self-human + target-human
    const d = direct(meCtx, vch.src_persona_did, undefined, now, recs); // config-agnostic: a voucher's
    //   reliability-as-a-source is config-independent (the config-binding is on the TARGET's trust, §1.4).
    const w = alpha(d.r + d.s) * d.b; // confidence-gated belief — one cheap claim → tiny w; Sybil → 0
    if (w <= 0) continue;
    const prev = perHuman.get(vHuman);
    if (!prev || w > prev.weight) perHuman.set(vHuman, { weight: w, vouch: clamp01(vch.payload.value) });
  }

  let num = 0;
  let den = 0;
  for (const { weight, vouch } of perHuman.values()) { num += weight * vouch; den += weight; }
  if (den === 0) return { defined: false }; // cold-start / no earned graph → caller uses novice prior
  return { defined: true, value: num / den };
}

module.exports = { wcons };
