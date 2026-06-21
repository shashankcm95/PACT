#!/usr/bin/env node
'use strict';

// PACT v0 — ATMS unit tests (Stage B gate): scope algebra, graph, VALIDATE (acyclicity-first,
// derivation-soundness, MEET scope, grounding status), FALSIFY/REPAIR (flag-not-collapse, authz
// both legs, escalating-evidence anti-ping-pong), contradiction (surface not suppress).

const assert = require('node:assert/strict');
const scope = require('../../src/scope/scope');
const { makePremise, makeClaim, createGraph, addNode, getNode } = require('../../src/atms/claim');
const { validate, appliesAt } = require('../../src/atms/validate');
const { falsify, repair } = require('../../src/atms/falsify');
const { recordContradiction } = require('../../src/atms/nogood');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   - ' + name); }
  catch (e) { fail++; console.error('  FAIL - ' + name + '\n         ' + (e && e.message)); }
}

const HUMAN = 'human:alice';
const authz = { isAuthorized: (by, premise) => by === premise.creator || by === 'root:trusted' };

function gravityScope() {
  return { constraints: { altitude_km: { kind: 'interval', lo: 0, hi: 10 }, v_c: { kind: 'interval', lo: 0, hi: 0.1 } }, edge_confidence: 0.95 };
}
function dragScope() {
  return { constraints: { v_ms: { kind: 'interval', lo: 0, hi: 50 }, density: { kind: 'interval', lo: 1, hi: 1e9 } }, edge_confidence: 0.80 };
}

// ---- scope algebra ----
test('scope.meet of compatible scopes is non-empty; edge_confidence = min', () => {
  const m = scope.meet(gravityScope(), dragScope());
  assert.equal(scope.isEmpty(m), false);
  assert.equal(m.edge_confidence, 0.80);
});

test('scope worked example: in-scope point passes, out-of-scope point fails (INV-5)', () => {
  const m = scope.meet(gravityScope(), dragScope());
  assert.equal(scope.inScope({ altitude_km: 5, v_c: 0.01, v_ms: 30, density: 5 }, m), true);
  assert.equal(scope.inScope({ altitude_km: 5, v_c: 0.01, v_ms: 100, density: 5 }, m), false); // v_ms outside [0,50]
});

test('scope.meet of incompatible intervals is EMPTY', () => {
  const a = { constraints: { v_ms: { kind: 'interval', lo: 0, hi: 50 } }, edge_confidence: 1 };
  const b = { constraints: { v_ms: { kind: 'interval', lo: 100, hi: 200 } }, edge_confidence: 1 };
  assert.equal(scope.isEmpty(scope.meet(a, b)), true);
});

// ---- graph + content-address ----
test('makePremise / makeClaim ids are content-addresses (stable + distinct)', () => {
  const p1 = makePremise({ statement: 'g~9.8', scope: gravityScope(), creator: HUMAN });
  const p1b = makePremise({ statement: 'g~9.8', scope: gravityScope(), creator: HUMAN });
  assert.equal(p1.id, p1b.id);
  assert.match(p1.id, /^[a-f0-9]{64}$/);
  const c = makeClaim({ content: 'parabola', premises: [p1.id] });
  assert.notEqual(c.id, p1.id);
});

test('graph is immutable (addNode returns a new graph)', () => {
  const g0 = createGraph();
  const p = makePremise({ statement: 's', scope: gravityScope(), creator: HUMAN });
  const g1 = addNode(g0, p);
  assert.equal(getNode(g0, p.id), null, 'original graph must be unchanged');
  assert.ok(getNode(g1, p.id));
});

// ---- VALIDATE ----
function buildClaimGraph() {
  let g = createGraph();
  const p1 = makePremise({ statement: 'g~9.8 const', scope: gravityScope(), creator: HUMAN });
  const p2 = makePremise({ statement: 'air-drag~0', scope: dragScope(), creator: HUMAN });
  g = addNode(g, p1); g = addNode(g, p2);
  const claim = makeClaim({ content: 'projectile follows a parabola', premises: [p1.id, p2.id] });
  g = addNode(g, claim);
  return { g, p1, p2, claim };
}

test('VALIDATE: a well-formed claim is VALID_GIVEN its premises', () => {
  const { g, claim } = buildClaimGraph();
  const v = validate(g, claim.id);
  assert.ok(v.valid, v.reason);
  assert.equal(v.status, 'VALID_GIVEN');
  assert.equal(v.label.length, 2);
});

test('VALIDATE: a dangling antecedent is rejected (derivation not sound)', () => {
  let g = createGraph();
  const claim = makeClaim({ content: 'x', premises: ['deadbeef'.repeat(8)] });
  g = addNode(g, claim);
  const v = validate(g, claim.id);
  assert.equal(v.valid, false);
  assert.match(v.reason, /dangling-antecedent/);
});

