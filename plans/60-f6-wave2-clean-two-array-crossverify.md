# Plan 60 — F6 Wave-2-CLEAN: the two-array `crossVerify` (anchor the CONFIRM r-leg of creator-standing + premise-score)

**Status:** BUILT + 3-lens VALIDATED (SHADOW / advisory — arms nothing; `convert.actionable` stays literal `false`).
See `## VALIDATE result` below. (SHADOW, so this plan accretes in place per the plans/ living-doc convention.)
**Epic:** #96 fail-closed arming cluster · **Item:** #83 Part-2 (route trust folds through the anchoring filter) — 4/9 → 6/9
**Governing ADR:** `docs/ADRs/0003-fold-routing-monotonic-anchoring-invariant.md` Decision 3 + **Decision 4** (the two-array signature) + Decision 5 (the `s=0` guard)

## Context / crux

`creatorStanding` and `premiseScore` each fold a **positive r-leg** (`crossVerify` confirmation survival) and a
**negative s-leg** (CONTEST evidence) into `opinion(r, s)`. `opinion`'s expectation `E = (r + 2a) / (r + s + W)` is
**increasing in `r`, decreasing in `s`** (derivative wrt `r` has sign `s + W - 2a = s + 1 > 0`). So under arming:

- Dropping an un-anchored **CONFIRM** (positive) → `r` ↓ → `E` ↓ → **narrows** (NS-9 safe).
- Dropping an un-anchored **CONTEST** (negative) → `s` ↓ → `E` ↑ → **INVERTS** NS-9.

A wholesale route (anchoring the whole input, like Wave-1 does for the pure-positive folds) therefore inverts these
two folds. ADR-0003 Decision 4 is explicit: **Wave-2-CLEAN needs a two-array `crossVerify`** — the CONFIRM
accumulator reads `anchoredRecs`; the s-leg, the crater-gate root-count, the earned-standing CLAIM gate, and the
subject's own PREMISE binding all read `rawRecs`.

## Design — the two-array signature (backward-compatible)

`crossVerify(premiseId, meCtx, now, recs, anchoredRecs)`:

- `recs` — the RAW/gate set (unchanged 4th arg). Used for the **gates**: `findBoundPremise` (subject-premise
  binding) + `earnedStandingPersonas` (the earned CLAIM gate). Per ADR condition (3), anchoring is applied ONLY to
  the terminal external-positive **accumulator**, NEVER to the gates — even though anchoring the gates would also
  be monotone-safe. Minimal anchored surface = auditable surface (defends against a future negative leg reusing a
  gate — hazard (c)).
- `anchoredRecs` — NEW optional 5th arg: the CONFIRM accumulator set. **Defaults to `recs` when omitted.**
- Internal loads: `const gate = recs || authenticatedAnchoredRecords(meCtx);` (standalone → anchored, fail-safe,
  unchanged) and `const confirmSet = anchoredRecs || gate;`.
- Body swap: `findBoundPremise(gate, ...)` + `earnedStandingPersonas(gate)` (was `all`); the CONFIRM loop iterates
  `confirmSet` (was `all`). The entanglement-demote operates on the CONFIRM-derived `perHumanDecay` (from
  `confirmSet`) unchanged.

**Backward-compat proof:** every current caller passes ONE array as the 4th arg and no 5th →
`anchoredRecs = undefined` → `confirmSet = gate` → both legs read the same array → **byte-identical**.
- `verification-strength.js:63` passes the anchored set as `recs` (Wave-1 wholesale, pure-positive) → both legs
  read anchored → unchanged (its `findBoundPremise`-floors-on-un-anchored-creator behavior is preserved).
- A standalone caller (no `recs`) → `gate = authenticatedAnchoredRecords` (fallback), `confirmSet = gate` → both
  anchored → unchanged (the Wave-1 T4 fallback-anchors pin still holds).

**The Wave-2 callers** (`creatorStanding`/`premiseScore`) load BOTH arrays and pass BOTH:
```
const rawRecs = verifiedRecords(meCtx.registry, meCtx.storeOpts);   // s-leg + subject/earned gates
const anchoredRecs = authenticatedAnchoredRecords(meCtx);           // CONFIRM r-leg accumulator
...crossVerify(premiseId, meCtx, now, rawRecs, anchoredRecs).r      // r-leg anchored
...contestEvidence/contestSurvival(rawRecs, ...)                    // s-leg RAW (unchanged)
```
The premise-SET iteration in `creatorStanding` stays on `rawRecs` (dropping an un-anchored SUBJECT premise from the
aggregate would remove a possibly-net-negative term → inversion; the subject-premise is condition-(1)-ineligible).

