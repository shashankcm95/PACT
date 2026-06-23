---
lifecycle: persistent
created: 2026-06-22
wave: cross-uid custody DOGFOOD (the live run of the plans/09 spike — the first HARDENING move)
status: PLAN — VERIFY board folded (§9); run-ready pending operator provisioning
---

# Cross-uid custody dogfood — running the spike for real (hardens NON-EXFILTRATION / R1; R2 + R3 stay open)

> The first move in the whole project that crosses NS-7's line from *narrow* to *harden* — but only for ONE
> axis: **file-read non-exfiltration (R1)**. `plans/09` built the custody MECHANISM + the verifier + the runbook
> (all SHADOW, unit-tested via SYNTHETIC facts because a same-uid box cannot produce real cross-uid facts). This
> wave RUNS it against a genuinely separate OS uid so the kernel's `EACCES` under a foreign uid — a world-anchored
> OS fact, out-of-band of PACT's own code — becomes the signal. No new production code: the deliverable is the
> LIVE RUN + the recorded out-of-band attestation. **R2 (oracle-abuse / authorization) and R3 (own-key forgery)
> are UNTOUCHED by custody — do not read a custody PASS as a trust-wide or authorization/provenance win.**

## §0 Frame — the OQ-NS-6 honesty banner (read first)

Per NS-7, every in-process SHADOW signal PACT has shipped only NARROWS trust. The custody-real hardening is a
**deployment property** (separate uid / enclave / HSM), and the only thing that establishes it is an OS-level
fact the operator attests out-of-band. **This wave does not write code that hardens — it RUNS the deployment and
RECORDS the world-anchored signal.** Scope of the claim (honesty MED — the qualifier rides WITH the claim, not 80
lines later): a clean run hardens **file-read non-exfiltration of the key (R1)** and NOTHING else — `ptrace` /
`/proc/<pid>/mem` heap-read is a SEPARATE exfil channel this run closes ONLY if `ptrace_scope` is also attested
(§2e); authorization (R2) and forgery (R3) stay fully open. Until the attestation is real, everything stays
SHADOW (NS-8); nothing gates an action. Per NS-9: a vacuous, same-uid, or necessary-but-insufficient run is NOT a
hardening — it is reported as exactly what it is.

## §1 What is already built (plans/09) vs what this wave adds

- **Built + unit-tested (plans/09, SHADOW):** `custody-verify.js` (`assessCustody` pure verdict + `gatherCustodyFacts`
  I/O; C0/C1/C2/C2.5/C3), `broker-launch.js` (`crossUidBrokerSigner` — the validated `sudo -n -u` argv builder),
  and the operator runbook (`docs/deployment/cross-uid-broker.md`, reconciled to the post-R2-WHAT code at `df1344e`).
- **This wave adds (no new production code):** (1) a NEGATIVE-control run that proves the verifier goes RED on a
  same-uid deployment; (2) the REAL cross-uid run; (3) the out-of-band attestation including the SUFFICIENT facts
  the verifier structurally cannot prove (§3); (4) a north-star §2.6 update IF — and only if — the attestation
  genuinely lands (NS-9, §6).
- **The verifier has known gaps the OPERATOR closes by hand here** (surfaced by the §9 VERIFY board): the verifier
  checks the operator-supplied `--key` path, which is DECOUPLED from the key the broker actually signs with; it
  proves a FILE is cross-uid-owned, never that the signing PROCESS is that uid; it does not model `ptrace` or
  the wrapper/key DIRECTORY. Each is closed by an explicit §2 checkpoint + a recorded §8 fact. Hardening the
  verifier IN CODE to enforce these is an optional follow-on (§10), NOT required for an honest operator dogfood.

## §2 Execution order + provisioning checkpoints (runbook §1-§7 + the §9-board gates)

1. Provision: create `pact-broker` uid (no login/shell); key `0600` owned by `pact-broker` in a `0755` dir.
2. Install the root-owned wrapper (sets `PACT_BROKER_KEY_FILE` + `PACT_BROKER_PERSONA_DID=did:key:zBroker` broker-side);
   add the sudoers entry pinning `env_reset, !setenv`; register the broker PUBLIC key.
3. Run `custody-verify.js --key … --persona did:key:zBroker --broker-user pact-broker --wrapper … --registry …`
   AS THE HOST UID; then the out-of-band attestation (§8); then `--attested-cross-uid`.

**Checkpoints that MUST hold before the run is meaningful (each closes a §9 false-pass / mislead vector):**

