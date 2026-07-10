---
lifecycle: persistent
plan: 49
issue: 78
finding: F2
severity: high
lens: offensive-security
---

# plans/49 — F2: frame broker is a default-open K_broker signing oracle (WHO gate)

## Problem (premise-probed at source)

The frame broker's WHO gate (`caller-auth.js authorizeCaller`) returns `{decision:'disabled'}` when
`PACT_BROKER_ALLOWED_UIDS` is unset (the default), and `broker-core.js runBroker` (:97-100) **proceeds**
past a `disabled` decision (only a stderr notice). So any host uid that sudo permits to invoke the wrapper
can obtain a K_broker signature. In LEGACY mode (persona unset → require-frame OFF) the WHAT gate also
passes through, so the caller gets a signature over an **arbitrary caller-supplied 64-hex** — a blind
signing oracle. Issue #78 (HIGH, deployment). The sigma-root broker inverts this correctly (require-binding
is mandatory-default-ON + typo-fails-closed, `binding-request-auth.js:53-58`); the frame WHO gate does not.

## Runtime Probes — BOTH of the issue's suggested markers are WRONG

The issue's Fix says: fail closed "once a deployment marker is observed (persona set, or the key file present)".
Probed at source — neither works:

- Probe: `request-auth.js:43-47 resolveRequireFrame = parseEnabledFlag(flag) ?? personaPresent`. The **blind-oracle
  danger is the LEGACY case (persona UNSET)** — there the WHAT gate signs the argv hex verbatim. So keying the WHO
  gate on **persona-present MISSES the exact scenario #78 is about** (persona unset → marker never fires → oracle
  stays open).
- Probe: `broker-core.js:128-129` — `PACT_BROKER_KEY_FILE` is REQUIRED for the broker to sign at all (unset →
  `fail(keyFileEnv + ' is required')`). So **key-file-present fires for EVERY functioning broker**, including
  same-uid dev and legacy-off deployments → keying on it makes the `disabled` path unreachable → **bricks dev**.
- Probe: `caller-auth.js:11-15` + `broker-core.js:91-95` — `SUDO_UID` is sudo-injected from the REAL invoking uid;
  under the deployed `env_reset,!setenv` policy a host-forged value is discarded + overwritten from ruid
  (LIVE-PROBED per the header). It is **PRESENT on a cross-uid sudo invocation and ABSENT on a same-uid direct
  `node broker-sign.js` call** (dev).

**Conclusion (pre-VERIFY hypothesis; SUPERSEDED by the VERIFY result below):** the correct marker is
**`SUDO_UID`-present** — it fires exactly for the dangerous case (a cross-uid caller, including legacy-persona-unset)
and is absent for same-uid dev. It closes the blind oracle without bricking dev. `SUDO_UID` is expected to be
non-forgeable + non-suppressible *only under the documented sudoers policy* (`env_reset,!setenv` + the
wrapper-only `Defaults!<wrapper>` restriction), which this code cannot verify — so the VERIFY board demoted it to a
**safety net** and made the broker-side flag the primary anchor. Forgery was live-probed (§4); suppression was NOT.

## Design (mirror the sigma-root asymmetric default; marker = SUDO_UID)

A tri-state operator override + the per-request SUDO_UID marker.

`resolveRequireCaller(flagRaw)` (new, `caller-auth.js`; read the flag ONCE in the entrypoint per the
single-arming-source discipline). Returns `true | false | null`:
- strict `'1'` → `true` (force require); strict `'0'` → `false` (explicit opt-out, legacy even under sudo);
- a PRESENT-but-non-strict token (a typo like `'ture'`) → `true` (typo-fails-closed, via `isDeploySignalSet`);
- genuinely unset → `null` (AUTO — the SUDO_UID marker decides per-request).

