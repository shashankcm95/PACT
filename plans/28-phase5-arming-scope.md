---
lifecycle: persistent
status: SCOPED — P5-W0 GREENLIT (USER, 2026-07-01); P5-W1+W2 gated on a separate USER go-ahead (§8)
created: 2026-07-01
plan: 28
title: PACT borrow-arc Phase 5 — the env-flag arming harness (ships DARK)
audience: this session + the USER (go-ahead gate), future build sessions
supersedes-scope-of: plans/27 §5 (Phase-5 charter) — corrections flagged inline where a lens contradicts the charter
---

# Plan 28 — PACT borrow-arc Phase 5: the env-flag arming harness (DARK / SHADOW)

> **HONEST LABELING (NS-9 / NS-11).** Everything in this plan ships **DARK**. The harness is
> **PURE DORMANT INFRASTRUCTURE**: it installs a `(flagName, gatePredicate)` arming seam, the
> asymmetric flag-parse PACT lacks, and a both-or-neither coherence preflight. It **gates NOTHING**.
> There is NO gate point Phase 5 could legally arm, pre-U2, to change any trust decision (LENS D,
> verified). Arming NARROWS at most; it never HARDENS. Reporting the harness as anything but dormant
> would violate NS-9 (narrowed-reported-as-hardened). The build does **NOT** start on this doc — this
> is the scoping deliverable for an explicit USER go-ahead.

> **THE PROBED REALITY WINS OVER THE plans/27 CHARTER.** Where a recon lens contradicts the plans/27
> §5 charter framing, the LENS (probed against the actual repo) wins and the correction is flagged
> explicitly with a `[CHARTER CORRECTION]` tag. Three such corrections are carried below (the
> `parseEnabledFlag`-symbol misnomer, the split-brain over-statement, and the `mayGate` receiver-agnosticism).

---

## §1 Runtime Probes (verified against the actual repo, not memory — firsthand this recon session)

These are the strongest `(claim, probe, observed)` tuples from the four recon lenses, carried **VERBATIM**.
Each is the evidence basis a design decision below leans on. A probe result decays like a stale line number
(PLAN-CONVENTIONS.md §Honest-labeling) — re-probe at point-of-use before the build acts on it.

### §1.A PACT env-flag census (LENS A)

- **Claim:** `broker-sign.js` is the only runtime file reading `PACT_BROKER_*` vars; every read is in the broker
  process, none in host-side library code.
  **Probe:** `grep -n 'process\.env\.[A-Z_]+' /Users/shashankchandrashekarmurigappa/Documents/PACT/v0/src`
  **Observed:** Only 3 files hit: `broker-sign.js` (lines 69,70,87,102,125), `heap-read-broker-harness.js`
  (line 18). `caller-auth.js`/`request-auth.js` have ZERO `process.env` reads (pure helpers taking injected params).

- **Claim:** `PACT_BROKER_PERSONA_DID` is read TWICE with DIVERGENT semantics (real split-brain); `REQUIRE_FRAME`
  and `ALLOWED_UIDS` are each single-reader (no JS split-brain).
  **Probe:** Read `broker-sign.js` lines 68-103 + `request-auth.js` lines 50-68,108-109.
  **Observed:** `PERSONA_DID` read at `broker-sign.js:70` (drives `resolveRequireFrame` -> presence-only
  `length>0` test, `request-auth.js:53`) AND at `broker-sign.js:102` (drives `personaBinds` -> ASCII-trim +
  exact-byte-equal, `request-auth.js:108-109`). `REQUIRE_FRAME` only at `:69`; `ALLOWED_UIDS` only at `:87` (runtime).

- **Claim:** `parseEnabledFlag` exists in PACT at `request-auth.js:35` but is NOT exported (only `resolveRequireFrame` is).
  **Probe:** `grep -n 'parseEnabledFlag'` over PACT + Read `request-auth.js:127`.
  **Observed:** Definition at `request-auth.js:35-41`, called at `:51`. `module.exports` at `:127` =
  `{authorizeRequest, recomputeBinds, personaBinds, resolveRequireFrame, MAX_FRAME_BYTES}` — `parseEnabledFlag`
  absent. Reuse requires export/hoist.

- **Claim:** A LENIENT deploy-signal predicate (`isDeployFlagSet`) does NOT exist in PACT; it lives only in the toolkit.
  **Probe:** `grep -n 'isDeployFlagSet|parseArmFlag|LOOM_WORLD_ANCHOR_ARM'` over the toolkit lab (no PACT hits).
  **Observed:** All `isDeployFlagSet` hits under `claude-toolkit/packages/lab/_lib/host-claude-guard.js:82-88`
  (LENIENT: any non-falsey incl. typo -> true). Zero PACT occurrences. PACT has only the strict `parseEnabledFlag` half.

### §1.B Toolkit arming borrow-source (LENS B)