- **2a — `--key` MUST equal the wrapper's `PACT_BROKER_KEY_FILE`** (the same-PATH binding, not just same-owner).
  The verifier opens `--key` (`custody-verify.js:135,143`); the broker signs with `PACT_BROKER_KEY_FILE`
  (`broker-sign.js:121`); `crossUidBrokerSigner` passes NO keyFile through (`broker-launch.js:64,74`) — they are
  DECOUPLED. A `--key` pointed at a broker-owned DECOY while the real key is host-readable yields a byte-identical
  C2/C3 PASS and a green `id`/`ls -l`/`cat` attestation (hacker HIGH-1, probe-confirmed). Confirm `--key` IS the
  signing key: `sudo grep PACT_BROKER_KEY_FILE <wrapper>` and diff the path.
- **2b — `PACT_BROKER_ALLOWED_UIDS` must be UNSET, or contain the HOST uid that invokes sudo.** The real run is
  `sudo -n -u pact-broker <wrapper>`, so `broker-sign.js:87-88` runs `authorizeCaller({sudoUid: SUDO_UID, …})`
  BEFORE the key open (`broker-sign.js:97`). A denied caller exits before signing → C3 FAILS with a no-signature
  message IDENTICAL to a wiring/sudoers break (arch HIGH-1). If unset, the broker prints `caller-auth DISABLED`
  and proceeds — capture stderr to disambiguate.
- **2c — triple-equality:** the registry entry's `personaDid`, the wrapper's `PACT_BROKER_PERSONA_DID`, and the
  `--persona` CLI arg must be the SAME string (`did:key:zBroker`), and the registry `publicKeyPem` must be the
  broker key's public half. A mismatch → C3 `personaMatches:false` → `broker signed but as a DIFFERENT persona`
  (`custody-verify.js:98`), a config error not a custody fault (arch MED).
- **2d — the wrapper DIR and the key DIR must be root-owned + non-group/world-writable, and host-traversable.**
  C2.5 checks only the wrapper FILE mode, not its DIRECTORY (`custody-verify.js:103-108`): a host-writable wrapper
  dir lets the host replace the wrapper → code-exec as the broker uid → key exfil, with C2.5 reporting PASS
  (hacker MED). Host-traversable (`0755`) so C2.5/C2-owner don't silently degrade to a non-failing NOTE.
- **2e — `ptrace` is denied to the host:** confirm `sysctl kernel.yama.ptrace_scope` ≥ 1, the host uid is NOT in
  the broker's group, and lacks `CAP_SYS_PTRACE`; the verifier models none of this (hacker HIGH-3). Without it the
  host can lift the key from the broker heap after `broker-sign.js` reads it, and a C2/`cat`-denied PASS still
  over-claims non-exfiltration.

The system-config steps (uid, key custody, sudoers, ptrace policy) are the OPERATOR's. The verdict interpretation
+ result recording is in-scope here.

## §3 PASS vs VACUOUS-PASS — the non-vacuity hinge (load-bearing; §9-revised)

A non-vacuous PASS (custody genuinely real for R1) requires ALL of — NECESSARY (tool-observable) **and**
SUFFICIENT (operator-attested):

NECESSARY (the verifier reports; necessary, NOT sufficient — `custody-verify.js:113-120`):
- **C2 DIFFERENT-OWNER denial leg** — `denialLegTaken === true` at `custody-verify.js:85`: host read DENIED
  (`EACCES`/`EPERM`) AND the key `lstat` owner uid `!=` the running uid (the different-owner PASS branch is
  `:84-87`; the same-owner FAIL is `:82-83`). **C2 proves a CHOSEN file is cross-uid-owned — never that it is the
  signing key (see 2a).**
- **C3 `personaMatches`** — a real, usable key behind the broker signs + verifies as `did:key:zBroker`. The THREE
  C3 diagnostics to distinguish: PASS; `broker returned NO signature` (`:97` — sudo/wiring/key OR a caller-auth
  DENY per 2b, **check the allowlist FIRST**); `broker signed but as a DIFFERENT persona` (`:98` — registry/persona
  mismatch per 2c).
- **C0 not root**, **C1 key present + non-empty**, **C2.5 wrapper** — PASS only when the wrapper is host-STATABLE
  AND a regular, non-group/world-writable file; an UNSTATABLE wrapper degrades to a non-failing NOTE
  (`custody-verify.js:103-111`) → wrapper integrity UNVERIFIED → record as a residual, do not read as PASS.
- **`hostObservableChecksPassed: true` AND `requiresOutOfBandUidConfirmation: true`** — the tool REFUSES to
  self-certify; these flags alone establish NOTHING about uid separation.

