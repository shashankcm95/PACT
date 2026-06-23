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
export PACT_BROKER_ALLOWED_UIDS=501          # R2-WHO caller-auth: host uid(s) allowed to request a signature (comma-separated)
export PACT_BROKER_PERSONA_DID=did:key:zBroker  # R2-WHAT per-request auth: the persona this broker keys (enables require-frame by default)
exec /usr/bin/node /opt/pact/v0/src/identity/broker-sign.js "$@"
EOF
sudo chown root:root /usr/local/bin/pact-broker-sign
sudo chmod 0755 /usr/local/bin/pact-broker-sign          # NOT group/world-writable (the verifier checks this)
```

`PACT_BROKER_ALLOWED_UIDS` is the **caller-auth allowlist (R2)** — the uid(s) the broker will sign for. It MUST
be a **hardcoded literal** here in the root-owned wrapper (the host can't tamper it; sudo `env_reset` also strips
any host-supplied value). Its VALUE's provenance — not just the wrapper file's integrity — is the trust anchor
(integrity ≠ provenance): never interpolate it from a host-influenced source (a `/tmp` file, a host env var).
**OMIT the line to leave caller-auth OFF** (opt-in; the broker then signs for any sudoers-permitted caller and
prints a loud `caller-auth DISABLED` notice). Honest scope: this is **coarse uid-level caller-auth (R2-WHO)**.

`PACT_BROKER_PERSONA_DID` is the persona this broker keys, and setting it **enables R2-WHAT require-frame mode
by DEFAULT** (per-request auth, see §9): the broker then signs only a `record_id` it can RECOMPUTE from a
presented frame body that declares this persona — not an arbitrary 64-hex. Because it is **default-on once the
persona is set**, a *dropped* `PACT_BROKER_REQUIRE_FRAME` env fails CLOSED (refuse), never silently reopening the
blind oracle. Explicit `export PACT_BROKER_REQUIRE_FRAME=0` is the only escape hatch back to legacy hex-only (the
broker then prints a loud `per-request-auth DISABLED` notice). OMIT the persona line to stay legacy entirely.

Use the **SAME** DID for this `PACT_BROKER_PERSONA_DID`, the registry `personaDid` (§5), and the verifier's
`--persona` (§7). A mismatch is not a custody fault but reads like one: the verifier's C3 liveness check fails
with `broker signed but as a DIFFERENT persona — key <-> registry mismatch`. The placeholder `did:key:zBroker`
above is carried consistently through §5 and §7 for exactly this reason.

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
sudo -l -U <hostuser>           # human-scan: NO env_keep carries NODE_OPTIONS / BASH_ENV / LD_* / DYLD_*

# SUDO_* is the LOAD-BEARING one for caller-auth (R2) — assert it explicitly. This MUST print nothing:
sudo -l -U <hostuser> | grep -iE 'env_keep.*SUDO_' \
  && echo 'FAIL: env_keep carries SUDO_* -- the caller-auth premise is VOID; fix the policy before trusting this deployment'
```

If any code-loading var survives into the broker's environment, the cross-uid env-injection defense is void.
**`SUDO_*` is load-bearing for caller-auth (R2):** the whole gate rests on sudo SETTING `SUDO_UID` from the real
caller uid; if `env_keep` carried a host-supplied `SUDO_UID`, a host could forge its caller identity. On a
default `env_reset` policy sudo overwrites `SUDO_UID` regardless — verified live on the reference deployment
(`SUDO_UID=999999 sudo -u pact-broker printenv SUDO_UID` → `501`) — but the asserted `grep` above pins it so a
future `env_keep` mistake fails loudly rather than silently voiding the gate.

## 5. Register the broker's PUBLIC key with the host

Write a registry JSON the host reads — e.g. `/etc/pact/registry.json`, the path you pass to `--registry` in
§7 (the host never sees the private key):

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

## 8. Enable + verify caller-auth (R2)

Caller-auth is enabled by the `PACT_BROKER_ALLOWED_UIDS` line in the wrapper (step 3). Two out-of-band checks:

**(a) Confirm the allowlist VALUE is a hardcoded literal** — its provenance is the trust anchor; the verifier's
C2.5 checks the wrapper's integrity, NOT its contents:

```sh
sudo grep -n 'PACT_BROKER_ALLOWED_UIDS' /usr/local/bin/pact-broker-sign
# must be a literal `export PACT_BROKER_ALLOWED_UIDS=<uids>` — never interpolated from a host-influenced source
```

**(b) Live caller-auth test — prove the gate actually rejects a non-member.** Your uid signs; a different uid is
refused:

