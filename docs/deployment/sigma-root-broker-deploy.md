---
lifecycle: persistent
audience: the operator (out-of-band, NS-7) + the USER (go-ahead gates)
composes: cross-uid-broker.md (the custody-deploy pattern) + sigma-root-deploy.md Phase A/B (genesis root + persona provisioning)
status: READY-TO-EXECUTE (the cross-uid sigma-root broker is merged SHADOW/import-dark; every step below is the operator's out-of-band act)
---

# Deploying the cross-uid sigma-root BROKER — root-key custody for the binding signer

> **This is the USER's runbook, not Claude's (NS-7).** Claude wrote this document; Claude will **never** run any
> step in it. Claude never creates a uid, mints or installs a key, writes `/etc`, edits sudoers, sets a deploy flag,
> arms a gate, or performs the root-key attestation. Those are operator acts, executed out-of-band on hosts Claude
> cannot reach.
>
> **SHADOW / honest-labeling header (read first).** This runbook makes `sigma-root-deploy.md` Phase B.3's `{ signer }`
> custody-boundary REAL: it puts `K_root` under a **separate OS uid** the deployed host process cannot `read()`, so a
> persona binding is signed by the W1b cross-uid **sigma-root broker** (`sigma-root-broker.js`) rather than by loading
> `K_root_priv` in the host process. **What it HARDENS:** the root key's **KEY-CUSTODY / non-exfiltration** axis — a
> world-anchored signal (a host compromise cannot `read()` `K_root` to forge arbitrary root bindings), the same axis
> `cross-uid-broker.md` hardens for the frame broker. That is **INTEGRITY, not PROVENANCE.** **What it HARDENS about
> trust: NOTHING.** The SOLE trust/provenance HARDEN is the out-of-band root-key attestation in `sigma-root-deploy.md`
> Phase A.3 (`cosign`/Rekor). A same-uid host can still self-`registerRoot` + self-sign and pass every in-process
> check (the W3 apex; `registration-provenance.js:64-66`) — integrity is not provenance.

## 0. What this deploys — and whether you even need it (broker vs enclave)

`sigma-root-deploy.md` Phase B.3 already signs each persona binding with `K_root_priv` loaded **once, in an enclave/HSM
OFF the deployed box** (`{ privateKeyPem }`), and `K_root_priv` is **never exported to the box**. Because a sigma-root
binding is a **STATIC** fact (persona ↔ key ↔ controller; no nonce, no rotation until the `.v2` epoch —
`sigma-root.js:23`), that enclave one-shot signing is **sufficient AND the strongest custody** for pure provisioning.

Deploy THIS cross-uid broker only when you need **on-demand** root signing on the box (dynamic persona provisioning
without an enclave round-trip per binding). The trade-off is explicit: the broker **puts `K_root` on the box** (under
a separate uid, `0600`) — its custody is **R-heap-bounded** (`r-heap-runbook.md`: host-root / `ptrace` / `/proc/pid/mem`
can still read it on a mis-hardened box), **not** the enclave's air-gapped never-on-box posture. If you do not need
on-demand signing, prefer the enclave path and skip this runbook.

## 1. Prerequisites (link — do NOT duplicate)

1. **`sigma-root-deploy.md` Phase A DONE + ATTESTED** — the genesis root is minted OFF-box, seeded in a clean registry
   (`registerRoot`, first-writer-immutable), and `K_root_pub` is attested out-of-band (A.3, `cosign`/Rekor). **A.3 is
   the sole trust HARDEN; this runbook does not repeat or replace it.**
2. **`cross-uid-broker.md` READ** — this runbook is the sigma-root analog of that frame-broker custody deploy. Steps 2–4
   below are **deltas over its §1–§4**, not a re-statement; follow its §1–§4 for the create-uid / key-`0600` /
   root-owned-wrapper / sudoers `env_reset` mechanics, substituting the root values named here.

## 2. Create the ROOT broker uid + install K_root (deltas over `cross-uid-broker.md` §1–2)

Follow `cross-uid-broker.md` §1–2, with these root-specific deltas:

- **A DISTINCT uid** — the root broker runs under its OWN system user (e.g. `pact-root-broker`), **separate from BOTH
  the host uid AND the frame broker's `pact-broker` uid**. The whole point is custody isolation; a shared uid co-locates
  the keys.
- **Key + directory modes** — `K_root_priv` is `0600` owned by `pact-root-broker`; its **directory is `0755`** (NOT
  `0700`). A `0700` key dir blinds the host's owner-verify in §6 (the host must be able to `ls -l` the key to confirm a
  DIFFERENT owner uid, `cross-uid-broker.md` §7).
