---
lifecycle: persistent
phase: proto-planning — post-build VALIDATE of the v1.1 spec-rev
created: 2026-06-21
status: validated (3-lens HETS board; all findings folded into PACT-spec-v1.1.md §13)
---

# PACT-spec-v1.1 — post-build VALIDATE (3-lens HETS board)

> After `PACT-spec.md` (v1.0) was authored into the build-grade **`PACT-spec-v1.1.md`** (folding
> the 11 mechanical + 2 design decisions from `research/19`), a 3-lens HETS board validated the
> **draft itself** against the research corpus — the per-wave `plan → verify → build → VALIDATE`
> discipline applied to a spec. This is the record. **All findings were folded back into the spec
> (§13 changelog + inline "(v1.1 VALIDATE §13)" markers).**

## Consensus: BUILD-GRADE after folding the board (2 BUILD_GRADE + 1 NEEDS_REVISION, all resolved)

| Lens (persona) | Verdict | One-line |
|---|---|---|
| **PM / delivery-fidelity** (`honesty-auditor`) | **BUILD_GRADE** | all 11 folds genuine (not name-dropped); both DECIDEs flagged; B2/B3 in v0; no v1.0 overclaim reintroduced; changelog accurate. MINOR-only. |
| **Software-architect** (`architect`) | **BUILD_GRADE** | v0 buildable with no undecided choices; INV-13..18 mutually consistent; ADOPT-vs-BUILD coherent. 2 MAJORs (both fold-gaps, not blockers). |
| **Adversarial-security** (`hacker`) | **NEEDS_REVISION** | structure sound, no landmine reintroduced; but 3 "fixed" mechanisms had residual holes AS WRITTEN, 2 of them inside v0. |

The hacker was right to withhold BUILD_GRADE: two of its three MAJORs land **inside v0** (the
FALSIFY/REPAIR pair is B2 = v0-mandatory), so they had to be resolved before any build. They now are.

## The MAJOR findings (all folded)

### H-MAJOR-1 · INV-13 (never-counts-nodes) vs `DISJOINT_PATHS ≥ k` (also A-MAJOR-2, §6.4)
`DISJOINT_PATHS ≥ k` (§5.1) and `DISJOINT_PATH_COUNT` (§6.2) are literally counts, while INV-13
forbids any boundary tallying confirmation count. An implementer reading the gap the obvious way
mints k cheap roots + k cheap probation edges → passes a *count* of disjoint paths by construction
(the §4.5.1 fabrication) → re-opens the Sybil/quorum regime INV-13 exists to forbid. The architect
independently flagged the same seam at §6.4 ("RE-VERIFIES before propagating" under-specifies WHAT
crosses — a re-checked record, or a rolled-up count?).
**FOLD** → §5.3 reconciliation paragraph: disjointness is a *structural per-path-bar property*
(each path independently clears the unforgeable bar), **not** a peer-tally; what crosses any gate
(incl. a §6.4 layer) is a single re-checkable conditional-validity record (Proof-Carrying Data),
never an aggregated count; v0 DISJOINT_PATHS is topological-WEAK ⇒ informs, never gates (INV-16).
Plus inline clarifying comments at §5.1, §6.2, §6.4.

### H-MAJOR-2 · REPAIR had no authz + no anti-ping-pong (v0)
FALSIFY required `AUTHORIZED_TO_FALSIFY`; REPAIR required only "refutation clears the bar against
the counterexample" — no authz, no signed record, no nogood-consistency. A premise.creator could
un-falsify a genuine refutation indefinitely, ping-ponging status ACTIVE↔CONTESTED for free — the
B2 "destroying is cheaper than establishing" asymmetry re-appearing on the reverse leg, weaponizing
the L8 repair path.
**FOLD** → §3.5 REPAIR gets `AUTHORIZED_TO_REPAIR` + `SIGNED ∧ verify_minter` (INV-14) + clears the
SAME disjoint bar as the *original grounding* (not merely vs the counterexample) + `ESCALATING_EVIDENCE`
(re-repairing the same nogood costs more each cycle — L8 "cost the gaming, never the changing").

### H-MAJOR-3 · FALSIFY's "same disjoint bar" self-blocked by the WEAK circularity (v0)
FALSIFY required `CROSS_VERIFY clears the SAME disjoint bar`, but CROSS_VERIFY is permanently WEAK
(§4.5/§6.2) and INV-16 forbids a WEAK signal from gating a high-stakes action; mass-collapse IS
high-stakes → the bar is un-satisfiable → a builder either wires FALSIFY to the WEAK topological
count anyway (re-opening the B2 DoS under a fig-leaf) or makes grounding un-falsifiable (breaking
I4 falsifiability-is-structural).
**FOLD** → §3.5: **`CONTESTED` is a FLAG (a SHOW, M5), never an ACTION.** Marking CONTESTED is not
a high-stakes action (so INV-16 does not forbid it); only an ACTION that *consumes* CONTESTED (a
receiver refusing/down-weighting) is the high-stakes gate, and that is where WEAK forbids acting on
topology alone. v0 FALSIFY bar = authz + signed (INV-14) + IN_SCOPE; the disjoint-STRENGTH is
surfaced-WEAK, never a gate. The original DoS is defanged: no cheap *irreversible* action remains.

