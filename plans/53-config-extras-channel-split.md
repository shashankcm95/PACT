---
lifecycle: persistent
plan: 53
issue: 100
finding: F10-sibling (config-injection channel separation)
severity: medium
lens: security + architecture
---

# plans/53 — separate brokerSigner's config-arming channel from the benign-extras channel (#100)

## Problem (the pinned #85/F10 residual, named LOUD in plans/46)

`brokerSigner`'s `opts.env` (`v0/src/identity/broker-client.js`) is ONE channel serving TWO concerns:

1. the trusted caller's **config/ARMING** channel — the brokers' arming vars flow through it: the sigma-root
   broker is armed by `env: PACT_ROOT_*` (`sigma-root-broker.test.js:73` sets `PACT_ROOT_KEY_FILE` +
   `PACT_ROOT_CONTROLLER`); the frame broker's identity binding rides `PACT_BROKER_PERSONA_DID`
   (`broker.test.js:475/484`, `custody-verify.test.js:423`);
2. a general **benign-extras** channel — an unbounded tail like `SOME_BENIGN` (`broker.test.js:271/273`) that a
   caller may add and that must still reach the child + sign.

The #85 fix (plans/46) closed the **code-execution** class on that channel (`isReservedEnvKey`: `NODE_OPTIONS` /
`OPENSSL_` / `BASH_FUNC_` / `LD_` / `BASH_ENV` / `PATH` / …) but DELIBERATELY did not block the config vars —
blocking them is a regression (it breaks arming). So config still shares the extras channel.

### The residual (defense-in-depth; NOT attacker-reachable today)

Because config flows through the same channel a caller uses for extras, a **compromised/buggy caller** of
`brokerSigner` could set:

- `PACT_BROKER_REQUIRE_FRAME=0` → disable the R2-WHAT frame gate → **blind signing oracle** (`broker-sign.js:45`).
- `SUDO_UID` + `PACT_BROKER_ALLOWED_UIDS` → forge the WHO gate (`broker-core.js:100`).
- `PACT_BROKER_PERSONA_DID` / `PACT_ROOT_CONTROLLER` → change the signing-identity / controller binding.

`opts.env` has **no attacker path today** (`crossUidBrokerSigner` threads no env — `broker-launch.js:75`; only
in-process construction sets it; the deployed cross-uid config comes from the root-owned wrapper). So this is a
defense-in-depth **channel-discipline** wave, NOT a live-bypass fix. Honest scope carried LOUD (NS-9).

## Design — a positive-allowlist CONFIG channel + a negative-gate EXTRAS channel

The asymmetry plans/46 identified (lines 77-79) is the whole design: **the config vars are a finite, enumerable
set; the benign tail is unbounded.** So the two channels get OPPOSITE gate polarities:

- **`opts.config`** (NEW) — a dedicated object whose keys MUST each be a member of a `CONFIG_ENV_KEYS` **positive
  allowlist** (the enumerable config/arming var set). An unknown key **throws** (fail-closed): config is a closed,
  auditable set, so a positive allowlist is sound here.
