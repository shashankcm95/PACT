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
> uid at deploy** (step 1c): unless you use the streaming form, `K_root_priv` briefly lands on the box as
> host-uid-owned plaintext before it is installed under the broker uid -- a real, if brief, additional exposure
> beyond the steady-state R-heap bound. If you do not need on-demand signing, **STOP here and keep provisioning
> through the Mac enclave** -- this sheet buys you nothing but exposure.

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

## Decide first (values reused everywhere -- confirm each against your box)

- `BOX` -- the deployed host. This sheet templates `rheap`. **Caveat:** `rheap` already holds the frame broker +
  the persona registry; putting `K_root` there too **concentrates the trust root on one general-purpose box**.
  Prefer a more isolated host if you can; if you reuse `rheap`, accept the concentration consciously.
- `HOST_UID` -- the host uid that will call the broker: `1000` on `rheap` (`ubuntu`).
- `ROOT_BROKER_USER` -- a NEW system user, e.g. `pact-root-broker`, **distinct from BOTH** `ubuntu` (1000) **and**
  the frame broker `pactbroker` (999). Pick an unused uid (e.g. `998`).
- `CONTROLLER` -- `human:merlin95` (the byte-identical `humanUid` seeded in A.2 / signal 6; copy it, do NOT retype).
- `K_root` source -- the attested private key on the Mac at `~/.pact-root/K_root_priv.pem` (`0600`); its public
  half at `~/Documents/PACT/K_root_pub.pem` (the attested A.1 key -- the Rekor subject; NOT in `~/.pact-root/`).