- **Claim:** `parseEnabledFlag` does NOT exist anywhere in the toolkit; the claimed toolkit symbol is a misnomer for `normalizeBool`.
  **Probe:** Grep `parseEnabledFlag` over the toolkit.
  **Observed:** No matches. The strict single-arming parse is `normalizeBool` (`host-claude-guard.js:69-73`),
  asserted as the sole arm-parse in `world-anchor-arming.test.js:48-52`.

- **Claim:** The LENIENT deployed-signal predicate (typo fails CLOSED) is `isDeployFlagSet` at `host-claude-guard.js:82-88`.
  **Probe:** Read `host-claude-guard.js`.
  **Observed:** `function isDeployFlagSet(v)` at `:82-88`: boolean passes through; `''` -> false (unset);
  `'0'|'false'|'no'|'off'` -> false; ANY OTHER non-empty token (incl. typo `'ture'`) -> true. Comment `:75-81`
  states the asymmetry: enabling needs valid-truthy (`normalizeBool`), deployed-signal needs only non-falsey so a typo REFUSES.

- **Claim:** PACT ALREADY HAS a strict `parseEnabledFlag` AND a `refuseAlert` observability primitive — the two hardest pieces to port.
  **Probe:** Read `PACT v0/src/identity/request-auth.js:35-41` and `PACT v0/src/lib/refuse-alert.js`.
  **Observed:** `request-auth.js:35-41` `parseEnabledFlag(raw)`: `'1'`->true, `'0'`->false, else null (never `!!env`).
  `refuse-alert.js:32` `refuseAlert(reason, detail={})` — reason-positional-authoritative, never-throws,
  class-tagged triage `CLASSES=['attack','misconfig','integrity']`, explicitly "BORROWED from the toolkit
  `kernel/egress/alert.js emitEgressAlert`".

- **Claim:** `armingCoherence` is the both-or-neither preflight with `signingArmed` INJECTED (no back-import into `world-anchor/`).
  **Probe:** Read `world-anchor-arming.js:71-80`.
  **Observed:** `armingCoherence(signingArmed) -> { admissionArmed, coherent, reason }`. `admissionArmed =
  isWorldAnchorArmed() && (signingArmed===true)`; `coherent = admissionFlag===signing`; DI-defensive
  (non-boolean coerces to false). The `(flagName, gatePredicate)` parameterization Phase-5 proposes.

### §1.C NS-11 layering placement (LENS C)

- **Claim:** `layering.test.js` has NO `offenders()` assertion with `independence` as the SOURCE layer; it appears only as a banned TARGET.
  **Probe:** Read `PACT v0/test/unit/layering.test.js` in full (99 lines); enumerated every `offenders()` call.
  **Observed:** SIX `offenders()` source layers guarded: `lib`(62), `audit`(67), `atms`(72), `trust`(77),
  `identity`(85), and a grounding-sink loop(91). `independence` NEVER appears as first-arg (source). It appears
  as a TARGET in `lib`(62)/`audit`(67) bans. No independence-as-source directional ban exists.

- **Claim:** `independence/weak-flag.js` has zero `require()` calls, so the proposed `offenders('independence',...)`
  tripwire passes TODAY with no refactor.
  **Probe:** Grep `require(` in `PACT v0/src/independence/weak-flag.js` + Glob `v0/src/independence/*.js`.
  **Observed:** Only one file. Grep `require(`: "No matches found". Header comment line 7: "depends ONLY on its
  inputs (no dependency on trust/ — a one-way DAG; it is a pure leaf)". PURE tripwire-add, no refactor.

- **Claim:** `trust/read-gate.js` legally imports `identity/`, and the current layering test permits `trust->identity`.
  **Probe:** Read `read-gate.js:14`; cross-ref `layering.test.js:77` (trust ban = `['grounding']` only) and `:81-87`.
  **Observed:** `read-gate.js:14` `require('../identity/registry')`. `layering.test.js:77` bans trust importing
  ONLY `grounding` (NOT identity). Six trust files reach identity/ (read-gate:14, consensus:27, direct:28,
  stake-anchor:34-36, issuance-policy:28, convert:16). `trust->identity` is a load-bearing established edge.

### §1.D Gate surface + U2 darkness (LENS D)

- **Claim:** `mayGate` is UNCONSUMED by any production/action path — only tests call it; it `void`s its label (receiver-agnostic).
  **Probe:** Read `weak-flag.js:47-54` + Grep `mayGate` in `PACT v0`.
  **Observed:** `function mayGate(label, { highStakes } = {}) { void label; if (highStakes &&
  epistemicIndependence() === 'WEAK') return false; return true; }`. Every non-definition hit is a TEST file or
  a negative-import guard. `weak-flag.js:40-42`: "mayGate is currently UNCONSUMED by any action path (only tests
  call it); its true-branch authorizes NOTHING today."

- **Claim:** `convert.js` hardcodes `actionable:false` as a literal and never calls `mayGate`; nothing in `v0/src` can flip it.
  **Probe:** Read `convert.js:125-137` + Grep `actionable` in `v0/src`.
  **Observed:** `convert.js:134` `actionable: false,` is a bare object literal; no `mayGate` import. Grep
  `actionable` across `v0/src` returns exactly TWO src writers: `convert.js:134` (the literal) and
  `issuance-policy.js:103` comment — no assignment, no conditional, no code path that mutates it.

