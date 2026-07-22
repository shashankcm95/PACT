# ADR-0004 — The `direct` fold alpha-blend re-derivation: anchoring `direct` without inverting `trust()` (F6)

**Status:** proposed (2026-07-22)

<!-- Proposed, not accepted: this DEFINES the trust-math re-derivation that would let the `direct` fold route
through the armed anchoring chokepoint without inverting NS-9 at the public `trust()` surface. It builds nothing
and arms nothing; it is the revisit trigger ADR-0003's Deferred `direct` entry names, and the design contract for
a future `direct`-anchoring wave. Acceptance is the USER's gate. -->

## Context

ADR-0003 routed 6 of the 9 counted folds through the anchoring chokepoint and reclassified `direct` to **OPEN**
(2026-07-16, plan 61 VERIFY). The reason is **hazard (d) DOWNSTREAM-COMPOSITION**: the raw-resolution positive-leg
split is fold-monotone (`E(DIRECT)_armed <= E(DIRECT)_disarmed`), but NS-9 is defined over the SUBJECT'S trust, and
`direct` is the sole fold consumed by

```text
model.js trust() = alpha * directE + (1 - alpha) * consE,   alpha = alpha(rEv + sEv)
```

Anchoring lowers `rEv`, which lowers BOTH `directE` and `alpha`; a lower `alpha` shifts blend weight onto the
UNCHANGED `consE`, so when `consE > directE` the public `trust()` RISES. Reproducer (`W=2`, base `0.5`, `SAT=5`):
`rEv_disarmed=3`, `sEv=0`, un-anchored agent, `wcons=0.95` gives disarmed `trust = alpha(3)*0.8 + (1-alpha(3))*0.95
= 0.894`; armed `rEv=0` gives `alpha=0` and `trust = 0*0.5 + 1*0.95 = 0.95` (`+0.056`, NS-9 violated). Because
`model.js` calls `direct` STANDALONE, every armed standalone `direct` call (the public `trust()` path) inverts —
not an edge case. (The `consensus` path passes raw `recs`, so its `direct` calls are not anchored and do not
invert; the inversion is specific to the `model.js` standalone path.)

ADR-0003's Deferred entry named the fix and co-deferred it with `consensus`/`stake-anchor`: *base `alpha` on the
RAW interaction count and use the anchored `rEv` only for `directE`* — "a TRUST-MATH change to the core blend (its
own design + ADR)". This is that ADR.

`direct` also carries two open tracker issues on the same file, both `live-on-arm` (they only bite once a gate
arms). This ADR situates them relative to the re-derivation but does not silently fold them in (see Decisions 3
and 4):

- **#86 (F11)** — `direct` positive evidence is self-inflatable by claim-spam, and future-dated claims never decay.
- **#87 (F12)** — the earned-standing gate that closes "slander as costly as support" in the grounding folds is
  absent from `direct`'s negative-evidence leg. Two review lenses disagree on whether this is a bug or an intended
  asymmetry.

Everything here is SHADOW (arms nothing); `convert.actionable` stays a literal `false`.

## Decision(s)

### Decision 1 — Re-derive the blend: `alpha` on the RAW interaction count; anchor the positive leg into `directE` only

Split the two roles the anchored `rEv` plays in `model.js`:

- **Blend weight (`alpha`)** reads the RAW interaction count `n_raw = rEv_raw + sEv` — the disarmed positive
  weight plus the (raw) negative weight. This quantity is INVARIANT under arming, so anchoring can no longer move
  the blend weight.
- **DIRECT expectation (`directE`)** reads the ANCHORED positive opinion `opinion(rEv_anchored, sEv)`, where
  `rEv_anchored <= rEv_raw` drops un-anchored agent CLAIMs (positive-leg anchoring only).

The negative leg (`sEv`), the resolution set (`agentClaimIds`), the crater, and `consE`/`consensus` stay RAW,
exactly as plan 61's raw-resolution design established (anchoring a resolution record would un-resolve a CONTEST
and RAISE trust — the Decision-1 dual-role trap).

