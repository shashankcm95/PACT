---
lifecycle: persistent
status: SCOPING -> VERIFY -> TDD build (W2 = the DARK armed admission gate; the wiring + the deploy are LATER)
plan: 33
created: 2026-07-02
depends-on: plans/32 (W1 -- the sigma_root verification substrate this arms) ; plans/28 (P5-W2 arming-coherence, the both-or-neither primitive this is the FIRST consumer of) ; PACT-NORTH-STAR.md NS-6/NS-7/NS-8/NS-9 ; INV-16 (actionable never flips pre-U2) ; INV-18 (registry RECORDS, never an oracle)
audience: a build session (W2) + the eventual operator (the arm + the grandfather policy at deploy) + the USER (go-ahead gate)
title: sigma_root W2 -- the DARK armed admission gate (the enforcement DECISION, ships disarmed + wired to nothing)
---

# Plan 33 -- sigma_root W2 (the DARK armed admission gate)

> **HONEST-LABELING HEADER (read first, NS-9 + the prematurity check).**
> W2 builds the ENFORCEMENT DECISION for W1's sigma_root verifier: a gate that, WHEN ARMED, turns the advisory
> verifier's FAIL into a REJECT. **It ships DARK: disarmed by default (byte-identical pass-through), armed only by
> injection (PACT owns NO live arm flag -- plans/28 charter correction #4), and WIRED TO NOTHING** (a standalone
> dormant primitive, exactly like `arming-coherence.js` which it is the first consumer of). It arms nothing,
> gates nothing, narrows nothing today.
>
> **PREMATURITY CHECK (surfaced honestly, for the VERIFY board + the USER).** W2 does **NOT advance the trust
> frontier.** Per OQ-NS-6 only a world-anchored signal HARDENS trust, and the world-anchor here is the operator's
> out-of-band root-key attestation (the USER's act, NS-7) -- which W2 does not touch. W2 is DARK forward-contract
> infrastructure: it completes the enforcement DECISION (the hard part -- fail-closed-when-armed, an OBSERVABLE
> reject, grandfather support) so that WHEN the operator deploys a world-anchored root key, arming is a flag-flip +
> a trivial wiring, not a build. This is the same "build the mechanism DARK, arm at deploy" pattern as P5's arming
> harness and the toolkit's B5 Rubicon. **The honest alternative** (raised for the USER): skip W2 and prepare the
> operator-deploy harness instead (the thing that actually hardens). W2 is defensible as ready-to-arm plumbing;
> it is NOT a trust advance, and this plan will not let a summary call it one.
>
> **Claude builds + verifies the DARK gate; the USER arms it (a deploy-time act) + sets the grandfather policy +
> attests the root key.** Claude NEVER injects `admissionArmed=true` into a live path, sets a flag, or attests
> (NS-7).

## What this wave delivers (W2 -- the DARK admission-gate DECISION)

One source unit + its darkness witness. DORMANT: wired to no fold, arms nothing when disarmed, byte-identical live
behavior (the fold reads none of this). It is the FIRST consumer of `arming-coherence.js`'s `admissionArmed` arm.

1. **`v0/src/trust/admission-gate.js` (NEW).** The PURE sigma_root admission DECISION, composing the two earned
   mechanisms (NS-10):
   - `admissionDecision({ registry, personaDid, sigmaRoot, admissionArmed, signingArmed }, { grandfather })` ->
     `{ admit:boolean, armed:boolean, reason:string, provenance?:object }`. PURE + fail-closed + NEVER throws.
     **`grandfather` lives on a SEPARATE TRUSTED `policy` arg** (pre-PR CodeRabbit Major), never the `input` record:
     it is a crypto-BYPASSING override callback, so a caller spreading an attacker record into `input` must not be
     able to smuggle one into an admission bypass.
   - **Step 1 -- arm preflight** via `armingDecision({ admissionArmed, signingArmed })` (`arming-coherence.js`):
     the both-or-neither, OBSERVABLE (a `coherent:false` emits, never silent -- security.md). `admissionArmed(out)`
     = admission AND signing (both-or-neither).
   - **Step 2 -- DISARMED (the DARK default) -> `{ admit:true, armed:false, reason:'disarmed-passthrough' }`.**
     When disarmed, EVERY persona is admitted -- byte-identical to today (there is no admission gate today). This is
     what makes the gate byte-identical-when-wired-later: the dark default is a pure pass-through.
   - **Step 3 -- ARMED -> verify** via `assessRegistrationFromRegistry(registry, { personaDid, sigmaRoot })` (W1's
     safe-path-by-default wrapper -- sources the root key from the FROZEN registry, never a caller-supplied one):
     - `sigmaRootChecksPassed` -> `{ admit:true, armed:true, reason:'sigma-root-verified', provenance }`.
     - else + `grandfather(personaDid) === true` -> `{ admit:true, armed:true, reason:'grandfathered-legacy-persona' }`
       + an OBSERVABLE emit (a grandfather admission is a policy EXCEPTION worth surfacing, not silent).
     - else -> **REJECT** `{ admit:false, armed:true, reason:'sigma-root-unverified' }` + an OBSERVABLE emit (a
       fail-closed reject MUST be observable -- security.md: you cannot alert on / debug a silent `{ok:false}`).
   - **The grandfather hook** (`grandfather`, an injected `personaDid -> boolean`, default `() => false`) SUPPORTS
     the deploy-time migration policy WITHOUT hard-coding one. Default `() => false` = strict fail-closed (an armed
     gate rejects every sigma_root-free legacy persona -- the disclosed arming migration cliff). The operator opts
     into a grandfather predicate at deploy; W2 only provides the seam.
   - **NEVER throws -- with the C1 CORRECTION (VERIFY hacker CRITICAL): the arm signal is read on its OWN guarded
     path, INDEPENDENT of the attacker-influenced record fields.** The W1 template (extract all fields in one try,
     undefined-on-throw) is fail-CLOSED for W1 (undefined -> checks FAIL) but INVERTS to fail-OPEN for W2 (a poisoned
     `personaDid`/`sigmaRoot`/`admissionArmed` getter collapses the arm to `undefined` -> disarmed -> admit-all, so
     an intended-ARMED gate silently ADMITS an unverified persona). The corrected structure:
     - **(a)** read `admissionArmed`/`signingArmed` FIRST, in their own try; a THROW there (a getter on the trusted
       arm input) is INDETERMINATE -> fail CLOSED (`admit:false, armed:true`) + emit, NEVER silently disarm (C1/M1).
     - **(b)** decide DISARMED from the ARM ALONE (an absent/false/XOR-incoherent arm -> disarmed pass-through =
       admit-all = byte-identical-today; the incoherence still emits via `armingDecision`).
     - **(c)** only on the ARMED branch, read the record fields in a SEPARATE try; ANY read failure -> REJECT.
     - **(d)** a dedicated try around `grandfather()` (a throw -> NOT grandfathered -> REJECT; a truthy-non-boolean
       -> NOT grandfathered via `=== true`) (M2).
     - **(e)** the REJECT emit is CLASSED (H2): a present-but-unverified sigma_root (R3 fails, R1+R2 pass) is
       tamper/forgery -> `integrity`; an absent sigma_root / unseeded root -> `misconfig`. A grandfather ADMIT emits
       too (a named exception, not silent).

## The arming migration cliff -- how W2 handles it (plans/32 F7, the load-bearing tension)

An armed gate with the default `grandfather=() => false` REJECTS every existing sigma_root-free persona (none carry
a sigma_root yet -- the field is new). W2 does NOT decide the migration; it provides the **grandfather seam** so the
deploy-time operator picks ONE of:
- **re-registration campaign** -- every persona is re-registered carrying a root-signed sigma_root (needs the
  operator's world-anchored root key); then `grandfather=() => false` is correct and no persona is grandfathered.
- **grandfather predicate** -- e.g. `grandfather = did => registeredBefore(did, cutoffTimestamp)` admits legacy
  personas while requiring sigma_root for new ones. An explicit, auditable policy -- and every grandfather admission
  EMITS (it is a named exception, not a silent pass).
The default is the STRICT one (reject) so a mis-armed gate fails CLOSED, never silently admits. The policy CHOICE is
the operator's, at deploy -- W2 is the mechanism, not the policy.

## Runtime Probes (firsthand this session, against the repo NOW -- re-probe at build-time)

| # | Claim | Probe | Observed |
|---|---|---|---|
| 1 | `arming-coherence.js` is DORMANT with ZERO live consumers; W2 is its FIRST | grep `armingCoherence\|armingDecision\|admissionArmed` across `v0/src` | Only a comment ref in `arm-flags.js:12`. No live consumer. `armingDecision` = compute-then-emit, both-or-neither, reads no env (fully DI). |
| 2 | `assessRegistrationFromRegistry` is the W1 safe-path wrapper W2 composes (sources the root key from the registry, fail-closed on null) | Read `registration-provenance.js` (merged #39) | `assessRegistrationFromRegistry(reg,{personaDid,sigmaRoot})` -> sources publicKeyPem/controller/rootPublicKeyPem from frozen rows; fail-closed on any null; anchors on lookupRootKey NOT isKnownRoot. |
| 3 | `convert.actionable` is HARD-false (U2 open) -- sigma_root admission is ORTHOGONAL, does not wire here | Read `convert.js:114,121,134` | `actionable:false` always (INV-16); comment: MUST NOT flip until DISJOINT_PATHS + probation + behavioral demo + the U2 estimator. sigma_root admission is a registration-provenance concern, not a U2 one. |
| 4 | `refuseAlert(reason, detail)` writes reason LAST/authoritative -- the observable-emit channel | Read `refuse-alert.js` | `refuseAlert(reason, detail={})`; `reason` is set LAST so it is un-clobberable; cause-keyed detail rides alongside (the arming-coherence pattern). |
| 5 | PACT owns NO live arm flag; a new PACT_* admission env var would be consumed-by-nothing (fail-open risk) | Read `arming-coherence.js:9-14` | "PACT owns NO live arm flag ... reads NO env var; BOTH arms are injected by the (future) caller. A new PACT_* admission env var now would be a consumed-by-nothing runtime read inviting a fail-open confusion." -> W2 injects `admissionArmed`, reads no flag. |

## What this does NOT do (NS-9)

- Does NOT advance the trust frontier -- W2 is DARK infra; only the operator's out-of-band root-key attestation
  HARDENS (OQ-NS-6/NS-7), and W2 does not touch it.
- Does NOT arm anything -- disarmed by default (both-or-neither, injected); PACT owns no live arm flag; the gate is
  a pure pass-through when disarmed.
- Does NOT wire into any fold (read-gate / frame / convert) -- it is a standalone dormant primitive (the
  darkness-witness proves it). The wiring is a LATER step (at/after the operator deploy).
- Does NOT decide the grandfather / migration policy -- it provides the seam; the policy is the operator's, at
  deploy. The default is STRICT (reject sigma_root-free personas -- fail-closed).
- Does NOT touch `registerPersona` or turn the registry into an oracle (INV-18) -- the gate reads the registry via
  the W1 verifier; it is a separate decision surface, never a registration reject.
- Does NOT flip `convert.actionable` or gate any real action (INV-16 / NS-8; U2 open).
- Does NOT deploy, create a uid, set a flag, inject `admissionArmed=true` into a live path, or attest (NS-7).
- Does NOT report the DARK gate as a HARDEN or a trust advance (NS-9 -- the named failure reflex).

## HETS Spawn Plan (the VERIFY board -- pre-build; auth/admission = the Rule-2 high-stakes class)

Two read-only lenses in parallel BEFORE the build:

- **architect** -- (1) the PREMATURITY CHECK: is W2 the right build now, or building-ahead-of-need given nothing can
  arm it pre-deploy? (2) is the standalone-dormant (unwired) shape right, or should it wire into read-gate now
  behind a byte-identical guard? (3) is the grandfather-seam-not-policy split sound? (4) does composing
  arming-coherence + assessRegistrationFromRegistry preserve both their contracts? (5) is the disarmed=admit-all
  dark default genuinely byte-identical-when-wired?
- **hacker** -- (1) can a DISARMED gate ever reject, or an ARMED gate ever admit an unverified persona (fail-open)?
  (2) the never-throws re-check (the W1 H-1 class: null/getter/malformed-registry -> fail-closed, not a throw, and
  when armed a throw must fail CLOSED = reject, not admit); (3) can the grandfather hook be abused (a throwing /
  always-true grandfather -> does the gate fail safe)? (4) is every reject/grandfather path OBSERVABLE (no silent
  fail-closed)? (5) can `admissionArmed`/`signingArmed` be faked by a truthy non-boolean (the arming-coherence
  strict-coerce must hold through W2)?

Findings fold into a `## Pre-Approval Verification` section here before the TDD build.

## Pre-Approval Verification (2026-07-02 -- the 2-lens VERIFY board, pre-build)

**architect -- OVERALL verdict: PROCEED-WITH-FOLDS; its PREMATURITY sub-verdict: BUILD-NOW-WITH-FOLDS** (two
distinct verdicts, not a conflict -- W2 is Claude-buildable ready-to-arm plumbing whose hard part is the fail-closed
decision; the actual harden is the operator's, NOT on the table for Claude). **hacker: BUILD-WITH-FOLDS** (14 live
probes, 3 bypasses -- the composition contracts individually HOLD; the CRITICAL is that the W1 never-throws template
INVERTS to fail-OPEN for the arm signal). All must-folds are folded into the design above BEFORE the TDD build; each
carries a RED non-vacuity test.

| # | Sev | Lens | Finding | Disposition (folded above) |
|---|-----|------|---------|----------------------------|
| C1 | CRITICAL | hacker | A poisoned `personaDid`/`sigmaRoot`/`admissionArmed` throwing-getter collapses the shared field-extraction to `undefined` -> disarmed -> an intended-ARMED gate ADMITS an unverified persona (LIVE-PROVEN) | §1(a)-(c): read the ARM on its own guarded path FIRST, independent of the record fields; an arm-read throw fail-CLOSES; the armed branch reads record fields separately and rejects on any read failure. RED tests: throwing-getter personaDid/sigmaRoot/admissionArmed while armed -> REJECT. |
| F4-B | HIGH | architect | armed + unseeded root (`lookupRootKey -> null`) must REJECT -- proves W2 uses the registry-sourced wrapper, never a caller root key (else re-opens the plans/32 H2 fail-open, now as ENFORCEMENT) | §1 step 5 calls `assessRegistrationFromRegistry` ONLY; RED test: armed + persona with no seeded root -> REJECT. |
| H2 | HIGH | hacker | Reject emit mis-classed as `misconfig` hides a forged/tampered sigma_root (attack) from operator triage | §1(e): class present-but-unverified (R3 fail, R1+R2 pass) as `integrity`, absent/unseeded as `misconfig`. RED test asserts the class. |
| H1 | HIGH | hacker | Disarmed=admit-all makes a caller bug / null arg fail OPEN | Documented as a DELIBERATE fail-open; the arm signal MUST come from a trusted non-actor path (residual below); the darkness witness asserts a would-reject persona is admitted ONLY when disarmed. |
| M1 | MED | hacker | A throwing arm-preflight has undefined fail direction | §1(a): arm-read throw -> fail CLOSED (reject) + emit, pinned explicitly. |
| M2 | MED | hacker | `grandfather` is an injected callback (throw / always-true / truthy-non-bool / side-effect) | §1(d): dedicated try (throw -> reject) + `=== true` guard (truthy-non-bool -> not grandfathered). RED tests for each. |
| F4-A | MED | architect | XOR-incoherent arm (`admission XOR signing`) -> `admissionArmed(out)=false` -> disarmed pass-through | §1(b): correct (admit-all IS today, not a regression) + a comment + a RED test that the incoherence STILL emits. |
| F4-C | MED | architect | never-throws is a COMPOSED property; the injected grandfather is the weakest link | same as M2 -- W2 owns the guarantee for the whole composition. |
| F5 | MED | architect | the darkness witness must be a `require()`-graph scan (not textual), covering `frame/` too | the witness mirrors `arming-darkness-witness.test.js` (require-scan over trust/grounding/frame/identity) + a behavioral disarmed=>admit-a-would-reject-persona assertion. |
| F1 | -- | architect | carry the non-advancing label through commit/PR (no "enforcement landed" phrasing) | honored in the PR/commit prose; the label + the witness ship together. |
| F2/L1 | LOW | both | name the deferred byte-identical-when-disarmed INTEGRATION witness (lands with the wiring wave); `registry` + the arm signal are TRUSTED non-actor inputs | disclosed as forward residuals below. |
| F6/DRY | LOW | architect | a latent shared "verify a signed content-addressed binding" reader | W2 is the SECOND consumer (below the 3+ threshold) -- do NOT extract; watch-item. |

**Forward residuals (disclosed, NS-9):** (1) `registry` and the arm signal (`admissionArmed`/`signingArmed`) are
TRUSTED, non-actor inputs -- a caller-supplied fake registry with an attacker root key admits (L1, inherited from
W1 H2; the real operator-frozen registry closes it). (2) The disarmed pass-through is a DELIBERATE fail-open
(admit-all = today); when the gate is eventually WIRED into read-gate, its byte-identical-when-disarmed INTEGRATION
witness lands with that wiring wave (F2). (3) The shared-binding-reader extraction stays a watch-item for the third
consumer (F6/DRY).

## VALIDATE result (2026-07-02 -- the 3-lens post-build board, on the BUILT diff)

**SHIPPED = the DARK sigma_root admission-gate DECISION**: `admission-gate.js` (`admissionDecision` -- disarmed
pass-through / armed-verify-via-the-W1-wrapper / grandfather seam / classed reject) + its darkness witness, plus the
two prior witnesses evolved (the P5 arming witness now an EXACT-SET one-entry allowlist; the W1 sigma-root witness
excludes the dormant admission-gate). **17 new tests -> full suite 512/0; eslint exit 0.** Wired to nothing; arms
nothing; the darkness chain is coherent (`require.cache` scans + the arming exact-set allowlist + the new scope->trust
layering ban).

**3-lens board (all findings folded, apply-then-close):**

- **code-reviewer: SHIP-WITH-NITS** (0 CRIT/HIGH). Verified the C1 fix is genuinely enforced (arm read strictly
  before record fields, via hostile-Proxy probing) and the darkness edits are sound against the live `layering.test.js`.
  MED: the H2 forgery classifier used an EXCLUSION list -> **FOLDED to a WHITELIST** (`failed.length === 1 &&
  failed[0] === 'R3-verifies'` -- never over-classes, never needs syncing with a future check id). LOW: grandfather
  emit -> **FOLDED to `class: 'policy'`** (distinct from a misconfig reject). LOW: C1 test coverage -> **FOLDED**
  (added throwing-getter `registry` + `signingArmed` cases).
- **hacker (Rule 2a live-probe): SHIP** (0 must-fix). **C1 LIVE-CONFIRMED LANDED** -- all 6 fields as throwing
  getters while armed -> REJECT, no arm collapse (8 probes). Every armed-ADMIT bypass fails closed OR is a DISCLOSED
  trusted-input residual (L1 caller-supplied registry; the integrity!=provenance root-key-squatting recursion --
  both documented, deliberately out of scope for the DARK gate). Proto-pollution is AVAILABILITY-only (flips
  disarmed->armed = stricter, never armed->disarmed). Grandfather airtight; observability complete; provenance object
  leaks nothing.
- **honesty-auditor: A / MINOR-CORRECTIONS** (zero over-claims; the NS-9 failure reflex ABSENT). Ruled the
  darkness-witness chain a GENUINE preservation, not a rubber stamp (the arming allowlist is EXACT-SET `deepEqual`,
  not superset-tolerant `.includes`; admission-gate's own witness closes the transitivity). **MINOR (the load-bearing
  one): the `scope->trust` witness seam** -- `scope/` was neither witness-scanned nor layering-banned, so a future
  `scope/*.js` wiring the gate live would trip NEITHER tripwire (inert today; scope imports nothing) -> **FOLDED**
  (added the `scope/` pure-leaf layering ban). LOW: the PAV two-verdict label -> **FOLDED** (overall PROCEED-WITH-FOLDS
  vs prematurity BUILD-NOW-WITH-FOLDS, made explicit).

**Pre-PR CodeRabbit CLI: 1 Major -> FOLDED.** `grandfather` was read from the SAME `input` object as the
attacker-influenced record fields, yet it OVERRIDES a failed sigma_root verification (a crypto-bypassing callback).
**FOLDED**: moved to a SEPARATE TRUSTED `policy` arg (`admissionDecision(input, policy)`) so a caller spreading an
attacker record can never forward a `grandfather` into an admission bypass; a non-vacuity test asserts an
input-record grandfather is IGNORED while the same on the policy arg admits. (registry stays in `input` as the
board-accepted crypto-GATED residual -- unlike grandfather, a fake registry still faces the crypto.)

**DARK CONFIRMED** (wired to nothing; the require.cache witness + exact-set arming allowlist + scope layering ban
close the chain). **NS-9 CONFIRMED** (no field / prose reads as a HARDEN or trust advance; W2 does NOT advance the
trust frontier -- only the operator deploy does). INV-16/INV-18 preserved (no actionable flip, no registerPersona touch).

## Sequencing

W2 the DARK admission-gate DECISION (this wave: plan -> VERIFY -> TDD RED-first -> VALIDATE 3-lens -> pre-PR
CodeRabbit -> PR) -> [operator: deploy a world-anchored root key + arm (inject admissionArmed) + set the grandfather
policy + attest -- the USER's act, NS-7] -> wire admission-gate into read-gate's pre-filter (trivial, byte-identical
when disarmed) -> resume plans/30 (broker-signing) -> the composed whole. Each step is its own go-ahead; the arm +
the deploy are never Claude's.
