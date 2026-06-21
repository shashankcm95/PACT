// PACT v0 — scope/scope.js  (spec §3.4)
//
// The domain-of-validity algebra. A scope is a conjunction of TYPED CONSTRAINTS over named
// dimensions plus a graded edge_confidence. MEET (intersection) is the claim's derived scope;
// possibilistic-min is the confidence combinator (weakest-link). All decidable, all pure.
//
//   scope := { constraints: { <dim>: constraint }, edge_confidence: number in [0,1] }
//   constraint := { kind:'interval', lo:number, hi:number }   // lo <= x <= hi
//                | { kind:'set', values:[...] }                // x in values  (enum = set)

'use strict';

function _isNum(x) { return typeof x === 'number' && Number.isFinite(x); }

// Intersect two constraints on the SAME dimension. Returns an (possibly unsatisfiable)
// constraint; mismatched kinds intersect to the explicit empty marker.
function _meetConstraint(a, b) {
  if (a.kind === 'interval' && b.kind === 'interval') {
    return { kind: 'interval', lo: Math.max(a.lo, b.lo), hi: Math.min(a.hi, b.hi) };
  }
  if (a.kind === 'set' && b.kind === 'set') {
    const bset = new Set(b.values);
    return { kind: 'set', values: a.values.filter((v) => bset.has(v)) };
  }
  return { kind: 'empty' }; // mixed kinds on one dim are incompatible -> unsatisfiable
}

function _constraintEmpty(c) {
  if (!c || typeof c !== 'object') return true;
  if (c.kind === 'empty') return true;
  if (c.kind === 'interval') return !(_isNum(c.lo) && _isNum(c.hi)) || c.lo > c.hi;
  if (c.kind === 'set') return !Array.isArray(c.values) || c.values.length === 0;
  return true; // unknown kind -> treat as unsatisfiable (fail-closed)
}

function _constraintSatisfied(c, value) {
  if (_constraintEmpty(c)) return false;
  if (c.kind === 'interval') return _isNum(value) && value >= c.lo && value <= c.hi;
  if (c.kind === 'set') return c.values.includes(value);
  return false;
}

/**
 * MEET of two scopes: per-dimension constraint intersection; a dim present in only one scope
 * is carried; edge_confidence = MIN (possibilistic weakest-link). The result may be empty
 * (isEmpty) if any dimension intersects to nothing.
 */
function meet(a, b) {
  const constraints = {};
  const dims = new Set([...Object.keys(a.constraints || {}), ...Object.keys(b.constraints || {})]);
  for (const d of dims) {
    const ca = a.constraints && a.constraints[d];
    const cb = b.constraints && b.constraints[d];
    if (ca && cb) constraints[d] = _meetConstraint(ca, cb);
    else constraints[d] = ca || cb;
  }
  const eca = typeof a.edge_confidence === 'number' ? a.edge_confidence : 1;
  const ecb = typeof b.edge_confidence === 'number' ? b.edge_confidence : 1;
  return { constraints, edge_confidence: Math.min(eca, ecb) };
}

/** MEET of an array of scopes (the claim's derived scope = MEET over ancestral premise scopes). */
function meetAll(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return { constraints: {}, edge_confidence: 1 }; // no premises -> unconstrained, full confidence
  }
  return scopes.reduce((acc, s) => meet(acc, s));
}

/** True iff the scope has NO valid domain (some dimension intersected to empty). */
function isEmpty(scope) {
  if (!scope || typeof scope !== 'object' || !scope.constraints) return true;
  return Object.values(scope.constraints).some(_constraintEmpty);
}

/**
 * Is `point` (a { dim: value } map) inside `scope`? Every dimension the scope CONSTRAINS must
 * be present in the point and satisfy its constraint (conservative: a missing constrained dim
 * is out-of-scope — we cannot confirm membership we cannot evaluate).
 */
function inScope(point, scope) {
  if (isEmpty(scope)) return false;
  if (!point || typeof point !== 'object') return false;
  for (const [dim, c] of Object.entries(scope.constraints)) {
    if (!(dim in point)) return false;
    if (!_constraintSatisfied(c, point[dim])) return false;
  }
  return true;
}

module.exports = { meet, meetAll, isEmpty, inScope };