```sh
HEX=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
sudo -n -u pact-broker /usr/local/bin/pact-broker-sign "$HEX" | head -c 20; echo '   <- a sig = authorized'
# now flip the allowlist to a uid that is NOT yours and confirm the broker REFUSES, then RESTORE:
#   sudo sed -i '' 's/ALLOWED_UIDS=501/ALLOWED_UIDS=999/' /usr/local/bin/pact-broker-sign
#   sudo -n -u pact-broker /usr/local/bin/pact-broker-sign "$HEX"   # -> "broker-sign: caller not authorized", empty stdout, exit 1
#   sudo sed -i '' 's/ALLOWED_UIDS=999/ALLOWED_UIDS=501/' /usr/local/bin/pact-broker-sign   # RESTORE
```

The deployment is only caller-auth-enabled once the allowlist is set to your uid(s) AND the flip test refuses a
non-member. Omit the allowlist → caller-auth OFF (the broker signs for any sudoers-permitted caller + prints a
loud `caller-auth DISABLED` notice on stderr; R2-WHO open).

## 9. Enable + verify per-request auth (R2-WHAT)

Setting `PACT_BROKER_PERSONA_DID` in the wrapper (step 3) enables **require-frame mode by default**: the broker
signs only a `record_id` it can RECOMPUTE from a presented frame body declaring that persona. The host wiring
(step 6, `brokerSigner` + `buildFrame`) presents the body automatically — **zero seam change**; a frame minted
through the broker just works. To confirm the gate actually refuses a request it cannot account for:

```sh
# A. a well-formed P-frame the broker can recompute -> SIGNS (the happy path; node prints a base64 sig).
#    (the host's buildFrame/brokerSigner do this for you; this is the manual equivalent.)
#
# B. the gate refuses what it cannot account for. Ask the broker to sign a BARE 64-hex (no presented frame):
HEX=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')
printf '' | sudo -n -u pact-broker /usr/local/bin/pact-broker-sign "$HEX"
#   -> "broker-sign: request not authorized", empty stdout, exit 1  (no preimage -> refuse)
#
# C. a frame for a DIFFERENT persona is refused (persona-bind):
printf '{"src_persona_did":"did:key:zAttacker","nonce":"x"}' | sudo -n -u pact-broker /usr/local/bin/pact-broker-sign "$HEX"
#   -> "broker-sign: request not authorized", empty stdout, exit 1
```

OMIT `PACT_BROKER_PERSONA_DID` → R2-WHAT OFF (legacy hex-only; the broker prints a loud `per-request-auth
DISABLED` notice on stderr; the blind oracle is open). A *dropped* `PACT_BROKER_REQUIRE_FRAME` with the persona
still set fails CLOSED (stays ON) — only an explicit `=0` reverts to legacy.

**Recommended: make the wrapper fail-closed on a forgotten persona.** Require-frame is default-on *only* when
`PACT_BROKER_PERSONA_DID` is set, so a wrapper that wires the key but forgets the persona silently runs the blind
oracle (a copy-paste hazard). Turn that silent fall-through into a startup refusal by guarding the wrapper:

```sh
# add to /usr/local/bin/pact-broker-sign, ABOVE the exec line:
[ -n "$PACT_BROKER_PERSONA_DID" ] || { echo 'pact-broker-sign: refusing to start -- PACT_BROKER_PERSONA_DID unset (R2-WHAT would be the blind oracle)' >&2; exit 78; }
```

This makes the per-request-auth posture a deployment invariant, not a thing the operator must remember.

## Residuals (open — NOT closed by this deployment)

- **R2-WHO — oracle-abuse, caller axis.** With `PACT_BROKER_ALLOWED_UIDS` set, the broker signs only for an
  allowlisted *caller uid* — coarse caller-auth, policy held by the key-holder (not only by `sudoers`). Allowlist
  OMITTED → R2-WHO open. SHADOW.
- **R2-WHAT — per-request auth NARROWS, does not close.** With `PACT_BROKER_PERSONA_DID` set (require-frame on),
  the broker signs only a `record_id` it can recompute from a presented P-frame — no longer a blind oracle for an
  arbitrary 64-hex. But the **entitled operator can still make P assert ANY payload** (payload-semantics ceiling),
  and `PACT_BROKER_PERSONA_DID` is a **policy declaration, NOT cryptographically bound to the held key** broker-side
  (integrity ≠ provenance — only the host-side `assertBrokerPersona` round-trip proves the key matches). R2 stays
  open. All SHADOW.
- **R3 — own-key forgery (U1).** A legitimate holder of their own persona key still mints authentic records;
  issuance cost is untouched.
- **Single-uid is identical to in-process at rest.** If you skip the separate uid (run the broker as your own
  uid), the file mode + `sudoers` buy you **nothing** against an at-rest threat — the host uid still reads the
  key. `PACT_BROKER_KEY_FILE` is an env-pointed file-key read; only a genuinely separate uid makes it custody.
- **The verifier checks the necessary condition, not the sufficient one.** It confirms the key file is owned by
  a different uid and the host can't read it; it cannot confirm the *running broker process* is that uid. That
  is the out-of-band attestation in step 7 — there is no substitute for it.