- **Claim:** `epistemicIndependence()` is a hardcoded `return 'WEAK'` — the sole U2 lift-point, currently returns WEAK unconditionally.
  **Probe:** Read `weak-flag.js:66-68`.
  **Observed:** `function epistemicIndependence() { return 'WEAK'; }` — a literal, no branch. `weak-flag.js:61-64`
  marks it "THE SOLE function the U2 substrate-diversity estimator replaces... the WEAK flag lifts here and ONLY here."

- **Claim:** research/24's demote-only amendment (`{WEAK, ENTANGLEMENT-DETECTED}`) is design-only and UNWIRED; even
  when built it can only DEMOTE, never yield a positive STRONG.
  **Probe:** Grep `ENTANGLEMENT|ENTANGLED|demote-only|DEMOTE` in `v0/src` (No matches) + Read
  `research/24-world-anchored-u2-signal-feasibility.md:75-94,136-144`.
  **Observed:** ZERO matches in `v0/src` — unbuilt. research/24 §4.1: range `{WEAK, ENTANGLEMENT-DETECTED}` is a
  DEMOTE-only flag; "`epistemicIndependence()` must NEVER return a positive STRONG"; positive verdict is
  [SOURCED]-not-identifiable-from-observables (arXiv:2604.07650).

---

## §2 Charter corrections (the LENS wins over plans/27 §5)

**[CHARTER CORRECTION 1 — the `parseEnabledFlag` symbol is PACT's, not the toolkit's].** plans/27:165 says
"reuse the existing strict `parseEnabledFlag`" as if borrowing from the toolkit. LENS B proved `parseEnabledFlag`
does NOT exist in the toolkit (no matches); the toolkit's strict parse is `normalizeBool`
(`host-claude-guard.js:69-73`). PACT already owns `parseEnabledFlag` (`request-auth.js:35-41`) and it is
STRICTER than `normalizeBool` (accepts only `'1'`/`'0'`, not `'true'/'yes'/'on'`). **Consequence:** the strict
half is a PACT-internal reuse (export/hoist), not a toolkit port. Only the LENIENT half is genuinely borrowed.

**[CHARTER CORRECTION 2 — the "split-brain re-reads" claim is HALF-TRUE].** plans/27:164 frames all three named
flags as split-brain. LENS A proved only `PACT_BROKER_PERSONA_DID` is genuinely double-read (`broker-sign.js:70`
and `:102`) with DIVERGENT semantics (presence-only `length>0` vs ASCII-trim+exact-byte-equal).
`PACT_BROKER_REQUIRE_FRAME` (`:69`) and `PACT_BROKER_ALLOWED_UIDS` (`:87`) each have a SINGLE runtime JS reader
routed through a single parser. **Consequence:** the "single-arming-source / collapse split-brain" 5a work has
a much smaller true surface than the charter implies. See §4 note on 5a scope.

**[CHARTER CORRECTION 3 — "per-receiver `mayGate`" names a nonexistent construct].** LENS D proved `mayGate`
`void`s its label (`weak-flag.js:51`), is receiver-AGNOSTIC, and is UNCONSUMED by any src path. Wiring it into a
receiver-scoped call-site is NEW WORK, not a borrow — and out of Phase-5 scope (Phase 5 ships DARK). **Consequence:**
`mayGate` is used in Phase 5 ONLY as a darkness-proof witness, never as a surface to make live.

---

## §3 The named gate surface (with the U2 dependency LOUD)

Phase 5's harness is a `(flagName, gatePredicate)` SEAM. It does not select a gate to arm; there is none to arm.
The doc names the surface a FUTURE gate would guard, so the darkness is concrete and testable.

**PRIMARY named surface: `convert.actionable` (`convert.js:134`).** This is the actual trust-decision predicate a
future gate guards. It is a hardcoded `false` literal (LENS D probe). Arming it is gated on BOTH:

1. the full P4 UNFORGEABLE bar (probation + per-path voucher stake + behavioral demo, `convert.js:117-124`), AND
2. the U2 estimator REPLACING `epistemicIndependence()` (`weak-flag.js:66-68`).

