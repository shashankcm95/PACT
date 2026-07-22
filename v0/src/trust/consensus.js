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

// F4 (#80): deterministic recency tie-break for two vouches that land on the SAME confidence-gated weight.
// Two vouches from ONE persona compute an identical w (w is a pure function of the voucher persona, not the
// vouch record), so a REVISION otherwise loses to the readdir/content-hash-FIRST record. Returns true iff
// `vch` (weight w) STRICTLY beats the incumbent `prev`. Chain: weight, then t, then seq, then record_id.
//
// `record_id` is the load-bearing FLOOR that actually closes F4: always present (content-address, HEX64) and
// unique per distinct vouch (distinct nonce -> distinct hash), so the final comparison is a genuine TOTAL order
// and the winner NEVER depends on readdir order. `t` (wall-clock epoch ms, cross-session) then `seq`
// (per-session; a weak same-session hint) are an ADVISORY recency layer ON TOP of that floor.
//
// VALUE-BLIND by design: this comparator never sees the vouch VALUE — tie-breaking on value would let one human
// add a persona vouching 1.0 to steer the aggregate (the persona-multiplication attack wcons exists to defeat,
// see header). t/seq are EMITTER-supplied + UNVALIDATED (frame.js; no monotonicity check) — equally forgeable,
// but confined by the read-gate to the voucher's OWN records, and wcons is SHADOW (gates nothing, INV-6).
// FORWARD CONTRACT: before wcons is wired toward gating, replace the recency signal with a kernel-stamped
// receive-time or an authenticated monotonic counter — t/seq cannot be trusted as a clock.
function beats(w, vch, prev) {
  if (!prev) return true;
  // w is a pure function of the voucher persona (config-agnostic direct()) — exact-float equality is INTENTIONAL:
  // two vouches from the SAME persona reproduce the SAME finite float (that identity IS the bug's premise). The
  // caller's `!(w > 0)` guard already excludes NaN / non-positive w before this point.
  if (w !== prev.weight) return w > prev.weight;
  const at = Number.isFinite(vch.t) ? vch.t : -Infinity;
  const bt = Number.isFinite(prev.t) ? prev.t : -Infinity;
  if (at !== bt) return at > bt;
  const as = Number.isFinite(vch.seq) ? vch.seq : -Infinity;
  const bs = Number.isFinite(prev.seq) ? prev.seq : -Infinity;
  if (as !== bs) return as > bs;
  return String(vch.record_id) > String(prev.record_id); // always-present content-address -> total order
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

  // group by HUMAN; keep each human's STRONGEST (confidence-gated belief) vouching persona, breaking a weight
  // tie by RECENCY (F4 / #80: a persona's revision must supersede its stale vouch — see beats()).
  const perHuman = new Map(); // human -> { weight, vouch, t, seq, record_id }
  for (const vch of vouches) {
    const vHuman = rootOf(reg, vch.src_persona_did) || vch.src_persona_did;
    if (vHuman === meHuman || vHuman === agentHuman) continue; // exclude self-human + target-human
    const d = direct(meCtx, vch.src_persona_did, undefined, now, recs); // config-agnostic: a voucher's
    //   reliability-as-a-source is config-independent (the config-binding is on the TARGET's trust, §1.4).
    // ADR-0004 Decision 2: weight on the RAW interaction count (d.rRaw), not the anchored d.r. Value-identical here
    // (wcons passes raw recs, so direct's posSet === all and d.rRaw === d.r), but reading rRaw literally satisfies
    // the forward contract instead of relying on the unstated transitive invariant.
    const w = alpha(d.rRaw + d.s) * d.b; // confidence-gated belief — one cheap claim → tiny w; Sybil → 0
    if (!(w > 0)) continue; // skip non-positive AND NaN (a NaN w must never survive into the tie-break)
    const prev = perHuman.get(vHuman);
    if (beats(w, vch, prev)) perHuman.set(vHuman, { weight: w, vouch: clamp01(vch.payload.value), t: vch.t, seq: vch.seq, record_id: vch.record_id });
  }

  let num = 0;
  let den = 0;
  for (const { weight, vouch } of perHuman.values()) { num += weight * vouch; den += weight; }
  if (den === 0) return { defined: false }; // cold-start / no earned graph → caller uses novice prior
  return { defined: true, value: num / den };
}

module.exports = { wcons, beats };
