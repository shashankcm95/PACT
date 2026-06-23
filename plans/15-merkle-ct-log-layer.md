---
lifecycle: persistent
created: 2026-06-23
wave: the Merkle / CT-log anti-equivocation audit layer (spec §7, MAJOR M2 / INV-10) — chosen by the 2026-06-23 recon
status: PLAN (pre-VERIFY)
---

# Merkle / CT-log audit layer — per-receiver inclusion + consistency proofs + STH (SHADOW)

> The spec's §7 `[ADOPT + BUILD]` anti-equivocation foundation (MAJOR M2): a PREV_HASH / content-addressed
> flat store cannot detect cross-node equivocation. This wave builds the RFC-6962 primitives + the per-receiver
> Merkle log + STH + the frame wiring + the equivocation-DETECTION logic — the foundation the whole
> network/propagation direction (research/25) sits on. All SHADOW; additive + non-breaking.

## §0 Frame — the honesty banner (read first)

This wave builds a **mechanism**, not a hardening (NS-7: it is in-process; it NARROWS the equivocation surface,
it does not by itself HARDEN trust — hardening needs the cross-node STH gossip + a world-anchored deployment,
deferred to the network phase). It is **additive + non-breaking**: new modules + an OPTIONAL frame field; the
existing 230 tests stay green. The spec §2 "receiver MUST verify `inclusion_proof_valid`, any fail → drop" is a
**network-phase requirement** — in single-node v0 there is no cross-node log to prove against, so v0 builds the
verifiable mechanism and verifies-WHEN-PRESENT; the MUST becomes load-bearing when frames cross nodes. Nothing
here gates a trust decision (SHADOW, NS-8); `convert.actionable` stays false, `mayGate` stays unconsumed.

## §1 The gap (firsthand — §5 has the probes)

`record-store.js` is a per-receiver, content-addressed, append-only, verify-on-read store — but a **FLAT SET of
record files**, and `listByReceiver` returns them in `readdir` order, NOT append order (P1). So today there is:
- **no ordered Merkle log** → no inclusion proof ("frame is in my log at position i");
- **no consistency proof** ("my log at size n is an append-only extension of size m" — no rewrite);
- **no STH** (signed (root, size)) and so no STH gossip → cross-node equivocation (a node showing two different
  logs to two peers) is UNDETECTABLE. This is MAJOR M2 / INV-10 (the spec amended INV-10 to per-receiver Merkle
  logs + RFC-6962 proofs + STH gossip, NOT a single global log).
The frame (`frame.js`) is specified (spec §2) to carry an `inclusion_proof` and `receiveFrame` to verify it, but
neither exists (P4). No Merkle code exists anywhere (P5) — greenfield.

## §2 The design

Three new pieces + one additive wiring; the one-way DAG stays `lib → atms → trust → grounding` (audit sits at
the `lib`/audit level, depends only on `lib`, never the reverse).

1. **`v0/src/lib/merkle.js` — RFC-6962 primitives (PURE, crypto-only, no I/O).**
   - `leafHash(buf) = sha256(0x00 ‖ buf)`, `nodeHash(l, r) = sha256(0x01 ‖ l ‖ r)` — RAW-BYTE domain-separated
     hashing (NOT the existing `sha256hex(string)`; merkle uses `crypto.createHash` over Buffers — P3).
   - `merkleRoot(leaves[])` — the RFC-6962 tree root (split at the largest power of 2 < n).
   - `inclusionProof(leaves[], i)` → audit path; `verifyInclusion(leafHash, i, treeSize, proof, root)` → bool.
   - `consistencyProof(leaves[], m, n)` → proof; `verifyConsistency(m, n, proof, rootM, rootN)` → bool.
   - Deterministic + matches RFC-6962 test vectors. The leaf data for PACT = the record's `record_id` bytes (so
     the Merkle leaf commits to the record's content-address; tampering the record breaks both record_id AND the
     leaf). Fail-closed on bad input (out-of-range i, m>n, empty).
