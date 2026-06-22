---
lifecycle: persistent
created: 2026-06-22
phase: CI/quality-gates (borrow the plugin's gates PACT skipped)
status: PLAN (pre-VERIFY)
---

# 06 — CI + quality gates (borrow what the substrate skipped)

## §0 Scope (agreed with the user: minimal high-value CI = test-runner + eslint)

PACT borrowed the kernel `_lib` CODE (canonical-json, path-canonicalize, atomic-write, record-store,
edge-attestation) but **none** of the toolkit's quality gates — there is no `.github/`, no eslint, no
test runner, no `npm test` entrypoint. The 137 tests are real + green but run ONLY when invoked by hand.

This wave borrows the **two highest-leverage gates**, mirroring the toolkit's OWN pattern (zero committed
deps; `npx --yes <tool>`; pure-node test loop with a vacuous-pass guard):

1. a **pure-node test runner** (`test/run.js`) that discovers + runs every `v0/test/**/*.test.js`, with a
   **count==0 vacuous-pass guard** (the toolkit's hard-won CI lesson: a renamed/empty test root must FAIL
   the job, never pass green having run nothing).
2. **eslint** (`eslint.config.js`, hand-rolled recommended — zero committed dep, run via `npx --yes`).
3. a **GitHub Actions `ci.yml`** that runs both on push/PR, on a **node 20 + 22 matrix** (PACT was
   developed on 22; the 20 leg catches any 22-only API the substrate silently relies on).
4. a **minimal `package.json`** (scripts only, NO dependencies) for `npm test` / `npm run lint` ergonomics.

**OUT of scope (deferred, lower leverage — named, not silently dropped):** markdownlint (PACT's `.md` is
internal design docs), `.coderabbit.yaml` (only pays off once PACT uses PRs), the K12 layer-boundary lint,
json-validate. These are follow-ups; this wave is the test+lint floor.

**Why mirror the toolkit's zero-dep `npx` pattern (not a package-lock + node_modules):** PACT is a TRUST
substrate — minimizing its own committed dependency/supply-chain surface is philosophically aligned, and
its runtime is already pure-node zero-dep. Dev tooling stays ephemeral (`npx --yes` fetches eslint at CI
time only); nothing enters the repo. Runtime stays zero-dep.

## §1 Borrow decisions

