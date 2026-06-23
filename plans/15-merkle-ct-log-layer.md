---
lifecycle: persistent
created: 2026-06-23
wave: the Merkle / CT-log anti-equivocation audit layer (spec §7, MAJOR M2 / INV-10) — chosen by the 2026-06-23 recon
status: PLAN — VERIFY board folded (§8); build-ready
---

# Merkle / CT-log audit layer — per-receiver inclusion + consistency proofs + STH (SHADOW)

> The spec's §7 `[ADOPT + BUILD]` anti-equivocation foundation (MAJOR M2): a PREV_HASH / content-addressed flat
> store cannot detect cross-node equivocation. This wave builds the RFC-6962 primitives + the per-receiver
> Merkle log + a freshness-bound STH + the frame wiring + the equivocation-DETECTION logic — the foundation the
> whole network/propagation direction (research/25) sits on. All SHADOW; additive + non-breaking. **Cross-
> substrate: the toolkit kernel has the SAME gap (no Merkle) — `merkle.js` is built PORTABLE (§9).**

## §0 Frame — the honesty banner (read first)

This wave builds a **mechanism**, not a hardening (NS-7: in-process; it NARROWS the equivocation surface, it
does not by itself HARDEN trust — that needs cross-node STH gossip + a world-anchored deployment, deferred to the
network phase). It is **additive + non-breaking** (new modules + an OPTIONAL frame field; the 230 tests stay
green). **Threat-model boundary (hacker MED):** single-node v0 proves the DETECTION LOGIC + the verification
primitives; end-to-end equivocation defense needs *independent* STH collection (the gossip transport), deferred.
The spec §2 "MUST verify `inclusion_proof_valid`, any fail → drop" is a **network-phase** rule; v0
verifies-WHEN-PRESENT and makes an absent-proof acceptance **OBSERVABLE** (`audited:false`), not silent. Nothing
gates a trust decision (SHADOW, NS-8).

## §1 The gap (firsthand — §5 has the probes)

`record-store.js` is a per-receiver, content-addressed, append-only, verify-on-read store — but a **FLAT SET of
record files**, and `listByReceiver` returns `readdir` order, NOT append order (P1). So today there is **no
ordered Merkle log** → no inclusion proof, **no consistency proof** (no-rewrite), **no STH** → cross-node
equivocation (a node showing two different logs to two peers) is UNDETECTABLE (MAJOR M2 / INV-10, amended to
per-receiver Merkle logs + RFC-6962 proofs + STH gossip). The frame is specified (spec §2) to carry an
`inclusion_proof` but doesn't (P4). No Merkle code exists (P5) — greenfield.

## §2 The design (VERIFY-board-revised — the pure/stateful split is the spine)

The board's load-bearing reframe (architect MED): **split VERIFY (pure, floor) from PRODUCE (stateful, leaf).**

