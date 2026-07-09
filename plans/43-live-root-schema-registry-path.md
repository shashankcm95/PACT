---
lifecycle: persistent
status: SCOPING -> VERIFY -> TDD build (the DARK root-schema persistence path; the arm + the on-box gate wiring are LATER)
plan: 43
created: 2026-07-08
depends-on: plans/32 (the `rootKeys` in-memory model this persists) ; plans/33 (the DARK admission gate this feeds a seeded root to) ; plans/39 (the registration read-filter) ; plans/42 (P2 signer, built + deployed W1-W5 / #65-73) ; PACT-NORTH-STAR.md NS-7/NS-8/NS-9 ; INV-18 (registry RECORDS, never an oracle)
audience: a build session (this) + the eventual operator (the arm, NS-7) + the USER (the go-ahead gate)
title: the live root-schema registry path -- persist + load `rootKeys`, so an on-box read-path has a seeded root to verify against (DARK; arms nothing)
---

# Plan 43 -- the live root-schema registry path (DARK)

> **HONEST-LABELING HEADER (read first -- NS-9 + the prematurity check).**
> Today the in-memory registry model carries roots (`registry.js`: `rootKeys`, `registerRoot`, `lookupRootKey` --
> `plans/32`), but the **persisted `registry.json` an on-box read-path loads is persona-rows-only** (the
> `custody-verify.js:239` format `[{personaDid, humanUid, publicKeyPem}]`; its loader at `:250-252` calls
> `registerPersona` only, never `registerRoot`). So on a real box the sigma-root gate's `lookupRootKey(reg,
> controller)` returns `null` -- there is no seeded root to verify a binding against. This wave adds the
> **persistence + load path for `rootKeys`** so the seeded root survives to disk and back.
>
> **PREMATURITY CHECK (surfaced honestly, for the VERIFY board + the USER -- the load-bearing decision).** This
> does **NOT advance the trust frontier.** Per OQ-NS-6 only a world-anchored signal HARDENS, and the world-anchor
> here (the operator's A.3 root attestation) already landed as signal 6 -- this wave touches no world-anchor. It
> is **DARK enabling-data**: it lets a seeded root LIVE in the on-box read-path so that WHEN the operator arms the
> (already-built, `plans/33`) sigma-root gate, the gate has a real root to check instead of `null` (theater). Two
> honest caveats that make this even more "ahead of need" than a normal DARK wave:
> 1. **No on-box path runs the sigma-root gate today** -- `assessRegistrationFromRegistry` is called only from
>    tests, the off-box `a2b-provision.js` dogfood, and the DARK `admission-gate`/`registration-gate` (wired to
>    nothing). This wave persists data for a consumer that is not itself live yet.
> 2. Even once armed, the gate only **NARROWS an advisory count**; it never flips `convert.actionable` (U2 open,
>    INV-16). Nothing gates an irreversible action (NS-8).
>
> **The honest alternative** (raised for the USER, mirroring `plans/33`): HOLD-for-arming (write only the
> scope-doc; build the persistence WHEN the operator is ready to arm) -- the same call the toolkit's Wave B minter
> got on 2026-07-08. **USER decision 2026-07-08: BUILD IT NOW AS DARK** ("go ahead"), as ready-to-arm plumbing --
> exactly how `plans/33` shipped. This plan will not let a summary call it a trust advance.
>
> **Claude builds + verifies the DARK persistence; the USER/operator seeds the real root + arms (NS-7).** Claude
> NEVER writes `/etc/pact/registry.json` on a box, seeds a live root, sets a flag, or arms.

## What this wave delivers

One new pure module + its wiring into the existing live loader. It persists what `registerRoot` already models;
it changes no verification logic and arms nothing.

1. **`v0/src/identity/registry-store.js` (NEW).** Pure, DI, no fs, no env:
   - `serializeRegistry(reg) -> string` -- canonical JSON (via `lib/canonical-json.js`, depth/node-bounded) of
     the persistable state: `{ personas: [{personaDid, humanUid, publicKeyPem}], rootKeys: [{humanUid,
     rootPublicKeyPem}] }`. Deterministic (sorted keys + a stable row order); `roots` (the Set) is NOT persisted
     -- it is DERIVED (see below).
   - `deserializeRegistry(input) -> reg` -- accepts a parsed value (object OR the legacy bare array) and REPLAYS
     the registrars: `createRegistry()` -> `registerPersona` for each persona row -> `registerRoot` for each
     rootKey row. Replaying (not directly `Map.set`-ing) is load-bearing: it re-runs first-writer immutability
     (a conflicting persona/root row in a hand-edited/merged file THROWS, fail-closed) and rebuilds the derived
     `roots` Set for free (`registerPersona` does `roots.add`; `registerRoot` deliberately does not -- F3).
   - **Backward-compat:** `Array.isArray(input)` -> legacy personas-only (rootKeys stays empty), byte-behaviour
     identical to today's `custody-verify.js` loader. `{personas, rootKeys}` object -> the new format. Anything
     else (or a malformed row) -> a CONTROLLED `TypeError` the caller catches + fails closed (never an uncaught
     throw). `roots` (the Set the live `isKnownRoot` gate reads) is DERIVED, never read from the file: a `rootKeys`
     row cannot inject into `roots` (`registerRoot` never `roots.add`, F3); a PERSONA row makes its `humanUid`
     known via `registerPersona`, exactly as today (L1 precision, VERIFY-hacker).
   - **Shape guards (M3):** reject a non-array/non-object input INCLUDING `null` (`typeof null === 'object'`);
     require `Array.isArray` on `input.personas` / `input.rootKeys` (a string is iterable -> would replay
     per-char); default an ABSENT sub-array to `[]` (a personas-only OR a genesis-roots-only object are both
     legit states). Each violation -> a controlled `TypeError`.
   - **Deterministic bytes (architect MUST):** `serializeRegistry` SORTS rows (personas by `personaDid`, rootKeys
     by `humanUid`) before handing arrays to `canonicalJsonSerialize` -- which sorts object KEYS but NOT array
     ELEMENTS, so unsorted rows serialize in Map-insertion order (non-deterministic). A persona-less genesis root
     is serialized from its own `rootKeys` array (else it is silently DROPPED on reload -- L2).

   **`v0/src/identity/registry-store.js` also exports `loadRegistryFile(path, opts?) -> reg` (the impure trusted
   load):** the ONE reusable trusted-load path (both `custody-verify` and the future armed-gate loader use it, DRY):
   ownership guard (`lstatSync`; REFUSE if the file is owned by neither root nor the loader's uid, or is group/
   world-writable -> an OBSERVABLE fail-closed reason, M1/H1) -> size cap (`statSync().size` before read, M2) ->
   `readFileSync` -> `JSON.parse` -> `deserializeRegistry`. `serializeRegistry`/`deserializeRegistry` stay PURE
   (no fs); `loadRegistryFile` is the fs-touching composition.

2. **Wire the existing live loader (`custody-verify.js:245-260`).** Replace the inline `createRegistry()` +
   `registerPersona`-loop with `deserializeRegistry(entries)`. This is byte-identical for the legacy array
   (personas-only) AND additionally loads `rootKeys` when the file carries them. The existing error classes are
   preserved (malformed-JSON -> exit 2; immutability-violation -> exit 2, now covering a conflicting ROOT row too).

## Design notes (the decisions the VERIFY board should test)

- **Persist `personas` + `rootKeys`, not `roots`.** `roots` is fully derived from `personas` (`registerPersona`
  is its only writer; `registerRoot` is F3-independent). Persisting + replaying personas rebuilds it exactly;
  persisting `roots` separately would risk a divergent/forgeable second source. Probe 4 confirms the only
  `roots.add` is in `registerPersona`.
- **Replay-the-registrars, never `Map.set` directly.** This inherits `registerPersona`/`registerRoot`'s
  first-writer immutability + empty-field guards at the LOAD boundary -- a hand-edited file with a conflicting
  row fails closed exactly as an in-process double-register does.
- **Format choice: an object `{personas, rootKeys}` with legacy-array fallback.** KISS + backward-compatible; no
  version field yet (YAGNI -- add one only when a second format lands). Named residual if the board disagrees.
- **Persisting `rootKeys` WIDENS the file-write surface -- and this wave CLOSES it with a code-enforced guard
  (H1, VERIFY-hacker, CORRECTED).** The earlier framing ("neither widens nor closes") was WRONG on the
  load-bearing question. A FILE-ONLY writer (a distinct principal from an in-process holder of `reg`) previously
  hit an UNCONDITIONAL fail-closed -- the on-box loader calls only `registerPersona`, never `registerRoot`
  (`custody-verify.js:252`), so `lookupRootKey` returned null and `assessRegistrationFromRegistry` FAILED at
  `registration-provenance.js:104` ("root key not seeded"). Persisting `rootKeys` lets that file-only writer seed
  THEIR OWN root and sign THEIR OWN binding -> the gate PASSES every check (hacker proved it live, real ed25519).
  So persisting roots WIDENS the file-write forge surface. **This wave closes the net-new CROSS-UID / others-
  writable vector in the same commit** (NOT the same-uid vector -- see residuals): `loadRegistryFile` opens
  ATOMICALLY (`O_NOFOLLOW`) then stat+reads the SAME fd (no `lstat`-then-read TOCTOU -- VALIDATE H1) and REFUSES a
  file not owned by root or the loader's own uid, or group/world-writable -- a code-enforced guard with an
  OBSERVABLE fail-closed reason (security.md: a guard is code, not prose). **Disclosed residuals (NS-9):** the
  SAME-UID self-seed is NOT closed -- a writer who is the loader's OWN uid is in its trust domain, so it can seed a
  self-owned 0600 root; that is the PRE-EXISTING integrity != provenance residual (`registration-provenance.js:70`),
  not a new surface. A symlinked PARENT dir is still followed (`O_NOFOLLOW` guards only the final component);
  `process.getuid() === undefined` on Windows skips the uid check. Integrity != provenance still holds -- a
  root-owned file root is NOT Rekor-verified here; its TRUST comes from the operator seeding the attested key (the
  `registerRoot` root-squatting residual + the deployment-ordering invariant, `registry.js:94-97`). **FORWARD (the
  arming wave):** the eventual ARMED on-box loader should tighten to root-owned-only (`uid===0`) + a root-owned
  parent dir; the self-or-root allowance here fits the DARK dev/test + the reusable primitive.

## Runtime Probes (firsthand -- this session, against the repo NOW; re-probe at build-time)

| # | Claim | Probe | Observed |
|---|-------|-------|----------|
| 1 | The on-box `registry.json` is persona-rows-only; its loader never calls `registerRoot` | Read `custody-verify.js:239,245-260` | Format doc `[{personaDid, humanUid, publicKeyPem}]`; loader = `createRegistry()` + `for (e of entries) registerPersona(reg, e)`. No `registerRoot`. `rootKeys` stays empty on a box. |
| 2 | No on-box path runs the sigma-root gate; it is DARK/off-box today | `grep assessRegistrationFromRegistry` across `v0/src` (non-test) | Callers: `admission-gate.js` + `registration-gate.js` (both DARK, wired to nothing) + `registration-provenance.js` (self). Live callers: none. `a2b-provision.js` (off-box dogfood) is the only place that `registerRoot`s a real key. |
| 3 | The in-memory root model exists + is first-writer-immutable | Read `registry.js:100-119` | `registerRoot({humanUid, rootPublicKeyPem})` sets `rootKeys`, throws on a conflicting re-seed (immutable), NO `roots.add` (F3). `lookupRootKey` -> the pem or null. |
| 4 | `roots` (the live-read Set) has a single writer -> derivable, need not be persisted | `grep 'reg\.roots\.add' v0/src` (the bare `roots.add` grep returns 3 -- 2 are local Sets in `grounding/`) | Only `registry.js:60` (`registerPersona`). `registerRoot` never adds. So `roots` is a pure function of `personas`. |
| 5 | A depth/node-bounded canonical serializer exists to reuse | Read `v0/src/lib/canonical-json.js` | `canonicalJsonSerialize(value)` -- sorted keys, `MAX_CANONICAL_DEPTH=100` / `MAX_CANONICAL_NODES=10000`, throws a controlled `TypeError` past either. |

## What this does NOT do (NS-9)

- Does NOT advance the trust frontier -- DARK enabling-data; only the operator's out-of-band act HARDENS, and
  this touches none.
- Does NOT arm anything, wire the sigma-root gate into any live fold, or run the gate on a box -- persistence
  only; the gate stays DARK/unwired (that wiring + the arm are LATER, the operator's).
- Does NOT change any verification logic (`assessRegistrationFromRegistry`, the signer, the gates are untouched).
- Does NOT flip `convert.actionable` or gate any action (INV-16 / NS-8; U2 open).
- Does NOT turn the registry into an oracle (INV-18) -- it (de)serializes RECORDS; the immutability guards are
  input-integrity at the load boundary, not a trust score.
- Does NOT verify a persisted root against Rekor/A.3, and does NOT close the root-squatting / integrity!=provenance
  residual -- that surface is unchanged + disclosed above (NS-9).
- Does NOT write `/etc/pact/registry.json`, seed a live root, set a flag, or attest (NS-7).

## HETS Spawn Plan (the VERIFY board -- pre-build; registry/persistence = the Rule-2 high-stakes class)

Two read-only lenses in parallel BEFORE the TDD build (persona-by-LENS):

- **architect** -- (1) the PREMATURITY CHECK: is this the right build now, or building-ahead-of-need given no
  on-box consumer runs the gate (Probe 2)? Is BUILD-NOW-AS-DARK defensible, or is HOLD the honest call? (2) is
  persist-`{personas,rootKeys}`-derive-`roots` the right split, or must `roots` be persisted? (3) is
  replay-the-registrars (vs direct `Map.set`) the right load shape for preserving immutability + rebuilding
  derived state? (4) is the object+legacy-array-fallback format sound + genuinely backward-compatible with the
  `custody-verify.js` loader? (5) does routing the loader through the new module preserve `custody-verify`'s
  existing error classes/exit codes?
- **hacker** -- (1) can a crafted `registry.json` inject a root that INFLATES trust, or is a file-root strictly
  operator-trusted-input with the same (disclosed) squatting residual as `registerRoot`? (2) does the
  deserializer fail CLOSED on every malformed shape (non-array/non-object, a row missing a field, a conflicting
  persona/root row, a huge/deep file -> the canonical-json bounds)? (3) can the legacy-array vs object detection
  be confused (e.g. an array with an injected `rootKeys`-looking element) into loading a root the operator did
  not seed? (4) does replay preserve first-writer immutability for ROOTS (a second conflicting root row THROWS,
  not silently overwrites)? (5) any prototype-pollution / `__proto__` key in a parsed row reaching `Map.set` or
  the serializer?

Findings fold into a `## Pre-Approval Verification` section here before the RED-first TDD build. If the
architect's PREMATURITY sub-verdict is HOLD, the build pauses and returns to the USER.

