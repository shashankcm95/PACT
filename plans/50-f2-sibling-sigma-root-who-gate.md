---
lifecycle: persistent
plan: 50
issue: 106
finding: F2-sibling
severity: medium
lens: offensive-security
---

# plans/50 — F2-sibling: sigma-root broker WHO gate is also default-open on an unset `PACT_ROOT_ALLOWED_UIDS`

## Problem (premise-probed at source)

The WHO gate `authorizeCaller` (`caller-auth.js`) is SHARED by both brokers via `broker-core.js runBroker`
(:99). The #78 fix threaded `requireCaller` **only from the frame entrypoint** (`broker-sign.js:54-56,63`);
`sigma-root-broker.js` (:51-64) threads nothing → `runBroker` receives `requireCaller: undefined` → `authorizeCaller`
returns `{decision:'disabled'}` on an unset allowlist (`caller-auth.js:107`), and `runBroker` **proceeds** past a
`disabled` (a stderr notice only, :101-104). So a deployed sigma-root broker with an unset `PACT_ROOT_ALLOWED_UIDS`
authorizes any host uid that its sudo wrapper permits to reach K_root.

**Severity — MEDIUM, not HIGH (probed, SCAR-43 — verify the cited invariant):** the issue claims the sigma-root
WHAT gate (`resolveRequireBinding`) is "mandatory-default-ON + typo-fails-closed", so a deployed sigma-root broker
is not a *blind* oracle. Confirmed at `binding-request-auth.js:53-58`: `resolveRequireBinding` returns
`controllerPresent || isDeploySignalSet(flag)` (only a strict `'0'` disables). **Sharpening:** that default-ON holds
only when a controller is configured OR the flag is a deploy-signal. A sigma-root box deployed with a key but **no
controller and no flag** has its WHAT gate OFF (`authorizeBindingRequest` → `disabled`, signs the argv hex blindly)
*and* (today) its WHO gate OFF → a **blind K_root oracle on both axes**. So the WHO-gate fix hardens the
controller-less-misconfig case on both axes; and even in a correctly-configured deploy (controller set) it is NOT
"mere defense-in-depth" (superseded by the VERIFY board): the WHO gate is the SOLE caller-scoping control over the
`#273` mint-under-controller residual — any uid that reaches the broker can mint "K_root authorized MY key as persona
P" within the controller, and the WHAT gate does NOT compensate on the WHO axis.

## Runtime Probes — the issue's proposed fix is a HYPOTHESIS (SCAR-45), and it is partly WRONG

The issue's Fix says: "dual-thread `PACT_ROOT_REQUIRE_CALLER` ... regression-test that an un-threaded call still
maps to `disabled`." Probed at source:

- Probe (plumbing exists): `broker-core.js:80,99` already destructures `requireCaller` and threads it into
  `authorizeCaller`. `caller-auth.js:76-80` `resolveRequireCaller` is exported; the tri-state on an unset allowlist
  (`caller-auth.js:104-119`) is `true→deny` / `false→disabled` / `undefined→disabled` (legacy) / `null→` (SUDO_UID
  present ? deny : disabled) / else→deny (miswiring). The fix is a faithful mirror of `broker-sign.js:54-56,63`. ✓
- Probe (**the proposed test is INVERTED**): the existing #78 regression test `sigma-root-broker.test.js:87-98`
  already pins the un-threaded behavior — it asserts a cross-uid `SUDO_UID='501'` + unset `PACT_ROOT_ALLOWED_UIDS`
  **still SIGNS (status 0), stays "legacy disabled", never denies**. After the fix, that same input resolves
  `requireCaller=null` (AUTO) + SUDO_UID present → `authorizeCaller` returns **`deny` 'allowlist-unset-but-deployed'**
  (`caller-auth.js:108-114`) → the broker `fail`s (status 1, empty stdout). So the fix must **REPLACE** that test,
  not "add a regression test that un-threaded still maps to disabled" — the un-threaded path is exactly what the
  fix threads away from.