- **`opts.env`** (extras, EXISTING) — now a **negative gate**: reject any `CONFIG_ENV_KEYS` member (NEW — "config
  goes through opts.config") **and** any `isReservedEnvKey` code-exec var (EXISTING). Everything else — the
  unbounded benign tail — passes. A positive allowlist is impossible here (no enumerable legit set), so the gate
  stays negative; the NEW rejection is what makes the extras channel provably **config-free**.

Net: config can no longer be injected via extras for every config var the broker honors (extras fail-closed on
every `CONFIG_ENV_KEYS` member, kept in sync with the entrypoint reads by the drift tripwire), and the config
channel is an explicit, narrow, allowlisted surface. `opts.keyFile` (the frame key path → `PACT_BROKER_KEY_FILE`)
is UNCHANGED.

### `CONFIG_ENV_KEYS` — the enumerable config/arming set (raw `PACT_*` keys)

Derived by grepping what each entrypoint reads from `process.env` (see Runtime Probes). Raw keys, not friendly
names (see "Rejected: friendly-name map"):

| Key | Read by | Concern |
|---|---|---|
| `PACT_BROKER_REQUIRE_FRAME` | `broker-sign.js:45` | frame R2-WHAT arm |
| `PACT_BROKER_PERSONA_DID` | `broker-sign.js:46` | frame identity binding |
| `PACT_BROKER_REQUIRE_CALLER` | `broker-sign.js:54` | frame R2-WHO arm |
| `PACT_BROKER_ALLOWED_UIDS` | `broker-core.js:100` (via `allowlistEnv`) | frame WHO allowlist |
| `PACT_ROOT_KEY_FILE` | `sigma-root-broker.js:68` (via `keyFileEnv`) | root key path |
| `PACT_ROOT_CONTROLLER` | `sigma-root-broker.js:48` | root controller binding |
| `PACT_ROOT_REQUIRE_BINDING` | `sigma-root-broker.js:47` | root R2-WHAT arm |
| `PACT_ROOT_REQUIRE_CALLER` | `sigma-root-broker.js:62` | root R2-WHO arm |
| `PACT_ROOT_ALLOWED_UIDS` | `sigma-root-broker.js:69` (via `allowlistEnv`) | root WHO allowlist |

**Excluded on purpose:** `PACT_BROKER_KEY_FILE` — it already has the dedicated `opts.keyFile` channel and is in
`RESERVED_ENV_PREFIX`. It stays keyFile-only; putting it in `CONFIG_ENV_KEYS` would create a two-channel collision
for one var (see adversarial shape #6).

**CORRECTED by the VERIFY board (a FALSE premise I asserted un-probed):** `SUDO_UID` / `SUDO_USER` are
config-in-effect (`broker-core.js:100` reads `process.env.SUDO_UID` as the SOLE WHO-gate input) but are in NEITHER
`CONFIG_ENV_KEYS` NOR `isReservedEnvKey` today — so a caller-set `SUDO_UID` passes `opts.env` as "benign" and
FORGES the WHO gate. The in-process `brokerSigner` path spawns `process.execPath` with NO sudo, so there is no
`env_reset` overwrite backstop (that only exists on the deployed `crossUidBrokerSigner`/sudo path). My original
claim ("stays REJECTED by extras' existing model; a test pins it") was FALSE — no such rejection and no such test
exist; `caller-auth.test.js:44-48` in fact shows the broker HONORS a child-env `SUDO_UID`. **Resolution (OQ-2 →
explicit reject):** a `CALLER_SIGNAL_ENV = {SUDO_UID, SUDO_USER}` reject set, rejected on BOTH channels (not a
config key → config throws; in the extras negative gate → extras throws).

## Adversarial shapes — enumerated FIRST (arc lesson: probe the adversary's shape, not the convenient one)

The recurring self-improve signal from the #99/#110 arc: my firsthand premise-probes kept testing convenient
shapes and the adversarial lens caught what I missed 4× running. So the config-injection shapes lead the design,
and each becomes a RED test:

1. **Config smuggled through extras (THE bug).** `env:{PACT_BROKER_REQUIRE_FRAME:'0'}` must now **throw** (was:
   silently passed → blind oracle). Same for every `CONFIG_ENV_KEYS` member via `opts.env`.
2. **Non-config key in the config channel.** `config:{SOME_BENIGN:'1'}` must **throw** (config is allowlist-only,
   fail-closed on unknown) — a buggy caller spreading a wide object into `config` gets a loud throw, not a silent
   pass of a typo'd arming var.
3. **Code-exec key in the config channel.** `config:{NODE_OPTIONS:'--require /x'}` must **throw** — it is not a
   `CONFIG_ENV_KEYS` member (rejected as unknown) AND is `isReservedEnvKey` (defense-in-depth; assert BOTH the
   config-unknown reject fires, so the ordering can't leave a gap).
4. **Prototype-chain / `__proto__` key.** An OWN `__proto__`/`constructor`/`prototype` key (e.g. from
   `JSON.parse('{"__proto__":{...}}')`, which `Object.keys` returns) MUST **throw** on both channels (the dunder
   reject) — it is never a legit env var name. An INHERITED config var (on the source object's prototype) must be
   IGNORED and never reach the child (`Object.keys` is own-only + the `Object.create(null)` child-env target). The
   final design does NOT "pass by rule" any dunder key; the child env has a null prototype so no `__proto__` entry
   can shadow a real var.
5. **Case / whitespace near-miss.** `env:{' PACT_BROKER_REQUIRE_FRAME':'0'}` or a lowercase variant: env keys are
   case-sensitive and the child reads the EXACT case, so a near-miss is inert AT THE CHILD — but assert the split
   matches config keys by EXACT string (no trim/casefold), so a near-miss is NOT mistaken for a config key nor
   given special treatment; it simply flows as a benign (child-ignored) extra. Pins that the allowlist is exact.
6. **Two-channel collision on one var.** `keyFile:'/a'` + `config:{PACT_BROKER_KEY_FILE:'/b'}` — since
   `PACT_BROKER_KEY_FILE` is excluded from `CONFIG_ENV_KEYS`, the config form **throws** (unknown config key), so
   there is exactly ONE channel for the frame key path. Assert no silent precedence.
7. **Same key in BOTH config and extras.** `config:{PACT_BROKER_PERSONA_DID:'a'}` + `env:{PACT_BROKER_PERSONA_DID:
   'b'}` — the extras copy throws (config key in extras, shape #1), so a collision is impossible by construction.
   Assert the throw fires (not a last-writer-wins merge).
8. **Non-string config/extras value.** `config:{PACT_BROKER_REQUIRE_FRAME: 0}` (number) — execFileSync's env wants
   strings. Decide: coerce, or reject non-string values loudly? (OQ-3.) Assert whichever the board picks; do not
   leave an implicit `String(undefined)`-class footgun.

## Runtime Probes (claims about current state, verified against the tree)

- `Probe: grep -n "process.env.PACT" v0/src/identity/*.js` → the 9 reads tabulated above; the `allowlistEnv` /
  `keyFileEnv` indirections resolve to `PACT_{BROKER,ROOT}_ALLOWED_UIDS` / `PACT_{BROKER,ROOT}_KEY_FILE` in the two
  entrypoints. (Re-run before impl — the allowlist MUST match exactly what the child reads, or a renamed var
  silently drops out of the config channel and back into the unguarded-benign tail.)
- `Probe: grep -n "brokerSigner({" v0/src v0/test` → the ONLY `opts.env`-config call sites to migrate:
  `sigma-root-broker.test.js:73` (`PACT_ROOT_KEY_FILE`+`PACT_ROOT_CONTROLLER`), `broker.test.js:475/484` +
  `custody-verify.test.js:423` (`PACT_BROKER_PERSONA_DID`). No `src/` caller passes config env
  (`broker-launch.js:75` threads none) — CONFIRMED latent, matches the issue.
- `Probe: node -e "new (require('child_process'))" ` N/A — the child-env build is synchronous object construction;
  the behavioral proof is the migrated integration suite spawning the REAL broker child and signing.

## Migration (the callers)

- `sigma-root-broker.test.js:73` — `env:{PACT_ROOT_KEY_FILE, PACT_ROOT_CONTROLLER}` → `config:{…}`.
- `broker.test.js:475/484`, `custody-verify.test.js:423` — `env:{PACT_BROKER_PERSONA_DID}` → `config:{…}`.
- `broker.test.js:271/273` — the benign-extras assertions STAY on `opts.env` (they prove the tail still flows).
- `broker.test.js:265` — the reserved-key reject STAYS on `opts.env` (still the code-exec gate).
- No `src/` migration (no `src/` caller sets config env). `crossUidBrokerSigner` is untouched.

## Test plan (RED-first)

New/updated `broker.test.js` (integration — spawns the real child) + a focused unit block:
- shapes #1-#8 above (each an explicit assertion, several proven non-vacuous by RED against current impl).
- migration: the 3 config call sites sign correctly through `opts.config`.
- regression: benign extras still flow + sign (`SOME_BENIGN`); code-exec still rejected on extras.
- non-vacuity: shape #1 (config-via-extras throw) MUST be RED against current impl (today it silently passes) —
  that RED is the behavioral spec.

## Open questions for the VERIFY board

- **OQ-1 (design):** raw `PACT_*` keys in `opts.config` (recommended: KISS, unambiguous across both prefixes, the
  allowlist IS the enumeration) vs the issue's illustrative friendly-name map (`{requireFrame, personaDid, …}`).
  Friendly names must cover BOTH families (frame `requireFrame` + root `requireBinding`/`controller`), add a
  name→var map that must stay in sync with the entrypoints, and buy only API ergonomics for internal test callers
  (YAGNI). Recommend raw keys; board to confirm.
- **OQ-2 (`SUDO_UID`):** explicit reject in extras, or rely on "not a config key + sudo overwrites a host-forged
  value under env_reset"? Lean: no attacker path via `opts.env` in-process, but an explicit reject is cheap
  defense-in-depth + documents intent. Board to rule.
- **OQ-3 (value typing):** coerce non-string config/extras values to string, or reject loudly? Lean: reject loudly
  (fail-closed, no implicit coercion footgun), but the existing extras path does not type-check values — parity vs
  hardening. Board to rule.
- **OQ-4 (module placement):** `CONFIG_ENV_KEYS` in `broker-client.js` (co-located with the guard) vs a shared
  `broker-env.js` (if a second consumer emerges). Lean: co-locate now (YAGNI); extract when a second reader lands.

## Honest scope (NS-9, carried LOUD)

- Defense-in-depth channel discipline, NOT a live-bypass fix — `opts.env` has no attacker path today.
- Does NOT close #273 (a same-uid caller reaching the root broker; that needs the deployed + attested cross-uid
  signer). Does NOT change custody physics (process/uid/env boundary). All SHADOW.

## VERIFY board result (architect PROCEED-WITH-FOLDS; hacker NEEDS-REVISION)

The board found a real design gap the original §Design left open. Both lenses grounded findings in live probes.

**Folded into the design (build these):**

1. **CRITICAL (hacker, proven live end-to-end) — `__proto__` prototype pollution bypasses the extras gate.**
   `env: JSON.parse('{"__proto__":{"PACT_BROKER_REQUIRE_FRAME":"0"}}')` → `__proto__` is an OWN enumerable key
   (`Object.keys` returns it), the negative gate matches neither config nor reserved, and `env['__proto__'] = {…}`
   on `const env = {}` (`broker-client.js:65`) invokes the Object.prototype `__proto__` SETTER → re-parents `env`
   → Node's `child_process` env iteration (`for…in`, includes inherited keys) → the REAL child read
   `PACT_BROKER_REQUIRE_FRAME=0` (blind oracle). **Fix (in §Design, not just a test):** (a) build the child env
   with `Object.create(null)` (probe-verified to close it); (b) belt-and-suspenders reject literal
   `__proto__`/`constructor`/`prototype` keys on both channels; (c) the shape-#4 RED test MUST spawn a REAL child
   and read ITS `process.env` — asserting on `Object.keys(parentEnv)` FALSE-PASSES (vacuous-test trap: after the
   pollution `Object.keys(env)` is `[]` while the child still inherits the var).

2. **BLOCKING / HIGH (both lenses converge) — `SUDO_UID` reject.** See the corrected CONFIG_ENV_KEYS note above.
   `CALLER_SIGNAL_ENV = Object.freeze(new Set(['SUDO_UID','SUDO_USER']))`, rejected on both channels.

3. **FOLD / MEDIUM (both lenses) — reject non-string values LOUDLY** on both channels (`execFileSync` does
   `` `${k}=${v}` `` → `0`→`"0"` silently mis-arms + runs attacker `toString`/`valueOf` at spawn). Fail-closed, no
   implicit coercion. (Also closes the object-valued proto vector for free.)

4. **FOLD (architect) — drift tripwire test.** `CONFIG_ENV_KEYS` and the entrypoint reads are two sources of
   truth; a renamed/added arm var that falls out of the allowlist silently drops back into the unguarded benign
   tail (a security regression). Add a test that scans BOTH entrypoints (`broker-sign.js`, `sigma-root-broker.js`)
   for direct `process.env.PACT_*` reads AND the `keyFileEnv:`/`allowlistEnv:`/`distinctFromKeyFileEnv:` literal
   args (the indirection a naive `grep process.env.PACT_` MISSES), and assert the union of PACT_* names equals
   `CONFIG_ENV_KEYS ∪ {'PACT_BROKER_KEY_FILE'}` exactly. Rejected the shared-import alternative (conflicts with the
   P5-W1 single-arming-source grep tripwire in `broker-core.js:19-21`).

5. **NIT (architect) — EXPORT `CONFIG_ENV_KEYS`** so the tripwire imports the canonical set (no re-hardcode / DRY
   drift). Co-locate in `broker-client.js` (OQ-4); extract to `broker-env.js` only when a second consumer emerges.

6. **NIT (architect) — config channel is a SINGLE positive-allowlist gate.** Do NOT also wire `isReservedEnvKey`
   into the config path (the allowlist IS the gate; all 9 config keys are non-reserved). Shape #3's "assert BOTH"
   stays a TEST assertion, not an impl double-gate.

7. **LOW (hacker) — assert the config-membership reject fires INDEPENDENTLY of `isReservedEnvKey`** (a future edit
   to the reserved sets can't silently drop a config key into the benign tail), and `Object.freeze` the sets.

**Resolved OQs:** OQ-1 → raw `PACT_*` keys (friendly-name map is net-negative drift + a `requireCaller` prefix
collision across both families — confirmed by both lenses). OQ-2 → explicit `SUDO_UID`/`SUDO_USER` reject
(finding 2). OQ-3 → reject non-string loudly (finding 3). OQ-4 → co-locate + export in `broker-client.js`
(finding 5). `PACT_BROKER_KEY_FILE` exclusion + the root/frame key-path asymmetry → keep as a defensible YAGNI
(do NOT retire `opts.keyFile` on a SHADOW wave; forward-note only).

**Corrected child-env build (the new §Design core):**
- target = `Object.create(null)` (NOT `{}`).
- `opts.keyFile` → `PACT_BROKER_KEY_FILE` (unchanged).
- `opts.config`: each key MUST be in `CONFIG_ENV_KEYS` (else throw) AND its value MUST be a string (else throw). One gate.
- `opts.env` (extras): reject if `isReservedEnvKey(k)` OR `CONFIG_ENV_KEYS.has(k)` OR `CALLER_SIGNAL_ENV.has(k)` OR
  `isDunderKey(k)`; value MUST be a string (else throw); everything else passes (the benign tail).

## VALIDATE board result (BUILT diff — code-reviewer APPROVE-WITH-FOLDS; hacker APPROVE-WITH-FOLDS; honesty CLAIMS-HOLD)

The 3-lens board ran on the built code. The hacker ran 30+ LIVE probes against the built `brokerSigner` AND a real
ed25519-keyed `broker-sign.js` child: **zero injection bypasses** — the `__proto__` CRITICAL and `SUDO_UID` HIGH
are closed at construction (dunder reject + `Object.create(null)` + case-sensitive negative gates + shared
string-value gate), and a disarm smuggle cannot flip the real broker out of require-frame mode. The code-reviewer
found 0 correctness bugs and verified the migration live. All three converged on small folds, now BUILT:

1. **`drift:fail-silent` (hacker LOW-1) — control-char value reject.** A NUL/control char in a value failed CLOSED
   but SILENTLY at `sign()`'s bare `catch` → null. Now rejected LOUDLY at construction (`hasControlChar`, both
   channels) so a tamper/misconfig is observable (security.md: a fail-closed decision must be OBSERVABLE).
2. **shape #5 pin (code-reviewer + honesty MEDIUM-1) — case/whitespace near-miss** now has an explicit assertion
   (a near-miss is a benign extra; the gate matches by exact string, no trim/casefold).
3. **tripwire hardening (honesty MEDIUM-3 + code-reviewer LOW) —** the drift tripwire now strips comments, matches
   bracket-notation reads, scans `broker-core.js` (the shared module) in addition to the two entrypoints, and
   asserts every `SUDO_*` read is in `CALLER_SIGNAL_ENV`. Closes the "a direct `process.env.PACT_*` added in
   broker-core silently drops into the benign tail" gap.
4. **real-child inherited-proto test (fold 1(c), honestly re-scoped) —** see the honesty correction below.

**Honesty correction (honesty-auditor MEDIUM-2, applied):** the VERIFY-fold "the shape-#4 test MUST spawn a REAL
child and read ITS env" is NOT how the `__proto__` OWN-key vector is tested — that vector is closed by a
CONSTRUCTION-TIME dunder throw (non-vacuous: it asserts a throw, not `Object.keys(parentEnv)`, so it avoids the
vacuous-test trap), and a real-child test of it is MOOT because the throw precludes any spawn. What the built
suite DOES add is a real-child test of the `Object.create(null)` belt-and-suspenders layer: an INHERITED-prototype
config var on `opts.env` (which does NOT trip the dunder reject, since `Object.keys` is own-only) must not reach
the spawned child — proven end-to-end (the child signs a bare hex → legacy mode → the inherited
`PACT_BROKER_REQUIRE_FRAME` never reached it). The hacker's live probe #4 independently confirmed the same closure.

**Honesty softening (applied to this plan + the commit):** "config cannot be injected via extras *at all*" → "for
every config var the broker honors" (the guarantee is maintained by the drift tripwire, now broker-core-inclusive).
Test coverage: shapes #1-#5 + #8 are explicit assertions; #6 (two-channel key-file collision) and #7 (same key in
both channels) are covered IMPLICITLY by the unknown-key and config-in-extras rejects, not as distinct scenarios.

**Residuals carried (not folded — YAGNI / documented invariants):** the negative gates are CASE-SENSITIVE by
design (POSIX env; documented as a load-bearing invariant in the impl). `opts.config` is the TRUSTED caller
channel (documented) — the defense assumes no caller routes attacker data into it. The root/frame key-path
asymmetry (`PACT_ROOT_KEY_FILE` via config, `PACT_BROKER_KEY_FILE` via `opts.keyFile`) stays as a forward-note.

**Final gate:** full suite 847/0, the new unit file 16/16, eslint clean.
