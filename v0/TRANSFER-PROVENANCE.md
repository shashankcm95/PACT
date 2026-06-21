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
