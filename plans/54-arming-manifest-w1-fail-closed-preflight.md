---
lifecycle: persistent
created: 2026-07-12
audience: this + future sessions — EPIC #96 arming-cluster, Wave 1
epic: 96
builds: "the #84 (F9) preflight PRIMITIVE — resolveArmedContext (all-or-none, fail-closed, import-dark). NARROWS #84's fragmentation clause; does NOT close it (the 4 arm sites stay unconsumed until Wave 2/3). #82 (F7) structural half is DEFERRED to Wave 2 with the admission-gate rewire (VALIDATE §7/H4/Q2). This PR does NOT auto-close #82 or #84."
adr: docs/ADRs/0001-fail-closed-arming-manifest.md
---

# plans/54 — EPIC #96 Wave 1: the fail-closed arming manifest (`resolveArmedContext`)

> **Scope guard (NS-7, load-bearing).** This wave changes *how arming would resolve* — it **arms nothing**.
> No arm flag is set, no gate flips live, no uid/key/`--attested-cross-uid` is touched. The module ships
> DORMANT (import-dark, darkness-witnessed), exactly like every prior arming primitive. Arming stays an
> operator-only, NS-7-gated act. Claude never arms.

## Context

EPIC #96 (the fail-closed arming manifest) tracks 8 sub-issues; **4 are already CLOSED** (F2/#78, F3/#79,
F10/#85, F19/#94). The 4 open issues are all SHADOW-buildable machinery that makes the SHADOW→armed
transition fail *closed* and *coherent* instead of open and diffuse:

- **#84 (F9)** — 4 arm signals, multiple idioms, fail-open defaults, **no coherence preflight**.
- **#82 (F7)** — the armed admission gate can silently disarm (admit-all) on a non-strict arm token.
- **#81 (F6)** — anchoring/freshness narrows only `convert.disjointPaths` (1 of ~8 trust consumers).
- **#83 (F8)** — registration binds a **self-asserted** `human_uid` (no root-signed proof).

This wave builds the **keystone**: a single fail-closed preflight (`resolveArmedContext`) that resolves all
arm signals together, all-or-none, into one immutable context — ADR-0001 Decisions 1-3. It **builds the #84
preflight PRIMITIVE** (the "no coherence preflight" clause); it NARROWS #84 but does not close it — the 4 arm
sites stay unconsumed until Waves 2/3. #81 and #83 are Waves 2 and 3 (they *consume* the manifest). **The #82
(F7) structural half moved to Wave 2** with the admission-gate rewire (see §7 / VALIDATE — the rewire risks a C1
throw→reject regression and would force subset semantics if landed here).

## §1 Runtime Probes — firsthand, this session, against the repo NOW (2026-07-12)

The ADR-0001 prose is 3 days old; a living design doc decays like a stale line number, so every premise was
re-probed against the current tree before this plan leaned on it.