| Decision | Choice | Why |
|---|---|---|
| eslint config form | hand-rolled flat `eslint.config.js` (commonjs, recommended inline, zero `require`) | mirrors toolkit `eslint.config.js`; runs under bare `npx --yes eslint@9` (no `@eslint/js` dep) |
| eslint ruleset | the 60 `eslint:recommended` rules + `no-unused-vars` `^_`-ignore | the toolkit's exact set; PROBED → 0 violations on PACT v0 (§4) |
| test runner | pure-node `test/run.js`, child-`node` per file, count==0 guard | the runtime is zero-dep; a node runner is the canonical `npm test` target + the CI step |
| CI matrix | node 20 + 22 | 22 = dev baseline; 20 = LTS leg that catches a 22-only API reliance |
| package.json | scripts only, ZERO deps | `npm test`/`npm run lint` ergonomics without a dep tree or a lock to maintain |
| pin eslint major | `eslint@9` in the npx call + CI | reproducibility (a future eslint@10 recommended-set drift won't silently change the gate) |

## §2 Files

| File | Change |
|---|---|
| `test/run.js` | NEW — pure-node runner: find `v0/test/**/*.test.js` → run each via child node (capture+echo stdio) → **parse each `[name] N passed, M failed` summary** → a file passes ONLY if exit==0 AND summary present AND failed==0 AND executed>0 → file-`count==0` guard AND per-file-executed>0 AND total>0 (closes the per-file zero-test hole) |
| `v0/test/unit/layering.test.js` | NEW — directional DAG tripwire: `lib/` imports no upper layer; `atms/` ⊅ trust/grounding; `trust/` ⊅ grounding (the one-way DAG was guarded by ZERO directional tests — the existing grep asserts SHADOW, not direction) |
| `eslint.config.js` | NEW — adapted from toolkit (commonjs, node globals, 60 recommended + `^_` unused-ignore, ignores node_modules/.git) |
| `.github/workflows/ci.yml` | NEW — `test` job (matrix 20+22, `node test/run.js`) + `lint` job (`npx --yes eslint@9 .`) |
| `package.json` | NEW — name/version/scripts(`test`,`lint`), zero deps, `"private": true` |
| `README.md` | EDIT — add a short `## Development` (how to run tests + lint + the CI) |

## §3 Two CI-specific disciplines (the toolkit learned these the hard way — borrow them too)

1. **Vacuous-pass guard (toolkit ci.yml `count -eq 0`):** the runner MUST fail if it matched ZERO test
   files (a path rename / cwd mismatch must be a LOUD red, never a silent green having run nothing). A
   test asserts the guard fires.
2. **Clean-environment dogfood (toolkit rule H.7.15):** CI infra that only runs at CI time has twice
   shipped broken because it was never run on a fresh checkout. Before declaring done, run the EXACT CI
   commands against a clean **rsync export** (excluding `node_modules`/`.git`) in `/tmp` — NOT `git archive`,
   which omits the still-uncommitted CI files and would false-green on a tree missing them. Assert the file
   inventory in the export, then `node test/run.js` + `npx --yes eslint@9 .` and confirm green there.

## §4 Runtime Probes (verified against the repos, not memory)

| Claim | Probe | Observed |
|---|---|---|
| PACT has no CI / eslint / package.json / runner | `ls .github eslint.config.* package.json` | CONFIRMED — none exist |
| `.gitignore` already ignores `node_modules/` | `cat .gitignore` | CONFIRMED — `node_modules/`, `.DS_Store`, `*.log` |
| toolkit pattern = zero-dep `npx --yes` + hand-rolled eslint | read toolkit `eslint.config.js` + `ci.yml` | CONFIRMED — `npx --yes`, no `@eslint/js` require, no package.json in toolkit |
| **eslint:recommended → how many PACT violations?** | `npx eslint@9 --config <adapted> "v0/**/*.js"` | **0 violations, exit 0** — adoption needs no code fixes |
| node/npm available | `node -v / npm -v` | node 22.22.0 / npm 10.9.4 |
| 137 tests pass via per-file `node` | full-suite loop (prior wave) | CONFIRMED — 127 unit + 10 acceptance |

## §5 DoD

> Final built state: **11 test files · 148 tests green** (137 original + 4 layering + 1 layering-precondition
> + 6 run-guard regression). The "137 / 9 files" in §4 was the PRE-CI snapshot.

- [x] `test/run.js` runs all 148 tests green AND fails loudly on per-file-zero / file-count==0 — proven by
      a COMMITTED regression test (`run-guard.test.js`), not just a manual probe.
- [x] `eslint.config.js` lints `.` with **0 violations**, NON-VACUOUSLY (46 files linted; an injected
      violation was observed to go RED, then reverted).
- [x] `ci.yml` valid YAML; `test` (matrix 20+22) + `lint` jobs; the warm-loop fails closed if all fetches fail.
- [x] `package.json` (zero deps) gives working `npm test` + `npm run lint`.
- [x] **clean-env dogfood (H.7.15):** the exact CI commands pass against a `/tmp` **rsync** export (NOT
      `git archive` — which would omit the still-uncommitted CI files; inventory asserted: 11 files / 148 tests).
- [~] node-20 leg: asserted by grep (0 node-22-only APIs) — UNPROVEN until the first real Actions node-20 run.
- [x] nothing in PACT's runtime gains a committed dependency (no lock, no tracked node_modules, no `dependencies`).

## §6 VERIFY board (pre-build) — RECORDED 2026-06-22

Foreground 2-lens board (architect + honesty-auditor; orphan-safe per `WORKFLOW-ORPHANING-BUG.md`).
architect: **PASS-WITH-CHANGES**; honesty-auditor: **NEEDS-REVISION** (a real CRITICAL). Both converged on
the meta-pattern: *a green that proves absence-of-failure, not presence-of-work.* All folded pre-build:

1. **(honesty CRITICAL) per-file zero-test hole.** A file whose `test()` is never called (typo / early
   return) exits 0 with `pass=0,fail=0`; the file-`count==0` guard (count==9) is satisfied → GREEN having
   asserted nothing. FOLD: the runner parses each child's `[name] N passed, M failed` line; a file passes
   ONLY if exit==0 AND the summary is present AND failed==0 AND executed>0; plus total>0. Every PACT test
   file emits that line (verified across all 9), so the signal exists — the naive runner threw it away.
2. **(honesty HIGH) eslint "0 violations" unfalsified.** Could mean "linted 0 files" (flat-config + a
   glob that matched nothing). FOLD: the BUILD proves non-vacuity two ways — confirm eslint linted >0
   files (`--format json` length), AND inject a deliberate violation → watch the gate go RED → revert.
3. **(honesty HIGH) clean-env `git archive` gap.** `git archive` omits untracked/gitignored/`export-ignore`
   files — at build time the NEW CI files aren't committed, so the archive would test a tree MISSING them
   and false-green. FOLD: `rsync` the working tree (exclude `node_modules`/`.git`) to `/tmp` (captures the
   uncommitted new files) AND assert the inventory there (9 test files; total==137; the CI files present).
4. **(architect HIGH) npx socket-hang flakiness.** The toolkit hit + fixed this; the plan inherited it. A
   flaky-red gate trains the maintainer to ignore CI. FOLD: split fetch from run — a RETRIED
   `npx eslint@9 --version` warm-up (network-sensitive, harmless to retry) → then `npx eslint@9 .` against
   the warm cache (exit 1 = a REAL violation, never retried). Carry the WHY in a job comment.
5. **(architect MEDIUM) the layer DAG is guarded by ZERO directional tests** — the cited grep asserts the
   SHADOW/no-`mayGate` property, NOT import direction. FOLD: correct the plan's framing + add a minimal
   directional tripwire (not the full K12 port — YAGNI for 35 files).
6. **(architect MEDIUM) runner stdio + (MEDIUM) no `node --test`.** Capture+echo child stdio (debuggable
   red) while still parsing the summary; the `test` script is `node test/run.js` (NOT `node --test`, which
   vacuous-passes on imperative-assert files); CI runs the runner, never a 2nd copy of the loop.
7. **(architect LOW) `permissions: contents:read` + `concurrency` cancel-in-progress.** FOLD both.
8. **(honesty MEDIUM) bound the green.** §0: green = node-syntax-clean (eslint:recommended) + the existing
   SAME-PROCESS unit suite on node 20+22 — NOT correctness/integration/type/real-path coverage.
9. **(both LOW) node-20 EOL note; no-committed-dep via `git diff` probe (empty `dependencies`, no lock,
   no tracked node_modules).** FOLD.

**CARRIED:** zero-dep `npx` mirror is the right call (architect); node 20+22 matrix justified (grep-probed:
0 node-22-only APIs); exit-code-trust + per-file child-process is the right runner model.

## §7 VALIDATE board (post-build) — RECORDED 2026-06-22

Foreground 2-lens board (code-reviewer + honesty-auditor; orphan-safe). Both: **PASS-WITH-CHANGES**. Both
INDEPENDENTLY hit the same must-fix — the layering tripwire could itself pass vacuously (the "absence reads
as success" class the VERIFY board hunted, one directory deeper). Folded (suite → 148 green after):

1. **(code-reviewer MED + honesty HIGH, convergent) layering tripwire vacuous-pass.** A renamed/emptied
   layer dir → `filesIn` []→ `offenders` [] → `deepEqual([],[])` greens, guarding nothing. FOLD: a
   precondition test asserts every DAG layer dir is non-empty before the directional assertions run.
2. **(code-reviewer HIGH) ci.yml warm-loop false-green.** A `for` loop's exit code is its last body command
   (the `echo`), so all-3-fetches-fail would exit 0. FOLD: explicit `ok` flag → `exit 1` if all fail.
3. **(honesty LOW → committed) runner-guard regression test.** PROBE 2 was a manual inject-and-revert; the
   DoD claimed "a test proves the guard." FOLD: `run-guard.test.js` invokes the REAL runner via
   `PACT_TEST_DIR` against fixtures (healthy / zero-test / failing / no-summary / zero-files / mixed) and
   asserts the exit codes — the guard is now permanently regression-tested.
4. **(honesty MED) runner self-report trust boundary** stated in the run.js header + README: the runner
   counts executed tests from each child's FIRST-PARTY summary; it catches the realistic zero-executed case,
   not a forged non-zero count (bounded by the shared `test()` harness).
5. **(honesty LOW) "CI runs on push/PR" over-claim** softened to "will run (committed; first Actions run
   PENDING)" in README + this plan — the workflow is committed but has NOT yet executed on real Actions
   (the node-20 leg in particular is grep-asserted, not run: the committed≠proven-on-the-real-harness gap).
6. **(honesty LOW) count drift** 137→148 / 9→11 reconciled (§5 + README).
7. **(code-reviewer LOW) spawnSync maxBuffer** 1MB→10MB + a clear spawn-error message (a truncated child
   would otherwise fail with a confusing "no summary").

**CARRIED (confirmed clean / accepted):** the per-file zero-test guard genuinely closes all 4 shapes
(zero-test / require-throw / signal-kill / nonzero-exit — code-reviewer + honesty traced each); the
clean-env rsync dogfood is MORE faithful than git-archive (captures the uncommitted CI files); eslint
non-vacuity proven (46 files; injected-violation→red); SUMMARY_RE lastIndex reset correct; node-20 compat
grep-clean; layering `filesIn` non-recursive is YAGNI (all 8 layers flat today). **Honest residual:** the
CI is proven on a clean TREE (local, macOS/node-22), NOT yet on the real RUNNER (ubuntu/node-20/fresh npx);
the first GitHub Actions run closes that.
