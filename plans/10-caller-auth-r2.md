---
lifecycle: persistent
created: 2026-06-22
phase: caller-auth (R2) — in-broker caller authorization at the now-REAL cross-uid boundary
status: PLAN (pre-VERIFY)
---

# Caller-auth (R2) — the broker authorizes WHO may request a signature (SHADOW)

## §0 Honest scope (read first — it bounds the DoD)

The cross-uid spike (`plans/09`) delivered **non-exfiltration** custody (the key never leaves the broker uid)
and it is now **deployed + out-of-band-attested as REAL** on the user's box. But the broker is still an
**oracle**: it signs ANY 64-hex `record_id` for ANY caller the sudoers policy permits (R2). This wave adds the
**WHO** half of authorization — the broker checks the *invoking* uid against its OWN allowlist before signing.

**What this NARROWS (honest, per NS-7/NS-9 — it does NOT close R2):**
- **WHO may call → constrained, and the policy moves INTO the mechanism.** Today the only thing deciding who
  may invoke the broker is the *sudoers* file (external policy). This wave makes the **broker itself** enforce a
  caller-uid allowlist — defense-in-depth, and policy held by the thing that holds the key, not only by the OS
  config that can be broadened elsewhere.

**What this does NOT close (loud residual — the deeper frontier, named not papered):**
- **WHAT may be signed stays OPEN.** An *allowlisted* caller can still request a signature over an **arbitrary**
  `record_id` → still forge as this persona. Per-request authorization (the caller proves entitlement to the
  specific record it is signing) is a separate, harder frontier — the broker is persona-agnostic and has no
  entitlement context. R2-this-wave is **coarse caller-auth (uid-level), not per-request auth.**
- A **compromised allowlisted process** (same uid) is still an oracle. uid-auth trusts the uid.
- **As-deployed, caller-auth is OFF.** The gate is opt-in (`PACT_BROKER_ALLOWED_UIDS` unset → no caller-auth, R2
  fully open). EVERY existing deployment — including the live cross-uid box just attested REAL — has **zero**
  caller-auth until a human edits the root-owned wrapper to set the allowlist. This wave ships the MECHANISM; the
  narrowing takes effect only after that manual enablement (the DoD makes setting it on the live box gate the wave).

All SHADOW — nothing gates an action. The non-exfiltration custody is unchanged.

## §1 The design (recommended — challenge HARD at VERIFY; see §2.5)

The broker is a **sudo-command**, not a socket — so `SO_PEERCRED`/`getpeereid` (socket peer-cred) does NOT
apply. The sudo-native caller signal is **`SUDO_UID`**: sudo sets it to the real uid of the user who invoked
sudo (probed — `man sudo`: *"Set to the user-ID of the user who invoked sudo"*). It is sudo-**injected** (not
inherited), so `env_reset` does not strip it, and the host cannot choose it (sudo computes it from the caller's
real uid and overwrites any host-supplied value — to be re-confirmed at VERIFY, §6).

**`broker-sign.js` gains a gate (0), BEFORE the key is ever opened** (an unauthorized caller must not even
trigger a key read):

```
const allow = parseAllowlist(process.env.PACT_BROKER_ALLOWED_UIDS);   // broker-side, set in the root-owned wrapper
if (allow !== null) {                          // allowlist configured -> ENFORCE (fail-closed)
  const caller = process.env.SUDO_UID;          // sudo-injected real caller uid
  if (!/^[0-9]{1,10}$/.test(caller) || !allow.has(Number(caller))) fail('caller not authorized');
}                                               // allowlist UNSET -> caller-auth DISABLED (R2 stays open; opt-in, documented)
```

- **The allowlist is tamper-proof relative to the host:** `PACT_BROKER_ALLOWED_UIDS` is exported **broker-side**
  in `/usr/local/bin/pact-broker-sign` — a **root-owned, non-host-writable** wrapper (the custody-verifier's
  C2.5 already checks this). The host cannot change which uids are allowed; `sudo` `env_reset` also strips any
  host-supplied `PACT_BROKER_ALLOWED_UIDS`, and `brokerSigner`'s env-allowlist never forwards it.
