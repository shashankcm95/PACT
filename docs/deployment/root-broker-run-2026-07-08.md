---
lifecycle: persistent
audience: the world-anchored HARDEN evidence record (candidate §8 signal 7)
created: 2026-07-08
---

# Cross-uid sigma-root BROKER custody run -- box `rheap`, 2026-07-08 (candidate 7th world-anchored signal)

The plan-42 W5 operator deploy: the cross-uid **sigma-root broker** was stood up on a genuinely separate OS uid, so
`K_root` lives on-box under a uid the host login provably cannot `read()`, and a persona binding was signed **through
the broker** and verified under the attested root. This world-anchors `K_root`'s **KEY-CUSTODY / non-exfiltration**
axis -- the root-key analog of signal 5's frame-broker custody. Runbook + every honest ceiling:
[`finish-root-broker-steps.md`](finish-root-broker-steps.md) (the copy-paste sheet) over
[`sigma-root-broker-deploy.md`](sigma-root-broker-deploy.md) (the spine).

> **What this run established, and what it did NOT (read first -- NS-7 / NS-9).** A completed, cross-uid operator
> deploy: the broker's custodied `K_root` signed a persona binding that verifies under the seeded/attested root
> pubkey, and the host uid demonstrably cannot read `K_root`. That is a real, world-anchored **key-custody** signal
> for the trust root (Option A / PRD §9). It **does NOT** prove "who minted" in general, it **gates nothing**, and it
> is one box / one run / one axis. It **HARDENS custody (integrity), NOTHING about trust/provenance** -- A.3 (signal
> 6) remains the sole trust harden. The full ceiling is at the end.

## What ran (all out-of-band on `rheap` -- NS-7; the operator ran every step, Claude ran NONE)

Claude wrote the runbook and diagnosed (read-only) live; it created no uid, installed no key, wrote no `/etc`, edited
no sudoers, ran no sign. Every step below was the operator's.

- **Broker uid:** `pact-root-broker`, **uid 997** (auto-allocated by `useradd --system`; `998` was already
  `systemd-network` on Ubuntu 24.04), own group gid 987 -- distinct from `ubuntu` (1000) and the frame broker
  `pactbroker` (999).
- **`K_root` install:** `/etc/pact-root/K_root.pem`, `0600`, owner `pact-root-broker:root`, in a `0755` dir --
  streamed from the Mac's `~/.pact-root/K_root_priv.pem` straight into a root-created file (no host-uid-owned,
  world-readable, or on-disk-staged intermediate). Distinct from the frame key: `sudo cmp K_root broker.key` ->
  `differ` (byte 50).
- **Wrapper:** `/usr/local/bin/pact-root-broker-sign` (`root:root`, `0755`, not host-writable), sets
  `PACT_ROOT_KEY_FILE` / `PACT_ROOT_CONTROLLER=human:merlin95` / `PACT_ROOT_ALLOWED_UIDS=1000` /
  `PACT_ROOT_REQUIRE_BINDING=1` + the two MANDATORY blind-oracle startup guards; execs
  `/opt/pact/v0/src/identity/sigma-root-broker.js`.
- **Sudoers:** `ubuntu ALL=(pact-root-broker) NOPASSWD: /usr/local/bin/pact-root-broker-sign`, `env_reset, !setenv`;
  both exfil audits (`env_keep` code-loaders + `SUDO_*`) print nothing.
- **Code tree:** `/opt/pact/v0` re-synced from the Mac, **root-owned and not host-writable** (`find /opt/pact/v0
  -writable` -> empty). (It had been stale -- see "Snags" -- and was re-synced before the broker could load.)