### A-MAJOR-1 · `MAX_DELEGATION_DEPTH` referenced but never valued (feeds the cap)
§1.2 bounded delegation by `depth ≤ MAX_DELEGATION_DEPTH` but never gave a value or owner — and the
closure depth changes the §1.3 `effective_presence` cap, so two teams pick different depths → 
incompatible cap enforcement on a security-relevant number presented as decided.
**FOLD** → §1.2 `MAX_DELEGATION_DEPTH = 3` as a `[DECIDE]` v0 default + a named row in the §1.5
throne table + ratify-with-effective_presence note. Plus an enforced `ACCEPT_DELEGATION`
require-procedure (the RULEs were asserted but never a `require`; hacker MINOR) and an
activation-time atomic cap-check for the dormant-fan-out sleeper (hacker MINOR).

## The MINOR findings (all folded)
- **effective_presence is receiver-relative** (architect) — §7 is per-receiver (no global log), so the
  closure is what a receiver's log witnessed; clarified in §1.3 + named the P4 reconciliation so P4
  does not reintroduce a global log.
- **env-PEM signer is integrity-only** (hacker, grounded firsthand at `edge-attestation.js:14`) — the
  default `resolveSigner` is Option-A-equivalent (same-uid forgeable); the §10.5 v0 "authenticated"
  claim is met only by an injected separate-uid `opts.signer` (Option B). §7.1 + §10 P0 + §10.5
  softened from "flip signer ON" to "wire the existing signer (boundary work)" + a v0 PROVENANCE gate.
- **high-stakes threshold is an unnamed throne-in-waiting** (architect) — named in §4.5.3 as a P3
  bound throne.
- **§10.5 "mutually-untrusting" over-read** (architect) — headline parenthetical added: "(distinct-keyed;
  human-independence is U1-OPEN, contained not proven)".
- **supersession completeness** (PM) — two dropped v1.0 §11 rows (Byzantine-LLM, filesystem-delta)
  added back with verdicts (ACCURATE-subsumed / ACCURATE-framing-but-BUILD).
- **changelog labels** (PM + architect) — B4 split across §1.3 (definition) / §1.5 (throne-binding);
  `M-trust` relabeled to "§5-rebuild"; §7-amendment anchors normalized (1=REACH, 2=throne, 3=INV-10,
  4=FALSIFY, 5=config-binding).

## What the board confirmed solid (no change needed)
- All 11 mechanical folds carry the load-bearing detail **verbatim from the notes they cite** (PM +
  architect both walked them): B1/B5 three-predicate portfolio (research/13), B6 integrity≠provenance
  (research/18), M6 never-counts (research/17's `rollupCounts` bug), M2 per-receiver Merkle (research/10
  §4.3), M9 scope algebra with a worked example.
- Both genuine DECISIONs correctly tagged `[DECIDE — default proposed, USER RATIFIES]` with
  alternatives-considered — never silently settled.
- B2 (FALSIFY-fix) + B3 (acyclicity) explicitly in v0 scope (§10.5 NON-NEGOTIABLE).
- No landmine reintroduced (the hacker walked L1/L4/L5/L6/L11 — all clean); the three v1.0 §11
  overclaims are each now marked OVER-CLAIMED/greenfield.
- INV-13..18 + amended INV-10 are mutually consistent; the two cross-checks (INV-13 vs §6.4;
  INV-17 vs §6.3 THRESHOLD) resolve correctly.

## Residue carried past v1.1 (in-scope by design, marked loud per I8/M1)
The env-PEM same-uid **co-forge (integrity ≠ provenance)** survives into v0 unless an Option-B
separate-uid signer is injected; v0 weights gated on it stay SHADOW. Full provenance close
(signed/kernel-writer edges) is the post-v0 step. This is the toolkit's own #273 family, restated at
the PACT inter-node boundary — the same gap, honestly carried, not papered over.

## Bottom line
`PACT-spec-v1.1.md` is **build-grade** after folding the board: a team can implement the v0 (§10.5 —
two distinct-keyed roots exchange one authenticated, premise-bound, scope-checked, falsifiable claim
that a fabricated counterexample does not silently collapse) with minimal design ambiguity, depending
on neither U1 nor U2. The two (now three, incl. `MAX_DELEGATION_DEPTH`) ratification items are
isolated, defaulted, and flagged. **Next: user ratifies the defaults → v0 build plan (P0+P1).**