- **`SUDO_UID` rests on sudo, in TWO steps** (VERIFY honesty+hacker correction — NOT "3 layers"): (1) `sudo`
  `env_reset` discards any caller-supplied `SUDO_UID`; (2) `sudo` then SETS `SUDO_UID` from the invoker's real
  uid. On the cross-uid launch path the broker child env is built **empty** (`brokerSigner` never spreads
  `process.env`) — a *precondition* that makes step (1) moot on THAT path, **not an independent third
  guarantee**; and it does NOT cover the realistic R2 attacker, who invokes `sudo … pact-broker-sign` **directly
  from a shell** (never through `brokerSigner`). So the SOLE load-bearing defense against a shell-capable host is
  **step (2), sudo's overwrite** — which is the single premise the whole wave rests on. **BUILD-BLOCKING: it is
  ASSERTED (man-page-strong) but UNPROBED on the live box (§6) — the host-spoof test must RUN and the broker must
  see the REAL uid before any build. If it fails, the gate narrows nothing and the wave DECLINEs.**
- **Fail-closed:** allowlist set + `SUDO_UID` absent (broker invoked NOT via sudo, e.g. directly) → **reject**
  (no caller identity to authorize). Malformed allowlist entry → reject the entry (parse strictly).
- **Opt-in default:** allowlist unset → behave as today (no caller-auth, R2 open) so an un-updated deployment
  is unbroken; the runbook update adds the var to turn it on. (VERIFY: debate opt-in vs always-fail-closed.)

## §2 Alternatives considered

- **sudoers-only (status quo).** The sudoers rule already restricts WHO may invoke the wrapper as `pact-broker`.
  Rejected as *sufficient* (see §2.5) but it IS real coarse caller-auth — this wave is defense-in-depth + policy
  relocation, not a from-zero gain. Name that honestly.
- **Per-request authorization (the deeper frontier).** The broker signs only a `record_id` the caller is
  *entitled* to. Deferred — the broker is persona-agnostic and has no entitlement oracle; needs a capability or
  a caller↔persona policy. Named as the residual, not built.
- **Capability tokens** (caller presents an unforgeable token the broker validates). More moving parts (a token
  minter + shared trust). Deferred; SUDO_UID is the zero-dependency sudo-native signal.

## §2.5 The open question the VERIFY board MUST settle

**Is an in-broker `SUDO_UID` allowlist meaningfully additive, given sudoers already gates the caller?**
The case FOR: (a) **defense-in-depth** — if the sudoers rule is later broadened (`%group ALL=(pact-broker) …`),
the broker's own allowlist still constrains; (b) **policy-in-the-mechanism** — the thing holding the key enforces
its own caller policy rather than trusting an external OS config (Dependency-Inversion / least-trust); (c) the
**foundation** for per-caller policy later (different callers → different allowed personas). The case AGAINST:
for a single-caller deployment it is **redundant** with sudoers and adds surface for ~zero marginal security.
VERIFY decides: build it (defense-in-depth + foundation), or DECLINE it and instead name per-request-auth as the
only R2 work worth doing. **A DECLINE is an acceptable, honest outcome** (don't build SHADOW redundancy for its
own sake — NS-7: it would only narrow, and barely).

**VERIFY VERDICT (2026-06-22): BUILD.** The architect settled it: sudoers gates the sudo TRANSITION (may uid X
assume the pact-broker identity at all — external OS config, broadenable elsewhere without the key-holder's
consent); the in-broker allowlist gates the broker's OWN signing policy (given I am running as pact-broker, do I
sign for THIS real caller — owned by the thing that holds the key). Different decisions, opposite sides of the
trust boundary → genuine defense-in-depth + policy-in-the-mechanism (Dependency-Inversion / NS-3), not
duplication. **Honest caveat (honesty lens):** on the CURRENTLY-probed single-caller deployment the "redundant"
branch IS the factual state; the FOR case rests on FUTURE conditions (a later-broadened sudoers rule; a later
per-caller policy). The build is justified as the uid-level *foundation increment* whose marginal cost is ~6
lines — NOT as a present-tense security gain over sudoers. It narrows the WHO axis honestly; it does not close R2.