- **Provision + verify:** a persona `did:key:zHera` was provisioned through the cross-uid signer (SHADOW in-memory
  construction; nothing persisted to `rheap`'s live `registry.json`).

## The world-anchored facts

| Field | Value |
|---|---|
| Box | `rheap` (Ubuntu 24.04.4 LTS, kernel 6.8.0; Multipass VM) |
| Host uid / broker uid | `ubuntu` 1000 / `pact-root-broker` 997 (genuinely separate) |
| Root identity (`humanUid` / controller) | `human:merlin95` |
| `K_root_pub` sha256 (Rekor subject) | `47844a455f7ae9066f318f12b8ab60a583c10be8ae5126a81434dbc4ee2342cf` (attested A.3, `logIndex 2079476377`) |
| Persona wire-checked | `did:key:zHera` (a NEW PACT identity -- unrelated to HETS agent personas) |

## Verification (as the host uid, on the box)

- **Signing through the broker:** `signSigmaRoot(binding, { signer: crossUidBrokerSigner(...) })` -> a real binding;
  `K_root_priv` never materialized in the provisioning process. **`wire-check ok: true`**.
- **Read-side:** `assessRegistrationFromRegistry(...).sigmaRootChecksPassed` -> **`true`** (the seeded/attested root
  verifies the broker-produced binding).
- **Custody (the load-bearing proof):** `cat /etc/pact-root/K_root.pem` -> **`Permission denied`**; `ls -l` shows
  owner `pact-root-broker`, NOT `ubuntu`. The host login cannot read `K_root`.
- **Deny controls:** WHO gate -> **`caller not authorized`** (a foreign uid, allowlist-flipped); WHAT gate ->
  **`request not authorized`** (an uncomputable frame body).
- **Pubkey provenance:** the on-box `K_root_pub.pem` sha256 matches the attested Rekor subject.
- **R-heap posture at deploy** (re-probed -- it decays): `kernel.yama.ptrace_scope = 2`, **no swap**,
  `core_pattern = /dev/null` -- all in the hardened state.

## Snags (recorded -- they hardened the runbook via [#71](https://github.com/shashankcm95/PACT/pull/71))

The live run exposed real gaps that the "looked right" sheet had missed; each is now fixed in the sheet:

- **uid-998 collision** -- the `getent passwd 998` guard skipped `useradd` because `998` was `systemd-network`
  (fix: guard on the username + auto-allocate the uid).
- **Multipass access** -- `rheap` is a Multipass VM, not a plain ssh host (fix: `multipass shell/exec/transfer`
  forms inlined).
- **Interactive sudoers** -- `visudo -f` opened an editor (fix: non-interactive write -> `visudo -c` validate ->
  atomic install).
- **Stale `/opt/pact` tree** -- a plain copied tree (not a git repo), synced before the broker code merged, so
  `sigma-root-broker.js` was absent -> `MODULE_NOT_FOUND` -> `signSigmaRoot` null (fix: concrete non-git `tar`-pipe
  re-sync + a step-2 preflight asserting the broker code is present).
- **Blind pubkey trust** -- `provision-verify.js` rooted on `K_root_pub.pem` with no fingerprint check (fix: a
  `sha256sum -c` gate + an in-script digest check against the attested subject).

## Honest ceiling (NS-9)

- **HARDENS -- the root KEY-CUSTODY / non-exfiltration axis.** A host compromise cannot `read()` `K_root` to forge
  arbitrary root bindings without the broker uid. This is INTEGRITY, and a genuine world-anchored signal on that
  axis (the frame-broker precedent, signal 5).
- **HARDENS about trust/provenance: NOTHING.** The sole trust harden is A.3 (signal 6). This deploy does not repeat
  or substitute for it, and does not prove "who minted."
- **Does NOT close R1 (raised-stakes #273)** -- a same-uid WHO-authorized (allowlisted) caller reaching the broker
  via sudo (an allowlisted host uid, NOT the broker uid itself) still mints "K_root authorized MY key as persona P"
  for any P. R1 survives EVEN A.3 + this cross-uid signer.
- **Does NOT close the W3 apex** -- a same-uid self-`registerRoot` + self-sign still passes the crypto judge.
- **Gates nothing** -- `convert(...).actionable` stays `false`; the sigma-root layer is SHADOW.
- **R-heap-bounded** -- one box / one run / one axis; custody is bounded by the box's memory-extract posture, and
  "still deployed" decays (re-probe `ptrace_scope` / `swapon` / `core_pattern` each deploy).

## Distinct from signals 5 and 6

Signal 5 ([`live-edge-run-2026-07-04.md`](live-edge-run-2026-07-04.md)) world-anchored the **frame** broker key's
custody on a live edge. Signal 6 ([`root-attestation-run-2026-07-05.md`](root-attestation-run-2026-07-05.md))
world-anchored the **root** key's PROVENANCE (A.3 attestation). This run world-anchors the **root** key's CUSTODY
on-box -- the custody face of the root, complementing signal 6's provenance face. The three cover custody(frame),
provenance(root), and custody(root); each one run with a loud ceiling.

## Ratification (the operator's call -- NS-7)

Recorded as the **candidate 7th world-anchored signal** (root key-custody axis). Whether it moves the PRD §8
scoreboard **6 -> 7** is the operator's ratification (as signals 5 and 6 were ratified in their records) -- the
evidence is the `wire-check ok: true` + the `Permission denied` custody transcript above.

## Next (operator, deferred -- NS-7)

- **Phase C (arm the read-path):** still deferred -- gated on a live root-schema registry path (+ P2); NS-9 theater
  without it. This run is SHADOW; nothing gates.
- **R1 close** -- an authenticated minter binding the payload semantics; a separate frontier, not this deploy.