| # | Claim (from ADR-0001) | Probe | Observed — verdict |
|---|---|---|---|
| P1 | #82/F7: `{admissionArmed:1, signingArmed:1}` coerces to `coherent:true`, still admit-all, **no alert** | Read `arming-coherence.js:42-49` | **DECAYED (partial).** Lines 43-44 already strict-coerce BOTH (`=== true`). `{1,1}` → both-`false` → `coherent:(false===false)=true`, `admissionArmed(out)=false` → `admission-gate.js:64` disarmed passthrough. The admit-all-**while-thinking-armed** case is GONE (a prior VERIFY-HIGH fix). **Residual restated:** the manifest must catch the *silent disarm on a non-strict token* — a caller passing `"1"`/`true`/`"ture"` intending to arm gets a silent both-false "coherent" with NO misconfig emit. |
| P2 | #81/F6: filters compose only in `convert`; `read-gate` is sig-only; `authenticatedAnchoredRecords` unbuilt | `grep filterAnchoredRecords\|filterFreshVouches\|authenticatedAnchoredRecords v0/src` + read `read-gate.js` | **HOLDS.** Both filters compose only at `convert.js:89-90`. `read-gate.js:32-60` `verifiedRecords` = content-integrity + per-sender sig ONLY (`root_valid`/audit deferred to arming, ADR-0002). `authenticatedAnchoredRecords` does not exist. → Wave 2. |
| P3 | #83/F8: registration binds a self-asserted `human_uid`, no root-signed `sigma_root` | Read `registry.js:46-60` | **HOLDS.** `registerPersona` binds `{personaDid,humanUid,publicKeyPem}` first-writer-wins; `registerRoot` seeds a root key but discloses root-key-squat OPEN (`registry.js:94-99`). No root-signed binding gate. → Wave 3. |
| P4 | #84/F9: 4 signals, multiple idioms, no unifying preflight | Read all 4 idiom sites | **HOLDS.** (1) admission+signing = `armingCoherence` (DI booleans, both-or-neither, emits on XOR only); (2) anchoring = `meCtx.regProvenance` presence-arm in convert; (3) freshness = `meCtx.freshness` presence-arm in convert; (4) broker = `resolveRequireCaller`/`isDeploySignalSet` (env-string tri-state). Nothing ties all 4. |
| P5 | Design tension: is the manifest env-reading or DI? | Read `arming-coherence.js:9-19` header + `caller-auth.js:19,76-80` | **Two stances coexist by design.** `arming-coherence` reads ZERO env deliberately ("the honest, stricter shape"; PACT owns no live admission flag). `caller-auth` DOES read `PACT_BROKER_REQUIRE_CALLER` (the broker is deployment-real). → The manifest must **coordinate already-resolved signals** (DI), NOT newly read env for the DI ones. The env READ stays at its current site (root-owned wrapper); the manifest resolves the tokens/booleans it is handed. |
| P6 | `armingCoherence` has live consumers beyond admission-gate | `grep -rl arming-coherence v0/src` | `admission-gate.js` + `signing-armed-mint.js`. → Wave 1 must NOT break `armingCoherence`'s existing contract; the manifest **composes** it, does not replace it. |

## §2 Design — `resolveArmedContext` (the fail-closed preflight)

New leaf `v0/src/trust/arming-manifest.js`. **Pure, DI, no I/O, never-throws** (mirrors `armingCoherence`'s
discipline). It resolves the arm signals **all-or-none** into one **immutable** context, emitting observably
on every fail-closed reason.

```text
resolveArmedContext({ admission, signing, anchoring, freshness, brokerCaller }) ->
  Object.freeze({
    armed: boolean,        // TRUE iff EVERY provided signal is coherently, strictly armed
    coherent: boolean,     // FALSE on any partial / mixed / garbage-token arm
    reason: string|null,   // the fixed fail-closed cause enum (null when armed or fully disarmed)
    signals: Object.freeze({ ...per-signal resolved state }),
  })
```

Load-bearing properties (each is a test in §4):

1. **All-or-none (ADR Dec 3).** `armed` is true only if EVERY signal the caller supplies is strictly armed.
   Any partial arm → `armed:false, coherent:false` + emit. A fully-absent set → `armed:false, coherent:true`
   (the honest fully-disarmed baseline, byte-identical to today) — NO emit (nothing is mis-arming).
2. **Asymmetric per-signal parse (ADR Dec 2), reusing `arm-flags.js`.** An ENABLE-class token is strict
   (`parseEnabledFlag`: only `'1'`/`true`); a present-but-non-strict token (`"1"` string vs bool, `'ture'`,
   `'true'`) is a **misconfig** → resolved as NOT-armed **and** `assessEnableFlag` emits `arm-flag-misconfig`.
   This closes P1's silent-disarm residual: a garbage arm token can never coerce to a silent "coherent" state.
3. **Immutable (ADR Dec 1).** The returned context is `Object.freeze`d (deep — `signals` too). A gate reads
   its enable state ONLY from this frozen context, never a loose `meCtx` key. (Freeze is shallow-safe here:
   the context holds only primitives + one nested frozen object; no arrays/maps.)
