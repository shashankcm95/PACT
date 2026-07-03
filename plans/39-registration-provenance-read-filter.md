---
lifecycle: persistent
plan: 39
created: 2026-07-03
depends-on: plans/31 (registration-provenance classification + W0 first-writer immutability) ; plans/32 (the sigma_root SHADOW verifier -- the JUDGE this filter reuses) ; plans/33 (the DARK admission-gate -- the admission-time sibling; this is the READ-time analog its Sequencing names) ; plans/36 (the freshness read-filter -- the STRUCTURAL TWIN this mirrors) ; PACT-NORTH-STAR.md NS-7/NS-8/NS-9 + §4 (U1) ; registration-provenance.js:84 (assessRegistrationFromRegistry, the safe-path judge)
audience: a build session (VERIFY -> TDD -> VALIDATE -> PR) + the eventual operator (arming is the USER's act, NS-7)
title: Registration-provenance READ-gate pre-filter -- the SHADOW ATTACK-(a) self-register NARROW (the plans/31-33 sigma_root axis, read-side)
---

# Plan 39 -- registration-provenance read-gate pre-filter (the ATTACK-(a) self-register NARROW)

> **HONEST-LABELING HEADER (read first, NS-9).**
> This wave adds a SHADOW, disarmed-by-default read-side filter -- the missing registration-provenance analog of
> `vouch-freshness.filterFreshVouches` -- that, WHEN ARMED, drops records from a `src_persona_did` whose `sigma_root`
> binding does not verify against a registry-seeded root key. It NARROWS ATTACK (a) self-register; it does NOT
> close it. **A same-uid attacker that self-`registerRoot`s its own human_uid + self-signs a valid `sigma_root`
> over its own binding PASSES even armed** -- the recursion (`registration-provenance.js:64-66`): the crypto proves
> the root KEY authorized the binding, never that the key belongs to a distinct real human root. Only the
> operator's out-of-band root-key attestation HARDENS (OQ-NS-6/NS-7). **"unanchored persona dropped" is NEVER to be
> written up as "self-register closed"** -- that phrasing is the NS-9 load-bearing mis-read this wave must actively
> guard (a required test control asserts the self-seed PASSES armed). Nothing gates: `convert.actionable` stays
> hard-false (NS-8; U2 near-unclosable positively). Disarmed, the readout is byte-identical to today.
>
> **THE ARMING IS THE USER'S (NS-7).** The filter arms ONLY by an injected deploy-DI `meCtx.regProvenance` map;
> PACT owns no live arm flag. Claude builds + verifies the WIRING; the operator injects the arm + attests the root
> key out-of-band. Claude NEVER creates a uid, writes /etc, installs/attests a key, edits sudoers, or sets a flag.

## The goal

Close (in the honest NARROW sense) the **5th co-forge leg** of registration-provenance (ATTACK (a) self-register:
a same-uid host self-registers its OWN persona + self-signs a VOUCH that `read-gate.verifiedRecords` weights --
still OPEN, disclosed by the executed forgery in the plans/38 W4 proof board, PR #45). The build = a SHADOW
read-gate registration-provenance pre-filter, the read-side analog of the freshness filter, that when ARMED drops
an unanchored persona's records. This is the exact step plans/33's Sequencing names:
"... -> wire admission-gate into read-gate's pre-filter (trivial, byte-identical when disarmed) -> ...".

## Runtime Probes

> Evidence basis: firsthand this session (design-exploration architect + the orchestrator), against the tree at
> `main` @ `837269b`. A probe result decays -- RE-PROBE at build-time before acting on it.

| # | Claim | Probe | Observed |
|---|---|---|---|
| 1 | The delta is NOT built -- there is no read-gate registration-provenance filter | `grep -rn "registration-gate\|registrationGate\|filterRegistration\|filterAnchored\|filterUnanchored" v0` | Zero hits. `trust/vouch-freshness.js` (freshness analog), `trust/admission-gate.js` (DARK admission-time), `identity/registration-provenance.js` (the pure verifier + safe-path wrapper) exist; the READ-side registration filter does not. |
| 2 | The registry persona row carries NO `sigma_root` -- so the filter cannot source it registry-side | Read `v0/src/identity/registry.js:46-62` | `registerPersona` stores `Object.freeze({ humanUid, publicKeyPem })` only (`:59`), first-writer-immutable. No `sigma_root` field. => the sigma_root must be supplied by an injected deploy-DI map (fork 1 = option b). |
| 3 | The safe-path judge exists and sources the ROOT KEY from the frozen registry (never a caller-supplied one) | Read `v0/src/identity/registration-provenance.js:84-102` | `assessRegistrationFromRegistry(reg, {personaDid, sigmaRoot})` sources `publicKeyPem`/`controller`/`rootPublicKeyPem` from the registry via `lookupPublicKey`/`rootOf`/`lookupRootKey`; takes only `sigmaRoot` from opts; fail-closed on any null; never throws. This is the filter's judge. |
| 4 | `disjointPaths` is the freshness filter's wiring point and is byte-identical disarmed | Read `v0/src/trust/convert.js` (`disjointPaths`) + `grep filterFreshVouches v0/src/trust` | `filterFreshVouches(recs, meCtx && meCtx.freshness)` is wrapped around the verified record set inside `disjointPaths`; disarmed for every caller (no `meCtx.freshness`). This wave adds `filterAnchoredRecords` in the same place, ordered BEFORE `filterFreshVouches`. |
| 5 | `verifiedRecords` has 8+ consumers -- wiring the filter THERE would over-arm every fold | `grep -rn "verifiedRecords" v0/src/trust` | 8+ live consumers (`convert.js`, `direct.js`, `consensus.js`, `stake-anchor.js`, `premise-score.js`, `cross-verify.js`, `reach.js`, `creator-standing.js`, `issuance-policy.js`). => placement is DOWNSTREAM at `disjointPaths` (fork 2), not at the sole gate. |
| 6 | `trust/ -> identity/` import is legal; only `trust -> grounding` is banned | Read `v0/test/*/layering.test.js:76,81` | "trust/ never imports grounding" (`:76`) is the sole trust ban; "identity/ ... sits BELOW trust -- trust/read-gate imports identity/registry" (`:81`). So `trust/registration-gate.js` importing `identity/registration-provenance` is legal. `admission-gate.js:22-23` already does it. |

## Settled design (forks -- design-exploration architect memo + USER decisions 2026-07-03)

**Fork 1 -- sigma_root SOURCING: inject a `{personaDid -> sigmaRoot}` map via deploy-DI (`meCtx.regProvenance.sigmaRoots`), NOT a registry schema change.** The row is frozen + first-writer-immutable and INV-18 ("registry RECORDS, never an oracle"); a stored sigma_root drifts toward presence-as-provenance and re-litigates the bootstrap chicken-and-egg (plans/31 Open Decision 2). The injected map mirrors `meCtx.freshness={now,ttlMs}` exactly, and mirrors `admission-gate` reading `sigmaRoot` from per-request `input`. The root KEY judge stays registry-sourced (`lookupRootKey`) -- so sigma_root is the caller-supplied CLAIM, the seeded root key is the registry-sourced JUDGE. The injected map is a TRUSTED non-actor deploy input (same posture as `meCtx.freshness`); a fake map still faces the registry-seeded root key (the root-key-squat recursion). **(VERIFY MED-1 fold)** The judge's `registry` is NOT carried in `regProvenance` -- it is a SEPARATE arg sourced from `meCtx.registry` (the SAME registry `verifiedRecords` used), so `regProvenance` carries ONLY `sigmaRoots`. This removes a split-brain (records sig-verified under registry A but sigma_root-judged under an injected registry B).

**Fork 2 -- PLACEMENT: a NEW `trust/registration-gate.js`, wired DOWNSTREAM into `disjointPaths` in `convert.js`, NOT into `read-gate.verifiedRecords`.** verifiedRecords has 8+ consumers (Probe 5); wiring there arms registration-provenance for every fold at once (an information-hiding leak). Downstream placement mirrors the freshness filter, contains the blast radius to the one advisory `disjoint_paths` readout, and is witnessed by an exact-set import allowlist. The wider "drop an unanchored persona's records of EVERY type" radius is DEFERRED, named as a future wave (not silently dropped).

**Fork 3 -- ARM SIGNAL: a DISTINCT `meCtx.regProvenance` opt-in, NOT reused `admissionArmed`.** The freshness filter proved the pattern (a new dedicated opt-in DI, rejecting reuse of an existing selector so an unrelated caller does not accidentally arm). `admissionArmed`/`signingArmed` are the admission-gate's both-or-neither signing pair -- a category error for a read-time drop (there is no edge being staged here). Keep arms narrow (interface segregation). **(VERIFY F1/F2 fold)** The arm predicate strict-types `sigmaRoots` as a plain non-array object; a PRESENT-but-malformed `regProvenance` (arming-intent, broken shape) emits a `reg-partial-arm` `misconfig` refuseAlert then disarms (observability -- a fail-OPEN of a security filter must not be silent, `security.md`), while an ABSENT `regProvenance` disarms SILENTLY (byte-identical, the every-caller-today path).

**USER decision A (2026-07-03) -- MIGRATION POLICY: DROP-ALL-LEGACY (freshness-style), NO grandfather seam.** When ARMED, ANY persona lacking a verifying sigma_root is dropped -- including legacy personas registered before sigma_root existed. Matches `vouch-freshness` (plans/36:256-258, which rejected a grandfather because it reopens the downgrade). The operator arms only after their senders have migrated. There is NO `grandfather` policy arg on this filter (unlike `admission-gate.js:91-108`).

**USER decision B (2026-07-03) -- WIRING POSTURE: WIRED-LIVE, DISARMED-FIRST.** Wire `filterAnchoredRecords` into `disjointPaths` NOW; it is byte-identical while no `meCtx.regProvenance` is injected (every caller today). Supersedes plans/33's literal deploy-before-wiring ordering -- the freshness precedent (plans/36 shipped its filter wired-live-disarmed before any deploy) is the governing pattern for a byte-identical-when-disarmed read filter.

## Module shape (`v0/src/trust/registration-gate.js`)

Pure, TOTAL (never-throws), disarmed-by-default -- the structural twin of `vouch-freshness.js`.

```
isArmed(regProvenanceOpts) -> boolean   (+ emits a misconfig alert on a PRESENT-but-malformed arm)
  Read regProvenanceOpts inside a try/catch (F3 -- a hostile-Proxy opts get-trap disarms-with-alert, never throws).
  DISARMED (silent, byte-identical -- the every-caller-today path) iff regProvenanceOpts is ABSENT (undefined/null).
    No alert.
  A PRESENT-but-malformed regProvenanceOpts (arming-INTENT, broken shape: not a plain object, OR its `sigmaRoots`
    is absent / an array / not a plain object) -> refuseAlert('reg-partial-arm', {class:'misconfig'}) then return
    DISARMED (F1/F2 -- a fail-OPEN of a security filter MUST be OBSERVABLE, security.md; never a silent pass-through).
  ARMED iff regProvenanceOpts is a plain object whose `sigmaRoots` is a PLAIN object (typeof==='object',
    !Array.isArray). (!Array.isArray load-bearing -- vouch-freshness.js:33.)

filterAnchoredRecords(recs, registry, regProvenanceOpts) -> object[]
  `registry` is a SEPARATE arg from meCtx.registry (the SAME one verifiedRecords used -- MED-1, no double-source);
  a null/bad registry does NOT disarm -- the judge fail-CLOSES (drop-all), never fail-open.
  DISARMED -> return `recs` UNCHANGED (=== ref-identity; byte-identical; no drops).
  ARMED    -> for each record:
    - did = rec.src_persona_did
    - sigmaRoot = Object.hasOwn(sigmaRoots, did) ? sigmaRoots[did] : undefined   (F4 -- own-prop-only, never an
      inherited __proto__/constructor value; from the injected deploy map, NEVER off the record)
    - prov = assessRegistrationFromRegistry(registry, { personaDid: did, sigmaRoot })   (the registry-sourced
      root-key judge, registration-provenance.js:84 -- NEVER the pure verifier, which takes a caller root key = H2)
    - KEEP iff prov.sigmaRootChecksPassed === true; else DROP + refuseAlert.
  TOTAL: per-record try/catch (a hostile getter -> DROP fail-closed, class 'integrity', NEVER throw --
    the convert-DoS idiom, vouch-freshness.js:88-95); armed + non-array recs -> return [].
  IMMUTABLE: armed path builds a NEW out[]; `recs` never mutated.
  Imports: assessRegistrationFromRegistry (../identity/registration-provenance), refuseAlert (../lib/refuse-alert).
```

**Refuse-alert classing (mirror the freshness split + admission-gate's whitelist):** absent sigma_root / unmapped
persona / unseeded root key -> `misconfig` (the honest majority at arming = un-migrated legacy). A present-but-
FAILING sigma_root (R3 fails, R0-R2 pass -- the ONLY forgery shape, a whitelist not an exclusion list per
`admission-gate.js:116-119`) -> `integrity` (tamper/forgery).

## Wiring (`v0/src/trust/convert.js`, `disjointPaths` -- 2-line disarmed-inert diff)

```
const { filterAnchoredRecords } = require('./registration-gate');            // NEW require
// inside disjointPaths, mirroring plans/36:117-126:
const verified = verifiedRecords(meCtx.registry, meCtx.storeOpts);
const anchored = filterAnchoredRecords(verified, meCtx.registry, meCtx && meCtx.regProvenance);   // NEW -- registry
                                                                                                  // from meCtx (same
                                                                                                  // as verifiedRecords,
                                                                                                  // MED-1); disarmed today
const edges    = buildVouchGraph(filterFreshVouches(anchored, meCtx && meCtx.freshness));
```

Order: AFTER `verifiedRecords` (sig-verify first), BEFORE `filterFreshVouches` (both disarmed -> both identity
pass-throughs -> `buildVouchGraph` sees the identical set). The `anchored`-before-`fresh` order is a COST choice,
NOT correctness (VERIFY architect check 6): both are drop-only pure filters over the same set; the kept set is
their intersection (commutative), so the disjoint count is order-invariant -- only refuse-alert granularity differs
(a record failing both alerts once, at the first filter). `read-gate.verifiedRecords`, `registerPersona`,
`buildVouchGraph`, `registry.js`, `sigma-root.js` are UNCHANGED -- if any is touched, the design drifted.

## Test controls

**Unit (`test/unit/registration-gate.test.js`):**
1. DISARMED identity pass-through -- `filterAnchoredRecords(recs, registry, undefined/null)` returns `recs` (=== ref-identity; no drops/alerts). The disarm predicate keys on `regProvenanceOpts` ONLY (a present-but-malformed opts is controls 10a/10b -- emit + disarm; NOT this silent case). The `registry` arg is SEPARATE and does NOT participate in the disarm decision -- an ARMED call with a bad/null `registry` fail-CLOSES to drop-all (control 7), it never disarms. (Post-MED-1: the old `map-without-registry`/`registry-without-map` disarm cases no longer exist -- registry is no longer carried in the opts.)
2. (i) APEX -- armed DROP of a self-registered persona (absent from the map OR a non-verifying sigma_root) -> its records DROPPED.
3. (ii) DISARMED KEEP of the SAME persona -- byte-identical (non-vacuity: the mechanism CAN drop, so disarmed-keep witnesses genuine inertness).
4. (iv) armed KEEP of a legit anchored persona (valid sigma_root under a registry-seeded root key).
5. (iii) NS-9 RECURSION -- a same-uid attacker that self-`registerRoot`s + self-signs a valid sigma_root -> KEPT EVEN ARMED (asserted as an EXPECTED SHADOW pass; integrity != provenance). Proves it NARROWS, not closes. STRENGTHENED (VERIFY LOW-5): assert the self-seeded persona IS in the `sigmaRoots` map AND `assessRegistrationFromRegistry` returns `sigmaRootChecksPassed === true` for it -- so "KEPT" is provably "kept because it cryptographically VERIFIES" (integrity), which is exactly why NARROW != close (no provenance); a future accidental-disarm cannot make this pass for the wrong reason. (VERIFY hacker CONFIRMED this live: self-registerRoot + self-sign -> sigmaRootChecksPassed true.)
6. (v) TOTALITY under hostile getters -- throwing getter on `.src_persona_did`/`.payload` / a hostile Proxy -> DROP (class 'integrity'), NEVER throw; armed + non-array recs -> `[]`; `[hostile, legitAnchored]` -> `[legitAnchored]` (one throw never drops the batch).
7. (vi) unseeded-root / unmapped-persona fail-CLOSED -- armed + `lookupRootKey -> null` -> DROP (`misconfig`); armed + persona absent from the map -> DROP.
8. immutability -- `recs` not mutated; armed returns a NEW array.
9. null/undefined element DROP armed (not forwarded to `buildVouchGraph`).
10a. (F1) PARTIAL/malformed arm EMITS + disarms -- `regProvenance` present but `sigmaRoots` absent / an array / a non-object -> a `reg-partial-arm` `misconfig` refuseAlert fires AND the filter is inert (pass-through, `=== recs`). ABSENT `regProvenance` -> silent disarm, NO alert (byte-identical).
10b. (F2) strict-type disarm -- `{sigmaRoots:[]}` / `{sigmaRoots:'x'}` / `{sigmaRoots:123}` -> disarmed (with the partial-arm alert), NOT armed.
10c. (F3) hostile-Proxy opts TOTAL -- a get-trap-throwing `regProvenance` -> disarm-with-alert, never throws through the filter (the `disjointPaths` DoS seam).
10d. (F4) prototype-pollution DROP-not-KEEP -- with `Object.prototype` polluted by a string-valued magic key, a record whose `src_persona_did` is `'__proto__'`/`'constructor'`/an unmapped id -> DROP (own-prop-only read; never a KEEP-by-inheritance).
10e. (LOW-4) map keyed on `src_persona_did` -- a persona whose `src_persona_did` is mapped+valid is KEPT armed; asserting the lookup key is `src_persona_did` NOT `src_persona` (guards the copy-the-docstring silent all-drop bug).

**Integration (`test/integration/registration-gate-convert.test.js`, real mint -> read-gate -> convert):**
10. byte-identity disarmed -- a `meCtx` with no `.regProvenance` counts the FULL unfiltered graph.
11. (vii) armed NARROWS + monotonic non-increase -- same world with `meCtx.regProvenance` -> `disjoint_paths` DECREASES; `actionable` STILL false. Assert `dpArmed <= dpDisarmed` ALWAYS (committed seeded inputs, NO `Math.random`) with >=1 STRICT narrowing. (VERIFY hacker: monotonicity HOLDS across 2000 seeded graphs, zero violations -- Menger: edge removal never raises max-vertex-disjoint-paths.)
11b. (LOW-3) PARTIALLY-MIGRATED world (the arming-day mixed state) -- one anchored LEGIT persona + one unmapped LEGIT persona on counted disjoint paths, armed -> the unmapped DROPs, the anchored KEEPs, `actionable` false, `dpArmed < dpDisarmed` by exactly the unmapped contribution. Proves drop-all-legacy behaves sanely mid-migration (not just the all-anchored / all-attacker poles).

**Witnesses (`test/integration/registration-gate-darkness-witness.test.js`):**
12. EXACT-SET import allowlist -- `trust/registration-gate.js` imported by EXACTLY `['trust/convert.js']` (`deepEqual`, never `.includes`; `(?:\.js)?`). Non-vacuous: assert module-exists + non-empty src-enumeration first. A SECOND importer (e.g. into `read-gate`) goes RED (blast-radius-creep signal).
13. BEHAVIORAL disarmed-inertness -- anchored + unanchored personas on counted disjoint paths: DISARMED `disjointPaths` == unfiltered; ARMED `dpArmed < dpDisarmed` STRICTLY (non-vacuity).

Run `layering.test.js` unchanged (`trust -> identity`/`lib` legal; confirm no reverse edge).

## What this wave does NOT do (NS-9)

- Does NOT HARDEN -- it NARROWS the advisory `disjoint_paths` count only. Only the operator's out-of-band root-key attestation HARDENS (OQ-NS-6/NS-7). Claude does not deploy/attest/arm.
- Does NOT close ATTACK (a) self-register -- a same-uid self-seed + self-sign PASSES even armed (test control 5). The filter relocates the boundary one level up; it does not eliminate it.
- Does NOT identify the human -- that is U1 / binding #3 (the named, permanent, contained frontier, Douceur). RE-NAMED, never reopened.
- Does NOT gate any action or flip `convert.actionable` (stays hard-false, NS-8).
- Does NOT touch `registerPersona` / turn the registry into an oracle (INV-18) -- sigma_root comes from the injected map; the registry only supplies the root-key judge it already stores.
- Does NOT change `read-gate.verifiedRecords`, `buildVouchGraph`, `registry.js`, or `sigma-root.js`.
- Does NOT report any NARROW as a HARDEN or a close (the close->narrow reflex). PR/commit prose carries the non-advancing label.

**The one live mis-read risk:** the filter drops an *unanchored* persona's records when armed, which superficially
reads like "it rejects self-registered attackers." It does not -- it drops personas *absent from the map or lacking
a verifying sigma_root*; a self-seed-and-sign attacker is *anchored by this filter's lights* and PASSES. Guarded by
test control 5 + a residual note in the module docstring (mirror `registration-provenance.js:64-66`).

## Sequencing

plans/39 (this wave: VERIFY 2-lens architect+hacker -> TDD RED-first -> VALIDATE 3-lens code-reviewer+hacker+honesty
-> pre-PR CodeRabbit CLI -> PR) -> [operator: inject `meCtx.regProvenance` + deploy/attest a world-anchored root
key -- the USER's act, NS-7] -> the wider verifiedRecords-radius wave (deferred) / resume plans/30 (broker-signing).
Each step is its own go-ahead; the arm + the deploy are never Claude's.

## Pre-build VERIFY result (2026-07-03 -- architect PROCEED-WITH-FOLDS + hacker SHIP-WITH-NITS)

Two-lens VERIFY board; **6/6 runtime probes re-verified accurate**; the design is sound, faithfully mirrors the
freshness twin, and is honestly NS-9-labeled. **NO CRITICAL/HIGH design flaw.** NS-9 recursion claim CONFIRMED by a
live hacker probe (a same-uid self-`registerRoot` + self-sign -> `sigmaRootChecksPassed` true -> KEPT even armed).
Monotonicity HOLDS (2000 seeded graphs, `dpArmed <= dpFull`, zero violations). The two disarm-confusion /
prototype-pollution vectors could NOT be turned into a wrong KEEP (the judge fail-closes on every poison shape).
Folds landed into the design above:

- **MED-1 (architect) registry double-source** -> `registry` passed as a separate arg from `meCtx.registry` (single
  source, same as `verifiedRecords`); `regProvenance` carries only `sigmaRoots`.
- **F1 (hacker HIGH) / MED-2 (architect) partial-arm fails-open silently** -> a PRESENT-but-malformed `regProvenance`
  emits `reg-partial-arm` `misconfig` + disarms (observable); ABSENT -> silent disarm (byte-identical). Controls 10a/10b.
- **F2 (hacker MED) truthy `sigmaRoots`** -> strict-typed to a plain non-array object in the arm predicate.
- **F3 (hacker LOW) hostile-Proxy opts DoS** -> the `isArmed` opts-read is try-wrapped (total). Control 10c.
- **F4 (hacker LOW) prototype-pollution wasted-verify** -> `Object.hasOwn` own-prop-only map read. Control 10d.
- **LOW-3 (architect) migration cliff untested** -> a partially-migrated-world integration control added (11b).
- **LOW-4 (architect) `src_persona` prose drift** -> normalized to `src_persona_did` + a key-spelling assertion (10e).
- **LOW-5 (architect) recursion control** -> strengthened to assert the self-seed POSITIVELY passes the judge (control 5).

INFO confirmations (no fold): the judge truth-table matches the design; the caller-supplied `regProvenance.registry`
bypass (hacker attack 4) is the SAME as the disclosed NS-9 self-seed recursion, correctly bounded (the filter wires
the safe-default wrapper, NEVER the pure verifier that takes a caller root key = H2 -- a future refactor must not swap it).

## Build result (2026-07-03, TDD RED-first)

**SHIPPED:** `v0/src/trust/registration-gate.js` (the filter, all VERIFY folds landed) + a 2-line disarmed-inert
diff in `v0/src/trust/convert.js` (`disjointPaths`). Tests: `test/unit/registration-gate.test.js` (12),
`test/integration/registration-gate-convert.test.js` (3), `test/integration/registration-gate-darkness-witness.test.js` (3).
**Full suite 614/0; eslint clean.** RED-first honored (the unit spec ran RED on the missing module before the impl).

**Darkness-boundary change (honesty-flagged for VALIDATE):** wiring the disarmed filter live pulls
`registration-provenance` (+ transitively `sigma-root`) into the live require graph via `convert -> registration-gate`,
which correctly tripped the plans/32 `sigma-root-darkness-witness` (A). That witness was **UPDATED** (not deleted):
its plans/32 "no fold module pulls a W1 module into the live graph" claim is DELIBERATELY superseded by plans/39's
USER-approved wired-live-disarmed design. It now asserts the EXACT-SET of W1 importers
(`registration-provenance` <- {`admission-gate` dormant, `registration-gate` live-disarmed}; `sigma-root` <-
{`registration-provenance`}); a THIRD unnamed consumer still fires RED (creep). The disarmed byte-identity is
witnessed by `registration-gate-convert.test.js` item 10 (a `meCtx` with no `.regProvenance` -> the FULL unfiltered
count) and `registration-gate`'s own single-consumer containment witness. NS-9 preserved: nothing HARDENED; the
verifier is live-in-the-graph but DISARMED (gates nothing) until the operator injects the map + attests the root key.

## VALIDATE result (2026-07-03 -- 3-lens board on the BUILT code)

**code-reviewer SHIP · hacker SHIP-WITH-NITS · honesty-auditor A- / NO-OVERCLAIM.** All folded. Full suite 615/0.

- **Load-bearing security property HOLDS (hacker, live-probed):** "no unmapped-KEEP-while-armed found: TRUE" -- every
  poison vector (reused-sig, empty-string, number/object sigma, proto-pollution, Proxy map, judge-bypass via the
  registry arg) DROPS, because the judge re-derives the binding from the FROZEN registry + re-verifies ed25519 (the
  injected map value is only a hint, never trusted). **NS-9 recursion CONFIRMED on the BUILT code** (self-seed +
  self-sign PASSES even armed -- NARROW, not close). Monotonicity holds (500 fuzz trials, arming never raised the count).
- **Finding 1 (hacker LOW) -- FOLDED:** `filterAnchoredRecords` re-read `regProvenanceOpts.sigmaRoots` a SECOND time
  outside the try, so a two-face getter (valid on read 1, throws on read 2) could escape and DoS the readout --
  falsifying the module's own "TOTAL: never throws" / F3 claim. Fixed: `evalArm` now reads `sigmaRoots` ONCE inside the
  guard and returns the validated ref; the caller never re-reads. Regression test added (getter read EXACTLY once).
  LOW because `regProvenance` is a trusted deploy-DI (never an actor byte) -- but folded to keep the totality contract
  honest and to close a future-caller reopening.
- **honesty-auditor -- the darkness-witness supersession is HONEST, not a quiet weakening** (adversarially reconstructed
  the original plans/32 absence-claim; confirmed the new exact-set witness still fires RED on a 3rd consumer, byte-identity
  re-witnessed behaviorally, follows the `arming-darkness-witness` house precedent, disclosed in `## Build result`).
- **Carried residual (hacker Finding 2, INFO -- OUT of this diff's scope):** the sibling `vouch-freshness.js` shares the
  same double-read shape AND is weaker (its arm-check has no try/catch -> a first-read hostile `freshnessOpts` getter
  escapes too). Both claim "TOTAL: never throws." A separate follow-up hardens the sibling symmetrically (a task was
  spun off); NOT folded here to keep the PR focused on the plans/39 diff.
- **code-reviewer LOWs (no action):** the `meCtx.registry`/`storeOpts` unguarded read in `disjointPaths` is PRE-EXISTING
  (not a regression); the darkness-witness regex's whitespace/string-concat false-negatives are shared house-style.

**Pre-PR CodeRabbit CLI (`review --plain --base main`) -- 4 findings (1 Major, 3 Minor), 3 distinct, ALL FOLDED:**
- **Major (plan test-control-1 prose) -> FOLDED:** control 1 still listed the pre-MED-1 `map-without-registry`/
  `registry-without-map` disarm cases, conflicting with the now-separate-registry fail-closed design. The CODE was
  correct (bad-registry-armed drops all = control 7); the plan PROSE was stale -- corrected + split out the 1b clause.
- **Minor (registration-gate-darkness-witness Windows portability) -> FOLDED:** added the `.replace(/\\/g,'/')` sep
  normalization the sibling sigma-root witness already had (else a false-FAIL on Windows).
- **Minor (magic-string `R3-verifies`) -> FOLDED:** centralized the crypto-verify check id as an exported
  `R3_VERIFIES` constant in `registration-provenance.js` (the producer / source of truth), consumed by BOTH the
  registration-gate AND the admission-gate classing split -- so a rename can never silently desync a consumer's
  forgery whitelist. (admission-gate.js is a plans/33 file touched only for this 1-line centralization.)

Full suite 615/0 + eslint clean after the folds.
