---
lifecycle: persistent
created: 2026-06-24
phase: U1 stake S5 BUILD — wire stake-state into convert as an advisory funded-root axis (SHADOW)
status: DONE — built + 346/0 green, eslint clean; VERIFY folded (§8); VALIDATE 3-lens hacker-CLEAN-after-fold / honesty-NO-OVERCLAIM / code-rev-APPROVE (§9). SHADOW; NARROWS, does not harden.
---

# U1 stake S5 build — the funded-root advisory axis in convert (SHADOW)

> Continues the U1 stake arc after S3 (`plans/21`, #16). **USER-chosen to RE-ORDER the blueprint** (build S5 before
> S4): S5 is unblocked + discharges a live forward-contract; S4 is governance-blocked (the slasher throne) + mostly
> dormant until S6. Scope is **S5 ONLY** — surface stake-state in `trust/convert.js` as ONE advisory input. **SHADOW:
> `convert.actionable` STAYS false; the axis informs, never gates. NARROWS, does not harden** (only a really-deployed
> S6 leans toward hardening — `plans/18` §0; NS-9).

## §0 Honest scope (read first — OQ-NS-6 / NS-7 / NS-9) + the minimal-slice decision

S5 discharges the NAMED-but-absent "voucher stake" piece of the `convert.js:82-85` forward-contract — as a **coarse
funded-ROOT advisory axis**: given `convert(me, agent)`, surface whether the AGENT's root is a funded (locked-STAKE)
root, receiver-relative, reusing S3/S1-S2's `stakeOf` fold. It is ONE advisory field in `convert`'s output; it NEVER
feeds `meets_topological` / `independence` / `actionable` / `mayGate`.

