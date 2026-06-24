---
lifecycle: persistent
created: 2026-06-24
phase: U1 stake S1-S2 BUILD — the StakeAnchor read-fold + the custody-minted STAKE commitment (SHADOW)
status: DONE — built + 312/0 green; VERIFY folded (§8); VALIDATE 3-lens hacker-CLEAN/honesty-CLEAN (§9). SHADOW.
---

# U1 stake S1-S2 build — the StakeAnchor read-fold + the custody-minted STAKE commitment (SHADOW)

> The first build slice of the U1 issuance-stake blueprint (`plans/18`), greenlit 2026-06-24 after the
> consolidation (#14). Scope is **S1-S2 ONLY**. **SHADOW: gates nothing. NARROWS, does not harden** (only a really-
> deployed S6 leans toward hardening — `plans/18` §0; NS-9: this build is not a hardening). The pre-build VERIFY
> board (`wf_94bfc77b`) reshaped the design substantially — see §8.

## §0 Honest scope (read first — OQ-NS-6 / NS-7 / NS-9 + the D5 reconciliation)

This builds the `convert.js` forward-contract's named-but-absent "voucher stake" piece (`convert.js:82-85`) as a
PRESENCE/COMMITMENT signal. S1-S2 deliver: (a) a `StakeAnchor` — a **read-side FOLD** over the SIG-VERIFIED record
store (NOT a parallel store), and (b) a `STAKE` record type minted ONLY through the custody minter. Both are
**SHADOW** — no weight reads stake-state, `convert.actionable` stays false.

**The D5 reconciliation (the VERIFY headline — `creator-standing.js:8-10`).** A prior ratified decision says: *"THE
STAKE IS THE STANDING (D5): there is NO separate `stake` field (it was self-asserted/forgeable — a `{stake:1e9}`
body scores identically). Skin in the game is ENDOGENOUS."* The original S2 carried a self-asserted `payload.amount`
— **exactly that forgeable field**. Even custody-SIGNED, an in-memory amount is self-minted at zero real cost
(provenance fixes WHO asserted it, never the COST). So **S1-S2 carries NO `amount` and NO `anchor_ref`.** An
in-memory stake is HONESTLY just a presence/commitment marker (a `lock_expiry` window); the amount-at-risk is BORN
at S6 (a chain-settled deposit) where it has real settlement meaning — added then as an additive payload field (the
lenient validator + open payload make it non-breaking). Carrying a meaningless forgeable number now would revive D5
and is YAGNI. **This build must NEVER be reported as hardening U1.**

## §1 Runtime probes (firsthand — re-confirmed this session against the repo, 2026-06-24)

- **P1 — record/frame shape + content-address.** `v0/src/lib/record.js`: `computeRecordId` = sha256(canonical(body
  minus `{record_id, sig}`)); `validateRecord` enforces ONLY `required[]` + spot-checks + the CONTEST discriminant
  (lenient). CONFIRMED.
- **P2 — the type enum is DOCUMENTARY (not a runtime guard).** `record-schema.json` `type.enum` is NOT enforced by
  `validateRecord` (confirmed live by the board: `type:'STAKE'` validates even before the enum edit). The schema
  edit is documentation; the `type==='STAKE'` discriminant in the fold is the only runtime selector — and it runs
  AFTER the provenance gate (P7), never as a standalone trust signal. `payload` is open (no `additionalProperties`).
- **P3 — the custody minter (non-transferable PRODUCTION path).** `minter.js`: `createMinter({signer, personaDid,
  humanUid}).mint(spec)` binds `src_persona_did=personaDid`, `parent_human_uid=humanUid`, rejects a cross-root
  override, holds NO raw key. A custody-minted STAKE's signer-root is structural. CONFIRMED.
- **P4 — the registry seam.** `registry.js`: `rootOf(reg, personaDid)` -> the persona's human root (the keying
  primitive the fold uses); `lookupPublicKey` (per-sender verify keys); records, never an oracle. CONFIRMED.
- **P5 — the forward-contract.** `convert.js:82-85` names "voucher stake" (unimplemented); `convert.actionable`
  hard-false (INV-16). S1-S2 do NOT wire convert (S5). CONFIRMED.
