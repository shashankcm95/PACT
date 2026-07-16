# Plan 61 — F6 Wave-2-raw-resolution: anchor `direct`'s positive rEv leg (keep the resolution set RAW)

**Status:** HALTED AT VERIFY → `direct` reclassified OPEN (docs-only outcome; NO code change). See `## Disposition`.
The "6/9 → 7/9" goal below was the ORIGINAL premise; the VERIFY board proved `direct` is NOT anchorable, so #83
Part-2 stays 6/9. (SHADOW; plan accretes in place per the plans/ living-doc convention.)
**Epic:** #96 fail-closed arming cluster · **Item:** #83 Part-2 — `direct` was thought "the last mechanically-anchorable fold"; the VERIFY board disproved that
**Governing ADR:** `docs/ADRs/0003-fold-routing-monotonic-anchoring-invariant.md` — the `direct` map row (**OPEN** as of 2026-07-16) + Decision 1 (dual-role) + Decision 3 (recs-seam)

> **READ ORDER (this plan halted at VERIFY):** the authoritative outcome is **`## Disposition`** (B — `direct`
> reclassified OPEN, no code). Everything from `## Context` through `## Runtime probes` below is the **PROPOSED
> design that was never built** — kept verbatim as the record + the re-derivation sketch for whoever pursues the
> alpha-blend re-derivation (path A) later. It does NOT describe shipped code.

## Context / crux

`direct(meCtx, agentDid, configHash, now, recs)` folds a POSITIVE leg (`rEv` = the agent's uncontested, deduped,
decay-weighted CLAIM frames) and a NEGATIVE leg (`sEv` = rootOf-keyed CONTEST evidence + the `>=2`-earned-human
crater) into `opinion(rEv, sEv)`. The agent's own CLAIM set (`agentClaimIds`) is **DUAL-ROLE**:
1. **positive evidence** — uncontested claims add to `rEv`; and
2. **the resolution set** — a CONTEST only counts toward `sEv` when `agentClaimIds.has(target_claim_id)` (F3: it
   must reference a REAL claim of the agent).

Anchoring the CLAIM set (dropping un-anchored agent claims) would drop them from BOTH roles: `rEv` falls (narrows,
good) BUT they also leave `agentClaimIds`, so a CONTEST against a dropped claim becomes INVALID → `sEv` falls →
**trust RISES** (NS-9 inversion). This is why `direct` is Wave-2-raw-resolution, not a wholesale route.

## Design — anchor `rEv` only; keep the resolution machinery RAW (ADR-0003 `direct` row)

- `all = recs || verifiedRecords(reg, storeOpts)` — the RAW/resolution set. `agentClaims` (deduped by
  idempotency_key), `agentClaimIds`, `validContests`, `contestedClaimIds`, `perHumanDecay`, `corroboratingHumans`,
  the crater, and `sEv` ALL read `all` (unchanged — the resolution stays raw so a dropped un-anchored CLAIM never
  un-resolves a CONTEST).
- **Positive-leg anchoring at the internal fallback (Decision 3):**
  `const posSet = recs || authenticatedAnchoredRecordsFrom(all, reg, meCtx);` — anchored ONLY when a caller does
  NOT supply `recs`. `const posIds = new Set(posSet.map(r => r.record_id));`
- **`rEv` gate:** `for (const c of agentClaims) if (!contestedClaimIds.has(c.record_id) && posIds.has(c.record_id))
  rEv += decayWeight(c, now);` — an un-anchored agent CLAIM stays in `agentClaimIds` (resolution) but is absent
  from `posIds` → it no longer adds to `rEv`. Positive narrows; negative unchanged.

**The recs-seam (condition 3), verified against the live callers:**
- `model.js:25` calls `direct(meCtx, agentDid, configHash, now)` — **standalone** (no `recs`) → `posSet =
  …From(all)` → armed anchors `rEv`. **Probe: confirmed this session.**
- `consensus.js:82` calls `direct(meCtx, …, now, recs)` with RAW `recs` → `posSet = recs` (raw) → `rEv` NOT
  anchored → the weighted MEAN over nested `direct()` weights is NOT anchored through the back door (consensus
  stays OPEN/inversion-free). **Probe: confirmed this session.**

**No co-arming (A9) class:** `direct` has NO entanglement-demote (no `independenceLabel`/`entanglementDetector`
read) — the anchoring∘demote non-commute of Wave-2-CLEAN does not exist here. (Assert non-vacuously.)

**DISARMED byte-identical:** disarmed, `authenticatedAnchoredRecordsFrom(all, reg, meCtx)` returns the input `all`
by REFERENCE → `posIds` ⊇ every agent claim → `rEv` counts all uncontested claims → identical to pre-diff. SHADOW.

## Three ADR conditions — satisfied

1. **External positive evidence at leg granularity** — only the `rEv` ACCUMULATOR is anchored (via `posIds`
   membership); the subject's CLAIM set stays in `agentClaimIds` as the raw resolution set (condition-1-ineligible
   role preserved).
