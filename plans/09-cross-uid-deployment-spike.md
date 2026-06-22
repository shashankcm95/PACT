---
lifecycle: persistent
created: 2026-06-22
phase: cross-uid deployment spike (the launcher + verifier that make custody-real ANCHORABLE, north-star §2.6)
status: BUILT (VERIFY + VALIDATE folded — 179 tests green, eslint clean, all SHADOW)
---

# Cross-uid deployment spike — the launcher + verifier that make custody-real ANCHORABLE (SHADOW)

> The wave delivers the launcher + verifier + runbook that make custody-real **anchorable + checkable**. It
> does NOT *turn* the mechanism into custody-real — the operator does that by deploying cross-uid and
> attesting out-of-band (NS-7 / NS-9). The title says "anchorABLE", deliberately.

## §0 Honest scope (read first — it bounds the DoD)

P-broker (`plans/05`) built the custody **MECHANISM**: the key lives in a separate *process*. But every
same-machine test runs the broker under the **same uid** as the host, so custody stayed MODELED — a same-uid
attacker can read the key file / `ptrace` the broker / read `/proc/<pid>/mem` (R1, OPEN by physics). Per the
north-star **NS-7 (OQ-NS-6): only a world-anchored signal HARDENS trust; engineered/in-process signals only
NARROW it.** The custody-real hardening is therefore a **deployment property** (separate uid / enclave / HSM),
verified **out-of-band** — it cannot be delivered or proven by in-process code or a green test suite.

**What this wave delivers** (and, just as loudly, what it does NOT):

- **DELIVERS (in-repo, testable):** (1) a validated **cross-uid launcher** that wires `brokerSigner` to a
  `sudo -n -u <broker-user> <wrapper>` invocation with **zero seam change** (the broker-client already accepts
  an arbitrary `command`/`args`); (2) a **custody verifier** — an out-of-band diagnostic the operator runs *as
  the host uid on the deployed box* that checks every custody condition the **host uid can observe** (mechanism
  live + key-read denied + key owned by a different uid + signer functional), and **explicitly flags the one it
  CANNOT observe** (that the running broker process is genuinely that other uid) for the operator to attest;
  (3) a **runbook** with the exact OS steps (create the broker user, key 0600, wrapper, sudoers, register the
  public key, wire, RUN THE VERIFIER).
