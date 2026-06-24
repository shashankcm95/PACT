---
lifecycle: persistent
created: 2026-06-24
phase: R-heap — the heap-read non-exfiltration HARDENING leg (the 4th world-anchored custody signal). SHADOW substrate; the SIGNAL hardens IF world-anchored.
status: PLAN (board-hardened) — 3-lens VERIFY folded (architect PASS-after-revise + hacker C1/H1/H2/M1/M2 + honesty B->A). World-anchoring RULED: a local VM suffices for the kernel-credential axis, L3-GATED. Ready to provision + run.
---

# Heap-read non-exfiltration probe (R-heap) — the strongest custody form

> The 4th custody signal, after R1 (file-read non-exfil) -> R2-WHO (caller-auth) -> R2-WHAT (per-request auth).
> R1 proved the key FILE is unreadable cross-uid; R-heap proves the key is unreadable from the broker's MEMORY
> while it signs. Mirrors the R1/R2 dogfood discipline: explicit claim + scope, non-vacuous legs (an L3 positive
> control + an L1 present-target), the vacuity traps pre-closed, a 3-lens VERIFY board BEFORE provisioning.
> Platform: a local Linux `ptrace_scope=2` VM is SUFFICIENT (§6 ruling); EC2 is optional polish.

## §0 Honest scope + the OQ-NS-6 framing (read first)

R-heap HARDENS one axis — key non-exfiltration at the cross-uid AND same-uid MEMORY boundary — IF the live run
produces the kernel-enforced denial under a proven-present target (L1) with a SUCCEEDING positive control (L3)
and the operator's out-of-band uid attestation. Per NS-9, nothing here is reported as hardening until that run.
Scope is ONE box, ONE run, ONE axis — like R1/R2.