**Minimal-slice decision (loud — the forward-contract names more than S5 builds).** `convert.js:82-85` names the
per-path bar as "probation + voucher stake + behavioral demo (§5.1)". S5 builds ONLY the coarse **funded-root**
signal (is the target a staked root?), NOT the full per-PATH, per-VOUCHER stake (each voucher on each disjoint path
having staked) — that richer form is entangled with decay semantics (OQ#3, unresolved) and the rest of the §5.1 bar
(probation, behavioral demo), all unbuilt. Surfacing the coarse axis discharges "stake is now visible in convert"
honestly; the per-path/per-voucher refinement + decay are carried as loud residuals (§5). `actionable` stays false
regardless — the remaining bar (U2 estimator + probation + behavioral demo) is unbuilt (NS-8).

## §1 Runtime probes (firsthand — confirmed this session against the repo, 2026-06-24)

- **P1 — `convert`'s current shape + the forward-contract (`trust/convert.js:86-97`).** `convert(meCtx, meDid,
  agentDid)` → `{advisory:true, disjoint_paths, meets_topological, independence, actionable:false, reason}`.
  `disjointPaths` reads `verifiedRecords(meCtx.registry, meCtx.storeOpts)` (`:74`). The `:82-85` comment is the
  forward-contract: `actionable` MUST NOT flip until the per-path bar (incl. "voucher stake") EXISTS AND U2 replaces
  the WEAK flag. CONFIRMED (read).
- **P2 — the gate surfaces S5 must NOT feed.** `independence/weak-flag.js` `mayGate` (`:47-54`, decides off
  `epistemicIndependence()==='WEAK'`, ignores caller labels) + `epistemicIndependence()` (`:66-68`, the SOLE U2 lift-
  point, permanently WEAK) + `convert.actionable` (`:94`, hard-false). The stake axis feeds NONE of them; it is a
  scarcity/cost axis (axis-1 family) — NEVER read as epistemic independence (axis 4). CONFIRMED (read).
- **P3 — the provenance-clean source (`trust/stake-anchor.js:44-59`).** `createStakeAnchor({registry}).stakeOf(
  storeOpts, humanUid, nowMs)` → `{status, lockedUntil}` reading THROUGH `verifiedRecords` keyed by
  `rootOf(src_persona_did)` — a forged/unsigned stake contributes 0. S5 reuses it via a DI-injected anchor (no new
  key path; no static `stake-anchor` import — so the SHADOW walks stay green). CONFIRMED (read).
- **P4 — `rootOf` keys the agent's stake (`identity/registry.js:43-46`).** `rootOf(registry, agentDid)` → the
  agent's human root; `stakeOf` reads that root's stake-state. CONFIRMED (read).
- **P5 — the test harness (`test/unit/trust.test.js:41-52,271-292`).** `meCtx = {registry, storeOpts:{receiverId,
  stateDir}}`; the CONVERT tests assert individual fields (`.actionable`, `.advisory`, `.independence.overall`) — an
  ADDITIVE `stake` field does not break them. The **P4 SEQUENCING GUARD (`:285-292`)** is the load-bearing SHADOW
  test: `actionable:false` + `mayGate` refuses high-stakes + `epistemicIndependence` WEAK. S5 must preserve it.
  CONFIRMED (read).
- **P6 — receiver-relative is structural.** `stakeOf` reads `meCtx.storeOpts` (ME's per-receiver store), so two
  receivers with different stores see different stake-state for the same agent — no global rank (NS-3). The existing
  `no rank throne` test (`:314-`) is the sibling precedent. CONFIRMED (read).
- **P7 — `convert` has zero `src/` importers (grep).** Extending `meCtx` with an OPTIONAL `anchor` + `nowMs` is
  non-breaking (no production caller; tests construct `meCtx`). CONFIRMED (grep).

## §2 The build (S5 only)

### S5 — `trust/convert.js`: a funded-root advisory axis, read via a DI-injected anchor

**Field name `funded_root` (NOT bare `stake`)** — it under-signals "coarse funded-ROOT, not the per-path voucher
stake the §5.1 bar still awaits" (VERIFY arch HIGH-1; mirrors S3 naming its readout `meets_policy`, not `meets`).

- **A small named helper `agentStakeAxis(meCtx, agentDid)`** (SRP, keeps `convert` < 50 lines):
  - if `!meCtx.anchor` or `typeof meCtx.anchor.stakeOf !== 'function'` → return `null` (backward-compatible — `convert`
    works without an anchor; the axis is simply UNAVAILABLE, SHADOW). **`null` is NOT `{status:'none'}`** — see below.
  - else `return meCtx.anchor.stakeOf(meCtx.storeOpts, rootOf(meCtx.registry, agentDid), meCtx.nowMs)` —
    **UNCONDITIONALLY** (KISS/DRY, matches S3's `issuance-policy.js:91`: `rootOf` returns `null` for an unregistered
    agent and `stakeOf(…, null, …)` already yields `{status:'none', lockedUntil:null}` — no hand-rolled short-circuit,
    no second source of the `none` shape — VERIFY arch LOW-1). `{status, lockedUntil}`, provenance-clean, keyed by the
    agent's REGISTERED root (a forged `parent_human_uid` on the stake is ignored, P3/P4).
- **`convert` gains ONE advisory field** `funded_root: agentStakeAxis(meCtx, agentDid)`. The field:
  - is ADVISORY-ONLY — it does NOT touch `disjoint_paths`, `meets_topological`, `independence`, `actionable`, or any
    `mayGate` input. `actionable` STAYS `false` (INV-16) — a fully-locked-stake + strong-topology agent is STILL
    `actionable:false` (the load-bearing S5 SHADOW guard; the guard test asserts the precondition is LIVE — §3).
  - is a scarcity/cost axis (axis-1 family) — NEVER read as epistemic independence (axis 4); it is SEPARATE from the
    `independence` label (TEST-ENFORCED isolation, not structural — a test deepEquals `independence` +
    `meets_topological` + `disjoint_paths` with/without the axis).
  - is receiver-relative (reads ME's store, P6) — never a global rank.
- **The `null` tri-state (pin it now — VERIFY arch MED-2 / hacker MED-3):** `funded_root === null` means the axis is
  UNAVAILABLE (no anchor wired, or a broken anchor) — it is NOT a status and NOT proof of anything. `{status:'none'}`
  means the axis RAN and the agent's root is unfunded (a real, receiver-relative negative). **A future GATING consumer
  MUST treat `null` as FAIL-CLOSED — never as "funded" and never as "no requirement / allow"** (the #273 integrity!=
  validity hole deferred into the forward-contract). The helper carries this as an in-code comment.
- **The `status` enum is OPEN (VERIFY arch LOW-2):** S4 will add `'slashed'`; this axis passes the WHOLE
  `{status, lockedUntil}` object through and MUST NEVER switch on a closed status set (so an S4 `'slashed'` flows
  through unchanged — NS-5). No `'slashed'` test now (`recordSlash` throws — `stake-anchor.js:67`).
- **Update the `:82-85` forward-contract comment** (honest accretion, not a rewrite): the "voucher stake" piece is now
  surfaced as a COARSE funded-ROOT advisory axis (`funded_root`, S5) — NOT the per-path/per-voucher stake the bar
  names; `actionable` still MUST NOT flip — the per-path stake + decay (OQ#3) + probation + behavioral demo + the U2
  estimator remain unbuilt; the axis informs, never gates; `funded_root:null` is fail-closed-not-allow for a gater.

### S5 — the SHADOW invariant: the FIRST advisory consumer of stake-state, still NON-gating (BEHAVIORAL guard)

`convert` reads `stakeOf` via a DI-injected anchor (NOT a static import) — so the `stake.test.js` "only
`stake-anchor.js` imports `stake-anchor`" walk + the `issuance-policy.test.js` "no consumer of `issuance-policy`"
walk both stay GREEN unchanged (`convert` imports neither; **the build must NOT add a static
`require('./stake-anchor')` — that would RED both walls, a useful tripwire**). Because DI sidesteps the import walks,
the load-bearing S5 SHADOW guard is BEHAVIORAL: **`convert.actionable` stays `false` even with a locked stake + strong
topology**, the axis never reaches `mayGate`/`epistemicIndependence`, AND the guard test FIRST proves its precondition
is live (`funded_root.status==='locked'` + `meets_topological` true) so it cannot pass vacuously against a
`funded_root:null` build (VERIFY hacker MED-1).

## §3 TDD behavioral contract (test-first — write `test/unit/convert-stake.test.js` BEFORE impl; this IS the spec)

Reuse the `trust.test.js` world harness (registry + per-receiver store + `createStakeAnchor` + a custody minter for
STAKEs + the vouch `emit` for topology). The load-bearing tests are the **SHADOW guard** (actionable stays false) +
**axis separation** (independence/topological unaffected) + **provenance reuse** + **receiver-relative**.

**The funded-root axis surfaces:**
- `convert` with `meCtx.anchor` set + a custody-minted LOCKED stake for the AGENT's root → `c.funded_root =
  {status:'locked', lockedUntil}`. An agent with no stake → `c.funded_root.status:'none'`.
- keyed by `rootOf(agentDid)`: a stake under the agent's real root counts; a forged `parent_human_uid` does not
  (inherits P3/P4).

**SHADOW guard (load-bearing — actionable never flips; NON-VACUOUS — VERIFY hacker MED-1):**
- a LOCKED stake for the agent + a STRONG topology — the test FIRST asserts the precondition is LIVE:
  `c.funded_root.status === 'locked'` AND `c.meets_topological === true` — THEN asserts `c.actionable === false` AND
  `c.independence.overall === 'WEAK'` AND `mayGate(c.independence, {highStakes:true}) === false`. The precondition
  asserts make the guard falsifiable (it would FAIL against a `funded_root:null` / no-stake build, not pass blindly).
- the existing P4 SEQUENCING GUARD (trust.test.js:285) still passes (re-run the suite).

**axis separation (axis-1 != axis-4 — TEST-ENFORCED isolation):**
- `convert` WITH a locked-stake anchor vs WITHOUT an anchor (SAME world) → `disjoint_paths`, `meets_topological`, AND
  `independence` are IDENTICAL (deepEqual all three); only `funded_root` differs (`{...}` vs `null`). The axis is
  isolated from the topological + epistemic axes.
- **hostile-anchor quarantine (VERIFY hacker LOW-1, mirrors `issuance-policy.test.js:237`):** a DI anchor whose
  `stakeOf` returns `{status:'locked'}` for an agent with NO real registered stake → `c.funded_root` reflects the lie,
  but `c.actionable`/`c.independence`/`mayGate(c.independence,{highStakes:true})` are UNMOVED vs the no-anchor world.
  The lie is contained to the advisory field.

**provenance reuse:**
- a forged UNSIGNED stake for the agent's root → `c.funded_root.status:'none'` (dropped by `verifiedRecords`); the axis
  does not launder a forged stake into "funded."

**receiver-relative (NS-3 — no global rank):**
- two receivers (different `storeOpts`) over the same registry + same agent: one received the agent's STAKE, the
  other did not → their `c.funded_root.status` DIFFER (`'locked'` vs `'none'`). No receiver-independent funded-status.

**clock + tri-state + backward-compat + boundary:**
- **finite-clock (VERIFY hacker MED-2):** an EXPIRED stake (`lockedUntil`) read with a FINITE `nowMs >= lockedUntil` →
  `c.funded_root.status === 'unlocked'` — proves `convert` FORWARDS the real clock (not a hardcoded `0`); a non-finite
  `nowMs` inherits `stakeOf`'s conservative-`locked` (an advisory over-report, never a spurious-expire).
- **tri-state distinctness (VERIFY arch MED-2 / hacker MED-3):** `convert` with NO `meCtx.anchor` → `c.funded_root ===
  null` (UNAVAILABLE); an `anchor` lacking a `stakeOf` fn → `c.funded_root === null` (broken → unavailable, NOT a
  throw); an UNREGISTERED agent WITH a valid anchor → `c.funded_root.status === 'none'` (wired, unfunded). The test
  asserts `null !== {status:'none'}` — they are distinct and not interchangeable.
- **backward-compat:** with NO anchor, `c.actionable`/`disjoint_paths`/`independence` are unchanged from pre-S5 (the
  existing CONVERT tests stay green).
- immutability: `convert`'s return is fresh; mutating `c.funded_root` does not affect a re-read.

## §4 Hard constraints (from `plans/18` §3 + §2 S5)

Advisory-ONLY — never gates (`actionable` stays false; the axis feeds no `mayGate` input) · receiver-relative, NEVER
a global rank (NS-3/L6) · NEVER read as epistemic independence axis 4 (`weak-flag.js` forbids AND(axes 1-3) as axis
4; the stake field is separate from `independence`) · derived-on-read, NO mutable score store (NS-5) · reuses
`stakeOf` provenance via DI — NEVER store-presence, NEVER a new key path (NS-2/NS-10, #273) · per-root via `rootOf`
(NS-4) · SHADOW until residuals close (NS-8).

## §5 Residuals (carry loud — NS-9; OPEN after S5)

- **The coarse funded-ROOT axis is NOT the full §5.1 "voucher stake"** — per-path, per-voucher stake (each voucher on
  each disjoint path having staked) is unbuilt; S5 surfaces only the target-root funded status. The full bar also
  needs probation + behavioral demo + the U2 estimator — all unbuilt; `actionable` stays false.
- **Decay semantics (OQ#3) UNRESOLVED — S5 surfaces a BINARY status, no decay.** A locked stake is binary-while-live;
  how a funded signal decays (vs other trust signals, NS-3) is unresolved and NOT invented here. Carried for S6.
- **NARROWS, does not harden** — an in-memory locked stake is PRESENCE, not forfeitable cost (the unbounded
  `lock_expiry`, S1-S2 residual); a `stake.status:'locked'` axis proves the target staked, never that it bears cost.
- **`funded_root.status:'none'` is NOT proof-of-no-stake** — a malformed-`lock_expiry` stake is silently dropped by
  the fold; a receiver may simply not have received the agent's STAKE (receiver-relative). Read the field, not absence.
- **`funded_root === null` is UNAVAILABLE, NOT a status (VERIFY arch MED-2 / hacker MED-3)** — it collapses "no anchor
  wired" and "broken anchor" into one value, distinct from `{status:'none'}`. Acceptable while SHADOW (the axis gates
  nothing), but **a future gating consumer MUST treat `null` as FAIL-CLOSED — never "funded" and never "no
  requirement / allow"** (else a broken anchor becomes a pass — the #273 integrity!=validity hole). A later slice may
  split it (`{status:'unavailable'}` for broken vs `null` for no-anchor); not built now.
- **`funded_root.status:'locked'` is `nowMs`-RELATIVE (VERIFY hacker MED-2)** — `convert` forwards `meCtx.nowMs` to
  `stakeOf`, which reports `'locked'` for ANY non-finite / omitted / non-numeric clock (the conservative default),
  so an EXPIRED stake reads as `'locked'` under a garbage clock. Fine while SHADOW + advisory (over-reports funded,
  never spuriously expires). A future GATING consumer MUST pass a FINITE numeric `nowMs` and treat a missing clock as
  fail-closed, not "funded". (`convert` stays deterministic — it does NOT inject `Date.now()`.)
- **SLASH (S4) is NOT built** — `stake.status` cannot be `'slashed'` yet; when S4 lands, a slashed root's status flows
  through the SAME `stakeOf` fold into this axis automatically (NS-5 preserved). The slasher-throne governance
  decision (`plans/18` §7 OQ#1) blocks S4.

## §6 VERIFY / VALIDATE plan

- **VERIFY (pre-build, architect + hacker):** architect — is reading the AGENT's root the right semantic vs the
  per-voucher bar; is the advisory field cleanly isolated (axis-1 not axis-4); backward-compat shape; is `null`-on-no-
  anchor the right degrade. hacker — can a locked stake flip `actionable`/`mayGate` anywhere; can a forged stake
  inflate the axis; cross-receiver leak; does the SHADOW guard actually hold; is fail-soft-on-bad-anchor a bypass.
- **VALIDATE (post-build, 3-lens — trust-path-sensitive):** hacker re-probes the BUILT `convert` (Rule 2a live
  probes): the locked-stake-does-not-flip-actionable + forged-stake + cross-receiver vectors. code-reviewer —
  immutability / backward-compat / the helper / axis isolation. honesty — SHADOW/narrows / axis-1-not-axis-4 / the
  coarse-not-full-voucher-stake + decay residuals vs the diff (NS-9).

## §7 Cross-substrate sync (toolkit <-> PACT — standing directive)

S5 is the first ADVISORY CONSUMER of the stake fold — the carry is "an advisory axis reads the ONE provenance-clean
fold via DI and is structurally isolated from the gate (the gate's decision never reads the advisory field)." The
toolkit kin: a reputation axis surfaced in a review readout that informs but never gates a merge — the gate reads its
own authenticated signal, never the advisory reputation.

## §8 VERIFY board result — RECORDED 2026-06-24 (architect + hacker; pre-build; all folded above)

2-lens board. **architect SOUND-WITH-CHANGES; hacker NEEDS-REVISION (3 MED, no CRITICAL/HIGH).** The high-stakes
attack classes were CONFIRMED-CLOSED by BOTH lenses (a forged/locked stake cannot flip `actionable`/`mayGate`; no
provenance laundering — `stakeOf` keys by `rootOf(signer)`; no cross-receiver leak — reads ME's store; no axis-4
confusion; prototype-safe `rootOf`; immutable). No redesign; the findings hardened the field contract + the test.

- **The vacuity catch (hacker MED-1 — highest-value).** The SHADOW guard "locked stake + strong topology →
  `actionable:false`" passes VACUOUSLY: `actionable` is a hard-false literal that never reads the anchor, so it would
  pass even against a `funded_root:null` build. FOLDED §3: the guard FIRST asserts the precondition is live
  (`funded_root.status==='locked'` + `meets_topological`) THEN the non-flip — making it falsifiable.
- **Field name (arch HIGH-1).** Bare `stake` under-signals "coarse funded-ROOT, not the per-path voucher stake the
  §5.1 bar names." FOLDED: renamed `funded_root` (S3's `meets_policy` precedent); the `:82-85` accretion states the
  coarse-vs-per-path distinction in-code.
- **The `null` tri-state (arch MED-2 / hacker MED-3).** `null` (axis unavailable / broken anchor) vs `{status:'none'}`
  (wired, unfunded) collapse dangerously; a gating consumer could read `null` as allow. FOLDED §2/§3/§5: pinned as
  distinct + the helper/forward-contract carry "`null` = UNAVAILABLE → a gater MUST fail-CLOSED, never funded/allow".
- **`nowMs`-controlled stale-`locked` (hacker MED-2).** A non-finite/omitted/string clock reports an EXPIRED stake as
  `locked`. FOLDED §3/§5: a finite-clock test proves `convert` forwards the real clock; the residual states a gater
  must pass a finite `nowMs`. `convert` stays deterministic (no `Date.now()` injection).
- **Isolation wording (arch MED-1).** "structural" → "TEST-ENFORCED isolation"; the deepEqual covers `independence` +
  `meets_topological` + `disjoint_paths`; the hostile-anchor-quarantine test (hacker LOW-1) proves a lying anchor is
  contained to the advisory field.
- **KISS/DRY + open-enum (arch LOW-1/LOW-2).** FOLDED §2: call `stakeOf` UNCONDITIONALLY (drop the `root==null`
  short-circuit — `rootOf`→null→`stakeOf`→`none`); comment that the `status` enum is OPEN (S4 adds `'slashed'`; never
  switch on a closed set).
- **CONFIRMED-SOUND (no change):** the BEHAVIORAL SHADOW guard (DI sidesteps the import walks, so the import walls stay
  green vacuously — the behavioral assertion is the right invariant); provenance reuse is clean (no new key path);
  receiver-relative is structural; `meCtx` is the right injection point (`convert` has zero `src/` importers);
  fail-soft-on-bad-anchor is correct FOR A SHADOW readout (vs S3's fail-fast — justified by the per-call optionality);
  S5-before-S4 stands alone (passes the whole `{status,lockedUntil}` through; a future `'slashed'` flows unchanged).

## §9 VALIDATE result — RECORDED 2026-06-24 (3-lens; post-build; all folded above)

3-lens tier (trust-path-sensitive diff). **hacker CHANGES-REQUESTED → CLEAN after the fold; honesty CALIBRATED /
NO-OVERCLAIM (grade A-); code-reviewer APPROVE-WITH-NITS.** Suite green after folds: 346/0, eslint clean (orchestrator-
run firsthand via `node test/run.js`). The trust spine was CONFIRMED-CLEAN by the hacker's LIVE probes (every
gate-flip / forge-funded / cross-receiver / clock / prototype vector refuted on the BUILT code); honesty graded all 6
trust-law axes NO-OVERCLAIM.

- **CONVERGENT MED (hacker F1 + code-reviewer MED) — a THROWING `stakeOf` DoS-ed the whole `convert` readout** (incl.
  the gate-relevant fields), contradicting the documented advisory-only quarantine. Both lenses caught it live on the
  BUILT code (Rule 2a). MED (convert has zero importers; the anchor is a trusted DI seam today) but a future S6
  network backend WILL throw. FOLDED §2 impl: `agentStakeAxis` wraps the call `try/catch -> null` (axis UNAVAILABLE,
  never a convert-wide throw) + a test asserts a throwing anchor yields `funded_root:null` with the gate fields intact.
- **hacker F2 (MINOR) — the anchor's return passed through verbatim** (a non-object `'allow'`/`true`/thenable could
  land in `funded_root`). FOLDED §2 impl: the return is shape-normalized — only a plain object with a string `status`
  is the axis, else `null`; a test covers a non-object return.
- **code-reviewer LOW (YAGNI) — `agentStakeAxis` was exported with no consumer.** FOLDED: removed from
  `module.exports` (the behavior is fully covered through `convert`).
- **code-reviewer NIT — the receiver-relative test's "second receiver" reused the same DID.** FOLDED: a distinct
  `receiverId` (`did:key:zOther`) makes the two-receivers framing literal.
- **honesty L-4 (LOW) — the in-code "SCARCITY/COST signal" rounded up vs PRESENCE.** FOLDED: softened to "scarcity/
  cost-AXIS signal reflecting stake PRESENCE (a real forfeitable cost only once S6 deploys)."
- **hacker F3 / honesty M-2 (forward-residual, no code change) — `funded_root:null`-as-allow** is documented as a
  future-gater obligation (fail-closed), not an S5 guarantee; S5 proves the `null` vs `{status:'none'}` distinction is
  OBSERVABLE, it does not ENFORCE fail-closed (nothing in S5 reads the field). Correctly carried in §5; honesty
  confirmed it is not dressed up as implemented.
- **honesty H-1 (note) — the 345/0 suite count** was orchestrator-attested; the honesty lens (no Bash) couldn't re-run
  it. Recorded honestly: the suite is orchestrator-run firsthand (now 346/0 after the fold), SHADOW-level evidence
  (in-process self-consistency), NOT a world-anchored hardening signal (OQ-NS-6).
- **CONFIRMED (no change):** the SHADOW guard is non-vacuous (asserts the precondition LIVE before the non-flip);
  axis-1!=axis-4 isolation is test-enforced (deepEqual `independence`+`meets_topological`+`disjoint_paths` with/without
  the axis; the hostile-anchor quarantine proves a lying anchor moves only the advisory field); provenance reuse is
  clean (keyed by `rootOf(signer)`, forged/unsigned dropped — no new key path, no static `stake-anchor` import — the
  import walls stay green); receiver-relative is structural; backward-compat holds (the existing 20 CONVERT tests
  green); `actionable` stays hard-false; nothing inches toward a Sybil/U1/hardening WIN.
