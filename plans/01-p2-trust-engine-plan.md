---
lifecycle: persistent
phase: P2 — the trust engine (P2a) — the first novel tier after the v0 thesis core
created: 2026-06-21
status: BUILT (2026-06-21) — trust engine green (18 trust tests; 83 total); VERIFY + post-build VALIDATE both folded
spec: PACT-spec-v1.1.md §5 (trust) + §4.5 (independence/WEAK) + §1.4 (config-binding)
builds-on: v0 (committed 04f27cb) — P0-minimal + P1 (the ATMS)
---

# PACT P2 — the trust engine (build plan)

> **What follows v0.** v0 proved the thesis on the grounding-and-identity axis (the ATMS). P2 is the
> next **novel** tier — the seed-free DIRECT/CONSENSUS trust engine (PACT's real EigenTrust
> improvement) and the **first consumer of the §4.5 independence WEAK flag** (the v1.1 rev's spine).
> It is `[BUILD]`, not `[ADOPT]` — exactly where the research says to spend the build.

## 1. Goal (spec §5 + §4.5)

A **receiver-local, first-person** trust engine in which:
- **DIRECT** trust is earned from logged *behavior* (caught-vs-uncaught, NOT truth), private to the
  receiver, scoped to `(persona, config_hash)`, decaying, asymmetric-crater on defection.
- **CONSENSUS** is advisory only — `wcons` weighted **through the receiver's own DIRECT graph**, so a
  Sybil flood inflates raw count but contributes **~0** (Personalized Hitting Time; theorem-backed).
- **CONVERT** (consensus → actionable) demands the **unforgeable** (DISJOINT_PATHS + probation + stake +
  behavioral demo), never the cheap (more vouches / a central checker), and ships **topological-only with
  a LIVE, visible WEAK flag** — its EXIT explicitly states it does **NOT** contain U2.
- Every weight stays **SHADOW/advisory** (gates no high-stakes action) — INV-16: a WEAK signal may
  INFORM but never GATE. The engine is built; nothing acts on it yet (same posture as v0).

## 2. Scope — the discipline that keeps P2 honest

| In P2 | Deferred |
|---|---|
| DIRECT / CONSENSUS / `wcons` / `TRUST` blend (Subjective Logic) | the U2 substrate-diversity *estimator* → P5 |
| CONVERT (topological DISJOINT_PATHS + probation + stake + demo) | any gate that ACTS on independence (stays SHADOW until P5 + authenticated-minter) |
| the §4.5 independence WEAK flag (LIVE: computed + surfaced + consumer-obligation enforced) | caps enforcement (P4) |
| config-binding (`config_hash` added to the frame; DIRECT scoped to it; decay on change) | REACH / grounding-scoring (P3) |
| never-counts-nodes (INV-13) enforced in `wcons` + CONVERT | the full A2A transport / DID-VC (P0-complete) |
| first-person PRIVATE model + selective signed vouches (research/17) | |

**The load-bearing rule (M1/INV-16):** no gate reads the AND of axes 1-3 (scarcity/topology/stability)
as a substitute for axis 4 (epistemic). The WEAK flag is permanently set until P5. P2's exit must
*demonstrate* the flag is live and that a consumer cannot act on a WEAK record as if it were strong.

## 3. Runtime probes (firsthand, against the committed v0 — what's consumed vs greenfield)

- **v0 PROVIDES the consumption surface** (probed): `record-store.listByReceiver` (the behavioral log),
  `registry.{rootOf,lookupPublicKey,isKnownRoot}` (the trust-graph nodes + per-sender verify keys),
  `falsify` records `contest:{by,strength,counterexample}` on a SUCCESSFUL (`{ok:true}`) authorized
  in-scope falsify (the catchable-defection signal DIRECT rewards, M6), `presence.effectivePresence`
  (ratified, unwired).
- **GREENFIELD (absent in v0, confirmed):** `DIRECT`/`CONSENSUS`/`wcons`/`trust`, `WEAK`/`independence`
  (P2 is the first consumer), `config_hash`.
- **TWO GAPS the VERIFY board surfaced (fold before build):**
  1. **The store is SIGNATURE-DECOUPLED (INV-14 gap — the root finding).** `record-store.loadRecordFile`
     verifies the content-address (INTEGRITY) but NEVER calls `verifyRecordSig`; sig-verify lives only in
     `frame.receiveFrame`, and `appendRecord` does not require a valid sig. So `listByReceiver` returns
     records an attacker can plant locally (the store "is not a sandbox"). DIRECT/wcons/CONVERT MUST read
     through an authenticated-minter gate (§4 `trust/read-gate.js`) or they weight FORGED history
     (integrity != provenance — the #273 family).
  2. **No TIMESTAMP for decay.** v0's record has no `t`/`created_at`; exponential decay is uncomputable
     from the v0 surface without one (an implementer would reach for `Date.now()` → eval-order-dependent
     scores). → Decision #6.
- **config_hash + (decided) `t` are frame-schema additions:** optional fields (the lenient validator
  accepts them; the content-address includes them). Old frames still validate; they trust at a
  `config_hash=unknown` WEAK never-merged bucket and, absent `t`, decay only within-session by `seq`.

## 4. Modules (greenfield; under `v0/src/trust/` + `v0/src/independence/`)

| Module | Spec | What |
|---|---|---|
| `trust/read-gate.js` | §7.1, INV-14 | **the authenticated-minter READ gate (the root fix).** Every record DIRECT/wcons/CONVERT weights MUST first pass `verifyRecordSig` against the per-sender registry key (`registry.lookupPublicKey`); an unsigned / bad-sig / unregistered-sender record contributes **0**. Closes the store-is-decoupled gap. |
| `trust/params.js` | — | the single home for the named bounds — `DECAY_HALF_LIFE`, `CRATER_MULTIPLIER`, `DISJOINT_PATHS_K` — depending on nothing (clean DAG). NOT in `presence.js` (that owns cap policy; SRP). |
| `trust/opinion.js` | §5 | the Subjective Logic opinion `(belief, disbelief, uncertainty)`; discount (transitivity) + fusion (after path-independence); uncertainty = the novice/cold-start signal. A zero-DIRECT-graph case returns the novice prior (uncertainty→1), NEVER NaN. |
| `trust/direct.js` | §5, §1.4 | `DIRECT[me, agent@config_hash]` **DERIVED-ON-READ** (Decision #5) as a pure fold over the sig-verified log (caught-vs-uncaught = a successful AUTHENTICATED CONTEST record — see data-flow below); decay (needs `t`, Decision #6); asymmetric crater requiring **disjoint corroboration** for a high-magnitude drop (a single contest INFORMS, doesn't crater — anti-grief, L8); config-scoped; `evidence_floor` resets per new (persona, config_hash) bucket on a config change. |
| `trust/consensus.js` | §5, INV-13 | `wcons = Σ_v DIRECT[me,v]·vouch(v,agent) / Σ_v DIRECT[me,v]`, where `v` ranges over the receiver's EARNED non-WEAK edges **EXCLUDING self**; **zero denominator (cold-start) ⇒ wcons undefined ⇒ SL blend = novice prior** (never NaN, never a uniform prior). A single cheap probation edge to a Sybil must not launder its cluster — each `v` needs a logged behavioral demo, not one cheap touch. |
| `trust/convert.js` | §5.1, §4.5 | CONVERT: `DISJOINT_PATHS(me,agent) >= k` = **Edmonds-Karp max-flow at unit capacity** on the vouch graph `{nodes:Set, edges:Map<did,Set<did>>}` built from sig-verified VOUCH records — the max-flow VALUE, never a `paths.length` tally (INV-13); + probation + stake + behavioral-demo; carries the WEAK flag; INFORMS, never GATES. |
| `independence/weak-flag.js` | §4.5 | `independence_label` {topological: computed, epistemic: WEAK, config_stability: WEAK-unless-attested}; `mayGate(record, {highStakes}) => !(highStakes && overall === 'WEAK')` — in P2 every record is WEAK, so this is a **permanently-refusing** guard for any high-stakes caller; the CALLER asserts `highStakes`, P2 owns NO threshold (that throne is P3). Forbids reading AND(axes 1-3) as axis 4. Depends ONLY on the v0 lib + the raw vouch graph — NEVER on `trust/` (one-way DAG). |
| `trust/model.js` | §5.2, research/17, INV-2 | the first-person PRIVATE model; the algorithm public, the instance private. Vouches are **RECEIVER-SCOPED**: a vouch is interpretable only relative to a specific receiver's DIRECT graph, so a third party holding the published vouch set cannot aggregate it into a receiver-independent total order (the rank throne, L6). |

**DIRECT data-flow (code-reviewer):** `falsify()` mutates an in-memory ATMS graph, not the store. A
successful authorized FALSIFY is persisted by the frame layer as a signed `CONTEST` record in the
receiver's store; `trust/direct.js` reads it via `listByReceiver` (through `read-gate.js`) — the catch
signal is an AUTHENTICATED store record, never a raw in-memory event. **Counting unit:** DIRECT counts
DEDUPED records (by `idempotency_key`), never raw payload occurrences (replay-safe). **DAG:**
`trust/ → independence/ → v0 lib`; never the reverse.

## 5. Genuine design DECISIONS to ratify (propose defaults; user overrides)

1. **`config_hash` frame field** — add `config_hash` (optional) to the frame; DIRECT keyed on
   `(persona, config_hash)`. It is a **self-asserted, permanently-WEAK signal on axis 3 (config-stability)** —
   NOT a trust-isolation boundary (nothing attests it matches the running box; attestation is P5, so a
   config-swapper who replays an old `config_hash` only carries a WEAK signal, never inherits trust). A
   frame without it trusts at an `unknown` bucket that is its OWN WEAK, never-merged bucket (so omitting
   the field cannot merge victims into a trusted default). *(Forward-compatible; v0 frames keep validating.)*
2. **Decay model** — exponential half-life (`trust/params.DECAY_HALF_LIFE`) + a one-shot asymmetric crater
   (`CRATER_MULTIPLIER`) on a caught, **AUTHENTICATED, disjoint-corroborated** defection (a single contest
   informs, never craters — anti-grief).
3. **`k = 2`** for CONVERT DISJOINT_PATHS (`trust/params.DISJOINT_PATHS_K`); the max-flow VALUE,
   topological-WEAK in P2 so it INFORMS, does not GATE.
4. **Subjective Logic opinion triple** (belief/disbelief/uncertainty) over a scalar — the spec's choice;
   the uncertainty term is the novice/cold-start signal and the principled home for the α-blend + fusion.
5. **[NEW] DIRECT persistence model** — proposed: **DERIVED-ON-READ** — `DIRECT[me,agent]` is a pure fold
   over the sig-verified behavioral log, with **no separate mutable trust-edge store**. Keeps INV-18
   structurally true (there is no edge store to auto-mint into) and dodges the integrity≠provenance trap.
   *(If perf later forces a cache, it is a derived view of the log, never the source of truth.)*
6. **[NEW] Timestamp source for decay** — proposed: add `t` (created_at, epoch ms) as an optional frame
   field (in the content-address, so authenticated); cross-session decay uses `t`; a frame lacking `t`
   decays only within-session by `seq`. Closes the "implementer reaches for `Date.now()`" trap.

## 6. Exit criteria (the testable target)

- **INV-14 read gate:** a store-planted record with NO valid signature (the store is decoupled from
  sig-verify) contributes **0** to DIRECT / wcons / CONVERT. *(the root fix — verified against forged input.)*
- **Sybil flood contributes ~0:** a receiver with a NON-EMPTY earned DIRECT graph over legitimate peers;
  N minted Sybils (zero earned edges) vouch for a target → raw consensus inflates, `wcons` moves ~0.
  The cold-start case (empty DIRECT graph, zero denominator) yields the novice prior, NOT NaN.
- **registration grants ZERO trust:** N registered-but-never-interacted Sybils move `TRUST(me, target)` by 0
  (no path treats "is registered / known root" as a trust input — INV-18).
- **CONVERT demands the unforgeable:** "more vouches" / "more identities" can NEVER satisfy CONVERT; only
  earned trust + structural max-flow disjoint paths + stake + a logged behavioral demo do.
- **The WEAK flag is LIVE + consumer-obligation enforced:** every independence_label is WEAK; `mayGate`
  refuses a WEAK record for any high-stakes caller; AND(axes 1-3) is NOT accepted as axis 4. *(the v1.1 spine.)*
- **no rank throne:** an observer holding ALL signed vouches cannot produce a total order that two distinct
  receivers would agree on (vouches are receiver-scoped; INV-2/L6).
- **never-counts-nodes:** no boundary tallies a count; DISJOINT_PATHS is a max-flow value, not `paths.length`.
- **config-binding:** a config-swap (same key, replayed old `config_hash`) does NOT inherit trust beyond a
  WEAK signal; a config change decays/re-evaluates DIRECT.
- **anti-grief:** a single forged/griefed CONTEST does NOT crater (a high-magnitude drop needs disjoint
  corroboration); REPAIR is not more expensive than the catch that triggered it (L8).
- **Everything stays SHADOW:** no weight gates any action; the EXIT names that P2 does NOT contain U2.

## 7. Landmine checklist (spec PART 2)

- [ ] **INV-14** every weighted record passes `verifyRecordSig` (authenticated-minter read); store-presence
      is never provenance (the root fix — integrity ≠ provenance).
- [ ] **L1** reach/influence gated by VERIFICATION never ENGAGEMENT (no engagement signal feeds trust).
- [ ] **L2/L3** no guard satisfiable by "more vouches / more identities" (CONVERT demands the unforgeable).
- [ ] **L4** authenticated ≠ independent — the WEAK flag is live; never AND(axes 1-3) as axis 4.
- [ ] **L5** the catch signal (a CONTEST feeding a crater) is AUTHENTICATED + disjoint-corroborated; a forged
      or single griefed catch does not crater (anti-grief, L8).
- [ ] **INV-13** never-counts-nodes (max-flow disjointness, not a `paths.length` tally).
- [ ] **INV-16** a WEAK record may inform, never gate a high-stakes action (`mayGate` refuses).
- [ ] **INV-2** trust is receiver-local + first-person + PRIVATE; vouches receiver-scoped (no aggregable
      global sortable rank — the throne, L6).
- [ ] **INV-6** DIRECT outweighs CONSENSUS; CONSENSUS advisory.
- [ ] **INV-18** registration grants ZERO trust; the registry never auto-mints a DIRECT edge (else Sybil-~0 collapses).

## 8. VERIFY board (before build) + the per-wave cadence

Spawn the 3-lens board against this plan: **architect** (is the SL representation right; is the
topological-only + WEAK + SHADOW discipline coherent; does config_hash-as-frame-field break v0 forward-compat),
**code-reviewer** (the decay/crater math; the wcons graph-weighting correctness; never-counts enforcement),
**hacker** (can a Sybil flood move wcons; can CONVERT be satisfied by the cheap thing; can a consumer act on
a WEAK record; can the private model leak into a global rank). Fold, ratify the §5 decisions, then BUILD
(TDD) → post-build VALIDATE (the hacker re-probes the BUILT trust engine — Rule 2a).

## 9. VERIFY board result (pre-build, folded 2026-06-21)

3-lens board (foreground) over this plan + the spec + the committed v0. **architect APPROVE_WITH_CHANGES ·
code-reviewer APPROVE_WITH_CHANGES (2 BLOCKER) · hacker NEEDS_REVISION (3 BLOCKER).** Strong convergence on
ONE root cause: the plan specified Sybil-immune **math** but was silent on the **provenance of its inputs**.
Premise-probed + confirmed against v0: the store is sig-decoupled (`loadRecordFile` verifies the
content-address, never `verifyRecordSig`). **All folded above:**

| # | Cluster (lenses) | Fold |
|---|---|---|
| 1 | **INV-14 read gate** — DIRECT reads a sig-unverified, open-writable store (hacker BLOCKER, root cause) | new `trust/read-gate.js`: every weighted record passes `verifyRecordSig`/per-sender key or contributes 0; §6 exit test on a planted unsigned record |
| 2 | **DIRECT persistence** — a hidden 5th decision (architect MAJOR) | Decision #5: DERIVED-ON-READ over the verified log (no edge store to auto-mint into — keeps INV-18 structural) |
| 3 | **wcons zero-denominator + seed/self-vouch** (code-reviewer BLOCKER, hacker BLOCKER) | §4: cold-start ⇒ novice prior (never NaN); exclude self; each `v` needs a logged demo (one cheap edge can't launder a cluster) |
| 4 | **decay has no timestamp in v0** (code-reviewer BLOCKER) | Decision #6: add `t` (authenticated frame field); within-session `seq` fallback |
| 5 | **DISJOINT_PATHS under-specified → tally risk** (code-reviewer MAJOR) | §4: Edmonds-Karp max-flow at unit capacity = the value, never `paths.length` |
| 6 | **`mayGate` open boundary** (architect + code-reviewer MAJOR) | §4: `mayGate(record,{highStakes})` permanently-refuses WEAK+highStakes; caller asserts stakes; P2 owns no threshold (P3's throne) |
| 7 | **config_hash self-asserted** (hacker MAJOR) | Decision #1: WEAK axis-3 signal, not a trust boundary; `unknown` is a WEAK never-merged bucket |
| 8 | **registration = trust input?** (hacker MAJOR) | §6 exit: N registered-never-interacted Sybils move TRUST by 0 (INV-18) |
| 9 | **vouch aggregation → rank throne** (hacker BLOCKER) | §4/§6: vouches receiver-scoped; no cross-receiver total order from the published set (INV-2/L6) |
| 10 | **catch forgeable + crater griefing** (hacker MAJOR) | §4/§5: catch must be authenticated + disjoint-corroborated; single contest informs, doesn't crater; symmetric REPAIR (L8) |
| MINORs | probe shape, constants home (`trust/params.js`), DAG direction, strict-schema parity, counting-unit (deduped) | all folded inline |

**Net:** the plan now reads ONLY authenticated, earned inputs, derived-on-read, with registration granting
zero weight and everything SHADOW. **6 design decisions await ratification (§5).** After ratify → BUILD
(TDD) → post-build VALIDATE.

## 10. BUILT + post-build VALIDATE result (2026-06-21)

**BUILT** — `v0/src/trust/{read-gate,opinion,direct,consensus,convert,model,params}.js` +
`v0/src/independence/weak-flag.js`. The 6 decisions shipped at their ratified defaults. **18 trust tests
green; 83 total** (no regression).

**Post-build VALIDATE board** (3 foreground lenses on the BUILT engine; hacker built live probes — Rule 2a):
**code-reviewer + architect APPROVE_WITH_CHANGES; hacker NEEDS_REVISION.** Strong convergence on ONE
root class — *the engine counted cheap-to-mint personas (`src_persona_did`) where the spec demands the
scarce human (`rootOf`).* The crypto core (read-gate, vertex-disjoint max-flow, config buckets,
cold-start) was probed clean. **All folded:**

| # | Finding (lens) | Fold |
|---|---|---|
| F1 | **wcons laundering** — a Sybil with ONE cheap claim carried belief; 200 swung TRUST 0.2→0.99 (hacker, live-probed) | `consensus.js`: group vouchers by `rootOf` (human, not persona); weight = α(evidence)·belief (probation floor) → persona-mint defeated; test added |
| F2 | **crater-grief** — `distinctContesters` keyed on DID, so 1 human minting 2 DIDs craters (all 3 lenses) | `direct.js`: crater keyed by `rootOf`; ≥2 distinct EARNED-STANDING humans required; tests added |
| F3 | **bogus CONTEST** — a contest with no/fake `target_claim_id` still cratered (all 3 lenses) | `direct.js`: only contests referencing a REAL claim of the agent count; test added |
| F4 | **decay asymmetry** — `s` never decayed (defection permanent); no REPAIR-readback (architect) | `direct.js`: `s` decays too (crater is the asymmetry, not permanence); REPAIR-readback noted for P3 |
| F5 | **forged label unlocks mayGate** (hacker MINOR) | `weak-flag.js`: `mayGate` is AUTHORITATIVE (ignores the label; epistemic always WEAK → high-stakes always refused); test added |
| MINORs | INV-14 wrong-key test gap; discount() dead code; O(N) re-scan; dedup unit; config-agnostic voucher weight; convert per-path-bar P3 note | all folded (wrong-key test added; discount removed; recs passed to direct; claims deduped by idempotency_key; rationale comments) |

**HONEST RESIDUAL (U1, marked loud):** keying by `rootOf` defeats persona-MULTIPLICATION; a funded
attacker with N distinct HUMAN roots (sustaining genuine interaction) remains the U1 frontier — the
registry stub does not enforce one-human-one-root. Everything is SHADOW (gates nothing). This is the
spec's contained-not-eliminated posture; closing it is U1 (SBT/Personhood-Credentials, the §9 frontier).

**P2 is DONE (SHADOW).** Next: P3 (grounding/REACH + stakes-threshold throne + the per-path unforgeable
bar that must precede any `actionable`).
