---
lifecycle: persistent
created: 2026-06-22
wave: foundational pivot #1 — U2 seam-harden + estimator interface-contract RFC
status: PLAN (pre-VERIFY)
---

# U2 lift-point seam-CORRECTNESS + estimator interface-contract RFC (NARROWS/readies; does NOT harden trust)

> Naming note (VERIFY honesty fold): the verb is **seam-correctness** (a code-quality act), deliberately NOT
> "seam-harden" — so no bare "U2 ... harden" substring survives an excerpt and gets misread as "hardens trust"
> (forbidden under NS-7). This wave hardens CODE CORRECTNESS, never TRUST.

> The first wave of the FOUNDATIONAL pivot (USER chose trust-hardening over more narrowing). Per the
> north-star OQ-NS-6 law (NS-7): in-process code NARROWS trust; only a world-anchored signal HARDENS it.
> U2 (epistemic independence) is "world-anchored only, never in-process-modeled" — so it CANNOT be built
> in-process. The only legitimate near-term U2 work is (a) HARDEN the single lift-point so the forward
> contract is true in code, and (b) RESEARCH-PREP the world-anchored hook (an RFC). This wave does both.

## §0 Frame — the OQ-NS-6 honesty banner (read first)

**This wave does NOT harden trust and does NOT close (or progress toward closing) U2.** By law it cannot:
only a world-anchored substrate-diversity signal hardens epistemic independence (NS-7), and this is a pure
in-process correctness refactor + a design doc. Epistemic independence stays **permanently WEAK and gates
nothing**; `convert.actionable` stays `false`; `mayGate` still refuses every high-stakes caller. Per NS-9
(narrowed is NEVER reported as closed), every artifact of this wave must read as **seam-ready / NARROW**,
never "U2 progressed." The ONLY move that hardens is the cross-uid custody deployment — and that already
happened (the custody-real milestone) and hardens non-exfiltration, **not** U2.

## §1 The confirmed defect (firsthand-probed this session — §6 has the probes)

`epistemicIndependence()` (`weak-flag.js:55-57`) is the **designated SOLE P5 lift-point** — its own header
(`weak-flag.js:50-53`) says "the WEAK flag lifts here and ONLY here." But that contract is **FALSE in code**:
`independenceLabel()` (`weak-flag.js:16-23`) returns `epistemic: 'WEAK'` (line 19) and `overall: 'WEAK'`
(line 21) as **hardcoded string literals** — it never calls `epistemicIndependence()`. The three real
downstream producers all consume the *label*, not the lift-point: `convert.js:88`, `cross-verify.js:81`,
`cross-verify.js:110`. Only `mayGate` (`weak-flag.js:41`) reads through the lift-point.

**Consequence (a latent P5-swap drift):** when the world-anchored U2 estimator eventually replaces
`epistemicIndependence()`, the label's hardcoded literals would NOT lift — `convert`/`cross-verify` would
keep emitting `epistemic:'WEAK'`/`overall:'WEAK'`, **would silently diverge from the lifted verdict (a latent
P5-swap hazard — it CANNOT fire today; there is no estimator yet to diverge FROM)**. The P4
sequencing guard (`trust.test.js:285-290`) pins `epistemicIndependence()`, `mayGate`, and
`convert.actionable` — but **NOT** the `independenceLabel().epistemic === epistemicIndependence()` identity.
So the drift is currently unguarded.

## §2 Part (a) — DERIVE every open-axis verdict from its lift-point, don't hardcode it

Change `independenceLabel` so BOTH open axes (epistemic AND config-stability) derive from a lift-point, via an
INJECTED SEAM (the seam is what makes the derivation testable — see §3/§4 / arch-CRITICAL):

```
function independenceLabel({ topological }, { verdictFn = epistemicIndependence, configFn = configStability } = {}) {
  const epistemic = verdictFn();            // the SOLE U2 lift-point (default); a test injects a sentinel
  const config_stability = configFn();      // the SOLE config-stability lift-point (default)
  const top = typeof topological === 'number' ? topological : 0;   // computed Menger count (NOT a verdict)
  const overall = (epistemic === 'WEAK' || config_stability === 'WEAK') ? 'WEAK' : 'WEAK';
  //                                                                              ^^^^^^ <computed> is
  //  EXPLICITLY 'WEAK' until a FUTURE wave defines non-WEAK overall semantics. A strong `topological` COUNT
  //  must NEVER alone flip overall to non-WEAK (topological is a count, not a verdict — the L4
  //  authenticity!=independence landmine in structural form; the rule reads ALL verdict axes, never `top`).
  return { topological: top, epistemic, config_stability, overall };
}
```

