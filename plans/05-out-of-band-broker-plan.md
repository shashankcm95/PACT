---
lifecycle: persistent
created: 2026-06-22
phase: P-broker (custody, world-anchorABLE)
status: PLAN (pre-VERIFY)
---

# P-broker — a real out-of-band signing broker (SHADOW)

## §0 Honest scope (read this first — it bounds the DoD)

P-minter (plans/04) NARROWED integrity≠provenance in-process: it removed the ambient env-PEM hole and
named a structurally key-free per-persona minter. But the minter still consumes a `signer` that, in
practice, closes over an **in-process** key — so custody stayed MODELED, not real.

This wave builds the **first custody MECHANISM** (not yet custody-*real*): a signer that lives in a
**separate OS process**, so the host process never holds the key in its own heap/env. The host asks the
broker to sign a content-address (a 64-hex `record_id`) and gets back only a signature.

**Honesty correction (VERIFY board, honesty MAJOR):** earlier drafts called this "the first *real* custody
mechanism." That overclaims what a SAME-UID test can demonstrate. A same-uid test proves the MECHANISM
(key absent from the host heap; signature produced by a separate process) — it CANNOT prove SEPARATION
(a domain the host *uid* cannot reach). Custody is *real* only under a cross-uid / enclave / HSM
**deployment**, verified out-of-band. So: **custody MECHANISM, world-anchorABLE; custody-real is
deployment-contingent and is NOT delivered by this wave.**

**What this HARDENS (ONLY when deployed cross-uid — a DEPLOYMENT property, world-anchored, NOT delivered here):**
- **Non-exfiltration.** The key never enters the host process. A host-process compromise (heap read,
  env dump, core dump) yields no key → no offline signing, no impersonation on another machine, key
  survives. This is the standard HSM value proposition — with the same-uid caveat that even an
  HSM-shaped broker is `ptrace`-reachable by its own uid; the non-exfiltration win is real only cross-uid.

**What this does NOT close (loud residuals — non-vacuously asserted by tests):**
- **R1 — same-uid is OPEN by physics.** If the broker runs as the SAME uid as the host (as it does in
  every same-machine test, and any single-uid deployment), a same-uid attacker can read the key file /
  `ptrace` the broker / read `/proc/<pid>/mem`. Tests prove the MECHANISM (key absent from host heap;
  sig produced by a separate process) — they CANNOT prove SEPARATION. Real custody = a cross-uid /
  enclave / HSM **deployment**, verified out-of-band. Crypto cannot show separateness (OQ-NS-6:
  engineered narrows; only world-anchored hardens).
  - **Sub-note (architect MED):** `PACT_BROKER_KEY_FILE` re-introduces an env-pointed file-key read —
    the very pattern P-minter removed from the host (`LOOM_EDGE_SIGNING_KEY`). The ONLY thing that
    changed same-uid is that the key now lives in a *separate process's* heap/env on the same readable
    filesystem/uid. The hardening is real ONLY cross-uid; same-uid the at-rest threat model is identical.
- **R2 — oracle-abuse (access-control is a SEPARATE layer).** Any process permitted to invoke the
  broker can request a signature over an ARBITRARY `record_id` → forge a record as this persona. The
  broker provides non-exfiltration, NOT authorization. Caller-authentication (`SO_PEERCRED` peer-uid
  check / capability tokens / per-call policy) is the orthogonal next frontier — OUT OF SCOPE here,
  named as the frontier. (Real HSMs are identical: they sign any digest for any permitted caller; you
  add access-control/quorum on top.)
- **R3 — own-key forgery (U1), unchanged.** A legitimate same-uid holder of their OWN persona key still
  mints authentic records. The broker doesn't touch issuance cost.

**Net claim**: P-broker is the first piece whose hardening is a DEPLOYMENT property rather than a pure
in-process model — it NARROWS provenance further (key leaves the host heap; cross-uid *would* block
exfiltration) and is **world-anchorABLE**, but it does NOT CLOSE provenance, and the cross-uid hardening
is **deployment-contingent — NOT delivered or tested by this wave** (the wave delivers the mechanism that
makes it anchorABLE; only an out-of-band-verified cross-uid/enclave/HSM deployment delivers it). All
SHADOW (gates nothing).

## §1 The design (recommended — challenge it at VERIFY)

A **command-broker**: a separate-process signing *command*, invoked synchronously per sign, plugged into
the existing `opts.signer` seam. **Zero changes to `buildFrame` / `minter` / `resolveSigner`** — they
already accept an injected sync `signer(recordId)→base64sig|null`.

