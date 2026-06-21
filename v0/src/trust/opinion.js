// PACT P2 — trust/opinion.js  (spec §5 — Subjective Logic)
//
// A Subjective Logic opinion ω = (b, d, u) with b + d + u = 1, plus a base rate a. Mapped from
// evidence (r positive, s negative) via the standard binomial-to-opinion form:
//   b = r/(r+s+W),  d = s/(r+s+W),  u = W/(r+s+W),   expectation E = b + a*u.
// The uncertainty u is HIGH when evidence is sparse (r+s small) — this IS the novice/cold-start
// signal (decision #4). A pure Sybil (r=s=0) has b=0 → contributes 0 to wcons (the load-bearing property).

'use strict';

const { PRIOR_WEIGHT, BASE_RATE, ALPHA_SATURATION } = require('./params');

/**
 * An opinion from evidence counts. Carries r,s so callers can read the interaction count (for the
 * DIRECT/CONSENSUS blend's confidence term).
 * @param {number} r non-negative positive-evidence weight
 * @param {number} s non-negative negative-evidence weight
 */
function opinion(r, s, W = PRIOR_WEIGHT, a = BASE_RATE) {
  const rr = Math.max(0, r) || 0;
  const ss = Math.max(0, s) || 0;
  const total = rr + ss + W;
  return { b: rr / total, d: ss / total, u: W / total, a, r: rr, s: ss };
}

/** Expected value (point estimate) E = b + a*u. */
function expectation(op) {
  return op.b + op.a * op.u;
}

/** The non-informative novice opinion (r=s=0 → b=0, u=1). */
function novice() {
  return opinion(0, 0);
}

/**
 * Confidence in a derived opinion, rising with its evidence count: α = n/(n+SAT). ~0 for a novice
 * (one cheap interaction → tiny α), →1 for a rich history. Used both as the DIRECT/CONSENSUS blend
 * weight (model.js) and as the per-voucher probation floor (consensus.js — a single cheap claim
 * yields tiny voucher weight, so persona-multiplication cannot launder wcons).
 */
function alpha(interactionCount) {
  const n = Math.max(0, interactionCount) || 0;
  return n / (n + ALPHA_SATURATION);
}

module.exports = { opinion, expectation, novice, alpha };