2. **Monotone aggregation** — `opinion(rEv, sEv)` expectation is increasing in `rEv`; we only shrink `rEv`. No mean.
3. **No co-consumed anchored set / fallback-only** — `posSet` anchoring is at the internal `recs || …From` fallback,
   dead when `recs` is supplied (consensus/wcons), so the anchored set is never co-consumed by the mean.

## Adversarial shapes — enumerated FIRST (inject→RED; hand to the hacker board)

| # | Shape | Expected | Failure mode if wrong |
|---|---|---|---|
| D1 | un-anchored agent CLAIM (standalone armed) | `rEv` drops; claim stays in `agentClaimIds` | — |
| D2 | un-anchored agent CLAIM **with a CONTEST against it** (standalone armed) | `sEv` UNCHANGED (resolution raw) → no inversion; `E_armed <= E_disarmed` | resolution anchored → CONTEST invalid → `sEv`↓ → **E↑** |
| D3 | crater `>=2` boundary: 2 earned contesters (standalone armed) | crater holds (raw) → `sEv` unchanged | crater root-count anchored → 2→1 → lose 3x |
| D4 | **recs-seam:** `wcons`/`consensus` armed vs disarmed | byte-identical (its `direct(recs)` stays raw) | back-door anchoring of the mean → invert |
| D5 | standalone `direct` armed narrows (the RED driver) | `rEv_armed < rEv_disarmed` when the agent is un-anchored | current impl doesn't anchor → armed==disarmed |
| D6 | DISARMED byte-identity | standalone `direct` disarmed == pre-diff (`posSet === all` ref) | any divergence = not SHADOW-safe |
| D7 | proto-pollution / sibling sweep on `posSet`/`posIds` | array-only use; no bake-in | write-site pollution |
| D8 | co-arming absence | `direct` reads no `entanglementDetector` (structural) | a future demote leg would need re-audit |

## Proposed files (build HALTED at VERIFY — NONE of these were made; see `## Disposition`)

