// PACT P2 — trust/convert.js  (spec §5.1, §4.5, INV-13)
//
// CONVERT: consensus -> actionable. It demands the UNFORGEABLE (DISJOINT_PATHS + probation + stake +
// behavioral-demo), never the cheap (more vouches / a central checker). DISJOINT_PATHS is a STRUCTURAL
// property — the count of VERTEX-disjoint paths from `me` to `agent` in the vouch graph (Menger /
// max-flow at unit VERTEX capacity), NOT a tally of vouches (INV-13). A Sybil flood that does not
// connect to me's own out-edges yields 0 paths (no path from me); k cheap minted roots can fabricate k
// topologically-disjoint paths (spec §4.5.1) — which is exactly why the result is topological-WEAK and,
// per INV-16, INFORMS but does NOT GATE in P2 (everything stays SHADOW until the U2 estimator, P5).

'use strict';

const { verifiedRecords } = require('./read-gate');
const { filterFreshVouches } = require('./vouch-freshness');
const { DISJOINT_PATHS_K } = require('./params');
const { independenceLabel } = require('../independence/weak-flag');
const { rootOf } = require('../identity/registry');

/** Build the directed vouch graph from sig-verified VOUCH records: edge src -> target. */
function buildVouchGraph(recs) {
  const edges = new Map();
  for (const r of recs) {
    if (r.type !== 'VOUCH' || !r.payload || typeof r.payload.target_persona !== 'string') continue;
    if (!edges.has(r.src_persona_did)) edges.set(r.src_persona_did, new Set());
    edges.get(r.src_persona_did).add(r.payload.target_persona);
  }
  return edges;
}

/**
 * Count VERTEX-disjoint paths src->sink via max-flow with unit VERTEX capacity (node-splitting:
 * each node n becomes n|in -> n|out cap 1; src/sink internal cap unbounded). Edmonds-Karp (BFS
 * augmenting paths). This is a structural max-flow VALUE, never a vouch tally.
 */
function maxVertexDisjointPaths(edges, src, sink) {
  if (src === sink) return 0;
  const residual = new Map();
  const ensure = (n) => { if (!residual.has(n)) residual.set(n, new Map()); };
  const add = (a, b, c) => { ensure(a); ensure(b); residual.get(a).set(b, (residual.get(a).get(b) || 0) + c); if (!residual.get(b).has(a)) residual.get(b).set(a, 0); };
  const IN = (n) => n + '|in';
  const OUT = (n) => n + '|out';

  const nodes = new Set([src, sink]);
  for (const [from, tos] of edges) { nodes.add(from); for (const to of tos) nodes.add(to); }
  for (const n of nodes) add(IN(n), OUT(n), (n === src || n === sink) ? Infinity : 1); // vertex capacity
  for (const [from, tos] of edges) for (const to of tos) add(OUT(from), IN(to), 1);    // vouch edges

  const S = OUT(src);
  const T = IN(sink);
  let flow = 0;
  for (;;) {
    const parent = new Map([[S, null]]);
    const q = [S];
    let found = false;
    while (q.length) {
      const u = q.shift();
      if (u === T) { found = true; break; }
      const m = residual.get(u);
      if (!m) continue;
      for (const [v, cap] of m) if (cap > 0 && !parent.has(v)) { parent.set(v, u); q.push(v); }
    }
    if (!found) break;
    // augment by the path bottleneck (always 1 — every src->sink path crosses a unit vouch edge)
    let v = T;
    let bott = Infinity;
    while (parent.get(v) != null) { const u = parent.get(v); bott = Math.min(bott, residual.get(u).get(v)); v = u; }
    v = T;
    while (parent.get(v) != null) { const u = parent.get(v); residual.get(u).set(v, residual.get(u).get(v) - bott); residual.get(v).set(u, (residual.get(v).get(u) || 0) + bott); v = u; }
    flow += Number.isFinite(bott) ? bott : 1;
  }
  return flow;
}

/**
 * DISJOINT_PATHS(me, agent) — the structural vertex-disjoint path count over the vouch graph.
 * W2 (plans/36): the sig-verified records pass through filterFreshVouches BEFORE the graph-build.
 * DISARMED (no meCtx.freshness — every caller today) => identity pass-through, byte-identical. ARMED
 * (meCtx.freshness={now,ttlMs}) => stale/no-freshness VOUCHes drop (the H1 authorization post-condition),
 * NARROWING the advisory count (never gating — actionable stays false, NS-9). {now,ttlMs} are DEPLOY constants.
 */
function disjointPaths(meCtx, meDid, agentDid) {
  const verified = verifiedRecords(meCtx.registry, meCtx.storeOpts);
  const edges = buildVouchGraph(filterFreshVouches(verified, meCtx && meCtx.freshness));
  return maxVertexDisjointPaths(edges, meDid, agentDid);
}