**Monotonicity proof (NS-9 at the SUBJECT'S `trust()`).** Let `alpha* = alpha(n_raw)`, fixed under arming. `E(r,s)
= (r + a*W)/(r + s + W)` is strictly increasing in `r` for fixed `s` (`dE/dr = (s + W(1-a))/(r+s+W)^2 > 0`), so
`directE_armed = E(rEv_anchored, sEv) <= E(rEv_raw, sEv) = directE_disarmed`. `consE` is unanchored (unchanged).
Therefore

```text
trust_armed  = alpha* * directE_armed    + (1 - alpha*) * consE
            <= alpha* * directE_disarmed + (1 - alpha*) * consE  =  trust_disarmed.
```

Monotone-narrow at `trust()`. Disarmed, `rEv_anchored = rEv_raw`, so the `trust()` VALUE is identical to today
(value-identical; the return object gains one additive field — see Decision 2's note) — SHADOW.

**Why `alpha` MUST read the raw count (it is forced, not chosen) — VERIFY-hardened.** `alpha` answers "how much
has this agent interacted" — the confidence/interaction-count term. The agent DID interact; anchoring is about
record PROVENANCE, not interaction count. Provenance-invariant `alpha` is not merely a preference: it is FORCED by
NS-9. Any `alpha` that moves with the anchored quantity reintroduces hazard (d) exactly. In particular the tempting
"scale `alpha` by the anchored fraction `rEv_anchored / rEv_raw`" (to drag an unauthenticated agent all the way to
`consE`) is UNSAFE: arming would then lower `alpha`, shift weight onto `consE`, and RAISE `trust()` when `consE >
directE` — the `+0.056` reproducer returns. So `alpha` reads `rEv_raw + sEv`, full stop.

**The cost of that invariance is a floor, stated honestly (not over-claimed).** For an un-anchored agent with no
contests, `directE = E(0, 0)` = the base rate `0.5` (NEUTRAL, not "low"). With `alpha` pinned on the raw count,
armed `trust = alpha* * 0.5 + (1 - alpha*) * consE`, which for `consE < 0.5` sits STRICTLY ABOVE `consE` (VERIFY
probe: `consE=0.1`, 10 raw claims gives `0.367`; 50 gives `0.464`). So anchoring pulls a rich-but-unauthenticated
agent's DIRECT expectation to NEUTRAL but CANNOT drag it down to a bad consensus signal — that residual is the
price of provenance-invariant `alpha`. What anchoring guarantees is the ARMING DELTA only: `trust_armed <=
trust_disarmed` (the narrowing is never inverted into a raise). It does NOT make an unauthenticated agent's
ABSOLUTE trust low; closing that absolute gap for the zero-contest case is #86's job (Decision 3), not anchoring's.

### Decision 2 — Interface: `direct` exposes both the anchored opinion and the raw interaction count; `consensus` is untouched via the recs-seam

`direct` must surface two things `model.js` needs: the anchored positive opinion (for `directE`) and `n_raw` (for
`alpha`). Concretely, `direct` returns `opinion(rEv_anchored, sEv)` plus the raw positive weight (`rEv_raw`), and
`model.js` computes `alpha` from `rEv_raw + sEv` rather than from the anchored `d.r`.

**THE load-bearing build invariant (not a field-naming detail):** the returned opinion's own `.r` becomes the
ANCHORED value, so `model.js` MUST repoint `alpha` off `d.r` and onto `rEv_raw + sEv`. A build that adds the
`rEv_raw` field but leaves `model.js`'s `alpha(d.r + d.s)` untouched silently re-introduces the exact `+0.056`
inversion — and because `rEv_anchored == rEv_raw` DISARMED, every disarmed test stays green while the armed path
inverts. This one repoint is the whole re-derivation. The build MUST (a) carry a load-bearing comment at the
`alpha` line pinning WHY it reads the raw count (provenance != interaction count; cross-ref ADR-0004; do NOT
"clean up" by re-coupling to `d.r`), and (b) ship the M0/M1 witnesses below RED-first and NON-vacuously (a
strictly-un-anchored fixture where `rEv_anchored < rEv_raw`, not a fully-anchored one where the equality holds
trivially under the broken code).

Positive-leg anchoring uses the ADR-0003 Decision-3 fallback seam: `posSet = recs || authenticatedAnchoredRecordsFrom(all, reg, meCtx)`,
anchored ONLY when a caller does not supply `recs`. The live callers (probe `grep -rn '\bdirect(' v0/src`):

- `model.js` calls `direct` STANDALONE (no `recs`) — armed anchors `rEv_anchored`; `alpha` reads `rEv_raw + sEv`.
- `consensus.js` (`wcons`) calls `direct(..., now, recs)` with RAW `recs` — `posSet = recs`, so `rEv_anchored =
  rEv_raw`, `direct` is NOT anchored through the back door, and `consensus` stays a separate OPEN fold (its own
  mean re-derivation, ADR-0003 Deferred). `wcons`'s per-voucher weight `alpha(d.r + d.s) * d.b` is unchanged.

Disarmed, `authenticatedAnchoredRecordsFrom` returns the input by reference, so `rEv_anchored = rEv_raw` and every
consumer's VALUE is identical to today — **value-identical, not literally byte-identical.** The one shape change is
ADDITIVE and inert: `direct`'s return gains an `rEv_raw` field (and `model.js`'s `direct:` sub-object with it), but
no existing consumer reads it (`wcons` reads `d.r`/`d.s`/`d.b`; the advisory `trust()` value is unchanged), so the
new field cannot move any advisory number. Only a consumer that deep-equals or re-serializes the `direct` object
sees the extra key — that is the sole disarmed delta, and the build's D6 witness asserts VALUE-equality, not
object-equality.

**Forward contract (the two-quantity opinion is a new hazard surface).** After this change `direct`'s opinion
co-locates two quantities on different bases: an anchored `.r`/`.b`/`.u` (for expectation) and a raw `rEv_raw`
(for a blend weight). `consE`-invariance rests ENTIRELY on `wcons` calling `direct` WITH raw `recs`; the current
importer-guard only catches a NEW file importing the chokepoint, not a change in HOW a mean-consumer calls
`direct`. So the contract, in the spirit of ADR-0003 Decision 5's structural `s=0` guard: **any consumer that
folds `direct`'s opinion into a weighted mean MUST weight on `rEv_raw` and expect on the anchored opinion, and MUST
pass `recs` if it must not anchor.** A future standalone `direct` call inside a downstream mean is exactly the
hazard-(d) recurrence; the build SHOULD ship a structural test (a call-site scan, or an assertion that a mean's
`direct`-weight reads the raw belief) that trips RED on a standalone `direct` feeding a mean — not only the D4
value witness.

### Decision 3 — #86 is a REQUIRED pre-arm companion, NOT closed by this re-derivation (recommended direction)

The re-derivation does not close #86. Anchoring filters by authenticated-root provenance, not by
receiver-endorsement, so an attacker holding ONE authenticated human root can still spam self-authored CLAIMs and
inflate `rEv_raw` (raising `alpha`) and `rEv_anchored` (raising `directE`). Future-dated `t` still clamps to full
decay weight in both. Anchoring only mitigates the UN-authenticated-spam subset.

Recommended direction (its own follow-up; a positive-evidence-semantics change larger than this blend re-derivation):
require a RECEIVER-side positive signal (an ACCEPT/interaction the receiver emitted) for `direct` positive evidence
rather than raw self-authored CLAIM volume, and reject `t > now + skew` in `decayWeight` (the clamp comment already
anticipates this: "when decay ever GATES an action, reject `t > now + skew`"). This ADR records #86 as a
CO-REQUIRED-before-arming condition on `direct`; a naive Wave that anchors `direct` (Decision 1) while leaving #86
open would ship an armable-but-inflatable positive leg.

### Decision 4 — #87 is DEFERRED pending a semantics ruling (do not decide here)

Whether `direct`'s base negative accumulation should be earned-gated is a genuine open question, and this ADR does
NOT resolve it:

- **Bug reading (slander-parity):** the grounding folds drop a CONTEST whose signer lacks earned standing
  (`creator-standing.js:51`, `premise-score.js:40`); `direct`'s `perHumanDecay` accumulation gates only the `>=2`
  crater multiplier, so a zero-history Sybil CONTEST still adds base `sEv` and can zero belief. Fix: apply the same
  `earned.has(...)` gate to the negative accumulation.
- **Intended-asymmetry reading:** `trust.test.js:127-135` ("anti-grief: zero-standing contesters INFORM but do NOT
  crater") encodes the current behavior as a deliberate, tested design — inform-but-don't-crater.

The ruling belongs to the maintainer, not this ADR. It is orthogonal to Decision 1 (the negative leg stays raw
under the re-derivation either way), so it does not block the anchoring, but it is a `live-on-arm` condition that
must be RESOLVED (fixed or documented-as-intended) before `direct` arms.

One interaction the ruling must account for (VERIFY, pre-existing not introduced): `sEv` feeds BOTH `directE` (as
disbelief) AND `alpha` (via `rEv_raw + sEv`). A zero-history Sybil CONTEST that #87 leaves ungated therefore
AMPLIFIES its own slander — it lowers `directE` and RAISES `alpha`, shifting blend weight onto the lowered
`directE` (probe: `rEv_raw=2`, `sEv` `0 -> 10` raises `alpha` `0.286 -> 0.706`). So the #87 ruling governs slander
amplification through `alpha`, not merely the base `sEv` magnitude.

## Consequences

- On acceptance AND a future build of Decision 1: `direct` becomes anchorable and moves ANCHORED (`#83` Part-2
  `6/9 -> 7/9`), leaving `consensus` + `stake-anchor` as the OPEN bucket (`2/9`), both still awaiting their own
  mean/stake re-derivations.
