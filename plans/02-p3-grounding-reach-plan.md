---
lifecycle: persistent
phase: P3
status: BUILT + COMMITTED 23249c2 (VERIFY + post-build VALIDATE folded; D8 ratified; 112 tests green; SHADOW)
created: 2026-06-21
revised: 2026-06-21 (3-lens VERIFY §9 + 3-lens post-build VALIDATE §10 folded; D8 = defer both seams to P4, USER-ratified)
supersedes-seams-parked-by: plans/01-p2-trust-engine-plan.md §10
---

# P3 — the grounding engine + REACH (spec §6) `[BUILD + OPEN]`

> **The genuinely PACT-original tier.** Spec §6: *"the premise.creator = human-accountability
> coupling is the ONE thing classical TMS lacks — spend the build here."* P2 built the trust engine
> (§5); P3 builds the grounding engine (§6) beside it + the REACH inversion (§6.3).

## §0 — Scope, the SHADOW invariant, and what P3 is NOT

**Everything P3 produces is SHADOW / descriptive — it gates no action** (north-star OQ-NS-6: an
engineered signal NARROWS; only a world-anchored signal HARDENS). No weight gates a high-stakes action
until (a) the U2 epistemic-independence estimator replaces the permanent WEAK flag (P5) AND (b) an
authenticated minter exists (the integrity≠provenance / #273 family). P3 honors this **structurally**:
every score is a **derived-on-read** fold over the SIG-verified log — there is no mutable score store to
auto-mint into (INV-18 structural, exactly as P2's DIRECT). **No P3 module imports `mayGate` to gate;
the only authoritative gate stays `epistemicIndependence()===WEAK` (fail-closed in `weak-flag.js`,
UNEDITED by P3). `convert.actionable` stays the hard-coded `false` it already is — P3 does not touch
`convert.js`.** (Grep `grounding/` for `mayGate`/`actionable` ⇒ zero, by §6 test.)

**P3 builds (the §6 core only):**
1. `crossVerify(premiseId)` — the leaf primitive: distinct **earned-standing**, **rootOf-keyed**,
   **real-target**, **non-self** human confirmations of a premise; strength = a scalar on [0,1]; carries
   the permanent WEAK label (§6.2).
2. `premiseScore(premiseId)` — SL opinion: r = `crossVerify` survival, s = real-target rootOf-keyed
   contests; CONTESTED is a FLAG (lowers, never erases — §3.5) (§6.1).
3. `creatorStanding(humanUid)` — decaying, asymmetric aggregate of a human's premises' scores;
   reliability AS A SOURCE; **human-keyed via `rootOf`**; returns the full SL opinion (carries the
   uncertainty `u`, the honest novice signal) + `n_premises` (§6.1).
4. `verificationStrength(claimId)` — possibilistic **weakest-link MIN** over the claim's premise DAG to
   the deepest empirical root, on the SAME [0,1] scalar scale; **MIN of empty = 0** (an ungrounded chain
   floors to 0, never a vacuous +Infinity) (§6.2).
5. `reach(claimId, accepts)` — **emergent-descriptive**: the **`rootOf`-keyed union** of independent
   receiver-local accepts; the INV-9 grounding-vs-verification THRESHOLD flag; empty accepts → empty
   envelope regardless of verification (§6.3).

**P3 DEFERS both parked seams to P4** (the VERIFY board's convergent call — see §9):
- The **per-path unforgeable bar** (§5.1) — deferred because (a) its predicates (voucher-stake,
  behavioral-demo) are self-asserted unless provenance-anchored, which pairs with the v-next
  authenticated minter; (b) reporting it per-path needs **witness-path extraction** from the max-flow (a
  real edit to `convert.js` internals — NOT "report-only"); (c) it cannot flip `actionable` until U2
  (P5) regardless. It stays parked with a clearer P4 home; `convert.js` is untouched in P3.
- The **stakes-threshold throne** (§1.5) — deferred because it has **no consumer in a SHADOW P3** (no
  action gates; `epistemicIndependence()` is already fail-closed). Naming a policy object with numeric
  thresholds now is YAGNI config for a gate that cannot fire. It pairs with the per-path bar + U2 in P4.

**P3 is NOT:** flipping `convert.actionable` (P5); the U2 estimator (P5); the authenticated minter
(v-next); the per-path bar / stakes throne (P4, above); per-receiver Merkle proofs (§7, `[ADOPT]`).

## §1 — Dependency DAG (additive; one-way; NO P2 trust-math edits)

```
lib/record + trust/read-gate (INV-14)  ─┐
identity/registry (rootOf)              ─┤
trust/opinion (SL: opinion/expectation) ─┼─> grounding/cross-verify.js  (LEAF primitive)
trust/standing (earned-standing helper, ─┘        │
   extracted from direct.js — behavior-preserving)│
                                                   ├─> grounding/premise-score.js
                                                   │        │
                                                   │        └─> grounding/creator-standing.js
                                                   └─> grounding/verification-strength.js ─> grounding/reach.js
atms/claim (premise DAG walk)  ──> grounding/verification-strength.js
```

`cross-verify` is the lower-level primitive; `premise-score` CONSUMES it (the VERIFY board caught the
reversed arrow — there is no cycle). The one P2 touch is a **behavior-preserving extraction** of the
earned-standing predicate out of `direct.js` into `trust/standing.js` (re-imported by `direct.js`; the
existing 83 tests prove no regression). Everything else is greenfield under `grounding/`.

## §2 — Runtime Probes (verified against the actual repo)

| Claim | Probe | Observed |
|---|---|---|
| Premise carries `creator`(human_uid), `status`, `contest`, `evidence_floor` | `claim.js:19-30` | TRUE |
| `makePremise` does NOT bind `creator` to the signer — accepts any string | `claim.js:22` | **TRUE — `typeof creator==='string'` only** (the BLOCKER-1 hole) |
| `buildFrame` never binds `payload.creator` to `rootOf(src)`/`parent_human_uid` | `frame.js:24-31` | **TRUE — no such check** (BLOCKER-1) |
| No `stake` field exists in schema or any producer | `grep stake v0/src/**` | **TRUE — none** (BLOCKER-4) |
| `config_hash` is self-asserted in-body, no attestation | `frame.js:31`, `weak-flag.js:20` | TRUE — permanently WEAK axis-3 |
| FALSIFY = flag not collapse; authz both legs; escalating evidence_floor | `falsify.js:36-77` | TRUE |
| `rootOf(reg, did)` → human root (the Sybil-keying unit) | `registry.js:43` | TRUE |
| `direct.js` earned-standing predicate (authored ≥1 CLAIM) to reuse | `direct.js:77` | TRUE — extractable |
| SL `opinion(r,s)`/`expectation` to reuse | `opinion.js` (P2) | TRUE |
| `verifiedRecords` SIG-gates the log — but proves INTEGRITY, NOT provenance (same-uid co-forge) | `read-gate.js:1-8` + spec §7.1 | TRUE — integrity-closed, provenance-OPEN |

**No probe FAILs.** The three BLOCKER holes (self-asserted creator/stake, the integrity≠provenance read
gate) are the load-bearing reason the §3 folds re-derive provenance on read.

## §3 — Module design (folds all VERIFY findings)

### 3.0 New signed record types (D4) — premises become first-class, creator-bound-on-read
Add to the schema `type` enum: **`PREMISE`** `{statement, scope, creator}`, **`CONFIRM`**
`{target_premise_id}`, **`ACCEPT`** `{target_claim_id}`. CONTEST gains `payload.target_premise_id`
usage (premise contests). **The creator-binding is enforced on READ, never trusted from the body** (the
store is not a sandbox; write-time checks are bypassable): a PREMISE record counts ONLY when
`rootOf(record.src_persona_did) === record.payload.creator`. A mismatch (slander or cross-uid
self-inflation) contributes **0** — to neither the named creator nor anyone.

### 3.1 `grounding/cross-verify.js`  (§6.2 — the LEAF)
`crossVerify(premiseId, meCtx, now)` → `{ strength, n_confirmers, label, advisory:true }`:
- read `verifiedRecords` (INV-14); find the PREMISE record for `premiseId` whose signer-root === creator
  (else return floor 0 — the premise's own creator claim is unverified).
- **confirmations** = `CONFIRM` records where: target resolves to that real premise (F3-symmetric);
  `rootOf(confirmer) !== premise.creator` (**no self-confirmation** — you cannot vouch for your own
  premise surviving); the confirmer has **earned standing** (reuse `trust/standing`); **keyed by
  `rootOf`** (one human = one confirmation — persona-mult collapses).
- **correlation-discount = rootOf ONLY** (D3). `config_hash` correlation is **evasion-trivial** (an
  attacker picks distinct hashes) and is the permanently-WEAK axis-3 — it is NOT read as independence
  (INV-16: never read axes 1-3 as axis 4); it may carry a courtesy display flag, never reduce strength.
- `strength` = SL `expectation(opinion(rConfirmers, 0))` on [0,1]; `label` = `independenceLabel(...)`
  → **overall WEAK** (k cheap minted HUMAN roots could still fabricate k confirmers — §4.5.1 — so the
  count is topological-WEAK; it INFORMS, never establishes epistemic strength).

### 3.2 `grounding/premise-score.js`  (§6.1)
`premiseScore(premiseId, meCtx, now)` → an SL opinion:
- **r** = `crossVerify(premiseId).strength`-weighted survival (decay-weighted).
- **s** = `CONTEST` records targeting this premise (`target_premise_id`), real-target-required,
  **rootOf-keyed**, decay-weighted; CONTESTED is a FLAG → lowers the score, never erases it (§3.5).
- returns `opinion(r, s)` (carries `b,d,u,a`, `expectation`). SHADOW.

### 3.3 `grounding/creator-standing.js`  (§6.1)
`creatorStanding(humanUid, meCtx, now)` → reliability-as-a-source for a HUMAN:
- aggregate `premiseScore` over every PREMISE record whose **verified** creator === `humanUid`
  (`rootOf(src)===creator`, §3.0).
- **decaying** (reuse `DECAY_HALF_LIFE_MS`); **asymmetric crater** (reuse `CRATER_MULTIPLIER`): a
  premise craters the standing when CONTESTED by **≥2 distinct earned-standing human roots** (scan
  referencing CONTEST records, `contest.by`→`rootOf`; reuse `direct.js`'s exact earned-standing
  predicate — a zero-history Sybil informs but cannot corroborate a crater).
- **the stake IS the standing** (D5): there is NO separate `stake` field (it was self-asserted /
  forgeable). "Skin in the game" = the human's own CreatorStanding craters when their premises fail —
  endogenous reputation-at-risk, nothing to forge.
- returns `{ opinion, standing: expectation(opinion), n_premises, contested, advisory:true }` — carries
  the full opinion (the uncertainty `u` is the honest novice signal; a 1-premise and a 50-premise human
  are NOT collapsed to the same scalar).

### 3.4 `grounding/verification-strength.js`  (§6.2)
`verificationStrength(claimId, graph, meCtx, now)` = **possibilistic weakest-link**:
- walk the claim's premise DAG (`atms/claim` premises[]) to the deepest empirical-root premises.
- strength = **MIN** over those roots' `crossVerify(...).strength` (all on the [0,1] scalar scale).
- **MIN of an empty set = 0** (no empirical root / no confirmations ⇒ floor 0, NEVER vacuous +Infinity —
  the honesty board's INV-9 catastrophe: an ungrounded chain must not read as maximally verified).

### 3.5 `grounding/reach.js`  (§6.3 — emergent-descriptive, INV-17)
`reach(claimId, accepts, claimCtx)`:
- `accepts` = signed `ACCEPT` records (verifiedRecords-gated). REACH envelope = the **`rootOf`-keyed
  union** of accepting humans (N personas of one human = ONE receiver — co-forge cannot inflate it). The
  network computes NO radius and grants nothing (INV-2, INV-17).
- INV-9 THRESHOLD flag: compare `groundingClaim(claim)` (the claim's CLAIMED grounding, [0,1]) vs
  `verificationStrength(claim)` (§3.4); when claimed > actual ⇒ flag `provisional/ungrounded` (never
  "hardened"). This flag is a function of verification ONLY — **never of `envelope.size`** (INV-13).
- **empty `accepts` ⇒ empty envelope** regardless of verification strength (the load-bearing INV-17
  forcing test — reach is the union-after-the-fact of receiver decisions, nothing else).
- returns `{ envelope:[humanRoots], size, threshold_flag, advisory:true }`; `size` is a distinct-HUMAN
  DISPLAY roll-up that NEVER crosses a gate as a count (INV-13/INV-14), loudly annotated U1-open.

### 3.6 `trust/standing.js`  (the one behavior-preserving P2 extraction)
Extract `earnedStandingPersonas(recs)` (the `direct.js:77` predicate) into a shared leaf; `direct.js`
re-imports it (no behavior change — the 83 P2 tests must stay green). DRY across direct + cross-verify +
creator-standing (all need the identical earned-standing definition).

## §4 — Decisions (VERIFY board settled most; §9 records the reasoning)

| # | Decision | Status |
|---|---|---|
| D1 | scores are SL opinions (reuse `opinion.js`) — consistent uncertainty semantics | board-settled |
| D2 | decay + crater reuse P2 constants (30d, ×3); crater gated ≥2 earned humans | board-settled |
| D3 | correlation-discount = **rootOf only**; `config_hash` is courtesy-display (evasion-trivial) | board-settled (hacker) |
| D4 | new signed types PREMISE/CONFIRM/ACCEPT; **creator bound on read** (`rootOf(src)===creator`); CONFIRM no-self + earned + real-target | board-settled |
| D5 | **drop the self-asserted `stake` field**; CreatorStanding itself IS the stake (endogenous) | board-settled (hacker/honesty) |
| D6 | `verificationStrength` = scalar SL-expectation, MIN over chain, **floor 0 on empty** | board-settled (architect/honesty) |
| D7 | `creatorStanding` returns the full opinion (carries `u`) + `n_premises`, not a bare scalar | board-settled (honesty) |
| **D8** | **DEFER both seams (per-path bar + stakes-throne) to P4** — the scope call | **USER ratification** |

## §5 — Invariants (honest "proven by" — integrity≠provenance is loud)

| INV | Obligation | Proven by (honest) |
|---|---|---|
| INV-2 | receiver-controlled; no global sortable order | REACH = receiver-local union; no published rank |
| INV-9 | claimed grounding ≤ root verification, else `provisional` | the REACH threshold-flag test (flag reads verification, never `size`) |
| INV-13 | never counts nodes; structural, not peer-tally | confirmers/contesters/receivers all **rootOf-keyed + earned**; `size` display-only (forced by a test that `threshold_flag` never reads `size`) |
| INV-14 | authenticated read | every fold reads via `verifiedRecords` (SIG+**integrity**); **PROVENANCE stays OPEN** — same-uid co-forge (§7.1) is SHADOW-tolerable; authenticated-minter is v-next |
| INV-16 | WEAK informs, never gates | everything advisory; `weak-flag.js` untouched + fail-closed; no `grounding/` import of `mayGate` |
| INV-17 | REACH emergent-descriptive | empty-accepts→empty-envelope test; no network radius computed |
| INV-18 | registry-not-oracle; no auto-mint | derived-on-read; no mutable score store |
| U1 | rootOf-keying defeats persona-mult; **human-mult OPEN** | a "persona-mint defeated" test AND a "**U1 residual is real**" test (N distinct human roots DO inflate — the frontier is documented, not hidden) |
| creator-bind | a premise scores only when `rootOf(src)===creator` | slander test (creator=victim, signed by attacker → 0) + self-inflation test (creator=attacker self-confirm → 0) |

## §6 — Test plan (TDD: red → green) — `v0/test/unit/grounding.test.js`
Each row is an INV or a Sybil defense:
- **creator-bind**: slander (creator=victim/signer=attacker → 0); cross-uid self-inflation → 0; legit
  (signer-root===creator) scores.
- **cross-verify**: real-target-required; no-self-confirmation (creator's own confirm → 0);
  earned-standing floor (zero-history confirmer → ~0); rootOf-keyed (N personas of one human → 1
  confirmer); k-minted-roots yields a **WEAK** label and does not move past the novice prior.
- **premise-score**: rises on a distinct-human confirm; falls on a real contest; CONTESTED-is-flag (not
  erased); bogus contest (no real target) → ignored.
- **creator-standing**: human-keyed (persona-mint defeated); asymmetric crater needs ≥2 earned humans;
  decays; **no `stake` field is read** (a `{stake:1e9}` body scores identically); carries `u`/`n_premises`.
- **verification-strength**: weakest-link MIN over a chain; **empty/no-root ⇒ 0** (not +Infinity).
- **reach**: rootOf-keyed union (N personas of one human → size 1); **empty accepts ⇒ empty envelope**
  regardless of verification; INV-9 threshold flag (claimed>actual → provisional); `threshold_flag`
  never reads `size`; a real signed `ACCEPT` is emitted via `buildFrame` (D5 type exercised, not dead).
- **SHADOW/structural**: grep-style assertion that `grounding/` imports neither `mayGate` nor touches
  `convert.actionable`; everything returns `advisory:true`.
- **U1 residual is real**: N distinct human roots DO inflate standing (the frontier is asserted, not
  claimed-defeated).

## §7 — Honest residuals (loud)
- **U1 (human-multiplication)** — unchanged frontier; rootOf-keying defeats persona-mult ONLY. Asserted
  by the "U1 residual is real" test, not hidden.
- **U2 (epistemic independence)** — OPEN; the WEAK flag is permanent until P5. P3's rootOf
  correlation-discount is a STRUCTURAL approximation, NOT the U2 estimator. `config_hash` correlation is
  evasion-trivial and load-bears nothing.
- **Integrity ≠ provenance (#273 family)** — PREMISE/CONFIRM/CONTEST/ACCEPT are content-addressed +
  SIG-verified (integrity), but a same-uid writer can co-forge a byte-valid record. The creator-bind
  (`rootOf(src)===creator`) defeats the *cross-uid* forged-identity case (slander / cross-uid
  self-inflation); the *same-uid* co-forge of one's OWN advisory records remains — **tolerable exactly as
  P2 because no weight gates an action**; the authenticated-minter close is v-next.
- **Both seams** — deferred to P4 (D8); `convert.actionable` stays the hard-coded `false`.

## §8 — Definition of Done
A green `grounding.test.js` (every §6 row) + the **full pre-existing suite still green** (probe the count
at build start — it was 83 at the P2 commit `4734fd1`; do not assert from memory); the §5 INV table each
has a forcing test; `convert.js` / `weak-flag.js` UNTOUCHED (verified by `git diff`); the one P2 touch
(`trust/standing.js` extraction) leaves the 83 green; READMEs bumped; this plan's §9 (VERIFY, below) +
§10 (post-build VALIDATE) folded.

## §9 — VERIFY result (3-lens pre-build board, 2026-06-21)

**Board:** architect + hacker + honesty-auditor, parallel foreground spawns (workflow-orphaning-bug
avoidance). **All three: NEEDS_REVISION** — convergent.

**BLOCKERs folded:** (1) self-asserted `premise.creator` unbound to signer [hacker] → creator-bind on
read (§3.0). (2) `maxVertexDisjointPaths` reuse over an undefined graph; k-minted-roots fabricate k
paths [architect+hacker] → **dropped the max-flow reuse**; cross-verify counts distinct earned-standing
rootOf-keyed humans, labelled WEAK (§3.1). (3) correlation-discount double-counts with max-flow
[architect] → one locus, rootOf only (D3). (4) self-asserted `stake` field [hacker+honesty] → dropped;
standing IS the stake (D5). (5) CONFIRM/r-leg omits direct.js's F1/F2/F3 defenses [hacker+architect] →
full defense set on the confirm leg (§3.1).

**MAJORs folded:** DAG cycle premise-score↔cross-verify → reversed (§1). verificationStrength
type-incoherence + vacuous-MIN → scalar [0,1], floor 0 (§3.4/D6). REACH ACCEPT co-forge + not
rootOf-keyed → rootOf-union + verified + empty→empty (§3.5). INV-14 integrity≠provenance overclaim →
honest table cell (§5). config_hash evasion-trivial → courtesy-display only (D3). creator-standing
crater subject (human-as-source not agent-as-actor) → premise CONTEST scan, ≥2 earned humans (§3.3).
`actionable` stays structural false → `convert.js` untouched (§0).

**Scope (the board's convergent call → D8, USER-ratified below):** DEFER both parked seams (per-path bar
+ stakes-throne) to P4 — the per-path bar needs witness-path extraction (a real `convert` edit, not
report-only) and provenance-anchored predicates (pairs with the v-next minter); the throne has no
consumer in a SHADOW P3 (YAGNI). This is the "scope the underbaked risky path out, don't power through"
discipline.

**MINORs folded:** recs[] = verifiedRecords-output contract per signature; creator-standing carries `u`
+ n_premises (D7); size display-only test; U1-residual-is-real test; DoD probes the test count (not "83"
from memory); ACCEPT type exercised by a real emit.

## §10 — post-build VALIDATE result (3-lens board, 2026-06-21)

**Board:** code-reviewer (correctness) + hacker (adversarial, LIVE PROBES against the BUILT modules,
Rule 2a) + honesty-auditor (claim-vs-evidence), parallel foreground spawns. Build was TDD → 106 green;
the board re-probed the BUILT code. **All three: NEEDS_REVISION.** Folded; re-run → **112 tests green**
(83 pre-existing untouched + 29 grounding); `convert.js` + `weak-flag.js` provably untouched
(`git diff` empty).

**CRITICAL (hacker live-probe; code-reviewer concurred) — FIXED + regression-guarded:**
`cross-verify.js findBoundPremise` did `return null` on the FIRST content-id match whose creator
mismatched. Since a premise id = `hash(statement,scope,creator)` and the body is PUBLIC, an attacker
mints a byte-identical-body DECOY PREMISE (creator=victim, signed by attacker) that hashes to the
victim's id; appearing earlier in the store scan, it short-circuited the search → the victim's legit
premise was DENIED all verification (a denial-of-grounding / slander — the exact thing the creator-bind
exists to defeat; the #273 first-match-poison family). Live-probed at 100% exploitation with ≥4 decoys.
**Fix:** `continue` past every mismatch; return the first `rootOf(src)===creator` record; null only after
the whole log. **Mitigation premise-probed (Rule 2a-corollary):** a DETERMINISTIC regression test
(`findBoundPremise([decoy, legit], …)`) FAILS on the old `return null` (1 failed) and PASSES on the fix
(29 passed) — proven non-vacuous against the actual exploit path.

**MAJOR (honesty) — FIXED:** `premiseScore` returned a bare opinion with no `advisory:true` and the
SHADOW test only checked 3 of 5 fns → added `advisory:true` to `premiseScore`; the SHADOW test now
asserts `premiseScore.advisory` AND that `verificationStrength` is a finite scalar (it is a pure [0,1]
measure, not a score-object — the honest framing, not a forced field).

**MINOR/LOW — FOLDED:** (1) FLOOR omitted `.r` → added `r:0` (+ a premiseScore-on-unbound test, no NaN).
(2) schema `target_premise_id` doc said `record_id` → corrected to the ATMS content-address. (3) `reach()`
delegated verification to the caller (footgun + inconsistent with the 4 sibling folds) → reach is now a
pure derived-on-read fold (reads verified ACCEPTs from ME's log internally; + a tampered-ACCEPT-dropped
test). (4) the "slander cheaper than support" asymmetry (the contest s-leg counted unearned humans while
the confirm r-leg required earned standing) → the contest s-weight is now EARNED-gated too, in both
`premise-score` and `creator-standing` (slander is now exactly as costly as support; the ATMS CONTESTED
*flag* stays open per surface-not-suppress; + an unearned-contester-cannot-erode test). (5) green-but-thin
tests hardened: decay is now exercised in the grounding path; the unannotated-default-to-1 branch is
tested; the threshold-flag test asserts the VALUE (`grounded`), not just equality; the k-minted-roots
WEAK assert is annotated as a structural constant (the behavioral force is `n_confirmers`).

**Residuals confirmed honest (no fold needed):** U1 human-multiplication is loud + forced by a
"residual is real" test (not claimed-defeated); integrity≠provenance same-uid co-forge is documented
OPEN (SHADOW-tolerable — no weight gates an action); both seams deferred to P4 (D8).

**Suite:** atms 24 · edge-attestation 7 · grounding 29 · record-store 11 · record 13 · trust 18 ·
v0-DoD 10 = **112 passed, 0 failed.** The one P2 touch (`trust/standing.js` extraction) left the 83
pre-existing green (no regression).
