# Decision records (ADRs)

Why PACT chose X over Y, per wave. Immutable once accepted — a new ADR supersedes an old one; never rewrite an
accepted record. An ADR is the **Decisions** layer of the project-docs convention (the
[phases hub](../phases/README.md) is the Implementation layer): the [PRD](../PRD.md) says *what + why + order*,
a phase doc says the *steps*, and an ADR records the *decisions* made while doing them.

> **PACT bridge (overlay adoption).** PACT's decision history to date lives in two existing places, which this
> directory does **not** migrate:
>
> - **[`docs/FORKS.md`](../FORKS.md)** — the **fork ledger**: at each decision fork, the full option set, the
>   chosen branch (with rationale), and the deferred-with-a-home / rejected branches. This is PACT's
>   ADR-equivalent for the decisions made so far (FORK-1/2/3 + the REJECTED list).
> - **[`research/`](../../research/)** — the deeper research verdicts that grounded those decisions (e.g.
>   `research/24` the U2 feasibility verdict, `research/10` the build-vs-borrow synthesis).
>
> Going forward, a **new** standalone decision uses [`ADR.template.md`](ADR.template.md) here, numbered
> `NNNN-<slug>.md`. A decision that is genuinely a *fork* (option set + chosen + deferred) may instead accrete a
> `FORKS.md` entry — pick the shape that fits, and cross-link. The north star §5 remains the terse canon of
> decided/rejected directions; an ADR or FORK entry that changes a decided direction must also amend the north star.

## Index

| ADR | Title | Status | Supersedes |
|---|---|---|---|
| [0001](0001-fail-closed-arming-manifest.md) | Fail-closed arming manifest for the SHADOW→armed transition | proposed | — |

**Existing decision records (pre-convention, bridged):** [`docs/FORKS.md`](../FORKS.md) — FORK-1 (next frontier
after R2-WHAT), FORK-2 (which trust-hardening sub-direction first), FORK-3 (post-U2-seam deferred branch), + the
REJECTED branches (transferable token, global PageRank, standalone persona, vendor-exfil).

## When to write one

- A meaningful, non-obvious decision or design fork resolved during a phase — record it at the phase's close.
- A decision that changes a *direction the north star §5 decided* — write the ADR (or FORK entry) **and** amend
  the north star with a dated rationale; never let the build quietly diverge from the anchor.
- Skip for a mechanical or obvious choice — an ADR is for the decisions a future reader would otherwise
  re-litigate.