1. **`v0/src/lib/merkle.js` — RFC-6962 primitives, PURE, crypto-only, the DAG FLOOR.** Everything a *verifier*
   needs, over passed-in values (no I/O, no key custody):
   - `leafHash(buf) = sha256(0x00 ‖ buf)`, `nodeHash(l, r) = sha256(0x01 ‖ l ‖ r)` — RAW-BYTE domain-separated
     (`crypto.createHash` over Buffers, NOT `sha256hex(string)` — P3). Closes the second-preimage attack (hacker
     LOW confirmed: an internal node can't be presented as a leaf without a real sha256 collision).
   - `merkleRoot(leaves[])` (split at the largest power of 2 < n); `inclusionProof` / `consistencyProof`.
   - `verifyInclusion(leafHash, i, treeSize, proof, root)` — **child order at each level is derived
     DETERMINISTICALLY from the bit-decomposition of `i` within `treeSize` (RFC-6962 §2.1.1); the proof carries
     NO caller-supplied left/right flag** (hacker HIGH-1). MUST reject: `i >= treeSize`, `i` negative/non-integer,
     `proof.length != expected(i, treeSize)` (hacker HIGH-2).
   - `verifyConsistency(m, n, proof, rootM, rootN)` — handles `m=0` and `m=n` per RFC-6962 §2.1.2 explicitly: a
     **size-0 STH is NOT a usable consistency anchor** (verifyConsistency(0,n,[],…) must NOT accept an arbitrary
     `rootN` extension — hacker MED).
   - `verifySTH(sth, publicKeyPem)` — PURE: re-derive the freshness-bound basis (below) + `verifyRecordSig`.
   - `leaf data = record_id bytes` (content-binds the leaf). Fail-closed on bad input.
2. **`v0/src/audit/audit-log.js` — the per-receiver Merkle LOG, STATEFUL, the PRODUCER side (a DAG leaf;
   nothing below imports it).** Imports `lib/merkle` + `lib/record-store` + `lib/edge-attestation` (all floor).
   - **`appendLeaf(verifiedRecord, opts)` — binds to a VERIFIED record (hacker MED, the #273 discipline):**
     re-derive `record_id = computeRecordId(verifiedRecord)`, reject a mismatch; refuse a bare 64-hex with no
     backing record. Appends `leafHash(record_id)` to a per-receiver **append-ordered leaf file** (`atomic-write`).
     **Idempotent:** a re-append of an already-present record_id is a no-op (INV-22 dedup spirit) → recovery-safe.
   - **`currentSTH(signer, opts)` — the FRESHNESS-BOUND STH (hacker HIGH-3; borrowed from the toolkit's 5a egress
     pattern, `egress/approval.js:66-70`):** sign `canonical({ root, tree_size, timestamp, nonce })` — NOT the
     bare `{root, tree_size}`. `root`+`tree_size` bind WHAT; `timestamp`+`nonce` bind WHEN + one-shot, defeating
     STH replay / a lied `tree_size` presented as current. STH = `{ root, tree_size, timestamp, nonce, sig }`.
   - `proveInclusion(i, opts)`, `proveConsistency(m, n, opts)` (delegate to `lib/merkle` over the ordered leaves).
   - `detectFork(sthA, sthB, consistencyProof?)` — **the sound half needs NO attacker-supplied proof: two STHs
     at the SAME tree_size with DIFFERENT roots ⇒ fork** (hacker MED — the consistency-proof half is only as
     trustworthy as proof provenance, which is the deferred gossip's job). Monotonicity: a later STH with a
     smaller tree_size from the same log ⇒ fork.
3. **The dual-write orchestration lives ABOVE lib (architect HIGH-2 — keep the floor clean).** `lib/record-store`
   MUST NOT import `audit/` (a `lib → audit` reverse edge breaks the DAG floor). A producer-side coordinator
   (the `buildFrame`/append path or a thin `audit`-level `appendAudited(record)` that imports BOTH
   `lib/record-store` and `audit/audit-log`) sequences: **(1) `record-store.appendRecord` (durable first), THEN
   (2) `audit-log.appendLeaf`** — so a leaf never references a non-durable record. A `reconcile()` rebuilds
   missing leaves from `listByReceiver` (stable-sorted by `seq` to reproduce append order — architect MED crash-
   consistency).
4. **Frame wiring (additive; frame imports ONLY `lib`, the floor — architect MED).** `buildFrame(spec,
   signerOpts, {auditLog})` MAY attach `inclusion_proof` + the sender's `sth`. `receiveFrame(frame, {registry})`
   — when `frame.inclusion_proof` + `frame.sth` are present — runs `inclusion_proof_valid` using **only
   `lib/merkle` + the sender's registry key** (verify the STH sig, then verify the inclusion proof connects
   `leafHash(record_id)` to the STH root at the claimed index). Absent → accept but mark **`audited:false`** on
   the receipt (the OBSERVABLE downgrade, architect MED). A PRESENT-but-INVALID proof → drop (the §2 rule).

## §3 The v0 scope boundary (build now / defer — confirmed with USER 2026-06-23)

| BUILD NOW (deterministic, testable single-node) | DEFER to the network phase |
|---|---|
| `lib/merkle.js` RFC-6962 primitives (root, inclusion, consistency, verifySTH) — PURE | STH **gossip transport** (multi-node STH exchange) |
| `audit/audit-log.js` ordered leaf log + freshness-bound STH + proofs + `detectFork` | Fork-detecting **witnesses** + eclipse defense (spec §8.5) |
| The producer-side `appendAudited` coordinator + `reconcile` | The cross-node equivocation **RESPONSE** (quarantine / re-route) |
| frame `inclusion_proof` verify-when-present + the `audited:false` downgrade flag | — |

**Forward contract (architect MED):** the network phase flips the absent-proof branch from *accept(`audited:false`)*
to *drop* (the spec §2 MUST) — the SAME code path, only the absent branch changes (a one-line policy flip, not a
re-architecture). `audited:false` is the hook the network phase escalates on.

## §4 Test plan (TDD — NON-VACUITY is the load-bearing axis; every guard must be seen RED)

- **RFC-6962 conformance:** `merkleRoot`/`inclusionProof`/`consistencyProof` match the published RFC-6962 test
  vectors (the 7-leaf reference tree + its audit/consistency paths). Pin the **empty-tree root = sha256("")**
  (RFC-6962, NOT `sha256(0x00‖"")`) and the **single-leaf** case (proof = `[]`, root == leafHash) — the off-by-one
  most likely to break split-at-power-of-2 (architect LOW / hacker LOW).
- **Second-preimage regression (hacker LOW):** `leafHash(nodeHash(a,b)) !== nodeHash(a,b)` — fails RED if a
  future refactor drops a prefix or hashes the wrong encoding.
- **Inclusion NON-VACUITY (RED, then the valid GREEN):** forged leaf / wrong index / tampered path node / wrong
  tree_size → RED; **order-swap** (swap a sibling's intended side / an order-agnostic verifier) → RED (hacker
  HIGH-1); **proof too long / too short for (i,treeSize)** → RED; **`i >= treeSize` / negative / non-integer** →
  RED (hacker HIGH-2).
- **Consistency NON-VACUITY (the anti-rewrite hinge):** a size-n log that REWROTE a past leaf → `verifyConsistency`
  RED; a legitimate append-only extension → GREEN; **`m=0`** (a size-0 STH cannot anchor an arbitrary extension →
  RED/refused) and **`m=n`** (trivial) per RFC-6962 §2.1.2 (hacker MED).
- **STH:** `verifySTH` RED on tampered root / tampered size / wrong key / non-ed25519 (alg-pin); **replay** — an
  old (stale `timestamp`) STH presented as current → RED; `tree_size` monotonicity across successive STHs from
  the same log (hacker HIGH-3). A present signer required (no env default, inherits edge-attestation fail-closed).
- **`detectFork`:** two STHs at the SAME tree_size with DIFFERENT roots → fork=true **without any consistency
  proof supplied** (the sound, provenance-free half); a later STH with a smaller tree_size → fork; two honest
  STHs from one append-only log → false; a malformed/empty STH → not a vacuous fork (hacker MED).
- **`appendLeaf` phantom-leaf RED (hacker MED):** `appendLeaf` with a `record_id` that has no verified backing
  record (or a body whose `computeRecordId` ≠ the claimed id) → rejected. Forward: tampering a payload changes
  `record_id` → changes `leafHash` → breaks the inclusion proof.
- **Crash-consistency (architect MED):** record-without-leaf (then `reconcile` rebuilds it) and leaf-write-first
  ordering is forbidden; the two-write partial states are recoverable + idempotent.
- **Additive/non-breaking:** a frame WITHOUT inclusion_proof still `receiveFrame`-accepts with `audited:false`; a
  valid proof → accept `audited:true`; an invalid proof → drop. The existing **230 tests stay byte-for-byte green**.

## §5 Runtime Probes (firsthand — this session, against the repo NOW)

- **P1** the store is a content-addressed FLAT set; `listByReceiver` is `readdir`-order, not append-order
  (`record-store.js:174-178`) → the Merkle log needs its OWN ordered leaf sequence. CONFIRMED (read).
- **P2** `edge-attestation.js` ed25519 sign/verify (`signRecordId`/`verifyRecordSig`, alg-pinned, fail-closed, no
  env default) is reusable for STH signing. CONFIRMED (grep).
- **P3** `sha256hex` (`record.js:24`) hashes a STRING over canonical-JSON — RFC-6962 needs RAW-BYTE
  domain-separated hashing, so `merkle.js` uses its OWN `crypto.createHash`, NOT `sha256hex`. CONFIRMED (read).
- **P4** `frame.js` `buildFrame`/`receiveFrame` exist; inclusion_proof attaches additively; the validation point
  is `frame.js:67+`. The §2 MUST is network-phase; v0 verifies-when-present. CONFIRMED (read).
- **P5** no Merkle code exists in `v0/src` (greenfield). CONFIRMED.
- **P6** spec §7 mandates RFC-6962 per-receiver Merkle logs + inclusion + consistency + STH gossip; INV-10 amended
  (M2): `PACT-spec-v1.1.md:604-621,659-660`. CONFIRMED (read).
- **P7 (VERIFY board)** `layering.test.js:51` hardcodes `DAG_LAYERS` = 8 dirs with NO `audit` → the tripwire is
  BLIND to a new `audit/` layer (a vacuous pass). CONFIRMED (grep, this turn). Drives the §6 DoD fix.
- **P8 (cross-substrate)** the toolkit `egress/approval.js:66-70` is the freshness-bound-basis pattern PACT's STH
  borrows (binds WHAT + WHEN + nonce + key_id). CONFIRMED (grep, this turn). See §9.
- **P9** baseline **230 tests green** (`node test/run.js` this session). Build is ADDITIVE → 230 stays green.

## §6 DoD

- [ ] `lib/merkle.js` (pure RFC-6962, incl. `verifySTH`) + `audit/audit-log.js` (ordered leaf log + freshness-
      bound STH + proofs + `detectFork` + phantom-leaf binding) + the producer-side `appendAudited` coordinator.
- [ ] Frame `inclusion_proof` attach + verify-when-present (imports only `lib/merkle`) + the `audited:false`
      observable-downgrade flag.
- [ ] **Extend `layering.test.js` to cover `audit/`** (architect HIGH-1): add `audit` to `DAG_LAYERS` (so the
      non-empty precondition forces it to exist) + a directional test — `audit` imports only the floor, and
      **`lib` MUST NOT import `audit`** (the HIGH-2 reverse-edge assertion). Then "tripwire green" is load-bearing.
- [ ] ALL §4 non-vacuity tests GREEN (forged/order/length/range RED; rewrite + m=0 RED; replay RED; fork via
      same-size/diff-root; phantom-leaf RED; crash-recovery). RFC-6962 test-vector conformance.
- [ ] Existing **230 tests stay green**; eslint clean; the (extended) layering tripwire green.
- [ ] Every artifact reads SHADOW/additive (NS-9): NARROWS the equivocation surface, does NOT harden; gossip +
      the §2-MUST loudly network-phase; the single-node threat-model boundary stated.
- [ ] VALIDATE board folded (post-build).

## §7 VERIFY / VALIDATE plan

**VERIFY (pre-build, 2-lens) — COMPLETE, folded in §8** (architect + hacker; both SOUND-WITH-CHANGES).
**VALIDATE (post-build, 2-lens):** code-reviewer (RFC-6962 correctness vs the test vectors; fd/IO safety in the
ordered leaf log + the crash-recovery path; the additive-non-breaking + layering-tripwire-extended proof) +
**hacker re-probe of the BUILT code (Rule 2a):** build live `/tmp` probes that forge inclusion/consistency
proofs + replay an STH against the REAL `verifyInclusion`/`verifyConsistency`/`verifySTH` — a green TDD suite is
NOT proof the anti-rewrite + anti-replay guarantees hold. Then the full 230+ suite + eslint + the tripwire.

## §8 VERIFY board result — RECORDED 2026-06-23 (architect + hacker; both SOUND-WITH-CHANGES; all folded above)

2-lens board (workflow `wf_4caa4a6b`). No NEEDS-REVISION; the architecture + the headline crypto (0x00/0x01
domain separation, empirically confirmed) are sound. Two structural findings premise-probed firsthand (P7/P8).

- **architect HIGH-1 (tripwire blind to `audit/`) — FOLDED §6.** `layering.test.js:51` had no `audit` (probed).
- **architect HIGH-2 (`lib → audit` reverse edge) — FOLDED §2.3.** The dual write is orchestrated ABOVE lib.
- **architect MED (frame → audit edge) — FOLDED §2.1/§2.4.** Verify stays PURE in `lib/merkle`; frame imports
  only the floor; `audit-log` is a producer-side leaf. (The board's cleanest reframe — the pure/stateful split.)
- **architect MED (crash-consistency) — FOLDED §2.3/§4.** Store-then-leaf, idempotent appendLeaf, `reconcile`.
- **architect MED (silent bypass) — FOLDED §0/§2.4/§3.** `audited:false` observable downgrade + the one-line
  network-phase MUST-flip forward contract.
- **hacker HIGH-1 (verifyInclusion child-order unspecified) — FOLDED §2.1/§4.** Order from `i`'s bit-decomp; no
  caller flag; order-swap RED test.
- **hacker HIGH-2 (no length/range non-vacuity) — FOLDED §4.** proof-length + index-range RED cases.
- **hacker HIGH-3 (STH not freshness-bound = replayable) — FOLDED §2.2/§4 + §9.** Freshness-bound basis
  `canonical({root, tree_size, timestamp, nonce})` borrowed from the toolkit's 5a egress (`approval.js:66-70`).
- **hacker MED (detectFork tautological) — FOLDED §2.2/§4.** The sound half is same-size/diff-root, no
  attacker-supplied proof; the threat-model boundary stated (§0).
- **hacker MED (m=0 consistency vacuous-pass) — FOLDED §2.1/§4.** RFC-6962 §2.1.2 m=0/m=n; size-0 can't anchor.
- **hacker MED (phantom leaf) — FOLDED §2.2/§4.** `appendLeaf` binds to a verified record (#273 discipline).
- **hacker LOW (second-preimage OK) — kept as a §4 regression assertion.**

## §9 Cross-substrate sync (toolkit ↔ PACT — the standing entanglement directive, 2026-06-23)

PACT and the parent toolkit (Power Loom) are entangled co-evolving substrates; borrow both ways, build portable.
- **Merkle/CT-log = SHARED GAP.** The toolkit kernel has NO Merkle layer either — both run a linear hash-chain
  (toolkit `_lib/transaction-record.js` = a `post_state_hash` chain). So **`lib/merkle.js` is built PURE +
  dependency-free → a candidate to port into `packages/kernel/_lib/` later.** Be informed by transaction-record's
  chain-edge lesson (the edge is `post_state_hash`, not `transaction_id`; "two substrate chains — don't conflate").
- **STH freshness = BORROWED.** The §2.2 freshness-bound STH basis is lifted from the toolkit's 5a egress
  approval pattern (`egress/approval.js:66-70`) — the board's hacker HIGH-3 named it directly. First concrete
  borrow under the directive.
- **Forward:** PACT's deferred signed-minter / egress (FORK-1, the apex) should BORROW the toolkit's already-built
  `egress/weight-minter.js` + `loom-broker-*` + `emit-pr.js`, not rebuild (reconcile when PACT reaches that wave).

## §10 VALIDATE board result — RECORDED 2026-06-23 (built code; 3-lens, workflow `wf_71f1903e`)

Post-build, the security-sensitive crypto diff drew the full 3-lens tier (Rule 2 / Rule 2a). **No BLOCK.** Build
final: **293 tests green, eslint clean** (230 baseline byte-for-byte green + 63 new: merkle 35, audit-log 18,
frame 9 [backfilled — frame had zero prior coverage], layering +1).

- **hacker — CLEAN.** ~496 live `/tmp` probes against the BUILT modules (by absolute path); **0 bypasses** of any
  load-bearing guarantee — inclusion forgery (order-swap / pad-truncate / second-preimage), consistency rewrite,
  STH replay/relabel, the #273 phantom-leaf bind, per-receiver path scoping all HELD. Confirmed the env-verify-key
  fallback (a prior-arc CRITICAL class) is closed (`loadPublicKey` takes `opts.publicKeyPem` only). Re-ran the
  suite from repo root (291 pre-fold green).
- **honesty-auditor — CLEAN.** Claim ledger calibrated; the RFC-6962 oracle is genuinely EXTERNAL (sha256(""),
  sha256(0x00), the published CT roots), structural anchors honestly labelled; NS-9 narrows-not-hardens framing +
  the single-node threat-model boundary + the deferred §2-MUST stated at every surface; non-vacuity guards real.
- **code-reviewer — CHANGES (all non-blocking; RFC conformance confirmed firsthand).** FOLDED:
  - MED `reconcile` silent re-read catch → REMOVED (the count `existing.length + added` is authoritative in the
    single-node model; a silent degraded path violated "a fail path must be observable").
  - LOW proof-length work-amplification (hacker LOW too) → an O(1) length cap (`maxAuditPathLen`) BEFORE the O(n)
    hex scan in `verifyInclusion` + `verifyConsistency` (a 1e6-element proof now rejects on length; +1 non-vacuity test).
  - LOW `detectFork` provenance → JSDoc CONSUMER CONTRACT: callers MUST `verifySTH` both inputs before actioning
    a fork (it checks structure, not signatures); LOW TOCTOU window → documented (idempotency is the net).
  - LOW consistency external-oracle gap → a `(2,8)` proof test pinned to the PUBLISHED roots `ROOT_N2 -> ROOT_N8`.

**DEFERRED residuals (correctly-scoped network-phase boundaries — NOT folded; documented):**
- **Single-node STH equivocation (hacker MED).** A malicious SENDER can sign a self-consistent STH+proof over a
  SEPARATE log and `receiveFrame` returns `audited:true` — the verifier has no second STH to compare. This is the
  threat-model boundary §0/§3 already state: **`audited:true` proves INTEGRITY, never PROVENANCE** (the recurring
  integrity≠provenance / #273 line). The forward contract is in place (`audited:false` hook + the one-line
  absent-branch flip). LOAD-BEARING for the network phase: the receiver MUST collect a sender's STHs from an
  INDEPENDENT channel (gossip/witness) and run `detectFork` across them BEFORE any `audited:true` gates an action
  — otherwise `audited:true` is integrity-theater. The moment it stops being SHADOW and gates, independent
  cross-node STH collection becomes MANDATORY.
- **Unsigned on-disk leaf file (hacker LOW).** An attacker with FS write to the store can truncate `leaves.json`
  to a shorter valid prefix (a non-JSON/non-hex corruption fail-CLOSES; a valid-prefix truncation does not). The
  file carries no MAC of its own. Acceptable single-node (such an attacker already owns the node); when hardening,
  the producer retains its last-signed STH and refuses to emit a regressed `tree_size` (caught producer-side, not
  only by a remote `detectFork`).