4. **Observable fail-closed (security.md).** Every `!coherent` and every misconfig emits via `refuseAlert`
   (cause-keyed, never reason-keyed — the egress-alert lesson from `arming-coherence.js:56-57`).
5. **Composes `armingCoherence`, does not replace it.** The admission+signing pair still flows through the
   existing both-or-neither primitive (P6: `signing-armed-mint` also consumes it). The manifest wraps it and
   adds the anchoring/freshness/broker signals to the all-or-none set.

### #82 close (structural half) — rewire `admission-gate.js`  — ⚠️ DEFERRED to Wave 2 (superseded by §7/H4/Q2)

> This subsection is the ORIGINAL Wave-1 intent; the VALIDATE board (§7) DEFERRED the rewire to Wave 2 (it
> risks a C1 throw→reject regression and would force subset-by-omission semantics if landed alongside the
> canonical-set fix). Kept here for the design trail; the shipped Wave-1 diff does NOT touch `admission-gate.js`.

`admission-gate.js:60` currently calls `armingDecision({admissionArmed, signingArmed})` directly. Rewire it
to read its enable state from `resolveArmedContext(...)` so a non-strict admission token becomes an OBSERVABLE
misconfig-and-fail-closed instead of a silent disarm. **Behavioral invariant: admission-gate is import-dark
(no live consumer), so this changes only dormant code** — byte-behavior for any live caller is unchanged
(there are none), proven by the unchanged `admission-gate-darkness-witness`.

## §3 Adversarial shapes FIRST (enumerate before building — the graduating self-improve rule)

Before writing a line, the shapes an attacker/misconfig will try — each becomes a RED-first test:

- **A1 — garbage-token silent arm.** ⚠️ **CORRECTED by §7/H2 — see the reshaped A1 there.** The pre-board text
  below was WRONG: a strict string `'1'` IS a legitimate arm (not a misconfig). The real garbage cases are
  `'true'`/`'ture'`/`2`/number `1`. ~~`resolveArmedContext({admission:'1', signing:'1'})` MUST NOT return
  `armed:true`~~ (struck — a `'1'`/`'1'` full arm is now correctly `armed:true`; the shipped test pins this).
- **A2 — truthy-non-boolean fake-arm.** `{admission:1, signing:1}` (numbers), `{admission:{}, signing:[]}` —
  none may coerce to `armed:true`. Strict `=== true` (or strict-token) only.
- **A3 — partial arm passes as full.** `{admission:true, signing:true, anchoring:false}` MUST be
  `armed:false, coherent:false` + emit — never "3 of 4 is close enough".
- **A4 — poisoned getter (fail-open inversion).** A signal object whose getter throws must fail CLOSED
  (`armed:false`) + emit, never collapse to `undefined → disarmed → (a consumer's) admit-all`. Mirror
  `admission-gate.js:46-55`'s C1 correction.
- **A5 — frozen-context mutation.** The returned context (and `.signals`) must reject `ctx.armed = true` /
  `ctx.signals.admission = true` (strict-mode throw / silent no-op) — a caller cannot flip armed post-hoc.
  Non-vacuous: assert the mutation does NOT take effect (the `Object.freeze(new Set())` lesson from #100 —
  prove immutability by attempting the mutation, not by trusting `isFrozen`).
- **A6 — emit is non-vacuous.** Inject each fail-closed precondition and assert the alert FIRES RED; assert
  the fully-armed and fully-disarmed paths do NOT emit (no alert-spam on the honest baseline).
- **A7 — dormancy.** A darkness witness proves `arming-manifest.js` is imported by NOTHING in `src/` (its
  consumers are tests + the future operator-wiring), and that the real gates (`convert.actionable`,
  `admission-gate` mayGate) stay dark even when the manifest reports fully armed.

## §4 Build order (Wave 1)

