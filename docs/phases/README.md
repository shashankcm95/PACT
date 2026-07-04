# Implementation phases — how we build without drifting

This directory is how PACT gets built, phase by phase, while staying true to the [PRD](../PRD.md). It exists
so "where are we / what's next" is always answerable at the task grain, and so drift from the product intent is
caught at every phase boundary instead of accumulating silently.

> **PACT bridge (overlay adoption).** PACT already has a mature per-wave task-doc store: [`plans/`](../../plans/)
> (40+ wave docs, each carrying its VERIFY/VALIDATE folds) and a decision ledger: [`docs/FORKS.md`](../FORKS.md).
> This hub is the **status-at-a-glance overlay + the anti-drift loop** laid over them — it does **not** move the
> plans. The existing `plans/NN-*.md` files *are* the historical phase task-lists. Going forward, a **new** phase
> uses [`phase.template.md`](phase.template.md) here (and may still land its detailed wave notes under `plans/`).

## The three layers

| Layer | File(s) | Role | Mutability |
|---|---|---|---|
| **Anchor** | [`docs/PRD.md`](../PRD.md) (defers to [`PACT-NORTH-STAR.md`](../../PACT-NORTH-STAR.md)) | What the project is, why, the principles, the phase order. | Stable; corrected only by a **dated accretion** when reality diverges. |
| **Implementation** | `docs/phases/phase-N-*.md` (+ the existing [`plans/`](../../plans/)) | The task list for one phase — a living checklist. | Living; checked off, closed with a reconciliation. |
| **Decisions** | [`docs/ADRs/`](../ADRs/) (bridging [`docs/FORKS.md`](../FORKS.md)) | Why we chose X over Y, per wave. | Immutable; a new ADR supersedes. |

## The loop (how we don't drift)

1. **Scope** — a phase doc's *Objective* + *Scope* are lifted from [`docs/PRD.md`](../PRD.md) §9. If the PRD (or
   the north star) is silent or ambiguous about the phase, fix the anchor **first** — it is the anchor, not the
   phase doc.
2. **Work** — check off the task list (Build → Test → Validate). The checkboxes + the `Status` header are the
   visibility; git history is the audit trail.
3. **Close + reconcile** — before a phase is `Complete`, fill its *Reconciliation with the PRD* section: does the
   implemented list match the anchor's intent? Record any drift. **If reality diverged, update the anchor** (a
   dated accretion in the PRD, or an amendment to the north star). Record or fold an ADR (or a `FORKS.md` entry).
4. **Re-evaluate + scope next** — compare the implemented list against the PRD's *next* phase, scope the next
   phase doc, and adjust the roadmap if this phase changed the sequence.

**The anti-drift guarantee:** every phase re-grounds in the anchor, and a phase cannot close without a
reconciliation diff — so divergence is surfaced and corrected at each boundary, never carried forward unseen.

## Status at a glance

PACT's shipped phases are grouped as five **eras** (the PRD §9 roadmap). Each era's detailed task-lists +
VERIFY/VALIDATE folds live in the linked `plans/` range; its decisions live in `FORKS.md` / the plan bodies.

| Phase (era) | Status | Task docs | Decision record |
|---|---|---|---|
| Era 1 — buildable node | ✅ Complete (SHADOW) | [`plans/00`–`06`](../../plans/) | `plans/03` coherence checkpoint |
| Era 2 — custody dogfoods (R1/R2-WHO/R2-WHAT) + Merkle audit | ✅ Complete (3 HARDENs) | [`plans/07`–`17`](../../plans/) | [`FORKS.md`](../FORKS.md) FORK-1/2/3 |
| Era 3 — U1 issuance-stake (S1–S5) + R-heap live run | ✅ Complete (+ HARDEN #4) | [`plans/18`–`26`](../../plans/) | `plans/25` coherence checkpoint 2 |
| Era 4 — toolkit→PACT borrow arc | ✅ Complete (SHADOW/DARK) | [`plans/27`–`29`](../../plans/) | `plans/27` phase-close |
| Era 5 — provenance arc (sigma_root + broker-signing + read-filter) | ✅ Complete (SHADOW) | [`plans/30`–`40`](../../plans/) | [`FORKS.md`](../FORKS.md) + `plans/39-40` |
| ▶ Next — the fork (operator deploy / 5th-leg / U2 / network / Embers) | ○ Proposed (PRD §9) | *scope a `phase-N-*.md` when started* | — |

## The phase-doc template

Each `phase-N-*.md` carries: a **header** (`Status`, `Realizes` the PRD phase, `Depends on`, `Mode`); an
**Objective** (lifted from the anchor); a **Scope** (IN / OUT); grouped **Tasks** (`Build` / `Test` / `Validate`
/ `Operator-external — tracked, not us`) as `- [ ]` checkboxes; a **Definition of done**; a **Reconciliation
with the PRD** (filled at close); and **Open questions**. See [`phase.template.md`](phase.template.md).

## Conventions

- **Security-sensitive phases run a multi-lens review** before close (correctness + adversarial +
  claim-vs-evidence), findings folded — PACT's standing per-wave discipline.
- **Track what you don't execute.** External/operator tasks (the cross-uid deploy, key arming, root-key
  attestation, third-party PRs) are listed **for visibility but executed by the operator** (NS-7), not the build
  session — flag them so.
- **Narrowed ≠ closed (NS-9).** A phase that builds SHADOW mechanism records it as a *narrow*, never a *harden*;
  only a world-anchored signal (PRD §8) hardens.
- **Mark proposed vs committed.** A phase doc graduates a *proposed* PRD phase into a *concrete* plan when it is
  started; until then the PRD roadmap carries it as proposed.
