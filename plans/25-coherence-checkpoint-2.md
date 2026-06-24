---
lifecycle: persistent
kind: coherence-checkpoint
created: 2026-06-24
phases-reviewed: v0 + P2 + P3 + P-minter + P-broker/custody + merkle/audit + U1-stake (S1-S5) — integrated
verdict: COHERENT (4/4 lenses)
supersedes-baseline: plans/03 (v0+P2+P3) — extends it to the full built substrate
---

# Coherence checkpoint #2 — the full built substrate (integrated)

The phase-close analog for PACT (no toolkit `/phase-close` infra here): FOUR independent full-context lenses
reviewed the WHOLE built substrate as an integrated whole at phase altitude — cross-phase drift, integration
seams, accumulated debt, and provenance/SHADOW-boundary integrity that no single wave's VALIDATE could see.
Extends `plans/03` (which reviewed v0+P2+P3 and CARRIED three findings to the authenticated-minter wave) across
everything that merged since: P-minter, P-broker/custody (R1/R2 dogfooded), the merkle/audit anti-equivocation
layer, and the entire U1-stake arc (S1-S5). Parallel foreground spawns; live-probed where it mattered.

## Verdict: **COHERENT — 4/4 lenses** (0 INCOHERENT, 0 CRITICAL)

- **claim / residual (honesty-auditor):** COHERENT-WITH-NOTES. Claims cohere honestly across all phases; the
  NARROWS-not-HARDENS residual law is applied uniformly into the newest layers (merkle + stake); no NS-9
  violation. The one real gap is documentation drift (the README entry point — see Findings).
- **correctness / seam / debt (code-reviewer):** COHERENT-WITH-NOTES. Cross-phase seams hold across the full
  ~45-module surface (INV-14 chokepoint, `rootOf`-keying, SHADOW boundary, the layering DAG) — verified
  firsthand; suite green; 0 critical/major code issues.
- **layering / design (architect):** COHERENT-WITH-NOTES. The one-way DAG, identity-below-trust, the
  mechanical/Sybil/human-accountability split, the StakeAnchor↔custody-minter↔convert seam, and the principled
  SLASH-permanent/evidence-decays asymmetry all hold firsthand.
- **provenance / SHADOW-boundary (hacker, live-probed):** COHERENT-WITH-NOTES. No trust input escapes
  integrity-only to gate; `actionable` is a hardcoded `false` (probed across 4 hostile anchors); integrity ≠
  provenance holds uniformly (probed); the merkle/audit layer is a genuine SINK.

## The headline: all THREE plans/03 carry-findings are RESOLVED (verified firsthand, not from the plans' summaries)