`authorizeCaller({ sudoUid, allowlistRaw, requireCaller })` — on an UNSET allowlist:
```js
if (!al.configured) {
  if (opts.requireCaller === true)  return deny('allowlist-unset-but-required');       // forced ON
  if (opts.requireCaller === false) return disabled('allowlist-unset-opted-out');      // forced OFF (strict '0')
  // AUTO: a cross-uid caller (SUDO_UID present) with no allowlist is the default-open oracle -> fail CLOSED.
  const crossUid = typeof opts.sudoUid === 'string' && opts.sudoUid.trim().length > 0;
  return crossUid ? deny('allowlist-unset-but-deployed') : disabled('allowlist-unset'); // same-uid dev -> legacy
}
```
`broker-core.js runBroker` threads `requireCaller` into `authorizeCaller` (it already reads `SUDO_UID` at :95);
`deny` already fails closed (:96). `broker-sign.js` reads `PACT_BROKER_REQUIRE_CALLER` ONCE + `assessEnableFlag`
(observability) + `resolveRequireCaller`, threads `requireCaller` (mirrors the sigma-root entrypoint).

## OPEN QUESTIONS for the VERIFY board (3-lens security)

1. **Marker = SUDO_UID-present** — confirm it is the right + non-bypassable marker (vs the two flawed issue
   suggestions). Any deployed cross-uid path where SUDO_UID is legitimately absent (a systemd unit / setuid
   wrapper / a non-sudo privilege drop)? If so, SUDO_UID-present would leave THAT path open — is that a residual
   to disclose, or does it need a different signal?
2. **SUDO_UID tamperability** — can an attacker SUPPRESS SUDO_UID (empty it) to force the AUTO→disabled path on a
   deployed box? The header says `env_reset,!setenv` overwrites it from ruid — but is that guaranteed by the
   runbook's sudoers, and what if the operator's sudoers omits it? (A suppressible marker fails OPEN — the worst
   case.) Should a present-but-EMPTY SUDO_UID under a deploy context fail closed?
3. **Tri-state + typo-fails-closed** — is `'1'→on / '0'→off / typo→on / unset→auto` correct? Does `'false'→auto`
   (not off, since only strict `'0'` disables — the asymmetric-flag rule) surprise an operator?
4. **Scope: frame-only or also sigma-root?** `authorizeCaller` is SHARED (broker-core calls it for both). If I
   thread `requireCaller` only from `broker-sign.js`, the sigma-root WHO gate keeps the old `disabled` behavior
   (its WHAT gate compensates). Should the sigma-root entrypoint ALSO thread `PACT_ROOT_REQUIRE_CALLER` for
   consistency, or is that scope creep beyond #78?
5. **Fail message** — AUTO→deny uses the fixed no-echo `'caller not authorized'` (an echo is an allowlist-probing
   oracle). Confirm no new reason string leaks the allowlist state.

## RED test list

`caller-auth.js` unit (`resolveRequireCaller`):
- `'1'`→true; `'0'`→false; `'ture'`/`'yes'`→true (typo-fails-closed); unset/`undefined`→null; `'false'`→null (auto).

`caller-auth.js` unit (`authorizeCaller`, unset allowlist):
- `requireCaller:true` → deny; `requireCaller:false` → disabled; `requireCaller:null` + SUDO_UID present → deny;
  `requireCaller:null` + SUDO_UID absent/empty → disabled. (allowlist SET path unchanged — regression.)

`broker.test.js` integration (real wrapper, if feasible):
- a cross-uid (SUDO_UID set) broker with NO allowlist + NO flag → the WHO gate DENIES (refuses to sign) — the
  blind-oracle scenario now fails closed.
- a same-uid (no SUDO_UID) invocation with no allowlist → still `disabled` (dev/legacy proceeds).
- an explicit `PACT_BROKER_REQUIRE_CALLER=0` under sudo → `disabled` (operator opt-out honored).

## HETS Spawn Plan (Rule 2 — security/auth diff → full 3-lens)

- **VERIFY board (read-only):** `architect` (marker-choice soundness, the tri-state design, scope Q4, mirror
  fidelity to sigma-root) + `hacker` (adversarial: SUDO_UID suppression/forgery, the AUTO-path bypass, a
  non-sudo deploy path, the fail-message oracle). Parallel.
- **VALIDATE board (post-build, 3-lens):** `code-reviewer` (correctness/edge) + `hacker` (LIVE re-probe the BUILT
  gate — construct a cross-uid-shaped call with no allowlist and confirm deny; Rule 2a) + `honesty-auditor`
  (NS-9 residual wording — the non-sudo-deploy residual from Q1 must be disclosed, not over-claimed).