- **DOES NOT DELIVER (the human's act + the world-anchor):** custody-**real** itself. That is the operator
  *running the deployment cross-uid* and *attesting out-of-band* that the verifier's host-read denial is due to
  **uid separation** (a different uid owns the key), not merely a restrictive file mode. The kernel's EACCES
  under a genuinely separate uid **is** the world-anchored signal (NS-7) — an OS fact, out-of-band of PACT's
  own code. The verifier checks the necessary condition and the mechanism; the **operator closes the loop**.
- **HONESTY GUARD (NS-9, the close→narrow reflex):** the verifier reports `hostObservableChecksPassed` +
  `requiresOutOfBandUidConfirmation: true` — **never** a bald `custodyReal: true`. The tool narrows to
  "mechanism verified + necessary condition met"; only the operator's out-of-band uid attestation closes it.

**Residuals unchanged (named, not closed):**
- **R2 oracle-abuse — unchanged and FULLY OPEN.** Any caller the sudoers policy permits still forges a sig over
  an arbitrary `record_id`. This wave adds **NO** authorization and narrows R2 by **zero**. It is the
  *precondition* that makes the next-frontier caller-auth **meaningful** (caller-auth is vacuous in-process;
  it bites only at a real cross-uid boundary) — so caller-auth follows this spike (north-star §5). But nothing
  here touches R2.
- **R3 own-key forgery (U1) — unchanged.** A legitimate holder of their own persona key still mints authentic
  records; issuance cost is untouched.

All SHADOW — nothing gates an action.

## §1 The design (recommended — challenge at VERIFY)

The custody boundary crossing is a generic `command` round-trip; `brokerSigner({command, args})` already
supports it. The cross-uid case is `sudo` (single-box uid separation — the simplest world-anchorable boundary;
an enclave/HSM is the same shape with a different command). So the only *new* code is (a) a **validated argv
builder** (a raw username is a `sudo` **flag-injection** vector — a leading `-` could smuggle a sudo option),
and (b) the **verifier**.

Three new files + a runbook:

1. **`v0/src/identity/broker-launch.js`** — `crossUidBrokerSigner({ brokerUser, wrapperPath, command, timeoutMs,
   maxBytes })` → a `brokerSigner` whose `command` is `sudo` and `args` are
   `['-n', '-u', brokerUser, wrapperPath]` (recordId appended by `brokerSigner` as the fixed final arg). Guards:
   - `brokerUser` MUST match `^[a-z_][a-z0-9_-]{0,31}$` (POSIX-portable username) — rejects a leading `-`
     (flag injection), whitespace, shell metachars, and over-length. **Positive bounded invariant**, not a
     denylist.
   - `wrapperPath` MUST be an **absolute** path with no `..` segment (shape check; ownership/perms are the
     verifier's job, not the launcher's).
   - `-n` (non-interactive) so `sudo` NEVER blocks on a password prompt → fails immediately → `null`
     (fail-closed; mirrors the broker-client's bounded-hang philosophy). DoS bounds (`timeout`/`maxBuffer`)
     carried from `brokerSigner`.
   - **Note (defense, free):** `sudo`'s default `env_reset` strips the host env when crossing to the broker
     uid, so the host literally cannot inject env (incl. `PACT_BROKER_KEY_FILE`/`NODE_OPTIONS`) into the broker
     — the cross-uid model is *stronger* than same-uid on the env axis. The key path is set **broker-side** (in
     the wrapper the broker/root owns), never by the host.

2. **`v0/src/identity/custody-verify.js`** — `verifyCrossUidCustody({ keyFile, signer, registry, personaDid })`
   → a structured, **non-vacuous** report. Checks, in order:
   - **C0 (root guard):** if `process.getuid?.() === 0` → `hostObservableChecksPassed:false`, residual "running
     as root — root bypasses file perms; uid separation is meaningless from here." (Windows: `getuid`
     undefined → report "uid model N/A on this platform.")
   - **C1 (non-vacuity precondition):** the key file EXISTS and is non-empty. Absent/empty → ERROR
     "vacuous: there is no key to protect" (NOT a pass — the §0a containment-oracle lesson: a denial proof
     needs a PRESENT secret).
   - **C2 (the custody leg):** attempt to read the key as the host uid (`openSync(O_RDONLY|O_NOFOLLOW)` then
     read). SUCCESS → `hostObservableChecksPassed:false`, residual "the host uid CAN read the key — custody is
     NOT real (R1 same-uid/over-permissive)." EACCES → the necessary condition is met (record `hostReadDenied`)
     **but** set `requiresOutOfBandUidConfirmation:true` — the tool cannot distinguish uid-separation from a
     mode-000 same-owner file; the operator confirms uid separation out-of-band (`ls -l` owner ≠ `id` uid).
   - **C3 (liveness — the broker actually signs):** sign a `crypto.randomBytes(32)` probe through `signer` and
     `verifyRecordSig` it against `lookupPublicKey(registry, personaDid)` (reuse `assertBrokerPersona`'s
     random-probe logic — a fixed probe is special-caseable). Fail → `hostObservableChecksPassed:false`, "broker
     cannot sign as the persona — mechanism not functional / mis-wired." This proves C2's denial is NOT just a
     broken/unused key.
   - **Conclusion:** `hostObservableChecksPassed = !root && C1 && C2==EACCES(+ key owned by a DIFFERENT uid) && C3` (all four; refined at §10/§11 — owner-unknown + null-uid FAIL closed). Even then,
     `custodyReal` is **never asserted** — the report carries `requiresOutOfBandUidConfirmation:true` and the
     operator instruction. A thin CLI (`require.main === module`) prints the report + exits non-zero unless
     `hostObservableChecksPassed`.

3. **`v0/test/unit/custody-verify.test.js`** — TDD (see §5).

4. **`docs/deployment/cross-uid-broker.md`** — the operator runbook (see §6).

## §2 Alternatives considered

- **A long-lived UDS daemon under the broker uid** (vs per-sign `sudo`). Deferred on the same honest reason as
  `plans/05` §2: the `sudo`-per-sign command-broker is KISS + minimal auditable surface (no socket
  lifecycle/perms/orphan, no peer protocol) and is the simplest *world-anchorable* uid boundary on one box. A
  daemon is the right shape once custody moves to a latency-bearing backend (network-KMS) — deferred-necessary,
  not rejected. Per-sign `sudo` spawn is the unavoidable custody-boundary crossing, not an N+1 smell.
- **setuid wrapper binary** (vs `sudo`). Equivalent custody; `sudo` is chosen because its policy
  (`sudoers`, `env_reset`, `NOPASSWD` scoped to one command) is auditable, declarative, and standard — a
  hand-rolled setuid binary is a bigger attack surface to get right. Documented as an alternative in the runbook.
- **A network/HSM signer.** The same `command`-seam shape; out of scope for a single-box spike. Named as the
  enclave/HSM generalization.

## §3 Files

| File | Change |
|---|---|
| `v0/src/identity/broker-launch.js` | NEW — `crossUidBrokerSigner` (validated `sudo -n -u` argv over `brokerSigner`) |
| `v0/src/identity/custody-verify.js` | NEW — `verifyCrossUidCustody` + thin CLI (the out-of-band diagnostic) |
| `v0/test/unit/custody-verify.test.js` | NEW — TDD spec (§5) covering launcher argv-validation + verifier non-vacuity |
| `docs/deployment/cross-uid-broker.md` | NEW — operator runbook |
| `plans/09-...md` | this plan (accretes §7 VERIFY + §8 VALIDATE) |

No edit to `broker-sign.js` / `broker-client.js` / `minter.js` / `frame.js` / `resolveSigner` — the seam is
reused unchanged (a `git diff` check, not a threat-test).

## §4 Threat model (the hacker lens pressure-tests this)

| Vector | Defense / honest residual |
|---|---|
| `sudo` flag injection via a `-`-leading / metachar broker-user | DEFENDED — strict `^[a-z_][a-z0-9_-]{0,31}$`; `--` not needed because the username can never be a flag |
| argv injection via record_id | DEFENDED (carried) — `brokerSigner` fixed argv, record_id strict-hex64 final arg, no shell |
| `sudo` hang on a password prompt (DoS) | DEFENDED — `-n` non-interactive → immediate fail → null; `timeout` bound too |
| host injects env into the broker (NODE_OPTIONS/key-path) | DEFENDED — `sudo` `env_reset` strips host env; key path is broker-side only |
| verifier passes VACUOUSLY (no key present) | DEFENDED — C1 requires a present, non-empty key before any denial counts |
| verifier passes VACUOUSLY (run as root) | DEFENDED — C0 root guard fails closed |
| verifier mistakes a broken/unused key for "protected" | DEFENDED — C3 requires a real sign+verify round-trip |
| verifier over-claims custody-real from EACCES alone | DEFENDED (honesty) — never asserts `custodyReal`; `requiresOutOfBandUidConfirmation:true` + operator instruction (NS-9) |
| same-uid reads the key / ptrace the broker | **R1 RESIDUAL** — only a genuinely cross-uid deployment + out-of-band attestation hardens (the whole point) |
| broker signs arbitrary content (oracle-abuse) | **R2 RESIDUAL** — caller-auth is the next frontier (meaningful only at THIS boundary) |

## §5 Test plan (TDD — write first, red, then green)

`broker-launch.js`:
1. `crossUidBrokerSigner` builds argv `['-n','-u',user,wrapper]` with `command==='sudo'` (assert the constructed
   wiring, e.g. via an injected/inspectable `brokerSigner` or by signing through a stub `sudo` on PATH-free abs path).
2. rejects a flag-injection user (`-u`, `-root`, `a b`, `a;b`, `""`, 40-char) → throws.
3. rejects a non-absolute / `..`-bearing `wrapperPath` → throws.
4. end-to-end: with `command` pointed at the REAL `node broker-sign.js` (same-uid stand-in for `sudo`, i.e. the
   identity case `brokerUser`-bypass via an explicit `command` override), a minted frame VERIFIES — proves the
   launcher returns a functioning signer (the cross-uid leg is the deployment, not the test).

`custody-verify.js`:
5. **C1 vacuity:** absent key → report is an ERROR ("vacuous"), `hostObservableChecksPassed===false` — NOT a pass.
6. **C1 vacuity:** empty key file → same.
7. **C2 same-uid OPEN (the in-env default):** a readable key (mode 0600, owned by us) → `hostObservableChecksPassed
   ===false`, residual names R1 same-uid. (This is the honest result in any same-uid env — the test PROVES the
   tool reports custody NOT real here.)
8. **C2 denial leg (simulated via mode 000):** a present, non-empty, mode-000 key (EACCES same-owner — probed)
   + a working signer + matching registry ⇒ `hostReadDenied===true`, C3 passes, `hostObservableChecksPassed===true`
   AND `requiresOutOfBandUidConfirmation===true`. (Simulates the perm-denial leg; the test header says it
   SIMULATES the denial — true uid separation is the deployment.) **Skips if `getuid()===0`** (root bypass).
9. **C0 root guard:** if `getuid()===0`, the report fails closed with the root residual (assert the branch, or
   skip-with-note off-root).
10. **C3 liveness:** a denial-leg key but a signer that returns null / signs as the WRONG persona ⇒
    `hostObservableChecksPassed===false` ("broker cannot sign as the persona") — even though C1/C2 passed.
11. **honesty:** the report NEVER contains a truthy `custodyReal` field; it carries
    `requiresOutOfBandUidConfirmation` whenever the denial leg is taken.

## §6 Runbook outline (`docs/deployment/cross-uid-broker.md`)

Exact, copy-pasteable steps (Linux `useradd` + macOS `sysadminctl` variants): create the `pact-broker` system
user; generate the keypair (`keypair.js`), write the private key to a path **owned by `pact-broker`, mode 0600**;
install a wrapper `/usr/local/bin/pact-broker-sign` (owned root, 0755) that sets `PACT_BROKER_KEY_FILE` and
`exec`s `node broker-sign.js "$@"`; `sudoers`: `hostuser ALL=(pact-broker) NOPASSWD: /usr/local/bin/pact-broker-sign`
(default `env_reset`); register `pact-broker`'s **public** key in the host registry; wire the host with
`crossUidBrokerSigner({ brokerUser:'pact-broker', wrapperPath:'/usr/local/bin/pact-broker-sign' })`; **run
`node custody-verify.js` as the host uid and confirm `hostObservableChecksPassed` + then attest OUT-OF-BAND**
(`ls -l <key>` owner is `pact-broker`, `id` shows you are NOT `pact-broker`, and `cat <key>` → Permission denied).
The runbook states loudly: the tool verifies the mechanism + necessary condition; **you** close custody-real via
the out-of-band uid attestation (NS-7/NS-9). R2 oracle-abuse remains open at this layer (next frontier).

## §7 Runtime Probes (current-state claims — verified against the repo / OS, not memory)

| Claim | Probe | Observed |
|---|---|---|
| `brokerSigner` accepts an arbitrary `command`/`args` + appends record_id as the fixed final arg | read `broker-client.js:43-72` | CONFIRMED — `execFileSync(command, [...args, recordId], {timeout,maxBuffer,env,stdio})`; record_id appended last |
| the signer seam is sync + `{signer}` flows minter→buildFrame→signRecordId unchanged | read `minter.js:73`, `frame.js:38` | CONFIRMED — `buildFrame(bound,{signer})`; `signRecordId(record_id, signerOpts)` |
| `assertBrokerPersona` exists + uses a `crypto.randomBytes` probe (reusable liveness check) | read `broker-client.js:82-94` | CONFIRMED — random 32-byte probe, `verifyRecordSig` vs `lookupPublicKey` |
| a mode-000 same-owner file → EACCES on read for a non-root uid (the C2 simulation premise) | `node -e` probe 2026-06-22 | CONFIRMED — uid 501, `readFileSync` & `openSync(O_NOFOLLOW)` both → EACCES |
| this env is non-root (so the denial-leg test runs, not skips) | same probe | CONFIRMED — `getuid()===501` |
| `verifyRecordSig` / `lookupPublicKey` are importable for C3 | read `broker-client.js:25-26` imports | CONFIRMED |

## §8 DoD

> **Center of gravity (honesty, mirrors `plans/05` §7):** the DoD is the in-repo deliverables (mechanism +
> verifier + runbook). **No DoD item — and no green test — delivers or proves custody-real.** Custody-real is
> the operator's out-of-band act (§0). The denial-leg test (#8) proves the verifier *reports the necessary
> condition correctly under a SIMULATION* (a mode-000 same-owner file with synthetic cross-uid facts), never
> that uid separation holds. The `git diff` seam check is true-by-construction, not a threat-test.

- [ ] §5 tests all green, INCLUDING the non-vacuity guards (C1 absent/empty → not a pass), the same-uid-OPEN
      honest result (#7), the simulated denial leg with the out-of-band-required flag (#8), the root guard (#9),
      and the C3 liveness gate (#10).
- [ ] launcher argv-validation rejects flag-injection users + bad paths; `-n` non-interactive.
- [ ] the verifier NEVER asserts `custodyReal`; it reports `hostObservableChecksPassed` +
      `requiresOutOfBandUidConfirmation` (NS-9 honesty).
- [ ] runbook present with exact OS steps + the loud "you close it out-of-band" framing.
- [ ] `git diff` confirms ZERO edit to the signer seam (`broker-sign`/`broker-client`/`minter`/`frame`).
- [ ] full v0 suite green (prior 153 + new) + eslint + the run-guard; CI green.
- [ ] all SHADOW; §0 residuals (R1/R2/R3) named in code headers + test names, NOT claimed closed.

## §9 Anchor check (north-star §6 pre-flight)

- NS-7 honored: the wave's *hardening* is explicitly the world-anchored cross-uid deployment, NOT the in-repo
  code — the code NARROWS (builds the anchorable mechanism + the verifier); the operator's out-of-band uid
  attestation HARDENS. No SHADOW machinery is claimed to harden trust.
- NS-9 honored: `hostObservableChecksPassed` ≠ `custodyReal`; the close→narrow reflex is baked into the report shape.
- NS-2 honored: this is the *provenance/custody* layer (§4 frontier), distinct from integrity (verify-on-read)
  and validity (derived-on-read) — not collapsed.
- NS-8 honored: all SHADOW; no weight gates an action; R2/U1/U2 stay open.
- No rejected direction (§5) revived; no global rank/throne; no mutable score store.

## §10 VERIFY board (pre-build) — RECORDED 2026-06-22

3-lens parallel read-only board (architect / hacker / honesty-auditor). All three: **PASS-WITH-CHANGES**. Two
HIGH findings CONVERGED across architect + hacker (high confidence): *the verifier can report mechanism-verified
on a same-uid box*. The board materially sharpened the verifier (the heart of the wave) before any code.

**Design refinement folded (architect SRP + the testability gap):** split the verifier into a **pure
`assessCustody(facts)`** (decides the verdict from observed facts — fully unit-testable for the cross-uid "true"
branch via SYNTHETIC facts, which a same-uid box can never produce) + an impure **`gatherCustodyFacts({keyFile,
signer, registry, personaDid, wrapperPath})`** (lstat / openSync-attempt / sign-probe). `verifyCrossUidCustody`
= gather → assess. **C3 (the real sign+verify round-trip) is the load-bearing NON-VACUITY proof** — it proves a
real, usable key exists behind the broker without the host needing to read or even stat it (so a locked-down
key dir is *more* secure, not a verifier failure).

**FOLDED before build:**
1. **(architect HIGH-1 + hacker F2, CONVERGENT — must-fix) owner-uid disambiguator gates the verdict.** The
   denial leg `lstat`s the key path (permitted on a present-but-unreadable file in a traversable dir) and
   records `keyOwnerUid` + `runningUid`. `custodyMechanismVerified` requires `keyOwnerUid !== runningUid` (or
   owner-unknown because the dir itself is locked → consistent with cross-uid). A mode-000 **same-owner** file
   (the same-uid physics case) → `keyOwnerUid === runningUid` → verdict **FALSE** ("EACCES is from file MODE,
   not uid separation — NOT cross-uid custody"). This is why a same-uid box can never false-pass.
2. **(hacker F1 HIGH) the denial leg counts ONLY for `EACCES`/`EPERM`.** Any other open error (`ELOOP`
   symlink, `ENXIO` FIFO, `EISDIR`, `ENOENT`) is an ERROR ("could not establish the custody leg — key path is a
   symlink/FIFO/dir/absent"), `custodyMechanismVerified:false`. Mirrors `broker-sign.js:47-48`'s explicit-code
   handling — never "anything-not-success = denied" (that false-passes a planted symlink/FIFO).
3. **(architect HIGH-3 + hacker F-split) C3 distinguishes two failures.** `signerReturnedNull` ("broker
   returned no signature — sudo/wiring/exec failure; check sudoers + wrapper perms + `-n`") vs
   `signedButWrongPersona` ("broker signs as a different persona — key↔registry mismatch; check the registered
   public key"). Same code, two operator diagnostics.
4. **(hacker F3 MED) C2 open adds `O_NONBLOCK`.** A FIFO key path otherwise hangs the verifier at open
   (`broker-sign.js:47` learned this). `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`; a non-regular result → F1's error branch.
5. **(hacker F4 MED — honesty boundary via the exit code) the CLI exit code is never greener than the report.**
   The CLI exits **non-zero whenever `requiresOutOfBandUidConfirmation` is true** (which is *always* true on the
   mechanism-verified path — the verifier can confirm file-ownership + host-denial but NOT that the running
   broker process is that uid). Exit 0 requires an explicit `--attested-cross-uid` ack (the operator records
   that they did the out-of-band `id`/`ls -l` check). A `$?`-gating script can never read "verified" without
   the operator's attestation.
6. **(architect HIGH-5 MED) wrapper-integrity check.** If `wrapperPath` is passed, the verifier `lstat`s it:
   a group/world-writable or non-regular wrapper → verdict FALSE ("the sudo wrapper is hijackable — host can
   run code as the broker uid; privesc"), reusing the `& 0o022` bit-logic from `broker-sign.js:56`. Closes the
   one concrete escalation path in the wave. If not passed → a `checks` note "wrapper integrity not checked".
7. **(architect LOW-7) C1 non-vacuity uses `lstat` (existence + `isFile()` + `size>0`), NEVER a read** — so it
   survives the real cross-uid case where the host cannot read the key. If `lstat` itself is denied (a
   locked-down key dir), that is NOT a failure — recorded as `keyStatDenied` (suggestive of cross-uid); C3
   carries non-vacuity.
8. **(hacker F6 LOW) C0 root guard checks `geteuid` too** — `process.getuid?.()===0 || process.geteuid?.()===0`
   (POSIX perms use the effective uid; a euid-root host bypasses file modes).
9. **(architect MED-6) the launcher pins `command` — no `command` override.** `crossUidBrokerSigner` ALWAYS
   builds `command='sudo'` (the validated argv builder's single job is to remove caller choice over the
   command — re-opening it would re-open the flag-injection surface the username regex closes). A `sudoPath`
   (default `'sudo'`, **absolute-path-validated**) is the only location seam — it lets a test point at a stub
   `sudo` and lets a non-`/usr/bin/sudo` deployment work, WITHOUT allowing an arbitrary command.
10. **(architect MED-4 + hacker F5 MED) runbook pins the sudoers env policy.** `env_reset` is the default but
    NOT guaranteed (`/etc/environment` on Linux-without-PAM, a `SETENV` tag + `-E`, `env_keep`, `pam_env` can
    re-open it). The runbook MUST pin `Defaults:pact-broker env_reset, !setenv`, forbid `SETENV` on the wrapper
    command, and verify with `sudo -l` that no `env_keep` carries `NODE_OPTIONS`/`BASH_ENV`/`LD_*`/`DYLD_*`. The
    §4 row is demoted to "DEFENDED *iff* the runbook pins it"; the verifier does NOT parse sudoers (YAGNI / wrong
    layer) — it is named as an out-of-band operator audit.
11. **(honesty MAJOR ×3, folded inline above)** title → "anchorABLE" (not "turning into custody-real"); §0
    DELIVERS bullet (2) "end-to-end" → "every condition the host uid can observe + flags the one it cannot";
    §0 R2 → "unchanged and fully open"; §8 DoD lead-in → "no green test proves custody-real".
12. **(honesty MINOR) test #8 encodes the SIMULATION in the assertion**, not just a comment: it asserts the
    report's reason is `hostReadDenied` (NOT `uidSeparated`) and that the operator-instruction string is present.
13. **(honesty MINOR) the runbook carries R3/U1 + the at-rest caveat** (`PACT_BROKER_KEY_FILE` re-introduces an
    env-pointed file-key read; on a single-uid box the at-rest threat is IDENTICAL to in-process — file mode +
    sudoers buy nothing until a genuinely separate uid owns the key).

**CONFIRMED-DEFENDED (hacker probed — do NOT re-litigate):** `sudo` flag-injection via the broker-user
(`^[a-z_][a-z0-9_-]{0,31}$` is sufficient — `sudo -n -u -x` treats `-x` as the *username*, not a flag; `--`
not needed); a `-`-leading **command/wrapper** token IS parsed as a sudo option → closed by the strict
absolute-path guard (keep it, reject non-`^/` before building argv); recordId injection (double-defended: after
the command, never reaches sudo's parser, + `isHex64` rejects a leading dash); `-n` non-interactive (fails fast,
no hang); the `crypto.randomBytes(32)` C3 probe is un-special-caseable. Its only gap was F2 (passes same-uid) —
closed by fold #1, not a C3 change.

## §11 VALIDATE board (post-build) — RECORDED 2026-06-22

3-lens parallel read-only board on the BUILT diff (code-reviewer / hacker-Rule-2a-reprobe / honesty-auditor).
**hacker: NEEDS-REVISION (CRITICAL); code-reviewer + honesty-auditor: PASS-WITH-CHANGES.** Build was GREEN (175
tests) at board time; folds brought it to **179**.

**Headline (why the Rule-2a live re-probe earns its keep):** the hacker BUILT live probes against the BUILT CLI
and reproduced **`custodyMechanismVerified: true` + exit 0 on a same-uid box with ZERO uid separation** — two
ways: (C1) a locked key-DIR makes `lstat` fail → the old owner-unknown branch auto-passed, skipping the
owner-uid check; (C2) C2 (file owner) and C3 (signer) were UNBOUND — `--key /etc/sudoers` (foreign-owned) + an
in-process signer passed (the integrity≠provenance / #273-family gap, which the residual string itself admitted).
A green 22-test suite did NOT catch it — it even CODIFIED the locked-dir path as `-> TRUE` (hacker H1, the
canonical Rule-2a failure: a clean suite encodes the bug as a contract). Both CRITICAL facets reduce to one
structural truth: **a positive "verified" is NOT honestly computable from host-uid-observable facts** (NS-7).

**FOLDED (re-verified by re-running the suite → 179 green, + a live re-probe of BOTH CRITICAL attacks against the fixed CLI):**
1. **(hacker C1 CRITICAL — the must-fix) owner-unknown FAILS, not auto-passes.** The denial leg now requires a
   POSITIVELY-PROVEN different owner (`keyStat.ok && ownerUid !== runningUid`). A locked key-dir (owner
   unreadable) → FAIL ("relax the key DIR to 0755, key stays 0600, so the owner is confirmable") — the host
   cannot distinguish a cross-uid key from its own locked-dir key, so it proves nothing. Live re-probe: the
   exact same-uid 000-dir attack now → `hostObservableChecksPassed: false`, exit 1.
2. **(hacker C2 CRITICAL — honestly contained, structurally un-closable from the host) the verdict is renamed +
   the bind-gap is a LOUD unconditional residual.** `custodyMechanismVerified` → **`hostObservableChecksPassed`**:
   the tool NEVER claims custody (or "the mechanism") VERIFIED — only that the host-observable necessary
   conditions hold. On the passed path it ALWAYS emits the residual "this tool does NOT and CANNOT prove the
   signing PROCESS runs as that uid — confirm out-of-band; ONLY that decides custody-real." Binding C2↔C3 from
   the host is structurally impossible (the key path is broker-side); claiming it would itself violate NS-7. The
   exit code requires `--attested-cross-uid`. Live re-probe: `--key /etc/sudoers` now prints the bind-gap
   residual + exits 1 (no false "verified" claim).
3. **(code-reviewer F1 HIGH) `parseArgv` bounded-value guard.** A value-flag followed by another flag or EOF
   (`--key --persona x`) now exits 2 with "`--key` requires a value" — never silently swallows the next flag as
   the key path. New CLI-spawn test.
4. **(code-reviewer F2 / hacker H2 MED) null runningUid fails closed.** No `getuid` (non-POSIX) → C0 FAIL
   ("uid model unavailable") — the owner-uid disambiguator cannot run, so cross-uid custody is unverifiable.
5. **(hacker M1 MED) launcher rejects NUL/control chars in the path at VALIDATION** (charCode scan, eslint
   no-control-regex / ADR-0006 clean) — fail loud + early, not deferred to a confusing spawn error.
6. **(code-reviewer F3 LOW) exit-code invariant documented** — a passed result always sets
   `requiresOutOfBandUidConfirmation`, so the `!requiresOOB` arm is defensive-only (would still demand attestation).
7. **(honesty MINOR ×3) phrasing tightened**: `formatReport` says "HOST-OBSERVABLE CHECKS PASSED — NOT a
   verification of custody-real … the --attested flag changes the exit code, NOT the proof"; the C2 PASS detail
   folds "NECESSARY only; process-uid UNPROVEN" inline (un-skimmable); the runbook recommends a 0755 key-dir
   (0600 key) so the owner is observable + names the bind-gap. (code-reviewer F4 LOW test-comment fix too.)

**CONFIRMED-DEFENDED on the BUILT code (hacker live probes — do NOT re-open):** `crossUidSudoArgs`
flag-injection (`-x`/space/newline/NUL/33-char/uppercase/Cyrillic-homoglyph username + relative/`-`/`..`
wrapper/sudo path → all rejected or atomic-no-shell); recordId injection (double-defended); FIFO key path
(O_NONBLOCK, 0ms, no hang); symlink key (O_NOFOLLOW → ELOOP fail-closed); lstat→open TOCTOU (swap can only
restrict); 500× gather → 0 fd leak; root/euid-root → C0 FAIL; the `crypto.randomBytes` C3 probe is
un-special-caseable; the `& 0o022` wrapper bit-logic is correct.

**ACCEPTED-residuals (honestly open, NOT worse than documented):** the C2↔C3 binding is unprovable from the
host uid BY CONSTRUCTION (NS-7) — contained via the loud residual + the `hostObservableChecksPassed` naming +
the attestation-gated exit, NOT closed. R1 same-uid physics, R2 oracle-abuse (caller-auth next), R3 own-key
(U1). All SHADOW.

**Net:** the launcher + verifier + runbook deliver a custody-real-**anchorable** + **checkable** deployment
path; custody-real itself remains the operator's out-of-band act (per §0). 179 tests green, eslint clean, all SHADOW.