1. RED-first: write `arming-manifest.test.js` covering the resolved A1-A16 (see §7) +
   `arming-manifest-darkness-witness.test.js` against the not-yet-existing module → all RED.
2. Implement `arming-manifest.js` minimally to green the suite.
3. Keep `admission-gate.js` (and the broker) UNTOUCHED — the rewire is Wave 2 (§7/H4/§8); prove the primitive
   stays import-dark (the darkness witness).
4. 3-lens VALIDATE on the built diff (code-reviewer + hacker live-reprobe + honesty-auditor) — Rule 2
   (security/integrity class).
5. Pre-PR CodeRabbit (secret-free tree) → PR → user merge-gate.

## §5 Decomposition (the whole cluster, so the shape is visible)

- **Wave 1 (this plan):** the `resolveArmedContext` PRIMITIVE only (admission-gate rewire deferred to Wave 2 per
  §7). Builds/NARROWS **#84**'s preflight clause; does NOT close #84 or #82 (arm sites unconsumed).
- **Wave 2 (#81/F6, ADR Dec 4):** `authenticatedAnchoredRecords(meCtx)` into the `read-gate` chokepoint; route
  the ~8 trust consumers through it (not just `convert`). Larger refactor.
- **Wave 3 (#83/F8, ADR Dec 5):** root-signed `sigma_root` binding at registration so `rootOf` is a real
  human root before any gate consumes it. Ordering is load-bearing per ADR Dec 5.
- **Fold-in candidate (VERIFY board decides):** whether the broker caller-auth (`resolveRequireCaller`)
  joins the manifest's all-or-none set now or in Wave 2. It is already hardened (F2/#78, F10/#85 closed).

## §7 VERIFY board resolution (2026-07-12) — architect (APPROVE-WITH-CHANGES) + hacker (NEEDS-REVISION)

The board reshaped Wave 1. **Wave 1 narrows to the PURE primitive** (`resolveArmedContext`); the admission-gate
rewire (#82-structural) and the broker fold-in move to Wave 2. Four HIGHs, all folded:

- **H1 — caller-shrinkable all-or-none (the F9 fail-open, both lenses).** "armed iff every *supplied* signal is
  armed" lets `{admission:true, signing:true}` (anchoring/freshness OMITTED) read `armed:true` — a partial arm
  reported as full. **Fix:** a static frozen `SIGNAL_SET = ['admission','signing','anchoring','freshness']`; an
  ABSENT required signal is NOT-armed (fail-closed), not out-of-set. Fold by COUNT over the fixed set. Static
  membership is policy, not an env read — DI purity preserved.
- **H2 — Property-2/A1 unsatisfiable with the cited primitives (hacker, probe-confirmed).** Booleans-only
  silently disarms `'1'` (no emit); `assessEnableFlag` silently non-arms a real boolean AND number `1`. **Fix:** a
  NEW type-gated `normalizeArmSignal`: `boolean` → strict `=== true`; `string` → strict `parseEnabledFlag`
  (`'1'`→armed / `'0'`→disarmed / present-non-strict → misconfig+emit); empty/whitespace string → absent; ANY
  other type (number incl. `1`, object, null) → misconfig+emit. **A1 was WRONG:** `'1'` is a legit arm; garbage
  is `'true'`/`'ture'`/`2`/`{}`.
- **H3 — destructure-in-signature re-opens the C1 getter-throw trap (hacker).** A throwing getter on a
  destructured param throws BEFORE the body → never-throws violated, no emit runs. **Fix:** accept the RAW object;
  read each signal inside a guarded try; a getter-throw fails CLOSED (indeterminate) + emit. Never destructure in
  the parameter list. (A single try is safe here — every branch fails-closed, no fail-open inversion; the cause is
  coarse `arm-getter-threw`, acceptable per the hacker's A14.)
- **H4 — admission-gate rewire regresses C1 (hacker).** The gate today REJECTS on an arm-read throw, but the
  manifest's `armed:false` maps to `admission-gate.js:64` admit-all passthrough. **Fix (both lenses' Q2):** DEFER
  the rewire to Wave 2. Blast radius is zero (import-dark), so prove the primitive fail-closed in isolation first.

**Q1–Q4 resolved:** Q1 = raw tokens AND booleans via the new type-gated normalizer (NOT bare `assessEnableFlag`).
Q2 = defer admission-gate rewire to Wave 2. Q3 = defer broker (tri-state `true/false/null-AUTO` has no binary
all-or-none mapping; already hardened; YAGNI). Q4 = compose NOTHING from `arming-coherence.js` (leave it
byte-identical — the 4-signal all-or-none strictly implies the 2-signal both-or-neither, so composing is
redundant and risks double-emit); add **A12** (re-run `signing-armed-mint` unit suite + darkness witness green).

### Final Wave-1 design (supersedes §2)

`resolveArmedContext(input)` → **frozen** `{ armed, coherent, reason, disarmedBaseline, signals }`:

- **`SIGNAL_SET`** (frozen) = `['admission','signing','anchoring','freshness']`. Extra keys IGNORED (A15 — trusted
  deploy-wiring input, not actor data; documented).
- **Guarded raw read** (H3): `src = (input && typeof input==='object') ? input : {}`; read each `src[key]` inside a
  try; getter-throw → `{armed:false, coherent:false, reason:'arm-getter-threw', disarmedBaseline:false}` + emit
  `arm-context-unreadable`.
- **`normalizeArmSignal(raw)`** → `'armed'|'disarmed'|'absent'|'misconfig'` (H2, per above; the string branch
  reuses `parseEnabledFlag` for the `'1'`/`'0'` trim semantics — DRY).
- **Orthogonal misconfig channel:** each `'misconfig'` signal emits `arm-flag-misconfig {flag:key}` — token
  validity, INDEPENDENT of arm coherence.
- **Count fold over the fixed set (H1):** `armedCount === 4` → `armed:true, coherent:true`; `armedCount === 0` →
  `armed:false, coherent:true, disarmedBaseline:true` (honest baseline, NO coherence emit); `0 < armedCount < 4` →
  `armed:false, coherent:false, reason:'partial-arm'` + emit `arming-incoherent`.
- **`coherent` is diagnostic-only; consumers gate on `armed`** (M finding — `coherent:true` on BOTH the armed and
  disarmed-baseline states; `disarmedBaseline` distinguishes them). Documented in the header + the consumer contract.
- **Immutability:** `signals` holds only flat string enums (primitives) → one `Object.freeze` is deep-safe (M/L
  findings; A5 proves it by attempted mutation, not `isFrozen`).
- **Emit cardinality:** ≤4 per-signal `arm-flag-misconfig` + at most ONE top-level (`arming-incoherent` OR
  `arm-context-unreadable`). Fully-armed and clean disarmed-baseline emit NOTHING (A6 non-vacuity + no-spam).

### Reshaped adversarial shapes (RED-first)

A1 token-validity (`'1'`→armed, `'ture'`/`2`/`{}`→misconfig+emit, `''`→absent, bool true→armed no-misconfig,
number `1`→misconfig — the `assessEnableFlag` silent hole) · A2 truthy-non-bool fake-arm (numbers/objects →
misconfig, armedCount 0, emits fire) · A3 explicit partial (`anchoring:false` amid armed → coherent:false+emit) ·
A4 poisoned getter → fail-closed+emit, never fail-open · A5 frozen-context + frozen-signals mutation no-effect ·
A6 emit non-vacuity (each path fires RED; fully-armed + clean-baseline silent) · A7 dormancy darkness witness +
`assertOnlyLiteralRequires` · **A8 omission-shrinks-set** (`{admission:true,signing:true}` others omitted →
armed:false, coherent:false+emit — THE keystone test) · A9 mixed idiom matrix · A10 boolean-not-misconfig · A11
single-emit cardinality (no double-emit) · A12 `signing-armed-mint` regression (run its suite + witness green) ·
A15 unknown-key ignored.

## §6 Open questions for the VERIFY board — RESOLVED (see §7)

- **Q1** — Signature of `resolveArmedContext`: do the DI signals accept booleans-only, or raw tokens (strings)
  too, routed through `assessEnableFlag`? (P5 says the manifest must be the asymmetric-parse home; the admission
  signal is a bool today but the operator-wiring layer will hand it a token.)
- **Q2** — Does the admission-gate rewire belong in Wave 1 (closes #82-structural now) or Wave 2 (keep Wave 1
  a pure primitive)? Trade-off: reviewability vs closing an issue per wave.
- **Q3** — Fold-in of the broker caller-auth signal: now or Wave 2? (§5 fold-in candidate.)
- **Q4** — Does composing `armingCoherence` (rather than reimplementing both-or-neither) risk any contract
  drift for `signing-armed-mint`'s existing consumption? (P6.)

## §8 VALIDATE result (2026-07-12) — code-reviewer + hacker live-reprobe + honesty-auditor

3-lens board on the BUILT diff. code-reviewer **SHIP-WITH-NITS**, hacker **SHIP-WITH-NITS**, honesty-auditor
**FIX-BEFORE-SHIP**. Two MEDIUMs (one security, one honesty) + LOWs/NITs — all folded, re-run green.

- **MEDIUM (hacker, security) — prototype-pollution fail-open of the disarmed baseline.** Live probe: with
  `Object.prototype.{admission,signing,anchoring,freshness}=true`, `resolveArmedContext(undefined|42|{})`
  returned `armed:true` — the inherited `src[key]` read let ambient prototype state flip the keystone baseline
  (security.md NON-BYPASSABLE class). **Fixed:** own-property read `Object.hasOwn(src,key) ? src[key] : undefined`.
  RED-first proof: **A16** fails against the inherited read, greens after the fix (14→15 unit tests).
- **MEDIUM (honesty) — `closes #82-structural` outran the diff.** The admission-gate rewire was deferred to Wave 2
  (§7), and the diff never touches `admission-gate.js`. **Fixed:** frontmatter `builds:` (not `closes:`); §1/§2/§5
  corrected; the PR does NOT auto-close #82 or #84 (Wave 1 NARROWS #84's preflight clause, does not close it).
- **LOW (honesty) — stale §3-A1** (said `'1'` must not arm) — struck, pointer to §7/H2.
- **LOW (both) — A15 `__proto__:'x'` object-literal was a vacuous no-op** — replaced with a real own `__proto__`
  key via `JSON.parse` (asserts `Object.hasOwn`), and the pollution vector itself is now covered by A16.
- **LOW (honesty) — byte-untouched + A12 asserted, not shown** — evidence below.
- **NIT (hacker) — `disarmedBaseline` misleading on a garbage-token intent** — added `hadMisconfig` to the return
  so the token-validity signal rides the RETURN VALUE, not only stderr (orthogonal-channel doctrine made explicit).
- **NIT (code-reviewer) — getter-throw `signals` shape** — JSDoc note added (empty frozen set on that path).
- **NIT (code-reviewer) — SIGNAL_SET tested via `isFrozen`** — added a prove-by-mutation assertion (house rule).

**Evidence (shown, not stated):** `git diff --cached --stat` = 4 files only; `arming-coherence.js` NOT in the
diff (byte-untouched ✓). Full suite **874/0**; eslint clean. A12: `signing-armed-mint` 11/11 + darkness witness
4/4 + `arming-coherence` 15/15 all green post-change.

**Net:** Wave 1 ships the pure `resolveArmedContext` primitive — fixed canonical all-or-none set, type-gated
asymmetric parse (no silent arm/disarm), own-property read (no prototype-pollution fail-open), never-throws /
guarded, immutable, observable on two orthogonal channels. Import-dark (darkness-witnessed). Arms nothing.