- `v0/src/trust/direct.js` — import `authenticatedAnchoredRecordsFrom`; add `posSet`/`posIds`; gate the `rEv` loop.
- `v0/test/integration/authenticated-read.test.js` — importer-guard EXACT-SET += `trust/direct.js`.
- `v0/src/trust/authenticated-read.js` — scope comment: `direct` now routed (Wave-2-raw-resolution, rEv-leg only).
- `docs/ADRs/0003-*.md` — `direct` map row → BUILT; Deferred section updated.
- `v0/test/integration/f6-wave2-direct.test.js` — NEW: D1–D8 witnesses (RED-first).
- `v0/test/integration/f6-wave1-anchoring.test.js` — **T3 repurpose (recon-completeness finding).** T3
  ("mixed folds ignore regProvenance / armed-byte-identical") is a Wave-1 ISOLATION witness now OBSOLETE: Wave-2
  routed all three mixed folds. Its `direct` assertion (line 257, `direct ignores regProvenance`) WILL BREAK — the
  fixture's un-anchored `zAgent` has an uncontested CLAIM that my change narrows out of `rEv`. Update honestly:
  `direct` now NARROWS under arming (assert `direct(armed).r < direct(disarmed).r`); `creator-standing`/
  `premise-score` stay deepEqual in THIS fixture only because their CONFIRM r-leg is anchored (`zK` survives) + the
  s-leg is raw (reframe the misleading "ignores regProvenance" message, don't leave a false premise).
- `plans/61-*.md` — this file.

## Runtime probes (verified this session)

- `direct` callers: `model.js:25` (standalone) + `consensus.js:82` (passes recs). `grep -rn '\bdirect(' v0/src`.
- `direct` has no entanglement-demote: no `independenceLabel`/`entanglementDetector` in `direct.js`. **Probe: grep.**
- `authenticatedAnchoredRecordsFrom(verified, registry, armCtx)` exists (merged #123). **Probe: confirmed.**

## VERIFY board (2026-07-16) — architect + hacker BOTH NEEDS-REVISION → a trust()-level inversion the plan + ADR missed

**Both lenses independently found the SAME HIGH (matching concrete reproducers): anchoring `direct` inverts NS-9 at
the PUBLIC `trust()` surface, not at the `direct` fold.** The fold-level proof holds (`E(DIRECT)_armed <=
E(DIRECT)_disarmed` — the raw-resolution split is faithful, no Decision-1 inversion, recs-seam correct, no A9
class). BUT NS-9 is defined over the SUBJECT'S TRUST = `model.js trust()`, and:

- `model.js:25` calls `direct` STANDALONE → arming anchors `rEv`.
- `model.js:26` `alpha = alpha(d.r + d.s)` — the blend weight DEPENDS on the anchored `rEv`.
- `model.js:31` `trust = alpha·directE + (1-alpha)·consE` — a WEIGHTED MEAN (the Decision-2b hazard).
- Arming lowers `rEv` → lowers `directE` AND `alpha` → shifts weight onto the UNCHANGED `consE`. When
  `consE > directE`, `trust()` RISES. Reproducer (W=2,base=0.5,SAT=5): rEv_disarmed=3, sEv=0, un-anchored agent,
  wcons=0.95 → disarmed `trust=alpha(3)·0.8 + (1-alpha(3))·0.95 = 0.894`; armed `rEv=0` → `alpha=0` →
  `trust = 0·0.5 + 1·0.95 = 0.95 > 0.894`. **NS-9 VIOLATED at trust() (+0.056).**

`model.js` standalone is the SOLE armed path (consensus passes raw recs), so EVERY armed `direct` inverts — not an
edge case. This is the mean-hazard the ADR flags for consensus, reached through model.js's SECOND mean whose weight
moves with `rEv`. **The ADR-0003 `direct` row ("Wave-2-raw-resolution, buildable") analyzed the fold in isolation
and MISSED the downstream `model.js` consumer.** `direct` is inseparable from the alpha-blend mean → same
un-anchorable class as consensus.

**Both lenses give the SAME two paths (the plan as scoped cannot land):**
- **(A) Re-derive the alpha-blend (model.js change):** base `alpha` on the RAW interaction count (`rEv_raw + sEv`),
  use the anchored `rEv` ONLY for `directE`. Then `trust_armed = alpha_raw·directE_armed + (1-alpha_raw)·consE <=
  alpha_raw·directE_disarmed + … = trust_disarmed` (monotone). Semantically defensible ("alpha = how much has the
  agent interacted" — the agent DID interact; anchoring is about record-provenance, not interaction count). But it
  is a TRUST-MATH change to the core model, out of this plan's mechanical-fold-routing scope — arguably its own ADR.
- **(B) Reclassify `direct` as OPEN** (co-deferred with consensus/stake-anchor) until the alpha-blend is re-derived.
  #83 Part-2 stays 6/9; the OPEN bucket grows to 3 folds. Correct the ADR-0003 `direct` disposition. Minimal, honest.

Lower-severity (fold both if we proceed with A): **[LOW] snapshot `reg` once** before `all` (MED-1 one-judge-source
— reorder `const reg = meCtx.registry` first). **[LOW] dedup-representative anchoring** over-narrows safely (pin a
test so a future "is-any-dup-anchored" flip trips RED). **[NIT] confirmed** direct has no entanglement-demote (A9
absent, non-vacuous) and the internal-`posSet` derivation shape (vs cross-verify's 5th-arg) is correct/KISS.

**Meta-lesson (self-improve, ~14th of the graduating signal, NEW flavor): a fold's monotonicity is
necessary-but-NOT-sufficient for NS-9 — verify at the SUBJECT'S TRUST granularity (the public consumer's
aggregation), not just the fold. Generalizes A9 (interaction of narrowing ops) to "trace the anchored quantity into
every DOWNSTREAM weight/mean."** The VERIFY board caught this BEFORE any code — exactly why we verify designs first.

## Disposition — B: reclassify `direct` as OPEN (USER-chosen 2026-07-16)

The USER chose **path B**: `direct` is reclassified OPEN (co-deferred with `consensus`/`stake-anchor`) — NO code
change, no `direct.js` anchoring (it would ship a `trust()`-level inversion). This became a **docs-only** change:

- **`docs/ADRs/0003-*.md`** corrected: `direct` map row → OPEN; new **hazard (d) DOWNSTREAM-COMPOSITION** (Decision
  2) + the "check eligibility at the SUBJECT'S-`trust()` granularity" rule; Deferred entry rewritten (the
  alpha-blend re-derivation is the revisit trigger); Validation 2026-07-16 note. Wave-2-CLEAN marked BUILT (#123).
- **This plan** stands as the record of the finding + the re-derivation sketch (path A: base `alpha` on the RAW
  `rEv_raw + sEv`, anchored `rEv` for `directE` only) for whoever pursues the trust-math re-derivation later.

**Outcome:** `#83` Part-2 stays **6/9** (the mechanically-safe fold-routing is complete). The OPEN bucket is now 3
folds (`direct` + `consensus` + `stake-anchor`), ALL requiring trust-math re-derivations. No `direct.js`,
`model.js`, `f6-wave1-anchoring.test.js`, or importer-guard change — the design never reached the build.

**NOT done (correctly):** the `direct.js`/`f6-wave2-direct.test.js`/importer-guard edits sketched in "Files
touched" above were NEVER made — the VERIFY board halted the build before code. The T3-repurpose is moot (direct is
not anchored, so T3's `direct ignores regProvenance` stays TRUE).

## VALIDATE result

**N/A — no code/build diff was produced.** The VERIFY board halted the build (path B chosen); there is nothing to
validate. The finding was validated at VERIFY (both lenses, matching reproducers) and recorded in ADR-0003.
