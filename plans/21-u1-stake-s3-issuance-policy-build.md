---
lifecycle: persistent
created: 2026-06-24
phase: U1 stake S3 BUILD — the stake-aware issuance-policy advisory readout (SHADOW)
status: DONE — built + 334/0 green, eslint clean; VERIFY folded (§8); VALIDATE 3-lens hacker-CLEAN/honesty-CALIBRATED/code-rev-APPROVE (§9). SHADOW; NARROWS, does not harden.
---

# U1 stake S3 build — the stake-aware issuance-policy advisory readout (SHADOW)

> The third build slice of the U1 issuance-stake blueprint (`plans/18` §2 S3), continuing the U1 stake arc after
> S1-S2 (`plans/20`, #15). Scope is **S3 ONLY** (the stake-aware issuance policy behind the registry seam). **SHADOW:
> gates nothing — `registerPersona` is unmodified, `convert.actionable` stays false, `mayGate` never reads stake-
> state. NARROWS, does not harden** (only a really-deployed S6 leans toward hardening — `plans/18` §0; NS-9: this
> build is not a hardening). S4 (the SLASH record) is the next slice and carries a GOVERNANCE blocker (OQ#1 — the
> entitled-slasher throne) surfaced to the USER at the close of this wave.

## §0 Honest scope (read first — OQ-NS-6 / NS-7 / NS-9) + the two build-time design corrections

S3 delivers ONE thing: a **stake-aware issuance-policy ADVISORY READOUT** — given a human root, does it meet a
receiver's issuance bar (`no-stake` = current v0 | `stake-required` = a verified locked STAKE exists)? It is a
diagnostic a receiver MAY consult; it **NEVER blocks registration and NEVER gates an action** (registry-not-oracle,
INV-18). It reuses S1-S2's `stakeOf` fold wholesale — so provenance is already handled (a forged/unsigned STAKE
contributes 0).

