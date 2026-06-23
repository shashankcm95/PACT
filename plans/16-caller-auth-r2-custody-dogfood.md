---
lifecycle: persistent
created: 2026-06-23
phase: R2 caller-auth custody dogfood — the SECOND world-anchored hardening signal (authorization at the live cross-uid boundary)
status: PLAN — VERIFY board folded (§8); deploy-ready (USER runs the sudo/system-config)
---

# R2 caller-auth custody dogfood — prove the allowlist DENIES at the live cross-uid boundary (the trust-mover)

> Chosen 2026-06-23 as the next PACT move (north-star §2.6 inflection + §5 mapped-next): the in-process mechanisms
> are built; per NS-7 only a **world-anchored deployment** hardens. R1 (`plans/14`) hardened FILE-READ
> non-exfiltration; §2.7 records **R2 (authorization) + R3 (forgery) UNTOUCHED**. This wave delivers the R2
> hardening signal — the live, NON-VACUOUS proof that the broker's caller-auth allowlist actually DENIES a
> non-allowlisted uid at the real cross-uid boundary. It mirrors the R1 dogfood discipline (`plans/14`).

## §0 Honest scope (read first — it bounds the DoD; NS-7/NS-9)

`v0/src/identity/caller-auth.js` is **already built + unit-tested** (`authorizeCaller` → allow/deny/disabled on
`SUDO_UID` ↔ `PACT_BROKER_ALLOWED_UIDS`; `broker-sign.js` calls it as gate-0 before opening the key). This wave
does NOT build code — it **world-anchors the guard**: a live dogfood on a separate-uid deployment proving the
deny path FIRES (the non-vacuity discipline — security.md: "a guard must be NON-VACUOUS; prove it can fail").

**What a PASS HARDENS (one axis, on one box — NS-7):** WHO-may-invoke is enforced **by the broker itself**, at
the real cross-uid boundary, with the policy held by the thing that holds the key — and the deny is **observed
firing against a real, distinct, non-allowlisted OS uid**, not assumed.

**What it does NOT close (loud residuals — named, not papered):**
- **R2-WHAT stays OPEN.** An *allowlisted* caller can still request a signature over an **arbitrary** `record_id`
  → still forge as the persona. Per-request entitlement (`plans/11` R2-WHAT) is the separate, harder frontier.
- **Same-uid compromise** — a compromised allowlisted process (same uid) is still an oracle (uid-auth trusts the uid).
- **R3 (forgery) UNTOUCHED**; the **heap-read leg stays narrowed-not-closed** (macOS 2e PARTIAL — shared `staff`
  group + `task_for_pid` coarseness; the strongest form is a Linux `ptrace_scope=2` box, R1's residual, unchanged here).
- **The allowlist VALUE is the trust anchor, not just the wrapper file's integrity (NS-2 integrity != provenance,
  VERIFY architect LOW).** A host that cannot tamper the root-owned wrapper FILE still relies on the operator
  having written the CORRECT uid literal; a wrong-but-well-formed uid silently mis-authorizes, and this dogfood
  does NOT verify the literal is the INTENDED policy — it only verifies the guard enforces whatever literal is set.
- All SHADOW — nothing gates an action.

## §1 The hardening claim + the NON-VACUITY criteria (the load-bearing axis — VERIFY-revised)

The pass is meaningful ONLY if the **deny leg is exercised against a real, distinct, non-allowlisted OS uid,
through the real `sudo` cross-uid path, and the deny is PROVABLY membership-caused** (not malformed-allowlist,
not absent-SUDO_UID, not disabled-mode, not a require-frame gate-0.5 failure). The VERIFY board (§8) found FOUR
ways a naive run passes vacuously; the legs below close each.

