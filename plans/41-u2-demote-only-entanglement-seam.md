# plans/41 — the U2 demote-only entanglement-detector SEAM (SHADOW, dormant, byte-identical)

> **OQ-NS-6 / NS-9 honesty banner (read first).** This wave builds the FORWARD CONTRACT for a demote-only
> entanglement signal. It is IN-PROCESS, so per NS-7 it can only ever **NARROW**, never harden — and in this
> wave the detector ships **dormant** (default never-fires), so live behaviour is **byte-identical** and it
> narrows *nothing yet*. It gates nothing: `convert.actionable` stays hard-`false`; `mayGate` stays fail-closed.
> "Narrowed" is never "closed"; this readies a hook, it does not advance or close U2 (which stays permanently WEAK).

## §1 Objective

Reshape the U2 lift-point from a zero-arity literal `WEAK` to the honest **demote-only** range
`{WEAK, ENTANGLEMENT-DETECTED}` (`research/24` §4.1, `research/23` §1 AMENDED), and wire the demotion SINK so a
future real signal can count a correlated confirmer set as **fewer** independent confirmations without
re-plumbing. The detector is DORMANT (a DI predicate defaulting to never-fires). **Two deliverables, both
valuable independently:** (a) the honest RANGE change removes the substrate's temptation to build the forbidden
positive estimator (`research/23` §1, `research/24` §7 — "stop reserving the lift-point for a POSITIVE
estimator"); (b) the dormant SINK is the seam a named future signal requires (`research/24` §4.1: "the current
lift-point only ever LIFTS WEAK, it has no seam to demote BELOW it").

**NOT built (deferred, named — LOUD):** the actual BEI/CIG behavioral MEASURE (needs live-agent outputs + a
probe battery — `research/24` §6); the TEE distinctness axis (throne-bound); the CONFIRM-provenance carrier
(FORK-3). **No positive branch** — `epistemicIndependence()` must NEVER return a positive STRONG.

## §2 Runtime probes (verified firsthand 2026-07-04)

- `weak-flag.js:66-68` → `epistemicIndependence()` literal `'WEAK'`, zero-arity; `independenceLabel` derives
  `epistemic` through it (the `plans/12` DI seam). CONFIRMED.
- `weak-flag.js:47-52` → `mayGate` calls `epistemicIndependence()` **zero-arg** + voids the caller label. CONFIRMED.
- `cross-verify.js:89-101,110` → confirmer set = `perHumanDecay` (keyed by `rootOf`); `rConfirmers =
  Σ values`, `nConfirmers = .size`; label built `independenceLabel({topological:nConfirmers})`. There are TWO
  label sites: the FLOOR `independenceLabel({topological:0})` at `:81` + the live one at `:110`. CONFIRMED.
- **`strength = expectation(opinion(rConfirmers,0))` is MONOTONE INCREASING in `rConfirmers`** (VERIFY-hacker
  probe: r=2→0.75, r=3→0.80). So ANY re-count that raises `rConfirmers` raises `strength` — a promote. CONFIRMED.
- **Downstream blast radius** (VERIFY): `crossVerify(...).r`/`.strength` feed `verification-strength.js:56`
  (weakest-link MIN), `premise-score.js:59` (SL `r`-leg), `creator-standing.js:89` (agg). A demotion propagates
  into all three by design. CONFIRMED.
- `convert.js:142` builds `independenceLabel({topological:dp})` with NO confirmerSet; `actionable:false` at
  `:149`. CONFIRMED — convert is topological, not a confirmer sink, and must stay `epistemic:'WEAK'`.
- `research/23` §4.3 → consumers read the LABEL, MUST NOT call the estimator directly. §4.4 → negative verdict
  EXEMPT from the stakes-throne. §5.3 → a confirmer COUNT is NEVER axis-4. CONFIRMED.

## §3 Design (hardened — folds the 2-lens VERIFY board, §7)

### §3.1 The lift-point (`weak-flag.js`) — demote-only range, exact-set normalization, totality, mayGate-exempt

`epistemicIndependence(confirmerSet, { detectorFn = detectEntanglement } = {})`, in strict order:

1. **Undefined-guard FIRST (VERIFY F1/H2 — mayGate + convert structurally exempt):**
   `if (confirmerSet == null) return 'WEAK';` — a zero-arg call (`mayGate`) or a no-confirmerSet consumer
   (`convert`) NEVER reaches the detector. The demote path is *unreachable* without a confirmerSet.
2. **Totality (VERIFY H1):** `let ret; try { ret = detectorFn(confirmerSet); } catch { return 'WEAK'; }` — a
   throwing/hostile detector on the read path (attacker-controlled store bytes) fails to `'WEAK'`, never throws.
3. **Exact-set normalization — NO positive branch (VERIFY C2/F6):** honor a demote ONLY on the exact shape
   `ret && typeof ret==='object' && ret.flag === 'ENTANGLEMENT-DETECTED' && Array.isArray(ret.entangled)` →
   return a NEW `{ flag:'ENTANGLEMENT-DETECTED', entangled:<sanitized copy of string keys> }`. **Anything else —
   `{flag:'STRONG'}`, `{independent:true}`, `'STRONG'`, `true`, `1`, a malformed `entangled` — → `'WEAK'`.**
   There is no code path that returns a positive; the normalization is a strict equality on the `flag` string,
   never a truthiness test.
- `detectEntanglement(confirmerSet)` → returns `'WEAK'` for every input (DORMANT default — byte-identity).
- `independenceLabel({topological}, { verdictFn=epistemicIndependence, configFn=configStability, confirmerSet }={})`:
  `const epistemic = verdictFn(confirmerSet);` threads the set (undefined for convert/mayGate → `'WEAK'`).
  **`overall` still collapses to `'WEAK'`** — the `(epistemic==='WEAK' || config==='WEAK')` predicate is
  object-safe (a demote OBJECT `!== 'WEAK'` → falls to the pinned-WEAK else-branch; VERIFY F5). No positive can
  flip `overall`.
- `mayGate` **UNCHANGED** — reads `epistemicIndependence()` zero-arg → step-1 guard → `'WEAK'` → fail-closed.
  Structurally exempt even if a future default detector is armed (it passes no confirmerSet).

### §3.2 The demotion SINK (`cross-verify.js`) — max-with-removal, monotonic clamp, single-map

- The FLOOR label (`:81`) is NOT threaded (no confirmers) — stays `independenceLabel({topological:0})`.
- Live path: `const confirmerSet = [...perHumanDecay.keys()];` (distinct human confirmers);
  `const label = independenceLabel({ topological: nConfirmers }, { confirmerSet });`
- Demote ONLY on the exact shape (VERIFY C2): `if (label.epistemic && label.epistemic.flag === 'ENTANGLEMENT-DETECTED')`:
  - **Collapse formula (VERIFY C1 + VALIDATE H1/M1 — MANDATORY):** build `demoted = new Map(perHumanDecay)`
    (NEW map, no mutation — VERIFY M2). For each cluster: take the members present in `demoted`, **DE-DUPLICATED**
    (`[...new Set(cluster.filter(has))]` — a dup `[k,k]` must not re-read a deleted key → `max(w,undefined)=NaN`,
    VALIDATE H1); if `<= 1` distinct member, skip; else `w = max(member weights)`, DELETE all member keys, and
    accumulate the cluster into a SEPARATE `clusterR += w` / `clusterN += 1` — **NOT** a synthetic map entry
    (a `u2-cluster:N` key can collide with a real `rootOf` id — VALIDATE M1). A cluster contributes `max`, never
    a sum; members removed, never double-counted.
  - Derive: `rDemoted = clusterR + Σ demoted.values()`, `nDemoted = demoted.size + clusterN`. **`strength` is
    NOT separately clamped — it is DERIVED once from the clamped `rConfirmers` (§below); because
    `expectation(opinion(r,0))` is monotone-increasing in `r`, the r-clamp guarantees strength can only
    hold-or-lower** (VALIDATE F2 — no third clamp needed; the monotonicity is the load-bearing dependency).
  - **Monotonic clamp (VERIFY C1 + VALIDATE H1 `Number.isFinite` guard, "can only tighten"):**
    `rConfirmers = isFinite(rDemoted) ? min(rConfirmers,rDemoted) : rConfirmers`, same for `nConfirmers`. A
    demote can only hold-or-LOWER; a stray NaN (which the bare `min` cannot catch — NaN comparisons are false)
    fails to the pre-demote value.
- **Disarmed** (default detector → `'WEAK'`, not the demote shape) → NO collapse → byte-identical `r`/`n`/`strength`.

### §3.3 Darkness witness (BEHAVIORAL-only — VERIFY F4)

The structural "imported by exactly one" tripwire is **N/A** here (the seam is woven into live paths:
`weak-flag.js` has 2 importers; `cross-verify` output has 3 downstream readers). The witness is behavioral:
- **(a) disarmed byte-identity at the DOWNSTREAM boundary** (VERIFY F3): a fixed confirmer set yields identical
  `crossVerify` AND identical `verificationStrength` / `premiseScore` / `creatorStanding` outputs vs pre-seam.
- **(b) armed propagation** (RED-capable): an injected sentinel detector that flags a cluster demotes AND the
  demotion propagates down (lower `verificationStrength`/`premiseScore`) — proving the seam is live end-to-end.
- **(c) no positive / monotonic**: no detector return raises any weight (the clamp holds); no positive branch exists.

## §4 Decomposition (files)

| File | Change |
|---|---|
| `v0/src/independence/weak-flag.js` | demote-only `epistemicIndependence(confirmerSet,{detectorFn})` (undefined-guard → try/catch → exact-set normalize); `detectEntanglement` dormant default; `independenceLabel` threads `confirmerSet`; `overall` object-safe WEAK; `mayGate` unchanged. |
| `v0/src/grounding/cross-verify.js` | thread `confirmerSet` at the LIVE label only; **union-find connected-component** collapse (max-with-removal, deterministic/order-independent — CodeRabbit Major) + `Number.isFinite` monotonic clamp + single demoted map; byte-identical disarmed. |
| `v0/test/unit/weak-flag.test.js` (NEW) | RED-first — §5. |
| `v0/test/integration/grounding.test.js` (extend) | the behavioral witness is FOLDED HERE (not a standalone file — VALIDATE F1): disarmed byte-identity + armed propagation through cross-verify, `premiseScore`, and `creatorStanding` (2 of the 3 named downstream consumers; `verificationStrength` reads the clamped `.strength`, covered transitively). Plus the VALIDATE H1 dup-member + M1 no-shadow regressions. |

**Blast radius (named — VERIFY F3):** `verification-strength.js`, `premise-score.js`, `creator-standing.js`
read `crossVerify().r/.strength` — the demotion flows into them (intended); the witness pins both disarmed and armed.

## §5 TDD test plan (RED-first — encodes the VERIFY fixes)

1. **Dormant default** → `epistemicIndependence(set)` = `'WEAK'` for every input.
2. **Exact-set / no-promote (C2/F6):** `{flag:'STRONG'}`, `{flag:'INDEPENDENT'}`, `'STRONG'`, `true`, `1`,
   `{flag:'ENTANGLEMENT-DETECTED'}`-with-garbage-`entangled` → ALL `'WEAK'`/no-demote; ONLY the exact shape demotes.
   ZERO promote across the set.
3. **Monotonic clamp (C1 — the load-bearing test):** an armed sentinel flagging a 2-member cluster →
   `r_after ≤ r_before` AND `n_after ≤ n_before` AND `strength_after ≤ strength_before`. A test that constructs a
   would-be set-union inflate and asserts the clamp holds it to the original (fails a naive sum-recount).
4. **Totality (H1):** a throwing detector AND a detector returning a cyclic/oversized object → `crossVerify`
   returns the disarmed result, NEVER throws (non-vacuous: witness the throw swallowed).
5. **Disarmed byte-identity** at cross-verify AND the 3 downstream consumers (F3).
6. **Armed propagation (F3):** a flagged cluster lowers `verificationStrength`/`premiseScore`.
7. **`mayGate` zero-arg unchanged** even with an armed default detector (F1/H2) — still refuses every high-stakes caller.
8. **`convert.epistemic` always `'WEAK'`** (no confirmerSet — F2).
9. **`overall` stays WEAK** for a demote object; the existing `grounding.test.js` overall-WEAK assertion still passes (F5).
10. **Immutability (M2):** the original `perHumanDecay` is unchanged after the sink runs.
11. **Witness RED-capable** on default-swap (arming the sentinel as the default demotes → the witness goes RED).

## §6 Guards / invariants

NS-9 (narrows only; dormant ⇒ narrows nothing yet; never promotes) · §4.3 sole-derivation (detector inside the
label; sink reads the label) · §5.3 (negative re-count, count never read as axis-4) · L4 (absence = WEAK; no
positive branch) · NS-8 carve-out (negative tightens only) · **C1 monotonic clamp (can only tighten)** · **C2
exact-set normalization** · **H1 totality (never throws)** · **M2 immutability (new map, single derivation)** ·
byte-identical disarmed · `actionable` untouched hard-`false` · `mayGate`/`convert` structurally exempt.

## §7 VERIFY board (2-lens, pre-build) — FOLDED 2026-07-04

- **architect — SOUND-WITH-CHANGES.** F1 mayGate/convert exemption (undefined-guard) · F2 label emits a
  VERDICT not cross-verify re-count mechanics (+ convert-exempt invariant) · F3 blast-radius witness at the 3
  downstream consumers · F4 behavioral-only witness (structural tripwire N/A) · F5 object-safe `overall` · F6
  exact-set detector return · F7 not-YAGNI (the range change is the directed forward action). ALL FOLDED (§3).
- **hacker — NEEDS-REVISION (folded to build-ready).** **C1 CRITICAL** the sum-recount inflate (a set-union
  collapse promotes; probed r 2.4→3.3) → max-with-removal + monotonic clamp (§3.2) + the RED test 3. **C2
  CRITICAL** `independenceLabel` passes `epistemic` unnormalized → normalize in `epistemicIndependence` + sink
  exact-match (§3.1/§3.2) + RED test 2. **H1** hostile-detector throw → try/catch → WEAK (§3.1) + RED test 4.
  **H2** two label sites + zero-arg mayGate → FLOOR not threaded + undefined-guard (§3.1/§3.2). **M1** →
  residual §9. **M2** single-map immutability (§3.2) + RED test 10. Gate direction confirmed SOUND (no promote
  reaches `actionable`/`mayGate`). ALL FOLDED.

## §8 VALIDATE board (3-lens, post-build) — FOLDED 2026-07-04 (633→636, suite green)

- **hacker Rule-2a — CHANGES-REQUIRED (folded).** Built live probes + a 200k fuzz against the BUILT modules.
  **0 promotes** (the clamp is unbeatable), no throw escapes, disarmed byte-identity intact. **H1 HIGH (the
  false-green catch):** a DUPLICATE cluster member `[[k,k]]` drove `r` to NaN (deleted key re-read →
  `max(w,undefined)`), floating `strength` to the forbidden novice 0.5 and — summed unguarded in
  `creator-standing.js:89` — a denial-of-standing. The suite's own C1 test passed anyway (it asserts `<=` on
  the finite `n`, never `isFinite(r)`). FIXED: dedup members + `Number.isFinite` clamp guard + RED regression.
  **M1 MEDIUM:** synthetic `u2-cluster:N` key collided with a real `rootOf` id → FIXED by dropping the synthetic
  key (separate `clusterR/clusterN` accumulation). **M2 fragility:** single-read TOCTOU — pinned with a comment.
