---
lifecycle: persistent
plan: 40
created: 2026-07-04
depends-on: plans/39 (registration-gate) ; plans/36 + PR #48 (vouch-freshness totality) ; the two filters' "TOTAL: never throws" contract
audience: a build session (TDD -> validate -> PR)
title: Recs-side totality hardening -- close the hostile-Proxy-array iterator escape in BOTH read filters
---

# Plan 40 -- recs-side totality hardening (the systemic residual carried from PR #48)

## The gap (disclosed in PR #48's VALIDATE, INFO; probed firsthand)

Both read filters -- `trust/registration-gate.js` (`filterAnchoredRecords`) and `trust/vouch-freshness.js`
(`filterFreshVouches`) -- guard against a non-array `recs` with `if (!Array.isArray(recs)) return []`, then iterate
`for (const rec of recs)` with a PER-RECORD try/catch. But `Array.isArray` sees THROUGH a `Proxy`-over-array (returns
`true`), so a hostile `Proxy` whose `Symbol.iterator` / `length` / element get-trap THROWS escapes the per-record try
at the `for...of` itself -- propagating through `disjointPaths` / `convert` and DoS-ing the whole advisory readout.
Both modules advertise "TOTAL: never throws"; that contract is currently FALSE for such an in-memory hostile caller.

**Probe (firsthand, 2026-07-04):** `new Proxy([{...}], { get(t,k){ if (k===Symbol.iterator) throw ...; return t[k]; } })`
-> `Array.isArray` true -> `filterAnchoredRecords(hostile, {}, {sigmaRoots:{}})` THREW `iter-boom`. Confirmed shared by
BOTH filters.

**Severity: LOW / defense-in-depth.** UNREACHABLE on the live path -- `recs` comes from `read-gate.verifiedRecords`,
which returns a plain array parsed off disk from JSON (no getters, no Proxy). This closes a totality-contract gap for
an in-memory hostile caller + makes the two filters' stated contract honest; it is NOT a live-exploit fix.

## The fix (minimal, symmetric)

On the ARMED path of each filter, AFTER `if (!Array.isArray(recs)) return []`, materialize `recs` into a LITERAL
array via indexed reads inside a try, then iterate the copy:

```js
let list;
try {
  const len = recs.length >>> 0;                     // ToUint32; a hostile length getter throws HERE -> fail-closed
  list = [];
  for (let i = 0; i < len; i += 1) list[i] = recs[i]; // indexed reads into a LITERAL array; a hostile index getter throws -> caught
} catch { refuseAlert('recs-unreadable', { class: 'integrity', cause: 'recs-materialize-threw' }); return []; }
for (const rec of list) { /* per-record try/catch unchanged; `list` is a real literal array -> native iterator, safe */ }
```

Why a LITERAL indexed copy (NOT `Array.prototype.slice.call` -- CodeRabbit Major, premise-probed firsthand): `slice`
consults `recs.constructor[Symbol.species]`, which an array-backed Proxy can trap to return a hostile NON-array whose
`for...of` then throws OUTSIDE the try -- re-opening the exact leak (confirmed: `slice.call(speciesHostile)` returns
`isArray:false` and iterating it throws). A `[]` literal NEVER consults `constructor`/`@@species`, and indexed reads
never invoke `Symbol.iterator`, so the copy is (a) species-free, (b) iterator-free, and (c) fail-CLOSED on a throwing
`length`/index trap. `list` is a genuine literal array -> its `for...of` uses the native, un-hijackable iterator.

- **DISARMED path UNCHANGED** (both filters return `recs` before the arm branch) -> byte-identical for every caller.
- **ARMED path for a REAL array**: `slice.call` is a cheap shallow copy; same elements, same order, same output. The
  immutability contract holds (`recs` unmutated; `list` a copy; `out` a new array).
- **NS-9: none.** This is a pure totality/DoS robustness fix -- it gates nothing, narrows nothing, hardens nothing.
- **Residual (accepted, unreachable):** a `Proxy` with a fake HUGE `length` could DoS the `slice` allocation -- but the
  pre-fix `for...of` had the identical exposure, and it is unreachable live. Not chased (would need a magnitude cap that
  could bite a legitimate large array).

## Test controls (per filter)

1. **Regression:** a `Proxy`-over-array `recs` whose `Symbol.iterator` getter throws, ARMED -> `doesNotThrow` +
   fail-closed (processes the real elements OR `[]`); non-vacuous precondition (`Array.isArray(proxy)` is `true` AND the
   raw `for...of` would throw).
2. **Hostile length trap:** a `Proxy` whose `length` getter throws, ARMED -> `doesNotThrow` -> `[]` + a `recs-unreadable`
   alert.
3. **No regression:** a normal array armed -> identical output to pre-fix (same kept set); disarmed -> `=== recs`.

## Validation

TDD RED-first (the regression test throws against the pre-fix code) -> fix both -> full suite + eslint -> a firsthand
live-probe of BOTH built filters (iterator-trap + length-trap + normal-array no-regression). Single PR (one systemic
fix touching both filters); no multi-lens board -- LOW-severity mechanical defense-in-depth on an unreachable path
(persona-selection: one lens is enough for lower-stakes; the live-probe is the gate).

## Build result (2026-07-04, TDD RED-first)

SHIPPED: the species-free LITERAL indexed-copy materialize on the ARMED path of both `registration-gate.js`
(`filterAnchoredRecords`) and `vouch-freshness.js` (`filterFreshVouches`) + a `recs-side totality` regression test in
each unit suite covering three vectors -- a hostile `Symbol.iterator` Proxy (processed via the copy, no escape), a
hostile `length` Proxy (fail-closed `[]` + a `recs-unreadable` alert), and a `@@species`-hostile Proxy (each with a
non-vacuous precondition proving the raw `for...of` / the `slice.call` result throws). **RED-first honored** (both
tests threw against the pre-fix code). Full suite **620/0**, eslint clean; firsthand live-probe of both BUILT filters
(no escape on iterator/length/species, disarmed `=== recs` no regression, armed still filters).

**Pre-PR CodeRabbit CLI -- 1 Major FOLDED (the species vector), 1 Minor DECLINED (out of scope).**
- **Major (species-unsafe `slice.call`) -> FOLDED:** the first pass used `Array.prototype.slice.call`, which consults
  `constructor[@@species]` and can be steered to return a hostile non-array -> the `for...of` re-leaks. Premise-probed
  firsthand (confirmed the leak), then folded to the species-free literal indexed copy + a species regression test.
- **Minor (`docs/FORKS.md` revisit-trigger wording) -> DECLINED:** it flagged the USER's UNRELATED uncommitted Embers
  deferral note (not part of this diff; the CLI reviews the working tree). Left for the USER when they commit that note.

The two filters' "TOTAL: never throws" contract is now honest for an in-memory hostile caller; the live path is
unchanged (byte-identical).