2. **`v0/src/audit/audit-log.js` — the per-receiver Merkle LOG (the ordered leaf sequence + STH + proofs).**
   - Maintains an **append-ordered leaf sequence** per receiver (its own ordered structure — NOT the flat store's
     readdir order; one `leafHash(record_id)` appended in insertion order). Persisted (an ordered leaf file via
     `atomic-write`) so the order is durable + replayable.
   - `appendLeaf(record_id, opts)` (called alongside `record-store.appendRecord`), `currentSTH(signer, opts)`
     = sign `canonical({root, tree_size})` via `edge-attestation` ed25519 (P2; the basis is the canonical
     (root,size), signed like a record_id), `proveInclusion(i, opts)`, `proveConsistency(m, n, opts)`.
   - **STH** = `{ root, tree_size, sig }`; `verifySTH(sth, publicKeyPem)` reuses `verifyRecordSig`.
3. **`detectFork(sthA, sthB, consistencyProof)` (in audit-log) — the equivocation-DETECTION logic.** Given two
   STHs claimed from the SAME log: if `verifyConsistency` between them FAILS (or two different roots at the same
   size), the log forked → equivocation detected. This is the LOGIC, testable single-node with synthetic STHs;
   the cross-node GOSSIP TRANSPORT that exchanges STHs is deferred (§3).
4. **Frame wiring (additive).** `buildFrame(spec, signerOpts, {auditLog})` MAY attach `inclusion_proof` + the
   sender's `sth`; `receiveFrame(frame, {registry})` — when `frame.inclusion_proof` + `frame.sth` are present —
   runs `inclusion_proof_valid` (verify the STH sig against the sender's registry key, then verify the inclusion
   proof connects `leafHash(record_id)` to the STH root at the claimed index). Absent → v0 accepts (single-node;
   the MUST is network-phase). A PRESENT-but-INVALID proof → drop (the §2 rule, exercised when present).

## §3 The v0 scope boundary (build now / defer — confirmed with USER 2026-06-23)

| BUILD NOW (deterministic, testable single-node) | DEFER to the network phase |
|---|---|
| `merkle.js` RFC-6962 primitives (root, inclusion, consistency) | STH **gossip transport** (multi-node STH exchange) |
| `audit-log.js` ordered leaf log + STH sign/verify + proofs | Fork-detecting **witnesses** + eclipse defense (spec §8.5) |
| `detectFork` equivocation-DETECTION logic (synthetic-STH-testable) | The cross-node equivocation **RESPONSE** (quarantine / re-route) |
| frame `inclusion_proof` attach + verify-when-present | Making `inclusion_proof` MANDATORY (spec §2 MUST — load-bearing only cross-node) |

## §4 Test plan (TDD — non-vacuity is the load-bearing part; the hacker will probe it)

- **RFC-6962 conformance:** `merkleRoot` + `inclusionProof` + `consistencyProof` match the published RFC-6962
  test vectors (the 7-leaf reference tree + its audit/consistency paths). Deterministic across runs.
- **Inclusion NON-VACUITY (prove it can go RED):** a FORGED inclusion proof (wrong leaf, wrong index, tampered
  path node, wrong tree_size) MUST fail `verifyInclusion`. Inject each, watch RED, then the valid one passes.
- **Consistency NON-VACUITY (the anti-rewrite hinge):** build a size-m log; build a size-n log that REWROTE a
  past leaf (history-edit); `verifyConsistency` MUST FAIL (the no-rewrite guarantee). A legitimate append-only
  extension MUST pass. (This is the M2 anti-equivocation core — a vacuous consistency check = silent equivocation.)