SUFFICIENT (operator-attested out-of-band — the part the tool structurally cannot do; §8 records each):
- **The signing PROCESS runs as the key-owner uid** (the SOLE determiner — `custody-verify.js:86,119`): C2 proves a
  FILE owner, C3 proves SOME signer works; NEITHER binds the running broker PROCESS to that uid. Prove it directly
  (e.g. `ps -o ruid= -p <broker-pid>` of an in-flight sign, or the wrapper emits `id -u`), `== key-owner uid`,
  `!= host uid`.
- **`--key` == the wrapper's `PACT_BROKER_KEY_FILE`** (2a) — else the whole PASS is about a decoy.
- **The ptrace + dir-ownership preconditions (2d/2e) hold.**

VACUOUS pass (NOT a hardening — must be caught + named, NS-9):
- **Same-uid run, readable key:** C2 FAILS at `:75` (`the host uid CAN read the key file`).
- **Same-uid run, mode-000 key:** C2 FAILS at `:82-83` (`owned by the running uid — EACCES is from file MODE`).
- **Owner-blinded** (`0700` key dir): C2 FAILS fail-closed (`cannot distinguish a cross-uid key from its own
  locked-dir key`).
- **Root**: C0 FAILS. **Necessary-only**: every NECESSARY check PASSES but a SUFFICIENT fact is unrecorded/unproven.

## §4 The negative control — prove the guard can FAIL (security.md non-vacuity discipline; §9-revised)

Before trusting the real PASS, prove the verifier goes RED on a same-uid deployment — but make the control
NON-VACUOUS (hacker MED, probe-confirmed it can red for the wrong reason):

1. Run the **real** `gatherCustodyFacts` against a real same-uid `/tmp` key owned by the running uid (NOT
   hand-typed synthetic facts — a mistyped `ownerUid` passes vacuously).
2. Assert C2 FAILS with a SAME-UID detail string specifically — `the host uid CAN read the key file` (readable
   `0600` host-owned key, the likely setup → the `:75` path) OR `owned by the running uid` (a mode-000 key → the
   `:82-83` path). ACCEPT EITHER; pin the assertion to the exact failing check id + reason.
3. REJECT a RED that comes from C0 (root / getuid-undefined, `:54-55`) or owner-unknown — those red WITHOUT
   exercising the same-owner leg the control is meant to prove (a vacuous RED).

## §5 Runtime Probes (firsthand — this session, against the repo NOW)

- **P1** C2 denial leg requires a DIFFERENT owner; same-owner readable (`:75`) and mode-000 (`:82-83`) and
  owner-unknown all FAIL-closed; `denialLegTaken` at `:85`. CONFIRMED (read).
- **P2** `crossUidBrokerSigner` is exported + path/username-validated and passes NO keyFile through:
  `broker-launch.js:64,74-78`. CONFIRMED (grep, this turn).
- **P3** the runbook is reconciled (persona `did:key:zBroker` consistent across §3/§5/§7): commit `df1344e`.
  CONFIRMED (committed this session).
- **P4** require-frame is default-on gated on `PACT_BROKER_PERSONA_DID`; a dropped `REQUIRE_FRAME` fails CLOSED:
  `request-auth.js:50-53`. The C3 probe declares `src_persona_did=personaDid` so it survives persona-bind ONLY if
  `--persona == PACT_BROKER_PERSONA_DID` (2c). CONFIRMED (read).
- **P5** the C3 probe's `personaMatches` needs the registry entry's `personaDid==--persona` + the broker's real
  pubkey (`custody-verify.js:160-169,246-248`). CONFIRMED (board-read).
- **P6 (DECOY, hacker HIGH-1)** the verifier opens `--key` (`custody-verify.js:135,143`); the broker signs with its
  own `PACT_BROKER_KEY_FILE` (`broker-sign.js:121`) — DECOUPLED. CONFIRMED (grep, this turn).
- **P7 (caller-auth order, arch HIGH-1)** `authorizeCaller` runs BEFORE the key open (`broker-sign.js:87-88,97`).
  CONFIRMED (grep, this turn).
- **P8** baseline suite: record the actual `npm test` tail at run time in §8 — do NOT quote a remembered count
  (plans/09 cites 179, north-star §2.4 cites 153, this session saw 230; the figure decays — paste the artifact).

## §6 DoD (§9-revised — NECESSARY items are non-terminal; the run is "done" only with the SUFFICIENT facts)