## §3 Files

| File | Change |
|---|---|
| `v0/src/identity/broker-sign.js` | EDIT — add gate (0): `SUDO_UID` ∈ `PACT_BROKER_ALLOWED_UIDS` (before the key open) |
| `v0/test/unit/broker.test.js` (or a new `caller-auth.test.js`) | NEW tests — allowed/denied/unset-SUDO_UID/allowlist-unset/malformed; gate-before-key-read |
| `docs/deployment/cross-uid-broker.md` | EDIT — wrapper sets `PACT_BROKER_ALLOWED_UIDS`; a runbook note + the live caller-auth test |
| `plans/10-...md` | this plan (accretes §7 VERIFY + §8 VALIDATE) |

No change to `broker-client.js` / `broker-launch.js` / `custody-verify.js` / the seam.

## §4 Threat model (the hacker lens pressure-tests this)

| Vector | Defense / honest residual |
|---|---|
| host forges `SUDO_UID` (e.g. `SUDO_UID=0` in its env) | DEFENDED ×3 — brokerSigner env-allowlist + sudo env_reset + sudo overwrites from ruid (re-confirm at VERIFY) |
| host tampers the allowlist | DEFENDED — `PACT_BROKER_ALLOWED_UIDS` is set in the root-owned, non-host-writable wrapper (verifier C2.5) |
| broker invoked NOT via sudo (no SUDO_UID) | DEFENDED — allowlist-set + SUDO_UID-absent → reject (fail-closed) |
| unauthorized caller triggers a key read | DEFENDED — the gate is BEFORE `openSync(keyFile)` |
| allowlisted caller signs an ARBITRARY record_id | **R2 RESIDUAL (open)** — per-request auth is the deeper frontier; uid-auth is coarse |
| compromised allowlisted process | **RESIDUAL** — uid-auth trusts the uid |
| sudoers already gates the caller → redundancy | §2.5 — defense-in-depth + policy-in-mechanism, or DECLINE (VERIFY decides) |

## §5 Test plan (TDD — write first, red, then green)

1. allowlist set + `SUDO_UID` ∈ allowlist → the broker proceeds to sign (the authorized path is unbroken).
2. allowlist set + `SUDO_UID` ∉ allowlist → **reject**: empty stdout, non-zero exit, no key read.
3. allowlist set + `SUDO_UID` absent → **reject** (fail-closed).
4. allowlist UNSET → caller-auth disabled, signs as today (opt-in backward-compat) — a NON-VACUOUS test that
   PROVES the residual is documented, not silently closed.
5. malformed allowlist (`"a,b"`, `" "`, `"-1"`) → parsed strictly; a non-numeric entry never authorizes.
6. **gate-before-key-read** (structural): with an UNREADABLE/junk `PACT_BROKER_KEY_FILE`, an unauthorized caller
   still fails with `caller not authorized` (NOT a key error) — proving the gate runs before the key open.
7. the reject message is FIXED (no uid echo that leaks the allowlist? — VERIFY: decide whether to echo the uid).

## §6 Runtime Probes (verified against the OS / live deployment, not memory)