| Carried finding (plans/03 → "the authenticated-minter wave") | Status |
|---|---|
| **MAJOR — dual-purpose `CONTEST`** (a record carrying BOTH `target_claim_id` AND `target_premise_id` — an undocumented cross-layer side-channel) | **RESOLVED** — `lib/record.js:160-164` enforces AT MOST ONE, **type-blind** (a forged type can't bypass), on BOTH the write (`appendRecord`) and the read (`loadRecordFile` drops it) path. Live-probed: a both-fields record planted on disk with a valid signature is dropped on read. Cross-contamination tests at `record.test.js:105-117` + `record-store.test.js:139`. |
| **MINOR — integrated P2/P3 real-path acceptance test** | **RESOLVED** — `test/integration/minter.test.js:172` mints real frames → asserts `crossVerify>0`, `creatorStanding.n_premises==1`, `direct.r>0` on the real read path (the Rule-2a-corollary composition). *(Split across files — see carried hygiene below.)* |
| **MINOR — P4 sequencing guard** | **SHADOW-seal codified** (`trust.test.js:285` asserts `actionable===false` + `mayGate(highStakes)===false` + `epistemicIndependence()==='WEAK'` by name); the P4-specific throne-rebind ordering is **correctly deferred** (no P4 code exists to codify into). |

## What COHERES (audited firsthand + live-probed — do not re-litigate)

- **The one-way DAG survives the new layers.** `atms → trust → grounding`, `identity` below `trust`
  (`read-gate.js:14` imports `identity/registry`); grep-verified **0 reverse edges** with `stake-anchor →
  identity/slash`, custody, and merkle/audit all in place. `layering.test.js` 7/7 — and it ADDED the exact ban
  the stake arc risked (`identity` never imports `trust`/`grounding`, `:81-87`) plus a vacuous-pass precondition
  guard so a renamed/emptied layer dir cannot silently disarm the tripwire.
- **`verifiedRecords` (INV-14) is still the single provenance chokepoint** for every derived-on-read fold; the
  stake/slash/issuance layer inherits it wholesale (`stake-anchor.js:100`). Live-probed: unsigned /
  unregistered-key / wrong-key-claims-victim STAKEs all read `status:'none'` and never reach `meets_policy:true`.
  No new key path, no parallel store (NS-10 held).
- **SHADOW boundary is structural.** `convert.actionable` is a hardcoded literal `false` (`convert.js:134`),
  NOT anchor-derived — live-probed across 4 hostile anchors (throwing / lying `actionable:true` / scalar / absent)
  it stays false and a bad anchor is contained to `funded_root:null` (fail-closed) without DoSing the gate fields.
  `mayGate` is authoritative + fail-closed + **unconsumed by any action path** (grep-0 outside tests).
  `rootOf`-keying is the uniform Sybil unit across every gate including the new `stake-anchor.isSlashed`.
- **integrity ≠ provenance holds UNIFORMLY** (NS-2). Live-probed: 5 personas under ONE root each confirming a
  premise collapse to `n_confirmers:1`, WEAK — the bounded same-uid residual reads as advisory, never provenance.
  The `#273` honest-scope clause is present at every minting/reading boundary (`record.js`, `read-gate.js`,
  `minter.js`, `broker-sign.js`, `stake-anchor.js`, `issuance-policy.js`); no phase reports it CLOSED.
- **The merkle/audit layer is a SINK** — an INTEGRITY (anti-equivocation) substrate, not provenance. Live-probed:
  it admits an unsigned-but-content-valid record by design but REFUSES phantom leaves (`#273`), the STH is
  independently signed, and NO trust/grounding module reads inclusion as a weight (grep-0).
- **The minter is structurally key-free + throne-free** (accepts only `{signer, personaDid, humanUid}`, refuses
  cross-root minting); NS-5 (derived-on-read, no mutable score store) holds across every new module.
- **The decay asymmetry is principled, not an incoherence.** `direct`/grounding evidence decays (fading
  behavioral reputation); a `SLASH` is permanent-on-read because it models forfeiture of a discrete
  content-addressed commitment — a consequence of NS-5 append-only, not a mutable policy. A named append-only
  REINSTATE recovery seam is the deferred S6 governance lift-point. *(Settled doc-only in `plans/24`/#21.)*

## Findings

| # | Sev | Where | Issue | Disposition |
|---|---|---|---|---|
| 1 | **MAJOR** | `README.md:7` (+ doc-index `:11-37`) | The entry point was stale by a full phase — omitted the merkle/audit layer + the entire U1-stake arc, quoted "230 tests green" (now superseded; the same sentence says "never quote a remembered count"), "PRs #1-#9" (now #21). The cross-phase claim-vs-code drift this check exists to catch. | **FOLDED this checkpoint** — status-decay refresh of `README.md:7` (BUILT list + drop the literal count + PR range), `:9` (the stake-containment clause), + doc-index rows for `plans/07-25`. |
| 2 | MINOR | `stake-anchor.js:71-83` | `isSlashed` does two passes over `recs` (O(2N)); latent O(N²) if ever called per-root in a loop — diverges from the O(N+1) fix the P3 modules already adopted. Future risk, not current. | **CARRIED** — thread a pre-computed `recs` into `isSlashed` (private signature; contained to `stake-anchor.js` + its tests) when a multi-root batch path appears. |
| 3 | MINOR | `convert.js:117-124` + `weak-flag.js:38` + `standing.js:19` | The P4 throne-rebind ordering law is diffused across 3 comment sites — a forward contract that rots like a stale line-number. | **CARRIED** — fold the 3 sites to one canonical reference now; promote to an executable guard (actionable can't flip while a throne is unbound) when P4 lands. |
| 4 | MINOR | `u1-stake-dod` + `grounding.test.js` | The P2/P3 composition is real-path-gated but SPLIT — no single test asserts `direct` + `crossVerify` + `creatorStanding` all non-floor in ONE composed scenario. | **CARRIED** — optional hygiene: one composed P2+P3 acceptance test consolidating the seam. |
| — | NITs | `broker-sign.js:91`, `audit-log.js` header, `_SESSION-RESUME.md` counts | inline `plans/10` traceability cite; a one-line SINK-property header note (so a future wave that wires inclusion into a weight re-gates through `verifiedRecords` first); ephemeral stale counts. | **CARRIED** — cheap hygiene; none are coherence defects. |

## Bottom line

The substrate is **internally coherent** — the custody / stake / merkle layers slotted in without breaking a
single load-bearing invariant, and the minter wave cleared its entire carry-list. The only real cross-phase gap
was documentation drift (the README), folded here. The carried items are forward-looking hygiene (the P4 guard,
the `isSlashed` O(N+1), the composed acceptance test), none blocking. SHADOW holds end-to-end; OQ-NS-6 / NS-9 are
applied uniformly into the newest layers; the world-anchored frontier (a really-deployed slashable S6, the U1 /
U2 research frontiers) is unchanged and consistently named OPEN.