**What L4 does and does NOT close (honesty HIGH-2 — do not conflate):** L4 closes the same-uid HEAP-READ channel
(a same-uid process cannot steal the key from the broker's memory under `ptrace_scope=2`). It does NOT touch the
same-uid ORACLE-abuse residual (a same-uid ALLOWLISTED caller can still TRIGGER a legitimate sign — that is the
R2 authorization surface, UNTOUCHED here). Non-exfiltration is not authorization (NS-2).

R-heap does NOT touch R3 (forgery), allowlist-VALUE provenance, the wrapper-privesc precondition (§2/L-pre), the
hypervisor/host-admin boundary (§2), or the apex (external-maintainer-merge). The SHADOW substrate is unchanged.

## §1 The claim (precise, falsifiable, with the qualifier riding inline)

**Given the operator attests out-of-band that the broker PROCESS runs as a separate non-root uid, a process
running as the HOST uid cannot read the signing key out of the broker process's MEMORY while it holds the key, on
a stock Linux kernel with `kernel.yama.ptrace_scope=2` — provided the L3 positive control succeeds (proving the
guard is real, not a no-op).** The probe proves the KERNEL denial; the process<->uid bind is the out-of-band
attestation, never asserted by the probe (the custody-verify binding gap, NS-9).

## §2 Threat model — IN scope vs OUT (the honesty spine)

- **IN scope:** a cross-uid attacker INSIDE the broker's OS (a different non-root uid on the same kernel) reading
  the broker's heap (R1 lifted from the key FILE to the key in MEMORY); plus the same-uid HEAP-READ channel (L4).
- **OUT of scope (stated, not hidden):**
  - **The hypervisor / host-admin.** In a VM the host (macOS) can read guest RAM via the hypervisor; on EC2 AWS
    can. The SAME trust boundary R1/R2 already accept — OUT of scope on BOTH platforms (§6). Never claimed.
  - **The same-uid ORACLE-abuse residual** (a same-uid allowlisted caller triggering a sign) — R2, untouched.
  - **R3 (forgery), allowlist provenance, same-uid WITH `CAP_SYS_PTRACE`.** Untouched.
- **GATING preconditions re-checked AT PROBE TIME (not just assumed at setup — hacker M1/M2):**
  - **L-pre wrapper integrity:** a group/world-writable sudo wrapper lets the host run code AS the broker uid
    (become-broker-uid -> read own memory) — custody-verify C2.5. R-heap's signal is NULL without this green, so
    it is a HARD GATING LEG (run `custody-verify.js`'s C2.5), captured in the evidence bundle — NOT a setup note.
  - **Operator-runtime surfaces** (`core_pattern`, swap, installed `cap_sys_ptrace`/setuid helpers, the
    `ptrace_scope` value itself): on a self-controlled box these are operator-set; the probe LOCKS + ATTESTS them
    (L0) and re-reads `ptrace_scope` immediately before L2 (TOCTOU close), else they are narrowing-only (§6).
- **The binding gap (mirrors custody-verify.js:118-124):** the probe proves the KERNEL denies the read; that the
  PROCESS is genuinely the separate uid is the operator's out-of-band attestation (`id`, `ls -l`, `ps -o uid=`).

## §3 The probe legs (each NON-VACUOUS by construction)

The load-sign-exit broker (RP-1) holds the key for milliseconds, so the probe uses a **paused-broker harness**
that loads the key VIA broker-sign's EXACT key-load path then BLOCKS holding it — a window LARGER than production
(attacker-favorable; a denial here is a fortiori a denial of the millisecond window, since `ptrace_may_access` is
a time-INDEPENDENT credential check). ALL legs target ONE pinned broker pid.

- **L-pre — wrapper integrity (hard gate, hacker M1).** `custody-verify.js` C2.5 PASS (wrapper a regular,
  non-group/world-writable file). FAIL-CLOSED: without this the heap claim is worthless. Captured in evidence.
- **L0 — the full ptrace-policy precondition (architect R-A1 + hacker M2), fail-closed:**
  - `kernel.yama.ptrace_scope == 2` AND Yama is the active LSM (record kernel version + hash; a non-Yama or
    scope!=2 box aborts the run — VT-3).
  - the attacker process holds NO `CAP_SYS_PTRACE` and `uid != 0` (`capsh --print`; VT-5).
  - NO installed binary carries a borrowed `cap_sys_ptrace` and no coercible setuid helper:
    `getcap -r / 2>/dev/null | grep cap_sys_ptrace` empty; `find / -perm -4000` reviewed (hacker H1.5/VT-9).
  - `core_pattern` is not a host-readable sink AND the broker runs `RLIMIT_CORE=0` / `prctl(PR_SET_DUMPABLE,0)`;
    swap is encrypted OR the key pages are `mlock`+`madvise(MADV_DONTDUMP)` (hacker H1.1/H1.4; the operator-runtime
    lock). Re-read `kernel.yama.ptrace_scope` IMMEDIATELY before L2 (the L0->L2 sysctl TOCTOU; VT-8).
- **L1 — present-target proof (the load-bearing non-vacuity; architect R-A2-a + honesty VT-7).** The paused
  harness loads the key through `broker-sign.js`'s EXACT path (`readFileSync(fd,'utf8')` -> `createPrivateKey`,
  broker-sign.js:141), so the heap holds the key in the PRODUCTION representation (the `pem` string AND the
  OpenSSL `EVP_PKEY`), then blocks on a FIFO. Records that it used the production load path (not a synthetic pin).
- **L2 — the denial battery (the claim) — ENUMERATED, each a named-errno sub-leg (hacker H1):**
  1. `ptrace(PTRACE_ATTACH/PTRACE_SEIZE)` -> `EPERM`.
  2. `open(/proc/<pid>/mem)` + `pread` -> `EACCES`/`EPERM`.
  3. `process_vm_readv` -> `EPERM`.
  4. `/proc/<pid>/maps` (+ `/proc/<pid>/environ`) -> DENIED cross-uid. NB (CodeRabbit): these are
     `PTRACE_MODE_READ`/dumpable-gated — a DIFFERENT, WEAKER mechanism than the `PTRACE_MODE_ATTACH` vectors #1-3,
     so a scope=2 attach-denial does NOT by itself imply a maps-denial; verify this leg INDEPENDENTLY (do not fold
     it into the attach battery). Assert the OPEN is denied — NOT "contains no key bytes" (vacuous; maps holds no
     key bytes — the risk is leaking the heap LAYOUT for a later read — hacker H1.6).
  5. induced **core dump**: attempt to crash the broker (attacker-influenced argv/stdin, broker-sign.js:78,113)
     and assert NO host-readable core lands (`core_pattern` sink + `coredumpctl`/`apport` not host-readable) —
     hacker H1.1.
  6. `/dev/mem`, `/dev/kmem`, `/proc/kcore` -> `EACCES`/`ENOENT` (hacker H1.3).
  7. swap/hibernation: assert the key page never hit a host-readable swap device (covered by the L0 mlock/encswap
     lock; record it) — hacker H1.4.
- **L3 — privileged positive control (HARD GATE — non-vacuity #2; VALIDATE hacker H2 + honesty L3-gate).** At the
  SAME blocked instant, on the SAME pinned pid, a root/`CAP_SYS_PTRACE` reader reads the heap and FINDS the key.
  EITHER form suffices — the `-----BEGIN` PEM string OR the test key's EXACT 32-byte ed25519 seed bytes (a
  BYTE-EXACT match of the KNOWN test key, NOT a generic "looks-like-a-seed" pattern, which would match an
  incidental 32-byte heap window — CodeRabbit) — because the paused harness PINS the PEM string as a LIVE module
  const (NOT a freed-page residue, unlike production load-sign-exit), so a PEM find IS proof of live residency;
  the seed scan is optional belt-and-suspenders. **L2's denial is CREDITED
  ONLY IF L3 succeeds** — else L2 is vacuous (the guard may have "denied" because there was nothing to read).
  This is what makes a self-controlled box honest (§6): a rigged "always-deny" kernel would deny L3 too, which
  MUST succeed.
- **L4 — same-uid HEAP-READ denial (the residual-closer) — PER VECTOR + the carve-out (hacker C1).** As a SECOND
  process running as the BROKER uid (not root, no `CAP_SYS_PTRACE`), run EACH of L2.1-L2.3 independently -> each
  must be denied under scope=2 (all route through `ptrace_may_access`/Yama). AND assert the broker never calls
  `prctl(PR_SET_PTRACER, ...)`/`PR_SET_PTRACER_ANY` (the declared-tracer carve-out that would re-open scope=2 —
  grep the broker + wrapper). Closes the same-uid HEAP-READ channel (NOT the oracle — §0).

## §4 The vacuity traps to pre-close

- **VT-1 target-absent:** L2 "denied/found nothing" against an exited broker -> CLOSED by L1 + L3.
- **VT-2 guard-never-exercised:** L2 passes because the read fails anyway -> CLOSED by L3 (the guard demonstrably
  fails for a capable reader) AND the L2-credited-only-if-L3-succeeds gate.
- **VT-3 wrong-precondition:** box is scope=0/1 or Yama inactive -> CLOSED by L0 (fail-closed).
- **VT-4 rigged kernel/userspace:** a patched kernel faking the denial -> CLOSED by stock-kernel (version+hash) +
  L3 (a rig that fakes L2 also breaks L3, which must succeed).
- **VT-5 root/cap confound:** attacker is root / has `CAP_SYS_PTRACE` -> CLOSED by L0 (uid!=0 + capsh).
- **VT-6 mode confound (the R1 C2 scar):** EXPECTED-N/A for memory reads (`ptrace_may_access` is credential-,
  not mode-based) — CONFIRMED by L2 recording the errno + the attacker/broker uid pair so the denial is provably
  credential-caused (not asserted N/A; the R1 scar was being sure a confound didn't apply — honesty MED-2).
- **VT-7 harness-unrepresentativeness:** the paused harness loads a key production never holds -> CLOSED by L1
  using broker-sign's exact key-load path (architect R-A2-a / honesty VT-7).
- **VT-8 sysctl TOCTOU:** `ptrace_scope` flipped between L0's read and L2 -> CLOSED by re-reading it immediately
  before L2 (hacker M2).
- **VT-9 borrowed-cap:** a `cap_sys_ptrace`/setuid helper already on the box -> CLOSED by the L0 getcap/setuid scan.

## §5 The dogfood procedure (platform-agnostic; operator runs it out-of-band)

1. Provision a Linux box (local `multipass`/Lima/UTM VM — sufficient per §6; OR `t4g.small`), STOCK image
   (Ubuntu 24.04 / Amazon Linux 2023). Record kernel version + hash + that Yama is the active LSM.
2. `sysctl -w kernel.yama.ptrace_scope=2` (persist in `/etc/sysctl.d/`). Lock the operator-runtime surfaces (L0:
   `core_pattern`, swap, getcap/setuid scan). Verify (L0).
3. Create the broker uid (e.g. 600) + the host uid (the attacker, normal non-root). Deploy the key `0600` owned
   by the broker uid; the wrapper non-writable. Run L-pre (`custody-verify` C2.5) -> must PASS.
4. Run the paused-broker harness as the broker uid via broker-sign's key-load path (L1, one pinned pid). From the
   host uid, run the enumerated L2 battery (capture every errno). Run the per-vector same-uid L4. Run the
   privileged positive control L3 (BOTH key forms) — credit L2 ONLY if L3 succeeds.
5. Out-of-band attestation (the SOLE determiner, NS-7): `id` (attacker uid != broker uid != 0),
   `ps -o uid= -p <pid>` (the pinned broker pid's uid == the broker uid), `ls -l <key>`, `cat <key>` -> denied.
6. Capture all output as the evidence bundle (the plans/14 §8 / plans/17 §9 analog), including the §6 ruling +
   its residual (pre-written per honesty R-H2 to avoid an NS-9 slip at report time).

## §6 World-anchoring RULING (the load-bearing question — TRIANGULATED, decided)

**RULED: a local Linux VM WORLD-ANCHORS R-heap for the kernel-credential axis and a clean run HARDENS one axis,
CONDITIONAL on (a) L3 succeeding and (b) the operator-runtime surfaces locked + attested (L0). EC2 is optional
polish, NOT required.** The three lenses:

- **Architect (decisive):** the world-anchor is REAL KERNEL ENFORCEMENT of a privilege boundary by an unmodified
  kernel — the same basis R1/R2 hardened on the user's OWN MacBook (operator = host-admin there too, already
  overruled). A VM runs the identical `ptrace_may_access` code; the Nitro hypervisor never touches it. The
  "fully-owned VM" objection only bites the hypervisor/host-admin threat, which is OUT of scope on both. EC2 buys
  nothing in-scope.
- **Honesty (conditional):** the R1 "fully-discharged 2e" over-claim was a SCOPE error, not a platform error.
  The line: HARDENS when the denial is produced by a mechanism the operator cannot author the RESULT of (stock
  kernel + L3 proving the guard is real); NARROWS when the operator authors the verdict. So local-VM hardens IFF
  L3 fires — make L3 a HARD GATE (done, §3).
- **Hacker (the caveat):** world-anchoring holds for the kernel-credential vectors (the `ptrace_may_access`
  family). The operator-runtime surfaces (`core_pattern`, swap, borrowed caps, the L0->L2 sysctl TOCTOU) are
  operator-controlled on a self-owned box -> narrowing-ONLY unless LOCKED + ATTESTED. Folded into L0 + VT-8/VT-9.
  With those locked, the local VM hardens; without, EC2/a less-self-controlled box would be needed.

## §7 Runtime Probes (evidence tiers labelled honestly — honesty HIGH-3)

- **RP-1 (FIRSTHAND, in-repo):** the broker is LOAD-SIGN-EXIT — `broker-sign.js:7,141,144` reads
  `PACT_BROKER_KEY_FILE` -> signs argv record_id -> exits. Key heap-resident for ms -> §3's paused harness.
- **RP-2 (FIRSTHAND, in-repo):** cross-uid invocation `sudo -n -u <broker-user> <wrapper> <recordId>`
  (`broker-launch.js:64`). The host uid triggers; the §1 attacker is this host uid.
- **RP-3 (FIRSTHAND, in-repo):** the C3 non-vacuity model — `custody-verify.js:95-99` proves a usable key exists
  behind the broker WITHOUT the host reading it; L1+L3 are the memory-boundary analog.
- **RP-4 (DOC-SOURCED — to be CONFIRMED FIRSTHAND at L0/L2/L4, NOT yet probed):** `ptrace_scope` semantics
  (kernel.org Yama): governs `ptrace` + `/proc/<pid>/mem` + `process_vm_readv` via `ptrace_may_access`; cross-uid
  denied for a non-root caller at any scope; `=2` adds same-uid denial for the ptrace-routed vectors (NOT the
  `PR_SET_PTRACER` carve-out, NOT mode-/dumpable-gated `maps`/`environ` — hacker C1). The live run IS this probe.

## §8 VERIFY board record (2026-06-24, pre-build)

3-lens board (architect + hacker + honesty). **Verdict: PASS-to-build after the folds above.**
- architect: PASS-after-revise; ruled the paused harness REPRESENTATIVE (time-independent kernel verdict) +
  the §6 local-VM WORLD-ANCHORING; required R-A1 (L0 full policy) + R-A2-a (L1 production load path) — folded.
- hacker: C1 (L4 per-vector + PR_SET_PTRACER), H1 (L2 battery: core/dev-mem/swap/borrowed-cap/maps-fix),
  H2 (L3 both key forms + same pid + L2-gated-on-L3), M1 (C2.5 gating leg), M2 (operator-runtime lock + TOCTOU)
  — all folded.
- honesty: grade B->A after folds; HIGH-1 (§1 inline qualifier), HIGH-2 (oracle-vs-heap de-conflation),
  HIGH-3 (RP-4 relabel), VT-7, L3-as-hard-gate, the §9 disposition — all folded.

### §8.1 VALIDATE board record (2026-06-24, post-build — the harness `heap-read-probe.js` + tests + runbook)

3-lens board (code-reviewer + hacker LIVE-probe + honesty) on the BUILT verdict harness. **Verdict: PASS after
folds; the board caught a LIVE-PROVEN false-hardening bypass the green unit suite missed (Rule 2a).**
- **hacker CRITICAL (C1, live-proven):** `L4-ptracer-carveout` was the ONE inverted-polarity leg
  (`=== true -> fail, else pass`), so the string `'true'` (what the runbook grep emits) fell to the SAFE PASS ->
  a false `held:true` for an OPEN same-uid `PR_SET_PTRACER` channel. FIXED: inverted to `=== false -> pass, else
  fail` (every malformed value now fails closed) + a coercion regression test.
- **code-reviewer HIGH (live-confirmed):** the CLI crashed on JSON `null` (`assessHeapRead(null)` — a default
  param only fires for `undefined`). FIXED: a null/array/scalar guard in both `assessHeapRead` + `main` + a test.
  (The same latent bug exists in `custody-verify.js` `assessCustody` — flagged as a separate chip.)
- **hacker HIGH (H2):** spec said L3 needs BOTH key forms; code/runbook do PEM-only. RESOLVED honestly: the
  harness PINS the PEM string as a live const (not a freed-page residue), so a PEM find IS real residency — `||`
  is correct; the spec §3 L3 + the code comment now say so; the seed scan is optional.
- **honesty MINOR (A-):** the field `hostObservableHardeningHeld` leaked the PROPERTY into the name. RENAMED to
  `hostObservableDenialChecksHeld` (names the OBSERVATION, sibling `custody-verify` parity).
- **runbook (hacker M1/M2 + code-reviewer):** L3 dump switched to `gcore` (the `0x0..` range aborts on the null
  page); the core-leak check now inspects `/proc/sys/kernel/core_pattern` + `coredumpctl` (not a CWD glob); the
  L4 carve-out adds a runtime `/proc/$PID/status TracerPid` check.
- Suite 381/0; eslint clean.

## §9 Residuals + the honest disposition (NS-9 — honesty's recommended wording)

R-heap NARROWS until the live run, on a stock-kernel box with `ptrace_scope=2` (a local VM is sufficient, §6),
produces (i) a cross-uid AND same-uid memory-read denial (L2+L4) under (ii) a proven-resident key (L1) with
(iii) a SUCCEEDING privileged positive control (L3) and (iv) the operator's out-of-band uid attestation. With all
four, it HARDENS one axis — key non-exfiltration at the memory boundary (cross-uid + same-uid heap-read) — one
box, one run. It does NOT close: the same-uid ORACLE-abuse residual (R2), the hypervisor/host-admin boundary, the
wrapper-privesc PRECONDITION (L-pre), R3 forgery, allowlist-value provenance, or the apex external-maintainer-
merge. **Absent L3 or the out-of-band attestation, the run NARROWS only** (the probe proved the kernel denial,
never the process<->uid bind).
