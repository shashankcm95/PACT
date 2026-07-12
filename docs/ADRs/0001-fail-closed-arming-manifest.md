# ADR-0001 — Fail-closed arming manifest for the SHADOW→armed transition

**Status:** proposed (2026-07-09)

<!-- Proposed, not accepted: this records HOW arming will work; it arms nothing. Acceptance is the USER's gate. -->

## Context

The forces at play come from a north-star conformance audit of the built `v0/src` substrate (8 commitment
clusters, 17 adversarial agents, 73 graded invariants/landmines/decisions, 2026-07-09). The headline result is
reassuring and precise:

- **Zero outright violations.** The substrate is scrupulously honest and dark today. `convert.actionable` is a
  literal `false` (`v0/src/trust/convert.js`), the arming gates have no live consumer in the import graph, and
  the custody/provenance verifiers deliberately omit any `custodyReal` / `provenanceReal` field. NS-8 ("SHADOW
  until residuals close") and NS-9 ("narrowed is never reported as closed") are honored by *not acting*.
- **The debt is concentrated at one seam.** Every PARTIAL verdict clusters at the SHADOW→armed boundary — the
  exact apparatus that will flip this substrate from advisory to live. And at that seam the machinery is built
  **fail-OPEN and diffuse**, which is the opposite of what NS-8 requires when arming actually happens.

Concretely, the arming apparatus today:

1. **Fails open on an incoherent arm.** The armed admission gate degrades to admit-all when its sibling
   `signingArmed` is anything but strictly `true`, including a silent symmetric-truthy case
   (`admissionArmed: 1, signingArmed: 1`) that coerces to `coherent: true, reason: null` — no alert, still
   admit-all (`v0/src/trust/admission-gate.js`, `v0/src/trust/arming-coherence.js`). Issue #82 (F7).
2. **Narrows 1 of 8 consumers.** `filterAnchoredRecords` + `filterFreshVouches` compose only inside
   `convert.disjointPaths` (`v0/src/trust/convert.js`); the sole `verifiedRecords` chokepoint
   (`v0/src/trust/read-gate.js`) applies signature verification only, so the other seven trust/grounding folds
   read the raw log. Arming the registration/freshness defense covers one-eighth of the trust surface.
   Issue #81 (F6).
3. **Signs by default.** The broker's caller-auth proceeds when the allowlist is unset (`disabled` → proceed,
   `v0/src/identity/caller-auth.js`, `v0/src/identity/broker-core.js`), and its child-env denylist lets
   `BASH_ENV` / `ENV` / `PACT_ROOT_*` through (`v0/src/identity/broker-client.js`). Issues #78, #85 (F2/F10).
4. **Has no coherence preflight.** Four independent arm signals (`admissionArmed`, `signingArmed`,
   `meCtx.regProvenance`, `meCtx.freshness`), each fail-open when absent, with nothing tying them together —
   so a box can arm anchoring in `convert` while admission stays admit-all and the seven folds stay unanchored.
   Issue #84 (F9).