- Probe (**the fix REVERSES a deliberate #78 decision**): `sigma-root-broker.test.js:88-91` records the #78 intent —
  "A cross-uid-shaped SUDO_UID must NOT trip the frame AUTO deny here (that would brick a WHAT-gate-only root deploy);
  the WHAT gate (require-binding) still protects it." #106 is therefore a **behavioral reversal**, not trivial wiring:
  a deployed sigma-root box (SUDO_UID present, allowlist unset, `PACT_ROOT_REQUIRE_CALLER` unset) will now fail closed
  unless the operator explicitly sets `PACT_ROOT_REQUIRE_CALLER=0`. This is the crux for the VERIFY board.
- Probe (single-arming tripwire): `sigma-root-broker.test.js:235-241` enumerates
  `['PACT_ROOT_CONTROLLER','PACT_ROOT_REQUIRE_BINDING']` and asserts each is read from `process.env` exactly once.
  Adding `process.env.PACT_ROOT_REQUIRE_CALLER` requires ADDING `'PACT_ROOT_REQUIRE_CALLER'` to that enumeration
  (the frame tripwire `broker.test.js:443` already lists `PACT_BROKER_REQUIRE_CALLER` — mirror it). Not adding it
  leaves the new arm env ungoverned (SCAR-29 class).
- Probe (stale comments to fix): `caller-auth.js:87,107` describe the `undefined` branch as "the sigma-root broker
  (whose mandatory-default-ON WHAT gate compensates) keeps the legacy `disabled`." After #106 the sigma-root broker
  threads `null`/`true`/`false` (never `undefined`), so `undefined` becomes a pure defensive default for an
  un-threaded caller. `caller-auth.test.js:123-128` has the same stale "(sigma-root, not threaded)" label; the test
  itself stays valid (it unit-tests the `undefined` defensive default) — only the label changes.

## Design decision (for the VERIFY board): reverse #78's WHAT-gate-only carve-out

The tension: #78 deliberately kept the sigma-root WHO gate disabled-on-deployed so a "WHAT-gate-only root deploy"
(controller set, no WHO allowlist) is not bricked. #106 argues defense-in-depth: a deployed K_root broker with no
WHO gate is worth failing closed.

**Recommended resolution (mirror the frame broker exactly):** adopt the same asymmetric AUTO default. On a deployed
box (SUDO_UID present) with an unset allowlist and no `PACT_ROOT_REQUIRE_CALLER`, **fail closed**; an operator who
genuinely wants WHAT-gate-only sets `PACT_ROOT_REQUIRE_CALLER=0` (an explicit, named opt-out) or sets the allowlist.
This is safe to change now — everything is SHADOW and no sigma-root broker is armed/deployed yet, so there is no live
"WHAT-gate-only" deploy to brick; aligning the fail-closed posture *before* arming is the point. The broker-side flag
is the primary, host-untamperable anchor; the SUDO_UID marker is a per-request safety net (its integrity rests on the
deployed `env_reset,!setenv` sudoers, uncheckable here — NS-9). **The board adjudicates whether reversing #78's carve-out
is correct.**

## Scope (5 files)

1. `v0/src/identity/sigma-root-broker.js` — import `resolveRequireCaller` from `./caller-auth`; read
   `PACT_ROOT_REQUIRE_CALLER` ONCE; `assessEnableFlag('PACT_ROOT_REQUIRE_CALLER', raw)` (observability); resolve;
   thread `requireCaller` into `runBroker`. Update the header note (R2-WHO no longer unconditionally open on deploy).
2. `v0/src/identity/caller-auth.js` — update the stale `undefined`-branch comments (:87,:107): `undefined` is now the
   defensive default for an un-threaded caller, not "the sigma-root broker's mode". No logic change.
3. `v0/test/integration/sigma-root-broker.test.js` — REPLACE the #78 byte-unchanged regression test (:87-98) with:
   (a) deployed → **deny** (SUDO_UID present, allowlist unset, flag unset → status 1, no sig, no `caller-auth DISABLED`
   notice); (b) same-uid dev preserved (SUDO_UID absent, allowlist unset → still signs, `disabled` notice);
   (c) explicit `PACT_ROOT_REQUIRE_CALLER=1` → deny even without SUDO_UID; (d) explicit `PACT_ROOT_REQUIRE_CALLER=0`
   → opt-out, signs (disabled) even with SUDO_UID; (e) allowlist SET + member → allow. Add `'PACT_ROOT_REQUIRE_CALLER'`
   to the single-arming tripwire (:237). Extend `runBinding` with a `requireCaller` param.
4. `v0/test/integration/caller-auth.test.js` — reword the stale "(sigma-root, not threaded)" label (:123) to
   "un-threaded caller / defensive default". Test body unchanged.
5. `docs/deployment/sigma-root-broker-deploy.md` (+ `sigma-root-deploy.md` if it carries the wrapper) — add
   `PACT_ROOT_REQUIRE_CALLER=1` to the wrapper example + a start-guard mirroring `cross-uid-broker.md:73`; document the
   `=0` opt-out for a WHAT-gate-only deploy. (Read during build to match the existing wrapper shape.)

## Test plan (RED-first)

Rewrite `sigma-root-broker.test.js`'s WHO-gate block FIRST (the new (a)-(e) cases + the tripwire extension) against the
CURRENT impl → expect (a)/(c) RED (still signs), (b)/(d)/(e) already GREEN, tripwire RED (enumeration missing the new
var). Then implement the entrypoint wiring → all GREEN. Non-vacuity: (a) must be provably a DENY (status 1 + empty
stdout + absence of the sign), not a vacuous pass.

## Runtime Probes (claims → verification)

| Claim | Probe | Result |
|---|---|---|
| `runBroker` already threads `requireCaller` | read `broker-core.js:80,99` | ✓ destructured + passed to `authorizeCaller` |
| sigma-root threads nothing today | read `sigma-root-broker.js:51-64` | ✓ no `requireCaller` key → `undefined` |
| the #78 test pins the OPPOSITE of the fix | read `sigma-root-broker.test.js:87-98` | ✓ asserts cross-uid SUDO_UID + unset allowlist → signs/disabled |
| WHAT gate is mandatory-default-ON (severity) | read `binding-request-auth.js:53-58` | ✓ but only when `controllerPresent` OR a deploy-signal |
| tripwire needs the new var | read `sigma-root-broker.test.js:235-241` + `broker.test.js:443` | ✓ frame lists REQUIRE_CALLER; sigma-root must too |

## VERIFY board (architect + hacker, parallel free-text — 2026-07-10)

**Both lenses: PROCEED-WITH-FOLDS.** The core fix is sound; hacker reproduced the pre-fix vuln live (cross-uid
`SUDO_UID=501` + controller set + unset allowlist → K_root signs) and fuzzed the post-fix matrix
(`['1','0','ture','yes','false','no','off','',' 1 ','01','TRUE',undefined]` × `SUDO_UID∈{absent,'501','',' ','garbage','0'}`)
— the ONLY cell that signs under a present SUDO_UID is `flag='0'` (the intentional opt-out); the miswiring `deny`
branch is unreachable from `resolveRequireCaller` (returns only true/false/null). The reversal of #78's carve-out is
adjudicated CORRECT (architect): the carve-out was a deferred-scope decision per plans/49 Q4, not a load-bearing
invariant; K_root is *more* sensitive than K_broker, so the weaker fail-open default on the higher-value oracle is
incoherent; and (critically) the WHAT gate does NOT compensate on the WHO axis — per the #273 residual, any uid that
reaches the broker can mint "K_root authorized MY key as persona P" within the controller, so the WHO gate is the
SOLE caller-scoping control over that surface (credit this in the finding, not "mere defense-in-depth").

### Folds to apply before build

1. **[MUST-FIX, scope gap] Add `broker-core.js`** — update the stale "sigma-root: undefined → legacy" claims at
   `broker-core.js:70-71` (JSDoc `requireCaller`) + `:97` (inline). The shared core is the stalest surface and was
   omitted from the 5-file scope. Scope is now **6 files**.
2. **[FOLD] `undefined` branch — KEEP + tripwire + header note** (the board's sanctioned alternative to collapsing the
   shared gate's state machine, which is out of #106's scope). After #106 no production caller passes `undefined`; it
   becomes a defensive-default-only for an un-threaded future caller. Update the stale semantics comments
   (`caller-auth.js:85-88,:107`) to name it as such; add a source-grep assertion that `sigma-root-broker.js` threads
   `requireCaller` (guards the fix from a future drop, mirroring the single-arming tripwire's grep shape). Do NOT leave
   it a bare fail-open guarded only by a comment.
3. **[FOLD, non-vacuity — CONVERGENT architect#3 + hacker M1] Test (a) must POSITIVELY assert the WHO denier:**
   `assert.match(stderr, /caller not authorized/)` (broker-core.js:100) + status 1 + empty stdout + absence of
   `caller-auth DISABLED`. Keep the controller SET so it is a clean one-variable diff (sign→deny) vs the replaced
   #78 test, and pair with the differential (byte-identical request, SUDO_UID ABSENT → signs) so the deny is provably
   the WHO gate on the SUDO_UID axis, not an incidental WHAT/key-vet deny.
4. **[FOLD] Test (d)** (`PACT_ROOT_REQUIRE_CALLER=0` opt-out signs) must present a VALID binding body + controller and
   verify the sig under `ROOT.publicKeyPem` — else `requireBinding` (ON via controllerPresent) refuses on the WHAT gate
   and the "signs" is a false artifact.
5. **[FOLD, deploy doc — CONVERGENT architect#7 + hacker H1, the top item] MANDATORY WHO start-guard** for K_root (not
   "Recommended" as the frame's belt-and-suspenders is): mirror the existing MANDATORY WHAT guard at
   `sigma-root-broker-deploy.md:100-112` —
   `[ -n "$PACT_ROOT_ALLOWED_UIDS" ] || [ -n "$PACT_ROOT_REQUIRE_CALLER" ] || { echo ...; exit 78; }`. For the trust
   root the doc-only mitigation of the non-sudo residual is the weakest link, so the guard must be mandatory.
6. **[FOLD, deploy doc — CONVERGENT architect#7 + hacker M2] `=0` warning**: on K_root, `PACT_ROOT_REQUIRE_CALLER=0`
   disables WHO for ALL sudo-permitted callers — a trust-root defense-in-depth hole; warn louder than the frame's `=0`.
7. **[FOLD, deploy doc + entrypoint comment] Name the non-sudo WHO residual + the WHO/WHAT deploy-signal asymmetry**
   (architect#8, hacker H1): the WHAT gate keys deploy on `controllerPresent`; the WHO gate (faithful frame mirror)
   keys on `SUDO_UID` + the explicit flag only. So a non-sudo, controller-set, no-flag root deploy has WHAT ON but WHO
   OFF; `PACT_ROOT_REQUIRE_CALLER=1` in the wrapper is the load-bearing mitigation. State it in the entrypoint F2
   comment (mirror `broker-sign.js:50-53`) and the doc.
8. **[FOLD, deploy doc] Migration note** (hacker L2): an existing WHAT-gate-only sudo config must add the allowlist or
   set `=0` before this ships (SHADOW-tolerable today — nothing armed — but call it out).
9. **[FOLD] `caller-auth.test.js:124-126`** — reword the stale in-test comment ("sigma-root ... threads no
   requireCaller"), not just the :123 label.
10. **[CONFIRM] Single-arming tripwire** (`sigma-root-broker.test.js:237`): add `'PACT_ROOT_REQUIRE_CALLER'`, mirror
    `broker.test.js:443`. Load-bearing (un-added → the new arm env is ungoverned, SCAR-29 class).

**Scope after folds: 6 files** (+`broker-core.js`). Severity stays MEDIUM (architect: "would not block on severity"),
with the finding crediting the WHO gate as the sole caller-scoping control over the #273 residual.

## VALIDATE result (code-reviewer + hacker live-reprobe + honesty-auditor, 3-lens — 2026-07-10)

**All three lenses cleared it.** code-reviewer **PASS-WITH-NITS**; hacker **PROCEED** (91-cell live fuzz matrix on the
BUILT binary — 13 flag tokens × 7 SUDO_UID values, expanding the VERIFY 12×6 set — + 11 bypass + 6
interaction/non-vacuity probes → ZERO fail-open cells; pre-fix vuln reproduced-then-closed;
case-(a) deny proven non-vacuous via a valid-WHO/broken-WHAT differential message); honesty-auditor **PASS-WITH-NOTES,
grade A** (all 10 VERIFY folds independently VERIFIED applied; non-vacuity of (a)+(d) hand-traced; no #273 over-claim).

### Post-VALIDATE folds applied

- **[code-reviewer L1] Shell WHO start-guard whitespace fidelity** — `PACT_ROOT_REQUIRE_CALLER=" "` passed the `-n`
  guard (broker STARTs) but `resolveRequireCaller(" ")` → AUTO (not armed), a false-assurance blind-oracle on a non-sudo
  box. Fixed: the guard now TRIMS (`printf %s | tr -d ' \t'`) both operands, mirroring the WHAT guard's idiom, so a
  whitespace-only value reads as unset → REFUSE. Live-probed: `flag=' '` → REFUSE; `=1`/`=0`/allowlist → START.
- **[honesty-auditor MEDIUM] Plan self-contradiction** — the Problem section's "pure defense-in-depth" clause (which
  the VERIFY board explicitly superseded) is struck; the plan now carries the corrected "sole caller-scoping control
  over #273" framing consistent with the shipped code/docs.
- **[honesty-auditor LOW] Stale doc line-refs** — `sigma-root-broker-deploy.md:200-201` `broker-core.js:96,107`→
  `:101,112` and `:172`→`:177` (verified against the current source; pre-existing drift my comment edits nudged).

### Not applied (board-sanctioned)

- **[hacker L1 / architect earlier] `undefined`→`disabled` fail-open default** in `authorizeCaller` — KEPT as the
  documented un-threaded defensive default (no production caller reaches it post-#106; a future forgetful entrypoint is
  caught by the `sigma-root-broker.test.js` source-grep forward-guard). Collapsing the shared gate's state machine is
  out of #106's scope; the board offered keep+tripwire as the sanctioned alternative and it is in place.
- **[code-reviewer L2] dense entrypoint comment** — nit; matches the file's existing dense-comment convention.

### Named residuals (NS-9, correctly bounded — NOT closed by #106)

- **Non-sudo blind oracle** (I2): a non-sudo K_root deploy with no controller/flag/allowlist is a blind oracle the CODE
  cannot detect; the deploy doc's MANDATORY WHO start-guard is the sole mitigation (verified load-bearing).
- **`=0` opt-out** (I1): disables WHO for all sudo-permitted callers on K_root — a named WHAT-gate-only opt-out; the
  host cannot set it under the sudoers `env_reset,!setenv` pin (operator custody; code cannot verify — NS-9).
- **#273 mint-under-controller** (R1): survives; closes only with an authenticated-minter. The doc disclaims it
  explicitly; the WHO gate NARROWS the caller set, does not close it.

**Gate: full suite 807/0, eslint 0. Ready for pre-PR CodeRabbit + PR.**