**Deployment shape this REQUIRES (hard gate, not a design point — hacker HIGH-1 / architect MED):** TWO genuinely
distinct, separately-provisioned, sudo-invocable OS uids — `ALLOWED_UID` (in the allowlist) and `EXCLUDED_UID` (a
real uid NOT in the allowlist). The allowlist value is FIXED to `{ALLOWED_UID}` across legs 1+2 so the leg-1 allow
is a positive-control for the leg-2 deny. (A single-uid allowlist-flip is FORBIDDEN — it makes the deny come from
mutating the policy, not from a real excluded caller.)

**Leg-0 — preconditions (must hold, else the run is VACUOUS — ABORT, do not record):**
- **(0a) NOT disabled (hacker MED / architect MED):** the allowlist is SET; leg-1 must NOT emit a `caller-auth
  DISABLED` notice on stderr. An unset allowlist makes EVERY caller proceed-and-SIGN — the "excluded" caller would
  get a signature, not a deny.
- **(0b) forge-discard live (P3, RUN-BLOCKING — architect LOW elevated):** on THIS fresh box,
  `SUDO_UID=<ALLOWED_UID> sudo -n -u pact-broker printenv SUDO_UID` returns the REAL ruid, NOT `<ALLOWED_UID>` —
  proving the `env_reset,!setenv` policy discards a forged `SUDO_UID`. Re-run here; do NOT cite `plans/10 §6`.

**Leg-1 — ALLOW + positive-control (hacker HIGH-2 / architect HIGH-1):** from `ALLOWED_UID`, invoke the real
`sudo -n -u pact-broker <wrapper>` presenting a **valid frame body** on stdin (require-frame / gate-0.5 is
default-ON when the wrapper sets a persona-did — a bare `record_id` would FAIL gate-0.5 with empty stdout and
mimic a deny). Expect a **real signature** (base64 on stdout, exit 0). This proves the allowlist value PARSES and
`SUDO_UID` FLOWS — so the leg-2 deny on the SAME allowlist can only be membership-caused.

**Leg-2 — DENY (the load-bearing non-vacuity leg):** from `EXCLUDED_UID`, SAME allowlist `{ALLOWED_UID}`, SAME
real `sudo` path → expect **DENY**: empty stdout, exit 1, stderr exactly `caller not authorized` (the gate-0
message — NOT gate-0.5 `request not authorized`, NOT a key/wiring error, NOT a `DISABLED` notice). **Record the
live allowlist value AND the observed `SUDO_UID` together** so the exclusion is PROVEN, not assumed.
- **key-never-opened (architect HIGH-2 — state honestly, do not hand-wave):** the deny precludes a key open by
  ORDERING — gate-0 `fail()`/`exit(1)` at `broker-sign.js:88` runs BEFORE `openSync(keyFile)` at `:126`. Record
  this as **source-ordering-precluded (confirmed by read)**, OR upgrade to OBSERVED via
  `sudo fs_usage -f filesys` on the broker pid asserting ZERO `open()` on the key path. Pick one; do not assert
  "key never opened" as a live finding if only the ordering was read.

**Leg-3 — FORGE-RESIST:** from `EXCLUDED_UID`, `SUDO_UID=<ALLOWED_UID> sudo -n -u pact-broker <wrapper>` → expect
**STILL DENY** (the real ruid `EXCLUDED_UID` wins; sudo re-derives it). **Forge to an ALLOWLISTED value while the
REAL ruid is EXCLUDED** — forging to your OWN uid proves nothing (vacuous).

## §1.5 DoD gates (every box must be checkable from recorded evidence)

- [ ] Two distinct real OS uids provisioned (`ALLOWED_UID` + `EXCLUDED_UID`); leg-2 ran from `EXCLUDED_UID`'s real
      `SUDO_UID`, recorded alongside the live allowlist value (exclusion proven, not assumed).
- [ ] Leg-1 ALLOW ran on the IDENTICAL allowlist value as leg-2 and returned a REAL signature (the positive-control
      — proves the deny is membership-caused, not malformed/absent/disabled).
