---
lifecycle: persistent
status: SCOPING -> VERIFY -> TDD build (a defense-in-depth denylist completion on the broker env extras channel)
plan: 46
created: 2026-07-09
issue: 85 (F10)
depends-on: none (self-contained; broker-client.js opts.env guard)
audience: a build session (this) + the USER (merge gate)
title: broker opts.env denylist is incomplete for the CODE-EXECUTION class (BASH_ENV/ENV/PATH/NODE_PATH/OPENSSL_/BASH_FUNC_/shell-RCE) -- PACT_ROOT_* is legit arming, kept (issue #85 / F10)
---

# Plan 46 -- F10: broker env denylist completion

## The bug (premise-probed firsthand)

`brokerSigner` (`v0/src/identity/broker-client.js`) builds the broker child's env FROM SCRATCH (`:53` `env = {}`;
process.env is NEVER spread -- the NODE_OPTIONS defense) and lets a caller add EXTRAS via `opts.env`, guarded by a
denylist: `RESERVED_ENV = /^(NODE_OPTIONS|PACT_BROKER_KEY_FILE|LD_|DYLD_)/` (`:31`, tested at `:57`). **The denylist is
incomplete for its own danger classes:**
- **Shell code-loaders** -- the wrapper is `#!/bin/sh`, so `BASH_ENV` (bash) and `ENV` (POSIX sh) are live
  code-loading vectors for the interpreter. The deploy audits (`sigma-root-broker-deploy.md`,
  `finish-root-broker-steps.md`) classify `BASH_ENV` as a MUST-strip code-loader. Both pass the current denylist.
- **Node loaders** -- `NODE_REPL_EXTERNAL_MODULE` (a `NODE_REPL_` module-load vector) passes.
- **Key/config-paths** -- `PACT_ROOT_KEY_FILE` (repoints the ROOT broker's key) and the rest of `PACT_ROOT_*`
  (controller / allowed-uids / require-binding -- the root broker's config) all pass, letting a caller reconfigure
  the trust root via the frame broker's extras channel.

## The model (CORRECTED by the VERIFY board -- the load-bearing reframe)

`opts.env` is NOT a general benign-extras channel -- it is the **trusted caller's CONFIG/ARMING channel**, and it has
real callers (my original "no production caller" premise was FALSE, architect HIGH):
- `sigma-root-broker.test.js:71` arms the sigma-root broker via `env: { PACT_ROOT_KEY_FILE, PACT_ROOT_CONTROLLER }`
  -- and this is the **SOLE** channel to arm it (`opts.keyFile` sets `PACT_BROKER_KEY_FILE` ONLY, `:54`). Blocking
  `PACT_ROOT_` would BREAK sigma-root arming (a regression).
- `broker.test.js:458` passes `PACT_BROKER_PERSONA_DID`; `:256` passes a benign `SOME_BENIGN` (the positive control).

So the guard's job is NARROW + correct: block the **code-EXECUTION / code-LOAD class** -- env vars that turn "set a
var" into "run arbitrary code" in the `#!/bin/sh` wrapper or the `node` child. These have NO legitimate broker-config
use; a from-scratch key-holding child must never receive them (defense-in-depth vs a caller ACCIDENTALLY spreading a
host `NODE_OPTIONS`/`PATH`). The guard is NOT a config gate -- the broker's arming config (`PACT_ROOT_*`,
`PACT_BROKER_*` config) is the trusted caller's legit channel and is deliberately NOT blocked.

## The fix (complete the CODE-EXECUTION denylist; do NOT touch the config-arming channel)

The hacker's live PoCs proved the ORIGINAL denylist AND my first draft still miss real env->RCE vectors (`PATH`,
`SHELLOPTS`+`PS4`, `NODE_PATH` -- each a demonstrated code-exec/code-load into the child):