**THE U2 DEPENDENCY, LOUD:** `epistemicIndependence()` is a hardcoded `return 'WEAK'` and is the SOLE lift-point
(`weak-flag.js:61-68`). research/24 §2 proves the POSITIVE verdict (a STRONG independence claim) is
un-establishable from observables (arXiv:2604.07650 identifiability bound). The eventual demote-only estimator
(`{WEAK, ENTANGLEMENT-DETECTED}`) is UNWIRED (zero tokens in `v0/src`) and can only ever DEMOTE, tightening the
gate, never unlocking it. **Therefore `convert.actionable` is "even DARKER than drawn" (plans/27 §5's own words):
it can never legally arm pre-U2, and U2's positive direction is a closed frontier for observables.**

**SECONDARY surface: `mayGate` (`weak-flag.js:47-54`) — darkness-proof witness ONLY.** Per CHARTER CORRECTION 3,
`mayGate` is unconsumed, receiver-agnostic, and `void`s its label. Phase 5 uses it ONLY to WITNESS darkness: arm
the flag, assert `mayGate` still returns `false` on `{highStakes}` while `epistemicIndependence()==='WEAK'`.
Arming is a provable no-op there (it already fail-closes on the always-WEAK global).

**Honest darkness level (NS-9):** There is NO gate point Phase 5 could legally arm pre-U2 to change a decision.
The deliverable is the seam + the asymmetric parse + the coherence preflight + a NON-VACUOUS darkness test
proving the ARMED predicate value == the DARK predicate value.

---

## §4 The layering decision (NS-11 prerequisite) — Option 2 CHOSEN

**CHOSEN: Option 2 — coherence gate lives in `trust/`; the pure single-flag parser lives in the `lib/` floor.**

Rationale (LENS C, all probed):

- **Legality with zero new permissions.** `trust->identity` is already permitted (`layering.test.js:77` bans
  only `grounding`) and exercised by SIX trust files. A coherence gate in `trust/` that reads identity-side arm
  signals fits the existing DAG exactly, mirroring `read-gate.js:14`.
- **The pure parser in `lib/` is auto-guarded.** `lib`'s ban (`layering.test.js:62`) already forbids `lib`
  reaching up, so a pure env-flag parser placed in the floor needs no new source-ban and cannot reach into
  `identity/`/`trust/`.
- **KISS/YAGNI.** Option 2 adds ONE tripwire (the P5-W0 add both options need) and zero new layer registrations.

**REJECTED: Option 1 — a new foundational leaf (`independence/arming.js` or a new dir) with strict DI.** Rejected
because (LENS C) it requires: registering a NEW dir in `DAG_LAYERS` (`layering.test.js:54`) + the precondition
block + a NEW `offenders('<newleaf>',[everything-above])` source-ban + adding `<newleaf>` as a banned TARGET in
BOTH `lib`(62) and `audit`(67) bans — strictly more test churn for EQUAL safety, and it still pushes the
identity-reading coherence logic to the caller via DI. This violates the test's own stated YAGNI posture
(`layering.test.js:9`, "YAGNI for 35 files").

**The NS-11 tripwire gap is REAL and is a hard Phase-0 prerequisite.** LENS C confirmed plans/27 §5 HIGH #1
verbatim: `layering.test.js` has no `offenders('independence', ...)` source-ban, so an `independence/arming.js`
reaching UP into `identity/` would pass silently. This must be armed BEFORE any arming code is written (P5-W0).

---

## §5 Sub-wave decomposition

The toolkit ran a 5-flag / 3-sub-wave (A-W1/A-W2/A-W3) shape. **PACT's surface is smaller** (LENS B: PACT
already owns the two hardest pieces — strict `parseEnabledFlag` + `refuseAlert`; only the lenient predicate and
the coherence preflight are genuinely new). **So PACT collapses 5a/5b/5c into FEWER waves.** P5-W0 is the
layering prerequisite; P5-W1 and P5-W2 cover the harness.

| Wave | Covers | One-line |
|---|---|---|
| **P5-W0** | NS-11 prerequisite | Add the `independence`-as-source layering tripwire (test-only, passes today). |
| **P5-W1** | 5a + 5b | Single-arming-source (export/hoist strict parser + the double-read collapse) AND the lenient deployed-signal predicate + misconfig alert + fuzz. |
| **P5-W2** | 5c | Both-or-neither `armingCoherence` preflight (DI-injected sibling arm) in `trust/` + the non-vacuous darkness test. |

**Why 5a+5b merge (P5-W1):** LENS A proved 5a's TRUE surface is small (only `PERSONA_DID` is a real double-read;
the other two flags are already single-reader). 5b's lenient predicate lives in the SAME `lib/` floor leaf as
5a's strict parser, is fuzz-tested in the SAME test file, and shares the `refuseAlert` channel. Splitting them
would be two PRs touching the same two files — YAGNI. They land together.

**Why 5c stays separate (P5-W2):** the coherence preflight lives in a DIFFERENT layer (`trust/`, per §4) than the
parser leaf (`lib/`), imports `identity/`, and carries the darkness-proof witness test against `mayGate`. It is a
distinct review surface (the identity-reading edge is the one that would trip NS-11 if P5-W0 were skipped), so it
gets its own VALIDATE board.

---

### P5-W0 — the NS-11 layering tripwire (Phase-0 prerequisite)

- **Scope:** Add one `offenders('independence', ['trust','grounding','identity','frame','atms','audit'])`
  assertion to `layering.test.js`. Ban list omits `lib` and `scope` deliberately (LENS C: `independence` may
  legally reach `lib`, and `scope` is foundational). `audit` is ADDED beyond the plans/27 charter list for
  leaf-to-leaf symmetry: `audit` already bans `independence` (`layering.test.js:67`); neither leaf may import
  the other.