- **arch-HIGH fold — config_stability is NOT left a literal.** Add a SIBLING lift-point `function
  configStability() { return 'WEAK'; }` exported alongside `epistemicIndependence`, and derive
  `config_stability` from it. Without this the wave would fix the epistemic half and leave an
  IDENTICALLY-SHAPED two-sources-of-truth landmine on the config axis — the exact defect §1 indicts. ~3 lines;
  makes the single-lift-point contract true for BOTH open axes.
- **arch-CRITICAL fold — the injected seam.** `independenceLabel` and `epistemicIndependence` live in the
  SAME module, so a same-module call binds to the lexical local, NOT `module.exports` — a test CANNOT stub it
  by monkeypatching the export or re-`require`-ing (the existing `mayGate` is un-stubbable for exactly this
  reason — proof, not precedent). The optional `{ verdictFn, configFn }` params (defaulting to the lift-points)
  are the clean DI seam: production callers pass nothing (the three consumers are unchanged — default args);
  the test injects a sentinel to PROVE derivation. KISS: two optional params, no new export beyond the sibling.
- `topological` stays the computed Menger value (unchanged).

**Zero behavior change today** — but as a GREEN-GATE CONSEQUENCE, not a standalone adjective (honesty fold):
both lift-points return `'WEAK'`, so every output is identical to the current hardcoded version IFF the
post-refactor 229-suite is green AND no existing `'WEAK'` assertion changes value (the §3 guard + the full
suite are what verify it). The value is **forward**: the single-lift-point contract becomes machine-true for
both open axes — when an estimator lands at P5, the label lifts everywhere, no silent divergence; and nothing
else changes. (Immutability preserved: still returns a fresh object; no mutation.)

## §3 Part (a) — the guard: machine-pin derivation (via the seam, non-vacuously)

Extend the P4 sequencing guard (`trust.test.js`) with a NET-NEW assertion that proves DERIVATION through the
injected seam — not vacuous value-equality (both sides are literally `'WEAK'` today, so a plain
`independenceLabel().epistemic === epistemicIndependence()` would pass even against the OLD hardcoded impl):

- **Derivation proof (the load-bearing assertion):** `independenceLabel({ topological: 99 }, { verdictFn: ()
  => 'STRONG-TEST', configFn: () => 'STRONG-TEST' })` ⇒ `label.epistemic === 'STRONG-TEST'` AND
  `label.config_stability === 'STRONG-TEST'`. Against the CURRENT hardcoded impl the injected fns are ignored
  → the label returns `'WEAK'` → the assertion is **RED** (proves the wiring is absent). Post-refactor it
  reads the injected sentinel → GREEN (proves the label DERIVES). This is the only assertion shape that
  proves wiring rather than coincident values.
