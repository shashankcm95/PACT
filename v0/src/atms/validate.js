// PACT v0 — atms/validate.js  (spec §3.3)
//
// VALIDATE — mechanical, decidable, fail-closed. The machine bears ONLY the mechanical burden:
//   1. ACYCLICITY first (a justification cycle is REJECTED, never walked — v0-mandatory B3).
//      The DFS is ITERATIVE (an explicit heap stack) so a deep adversarial chain can NEVER throw a
//      RangeError that would fail OPEN on the acyclicity gate (post-build VALIDATE hacker BLOCKER).
//   2. derivation-soundness: every antecedent resolves to an existing node (no dangling premise).
//   3. a claim MUST have at least one premise (an ungrounded axiom is a self-asserted truth — §3.1).
//   4. derived_scope = MEET(ancestral premise scopes); an EMPTY meet => REJECT (no valid domain).
//   5. grounding STATUS: VALID_GIVEN iff no ancestral premise is CONTESTED; else CONTESTED (a FLAG,
//      never a collapse — a contested claim stays valid:true, only its grounding is flagged, §3.5).
//
// Returns { valid:false, reason } when a claim cannot be validated (cycle / dangling / no-premise /
// empty-scope), or { valid:true, status, label, derived_scope, derived_confidence } otherwise.

'use strict';

const { getNode } = require('./claim');
const { meetAll, isEmpty, inScope } = require('../scope/scope');

// Collect the transitive ANCESTRAL premise nodes of a claim, rejecting cycles. ITERATIVE DFS with
// a colour map (gray = on the current path, black = fully explored) — diamonds are not false cycles,
// and an arbitrarily deep chain uses the heap, not the native call stack. Returns
// { ok:true, premises:[...] } or { ok:false, reason }.
function _collectPremises(graph, startId) {
  const premises = [];
  const seenPremise = new Set();
  const colour = new Map(); // id -> 'gray' | 'black'
  const stack = [{ id: startId, children: null, idx: 0 }];

  while (stack.length) {
    const frame = stack[stack.length - 1];
    const id = frame.id;

    if (frame.children === null) {
      // first entry into `id`
      if (colour.get(id) === 'black') { stack.pop(); continue; }
      const node = getNode(graph, id);
      if (!node) return { ok: false, reason: 'dangling-antecedent: ' + id };
      colour.set(id, 'gray');
      if (node.kind === 'premise') {
        if (!seenPremise.has(id)) { seenPremise.add(id); premises.push(node); }
        colour.set(id, 'black');
        stack.pop();
        continue;
      }
      if (node.kind !== 'claim') return { ok: false, reason: 'unknown-node-kind: ' + id };
      if (!Array.isArray(node.premises)) return { ok: false, reason: 'malformed-claim: ' + id };
      frame.children = node.premises;
    }

    if (frame.idx < frame.children.length) {
      const dep = frame.children[frame.idx++];
      const c = colour.get(dep);
      if (c === 'gray') return { ok: false, reason: 'cycle-detected at ' + dep }; // back-edge
      if (c === 'black') continue; // already explored (diamond) — not a cycle
      stack.push({ id: dep, children: null, idx: 0 });
    } else {
      colour.set(id, 'black');
      stack.pop();
    }
  }
  return { ok: true, premises };
}

/**
 * Validate a claim by id. See module header for the contract. Fail-closed: any unexpected throw
 * becomes { valid:false, reason:'uncomputable' } rather than escaping (the gate is mechanical).
 */
function validate(graph, claimId) {
  try {
    const claim = getNode(graph, claimId);
    if (!claim) return { valid: false, reason: 'unknown-claim: ' + claimId };
    if (claim.kind !== 'claim') return { valid: false, reason: 'not-a-claim: ' + claimId };

    // (1) acyclicity + (2) derivation-soundness, in one fail-closed iterative DFS.
    const collected = _collectPremises(graph, claimId);
    if (!collected.ok) return { valid: false, reason: collected.reason };
    const premises = collected.premises;

    // (3) a claim must be GROUNDED in at least one premise (no ungrounded axiom — §3.1).
    if (premises.length === 0) return { valid: false, reason: 'claim-has-no-premises' };

    // (4) derived scope = MEET of ancestral premise scopes; empty meet => no valid domain.
    const derived_scope = meetAll(premises.map((p) => p.scope));
    if (isEmpty(derived_scope)) return { valid: false, reason: 'empty-derived-scope' };

    // (5) grounding status: CONTESTED iff any ancestral premise is contested.
    const contested = premises.some((p) => p.status === 'CONTESTED');
    return {
      valid: true,
      status: contested ? 'CONTESTED' : 'VALID_GIVEN',
      label: premises.map((p) => p.id),                       // the single environment (ancestral premises)
      derived_scope,
      derived_confidence: derived_scope.edge_confidence,      // possibilistic-min, surfaced (§3.4); not gated in v0
    };
  } catch (e) {
    return { valid: false, reason: 'uncomputable: ' + (e && e.message ? e.message : String(e)) };
  }
}

/**
 * Is a claim applicable AT a concrete point? Valid only INSIDE its derived scope (§3.4/§3.7).
 * @returns {{ok:boolean, reason?:string}}
 */
function appliesAt(graph, claimId, point) {
  const v = validate(graph, claimId);
  if (!v.valid) return { ok: false, reason: v.reason };
  if (!inScope(point, v.derived_scope)) return { ok: false, reason: 'BLOCKED: point outside derived scope' };
  return { ok: true };
}

module.exports = { validate, appliesAt };