- **Files touched:** `v0/test/unit/layering.test.js` ONLY (additive `test()` block, no source change).
- **Test plan:** the new assertion passes on today's code (LENS C probe: `independence/weak-flag.js` has zero
  `require()` calls -> empty offenders set). NON-VACUITY: the existing precondition block (`layering.test.js:50-59`)
  already guards that `independence` is a non-empty dir in `DAG_LAYERS`, so the tripwire cannot disarm silently.
- **Risk:** LOW. Test-file-only, additive, independent of the arming.js home decision. Arms the tripwire BEFORE
  any arming code exists.
- **Exit criteria:** `layering.test.js` green with the new assertion; a scratch probe (write a throwaway
  `independence/x.js` importing `../identity/registry`, confirm the assertion goes RED, revert) proves the
  tripwire is NON-VACUOUS.

### P5-W1 — single-arming-source (5a) + lenient deployed-signal (5b)

- **Scope:**
  - **5a:** Export/hoist PACT's strict `parseEnabledFlag` (currently file-private, `request-auth.js:35-41`, NOT in
    `module.exports:127`) into a `lib/` floor leaf so it is reusable (per CHARTER CORRECTION 1, this is a
    PACT-internal reuse, not a toolkit port). Collapse the ONE real split-brain: the `PACT_BROKER_PERSONA_DID`
    double live-read (`broker-sign.js:70` and `:102`) into a single read passed as an injected param to both
    consumers.
  - **5b:** Add the LENIENT deployed-signal predicate PACT lacks (the `isDeployFlagSet` SHAPE from
    `host-claude-guard.js:82-88`, re-derived + renamed per PACT convention): boolean passthrough; `''` -> false;
    `'0'|'false'|'no'|'off'` -> false; ANY OTHER non-empty token (incl. an operator typo) -> true (fail-CLOSED).
    Emit a misconfig alert via PACT's existing `refuseAlert` (`refuse-alert.js:32`), `class:'misconfig'`.
- **Files touched:** a new `v0/src/lib/<arm-parse>.js` leaf (strict + lenient parsers); `broker-sign.js` (collapse
  the PERSONA_DID double-read to one injected value); `request-auth.js` (export or delegate the strict parser).
- **DO NOT collapse (LENS A hard boundary):** (a) the `PACT_BROKER_*` env READS must stay in the broker process
  (`broker-sign.js`) so values remain host-untamperable per the root-owned wrapper model; the arming PARSER moves
  to `lib/`, the READS do not. (b) The two DIFFERENT persona-did semantics (presence-only for the mode decision
  vs ASCII-trim+exact-byte for the per-request bind, `request-auth.js:106-109`) are INTENTIONAL — collapse the
  double-READ, NOT the divergent parse. (c) `PACT_BROKER_ALLOWED_UIDS` is exact-set three-way
  (disabled/deny/allow) and does NOT fold into a two-state `(flagName, gatePredicate)` arming predicate.
- **Test plan:**
  - Strict parser: `'1'`->true, `'0'`->false, `'true'/'false'/'2'/''/null`->null (falls to default).
  - **TYPO/GARBAGE FUZZ (mandatory, per #430, mirroring `judge-cross-uid-routing.test.js:55-62` +
    `world-anchor-arming.test.js:42-58`):** the LENIENT predicate MUST be fuzzed with typo/garbage tokens
    (`'ture'`, `'enabled'`, `'0x1'`, `'-1'`, `'yes please'`, `'[object Object]'`), asserting each non-falsey
    garbage token -> `true` (deployed-signal fires -> fail-CLOSED). A valid-token-only sweep is blind to exactly
    the typo-fails-OPEN bug this predicate exists to prevent.
  - The misconfig alert emits (observable, non-vacuous): inject a typo, assert `refuseAlert` fired with
    `class:'misconfig'`.
- **Risk:** MEDIUM-HIGH. Touches `broker-sign.js` (a custody-critical file). The double-read collapse must preserve
  the two divergent persona-did semantics; a naive single-predicate collapse would erase the load-bearing
  broker-side-trim-vs-untrusted-body-exact distinction (LENS A "must NOT collapse" (b)).
- **Exit criteria:** strict + lenient parsers exported from the `lib/` leaf; PERSONA_DID read exactly once in
  `broker-sign.js`; both consumers receive it as an injected param and retain their distinct semantics; the fuzz
  suite green (typo -> fail-CLOSED proven); the misconfig alert observable + non-vacuous; `broker-sign.js`
  behavior byte-identical for all valid inputs (proven by the existing custody test legs, not asserted).

### P5-W2 — both-or-neither coherence preflight (5c) + darkness witness