- **STH:** `verifySTH` fails on a tampered root / tampered size / wrong key / non-ed25519 (alg-pin); a present
  signer required (no env default — P2 inherits edge-attestation's fail-closed).
- **`detectFork`:** two STHs from a FORKED log (different roots, overlapping size) → returns true (fork detected);
  two STHs from the same append-only log → false. Reject a vacuous "fork" from a malformed/empty STH.
- **Frame additive/non-breaking:** a frame WITHOUT inclusion_proof still `receiveFrame`-accepts (v0); a frame
  WITH a valid proof accepts; WITH an invalid proof → drop. The existing **230 tests stay byte-for-byte green**.
- **Leaf binds content:** tampering a record's payload changes its `record_id` → changes `leafHash` → breaks the
  inclusion proof (the leaf commits to the content-address).

## §5 Runtime Probes (firsthand — this session, against the repo NOW)

- **P1** the store is a content-addressed FLAT set; `listByReceiver` is `readdir`-order, not append-order
  (`record-store.js:174-178`) → the Merkle log needs its OWN ordered leaf sequence. CONFIRMED (read).
- **P2** `edge-attestation.js` ed25519 sign/verify (`signRecordId`/`verifyRecordSig`, alg-pinned, fail-closed, no
  env default) is reusable for STH signing. CONFIRMED (grep).
- **P3** `sha256hex` exists (`record.js:24`) but hashes a STRING over canonical-JSON — RFC-6962 needs RAW-BYTE
  domain-separated hashing (`0x00`/`0x01` prefixes over Buffers), so `merkle.js` uses its OWN `crypto.createHash`,
  NOT `sha256hex`. CONFIRMED (read) — a real trap to avoid.
- **P4** `frame.js` `buildFrame`/`receiveFrame` exist; the inclusion_proof attaches additively + the receiveFrame
  validation point is `frame.js:67+`. The spec §2 MUST is network-phase; v0 verifies-when-present. CONFIRMED (read).
- **P5** no Merkle / RFC-6962 code exists in `v0/src` (grep `leafHash|nodeHash|merkleRoot|consistencyProof` →
  empty). Greenfield. CONFIRMED.
- **P6** spec §7 mandates RFC-6962 per-receiver Merkle logs + inclusion + consistency + STH gossip; INV-10 amended
  (M2): `PACT-spec-v1.1.md:604-621,659-660`. CONFIRMED (read).
- **P7** baseline is **230 tests green** (`node test/run.js` this session). The build is ADDITIVE → 230 must stay
  green + the new suites added. CONFIRMED (ran).

## §6 DoD

- [ ] `lib/merkle.js` (pure RFC-6962) + `audit/audit-log.js` (ordered leaf log + STH + proofs + `detectFork`).
- [ ] Frame `inclusion_proof` attach (`buildFrame`) + verify-when-present (`receiveFrame`), additive.
- [ ] RFC-6962 test-vector conformance + ALL §4 non-vacuity tests GREEN (forged-proof RED, rewrite RED, fork RED).
- [ ] The existing **230 tests stay green**; new audit suite added; eslint clean; the layering tripwire stays
      green (audit depends only on `lib`, never the reverse).
- [ ] Every artifact reads SHADOW/additive (NS-9): the mechanism NARROWS the equivocation surface, does NOT
      harden; the gossip transport + the §2-MUST are loudly marked network-phase.
- [ ] VERIFY board folded (pre-build); VALIDATE board folded (post-build).

## §7 VERIFY / VALIDATE plan

**VERIFY (pre-build, 2-lens) — REQUIRED hacker (Merkle proof verification is security-sensitive):** architect
(the module boundaries + the ordered-leaf-log design + the v0/network scope cut + the one-way DAG placement) +
**hacker** (can a FORGED inclusion or consistency proof pass `verifyInclusion`/`verifyConsistency`? is the
consistency check genuinely anti-rewrite or vacuous? can `detectFork` be made to MISS a real fork or FALSE-fire?
is the leaf truly content-bound? RFC-6962 second-preimage / known Merkle pitfalls — the `0x00`/`0x01` domain
separation, the empty-tree + single-leaf edge cases). Fold corrections into §2/§4 before building.

**VALIDATE (post-build, 2-lens):** code-reviewer (RFC-6962 correctness vs the test vectors, fd/IO safety in the
ordered leaf log, additive-non-breaking proof) + **hacker re-probe of the BUILT code** (Rule 2a — build live
probes that forge proofs against the real `verifyInclusion`/`verifyConsistency`; a green TDD suite is NOT proof
the anti-rewrite guarantee holds). Then the full 230+ suite + eslint + the layering tripwire.
