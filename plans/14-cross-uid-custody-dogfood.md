---
lifecycle: persistent
created: 2026-06-22
wave: cross-uid custody DOGFOOD (the live run of the plans/09 spike — the first HARDENING move)
status: PLAN (pre-VERIFY) — execution + pass-criteria spec; the CODE already shipped in plans/09
---

# Cross-uid custody dogfood — running the spike for real (HARDENS, not narrows)

> The first move in the whole project that crosses NS-7's line from *narrow* to *harden*. `plans/09` built the
> custody MECHANISM + the verifier + the runbook (all SHADOW, unit-tested via SYNTHETIC facts because a same-uid
> box cannot produce real cross-uid facts). This wave RUNS it against a genuinely separate OS uid so the kernel's
> `EACCES` under a foreign uid — a world-anchored OS fact, out-of-band of PACT's own code — becomes the signal.
> No new production code: the deliverable is the LIVE RUN + the recorded out-of-band attestation.

## §0 Frame — the OQ-NS-6 honesty banner (read first)

Per NS-7, every in-process SHADOW signal PACT has shipped only NARROWS trust. The custody-real hardening is a
**deployment property** (separate uid / enclave / HSM), and the only thing that establishes it is an OS-level
fact the operator attests out-of-band. **This wave does not write code that hardens — it RUNS the deployment and
RECORDS the world-anchored signal.** Until the attestation is real, everything stays SHADOW (NS-8); nothing gates
an action. Per NS-9: a vacuous or same-uid run is NOT a hardening — it is reported as exactly what it is.

## §1 What is already built (plans/09) vs what this wave adds

- **Built + unit-tested (plans/09, SHADOW):** `custody-verify.js` (`assessCustody` pure verdict + `gatherCustodyFacts`
  I/O; C0/C1/C2/C2.5/C3), `broker-launch.js` (`crossUidBrokerSigner` — the validated `sudo -n -u` argv builder),
  and the operator runbook (`docs/deployment/cross-uid-broker.md`, reconciled to the post-R2-WHAT code at `df1344e`).
- **This wave adds (no new production code):** (1) a NEGATIVE-control run that proves the verifier goes RED on a
  same-uid deployment; (2) the REAL cross-uid run; (3) the out-of-band attestation, recorded in §8; (4) a north-star
  §2.6 update IF — and only if — the attestation genuinely lands (NS-9). Any helper for the negative control is a
  throwaway `/tmp` script, not shipped code.

## §2 Execution order (the operator path — runbook §1–§7 condensed)