## Three ADR conditions — satisfied

1. **External positive evidence** — only third-party CONFIRM records are anchored; the subject's own PREMISE stays raw.
2. **Monotone aggregation** — `opinion(r, s)` expectation is monotone-increasing in `r`; we only shrink `r`. The
   MEAN is not involved. The crater `>=2` gate is on the raw s-leg (untouched).
3. **No co-consumed anchored set** — the anchored `confirmSet` is consumed ONLY by the CONFIRM accumulator; the
   s-leg + gates read the raw array. Anchoring is at the fold's own internal load (`authenticatedAnchoredRecords`),
   passed at leg granularity — not leaked into `direct`/`consensus` (they don't call `crossVerify`; probed below).

## Adversarial shapes — enumerated FIRST (inject→RED before build; hand to the hacker board)

| # | Shape | Expected (must hold) | Failure mode if wrong |
|---|---|---|---|
| A1 | premise 0 confirms + 1 **un-anchored CONTEST** | `E_armed == E_disarmed` (s-leg raw) | s anchored → s↓ → **E↑ inversion** |
| A2 | creatorStanding: un-anchored SUBJECT premise w/ high contests, in a multi-premise human | premise stays in aggregate (raw iter); `E_armed <= E_disarmed` | premise dropped → net-negative term removed → **aggregate↑** |
| A3 | premise w/ **2 earned contesters, one un-anchored** (crater `>=2` boundary) | crater holds armed (root-count raw); `s_armed == s_disarmed` | contester anchored-out → 2→1 → lose 3x crater → **s↓ E↑** |
| A4 | un-anchored CLAIM by a contester (earned-gate role hazard) | contest still counts (s-leg earned on raw) | earned anchored → contester loses standing → **s↓ E↑** |
| A5 | anchored CONFIRMer + un-anchored creator | confirm counts (gate finds premise on raw); r>0 | gate anchored → premise floored → r over-narrows (safe dir, but assert) |
| A6 | DISARMED byte-identity | `creatorStanding`/`premiseScore` identical disarmed (deepEqual by value) | any divergence = not SHADOW-safe |
| A7 | isolation: `direct`/`consensus`/`wcons` byte-identical across this change | no crossVerify 5th-arg leak | back-door anchoring of a mean/negative leg |
| A8 | proto-pollution / destructure sweep on the new 5th param + both loads | no `Object.prototype.anchoredRecs` bake-in; array-only use | write-site pollution (the graduating 12x signal) |

## Files touched

- `v0/src/grounding/cross-verify.js` — two-array signature + gate/accumulator split + header note.
- `v0/src/grounding/creator-standing.js` — load `anchoredRecs`; pass as 5th arg to `crossVerify`; s-leg unchanged.
- `v0/src/grounding/premise-score.js` — same.
- `v0/src/trust/authenticated-read.js` — scope comment: routed set += creator-standing/premise-score (Wave-2-CLEAN, r-leg only).
- `v0/test/integration/authenticated-read.test.js` — importer-guard EXACT-SET += the two new importers; comment.
- `v0/test/integration/f6-wave2-anchoring.test.js` — NEW: A1–A8 witnesses (non-vacuous, RED-first).
- `plans/60-f6-wave2-clean-two-array-crossverify.md` — this file (accretes VERIFY + VALIDATE).

## Runtime probes (claims verified against the tree)

- `direct.js`/`consensus.js` do NOT import `crossVerify` → `grep -rn crossVerify v0/src/trust/` → only a comment in
  direct.js:73. **Probe: confirmed this session.** (Isolation for A7.)
- `verification-strength.js:63` passes `authenticatedAnchoredRecords(meCtx)` as the 4th arg, no 5th → default
  keeps it byte-identical. **Probe: confirmed this session.**
- Decision-5 `s=0` guard already lives in `f6-wave1-anchoring.test.js:213` (T1) → a future negative leg trips RED.
  **Probe: confirmed this session.**

## VERIFY board (2026-07-16) — architect APPROVE-WITH-CHANGES + hacker NEEDS-REVISION → findings folded

**Architect (APPROVE-WITH-CHANGES):** re-derived the monotonicity against `opinion.js`/`params.js`
(`E=(r+1)/(r+s+2)`, `dE/dr=(s+1)/(...)^2 > 0` strictly increasing in `r`); audited all six legs — none
mis-routed; confirmed the aggregate-safety hinges on the premise-SET iteration staying RAW. LOW/NIT only.

**Hacker (NEEDS-REVISION):** confirmed A1–A6 inversion-free + A7 isolation clean + A8 proto/NaN narrow-safe,
but found **one HIGH inversion A1–A8 did not enumerate** (co-arming), plus 3 MEDIUM hardening holes.

### Findings folded (revised design)

- **[HIGH] A9 — co-armed anchoring + entanglement-detector inverts the r-leg.** Anchoring drops un-anchored
  CONFIRMs from `confirmSet` BEFORE the demote clusters over `[...perHumanDecay.keys()]` (cross-verify.js:117).
  Removing a confirmer can change the cluster topology so survivors ESCAPE a collapse the disarmed superset
  suffers → `r_armed` can EXCEED `r_disarmed` (reproduced: `r_armed=2 > r_disarmed=1`, `E=0.75 > 0.667`).
  Both arming signals (`regProvenance` anchoring; `entanglementDetector` demote) are operator-set `meCtx` fields.
  **FIX (fail-close at the leaf):** when `meCtx.entanglementDetector` is present, force `confirmSet = gate` (skip
  anchoring) — the de-anchor direction is NS-9-safe (`r_armed == r_disarmed` for the two-array folds). This
  discharges the ADR-0003 "co-arming needs a witness" deferral for the two-array folds and UPGRADES it to
  "demonstrated + fail-closed". **RESIDUAL (still deferred):** `verification-strength` passes an already-anchored
  `recs` (no raw baseline in the leaf), so the leaf cannot de-anchor it — its co-arming residual stays deferred to
  a Wave-1 two-array revisit (recorded in ADR-0003 Deferred, dated). A9 gets a RED-first witness.

- **[MED] Rename trap → minimal-diff (adopt).** Do NOT rename `recs`→`rawRecs` in the two callers (a single
  mis-pointed s-site — earned gate / contestSurvival / earnedContesterRoots / contestEvidence / the premise-SET
  loop — silently inverts, invisible to every DISARMED test). Keep `const recs = verifiedRecords(...)` untouched;
  ADD ONLY `const anchoredRecs = ...` and change the ONE `crossVerify` call to pass it as the 5th arg. Mandate
  ARMED (`regProvenance` present) per-site witnesses (A2/A3/A4) asserting each s-site reads raw.

- **[MED] `anchoredRecs || gate` fails OPEN on a falsy-but-present 5th arg → fail-CLOSED.** A present-but-non-array
  5th arg (null/0/'') silently de-anchors (counts the full confirmer set) with no signal. **FIX:** normalize —
  `5th undefined → confirmSet=gate` (byte-identical default); `5th present + array → use it`; `5th present +
  non-array → confirmSet=[]` (fail-closed floor, r=0, matches the read-gate family's empty=no-trust). A10 witness.

- **[MED] Double store-read breaks the anchored⊆raw snapshot → subset-by-construction (single read).** Reading
  `verifiedRecords` twice (directly + inside `authenticatedAnchoredRecords`) lets the s-leg (raw) and r-leg
  (anchored) see different snapshots under a concurrent writer, breaking the NS-9 subset premise; also O(2N).
  **FIX:** add `authenticatedAnchoredRecordsFrom(verified, meCtx)` to `authenticated-read.js` (DRY: the existing
  `authenticatedAnchoredRecords(meCtx)` becomes `…From(verifiedRecords(...), mc)`); the two callers read
  `verifiedRecords` ONCE and derive `anchoredRecs` from that SAME array → subset-by-construction + single read.
  Bonus: DISARMED, the From-variant returns the input array REFERENCE unchanged, so `anchoredRecs === rawRecs`
  (strengthens A6 from deepEqual to reference-identity).

- **[LOW] Two-array `s=0` guard.** ADR-0003 Decision 5 requires a structural `opinion(r, 0)` assertion; the Wave-1
  guard (f6-wave1:213) does not exercise the 5th-arg/`confirmSet` path. Add an `s=0` assertion under the two-array
  signature to the f6-wave2 suite (a future CONTEST-derived `s` trips RED).

- **[LOW] Doc/precondition.** JSDoc: `anchoredRecs` defaults to the GATE set (recs when supplied, else the
  fallback), and is "only meaningful alongside `recs`" (the `recs=undefined + anchoredRecs=defined` shape is
  unreachable by live callers; documented, non-inverting).

- **[HELD, no action] A7 isolation** (crossVerify has exactly 3 callers; `direct`/`consensus`/`wcons` don't import
  it; the two consumers feed no downstream mean) and **A8** (positional param defeats proto-pollution; NaN clamps).

### Revised adversarial witness set (RED-first)

A1 un-anchored CONTEST → `E_armed==E_disarmed` · A2 un-anchored SUBJECT premise w/ ≥2 craters in a multi-premise
human, assert full aggregate `E_armed<=E_disarmed` · A3 crater `>=2` boundary contester un-anchored → crater holds
· A4 un-anchored CLAIM by contester → s-site raw · A5 anchored CONFIRMer + un-anchored creator · A6 DISARMED
reference-identity · **A9 co-armed detector+anchoring → `r_armed<=r_disarmed` (RED without the guard)** · **A10
falsy 5th arg → `confirmSet=[]` r=0 (fail-closed, not raw) — WHEN no detector present; a co-armed detector takes
PRECEDENCE (→ gate=raw), witnessed separately** · s=0 structural guard on the two-array path.

## VALIDATE result (2026-07-16) — 3-lens board, all APPROVE-WITH-CHANGES → findings folded → 920/0

**Status: BUILT.** Suite 63 files / 920 passed / 0 failed; eslint@9 clean on all touched files.

- **hacker (live-probe, Rule-2a):** built 5 live probes over the real record-store; the **absolute NS-9 gate HELD** —
  `trust_armed(S) > trust_disarmed(S)` is NOT reproducible in ANY arming combination (regProvenance / freshness /
  detector). Root cause the design got right: the demote is structurally unreachable without
  `meCtx.entanglementDetector` (default detector is constant-WEAK), which is exactly the field the co-arm guard keys
  on. Fail-closed 5th arg floored all 16 hostile inputs to r=0 (detector-absent path; a co-armed detector takes
  precedence → gate=raw, still NS-9-safe); anchoredRecs stayed a strict subset under every
  arming (proto-pollution neutralized by `Object.hasOwn`); s-leg/crater fully RAW; single-array path byte-identical;
  verification-strength untouched.
- **code-reviewer:** grepped all six s-sites — every one reads RAW `recs`, only the crossVerify 5th arg anchors
  (minimal-diff mandate held). Co-arm guard keys the same field the demote reads.
- **honesty-auditor:** all four spawn-questioned claims MATCH the code; no NAMED residual falsely claimed-addressed;
  verification-strength co-arm honestly deferred.

### Folded (the convergent finding + doc-precision)

- **[MED, code-reviewer + hacker — SAME two-face-getter class] snapshot the arm signal ONCE.** (a) `cross-verify.js`
  read `meCtx.entanglementDetector` twice (guard + demote) — a two-face getter desynced them and RESURRECTED the
  inversion (hacker demonstrated r=2 vs 1). FIX: `const detector = meCtx && meCtx.entanglementDetector` once, reused
  for both. (b) `authenticated-read.js` wrapper re-read `meCtx.registry` (wrapper + `…From`). FIX: wrapper snapshots
  all four fields once and threads them to a PURE `anchorFreshCompose(verified, registry, regProvenance, freshness)`
  (no meCtx reads); the two callers snapshot `reg` once (3→2 reads, pre-diff parity). Both matched the module
  family's own "read the arm signal ONCE" discipline. (Bounded: meCtx is trusted deploy data, out of the actor
  threat model; SHADOW/dormant — but the fixes are cheap and honor the established discipline.)
- **[LOW, honesty] fail-closed doc was unconditional** but is conditional on `!detectorPresent` (co-arm guard takes
  precedence). FIX: qualified the JSDoc/inline comment + added the `co-arm precedence` witness (detector present +
  non-array 5th arg → gate=raw, NS-9-safe, not floored).
- **[LOW, honesty] "co-arming discharged" understated the NS-4 inertness.** FIX: ADR-0003 + the leaf comment now
  state plainly that under a co-armed detector these folds FORFEIT their anchoring narrowing (fail-safe, not
  support); the `min(r_anchored,r_raw)` clamp is the deferred real close.
- **[NIT, hacker] freshness is inert on the r-leg** (filters VOUCHes only; the r-leg is CONFIRMs) — added a doc note.
- **[LOW, hacker — deferred w/ doc] confirmSet loop is not Proxy-hardened** — not live-reachable (callers derive
  anchoredRecs from `…From`); added the "MUST be verifiedRecords/…From-derived" contract note (mirrors `recs`).
- **[LOW, code-reviewer — deferred] crossVerify > 50 lines** — pre-existing (the plans/41 union-find demote block),
  not introduced here; standing SRP-extraction candidate.
- **[NIT, honesty] fold-level disarmed golden** — covered by the 39 existing `grounding.test.js` tests staying green
  (they exercise creatorStanding/premiseScore disarmed); A6 + AR1 pin the helper-level reference-identity.

**Not folded (correctly HELD by the board):** no CRITICAL/HIGH survived; the two-array split, fail-closed defaults,
subset-by-construction single-read, and co-arm guard are all correctly implemented and non-vacuously tested.
