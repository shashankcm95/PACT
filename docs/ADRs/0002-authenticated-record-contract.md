# ADR-0002 — The authenticated-record contract + the deliberate ingress-vs-read asymmetry

**Status:** proposed (2026-07-12)

<!-- Proposed, not accepted: this NAMES an existing contract + DOCUMENTS a deliberate asymmetry and DEFERS the
one open decision (does the read chokepoint gain root_valid + audit-inclusion?) to the arming boundary. It changes
no behavior; it makes an implicit, duplicated contract explicit so it cannot drift silently. Issue #89 / F14. -->

## Context

The "authentic record" contract is implemented at **two** chokepoints with **divergent check-sets**, and a
**third** write path that authenticates no PROVENANCE (it enforces integrity + structure, never a signature).
Today this is tolerable because every trust weight is SHADOW
(gates nothing); it becomes load-bearing the instant a read-path gate arms. Grounded in the code:

| Check | `receiveFrame` (ingress, `v0/src/frame/frame.js:81-123`) | `verifiedRecords` (read/compute, `v0/src/trust/read-gate.js:32-60`) | `appendRecord` (write, `v0/src/lib/record-store.js`) |
|---|---|---|---|
| structural validity (`validateRecord`) | ✅ (:87) | — (relies on the store's row filter) | ✅ (content-shape) |
| content-address integrity (`computeRecordId` == `record_id`) | ✅ (:90-92) | ✅ (via the store's on-read content-address verify: `loadRecordFile` re-derives + drops on mismatch) | ✅ (the store's sole INTEGRITY guarantee) |
| **`root_valid`** — `isKnownRoot(parent_human_uid)` (INV-18) | ✅ (:96) | ❌ **ingress-only** | — |
| per-sender signature (`verifyRecordSig` under the sender's registered key) | ✅ (:98-102) | ✅ (:48-55) | ❌ **no sig required** |
| **§7 audit attachment** (STH sig + inclusion proof when present) | ✅ (:110-122) | ❌ **ingress-only** | — |

Two consequences the issue names:

1. **The merkle/audit anti-equivocation layer gates nothing the trust engine reads.** Inclusion proofs are
   verified at ingress (`receiveFrame` :106-118) and never re-consulted on the read path (`verifiedRecords`
   consults only the signature). The audit layer and the trust-compute layer are **disjoint** — "merkle layer
   BUILT" must not be misread as "equivocation defended" for what the engine weights (adjacent to #92 / F17).
2. **The store is locally forgeable and the read gate is the real defense.** `appendRecord` persists a record
   that never passed `receiveFrame` (no signature required — the store "is not a sandbox"; integrity ≠
   provenance, the #273 family). `verifiedRecords` is therefore the SOLE store-read authentication every weighted
   record passes — and it is **weaker than ingress on two axes** (`root_valid`, audit-inclusion). A registered
   persona whose `parent_human_uid` is *not* a known root, or a record with no verified inclusion proof, is
   DROPPED at ingress but WEIGHTED on the read path. (Two folds — `direct.js` / `cross-verify.js` — accept a
   caller-injected `recs` set under the contract, documented-not-enforced, that it IS `verifiedRecords` output; a
   shared predicate per Decision 3 would make that enforceable. `isKnownRoot` also appears in the advisory
   `issuance-policy` readout, which does NOT filter the weighted set — so `root_valid` stays read-chokepoint-absent.)

Any future change to "what makes a record authentic" must be mirrored across these paths or they drift silently
(the N-bespoke-authentications smell). A decision is needed **now**, while SHADOW makes it free — after a
read-path gate arms, changing the read-chokepoint contract is a trust-boundary migration.

## Decision(s)

1. **Name the authenticated-record contract explicitly, once** — the union above IS the contract: *structure +
   content-address integrity + per-sender signature + `root_valid` + audit-verified-when-present*. `receiveFrame`
   is the reference implementation (the full contract); every other path is defined as a **named subset of it**,
   never an independent re-derivation. Upholds the PRD "one authentic-record contract" principle (kills the
   duplicated-implicit-contract smell).

2. **Document the read chokepoint's subset as DELIBERATE-for-SHADOW, not principled-safe** — `verifiedRecords`
   enforces *content-integrity (via the store) + per-sender signature* only. `root_valid` and audit-inclusion are
   **ingress-only today**. This is tolerable **solely** because the weight it feeds gates nothing (SHADOW); it is
   NOT a claim that the read path's subset is the correct armed contract. We do not invent a safety rationale the
   code does not earn (NS-9: narrowed is never reported as closed).

3. **DEFER the open decision to the arming boundary, with a hard revisit trigger** — whether `root_valid` and
   inclusion-proof presence become **read-gate requirements** is decided *before the first read-path gate arms*,
   not assumed. The natural home is ADR-0001 Decision 4, which **proposes** relocating the anchoring/freshness
   filters into `read-gate.js` as `authenticatedAnchoredRecords` — **NOT yet built** (that function exists only in
   these two ADRs; today the filters live in `convert.disjointPaths`, `v0/src/trust/convert.js:89-90`). That
   proposed relocation is where the read chokepoint would ALSO gain the ingress-only checks. Revisit trigger:
   **the operator elects to arm a read-path gate** (NS-7, operator-only — Claude never arms).

4. **Guard against silent drift until then** — a cross-reference comment at BOTH chokepoints (`receiveFrame` and
   `verifiedRecords`) points here, so an editor changing the authentication check-set in one path is confronted
   with the other path and this ADR. This is the cheap, no-behavior-change half of the "name it once" fix; the
   shared-`isAuthentic(record, registry)` predicate (the code half) is deferred to the arming boundary with
   Decision 3 (YAGNI while the subset is deliberate and SHADOW).

## Consequences

**Easier:** the contract is discoverable and named; the audit-vs-compute disjointness and the read-path's
two-axis weakness are disclosed, not latent; a future check-set change surfaces both paths.

**Harder:** nothing today (documentation only). At the arming boundary, Decision 3 forces an explicit choice
rather than inheriting the SHADOW subset by default — deliberately (inheriting it silently is the hazard).

**New residual (disclosed):** this ADR does NOT close the asymmetry — it names it and schedules the decision.
Until a read-path gate arms, the trust engine continues to weight records that would fail ingress on `root_valid`
/ audit-inclusion; that is safe only under SHADOW and is the exact thing Decision 3 must resolve before arming.
The audit/merkle layer remains single-node and consults-nothing-on-read (#92 / F17 territory) — orthogonal, not
closed here.

## Deferred (recorded, not built)

- **The shared `isAuthentic(record, registry)` predicate (the code-refactor fork).** The other resolution the
  issue offered — both paths call one predicate — is deferred: while the read subset is deliberate-and-SHADOW, a
  single predicate would either over-check the read path (regressing to ingress semantics before that is decided)
  or carry a mode flag (re-introducing the divergence it removes). Revisit with Decision 3 at the arming boundary.
- **Arming any gate.** Accepting this ADR arms nothing; it schedules a decision. Arming stays operator-only /
  NS-7-gated (ADR-0001 Deferred). Claude never sets an arm flag.
