---
lifecycle: persistent
created: 2026-06-22
audience: operator (deploys + attests; NOT the build)
---

# Deploying the PACT signing broker under a separate uid (custody-real)

> **What this gets you, and what it does NOT (read first — NS-7 / NS-9).** The PACT broker
> (`broker-sign.js`) keeps the signing key out of the host process's heap. That is a *mechanism*. It becomes
> custody-**real** only when the broker runs under a **genuinely separate OS uid**, so the host uid cannot read
> the key, `ptrace` the broker, or read its `/proc/<pid>/mem`. **No code and no green test proves this** — it is
> a deployment property *you* establish and verify **out-of-band**. The kernel's `EACCES` under a separate uid
> is the world-anchored signal. This runbook gets you there; the verifier (`custody-verify.js`) checks every
> condition the host uid can observe; **you close the last step** by attesting the uid separation yourself.
>
> Everything here is SHADOW — no PACT weight gates an action. This hardens *non-exfiltration* (an HSM-shaped
> property), NOT authorization (see "Residuals" at the end).

## 0. Prerequisites

- A POSIX host (Linux or macOS) where you can create a system user and edit `sudoers`.
- Node.js available to both the host uid and the broker uid.
- The PACT `v0/` tree checked out at a path both uids can execute (e.g. `/opt/pact`).

## 1. Create the broker system user (no login, no shell)

```sh
# Linux
sudo useradd --system --no-create-home --shell /usr/sbin/nologin pact-broker

# macOS (pick an unused UID, e.g. 600)
sudo sysadminctl -addUser pact-broker -UID 600 -shell /usr/bin/false -home /var/empty
```

## 2. Generate the keypair; the PRIVATE key is owned by `pact-broker`, mode 0600

Generate a persona keypair (`v0/src/identity/keypair.js` → `newPersonaKeypair()`), then place the **private**
key where only `pact-broker` can read it, and register the **public** key with the host (step 5).

```sh
sudo install -d -o pact-broker -g pact-broker -m 0755 /etc/pact            # traversable key DIR (key stays 0600) so the verifier can read the key's OWNER
sudo install -o pact-broker -g pact-broker -m 0600 broker.key /etc/pact/broker.key
sudo rm -f broker.key                                                      # remove the host-side copy
```

The key DIR is **0755** (the key itself is **0600**) on purpose: the host uid can then `lstat` the key and
CONFIRM it is owned by a *different* uid — the verifier's necessary condition. A **0700** dir would BLIND the
verifier (it cannot read the owner → reports owner-unknown → **FAILs**, telling you to relax the dir to 0755).
Custody comes from the key's `0600` + a different owner, NOT from the dir mode; do not lock the dir to 0700.

## 3. Install a wrapper the broker uid runs (owned root, NOT host-writable)

The host names only this wrapper — never the key path, never the interpreter. The wrapper sets the key path
**broker-side** and execs the broker. A **host-writable wrapper is a privilege-escalation hole** (the host
could edit the script `sudo` runs as `pact-broker`), so it MUST be owned by root and not group/world-writable.

```sh
sudo tee /usr/local/bin/pact-broker-sign >/dev/null <<'EOF'
#!/bin/sh
export PACT_BROKER_KEY_FILE=/etc/pact/broker.key
exec /usr/bin/node /opt/pact/v0/src/identity/broker-sign.js "$@"
EOF
sudo chown root:root /usr/local/bin/pact-broker-sign
sudo chmod 0755 /usr/local/bin/pact-broker-sign          # NOT group/world-writable (the verifier checks this)
```

## 4. Authorize the host uid to run ONLY that wrapper as `pact-broker` — and PIN the env policy

```sh
sudo visudo -f /etc/sudoers.d/pact-broker
```

```sudoers
# <hostuser> may run ONLY the broker wrapper, as pact-broker, no password.
<hostuser> ALL=(pact-broker) NOPASSWD: /usr/local/bin/pact-broker-sign

# PIN the env policy. `env_reset` is the default, but DO NOT rely on the default — make it explicit, and
# forbid SETENV so neither the host nor the command line can inject code-loading / key-path vars.
Defaults:<hostuser> env_reset, !setenv
Defaults!/usr/local/bin/pact-broker-sign env_reset, !setenv
```

**Then verify the env policy holds** (this is an out-of-band audit the verifier does NOT perform — it does not
parse `sudoers`):

```sh
sudo -l -U <hostuser>           # confirm NO env_keep carries NODE_OPTIONS / BASH_ENV / LD_* / DYLD_*
```

If any of those survive into the broker's environment, the cross-uid env-injection defense is void — fix the
policy before trusting the deployment.

## 5. Register the broker's PUBLIC key with the host

Write a registry JSON the host reads (the host never sees the private key):

```json
[ { "personaDid": "did:key:zBroker", "humanUid": "human:you", "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n" } ]
```

## 6. Wire the host (zero seam change)

```js
const { crossUidBrokerSigner } = require('/opt/pact/v0/src/identity/broker-launch');
const signer = crossUidBrokerSigner({ brokerUser: 'pact-broker', wrapperPath: '/usr/local/bin/pact-broker-sign' });
// signer plugs straight into the existing opts.signer seam — createMinter({ signer, personaDid, humanUid }).
```

## 7. Verify — AS THE HOST UID — then attest OUT-OF-BAND (the step only you can do)

```sh
node /opt/pact/v0/src/identity/custody-verify.js \
  --key /etc/pact/broker.key --persona did:key:zBroker \
  --broker-user pact-broker --wrapper /usr/local/bin/pact-broker-sign \
  --registry /etc/pact/registry.json
```

Expect: `C0`/`C1`/`C2`/`C3`/`C2.5` and `hostObservableChecksPassed: true` with
`requiresOutOfBandUidConfirmation: true`. The tool **deliberately exits non-zero** until you attest — its exit
code is never greener than the truth. Now do the out-of-band check the tool structurally cannot:

```sh
id                       # note YOUR uid
ls -l /etc/pact/broker.key   # the OWNER must be `pact-broker`, NOT you
cat /etc/pact/broker.key     # MUST print: Permission denied
```

Only if the owner is a **different** uid AND the read is denied is custody real. Record your attestation:

```sh
node …/custody-verify.js … --attested-cross-uid   # exits 0 ONLY now
```

## Residuals (open — NOT closed by this deployment)

- **R2 — oracle-abuse (FULLY OPEN).** Any caller the `sudoers` rule permits can ask the broker to sign an
  **arbitrary** `record_id` → forge a record as this persona. The broker provides non-exfiltration, NOT
  authorization. Caller-authentication (peer-uid check / capability tokens) is the next frontier — and it is
  *meaningful only at this cross-uid boundary*, which is why it follows this spike. This deployment adds NO
  authorization.
- **R3 — own-key forgery (U1).** A legitimate holder of their own persona key still mints authentic records;
  issuance cost is untouched.
- **Single-uid is identical to in-process at rest.** If you skip the separate uid (run the broker as your own
  uid), the file mode + `sudoers` buy you **nothing** against an at-rest threat — the host uid still reads the
  key. `PACT_BROKER_KEY_FILE` is an env-pointed file-key read; only a genuinely separate uid makes it custody.
- **The verifier checks the necessary condition, not the sufficient one.** It confirms the key file is owned by
  a different uid and the host can't read it; it cannot confirm the *running broker process* is that uid. That
  is the out-of-band attestation in step 7 — there is no substitute for it.
