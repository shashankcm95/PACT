---
lifecycle: persistent
phase: v0 build plan (P0-minimal + P1) — the first buildable PACT node
created: 2026-06-21
status: BUILT (2026-06-21) — Stages A–D green (65 tests) + post-build VALIDATE folded
spec: PACT-spec-v1.1.md (build-grade, ratified 2026-06-21)
---

# PACT v0 — build plan (new package, surgical transfer)

> **Decision (user, 2026-06-21):** build v0 as a **new package in the PACT root repo**, with a
> **surgical transfer** of the relevant Power Loom primitives (copy + adapt the exact closure, not a
> dependency on the toolkit). This plan probes the transfer boundary firsthand, scopes the v0 slice,
> and breaks the build into TDD tasks. **It is itself an unapproved plan** — the VERIFY board (§9) runs
> before any Edit/Write to source.

## 1. Goal — the v0 definition-of-done (the acceptance test; spec §10.5)

> **Two mutually-untrusting roots (distinct-keyed; human-independence is U1-OPEN — contained, not
> proven) exchange ONE authenticated, premise-bound, scope-checked, falsifiable claim — and a
> fabricated counterexample does NOT silently collapse it.**

Depends on **neither U1 nor U2** (both contained parameters). Ships **no action-gate** (no CONVERT /
CROSS_VERIFY-scoring / REACH / caps). The whole point is to prove *machine-bears-mechanical-certainty,
human-bears-truth-burden, coupling-gated-by-disjoint-evidence* on the **grounding-and-identity axis**.

## 2. Scope — minimal-P0 + full-P1 (the smallest thing that proves the thesis; research/10 §9)

The spec's P0 (§10) lists the full `[ADOPT]` table-stakes layer (DID/VC, A2A/JSON-RPC transport,
Agent Card discovery, RFC 6962 Merkle inclusion/consistency proofs + STH gossip, RFC 8693/7523
delegation chains). **v0 does NOT build all of that** — the DoD needs only a 2-root authenticated
exchange. v0 = the minimal P0 slice + the **full** P1 (the ATMS *is* the thesis core; it is not
minimized).

| Layer | In v0? | Why |
|---|---|---|
| Per-persona ed25519 keypair + sign/verify (P1-frame `SIG`) | **YES** | the "authenticated" in the DoD |
| Minimal authenticated frame carrying a Claim (§2 payload) | **YES (minimal)** | in-process / local two-node harness; NOT full A2A/JSON-RPC yet |
| 2-root U1 stub (invite/vouch+stake = two pre-registered roots) | **YES (stub)** | the "two mutually-untrusting roots"; ratified default, registry-not-oracle (INV-18) |
| Content-addressed per-receiver append-only log (§7, no Merkle-tree yet) | **YES** | the "auditable" substrate; the DoD needs verify-on-read, not yet cross-node equivocation proofs |
| **§3 ATMS — Premise/Claim/Scope, VALIDATE, FALSIFY/REPAIR, acyclicity, MEET, nogoods/preference** | **YES (FULL)** | the thesis core; premise-bound + scope-checked + falsifiable + non-collapsing |
| DID/VC identity documents | DEFER → P0-complete | the keypair suffices for 2 roots; DID is the standard wrapper, additive |
| A2A/JSON-RPC transport over mTLS | DEFER → P0-complete | v0 uses a local 2-node harness; transport is `[ADOPT]`, not novel |
| Agent Card `/.well-known/` discovery | DEFER → P0-complete | 2 hardcoded roots need no discovery |
| RFC 6962 Merkle inclusion/consistency proofs + STH gossip | DEFER → P0-complete | equivocation-detection across N nodes; 2-node v0 uses the content-addressed log |
| RFC 8693/7523 delegation chains | DEFER → P4-adjacent | no delegation in a 2-root exchange |
| Trust (§5), Grounding-scoring (§6), Independence (§4.5), Caps (§1.3 enforcement) | DEFER → P2–P4 | every one is an action-gate the v0 DoD explicitly omits |

