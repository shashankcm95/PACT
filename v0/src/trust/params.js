// PACT P2 — trust/params.js
//
// The single home for P2's named, bound trust constants (NOT in identity/presence.js — that owns cap
// policy; SRP). Depends on nothing (clean DAG leaf). RATIFIED 2026-06-21.

'use strict';

module.exports = {
  DECAY_HALF_LIFE_MS: 30 * 24 * 60 * 60 * 1000, // 30 days — DIRECT evidence half-life (decision #2)
  CRATER_MULTIPLIER: 3,                          // a disjoint-corroborated caught defection weighs 3x (decision #2)
  DISJOINT_PATHS_K: 2,                           // CONVERT topological threshold (decision #3); topological-WEAK
  PRIOR_WEIGHT: 2,                               // Subjective Logic non-informative prior weight W (decision #4)
  BASE_RATE: 0.5,                                // Subjective Logic base rate a
  ALPHA_SATURATION: 5,                           // interaction count at which the DIRECT/CONSENSUS blend ~half-weights DIRECT
};
