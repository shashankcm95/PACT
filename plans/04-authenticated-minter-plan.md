---
lifecycle: persistent
phase: P-minter (require custody for provenance — the honest-narrow scope)
status: BUILT (VERIFY + post-build VALIDATE folded; honest-narrow; 121 tests green; SHADOW; UNCOMMITTED)
created: 2026-06-21
revised: 2026-06-21 (3-lens VERIFY folded — §9; reframed close→narrow per the board + user ratification)
follows: plans/03-coherence-checkpoint.md
---

# P-minter — require custody for provenance (NARROWS; closes only under real separation)

> **Reframed after the 3-lens VERIFY board (§9).** The thesis (integrity≠provenance is key-custody, not
> crypto) survived; the board proved the phase **NARROWS** — it removes the ambient-key hole and names
> the custody contract — but **cannot CLOSE the gap in-process** (physics: a same-uid attacker
> re-exports any in-process key from memory; own-key forgery is U1's, not the minter's). User ratified
> the **honest-narrow** scope: real concrete hardening, no in-process broker pretending to be custody.

## §0 — The honest core (what this phase DOES and does NOT do)

**DOES (real, concrete hardening):**
- Removes the **ambient env-PEM signing default** (`LOOM_EDGE_SIGNING_KEY`) — the concrete hole where any
  same-uid process reads a PEM off env/disk and signs as a persona. After this, signing REQUIRES an
  injected custody `signer` (or an explicit test-only `privateKeyPem`, enforced not to leak into `src/`).
- Names the **custody contract**: a structurally key-free minter abstraction that is the sole supported
  production writer and physically has no path to raw key material.
- Proves **structurally** that the host process, given only the minter seam, has no in-process path to a
  raw key (a grep/capability DoD) — and is HONEST that this is NOT a provenance proof.

**Does NOT (physics / out of scope — stated loudly, not hidden):**
- Does NOT **close** integrity≠provenance in-process. Crypto cannot distinguish a legit sign from a
  same-uid co-forge (same key, same signature). Real closure needs an out-of-band boundary (separate OS
  uid / enclave / HSM) — a *deployment* property, world-anchored, proven OUT-OF-BAND, never in-process.
- Does NOT address **own-key forgery**: a same-uid attacker controlling their OWN registered persona Q
  mints unlimited authentic-as-Q records. That is U1's issuance-cost problem, untouched here.
