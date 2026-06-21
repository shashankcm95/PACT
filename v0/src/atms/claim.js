// PACT v0 — atms/claim.js  (spec §3.1/§3.2)
//
// The ATMS node model + an immutable graph. Two node kinds:
//   PREMISE   = an ATMS assumption: human-owned, scoped, falsifiable. status ACTIVE|CONTESTED.
//   CLAIM     = a node with a justification (premises[]): valid-given-its-premises, never "true".
// Node ids are content-addresses (sha256 of the canonical body) so two identical nodes share an id.
//
// The graph is IMMUTABLE: every add returns a NEW graph (fundamentals: never mutate).

'use strict';

const { sha256hex, canonicalJsonSerialize } = require('../lib/record');
const { deepFreeze } = require('../lib/deep-freeze');

/**
 * Build a PREMISE (an ATMS assumption). The human `creator` OWNS it (truth-burden, INV-3).
 * @param {{statement:string, scope:object, creator:string}} spec
 */
function makePremise({ statement, scope, creator }) {
  if (typeof statement !== 'string' || !statement) throw new TypeError('premise.statement required');
  if (!scope || typeof scope !== 'object') throw new TypeError('premise.scope required');
  if (typeof creator !== 'string' || !creator) throw new TypeError('premise.creator (human_uid) required');
  const id = sha256hex(canonicalJsonSerialize({ kind: 'premise', statement, scope, creator }));
  return {
    id, kind: 'premise', statement, scope, creator,
    status: 'ACTIVE',     // ACTIVE | CONTESTED (a FLAG, never collapse — spec §3.5)
    contest: null,        // { by, strength, counterexample } when CONTESTED
    evidence_floor: 0,    // the strength the NEXT state-flip must exceed (anti-ping-pong, §3.5)
  };
}

/**
 * Build a CLAIM justified by `premises` (ids of premises or prior claims — a DAG).
 * @param {{content:any, premises:string[]}} spec
 */
function makeClaim({ content, premises }) {
  if (content === undefined) throw new TypeError('claim.content required');
  if (!Array.isArray(premises)) throw new TypeError('claim.premises must be an array of node ids');
  const id = sha256hex(canonicalJsonSerialize({ kind: 'claim', content, premises }));
  return { id, kind: 'claim', content, premises: [...premises] };
}

/** An empty immutable graph. */
function createGraph() {
  return { nodes: Object.freeze({}) };
}

/** Add a node, returning a NEW graph (immutable). Re-adding the same id is idempotent. The node
 *  itself is DEEP-FROZEN so getNode can never return a mutable reference (a caller flipping
 *  node.status would silently corrupt every later validate — post-build VALIDATE MAJOR). */
function addNode(graph, node) {
  if (!node || !node.id) throw new TypeError('addNode: node must carry an id');
  return { nodes: Object.freeze({ ...graph.nodes, [node.id]: deepFreeze(node) }) };
}

function getNode(graph, id) {
  return graph.nodes[id] || null;
}

/** Replace a node by id (used by falsify/repair), returning a NEW graph. Deep-frozen (see addNode). */
function replaceNode(graph, node) {
  if (!node || !node.id || !graph.nodes[node.id]) throw new TypeError('replaceNode: unknown node id');
  return { nodes: Object.freeze({ ...graph.nodes, [node.id]: deepFreeze(node) }) };
}

module.exports = { makePremise, makeClaim, createGraph, addNode, getNode, replaceNode };