**OPEN scoping question for the user (one call):** is "minimal-P0 + full-P1" the right v0 line, or do
you want any deferred `[ADOPT]` item (most likely: RFC 6962 Merkle proofs, or DID/VC) pulled into v0?
*Recommendation: keep v0 minimal as above — every deferred item is `[ADOPT]` (a mature standard,
additive later under Open/Closed), while the ATMS is the novel core that must be real.*

## 3. Ratified parameters (spec §1.2/§1.3/§10.5)

- `effective_presence()` = distinct network-facing signing identities in the delegation closure
  (per-receiver log); `MAX_DELEGATION_DEPTH = 3`. **Defined, NOT enforced in v0** (caps are P4; v0 has
  2 roots, no Sybil surface). Carried as a documented constant + a pure function with unit tests, wired
  to nothing.
- U1 v0 issuance = **invite/vouch + stake, as a DID-VC-shaped registry**. v0 instantiates it as **two
  pre-registered roots** behind the pluggable seam (the seam is real; the issuance policy is the stub).

## 4. Surgical-transfer manifest (PROBED FIRSTHAND — §8 records the probes)

Source = `claude-toolkit/packages/kernel/_lib/`. Each transferred file carries a header noting its
source path + the toolkit commit sha + COPY-VERBATIM | COPY-ADAPT (and what was adapted), for
provenance (a PACT value — the transfer boundary is auditable).

