---
lifecycle: persistent
audience: the operator (out-of-band, NS-7)
purpose: the box-specific, copy-paste sheet to deploy the cross-uid sigma-root BROKER (the OPTIONAL on-demand root-signing custody), from the current state (Phase A attested = signal 6; the root broker NOT yet deployed)
canonical: sigma-root-broker-deploy.md (the spine + every honest ceiling) ; cross-uid-broker.md (the custody-deploy mechanics steps 1-4 defer to) ; sigma-root-deploy.md Phase B (persona provisioning)
---

# Deploy the cross-uid sigma-root BROKER -- the remaining operator sheet (OPTIONAL)

> **This is the operator's sheet, not Claude's (NS-7).** Claude wrote it; Claude runs NO step -- no uid create,
> no key install, no `K_root` transfer, no `/etc` write, no sudoers edit, no arming, no attestation. Canonical
> rationale + every honest ceiling live in [`sigma-root-broker-deploy.md`](sigma-root-broker-deploy.md); the
> custody-deploy mechanics steps 1-4 defer to live in [`cross-uid-broker.md`](cross-uid-broker.md). This sheet is
> the copy-paste execution layer over them, with the current box-state baked in.

## 0. DECISION GATE -- you probably do NOT need this (read before anything)

Phase B already provisions each persona binding by loading `K_root_priv` **once, in the Mac enclave, OFF the box**
(the `{ privateKeyPem }` path -- signal 6 / Phase B ran exactly this on 2026-07-05). Because a sigma-root binding
is a **STATIC** fact (persona <-> key <-> controller; no nonce, no rotation until the `.v2` epoch), that enclave
one-shot is **sufficient AND the strongest custody** for provisioning.

Deploy this broker **only if you need on-demand root signing ON the box** (dynamic provisioning without an enclave
round-trip per binding). The cost is explicit and real:

> **This step INSTALLS the already-attested `K_root_priv` onto the deployed box** (under a separate uid, `0600`).
> That is the exact material the enclave path (signal 6) deliberately kept on the Mac. Moving it **downgrades the
> root's custody from air-gapped / never-on-box to R-heap-bounded / on-box** (`r-heap-runbook.md`: host-root /
> `ptrace` / `/proc/pid/mem` can still read it on a mis-hardened box). **And the transfer itself transits the host
> uid at deploy** (step 1c): `K_root_priv` leaves the Mac and is written under the broker uid on the box -- a real
> additional exposure beyond the steady-state R-heap bound. If you do not need on-demand signing, **STOP here and
> keep provisioning through the Mac enclave** -- this sheet buys you nothing but exposure.