test('VALIDATE: an empty derived scope is rejected (no valid domain)', () => {
  let g = createGraph();
  const p1 = makePremise({ statement: 'slow', scope: { constraints: { v_ms: { kind: 'interval', lo: 0, hi: 50 } }, edge_confidence: 1 }, creator: HUMAN });
  const p2 = makePremise({ statement: 'fast', scope: { constraints: { v_ms: { kind: 'interval', lo: 100, hi: 200 } }, edge_confidence: 1 }, creator: HUMAN });
  g = addNode(g, p1); g = addNode(g, p2);
  const claim = makeClaim({ content: 'impossible', premises: [p1.id, p2.id] });
  g = addNode(g, claim);
  const v = validate(g, claim.id);
  assert.equal(v.valid, false);
  assert.match(v.reason, /empty-derived-scope/);
});

test('VALIDATE: a justification CYCLE is REJECTED, never walked (B3 acyclicity, fail-closed)', () => {
  // Hand-construct two claims referencing each other (content-addressed builders cannot form a
  // natural cycle; this models an adversarial/malformed graph).
  const A = { id: 'A'.repeat(64).toLowerCase(), kind: 'claim', content: 'a', premises: ['b'.repeat(64)] };
  const B = { id: 'b'.repeat(64), kind: 'claim', content: 'b', premises: ['a'.repeat(64)] };
  let g = createGraph(); g = addNode(g, A); g = addNode(g, B);
  const v = validate(g, A.id);
  assert.equal(v.valid, false);
  assert.match(v.reason, /cycle-detected/);
});

test('appliesAt: inside derived scope ok; outside BLOCKED', () => {
  const { g, claim } = buildClaimGraph();
  assert.equal(appliesAt(g, claim.id, { altitude_km: 5, v_c: 0.01, v_ms: 30, density: 5 }).ok, true);
  const out = appliesAt(g, claim.id, { altitude_km: 5, v_c: 0.01, v_ms: 100, density: 5 });
  assert.equal(out.ok, false);
  assert.match(out.reason, /BLOCKED/);
});

// ---- FALSIFY / REPAIR ----
const inScopeCex = { point: { altitude_km: 5, v_c: 0.01 } };       // inside gravityScope
const outScopeCex = { point: { altitude_km: 999, v_c: 0.01 } };    // altitude outside [0,10]

test('FALSIFY: authorized in-scope counterexample flags the premise CONTESTED (not collapsed)', () => {
  const { g, p1, claim } = buildClaimGraph();
  const r = falsify(g, p1.id, { counterexample: inScopeCex, strength: 5, by: HUMAN }, authz);
  assert.ok(r.ok, r.reason);
  assert.equal(getNode(r.graph, p1.id).status, 'CONTESTED');
  // the dependent claim is still VALID (not erased) — just flagged CONTESTED (spec §3.5).
  const v = validate(r.graph, claim.id);
  assert.equal(v.valid, true);
  assert.equal(v.status, 'CONTESTED');
});

test('FALSIFY: an UNauthorized caller is rejected; premise stays ACTIVE', () => {
  const { g, p1 } = buildClaimGraph();
  const r = falsify(g, p1.id, { counterexample: inScopeCex, strength: 5, by: 'mallory' }, authz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unauthorized/);
  assert.equal(getNode(g, p1.id).status, 'ACTIVE');
});

test('FALSIFY: an OUT-OF-SCOPE counterexample does NOT falsify (INV-5)', () => {
  const { g, p1 } = buildClaimGraph();
  const r = falsify(g, p1.id, { counterexample: outScopeCex, strength: 5, by: HUMAN }, authz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /out-of-scope/);
  assert.equal(getNode(g, p1.id).status, 'ACTIVE');
});

test('FALSIFY is immutable (original graph unchanged)', () => {
  const { g, p1 } = buildClaimGraph();
  falsify(g, p1.id, { counterexample: inScopeCex, strength: 5, by: HUMAN }, authz);
  assert.equal(getNode(g, p1.id).status, 'ACTIVE');
});

test('REPAIR: authorized + escalating evidence restores ACTIVE', () => {
  const { g, p1 } = buildClaimGraph();
  const f = falsify(g, p1.id, { counterexample: inScopeCex, strength: 5, by: HUMAN }, authz);
  const r = repair(f.graph, p1.id, { refutation: {}, strength: 6, by: HUMAN }, authz);
  assert.ok(r.ok, r.reason);
  assert.equal(getNode(r.graph, p1.id).status, 'ACTIVE');
});

test('REPAIR: UNauthorized caller is rejected', () => {
  const { g, p1 } = buildClaimGraph();
  const f = falsify(g, p1.id, { counterexample: inScopeCex, strength: 5, by: HUMAN }, authz);
  const r = repair(f.graph, p1.id, { refutation: {}, strength: 6, by: 'mallory' }, authz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unauthorized/);
});

test('ANTI-PING-PONG: a repair with non-escalating evidence is rejected', () => {
  const { g, p1 } = buildClaimGraph();
  const f = falsify(g, p1.id, { counterexample: inScopeCex, strength: 5, by: HUMAN }, authz);
  const weak = repair(f.graph, p1.id, { refutation: {}, strength: 5, by: HUMAN }, authz); // == floor
  assert.equal(weak.ok, false);
  assert.match(weak.reason, /insufficient-evidence/);
  const strong = repair(f.graph, p1.id, { refutation: {}, strength: 6, by: HUMAN }, authz);
  assert.ok(strong.ok);
  // a SECOND contest must now beat 6 (escalation ladder), so strength 6 is rejected.
  const reFalsifyWeak = falsify(strong.graph, p1.id, { counterexample: inScopeCex, strength: 6, by: HUMAN }, authz);
  assert.equal(reFalsifyWeak.ok, false);
  assert.match(reFalsifyWeak.reason, /insufficient-evidence/);
});