| # | Source file | Lines | Disposition | Adaptation for v0 |
|---|---|---|---|---|
| 1 | `canonical-json.js` | 58 | **COPY-VERBATIM** | none — deterministic serialize, zero deps |
| 2 | `deep-freeze.js` | 65 | **COPY-VERBATIM** | none — immutability util, zero deps |
| 3 | `path-canonicalize.js` | 210 | **COPY-VERBATIM** | none — `checkWithinRoot` + `isSafePathSegment` (the #215 trap guards); zero deps |
| 4 | `atomic-write.js` | 183 | **COPY-ADAPT** | **inline `currentUid()`** (a 2-line `process.getuid()` wrapper) to drop the `safe-resolve.js` dep (123 lines PACT doesn't need) |
| 5 | `transaction-record.js` | 532 | **COPY-ADAPT (split)** | **field-AGNOSTIC → transfer clean:** `canonicalJsonSerialize` (re-export `./canonical-json`, never re-implement — M1), `computeTransactionId` (hashes body-minus-id), `computeContentHash` (pure). **field-BOUND → RE-AUTHOR:** `deriveIdempotencyKey`/`computeIdempotencyKey` read literal kernel names (`writer_persona_id`,`operation_class`,`prev_state_hash`,`writer_spawn_id`,`post_state_hash`,`head_anchor`); re-author to PACT fields or they return `null` and silently disable dedup (INV-22 goes DARK). §7 A3 names the map. |
| 6 | `record-store.js` | 471 | **COPY-ADAPT** | keep `appendRecord` + `loadRecordFile` content-verify-on-read + idempotent de-dup; **adapt keying** single-node run-scope → **per-receiver** dirs. The per-receiver key MUST be a hash/base64url-ENCODED safe segment (`sha256(receiverId).slice(0,16)`) run through `isSafePathSegment` PRE-join — NOT a raw DID (`did:web:host/path` carries `/`; an attacker-authored `../` receiver-id traverses — the #215 trap at the adapted seam). |
| 7 | `edge-attestation.js` | 163 | **COPY-ADAPT** | keep ed25519 `generateEdgeKeypair`/`signRecordId`/`verifyRecordSig`/`resolveSigner`. **Resolve each sender's verify key PER-SENDER from the U1 registry — NEVER a shared `LOOM_EDGE_VERIFY_KEY` default** (a default makes verify accept-all). Separate-uid provenance is **cryptographically unobservable** (a same-uid in-process closure signs byte-identically) → prove it OUT-OF-BAND (§7 D3, §8): clear `LOOM_EDGE_SIGNING_KEY` from the harness env so signing only works via the injected signer. |
| 8 | `schema/transaction-record.schema.json` | json | **COPY-ADAPT — the HIDDEN closure file** | `transaction-record.js:34` `fs.readFileSync`s this (no try/catch → ENOENT crash if absent); the `require()`-probe missed it. Re-author `required[]` (today 8 kernel fields) + `properties`, keep `additionalProperties:false`, to the PACT frame/Claim shape. Validation runs BEFORE content-verify (`record-store.js:158,289`) — a botched re-author either crashes or tempts weakening the #273 gate. |

Total ≈ **1,682 lines** of JS + the schema JSON (the hidden file). `currentUid` inlined (≈2 lines). **Closure-probe lesson:** grep `readFileSync`/`__dirname`-relative reads, not only `require()` — that is how the schema dep was missed and re-found (§9 board).

## 5. Greenfield modules (the novel core — budget as greenfield, NOT reuse; §11/research/19)

| Module | Spec | What |
|---|---|---|
| `atms/` | §3 | **the thesis core.** `Premise`/`Claim`/`ScopeSpec` types; `VALIDATE` (acyclicity fail-closed §3.3, `derivation_sound`, `MEET` scope §3.4, label propagation, nogoods); `FALSIFY`/`REPAIR` (§3.5 — CONTESTED-is-a-FLAG, authz BOTH legs, `ESCALATING_EVIDENCE` anti-ping-pong); §3.6 contradiction/preference (surfaced, not auto-suppressed) |
| `scope/` | §3.4 | typed-constraint algebra (interval/set/enum), `MEET`, possibilistic-min `edge_confidence` combinator, `IN_SCOPE` — with the worked 2-premise example as a test |
| `frame/` | §2 | the minimal authenticated frame: `{ver,type,src_persona,parent_human_uid,seq,payload(Claim),sig}`; verify(SIG) + root_valid on receipt |
| `identity/` | §1/§9 | per-persona keypair (from transferred ed25519); the 2-root U1 stub behind the pluggable issuance seam (registry-not-oracle); `effective_presence(human_uid, log)` pure fn — **spec-shaped signature NOW** (over the LOG, §1.3) even though v0 calls it unwired, so P4 is a call-site change not an interface break (Open/Closed); `MAX_DELEGATION_DEPTH` const (defined, unwired) |

## 6. Proposed package layout (in the PACT root repo)

```
PACT/v0/
  README.md                      # what v0 is + the DoD + how to run the acceptance test
  TRANSFER-PROVENANCE.md         # the §4 manifest: each transferred file ← source path @ toolkit sha + adaptation
  src/
    lib/                         # the surgically-transferred primitives (§4)
      canonical-json.js          #   verbatim
      deep-freeze.js             #   verbatim
      path-canonicalize.js       #   verbatim
      atomic-write.js            #   adapted (inlined currentUid)
      record.js                  #   <- transaction-record.js, schema adapted to PACT frame/Claim
      record-store.js            #   adapted (per-receiver keying)
      edge-attestation.js        #   adapted (inter-node Option-B signer)
    frame/frame.js               # §2 minimal authenticated frame
    atms/{claim,validate,falsify,nogood}.js   # §3 the core
    scope/scope.js               # §3.4 algebra
    identity/{keypair,u1-stub,presence}.js    # §1/§9 stub + ratified params
  test/
    unit/                        # per-module unit suites (TDD red→green)
    acceptance/v0-dod.test.js    # THE v0 definition-of-done as one integration test (§7)
```

## 7. Work breakdown (TDD: test → red → green; the DoD is the integration gate)

**Stage A — transfer + adapt the lib closure (mostly mechanical).**
A1. Copy the 3 verbatim files + headers + provenance doc. A2. Adapt `atomic-write` (inline `currentUid`).
A3. Adapt `record.js`: (i) transfer the field-agnostic hashers verbatim; (ii) RE-AUTHOR
`deriveIdempotencyKey`/`computeIdempotencyKey` to the named PACT fields — MAP: `writer_persona_id`→`src_persona_did`,
`operation_class`→`type`, `prev_state_hash`→(PACT has none; use the parent-claim-id / `ack_ref`, else a genesis
sentinel), `writer_spawn_id`→`seq`+`nonce`, `post_state_hash`→`content_hash(claim)`, `head_anchor`→`parent_human_uid`;
(iii) transfer + RE-AUTHOR the schema JSON (row 8); (iv) port the INV-22 tests re-pointed at the PACT schema
INCLUDING `assert(deriveIdempotencyKey(minimalPactRecord) !== null)` (proves dedup is LIVE not dark) AND the
validator NEGATIVE tests (forged-id, type-coercion `[K]` decoy, field≠content planted body) — prove they still REJECT.
A4. Adapt `record-store` keying → per-receiver: ENCODE the receiver key to a safe segment
(`sha256(receiverId).slice(0,16)`) run through `isSafePathSegment` PRE-join; port the content-verify-on-read tests
+ the S1b traversal tests re-pointed at the receiver key (a `../`/NUL receiver-id ⇒ `{ok:false}`, zero fs reach)
+ a DID-shaped receiver-id ⇒ write succeeds.
A5. Adapt `edge-attestation` for the inter-node lane: per-sender verify-key resolution from the U1 registry
(NO shared default); the test harness injects a separate-uid signer AND clears `LOOM_EDGE_SIGNING_KEY` from its env.
*Gate: ported tests green; dedup-non-null + validator-reject negatives + traversal negatives all green.*

**Stage B — the §3 ATMS (the core; full P1).**
B1. `scope/` types + `MEET` + possibilistic-min + the worked-example test. B2. `atms/claim` types +
`VALIDATE` (acyclicity fail-closed FIRST — a cycle is REJECTED; then `derivation_sound`, `MEET`, label).
B3. `atms/nogood` + §3.6 contradiction/preference (surface, never auto-suppress). B4. `FALSIFY`/`REPAIR`
(§3.5: CONTESTED-is-a-FLAG; authz both legs; `ESCALATING_EVIDENCE`). *Gate: a fabricated counterexample
flags CONTESTED + is reversible by an authorized REPAIR; a cheap unauthorized counterexample does NOT
collapse the sub-DAG; a cycle is rejected.*

**Stage C — frame + identity + the boundary.**
C1. `frame/` minimal authenticated frame; verify(SIG)+root_valid on receipt. C2. `identity/` keypair +
2-root U1 stub + `effective_presence` pure fn (unwired). *Gate: two distinct-keyed roots produce/verify a
signed frame; a tampered frame is dropped.*

**Stage D — the acceptance test (the DoD). Prose is not enough — each property is a CONCRETE assertion an
adversarial author cannot satisfy by faking (the §9 board's mock-green≠real-path findings).**
D1. **Happy path** (`test/acceptance/v0-dod.test.js`): root A authors a Premise (owned, scoped) + a Claim
derived from it, signs the frame; root B receives → verifies SIG → VALIDATEs (derivation + in-scope + acyclic)
→ accepts as VALID_GIVEN.
D2. **DISTINCT-KEYS triad** (else "two roots" is one identity): `rootA.pub !== rootB.pub`; A's frame verified
under B's key ⇒ `false`; B's sig under A's key ⇒ `false`.
D3. **SEPARATE-UID provenance, OUT-OF-BAND** (crypto can't show it — board live-probe): clear
`LOOM_EDGE_SIGNING_KEY` from the test env, then assert signing STILL succeeds (⇒ the host does not hold the key;
the injected signer is the only path) AND with no env key + a non-function `opts.signer`, signing ⇒ `null` (no
silent fall-through). A frame signed via the env-PEM path is classified `INTEGRITY_ONLY` (SHADOW), not `PROVENANCE_PROVEN`.
D4. **FALSIFY-as-FLAG + authz:** a fabricated IN-scope counterexample by an authorized, signed `by` ⇒ premise
CONTESTED (a flag), Claim NOT collapsed; a counterexample whose `by` does NOT verify under any registered root ⇒
REJECTED, status stays ACTIVE.
D5. **SCOPE is real:** an OUT-of-scope counterexample ⇒ premise stays ACTIVE (INV-5); a Claim applied outside
`MEET(ancestral scopes)` ⇒ BLOCKED (the worked 2-premise example).
D6. **REPAIR authz + anti-ping-pong:** authorized REPAIR restores ACTIVE; UNauthorized REPAIR ⇒ REJECTED; a
second FALSIFY re-contesting the SAME nogood with the SAME (non-escalated) evidence ⇒ REJECTED (`ESCALATING_EVIDENCE`).
D7. **ACYCLICITY:** a justification cycle ⇒ VALIDATE REJECTS (fail-closed), no loop.
*All of D1–D7 green = v0 done.*

## 8. Runtime probes (firsthand, this session — the reuse claims verified against actual code)

- **Transfer closure is shallow + clean.** Probe: `grep require()` across the 3 cores →
  `transaction-record` needs only `canonical-json`; `record-store` needs `atomic-write`/`deep-freeze`/
  `transaction-record`/`path-canonicalize`; `edge-attestation` needs only `crypto`. The only tail is
  `atomic-write → safe-resolve.currentUid`, which is a 2-line `process.getuid()` wrapper (inline it).
- **Export surfaces** (probed) match the spec's reuse claims: `transaction-record` exports the
  content-address machinery (`computeContentHash`/`computeIdempotencyKey`/`deriveIdempotencyKey`/…);
  `record-store` exports `appendRecord`/`readById`/`readByPostStateHash`/`readByIdempotencyKey`/
  `listByRun`; `edge-attestation` exports `generateEdgeKeypair`/`signRecordId`/`verifyRecordSig`/
  `resolveSigner`.
- **The env-PEM signer is integrity-only (the load-bearing caveat).** Probe: `edge-attestation.js:14`
  documents the env-PEM default as "Option-A-equivalent — a same-uid caller can read
  `LOOM_EDGE_SIGNING_KEY` and forge"; the same-uid close needs an injected `opts.signer` into a separate
  trust domain. → v0's PROVENANCE gate (§10.5) requires the test harness to inject a separate-uid signer;
  weights on the env default would prove integrity, not provenance, and stay SHADOW.
- **§3 is genuinely greenfield** (confirmed by `research/10` §6 / `power-loom-mapping.md`): no
  premise/claim DAG, no derivation-soundness, no scope, no falsify-propagation exists today — Stage B is
  net-new, budgeted as such (the §11 anti-overclaim).
- **HIDDEN closure file (§9 board, confirmed firsthand).** `transaction-record.js:34` does
  `JSON.parse(fs.readFileSync(__dirname/../schema/transaction-record.schema.json))` with NO try/catch →
  ENOENT crash if absent; the `require()`-only probe missed it. The schema exists (7664 B), `required[]` = 8
  kernel-spawn fields, `additionalProperties:false`. Added as manifest file #8 (§4). LESSON: probe
  `readFileSync`/`__dirname`-relative reads, not just `require()`.
- **Validation order is LOAD-BEARING (confirmed).** `record-store.js:158,194,289` — `validateTransactionRecord`
  runs BEFORE the content-verify (S5) on every load/append; a botched schema re-author either crashes or
  tempts weakening the #273 gate.
- **Per-receiver-key path trap (confirmed, with a CORRECTED premise).** `isSafePathSegment('did:key:z6Mk…')`
  returns **TRUE** (`:` is allowed) — the board's "all DIDs get dropped" prediction was WRONG. BUT a
  `did:web:host/path` (`/`) or an attacker-authored `../` receiver-id WOULD fail/traverse. Fix stands: ENCODE
  the per-receiver key (`sha256(id).slice(0,16)`) + `isSafePathSegment` PRE-join (§4 row 6).
- **Separate-uid is cryptographically unobservable (board live-probe).** A same-uid in-process closure signs
  byte-identically to the env default, and a non-function `opts.signer` silently falls through to the env
  default → provenance must be proven OUT-OF-BAND (clear the env key; §7 D3).

## 9. VERIFY board (run BEFORE any build; spec discipline)

Spawn in parallel against this plan: **architect** (is the minimal-P0 + full-P1 line right; is the
transfer boundary correct; any missing dep; does the module layout cohere) + **code-reviewer**
(adaptation risk: does re-pointing `transaction-record`'s schema / `record-store`'s keying break the
content-address invariants INV-22; the inline-`currentUid` correctness; test coverage of the DoD) +
**hacker** (does the adapted FALSIFY/REPAIR + the 2-root frame + the Option-B signer harness hold; can
the acceptance test be passed without actually proving the DoD; any landmine in the transfer). Fold
findings, then present for approval. *(This is the plan→VERIFY step; the BUILD itself gets the post-build
multi-lens VALIDATE per the per-wave workflow.)*

## 10. Landmine / invariant checklist (v0-relevant)

- [ ] **B3 acyclicity** is checked FIRST in VALIDATE, fail-closed (a cycle is rejected, not looped).
- [ ] **B2 FALSIFY** sets CONTESTED as a **FLAG** (a SHOW, M5), never an irreversible collapse; REPAIR
      has authz + signed + `ESCALATING_EVIDENCE` (no free ping-pong).
- [ ] **INV-5 scope**: an out-of-scope counterexample does NOT falsify; MEET-empty ⇒ VALIDATE rejects.
- [ ] **INV-14 provenance**: the acceptance test's "authenticated" uses a **separate-uid** signer;
      anything on the env-PEM default stays SHADOW (integrity ≠ provenance).
- [ ] **INV-22 content-address** survives the schema re-point: `record.js` re-derives the id from the
      body + verifies on read; a filename↔field check alone is insufficient (the #273 lesson). **Proven LIVE
      by `assert(deriveIdempotencyKey(minimalPactRecord) !== null)`** (a null key silently disables dedup).
- [ ] **schema JSON** (manifest #8) transferred + re-authored to PACT fields; the validator NEGATIVE tests
      (forged-id, `[K]` coercion decoy, field≠content) still REJECT against the new schema.
- [ ] **per-receiver key** is hash/base64url-ENCODED + `isSafePathSegment` PRE-join; a `../`/NUL receiver-id
      ⇒ `{ok:false}`, zero fs reach.
- [ ] **no shared default verify key** — each sender's verify key resolves PER-SENDER from the U1 registry
      (a `LOOM_EDGE_VERIFY_KEY` default makes verify accept-all).
- [ ] **no action-gate** ships in v0 (no CONVERT/CROSS_VERIFY-scoring/REACH/caps) — DoD omits them.
- [ ] **#215 trap**: keep `path-canonicalize`'s `isSafePathSegment` PRE-join guard intact (don't
      "simplify" it to a post-join `checkWithinRoot`).

## 11. Risks + carried residue (loud, per I8/M1)

- **Schema re-point risk (Stage A3/A4):** `transaction-record` + `record-store` bind kernel spawn
  semantics; re-pointing the schema could silently break a content-address invariant. Mitigation: port
  the existing INV-22 / verify-on-read tests FIRST (red), then adapt until green.
- **Carried residue (in-scope by design):** the env-PEM same-uid co-forge (integrity ≠ provenance)
  survives unless Option-B is injected; v0 weights gated on it stay SHADOW. Full provenance close
  (signed/kernel-writer edges) is post-v0. This is the toolkit's own #273 family at the PACT boundary.
- **U2/independence:** untouched in v0 (no gate consumes it). The WEAK-flag discipline only becomes
  load-bearing at P2; v0 cannot regress it because it ships no independence consumer.

## 12. VERIFY board result (pre-build, folded 2026-06-21)

A 3-lens board (foreground agents, orphan-proof) pressure-tested this plan against the spec + the **actual**
toolkit primitives before any code. **architect = APPROVE_WITH_CHANGES · code-reviewer = APPROVE_WITH_CHANGES
· hacker = NEEDS_REVISION** — strong cross-lens convergence on four clusters (convergence = high confidence);
the hacker live-probed three findings. **All folded above; the corrected DID premise was caught by a firsthand
re-probe (§8).**

| # | Cluster (lenses) | Finding | Fold |
|---|---|---|---|
| 1 | schema closure (arch·rev·hack) | `transaction-record.js:34` `readFileSync`s a schema JSON the `require()`-probe missed; runs before content-verify | §4 row 8 (the hidden file); §7 A3 re-author + validator-negative tests; §8 probe-lesson |
| 2 | INV-22 field-binding (arch·rev) | `deriveIdempotencyKey` is hardcoded to kernel field names; a careless re-point returns `null` → dedup goes DARK | §4 row 5 split (agnostic vs field-bound); §7 A3 field-map + `!== null` assertion; §10 |
| 3 | per-receiver path guard (arch·rev·hack) | re-keying the store must keep `isSafePathSegment` PRE-join; raw DID/`../` traverses | §4 row 6 (encode + guard); §7 A4 traversal tests; §8 corrected premise |
| 4 | DoD is prose, fakeable (hack·rev·arch) | distinct-keys, separate-uid provenance, ESCALATING_EVIDENCE, FALSIFY/REPAIR authz, scope all pass GREEN while faked (live-probed) | §7 Stage D rewritten as D1–D7 concrete forcing assertions |
| 5 | MINORs | effective_presence signature; `_foreignOwned` export; canonical-json single-source; no default verify key; "auditable"=verify-on-read | §5 signature; §4 row 7; §10 |

**Corrected premise (premise-probe discipline):** the board predicted DIDs would be *dropped* by
`isSafePathSegment` (contain `:`); the firsthand re-probe showed `:` is ALLOWED (`did:key:…` → true). The
structural fix (encode + PRE-join guard) stands because `did:web:host/path` and `../` still fail/traverse —
but the specific claim was wrong and was corrected, not propagated (§8).

**Status:** plan is build-ready pending your go. The BUILD itself gets the post-build multi-lens VALIDATE
(per-wave workflow); the DoD (D1–D7) is the acceptance gate.
```

## 13. Build result + post-build VALIDATE (2026-06-21)

**BUILT — all gates green (65 tests):** `record` 13 · `record-store` 11 · `edge-attestation` 7 ·
`atms` 24 · **`v0-DoD` 10 (D1–D7)**. The package is `v0/` (see `v0/README.md`).

Stages: **A** transfer+adapt (the lib closure + ported invariant tests) → **B** the ATMS (scope MEET,
VALIDATE acyclicity-first, FALSIFY/REPAIR) → **C** frame + identity → **D** the D1–D7 acceptance gate.

**Post-build VALIDATE board** (3 foreground lenses on the BUILT code; hacker built live probes — Rule 2a).
All **APPROVE_WITH_CHANGES**; one live-probed BLOCKER + MAJORs, **all folded**:

| Finding (lens) | Fix folded |
|---|---|
| **BLOCKER** deep claim chain throws `RangeError` *before* the cycle check → fails OPEN on acyclicity (hacker, live-probed) | `validate.js` rewritten with an **iterative** DFS (heap stack, no native limit) + fail-closed try/catch wrap; deep-chain test added |
| **MAJOR** `getNode` returns an unfrozen node → a caller can corrupt `status` (code-reviewer) | `addNode`/`replaceNode` now **deep-freeze** the node; immutability test added |
| **MAJOR** a zero-premise claim validates as VALID_GIVEN (ungrounded axiom) (code-reviewer) | `validate` rejects `claim-has-no-premises`; test added |
| **MAJOR** the DoD "premise-bound" link was re-authored at the receiver (architect) | the claim→premise binding now rides INSIDE the signed payload (`premiseRefs`); `ingest` builds strictly from it; **D1b tamper test** proves it is authenticated |
| **MAJOR(a)** "contested intermediate claim doesn't propagate" (architect) | **premise-probed FALSE for v0** (claims have no independent status; `_collectPremises` gathers transitive premises) — proven by a depth-2 propagation test, no code change |
| MINORs: `Infinity` strength locks a premise; `validateRecord` `in`-vs-`==null`; self-contradiction guard; DoD authz tightened to spec §3.6 (creator/staker); `derived_confidence` surfaced; key-presence asserted | all folded + tested |

**Carried residue (in-scope, spec §10.5):** env-PEM signing is integrity-only; provenance is proven
out-of-band in the DoD (a foreign env key signing "as Alice" is REJECTED at receipt — per-sender verify).
Cross-receiver replay has no ledger (no v0 DoD property; flagged for the phase that adds a received-frame
action-gate). Full provenance close (signed/kernel-writer custody) is post-v0.

**v0 is DONE.** Next phase options: P0-complete (the `[ADOPT]` table-stakes) or P2 (the trust engine).