```js
// Block only CODE-EXECUTION / code-LOAD vectors (no legit broker-config use; catastrophic even from a buggy trusted
// caller). NOT a config gate: PACT_ROOT_*/PACT_BROKER_* config + SUDO_* are the trusted caller's arming channel and
// are deliberately allowed (see the named residual #100: a config-vs-extras channel split is a deferred design wave).
// (VALIDATE folds: +OPENSSL_ (node reads OPENSSL_CONF -> engine .dylib RCE), +BASH_FUNC_ (bash func-import RCE),
//  +NODE_V8_COVERAGE/NODE_COMPILE_CACHE (write-as-broker-uid).)
const RESERVED_ENV_PREFIX = /^(NODE_OPTIONS|NODE_REPL_|OPENSSL_|BASH_FUNC_|LD_|DYLD_|PACT_BROKER_KEY_FILE)/;
const RESERVED_ENV_EXACT = new Set(['BASH_ENV', 'ENV', 'PATH', 'NODE_PATH', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'SHELLOPTS', 'BASHOPTS', 'PS4']);
function isReservedEnvKey(k) { return RESERVED_ENV_PREFIX.test(k) || RESERVED_ENV_EXACT.has(k); }
```

- **Prefix** (block the family): `NODE_OPTIONS`, `NODE_REPL_`, `LD_`, `DYLD_`, `PACT_BROKER_KEY_FILE` (its dedicated
  channel is `opts.keyFile`).
- **Exact** (exact so benign `NODE_ENV`/`ENVIRONMENT`/`PATH_FOO` are NOT over-blocked): `BASH_ENV`, `ENV`, `PATH`,
  `NODE_PATH`, `SHELLOPTS`, `BASHOPTS`, `PS4`. (`NODE_PATH` is exact, not a `NODE_` prefix -- `NODE_` would over-block
  the very common benign `NODE_ENV`.)
- **Positive controls (regression guards)**: `PACT_ROOT_KEY_FILE`, `PACT_BROKER_PERSONA_DID`, `SOME_BENIGN`,
  `NODE_ENV` all still PASS -- the guard rejects the code-exec class, NOT the config/benign channel.

## Named residual (NS-9) + deferred follow-up

The config-injection surface the hacker named (`PACT_BROKER_REQUIRE_FRAME=0` -> blind oracle; `SUDO_UID` /
`PACT_BROKER_ALLOWED_UIDS` -> WHO-gate forge) is REAL **only if the calling code is compromised** -- `opts.env` is a
trusted, in-process channel with no attacker path today, and those vars are the LEGIT arming config (blocking them =
the sigma-root regression above). The right fix is a **config-vs-extras channel SEPARATION** (config from a trusted
immutable source, extras restricted) -- a design wave, NOT this MEDIUM defense-in-depth fix. **FILED as #100; named here LOUD.** This PR closes the unambiguous env->RCE class; it does not claim to close config-injection.

## Why NOT a positive allowlist here

The legit `opts.env` set (arming config + an unbounded benign tail like `SOME_BENIGN`) cannot be enumerated by a
closed allowlist without deleting a real capability (architect). So the denylist SHAPE is correct for the
code-exec class (which genuinely has no legit member); the config-injection concern is the channel-split follow-up.

## Runtime Probes (firsthand)

| # | Claim | Probe | Observed |
|---|-------|-------|----------|
| 1 | The denylist misses BASH_ENV/ENV/NODE_REPL_/PACT_ROOT_* | Read `broker-client.js:31` | `/^(NODE_OPTIONS\|PACT_BROKER_KEY_FILE\|LD_\|DYLD_)/` -- CONFIRMED incomplete |
| 2 | `crossUidBrokerSigner` passes no `opts.env` (latent, second-layer) | Read `broker-launch.js` | no `env:` threaded -- CONFIRMED latent |
| 3 | The test covers only NODE_OPTIONS/LD_PRELOAD/DYLD_/PACT_BROKER_KEY_FILE | Read `broker.test.js:253` | the `bad` loop lists exactly those four -- the gap is untested |

## What this does NOT do (NS-9)

- Does NOT change the deployed-path behavior (sudo `env_reset` already strips these; `crossUidBrokerSigner` passes
  no extras) -- this hardens the in-code SECOND layer only.
- Does NOT convert the extras channel to a positive allowlist (no defined legit set; would nuke the seam -- see above).
- Does NOT over-block benign vars (`ENVIRONMENT`/`ENV_FOO` still allowed -- the exact-anchor + positive-control test).
- Is NOT arming-gated -- a reachable defense-in-depth fix to a live guard.

## HETS Spawn Plan (VERIFY board -- a broker key-custody boundary = the Rule-2 high-stakes class)