| Claim | Probe | Observed |
|---|---|---|
| `SUDO_UID` = the real caller uid, sudo-injected | `man sudo` 2026-06-22 | CONFIRMED — *"Set to the user-ID of the user who invoked sudo"* |
| the authorized-caller path signs end-to-end on the live deployment | `sudo -n -u pact-broker /usr/local/bin/pact-broker-sign <hex64>` | CONFIRMED — produced a valid 88-char base64 ed25519 sig |
| the sudoers policy is `env_reset, !setenv` + scoped NOPASSWD | `sudo -n -l` | CONFIRMED — `(pact-broker) NOPASSWD: /usr/local/bin/pact-broker-sign`; `env_reset, !setenv` |
| sudo OVERWRITES a host-forged `SUDO_UID` with the real caller uid (the gate's single load-bearing premise) | LIVE probe on the deployed box 2026-06-22: `sudo -u pact-broker printenv SUDO_UID` → `501`; `SUDO_UID=999999 sudo -u pact-broker printenv SUDO_UID` → **`501`** | **CONFIRMED** — the forge is discarded + overwritten from ruid under `env_reset,!setenv`; the world-anchored signal (NS-7), not a man-page assertion |
| the wrapper is root-owned + not host-writable (allowlist tamper-proof) | custody-verify C2.5 PASS (`plans/09`) | CONFIRMED on the live deployment |

## §7 DoD

- [ ] §5 tests all green INCLUDING the non-vacuous opt-in/residual test (#4) + the gate-before-key-read (#6).
- [ ] the caller-auth gate runs BEFORE the key is opened; reject = empty stdout + non-zero exit.
- [ ] `SUDO_UID` spoof + allowlist-tamper defenses confirmed (3-layer + root-owned wrapper).
- [ ] runbook updated (wrapper sets `PACT_BROKER_ALLOWED_UIDS`; a live caller-auth test: drop 501 → broker
      rejects; restore → signs).
- [ ] §0 residual (WHAT-can-be-signed / per-request auth) named in code + test names, NOT claimed closed.
- [ ] full v0 suite green + eslint; all SHADOW.
- [ ] **IF VERIFY DECLINES** (§2.5): record the decline + the reason in §7-board, ship only the honest residual
      doc (R2 named as per-request-auth-shaped), build no redundant gate.

## §8 Anchor check (north-star §6 pre-flight)

- NS-7/NS-9 ANCHOR-CHECK (pre-flight, to be re-verified at VALIDATE): the DESIGN narrows oracle-abuse (WHO) and
  the plan explicitly leaves R2 (WHAT / per-request-auth) open; no hardening is claimed. Whether the BUILD honors
  this is a VALIDATE-board verdict, not asserted here.
- NS-2 honored: this is the *authorization* layer (distinct from custody/non-exfiltration, integrity, validity).
- NS-8 honored: all SHADOW; nothing gates.
- No global rank / throne; no mutable score store; no rejected direction revived.

## §9 VERIFY board (pre-build) — RECORDED 2026-06-22

3-lens parallel read-only board (architect / hacker / honesty), run as a workflow. **All three:
PASS-WITH-CHANGES.** Verdict: **BUILD** (not DECLINE). Convergent headline across all three: *the entire wave
rests on one premise — sudo overwrites a host-forged `SUDO_UID` — and it is UNPROBED; a live spoof test is
BUILD-BLOCKING.*

**BUILD-BLOCKING gate (architect A2 + hacker H5 + honesty O2, convergent — do this BEFORE any code):**
- **Live `SUDO_UID`-overwrite spoof probe on the deployed box** (needs the user's password): with a host-forged
  `SUDO_UID`, confirm the broker process sees the REAL caller uid (501), not the injected value. If the forge
  survives → the gate narrows nothing → DECLINE. The `man sudoers` text ("the SUDO_* variables are set based on
  the invoking user") is man-page-strong but is NOT the world-anchored confirmation (NS-7). Record the observed
  result in §6 as CONFIRMED.

**FOLDED into the build-spec:**
1. **(honesty O1 + hacker H1, convergent) reframe "3 layers" → 2 sudo behaviors.** On the real path the broker
   child env is empty, so `brokerSigner`'s env-allowlist does NOT establish/protect `SUDO_UID` there, and it does
   NOT cover the direct-shell-`sudo` attacker at all. The SOLE load-bearing defense vs a shell-capable host is
   sudo's `env_reset` + overwrite. (Folded into §1 + §0.) Make `env_reset` + **no `SUDO_*` in `env_keep`** a
   documented, audited deployment invariant — extend the runbook `sudo -l -U <host>` audit to assert no `env_keep`
   matches `SUDO_*`.
2. **(hacker H2 HIGH) land the wrapper edit IN THIS WAVE + audit the allowlist VALUE's provenance.** The
   `PACT_BROKER_ALLOWED_UIDS` export does not exist on the live wrapper yet, and custody-verify C2.5 checks the
   wrapper's OWNERSHIP/writability, NOT its CONTENTS (integrity ≠ provenance, NS-2). So: (a) ship the wrapper +
   runbook edit this wave (the claim must refer to a real artifact); (b) add a runbook out-of-band step that
   greps the deployed wrapper for the literal `export PACT_BROKER_ALLOWED_UIDS=<expected>` (a hardcoded literal,
   not interpolated from any host-influenced source); (c) state in §1 that the allowlist VALUE's provenance —
   not just the wrapper file's integrity — is the trust anchor.
3. **(hacker H3 MED + architect A5) strict uid parse, fail-closed.** After the `^[0-9]{1,10}$` regex, require
   `Number.isInteger(n) && n >= 0 && n <= 0xffffffff` (reject the `4294967295` (uid_t)-1 sentinel + zero-padded +
   whitespace). Normalize the allowlist entries AND the caller through the SAME `Number()`+integer path (compare
   `Set<number>`, never mixed string/number). `parseAllowlist` fails the WHOLE parse loudly on a malformed entry
   (never silently drop-and-authorize-the-rest — exact-set discipline). Absent `SUDO_UID` when the allowlist is
   set → reject. Tests: overflow / leading-zero / whitespace / `'a,b'` / `' '` / `'-1'`.
4. **(architect A4 + hacker H4 MED) no-echo reject + loud-unset NOTICE.** Reject = a FIXED `fail('caller not
   authorized')` — NO uid echo, NO allowlist contents (matches broker-sign.js's existing fixed-message,
   no-leak discipline; an echo gives an attacker an allowlist-probing oracle). AND when the allowlist is UNSET,
   emit a one-line **stderr NOTICE** ("broker-sign: caller-auth DISABLED (PACT_BROKER_ALLOWED_UIDS unset) — R2
   open") so a fat-fingered/misconfigured deployment is LOUD, not silently fail-open (NS-9). Tests assert the
   reject stderr is the fixed string (no uid / no allowlist value) + the unset NOTICE fires.
5. **(architect A3 MINOR) opt-in is the right default; make the unset branch explicit + self-documenting** (a
   comment naming it the R2-stays-open opt-in residual, not an accidental fall-through). DoD: the live deployment
   MUST actually set the var (the §7 live caller-auth test gates the wave's done-ness — a gate that ships dark
   narrows nothing).
6. **(hacker H5 LOW) pin SUDO_USER avoidance.** A code comment at the gate: "`SUDO_UID` is sudo-injected from the
   REAL uid; `SUDO_USER` is root-spoofable (`man sudoers`) — NEVER authorize on `SUDO_USER`." (The host is
   non-root — a root host already fails custody-verify C0 — but pin it so a future "simplify to SUDO_USER"
   refactor can't reintroduce the spoof.)
7. **(architect A5) gate-before-key-read CONFIRMED correct** (an unauthorized caller must not even trigger the
   key open / fstat / TOCTOU surface). Keep §5 #6 structural test (unreadable key + unauthorized caller →
   `caller not authorized`, NOT a key error).
8. **(architect A6 + honesty O3/O5) scope + honesty fixes (folded inline):** hold scope to the FLAT uid
   allowlist — do NOT build per-caller-persona (named residual, not built); §8 reworded to "ANCHOR-CHECK
   (pre-flight)"; §2.5 records the BUILD verdict + the honest "current deployment is the redundant branch; FOR
   rests on future conditions" caveat; §0 gains the "as-deployed caller-auth is OFF" residual.

**CONFIRMED-RIGHT (do NOT re-litigate):** `SUDO_UID` (not the root-spoofable `SUDO_USER`) is the correct signal;
gate-before-key-read ordering; the WHAT-can-be-signed residual is loudly named; the opt-in default (always-fail-
closed would break an un-updated deployment for zero marginal security on a SHADOW path). DECLINE was a real
option but loses on the policy-in-the-mechanism + foundation-increment grounds.

## §10 VALIDATE board (post-build) — RECORDED 2026-06-22

3-lens parallel board on the BUILT diff (code-reviewer / hacker-Rule-2a-reprobe / honesty), run as a workflow.
**hacker: PASS; code-reviewer + honesty: PASS-WITH-CHANGES.** Build was GREEN (191) at board time; folds → **192**.

**Headline:** the hacker BUILT ~50 live probes across 9 groups against the BUILT `caller-auth.js` + spawned the
real `broker-sign.js` with crafted env — **the gate HELD against every bypass.** No DENIED `SUDO_UID`
(`+501` / `0x1f9` / `9999999999` / `4294967295` / empty / exponent / trailing-dot / internal-whitespace /
fullwidth-digits / zero-width-space / number-type) reached `allow`; the exact-set discipline held (a malformed
allowlist fails the WHOLE parse to DENY, an accidentally-empty allowlist fails CLOSED, never drop-and-authorize);
`Set` compares Number-vs-Number (no string/number laundering); gate-before-key-read confirmed; reject leaks
neither uid nor allowlist; the DISABLED notice never crosses to stdout (0/20 runs); `SUDO_USER` consulted
nowhere. No CRITICAL/HIGH/MED.

**FOLDED (re-verified → 192 green, eslint clean):**
1. **(honesty MAJOR — the one that mattered) the `SUDO_*` env-audit was SOFTENED.** VERIFY fold #1 demanded an
   ASSERTED check; the runbook had shipped only an eyeball comment listing `SUDO_*` among five token classes.
   Replaced with a real asserting step: `sudo -l -U <host> | grep -iE 'env_keep.*SUDO_' && echo FAIL …` that
   fails loudly if `env_keep` carries `SUDO_*` (the gate's load-bearing premise). A silently-softened fold,
   now landed as written.
2. **(honesty MINOR) the stale broker-sign.js header.** The pre-R2 HONEST SCOPE block still said "Caller-auth
   (SO_PEERCRED / capability tokens) is the orthogonal NEXT frontier, not built here" — contradicting the
   just-built gate (and naming SO_PEERCRED, which the wave deliberately rejected for a sudo-command). Rewritten
   to describe the built coarse uid-level gate + the open WHAT-can-be-signed residual.
3. **(hacker LOW) Unicode-whitespace trim.** `parseUid` used `String.trim()`, which strips the whole Unicode
   whitespace class (NBSP/em-space/BOM) — defense-in-depth only (non-exploitable: sudo overwrites `SUDO_UID`
   with bare digits), but tightened to **ASCII-spaces-only** (`/^ +| +$/g`) so a padded token is rejected, not
   normalized. New regression test (NBSP/tab/BOM → reject; ASCII space → strip).
4. **(code-reviewer LOW) dead code.** Removed the unreachable `out.size === 0` guard in `parseAllowlist` +
   documented the invariant.
5. **(code-reviewer + hacker LOW) ASCII discipline.** The DISABLED-notice string literal (runtime-emitted) +
   my new comments carried non-ASCII em-dashes → replaced with `--` (the pre-existing house-style comments in
   `broker-sign.js` left untouched).

**CONFIRMED-DEFENDED on the BUILT code (hacker live probes — do NOT re-open):** every overflow/padding/type
bypass fail-closed; exact-set allowlist parse; Number-vs-Number Set membership; gate-before-key-read; no-echo
reject + uniform deny timing (no allowlist-boundary oracle); DISABLED notice stderr-only; `SUDO_USER` unused.

**ACCEPTED-residuals (honestly open, NOT worse than documented):** an allowlisted caller still signs an
ARBITRARY `record_id` (R2 WHAT-can-be-signed — per-request auth is the deeper frontier); the opt-in unset default
is DISABLED (R2 fully open until the wrapper sets the allowlist); a directly-invoked (no-sudo) host-forged
`SUDO_UID` is accepted verbatim, but that path has no authorization meaning and the gate rests on sudo's
live-probed overwrite. All SHADOW.

**Net:** the WHO axis is narrowed (coarse uid-level caller-auth, opt-in, fail-closed); R2 WHAT-can-be-signed
stays the named, unbuilt frontier. 192 tests green, eslint clean, all SHADOW.
