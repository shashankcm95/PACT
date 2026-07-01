---
lifecycle: persistent
created: 2026-07-01
audience: plan authors (this + future sessions) — the codified, already-practiced PACT plan conventions
---

# PACT plan conventions

> `plans/27` Phase 3 deliverable. This doc **codifies conventions PACT plans already follow** — it does not
> invent new process. The runtime-probe discipline below is present in ~16 existing plans (`00`, `02`, `04`,
> `05`, `06`, `08`, `09`, `10`, `11`, `12`, `13`, `14`, `15`, `24`, `26`, `27`); this makes the implicit
> convention explicit + discoverable. It is **advisory-strong, not a hard gate** — PACT already probes per
> wave; there is no CI enforcer (deliberately — see "Why advisory" below).

## The Runtime Probe convention (the core)

**A present-tense CURRENT-STATE claim in a plan must cite a PROBE that verified it against the actual
repo / OS / live deployment — never from memory.** A "current-state claim" is any assertion the plan's
design leans on: "file X exists", "`edge-attestation.js:14` has no env fallback", "`ptrace_scope` is 2 on
the box", "the store re-derives the id on read", "CI gate W is present".

Two forms, both in live use:

- **Inline** — a `Probe:` field next to the claim:

  ```markdown
  - **Transfer closure is shallow + clean.** Probe: `grep require() across the 3 cores` -> only node core
    + the 3 intended leaves; no lateral imports.
  - **The env-PEM signer is integrity-only (load-bearing caveat).** Probe: `edge-attestation.js:14` ->
    `createPrivateKey(env.LOOM_EDGE_SIGNING_KEY)` with no verify-key binding.
  ```

  (Real examples: `plans/00-v0-build-plan.md:170,179`.)

- **A dedicated section** — `## §N Runtime Probes`, listing each `(claim, probe, observed result)` tuple.
  Every plan whose design hinges on current-state claims carries one. (Real examples: `plans/26 §7`,
  `plans/12 §6`, `plans/13 §5`, `plans/24 §1`.)

### Honest labeling (part of the convention)

The section header states the EVIDENCE BASIS honestly, so a reader knows how much to trust it:

- `verified against the actual repo, not memory` — a code/grep probe at plan time.
- `firsthand — this session, against the repo NOW` — run in the authoring session (freshest).
- `verified against the OS / live deployment, not memory` — an OS/runtime probe (e.g. a custody dogfood).
- `evidence tiers labelled honestly` — when probes mix strengths, label each tier (see `plans/26 §7`).

A probe result **decays** like a stale line number: a claim probed three plans ago may no longer hold.
Re-probe at point-of-use rather than trusting a frozen result — this mirrors the toolkit's status-decay
discipline (`rules/core/workflow.md`).

### PACT's highest-value probe class: deployed-module-sha-match

PACT's live dogfoods (R1 / R2 / R-heap custody legs) run against a **separately-deployed broker** — so the
single most load-bearing probe class is **"the module under test on the deployed box is the sha I reviewed."**
A design that reasons about `broker-sign.js` behavior is only sound if the deployed `broker-sign.js` matches
the reviewed one. When a plan claims a deployed-runtime behavior, its probe should pin the deployed module's
sha (or re-run the leg firsthand), not reason from the local tree alone.

## Why advisory, not a hard gate

The toolkit enforces the analogous discipline via a `/verify-plan` architect check (Check #9 FLAGs un-probed
runtime claims). PACT deliberately keeps it **advisory**:

1. **PACT already probes per wave** — the convention is de-facto satisfied (16+ plans), so a hard blocker
   would gate an already-healthy practice (the `plans/27` critique rated this LOW for exactly this reason).
2. **No plan-CI** — PACT has no plan-schema validator; adding one for a single advisory convention is
   disproportionate (KISS / YAGNI).
3. The real enforcement is the **per-wave VALIDATE** (the 3-lens board premise-probes runtime claims against
   the code + builds live probes per Rule 2a) and the **pre-PR CodeRabbit gate** — both catch an un-probed
   claim downstream. This doc raises author awareness earlier; it does not replace those.

## Related plan conventions (the living-plan pattern)

A PACT plan is a **living artifact**, not a frozen spec — it accretes as the wave runs:

- `## Runtime Probes` — the current-state claims + their probes (above).
- `## §N VALIDATE result` / `## Phase-N result` — the 3-lens verdicts + folded findings, appended at wave
  close (see `plans/27` Phase 2 / Phase 2b result sections).
- **Named residuals** — anything scoped OUT is NAMED in-plan (no silent caps), with an honest severity.
- **NS-9 honesty** — a NARROW is never written up as a hardening/closed; only a world-anchored out-of-band
  signal HARDENS (`PACT-NORTH-STAR.md`).

## When it applies / when to skip

- **Applies** — any plan making a current-state claim its design acts on (a file/line/behavior/gate assertion).
- **Skip** — FUTURE-state claims ("PR-3 WILL add X"); pure-design claims with no runtime referent ("the
  simplest factoring is Y"); a claim already backed by a same-session probe cited elsewhere in the plan.