1. Provision: create `pact-broker` uid (no login/shell); place the persona private key `0600`, owned by
   `pact-broker`, in a `0755` dir (so the host can `lstat` the OWNER — runbook §2's load-bearing detail).
2. Install the root-owned, non-host-writable wrapper (sets the key path broker-side; `PACT_BROKER_PERSONA_DID=did:key:zBroker`);
   add the sudoers entry pinning `env_reset, !setenv`; register the broker PUBLIC key.
3. Run `custody-verify.js --key … --persona did:key:zBroker --broker-user pact-broker --wrapper … --registry …`
   AS THE HOST UID; then the out-of-band `id` / `ls -l <key>` / `cat <key>` attestation; then `--attested-cross-uid`.

The system-config steps (uid, key custody, sudoers) are the OPERATOR's — out of scope for the build. The verdict
interpretation + result recording is in-scope here.

## §3 PASS vs VACUOUS-PASS — the non-vacuity hinge (load-bearing)

A non-vacuous PASS (custody genuinely real) requires ALL of:

- **C2 took the DIFFERENT-OWNER denial leg** — `denialLegTaken === true`: host read DENIED (`EACCES`/`EPERM`)
  **AND** the key file's `lstat` owner uid `!=` the running uid. (`custody-verify.js:80-86`.)
- **C3 `personaMatches`** — the broker produced a signature that verifies as `did:key:zBroker` (a real, usable key
  exists behind the broker, proven WITHOUT the host reading or stat-ing it).
- **C0 not root**, **C1 key present + non-empty**, **C2.5 wrapper not group/world-writable**.
- **`hostObservableChecksPassed: true` AND `requiresOutOfBandUidConfirmation: true`** — the tool refuses to
  self-certify custody; the operator's `id`/`ls -l`/`cat → Permission denied` is what closes it.

A VACUOUS pass (NOT a hardening — must be caught + named, NS-9), each already guarded by the code:

- **Same-uid run** (key owned by the host uid): C2 FAILS — `the host uid CAN read the key` or `owned by the
  running uid — EACCES is from file MODE, not uid separation`. This is the most likely accidental vacuity.
- **Owner-blinded** (`0700` key dir): C2 FAILS fail-closed — `the key OWNER is unreadable … cannot distinguish a
  cross-uid key from its own locked-dir key` (the live-reproduced false-pass that plans/09 closed).
- **Root**: C0 FAILS — root bypasses file perms; uid separation is unobservable.

## §4 The negative control — prove the guard can FAIL (security.md non-vacuity discipline)

Before trusting the real PASS, run the verifier against a SAME-UID deployment (the broker key owned by the host
uid) and CONFIRM C2 goes RED (the `same-uid / over-permissive` or `owned by the running uid` fail). A guard that
has never been seen to fail is theater; this proves the §3 PASS is meaningful, not a tool that always greens. This
is cheap (a `/tmp` key owned by the running uid + a synthetic-facts assertion, or the real verifier pointed at a
same-uid key) and it is a DoD item, not optional.

## §5 Runtime Probes (firsthand — this session, against the repo NOW)

- **P1** C2 denial leg requires a DIFFERENT owner; same-owner mode-000 + owner-unknown both FAIL-closed:
  `custody-verify.js:75-89`. CONFIRMED (read).
- **P2** `crossUidBrokerSigner` is exported + path/username-validated: `broker-launch.js:78`. CONFIRMED (grep).
- **P3** the runbook is reconciled to the post-R2-WHAT code (persona `did:key:zBroker` consistent across §3/§5/§7):
  commit `df1344e` on this branch. CONFIRMED (committed this session).
- **P4** require-frame is default-on gated on `PACT_BROKER_PERSONA_DID` presence; a dropped `REQUIRE_FRAME` fails
  CLOSED: `request-auth.js:50-53`. CONFIRMED (read). So a live run with the persona set exercises custody, not a
  stale-frame error.
- **P5** baseline suite is **230 green** (`npm test`); no code change is expected, so it must STAY 230.
  CONFIRMED (ran this session).
- **P6** C3 is the load-bearing NON-VACUITY + functional proof — a real sign+verify round-trip proving a usable
  key exists WITHOUT the host needing to read or stat it: `custody-verify.js:94-99`. CONFIRMED (read).

## §6 DoD

- [ ] **Negative control GREEN-as-RED:** same-uid run → C2 FAILS (the guard is proven non-vacuous, §4).
- [ ] **Real cross-uid run:** C0/C1/C2(different-owner)/C2.5/C3 PASS; `hostObservableChecksPassed: true`;
      `requiresOutOfBandUidConfirmation: true`.
- [ ] **Out-of-band attestation recorded** (the `id` / `ls -l <key>` / `cat <key> → Permission denied` outputs),
      pasted into §8.
- [ ] **§8 result recorded**; north-star §2.6 updated **only if** the attestation genuinely lands — and worded as
      "custody-real established on <host> on <date>", never a blanket "custody hardened" (NS-9, the close→narrow reflex).
- [ ] **Residuals re-stated unchanged:** R2-WHO / R2-WHAT / R3 are untouched by custody (custody hardens
      NON-EXFILTRATION, not authorization); the process<->uid binding stays the out-of-band attestation, never tool-proven.
- [ ] 230 suite still green (no production-code change).

## §7 VERIFY / VALIDATE plan

**VERIFY (pre-run, 2-lens) — on THIS plan's §3/§4 pass-criteria, BEFORE the operator provisions:** architect (is
the execution order right; is the negative control the correct non-vacuity proof; does the PASS set miss a custody
precondition?) + **hacker** (can the dogfood FALSE-PASS? a custody bypass the §3 criteria miss — a bind-mount, an
ACL, a setgid dir, a `/proc` read, a same-uid race — and is the §4 negative control actually capable of going RED?).
The hacker lens is REQUIRED here: custody is the integrity≠provenance close (the #273 family), security-sensitive.
Fold corrections into §3/§4 before the run.

**VALIDATE (post-run, 1-lens) — honesty-auditor on the recorded §8 result:** does the attestation actually support
a "custody-real" claim, or is it narrowed (e.g. C2 different-owner PASS but the process<->uid bind unattested)?
NS-9 reflex — no "hardened" claim outruns the recorded evidence.

## §8 Dogfood result — TO BE FILLED at the run (skeleton)

```
host / date:
custody-verify output: C0 __ / C1 __ / C2 __ (denialLegTaken: __) / C2.5 __ / C3 __ (personaMatches: __)
  hostObservableChecksPassed: __  requiresOutOfBandUidConfirmation: __
negative control (same-uid): C2 expected FAIL -> observed: __
out-of-band attestation: id=__  ls -l <key> owner=__ (must != host uid)  cat <key> -> __ (must be Permission denied)
verdict (honesty-audited): __ (custody-real established | narrowed-because-__ | vacuous-because-__)
```
