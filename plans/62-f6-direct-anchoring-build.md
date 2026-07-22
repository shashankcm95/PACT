# Plan 62 — F6 Wave-3: build `direct` anchoring (implements ADR-0004 Decision 1)

**Status:** BUILT + VALIDATED (code-reviewer initially SHIP_WITH_FIXES -> SHIP after fixes; hacker + honesty-auditor SHIP). **Epic:** #96. **Governing ADR:** `docs/ADRs/0004-direct-alpha-blend-re-derivation.md` (proposed, VERIFY-board-confirmed). **SHADOW; arms nothing.**

## Goal

Move `direct` from OPEN to ANCHORED (`#83` Part-2 `6/9 -> 7/9`) by implementing the board-confirmed re-derivation:
base `alpha` on the RAW interaction count, anchor the positive `rEv` leg into `directE` only, keep `sEv`/resolution/
consensus RAW. Disarmed = value-identical (one additive `rRaw` field). NS-9 holds at `model.js trust()`.

## The build (3 src edits)

1. **`v0/src/trust/direct.js`** — snapshot `const reg` first (MED-1); add the fallback seam
   `posSet = recs || authenticatedAnchoredRecordsFrom(all, reg, meCtx)` + `posIds = new Set(posSet.map(r => r.record_id))`;
   compute BOTH `rEvRaw` (all uncontested) AND `rEvAnchored` (uncontested AND in `posIds`); return
   `{ ...opinion(rEvAnchored, sEv), rRaw: rEvRaw }`. `sEv`/`validContests`/`agentClaimIds`/crater stay on `all` (raw).
2. **`v0/src/trust/model.js`** — repoint `alpha` off the (now anchored) `d.r` onto `d.rRaw + d.s` (THE load-bearing
   invariant, ADR-0004 Decision 2) + a load-bearing comment (provenance != interaction count; do not re-couple).
3. **`v0/src/trust/consensus.js`** — read `d.rRaw` (not the anchored `d.r`) for the raw interaction-count weight
   (ADDED at VALIDATE per the code-reviewer MEDIUM; value-identical today, satisfies the Decision-2 forward contract).

## Collateral (3 test edits)

4. **`v0/test/integration/f6-wave3-direct-anchoring.test.js`** — NEW, RED-first: M0 (trust()-monotone + non-vacuous),
   M1 (alpha provenance-invariant, strictly-un-anchored fixture), V0 (trust() disarmed value-identity at the public
   surface), D1 (standalone narrows), D2/D3 (raw resolution + crater under arming), D4 (recs-seam wcons invariant),
   D6 (direct() disarmed value-identity), D7/D8 (proto-safety + co-arming absence), S1 (structural: no standalone
   `direct` in ANY src mean-consumer).
5. **`v0/test/integration/f6-wave1-anchoring.test.js`** — T3 repurpose: `direct` now NARROWS armed (was asserted
   byte-identical); creator-standing/premise-score stay deepEqual (anchored confirmer survives). Reframe the message.
6. **`v0/test/integration/authenticated-read.test.js`** — importer-guard exact-set `+= 'trust/direct.js'` (the
   deliberate-update monotonicity signal; ADR-0004 did the review).

## RED-first sequence

- (A) write the witnesses -> run vs CURRENT impl: M0/M1/D1 RED (arming is inert -> non-vacuity fails).
- (B) implement direct + model.js -> GREEN.
- (C) NON-VACUITY proof of the build invariant: temporarily revert `model.js` `alpha` to `d.r` -> M0/M1 RED (the
  `+0.056` inversion) -> restore. Proves the witnesses catch the exact one-line slip the board flagged.

## VALIDATE (post-build, 3-lens — required for trust-math/security-sensitive)

code-reviewer (correctness) + hacker (Rule-2a live-probe the BUILT diff) + honesty-auditor, then pre-PR CodeRabbit.

## VALIDATE result — SHIP (2026-07-22)

**RED-first executed (all three steps):**

- (A) witnesses vs CURRENT impl: `M0/M1/D1` RED (arming inert), `D6` RED (no `rRaw` yet); guards `D2/D3/D4/D8` green.
- (B) implemented `direct.js` + `model.js` -> f6-wave3 GREEN.
- (C) NON-VACUITY proof (captured, addressing the "process-claim" audit note) — reverted `model.js` `alpha` to `d.r`:

  ```text
  === BROKEN alpha (d.r): M0/M1 must go RED ===
    FAIL - M0 trust() NS-9: arming NARROWS trust (a broken alpha-on-anchored would RAISE it); non-vacuous
    FAIL - M1 alpha provenance-invariant: alpha unchanged armed-vs-disarmed while direct.r strictly narrows
  === restored: full f6-wave3 must be GREEN === [f6-wave3-direct-anchoring] 10 passed, 0 failed
  ```

**3-lens board (no CRITICAL/HIGH/BLOCK; final SHIP after folding the fixes below — code-reviewer opened SHIP_WITH_FIXES):**

- **code-reviewer** SHIP_WITH_FIXES — re-ran the RED proofs himself (broke alpha -> M0/M1 RED; broke recs-seam -> S1/D4 RED). Findings folded: [MED] `consensus.js` now reads `d.rRaw` literally; [LOW] `direct()` JSDoc `@returns` updated.
- **hacker** SHIP — 264-case brute-force on REAL signed frames: 0 NS-9 violations, `max(armed-disarmed)=0`; reconstructed the `+0.056` inversion under broken alpha (load-bearing confirmed); no recs-seam/co-arming/proto-pollution bypass. Findings folded: [LOW] S1 broadened to ALL src consumers; #86/#87/dedup confirmed as DISCLOSED, correctly-gated pre-arm residuals (no action).
- **honesty-auditor** SHIP — re-derived NS-9 by hand; confirmed M0/M1 non-vacuous. Findings folded: [LOW] `V0` pins `trust()` disarmed value-identity at the public surface; [LOW/NIT] D7 runtime + D8 positive control added.

**Suite:** 64 files, 931 passed, 0 failed; eslint 0. Nothing arms (`convert.actionable` literal false). `#83` Part-2 `6/9 -> 7/9` on merge.