Two new files:

1. **`v0/src/identity/broker-sign.js`** — the custody-holding CLI. `node broker-sign.js <recordId>`:
   - reads its OWN private key from `PACT_BROKER_KEY_FILE` (the broker's environment/config — in a
     cross-uid deployment this path is owned by/readable only by the broker uid; the host never sets it).
   - validates `argv[2]` is EXACTLY `record_id` hex64 — else exit non-zero, emit nothing.
   - signs via the existing crypto leaf (`signRecordId(recordId, { privateKeyPem })`) — reuse, no
     reimplementation. **This is the ONE legitimate key-loader in src/** → add to the grep-gate allowlist.
   - prints ONLY the base64 sig to stdout (nothing else) + newline; errors → stderr, empty stdout,
     non-zero exit. NEVER prints the key.

2. **`v0/src/identity/broker-client.js`** — `brokerSigner({ command, args, timeoutMs, maxBytes })` →
   a sync `signer` fn:
   - `(recordId) => { if !isHex64 return null; try { out = execFileSync(command, [...args, recordId],
     { timeout: timeoutMs, maxBuffer: maxBytes, stdio:['ignore','pipe','ignore'] }); } catch { return
     null; } sig = out.toString().trim(); return (isCanonicalBase64(sig) && 64 bytes) ? sig : null; }`
   - Self-guards IDENTICAL to the crypto layer (hex64 in; canonical-base64 + 64-byte out). Fixed
     `command` + `args`, `record_id` as the strict-hex64 FINAL arg → no shell, no argv injection.
     Bounded `maxBuffer` + `timeout` → output/hang DoS defense. Holds NO key material → NOT allowlisted
     (and a test asserts it never references `privateKeyPem`).

Wiring (tests + future app): `createMinter({ signer: brokerSigner({ command: process.execPath, args:
[brokerSignPath] }), personaDid, humanUid })`. The custody boundary is the process boundary; the
cross-uid hardening is the deployment (`args` becomes e.g. `['-u','pact-broker', node, brokerSignPath]`
via a privileged launcher — documented, not built).

## §2 Alternatives considered

- **UDS daemon (long-lived, key loaded once).** More "broker-shaped" + avoids per-sign key reload.
  DEFERRED — but on the HONEST reason (architect HIGH): the command-broker is chosen for **KISS +
  minimal auditable surface** (no socket lifecycle/perms/orphan, no parser attack surface, no new
  long-lived state), NOT because "a daemon forces async." A daemon *could* be wrapped in a synchronous
  client too — `execFileSync` is itself a blocking process round-trip. **Async is the eventual
  necessary contract** once custody moves to a latency-bearing backend (network-KMS / HSM-at-scale);
  rewriting four layers to async for a SHADOW v0 is pure YAGNI, but we record async as deferred-necessary
  work, NOT a rejected liability — the sync seam is a v0 convenience, not a load-bearing design virtue.
  (Per-sign process spawn is NOT the N+1 anti-pattern — it is the unavoidable custody-boundary crossing;
  HSMs round-trip per sign too. Noted, not a smell.)
- **Keep the in-process closure (status quo).** Rejected — that is exactly the MODELED custody P-minter
  already shipped; it does not remove the key from the host heap.

## §3 Files

| File | Change |
|---|---|
| `v0/src/identity/broker-sign.js` | NEW — custody CLI (key-holder; sole legitimate key-loader in src/) |
| `v0/src/identity/broker-client.js` | NEW — `brokerSigner` (sync signer over `execFileSync`; no key) |
| `v0/test/unit/broker.test.js` | NEW — TDD spec (see §5) |
| `v0/test/unit/minter.test.js` | EDIT — add `broker-sign.js` to the grep-gate allowlist (custody-holder) |
| `plans/05-...md` | this plan (accretes §8 VERIFY + §9 VALIDATE) |

## §4 Threat model (the hacker lens pressure-tests this)

| Vector | Defense / honest residual |
|---|---|
| key exfiltration via host heap/env/core | DEFENDED — key never enters host process (the whole point) |
| argv / shell injection via record_id | DEFENDED — `execFileSync` fixed argv, no shell; strict hex64 final arg |
| broker stdout flooding (DoS) | DEFENDED — `maxBuffer` bound → throw → null |
| broker hang (DoS) | DEFENDED — `timeout` → throw → null |
| broker signs arbitrary content (oracle-abuse) | **R2 RESIDUAL** — any permitted caller forges; needs caller-auth (next wave) |
| same-uid reads key file / ptrace broker | **R1 RESIDUAL** — only cross-uid deployment hardens |
| broker leaks key on stdout/err | DEFENDED — emits ONLY the base64 sig; a test greps child output for key bytes |
| malformed broker output accepted | DEFENDED — client re-gates canonical-base64 + 64-byte (same as crypto layer) |

## §5 Test plan (TDD — write first, red, then green)

1. `brokerSigner` rejects non-hex64 input → null (no spawn).
2. `brokerSigner` produces a sig a registered persona's key VERIFIES (end-to-end through the REAL child
   process — Rule 2a-corollary: the real path, not a mock).
3. A minter wired with `brokerSigner` mints records that `receiveFrame` + crossVerify + creatorStanding
   ACCEPT (full P1→P2→P3 acceptance through the broker).
4. broker-sign.js with a bad/absent `PACT_BROKER_KEY_FILE` → non-zero exit, empty stdout, client → null.
5. broker-sign.js with a non-ed25519 key → null (alg-pinning survives the boundary).
6. **R2 residual is REAL (non-vacuous):** the broker WILL sign an attacker-chosen arbitrary hex64 →
   asserts oracle-abuse is open, documents it honestly (not papered over).
7. **R1 residual is REAL:** the key file is readable same-uid in-test → asserts same-uid custody is open.
8. broker output is the sig ONLY — child stdout/stderr never contains the private-key PEM bytes.
9. client bounds: an over-`maxBytes` broker output → null; a > `timeoutMs` hang → null.
10. grep-gate: `broker-client.js` does NOT reference `privateKeyPem`; `broker-sign.js` IS allowlisted.

## §6 Runtime Probes (current-state claims — verified against the repo, not memory)

| Claim | Probe | Observed |
|---|---|---|
| the signer seam is SYNC + accepts an injected `signer` fn | read `edge-attestation.js:76-98` `resolveSigner`/`signRecordId` | CONFIRMED — `signer(recordId)` called synchronously; `opts.signer` (fn) takes precedence; result re-gated canonical-b64+64B |
| `buildFrame` needs no change to use a `signer` | read `frame.js:22-41` | CONFIRMED — `signRecordId(record_id, signerOpts)`; passes `{signer}` straight through |
| minter passes ONLY `{signer}` to buildFrame | read `minter.js:73` | CONFIRMED — `buildFrame(bound, { signer })`, no opts spread |
| `privateKeyPem` is grep-gated out of non-test src/ w/ a 3-file allowlist | summary + minter.test.js (re-read at BUILD) | ASSERTED — allowlist `{edge-attestation.js, keypair.js, frame.js}`, regex `/privateKeyPem\s*:\|\.privateKeyPem/` — **RE-PROBE exact code at build before editing** |
| `signRecordId({privateKeyPem})` is the reusable sign leaf | read `edge-attestation.js:90-98` | CONFIRMED — fail-soft, re-gates output; broker-sign.js reuses it |
| registry resolves verify keys per-sender (no shared default) | read `registry.js:37-40` + `frame.js:64-68` | CONFIRMED — `lookupPublicKey` per persona; verify fails closed on unknown sender |

## §7 DoD

The DoD's center of gravity is the FALSIFIABLE set (the §5 tests), not the by-construction set (honesty MINOR):

- [ ] **(falsifiable, load-bearing)** §5 tests all green INCLUDING: the end-to-end real-child-process
      path (#2/#3); the NON-VACUOUS residual demonstrations (#6 oracle-abuse end-to-end through
      `receiveFrame` accept; #7 same-uid key read); the env-allowlist defeats `NODE_OPTIONS` (#11); the
      key-file vet (#12); the broker's OWN direct-invocation hex64 gate; the dedicated-stderr key-leak
      capture; the fail-closed mis-wire characterization (#13).
- [ ] **(mechanical check, NOT a threat-test)** `git diff` confirms ZERO edit to `buildFrame` /
      `minter` / `resolveSigner` (seam unchanged — true by construction, so it's a diff check, not proof).
- [ ] grep-gate updated (broker-sign.js allowlisted as the legitimate per-process key-LOADER — a
      non-adversarial forward-guard, NOT custody enforcement; broker-client.js asserted key-free) and green.
- [ ] full v0 suite green (prior 121 + new broker tests).
- [ ] §0 residuals (R1/R2/R3) stated in code headers + test NAMES ("PROVES residual open") — NOT claimed closed.
- [ ] all SHADOW — nothing gates an action.

## §8 VERIFY board (pre-build) — RECORDED 2026-06-22

3-lens parallel read-only board (architect / hacker / honesty-auditor). All three: **PASS-WITH-CHANGES**.
The board materially sharpened the design before any code — the convergent signal across all three:
*same-uid is the real threat; neither the mechanism nor the prose may imply otherwise.*

**FOLDED before build:**
1. **(hacker HIGH-1, the must-fix) env-allowlist, not denylist.** `brokerSigner` builds the child env from
   an ALLOWLIST and NEVER spreads `process.env` → `NODE_OPTIONS=--require evil.js` (and `--require`-class
   vars, `LD_PRELOAD`, etc.) cannot be inherited into the key-holding broker child by construction. Test #11.
   (Positive bounded invariant per the egress-gate lesson — don't enumerate the unbounded bad set.)
2. **(hacker HIGH-2) key-file vet.** `broker-sign.js` `lstat`s `PACT_BROKER_KEY_FILE`: refuses a symlink,
   a world-writable file, and a non-regular file (vetJudgeBinPath precedent) → exit non-zero, empty stdout. Test #12.
3. **(hacker MED-1) the broker's OWN hex64 gate** is load-bearing (the CLI is directly invokable, bypassing
   the client) — tested DIRECTLY against the broker with `-`, `--`, uppercase, 63-char, non-hex.
4. **(hacker MED-2 + honesty) non-vacuous residual tests.** Key-leak (#8) captures broker **stderr in a
   dedicated spawn** (the client ignores stderr) + a deliberate malformed-key fixture, asserting no PEM/DER
   fragment on stdout OR stderr, and that broker-sign.js routes errors through the leaf and never prints
   `err`/`err.stack`. Oracle-abuse (#6) drives end-to-end through `receiveFrame` ACCEPT. Test NAMES say
   "PROVES residual open."
5. **(architect MED, #1 design fix) persona↔key drift.** The persona-agnostic broker + persona-bound minter
   can be mis-wired silently. It FAILS CLOSED (a sig under A's key claiming src=B is rejected by
   `receiveFrame` — hacker confirmed persona-confusion is CLOSED), so it's a correctness footgun, not a
   forgery hole. Fold: a fail-closed CHARACTERIZATION test (#13: minter bound to B + broker holding A's key
   ⇒ frame rejected) + a cheap opt-in `assertBrokerPersona(signer, {registry, personaDid})` smoke-check
   (one test-sign + verify against the registry; throws on mismatch) — NOT forced into `createMinter`
   (no registry coupling / no mandatory broker round-trip at construction — YAGNI for SHADOW v0).
6. **(honesty MAJOR, #1 overclaim) "first real custody mechanism" → "custody MECHANISM; world-anchorABLE;
   custody-real only cross-uid + out-of-band verified."** Propagated into §0, the Net claim, R1, and the
   code headers + test names. Deployment-contingent hardening marked NOT-delivered-by-this-wave.
7. **(architect MED) env-key re-intro** noted in R1: `PACT_BROKER_KEY_FILE` re-introduces the env-key
   pattern P-minter removed; only the process boundary changed same-uid.
8. **(architect HIGH) §2 reframe** command-broker on KISS/minimal-surface (not "daemon forces async");
   async = eventual HSM/KMS contract, deferred-necessary.
9. **(architect HIGH) grep-gate corrected** — current allowlist is `{edge-attestation.js, keypair.js,
   frame.js}`; the minter passes by NOT matching the regex (prose-only mention); `broker-sign.js` trips
   `/privateKeyPem\s*:/` so it needs allowlisting; the gate is a non-adversarial forward-guard, NOT custody
   enforcement. The client output-format re-gate is **defense-in-depth** (redundant with `signRecordId`'s
   existing output gate) — the load-bearing NEW guards are the DoS bounds + fixed-argv + env-allowlist.
10. **(honesty MINOR) §7 DoD item 1** demoted to a mechanical `git diff` check.

**CARRIED (confirmed DEFENDED / correctly scoped — do NOT re-litigate):** argv/shell injection (execFileSync
fixed-argv + ordering); output flooding/hang (DoS bounds); malformed output (re-gate pins exactly one
ed25519 sig); **persona-confusion CLOSED** (a sig under A's key is accepted only as A — collapses into R2);
R2 oracle-abuse has NO cheap mitigation short of caller-auth → correctly next-wave; R1/R3 honestly named.

## §9 VALIDATE board (post-build) — RECORDED 2026-06-22

3-lens parallel read-only board on the BUILT diff (code-reviewer / hacker-Rule-2a-reprobe / honesty-auditor).
All three: **PASS-WITH-CHANGES**. Build was GREEN (135 tests) at board time; folds brought it to **137**.

**Headline (why the Rule-2a re-probe earns its keep):** the hacker BUILT a live race probe and **won a TOCTOU
against the BUILT code (1 of 400 broker invocations signed under the attacker's key)** — falsifying the
broker's OWN comment that called its key-file vet a "TOCTOU-bounded defense." code-reviewer found the same
gap independently (convergent → high confidence). A green 14-test suite did NOT catch it; the live probe did.

**FOLDED (all changes verified by re-running the suite → 137 green):**
1. **(code-reviewer MED + hacker F1, convergent — the must-fix) TOCTOU.** `broker-sign.js` replaced the
   `lstat`→`readFileSync` pair with `openSync(O_RDONLY|O_NOFOLLOW)` → `fstatSync(fd)` (perms on the RESOLVED
   inode) → `readFileSync(fd)` → close. `O_NOFOLLOW` refuses a symlink atomically AT open; the fstat+read on
   the open fd close the swap window. The exact fix the hacker pre-validated live (Probe 10).
2. **(hacker F2 LOW) random probe.** `assertBrokerPersona` now uses `crypto.randomBytes(32)` not the fixed
   public `'f'×64` — a decoy signer can't special-case an unpredictable value. New test proves a fixed-probe
   decoy is now caught.
3. **(code-reviewer MED) umask determinism.** test `freshWorld()` `chmodSync(keyFile, 0o600)` — the suite no
   longer depends on the ambient umask (a 0000 CI umask would have made every key 0666 → broker rejects →
   silent test breakage).
4. **(code-reviewer LOW) positive bound guards.** `timeoutMs`/`maxBytes` require a POSITIVE integer (0 is the
   execFileSync "no timeout" footgun) → else default. New test.
5. **(code-reviewer LOW + hacker residual) opts.env hardening.** `opts.env` refuses `NODE_OPTIONS` / `LD_*` /
   `DYLD_*` / `PACT_BROKER_KEY_FILE` (a careless caller cannot re-open the scrubbed code-loading hole or
   shadow the key channel; `keyFile` is the sole key-path channel). New test.
6. **(honesty F1 MINOR) R1 calibration.** the residual test name narrowed: `PROVES R1 (file leg): same-uid the
   host reads the broker key FILE directly` — the body proves the file-read leg; the header's ptrace/`/proc/mem`
   leg is same-uid physics, NOT separately exercised. The test name no longer promises more than the body shows.
7. **(honesty F2 MINOR) honest comment.** `broker-client.js` "holds NO key material" reworded — the grep is a
   syntactic `privateKeyPem`-absence check; the real guarantee is the key path is only ever in the broker child's env.
8. **(code-reviewer LOW) test hygiene.** tmpdirs drained on `process.exit` (no `/tmp` leak on an assertion throw).

**CONFIRMED-DEFENDED on the BUILT code (hacker live probes — do NOT re-open):** env-allowlist defeats
NODE_OPTIONS/LD_PRELOAD/etc (child env carries only the key path); command-hijack; vet bit-logic (`& 0o022`
rejects group/world-writable, accepts setgid/sticky/setuid); malicious-broker output parsing (multi-sig,
leading garbage, trailing NUL, 63/65-byte → all null); partial-read/buffer-boundary; key leakage (drove
malformed/RSA/binary/1MB/absent keys → ZERO PEM/DER/err.stack on any stdout/stderr path); cross-persona
escalation (a sig verifies only under the one held key). The NODE_OPTIONS test is a REAL regression guard
(would fail on a `{...process.env}` spread); R2 oracle-abuse is non-vacuous (an attacker-built frame is
ACCEPTED as the persona through `receiveFrame`); "zero blast radius" greps coupling not prose.

**ACCEPTED-residuals (honestly open, NOT worse than documented):** R1 same-uid (the TOCTOU was a distinct
bug WITHIN R1, now fixed; the physics residual stands), R2 oracle-abuse (caller-auth is the next frontier),
R3 own-key forgery (U1). All SHADOW.

**Net:** custody MECHANISM delivered + hardened; custody-real remains a cross-uid DEPLOYMENT property, NOT
delivered by this wave (per §0). 137 tests green, all SHADOW.