If you proceed, what you get is the **custody axis only** (integrity: a host compromise cannot `read()` `K_root`
without the broker uid) -- the potential **7th** world-anchored signal, the root-custody analog of signal 5's
frame-broker custody. It **HARDENS nothing about trust/provenance** (that was signal 6's A.3, already done).

## You are here

| Banked (do NOT redo) | Date | What |
|---|---|---|
| **Signal 5** ([live-edge-run](live-edge-run-2026-07-04.md)) | 2026-07-04 | the **frame** broker (`pactbroker`, uid 999) custody + a live edge on `rheap` |
| **Signal 6** ([root-attestation-run](root-attestation-run-2026-07-05.md)) | 2026-07-05 | root **Phase A**: `K_root` minted off-box (A.1) + `K_root_pub` **attested** to Rekor (A.3, `logIndex 2079476377`, `human:merlin95`) -- the sole trust HARDEN |
| **Phase B** (same record) | 2026-07-05 | a SHADOW provision dogfood via the **enclave** path (`did:key:zMerlin1`, `sigmaRootChecksPassed: true`) -- **not** a signal; this is where the A.2 `registerRoot` seed ran (a non-persisted in-memory construction, not a harden) |

**Remaining (this sheet):** the cross-uid **root broker** (`pact-root-broker`, `PACT_ROOT_KEY_FILE`) has **never
been deployed**. Everything below is that deploy, and it stays **SHADOW** -- `convert(...).actionable` is
hard-`false`, nothing gates. Arming (Phase C) is a separate, further-deferred step (a live root-schema registry
path + P2, else NS-9 theater); it is NOT in this sheet.

## Where each step runs -- and WHY

| Step | Runs on | Why |
|---|---|---|
| 1 create `pact-root-broker` + install `K_root` | **the box** (`rheap`) | the broker uid must own `K_root` `0600`, readable by neither the host uid nor the frame broker uid |
| 1 `K_root_priv` transfer Mac -> box | Mac -> box | the attested `K_root_priv` lives on the Mac (`~/.pact-root`); on-demand signing requires it on the box (the §0 downgrade) |
| 2 wrapper + guards | **the box** | root-owned, not host-writable; sets `PACT_ROOT_*` literally + the two mandatory blind-oracle guards |
| 3 sudoers + audits | **the box** | host may run ONLY the wrapper as `pact-root-broker`, `env_reset`, no `SETENV` |
| 4 provision via the cross-uid signer | **the box**, as the host uid | the provisioning process calls the broker cross-uid; `K_root_priv` never materializes in it |
| 5 verify AS the host uid | **the box** | the host proves it cannot read `K_root`, the wire-check verifies, the deny controls fire |
| 6 attestation | -- | **already done** (signal 6); this sheet does not repeat A.3 |

## Access -- if `rheap` is a Multipass VM

`rheap` here is a **Multipass VM** (Ubuntu on the Mac). Multipass does not expose plain `ssh`/`scp` by default --
reach the guest with `multipass shell / exec / transfer`. The box-side steps (1-5) run inside `multipass shell
rheap` verbatim (`ubuntu` has passwordless `sudo`); only the two Mac->box transfers differ:

| Purpose | Multipass (this VM) | Plain SSH host |
|---|---|---|
| interactive shell on the box | `multipass shell rheap` | `ssh you@rheap` |
| stream `K_root_priv` in (step 1c) | `multipass exec rheap -- sudo sh -c '...' < <keyfile>` | `ssh you@rheap "sudo sh -c '...'" < <keyfile>` |
| copy a file in (step 4) | `multipass transfer <local> rheap:/home/ubuntu/<name>` | `scp <local> you@rheap:~/<name>` |

The concrete Multipass forms (with the SSH form beside them) are inlined in steps 1c and 4 below. Everything else is
run **inside `multipass shell rheap`** as user `ubuntu`.

## Decide first (values reused everywhere -- confirm each against your box)

- `BOX` -- the deployed host. This sheet templates `rheap`. **Caveat:** `rheap` already holds the frame broker +
  the persona registry; putting `K_root` there too **concentrates the trust root on one general-purpose box**.
  Prefer a more isolated host if you can; if you reuse `rheap`, accept the concentration consciously.
- `HOST_UID` -- the host uid that will call the broker: `1000` on `rheap` (`ubuntu`).
- `ROOT_BROKER_USER` -- a NEW system user, e.g. `pact-root-broker`, **distinct from BOTH** `ubuntu` (1000) **and**
  the frame broker `pactbroker` (999). Step 1a lets `useradd --system` **auto-pick** a free uid -- do NOT hardcode
  one (`998` is `systemd-network` on Ubuntu 24.04; a hardcoded `--uid` collides, and a `getent`-by-uid guard then
  silently SKIPS the create).
- `CONTROLLER` -- `human:merlin95` (the byte-identical `humanUid` seeded in A.2 / signal 6; copy it, do NOT retype).
- `K_root` source -- the attested private key on the Mac at `~/.pact-root/K_root_priv.pem` (`0600`); its public
  half at `~/Documents/PACT/K_root_pub.pem` (the attested A.1 key -- the Rekor subject; NOT in `~/.pact-root/`).
- Tree -- `/opt/pact` (the `v0/` tree). **MUST be root-owned (or a non-host uid), NOT host-writable, and CURRENT**
  -- it must contain the plan-42 broker code (`sigma-root-broker.js` etc.); a tree synced BEFORE that merged fails
  with `MODULE_NOT_FOUND` at step 4. The broker execs this code as its own uid, so a host-writable tree is a full
  custody bypass (step 1's prereq). Bring it current AS ROOT: if `/opt/pact` is a git checkout, a root-run
  `git pull`; if it is a plain copied tree (NOT a repo -- check `git -C /opt/pact rev-parse` ), re-sync from the Mac
  straight into a root-owned tree (no host-uid-owned transit):
  `COPYFILE_DISABLE=1 tar -C ~/Documents/PACT -cf - v0/src | multipass exec rheap -- sudo tar --no-same-owner -C /opt/pact -xf -`.
  Never sync as the host uid.
- `PERSONA_DID` -- the PACT identity (a `did:key:...`) you are wire-checking in step 4. **This is a NEW PACT
  cryptographic identity, unrelated to HETS agent personas** (`provision-verify.js` mints a fresh keypair for it).
  `provision-verify.js` **fails closed** if it is unset -- pass a real `did:key:...`, or `did:key:zRootBrokerDemo1`
  for a throwaway wire-check (nothing persists either way; SHADOW).

## 1. Create `pact-root-broker` + install `K_root` (deltas over `cross-uid-broker.md` §1-2)

**Prereq -- the code tree must NOT be host-writable.** The wrapper (step 2) execs
`node /opt/pact/v0/src/identity/sigma-root-broker.js` **as the broker uid**. If the host uid can write
`/opt/pact/v0/src`, it injects code that runs as the broker uid and reads `K_root` -- defeating the entire
boundary this deploy exists to build. `/opt/pact/v0` MUST be root-owned (or a non-host uid) and not host-writable;
bring it current with a **root-run** `git pull`, never as the host uid. Audit it in step 5.1.

**ON THE BOX** (`multipass shell rheap`, as `ubuntu`):

```sh
# 1a. a DISTINCT system user (no login). Guard on the USERNAME (not a uid), and let useradd AUTO-PICK a free system
#     uid -- hardcoding --uid collides (998 = systemd-network on Ubuntu 24.04) and the guard would then skip. Idempotent:
id -u pact-root-broker >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin pact-root-broker
id pact-root-broker   # confirm; the auto-assigned uid is distinct from 1000 and 999 by construction

# 1b. the key DIR 0755 (traversable so the host owner-verify in step 5 works), owned by the broker uid:
sudo install -d -o pact-root-broker -g "$(id -gn pact-root-broker)" -m 0755 /etc/pact-root
```

**1c. transfer the ATTESTED `K_root_priv` from the Mac** (the §0 downgrade -- do this ONLY if on-demand is
required). Stream it straight into a root-created `0600` file (no on-disk stage, never host-uid-owned or
world-readable). **RUN THIS FROM THE MAC** (not inside the shell); `ubuntu` has passwordless sudo, so it needs no
password:

```sh
# Multipass VM (this box):
multipass exec rheap -- sudo sh -c 'set -e; umask 077; tee /etc/pact-root/K_root.pem >/dev/null && chown pact-root-broker /etc/pact-root/K_root.pem' < ~/.pact-root/K_root_priv.pem

# plain SSH host instead:
# ssh you@rheap "sudo sh -c 'set -e; umask 077; tee /etc/pact-root/K_root.pem >/dev/null && chown pact-root-broker /etc/pact-root/K_root.pem'" < ~/.pact-root/K_root_priv.pem
```

> `set -e` + `&&` => a failed `tee` never leaves a partial key that then gets chowned to the broker; the transfer
> fails CLOSED.

**Then, ON THE BOX**, first confirm the key actually landed -- an empty stream (multipass not forwarding stdin, or
an empty source) would `tee` a 0-byte key that the distinctness `cmp` below still reports as "differ", so it would
fail only much later at step 4:

```sh
sudo test -s /etc/pact-root/K_root.pem && sudo head -1 /etc/pact-root/K_root.pem | grep -q 'BEGIN.*PRIVATE KEY' \
  && echo 'K_root present + PEM-shaped' \
  || echo 'ABORT: K_root missing/empty/not-a-PEM -- re-run the step-1c transfer'
```

Then the key-distinctness check (AS ROOT -- both keys are `0600` under different system uids, so a
plain-uid `cmp` gets `Permission denied` and never compares; the `sudo` is load-bearing, else the ABORT gate is
vacuous). The in-code same-inode guard is **inert** in this topology (it fires only when `PACT_BROKER_KEY_FILE` is
set in the broker env, which sudoers `env_reset` strips):

```sh
sudo ls -i /etc/pact-root/K_root.pem /etc/pact/broker.key    # the two inode numbers MUST differ
sudo cmp   /etc/pact-root/K_root.pem /etc/pact/broker.key    # MUST print "differ"; identical bytes = a signing oracle, ABORT
```

The key DIR is `0755` (the key itself `0600`) on purpose -- the host uid must be able to `ls -l` the key in step 5
to confirm a **different** owner. A `0700` dir blinds that check.

## 2. The wrapper -- with the two MANDATORY guards (delta over `cross-uid-broker.md` §3)

**ON THE BOX**, as `ubuntu`. First confirm `node` is the ROOT-owned system binary the wrapper will `exec` -- a
nvm/snap node at a host-writable path would break the exec (a confusing `signSigmaRoot returned null` at step 4),
and repointing the wrapper to a host-writable node would let the host uid inject code that runs as the broker uid:

```sh
[ "$(command -v node)" = /usr/bin/node ] && [ "$(stat -c '%U' /usr/bin/node)" = root ] \
  && echo 'node OK (/usr/bin/node, root-owned)' \
  || echo 'ABORT: node is not root-owned /usr/bin/node -- fix before deploying; do NOT repoint the wrapper to a host-writable node'

# the broker code the wrapper will exec MUST be present + root-owned -- a STALE /opt/pact tree fails only later,
# as MODULE_NOT_FOUND at step 4 (re-sync it via Decide-first "Tree"):
[ "$(stat -c '%U' /opt/pact/v0/src/identity/sigma-root-broker.js 2>/dev/null)" = root ] \
  && echo 'broker code OK (sigma-root-broker.js present, root-owned)' \
  || echo 'ABORT: /opt/pact/v0/src/identity/sigma-root-broker.js missing or not root-owned -- re-sync the v0/src tree first'
```

Then write the wrapper:

```sh
sudo tee /usr/local/bin/pact-root-broker-sign >/dev/null <<'EOF'
#!/bin/sh
export PACT_ROOT_KEY_FILE=/etc/pact-root/K_root.pem
export PACT_ROOT_CONTROLLER=human:merlin95        # byte-identical to the A.2-seeded humanUid; copy, do NOT retype
export PACT_ROOT_ALLOWED_UIDS=1000                # this broker's OWN WHO-allowlist; NARROWER than the frame broker's; NEVER reuse PACT_BROKER_ALLOWED_UIDS
export PACT_ROOT_REQUIRE_BINDING=1                # set EXPLICITLY -- do NOT rely on the code default-ON

# --- MANDATORY startup guards (the blind K_root oracle) -- both lines ABOVE the exec ---
case "$(printf %s "$PACT_ROOT_CONTROLLER" | tr -d ' \t')" in '') echo 'refusing: PACT_ROOT_CONTROLLER empty/whitespace -- require-binding would be the BLIND K_root ORACLE' >&2; exit 78 ;; esac
case "$(printf %s "$PACT_ROOT_REQUIRE_BINDING" | tr -d ' \t')" in 0) echo 'refusing: PACT_ROOT_REQUIRE_BINDING=0 disables the K_root bind gate (the BLIND ORACLE)' >&2; exit 78 ;; esac

exec /usr/bin/node /opt/pact/v0/src/identity/sigma-root-broker.js "$@"
EOF
sudo chown root:root /usr/local/bin/pact-root-broker-sign
sudo chmod 0755      /usr/local/bin/pact-root-broker-sign   # root-owned, NOT host-writable (a host-writable wrapper is a priv-esc hole)
```

Why the guards are MANDATORY (not "recommended" as for the frame broker): with require-binding OFF the broker signs
the argv 64-hex **blindly** with `K_root` -- a universal forgery oracle for the **trust root**. It goes OFF on TWO
paths, and the guard closes BOTH: (a) `PACT_ROOT_CONTROLLER` unset **or whitespace-only** (the code trims it via
`trimAscii`, `binding-request-auth.js:56`, so a `' '` value is "unset" to the gate while a naive `[ -n ]` shell
test would pass it -- the `tr -d` in the guard mirrors the code); (b) an explicit `PACT_ROOT_REQUIRE_BINDING=0`
**even with the controller set** (a realistic copy-paste from a frame wrapper, which normalizes `=0` as a legacy
mode).

## 3. Sudoers -- the env-pin + the two audits (defer to `cross-uid-broker.md` §4)

**ON THE BOX**, as `ubuntu`. Write to a `.tmp` (sudo ignores dotted filenames, so it stays inert), **validate**, then
activate under the real name -- a bad sudoers file never goes live:

```sh
sudo tee /etc/sudoers.d/pact-root-broker.tmp >/dev/null <<'EOF'
# ubuntu(1000) may run ONLY the root-broker wrapper, as pact-root-broker, no password.
ubuntu ALL=(pact-root-broker) NOPASSWD: /usr/local/bin/pact-root-broker-sign

# PIN env policy explicitly; forbid SETENV so neither host nor command line can inject code-loading / key-path vars.
Defaults:ubuntu env_reset, !setenv
Defaults!/usr/local/bin/pact-root-broker-sign env_reset, !setenv
EOF
sudo visudo -cf /etc/sudoers.d/pact-root-broker.tmp \
  && sudo install -m 0440 -o root -g root /etc/sudoers.d/pact-root-broker.tmp /etc/sudoers.d/pact-root-broker.staged \
  && sudo mv /etc/sudoers.d/pact-root-broker.staged /etc/sudoers.d/pact-root-broker \
  && sudo rm -f /etc/sudoers.d/pact-root-broker.tmp \
  && echo 'sudoers installed + validated' \
  || { echo 'SUDOERS INVALID -- NOT installed'; sudo rm -f /etc/sudoers.d/pact-root-broker.tmp /etc/sudoers.d/pact-root-broker.staged; }
```

Then run BOTH audits (each MUST print nothing) -- they gate `K_root` exfiltration and are strictly more important
for the trust root than for the frame broker:

```sh
# (a) no code-loading var survives into the broker child (would exfil K_root from INSIDE the root broker):
sudo -l -U ubuntu | grep -iE 'env_keep.*(NODE_OPTIONS|BASH_ENV|LD_|DYLD_)'   # MUST print nothing
# (b) SUDO_* must NOT be env_kept -- caller-auth keys on SUDO_UID; a host-supplied SUDO_UID voids the WHO-gate:
sudo -l -U ubuntu | grep -iE 'env_keep.*SUDO_'                                # MUST print nothing
```

## 4. Provision a persona through the cross-uid signer (delta over `sigma-root-deploy.md` Phase B)

Copy the **attested** public key to the box -- the byte-identical Rekor subject (`logIndex 2079476377`); copying
any other public key validates the WRONG root. **FROM THE MAC:**

```sh
# Multipass VM (this box):
multipass transfer ~/Documents/PACT/K_root_pub.pem rheap:/home/ubuntu/K_root_pub.pem
# plain SSH host instead:  scp ~/Documents/PACT/K_root_pub.pem you@rheap:~/K_root_pub.pem
```

**ON THE BOX**, confirm the copy is the ATTESTED root (the Rekor subject, `logIndex 2079476377`) -- not a stale or
swapped key. `provision-verify.js` roots the whole construction on this pubkey, so a wrong one gives a green
wire-check against the WRONG root:

```sh
echo '47844a455f7ae9066f318f12b8ab60a583c10be8ae5126a81434dbc4ee2342cf  /home/ubuntu/K_root_pub.pem' | sha256sum -c -
#   MUST print "... OK". (This digest is THIS deployment's attested K_root_pub == the Rekor subject; another
#   deployment substitutes its own -- `shasum -a 256 ~/Documents/PACT/K_root_pub.pem` on the Mac.) A FAIL => stop.
```

Then, **ON THE BOX as `ubuntu`**, write and run `provision-verify.js`. It builds an in-memory registry (the box's
live `/etc/pact/registry.json` is persona-rows-only -- so this is a SHADOW **construction**, not a live-read-path
write; persisting is the deferred Phase C), provisions the persona through the cross-uid broker, and runs the
step-5.2 + 5.4 checks **in the SAME process** (splitting them re-mints a different `K_pub` and false-fails the
wire-check):

```sh
cat > /home/ubuntu/provision-verify.js <<'EOF'
const { createRegistry, registerRoot, registerPersona, lookupRootKey } = require('/opt/pact/v0/src/identity/registry');
const { generateEdgeKeypair } = require('/opt/pact/v0/src/lib/edge-attestation');
const { crossUidBrokerSigner } = require('/opt/pact/v0/src/identity/broker-launch');
const { signSigmaRoot, verifySigmaRoot } = require('/opt/pact/v0/src/identity/sigma-root');
const { assessRegistrationFromRegistry } = require('/opt/pact/v0/src/identity/registration-provenance');
const fs = require('fs');

const CONTROLLER = 'human:merlin95';                              // == PACT_ROOT_CONTROLLER
const P = process.env.PERSONA_DID;   // fail closed -- no silent demo; you name the identity being wire-checked
if (!P) { console.error('set PERSONA_DID -- a real did:key:... , OR did:key:zRootBrokerDemo1 for a throwaway wire-check (nothing persists either way; SHADOW)'); process.exit(2); }

const reg = createRegistry();                                    // SHADOW in-memory construction (NOT rheap's live registry)
registerRoot(reg, { humanUid: CONTROLLER, rootPublicKeyPem: fs.readFileSync(process.env.HOME + '/K_root_pub.pem', 'utf8') });
const { publicKeyPem: K_pub } = generateEdgeKeypair();          // this SHADOW verify DISCARDS the persona priv key; a real Phase-C provision would capture + persist privateKeyPem
registerPersona(reg, { personaDid: P, humanUid: CONTROLLER, publicKeyPem: K_pub });

// the ROOT signs the binding via the CROSS-UID broker; K_root_priv never materializes in THIS process:
const sigmaRoot = signSigmaRoot(
  { personaDid: P, publicKeyPem: K_pub, controller: CONTROLLER },   // controller MUST equal PACT_ROOT_CONTROLLER
  { signer: crossUidBrokerSigner({ brokerUser: 'pact-root-broker', wrapperPath: '/usr/local/bin/pact-root-broker-sign' }) },
);
if (!sigmaRoot) throw new Error('signSigmaRoot returned null -- broker refused or bad binding; do NOT persist a null');

const ok = verifySigmaRoot({ personaDid: P, publicKeyPem: K_pub, controller: CONTROLLER,      // 5.2 wire-check
  sigmaRoot, rootPublicKeyPem: lookupRootKey(reg, CONTROLLER) });
const v = assessRegistrationFromRegistry(reg, { personaDid: P, sigmaRoot });                   // 5.4 read-side (SHADOW)

console.log('persona         :', P);
console.log('wire-check ok   :', ok);                       // MUST be true
console.log('sigmaRootChecks :', v.sigmaRootChecksPassed);  // MUST be true  (convert(...).actionable stays false -- SHADOW)
EOF
node /home/ubuntu/provision-verify.js
```

## 5. Verify -- AS THE HOST UID -- (attestation is already done: step 6)

`provision-verify.js` (step 4) already ran **5.2** (the wire-check `ok`) and **5.4** (the read-side
`sigmaRootChecks`) in one process -- both must print `true`. The remaining checks are shell-only; run them **ON THE
BOX** as `ubuntu`:

**5.1 -- the host cannot read `K_root`** + the code tree is not host-writable (the C1 boundary). Use the LITERAL key
path (`$PACT_ROOT_KEY_FILE` is stripped from the host shell by `env_reset` and would test nothing):

```sh
cat /etc/pact-root/K_root.pem     # MUST print: Permission denied  (the custody EACCES)
ls -l /etc/pact-root/K_root.pem   # OWNER must be pact-root-broker, NOT you (the 0755 dir makes this visible)
find /opt/pact/v0 -writable        # MUST print nothing  (else the host uid can inject code that runs as the broker uid)
stat -c '%U' /usr/bin/node         # MUST print: root
```

**5.3 -- the deny controls** (each: **empty stdout + exit 1**; the broker writes the sig to stdout ONLY on success).
The foreign-uid control is self-contained (flip the allowlist to a NON-member, deny, restore); the shipped allowlist
is your own uid (`1000`), so without the flip the call would SUCCEED. You **must pipe a stdin body** -- require-mode
drains stdin BEFORE the caller-auth gate (`broker-core.js:86` before `:95`), so an UNPIPED call hangs 2s ->
`read-timeout`, never reaching the WHO gate:

```sh
HEX=$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')
sudo sed -i 's/PACT_ROOT_ALLOWED_UIDS=1000/PACT_ROOT_ALLOWED_UIDS=999/' /usr/local/bin/pact-root-broker-sign  # flip to a NON-member
printf '{}' | sudo -n -u pact-root-broker /usr/local/bin/pact-root-broker-sign "$HEX"      # -> "caller not authorized", empty stdout, exit 1
sudo sed -i 's/PACT_ROOT_ALLOWED_UIDS=999/PACT_ROOT_ALLOWED_UIDS=1000/' /usr/local/bin/pact-root-broker-sign  # RESTORE
```

The two further deny controls (optional -- the full deny set):

```sh
# FRAME body (missing controller/publicKeyPem/personaDid) -> computeBindingId THROWS -> uncomputable -> deny:
printf '{"nonce":"x"}' | sudo -n -u pact-root-broker /usr/local/bin/pact-root-broker-sign "$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
#   -> "request not authorized", empty stdout, exit 1

# FOREIGN-controller binding -> compute the id FIRST (so recompute-bind PASSES and controller-bind is the denier):
BODY='{"personaDid":"did:key:zAttacker","publicKeyPem":"x","controller":"human:not-merlin95"}'
FID=$(node -e 'process.stdout.write(require("/opt/pact/v0/src/identity/sigma-root").computeBindingId(JSON.parse(process.argv[1])))' "$BODY")
printf '%s' "$BODY" | sudo -n -u pact-root-broker /usr/local/bin/pact-root-broker-sign "$FID"
#   -> "request not authorized", empty stdout, exit 1   (recompute-bind passes; controller mismatch is the provable denier)
```

(The single-uid flip is the LESS-rigorous form; the two-real-uid test in `plans/16` is stronger -- prefer it for the
trust root.)

## 6. Attestation -- already done (do NOT repeat)

The sole trust HARDEN is the A.3 `K_root_pub` attestation, and it is **complete** -- signal 6, 2026-07-05, Rekor
`logIndex 2079476377`. This custody deploy world-anchors only `K_root`'s **key-custody**; it does not substitute
for, or repeat, A.3. There is **no `assertBrokerPersona` step and no "register the broker persona" step** for the
root -- the root broker has **no persona**; the consistency check is the CONTROLLER triple
(`PACT_ROOT_CONTROLLER` == the binding's `controller` == the seeded `humanUid`). Do not add a persona step by rote
from `cross-uid-broker.md` §5.

## Honest boundaries (NS-9)

- **HARDENS custody, NOT provenance.** A completed deploy world-anchors `K_root`'s non-exfiltration axis
  (integrity) -- the potential 7th signal. It hardens **nothing** about trust; A.3 (signal 6) did that.
- **Does NOT close R1 (raised-stakes #273).** A same-uid **WHO-authorized** (allowlisted) caller reaching the
  broker via sudo -- an allowlisted host uid, **not the broker uid itself** -- still mints "K_root authorized MY
  key as persona P" for any P (`publicKeyPem` is caller-supplied).
  R1 survives EVEN A.3 + this cross-uid signer; it closes only with an authenticated minter binding the payload
  semantics -- a separate frontier.
- **Does NOT close R2 (replay/revocation)** -- a sigma-root binding is idempotent (no nonce); revocation arrives
  with the `.v2` rotation-epoch. **Does NOT close the W3 apex** -- a same-uid self-`registerRoot` + self-sign still
  passes the crypto judge.
- **DiD liveness caveat (optional §2 defense-in-depth).** You MAY set `PACT_BROKER_KEY_FILE=<frame key path>`
  read-only in the wrapper to activate the in-code same-inode guard against an alias -- but a byte-copy still
  evades it (the `cmp` stays the real check), and enabling it **couples the root broker's liveness to the frame key
  staying stattable** by the root-broker uid: if that key's dir is `0700`, `broker-core.js` fails CLOSED and
  refuses every sign (`... unstattable -- cannot prove key separation`). Keep the frame key dir `0755`-traversable,
  or omit the DiD.
- **R-heap ceiling (one box / one run / one axis).** "Still deployed" decays -- **re-probe at deploy**:
  `sysctl kernel.yama.ptrace_scope`, `swapon --show`, `core_pattern` (`r-heap-runbook.md`). A byte-copy of `K_root`
  to another path is a single logical key the inode check cannot see; key-material distinctness is operator custody
  (the §1 `cmp`).
- **Gates nothing** -- `convert(...).actionable` stays `false` throughout.

## Hand back when done

The step-4 `wire-check ok: true` + `sigmaRootChecks: true` output + the step-5.1 `Permission denied` transcript
(owner = `pact-root-broker`, a different uid) + the `ptrace_scope` / `swapon` / `core_pattern` re-probe. Then a
human calls whether it lands as the **7th** world-anchored signal (custody axis) or is skipped in favor of the
enclave path. Arming (Phase C) stays deferred.