- [ ] Leg-0a: no `caller-auth DISABLED` notice on any leg (allowlist configured for the run).
- [ ] Leg-0b / P3: forge-discard re-probed live on THIS box (RUN-BLOCKING).
- [ ] Every leg's stderr captured; leg-2 deny is the gate-0 `caller not authorized`, distinguished from gate-0.5
      `request not authorized` and from a key error.
- [ ] key-never-opened recorded as source-ordering-precluded OR `fs_usage`-observed (state which).
- [ ] Leg-3 forged `SUDO_UID=<ALLOWED_UID>` while real ruid = `EXCLUDED_UID` → still deny.
- [ ] §8 audited-scope statement written, calibrated to the deny-leg evidence actually recorded (NS-9).

## §2 Deployment (USER runs the sudo/system-config; I provide commands + verify the OUTPUT)

The R1 broker was torn down this session → a fresh separate-uid deployment is needed. **HARD requirement:** two
distinct sudo-invocable OS uids (`ALLOWED_UID`, `EXCLUDED_UID`) — a single-uid box CANNOT run the non-vacuous deny
leg. Provision both (e.g. two `sysadminctl -addUser` test uids, or one broker uid + one extra caller uid).

- Broker uid (e.g. `pact-broker`, uid 600) owns the `0600` key; the root-owned wrapper exports
  `PACT_BROKER_ALLOWED_UIDS=<ALLOWED_UID>` (allowlist broker-side, host-untamperable) and a persona-did (so
  require-frame is ON — the realistic config; leg-1 then presents a frame body). Reuse the runbook
  `docs/deployment/cross-uid-broker.md` for the PACT wrapper.
- sudoers with `env_reset, !setenv` (leg-0b / leg-3 depend on it).