Two adjacent items must move with the cluster because they guard the guarantee and the key it protects: the
darkness witnesses are regex-evadable in 8 of 9 files (a future dynamic `require` could silently arm a gate with
the test still green, issue #94 / F19), and `custody-verify` C2.5 attests the sudo-wrapper file but not its
parent directory (a world-writable parent permits a rename/unlink swap that sudo execs as the broker uid → key
exfil, issue #79 / F3) — and that key is precisely what an armed broker ultimately protects.

A decision is needed **now**, while SHADOW makes it free. After the first gate arms, changing the
arm-resolution contract is a trust-boundary migration.

## Decision(s)

1. **Introduce a single fail-closed arming manifest — one coherence preflight, resolved once.** — Every arm
   signal is resolved together into one immutable `armedContext`; a gate reads its enable state only from that
   context, never from a loose `meCtx` key or an ad-hoc `evalArm`. This upholds **NS-8** (SHADOW until residuals
   close, then a coherent transition) and consolidates the two arm-reading idioms
   (`armingCoherence` vs `evalArm`) into one, draining the accreting `meCtx` bag (issue #90 / F15).

2. **Parse every arm signal asymmetrically; a garbage token fails CLOSED.** — Reuse the existing
   `v0/src/lib/arm-flags.js` semantics: an ENABLE-class signal requires a strict-truthy token
   (`parseEnabledFlag`); a "this box is deployed and must refuse" signal accepts any non-falsey token
   (`isDeploySignalSet`), so an operator typo or a bare `1` is read as *intent to deploy* and fails **closed**,
   never falling through to admit-all. This kills F7's silent symmetric-truthy admit-all and upholds the
   `security.md` asymmetric-flag rule.

3. **Refuse to arm ANY gate unless ALL are coherently armed together.** — The manifest is all-or-none across the
   admission gate, the signing gate, the anchoring/freshness filter, and the broker caller-auth. A partial or
   incoherent arm is a hard refuse (fail-closed), not a per-gate passthrough. This kills F9's incoherent
   partial-arm and upholds **NS-8**.

4. **Relocate the narrowing filters INTO the read-gate chokepoint.** — Add
   `authenticatedAnchoredRecords(meCtx)` ~~to `v0/src/trust/read-gate.js`~~ (superseded → a NEW
   `v0/src/trust/authenticated-read.js`) returning `verified → anchored → fresh`
   as one set, and ~~route all eight trust/grounding consumers through it (not just `convert.disjointPaths`)~~
   (superseded → route `convert.disjointPaths` ONLY; the rest are named residuals). Then
   arming anchoring ~~narrows the whole trust surface. This kills F6~~ (superseded → NARROWS, not closes, F6) and
   upholds **NS-4** (the Sybil defense must cover every fold, not one). **See the 2026-07-12 amendment below — the
   struck clauses were corrected by the W2b VERIFY board; the load-bearing decision stands.**

   > **Amended 2026-07-12 (W2b build — plans/56 §6/§7).** Two implementation clauses above were corrected by the
   > W2b VERIFY board. The chokepoint PRIMITIVE is built and `convert.disjointPaths` routes through it; but
   > **whole-surface NS-4 coverage remains a FUTURE architectural goal, NOT delivered by W2b** — F6 stays OPEN
   > (narrowed, not closed). What stands is the *shape* of the eventual close (ONE fail-closed chokepoint); the
   > negative-leg monotonic re-derivation that would actually achieve whole-surface coverage is unbuilt.
   > **(a) Location:** the composition lives in a NEW `v0/src/trust/authenticated-read.js`, NOT `read-gate.js` —
   > read-gate keeps its ADR-0002 sig-only SRP; the chokepoint fans in `{read-gate, registration-gate,
   > vouch-freshness}` (acyclic). **(b) Scope:** "route all EIGHT" is WRONG — the per-persona anchoring filter on a
   > NEGATIVE-evidence leg (CONTEST/SLASH/accusation) INVERTS the monotonic-narrow invariant (a dropped un-anchored
   > accuser RAISES trust). W2b routes ONLY `convert.disjointPaths` (a monotonic-safe positive VOUCH-graph read);
   > the other consumers are NAMED residuals (negative-leg anchoring needs a monotonic re-derivation; `consensus`
   > cascades to `direct`'s CONTEST leg; `stake-anchor` has no arm channel; freshness is a VOUCH-only no-op for the
   > 6 non-VOUCH folds). **F6 is NARROWED, not closed (NS-9).**

5. **Authenticate `human_uid` at registration BEFORE any gate consumes `rootOf`.** — Bind a persona to a root
   only via a root-signed `sigma_root` at registration (`v0/src/identity/registry.js`), so the Sybil unit
   (`rootOf`) is a real human root and not a self-asserted field. This kills F8 and upholds **NS-4**. Ordering
   is load-bearing: arming a gate that consumes an unauthenticated `human_uid` arms it over spoofable identity.

6. **Witness dormancy by module-graph, not regex; fix the custody parent-dir check in the same pass.** — Port
   all nine darkness witnesses to the `require.cache` / AST module-graph method already used by
   `admission-gate-darkness-witness.test.js` (kills F19, upholds **NS-9/L10** — the guard of the honesty claim
   must not be self-certifying), and extend `custody-verify` C2.5 to `lstat` the wrapper's parent directory and
   FAIL on a non-root-owner or group/world-writable parent (kills F3, upholds **NS-9** — no "not hijackable"
   PASS on a hijackable deployment).

## Validation — findings folded (2026-07-09)

This ADR is the output of a multi-lens review, not a speculative design:

- **Security (adversarial), x2 lenses** — live-probed F2 (default-open oracle), F6 (1-of-8 filter coverage),
  F7 (admit-all on partial arm), F8 (unauthenticated `human_uid` through the live read-gate), F9 (fragmented
  arm surface). Each carries a reproduction in its issue.
- **Correctness** — reproduced F1 (canonical-json data loss) end-to-end and F4 (stale VOUCH by readdir order)
  live; both cross-link here as consumers of the same read path.
- **Architecture** — identified the arming-surface fragmentation (F6/F9/F15) as one structural gap, not
  separate nits, and named the chokepoint-relocation fix.
- **Claim-vs-evidence conformance audit** — 73 graded commitments, **0 VIOLATED / 16 PARTIAL**, all 16 PARTIALs
  concentrated at this seam. The one verdict the adversarial pass flipped (NS-9 HONORED→PARTIAL) is F3, folded
  into Decision 6. Full scorecard tracked in EPIC #96.

## Consequences

**Easier:** arming becomes a single, auditable, fail-closed operation with one source of truth; a mis-configured
or half-armed box refuses loudly instead of silently running an unprotected path; the two arm-reading idioms
collapse to one and `meCtx` stops accreting.

**Harder:** arming is now all-or-none — an operator cannot arm one gate in isolation to test it. This is
deliberate (a single armed gate over an otherwise-unarmed surface is the exact fail-open hazard), but it means
the test path must arm the whole manifest in a sandbox rather than one gate at a time. Decisions 4 and 5 are also
non-trivial refactors (a chokepoint relocation across eight consumers; a registration-time signature binding).

**New residual (disclosed):** the manifest itself becomes a single high-value target — the file/flag that
decides "armed" must be root-owned and immutable under the same custody model as the broker key
(`plans/44` armed-loader discipline), or it reopens the very fail-open it closes. And this ADR does **not** close
the frontiers it sits above: U1 (human-uniqueness) and provenance-custody stay open; the manifest makes arming
*fail-closed*, it does not make arming *safe to do* — that still waits on the world-anchored residuals per NS-7.

## Deferred (recorded, not built)

- **The armed deployment itself.** Accepting this ADR arms nothing. Arming stays an operator-only, NS-7-gated
  act (separate uid / attested cross-uid broker / pinned keys); Claude never sets an arm flag. Revisit trigger:
  the operator elects to arm a first gate — at which point this manifest must already exist.
- **The on-chain slash (S6) and positive U2.** Out of scope and external/near-unclosable respectively; the
  manifest is orthogonal to both. `epistemicIndependence()` stays permanently WEAK per the 2026-06-23 amendment.
- **F1/F4/F11/F12 correctness fixes.** Real and cross-linked, but they are advisory-correctness bugs, not the
  arming-boundary primitive; they can land independently of this ADR (and F12 carries an open intent question —
  is un-earned "inform" deliberate? — to resolve before touching `direct.js`).
