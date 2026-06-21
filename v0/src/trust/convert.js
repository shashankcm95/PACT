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
const { DISJOINT_PATHS_K } = require('./params');
const { independenceLabel } = require('../independence/weak-flag');

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

/** DISJOINT_PATHS(me, agent) — the structural vertex-disjoint path count over the vouch graph. */
function disjointPaths(meCtx, meDid, agentDid) {
  const edges = buildVouchGraph(verifiedRecords(meCtx.registry, meCtx.storeOpts));
  return maxVertexDisjointPaths(edges, meDid, agentDid);
}

/**
 * CONVERT in P2: ADVISORY only. Returns the structural disjoint-path count + the (WEAK) independence
 * label. `actionable` is ALWAYS false in P2 (INV-16: a WEAK record never gates a high-stakes action).
 */
// P3 PRECONDITION (load-bearing — do not forget when the WEAK flag lifts): `meets_topological` is
// NECESSARY-NOT-SUFFICIENT. The per-path UNFORGEABLE bar (probation + voucher stake + behavioral demo,
// §5.1) is entirely unimplemented in P2; `actionable` MUST NOT flip true until that bar exists AND the
// U2 estimator replaces the permanent WEAK flag. A bare max-flow count is topology, never trust.
function convert(meCtx, meDid, agentDid) {
  const dp = disjointPaths(meCtx, meDid, agentDid);
  const independence = independenceLabel({ topological: dp });
  return {
    advisory: true,                     // SHADOW — never a hard promotion in P2
    disjoint_paths: dp,                 // a max-flow VALUE, not a vouch tally (INV-13)
    meets_topological: dp >= DISJOINT_PATHS_K,
    independence,                       // overall WEAK
    actionable: false,                  // INV-16 — informs, never gates (U2 open)
    reason: 'topological-WEAK: informs, does not gate (U2 open)',
  };
}

module.exports = { convert, disjointPaths, buildVouchGraph, maxVertexDisjointPaths };
