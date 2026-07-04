# PACT — Product Requirements Document

**v0.1 · 2026-07-04**

> Mutually-untrusting AI agents coordinating on grounded, falsifiable knowledge, rooted in scarce human
> identity — so that no agent's self-assertion, however authentic or popular, can launder itself into legitimacy.

| Field | Value |
|---|---|
| Current phase | Era 5 — the provenance arc (SHADOW mechanism); next = a fresh fork (operator deploy / U2) |
| Mode | **SHADOW** — every weight is advisory; nothing gates an irreversible action |
| Trust-hardening signals | **4 world-anchored** (R1 · R2-WHO · R2-WHAT · R-heap) — see §8 |
| Anchor of record | this PRD (PM view) defers to [`PACT-NORTH-STAR.md`](../PACT-NORTH-STAR.md) for the deep, amend-deliberately invariants |
| Build state | single-node substrate built + coherent (`node test/run.js` for the live suite count) |

> This PRD is the blueprint **anchor** (what / why / principles / phase order). It sits above the per-phase
> task lists ([`docs/phases/`](phases/)) and the decision records ([`docs/ADRs/`](ADRs/)), and defers to the
> north star for the load-bearing invariants. Keep it **true**: when a phase reveals reality has diverged, the
> fix is a dated update *here* (or an amendment to the north star), so the anchor never goes stale.

## 1. The problem