- **pre-PR:** `coderabbit review --plain --base main`.

## VERIFY board result (architect + hacker — architect `sound-with-changes`, hacker `needs-revision`; converged)

Three HIGHs, all folded. The reframe below is load-bearing.

- **HIGH — shared-gate bug.** `authorizeCaller` is called for BOTH brokers (`broker-core.js:95`). The sigma-root
  threads no `requireCaller` (→ `undefined`); my AUTO branch would treat `undefined` like `null` and start DENYING
  cross-uid sigma-root callers → silently bricks a WHAT-gate-only root deploy. **Fix: gate the AUTO-deny STRICTLY on
  `requireCaller === null`.** `undefined` (sigma-root, not-threaded) → legacy `disabled`, byte-unchanged + a
  regression test. Sigma-root WHO opt-in is a SEPARATE change — filed as #106.
- **HIGH — empty/whitespace SUDO_UID fails OPEN.** `sudoUid.trim().length>0` is false for `''`/`' '`/NBSP →
  `disabled` → signs. A correct `env_reset,!setenv` sudo NEVER yields an empty SUDO_UID, so a present-but-empty
  value is a tamper/anomaly. **Fix: the AUTO marker = the SUDO_UID env var is PRESENT in ANY form
  (`typeof sudoUid === 'string'`) → fail CLOSED; only genuine ABSENCE (`undefined`, no sudo ran) is dev → disabled.**
  No trim → sidesteps the String.trim()-strips-NBSP-vs-ASCII inconsistency the sibling gates avoid.
- **HIGH — non-sudo deploys + HONEST REFRAME.** setuid-wrapper / systemd / daemon privilege-drop inject no
  SUDO_UID → AUTO → disabled → OPEN on a genuinely uid-separated box. The faithful mirror of sigma-root's
  BROKER-SIDE `controllerPresent` (host-unsuppressable, set in the root-owned wrapper) is the **broker-side flag
  `PACT_BROKER_REQUIRE_CALLER=1` — the PRIMARY anchor**; `SUDO_UID`-auto is an ADDITIONAL per-request SAFETY NET,
  not the guarantee. The runbook MUST mandate the flag for every deploy (esp. non-sudo). Do NOT over-claim
  "untamperable": forgery was live-probed (`cross-uid-broker.md:126`, 999999→501) but SUPPRESSION
  (`env -u SUDO_UID`) was NOT — disclose that AUTO's integrity rests on the (in-code-unverifiable) sudoers policy.

Folded MEDIUM/LOW: use ASCII/presence semantics not `String.trim()` (NBSP); `assessEnableFlag('PACT_BROKER_REQUIRE_CALLER', raw)` for the typo→misconfig-alert (mirrors `broker-sign.js:48`); document `only strict '0' disables` (`false`/`no`/`off`→auto). No deny-message leak (the fixed `'caller not authorized'` never echoes the new reasons) — keep it; reword the disabled-notice so `R2-WHO open` is not asserted on a deny path. Runbook: add the `env -u SUDO_UID` suppression probe to the deploy verification.

## Finalized design (supersedes §Design)

`resolveRequireCaller(flagRaw)` (`caller-auth.js`, read once in `broker-sign.js`): `parseEnabledFlag` `'1'`→true /
`'0'`→false; else `isDeploySignalSet(flagRaw)` (typo like `'ture'`) → true; else `null` (auto).

`authorizeCaller({ sudoUid, allowlistRaw, requireCaller })` — on an UNSET allowlist:
```js
const rc = opts.requireCaller;
if (rc === true)  return deny('allowlist-unset-but-required');            // flag forced ON  (primary anchor)
if (rc === false) return disabled('allowlist-unset-opted-out');          // flag forced OFF (strict '0')
if (rc === null && typeof opts.sudoUid === 'string')                      // AUTO (frame): SUDO_UID present in
  return deny('allowlist-unset-but-deployed');                           //   ANY form -> fail closed (safety net)
return disabled('allowlist-unset');   // rc===undefined (sigma-root, legacy) OR rc===null + SUDO_UID absent (dev)
```
`broker-core.js runBroker` gains a `requireCaller` param, threaded into `authorizeCaller`. `broker-sign.js` reads
`PACT_BROKER_REQUIRE_CALLER` once + `assessEnableFlag` + `resolveRequireCaller` + threads it. `sigma-root-broker.js`
UNCHANGED (threads nothing → `undefined` → legacy). Runbook (`docs/deployment/cross-uid-broker.md`): mandate
`PACT_BROKER_REQUIRE_CALLER=1` as the authoritative deploy signal + the suppression probe + honest-scope note.