- Tree -- `/opt/pact` (the `v0/` tree). **MUST be root-owned (or a non-host uid) and NOT host-writable** -- the
  broker execs this code as its own uid, so a host-writable tree is a full custody bypass (see step 1's prereq).
  Bring it current with a **root-run** `git pull`, never as the host uid.
- `K_root_pub.pem` on the box -- the PUBLIC half (safe to copy freely); step 4 reads it. `scp` it to the host
  home (`~/K_root_pub.pem`), a path the host uid can read.

## 1. Create `pact-root-broker` + install `K_root` (deltas over `cross-uid-broker.md` §1-2)

**Prereq -- the code tree must NOT be host-writable.** The wrapper (step 2) execs
`node /opt/pact/v0/src/identity/sigma-root-broker.js` **as the broker uid**. If the host uid can write
`/opt/pact/v0/src`, it injects code that runs as the broker uid and reads `K_root` -- defeating the entire
boundary this deploy exists to build. `/opt/pact/v0` MUST be root-owned (or a non-host uid) and not host-writable;
bring it current with a **root-run** `git pull`, never as the host uid. Audit it in step 5.1.

```sh
# 1a. a DISTINCT system user (no login), separate from ubuntu(1000) AND pactbroker(999); confirm 998 is unused first:
getent passwd 998 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin --uid 998 pact-root-broker

# 1b. the key DIR 0755 (traversable so the host owner-verify in step 5 works), owned by the broker uid:
sudo install -d -o pact-root-broker -g "$(id -gn pact-root-broker)" -m 0755 /etc/pact-root

# 1c. transfer the ATTESTED K_root_priv from the Mac (the §0 downgrade -- do this ONLY if on-demand is required).
#     PREFERRED (no on-disk stage, never host-uid-owned, never world-readable): stream it straight into a
#     root-created 0600 file. Run FROM the Mac; needs the box's sudo non-interactive (NOPASSWD or a warm sudo):
ssh you@rheap "sudo sh -c 'set -e; umask 077; tee /etc/pact-root/K_root.pem >/dev/null && chown pact-root-broker /etc/pact-root/K_root.pem'" < ~/.pact-root/K_root_priv.pem
#     (set -e + && => a failed tee never leaves a partial key that then gets chowned to the broker; fails CLOSED.)

#     FALLBACK (sudo needs a password): stage 0600 in your OWN 0700 home via mktemp -- an unpredictable name (NOT a
#     fixed /tmp path a local attacker can pre-create/symlink), scp -p (preserves 0600, NOT the default 0644),
#     install, shred. K_root still transits host-uid-owned plaintext here -- accept the §0 caveat. The `trap` shreds
#     the stage even if scp/install ABORTS midway (never leave a lingering plaintext root key):
#       ON THE BOX:  umask 077; S=$(mktemp "$HOME/.kroot-stage.XXXXXX"); trap 'shred -u "$S" 2>/dev/null || rm -f "$S"' EXIT INT HUP TERM
#       FROM MAC:    scp -p ~/.pact-root/K_root_priv.pem you@rheap:"<the $S path>"
#       ON THE BOX:  sudo install -o pact-root-broker -g "$(id -gn pact-root-broker)" -m 0600 "$S" /etc/pact-root/K_root.pem
#                    shred -u "$S" 2>/dev/null || rm -f "$S"   # explicit cleanup on the happy path; the trap is the abort backstop
```

- The key DIR is **`0755`** (the key itself `0600`) on purpose -- the host uid must be able to `ls -l` the key in
  step 5 to confirm a **different** owner. A `0700` dir blinds that check (`cross-uid-broker.md` §2).
- **`K_root` MUST be a physically distinct key from the frame broker's `K_broker`** (`/etc/pact/broker.key`). The
  in-code same-inode guard is **inert** in this topology (it fires only when `PACT_BROKER_KEY_FILE` is set in the
  broker env, and sudoers `env_reset` strips it), so run the distinctness check **out-of-band, once, AS ROOT** --
  both keys are `0600` under two different system uids, so a plain-uid `cmp` gets `Permission denied` and never
  compares; the `sudo` is load-bearing (without it the ABORT gate is vacuous):

```sh
sudo ls -i /etc/pact-root/K_root.pem /etc/pact/broker.key    # the two inode numbers MUST differ
sudo cmp    /etc/pact-root/K_root.pem /etc/pact/broker.key    # MUST print "differ"; identical bytes = a signing oracle, ABORT
```

## 2. The wrapper -- with the two MANDATORY guards (delta over `cross-uid-broker.md` §3)

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

```sh
sudo visudo -f /etc/sudoers.d/pact-root-broker
```

```sudoers
# ubuntu(1000) may run ONLY the root-broker wrapper, as pact-root-broker, no password.
ubuntu ALL=(pact-root-broker) NOPASSWD: /usr/local/bin/pact-root-broker-sign

# PIN env policy explicitly; forbid SETENV so neither host nor command line can inject code-loading / key-path vars.
Defaults:ubuntu env_reset, !setenv
Defaults!/usr/local/bin/pact-root-broker-sign env_reset, !setenv
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

Run AS THE HOST UID on the box. Build the in-memory registry (the box's live `/etc/pact/registry.json` is
persona-rows-only -- no root schema -- so this is a **construction**, not a live-read-path write; persisting to the
live gate is the deferred Phase C, and it is SHADOW regardless).

First copy the PUBLIC key to the box (safe to copy freely). Use the **attested** `K_root_pub.pem` from A.1 -- the
byte-identical Rekor subject (`logIndex 2079476377`), written by the A.1 mint to `~/Documents/PACT/K_root_pub.pem`
(its priv half is `~/.pact-root/K_root_priv.pem`; the pub was NOT written there). Copying any other public key
validates the WRONG root: `scp ~/Documents/PACT/K_root_pub.pem you@rheap:~/K_root_pub.pem`.
Then run **step 4 and step 5's JS in ONE node session** (a single `provision-verify.js`, or one REPL): `reg` / `P` /
`K_pub` / `sigmaRoot` carry from step 4 into the step-5 verify. Running them as separate `node` processes throws a
`ReferenceError`, and "helpfully" re-running `generateEdgeKeypair()` in a fresh process yields a DIFFERENT `K_pub`
than the broker signed, so the wire-check falsely reads `ok === false` (a confusing false-negative on the trust
root). The shell blocks 5.1 and 5.3 run separately, as the host uid.

```js
const { createRegistry, registerRoot, registerPersona } = require('/opt/pact/v0/src/identity/registry');
const { generateEdgeKeypair } = require('/opt/pact/v0/src/lib/edge-attestation');
const { crossUidBrokerSigner } = require('/opt/pact/v0/src/identity/broker-launch');
const { signSigmaRoot } = require('/opt/pact/v0/src/identity/sigma-root');
const fs = require('fs');

const reg = createRegistry();
registerRoot(reg, { humanUid: 'human:merlin95', rootPublicKeyPem: fs.readFileSync(process.env.HOME + '/K_root_pub.pem', 'utf8') });

const P = 'did:key:<new-persona>';
const { publicKeyPem: K_pub, privateKeyPem: K_priv } = generateEdgeKeypair();   // guard K_priv; it is the persona's key
registerPersona(reg, { personaDid: P, humanUid: 'human:merlin95', publicKeyPem: K_pub });

// B.3 -- the ROOT signs the binding via the CROSS-UID broker; K_root_priv never materializes in THIS process:
const sigmaRoot = signSigmaRoot(
  { personaDid: P, publicKeyPem: K_pub, controller: 'human:merlin95' },   // controller MUST equal PACT_ROOT_CONTROLLER
  { signer: crossUidBrokerSigner({ brokerUser: 'pact-root-broker', wrapperPath: '/usr/local/bin/pact-root-broker-sign' }) },
);
if (!sigmaRoot) throw new Error('signSigmaRoot returned null -- broker refused or bad binding; do NOT persist a null');
// signSigmaRoot threads the binding as the body; crossUidBrokerSigner forwards it on the broker child's stdin, so
// the broker recompute-binds (computeBindingId(body) === the signed id) + controller-binds before it signs.
```

## 5. Verify -- AS THE HOST UID -- (attestation is already done: step 6)

**5.1 -- the host cannot read `K_root`** (use the LITERAL path; `$PACT_ROOT_KEY_FILE` is stripped from the host
shell by `env_reset` and would test nothing):

```sh
cat /etc/pact-root/K_root.pem     # MUST print: Permission denied  (the custody EACCES)
ls -l /etc/pact-root/K_root.pem   # OWNER must be pact-root-broker, NOT you (the 0755 dir makes this visible)

# the C1 boundary: the code the broker execs must NOT be host-writable (else the host uid injects code that runs
# as the broker uid and reads K_root). As the host uid, BOTH must hold:
find /opt/pact/v0 -writable        # MUST print nothing
stat -c '%U' /usr/bin/node         # MUST print: root
```

**5.2 -- the wire-check** (custody consistency): verify the broker-produced `sigmaRoot` under the SEEDED root pubkey:

```js
const { verifySigmaRoot } = require('/opt/pact/v0/src/identity/sigma-root');
const { lookupRootKey } = require('/opt/pact/v0/src/identity/registry');
const ok = verifySigmaRoot({
  personaDid: P, publicKeyPem: K_pub, controller: 'human:merlin95',
  sigmaRoot,                                             // from step 4, produced by the broker
  rootPublicKeyPem: lookupRootKey(reg, 'human:merlin95'),  // the seeded K_root_pub
});
// ok === true is the PRECONDITION for a real binding to pass the read-side judge. false => mis-wired custody.
```

**5.3 -- the deny controls** (each: **empty stdout + exit 1**; the broker writes the sig to stdout ONLY on success).
Present the crafted binding preimage on stdin and the claimed id as argv, mirroring `cross-uid-broker.md` §9's
pattern (`printf '<body>' | sudo -n -u pact-root-broker /usr/local/bin/pact-root-broker-sign "<id>"`), constructing
each input so the intended gate is the denier:

- **Foreign uid** (not in `PACT_ROOT_ALLOWED_UIDS`) -> `caller not authorized`. **You MUST pipe a stdin body**
  (`printf '{}' | sudo -n -u pact-root-broker /usr/local/bin/pact-root-broker-sign "$HEX"`): require-mode drains
  stdin BEFORE the caller-auth gate (`broker-core.js:86` before `:95`), so an UNPIPED call (the frame-broker
  `cross-uid-broker.md` §8 form) hangs `READ_DEADLINE_MS` (2s) then fails `read-timeout`, never reaching the WHO
  gate. Flip the allowlist to a uid that is NOT yours, confirm the refuse, then **RESTORE** (`cross-uid-broker.md`
  §8). (The single-uid flip is the LESS-rigorous form -- it cannot rule out a malformed-allowlist deny, since the
  broker collapses every deny to one fixed message; the two-real-uid test in `plans/16` is stronger -- prefer it
  for the trust root.)
- **A FRAME body** (no `controller` / `publicKeyPem` / `personaDid`) -> `request not authorized`: `computeBindingId`
  throws, the binding is uncomputable (domain separation). Use a real frame preimage so the throw is genuine.
- **A FOREIGN-controller binding** -> `request not authorized`: compute `computeBindingId(foreignBinding)` from the
  EXACT body FIRST (recompute-bind runs BEFORE controller-bind), else it denies as `record-id-mismatch` and you
  tested the WRONG gate. With the id computed, the controller-bind is the provable denier.

**5.4 -- end-to-end read-side** (the composed property; stays SHADOW):

```js
const { assessRegistrationFromRegistry } = require('/opt/pact/v0/src/identity/registration-provenance');
const v = assessRegistrationFromRegistry(reg, { personaDid: P, sigmaRoot });
// v.sigmaRootChecksPassed === true   (branch on THIS, never on !requiresOutOfBandRootAttestation)
const { convert } = require('/opt/pact/v0/src/trust/convert');
// convert(meCtx, ME, P).actionable === false   -- SHADOW: nothing gates (NS-9)
```

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

The step-5 `ok === true` wire-check result + `sigmaRootChecksPassed: true` + the step-5.1 `Permission denied`
transcript (owner = `pact-root-broker`, a different uid) + the `ptrace_scope` / `swapon` / `core_pattern` re-probe.
Then a human calls whether it lands as the **7th** world-anchored signal (custody axis) or is skipped in favor of
the enclave path. Arming (Phase C) stays deferred.
