// PACT — trust/decay.js  (extracted at the coherence checkpoint)
//
// A pure time-decay combinator (epoch ms -> exponential weight). It depends ONLY on the half-life
// constant — it is NOT trust-scoring logic — so it lives in its own leaf rather than inside direct.js.
// This removes the conceptually-wrong import edge the coherence board flagged: the grounding layer was
// compile-depending on the P2 trust-scoring module (direct.js) just to get this math. Now direct.js and
// every grounding fold import it from here (a stable pure-leaf, alongside params.js + standing.js).

'use strict';

const { DECAY_HALF_LIFE_MS } = require('./params');

/**
 * Exponential time-decay weight. A record without a numeric `t` is full-weight (within-session
 * fallback, P2 decision #6). A future `t` clamps to full weight (dt floored at 0) — conservative for
 * the advisory/SHADOW posture; when decay ever GATES an action, reject `t > now + skew` instead.
 * @param {{t?:number}} rec
 * @param {number} now epoch ms
 * @returns {number} weight in (0, 1]
 */
function decayWeight(rec, now) {
  if (typeof rec.t !== 'number' || typeof now !== 'number') return 1;
  const dt = Math.max(0, now - rec.t);
  return Math.pow(0.5, dt / DECAY_HALF_LIFE_MS);
}

module.exports = { decayWeight };