- [ ] **Negative control GREEN-as-RED (§4):** the REAL `gatherCustodyFacts` against a same-uid key FAILS C2 with a
      pinned SAME-UID reason (not a C0/owner-unknown red).
- [ ] **Host-observable checks passed (NECESSARY, NOT custody-real):** C0/C1/C2(different-owner)/C2.5/C3 PASS;
      `hostObservableChecksPassed: true`; `requiresOutOfBandUidConfirmation: true`. **This item alone establishes
      NOTHING about uid separation** (`custody-verify.js:113-120`).
- [ ] **SUFFICIENT facts recorded (§8):** the signing PROCESS uid proven `== key-owner != host` (the SOLE
      determiner); `--key == PACT_BROKER_KEY_FILE` (2a); the wrapper/key DIRS root-owned + non-writable (2d);
      `ptrace_scope ≥ 1` + host not in broker group + no `CAP_SYS_PTRACE` (2e).
- [ ] **Out-of-band attestation recorded** (the `id` / `ls -l <key>` / `cat <key> → Permission denied` outputs).
- [ ] **north-star §2.6 updated ONLY IF** the NECESSARY checks PASS **AND** the process<->uid bind is proven
      **AND** `--key` is bound (2a) — all three. Worded `custody-real (file-read non-exfiltration / R1) established
      on <host> on <date>`, never a blanket "custody hardened" (NS-9).
- [ ] **Residuals re-stated unchanged:** R2-WHO / R2-WHAT / R3 untouched; ptrace closed only by 2e; the process<->uid
      bind stays the out-of-band attestation, never tool-proven; custody hardens NON-EXFILTRATION, not authorization.
- [ ] Suite still green — paste the actual `npm test` tail into §8 (P8); no production-code change expected.

## §7 VERIFY / VALIDATE plan

**VERIFY (pre-run, 3-lens) — COMPLETE, folded in §9.** architect + hacker + honesty-auditor on §2/§3/§4.
**VALIDATE (post-run, 1-lens) — honesty-auditor on the recorded §8 result:** does the attestation support a
`custody-real (R1)` claim, or is it narrowed (NECESSARY checks PASS but the process<->uid bind or the `--key`
binding unproven)? NS-9 reflex — no "hardened" claim outruns the recorded evidence.

## §8 Dogfood result — RECORDED 2026-06-23 (MacBookAir; existing Jun-22 deployment; PASS for R1)

The deployment was already provisioned on a prior session (2026-06-22 11:45-11:57): `pact-broker` uid 600,
key `/etc/pact/broker.key` `0600` owned `pact-broker:wheel`, root-owned wrapper + `0440` sudoers. The CURRENT
(hardened) `custody-verify.js` was run against that REAL cross-uid broker (read-only).

```
host / date:                 MacBookAir / 2026-06-23   (host uid 501; broker uid 600)
custody-verify (real run):   C0 PASS (uid 501) / C1 PASS (119 bytes) /
  C2 PASS (denialLegTaken: true; "host read denied EACCES + key owned by 600 != 501") /
  C2.5 PASS (wrapper statable, non-group/world-writable) /
  C3 PASS (personaMatches: true; "a real, usable key exists behind the broker")
  hostObservableChecksPassed: true   requiresOutOfBandUidConfirmation: true
negative control (REAL same-uid facts, --key=/tmp/nc.key 0600 owned 501):
  C2 FAIL "the host uid CAN read the key file" (the :75 readable-key path) -> NON-VACUOUS (guard goes RED)
SUFFICIENT facts (the tool cannot prove these — attested out-of-band):
  signing PROCESS uid: 600  (LOGICAL bind: `sudo -n -l` runas = (pact-broker)=600 NOT root, + the broker read
    the 0600/600 key per C3 -> only uid 600 or root can read it -> 600. Direct `ps` inconclusive: sign faster
    than the poll. RESIDUAL: assumes no stray host-readable COPY of the private key elsewhere.)
  --key: /etc/pact/broker.key  ==  wrapper PACT_BROKER_KEY_FILE: /etc/pact/broker.key   (2a SAME path — not a decoy)
  wrapper dir /usr/local/bin: root:wheel 0755 (non-host-writable)   key dir /etc/pact: pact-broker:wheel 0755 (non-host-writable)   (2d ok)
  macOS memory guard (2e): SIP enabled (csrutil); host 501 cannot task_for_pid a uid-600 process without root.
    (COARSER + less inspectable than Linux ptrace_scope=2 — the strongest 2e is a Linux box.)
out-of-band attestation: id=501 (!= 600)   ls -l owner=pact-broker(600) != 501   cat /etc/pact/broker.key -> Permission denied
npm test: NOT re-run (no code change this turn; last green this session: 230). The dogfood ran the CURRENT
  repo verifier against the DEPLOYED broker; no source was modified.
verdict (pending VALIDATE honesty pass, §7): custody-real (R1 / file-read NON-EXFILTRATION) ESTABLISHED for the
  cross-uid KEY CUSTODY on this box. SCOPE (NS-9): R1 ONLY — R2 (oracle-abuse / authorization) and R3 (own-key
  forgery) UNTOUCHED. CAVEATS: (1) the DEPLOYED broker is a STALE pre-R2-WHAT blind-oracle snapshot — the R1
  custody claim is code-version-independent (filesystem + uid), but the deployed broker CODE was not itself
  validated by this run and lacks this session's per-request/caller-auth hardening; (2) macOS SIP < Linux
  ptrace_scope=2; (3) the process-uid bind is a logical proof modulo a stray key copy. This is PACT's FIRST
  world-anchored signal that HARDENS (per OQ-NS-6/NS-7), not narrows — observed live, kernel EACCES under a real
  separate uid.
```