- **Scope:** Add `armingCoherence(siblingArmed)` in `trust/` (per §4), re-deriving the toolkit SHAPE
  (`world-anchor-arming.js:71-80`) parameterized over `(flagName, gatePredicate)`: a PURE function returning
  `{ armed, coherent, reason }`, taking the sibling flag's state as an INJECTED boolean param (the DI seam that
  keeps each module the sole reader of ONE flag and avoids an import cycle). Re-derive the reason strings for
  PACT's flag pair; treat one XOR direction as legit-staging, the other as fail-closed-dark. Emit an incoherence
  alert via `refuseAlert` (use a `cause`-keyed detail, NOT `reason`, so the positional `reason` token does not
  clobber it — LENS B note on `custody-arming.js:39-40`,`:49-50`).
- **Files touched:** a new `v0/src/trust/<arm-coherence>.js`; its test file; the darkness-witness test.
- **Test plan:**
  - Coherence combos (both-armed / neither-armed -> coherent; each XOR -> the correct reason string);
    DI-defensiveness (non-boolean `siblingArmed` coerces to false).
  - Incoherence + misconfig alerts observable + DISTINCT (a typo must NOT also fire `-incoherent`; mirror the F2
    suppression at `custody-arming.js:45-48`).
  - **DARKNESS WITNESS (non-vacuous, the NS-9 proof):** arm the flag in the test, assert the wrapped predicate's
    ARMED value is byte-identical to its DARK value — `mayGate({highStakes:true})` still returns `false` while
    `epistemicIndependence()==='WEAK'`, and `convert.actionable` stays `false`. Prove arming changes NO decision.
