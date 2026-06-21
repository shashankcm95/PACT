// PACT v0 — atms/falsify.js  (spec §3.5; v0-mandatory B2)
//
// FALSIFY and REPAIR — the symmetric, reversible, anti-oscillating defeasibility operators.
// The B2 fix the VERIFY board hardened:
//   * CONTESTED is a FLAG (a SHOW, M5), NEVER a collapse. Marking a premise CONTESTED surfaces
//     a contest; it does not erase grounding. Dependent claims stay `valid:true` with status
//     CONTESTED (see validate.js). Only an ACTION that CONSUMES a contest is a high-stakes gate.
//   * BOTH legs are AUTHORIZED + anti-oscillating. Setting OR clearing the flag requires authz;
//     each state-flip must beat the previous flip's evidence strength (evidence_floor), so neither
//     side can ping-pong a premise for free ("cost the gaming, never the changing", L8).
//   * An OUT-OF-SCOPE counterexample is NOT a falsification (INV-5) — the premise is unchanged.
//
// `authz` is injected (the frame layer binds `by` to a verified-signed identity; spec §3.6):
//   authz = { isAuthorized(by, premise) => boolean }   (used for both FALSIFY and REPAIR)
//
// All operators are PURE: they return a NEW graph (immutability) or an { ok:false, reason }.

'use strict';

const { getNode, replaceNode } = require('./claim');
const { inScope } = require('../scope/scope');

function _checkAuthz(authz, by, premise) {
  return !!(authz && typeof authz.isAuthorized === 'function' && authz.isAuthorized(by, premise));
}

/**
 * FALSIFY a premise with an in-scope counterexample. Sets status CONTESTED (a FLAG).
 * @param {object} graph
 * @param {string} premiseId
 * @param {{counterexample:object, strength:number, by:string}} contest
 *        counterexample carries a `.point` ({dim:value}) tested against the premise scope.
 * @param {{isAuthorized:Function}} authz
 * @returns {{ok:false,reason:string}|{ok:true,graph:object}}
 */
function falsify(graph, premiseId, { counterexample, strength, by } = {}, authz) {
  const premise = getNode(graph, premiseId);
  if (!premise || premise.kind !== 'premise') return { ok: false, reason: 'unknown-premise' };
  if (!_checkAuthz(authz, by, premise)) return { ok: false, reason: 'unauthorized' };
  if (typeof strength !== 'number' || !Number.isFinite(strength) || !(strength > 0)) return { ok: false, reason: 'invalid-strength' };
  // out-of-scope counterexample is NOT a falsification (INV-5) — premise unchanged.
  if (!counterexample || !inScope(counterexample.point, premise.scope)) {
    return { ok: false, reason: 'out-of-scope' };
  }
  // anti-ping-pong: a state-flip must beat the previous flip's strength.
  if (!(strength > premise.evidence_floor)) return { ok: false, reason: 'insufficient-evidence' };
  const next = {
    ...premise,
    status: 'CONTESTED',                          // a FLAG, reversible — NOT a collapse
    contest: { by, strength, counterexample },
    evidence_floor: strength,
  };
  return { ok: true, graph: replaceNode(graph, next) };
}

/**
 * REPAIR (un-falsify) a CONTESTED premise (AGM revision; L8 repair-not-penalty). Authorized,
 * and the refutation must beat the contest's strength (escalation), so repair is never free.
 * @returns {{ok:false,reason:string}|{ok:true,graph:object}}
 */
function repair(graph, premiseId, { refutation, strength, by } = {}, authz) {
  const premise = getNode(graph, premiseId);
  if (!premise || premise.kind !== 'premise') return { ok: false, reason: 'unknown-premise' };
  if (premise.status !== 'CONTESTED') return { ok: false, reason: 'not-contested' };
  if (!_checkAuthz(authz, by, premise)) return { ok: false, reason: 'unauthorized' };
  if (typeof strength !== 'number' || !Number.isFinite(strength) || !(strength > 0)) return { ok: false, reason: 'invalid-strength' };
  void refutation; // carried for the record; the strength is the gate in v0
  // anti-ping-pong: the refutation must STRICTLY beat the contest that set the flag.
  if (!(strength > premise.evidence_floor)) return { ok: false, reason: 'insufficient-evidence' };
  const next = {
    ...premise,
    status: 'ACTIVE',
    contest: null,
    evidence_floor: strength,
  };
  return { ok: true, graph: replaceNode(graph, next) };
}

module.exports = { falsify, repair };