// ---- contradiction (surface, never suppress) ----
test('recordContradiction surfaces a preference, suppresses nothing (M5)', () => {
  const { g, claim } = buildClaimGraph();
  let g2 = g;
  const other = makeClaim({ content: 'NOT a parabola', premises: claim.premises });
  g2 = addNode(g2, other);
  const r = recordContradiction(g2, claim.id, other.id, { strengthA: 9, strengthB: 2 });
  assert.ok(r.ok, r.reason);
  assert.equal(r.prefer ?? r.preference.prefer, claim.id);
  assert.equal(r.surfaced, true);
  // both claims still validate (nothing auto-suppressed)
  assert.equal(validate(g2, claim.id).valid, true);
  assert.equal(validate(g2, other.id).valid, true);
});

// ---- post-build VALIDATE folds ----
test('FAIL-CLOSED: a DEEP claim chain does NOT throw — acyclicity stays fail-closed (BLOCKER)', () => {
  // Build a ~12000-deep linear claim chain (would blow the native stack with a recursive DFS).
  // Built directly (not via addNode) to keep the read-only test O(D) rather than O(D^2).
  const D = 12000;
  const p = makePremise({ statement: 'leaf', scope: gravityScope(), creator: HUMAN });
  const nodes = { [p.id]: p };
  let prev = p.id;
  for (let i = 0; i < D; i++) {
    const id = i.toString(16).padStart(64, '0');
    nodes[id] = { id, kind: 'claim', content: 'c' + i, premises: [prev] };
    prev = id;
  }
  const g = { nodes };
  const v = validate(g, prev);
  assert.equal(v.valid, true, 'a deep acyclic chain validates without throwing'); // no RangeError
  // and a cycle is still REJECTED (not crash) — the fail-open the hacker probe found.
  let g2 = createGraph();
  const a = { id: 'a'.repeat(64), kind: 'claim', content: 'a', premises: ['d'.repeat(64)] };
  const b = { id: 'd'.repeat(64), kind: 'claim', content: 'b', premises: ['a'.repeat(64)] };
  g2 = addNode(g2, a); g2 = addNode(g2, b);
  assert.match(validate(g2, a.id).reason, /cycle-detected/);
});

test('VALIDATE: a zero-premise claim is REJECTED (no ungrounded axiom)', () => {
  let g = createGraph();
  const c = makeClaim({ content: 'axiom', premises: [] });
  g = addNode(g, c);
  const v = validate(g, c.id);
  assert.equal(v.valid, false);
  assert.match(v.reason, /claim-has-no-premises/);
});

test('IMMUTABILITY: getNode returns a frozen node (a caller cannot corrupt status)', () => {
  const { g, p1 } = buildClaimGraph();
  const n = getNode(g, p1.id);
  assert.throws(() => { n.status = 'CONTESTED'; }, 'mutating a frozen node must throw in strict mode');
  assert.equal(getNode(g, p1.id).status, 'ACTIVE');
});

test('FALSIFY: Infinity strength is rejected (would permanently lock the premise)', () => {
  const { g, p1 } = buildClaimGraph();
  const r = falsify(g, p1.id, { counterexample: inScopeCex, strength: Infinity, by: HUMAN }, authz);
  assert.equal(r.ok, false);
  assert.match(r.reason, /invalid-strength/);
});

test('PROPAGATION (depth-2 DAG): contesting a leaf premise flags a claim two hops up', () => {
  // P  <-  C1 (claim on P)  <-  C2 (claim on C1).  Falsify P => C2 must read CONTESTED.
  let g = createGraph();
  const P = makePremise({ statement: 'g~9.8', scope: gravityScope(), creator: HUMAN });
  g = addNode(g, P);
  const C1 = makeClaim({ content: 'mid', premises: [P.id] });
  g = addNode(g, C1);
  const C2 = makeClaim({ content: 'top', premises: [C1.id] });
  g = addNode(g, C2);
  assert.equal(validate(g, C2.id).status, 'VALID_GIVEN');
  const f = falsify(g, P.id, { counterexample: inScopeCex, strength: 3, by: HUMAN }, authz);
  assert.ok(f.ok, f.reason);
  const v = validate(f.graph, C2.id);
  assert.equal(v.valid, true, 'still derivable, not collapsed');
  assert.equal(v.status, 'CONTESTED', 'contestedness propagates transitively across intermediate claims');
});

test('recordContradiction rejects a self-contradiction (idA === idB)', () => {
  const { g, claim } = buildClaimGraph();
  assert.equal(recordContradiction(g, claim.id, claim.id).ok, false);
});

console.log(`\n[atms] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