- **code-reviewer — SHIP-WITH-NITS (folded).** Confirmed by probe: the collapse (no inflate), overlapping
  clusters (safe by construction), the clamp, immutability, totality, 633/0. Flagged the same M1 collision
  (MEDIUM, fixed above). LOW: `independenceLabel(null)` throws on destructure — PRE-EXISTING, unchanged by this
  diff, out of scope → residual §9.
- **honesty-auditor — A- / NS-9 CLEAN (folded).** No harden-as-progress; no-positive-branch shown-not-stated;
  byte-identity + `actionable`-untouched verified; deferred MEASURE + M1 arming named loud. F1 (witness scope
  over-claim vs the built coverage) → §3.3/§4 re-narrated + `creatorStanding` witness added. F2 (the 3-quantity
  clamp is really a 2-clamp + a monotone strength derivation) → §3.2 re-narrated.
- **CodeRabbit (async PR bot) — 2 folded (636→637).** **Major** (`cross-verify.js`): overlapping clusters
  `[[A,B],[B,C]]` made the collapse ORDER-DEPENDENT (`r` varied by cluster order) → replaced the per-cluster
  loop with a UNION-FIND connected-components merge (deterministic; also subsumes the H1 dedup) + an
  order-independence RED test. **Minor** (`weak-flag.js`): `epistemicIndependence(_, null)` threw on the param
  destructure before the totality guard (a real gap in this PR's new 2-arg signature) → `opts || {}` + a RED
  test. Both premise-probed valid before folding.

## §9 Residuals (LOUD — NS-9)

- The real entanglement MEASURE is DEFERRED (needs live-agent-output infra) — this is a dormant seam.
- **(VERIFY M1) The eventual detector activation must be a DEPLOY-GATED crossing** (a fail-closed arming
  predicate, mirroring the sibling substrate's `LOOM_WORLD_ANCHOR_ARM`), NOT a bare code-default reassignment;
  and the demote path must emit an OBSERVABLE signal when it fires (a silent `strength` drop is un-auditable —
  fail-closed-must-be-observable). Named here; the arming wave owns it.
- Dormant ⇒ narrows NOTHING yet; HARDENS nothing (in-process, NS-7). `epistemicIndependence()` stays permanently
  WEAK; U2 gates nothing; `convert.actionable` stays hard-`false`. Even once a detector lands, it NARROWS —
  only a world-anchored signal hardens (none exists).
- **(VALIDATE code-rev LOW, pre-existing — out of scope here)** `independenceLabel(null/undefined)` and
  `mayGate(label, null)` throw on destructuring (unchanged by this diff; no live caller passes such a value). If
  H1's totality is ever to extend to the full public surface of `weak-flag.js`, a follow-up should default-guard
  those params.
- **(VALIDATE F1) the behavioral witness covers `premiseScore` + `creatorStanding` (2 of 3 named downstream
  consumers); a dedicated `verificationStrength` propagation witness is DEFERRED to the arming wave** (it reads
  the clamped `.strength`, so it inherits the guarantee transitively today, but has no direct regression guard).