/**
 * The funded-root ADVISORY axis (plans/22 S5): the AGENT's root stake-state, read via a DI-injected anchor
 * (`meCtx.anchor`). It is a scarcity/cost-AXIS signal (axis-1 family) reflecting stake PRESENCE (a real forfeitable
 * cost only once S6 deploys — until then it NARROWS, it does not bear cost) — it INFORMS, it NEVER gates and is
 * NEVER read as epistemic independence (axis 4). Returns `null` when the axis is UNAVAILABLE: no anchor wired, a
 * broken anchor (no `stakeOf` fn), a THROWING anchor, or a malformed (non-`{status}`) return — the whole `convert`
 * readout (incl. the gate-relevant fields) must NEVER be denied by a bad advisory anchor (VALIDATE — contained).
 *
 * `null` is NOT `{status:'none'}`: `{status:'none'}` means the axis RAN and the agent's root is unfunded (a real,
 * receiver-relative negative); `null` means the axis could not run. A future GATING consumer MUST treat `null` as
 * FAIL-CLOSED (never "funded", never "no requirement"). The `status` enum is OPEN — S4 added `'slashed'`, which
 * flows through this passthrough unchanged (NEVER switch on a closed status set). The status is `nowMs`-RELATIVE:
 * `stakeOf` reports `'locked'` for a non-finite/omitted clock (conservative), so a gating consumer MUST pass a
 * finite numeric `nowMs`. Reuses the ONE provenance gate via `stakeOf` (keyed by `rootOf(signer)`; a forged/
 * unsigned stake contributes 0) — no new key path.
 * @returns {{status:string, lockedUntil:(number|null)}|null}
 */
function agentStakeAxis(meCtx, agentDid) {
  const anchor = meCtx && meCtx.anchor;
  if (!anchor || typeof anchor.stakeOf !== 'function') return null; // axis UNAVAILABLE — fail-closed for a future gater
  let axis;
  try {
    // UNCONDITIONAL (KISS/DRY, matches issuance-policy.js): rootOf -> null for an unregistered agent, and
    // stakeOf(.., null, ..) already yields {status:'none', lockedUntil:null} — no hand-rolled short-circuit.
    axis = anchor.stakeOf(meCtx.storeOpts, rootOf(meCtx.registry, agentDid), meCtx.nowMs);
  } catch (_) {
    return null; // a THROWING anchor (e.g. a future S6 network backend) -> axis UNAVAILABLE, NOT a convert-wide DoS
  }
  // contain a malformed return to the advisory field — only a plain object with a string `status` IS the axis
  // (a non-object like 'allow'/true never lands in funded_root where a consumer could misread it).
  return (axis && typeof axis === 'object' && typeof axis.status === 'string') ? axis : null;
}

/**
 * CONVERT in P2: ADVISORY only. Returns the structural disjoint-path count + the (WEAK) independence
 * label + the (advisory) funded-root axis. `actionable` is ALWAYS false in P2 (INV-16: a WEAK record never
 * gates a high-stakes action).
 */
// P3 PRECONDITION (load-bearing — do not forget when the WEAK flag lifts): `meets_topological` is
// NECESSARY-NOT-SUFFICIENT. The per-path UNFORGEABLE bar (probation + voucher stake + behavioral demo, §5.1).
// S5 UPDATE (plans/22): the "voucher stake" piece is now SURFACED as a COARSE funded-ROOT advisory axis
// (`funded_root`, via `meCtx.anchor`) — NOT the per-path/per-voucher stake the bar names; and decay (OQ#3) +
// probation + behavioral demo + the U2 estimator remain unimplemented. `actionable` MUST NOT flip true until that
// full bar exists AND the U2 estimator replaces the permanent WEAK flag. `funded_root` informs, never gates (it is
// axis-1, never read as epistemic axis-4); `funded_root:null` is fail-CLOSED-not-allow for any future gater.
// A bare max-flow count is topology, never trust.
function convert(meCtx, meDid, agentDid) {
  const dp = disjointPaths(meCtx, meDid, agentDid);
  const independence = independenceLabel({ topological: dp });
  return {
    advisory: true,                     // SHADOW — never a hard promotion in P2
    disjoint_paths: dp,                 // a max-flow VALUE, not a vouch tally (INV-13)
    meets_topological: dp >= DISJOINT_PATHS_K,
    independence,                       // overall WEAK
    funded_root: agentStakeAxis(meCtx, agentDid), // advisory axis-1 (scarcity/cost) — informs, NEVER gates (S5)
    actionable: false,                  // INV-16 — informs, never gates (U2 open)
    reason: 'topological-WEAK: informs, does not gate (U2 open)',
  };
}

module.exports = { convert, disjointPaths, buildVouchGraph, maxVertexDisjointPaths };
