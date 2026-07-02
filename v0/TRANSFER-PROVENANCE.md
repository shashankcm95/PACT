# PACT v0 — transfer provenance

Every primitive under `src/lib/` was **surgically transferred** from the Power Loom toolkit
(`claude-toolkit`) per [the v0 build plan](../plans/00-v0-build-plan.md) §4. This file is the
auditable manifest: source path, the toolkit commit it was taken from, and exactly what was
adapted. The transfer boundary is deliberately legible — a PACT value (provenance).

- **Source repo:** `claude-toolkit`
- **Source commit:** `5c6c390` (branch `feat/ghost-heartbeat-prC-scheduler-judge-bin`), 2026-06-21
- **Source dir:** `packages/kernel/_lib/`

| File (`v0/src/lib/`) | Source | Disposition | Notes |
|---|---|---|---|
| `canonical-json.js` | `canonical-json.js` | **VERBATIM** (byte-identical; sha256 prefix `e8a47334`) | deterministic sorted-key serializer + depth/width bounds; zero internal deps |
| `deep-freeze.js` | `deep-freeze.js` | **VERBATIM** (`67c1a16a`) | recursive immutability; zero deps |
| `path-canonicalize.js` | `path-canonicalize.js` | **VERBATIM** (`48d83b7b`) | `checkWithinRoot` + `isSafePathSegment` (the #215 PRE-join guard); zero deps |
| `atomic-write.js` | `atomic-write.js` | **COPY + 1 adaptation** | `currentUid` INLINED (the only symbol it used from `safe-resolve.js`) — a 2-line `process.getuid()` wrapper; drops the 123-line `safe-resolve` dep. Behavior byte-identical. |
| `record.js` | `transaction-record.js` | **DERIVED (surgical)** | KEPT field-agnostic content-address (`computeRecordId` ← `computeTransactionId`) + the INV-22 idempotency pattern (key re-derived from body, never trusted). RE-AUTHORED the field-bound helpers to PACT frame fields. DROPPED kernel-spawn semantics: `computeGenesisHash`, `computePostStateHash`/git-tree edges, `isStateChanging`, bootstrap sentinels, A10 `validateSemantics`, two-phase-commit, `isGenesisPosition`. |
| `record-schema.json` | `schema/transaction-record.schema.json` | **RE-AUTHORED** | the hidden transfer file the `require()`-probe missed (VERIFY board cluster 1). `required[]` re-authored from 8 kernel-spawn fields → the 7 PACT frame fields. |
| `record-store.js` | `record-store.js` | **DERIVED (surgical)** | KEPT content-address + verify-on-read (the #273 three-part gate) + INV-22 dedup + the path-safety posture. ADAPTED keying single-node `runId` → **per-receiver**, with the receiver key HASHED to a 16-hex segment (traversal impossible by construction; cluster 3). DROPPED `readByPostStateHash` (no state-hash chain in v0). |
| `edge-attestation.js` | `edge-attestation.js` | **COPY + 2 adaptations** | KEPT ed25519 alg-pinning, canonical-base64/64-byte gate, the Option-B `resolveSigner` seam, fail-closed verify. ADAPTED: `loadPublicKey` takes `opts.publicKeyPem` ONLY (NO `LOOM_EDGE_VERIFY_KEY` env default — per-sender resolution; cluster "no shared default"). Renamed `edge_id`→`record_id`; dropped the `signEdgeId`/`verifyEdgeSig` edge-lane aliases (unused in PACT). |

## Why "derived", not "vendored"

The verbatim files are true byte-for-byte copies (auditable by sha against the source commit).
The three DERIVED files (`record.js`, `record-store.js`, `record-schema.json`) intentionally
diverge: a faithful copy would drag kernel-spawn semantics PACT does not use (the §11
anti-overclaim — "budget the novel boundary as greenfield, not reuse"). They keep the
*mechanisms* that earned reuse (content-address, verify-on-read, INV-22, ed25519, path-safety)
and shed the rest.

## Carried residue (in-scope by design, spec §10.5)

`edge-attestation.js`'s env-PEM signing default is **integrity-only** (a same-uid caller can
read `LOOM_EDGE_SIGNING_KEY` and co-forge — integrity ≠ provenance). The v0 PROVENANCE gate
proves separateness OUT-OF-BAND (the acceptance test clears the env key so signing only
succeeds via an injected separate-uid signer). Any weight gated on the env default stays SHADOW.
Full provenance close (signed/kernel-writer custody) is the post-v0 step.

## Borrow-arc transfers (plans/27, Phases 1-6) -- beyond `src/lib/`

The scaffold table above covers the original `src/lib/` transfer. The **toolkit->PACT borrow arc**
(`plans/27`, Phases 1-6, PRs #25-#35) borrowed further primitives into `src/lib/`, `src/identity/`, `src/trust/`,
and `src/audit/`. This section is the manifest EXTEND the arc's Phase 0 charter named (`plans/27` §4) but that
never shipped as its own wave -- recorded here at phase-close (the honesty half; the bidirectional cross-repo CI
sha/vector-match check remains a NAMED RESIDUAL, below + in the `plans/27` phase-close sign-off).

| File (PACT) | Source (toolkit) | Disposition | Borrow-direction / seam |
|---|---|---|---|
| `src/lib/refuse-alert.js` (#25) | `kernel/egress/alert.js` (`emitEgressAlert`) | **SHAPE-borrowed** -- out-of-band stderr, reason-positional-authoritative, never-throws, class-tagged | toolkit->PACT; reconciled at point-of-use (PACT DENY is no-echo-to-caller, so this is operator-side only) |
| `src/lib/arm-flags.js` (#33, P5-W1) | `lab/_lib/host-claude-guard.js` (`isDeployFlagSet` lenient half) | **SHAPE-borrowed** -- the LENIENT deployed-signal predicate (typo fails CLOSED). `parseEnabledFlag` is PACT-INTERNAL (hoisted from `request-auth.js`, NOT a toolkit borrow -- plans/28 charter correction #1); the ASCII-trim divergence from the toolkit's Unicode `.trim()` is deliberate/load-bearing | toolkit->PACT (lenient half only) |
| `src/trust/arming-coherence.js` (#34, P5-W2) | `lab/_lib/world-anchor-arming.js` (`armingCoherence`) | **SHAPE-borrowed** -- the both-or-neither preflight. FULLY-DI (reads NO env var; plans/28 charter correction #4) vs the toolkit's one-live-flag reader; the return-field `admissionArmed` matches the toolkit contract | toolkit->PACT (shape only; semantics re-derived for zero-flag reality) |
| `src/lib/record-store.js` `loadRecordFile` (#27, P2) + `src/audit/audit-log.js` `readLeaves` (#28, P2b) | the toolkit size-cap-before-read fd-safe read shape | **SHAPE-borrowed** -- `open(O_NOFOLLOW\|O_NONBLOCK)`->fstat-same-fd->non-regular/oversize-reject->bounded-read. Two DIVERGENT strategies (record-store fail-soft-null+1MB; audit-log fail-CLOSED-throw+64MB) -- deliberate, not a copy | toolkit->PACT |
| Phase 6 (#35) authenticated-minter template (`identity/`+`lib/`+`trust/read-gate`) | `kernel/egress/approval.js` (`approvalSigBasis`+`verifyApproval` replay half) | **DESIGN-ONLY (not built)** -- SCOPED in `plans/29`; no code. PACT already borrowed `approvalSigBasis` once for the STH (`merkle.js sthBasis`, charter correction #1) | toolkit->PACT (deferred; design artifact only) |

**Borrow-backs (PACT->toolkit), Phase 4 (#30):** a verified RECONCILIATION, NO code change -- the toolkit already
solved each at the right seam (`plans/27` Phase-4 result). 4a no-env-fallback + the vacuity-verdict were
ALREADY-SATISFIED; 4b throw-on-raw-key + `receiverSegment` were N/A. Two deeper-parity options stay BOARD-GATED
with migration paths (they regress live toolkit callers), NOT borrowed.

**NAMED RESIDUAL (deferred, cross-repo -- phase-close Principal-SDE MEDIUM + Architect LOW):** the `plans/27` §4
byte-lock rule ("if either side hardens canonical-json / INV-22 / the ed25519 leaf, sync the other IN THE SAME
WAVE") is a MANUAL convention -- the proposed bidirectional CI sha/vector-match check does NOT exist. Nothing in
Phases 1-6 depends on it; it would only bite a FUTURE canonical-json/ed25519 change on either side. Deferred, not
silently dropped -- cross-repo CI infra, out of scope for a design-only arc close.