- `model.js`'s `alpha` argument changes from `d.r + d.s` to the raw interaction count. This is a change to the core
  public blend; disarmed the `trust()` value is unchanged (value-identical; the `direct` object gains an additive
  `rEv_raw` field), but it is the first trust-math edit to `model.js` under F6 and needs the full adversarial
  obligation below.
- `direct` remains un-armable in practice until #86 (Decision 3) is closed and #87 (Decision 4) is ruled on; this
  ADR unblocks the ANCHORING half only.
- Nothing here arms: `LIVE_SOURCES` stays frozen-empty and `convert.actionable` stays a literal `false`.

## Adversarial obligation (the build's RED-first contract)

A future `direct`-anchoring build must ship these as RED-first witnesses (inject the violation, watch it fail,
then implement). The first is NEW to this ADR and is the one plan 61 lacked:

| # | Shape | Expected |
|---|---|---|
| M0 | **`trust()`-level monotonicity** (the re-derivation's whole point): standalone armed `direct`, `consE > directE` | `trust_armed <= trust_disarmed` for all `rEv_anchored <= rEv_raw` (the `+0.056` reproducer now holds-or-narrows) |
| M1 | `alpha` is provenance-invariant — NON-VACUOUS: use a STRICTLY-un-anchored fixture (`rEv_anchored < rEv_raw`), never a fully-anchored one | in one fixture: `alpha_armed == alpha_disarmed` AND `directE_armed < directE_disarmed` (both legs demonstrably move while `alpha` stays pinned; RED-first: wire `alpha(d.r_anchored + d.s)`, watch the `+0.056` inversion, flip to `rEv_raw`, watch it narrow) |
| S1 | **structural call-site guard** (recs-seam not just witness-tested): no standalone `direct` feeds a weighted mean | a `direct` call site consumed by a mean must pass `recs` (or weight on `rEv_raw`); a standalone `direct` in a mean trips RED (ADR-0003 Decision 5 precedent) |
| D1 | un-anchored agent CLAIM (standalone armed) | `rEv_anchored` drops; claim stays in `agentClaimIds` |
| D2 | un-anchored agent CLAIM WITH a CONTEST against it | `sEv` UNCHANGED (resolution raw); `directE_armed <= directE_disarmed` |
| D3 | crater `>=2` boundary, 2 earned contesters | crater holds (raw); `sEv` unchanged |
| D4 | recs-seam: `wcons`/`consensus` armed vs disarmed | byte-identical (its `direct(recs)` stays raw) |
| D6 | DISARMED value-identity | standalone `direct` disarmed: `posSet === all` by reference, every numeric opinion field == pre-diff; assert VALUE-equality (the added `rEv_raw` field is the only shape delta), not whole-object equality |
| D7 | proto-pollution / sibling sweep on `posSet`/`posIds` | array-only use; no bake-in |
| D8 | co-arming absence | `direct` reads no `entanglementDetector` (structural; assert non-vacuously) |

Lower-severity carries from plan 61: snapshot `const reg = meCtx.registry` before `all` (MED-1 one-judge-source);
pin a test so a future "is-any-dup-anchored" representative-anchoring flip trips RED. Note the current
first-per-`idempotency_key` representative choice makes `rEv_anchored` scan-order dependent (an un-anchored
representative drops the whole key even if an authenticated duplicate exists) — it only ever OVER-narrows
(NS-9-safe, deliberately fail-safe), not a correctness bug, but the test pins it so a future change is deliberate.

## Relationship to the ADR chain

- **Refines ADR-0003** — supplies the `direct` re-derivation ADR-0003's Deferred entry named and co-deferred. It
  does NOT supersede ADR-0003 (proposed, amended-in-place convention). **The `X/9` count tracks BUILT folds, so
  acceptance of this ADR does NOT move it:** `#83` Part-2 stays `6/9` and the OPEN count stays `3` until the
  Decision-1 build merges. On acceptance, annotate the ADR-0003 `direct` row `ANCHORED-pending-build` (a design is
  ready); only the merged build decrements OPEN `3 -> 2` and moves the fraction `6/9 -> 7/9` (a signal narrows;
  only the shipped thing counts).
- **Sibling to `consensus`/`stake-anchor`** — those remain OPEN with their own re-derivation triggers (ADR-0003
  Deferred); this ADR closes only `direct`'s.
- **Cross-refs #86 / #87** — the two `live-on-arm` `direct.js` hardening conditions (Decisions 3 and 4), both
  co-required-before-arming, neither closed by the blend re-derivation alone.

## VERIFY board (2026-07-22) — architect + hacker, both APPROVE_WITH_CHANGES

The re-derivation was pressure-tested by an architect + hacker VERIFY board (the same class of board that caught
`direct`'s original inversion in plan 61). **Both independently CONFIRMED NS-9 holds at `trust()`** and neither
could refute it:

- **Architect** re-derived the proof algebraically against the code: `trust_armed - trust_disarmed = alpha* *
  (directE_armed - directE_disarmed) <= 0`, having verified firsthand that `alpha*` is provenance-invariant (`sEv`
  reads the raw set throughout `direct.js`) and `consE` is anchoring-independent (`wcons` threads raw `recs`).
- **Hacker** implemented the model against the real primitives and brute-forced `trust_armed - trust_disarmed`
  over 14,700 cases plus a full `sEv` sweep: `max = 0` (exact equality only at `rEv_anchored = rEv_raw`). The fix
  resolves the ADR's own `+0.056` reproducer (armed narrows to `0.781`).

Findings folded into the decisions above (none were correctness blockers; the trust-math core is sound):

- **[HIGH]** the original "Semantic defense" over-claimed protection ("`directE` is low / cannot be exploited to
  RAISE trust"). Corrected in Decision 1: `directE` is the base rate `0.5` for the zero-contest case, so an
  unauthenticated claim-spammer with `consE < 0.5` launders armed trust up toward `0.5`; anchoring guarantees only
  the arming delta (`trust_armed <= trust_disarmed`), not a low absolute trust. The board's suggested alternative
  (scale `alpha` by the anchored fraction) was REJECTED here because it reintroduces hazard (d) — provenance-
  invariant `alpha` is forced by NS-9, and the floor is its inherent cost.
- **[MEDIUM x2]** the `alpha` repoint is THE single load-bearing build invariant (a one-line slip re-inverts while
  disarmed tests stay green) — elevated in Decision 2 with a RED-first, non-vacuous M1; and the recs-seam is now a
  STRUCTURAL obligation (S1 + the forward contract), not only the D4 value witness.
- **[LOW x3 / NIT]** the `alpha`/expectation basis decoupling is pinned (Decision 2 comment + regression);
  the `X/9` count does not move on acceptance (Relationship); `#87`'s ruling must account for `alpha`-amplified
  slander (Decision 4); the dedup representative is deliberately over-narrowing (Adversarial obligation).

## Deferred (recorded, not built)

- The Decision-1 build itself (a `direct`-anchoring wave) — this ADR is design only.
- #86's receiver-endorsement redesign (Decision 3) — a positive-evidence-semantics change, likely its own ADR.
- #87's earned-gate ruling (Decision 4) — a maintainer semantics decision.
- `consensus` + `stake-anchor` re-derivations — unchanged from ADR-0003 Deferred.