**Cross-substrate (§7) — reconcile with the toolkit's `scripts/loom-broker-deploy-macos.sh` (#413) FIRST, but
borrow the HARDENING not the semantics:** take its interpreter-swap gate (the ancestor-walk + root-owned-node
refusal — a CodeRabbit-CRITICAL fix) and apply it to the PACT wrapper; do NOT inherit loom's env-var names or
allowlist semantics (PACT uses `PACT_BROKER_ALLOWED_UIDS` / `SUDO_UID` — verify each adapted line against
`caller-auth.js`, not the loom analog). (The exact `sysadminctl` / sudoers / wrapper commands are mine to supply
tailored to your two chosen uids + key path once you confirm the shape; I verify each leg's output.)

## §3 The dogfood procedure (per leg — capture stdout AND stderr as evidence, R1-style)

Run each leg through the real `sudo -n -u pact-broker <wrapper>` path and record stdout + stderr + exit code:
- **Leg-0a:** confirm leg-1 (below) emits no `caller-auth DISABLED`. **Leg-0b:** the forge-discard probe (§1).
- **Leg-1 (allow):** from `ALLOWED_UID`, frame body on stdin → base64 sig + exit 0. Evidence: the sig + the absence
  of any `DISABLED` / `request not authorized` notice.
- **Leg-2 (deny — non-vacuity):** from `EXCLUDED_UID`, SAME allowlist → empty stdout, exit 1, stderr
  `caller not authorized`. Evidence: that exact line + no sig + the (allowlist value, observed `SUDO_UID`) pair +
  the key-never-opened record (ordering or `fs_usage`).
- **Leg-3 (forge):** from `EXCLUDED_UID` with `SUDO_UID=<ALLOWED_UID>` → still `caller not authorized`. Evidence:
  the deny line under the forged env.

## §4 Runtime probes (firsthand — re-confirm before trusting)

- **P1** `caller-auth.js:73-81` — allowlist-set + `SUDO_UID` parses + member ⇒ allow; else deny; unset ⇒ disabled.
  CONFIRMED (read this session).
- **P2** `caller-auth.js` is gate-0 in `broker-sign.js:87-88` BEFORE the key open at `:126`. CONFIRMED (VERIFY board read).
- **P2.5 (VERIFY architect HIGH-1)** require-frame / gate-0.5 (`authorizeRequest`, `broker-sign.js:98-104`) is
  default-ON when the wrapper sets a persona-did (`request-auth.js:50-53`) — runs AFTER gate-0, BEFORE key open. A
  bare `record_id` on the allow leg fails it with empty stdout (mimics a deny). Leg-1 presents a frame body; every
  leg captures stderr to distinguish gate-0 `caller not authorized` from gate-0.5 `request not authorized`.
- **P2.6 (VERIFY hacker HIGH-2)** `broker-sign.js:88` emits a FIXED `caller not authorized` for ALL deny causes
  (discards `auth.reason`) — KEEP that (anti-oracle). Membership-causation is established by the leg-1
  positive-control on the identical allowlist, NOT by reading the reason off the wire.
- **P3 (load-bearing, RUN-BLOCKING — leg-0b)** under `env_reset,!setenv` a host-forged `SUDO_UID` is discarded +
  re-derived from ruid (leg-3's whole basis). RE-PROBE LIVE on THIS box; a deploy-policy drift silently voids leg-3.
- **P4** the live R1 box is GONE (torn down this session) — fresh deploy; the R1 broker was a pre-R2-WHAT snapshot.

## §5 Honest residuals (carry loud — §0 + into §8 at close)

R2-WHAT (per-request entitlement) OPEN · R3 (forgery) UNTOUCHED · same-uid allowlisted compromise = still an
oracle · heap-read narrowed-not-closed (Linux `ptrace_scope=2` is the strongest form; macOS 2e PARTIAL) · the
allowlist VALUE's provenance (not just the wrapper file's integrity) is the trust anchor (NS-2, promoted to §0).

## §6 VERIFY / VALIDATE plan

- **VERIFY (pre-deploy, 2-lens) — COMPLETE, folded (§8).**
- **VALIDATE (post-dogfood, honesty lens):** grade the §8 result against the legs ACTUALLY observed — was the deny
  leg run against a REAL distinct excluded uid (non-vacuous), with the leg-1 positive-control on the identical
  allowlist, and stderr disambiguating gate-0 from gate-0.5/disabled? (R1's VALIDATE caught a "2e fully-discharged"
  over-claim — expect the same scrutiny.) NS-9: "narrowed" never reported as "closed."

## §7 Cross-substrate sync (toolkit ↔ PACT — standing directive)

R2 caller-auth is a **shared concern, round-tripping**: the toolkit's `egress/loom-broker-caller-auth.js` +
`scripts/loom-broker-deploy-macos.sh` (#413) were derived FROM PACT's broker. **Borrow the HARDENING** (the
interpreter-swap ancestor-walk + root-owned-node refusal — a CodeRabbit-CRITICAL the loom helper already fixed),
**NOT the semantics** (env-var names / allowlist format are PACT-specific — `PACT_BROKER_ALLOWED_UIDS` / `SUDO_UID`;
verify each adapted line against `caller-auth.js`, reconcile at point-of-use per the directive's own "don't assert
from filename" rule). Feed any PACT R2-dogfood learnings back. Memory: `pact-toolkit-cross-substrate-sync`.

## §8 VERIFY board result — RECORDED 2026-06-23 (hacker + architect; workflow `wf_ab375986`; all folded above)

2-lens board. **hacker NEEDS-REVISION → resolved**; **architect SOUND-WITH-CHANGES**. The convergent theme: the
original plan had FOUR vacuity traps (the deny leg passing for the wrong reason) — the exact failure the dogfood
exists to avoid (the R1 §2b / decoy-key class recurring). The guard's PARSER was confirmed SOUND (no excluded uid
flips to allow across overflow / sentinel / padding / leading-zero / type — `plans/10 §10` hardening holds); every
flaw was in the dogfood DESIGN, all fixed by plan-level gates (no code change).

- **hacker HIGH-1 (single-uid allowlist-flip vacuity) — FOLDED §1/§2.** Escape hatch DELETED; two distinct real
  uids REQUIRED; leg-3 forbids forge-to-own-uid.
- **hacker HIGH-2 (deny-reason collapse — fixed `caller not authorized` for all causes) — FOLDED §1 leg-1/P2.6.**
  Positive-control: leg-1 allow on the IDENTICAL allowlist proves the deny is membership-caused; keep the broker
  not echoing the reason (anti-oracle).
- **hacker MED + architect MED (disabled-as-pass) — FOLDED §1 leg-0a / §1.5.** Assert no `DISABLED` notice before leg-2.
- **architect HIGH-1 (require-frame gate-0.5 default-ON mimics a deny on the allow leg) — FOLDED §1 leg-1 / P2.5.**
  Present a frame body; capture stderr per leg to distinguish gate-0 from gate-0.5.
- **architect HIGH-2 (key-never-opened hand-waved) — FOLDED §1 leg-2.** State source-ordering-precluded OR observe
  via `fs_usage`; do not assert as a live finding from a source read alone.
- **architect MED (two-uid = hard gate not a design point) — FOLDED §1/§2.** Promoted to a precondition + DoD checkbox.
- **architect LOW (allowlist-VALUE-provenance) — FOLDED to §0.** **architect LOW (P3 run-blocking) — FOLDED §1 leg-0b/§4.**
  **architect LOW (cross-substrate borrow-hardening-not-semantics) — FOLDED §2/§7.**
- **hacker LOW (parser sound) — kept as the §4 P1 + VALIDATE re-confirmation (not where the risk lives).**

## §9 Dogfood RESULT — RECORDED 2026-06-23 (LIVE on the user's MacBookAir; the SECOND world-anchored signal)

**Deployment shape:** broker `pact-broker` (uid 600, key `/etc/pact/broker.key` owner pact-broker `0600`) ·
`ALLOWED_UID=501` (the host user) · `EXCLUDED_UID=602` (`pact-caller-excluded`, a freshly-provisioned real uid) ·
node `/usr/local/bin/node` (root:wheel, host-non-writable — the NVM/Homebrew nodes were owner-writable = swap-unsafe) ·
code `/opt/pact/v0` (root:wheel, `go-w`) · sudoers `env_reset, !setenv` pinned on the wrapper. **HEX-ONLY**
(no persona-did → require-frame OFF) — the architect's option (b), chosen to ISOLATE the R2-WHO axis under test
(R2-WHAT is a separate, out-of-scope axis here; the broker's `per-request-auth DISABLED` notice is expected).

**Custody re-confirmed (R1, live):** `cat /etc/pact/broker.key` → `Permission denied` (host uid 501 cannot read
the key owned by uid 600). Not the claim of this wave, but a free re-anchor of R1 on the fresh deploy.

**The three legs (actual output):**
- **Leg-1 ALLOW (positive-control):** uid 501, allowlist `{501}` → base64 sig
  `qSAEXIzynPRPiT92QtblHvla6FORcQAebFj2X1bUr0MlgB9rj3EVY3y0YL1PpEVx3chWl82Us85lfM1HvGPiCw==`, `exit=0`; stderr
  `per-request-auth DISABLED` (expected) with **NO** `caller-auth DISABLED` → the allowlist IS configured (leg-0a)
  AND `SUDO_UID` flowed AND `{501}` parsed. The deny below is therefore provably MEMBERSHIP-caused.
- **Leg-2 DENY (the load-bearing non-vacuity leg):** uid 602 (a real, distinct, sudo-invocable uid), SAME
  allowlist `{501}`, real `sudo -u pact-caller-excluded -- sudo -n -u pact-broker <wrapper>` path → empty stdout,
  `exit=1`, stderr exactly `broker-sign: caller not authorized`. A real excluded OS uid was DENIED at the live
  cross-uid boundary, on the identical allowlist that leg-1 just signed under. **Non-vacuous.**
- **Leg-3 FORGE-RESIST:** uid 602 forging `SUDO_UID=501` (an allowlisted value) → STILL
  `broker-sign: caller not authorized`, `exit=1`. The `env_reset,!setenv` policy discarded the forged env and sudo
  re-derived the real ruid 602. **Discriminating power is CONTINGENT on the leg-1 positive control** (VALIDATE
  honesty Finding 3): had the forged `SUDO_UID=501` taken effect, the result would have FLIPPED to a signature
  (we KNOW 501 signs, from leg-1) — it did not flip, so the forge was discarded. **The direct `printenv SUDO_UID`
  probe (leg-0b) is BLOCKED by the correctly-restrictive sudoers** (`pact-caller-excluded` may run ONLY the
  wrapper as pact-broker, never `printenv`) — so leg-3's flip-counterfactual is the AVAILABLE forge-discard proof,
  NOT a standalone `env_reset` isolation. Honest residual: leg-3 proves the forge is discarded but does not, by
  itself, isolate `env_reset,!setenv` from some other env-handling quirk (a direct probe would require temporarily
  broadening the sudoers — a deviation declined to keep the gate tight).
- **key-never-opened:** source-ordering-precluded — gate-0 `fail()`/`exit(1)` at `broker-sign.js:88` runs BEFORE
  `openSync(keyFile)` at `:126` (confirmed by read; NOT separately observed via `fs_usage` — stated honestly).

**Benign note:** every leg emitted `shell-init: getcwd: ... Permission denied` — pact-broker/602 cannot stat the
host's `700` cwd when sudo switches uid; it does not touch the broker logic (the correct sig/deny outputs prove it).

**AUDITED SCOPE (calibrated — NS-9, "narrowed" never "closed"):** **R2 caller-auth HARDENED — WHO-at-the-boundary,
deny-leg-OBSERVED against a real distinct excluded uid, uid-level, ONE box, ONE run.** Still OPEN (loud): R2-WHAT
(per-request entitlement — deliberately off here), R3 (forgery), same-uid allowlisted compromise (still an oracle),
the heap-read leg (macOS 2e PARTIAL; Linux `ptrace_scope=2` is the strongest form), and the allowlist-VALUE
provenance (the dogfood enforces whatever literal is set; it does not verify `501` is the INTENDED policy). All
SHADOW — nothing gates an action.

**DoD (§1.5):** two distinct real uids ✅ · leg-1 positive-control on the identical allowlist ✅ · no `DISABLED`
notice ✅ · forge-discard observed via leg-3 ✅ · per-leg stderr disambiguated (gate-0 `caller not authorized`, not
gate-0.5 `request not authorized`) ✅ · key-never-opened = source-ordering-precluded ✅ · audited-scope written ✅.

**VALIDATE (honesty lens) — GRADE A / NO-OVERCLAIM (`honesty-auditor`, agentId `a64ee184fe6ec4b9f`).** The
AUDITED SCOPE is calibrated to exactly what the three legs prove (the R1 "2e fully-discharged" over-claim trap was
AVOIDED — the heap-read leg is carried as PARTIAL, not discharged). The deny is provably membership-caused via the
leg-1 positive-control on the identical allowlist (NOT by reading the wire — `broker-sign.js:88` collapses all deny
reasons to one fixed message). All five residuals carried loud (NS-9 satisfied). key-never-opened honestly stated
as source-read, NOT `fs_usage`-observed. 7.5/8 DoD gates fully met — the half is the leg-0b forge-discard being
SUBSUMED into leg-3 (named, not silently claimed) because the direct probe is sudoers-blocked (folded above). No
rater-drift pre→post run. Verdict: "the model of what NS-9 asks for — narrowed reported as narrowed, observed as
observed, inferred as inferred."
