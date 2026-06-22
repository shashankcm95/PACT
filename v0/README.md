# PACT v0 — the first buildable node

The smallest thing that proves the PACT thesis (spec [§10.5](../PACT-spec-v1.1.md)):

> **Two mutually-untrusting roots (distinct-keyed; human-independence is U1-OPEN — contained, not
> proven) exchange ONE authenticated, premise-bound, scope-checked, falsifiable claim — and a
> fabricated counterexample does NOT silently collapse it.**

It depends on **neither U1 nor U2** (both are contained parameters, not preconditions) and ships
**no action-gate** (no trust/grounding/independence/cap gate — those are P2+). Built per
[plans/00-v0-build-plan.md](../plans/00-v0-build-plan.md): a surgical transfer of the Power Loom
primitives + a greenfield ATMS core.

## Run the tests

```sh
cd v0
for t in test/unit/*.test.js test/acceptance/*.test.js; do node "$t" || exit 1; done
```

The acceptance test (`test/acceptance/v0-dod.test.js`) IS the definition-of-done: D1–D7 are concrete
forcing assertions (distinct keys, separate-uid provenance out-of-band, FALSIFY-as-flag + authz,
scope, REPAIR anti-ping-pong, acyclicity) — a green run = v0 done.

## Layout

| Path | What |
|---|---|
| `src/lib/` | the surgically-transferred primitives (content-address record, per-receiver store, ed25519). See [TRANSFER-PROVENANCE.md](TRANSFER-PROVENANCE.md). |
| `src/scope/` | §3.4 typed-constraint scope algebra (MEET + possibilistic-min). |
| `src/atms/` | §3 the thesis core — Premise/Claim graph, VALIDATE (acyclicity-first, fail-closed), FALSIFY/REPAIR (flag-not-collapse, authz both legs, escalating-evidence), contradiction (surface-not-suppress). |
| `src/frame/` | §2 the authenticated frame + receipt rule (sig + content-integrity + root-valid, per-sender key). |
| `src/identity/` | §1/§9 the U1 registry (registry-not-oracle), per-persona keypair, `effective_presence` (ratified, unwired). |
| `src/trust/` | **P2 (SHADOW)** §5 the trust engine — `read-gate` (INV-14 authenticated read), `opinion` (Subjective Logic), `direct` (earned, derived-on-read, config-bound, anti-grief), `consensus` (`wcons`, Sybil-~0, rootOf-keyed), `convert` (vertex-disjoint max-flow), `model` (the advisory TRUST blend). |
| `src/independence/` | **P2** §4.5 the WEAK flag (the v1.1 spine's first consumer) — `mayGate` refuses high-stakes on WEAK; epistemic always WEAK (U2 open). |
| `src/grounding/` | **P3 (SHADOW)** §6 the grounding engine — `cross-verify` (distinct earned-standing, rootOf-keyed, non-self, creator-bound-on-read confirmations), `premise-score` (SL opinion), `creator-standing` (reliability-as-a-source, human-keyed, asymmetric crater), `verification-strength` (weakest-link MIN, empty→0), `reach` (emergent-descriptive rootOf-union + the INV-9 threshold flag). All derived-on-read, all advisory. |
| `src/identity/minter.js` | **P-minter** the authenticated-writer (custody) abstraction — structurally key-free (throws rather than touch raw key material), per-persona bound (no throne by config). The sole supported `src/` producer; signs ONLY via an injected custody `signer`. |
| `src/identity/broker-{sign,client}.js` | **P-broker** out-of-band signing broker — the key lives in a SEPARATE process (`broker-sign.js`, the sole key-loader); `brokerSigner` plugs into the existing `opts.signer` seam (zero seam change). Custody MECHANISM (custody-real = a cross-uid deployment). |
| `test/` | 153 tests: per-module unit suites + the D1–D7 acceptance gate + the broker / layering / runner-guard suites. |

## What v0/P2/P3 is NOT (deferred, by design)

`[ADOPT]` table-stakes (DID/VC documents, A2A/JSON-RPC transport, Agent-Card discovery, RFC 6962
Merkle inclusion/consistency proofs + STH gossip, RFC 8693/7523 delegation) → P0-complete. P2's trust
weights + P3's grounding scores are all **SHADOW** (gate nothing). The stakes-threshold throne + the
per-path unforgeable bar (§5.1, §1.5), caps enforcement (§1.3) → P4. The U2 substrate-diversity
estimator (the only thing that lifts the permanent WEAK flag, and the precondition for `convert.actionable`
ever flipping true) → P5.

## Carried residue (loud, by design — spec §10.5)

**P-minter REQUIRES custody (it NARROWS; it does not CLOSE).** The ambient env-PEM signing default was
REMOVED (plans/04): signing now requires an injected custody `signer` (or a test-only `privateKeyPem`, a
grep gate keeps it out of `src/`), and the minter abstraction is structurally key-free. But provenance is
established by **custody**, which crypto cannot prove in-process — a same-uid attacker re-exports any
in-process key from memory. So integrity≠provenance is **closed only when the `signer` routes to a real
out-of-band boundary** (separate OS uid / enclave / HSM — a *deployment* property, proven OUT-OF-BAND);
in-process the minter only MODELS the boundary. **Still OPEN (loud):** same-uid in-process custody (by
physics); **own-key forgery** (a same-uid holder of a registered key mints authentic records — U1's
issuance-cost problem); read-side provenance is undecidable in-process. No weight gates any action.