- **Risk:** MEDIUM. The `trust/` file imports `identity/` (the edge P5-W0's tripwire guards); if P5-W0 were
  skipped this is where an uncaught up-reach would land. With P5-W0 first, the edge is guarded from the first commit.
- **Exit criteria:** `armingCoherence` pure + DI-injected + sole-reader-of-one-flag; all coherence combos + the
  distinct-alerts tests green; the DARKNESS WITNESS test proves ARMED == DARK for both named surfaces; `trust/`
  layering assertion still green (the new file's `identity/` import is permitted, not a `grounding` reach).

---

## §6 What this does NOT do (NS-9)

- **It does NOT arm any gate.** There is no gate point that, when armed, would change a trust decision pre-U2
  (LENS D). `convert.actionable` stays `false`; `mayGate` stays fail-closed-on-WEAK. Arming is a provable no-op.
- **It does NOT lift U2.** `epistemicIndependence()` stays `return 'WEAK'`. Phase 5 does not touch it. The
  positive independence verdict is un-establishable from observables (research/24 §2, arXiv:2604.07650).
- **It does NOT wire `mayGate` into a call-site.** `mayGate` remains receiver-agnostic and unconsumed; Phase 5
  uses it only as a darkness witness (CHARTER CORRECTION 3).
- **It does NOT pull `PACT_BROKER_*` reads out of the broker process.** The env reads stay in `broker-sign.js` so
  values remain host-untamperable (LENS A); only the parser moves to `lib/`.
- **It does NOT fold `ALLOWED_UIDS` into the generic arming predicate.** That flag is exact-set three-way and
  keeps its own parse (LENS A).
- **It does NOT report any NARROW as a HARDENING.** Even the eventual demote-only U2 estimator NARROWS in-process
  (OQ-NS-6) and can only TIGHTEN, never unlock. No arming on the U2 axis HARDENS.

---

## §7 Open decisions for the USER

1. **Strict-parser vocabulary.** PACT's `parseEnabledFlag` accepts only `'1'`/`'0'` — STRICTER than the toolkit's
   `normalizeBool` (`'1'/'true'/'yes'/'on'`). Reuse PACT's stricter form as-is (LENS B recommendation: the safer
   default), or widen it to the toolkit vocabulary? Default recommendation: keep `'1'`/`'0'`.
2. **Go-ahead granularity.** Approve all three waves at once, or gate P5-W0 (safe, test-only) separately from the
   P5-W1/P5-W2 harness build that touches `broker-sign.js`? Default recommendation: land P5-W0 first, then a
   separate go-ahead for P5-W1+P5-W2.
3. **Whether to build the harness at all given proven darkness.** LENS D confirms the harness is pure dormant
   infrastructure that can never arm a decision pre-U2. Confirm the value proposition (an installed
   `(flagName, gatePredicate)` seam + asymmetric parse + coherence preflight + a darkness proof) is worth the
   MEDIUM-HIGH `broker-sign.js` risk NOW, versus deferring until a U2 estimator is on the horizon.

---

## §8 USER decisions (2026-07-01) — the §7 questions answered

1. **Strict-parser vocabulary: keep `'1'`/`'0'` only.** PACT's stricter form stays; no widening to the toolkit
   `normalizeBool` vocabulary. Zero behavior change for deployed boxes.
2. **Go-ahead granularity: P5-W0 now; P5-W1+W2 gated on a SEPARATE go-ahead.** The test-only tripwire lands
   first; the harness build that touches `broker-sign.js` waits for its own explicit approval.
3. **Build-at-all: affirmed for P5-W0 only.** The dormant-infrastructure value question for the harness proper
   (P5-W1/W2) is deferred to that separate go-ahead — decision 2's gate is where it gets answered.

This doc ships as its own docs PR (the Phase-3 precedent); P5-W0 ships as a separate test-only PR.

---

## Requirements Checklist

| # | Requirement (from the Phase-5 charter + spawn brief) | Disposition |
|---|---|---|
| 1 | 5a single-arming-source (sole reader/parser collapsing split-brain env re-reads) | ADDRESSED in P5-W1; scope corrected by CHARTER CORRECTION 2 (only PERSONA_DID is a real double-read) |
| 2 | 5b LENIENT deployed-signal predicate (typo fails CLOSED) + misconfig refuse-alert | ADDRESSED in P5-W1 (re-derive `isDeployFlagSet` shape; emit via `refuseAlert`) |
| 3 | 5b typo/garbage-token FUZZING in the VALIDATE-hacker lens | ADDRESSED in P5-W1 test plan (mandatory typo/garbage fuzz, mirroring #430 test files) |
| 4 | 5c both-or-neither coherence preflight (DI-inject the sibling arm) | ADDRESSED in P5-W2 (`armingCoherence`, DI-injected, pure, in `trust/`) |
| 5 | Re-rated HIGH effort / MEDIUM-HIGH risk; decompose into sub-waves | ADDRESSED in §5 (P5-W0 + P5-W1 + P5-W2; per-wave risk stated) |
| 6 | Critique HIGH #1: NS-11 `layering.test.js` independence source-ban added FIRST | ADDRESSED as P5-W0 (hard Phase-0 prerequisite) |
| 7 | Critique HIGH #2: name the REAL gate surface (`mayGate` unconsumed + receiver-agnostic; `convert.actionable` hardcoded false + U2-blocked) | ADDRESSED in §3 (primary `convert.actionable`, secondary `mayGate`-as-witness, U2 dependency LOUD) |
| 8 | Everything ships DARK; NS-9 forbids reporting narrowed as hardened | ADDRESSED in §6 "What this does NOT do" + the honest-labeling header |
| 9 | Doc is SCOPING only; build does not start; awaits USER go-ahead | ADDRESSED (§7 open decisions; RESOLVED by §8 — P5-W0 greenlit, W1+W2 gated) |

---

## P5-W0 — SHIPPED (2026-07-01, PR #32 merged `4dbd177`)

The layering tripwire landed test-only, 10 lines; `audit` added to the ban list beyond the charter
(leaf-to-leaf symmetry). NON-VACUITY proven live (a planted `independence->identity` probe went RED naming
the exact offender, reverted GREEN). 413/0; CI green; pre-PR CodeRabbit CLI 0 findings (the PR bot was
rate-limited on both #31/#32 — merged on CI + the CLI lens, the #11 precedent).

## P5-W1 — VALIDATE result (2026-07-01, branch `feat/p5-w1-arming-source`; W1+W2 USER-greenlit)

BUILT (TDD; the arm-flags tests ran RED before the leaf existed): NEW `v0/src/lib/arm-flags.js`
(`parseEnabledFlag` hoisted VERBATIM from `request-auth.js`; `isDeploySignalSet` lenient/typo-fails-CLOSED,
a labeled FORWARD-CONTRACT export for W2, UNCONSUMED in W1; `assessEnableFlag -> {enabled, misconfig}` with
the misconfig refuse-alert, NO raw-token echo, never gates/throws) + `request-auth.js` delegates the strict
parse + `broker-sign.js` single-reads REQUIRE_FRAME/PERSONA_DID at top-of-main and threads them (the real
split-brain — the PERSONA_DID double-read — collapsed). 20 unit tests (incl. the mandatory typo/garbage fuzz
+ the named ASCII-trim-divergence tripwire) + 3 broker integration legs (shape-tripwire; live `'ture'`-typo
decision-unchanged+alert on a REAL spawned broker; legacy no-alert). 436/0; eslint clean.

**Pre-build VERIFY (2-lens, `wf_528a3da9-286`): architect + hacker both SOUND-WITH-CHANGES, 0 CRIT/HIGH.**
Key folds: `assessEnableFlag` returns NO `deploySignal` field (an enable flag must never carry the lenient
semantics — the hacker fold that reshaped the API); structured-field alert assertions (a bare
`includes('misconfig')` is vacuous); the ASCII-trim divergence is a NAMED load-bearing test; the
forward-contract label on `isDeploySignalSet`; the legacy-no-alert leg.

**Post-build VALIDATE (3-lens, `wf_4ac11ab6-5b4`): code-reviewer SHIP · hacker SHIP-WITH-NITS (live probes
vs the BUILT modules + real broker spawns: all 5 attack vectors SAFE — no oracle reopen, no log injection
[a newline-bearing flagName emits exactly ONE escaped line], no strict/lenient consumer divergence, no
fail-OPEN garbage token, collapse decision-identical) · honesty-auditor SHIP.** Folded: the hacker NIT
(`String(flagName)` evaluated outside `refuseAlert`'s try — a throwing `toString` broke the never-throws
contract in a live probe; now a guarded coercion + a regression test) + the reviewer NIT (a drain-order
comment: the assess call is a non-exiting write, safe before the stdin drain) + the honesty LOW folded into
the PR body (the "byte-identical" claim scopes to the sign decision + stdout/exit contract; stderr
deliberately gains ONE advisory line on a present-but-invalid flag — that line IS the feature).

**Honest scope (NS-9):** parsing + observability only. Nothing arms, narrows, or hardens; `isDeploySignalSet`
ships dormant (first consumer = W2's `armingCoherence`). The named gate surface stays U2-blocked (§3).

## P5-W2 — VALIDATE result (2026-07-01, branch `feat/p5-w2-arming-coherence`; W1+W2 USER-greenlit)

BUILT (TDD; both W2 tests ran RED before the module existed): NEW `v0/src/trust/arming-coherence.js` —
`armingCoherence({admissionArmed, signingArmed}) -> {admissionArmed, coherent, reason}` (PURE both-or-neither;
BOTH params strict-coerced `=== true` before any derivation) + `armingDecision(input)` (compute-then-EMIT, the
intended consumer entry so a `coherent:false` is never silent; cause-keyed `refuseAlert`). Imports ONLY
`../lib/refuse-alert`. NEW `arming-coherence.test.js` (15) + NEW `arming-darkness-witness.test.js` (3). Suite:
`node test/run.js` -> **28 files, 454 passed, 0 failed, exit 0** (was 436; +18); eslint clean; layering green
(trust->lib legal); the darkness witness proves ARMED == DARK (`mayGate` refuses, `convert.actionable` false)
under full arming.

**CHARTER CORRECTION #4 (fully-DI, NO new env var) — VERIFY-confirmed by BOTH lenses.** The toolkit's
`armingCoherence` reads one real deployed flag (`LOOM_WORLD_ANCHOR_ARM`) because it OWNS one + has two live
consumers that must not split-brain. PACT owns NO live arm flag (its world-anchored signer is Phase 6,
DARK/unbuilt) and has ZERO consumers, so a new `PACT_*` admission env var would be a consumed-by-nothing
runtime read (a fail-open confusion surface, worse than W1's labeled forward-contract). PACT reads zero flags;
both arms are injected. This supersedes the plan-prose "sole-reader-of-one-flag" (§5) — the probed reality wins.

**Pre-build VERIFY (2-lens, `wf_b04dcc73-79c`): architect + hacker both SOUND-WITH-CHANGES.** Folds: correction #4
adopted; BOTH params strict-coerced (HIGH — a fully-DI port must defend both, not just the sibling); the
darkness witness made NON-VACUOUS (hacker CRITICAL — as first drawn it was a tautology, causally disconnected
from the gates); `armingDecision` as the emit-bearing consumer entry (no silent fail-closed); the
`signing-armed-without-admission` "legit staging" rationale reframed as a FUTURE contract (PACT has no signer to
stage toward); cause-keyed (not reason-keyed) alert.

**Post-build VALIDATE (3-lens, `wf_aef859a0-c48`): code-reviewer SHIP · hacker SHIP (live probes vs the BUILT
module: darkness-witness non-vacuity CONFIRMED capable-of-RED; no non-boolean fakes armed/coherent; no silent
fail-closed; reads no env; reason is a fixed enum) · honesty-auditor SHIP-WITH-NITS.** Folded: the hacker LOW
(the structural dormancy tripwire scanned only 2 of 7 decision-shaped modules -> now a COMPUTED whole-tree scan
of all `v0/src/**/*.js`, so wiring arming into ANY future gate goes RED) + the `armingDecision(input = {})`
default-param symmetry NIT + the honesty prose NITs (mechanism-1 vs mechanism-2 division of labor; the
byte-identical/stderr-emit scope note). **Scope of "byte-identical / DARK": the GATE DECISIONS (`mayGate`,
`convert.actionable`) + the pure return struct; `armingDecision` intentionally emits ONE operator-side stderr
line on an incoherent XOR — that alert is the observability feature, not a darkness violation.**

**Honest scope (NS-9):** a DORMANT coordination primitive. Both arms are forward-contracts (neither flag exists;
the admission arm awaits a real gate, the signing arm awaits the Phase-6 cross-uid signer). It arms nothing,
narrows nothing, hardens nothing. The "legit staging" asymmetry is the intended FUTURE contract, NOT a live
PACT workflow — when the Phase-6 signer lands, those FUTURE-contract labels must flip to live (status-decay rule).

## Phase-5 status (2026-07-01)

**P5-W0 + P5-W1 + P5-W2 ALL MERGED (#32 `4dbd177`, #33 `70e2a7b`, #34 `c8c9790`).** The arming
HARNESS is mechanism-complete + DARK: a fully-DI both-or-neither coordination primitive + the single-arming-source
parse leaf + the asymmetric deployed-signal predicate + a non-vacuous darkness witness. **Nothing arms** — the named
gate surface (`convert.actionable`) stays U2-blocked; the signing arm awaits Phase 6. Phase 6 (the authenticated
cross-uid minter) stays DARK/design-only, its own scoping + go-ahead.
