---
lifecycle: persistent
audience: the operator (record of a world-anchored run) + the USER (scoreboard gate)
date: 2026-07-04
box: rheap (Ubuntu; host uid 1000, broker uid 999)
status: RUN COMPLETE — the first world-anchored key-custody signal ON A LIVE TRUST-GRAPH EDGE
---

# Live-edge deploy run — box `rheap`, 2026-07-04

> **What this run established, and what it did NOT (read first — NS-7 / NS-9).** On a genuinely cross-uid
> deployment, the broker's custodied key signed a **freshness-bound live VOUCH edge** that verifies under its
> registered public key. That is a real, world-anchored **key-custody-on-a-live-edge** signal (Option A / PRD §9).
> It does **not** prove "who minted" in general, it **gates nothing**, and it is one box / one run / one axis. The
> honest ceiling is at the end.

Follows the sibling runbooks in this directory (`cross-uid-broker.md` = custody, `live-edge-provenance.md` = the
edge, `operator-deploy-A.md` = the ordered sequence). This is the **record of executing that sequence**.

## The deployment

- Box `rheap` (Ubuntu). Host user `ubuntu` = **uid 1000**; broker user `pactbroker` = **uid 999** (genuinely
  separate uid).
- `/opt/pact` brought current to `c2e9746` (the deployed tree predated the plans/37-38 live-edge minting code; the
  `v0/src` tree was replaced and re-verified before minting).
- Key `/etc/pact/broker.key` = `0600`, owner `pactbroker`; broker persona `did:key:zBroker` registered in
  `/etc/pact/registry.json`; root-owned wrapper `/usr/local/bin/pact-broker-wrapper`; sudoers
  `ubuntu ALL=(pactbroker) NOPASSWD` + `env_reset, !setenv`.

## Part 1 — custody (attested)

`custody-verify.js` against the deployed broker, run as the host uid:

```text
[PASS] C0-root       — not running as root (uid 1000)
[PASS] C1-keypresent — key file present + non-empty (119 bytes)
[PASS] C2-denied     — host read denied (EACCES) + key FILE owned by a DIFFERENT uid (999 != 1000)
[PASS] C3-liveness   — broker produced a signature that verifies as the persona
[PASS] C2.5-wrapper  — sudo wrapper is a regular, non-group/world-writable file
hostObservableChecksPassed: true
```

Out-of-band attestation (the SOLE determiner — the operator's act):

- `id` -> uid 1000; `ls -l /etc/pact/broker.key` -> owner `pactbroker` (NOT the host uid);
  `sudo -u pactbroker id -u` -> 999; `cat /etc/pact/broker.key` -> **Permission denied**.
- `kernel.yama.ptrace_scope = 2` (the R-heap axis: the running broker's memory is non-exfiltrable by the host uid).
- Recorded with `custody-verify.js … --attested-cross-uid`.

This re-confirms the at-rest custody signals (R1 file-read, R-heap) on this box, and is the **prerequisite** for the
live-edge signal below.

## Part 2 — the live edge (the new signal)

A **freshness-bound VOUCH** minted through the cross-uid custody boundary (`crossUidBrokerSigner` -> `sudo -n -u
pactbroker` -> the wrapper -> `broker-sign.js` reading the uid-999 key) via `mintFreshVouch`, then read back:

```text
minted broker->target FRESHNESS-BOUND VOUCH via cross-uid signer  (ok=true)
verifiedRecords total      = 2
broker-attributed+verified = 1   (the broker edge verifies under the registered key)
disjointPaths(ME->target)  = 1   (it weighs into the graph)
convert(ME->target).actionable = false   (SHADOW — gates nothing)
```

The signature could only be produced by something able to invoke the broker (the allowlisted uid via `sudo`); a
host-access attacker who cannot read the uid-999 key cannot forge a broker-attributed edge. The containment legs
are proven in `v0/test/integration/edge-provenance-proof.test.js` (a forged broker-attributed edge signed under a
wrong key **drops**; the broker DID cannot be squatted).

## The honest ceiling (LOUD — NS-9)

- **HARDENS:** the broker persona's key-custody **on a live trust-graph edge** — the first such world-anchored
  signal. **One box / one run / one axis.**
- **Does NOT prove "who minted" in general.** The registry is host-writable, so a same-uid holder of the registry
  handle can self-register its OWN persona and sign authentic edges under it (equal own-persona standing — the 5th
  co-forge leg, `registry.js` threat boundary). Closing that needs the σ_root registration binding **AND** a
  consumer that privileges the broker persona — both OUT of this run.
- **Gates nothing.** `convert(...).actionable` is hard-`false`. The read-path σ_root FILTER
  (`registration-gate.js` / `filterAnchoredRecords`, plans/39) IS wired into `convert.disjointPaths` but is
  **disarmed by default** (no `meCtx.regProvenance` -> identity pass-through). Even ARMED it only **NARROWS** the
  advisory disjoint-paths count — it never flips `actionable`, and it does not close the self-register leg. (The
  separate `admissionDecision` reject-primitive, plans/33, is not wired; wiring it would gate no action either.)
- **Does NOT close R3 / U1.** A legitimate holder of their own persona key still mints authentic records.
- **"Still deployed" decays** — re-probe `kernel.yama.ptrace_scope`, `swapon --show`, `core_pattern` at each run.

## Follow-up (named, not done)

The read-path σ_root filter is **already built** (`registration-gate`, plans/39) — there is no code wave here. The
remaining moves are the OPERATOR's, not a build: **arm** the filter (inject `meCtx.regProvenance={sigmaRoots}` +
seed the root key), and perform the **A.3 out-of-band root-key attestation**. Even fully armed the filter only
NARROWS the advisory count; only the A.3 attestation crosses SHADOW->hardened for the self-register leg. See
`sigma-root-deploy.md` (§0 corrected).
