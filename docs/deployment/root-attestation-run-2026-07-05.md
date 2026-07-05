---
lifecycle: persistent
audience: the world-anchored HARDEN evidence record (§8 signal 6)
created: 2026-07-05
---

# Root-key genesis attestation (Phase A.3) — the 6th world-anchored signal

Phase A of the sigma-root deploy: the genesis root key was minted off-box (A.1) and its public key attested
out-of-band to a public immutable transparency log (A.3) — the sole step that world-anchors the root (NS-7).
Ratified as the 6th world-anchored HARDEN signal. Full rationale + the runbook:
[`sigma-root-deploy.md`](sigma-root-deploy.md).

## What ran (all on the Mac, off-box — NS-7; the operator ran every step, Claude ran none)

- **A.1 mint (off-box):** `generateEdgeKeypair` on the Mac; `K_root_pub.pem` exported; `K_root_priv` stored in
  `~/.pact-root` (`0600`). `K_root_priv` never entered `rheap`'s read scope and was never committed.
- **A.3 attest (off-box):** `cosign attest-blob K_root_pub.pem --predicate root-binding.json --type custom --bundle root-attestation.sigstore.json` — a DSSE in-toto statement whose subject is `sha256(K_root_pub.pem)`, keyless (a Fulcio ephemeral cert bound to the OIDC identity), logged to Rekor.
- **Verified:** `cosign verify-blob-attestation --bundle root-attestation.sigstore.json --certificate-identity <signer> --certificate-oidc-issuer https://accounts.google.com --type custom K_root_pub.pem` -> `Verified OK`.

## The world-anchored facts

| Field | Value |
|---|---|
| Root identity (`humanUid`) | `human:merlin95` |
| OIDC identity (the anchor) | a Google account (`https://accounts.google.com`); the exact signer is recorded in the Rekor entry |
| Rekor log index | `2079476377` (public, immutable) |
| Rekor UUID | fetch via `rekor-cli get --log-index 2079476377` — the log index above is itself a canonical, sufficient re-identifier |
| Bundle | `root-attestation.sigstore.json` (self-verifying) |
| Predicate type | `custom` (in-toto; subject = `sha256(K_root_pub.pem)`) |

## Honest ceiling (NS-9)

- **HARDENS — the root PROVENANCE:** the `(humanUid, K_root_pub)` binding is now tamper-evident, timestamped,
  OIDC-identity-bound, and in a public immutable log. This closes the self-forge surface
  `registration-provenance.js:70` names — a same-uid host could previously self-generate + seed + self-sign a
  root and pass every in-process check.
- **Does NOT** prove `human:merlin95` is a distinct real human — that rests on the OIDC provider's identity
  assurance (the U1 frontier, still open).
- **Not yet load-bearing:** the attested root is NOT wired into any live gate — the sigma-root layer is SHADOW and
  `rheap`'s `registry.json` is persona-rows-only (no root schema). It is the enabler to close Option B; it gates
  nothing (`convert.actionable` stays `false`).
- **Custody is not hardened:** `K_root_priv` is a `0600` file on the Mac (same-uid) — integrity, not a hardened
  boundary. A full deployment puts it in an HSM. The provenance is hardened; the custody is not.

## Distinct from signal 5

Signal 5 ([`live-edge-run-2026-07-04.md`](live-edge-run-2026-07-04.md)) world-anchored the BROKER key's custody
on a live edge. This (signal 6) world-anchors the ROOT key's provenance-to-an-identity — a different axis. The
two cover the custody (broker) and provenance (root) faces of the same fabric, each one run with a loud ceiling.

## Phase B — executed 2026-07-05 (SHADOW dogfood, NOT a signal)

Phase B ran on the Mac (`a2b-provision.js`, off-box): `createRegistry` → `registerRoot(human:merlin95, K_root_pub)`
(A.2 seed) → minted a persona key → `registerPersona(did:key:zMerlin1, human:merlin95, K_pub)` → `signSigmaRoot`
with `K_root_priv`. A **SHADOW dogfood** then ran the read-path gate against the real record:

- `assessRegistrationFromRegistry(reg, { personaDid, sigmaRoot })` → **`sigmaRootChecksPassed: true`** — the whole
  chain verifies (attested root → seeded root → provisioned persona → gate verifies).
- `requiresOutOfBandRootAttestation: true` — the EXPECTED honest residual: the in-process check cannot see the A.3
  Rekor attestation, so it correctly flags that the root's trust rests on the external attestation (done in A.3).

Artifacts in `~/.pact-root/phaseB/` (`persona-Kpriv.pem` `0600`, off-repo). **Honest ledger (NS-9):** this
VALIDATED the read-path `registration-gate` MECHANISM end-to-end against real data — it is **NOT a 7th signal** (no
out-of-band cost; the north-star stays **6**), it **gates nothing** (`convert.actionable` stays `false`), and the
construction is a fresh in-memory registry on the Mac, **NOT persisted to rheap's live read-path** (that is the
deferred Phase C). It sets up **closing Option B** (a persona provably bound to the attested root).

## Next (operator, deferred — NS-7)

- **Phase B:** ✅ executed 2026-07-05 — see the section above (SHADOW dogfood passed; not a signal).
- **P2 — the Phase-6 world-anchored signer** (`plans/30`): the next build; makes `signingArmed` honest
  (both-or-neither). Phase C's arm is blocked on it.
- **Phase C:** arm the read-path — gated on P2 + a live root-schema registry path; NS-9 theater without them.
  See [`sigma-root-deploy.md`](sigma-root-deploy.md).
