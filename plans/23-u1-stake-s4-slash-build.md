---
lifecycle: persistent
created: 2026-06-24
phase: U1 stake S4 BUILD — the gated, append-only SLASH record (derived-on-read; SHADOW)
status: DONE — built + 346/0 green, eslint clean; VERIFY folded (§8); VALIDATE 3-lens hacker-CLEAN / code-rev-APPROVE / honesty-CALIBRATED-A- (§9). SHADOW; NARROWS, does not harden.
---

# U1 stake S4 build — the SLASH record (a crater-disciplined, derived-on-read forfeiture; SHADOW)

> Continues the U1 stake arc after S5 (`plans/22`, #17). USER-ratified the slasher-throne design: **a SLASH counts
> only when concurred by >=2 distinct EARNED-STANDING human roots, in-scope, with a counterexample** — reusing the
> existing crater discipline (`direct.js`), so the relocated throne is plural / auditable / contestable, never a
> popularity vote (L8 error-is-not-malice). Scope is **S4 ONLY**. **SHADOW: it flips a SHADOW stake's status; nothing
> gates. NARROWS, does not harden** — meaningful only when the slashed stake is a REAL forfeited cost (a deployed S6;
> `plans/18` §0; NS-9). The entitled-slasher governance question (`plans/18` §7 OQ#1) is resolved here as "reuse the
> crater throne" — no NEW authority is minted.

## §0 Honest scope (read first — OQ-NS-6 / NS-9) + the design in one paragraph

A `SLASH` is a CONTEST-shaped, sig-verified, append-only record targeting a specific **STAKE record** (by its content-
addressed `target_stake_id`). It is DERIVED-ON-READ: the SLASH-aware `stakeOf` returns `status:'slashed'` for a root
whose REAL verified STAKE has been slashed by **>=2 distinct earned-standing human roots** (each a signed SLASH whose
`target_stake_id` resolves to a real STAKE of that root + a non-empty counterexample `reason`). This is the crater
rule (`direct.js:62-87`) applied to stakes — INCLUDING its **F3-analog**: just as a CONTEST referencing a non-existent
claim is IGNORED, a SLASH whose `target_stake_id` does not resolve to a real STAKE of the root is IGNORED (the F3-analog —
ADDED after the VERIFY HIGH, §8; the original in-scope check was the weaker "the root has a stake". This closes
the pre-positioning attack — a slash minted before any stake exists cannot lie in wait, because the later stake has a
NEW unknowable content-address). A zero-history Sybil flood INFORMS but cannot crater; one earned root informs but
does not slash; only >=2 distinct earned HUMAN roots forfeit the stake.

**Composition (VERIFY-corrected — anchored on what is BUILT ON MAIN):** because it lives in `stakeOf`, the present
consumer **S3 `issuance-policy`** reacts with zero new wiring — a slashed root's `stake.status === 'slashed'` is not
`'locked'`, so `meetsPolicy`'s strict `=== 'locked'` fail-closed (`issuance-policy.js:46`) yields `meets_policy:false`.
That composition IS tested this wave. **S5 `convert.funded_root` is NOT on `main`** (it is the open PR #17, built off
this same base); when #17 merges, its open-enum passthrough surfaces `'slashed'` automatically — a FORWARD-CONTRACT
verified at merge, NOT testable in this wave (do not assert via `convert`). **SHADOW; the slash flips an in-memory
presence/commitment, never a real forfeited cost (S6).**

## §1 Runtime probes (firsthand — confirmed this session against the repo, 2026-06-24)

- **P1 — the crater discipline this REUSES (`trust/direct.js:60-87`).** A valid CONTEST: `type==='CONTEST'`,
  `target_persona===agentDid`, and `target_claim_id` resolves to a REAL claim of the agent (F3 — a contest
  referencing no real claim is IGNORED). Negative evidence keyed by HUMAN (`rootOf(c.src_persona_did)`); a crater
  (`CRATER_MULTIPLIER`) fires only when `corroboratingHumans.size >= 2` AND those humans have EARNED STANDING. CONFIRMED.
- **P2 — `earnedStandingPersonas` (`trust/standing.js:31-39`).** A persona DID has earned standing iff it authored
  `>=1 CLAIM` in the verified log; persona-scoped, callers RE-KEY to `rootOf` for any Sybil gate (invariant 1). A
  zero-history persona INFORMS but cannot CORROBORATE. S4 reuses this VERBATIM (no new standing definition — DRY).
  CONFIRMED.
- **P3 — the SLASH-aware target + the F3-analog (`trust/stake-anchor.js:44-59` + `direct.js:62-64`).** `stakeOf`
  computes `lockedUntil` = max valid `lock_expiry` of the root's STAKEs (`null` if none); S4 collects in the SAME pass
  the SET of the root's real STAKE `record_id`s (`stakeIds`). The slash check (after `lockedUntil` is known) counts a
  SLASH only if `r.payload.target_stake_id ∈ stakeIds` — i.e. it resolves to a REAL verified STAKE of THIS root.
  **This is the true F3-analog** (`direct.js:62-64`: a CONTEST whose `target_claim_id` does not resolve to a real
  claim is IGNORED). It closes the pre-positioning attack: a slash minted before any stake exists references a
  non-existent id; a stake minted later has a fresh content-address the pre-positioned slash could not have named.
  CONFIRMED (read).
- **P4 — `verifiedRecords` is the SOLE provenance gate (`trust/read-gate.js:24-34`, INV-14).** A SLASH counts only if
  its sig verifies under the slasher's REGISTERED key; the slasher's identity is keyed by `rootOf(src_persona_did)`
  (unforgeable). The `target_stake_id` payload field is the slasher's DECLARED object (self-asserted, like a CONTEST's
  `target_claim_id`) — its safety is the resolution check (∈ `stakeIds`), NOT trust in the field; #273 does not apply
  to it (the provenance that matters, WHO slashes, is `rootOf(signer)`-bound). CONFIRMED (read).
- **P5 — the custody minter (`identity/minter.js`).** A SLASH is minted exactly like a STAKE: `createMinter({signer,
  personaDid, humanUid}).mint(buildSlashSpec(...))` — signed through custody, the slasher's root bound at the minter.
  No new key path (NS-10). CONFIRMED.
- **P6 — `recordSlash` is a VESTIGIAL placeholder (`stake-anchor.js:66-68`).** It THROWS "reserved for S4". The
  derived-on-read model (a SLASH is a MINTED RECORD the fold reads, never a mutation — `stake-anchor.js:64`, NS-5)
  means there is NO imperative `recordSlash`; S4 REMOVES it (and updates the one S1-S2 test that asserts it throws).
  CONFIRMED (read).
- **P7 — SLASH is greenfield (grep `v0/src`: zero `SLASH` hits).** CONFIRMED.

## §2 The build (S4 only)

### S4a — `identity/slash.js` (NEW): the SLASH record producer (thin, imports nothing)

- `SLASH_TYPE = 'SLASH'`.
- `buildSlashSpec({ targetStakeId, reason, seq, nonce }) -> { type:'SLASH', payload:{ target_stake_id, reason }, seq,
  nonce }` with fail-closed boundary validation: `targetStakeId` a non-empty string (a STAKE `record_id`; else throw);
  `reason` a `typeof === 'string'` with `reason.trim().length > 0` (else throw) — **L8: a slash REQUIRES a real
  counterexample, never a bare/blank vote**. Minting is done by the CALLER via `minter.mint(buildSlashSpec(...))`
  (custody-signed; the slasher's root is the minter-bound `parent_human_uid`). `slash.js` holds NO key/signer.
  Sibling-identical to `identity/stake.js`. The caller obtains `targetStakeId` by observing the victim's STAKE
  `record_id` in the store (a slash points at a real, already-existing forfeitable commitment).

### S4b — `trust/stake-anchor.js` (MODIFIED): `stakeOf` becomes SLASH-aware

- In `stakeOf`'s existing STAKE pass, ALSO collect `stakeIds` = the `Set` of `record_id`s of the root's VALID STAKEs
  (the same records that set `lockedUntil`). This is the F3-resolution set (P3).
- Add a private `isSlashed(recs, stakeIds)` helper (the crater quorum):
  - `earned = earnedStandingPersonas(recs)` (P2, the SAME predicate the crater uses).
  - collect `slasherRoots`: for each `r` with `r.type === SLASH_TYPE` AND `r.payload` present AND
    `stakeIds.has(r.payload.target_stake_id)` (the F3-analog — resolves to a REAL stake of THIS root) AND
    `typeof r.payload.reason === 'string' && r.payload.reason.trim().length > 0` (L8 — read-side gate, NOT trust in
    the producer; the store is not a sandbox) AND `earned.has(r.src_persona_did)` (earned standing — anti-grief), add
    `rootOf(registry, r.src_persona_did)` (re-keyed to HUMAN; **skip a null root — do NOT copy `direct.js:81`'s
    `|| src_persona_did` persona-fallback**, VERIFY hacker LOW).
  - return `slasherRoots.size >= 2` (the crater threshold — exact `>= 2` over a deduped root-`Set`, never subset).
- In `stakeOf`, AFTER `lockedUntil` is computed and the `lockedUntil === null` early-return: if
  `isSlashed(recs, stakeIds)` return `{ status:'slashed', lockedUntil }`. **`slashed` overrides BOTH `locked` AND
  `unlocked`** — a slash forfeits the commitment whether or not the lock window is live (the `lockedUntil` value is
  still returned for auditability — VERIFY arch MED). Status precedence: `none` (no stake) < {`locked`|`unlocked`}
  (real stake, by `nowMs`) < `slashed`.
- **REMOVE `recordSlash`** from the returned object (P6 — vestigial; slashing is a minted record, not a method). The
  anchor returns `{ stakeOf }`.
- Imports gained: `earnedStandingPersonas` (`./standing`, trust/ sibling), `SLASH_TYPE` (`../identity/slash`,
  identity/ forward edge). Both within the DAG (no reverse edge).

### S4c — `lib/record-schema.json` (MODIFIED, DOCUMENTARY)

Add `"SLASH"` to `type.enum`; add documentary payload props `target_stake_id` (string — the content-addressed STAKE
`record_id` being slashed) + `reason` (string — the in-scope counterexample). DOCUMENTARY only — the top-level
`required[]` (`record_id, ver, type, src_persona_did, parent_human_uid, seq, nonce`) is UNCHANGED, so existing
STAKE/CLAIM/CONTEST records still validate (probe: a pre-S4 STAKE record validates post-edit — VERIFY arch LOW).

### S4d — tests

- `test/unit/slash.test.js` (NEW) — the SLASH contract (§3).
- `test/unit/stake.test.js` (MODIFIED) — remove the `recordSlash THROWS` test (P6); the existing stakeOf tests stay
  green (no SLASH records -> `isSlashed` false -> status unchanged; backward-compatible).

## §3 TDD behavioral contract (test-first — write `slash.test.js` BEFORE impl; this IS the spec)

Reuse the `stake.test.js` harness (registry + custody minter + store) + emit CLAIMs to grant earned standing. A
slasher mints `buildSlashSpec({ targetStakeId: <victim STAKE record_id>, reason })`. The load-bearing tests are the
AUTHORIZATION quorum + the F3-analog (pre-positioning closed) + provenance + the read-side `reason` gate.

**The slash fires only with the crater quorum (load-bearing):**
- a root R with a LOCKED stake (id X) + **2 distinct EARNED-STANDING human roots** each minting a valid SLASH
  (`target_stake_id=X`, non-empty reason) -> `stakeOf(R).status === 'slashed'`.
- the SAME with only **1** earned-standing slasher -> NOT slashed (`'locked'`); one root informs, does not slash.
- **2 personas of ONE human** (same `rootOf`) each slashing X -> NOT slashed (keyed by HUMAN, not persona — F2).
- **2 ZERO-STANDING roots** (never authored a CLAIM) slashing X -> NOT slashed (a Sybil flood INFORMS, cannot crater).

**The F3-analog + provenance + in-scope (anti-grief — the VERIFY HIGH):**
- **pre-positioning closed:** 2 earned roots mint SLASHes against R BEFORE R has any stake (their `target_stake_id`
  is a guessed/absent id) -> R reads `'none'`; THEN R mints a fresh stake (a NEW record_id) -> R STILL reads
  `'locked'`, NOT `'slashed'` (the pre-positioned slashes never resolve to the new stake's id).
- a SLASH whose `target_stake_id` does NOT resolve to a real STAKE of R -> IGNORED (the F3-analog).
- a forged UNSIGNED SLASH (valid content-address, real `target_stake_id`) -> contributes 0 (dropped by
  `verifiedRecords` — provenance, not store-presence).
- a SLASH targeting a STAKE of a DIFFERENT root -> does NOT slash R (the id is not in R's `stakeIds`).

**The read-side `reason` gate (the VERIFY MED — the store is not a sandbox):**
- a raw (un-minted) SLASH with `reason` = `{}` / `[]` / `true` / `1` / `'   '` (whitespace-only) -> contributes 0
  (`typeof === 'string' && trim().length > 0`, NOT a truthy check). Built via the `rawStake`-style unguarded path.

**Producer + boundary:**
- `buildSlashSpec({targetStakeId, reason, seq, nonce})` -> a well-formed spec; `mint` via custody -> a SLASH frame
  with `type==='SLASH'`, `payload.target_stake_id`/`reason` set, a verifying sig.
- `buildSlashSpec` fail-closes on an empty/non-string `targetStakeId` or a non-string/blank `reason` (throws).

**Precedence + composition + backward-compat + SHADOW:**
- **`slashed` overrides `unlocked`:** a root with an EXPIRED stake (id X, `nowMs >= lockedUntil`) + 2 earned slashers
  of X -> `'slashed'` (NOT `'unlocked'`); `lockedUntil` still returned (VERIFY arch MED).
- **S3 composition (TESTED — the present consumer on main):** a slashed root -> `createIssuancePolicy({registry,
  anchor, mode:'stake-required'}).evaluate(...).meets_policy === false` (status `'slashed'` != `'locked'`, the strict
  fail-closed). Assert via `issuance-policy`, NOT `convert` (S5/`convert.funded_root` is the open PR #17, not on this
  base — a FORWARD-CONTRACT, §5).
- with NO SLASH records, `stakeOf` is byte-identical to pre-S4 (the existing stake.test.js stakeOf tests stay green).
- idempotent: the same SLASH present twice is ONE slasher root (set-keyed); 2 distinct slasher ROOTS needed
  regardless of how many SLASH records each mints.
- immutability: `stakeOf` returns a fresh object; no mutation.

## §4 Hard constraints (from `plans/18` §3 + the crater discipline)

Derived-on-read, NO mutable score store (NS-5 — a SLASH is an append-only record the fold reads, never a mutation) ·
reuses `verifiedRecords` provenance + the `earnedStandingPersonas` crater predicate (NO new authority, NO new key
path, NO new standing definition — DRY/NS-10) · the slasher throne is PLURAL (>=2 distinct earned roots) / AUDITABLE
(append-only signed records) / CONTESTABLE (a SLASH is itself a record; a future un-slash/counter is another record) ·
L8 error-is-not-malice (a counterexample `reason` required; a popularity flood of zero-standing slashers does
nothing) · keyed by HUMAN `rootOf` (NS-4 — persona-multiplication cannot self-corroborate a slash) · in-scope (only a
root with a REAL stake is slashable) · SHADOW until residuals close (NS-8 — nothing gates; `convert.actionable` stays
false).

## §5 Residuals (carry loud — NS-9; OPEN after S4)

- **NARROWS, does not harden** — a SLASH flips an in-memory presence/commitment, not a REAL forfeited cost; the
  forfeiture is meaningful only at a deployed-slashable S6. SHADOW.
- **The relocated throne is the crater throne** — 2 COLLUDING earned-standing roots can slash a victim's stake, the
  SAME trust assumption the crater already carries (if the receiver's own earned-standing graph is adversarial, the
  receiver is already compromised). S4 does not widen this; it inherits it. Receiver-relative (NS-3): a slash craters
  only in the view of a receiver who has earned standing in the slashers.
- **Self-slash counts as 1 root** — a staker slashing its own root is self-forfeiture (1 root; cannot alone reach the
  >=2 threshold). No special exclusion (identical to crater).
- **`reason` is an UNVALIDATED attestation** — the fold cannot check the counterexample's truth (L5 behavioral, not
  truth); the non-empty requirement enforces "a slash states a reason", not "the reason is correct". A false slash by
  2 colluding earned roots is the throne residual above.
- **No un-slash / slash-expiry / decay** — a SLASH is permanent-on-read in S4 (unlike DIRECT's decayed `s`). Whether a
  slash should decay or be revocable (a counter-record) is deferred (ties to OQ#3 decay). Carried.
- **`recordSlash` removed** — a caller that destructured `anchor.recordSlash` now gets `undefined`; no `src/` caller
  exists (only the S1-S2 test, updated). The SLASH is minted via `buildSlashSpec` + the minter.
- **S3 `issuance-policy`'s `reasonFor` string is mildly STALE for a slashed root** (VERIFY arch MED) — a slashed root
  hits the final branch (`issuance-policy.js:57`), rendering `"...no locked STAKE (bootstrap or unstaked) -- slashed"`
  (the `status` interpolates correctly, but "unstaked" is wrong for a was-staked-then-slashed root). `reason` is
  DOCUMENTARY-only (never a machine-branch surface — `issuance-policy.js:52`), so nothing breaks; carried as a cosmetic
  residual rather than widening S4 to touch `issuance-policy.js`. A future S5-integration wave (or a `reasonFor`
  `slashed` branch) can tidy it.
- **S5 `convert.funded_root` composition is a FORWARD-CONTRACT, NOT tested this wave** (VERIFY arch CRITICAL) — S5 is
  the open PR #17, built off this same `main` base; `convert` on `main` has no `funded_root`. When #17 merges, its
  open-enum passthrough surfaces `'slashed'` automatically (different files: S4 = `stake-anchor.js`, S5 =
  `convert.js`; they compose at merge in either order). Verified-at-merge, not in this wave's suite.

## §6 VERIFY / VALIDATE plan

- **VERIFY (pre-build, architect + hacker):** architect — is the crater-throne reuse the right authority model; is the
  in-scope precondition + status precedence sound; does it compose with S3/S5 cleanly; is removing `recordSlash`
  correct. hacker — can a SINGLE root (or 1 human's N personas, or a zero-standing flood) slash a victim; can a forged
  /unsigned SLASH count; can a no-stake root be slashed (phantom); can a missing `reason` slip through; self-slash
  abuse; is the >=2 an exact-set or off-by-one.
- **VALIDATE (post-build, 3-lens — auth/security-critical):** hacker re-probes the BUILT fold (Rule 2a live probes):
  the 1-root / Sybil-persona / zero-standing / forged / phantom / no-reason vectors against the built `stakeOf`.
  code-reviewer — immutability / the helper / backward-compat / the schema. honesty — the SHADOW/narrows + the
  throne-residual (2-colluding-roots) + reason-unvalidated claims vs the diff (NS-9).

## §7 Cross-substrate sync (toolkit <-> PACT — standing directive)

S4's carry: a forfeiture/penalty signal must reuse the SAME plural, earned-standing, human-keyed quorum the positive
signal uses (a slash is a crater) — never a unilateral or popularity-based authority. The toolkit kin: a
reputation-demotion must require the same evidence-linked, plural corroboration a promotion does, keyed by the
authenticated author, never a single reviewer's veto or a vote count.

## §8 VERIFY board result — RECORDED 2026-06-24 (architect + hacker; pre-build; all folded above)

2-lens board. **architect NEEDS-REVISION (1 CRITICAL, 1 HIGH, 3 MED); hacker NEEDS-REVISION (1 HIGH, 1 MED, 1 LOW).**
The AUTHORITY MODEL was CONFIRMED-SOUND/CLOSED by both lenses (the crater-throne reuse is the right authority — not a
category error; the `>=2` rootOf-keyed quorum closes single-root / Sybil-persona / zero-standing-flood; provenance is
`verifiedRecords`-bound; removing `recordSlash` is correct; layering has no reverse edge; NS-5/idempotency hold;
un-slash-by-re-staking is correctly blocked). Two load-bearing catches reshaped the design pre-build.

- **CRITICAL (architect) — the composition story cited S5 `convert.funded_root`, which is NOT on `main`** (it is the
  open PR #17). A `convert`-anchored §3 test would fail to import its subject. FOLDED §0/§3/§5: the TESTED composition
  is re-anchored on **S3 `issuance-policy`** (present on main; a slashed root's `'slashed'` fails the strict
  `=== 'locked'`); S5 is carried as a FORWARD-CONTRACT verified at #17 merge.
- **HIGH (hacker) — the missing F3-analog (pre-positioning attack).** The original in-scope check was "the ROOT has a
  stake," but the SLASH referenced no REAL stake — so 2 colluding earned roots could PRE-POSITION slashes against a
  victim with no stake yet, firing the instant the victim ever staked. The crater forbids exactly this. FOLDED §0/§2/
  §3: a SLASH carries `target_stake_id` that MUST resolve (∈ the root's real STAKE `record_id`s) — a content-address
  the pre-positioned slash cannot know for a future stake. A dedicated test proves the pre-positioned slash never
  fires on a later stake.
- **HIGH (architect) — the S3 composition mechanism was mis-named** ("open-enum passthrough"). FOLDED: S3 composes via
  the strict `=== 'locked'` FAIL-CLOSED (everything-not-locked fails), which is WHY a `'slashed'` status safely fails
  `stake-required`; named correctly (the open-enum passthrough is S5's mechanism).
- **MED (architect) — `slashed` vs an EXPIRED (unlocked) stake was under-specified.** FOLDED §2/§3: `slashed`
  overrides BOTH `locked` AND `unlocked`; a test asserts an expired-stake + 2 slashers -> `'slashed'`.
- **MED (architect) — missing-`payload` guard.** FOLDED §2: `r.payload &&` before dereference (a no-payload SLASH
  contributes 0, never throws — matches `direct.js:63`).
- **MED (hacker) — the read-side `reason` must be `typeof === 'string' && trim().length > 0`, not truthy.** The
  producer guard is bypassable via a raw record (the store is not a sandbox); a truthy check passes `{}`/`[]`/`true`/
  `1`/`'   '`. FOLDED §2/§3: the read-side check + a test over all five malformed values.
- **MED (architect) — S3's `reasonFor` string is stale for a slashed root.** FOLDED §5: carried as a cosmetic
  documentary residual (not a machine surface); S4 does not widen to touch `issuance-policy.js`.
- **LOW (architect schema / hacker skip-null) — required[] is top-level (existing records still validate; a probe
  confirms); keep "skip a null root" (do NOT copy `direct.js`'s `|| src_persona_did` persona-fallback into the
  quorum).** FOLDED §2.
- **CONFIRMED-SOUND/CLOSED (no change):** crater-throne reuse is the right authority (calibrated to the SHADOW
  consequence; re-litigate at S6); the in-scope precondition placement; layering (forward/lateral edges only);
  NS-5/derived-on-read + Set-keyed idempotency; provenance (`rootOf(signer)`-bound, `target_*` self-asserted-but-
  resolution-checked); `>= 2` exact over a deduped root-Set (not subset/off-by-one); self-slash counts as 1 root;
  un-slash-by-re-staking blocked; the throne residual (2 colluding earned roots) honestly stated + inherited-not-widened.

## §9 VALIDATE result — RECORDED 2026-06-24 (3-lens; post-build; all folded above)

3-lens tier (auth/security-critical diff — a SLASH craters a victim's stake). **hacker CLEAN; code-reviewer APPROVE;
honesty CALIBRATED-WITH-NOTES (grade A-).** Suite green after folds: 346/0, eslint clean (orchestrator-run firsthand
via `node test/run.js`).

- **hacker (the load-bearing lens) — CLEAN, ZERO findings.** 40+ LIVE throwaway probes (Rule 2a) that mint/forge/sign
  real records into a real store against the BUILT `isSlashed`/`stakeOf`. EVERY attack family REFUTED: slash-below-
  quorum (1 root / one-human-N-personas / zero-standing-flood / 1-earned+1-flood — all `locked`; `>= 2` exact over a
  deduped `Set`, no off-by-one/subset); forge (unsigned / wrong-key / unregistered / forged-`src_persona_did` /
  forged-`parent_human_uid` — all dropped by `verifiedRecords`, keyed by `rootOf(signer)`); pre-positioning/F3 (a
  guessed/different-root/CLAIM-id/SLASH-id `target_stake_id` never fires; a fresh stake's new content-address defeats
  the pre-positioned slash); the reason gate (`{}`/`[]`/`true`/`1`/`'   '`/`''`/`toString`-spoof/`trim`-spoof all
  `locked` — `typeof === 'string'` short-circuits before `.trim()`); un-slash-by-re-staking blocked; prototype
  pollution via `JSON.parse`-loaded `__proto__` payload inert; missing-payload contributes 0 (no throw); standing-
  laundering (a STAKE-only or unearned-sibling persona is not earned). The slash fold — the security surface of the
  whole arc — held.
- **code-reviewer — APPROVE (0 HIGH/MED/LOW; 1 NIT, folded).** CONFIRMED-GOOD: `isSlashed` correctness (the
  `stakeIds`-in-the-same-pass resolution, the precedence placement, the exact `>= 2`); NS-5/derived-on-read +
  fresh-object immutability + idempotency; backward-compat (no SLASH -> byte-identical; the 17 pre-S4 stake.test.js +
  issuance-policy tests green); fail-closed boundaries (producer + read-side reason gate + missing-payload guard);
  genuine DRY reuse of `earnedStandingPersonas`; clean layering; schema `required[]` unchanged. NIT folded: the unused
  `void X` binding dropped.
- **honesty — CALIBRATED-WITH-NOTES (A-).** All 8 load-bearing claims CONFIRMED-HONEST: SHADOW (a slash flips only the
  advisory status; the sole consumer `issuance-policy` is `gates:false`); NARROWS-not-hardens stated everywhere, never
  contradicted; the crater-throne reuse is the SAME throne (not weaker) — `earnedStandingPersonas` + `rootOf` + exact
  `>= 2` verbatim; the throne residual (2 colluding earned roots) carried loud + inherited-not-widened; OQ#1 honestly
  RESOLVED-by-reuse (no new authority minted); L8 "states-a-reason-not-true" precisely characterized (the read-side
  non-empty check, with its truth-limit attached); the quorum tests non-vacuous; S5 composition correctly NOT claimed
  tested (forward-contract). NOTHING inches toward a Sybil/U1/hardening WIN. 3 LOW notes FOLDED: the stale
  `issuance-policy.js:55`->`:57` cite; the test name `immutable`->`fresh-return` (it proves fresh-not-frozen); a §0
  back-reference that the F3-analog was ADDED after the VERIFY HIGH (legibility). (Honesty lens disclosed it could not
  run the suite — the orchestrator did: 346/0.)