**Correction A — layering: the policy lives in `trust/`, NOT `registry.js` (the blueprint's nominal home).** The
blueprint (§2 S3) says "extend `registry.js`," but `registry.js` is identity-layer and `stakeOf` is trust-layer:
reading stake-state *inside* `registry.js` would recreate the exact `identity↛trust` reverse edge S1-S2 hit (the
fold is in `trust/` precisely because it reads `trust/read-gate`). So S3 is a NEW `trust/issuance-policy.js` advisory
readout that **statically imports only `registry` (`isKnownRoot`) and consumes the `stakeOf` fold via a DI-injected
`anchor`** (NOT a static `stake-anchor` import — VALIDATE honesty F1). The DI seam is what lets the S6 backend swap in
AND what keeps `issuance-policy.js` off the `stake-anchor` import graph; `registry.js` stays the pure record seam. The
`layering.test.js` `identity↛trust` ban (added in S1-S2) already enforces the home-layer choice — S3 must not regress it.

**Correction B — registry-not-oracle: an advisory readout, NEVER a modification to `registerPersona`.** Making
`registerPersona` *require* a stake would turn the registry into an admission THRONE (an oracle) and would brick
bootstrap (the FIRST persona of a root has no verifiable STAKE — its key is registered only AT registration, and
`verifiedRecords` needs that key; chicken-and-egg). So `registerPersona` is untouched; the policy is a separate
readout, and the bootstrap-ordering reality is carried as a loud residual (§5): the invite/vouch path admits the
first persona, the STAKE follows, the root "meets" `stake-required` only thereafter.

## §1 Runtime probes (firsthand — confirmed this session against the repo, 2026-06-24)

- **P1 — the registry seam (`registry.js`).** `registerPersona(reg, {personaDid, humanUid, publicKeyPem})` RECORDS a
  persona + its root, **mints no trust, blocks nothing** (`registry.js:22-29`); `isKnownRoot(reg, humanUid)` →
  `reg.roots.has(humanUid)` (`:32-34`); `rootOf` / `lookupPublicKey` per-persona. A REGISTRY, never an oracle
  (INV-18, the file header). CONFIRMED (read).
- **P2 — the S1-S2 fold is the provenance-clean source (`trust/stake-anchor.js`).** `createStakeAnchor({registry})
  .stakeOf(storeOpts, humanUid, nowMs)` → `{status:('none'|'locked'|'unlocked'), lockedUntil}` reading THROUGH
  `verifiedRecords` (sig under the registered key, INV-14) keyed by `rootOf(src_persona_did)` — a forged/unsigned
  STAKE contributes 0. S3 reuses this WHOLESALE (no re-derivation of provenance). CONFIRMED (read).
- **P3 — the gate surfaces S3 must NOT touch.** `independence/weak-flag.js` `mayGate(label, {highStakes})` (`:47-54`)
  is the action gate — it refuses every high-stakes caller via `epistemicIndependence()==='WEAK'` (`:66-68`, the SOLE
  U2 lift-point, permanently WEAK). `trust/convert.js` `convert(...).actionable` is hard-false (`:94`, INV-16). S3
  reads stake-state into NEITHER. CONFIRMED (read).
- **P4 — the axis discipline (`plans/18` §2 S5 + `weak-flag.js:57-68`).** The stake signal is a **scarcity/cost axis
  (axis-1 family)** — it must NEVER be read as epistemic independence (axis 4). `epistemicIndependence()` is the only
  axis-4 source; S3's readout must be loud that `meets_policy` is a cost/presence signal, NOT an independence verdict,
  and must not feed `epistemicIndependence` / `mayGate`. CONFIRMED (read).
- **P5 — greenfield.** grep `v0/src`: zero `issuanc*` / `stake-required` / `mayIssue` / `issuancePolicy` hits outside
  comments (`registry.js` header names the policy; no impl). `convert.js` has zero importers. Greenfield (NS-10).
  CONFIRMED (grep).
- **P6 — the S1-S2 SHADOW test stays UNCHANGED; the new SHADOW invariant lives in `issuance-policy.test.js`
  (corrected post-VALIDATE — honesty F1/F2).** The pre-build plan ASSUMED `issuance-policy.js` would `import`
  `stake-anchor` and thus become the first importer the `stake.test.js:249-261` walk must exempt. It does NOT: the
  build consumes `stakeOf` via a DI-injected `anchor`, so `issuance-policy.js` is NOT on the `stake-anchor` import
  graph and the S1-S2 walk ("only `stake-anchor.js` imports `stake-anchor`") stays GREEN with zero edits. The new
  SHADOW guarantees (no `src/` consumer of `issuance-policy` this wave + the gating/brick surfaces clean + a vacuity
  precondition) live in the NEW `issuance-policy.test.js`. CONFIRMED (built + suite green).
- **P7 — the advisory-readout shape precedent (`convert.js:86-97`).** `convert` returns `{advisory:true,
  meets_topological, ..., actionable:false, reason}`. S3 mirrors this shape (`{advisory:true, policy, meets_policy,
  stake, gates:false, reason}`) for consistency — a receiver reads it exactly like `convert`'s advisory output.
  CONFIRMED (read).

## §2 The build (S3 only)

### S3 — `trust/issuance-policy.js` (NEW): a stake-aware issuance ADVISORY readout

A derived-on-read advisory VIEW (a sibling of `convert` / `creator-standing` — pure over its inputs), NEVER a store,
NEVER an oracle, NEVER a gate:

- **`createIssuancePolicy({ registry, anchor, mode }) -> { evaluate(storeOpts, humanUid, nowMs) }`.**
  - `registry` required (a non-null object); `anchor` required (a non-null object with `typeof anchor.stakeOf ===
    'function'` — the DI duck-type, so the S6 on-chain backend swaps in behind the same interface, DIP/ISP — VERIFY
    arch LOW-2); `mode` ∈ `{'no-stake','stake-required'}`, **default `'no-stake'`** (current v0 behavior — additive,
    non-breaking). All three validated at construction (fail-FAST at wiring, sibling-consistent with
    `createStakeAnchor`'s registry check — VERIFY arch LOW-1); an unknown `mode` throws here.
  - Constants: `POLICY_MODES = Object.freeze({ NO_STAKE:'no-stake', STAKE_REQUIRED:'stake-required' })`.
- **`evaluate(storeOpts, humanUid, nowMs)`** — the readout:
  1. `known = isKnownRoot(registry, humanUid)` (the v0 admission fact; a non-string/garbage `humanUid` → `false`,
     `Set.has` value-semantics — VERIFY hacker MED-3).
  2. `stake = anchor.stakeOf(storeOpts, humanUid, nowMs)` — `{status, lockedUntil}` (provenance-clean, P2). **Called
     UNCONDITIONALLY in both modes** — one code path, no mode-branch before the read (a deliberate KISS choice over
     the micro-optimization of skipping the read in `no-stake` mode — VERIFY arch HIGH-2/MED-1). In `no-stake` mode
     the `stake` sub-object is informational-only; `meets_policy` derives from `known` alone.
  3. `meets_policy` (a STRICT BOOLEAN on EVERY return path — VERIFY hacker HIGH-1): computed via an EXHAUSTIVE switch
     on `mode` with a `default: throw new Error('unknown policy mode: ' + mode)` terminal — so a `mode` smuggled past
     construction fails CLOSED in `evaluate` too (never yields `meets_policy:undefined`, the third-truth-value bug a
     downstream `=== false` check would read as default-allow):
     - `no-stake` → `known` (registration alone is the v0 bar — S3 changes nothing in this mode).
     - `stake-required` → `known && stake.status === 'locked'` — a verified, currently-locked STAKE over the root.
       **STRICT `=== 'locked'`, never `.includes`/truthiness** (an `unlocked`/`none`/malformed `stake.status` → the
       bar is NOT met; exact equality launders nothing — VERIFY hacker MED-3/CONFIRMED-CLOSED). `known` is belt-and-
       suspenders (a locked stake already implies a registered signer, but asserting it is honest + cheap).
  4. return a FRESH `{ advisory:true, policy:mode, known, stake, meets_policy, gates:false, reason }`.
  - **NO mutation, NO store, NO edge, NO rank, NO gate.** `gates:false` is a DOCUMENTARY marker (mirrors
    `convert.actionable:false`), NOT an enforcement — the SHADOW guarantee is the whole-tree import test below, not
    this literal a caller is free to ignore (VERIFY hacker MED-1). `meets_policy` is a cost/presence signal, NOT an
    axis-4 independence verdict (P4) — the header says so loudly; it never feeds `epistemicIndependence`/`mayGate`.
  - **`reason` is HUMAN-READABLE ONLY — never a machine-branch surface** (VERIFY arch MED-1): every machine-
    distinguishable outcome is recoverable from `{known, stake.status, meets_policy}` (do NOT string-match `reason`).
    And the `meets_policy:true`/`stake-required` reason states PRESENCE, not cost (VERIFY hacker MED-2), e.g.
    `'stake-required: a verified locked STAKE is present (PRESENCE, not forfeitable cost — SHADOW)'`;
    `'stake-required: no locked STAKE (bootstrap or unstaked)'`; `'no-stake: registration alone (v0 bar)'`.
- **`evaluate` is pure + immutable:** deterministic over (verified records, humanUid, nowMs, mode); the return is a
  fresh object each call; mutating it is harmless (two reads equal).

### S3 — the SHADOW invariant: a WHOLE-TREE exact-set walk, NOT a name-allowlist (in `issuance-policy.test.js`)

Because the build consumes `stakeOf` via a DI-injected `anchor`, `issuance-policy.js` is NOT a `stake-anchor`
importer — so the S1-S2 walk (`stake.test.js:249-261`, "only `stake-anchor.js` imports `stake-anchor`") stays GREEN
UNCHANGED (P6, honesty F1/F2). The NEW SHADOW guarantees live in `issuance-policy.test.js`, kept whole-tree and
exact-set — NOT a name-allowlist (a name-check disarms vacuously the moment S4/S5 adds a surface — the
`layering.test.js:50-59` "absence reads as success" class; VERIFY arch HIGH-1 + hacker HIGH-2). The preserved
invariant is **no GATING surface reads stake-state**, operationalized as:

1. **Whole-tree walk:** no `src/*.js` imports `issuance-policy` AT ALL this wave (zero consumers — P5 confirms
   `convert.js` has zero importers; the readout is consulted by a receiver out-of-band, not wired in). The impl is
   excluded by its RELATIVE path (`trust/issuance-policy.js`), not basename, so a future same-basename file cannot
   slip past (VALIDATE code-rev LOW). When S4/S5 adds a legitimate consumer, THAT wave widens it — a forcing function.
2. **Belt-and-suspenders positive:** `convert.js`, `independence/weak-flag.js`, AND `identity/registry.js` import
   NEITHER `stake-anchor` NOR `issuance-policy` (the gating + bootstrap-brick surfaces; the `registry.js` ban is the
   bootstrap-brick guard — though it is ALSO already mechanically forbidden by the `identity↛trust` layering ban,
   `layering.test.js:81-87` — VERIFY arch MED-2).
3. **Vacuity precondition:** assert `issuance-policy.js` exists + is non-empty (mirror `layering.test.js:55-59`), so a
   rename/delete cannot silently disarm the walk.
4. A probe asserts `evaluate(...).gates === false` ALWAYS and the result carries no `actionable:true`/score/edge field.

## §3 TDD behavioral contract (test-first — write `test/unit/issuance-policy.test.js` BEFORE impl; this IS the spec)

Reuse the `freshWorld()` / `mintStake` / `rawStake` harness from `stake.test.js` (same registry + custody minter +
store setup). The load-bearing tests are the **registry-not-oracle / SHADOW** guards and the **provenance reuse**.

**no-stake mode (default — S3 is a no-op here, proving non-breaking):**
- A known root with no STAKE → `meets_policy:true` (registration alone is the v0 bar), `policy:'no-stake'`.
- An UNKNOWN root → `meets_policy:false`, `known:false`.

**stake-required mode (the new bar):**
- A known root with a custody-minted LOCKED STAKE (`nowMs < lockedUntil`) → `meets_policy:true`, `stake.status:'locked'`.
- A known root with an UNLOCKED stake (`nowMs >= lockedUntil`) → `meets_policy:false` (the lock has lapsed).
- A known root with NO stake → `meets_policy:false` (the bootstrap/unstaked case — carried residual).
- An UNKNOWN root → `meets_policy:false`.

**provenance reuse (inherits the S1-S2 gate — assert it is NOT re-opened):**
- A forged UNSIGNED STAKE with `parent_human_uid:'human:victim'` → `evaluate(..., 'human:victim', ...)` in
  `stake-required` mode → `meets_policy:false` (the forged STAKE contributes 0 via `verifiedRecords`). The policy
  does not launder a forged stake into "meets."
- A STAKE signed by persona `zX` (root `human:A`) with a forged `parent_human_uid:'human:B'` → `human:B` does NOT
  meet `stake-required`; `human:A` DOES (keyed by `rootOf(signer)`).

**registry-not-oracle / SHADOW / boundary (the VERIFY-hardened set):**
- `evaluate(...).gates === false` ALWAYS; the result keys are exactly `{advisory, policy, known, stake, meets_policy,
  gates, reason}` (no `actionable:true`, no score/edge field). `typeof meets_policy === 'boolean'` on EVERY legal
  return path (both modes, known/unknown root, staked/unstaked) — never `undefined` (VERIFY hacker HIGH-1).
- **fail-closed `mode` in `evaluate`, not just at construction:** a `mode` smuggled past the constructor (mutated
  closure / refactor) makes `evaluate` THROW `'unknown policy mode'` — never returns `meets_policy:undefined` (VERIFY
  hacker HIGH-1). A probe forces this (e.g. construct legal, then drive an illegal mode through the same switch).
- `registerPersona` is unmodified — registering a persona with no stake still succeeds in BOTH modes (a probe
  registers under `stake-required` and asserts the registry call returns normally; the policy is separate).
- `createIssuancePolicy` fail-closes at construction: missing/invalid `registry` throws; missing `anchor`, a non-
  object `anchor`, OR one with `typeof anchor.stakeOf !== 'function'` throws; an unknown `mode` throws.
- **DI `anchor` returning a MALFORMED `stake` shape** (e.g. `{status:undefined}` / a non-`{status}` object) still →
  `meets_policy:false` under `stake-required` (the strict `=== 'locked'` launders nothing — VERIFY hacker MED-3).
- **a non-string / `__proto__` / `{}` `humanUid`** → `known:false`, `stake.status:'none'`, `meets_policy:false` (no
  prototype-pollution path — `stakeOf`'s `typeof` guard + `Set.has` value-semantics; assert it so a future
  `isKnownRoot` refactor cannot silently open it — VERIFY hacker MED-3).
- **the `stake` field for an UNKNOWN root** is `{status:'none', lockedUntil:null}` (a probe asserts it; a reader must
  not mistake it for "a known root with no stake" — VERIFY arch HIGH-2 / §5 residual).
- `evaluate` is immutable (mutating the return does not affect a second read); a non-finite `nowMs` inherits
  `stakeOf`'s conservative-`locked` behavior (a garbage clock never spuriously reports "unlocked → fails policy").
- The SHADOW whole-tree walks (§2) pass: no gating surface imports stake-state; `issuance-policy` has zero consumers.

## §4 Hard constraints (from `plans/18` §3 — the design MUST honor)

Registry-not-oracle (a diagnostic readout — no edge/rank/gate; `registerPersona` untouched) · derived-on-read, NO
mutable score store (NS-5) · reuses `verifiedRecords` provenance via S1-S2's fold — NEVER store-presence, NEVER a new
key path (NS-2/NS-10, #273) · per-root unit via `rootOf` (NS-4) · the stake is a scarcity/cost axis, NEVER read as
epistemic independence (axis 4) and NEVER feeds `mayGate` (P4) · SHADOW until residuals close (NS-8 —
`convert.actionable` stays false; `gates:false`) · layering: lives in `trust/`, no `identity↛trust` reverse edge
(Correction A).

## §5 Residuals (carry loud — NS-9; OPEN after S3)

- **Bootstrap ordering (the headline residual):** a brand-new root cannot satisfy `stake-required` at first-persona
  registration (no verifiable STAKE exists until a persona's key is registered). The invite/vouch path admits the
  first persona; the STAKE follows. The policy is ADVISORY precisely so this is not a brick — but a future caller
  must NOT wire `meets_policy:false` as a hard registration gate without a separate bootstrap path (that would brick
  every new root). Carried so S5/S6 do not assume `stake-required` is hard-gateable. **The brick wiring is ALREADY
  mechanically prevented:** `registerPersona` lives in `identity/`, and the `identity↛trust` layering ban
  (`layering.test.js:81-87`, added in S1-S2) forbids `registry.js` from importing `trust/issuance-policy.js` — so the
  policy structurally cannot reach the registration path (VERIFY arch MED-2). The §2 SHADOW walk asserts it too.
- **`stake-required` NARROWS, does not harden** — an in-memory locked STAKE is a simulated presence/commitment with
  no real forfeitable cost (D5); the bar is real only at a deployed-slashable S6. SHADOW.
- **`lock_expiry` is self-asserted/unbounded** (S1-S2 residual) — `stake-required` reads "locked," which a caller can
  trivially satisfy by minting "locked until year 9999." So `meets_policy:true` proves PRESENCE, not COST. Loud.
- **`meets_policy:false` is NOT proof-of-no-stake** — a sig-verified STAKE with a malformed `lock_expiry` is silently
  dropped by the fold (S1-S2 residual), and an `unlocked` stake also fails; a caller must read the `stake` sub-object,
  not treat `false` as "the root never staked."
- **SLASH (S4), the advisory convert axis (S5) are NOT built** — `recordSlash` still THROWS; no weight reads
  `meets_policy`. When S4 lands, a slashed root's `stake.status → 'slashed'` flows through the SAME fold, so
  `meets_policy` drops automatically (no change needed here).
- **`storeOpts === null` throws (fail-LOUD, not a bypass) — inherited from the shared `record-store` seam** (VALIDATE
  hacker LOW-1). `record-store.js`'s `{...} = {}` default fires only on `undefined`, so a `null` handle reaches the
  destructure and throws; S3's unconditional `stakeOf` read makes it reachable even in `no-stake` mode. NOT patched
  per-fold (S1-S2 §5 explicitly rejected a per-fold special-case — the root-cause fix is `record-store.js` `opts ||
  {}`, which also closes the latent `convert.js` parallel; a separate, broader-blast-radius change, deferred). A
  caller must pass a valid store handle; the failure is loud, never a spuriously-met readout.
- **The entitled-SLASHER throne (OQ#1) is GOVERNANCE-UNRESOLVED and blocks S4** — surfaced to the USER at this wave's
  close (a relocated throne that must be named + bound: plural / auditable / contestable — `plans/18` §5/§7).

## §6 VERIFY / VALIDATE plan

- **VERIFY (pre-build, 2-lens):** `architect` — registry-not-oracle / the layering correction / the advisory-readout
  shape / DI seam soundness; `hacker` — can `meets_policy:true` be forged (a stake-state launder past the S1-S2
  gate), can the readout be coerced into a gate, does the SHADOW invariant actually hold, is the bootstrap residual a
  hidden brick. Fold pre-build (§8).
- **VALIDATE (post-build, 3-lens — issuance/identity-sensitive):** `hacker` re-probes the BUILT module (Rule 2a, live
  throwaway scripts): forged-stake-does-not-meet-policy, no gate surface reads stake-state, no axis-4 read.
  `code-reviewer` — immutability / fail-closed boundaries / the evolved SHADOW test. `honesty-auditor` — the SHADOW /
  narrows-not-hardens / registry-not-oracle / bootstrap-residual claims vs the diff (NS-9).

## §7 Cross-substrate sync (toolkit <-> PACT — standing directive)

S3 reinforces the S1-S2 carry: a NEW advisory readout REUSES the ONE provenance-clean fold (`stakeOf`) rather than
re-deriving verify-on-read — the toolkit kin is a reputation/attestation policy that materializes over the evidence-
linked verified records, never a parallel re-hash. The layering lesson recurs: a stake-AWARE policy belongs in the
layer of its read-gate (`trust/`), not its conceptual subject (`identity/`).

## §8 VERIFY board result — RECORDED 2026-06-24 (architect + hacker; pre-build; all folded above)

2-lens board. **architect SOUND-WITH-CHANGES; hacker NEEDS-REVISION (2 HIGH, no CRITICAL).** The provenance spine
was CONFIRMED-SOUND/CLOSED by BOTH lenses (the #273 integrity!=provenance core, the strict-`===`-not-`.includes`
exact-equality, coercion-into-a-gate, bootstrap default-allow/brick, prototype-pollution, replay/lock-stacking, and
non-finite-clock — all defended by reusing `stakeOf` wholesale). No redesign; the findings hardened the boundary +
the SHADOW test.

- **HIGH (CONVERGENT — architect HIGH-1 + hacker HIGH-2) — the SHADOW test must stay a WHOLE-TREE exact-set import
  walk, not a two-file name-allowlist.** A name-check of `convert.js`/`weak-flag.js` disarms vacuously the moment
  S4/S5 adds a new gating surface (the `layering.test.js:50-59` "absence reads as success" class). FOLDED §2: a
  whole-tree walk bans every `stake-anchor` importer except `issuance-policy.js`(+self); bans ALL `issuance-policy`
  importers this wave (zero consumers; S4 widens explicitly); keeps a belt-and-suspenders positive on
  `convert`/`weak-flag`/`registry`; adds a non-empty vacuity precondition.
- **HIGH (hacker HIGH-1) — `meets_policy` must be a STRICT BOOLEAN on every `evaluate` path; fail-closed on an unknown
  `mode` IN `evaluate`, not only at construction.** An if/else-if with no terminal `else` yields `meets_policy:
  undefined` for a mode smuggled past the constructor — a third truth-value a downstream `=== false` reads as
  default-allow. FOLDED §2/§3: an exhaustive switch with `default: throw`; `mode` validated at BOTH construction
  (fail-fast) and `evaluate` (defense-in-depth); a probe forces the throw + asserts `typeof meets_policy==='boolean'`.
- **MED (hacker MED-1) — `gates:false` is decoration, not enforcement.** FOLDED §2: annotated DOCUMENTARY; the SHADOW
  guarantee is the whole-tree import test, not the literal.
- **MED (hacker MED-2) — the `meets_policy:true` `reason` string risked implying COST.** FOLDED §2: the
  `stake-required`-met reason states PRESENCE-not-forfeitable-cost explicitly (the `lock_expiry`-unbounded residual at
  the point of consumption, not just §5).
- **MED (architect MED-1) — `reason` is the only place mode+outcome is encoded + the `no-stake` mode reads `stakeOf`
  unconditionally.** FOLDED §2: `reason` annotated HUMAN-READABLE-ONLY (every machine outcome recoverable from
  `{known, stake.status, meets_policy}` — no string-matching); the unconditional read named a deliberate KISS choice;
  a §3 test asserts the `stake` field for an unknown root.
- **MED (hacker MED-3) — input-boundary TDD.** FOLDED §3: non-string/`__proto__` `humanUid` → `meets_policy:false`; a
  DI `anchor` returning a malformed `stake` shape still → `false` (strict `===`); the `anchor` duck-type check.
- **LOW (architect LOW-1/LOW-2) — `mode` validated at construction; `anchor` duck-type `typeof stakeOf==='function'`.**
  FOLDED §2/§3.
- **CONFIRMED-SOUND (no change):** the layering correction (`trust/`, not `registry.js`) does NOT regress
  `layering.test.js` (`trust→identity` is a permitted forward edge; `trust→grounding` is the only `trust` ban);
  registry-not-oracle is genuinely preserved (`registerPersona` untouched, no write-back); the DI seam is the right
  S6 abstraction (ISP/DIP, the `weak-flag.js:22` injection precedent); the bootstrap residual is a non-brick (advisory
  + mechanically forbidden by the `identity↛trust` ban); the advisory-readout shape mirrors `convert`; `meets_policy`
  is correctly kept out of axis-4.

## §9 VALIDATE result — RECORDED 2026-06-24 (3-lens; post-build; all folded above)

3-lens tier (issuance/identity-sensitive diff). **hacker CLEAN (Rule 2a live probes); honesty CALIBRATED-WITH-NOTES;
code-reviewer APPROVE-WITH-NITS.** Suite green after folds: 334/0, eslint clean. The trust spine was CLEAN/CONFIRMED-
HONEST across all three lenses; the findings were calibration + one design-DESCRIPTION error (the plan said "import"
where the wiring is DI).

- **hacker (the load-bearing lens) — CLEAN.** Built forged stakes on the REAL `frame`/`record-store`/`minter` path
  and ran the BUILT `evaluate`: every forge class (unsigned / unregistered-key / wrong-key / forged-`parent_human_uid`
  / cross-root) → `meets_policy:false`; a custody-minted locked stake → `true` (non-vacuous). REFUTED with live
  probes: mode-smuggling (every non-literal mode THREW — `__proto__`/numeric/object/trailing-space/`new String`),
  coercion-into-a-gate (the live tree has zero gate-surface reads of stake-state), malformed-DI-anchor (strict
  `=== 'locked'` launders nothing; an unknown root with `{status:'locked'}` still `false` via the `known===true`
  belt), boundary `humanUid` (no prototype-pollution), the unbounded `lock_expiry` (honestly disclosed as
  PRESENCE-not-cost in the live `reason` string), exact-set (zero `.includes`/loose-`==`). Only finding: LOW-1
  `storeOpts===null` throws — fail-LOUD, not a bypass; carried as a §5 residual (not patched per-fold, per the S1-S2
  precedent).
- **honesty — CALIBRATED-WITH-NOTES.** All 6 load-bearing claims CONFIRMED-HONEST (SHADOW gates-nothing with
  `gates:false` correctly de-credited as documentary; registry-not-oracle / `registerPersona` untouched — non-vacuous
  test; NARROWS-not-hardens stated at 4 altitudes incl. the live `reason`; residuals genuinely carried; §8 does not
  launder the VERIFY findings; provenance-reuse proven on the real custody path). FOLDED: **F1 (MED)** — the plan/code
  said `issuance-policy.js` "imports `stake-anchor`," but the anchor is DI-INJECTED (only `registry` is statically
  imported); corrected Correction A + P6 + §2 + the code header (the design is BETTER for it — DI keeps the file off
  the import graph). **F2 (LOW)** — the predicted "`stake.test.js` goes RED" was false (DI ⇒ no import ⇒ the S1-S2
  walk is unchanged); corrected, and the mistaken `stake.test.js` edit was REVERTED. **F3 (LOW)** — stale frontmatter
  (`PLANNED — pre-build`) refreshed to BUILT + VALIDATE-folded. Process note recorded: the 334/0 is orchestrator-run
  SHADOW-level evidence (in-process self-consistency), NOT a world-anchored hardening signal (OQ-NS-6).
- **code-reviewer — APPROVE-WITH-NITS — FOLDED.** No correctness/immutability/fail-closed/test-quality defects
  (CONFIRMED-GOOD: strict-boolean `meets_policy` via the exhaustive switch + `default:throw`; fresh-object
  immutability is structural, not luck; construction validation order correct; the 22 tests non-vacuous; the evolved
  walks are genuine exact-set with vacuity preconditions). FOLDED: **MED** — two `U+2014` em-dashes in the `reason`
  string literals → ASCII `--` (lint-clean today, but the ASCII-only source discipline is forward-looking; comment
  em-dashes left as house style). **LOW** — the SHADOW walk's basename exclusion hardened to a relative-path
  exclusion. **NIT** — `reasonFor`'s non-exhaustive `if/if` is unreachable (called only after `meetsPolicy` succeeds);
  no change.
