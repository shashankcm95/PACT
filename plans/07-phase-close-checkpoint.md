---
lifecycle: persistent
created: 2026-06-22
phase: PHASE-CLOSE (v0 → P2 → P3 → P-minter → P-broker → CI)
status: CLOSEABLE-WITH-NOTES (3/3) · inflection CONFIRMED (3/3)
---

# 07 — Phase-close checkpoint (the integrated substrate, at the inflection)

A 3-lens phase-close over the INTEGRATED substrate (not a per-wave VALIDATE) — run as a background Workflow
(the first since the orphaning bug was cleared; it completed clean). PM/honesty + Principal-SDE/code-reviewer
+ architect, each full-context, read-only, structured verdict.

## §0 Verdict

**CLOSEABLE-WITH-NOTES — unanimous (3/3). Inflection read CONFIRMED — unanimous (3/3).**

The substrate meets its exit criterion: an honest, **all-SHADOW** substrate whose every claim traces to
evidence and whose residuals are loud + test-forced. SHADOW verified end-to-end: `convert.actionable` is
hard-`false` (convert.js, INV-16), `mayGate` is fail-closed AND consumed only in tests (zero action paths),
no mutable score store exists (derived-on-read, INV-18 by construction), the one-way DAG `lib→atms→trust→
grounding` is grep-clean (zero reverse edges) + tripwire-guarded. The custody close→narrow→mechanism-not-real
reframes held under board pressure; the VALIDATE-caught live TOCTOU was fixed + recorded, not buried.

**Inflection CONFIRMED:** the in-process mechanisms are built; more SHADOW code will NOT move trust (OQ-NS-6).
The obvious next-builds (P4 per-path-bar+stakes-throne; caller-auth/R2; broker-deployment-as-code) are each
premature or deployment-gated. Nuance (honesty LOW): P-broker already crossed to a world-anchorABLE
*mechanism* — strictly more advanced than the unbuilt P4/caller-auth; the inflection slightly understated that.

## §1 Findings (convergent + per-lens)

| # | Sev | Finding | Lenses | Disposition |
|---|---|---|---|---|
| 1 | **MEDIUM** | **CONTEST dual-purpose discriminant** — a record carrying both `target_claim_id` (trust/direct) + `target_premise_id` (grounding/creator-standing) has no schema gate → the one latent TWO-WAY path in the one-way DAG; no contamination test. Carried since plans/03 (MAJOR), re-deferred 04/05. | code-reviewer + architect (convergent) | **CONSOLIDATION wave — #1.** Close BEFORE P4 adds CONTEST producers: a JSON-schema `if/then` discriminant OR split `CONTEST_CLAIM`/`CONTEST_PREMISE` + a reject-on-both store-boundary test. |
| 2 | **MEDIUM** | **P4 sequencing guard is comment-only** — `convert.js` says "actionable MUST NOT flip until P4 bars + U2" but no test enforces it; a future edit setting `actionable:true` passes silently. | code-reviewer | **CONSOLIDATION wave.** Add a test: `convert().actionable===false` + `mayGate` refuses high-stakes — the machine-readable guard. |
| 3 | LOW | **composed P2/P3 real-path acceptance test** — unit tests mock the store; the broader composed real-read-path gate (Rule-2a-corollary) is carried. (Partially covered: minter.test.js exercises the real disk store.) | architect | CONSOLIDATION (optional) — a composed end-to-end real-path test. |
| 4 | LOW | **v0/README.md count-drift** — says 121 tests + omits broker files (root README/plans correct at 148/11). The one concrete claim-vs-artifact mismatch. | honesty | CONSOLIDATION — cheap doc fix. |
| 5 | LOW | **broker-sign.js fd leak on `fail()` inside try/finally** — `process.exit` skips `finally`→fd leaks on the interior fail paths; OS-reclaimed (short-lived CLI), no operational impact, structurally impure. | code-reviewer | CONSOLIDATION — close before `fail()` or restructure. |
| 6 | LOW | **`mayGate` returns true for non-high-stakes** — a permit-verb reading as an action-permit, safe only because unconsumed. | honesty | CONSOLIDATION — a one-line header note that `mayGate` is itself SHADOW/unconsumed (its true-branch authorizes nothing today). |
| 7 | LOW | ~~CI node-20 leg grep-asserted, not run~~ | code-reviewer + architect | **ALREADY RESOLVED** — the first Actions runs went green on node 20+22 (push-to-main + PR #1, during the CodeRabbit dogfood). The lenses reviewed the stale plan/06 "pending" text. |

No CRITICAL or HIGH. No over-claim escaped a lens.

## §2 Decided frontier (synthesized from the 3 recommendations)

The lenses split on *order* but converge on the shape:

1. **CONSOLIDATION wave (NEXT — the only honest in-process build left).** Discharge the carried debt the
   checkpoint named — finding #1 (CONTEST discriminant, the load-bearing one) + #2 (P4 guard test) + the
   small items (#3–#6) + reconcile the stale "first-Actions-run pending" docs (#7 is now green). This hardens
   the seams BEFORE any frontier stresses them; everything else is SHADOW-multiplication the inflection rejects.
2. **THEN a cross-uid DEPLOYMENT spike (the real trust-mover).** The broker is custody-MECHANISM + world-
   anchorABLE; custody-real is undelivered. A genuine separate-uid (or container/enclave) deployment of
   `broker-sign.js`, verified out-of-band, is the ONLY available world-anchored signal (it HARDENS
   non-exfiltration where same-uid physics cannot). Needs NO new src/ seam (`opts.signer` carries it:
   `args=['-u','pact-broker',…]` + a privileged launcher). It also makes caller-auth/R2 (SO_PEERCRED)
   concrete — meaningful + testable at the cross-uid boundary, vacuous in-process. **Partly an OPS act
   (the orchestrator builds the launcher/daemon + runbook; the human runs + verifies out-of-band).**
3. **U2 (epistemic-independence estimator) = the eventual gate-enabler, but RESEARCH not impl.** It's the
   single `epistemicIndependence()` lift-point everything reads through (textbook Open/Closed at the
   frontier), but "an estimator for epistemic independence" is the hard problem restated — a modeled-not-real
   estimator would violate OQ-NS-6. Design/research later; do NOT build a SHADOW estimator now.

**Explicitly NOT next:** P4 caps/stakes-throne (needs a 2nd real root — deployment-gated) and caller-auth as
net-new in-process code (vacuous same-uid). `convert.actionable` cannot honestly flip until U2 closes.

## §3 Forward-contract readiness

The seams for every future direction already exist + are sound: `convert.actionable` (single flip-point,
`mayGate` authoritative — it `void`s the caller label so a forged opinion can't unlock), the
`epistemicIndependence()` P5 lift-point (single, signposted), the registry U1 seam (registry-not-oracle,
rootOf-keyed, SBT-upgradeable behind the seam), and `opts.signer` (carries the cross-uid deployment, zero
change). **The ONE seam that must be reshaped BEFORE the next frontier = the CONTEST discriminant** (finding
#1) — the only seam currently shaped to leak across the layer DAG when a new producer (P4) arrives.

## §4 Sign-off

Phase v0→CI: **CLOSEABLE-WITH-NOTES**, all notes are SHADOW-tolerable (no weight gates an action). The
next wave is CONSOLIDATION (close #1–#6), then the cross-uid deployment spike. This record is the phase-close
artifact (mirrors the plans/03 precedent).