## §9 VERIFY board result — RECORDED 2026-06-22 (architect + hacker + honesty; all SOUND-WITH-CHANGES)

3-lens read-only board (workflow `wf_7ff116d7`). No NEEDS-REVISION, no fatal defect — but two structural
false-pass vectors + several narrowing gaps, all FOLDED above. The two HIGH structural findings were
PREMISE-PROBED firsthand before folding (P6/P7).

- **hacker HIGH-1 (DECOY-KEY false-pass) — FOLDED 2a/§3/§8.** The verifier's `--key` is decoupled from the broker's
  `PACT_BROKER_KEY_FILE`; a decoy yields a byte-identical PASS. Probe-confirmed. Closed by the same-PATH binding.
- **hacker HIGH-2 + honesty HIGH-1/HIGH-2 (process<->uid bind gap) — FOLDED §3-SUFFICIENT/§6/§8.** C2+C3 prove
  file-owner + a working signer, never the running PROCESS uid (`:86,119` the SOLE determiner). The §8 skeleton
  now records it; DoD item 2 is non-terminal; the north-star edit is gated on the bind.
- **hacker HIGH-3 (ptrace/proc-mem) — FOLDED 2e/§0.** Cross-uid file-ownership doesn't deny ptrace; scope the claim
  to file-read non-exfiltration unless `ptrace_scope` is attested.
- **arch HIGH-1 (caller-auth gate before C3) — FOLDED 2b/§3.** A denied `PACT_BROKER_ALLOWED_UIDS` caller fails C3
  indistinguishably from a wiring break; probe-confirmed the ordering. Check the allowlist first.
- **arch HIGH-2 (two same-uid FAIL messages) — FOLDED §3/§4.** §3 quoted the mode-locked `:83` message; the likely
  control reds at the readable `:75` message. Both now enumerated; the control accepts either.
- **arch MED (registry/persona triple-equality) — FOLDED 2c.** + **hacker MED (wrapper/key DIR privesc) — FOLDED
  2d.** + **arch MED (C2.5 degrades to NOTE) — FOLDED §3.** + **hacker MED (vacuous negative control) — FOLDED §4.**
- **honesty MED (unqualified HARDENS) — FOLDED title/§0.** Scope rides with the claim: R1 non-exfiltration only.
- **honesty LOW / arch LOW (status-claim 230; line citation) — FOLDED P8/§3.**

## §10 Verifier-hardening follow-on (OPTIONAL — code; deferred, not required for the dogfood)

The §2 checkpoints close every §9 vector at the OPERATOR level (the operator is the trusted party establishing
their own custody — these are footguns/scope-gaps, not an adversary). Hardening the verifier IN CODE would make
the dogfood robust to operator error rather than relying on discipline: (a) have `custody-verify` read the
wrapper's `PACT_BROKER_KEY_FILE` and FAIL unless `--key` matches; (b) extend C2.5 to `lstat` the wrapper + key
PARENT dirs and FAIL on a group/world-writable or non-root-owned dir; (c) add a process-uid probe (capture the
broker PID's `ruid` during the C3 sign and FAIL unless it `==` the key owner). Each is a `plans/09`-style TDD
sub-wave with its own VALIDATE. DEFERRED — revisit if the dogfood is to be run by a less-careful operator or
wired into CI. Tracked: `docs/FORKS.md` (a future entry when prioritized).
