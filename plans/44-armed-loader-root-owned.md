---
lifecycle: persistent
status: SCOPING -> VERIFY -> TDD build (the DARK root-owned-only ARMED load mode; the arm + the on-box wiring are LATER)
plan: 44
created: 2026-07-09
depends-on: plans/43 (the FORWARD note this implements ; #74 registry-store.js) ; plans/33 (the DARK admission gate an armed on-box read would feed) ; PACT-NORTH-STAR.md NS-7/NS-8/NS-9 ; INV-16 (actionable never flips pre-U2) ; INV-18 (registry RECORDS, never an oracle)
audience: a build session (this) + the eventual operator (the arm, NS-7) + the USER (the go-ahead gate)
title: the ARMED on-box loader tightening -- an OPT-IN root-owned-only + root-owned-parent load mode (DARK; arms nothing)
---

# Plan 44 -- the ARMED on-box loader tightening (DARK)

> **HONEST-LABELING HEADER (read first -- NS-9 + the prematurity check).**
> #74's `loadRegistryFile` is the ONE trusted-load path; it refuses a foreign-owned / group-or-world-writable /
> symlinked / oversized registry file and allows **self-OR-root** ownership (the right latitude for the DARK
> dev/test primitive + `custody-verify`'s arbitrary-`--registry` path). plans/43's FORWARD note names the
> tightening the eventual ARMED on-box read-path needs: **root-owned-ONLY (`uid===0`) + a root-owned parent dir.**
> This wave adds that as an **OPT-IN mode** (`loadRegistryFile(path, { requireRootOwned:true })`); the DISARMED
> default is byte-identical to #74, so `custody-verify`'s call (`custody-verify.js:249`, no opts) is untouched.
>
> **PREMATURITY CHECK (surfaced honestly, for the VERIFY board + the USER).** This does **NOT advance the trust
> frontier** (OQ-NS-6: only the operator's out-of-band attestation HARDENS, and this touches none). Two honest
> "ahead of need" caveats, exactly as plans/43 disclosed:
> 1. **No armed on-box consumer exists.** No live path runs the sigma-root gate on a box (plans/43 Probe 2: the
>    gate's only callers are DARK/off-box). This adds the STRICT load MODE the future armed read-path will call --
>    a consumer not itself live yet. It is a reusable primitive, built DARK, arming nothing.
> 2. It nonetheless **closes a REAL disclosed residual**: #74 named "a symlinked PARENT dir is still followed
>    (`O_NOFOLLOW` guards only the final component)". The armed mode's parent-dir guard closes the net-new
>    others-writable / symlinked-parent vector for the strict path (integrity hardening, NOT a trust advance).
>
> **The honest alternative** (raised for the USER, mirroring plans/33 + plans/43): HOLD-for-arming -- write only
> the FORWARD note (already in plans/43) and build the strict mode WHEN the operator is ready to arm. **USER
> decision 2026-07-09: BUILD IT NOW AS DARK** (the multiSelect "Build the loader tightening"), as ready-to-arm
> plumbing -- exactly how #74 + plans/33 shipped. This plan will not let a summary call it a trust advance.
>
> **Claude builds + verifies the DARK strict mode; the operator arms + seeds the real root (NS-7).** Claude NEVER
> writes `/etc/pact/registry.json`, seeds a live root, sets a flag, arms, or runs any on-box step.

## What this wave delivers

One additive OPT-IN mode in `registry-store.js` + its RED-first tests. It changes NO existing behavior (the
disarmed default is byte-identical); it arms nothing and wires nothing.

1. **`assertTrustedFileStat(st, { selfUid, requireRootOwned })` -- an ADDITIVE strict branch (pure).** When
   `requireRootOwned === true`, the owner check becomes **`st.uid === 0` ONLY** (root-owned); `selfUid` is unused on
   this branch (the check can never silently skip -- root-only is unconditional). The symlink / `isFile` / mode
   (`& 0o022`) checks are UNCHANGED and fire in BOTH modes. Disarmed (absent/false) -> the existing self-or-root
   logic, byte-identical.
2. **`assertTrustedDirStat(dirSt)` -- a NEW pure parent-dir policy (exported, synthetic-stat testable).** THROWS
   `untrusted` unless the stat is a DIRECTORY, root-owned (`uid===0`), and NOT group/world-writable
   (`(mode & 0o022) === 0`). Mirrors `assertTrustedFileStat`'s shape so it is unit-testable with no root.
3. **`loadRegistryFile(filePath, { requireRootOwned:true, maxBytes? })` -- the ARMED path.** When
   `requireRootOwned` is truthy, BEFORE the file open: open the PARENT dir (`path.dirname(filePath)`) with
   `O_DIRECTORY | O_NOFOLLOW`, `fstatSync` it, `assertTrustedDirStat(dirSt)`, close it (an `ELOOP` -> `untrusted`,
   the symlinked-parent-final-component refusal). Then the existing atomic file open + `assertTrustedFileStat(st,
   { selfUid, requireRootOwned:true })` + size cap + read + deserialize. DISARMED (default) -> NO parent check,
   self-or-root -- byte-identical to #74.

## Design notes (the decisions the VERIFY board should test)

- **Additive opt-in, not a default change (Open/Closed + KISS).** The disarmed default MUST stay byte-identical so
  `custody-verify`'s no-opts call (Probe 1) is untouched. The strict mode is a NEW branch, never a mutation of the
  existing one. A RED test asserts the default path still accepts a self-owned `0600` file.
- **`requireRootOwned` semantics: root-owned ONLY.** Armed, `st.uid === 0` is the sole accepted owner (not
  self-or-root). Rationale: a live on-box arm runs as a non-root reader against a root-seeded registry; a
  self-owned root would be the same-uid self-seed vector the disarmed mode tolerates for dev/test but the armed
  mode must refuse. `selfUid` is irrelevant on this branch -- so the "selfUid REQUIRED" fail-closed guard is
  SATISFIED-BY-CONSTRUCTION (the owner check is unconditional root-only, never a silent skip); the guard still
  fires for the disarmed branch.
- **Parent-dir guard closes the disclosed symlinked-parent residual -- with a HONESTLY-NAMED remaining TOCTOU.**
  `O_DIRECTORY | O_NOFOLLOW` on the parent rejects a symlinked parent-final-component and yields an fd-based
  `fstat` of the true parent at check time. BUT Node's sync API has **no `openat`/dirfd**, so the subsequent file
  open re-resolves the full path -- a swap of the parent BETWEEN the parent-check and the file-open is a
  **disclosed residual** (the parent analog of the file TOCTOU the atomic file-open closes; unclosable in Node
  sync without `openat`). The guard refuses the STATIC misconfig (a non-root or group/world-writable parent, the
  common real case on a box), not a determined racer. Named LOUD below.
- **`isDirectory()` in the pure checker is the real guarantee; `O_DIRECTORY` is defense-in-depth.** On a platform
  where `O_DIRECTORY` is 0 (`|| 0` fallback), opening a dir read-only still succeeds and `assertTrustedDirStat`'s
  `dirSt.isDirectory()` catches a non-dir. So the guarantee does not depend on the flag.
- **Integrity != provenance is UNCHANGED.** A root-owned file root is NOT Rekor-verified; its TRUST still comes
  from the operator seeding the attested key (the plans/43 / `registry.js:94` residual). Root-ownership is a
  custody/integrity tightening of the LOAD, not a provenance claim.
- **No new export removed; two added.** `assertTrustedDirStat` is added to `module.exports`; `assertTrustedFileStat`
  keeps its name (new opt is additive). `node:path` is newly required for `dirname`.

## Runtime Probes (firsthand -- this session, against the repo NOW; re-probe at build-time)

| # | Claim | Probe | Observed |
|---|-------|-------|----------|
| 1 | `custody-verify` calls `loadRegistryFile` with NO opts -> the disarmed default MUST stay byte-identical | Read `custody-verify.js:237,249` | `const { loadRegistryFile } = require('./registry-store'); ... registry = loadRegistryFile(o.registryFile);` -- no opts. Byte-identical is load-bearing. |
| 2 | Today `assertTrustedFileStat` allows self-OR-root (`uid !== 0 && uid !== selfUid` throws) | Read `registry-store.js:150-154` | `if (typeof selfUid === 'number') { if (st.uid !== 0 && st.uid !== selfUid) throw ... }` -- self-or-root. The strict branch narrows this to root-only. |
| 3 | `O_DIRECTORY` + `O_NOFOLLOW` are available on the on-box (Linux) target | (re-run at build) `node -e 'const fs=require("fs"); console.log(fs.constants.O_DIRECTORY, fs.constants.O_NOFOLLOW)'` | expect two non-zero integers on Linux/macOS; falls back to `0` on Windows (disclosed). |
| 4 | No armed on-box consumer runs the gate today (this is a DARK primitive) | plans/43 Probe 2 (re-confirm) `grep 'convert(' v0/src \| grep -v test` | empty -- convert has no live caller; the armed load MODE has no live consumer yet. |
| 5 | The existing atomic file-open + `assertTrustedFileStat` shape is the pattern to extend | Read `registry-store.js:165-189` | `openSync(O_RDONLY\|O_NOFOLLOW)` -> `fstatSync(fd)` -> `assertTrustedFileStat` -> size cap -> read same fd. The armed path prepends the parent-dir guard, reuses this verbatim. |

## What this does NOT do (NS-9)

- Does NOT advance the trust frontier -- DARK; only the operator's out-of-band attestation HARDENS, and this touches none.
- Does NOT arm anything, wire the sigma-root gate into any live fold, or run the gate on a box -- an additive load
  MODE with no live consumer; the arm + the on-box wiring are LATER, the operator's.
- Does NOT change the disarmed default path, the (de)serializer, or any verification logic (byte-identical for
  `custody-verify`; a RED test pins it).
- Does NOT close the SAME-UID self-seed residual (the disarmed mode still tolerates it for dev/test) or the
  integrity != provenance root-squatting residual (a root-owned file is not Rekor-verified).
- Does NOT close the parent-dir TOCTOU -- disclosed; Node sync has no `openat`. The guard refuses the static
  misconfig, not a racer.
- Does NOT flip `convert.actionable` or touch `registerPersona` (INV-16 / INV-18; U2 open).
- Does NOT write `/etc/pact/registry.json`, seed a live root, set a flag, or attest (NS-7).

## Named residuals (NS-9, carried LOUD)

- **Parent-dir TOCTOU** -- no `openat`/dirfd in Node sync; the file is re-opened by full path after the parent
  fstat. Refuses the static misconfig, not a determined parent-swap racer.
- **Windows** -- `selfUid == null`, `O_DIRECTORY`/`O_NOFOLLOW` may be 0; armed mode's `uid===0` + symlinked-parent
  guards degrade. The armed on-box target is Linux (`/etc/pact`); disclosed, acceptable.
- **integrity != provenance** -- root-ownership is a custody tightening of the LOAD, not a Rekor-verify. Trust
  still rests on the operator seeding the attested key.
- **No live consumer** -- the armed load mode is DARK ready-to-arm plumbing; the on-box armed read-path is future.

## HETS Spawn Plan (the VERIFY board -- pre-build; a trusted-load / auth path = the Rule-2 high-stakes class)

Two read-only lenses in parallel BEFORE the TDD build (persona-by-LENS):

- **architect** -- (1) the PREMATURITY CHECK: is BUILD-NOW-AS-DARK defensible given no armed consumer (Probe 4), or
  is HOLD the honest call? (2) is the additive-opt-in (vs a separate `loadArmedRegistryFile` function) the right
  factoring for Open/Closed + KISS? (3) is root-owned-ONLY + a root-owned-parent the correct strict policy, or is
  the parent guard over-reach for a DARK primitive? (4) does the parent-dir guard's disclosed TOCTOU make it
  security theater, or is refusing the static misconfig genuinely worth it? (5) does the strict branch preserve the
  disarmed default byte-identically (custody-verify untouched)?
- **hacker** -- (1) can the armed mode be made to ACCEPT a non-root file (a self-owned root, a symlink, a
  world-writable file, a symlinked/attacker-owned parent)? (2) does `requireRootOwned` fail CLOSED on a
  throwing/garbage opt (a truthy-non-true value, a getter)? (3) can the parent-dir open be bypassed (a `..`
  traversal, a `dirname` edge like `/` or a relative path, an ENOENT/ENOTDIR mis-handled as trusted)? (4) does the
  disarmed default stay EXACTLY as #74 (no accidental strictening / no regression of the self-or-root latitude)?
  (5) any fd leak on the new parent-open error paths (the `finally`-close discipline)?

Findings fold into a `## Pre-Approval Verification` section here before the RED-first TDD build. If architect's
PREMATURITY sub-verdict is HOLD, the build pauses and returns to the USER.

## Pre-Approval Verification (2026-07-09 -- the 2-lens VERIFY board, pre-build)

**architect: PROCEED-WITH-FOLDS; PREMATURITY sub-verdict BUILD-NOW.** Rationale: the consumer's interface is
already NAMED + specified (the plans/43 FORWARD note: root-owned-only + root-owned parent), the change is additive
with a byte-identical disarmed default (carrying cost ~= 0, live blast radius = 0), and it independently closes a
real disclosed residual (#74's symlinked-parent vector). Not speculative generality (the future consumer is
designed-for, not hypothetical). The single-primitive opt-in beats a second `loadArmedRegistryFile` (which would
fork the security-critical open->fstat->cap->read->deserialize sequence -- the worst code to duplicate); root-only
+ parent-guard is standard secure-file-load practice (the openssh `StrictModes` idiom), not over-reach; the
parent-TOCTOU is worth-it-not-theater because it deterministically refuses the common misconfig and discloses the
racer residual LOUD.

**hacker: BUILD-WITH-FOLDS** (11 attacks; 2 bypasses + 1 partial, all pre-build build-guardrails -- the design is
sound). No CRITICAL (no live consumer, no data-loss surface). The serious one is a predicate-asymmetry trap.

| # | Sev | Lens | Finding | Disposition (folded into the build) |
|---|-----|------|---------|-------------------------------------|
| H1 | HIGH | hacker (=arch F1) | **Predicate split.** If the loader passes the RAW `opts.requireRootOwned` through, a truthy-non-true value (`1`/`"true"`/`{}`) arms the PARENT check while the FILE stays self-or-root (`=== true` there) -- defeating the root-only narrowing AND widening the parent-TOCTOU (swap target need only be self-owned). Probe A confirmed the split live. | **FOLDED**: normalize the arm predicate ONCE at loader entry -- a present-non-boolean `requireRootOwned` THROWS (TypeError, fail-closed on a malformed opt, mirroring the #74 selfUid type-guard); `armed = requireRootOwned === true` gates BOTH the parent check and the file narrowing; the loader passes the NORMALIZED boolean (never the raw opt) into `assertTrustedFileStat`. RED test: `{requireRootOwned:1}` throws (never a split). Chosen `=== true` over "truthy-arms" because the opt is CODE-supplied (the armed consumer hard-codes `true`, arch F5), not an operator env-token -- the security.md asymmetric-parse rule targets operator typos, which this API does not expose; the overriding invariant is NEVER-SPLIT. |
| M1 | MED | hacker (=arch F3) | **fd leak on the parent-open refusal path.** `assertTrustedDirStat` throws on the COMMON armed-failure (non-root/others-writable parent); a naive open->fstat->assert(throws)->close leaks the dir fd (Probe D: delta=5 fds on 5 refusals). | **FOLDED**: wrap the parent open in `try { fstat; assertTrustedDirStat } finally { closeSync(dfd) }`, mirroring the file open (`registry-store.js:186-188`). |
| M2 | MED | hacker (=arch F2) | **Parent-open error mapping.** A symlinked/non-dir parent surfaces as `ENOTDIR` (macOS) or `ELOOP` (Linux); mapping only `ELOOP` re-throws `ENOTDIR` as a GENERIC fs error (fail-closed but mis-classed on a TRUST tool). | **FOLDED**: map BOTH `ELOOP` and `ENOTDIR` -> `untrusted` (observable, `ERR_REGISTRY_UNTRUSTED`); `ENOENT`/`EACCES` propagate (still fail-closed -- never a silent pass to the file open). RED test: a symlinked parent throws `ERR_REGISTRY_UNTRUSTED`. |
| L1 | LOW | hacker | `assertTrustedDirStat` must throw via the `untrusted()` helper (carry `ERR_REGISTRY_UNTRUSTED`), not a bare Error -- so the future consumer classifies a parent refusal like a file refusal (`custody-verify.js:255`). | **FOLDED**: dir refusals use `untrusted(...)`. |
| L2 | LOW | hacker (=arch Q5) | Pin the disarmed byte-identity with a RED test (a self-owned `0600` file still loads with no opts). | **FOLDED**: the armed block sits behind `if (armed)`; RED test pins the no-opts default. |
| F4 | LOW | architect | Single-level parent only (not the ancestor chain to `/`). | **FOLDED** (Named residuals): immediate parent only; full-chain walking is itself racy in Node sync. |
| F5 | LOW | architect | The guarantee is caller-elective (the primitive); security.md non-bypassable applies at the GATE. | **FOLDED** (forward note): the eventual armed consumer HARD-CODES `requireRootOwned:true` -- non-bypassable at the consumer, never an override knob on the armed path. |
| F6 | LOW | architect | DARK status lives only in the plan; a future reader could mistake the strict branch for active. | **FOLDED**: an inline "DARK -- no live consumer; armed read-path is future" marker on the strict branch, per the existing FORWARD-NOTE convention. |

**Board verdict: PROCEED to the RED-first TDD build with all folds.** PREMATURITY = BUILD-NOW (no return-to-USER
gate). Each must-fold carries a RED non-vacuity test (esp. H1 the no-split, M1 the fd-`finally`, M2 the
symlinked-parent class, L2 the byte-identical default).

### Added Named residual (arch F4)

- **Immediate parent only** -- the guard checks `path.dirname(filePath)`, NOT every ancestor to `/`. Defensible
  for `/etc/pact` (`/etc`, `/` conventionally root-owned); full-chain walking is itself racy in Node sync (no
  `openat`). Disclosed.

## VALIDATE result (2026-07-09 -- the 3-lens post-build board, on the BUILT diff)

**SHIPPED**: an OPT-IN `requireRootOwned:true` mode in `registry-store.js` -- `assertTrustedFileStat` narrows the
armed owner check to root-only (+ a normalized-once, throw-on-non-boolean predicate); a NEW pure
`assertTrustedDirStat` (dir + root-owned + not others-writable); `loadRegistryFile` prepends the armed parent-dir
guard (`O_DIRECTORY|O_NOFOLLOW` open -> fstat -> assert -> `finally`-close; `ELOOP`/`ENOTDIR` -> untrusted).
**+15 tests -> registry-store 45/0; full suite 742/0; eslint exit 0.** DARK: no live consumer (`grep requireRootOwned
v0/src` = only registry-store.js), the disarmed default byte-identical (custody-verify's no-opts call untouched).

**3-lens board -- all findings folded, apply-then-close:**

- **code-reviewer: SHIP-WITH-NITS** (0 CRIT/HIGH/MED). Byte-identical-default CONFIRMED (traced the no-opts path +
  the 29/29 custody-verify integration suite unchanged). fd discipline correct on all paths; H1 fix genuinely
  enforced; `path.dirname` edges sound. LOW: no end-to-end armed-ACCEPT test (non-root CI) -> **FOLDED** (a
  root-gated skip-test added). NIT: the two boolean-validations (loader + pure fn) are intentional defense-in-depth.
- **hacker (Rule 2a LIVE re-probe): SHIP** (0 blocking). 6 attack classes probed live against the BUILT module
  (predicate-fuzz + toggling-getter, real-fs deployments, 500-iter fd loops, `path.dirname` edges, error-class
  integrity) -- **all HELD**; disarmed byte-identity confirmed live; no fd leak (delta 0); M2 `ENOTDIR` mapping
  works on macOS. **Note A (informational)**: `assertTrustedFileStat` read the opt TWICE -> a toggling getter
  handed DIRECTLY to the exported checker could disarm the file branch (NOT reachable via `loadRegistryFile`, which
  captures once). **FOLDED** (read the opt once into a local; the exported primitive is now getter-immune too).
- **honesty-auditor: A- / PASS-WITH-CORRECTIONS.** DARK verified by direct grep (only registry-store.js references
  the opt); no HARDEN/trust-advance over-claim; INV-16/INV-18 clean; the plan44 tests non-vacuous. **LOW-1**: a
  comment attributed the *others-writable-parent* vector as "#74-disclosed" (#74 disclosed only the *symlinked*
  parent) -> **FOLDED** (docstring reworded: closes #74's disclosed symlinked-parent residual AND the net-new
  others-writable-parent vector). **LOW-2**: the L2 test name claimed "byte-identical #74" (no #74 golden to diff)
  -> **FOLDED** (renamed to what it verifies). INFO: armed-ACCEPT end-to-end is root-gated only (disclosed).

**DARK CONFIRMED** (no live consumer; disarmed default byte-identical). **NS-9 CONFIRMED** (no field/prose reads as
a HARDEN or trust advance; the metric does not move). INV-16/INV-18 preserved. The parent-swap TOCTOU + Windows +
same-uid-self-seed + integrity!=provenance stay disclosed residuals.