- **Default-path identity:** `independenceLabel({ topological: 99 }).epistemic === epistemicIndependence()`
  (default args ⇒ the label IS the lift-point's verdict) + `.config_stability === configStability()`.
- **`overall` consistency:** any-WEAK-axis ⇒ `overall === 'WEAK'`; and a strong `topological` count alone
  does NOT flip overall (assert `independenceLabel({ topological: 999 }).overall === 'WEAK'`).
- Mirror the `mayGate`-is-unconsumed assertion (per `grounding.test.js:574`) so no action path consumes
  `mayGate`'s true-branch as authorization.

## §4 Part (a) — TDD order

1. Write the derivation-proof guard FIRST (the sentinel-injection assertion above), against the current
   hardcoded `independenceLabel`. **OBSERVE IT RED** and capture the failing output (the DoD requires the RED
   observation be recorded in §10 — a derivation-proof never seen red is itself unverified).
2. Add the `configStability()` sibling lift-point + the `{ verdictFn, configFn }` seam + the derive bodies.
   Run → the guard goes GREEN (proves derivation).
3. Keep the FULL v0 suite green (**229 tests** — measured this session; re-run `npm test` at the green step,
   do not trust the count across the build). Zero behavior change ⇒ every existing `'WEAK'` label assertion
   still holds; if any flips, the byte-identity claim is FALSIFIED (stop + investigate).

## §5 Part (b) — the RFC: `research/23-u2-estimator-interface-contract.md`

Codify the **world-anchored-only** interface contract the future substrate-diversity estimator must satisfy,
so a later wave cannot quietly build the FORBIDDEN in-process modeled version:

1. **Signature evolution:** `epistemicIndependence()` (zero-arity) → `epistemicIndependence(record | axesCtx)`
   per-record. The zero-arity→per-record change is a forward-contract item (a per-record estimator needs the
   record's evidence provenance). Document the migration so the single-lift-point invariant survives it.
   **Reconcile with part (a):** the injected `verdictFn` default IS the migration anchor — the per-record
   estimator becomes the new default `verdictFn` (and `configFn` for the config axis); the two waves compose
   (this wave installs the seam, a future wave swaps the default), no separate refactor.
2. **The world-anchored-only constraint (the core of the RFC):** the estimator MUST consume a world-anchored
   signal (real substrate/model-family/source-corpus/checkpoint diversity). **No topological / config /
   physical-coordinate / crypto-distinctness proxy may substitute for axis 4** — those are U1-scarcity or
   topology, NOT epistemic independence (cite `research/13` REJECT_FOR_U2). An in-process modeled estimator
   is forbidden (OQ-NS-6: would only NARROW).
3. **Invariants the estimator must preserve:** `overall = WEAK if ANY axis WEAK` stays COMPUTED (never a
   literal — exactly what part (a) makes true); `mayGate` stays AUTHORITATIVE (voids the caller label); the
   P3 stakes-throne must be named + bound BEFORE any gate consumes a non-WEAK verdict (NS-8). **The label is
   the SOLE derivation site (arch-MED fold):** consumers (`convert`, `cross-verify`) read the LABEL, and MUST
   NOT call the estimator directly — even a per-record estimator, even when they hold the record. A direct
   call re-scatters the epistemic judgment — the precise drift §1 indicts, one level up.
4. **The FORBIDDEN-substitution list (the live-correctness-cliff guard), explicit:** never read AND(axes 1-3)
   as axis 4; never read a topological/config score as epistemic; never let `convert.actionable` flip until
   per-path-unforgeable-bar AND the world-anchored estimator AND the stakes-throne all exist. **Plus two the
   actual code makes tempting (arch-MED fold):** (i) never read `n_confirmers` / a disjoint-human COUNT as
   epistemic independence — `cross-verify.js:110` passes `topological: nConfirmers` with the honest caveat "k
   minted roots fabricate k"; a high confirmer count is U1-scarcity-defeated topology, NOT evidence
   disjointness; (ii) never read a SELF-ASSERTED provenance (the `config_stability` axis, or the §5.5
   CONFIRM-provenance field) as world-anchored — integrity != provenance (NS-2); disjointness is world-anchored
   ONLY if the provenance is.
5. **A genuine candidate input, named not chosen:** the CONFIRM evidence-provenance field (add an
   evidence-provenance field to the CONFIRM record so `cross-verify` can measure evidence DISJOINTNESS) —
   the one direction that touches the actual open U2 axis. RFC records it as a candidate + its honest caveat
   (disjointness is only world-anchored if the PROVENANCE is; a self-asserted provenance field only narrows).
   Deferred behind this lighter wave; a strong input to the estimator design.

## §6 Runtime Probes (firsthand — this session, against the repo NOW)

- **P1** `independenceLabel` hardcodes the verdict: `weak-flag.js:19` (`epistemic: 'WEAK'`) + `:21`
  (`overall: 'WEAK'`) are string literals; the fn never calls `epistemicIndependence()`. CONFIRMED (read).
- **P2** `epistemicIndependence()` is the sole lift-point: `weak-flag.js:55-57`, header `:50-53`. CONFIRMED.
- **P3** consumers bypass the lift-point via the label: `convert.js:88`, `cross-verify.js:81`,
  `cross-verify.js:110` all call `independenceLabel(...)`; only `mayGate` (`weak-flag.js:41`) reads the
  lift-point. CONFIRMED (grep).
- **P4** the P4 guard does NOT pin the label-vs-lift-point identity: `trust.test.js:285-290` asserts
  `epistemicIndependence()==='WEAK'`, `mayGate` refuses, `convert.actionable` false — but no
  `independenceLabel().epistemic === epistemicIndependence()`. CONFIRMED (read).
- **P5** real test count is **229** (`npm test` → `14 files · 229 passed`), not the recon's guessed 153.
  CONFIRMED (ran this session; re-run at the green step — do not trust the count across the build).
- **P6 (confirm at build, not now):** the `research/23` slot is the next free integer — `ls research/` before
  authoring (research/ runs to 22; 23 is plausibly free but a collision would silently overwrite). arch-LOW.

## §7 DoD

- [ ] `independenceLabel` derives BOTH open axes (`epistemic` from `epistemicIndependence()`, `config_stability`
      from the new sibling `configStability()`) + `overall` from the axes (never a literal); `topological`
      stays the computed count.
- [ ] **byte-identity as a green-gate CONSEQUENCE** (honesty fold — not a standalone adjective): FALSIFIED-IF
      the post-refactor 229-suite is not green OR any existing `'WEAK'` label assertion changes value. Baseline
      229 = the pre-refactor run; re-run post-refactor as the gate.
- [ ] the derivation-proof guard (sentinel-injection via `{verdictFn, configFn}`) was **OBSERVED RED against
      the pre-refactor impl** — paste the failing assertion output in §10 (a derivation-proof never seen red is
      itself unverified).
- [ ] `research/23-u2-estimator-interface-contract.md` authored — AND the VALIDATE honesty lens CONFIRMS the
      world-anchored-only constraint reads as **FORBIDDEN** (not "discouraged"/"preferred") and the
      forbidden-substitution list is exhaustive against `research/13` REJECT_FOR_U2. (The RFC's register is an
      AUDITED output, not an author presence-checkbox.)
- [ ] every artifact reads as NARROW/seam-ready (NS-9); U2 + config-stability stay WEAK + gate nothing is
      stated LOUD; no line claims this hardens trust or progresses/closes U2.
- [ ] VALIDATE board (§8) folded + full 229-gate green + (no CodeRabbit until PR).

## §8 VALIDATE plan (post-build)

3-lens board over the diff + RFC: **code-reviewer** (the derivation refactor + the non-vacuous guard
correctness + immutability) · **honesty-auditor** (THE critical lens: claim-vs-evidence that nothing here is
reported as hardening / U2-progress; the RFC's world-anchored-only constraint is stated, not hedged) ·
**architect** (forward-contract soundness of the RFC signature + the single-lift-point invariant survives the
zero-arity→per-record migration). Then the full 229-suite + the north-star §6 drift pre-flight.

## §9 VERIFY board (pre-build) — RECORDED 2026-06-22

2-lens board (architect + honesty — proportionate to a SHADOW correctness refactor + RFC where the honesty
register is the central risk). All findings folded above.

**architect — VERDICT BUILD-WITH-CHANGES:**
- [CRITICAL] the proposed export-monkeypatch / re-`require` stub CANNOT test derivation — `independenceLabel`'s
  same-module call to `epistemicIndependence()` binds to the lexical local, not `module.exports` (`mayGate` is
  un-stubbable for exactly this reason). FOLDED §2/§3/§4: an injected `{verdictFn, configFn}` DI seam (default
  = the lift-points; the test injects a sentinel; production consumers unchanged via default args).
- [HIGH] leaving `config_stability` a hardcoded literal re-introduces the IDENTICAL two-sources-of-truth
  landmine the wave fixes. FOLDED §2: a sibling `configStability()` lift-point; both open axes now derive.
- [MED] make `overall`'s `<computed>` explicit (`'WEAK'`) + a comment that a topological COUNT never alone
  flips overall (the L4 landmine). FOLDED §2.
- [MED] RFC must state the label is the SOLE derivation site (consumers never call the estimator directly,
  even per-record); reconcile the `verdictFn` default as the migration anchor. FOLDED §5.1/§5.3.
- [MED] forbidden-list missing two the code makes tempting: `n_confirmers`-as-independence
  (`cross-verify.js:110`) + self-asserted-provenance-as-world-anchored. FOLDED §5.4.
- [LOW] confirm the `research/23` slot at build (`ls research/`). FOLDED §6-P6.

**honesty-auditor — VERDICT HONEST-WITH-FIXES (grade A-, "§0 banner exemplary"):**
- [LOW] the title's bare "harden" survives excerpting (harden-seam vs harden-trust collision). FOLDED: title
  is now "seam-CORRECTNESS" + a naming note; no bare "U2 ... harden" substring remains.
- [MED] "byte-identical" asserted as a standalone property on a single un-pinned run -> scope it to a
  green-gate CONSEQUENCE. FOLDED §2 + §7-DoD.
- [LOW] the derivation-guard's non-vacuity is a plan-promise until OBSERVED RED. FOLDED §4 + §7-DoD (paste the
  RED output in §10).
- [MED, "most damaging if unfixed"] the RFC's world-anchored-only HARD constraint living only as a
  self-attesting DoD presence-checkbox -> make the FORBIDDEN register an AUDITED VALIDATE output. FOLDED §7-DoD.
- [LOW] "silently diverging" over-tenses a future hazard. FOLDED §1.

**Disposition:** BUILD. The architect's CRITICAL (the test mechanism could not work) + HIGH (the half-fix
landmine) materially changed the build; both honesty MEDs hardened the falsifiability. Proceed to TDD with the
injected-seam mechanism.

## §10 VALIDATE board (post-build) — RECORDED 2026-06-22

### OBSERVED RED (DoD §7 — the derivation guard seen red against the pre-refactor impl)

The `DERIVATION GUARD` test, run against the pre-refactor hardcoded `independenceLabel` (before the DI seam),
failed on its first (load-bearing) assertion — proving the wiring was absent (the label ignored the injected
`verdictFn`):

```
FAIL - DERIVATION GUARD: independenceLabel derives epistemic + config_stability from the lift-points (not literals)
       epistemic DERIVES from the injected verdict fn (the U2 lift-point seam)
       + actual - expected
       + 'WEAK'
```

After the seam refactor it is GREEN (reads the injected sentinel). A derivation-proof that was never seen red
is itself unverified — this paste discharges that DoD obligation.

### Board verdicts (2-lens — code-reviewer + honesty; honesty was DoD-mandated to audit the RFC register)

**code-reviewer — VERDICT SHIP-WITH-NITS** (0 CRITICAL / 0 HIGH):
- [MED] the guard proves `epistemic`/`config_stability` derivation but NOT `overall` (both ternary branches
  are 'WEAK' today) — a forward gap. FOLDED: a NOTE on the `overall` line (weak-flag.js) + the test assertion
  naming the future-wave obligation (add a non-WEAK-branch sentinel assertion or it re-introduces a literal).
- [LOW] default-param hoisting CONFIRMED correct (hoisted fn decls; a `const` arrow would TDZ — noted).
  [LOW] `TODO(P5): <computed>` inline marker added for forward-discoverability. [LOW] object shape
  byte-identical to pre-refactor (non-finding). [LOW] default-path identity assertions are load-bearing
  against a future default-substitution.

**honesty-auditor — VERDICT HONEST-WITH-FIXES** (the FORBIDDEN register HOLDS — DoD gate PASSES):
- The DoD gate: `research/23` §3 reads verbatim *"An in-process modeled estimator is FORBIDDEN. Not
  discouraged, not 'prefer world-anchored' — FORBIDDEN."* + §5 "may EVER / is NOT / NEVER" — zero hedging.
  The forbidden register is hard, audited, confirmed.
- [HIGH] the `lesson-confirm.js:25` citation in §5.4 is NOT a PACT-local file (it lives in the PARENT
  power-loom substrate; inherited from research/13/18/12). Presenting it as "the repo already ships" is a
  cross-repo path passed as PACT-local live code. FOLDED: re-attributed to `research/13` + flagged as the
  parent-substrate origin, "do not cite as live PACT code." (KNOWN INHERITED issue: research/13/18/12 carry
  the same stale cross-repo cite — out of THIS wave's scope; left as a tracked pre-existing artifact.)
- [HIGH] §10 RED-observation was empty (DoD unmet). FOLDED: the OBSERVED-RED paste above.
- [LOW x5] CLEARING checks: research/13 REJECT_FOR_U2 citation accurate (not embellished); §5 forbidden-list
  exhaustive vs research/13 (+ adds n_confirmers + LLM-judge); zero-behavior-change honestly framed
  (green-gate consequence); U2-stays-WEAK residual LOUD in all artifacts; RFC does not over-claim its status
  (CONFIRM-provenance "named, NOT chosen").

**Disposition:** SHIP. 0 CRITICAL/HIGH-code; the 2 honesty HIGHs (dead cross-repo cite + empty RED paste) are
FOLDED; the code MED (overall-not-proven) is annotated as a future-wave obligation. The FORBIDDEN register —
the wave's load-bearing forward guarantee — is verbatim-confirmed. NARROWS/readies; does NOT harden trust.