Two read-only lenses in parallel:
- **architect** -- (1) denylist-completion vs positive-allowlist-rewrite: is the right-sized call correct, or should
  the extras seam be removed/allowlisted given no production caller? (2) is the prefix/exact split correct + precise
  (no over-block of benign vars, no under-block of a danger class)? (3) any OTHER code-loader/key-path class missed
  (e.g. `NODE_EXTRA_CA_CERTS`, other shells)?
- **hacker** -- (1) enumerate EVERY env-based code-load / key-repoint vector a `#!/bin/sh` + node child honors; does
  the new guard cover them (or name the residual)? (2) can the exact-anchor be bypassed (case, trailing chars,
  unicode, `env` vs `ENV`)? (3) is the guard non-vacuous (a benign var passes) AND non-bypassable (a danger var
  always throws)? (4) does throwing on a reserved key leak anything / is fail-closed correct?

Findings fold into a `## Pre-Approval Verification` section before the RED-first TDD build.

## Pre-Approval Verification (2026-07-09 -- the 2-lens VERIFY board, pre-build)

**architect: NEEDS-REVISION -> REVISED.** HIGH: my first draft's `PACT_ROOT_` block is a REGRESSION + misdiagnosis --
`sigma-root-broker.test.js:71` arms the sigma-root broker via `opts.env PACT_ROOT_*` (the SOLE arming channel;
`opts.keyFile` -> `PACT_BROKER_KEY_FILE` only). My premise "no production caller passes opts.env" is FALSE (arming
config + a benign tail). **FOLDED**: dropped `PACT_ROOT_`; corrected the model (opts.env = trusted config-arming
channel); the denylist targets the code-EXEC class only. Also flagged `NODE_PATH` under-block (folded) + do-NOT-add
`PACT_BROKER_ALLOWED_UIDS` (would repeat the regression).

**hacker: BUILD-WITH-FOLDS** (14 probe classes; 4 LIVE bypasses of my draft). **FOLDED (code-exec, mandatory):**
`PATH` (RCE -- the wrapper runs bare `tr`/`printf`; execFileSync `env:{}` REPLACES the env so PATH enters only via
extras; PoC ran attacker's `tr`), `SHELLOPTS`+`PS4` (xtrace command-substitution RCE, PoC), `NODE_PATH` (module-
resolution shadow -> require attacker code, PoC), `BASHOPTS`. Anchor-bypass HELD (exact-match correct -- the
interpreter is byte/case-exact too; blocking case-variants is theater). fail-closed throw is correct + leaks nothing.