Agent-to-agent networks have no way to stop a confident, well-formed, popular assertion from *becoming*
legitimate. Authenticity ("this really came from agent X") is routinely conflated with **independence** ("two
agents agree for genuinely separate reasons"), with **provenance** ("the legitimate party produced this"), and
with **validity** ("this is true"). Collapsing those four is how Sybil farms, echo chambers, and laundered
consensus win. The narrow, honest problem: **no agent should be able to launder self-assertion — however
authentic or popular — into legitimacy.**

## 2. Vision

**Divide the labor of knowing.** The machine bears *mechanical certainty* (who · untampered · cycle-free ·
in-scope); the human bears the *truth-burden* (only a human-accountable falsification decides truth); their
coupling is gated only by **disjoint, human-accountable evidence**. PACT gates the *seams* of a multi-agent
system; it does not replace the LLM doing the work. Once it exists, agents coordinate on knowledge that is
**conditionally valid** ("valid given premises P, within scope S"), never "true" — and the **receiver**, not a
global authority, weighs the evidence and sees the distribution of disagreement rather than one pronounced verdict.

## 3. Goals & non-goals

**Goals**

- Trust that is **earned, receiver-controlled, and relational** — direct (earned) outranks consensus
  (advisory); never a global rank.
- The **three orthogonal layers** (integrity ≠ provenance ≠ validity) kept structurally separate.
- **Provenance rooted in scarce human identity** — the Sybil unit is the human root, not the cheap persona.
- **Falsifiability that is structural + derived-on-read** (validity recomputed from premise state; no mutable
  score store).
- **Every trust weight SHADOW** until the residuals (U1 / U2 / provenance-custody) close — nothing gates an
  irreversible action before then.

**Non-goals** (where the PRD earns its keep — each considered and refused on principle)

- **NOT a consensus blockchain / global ledger** — per-receiver state; no global ordering.
- **NOT a global reputation oracle** — trust is relational + receiver-controlled; a global rank is the "throne."
- **NOT a replacement for the LLM** — it gates the seams; the machine still does the work.
- **NOT a truth oracle, and not a consensus-collapser** — it surfaces conditional validity + the distribution
  of disagreement; humans bear truth.
- **NOT "secure because authentic"** — authenticity ≠ independence ≠ provenance.

## 4. Who it serves — the roles

| Role | Their job |
|---|---|
| **Receiver** | The agent weighing evidence. Trust is receiver-controlled — the receiver decides who to weight, never a global authority. |
| **Human root** (`rootOf`) | The scarce, accountable identity that anchors provenance and bears the truth-burden. The Sybil unit — capped by *effective presence*, not nominal identity count. |
| **Agent / persona** | A network-facing signing identity delegated from a human root. Multiplying personas does not multiply trust; the root is what counts. |
| **Operator** | Deploys the out-of-band custody boundary (cross-uid signer / enclave / HSM) and arms gates. **The world-anchored trust-mover** — acts out of band (NS-7), never the build session. |
| **Third-party verifier** | Independently re-derives validity + custody from the audit log. The system is *checked*, not self-documented-as-trusted. |

## 5. Product principles

The load-bearing invariants every feature is measured against, and by which the roadmap is sequenced. The
deep, **amend-deliberately** source is [`PACT-NORTH-STAR.md`](../PACT-NORTH-STAR.md) §3 (NS-1..NS-11); this is
the PM-legible restatement — do not water it down.

**The trust law (NS-7 / OQ-NS-6) — the organizing metric.** Engineered / in-process signals **NARROW** trust;
ONLY **world-anchored** signals **HARDEN** it. A backtest, a self-assertion, an LLM-judge → narrows. A real
out-of-band cost / custody / falsification → hardens. More SHADOW code does not advance the apex (see §8).

**The three orthogonal layers (NS-2) — never collapse them:**

| Layer | Question | What proves it |
|---|---|---|
| Integrity | Untampered? | content-address + verify-on-read (a hash re-derivation) |
| Provenance | Produced by the *legitimate* party? | an **authenticated minter** (a real out-of-band custody boundary) — a store re-hash can NOT prove it |
| Validity | *True*? | only a **human-accountable falsification** — derived-on-read, never a stored score |

**Separate homes (NS-11) — trust ≠ grounding.** Trust is the volatile, advisory *lens*; grounding is the
durable, auditable *ledger*. They live apart, enforced by a one-way DAG CI-tripwire over **9 layers** — and
`identity/` (the provenance/custody boundary) is its own layer **below** trust, making the integrity ≠
provenance separation structural, not just conceptual. (Full topology + the enforced bans:
[`PACT-spec-v1.1.md`](../PACT-spec-v1.1.md) and `v0/test/unit/layering.test.js`.)

**The eleven invariants (plain-English):**

| # | Invariant | Product rule |
|---|---|---|
| NS-1 | Divide the labor of knowing | Machine = mechanical certainty; human = truth. The machine never asserts truth. |
| NS-2 | integrity ≠ provenance ≠ validity | Three separate layers; never let one masquerade as another. |
| NS-3 | Trust is earned / receiver-controlled / relational | The receiver weights; direct outranks consensus. Never a global rank. |
| NS-4 | The Sybil unit is the human root | Cap effective presence, never nominal identities; the cap-setter stays auditable/plural/contestable. |
| NS-5 | Falsifiability is structural + derived-on-read | Recomputed from premise state; falsification is a flag, gated, repairable; cycles fail closed. |
| NS-6 | Confidence never outruns evidence | Grounding ≤ the weakest disjoint-verified root; reach gated by verification, never engagement. |
| NS-7 | The trust law | In-process signals narrow; only world-anchored signals harden. |
| NS-8 | SHADOW until residuals close | No weight gates an irreversible action while U1 / U2 / provenance-custody are open. |
| NS-9 | Containment + loud honesty | Contain the irreducible; keep it visible. "Narrowed" is NEVER reported as "closed." |
| NS-10 | Build the novel boundary greenfield | Reuse earned mechanisms; never over-claim reuse covers the novel boundary. |
| NS-11 | Separate homes: trust ≠ grounding | The one-way DAG, tripwire-guarded; a trust score moving never moves a validated grounding chain. |

## 6. Functional requirements — capabilities

The built substrate as a capability ledger. **"Shipped (SHADOW)"** means the mechanism exists, is tested, and
gates nothing; it is not a trust claim (see §8 for what actually hardened).

| Capability | What it does | Status |
|---|---|---|
| ATMS belief core | assumption-based truth maintenance (claim / validate / falsify / nogood) | Shipped (SHADOW) |
| Earned-relational trust engine | `direct` / `consensus` / `convert`, derived-on-read; `actionable` hard-`false` | Shipped (SHADOW) |
| Grounding + REACH | conditional validity; reach gated by verification, emergent-descriptive | Shipped (SHADOW) |
| Custody writer (P-minter) | structurally key-free custody writer (narrows, does not close integrity≠provenance) | Shipped (SHADOW) |
| Out-of-band broker (P-broker) | the cross-uid signing *mechanism* | Shipped (SHADOW) |
| Anti-equivocation audit log | per-receiver RFC-6962 Merkle log; verify-when-present | Shipped (SHADOW) |
| U1 issuance-stake | non-transferable, slashable stake → advisory funded-root axis | Shipped (SHADOW) |
| Registration-provenance (`sigma_root`) | persona↔key binding verification + disarmed-by-default read-filter | Shipped (SHADOW) |
| Cross-uid custody (deployed) | kernel-enforced key non-exfiltration, proven live | **4 world-anchored HARDENs** (§8) |
| Live-edge signer | operator-deployed cross-uid signer signing *live* trust-graph edges | Planned (operator act) |
| Trust gating (`actionable → true`) | promote an advisory readout to an irreversible action | Future (blocked on U2) |

## 7. Non-functional requirements — the quality bar

- **SHADOW by construction.** Every filter/gate ships disarmed-by-default, byte-identical to a no-op, armable
  only by an injected deploy constant the codebase never supplies. `convert.actionable` is hard-`false`;
  `epistemicIndependence()` is a literal `WEAK`. A whole-tree CI tripwire goes RED the instant any source
  module wires an arming path into a live gate.
- **Security posture.** Exact-set (not subset) authorization post-conditions; verify-CONTENT-on-read (not just
  the key); integrity ≠ provenance (a store re-hash never proves provenance); guards non-vacuous +
  non-bypassable; fail-closed decisions are observable, not silent.
- **Honesty (NS-9).** "Narrowed" is never reported as "closed"; SHADOW mechanism is never reported as a
  HARDEN; every open frontier stays loud in each wave's residuals.
- **Review discipline.** Security-sensitive diffs pass a multi-lens board (correctness + adversarial +
  claim-vs-evidence) with findings folded before close; live dogfoods gate any "it works" claim over a green
  mock suite.
- **Testability.** Zero runtime dependencies (pure Node); a vacuous-pass-guarded test runner (a green means
  tests *ran*); the layering DAG tripwire green + non-vacuous.

## 8. Success metrics

**The one true north-star metric: the count of world-anchored HARDEN signals.** Today: **4**. Only this number
reflects trust *advancing*; it is deliberately hard to move — it requires a real out-of-band cost, not code.

**ACHIEVED — the 4 world-anchored HARDEN signals** (each hardened *one axis, on one box, in one run*, with a
loud honest ceiling — NS-9):

| # | Signal | What it proved (world-anchored) | Honest ceiling — still OPEN |
|---|---|---|---|
| 1 | R1 file-read non-exfiltration | host uid denied by the kernel (`EACCES`) reading the `0600` broker key on a separate-uid deployment | heap-read narrowed-not-closed; R2/R3 untouched; one box |
| 2 | R2-WHO caller-auth | the allowlist denies a real distinct non-allowlisted OS uid at the cross-uid boundary; forged `SUDO_UID` discarded | R2-WHAT, R3, same-uid oracle; one box, one run |
| 3 | R2-WHAT per-request auth | the broker signs only what it recomputes (persona-mismatch / record-id-mismatch denies) | narrows-not-closes R2 (entitled operator can assert any payload); persona-did is policy not crypto-bound; R3 |
| 4 | R-heap non-exfiltration | on Linux `ptrace_scope=2`, the signing key is non-exfiltrable from the running broker's memory (cross-uid AND same-uid); 24/24 PASS, non-vacuous | does NOT close the same-uid oracle, hypervisor/root, R3, or the apex; config-conditional; one box, one run |

**Health metrics** (necessary, not sufficient — NOT trust progress): the test suite green (run `node
test/run.js` for the live count); the last full-substrate coherence checkpoint COHERENT 4/4; the layering
tripwire green + non-vacuous.

**The anti-metric (NS-9):** lines shipped, modules built, and tests added are *scaffolding* velocity, not
trust velocity. Reporting a SHADOW/narrow mechanism as a hardening is the single most-guarded failure mode.

## 9. Roadmap — the phases & current state

The per-phase task lists live in [`docs/phases/`](phases/) (which bridges to the existing `plans/` wave docs);
each phase re-grounds here at close. **COMMITTED / delivered** (each SHADOW unless a signal is marked HARDEN):

| Phase (era) | Scope | Status |
|---|---|---|
| Era 1 — buildable node | ATMS core + trust engine + grounding/REACH + custody mechanism (minter/broker) + CI | ✅ Shipped (SHADOW) |
| Era 2 — custody dogfoods | R1 / R2-WHO / R2-WHAT world-anchored dogfoods + Merkle/CT-log audit layer | ✅ 3 HARDENs + SHADOW |
| Era 3 — U1 issuance-stake | S1–S5 stake arc (StakeAnchor → issuance-policy → SLASH → funded-root axis) + the R-heap live run | ✅ Shipped + HARDEN #4 |
| Era 4 — toolkit→PACT borrow arc | observability, record/audit size-caps, the arming harness (DARK) | ✅ Shipped (SHADOW/DARK) |
| Era 5 — provenance arc | `sigma_root` verification + broker-signing (W0–W4) + registration read-filter | ✅ Shipped (SHADOW) |

**PROPOSED — the next fork** (a fresh decision; nothing in flight; mark distinctly from committed):

| Option | What it is | Hardens? | Whose act |
|---|---|---|---|
| A. Operator deploy of a live-edge signer | a deployed cross-uid signer signing *live* trust-graph edges + out-of-band root-key attestation — **the single move that advances the apex** | **HARDENS** | **Operator, out of band (NS-7)** — not the build session |
| B. Close the 5th co-forge leg | the registration-binding provenance close | only after A provides a deployed signer + attested root key | build + operator |
| C. U2 research | the demote-only entanglement detector + feasibility work | NARROWS | build |
| D. Network phase | multi-node dissemination / slash-freshness | narrows until deployed | build + operator |
| E. Embers Phase 4 consumer | the consumption→outcome CONFIRM loop | narrows | build (separate repo) |

**The PM read:** options B–E all *narrow*; only **A hardens**, and A is deliberately not the build session's
to perform. The build has taken the in-process substrate as far as it can harden it — the next *trust advance*
waits on an operator deploy.

## 10. Risks & open questions

The three irreducible frontiers (north-star §4) are permanently visible — none is a bug; each is a named boundary.

| Risk / frontier | Status | Mitigation |
|---|---|---|
| **U2 — epistemic-independence** may be *near-unclosable positively* (the gate-enabler). | High (assessed) | Decision made: gating never rests on positive U2; `epistemicIndependence()` stays permanently `WEAK`; ship the demote-only entanglement detector (narrows) + the conditional-validity readout. Contained, visible. |
| **The apex depends on an operator deploy the build session cannot perform.** | Certain (by design, NS-7) | Explicit: the deploy is the operator's out-of-band act; the mechanism is built and ready. |
| **Same-uid co-forge (#273)** inflates any weight that gates before a real custody boundary exists. | Certain until deployed | Every weight is SHADOW (NS-8); nothing gates. The moment one would gate, an authenticated (signed / kernel-owned) minter is mandatory. |
| **U1 — human-uniqueness:** a wealthy attacker buys N human roots. | Open | The stake arc *contains* (raises cost); a deployed on-chain slash (S6, external) would harden the issuance-cost axis but is unbuilt. |
| **Over-claiming reuse / narrowing as hardening** (the drift the whole discipline guards). | Low (heavily guarded) | NS-9 close→narrow reflex; the per-wave honesty lens; the drift-detector pre-flight. |

**Open questions:** the CONFIRM evidence-provenance *carrier* stays deferred (blocked on a world-anchored
*diversity* source that does not exist — distinct from a provenance source). Store-growth / magnitude bounds
on the freshness filters. The live `meCtx.freshness` injection must come from a trusted non-actor deploy path.

## 11. Out of scope — roads not taken

Recorded so they are not re-proposed as new (do not revive without amending the north star §5 + `docs/FORKS.md`):

- **Transferable-token / NFT provenance** — a transferable token detaches provenance from the scarce human
  root (laundering). Smart contracts are admitted only as the non-transferable U1 stake (registry-not-oracle).
- **Global PageRank / EigenTrust ranking** — the "throne." PACT uses *personalized* propagation only.
- **Standalone-persona product** — collapses to a plugin (researched → killed).
- **Vendor-exfil cross-model review** — sends substrate deltas to a third-party vendor; the pre-egress
  scrubber + governance opt-in is the only path if ever revisited.

---

*This PRD is the anchor; it decays like any status doc — re-probe the live suite and the north star before
quoting it. When a phase reveals reality has diverged, amend the north star or accrete a dated update here —
never let the build quietly diverge from the anchor.*