- **KEY SEPARATION — `K_root` MUST be a DISTINCT PHYSICAL KEY from `K_broker` (the frame broker's key).** Under a SINGLE
  key, `computeRecordId` is field-agnostic, so a sigma-root binding sig verifies as a frame sig — a cross-protocol
  signing oracle for the trust root (W1b HIGH-1, proven live). **The `sigma-root-broker.js` same-inode code refusal is
  INERT in this deploy** — it fires only when `PACT_BROKER_KEY_FILE` is present in the broker's env
  (`broker-core.js:145,150-152`, "an UNSET other-env skips the check"), and the root wrapper sets only `PACT_ROOT_*`
  (sudoers `env_reset` strips the host's value). So the load-bearing distinctness check is **OUT-OF-BAND**, run once at
  deploy:

  ```sh
  # distinct INODES (catches an alias / symlink / hardlink) AND distinct BYTES (catches a copy the inode check misses).
  # Run AS ROOT: both keys are 0600 under different system uids, so a plain-uid cmp gets Permission denied (exit 2)
  # and never compares -- the sudo is load-bearing, else the ABORT gate is vacuous:
  sudo ls -i /path/to/K_root.pem /path/to/K_broker.pem     # the two inode numbers MUST differ
  sudo cmp /path/to/K_root.pem /path/to/K_broker.pem        # MUST print "differ"; identical bytes = the oracle, ABORT
  ```

  Optional defense-in-depth: set `PACT_BROKER_KEY_FILE=<frame key path>` (read-only) in the root wrapper too, which
  ACTIVATES the code guard against an alias — but a byte-copy still evades it, so the `cmp` above stays the real check.
  Caveat: enabling this couples the root broker's LIVENESS to the frame key staying stattable by the root-broker uid —
  a non-ENOENT stat error (e.g. the frame key's dir locked to `0700`) makes `broker-core.js` fail CLOSED and refuse
  EVERY sign (`... unstattable -- cannot prove key separation`). Keep the frame key's dir `0755`-traversable, or omit
  the DiD and rely on the out-of-band `cmp`.

## 3. The wrapper — with the MANDATORY controller-guard (delta over `cross-uid-broker.md` §3)

Install a root-owned, not-host-writable wrapper that execs `node .../sigma-root-broker.js`. Set the root-broker envs
**literally in the wrapper** (never interpolated from a host-influenced source):

- `PACT_ROOT_KEY_FILE` — the `K_root` private key path (the distinct key from §2).
- `PACT_ROOT_CONTROLLER` — the **byte-identical** scarce `humanUid` seeded in `sigma-root-deploy.md` A.2 (the controller
  the broker binds). A typo binds the broker to a principal with NO seeded root, so it silently refuses every legit
  binding. The §6.2 wire-check IS the launch-time equality check: a mismatched value makes `lookupRootKey(reg, controller)`
  return `null` → the wire-check FAILS, catching the typo before any real provisioning. Copy the value from the A.2 seed;
  do not retype it.
- `PACT_ROOT_ALLOWED_UIDS` — the root broker's OWN WHO-allowlist, **NARROWER than the frame broker's** (never reuse
  `PACT_BROKER_ALLOWED_UIDS`; a K_root sig is strictly higher-value than a K_broker sig — W1b F2).
- `PACT_ROOT_REQUIRE_BINDING=1` — **set it EXPLICITLY in the wrapper.** Do NOT rely on the code default-ON: making the
  blind-oracle protection depend on code-default behavior instead of the wrapper CONTRACT is fragile (a future change to
  the default would silently reopen the oracle). An explicit `=1` makes require-binding ON **unconditionally**; the
  default IS ON when the box is deployed (`PACT_ROOT_CONTROLLER` set, or an intent token) and a typo fails CLOSED, but
  the explicit set is the contract and the guard below keeps `=0` as a refused backstop (`resolveRequireBinding`,
  `binding-request-auth.js:53-58`; the ONLY way to disable is a strict `'0'`).

**MANDATORY startup-guard (the blind K_root oracle).** require-binding goes OFF — and the broker then signs the argv
64-hex **BLINDLY** with `K_root` (a universal forgery oracle for the trust root) — on TWO paths: (a) `PACT_ROOT_CONTROLLER`
unset **or whitespace-only** (the code trims it, `binding-request-auth.js:56`, so a `' '` value is "unset" to the gate —
the `tr -d` in the guard mirrors that) with no intent token; and (b) an explicit `PACT_ROOT_REQUIRE_BINDING=0` (strict
`'0'`) **EVEN with the controller set** (`resolveRequireBinding`, `binding-request-auth.js:53-58` — proven live). The frame broker normalizes `=0` as a
legacy mode (`cross-uid-broker.md:239-240`), so a copy-paste from a frame wrapper is a realistic trigger. Unlike the
frame broker's "Recommended" guard, for the trust root the guard is **MANDATORY** and must close BOTH paths. Put both
lines ABOVE the exec:

```sh
case "$(printf %s "$PACT_ROOT_CONTROLLER" | tr -d ' \t')" in '') echo 'refusing: PACT_ROOT_CONTROLLER empty/whitespace -- require-binding would be the BLIND K_root ORACLE' >&2; exit 78 ;; esac
case "$(printf %s "$PACT_ROOT_REQUIRE_BINDING" | tr -d ' \t')" in 0) echo 'refusing: PACT_ROOT_REQUIRE_BINDING=0 disables the K_root bind gate (the BLIND ORACLE)' >&2; exit 78 ;; esac
```

## 4. Sudoers — the env-pin (defer to `cross-uid-broker.md` §4 + §8, with a root-broker audit)

Follow `cross-uid-broker.md` §4: the host uid may run ONLY the root-broker wrapper as `pact-root-broker`, no password;
`env_reset` (default) with **no `SETENV`**. Then run its two out-of-band audits — they gate `K_root` exfiltration and
are strictly MORE important for the trust root:

```sh
# (a) no code-loading var can survive into the broker child (would exfil K_root from INSIDE the root broker):
sudo -l -U <hostuser> | grep -iE 'env_keep.*(NODE_OPTIONS|BASH_ENV|LD_|DYLD_)'   # MUST print nothing
# (b) SUDO_* must NOT be env_kept -- caller-auth keys on SUDO_UID (broker-core.js:95); a host-supplied SUDO_UID voids the WHO-gate:
sudo -l -U <hostuser> | grep -iE 'env_keep.*SUDO_'                                # MUST print nothing
```

## 5. Wire Phase B.3 to the cross-uid `{ signer }` (delta over `sigma-root-deploy.md` B)

Follow `sigma-root-deploy.md` Phase B.1/B.2 (mint the persona key, `registerPersona` under the controller). For B.3,
**swap the enclave `{ privateKeyPem }` path for the cross-uid signer** — `K_root_priv` never materializes in the
provisioning process:

```js
const { crossUidBrokerSigner } = require('./v0/src/identity/broker-launch');
const { signSigmaRoot } = require('./v0/src/identity/sigma-root');

const sigmaRoot = signSigmaRoot(
  { personaDid: P, publicKeyPem: K_pub, controller: '<your-scarce-human-uid>' }, // controller MUST equal PACT_ROOT_CONTROLLER
  { signer: crossUidBrokerSigner({ brokerUser: 'pact-root-broker', wrapperPath: '/usr/local/bin/pact-root-broker-sign' }) },
);
// signSigmaRoot threads the binding as the body 3rd arg; crossUidBrokerSigner forwards it on the broker child's stdin
// so authorizeBindingRequest can recompute-bind (computeBindingId(body) === the signed id) -- W1b Piece C.
if (!sigmaRoot) throw new Error('signSigmaRoot returned null -- broker refused or bad binding; do NOT persist a null');
```

## 6. Verify — AS THE HOST UID — then attest OUT-OF-BAND

Run these as the **host uid** (the uid that will call the broker), on the deployed box:

1. **The host cannot read `K_root`** — use the **literal** key path (the `PACT_ROOT_KEY_FILE` env is set broker-side in
   the wrapper and STRIPPED from the host shell by `env_reset`, so `$PACT_ROOT_KEY_FILE` expands to empty in the host
   operator's shell and would test nothing): `cat /path/to/K_root.pem` → **`Permission denied`** (the custody EACCES),
   and `ls -l /path/to/K_root.pem` shows a DIFFERENT owner uid (the §2 `0755` dir makes this visible).
2. **The wire-check (custody consistency)** — sign a TEST binding through the broker whose **`controller` equals
   `PACT_ROOT_CONTROLLER`** (else it denies `controller-mismatch` for a benign reason), then verify it under the
   **seeded** root pubkey:

   ```js
   const { verifySigmaRoot } = require('./v0/src/identity/sigma-root');
   const { lookupRootKey } = require('./v0/src/identity/registry');
   const ok = verifySigmaRoot({
     personaDid: P, publicKeyPem: K_pub, controller: '<your-scarce-human-uid>',
     sigmaRoot,                                                  // from step 5, produced by the broker
     rootPublicKeyPem: lookupRootKey(reg, '<your-scarce-human-uid>'),  // the seeded K_root_pub
   });
   // ok === true is the PRECONDITION for a real binding to pass assessRegistrationFromRegistry. false => mis-wired
   // custody (wrong key / uid / controller). (A built `assertRootBinding` CLI is a FORWARD residual -- YAGNI now,
   // no in-code consumer this arc; mirrors sigma-root-deploy.md's "a CLI is a later wave".)
   ```
3. **The deny controls (OBSERVABLE, not a reason grep).** The broker surfaces NO internal reason — a caller-auth
   (WHO) deny prints `caller not authorized`, a request-auth (WHAT) deny prints `request not authorized`, **both with
   empty stdout + exit 1** (the deny paths `broker-core.js:96,107` route through `makeFail`, `:56-60`, which writes
   stderr + `exit(1)` and NEVER touches stdout — stdout carries the sig ONLY on success, `:172`). So each control
   asserts **empty stdout / exit 1** (plus the
   applicable fixed message), and you construct the input so the RIGHT gate is the denier:
   - **Foreign uid** — a uid not in `PACT_ROOT_ALLOWED_UIDS` → refuse, empty stdout, exit 1. Flip the allowlist to a
     uid that is NOT yours, confirm the refuse, then RESTORE (the `cross-uid-broker.md` §8 flip-test; the single-uid
     flip is the LESS-rigorous form — the two-real-uid test, `cross-uid-broker.md`/plans/16, is stronger).
   - **A FRAME body** (no `controller`/`publicKeyPem`/`personaDid`) → refuse: `computeBindingId` throws → the binding is
     uncomputable (domain separation; `binding-request-auth.js:92`). Use a REAL frame preimage so the throw is genuine.
   - **A FOREIGN-controller binding** — compute `claimedRecordId = computeBindingId(foreignBinding)` from the EXACT body
     FIRST (recompute-bind runs BEFORE controller-bind, `binding-request-auth.js:134→136`), else it denies as
     `record-id-mismatch` and you tested the WRONG gate (the plans/17 §7 mislabel trap). With the id computed, the
     controller-bind is the provable denier → refuse, empty stdout, exit 1.
4. **End-to-end read-side (the composed property).** For a real provisioned persona, confirm it passes the registry
   judge AND stays SHADOW:

   ```js
   const { assessRegistrationFromRegistry } = require('./v0/src/identity/registration-provenance');
   const v = assessRegistrationFromRegistry(reg, { personaDid: P, sigmaRoot });
   // v.sigmaRootChecksPassed === true  (branch on THIS, never on !requiresOutOfBandRootAttestation)
   const { convert } = require('./v0/src/trust/convert');
   // convert(meCtx, ME, P).actionable === false  -- SHADOW: nothing gates (NS-9)
   ```
5. **Attest OUT-OF-BAND** — the `sigma-root-deploy.md` A.3 root-key attestation is the SOLE trust HARDEN. This custody
   deploy world-anchors only `K_root`'s key-custody; it does not substitute for A.3, and Claude never performs A.3.

## 7. Honest ceiling (LOUD — NS-9)

- **HARDENS (world-anchored) — but only a SUCCESSFUL OPERATOR DEPLOY, not this SHADOW doc.** A completed deploy
  world-anchors `K_root`'s **KEY-CUSTODY / non-exfiltration** — a host compromise cannot `read()` `K_root` to forge
  arbitrary root bindings without the broker uid. This is a genuine harden of that axis (per `cross-uid-broker.md`'s
  frame-broker precedent), and it is **INTEGRITY, not PROVENANCE.**
- **HARDENS about trust: NOTHING.** The SOLE trust/provenance HARDEN is `sigma-root-deploy.md` A.3.
- **Does NOT close the raised-stakes #273 (R1)** — within the controller, a **same-uid WHO-authorized (allowlisted)
  caller** — a uid in `PACT_ROOT_ALLOWED_UIDS` reaching the broker cross-uid via sudo, NOT the broker uid itself —
  still mints "K_root authorized MY key as persona P" for any P (`publicKeyPem` is caller-supplied, the root never
  independently authorizes it; `binding-request-auth.js:21-26`). **R1 survives EVEN A.3 + a deployed cross-uid signer**
  — it closes only with an authenticated-minter binding the payload semantics, a separate frontier. Deploying this
  broker + A.3 is NOT a provenance close.
- **Does NOT close R2 (replay / revocation)** — a sigma-root binding is idempotent (no nonce; static persona↔key↔controller
  fact). A replay re-asserts the same static truth (harmless while static); the risk emerges only if a later wave makes
  bindings REVOCABLE, which the `.v2` rotation-epoch (`sigma-root.js:23`) carries. Named here so the deploy does not
  imply revocation exists.
- **Does NOT close the W3 apex** — a same-uid self-`registerRoot` + self-sign still PASSES the crypto judge (integrity,
  not provenance; `registration-provenance.js:64-66`).
- **Structural asymmetry from the frame broker** — the root broker has **NO persona**: `K_root_pub` is seeded via
  `registerRoot` (A.2), and the consistency check is a **CONTROLLER** triple (`PACT_ROOT_CONTROLLER` == the binding's
  `controller` == the seeded `humanUid`), NOT a persona-DID triple. There is **no `assertBrokerPersona` for the root**
  and no "register the broker persona" step — do not add one by rote from `cross-uid-broker.md` §5.
- **R-heap ceiling (one box / one run / one axis)** — the custody is bounded by the host's memory-extract posture.
  **Re-probe at deploy** (the "still deployed" state is decayable): `sysctl kernel.yama.ptrace_scope`, `swapon --show`,
  `core_pattern` (see `r-heap-runbook.md`). A byte-copy of `K_root` to another path is a single logical key the inode
  check cannot see — key-material distinctness is operator custody (the §2 `cmp`).