## Pre-Approval Verification (2026-07-08 -- the 2-lens VERIFY board, pre-build)

**architect: PROCEED-WITH-FOLDS; PREMATURITY sub-verdict BUILD-NOW.** Rationale: the need is CONCRETE, not
hypothetical -- every downstream consumer already exists in the tree (P2 signer built+deployed #65-73;
`assessRegistrationFromRegistry` built; the `plans/33` gate built; the `rootKeys` model built). This wave is the
last connecting piece between built parts (KISS/YAGNI-clearing: connecting plumbing is not premature; an
abstraction for an imagined consumer would be). Pure module, no fs/env in the (de)serializer, byte-identical
legacy path, arms nothing.

**hacker: BUILD-WITH-FOLDS.** The replay/immutability CORE is sound -- 7 of 10 attacks HELD live (persona/root
conflict throws, missing/non-string field throws, `rootKeys`-can't-inject-`roots`, `Map` proto-pollution
immunity, `__proto__`-own-prop-not-prototype, legacy-array-can't-smuggle-a-root). 3 bypasses -> must-folds below.

| # | Sev | Lens | Finding | Disposition (folded into scope above) |
|---|-----|------|---------|---------------------------------------|
| H1 | HIGH | hacker | Persisting `rootKeys` WIDENS the file-write surface: a file-only writer (previously unconditional fail-closed at `registration-provenance.js:104`) can seed their own root + sign their own binding -> gate PASSES (live-proven). The plan's "neither widens nor closes" disclosure was WRONG. | **FOLDED**: (a) disclosure CORRECTED (the integrity!=provenance bullet now states it WIDENS); (b) `loadRegistryFile` adds a code-enforced ownership guard (M1). |
| M1 | MED | hacker | The loader enforced NO ownership/permission on the registry file -- "root-owned" was prose only (`custody-verify.js:248` reads an arbitrary `--registry` path). | **FOLDED**: `loadRegistryFile` `lstatSync`-refuses a non-root/non-owner or group/world-writable file, OBSERVABLE fail-closed. Residuals disclosed: symlinked-parent + Windows-`getuid`-undefined. |
| M2 | MED | hacker | Inbound `JSON.parse` is UNBOUNDED; the canonical-json depth/node bounds are SERIALIZE-only (Probe 5 mis-attributed them to the load). | **FOLDED**: `loadRegistryFile` caps file size (`statSync().size`) before read + bounds the row count before replay. Probe 5 corrected (serialize-only). |
| M3 | MED | hacker/arch | `deserializeRegistry` shape-guard completeness: `null` (typeof object), non-array sub-fields (iterable string), `{}`/missing sub-array. | **FOLDED**: explicit shape guards + `Array.isArray` + default-absent-to-`[]` (arch fold #2 = same). |
| A1 | MUST | architect | `serializeRegistry` "stable row order" unmet -- `canonicalJsonSerialize` sorts object keys, NOT array elements; rows serialize in Map-insertion order. | **FOLDED**: `serializeRegistry` sorts rows (personas by `personaDid`, rootKeys by `humanUid`) before serializing. |
| A4 | SHOULD | architect | Label honesty: wiring `custody-verify`'s loader does NOT feed the armed gate a root -- `verifyCrossUidCustody` never calls `lookupRootKey`; the deliverable is the reusable `deserializeRegistry`/`loadRegistryFile` primitive (the armed consumer needs its own load path, future). | **FOLDED** (this note; the deliverables now name `loadRegistryFile` as the reusable primitive). |
| P4 | SHOULD | architect | Probe 4 as written greps `roots.add` -> 3 hits (2 are local Sets in `grounding/`). | **FOLDED**: re-scope to `reg\.roots\.add` at build-time re-probe. |
| L1 | LOW | hacker | Plan line 59 "a file cannot inject a live `isKnownRoot`" imprecise -- a persona row DOES make its `humanUid` known (unchanged from today). | **FOLDED**: reworded (deliverable #1). |
| D5 | LOW | architect | `custody-verify.js`'s hardcoded "a personaDid appears twice" message now also fires on a conflicting ROOT row / malformed shape. | **FOLDED**: the PREFIX stays `registry-immutability-violation` (the integration test pins it) but the PARENTHETICAL broadened to cover persona OR root conflicts + invalid shape, and errors are CLASSIFIED (untrusted / SyntaxError / TypeError / generic). Exit 2 unchanged. |
| Y6 | LOW | architect | `serializeRegistry` has no live production WRITER (only a test fixture stringifies registry data). | **FOLDED** (disclosed): justified as the round-trip test partner + future operator seed-tool; object-format tests use `serializeRegistry` (no second hand-rolled stringify -- DRY). |
| L2 | LOW | hacker | Round-trip: a persona-less genesis root must serialize from its own `rootKeys` or it is DROPPED on reload (silent, safe-direction). | **FOLDED**: covered by A1's sort + a round-trip test for a persona-less root. |

**Board verdict: PROCEED to the RED-first TDD build with all folds.** PREMATURITY = BUILD-NOW (not HOLD), so no
return-to-USER gate trips; the H1 disclosure correction is applied above. Each must-fold carries a RED
non-vacuity test in the build (esp. H1/M1 the ownership-refuse, M2 the size/row cap, A1 the byte-determinism).

## VALIDATE result (2026-07-08 -- the 3-lens post-build board, on the BUILT diff)

**SHIPPED**: `v0/src/identity/registry-store.js` (`serializeRegistry` sorted-rows / `deserializeRegistry`
replay+guards / `loadRegistryFile` atomic-open trusted load / `assertTrustedFileStat` pure policy) +
`registry-store.test.js` (29 tests) + `custody-verify.js` rerouted through `loadRegistryFile` with classified
errors. **Full suite 726/0; eslint clean.** DARK: arms nothing, wires the gate into no live fold, changes no
verification logic.

**3-lens board -- all findings folded, apply-then-close:**

- **code-reviewer: NEEDS-FIX -> FIXED.** HIGH: the `lstat`-then-read TOCTOU (below). MED: `MAX_REGISTRY_ROWS`
  overstated capacity vs canonical-json's 10000-node budget -> **FOLDED** (lowered to 2000, "loadable ⟹
  re-serializable"); `assertTrustedFileStat` silently skipped the uid check if `opts` omitted -> **FOLDED**
  (now throws -- fail-closed on missing config). LOW: null-row raw V8 error -> **FOLDED** (`assertRowObject`);
  test nits (`void big`, untested serialize guard) -> **FOLDED**.
- **hacker (Rule 2a live-probe): NEEDS-FIX -> FIXED.** 5 bypasses on the BUILT code; the hardening (deserialize
  guards / proto-pollution / round-trip / error-classification) HELD. **H1 (HIGH) the TOCTOU** + **M2 (MED) the
  check-time-only size cap** -> **FOLDED** by the atomic open (`openSync(O_RDONLY|O_NOFOLLOW)` -> `fstatSync(fd)`
  -> read the SAME fd), which closes both + the final-component symlink in one change (mirrors the sibling
  `custody-verify.js:153`). **M1 (MED) same-uid seed** -> disclosed accurately (the same-uid vector is the
  pre-existing integrity!=provenance residual; the wave closes the net-new cross-uid vector -- NOT reported as a
  full close). **M3 (MED) terminal/log injection** (an ANSI-laden DID reaching operator stderr) -> **FOLDED**
  (`custody-verify` strips non-printable-ASCII from `e.message` before any stderr write). L1 parent-symlink /
  L2 caller-overridable `maxBytes` -> disclosed residuals.
- **honesty-auditor: PASS (B+) conditional on 2 precision folds -> FOLDED.** M-A: disclose the `lstat`-then-read
  TOCTOU residual -> now MOOT (the atomic-open fix removes the race) + the disclosure updated. M-B: "CLOSES it"
  narrowed-as-closed -> **FOLDED** (reworded to "closes the net-new cross-uid/others-writable vector; the
  same-uid self-seed remains the pre-existing residual"). Confirmed DARK/arms-nothing (the gates / signer /
  `assessRegistrationFromRegistry` untouched; `custody-verify` still never calls `lookupRootKey` -> the loaded
  rootKeys are load-but-unread on this path); 4/4 spot-checked folds real + non-vacuously tested.

**The load-bearing catch (Rule-2a-corollary, again):** the unit tests used a SYNTHETIC stat and passed; the
hacker's LIVE re-probe of the BUILT `loadRegistryFile` found the `lstat`-then-read TOCTOU that a synthetic stat
structurally cannot see. Fixed to atomic open+fstat; re-verified live (the symlink-refusal test exercises the
real `O_NOFOLLOW` -> `ELOOP` -> untrusted path). NS-9 CONFIRMED (no field/prose reads as a HARDEN or trust
advance; the metric does not move). INV-16/INV-18 preserved (no `actionable` flip, no `registerPersona` oracle).

**Pre-PR CodeRabbit CLI: 0 findings.** The PR-level bot (initially rate-limited by the org usage cap; the CLI
covered the same bytes) then re-reviewed and surfaced ONE Minor: `assertTrustedFileStat` checked `'selfUid' in
opts` (key presence) but not the VALUE, so `{ selfUid: undefined }` would slip past into a silent uid-check skip
-- the bypass the fail-closed guard exists to prevent. Not reachable from today's call site, but the EXPORTED
primitive's contract must hold. **FOLDED**: rejects a non-number/non-null `selfUid`; +1 non-vacuous test (727/0).