**The genuine architect-vs-hacker CONFLICT (config family) -- RESOLVED:** hacker H1 wants to block `PACT_BROKER_*` +
`SUDO_*` (`REQUIRE_FRAME=0` -> blind oracle; `SUDO_UID` -> WHO-forge); architect proves those (and `PACT_ROOT_*`) are
the trusted caller's LEGIT arming config -- blocking is a PROVEN regression for the ARMING vars (PACT_ROOT_*, PACT_BROKER_PERSONA_DID have callers); REQUIRE_FRAME/SUDO_UID have NO opts.env caller, so they are deferred under the channel-split umbrella, not because blocking regresses a caller. **Resolution:** the config-injection is real ONLY
under a compromised caller (opts.env has no attacker path today); the correct fix is a **config-vs-extras channel
SEPARATION** (design wave), NOT a config-block regression. This PR closes the unambiguous **code-exec** class; the
config-injection surface is a **NAMED residual + a FILED follow-up (#100)** (does NOT claim to close config-injection).

| # | Sev | Lens | Finding | Disposition |
|---|-----|------|---------|-------------|
| A-HIGH | HIGH | arch | `PACT_ROOT_` block = sigma-root arming regression; "no caller" premise false | **FOLDED**: dropped `PACT_ROOT_`; model corrected; positive-control tests for the arming vars. |
| H2 | HIGH | hacker | `PATH` -> RCE (bare wrapper cmds; env replaced) | **FOLDED**: exact-block `PATH`. RED test. |
| H3 | HIGH | hacker | `SHELLOPTS`+`PS4` -> xtrace RCE | **FOLDED**: exact-block `SHELLOPTS`/`BASHOPTS`/`PS4`. RED test. |
| H4 | HIGH | hacker | `NODE_PATH` -> module-load RCE | **FOLDED**: exact-block `NODE_PATH` (NOT `NODE_` prefix -- spares benign `NODE_ENV`). RED test. |
| H1 | HIGH | hacker | `PACT_BROKER_*`/`SUDO_*` config-injection (blind oracle / WHO-forge) | **NAMED RESIDUAL + FILED follow-up (#100)** (config-vs-extras channel split); NOT blocked (blocking the ARMING vars is the proven regression; REQUIRE_FRAME/SUDO have no caller -> deferred under the split). |
| A3 | MED | arch | `NODE_EXTRA_CA_CERTS` etc. | inert (broker does no TLS) -- named residual, not blocked (YAGNI). |
| A/H | LOW | both | shell `IFS`/`BASH_FUNC_*` residuals | low-reachability vs a fixed wrapper -- named, not blocked. |

**Board verdict: PROCEED to RED-first TDD** with the code-exec block set (`PATH`/`NODE_PATH`/`SHELLOPTS`/`BASHOPTS`/
`PS4`/`BASH_ENV`/`ENV` + the existing `NODE_OPTIONS`/`NODE_REPL_`/`LD_`/`DYLD_`/`PACT_BROKER_KEY_FILE`), positive-control
tests for the arming vars (`PACT_ROOT_KEY_FILE`/`PACT_BROKER_PERSONA_DID`/`SOME_BENIGN`/`NODE_ENV` still pass), and the
config-injection channel-split as a filed follow-up (#100).

## VALIDATE result (2026-07-09 -- the 3-lens post-build board, on the BUILT diff)

**SHIPPED**: `broker-client.js` `isReservedEnvKey` (prefix + exact Set) blocking the CODE-EXECUTION class; the guard
usage rerouted; the `broker.test.js` guard test extended (code-exec throws + config/benign positive-control).
**broker.test.js 28/0; the full PACT suite 756/0 (THIS fix's own count, incl. `sigma-root-broker.test.js` 15/15 --
the arming path un-regressed); eslint clean.**

**3-lens board -- all findings folded, apply-then-close:**

- **code-reviewer: SHIP-WITH-NITS** (0 CRIT/HIGH). Ran `sigma-root-broker.test.js` (15/15) + `broker.test.js` (28/28)
  directly: no-regression + no-over-block CONFIRMED. LOW: a stray `(RESERVED_ENV)` comment -> **FOLDED**
  (`isReservedEnvKey`). LOW: unfrozen Set -> skipped (freeze is meaningless for a Set's `.add`; module-private).
- **hacker (Rule 2a LIVE re-probe): NEEDS-FIX -> FIXED.** All VERIFY PoCs blocked; no over-block; deployed path safe;
  H1 config-injection correctly out-of-scope. **2 NEW code-load vectors found + FOLDED:** **F4 (HIGH) `OPENSSL_`** --
  the default child is node, which reads `OPENSSL_CONF` -> a PROVEN RCE via an engine/provider `.dylib`
  constructor (same class as `LD_`/`DYLD_`); **F5 (MED) `BASH_FUNC_`** -- bash exported-function import -> proven RCE
  into a shell wrapper. Added `OPENSSL_`/`BASH_FUNC_` to the prefix + `NODE_V8_COVERAGE`/`NODE_COMPILE_CACHE`
  (write-as-uid) to the exact set; RED tests for each.
- **honesty-auditor: B / PASS-WITH-CORRECTIONS.** Scope discipline strong (code-exec-only boundary honest; #85's
  `PACT_ROOT_` demand reconciled-not-ignored). Corrections **FOLDED**: H-1 (the "FILED" follow-up was never filed ->
  **actually FILED as #100**, cited); M-1 (the `756/0` was plan-45's -> this VALIDATE result records plan-46's own
  count); M-2 (tightened: blocking is a proven regression for the ARMING vars only; REQUIRE_FRAME/SUDO have no
  caller -> deferred under the split); L-1 ("COMPLETE" -> "covers the reachable/enumerated vectors"); L-2 (the plan
  title reframed off the mis-scoped `PACT_ROOT_*`).

**Board verdict: SHIP.** All must-fix folded (F4/F5 code-load vectors + the honesty corrections) with RED tests + the
filed #100 residual. No regression (arming un-touched, 756/0). Next: pre-PR CodeRabbit -> PR.
