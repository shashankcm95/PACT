# research/23 — the U2 (epistemic-independence) estimator interface contract

> **Status:** forward-contract spec (the interface a FUTURE world-anchored estimator must satisfy). Authored
> in the `plans/12` wave alongside the lift-point seam-correctness fix. **NOT** an estimator — by law there
> is no in-process estimator (see §3).
>
> **OQ-NS-6 honesty banner (read first):** this document NARROWS/readies; it does **NOT** harden trust and
> does **NOT** progress or close U2. U2 (epistemic independence) stays permanently **WEAK** and gates
> nothing; `convert.actionable` stays `false`; `mayGate` refuses every high-stakes caller. Per NS-9
> (narrowed is NEVER reported as closed), this RFC must read as *seam-ready*, never "U2 advanced." Its whole
> purpose is to make the world-anchored-only constraint a **hard, audited boundary** so a future wave cannot
> quietly build the FORBIDDEN in-process modeled version.

## §1 The seam this contract governs (post-`plans/12`)

`epistemicIndependence()` (`v0/src/independence/weak-flag.js`) is the **single lift-point** — the SOLE
function the U2 estimator replaces. After `plans/12`, `independenceLabel` DERIVES its `epistemic` (and its
sibling `config_stability`) verdict through that lift-point via a DI seam
(`independenceLabel(axes, { verdictFn = epistemicIndependence, configFn = configStability })`), so when the
estimator lands the label lifts everywhere — "the WEAK flag lifts here and ONLY here" is now true in code.
The three consumers (`convert.js`, `cross-verify.js` x2) read the LABEL, never the lift-point directly.

## §2 Signature evolution (the only API change the estimator needs)

- **Today:** `epistemicIndependence()` — zero-arity, returns `'WEAK'`.
- **At P5:** `epistemicIndependence(record | axesCtx)` — per-record. A real estimator needs the record's
  evidence provenance to judge "is THIS record's evidence independent of the corroborating set?"
- **Migration anchor:** the per-record estimator becomes the new default `verdictFn` of `independenceLabel`
  (the `plans/12` DI seam). Installing the estimator is a one-line default swap + the per-record plumbing —
  NOT a re-scatter of epistemic judgments across consumers. The single-lift-point invariant survives the
  zero-arity -> per-record change BECAUSE the label remains the sole derivation site (§4).

## §3 The world-anchored-only constraint (the CORE — a HARD boundary, not a preference)

