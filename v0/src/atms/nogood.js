// PACT v0 — atms/nogood.js  (spec §3.6)
//
// Contradiction handling. When two claims are asserted to contradict, record a NOGOOD (the joint
// environment cannot hold) + an ATTACK relation + a PREFERENCE order — and SURFACE all of it.
// Per M5 (show, don't decide): adjudication NEVER auto-suppresses the loser; the receiver weighs
// the surfaced record. The preference is a HINT (by evidence strength, then creator standing),
// not a verdict. v0 keeps this minimal — it is not on the v0 DoD critical path, but it makes the
// "surface not suppress" discipline concrete so a later phase cannot silently add auto-suppression.

'use strict';

const { getNode } = require('./claim');

/**
 * Record a contradiction between two claims. Returns a SURFACED record; mutates nothing and
 * suppresses nothing.
 * @param {object} graph
 * @param {string} idA
 * @param {string} idB
 * @param {{strengthA?:number, strengthB?:number, standingA?:number, standingB?:number}} [evidence]
 * @returns {{ok:false,reason:string}|{ok:true, nogood:string[], attack:[string,string], preference:object}}
 */
function recordContradiction(graph, idA, idB, evidence = {}) {
  if (idA === idB) return { ok: false, reason: 'self-contradiction: idA === idB' };
  const a = getNode(graph, idA);
  const b = getNode(graph, idB);
  if (!a || a.kind !== 'claim') return { ok: false, reason: 'not-a-claim: ' + idA };
  if (!b || b.kind !== 'claim') return { ok: false, reason: 'not-a-claim: ' + idB };

  const sA = typeof evidence.strengthA === 'number' ? evidence.strengthA : 0;
  const sB = typeof evidence.strengthB === 'number' ? evidence.strengthB : 0;
  const stA = typeof evidence.standingA === 'number' ? evidence.standingA : 0;
  const stB = typeof evidence.standingB === 'number' ? evidence.standingB : 0;

  // preference order: by evidence strength, tie-break by creator standing. A HINT only.
  let prefer = 'undecided';
  if (sA !== sB) prefer = sA > sB ? idA : idB;
  else if (stA !== stB) prefer = stA > stB ? idA : idB;

  return {
    ok: true,
    nogood: [idA, idB].sort(),         // the joint environment that cannot hold together
    attack: [idA, idB],                // the symmetric attack relation (Dung/ASPIC+)
    preference: { prefer, basis: sA !== sB ? 'strength' : (stA !== stB ? 'standing' : 'none') },
    surfaced: true,                    // NEVER auto-suppressed — the receiver decides (M5)
  };
}

module.exports = { recordContradiction };
