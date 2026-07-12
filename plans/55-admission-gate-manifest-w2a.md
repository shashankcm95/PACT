---
lifecycle: persistent
created: 2026-07-12
audience: this + future sessions — EPIC #96 arming-cluster, Wave 2a
epic: 96
builds: "the #82 (F7) structural close — rewire admission-gate.js to read its enable state from the Wave-1 resolveArmedContext, with an indeterminate tri-state so an unreadable/partial arm REJECTS (never admit-all). SHADOW / import-dark. Arms nothing."
adr: docs/ADRs/0001-fail-closed-arming-manifest.md
predecessor: plans/54 (Wave 1, merged #117)
---

# plans/55 — EPIC #96 Wave 2a: admission-gate consumes the fail-closed manifest (#82 / F7)

> **Scope guard (NS-7).** Rewires *how* the admission gate reads its arm state — **arms nothing**. No flag set,
> no gate flips, nothing operator-only touched. admission-gate stays import-dark (its structural darkness witness
> stays green). The manifest gains admission-gate as a consumer but remains itself dormant (no live arm reaches it).

## Context

Wave 1 (merged #117) built `resolveArmedContext` — the fail-closed, all-or-none, type-gated, immutable arming
preflight. It ships import-dark. **Wave 2a wires the FIRST consumer**: `admission-gate.js` reads its enable state
from the manifest instead of the 2-signal `armingDecision`. This closes **#82 (F7)** — "the armed admission gate
can silently disarm (admit-all) on a non-strict arm token" — because a garbage admission token now resolves to an
OBSERVABLE misconfig-and-fail-closed via `normalizeArmSignal`, not a silent disarm.

The load-bearing hazard (VERIFY board §7/H4 from Wave 1): admission-gate today REJECTS on an arm-read throw
(`admission-gate.js:52-55`), but the manifest's `armed:false` maps naively to the admit-all passthrough
(`admission-gate.js:64`). A careless rewire (`if (!ctx.armed) return admitAll`) would turn an indeterminate /
partial arm into admit-all — a fail-OPEN regression. The rewire MUST preserve throw→reject.

## §1 Runtime Probes — firsthand, this session, against the repo NOW (2026-07-12)

| # | Claim | Probe | Observed |
|---|---|---|---|
| P1 | admission-gate is import-dark (wired to nothing in src) | `grep -rln 'require.*admission-gate' v0/src` | **HOLDS** — zero importers (only prose mentions). Its own darkness witness (A) proves it via `require.cache`. |
| P2 | admission-gate imports `armingDecision` (arming-coherence) + registration-provenance | Read `admission-gate.js:27-29` | **HOLDS** — `armingDecision` from `./arming-coherence`; `assessRegistrationFromRegistry`/`R3_VERIFIES` from `../identity/registration-provenance`; `refuseAlert`. |
| P3 | the current tests arm via 2 signals `{admissionArmed, signingArmed}` | Read `admission-gate.test.js:51` (`ARM`) + darkness-witness (B) | **HOLDS** — `ARM = {admissionArmed:true, signingArmed:true}`. The manifest is 4-signal all-or-none → the arming semantics CHANGE (see Q1). |
| P4 | `arming-coherence`'s darkness witness allows importers `{admission-gate, signing-armed-mint}` | Read `arming-darkness-witness.test.js` | **HOLDS** — if admission-gate DROPS the `armingDecision` import (Q1/interpretation 1), that witness's importer set must shrink to `{signing-armed-mint}`. |
| P5 | manifest exposes `resolveArmedContext` + `normalizeArmSignal` + `SIGNAL_SET`; context has `armed/coherent/reason/disarmedBaseline/hadMisconfig/signals` | Read `arming-manifest.js` exports | **HOLDS** — the tri-state distinction admission-gate needs is already there: `disarmedBaseline` (→ passthrough) vs `reason:'arm-getter-threw'`/`'partial-arm'` (→ reject) vs `armed` (→ verify). |

## §2 Design — the rewire (fail-closed tri-state)

admission-gate replaces its `armingDecision({admissionArmed, signingArmed})` call with a read of
`resolveArmedContext(...)`, mapping the context to the admission decision by a FOUR-state branch (never a
two-way `armed ? verify : admit-all`, which is the H4 fail-open):

> ⚠️ CORRECTED by §6 (the VERIFY board CRITICAL): a garbage token is `disarmedBaseline:true, hadMisconfig:true`, so
> admit-all MUST gate on `!hadMisconfig` — else the #82 fail-open reopens. The mapping below is the resolved one.

```text
ctx = resolveArmedContext(<arm signals>)
  ctx.armed                                  -> ARMED: verify the root-signed sigma_root (unchanged from today)
  ctx.disarmedBaseline && !ctx.hadMisconfig  -> admit-all passthrough (DELIBERATE dark fail-open, byte-identical)
  ctx.disarmedBaseline && ctx.hadMisconfig   -> REJECT, fail-closed, OBSERVABLE (a garbage arm token -- the #82 close)
  else (partial arm OR arm-getter-threw)     -> REJECT, fail-closed, OBSERVABLE
```

The two REJECT branches are the #82 + H4 close: a garbage admission token (`normalizeArmSignal → misconfig` → a
DIRTY disarmed baseline) and a partial/indeterminate arm BOTH REJECT, never the silent admit-all. ONLY a CLEAN
baseline (`disarmedBaseline && !hadMisconfig`) admits all. The C1 record-field throw→reject (the armed path's
existing defense) is preserved unchanged.

## §3 Open questions for the VERIFY board (the real forks)

- **Q1 (load-bearing) — 2-signal vs 4-signal arming semantics.** Does admission-gate gate on the FULL 4-signal
  `manifest.armed` (ADR-0001 Dec 3: "refuse to arm ANY gate unless ALL coherently armed together"), meaning
  arming admission now REQUIRES {admission, signing, anchoring, freshness} all armed — and the tests + behavioral
  witness must be rewritten from `ARM={admission,signing}` to a 4-signal ARM? Or is Wave-2a's #82 the NARROWER
  change (route admission+signing through the manifest's `normalizeArmSignal` + tri-state for the type-safety and
  the fail-closed-on-garbage, but keep admission arming on its own 2 signals, deferring the full all-or-none
  coupling to when anchoring/freshness are wired)? **Interpretation 1 is the strict ADR reading; interpretation 2
  is the smaller, less-coupled wave.** The board decides against ADR-0001 + the code.
- **Q2 — resolve-in-gate vs receive-resolved-ctx.** Does admission-gate import `arming-manifest` and call
  `resolveArmedContext` itself (→ update `arming-manifest-darkness-witness` to allow admission-gate as its ONE
  importer; admission-gate DROPS the `armingDecision` import → update `arming-darkness-witness`), OR does it
  receive a PRE-RESOLVED frozen `armedContext` in its input (ADR Dec 1 "resolved once"; admission-gate imports
  NEITHER manifest nor arming-coherence; the manifest stays fully import-dark)? Trade-off: single-resolution
  purity vs a larger input-contract change.
- **Q3 — the darkness-witness deltas.** Enumerate exactly which witnesses change and confirm each stays a
  genuine (non-vacuous) proof: admission-gate structural witness (A) stays green (admission-gate still
  import-dark); the behavioral witness (B) is rewritten to the new arming shape; the `arming-manifest` /
  `arming-coherence` importer-set witnesses update per Q2.

## §4 TDD-treatment (existing tests describe behavior that will change — the ≥80-LoC trigger)

1. Rewrite `admission-gate.test.js` + the behavioral half of `admission-gate-darkness-witness.test.js` to the
   arming shape the board picks in Q1 (RED-first), plus NEW cases: (a) an indeterminate/partial arm → REJECT
   (not admit-all — the H4 regression guard); (b) a garbage admission token → REJECT + misconfig emit (the #82
   close); (c) disarmed-baseline → admit-all passthrough (byte-identical to today).
2. Run against the current impl → the changed-semantics tests RED, the H4/#82 cases RED.
3. Rewrite `admission-gate.js` minimally to green.
4. Update the affected darkness witnesses (Q3); keep the structural dormancy proofs green.
5. 3-lens VALIDATE (code-reviewer + hacker live-reprobe + honesty-auditor) — Rule 2 (admission GATE = security).
6. Pre-PR CodeRabbit → PR → user merge-gate.

## §5 Adversarial shapes FIRST (each a RED-first test)

- **AH1 — indeterminate → admit-all (the H4 fail-open).** A partial arm / an `arm-getter-threw` context MUST
  REJECT, never map to the disarmed-baseline admit-all. (The single most important guard.)
- **AH2 — garbage admission token → silent disarm (the #82 residual).** A non-strict admission token must
  REJECT + emit misconfig, not silently admit-all.
- **AH3 — C1 preserved.** A throwing record-field getter (personaDid/sigmaRoot/registry) on the ARMED path must
  still REJECT (the existing CRITICAL fold — do not regress it).
- **AH4 — disarmed-baseline byte-identical.** No-arm / all-absent input → admit-all passthrough, exactly as
  today (the deliberate dark fail-open).
- **AH5 — never-throws.** null/undefined/scalar/all-throwing-getter input → a decision, never a throw.

## §6 VERIFY board resolution (2026-07-12) — architect (APPROVE-WITH-CHANGES) + hacker (NEEDS-REVISION)

Both lenses caught a **CRITICAL** my §2 mapping missed. Folded:

- **CRITICAL — `disarmedBaseline → admit-all` reopens #82.** A garbage arm token (`{admission:'ture'}`, `{admission:1}`,
  `{1,1,1,1}`) resolves to `disarmedBaseline:true, hadMisconfig:true` (NOT `partial` as my AH2 wrongly claimed) →
  my naive mapping would admit-all, reopening the exact silent-disarm-on-garbage-token this wave closes. **Fix —
  FOUR-state decision:** (1) `ctx.armed` → verify; (2) `disarmedBaseline && !hadMisconfig` → admit-all passthrough
  (CLEAN baseline only, byte-identical to today); (3) `disarmedBaseline && hadMisconfig` → REJECT (the #82 close);
  (4) else (partial / indeterminate) → REJECT. States 3+4 are the fail-closed `else`.
- **Q1 → Interpretation 1 (4-signal).** admission-gate gates on the single `manifest.armed`. Interp-2 would force
  reaching into `ctx.signals` (violates the "gate ONLY on `armed`" contract) and gate on a subset (the F9 fail-open).
  **NS-9:** this NARROWS F9 (admission refuses an incoherent arm) but does NOT close it until anchoring/freshness/
  broker also route through the manifest. Wave 2a can only *reject-all* an incomplete arm — it cannot *enforce-admit*
  until those wire (a dead-but-correct armed path; the behavioral witness must still exercise it, see below).
- **Q2 → resolve-in-gate (Option A).** admission-gate imports `arming-manifest` and calls `resolveArmedContext`
  itself — the wave's actual deliverable + NON-BYPASSABLE (a caller cannot hand it a forged `{armed:true}` ctx).
  Three mandatory riders: **(i)** map `admissionArmed→admission` (+ siblings) EXPLICITLY via a named adapter (a
  key-name typo → all-absent → clean-baseline → silent admit-all); **(ii)** read the arm signals OWN-property-only
  (`Object.hasOwn`) inside admission-gate's OWN guarded try (AH10: a polluted `Object.prototype` must not flip the
  gate armed; the manifest's own hasOwn defends its read, but admission-gate's read of `input.admissionArmed` is
  itself an inherited read) → pass PLAIN values to the manifest (a throwing getter is caught by admission-gate's
  guard, never reaches the manifest); **(iii)** keep the armed-path record read (`personaDid/sigmaRoot/registry`)
  in a SEPARATE try (C1 preserved — do not merge the arm read and the record read into one try).
- **HIGH — F4-A inverts (admit→reject).** `{admissionArmed:true, signingArmed:false}` today → passthrough
  (admit:true); under 4-signal → armedCount 1 → partial → REJECT. Rewrite F4-A to assert REJECT; document the
  inversion as an intended ADR-Dec-3 consequence. The CLEAN all-absent baseline stays admit-all (unchanged).
- **HIGH — behavioral darkness-witness (B) goes VACUOUS unless armed with all 4.** A 2-signal arm returns
  `armed:false, reason:'partial-arm'`, so "armed rejects a bad sig" would pass via the partial-arm short-circuit
  even if the sigma-root verifier were deleted. **Fix:** (B) arms all 4 signals + a non-vacuity self-check (the
  full-arm + valid-sig case must ADMIT, and a full-arm + bad-sig must REJECT via the verifier, not the arm path).
- **MEDIUM — else must be OBSERVABLE at the GATE layer.** Emit a gate-level `admission-rejected` (cause
  `arm-garbage-disarmed` for a dirty baseline, `arm-partial` for a partial arm) — distinct from the manifest's
  arm-resolution emits (`arm-flag-misconfig`/`arming-incoherent`), so no duplicate token (the LOW double-emit note).
- **Darkness-witness deltas (Q3), all stay non-vacuous:** (A) admission-gate STRUCTURAL — UNCHANGED (checks
  INCOMING edges; the new admission-gate→arming-manifest edge is outgoing). (B) BEHAVIORAL — rewritten (4-signal +
  self-check). `arming-manifest-darkness-witness` importer-set `[] → ['trust/admission-gate.js']` (exact-set
  deepEqual; the meaning shifts to TRANSITIVE dormancy — admission-gate imports it but is itself import-dark).
  `arming-darkness-witness` (arming-coherence importers) `{admission-gate, signing-armed-mint} → {signing-armed-mint}`
  (admission-gate drops the `armingDecision` import). Re-derive each set from actual imports; keep
  `assertOnlyLiteralRequires` + the preconditions.

### Reshaped adversarial shapes (RED-first)
AH1 partial/indeterminate → REJECT (H4) · **AH6 (CRITICAL) dirty disarmed baseline** (`{admission:'ture'}`,
`{1,1,1,1}`) → REJECT · AH7 arm-getter-throw during the read → fail-closed `arm-read-failed-fail-closed`, never
throw/admit · AH3 C1 record-field throw on the armed path → REJECT · AH4 CLEAN all-absent baseline → admit-all
(byte-identical) · AH8 3-armed+1-garbage → partial → REJECT · AH9 legacy 2-signal `{admissionArmed,signingArmed}`
→ 2-of-4 → partial → REJECT (not silent admit-all) · **AH10 prototype-pollution** (`Object.prototype.admission=true`
+ `{}`/undefined input) → clean baseline → admit-all (own-property read defends) · full-arm+valid-sig → ADMIT ·
full-arm+bad-sig → REJECT via verifier (witness-B non-vacuity).

## §7 VALIDATE result (2026-07-12) — code-reviewer + hacker live-reprobe + honesty-auditor

code-reviewer **SHIP-WITH-NITS**, hacker **FIX-BEFORE-SHIP**, honesty **SHIP-WITH-NITS**. One HIGH (a real
crypto-bypass the live-probe caught) + LOW/NIT, all folded, re-run green.

- **HIGH (hacker, security) — prototype-polluted grandfather crypto-BYPASS.** Live probe: `Object.prototype.grandfather
  = () => true` + an ARMED gate + an UNVERIFIED persona + the DEFAULT `{}` policy (the normal armed case) → `admit:true`
  — the grandfather read `policy.grandfather` was a plain prototype-CHAIN access. I had hardened the ARM read with
  `Object.hasOwn` but left the grandfather read inherited-vulnerable (the same class, one line over). **Fixed:**
  `Object.hasOwn(policy, 'grandfather')` own-property read. RED-first proof: **AH11** (fails against the inherited read,
  greens after the fix). The hacker's other probes CONFIRMED the build: #82/H4 closed (11 garbage/partial inputs all
  REJECT), arm-read prototype-pollution HELD, C1 HELD, witness-B genuinely non-vacuous (would go RED if the verifier
  were deleted).
- **LOW/NIT (all 3 lenses) — return `armed` semantics.** `armed:true` on the fail-closed reject paths diverges from
  `ctx.armed:false`. Intentional (armed = "acted in enforcing mode") but undocumented. **Fixed:** JSDoc note.
- **NIT (honesty) — the `disarmed-passthrough` token had no witness anchor.** **Fixed:** `assert.equal(disarmed.reason,
  'disarmed-passthrough')` added to witness (B), so the byte-identical clean-baseline contract is mechanically pinned.
- **LOW (code-reviewer) — 84-line function / SRP.** ADVISORY, not folded: the reviewer itself recommends NOT
  fragmenting the security-critical guarded-try steps (each split multiplies the throw→reject surface — a fail-open
  regression risk). Each step is a hand-audited guarded try; kept whole by design.
- **NIT (hacker) — `registry` trusted-input boundary** (disclosed, unchanged by the rewire; the #273/H2 recursion
  stays necessary-not-sufficient until out-of-band root attestation — an arming-time concern, not W2a).

**Evidence:** `git diff --cached --stat` shows `arming-manifest.js` NOT in the diff (byte-untouched ✓). Full suite
**878/0**; eslint clean. admission-gate 21/21; all 4 darkness witnesses green.