- **P6 — STAKE does not exist.** grep `v0/src`: 0 hits. Greenfield (NS-10). CONFIRMED.
- **P7 (THE VERIFY CRITICAL — load-bearing) — `verifiedRecords` is the SOLE read gate (INV-14).** `trust/
  read-gate.js:24-34`: `verifiedRecords(registry, storeOpts)` returns only store records whose `sig` VERIFIES under
  the SENDER's REGISTERED key (`lookupPublicKey(registry, src_persona_did)`); an unsigned / bad-sig / unregistered-
  sender record is DROPPED (contributes 0, fail-closed). EVERY weighted fold reads through this — "store-presence is
  never provenance — integrity != provenance (#273)." The STAKE fold MUST read through it. CONFIRMED (read).
- **P8 — the human-keyed creator-bound fold pattern (`creator-standing.js:23-39`).** The canonical fold reads
  `verifiedRecords`, filters by type, and keys by `rootOf(reg, src_persona_did)` (NOT a self-asserted body field).
  So a forged `parent_human_uid` is structurally IGNORED — the record counts under the SIGNER's real registered
  root, unforgeable without the registered key. The STAKE fold FOLLOWS this creator-bound keying pattern (no
  `rootOf` fallback — `verifiedRecords` already drops unregistered senders, so the fold's `rootOf(...) !==
  humanUid` is strictly fail-closed). CONFIRMED (read).

## §2 The build (S1-S2 only)

### S1 — `StakeAnchor`: a read-side FOLD over the verified store (`v0/src/trust/stake-anchor.js`, NEW)

> LAYERING (build-time correction): the anchor lives in `trust/`, NOT `identity/` (the blueprint's nominal
> home). It reads `trust/read-gate` and the S5 consumer is `trust/convert.js`; `identity/` sits BELOW `trust`
> (`trust/read-gate` imports `identity/registry`), so an `identity/` anchor would be a reverse edge. The
> layering tripwire (`layering.test.js`) gained an `identity -> trust` ban to catch this class. `stake.js`
> (the record-producer helper, imports nothing) stays in `identity/`.

A derived-on-read VIEW (like `direct.js` / `consensus.js` / `creator-standing.js`), NEVER a store, NEVER an oracle:
- `createStakeAnchor({ registry }) -> { stakeOf(storeOpts, humanUid, nowMs), recordSlash() }`.
- **`stakeOf(storeOpts, humanUid, nowMs)`** — the load-bearing fold:
  1. `recs = verifiedRecords(registry, storeOpts)` — **sig-verified under the registered key (P7/INV-14)**. This is
     the provenance gate the original plan was missing; an unsigned/forged STAKE never reaches the fold.
  2. keep `r.type === 'STAKE'` (the discriminant, AFTER the provenance gate).
  3. key by `rootOf(registry, r.src_persona_did) === humanUid` (P8 — a forged `parent_human_uid` is IGNORED; the
     stake counts under the signer's real registered root only).
  4. derive ON READ: `lockedUntil = max(valid lock_expiry of the matching records)` or `null`; `status = 'none'`
     (no matching) | `'locked'` (`nowMs < lockedUntil`) | `'unlocked'` (`nowMs >= lockedUntil`). Return a FRESH
     `{ status, lockedUntil }`. **Naturally idempotent** (max + presence — no sum, so a replayed STAKE cannot
     inflate anything; this is WHY dropping `amount` also closes the replay-amplification finding).
  - NO mutable store, NO balance, NO rank, NO edge, NO gate. A diagnostic readout only.
- **`recordSlash()`** — RESERVED for S4. It **THROWS** a loud `Error('recordSlash: reserved for S4 — SLASH not
  built; do not call')` (NOT a silent no-op — a no-op is a vacuous guard a future caller could mistake for a built
  slash; a throw is self-announcing and non-vacuous, per the security-rules "a guard must be non-vacuous").
- **S4 forward-contract (state now so S1's fold shape survives S4):** when S4 adds the SLASH record, a slashed root
  must DROP — SLASH is ANOTHER append-only record the SAME fold subtracts/flips on read (`status -> 'slashed'`),
  never a mutated balance (NS-5 preserved across the S4 boundary).
- **The S6 seam:** the `StakeAnchor` INTERFACE abstracts the stake-state SOURCE — InMemory = this fold over the
  verified record store; on-chain (S6) = a chain query. Pluggability lives in the INTERFACE, never in the signed
  record body (so no `anchor_ref` is frozen into S1-S2 records).

### S2 — the `STAKE` record type (`record-schema.json` + a thin `v0/src/identity/stake.js`, NEW)

- **Schema:** add `"STAKE"` to `type.enum` (DOCUMENTARY — P2; not a runtime guard); add ONE documentary
  `payload.property`: `lock_expiry` (integer >= 0, epoch ms — the commitment window). **NO `amount`, NO
  `anchor_ref`, NO `human_uid`** (D5 + YAGNI + the root is minter-bound, §0).
- **`stake.js` (NEW, thin):** `STAKE_TYPE = 'STAKE'`; `buildStakeSpec({ lockExpiry, seq, nonce }) -> { type:'STAKE',
  payload:{ lock_expiry: lockExpiry }, seq, nonce }` with fail-closed boundary validation (lockExpiry a non-negative
  SAFE integer; else throw). Minting is done by the CALLER via `minter.mint(buildStakeSpec(...))` — signed through
  custody; the root is the minter's bound `parent_human_uid` (non-transferable). `stake.js` holds NO key/signer.
- **Non-transferable (hard, two-layered):** PRODUCTION — the minter binds the root (P3). READ — the fold keys by
  `rootOf(src_persona_did)` and ignores any self-asserted `parent_human_uid` (P8). A forged STAKE for a victim's
  root contributes 0 (no registered-key sig) — closing the CRITICAL ingest hole the board proved live.

## §3 TDD behavioral contract (test-first — write `test/unit/stake.test.js` BEFORE impl; this IS the spec)

**Provenance gate (the VERIFY CRITICAL — these are the load-bearing tests):**
- An UNSIGNED STAKE with a valid content-address and `parent_human_uid:'human:victim'`, `payload.lock_expiry`
  present -> `stakeOf(..., 'human:victim', ...)` returns `status:'none'` (dropped by `verifiedRecords` — no sig).
- A STAKE signed by an UNREGISTERED sender (no `lookupPublicKey`) -> contributes 0 (`status:'none'`).
- A STAKE signed by a WRONG key (sig does not verify under the registered key) -> contributes 0.
- A custody-signed STAKE by persona `zX` (registered under root `human:A`) but with a forged
  `parent_human_uid:'human:B'` -> counts under `human:A` (keyed by `rootOf(zX)`), NEVER under `human:B`.

**Mint + read-back (happy path):**
- `createMinter({signer, personaDid, humanUid}).mint(buildStakeSpec({lockExpiry, seq, nonce}))` -> a STAKE frame
  with `type==='STAKE'`, `parent_human_uid===humanUid`, `src_persona_did===personaDid`, `payload.lock_expiry` set,
  a verifying `sig`. After it lands in the receiver's store, `stakeOf(storeOpts, humanUid, nowMs)` reflects it.
- `status`: `'none'` for a root with no STAKE; `'locked'` when `nowMs < lockedUntil`; `'unlocked'` when `>=`.
  `lockedUntil` = max `lock_expiry` across the root's STAKEs. Keys on the signer's root (a STAKE for A never appears
  under B). **Idempotent:** the same STAKE present twice yields the SAME `{status, lockedUntil}` (max + presence).
- Immutability: `stakeOf` does not mutate; two reads are equal; the return is a fresh object.

**Non-transferable + boundary + reserved-slash:**
- A STAKE spec naming a DIFFERENT `parent_human_uid`/`src_persona_did` than the minter's binding is rejected (P3).
- `buildStakeSpec` fail-closes on a negative / non-integer / unsafe `lockExpiry` (throws, no spec).
- `recordSlash()` THROWS with the S4-reserved message (a probe asserts the throw — non-vacuous, not a no-op).

**Framing guards:**
- The `type.enum` is non-enforcing (a probe documents that `validateRecord` accepts the type regardless); the
  `type==='STAKE'` selector runs AFTER the provenance gate.
- SHADOW: nothing in `convert.js` / `mayGate` reads stake-state this wave (a probe confirms no new consumer; grep).

## §4 Hard constraints (from plans/18 §3 — the design MUST honor)

Non-transferable (two-layered: minter-bound production + rootOf-keyed read) · registry-not-oracle (a diagnostic
readout — no edge/rank/gate) · no global ranking · derived-on-read, NO mutable score store (NS-5) · **reads through
`verifiedRecords` — provenance via the authenticated minter + registered-key sig, NEVER store-presence (NS-2,
`#273`)** · provenance reuse via the existing custody path only (NS-10 — no new key path, no parallel store) · SHADOW
until residuals close (NS-8 — `convert.actionable` stays false) · per-root unit via `rootOf` (NS-4).

## §5 Residuals (carry loud — NS-9; OPEN after S1-S2)

In-memory stake = a SIMULATED presence/commitment, NO real cost = NARROWS only (real cost needs a really-deployed
S6) · **NO `amount` in S1-S2** (D5 — the magnitude is born at S6) · U1 uniqueness stays OPEN (containment, not
elimination) · STAKE provenance is REAL only when the minter's signer routes to a real out-of-band boundary (the
dogfooded cross-uid broker; same-uid is still an oracle — NS-2) · `lock_expiry` is a SELF-ASSERTED absolute
timestamp with NO clock validation in S1-S2 (a caller can mint "locked until year 9999") — carried so S5/S6 do not
assume it is bounded · SLASH (S4), issuance policy (S3), the advisory axis (S5) are NOT built — `recordSlash` THROWS
(reserved) · no weight reads stake-state (S5 is the consumer, deferred) · a sig-verified STAKE with a MALFORMED
`lock_expiry` is SILENTLY dropped by the fold (`stake-anchor.js` `Number.isSafeInteger` skip) — fine while SHADOW,
but the S5 consumer must NOT read `status:'none'` as proof-of-no-stake · `stakeOf(null storeOpts, ...)` throws
(pre-existing whole-store behavior, sibling-consistent with `creator-standing.js`; a fix belongs in `record-store`,
not a per-fold special-case — out of this wave's scope).

## §6 VERIFY / VALIDATE plan

- **VERIFY (pre-build, 2-lens) — COMPLETE, folded (§8).**
- **VALIDATE (post-build, multi-lens):** `hacker` re-probes the BUILT module (Rule 2a — live probes, not just the
  TDD suite): the forged-unsigned-STAKE and forged-`parent_human_uid` vectors against the built fold; can stake-
  state be read as a gate anywhere (grep). `honesty-auditor` grades the SHADOW/narrows-not-hardens + D5-reconciled
  claims against the diff (NS-9). `code-reviewer` for read-back immutability + fail-closed boundaries.

## §7 Cross-substrate sync (toolkit <-> PACT — standing directive)

The "derived-on-read fold over a sig-verified append-only store, keyed by a provenance-bound identity" is a PORTABLE
pattern — the toolkit's reputation/attestation snapshots are kin (materialize-on-read over evidence-linked records).
The VERIFY lesson (a NEW read-path must reuse the ONE verify-on-read+sig gate, never hand-roll a parallel store) is
the cross-substrate carry. Memory: `pact-toolkit-cross-substrate-sync`.

## §8 VERIFY board result — RECORDED 2026-06-24 (architect + hacker; workflow `wf_94bfc77b`; all folded above)

2-lens board. **hacker NEEDS-REVISION (a CRITICAL) -> resolved; architect SOUND-WITH-CHANGES.** The board reshaped
the design substantially pre-build — the highest-value catch of the wave.

- **CRITICAL (hacker, PROVED LIVE) — the ingest path bypassed the INV-14 sig-verify gate.** The original
  `recordStake` validated INTEGRITY only (content-address + type + shape), NOT PROVENANCE. A forged UNSIGNED STAKE
  with `parent_human_uid:'human:victim'`, `amount:1e12` passed validateRecord (enum documentary) AND the content-
  address, so it would be appended and folded under the victim's root — opening non-custody mint + key-confusion +
  the transfer vector at once (#273's third face — the exact thing `security.md` warns of). **FOLDED §2 S1 / §3:**
  `stakeOf` now reads through `verifiedRecords` (P7) and keys by `rootOf(src_persona_did)` (P8) — a forged/unsigned
  STAKE contributes 0; a forged `parent_human_uid` is ignored. The TDD contract leads with these provenance probes.
- **HIGH (architect + hacker, CONVERGENT) — self-asserted `payload.amount` revives D5.** FOLDED §0 / §2 S2:
  `amount` (and `anchor_ref`) DROPPED from S1-S2; the stake is a presence/lock commitment; the magnitude defers to
  S6. The §0 reconciliation cites `creator-standing.js:8-10` and bounds the claim (provenance != cost).
- **MED (architect + hacker) — the StakeAnchor hand-rolled a parallel store, duplicating the audited
  `record-store` verify-on-read + INV-22 dedup.** FOLDED §2 S1: the anchor is now a thin READ-FOLD over
  `verifiedRecords` / the existing store — verify-on-read lives in ONE place; no parallel list.
- **MED (architect) — `anchor_ref` leaked the S6 backend into S1-S2 signed records.** FOLDED §2 S2: dropped;
  pluggability lives in the INTERFACE, not the signed body.
- **MED (architect + hacker) — `recordSlash` no-op-vs-throw ambiguity (vacuous-guard risk) + no S4 fold hook.**
  FOLDED §2 S1: `recordSlash` THROWS (non-vacuous); the S4 forward-contract (SLASH subtracts in the same read-fold)
  is stated so S1's shape survives.
- **MED (hacker) — replay double-count (no dedup).** FOLDED structurally: dropping `amount` makes the fold
  `{status, lockedUntil}` = max + presence, which is idempotent under replay (no sum to inflate).
- **LOW (hacker) — the enum is non-enforcing.** FOLDED §1 P2 / §3: annotated; the type selector runs after the
  provenance gate. **LOW (architect) — unbounded `lock_expiry` / amount overflow:** amount gone; `lock_expiry`
  carried as a self-asserted-no-clock residual (§5).
- **Confirmed SOUND (no change):** non-transferability is structural (minter-bound); SHADOW / narrows-not-hardens is
  loud + correct; `convert.actionable` stays false (INV-16); the S1-S2 cut is the right minimal slice; the build
  plan correctly dropped the blueprint's payload `human_uid`.

## §9 VALIDATE result — RECORDED 2026-06-24 (3-lens; workflow `wf_a6adf490`; all folded above)

3-lens tier (security/auth-sensitive diff). **hacker CLEAN (Rule 2a live probes); honesty CLEAN; code-reviewer
CHANGES-REQUESTED (all MED/LOW/NIT — no CRITICAL/HIGH).** Suite green after folds: 312/0, eslint clean.

- **hacker (the load-bearing lens) — CLEAN.** Wrote 6 throwaway `/tmp` node scripts against the BUILT modules and
  REFUTED all 5 attack classes with demonstrated probes: forged/unsigned/wrong-key/unregistered STAKEs contribute
  0 (`verifiedRecords` drops them before the type filter); a forged `parent_human_uid` counts ONLY under
  `rootOf(signer)`, never the victim; no malformed/type-confused/prototype-pollution/huge-lock input bypasses the
  gate or corrupts `{status, lockedUntil}`; no cross-receiver leak (fresh return, deep-frozen store); stake-state is
  a gate NOWHERE (`convert.actionable` hard-false live-verified; grep: zero consumers). The VERIFY CRITICAL's
  provenance fix is correctly in place. Only finding: the LOW null-`storeOpts` NIT (pre-existing, sibling-consistent).
- **honesty — CLEAN / CALIBRATED.** D5 reconciliation genuinely honored (zero `amount`/`anchor_ref` fields
  anywhere); SHADOW/narrows-not-hardens honest end-to-end; `non-transferable` claimed at exactly the strength the
  code earns; NS-9 holds. Findings all NIT — FOLDED: the idempotency test strengthened (two distinct same-lock
  STAKEs isolate fold-max from store-dedup); the §1 P8 wording softened (no `rootOf` fallback); the §5 malformed-
  `lock_expiry`-silent-drop residual added. (Honesty lens disclosed it couldn't run the suite — the orchestrator
  did: 312/0.)
- **code-reviewer — CHANGES-REQUESTED (MED/LOW/NIT) — FOLDED.** Added the missing tests the plan contract named:
  the SHADOW no-consumer grep test (machine-checkable), the non-finite-clock conservative-`locked` test, the
  `lock_expiry=0` edge, the null-input test; added the `opts || {}` null guards to `buildStakeSpec` /
  `createStakeAnchor` so an explicit `null` hits the documented validation throw. The null-`storeOpts` NIT is
  accepted as pre-existing whole-store behavior (a fix belongs in `record-store`, not this diff — §5).