## RED test list (revised)

`resolveRequireCaller`: `'1'`→true, `'0'`→false, `'ture'`/`'yes'`→true, unset→null, `'false'`→null.
`authorizeCaller` (unset allowlist): `true`→deny · `false`→disabled · `null`+SUDO_UID`'501'`→deny · `null`+SUDO_UID
`''`/`' '`/NBSP→**deny** (present-but-empty fails closed) · `null`+SUDO_UID absent→disabled · **`undefined`→disabled
(sigma-root regression — byte-unchanged)** · allowlist SET path unchanged.
Integration (`caller-auth.test.js`): these spawn `broker-sign.js` **directly** (NOT the shell wrapper, so the
code-level AUTO branch is exercised — the runbook wrapper start-guard is a separate operational layer that would
otherwise preempt the both-unset case). cross-uid (SUDO_UID set) + no allowlist + no flag → DENY (AUTO); same-uid
(no SUDO_UID) → disabled; `PACT_BROKER_REQUIRE_CALLER=0` under sudo → disabled; `=1` same-uid → DENY.

## VALIDATE board result (3-lens: code-reviewer + hacker live-probe + honesty-auditor — all `ship-with-nits`)

The hacker live-probed the full attack matrix and the core #78 fix HELD (a deployed cross-uid unset-allowlist call
could not be made to sign). Folded findings:

- **MEDIUM (reviewer + hacker, converged) — the tri-state failed OPEN on an unrecognized `requireCaller`.** The
  catch-all `disabled` signed for any value not exactly `true/false/null/undefined` (a raw string/number from a
  future miswiring). Not reachable today (resolveRequireCaller only emits those), but the WHO gate's own state
  machine must fail closed (security.md non-bypassable). **Fixed:** explicit `undefined`/`null` arms + a terminal
  `deny('...bad-requirecaller-state')`. Re-probed live: every miswired value now denies.
- **HIGH (reviewer) — no end-to-end sigma-root regression.** Added an integration test spawning the REAL
  sigma-root broker with `SUDO_UID` set + unset `PACT_ROOT_ALLOWED_UIDS` → still signs (legacy disabled), pinning
  the byte-unchanged shared-gate contract.
- **MEDIUM (reviewer) — single-arming-source tripwire** extended to `PACT_BROKER_REQUIRE_CALLER`.
- **MEDIUM (honesty) — stale claims:** `arm-flags.js` header ("`isDeploySignalSet` UNCONSUMED / dormant") is now
  false (F2 consumes it) → updated; runbook Residuals bullet ("Allowlist OMITTED → R2-WHO open") contradicted the
  F2 §3 → reworded.
- **LOW (hacker) — non-sudo residual mitigation:** added a §3 wrapper START-GUARD (refuse to start if neither the
  allowlist nor the flag is set). **LOW (reviewer):** allowlist-SET regression pin + `runBroker` JSDoc. **LOW
  (honesty):** test-header spawn-level clarification + flag-untamperability symmetry note.
- #106 confirmed FILED (the honesty-auditor, read-only, could not see GitHub; the orchestrator filed + verified it).

**Final:** 801/0 full suite (+13 F2 tests), eslint 0, sigma-root 16/0 regression, live-probe confirms the
fail-closed hardening. CodeRabbit below.

## Routing Decision

```json
{ "recommendation": "route", "rationale": "HIGH-severity security fix to the broker WHO auth gate (K_broker signing oracle); Rule 2 mandates the full 3-lens tier; multi-file (caller-auth + broker-core + broker-sign + tests); design-nuanced marker choice with a live-probe-overturned premise." }
```