- Does NOT add a read-side **provenance detector** (crypto can't). The read gate stays unchanged; what
  strengthens is the *custody story behind the keys it already trusts*.
- Ships NO in-process broker (a same-uid child is not custody — ptrace / `/proc/<pid>/mem` / core dumps /
  an unauthenticated signing-oracle IPC). Real custody is a deployment recipe, not v0 code.

**North-star line (consistently applied — title, body, README, DoD):** this phase NARROWS (engineered,
in-process); only real-separation deployment HARDENS (world-anchored). The verb is **"require custody,"
never "close."**

## §1 — The residual, stated precisely (probed)
`resolveSigner` (`edge-attestation.js:71`) signs via EITHER an injected `opts.signer` (custody) OR the
ambient `LOOM_EDGE_SIGNING_KEY` / `opts.privateKeyPem` (same-uid readable). The env default is the hole.
The read gate then accepts the result (valid sig under the registered key) — so "exists + verifies" ⇏
"the legitimate producer minted it."

## §2 — Runtime Probes (verified against the actual repo)
| Claim | Probe | Observed |
|---|---|---|
| `buildFrame` signs via a `resolveSigner` seam (`opts.signer` OR PEM) | `frame.js:22-40` | TRUE |
| Ambient env-PEM signing default exists (`LOOM_EDGE_SIGNING_KEY`) | `edge-attestation.js:41` | TRUE — the hole |
| Verify key has NO env default (per-sender, already hardened) | `edge-attestation.js:48-56` | TRUE |
| `buildFrame` is the SOLE `src/` producer; only tests inject `privateKeyPem` | `grep buildFrame\|privateKeyPem src` | TRUE — clean D1 migration |
| Read gate can't tell a co-forge from a legit sign | `read-gate.js:24-34` | TRUE — crypto-equivalent |
| D3's "out-of-band" proof holds the key IN-PROCESS (proves env-removal, not separateness) | `v0-dod.test.js:125` | TRUE — relabel needed (§9 honesty MAJOR) |
| `appendRecord` requires no sig (store is not a sandbox) | `record-store.js:75-100` | TRUE |

## §3 — Design (honest-narrow; VERIFY folded)

### 3.1 `identity/minter.js` — the structurally key-free custody writer
`createMinter({ signer, personaDid, humanUid })`:
- **throws** unless `signer` is a function (no raw key material; no fall-through to a PEM/env default — the
  architect MAJOR: make the "never holds key" guarantee structural, not a convention).
- **throws** unless `personaDid` + `humanUid` are present, and **binds** them: `mint(spec)` sets
  `srcPersonaDid`/`parentHumanUid` from the binding (rejects a spec that names a *different* persona) —
  so one minter physically cannot mint across roots (closes the throne-by-config, architect/hacker MINOR).
- `mint(spec)` → `buildFrame(boundSpec, { signer })`, passing ONLY `signer` (never spreads caller opts
  that could smuggle `privateKeyPem`). The minter has no code path to a raw key.

### 3.2 Remove the ambient env-PEM default + ENFORCE no relocation (D1 + the hacker MAJOR)
- Delete `|| process.env.LOOM_EDGE_SIGNING_KEY` from `loadPrivateKey` (`edge-attestation.js:41`). After
  this, an env key is IGNORED; signing needs an injected `signer` (custody) or an explicit
  `opts.privateKeyPem` (tests only). Fix the now-stale `resolveSigner` fail-safe comment.
- **Forward-guard (HEURISTIC, not adversarial enforcement — post-build VALIDATE MEDIUM):** a DoD grep-test
  flags any non-test `src/` file outside the seam definitions (`edge-attestation.js`, `keypair.js`,
  `frame.js`) that *literally* passes `privateKeyPem`. It catches an ACCIDENTAL re-introduction by a
  non-adversarial author; a determined relocation (bracket-notation, string-concat, `process.env`,
  `fs.readFileSync`) evades it. The REAL guarantee is the structurally key-free minter (the sole `src/`
  producer) + code review — the grep is just early warning, not a security boundary.

### 3.3 DoD honestly relabeled (the hacker BLOCKER + honesty MAJOR)
The DoD proves exactly two things, and SAYS so: (a) the ambient env default is gone (an env key set +
empty opts ⇒ sign FAILS); (b) the host has no in-process path to raw key material (the minter is
structurally key-free + the grep gate). It explicitly does NOT and CANNOT prove provenance against a
same-uid attacker (a comment states this). No tautological "delete the env path then show the injected
path works" dressed as a custody proof.

### 3.4 Read side — UNCHANGED + the residual stated as loudly as U1/U2 (D3 + honesty MINOR)
`verifiedRecords` is unchanged (no provenance detector — crypto can't). A new loud residual row: READ-SIDE
PROVENANCE IS UNDECIDABLE IN-PROCESS — the gate accepts any record signed under the registered key; it can
never distinguish the legitimate holder from a same-uid co-forge; closed only by write-side custody at a
real boundary. **Rejected alternatives (recorded):** a per-root minter co-signature RELOCATES not closes
(the co-sign key has the identical custody problem + reintroduces a §1.5 seat); read-side
liveness/anti-replay is orthogonal-and-ADDITIVE (raises replay/key-at-rest cost) but does not prove
provenance — out of scope, not dismissed.

### 3.5 Bundled from the checkpoint: the integrated P2/P3 acceptance test
Mint frames via `createMinter` → assert `direct`/`crossVerify`/`creatorStanding` read the real
(minted) write path. (The CONTEST-discriminant debt is DEFERRED to its own focused change — it needs a
`validateRecord` edit and is orthogonal to the minter; bundling it would dilute the minter DoD, architect
MINOR. It stays carried.)

## §4 — Decisions (ratified honest-narrow)
| # | Decision | Status |
|---|---|---|
| D1 | remove the env-PEM default **AND** enforce no `privateKeyPem` in non-test `src/` (grep gate) | RATIFIED |
| D2 | NO in-process broker (a same-uid child is not custody); real separation is a deployment recipe | RATIFIED (honest-narrow) |
| D3 | NO read-side provenance detector; state the read-side residual loudly; record the co-sign/liveness rejections | RATIFIED |
| D4 | minter is structurally key-free (throws) + per-persona bound (no throne by config) | RATIFIED (architect MAJOR) |

## §5 — Invariants + honest residuals
| INV | Obligation | How |
|---|---|---|
| INV-14 | authenticated read | unchanged gate; the WRITE custody now backs it |
| §1.5 no throne | per-persona-bound minter; no central authority | minter binds one persona; holds no key |
| SHADOW | nothing gates | no weight changes; write-side custody only |
| north-star | engineered NARROWS; world-anchored HARDENS | verb is "require custody," never "close" |
| residual (loud) | same-uid in-process custody OPEN by physics; own-key forgery OPEN (U1); read-side provenance UNDECIDABLE in-process | stated in headers + residual tests |

## §6 — Test plan (TDD) — `test/unit/minter.test.js` + extend `test/acceptance/v0-dod.test.js`
- `createMinter` throws on absent/non-fn `signer`; throws on absent `personaDid`/`humanUid`; throws on
  `{privateKeyPem}` (no raw-key path).
- `mint()` produces a frame that `receiveFrame` accepts (signed via the injected signer); binds
  src/parent to the minter's persona; rejects a spec naming a different persona.
- **env default removed**: with `LOOM_EDGE_SIGNING_KEY` SET, `buildFrame({...}, {})` FAILS (env ignored).
- **structural no-raw-key**: a grep test — no non-test `src/` file outside `edge-attestation.js`/`frame.js`
  references `privateKeyPem`.
- **DoD honesty**: a test/comment asserting the DoD proves env-removal + structural-key-freedom, NOT
  provenance (own-key forgery + same-uid in-process remain open).
- integrated acceptance: minted frames → non-floor `direct`/`crossVerify`/`creatorStanding` reads.
- residual-is-real: a same-uid path with the registered key still produces an accepted record (own-key
  forgery is open) — asserted, not hidden.

## §7 — Honest residuals (loud)
- **Same-uid in-process custody** — OPEN by physics; HARDENS only under real OS/enclave/HSM separation.
- **Own-key forgery** — OPEN (U1 issuance-cost); the minter does not address it.
- **Read-side provenance** — UNDECIDABLE in-process (D3); closed only by write-side custody at a boundary.
- **Weights stay SHADOW** — the minter is the *precondition* for ever leaving SHADOW, not the exit.

## §8 — Definition of Done
Green `minter.test.js` + extended `v0-dod` + full suite still green (probe count at build start — 113 at
`7a4197c`); env-PEM signing default removed (grep `LOOM_EDGE_SIGNING_KEY` in `loadPrivateKey` ⇒ gone); the
grep gate passes (no `privateKeyPem` in non-test `src/` outside the seam); the minter is the sole `src/`
producer and is structurally key-free; integrated acceptance landed; README/title reframed close→require
(the carried-residue section updated to "custody-required precondition, NOT the close"); §9 (VERIFY) +
§10 (VALIDATE) folded.

## §9 — VERIFY result (3-lens pre-build board, 2026-06-21)
**Board:** architect (BUILD_GRADE, 2 design MAJORs) + hacker (NEEDS_REVISION, 2 BLOCKERs + 3 MAJORs, live
probes) + honesty (NEEDS_REVISION, 4 MAJORs). The thesis (custody-not-crypto) held; the board reframed
the phase close→narrow. **Forks ratified honest-narrow (§4).**
- **Folded (BLOCKER/MAJOR):** the DoD was a tautology / holds the key in-process (PROBE1 `forged===legit`)
  → relabel: proves env-removal + structural-key-freedom, NOT provenance (§3.3). Own-key forgery wide
  open + unstated (PROBE3) → stated out-of-scope/U1 (§0/§7). Kept `privateKeyPem` silently re-opens
  Option-A → enforce with a grep gate (§3.2). Title/README/"close" overclaim → reframe to "require
  custody (narrows)" (§0, §8). Minter "never holds key" was convention → structural throw (§3.1/D4). The
  in-process/same-uid broker MODELS not achieves → NO broker shipped (D2).
- **Folded (MINOR):** read-side residual stated as loudly as U1/U2 (§3.4); per-root co-signature +
  liveness/anti-replay rejections recorded (§3.4); per-persona minter binding closes throne-by-config
  (§3.1); CONTEST-discriminant un-bundled to its own change (§3.5).
- **False positive (premise-probed, not propagated):** honesty NIT claimed `v0/` path prefixes were
  wrong — they are CORRECT relative to the repo root (the code lives at `<repo>/v0/...`); the lens had
  cwd=`v0`. Disregarded.

## §10 — post-build VALIDATE result (3-lens board, 2026-06-21)

**Board:** hacker (adversarial, LIVE PROBES) + honesty (claim-vs-evidence) + code-reviewer (correctness).
**Independence: fully independent 3/3 PASS.** The hacker + honesty lenses ran as independent agents and
both PASSED. The correctness lens initially could not be spawned (sustained API 529 overload, 3 attempts)
and was self-performed (read + 6 edge-case probes + the env-removal diff, PASS); once the API recovered it
was **re-run as an independent agent against the committed `2b5fe1b`** and also PASSED (0 BLOCKER/MAJOR;
1 MINOR — a comment-phrasing nit on the snake_case guard, empirically inert, "no fix required" — matching
the self-review exactly). The self-performed pass is retained here for the honest record; the independent
re-run supersedes it.

- **hacker: PASS** — 7 live `/tmp` probes against the REAL built modules, **0 bypasses**. Confirmed: the
  env default is genuinely dead (no `process.env` read remains; `buildFrame({},{})` fail-closed even with
  the env set); `createMinter` is structurally key-free + per-persona bound (all smuggle/override attempts
  throw or are inert); own-key forgery is correctly stated OPEN (1000/1000 own-key mints accepted — the
  honest U1 residual, asserted in code+docs). Findings folded: **[MEDIUM]** the grep gate is a HEURISTIC
  forward-guard (bracket-notation / string-concat / `process.env` / `fs.readFileSync` evade it), not the
  "enforcement" the plan claimed → relabeled (§3.2 + the test name/comment). **[LOW]** `createMinter`
  tolerated a stray `privateKeyPem` alongside a valid signer → now rejects ANY non-`{signer,personaDid,
  humanUid}` opt (structural). **[LOW]** the binding guard missed snake_case → now rejects camel + snake.
- **honesty: PASS (Grade A)** — the central hazard (a doc/test implying the gap is closed) is absent
  across all four doc surfaces + every test comment; "close" is everywhere negated or conditioned;
  world-anchored-HARDENS vs in-process-MODELS is consistent; the D3 test states its no-provenance ceiling;
  own-key forgery + read-side-undecidable residuals are loud and backed by a real residual test. Only
  NIT: "121 tests green" is count-accurate but the green-pass was unverifiable from its (Bash-less)
  tools — the orchestrator confirmed 121 green firsthand.
- **code-reviewer (self-performed): PASS** — `createMinter` is faithful to §3.1; 6 edge-case probes green
  (`createMinter(undefined)` throws cleanly; extra-opt rejected; legit construct not falsely rejected;
  `mint` binds own persona; snake_case override rejected; the mixed camel-match/snake-evil case is INERT
  — no identity leak into the frame body); the env-removal `git diff` is surgical (only the
  `|| process.env.LOOM_EDGE_SIGNING_KEY` fallback dropped); full suite **121 green**, no regression.

**Folds re-verified: 121 green.** convert.js / weak-flag.js untouched by this wave.