**An in-process modeled estimator is FORBIDDEN.** Not discouraged, not "prefer world-anchored" — FORBIDDEN.
Per OQ-NS-6 / NS-7, an in-process signal can only NARROW trust; an estimator that *models* independence from
in-process features (graph topology, config hashes, self-asserted metadata, an LLM-judge's opinion) would be
a narrowing signal masquerading as the gate-enabler, and wiring it to lift the WEAK flag would let
`convert.actionable` flip on a signal that does not HARDEN — the exact NS-8 violation the whole substrate is
built to prevent.

The estimator MUST consume a **world-anchored** substrate-diversity signal — a real, out-of-band fact about
whether two agents' evidence is produced by genuinely different *model family + source corpus + checkpoint*
(the axis U2 actually cares about). What "world-anchored" requires here is an open research problem (the
SIGNAL itself is out of scope for this contract — see §7); this RFC fixes only that the estimator's INPUT
must be one, and names what may NEVER substitute for it (§5).

## §4 Invariants the estimator MUST preserve

1. **`overall` stays COMPUTED, never a literal** — WEAK if ANY verdict axis is WEAK (exactly what `plans/12`
   made true). A strong `topological` COUNT must never alone flip `overall` (a count is not a verdict).
2. **`mayGate` stays AUTHORITATIVE** — it reads the lift-point directly and voids the caller-supplied label
   (a forged `{overall:'STRONG'}` must never unlock a gate).
3. **The label is the SOLE derivation site** — consumers (`convert`, `cross-verify`) read the LABEL and MUST
   NOT call the estimator directly, *even a per-record estimator, even when they hold the record*. A direct
   call re-scatters the epistemic judgment — the precise drift `plans/12` §1 indicts, one level up.
4. **Sequencing (NS-8):** the P3 stakes-throne (the high-stakes threshold) must be named + bound, AND a
   per-path unforgeable bar must exist, BEFORE any gate consumes a non-WEAK verdict. The estimator landing
   does NOT by itself license `convert.actionable` to flip.

## §5 The FORBIDDEN-substitution list (the live-correctness-cliff guard)

None of these may EVER be read as epistemic independence (axis 4). Each is a named landmine:

1. **`AND(axis1, axis2, axis3)` is NOT axis 4.** Scarcity + topology + config-stability, however strong,
   never compose into epistemic independence (`weak-flag.js` header; INV-16).
2. **A `topological` score is NOT epistemic.** Menger disjoint-path count is graph structure, not evidence
   independence.
3. **`n_confirmers` / a disjoint-human COUNT is NOT epistemic independence.** `cross-verify.js:110` passes
   `topological: nConfirmers` with the honest inline caveat "k minted roots fabricate k" — a high confirmer
   count is U1-scarcity-defeated topology, not evidence disjointness. (The single most tempting wrong
   substitution given the actual code.)
4. **Physical coordinates / hardware attestation are NOT epistemic independence** (`research/13`
   `REJECT_FOR_U2`). Remote attestation proves *which binary* runs, never *what it does or which weights load*
   — two TEE-attested machines on opposite continents can pull identical weights from the identical endpoint
   and produce byte-correlated assessments while every layer certifies them "distinct." Worse, the
   certificate DISARMS skepticism (L4/L7): N correlated agents *look* independent with a signed proof. The
   "byte-distinct != logically-independent" lesson is recorded in `research/13` (it originated as a code
   comment in the PARENT power-loom substrate PACT was derived from — NOT a PACT-local file; do not cite it
   as live PACT code).
5. **A SELF-ASSERTED provenance is NOT world-anchored** (integrity != provenance, NS-2). The
   `config_stability` axis (a self-asserted `config_hash`, no attestation) and the §6 CONFIRM-provenance
   field are world-anchored ONLY if the provenance itself is independently anchored — a record asserting its
   own substrate diversity proves nothing.
6. **An LLM-judge's opinion of independence is NOT world-anchored** — it is an in-process model output (the
   §3 forbidden class); a model judging whether two model-outputs are independent is correlated-by-construction.

## §6 A candidate estimator INPUT — named, NOT chosen

**The CONFIRM evidence-provenance field.** Add an evidence-provenance field to the CONFIRM record so
`cross-verify` could measure evidence DISJOINTNESS — the one direction that touches the actual open U2 axis,
riding the already-built authenticated-minter signal. **Honest caveat (per §5.5):** disjointness is
world-anchored ONLY if the provenance is world-anchored; a self-asserted provenance field only NARROWS. This
is recorded as a candidate INPUT to a future estimator, NOT as the estimator and NOT as a decision — it is a
heavier producer-schema change deferred behind the `plans/12` seam fix. (Tracked in `docs/FORKS.md` FORK-2.)

## §7 Residuals (LOUD — NS-9)

- **U2 epistemic independence stays WEAK and gates nothing.** This contract readies a hook; it does not
  estimate, harden, or close.
- **The world-anchored substrate-diversity SIGNAL itself remains OPEN** and out of scope — this RFC fixes the
  interface + the forbidden boundary, not the signal. Finding a real world-anchored diversity signal is the
  unsolved frontier (`PACT-NORTH-STAR.md` §4 U2).
- **`config_stability` is also OPEN** (its own future lift-point); it is WEAK for the same honest reason.
- This document is SHADOW: it constrains a future build, gates nothing today.
