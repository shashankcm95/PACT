# PACT — Product Requirements Document (PM view)

> **Purpose.** A product-manager's read of PACT: the north star, what has shipped per phase, the honest
> status of each, the open frontiers, and the decision-ready next phases. It is a *synthesis over* the
> canonical docs, not a replacement for them. Where this doc and the canon disagree, the canon wins:
> [`PACT-NORTH-STAR.md`](PACT-NORTH-STAR.md) (apex + invariants), [`PACT-spec-v1.1.md`](PACT-spec-v1.1.md)
> (what), [`docs/FORKS.md`](docs/FORKS.md) (decision ledger), `plans/**` (per-wave how).
>
> **As of** 2026-07-04 · `main` @ `6d940f6` · suite **620 passing / 0 failing** (run `node test/run.js` for
> the live count — never quote a remembered one) · PRs #1–#49 merged.

---

## 0. TL;DR (read this first)

**What PACT is.** A protocol that lets **mutually-untrusting AI agents coordinate on grounded, falsifiable
knowledge, rooted in scarce human identity**, so that no agent's self-assertion — however authentic or
popular — can launder itself into legitimacy. The machine bears *mechanical certainty* (who · untampered ·
cycle-free · in-scope); the human bears the *truth-burden* (only a human-accountable falsification decides
truth); their coupling is gated only by **disjoint, human-accountable evidence**.

**Where it stands.** The single-node substrate is **built and coherent** — ATMS core, trust engine,
grounding engine, custody mechanism, anti-equivocation audit log, U1 issuance-stake arc, and a
provenance-hardening **mechanism** arc (all SHADOW — see §7.3), across ~5,860 lines of dependency-free Node
(57 modules) and 620 tests. **Every weight is SHADOW: it informs, it gates nothing.** `convert.actionable` is hard-`false`; `epistemicIndependence()` is a
literal `'WEAK'`; every armable gate is disarmed-by-default and byte-identical to a no-op.

**The one thing a PM must internalize (the trust law, NS-7 / OQ-NS-6).**

> **Engineered / in-process signals NARROW trust. ONLY world-anchored signals HARDEN it.**

More SHADOW code does **not** advance the product's apex metric. A backtest, a self-assertion, an LLM-judge:
these *narrow*. A real out-of-band cost / custody / falsification (a separate OS uid, an enclave, a kernel
boundary, a human falsification): these *harden*. **Four world-anchored signals have hardened one axis
each** (§6). Everything else built to date is scaffolding that *narrows* and stays advisory until a deploy
makes it real.

**The honest frontier.** The apex move from here is a **world-anchored deployment** — an operator standing up
a cross-uid signer that signs *live* trust-graph edges — or **solving the deep frontiers U1 / U2**. That
deploy is an **operator act, out of band, not performed by the build agent** (NS-7). Until it happens,
integrity ≠ provenance stays open by physics: a same-uid attacker can co-forge byte-indistinguishable
records (the "#273 co-forge" ceiling).

---

## 1. The vision (north star)

### 1.1 The problem

Agent-to-agent networks have no way to stop a confident, well-formed, popular assertion from *becoming*
legitimate. Authenticity ("this really came from agent X") is routinely mistaken for independence ("two
agents agree for genuinely separate reasons") and for provenance ("the legitimate party produced this") and
for validity ("this is true"). Collapsing those four is how Sybil farms, echo chambers, and laundered
consensus win.

### 1.2 The thesis (the durable apex — survived every amendment)

**Divide the labor of knowing.** The machine never asserts truth; an unverified human claim never acquires
mechanical certainty; the coupling between them is gated only by disjoint, human-accountable evidence. PACT
gates the **seams** of a multi-agent system; it does not replace the LLM doing the work.

### 1.3 The three orthogonal layers (never collapse them — NS-2)

| Layer | Question | What proves it |
|---|---|---|
| **Integrity** | Untampered? | content-address + verify-on-read (a hash re-derivation) |
| **Provenance** | Produced by the *legitimate* party? | an **authenticated minter** — a real out-of-band custody boundary; a store re-hash can NOT prove it |
| **Validity** | *True*? | only a **human-accountable falsification** — derived-on-read, never a stored score |

The recurring product failure ("the #273 family") is treating a lower layer as if it delivered a higher one:
"untampered" read as "true," or "this record exists in the store" read as "the right party made it."

### 1.4 The trust law (NS-7 / OQ-NS-6 — the organizing metric)

Engineered signals **narrow**; only world-anchored signals **harden**. This is the product's true progress
metric and the reason the roadmap looks the way it does: the substrate is deliberately kept SHADOW, and
"shipping more mechanism" is explicitly *not* counted as trust progress (§9).

---

## 2. Product guardrails (the invariants that must never drift)

The eleven north-star invariants, in PM-legible form. A wave that violates one is wrong by definition.

| # | Invariant | Plain-English product rule |
|---|---|---|
| NS-1 | Divide the labor of knowing | Machine = mechanical certainty; human = truth. Never let the machine assert truth. |
| NS-2 | integrity ≠ provenance ≠ validity | Three separate layers. Never let one masquerade as another. |
| NS-3 | Trust is earned, receiver-controlled, relational | The receiver weights; direct trust outranks consensus. **Never a global rank/score/ordering** (the "throne"). |
| NS-4 | The Sybil unit is the **human root** | Cap *effective presence*, never nominal identities. The cap-setter stays auditable/plural/contestable. |
| NS-5 | Falsifiability is structural + derived-on-read | Validity is recomputed live from premise state — no mutable score store. Falsification is a flag, gated, repairable; cycles fail closed. |
| NS-6 | Confidence never outruns evidence | Grounding ≤ the weakest disjoint-verified root. Reach is gated by **verification**, never engagement. Artifacts are conditional, never "true." |
| NS-7 | **The trust law** | In-process signals narrow; only world-anchored signals harden. |
| NS-8 | SHADOW until residuals close | No weight gates an irreversible action while U1 / U2 / provenance-custody are open. |
| NS-9 | Containment + loud honesty | Contain the irreducible; keep it visible. **"Narrowed" is NEVER reported as "closed."** |
| NS-10 | Build the novel boundary greenfield | Reuse earned mechanisms; never over-claim reuse covers the novel boundary. |
| NS-11 | Separate homes: trust ≠ grounding | Trust is volatile/advisory (the lens); grounding is durable/auditable (the ledger). One-way DAG `lib→atms→trust→grounding`, tripwire-guarded. |

---

## 3. Architecture at a glance

A standalone repo (`v0/`) that **borrows the solved tiers wholesale** (DID/VC · A2A transport · Agent-Card ·
RFC-6962 Merkle · ATMS · Subjective Logic) and **spends the build only on the novel core** (premise→claim→
validation, earned-relational trust, the human root). The borrow is auditable via `v0/TRANSFER-PROVENANCE.md`.

The layering is a one-way DAG enforced by a CI tripwire over **9 guarded layers** (a reverse edge fails the
build) — not the 4-node spine alone. The headline spine is `lib → atms → trust → grounding`, but the
**provenance/custody boundary is its own layer, `identity/`, sitting BELOW trust** (trust imports it —
`trust/read-gate → identity/registry`), and `frame`, `scope`, `independence`, `audit` are foundational layers
the spine builds on. That `identity/` is a *separate lower layer* — not something "inside" trust — is the
NS-2 integrity ≠ provenance separation made structural:

```
grounding/                            the ledger (durable, auditable) — the SINK (no lower layer imports it)
trust/                                the lens (advisory) — imports lib · atms · identity (never grounding)
identity/  +  atms/                   identity = the PROVENANCE boundary (sigma-root · custody-verify · broker-sign); both sit BELOW trust
lib/                                  primitives — the integrity FLOOR (imports no upper layer)
frame · scope · independence · audit  foundational leaves — import only the floor

9 guarded layers (v0/test/unit/layering.test.js): floor = lib · sink = grounding · identity BELOW trust · a reverse edge fails CI
```

Subsystems (**57 `.js` modules** + 1 JSON schema = 58 files, ~5,864 LoC, zero runtime dependencies — run
`find v0/src -name '*.js' | wc -l` for the live count):

| Subsystem | Role | Notable modules |
|---|---|---|
| `lib/` | primitives (integrity floor) | `record-store`, `merkle`, `canonical-json`, `edge-freshness`, `refuse-alert`, `arm-flags`, `atomic-write`, `path-canonicalize` |
| `atms/` | assumption-based belief | `claim`, `validate`, `falsify`, `nogood` |
| `identity/` | who + custody (the provenance boundary) | `custody-verify`, `broker-sign`, `minter`, `sigma-root`, `registry`, `registration-provenance`, `caller-auth`, `request-auth`, `stake`, `slash`, `heap-read-probe` |
| `trust/` | the earned-relational lens | `convert`, `read-gate`, `direct`, `consensus`, `admission-gate`, `registration-gate`, `vouch-freshness`, `stake-anchor`, `issuance-policy`, `arming-coherence`, `decay` |
| `grounding/` | conditional validity + REACH | `cross-verify`, `creator-standing`, `premise-score`, `verification-strength`, `reach` |
| `frame/` | the signed record envelope | `frame` |
| `scope/` | scope-checking | `scope` |
| `audit/` | anti-equivocation | `audit-log` (per-receiver RFC-6962 Merkle log) |
| `independence/` | the U2 lift-point | `weak-flag` (`epistemicIndependence()` — permanently `WEAK`) |

**Two kinds of gate, and neither is live.** The **trust-promotion** gate is `convert.actionable`
(`trust/convert.js`) — hard-`false` (INV-16) until U1 / U2 / provenance close; it decides "may this advisory
readout *act*." Separately, the **admission / read-filter** gates (`admissionDecision`, `filterAnchoredRecords`,
`filterFreshVouches`) decide *which records feed the advisory count* — they are armable but ship DARK/disarmed
(§5), and even armed they only NARROW the advisory count, they never flip `actionable`. So the risk surface has
several gates; exactly zero are live today.

---

## 4. Phases built (the delivery record)

Grouped into five eras. Every era is **SHADOW** unless a row is explicitly marked a world-anchored HARDEN
(those four live in §6). "Built" means the mechanism exists and is tested; it does **not** mean trust hardened.

### Era 1 — The buildable node (spec + v0 core)

| Wave | Delivered | Status |
|---|---|---|
| research/00–25 | The decision: **BUILD, inverted order, 5 amendments.** Spec matured RESEARCH-GRADE → **BUILD-GRADE (v1.1)** through a 3-lens VALIDATE. | Ratified |
| `plans/00` | v0 — the ATMS core + surgical primitive transfer | BUILT / SHADOW |
| `plans/01` | P2 — the trust engine (`direct`/`consensus`/`convert`, derived-on-read) | BUILT / SHADOW |
| `plans/02` | P3 — the grounding engine + REACH (verification-gated, emergent-descriptive) | BUILT / SHADOW |
| `plans/03` | coherence checkpoint (3-lens, CLOSEABLE) | Verified |
| `plans/04` | P-minter — the structurally key-free custody writer (reframed close→**narrow**) | BUILT / SHADOW |
| `plans/05` | P-broker — the out-of-band signing *mechanism* (a live TOCTOU race caught + fixed) | BUILT / SHADOW |
| `plans/06` | CI — vacuous-pass-guarded runner + eslint + the layering tripwire | BUILT |

### Era 2 — Process + the first world-anchored custody dogfoods

| Wave | Delivered | Status |
|---|---|---|
| `plans/07`–`08` | phase-close checkpoint + consolidation (the CONTEST cross-layer seam **closed**) | Verified |
| `plans/09` | cross-uid deployment spike — the launcher + custody-verifier + runbook (**the substrate HARDEN #1–#3 then ran on**) | BUILT / SHADOW |
| `plans/10`–`11` | R2-WHO caller-auth + R2-WHAT per-request auth (the *code*) | BUILT / SHADOW |
| `plans/12` | the U2 lift-point seam-harden + the estimator interface RFC (`research/23`) | BUILT / SHADOW |
| `plans/13` | CONFIRM evidence-provenance — recalibrated to **carrier-only, DEFERRED** (the count was theater) | Deferred |
| `plans/14` | **R1 cross-uid custody dogfood — file-read non-exfiltration** | ★ **HARDEN #1** (§6) |
| `plans/15` | Merkle / CT-log anti-equivocation layer (an integrity SINK; narrows equivocation) | BUILT / SHADOW |
| `plans/16` | **R2-WHO caller-auth dogfood** | ★ **HARDEN #2** (§6) |
| `plans/17` | **R2-WHAT per-request auth dogfood** | ★ **HARDEN #3** (§6) |

### Era 3 — The U1 issuance-stake arc

| Wave | Delivered | Status |
|---|---|---|
| `plans/18`–`19` | blueprints: the U1 stake arc + the network phase (design only) | Scoped |
| `plans/20`–`24` | S1–S5: StakeAnchor read-fold (S1–S2) → stake-aware issuance-policy (S3) → crater-disciplined SLASH (S4) → funded-root advisory axis (S5). *(Plan-file numbers diverge from S-order: `22`=S5, `23`=S4; `plans/23` is a duplicated prefix — a slash-build + a broker-perm-vet.)* | BUILT / SHADOW |
| `plans/25` | integrated coherence checkpoint (4-lens, COHERENT 4/4) | Verified |
| `plans/26` | the heap-read hardening probe (spec + harness) → **the live run** | ★ **HARDEN #4** (§6) |

### Era 4 — The toolkit→PACT borrow arc

| Wave | Delivered | Status |
|---|---|---|
| `plans/27` | the borrow architecture (a 12-agent recon synthesized the borrow matrix) | Scoped |
| Borrow Ph. 1–4 | refuse-alert observability · record-store + audit-log size-caps · plan-conventions doc · a verified reconciliation (no code) | BUILT |
| Borrow Ph. 5 | the arming harness W0/W1/W2 — `arm-flags` + `arming-coherence`, **DARK** (nothing arms; a whole-tree tripwire keeps it RED-on-wiring) | BUILT / DARK |
| Borrow Ph. 6 | the authenticated-minter template — scoped design-only | Scoped |
| phase-close | CLOSEABLE-WITH-NOTES (caught the one cross-PR miss: the transfer-provenance manifest) | Verified |

### Era 5 — The provenance arc (the current arc — SHADOW mechanism; produces none of the §6 HARDENs by itself)

| Wave | Delivered | Status |
|---|---|---|
| `plans/30` | the provenance-harden arc charter | Scoped |
| `plans/31` | registration-provenance classified as **three bindings**: persona↔key (world-anchored-closable via `sigma_root`); persona↔human (self-asserted); human↔real (= U1). W0: first-writer immutability. | BUILT / SHADOW |
| `plans/32`–`33` | the `sigma_root` SHADOW verification substrate + the DARK armed admission gate | BUILT / SHADOW |
| `plans/34`–`38` | broker-signing W0–W4: the freshness-bound edge primitive → the key-free VOUCH producer → the read-gate freshness filter → the mint harness → the provenance proof board | BUILT / SHADOW |
| `plans/39` | the registration-provenance **read filter** — the ATTACK-(a) self-register **NARROW** (the #273 5th co-forge leg's read side) | BUILT / SHADOW |
| `plans/40` | recs-side totality hardening across both read filters (a hostile `Proxy`-over-array; pure DoS defense-in-depth) | BUILT / SHADOW |

---

## 5. What "SHADOW" means (the product's central discipline)

Every filter and gate ships **disarmed by default**, wired live but byte-identical to a no-op, and armable
only by an injected deploy constant the codebase itself never supplies. Verified firsthand this session:

- `convert.actionable` → `false` (INV-16: "informs, never gates — U2 open").
- `epistemicIndependence()` → literal `'WEAK'` (both label branches resolve WEAK; nothing can derive a
  non-WEAK overall).
- `filterAnchoredRecords`, `filterFreshVouches`, `admissionDecision` → **identity pass-through** when
  disarmed (`return recs` / `admit: true`), byte-identical to the pre-filter readout.

This is intentional and load-bearing: it lets the mechanism be built, tested, and reviewed **before** any
deploy, without a half-built gate ever changing a real decision. The arming is an operator act (NS-7), and a
whole-tree CI tripwire goes RED the instant any source module wires an arming path into a live gate.

---

## 6. The scoreboard — the 4 world-anchored HARDEN signals

**These are the only things that have moved the apex.** Everything else in §4 narrows. Each hardened *one
axis, on one box, in one run*, and each carries a loud honest ceiling (NS-9).

| # | Signal | Date | What it proved (world-anchored) | Honest ceiling — still OPEN |
|---|---|---|---|---|
| 1 | **R1 file-read non-exfiltration** (`plans/14`) | 2026-06-23 | On a separate-uid deployment, host uid 501 is **denied by the kernel** (`EACCES`) reading the `0600` broker key. | Heap-read leg narrowed-not-closed; R2/R3 untouched; one box. (Deployed broker was a pre-R2-WHAT snapshot — immaterial: the R1 claim is uid/filesystem-based, code-version-independent.) |
| 2 | **R2-WHO caller-auth** (`plans/16`) | 2026-06-23 | The allowlist **denies a real, distinct, non-allowlisted OS uid** at the cross-uid `sudo` boundary; a forged `SUDO_UID` is discarded. Graded A / no-overclaim. | R2-WHAT, R3, same-uid oracle, allowlist-value provenance; one box, one run. |
| 3 | **R2-WHAT per-request auth** (`plans/17`) | 2026-06-24 | The broker **signs only what it recomputes** — denies a wrong-persona frame (`persona-mismatch`) and a wrong-id body (`record-id-mismatch`). Graded A / no-overclaim. | Narrows-not-closes R2 (entitled operator can still assert any payload); persona-did is policy, not crypto-bound; R3; same-uid oracle. |
| 4 | **R-heap non-exfiltration** (`plans/26`, `docs/deployment/r-heap-run-2026-07-01.md`) | 2026-07-01 | On Linux `ptrace_scope=2` (kernel 6.8), the signing key is **non-exfiltrable from the running broker's memory** across *both* cross-uid and same-uid boundaries. **24/24 PASS, non-vacuous**, out-of-band attested. | Does NOT close the same-uid ORACLE (R2), the hypervisor/root boundary, R3, or the apex; config-conditional; one box, one run. |

**The consolidation verdict (north-star point 10):** the cheap "world-anchor an already-built guard via a
live cross-uid run" vein is **mined out**. R-heap was the fourth and strongest (first on Linux scope=2). The
next HARDEN is qualitatively different — it requires a **live-edge deployment**, not another dogfood.

---

## 7. Gaps and open frontiers (the honest "not solved")

Three irreducible frontiers, permanently visible (north-star §4). None is a bug; each is a named boundary.

### 7.1 U1 — human-uniqueness

`rootOf`-keying defeats *persona*-multiplication, but **N distinct *human* roots is open**. The U1 stake arc
(S1–S5) adds a SHADOW containment layer — a non-transferable, slashable issuance stake surfaced as an
advisory funded-root axis — but it **CONTAINS, it does not CLOSE**: a wealthy attacker still buys N roots,
and the in-memory stake is *presence*, not forfeitable cost. Only a really-deployed on-chain slash (S6,
external, unbuilt) would harden the one issuance-cost axis. SBT / Personhood-Credentials are the later path.

### 7.2 U2 — epistemic-independence (the gate-enabler)

**Nothing gates until U2 closes, and U2 is `[OPEN]` — believed near-unclosable positively** (`research/24`).
Positive independence is not identifiable from observables, and no currently-conceivable world-anchored
signal is positively *sufficient*. The product decision (amended into the north-star, dated 2026-06-23):
**stop reserving the lift-point for a positive estimator.** `epistemicIndependence()` stays permanently
`WEAK`; gating will never rest on positive U2. The only buildable salvage is a **DEMOTE-only entanglement
detector** — in-process, so it *narrows*, never hardens.

> Product implication: PACT will **never** promise "these two agents are independent." It promises, at most,
> "these two agents look entangled — discount accordingly," plus the conditional-validity readout.

### 7.3 Provenance / custody (integrity ≠ provenance)

The mechanism is **built** (P-minter, P-broker, `sigma_root`, the registration + freshness read-filters, the
proof board). The **hardening is a deployment property** — a real out-of-band custody boundary (separate uid
/ enclave / HSM) that **signs live trust-graph edges**. Until that deploy:

- The **#273 co-forge ceiling** stands: a same-uid attacker can produce a byte-indistinguishable record
  (a valid body + a re-derived content-address/sidecar via the same exported functions), so any weight that
  reads "this record exists and verifies" is inflatable. Tolerable **only** because every such weight is
  SHADOW and gates nothing.
- The **5th co-forge leg** (self-register: a host self-registers its persona and self-signs a vouch) is
  **NARROWED** by the read-side registration filter (`plans/39`), **not closed** — a same-uid self-seed +
  self-sign still passes even when armed. Only an out-of-band root-key attestation closes it.

### 7.4 Smaller named residuals (documented, deferred with a home)

- CONFIRM evidence-provenance **carrier** — sound, but blocked on a world-anchored *diversity* source that
  does not exist (distinct from a provenance source; see FORK-3). Revisit when Embers Phase 4's CONFIRM loop
  ships and a real consumer would measure something.
- Store-growth / magnitude bounds on the freshness filters; the LIVE `meCtx.freshness` injection must come
  from a trusted non-actor deploy path.
- The network phase (multi-node dissemination, gossip, slash-freshness) is blueprint-only (`plans/19`).

---

## 8. Next phases (decision-ready)

The arc is at a **genuine fork** (FORK-1/2/3 in `docs/FORKS.md`). Nothing is in flight. These are the mapped
branches, ordered by apex-impact:

| Option | What it is | Hardens? | Whose act |
|---|---|---|---|
| **A. Operator deploy of a live-edge signer** | Stand up a deployed cross-uid signer that signs *live* trust-graph edges + attest the root key out of band. **The single move that advances the apex** (OQ-NS-6). | **HARDENS** | **Operator / USER, out of band (NS-7)** — not the build agent |
| **B. Close the 5th co-forge leg** | The `plans/31` registration-binding provenance close. | Only after (A) provides a deployed cross-uid signer + attested root key. | Build agent (mechanism) + operator (attestation) |
| **C. U2 research** | The demote-only entanglement detector (narrows, never hardens) + continued feasibility work. | NARROWS | Build agent |
| **D. The network phase** | Multi-node dissemination / slash-freshness (`plans/19` blueprint → build). | Narrows until deployed | Build agent + operator |
| **E. Embers Phase 4 consumer** | The consumption→outcome CONFIRM loop that would finally give the deferred provenance carrier a real consumer (deferred-with-a-home per `docs/FORKS.md` FORK-3, RE-CONFIRM 2026-07-03). | Narrows | Build agent (separate repo) |

**The PM recommendation.** Options B–E all *narrow*; only **A hardens**, and A is deliberately **not** the
build agent's to perform — it is an operator deployment. So the roadmap's honest shape is: **the build agent
has taken the in-process substrate as far as it can harden it** (it can only narrow from here), and the next
*trust advance* waits on an operator deploy. Between narrowing options, B (close the 5th leg) is the most
directly apex-adjacent once a deploy exists; C/D/E are parallel research/build tracks that keep the seams
from leaking when a frontier arrives.

---

## 9. How we measure progress (the metrics section)

**The one true north-star metric: count of world-anchored HARDEN signals.** Today: **4** (§6). This is the
only number that reflects trust advancing. It is deliberately hard to move — it requires a real out-of-band
cost, not code.

**Health / hygiene metrics (necessary, not sufficient — do NOT mistake these for progress):**

- **Test suite:** 620 passing / 0 failing, 48 files, vacuous-pass-guarded (a green means tests *ran*).
- **Coherence:** the last full-substrate checkpoint (`plans/25`) was COHERENT 4/4.
- **Layering:** the 9-layer DAG tripwire is green **and non-vacuous** (a precondition asserts every guarded
  layer dir is non-empty, so an emptied/renamed layer can't silently disarm it; a reverse edge fails CI).
- **Review discipline:** every wave passes design → 2-lens VERIFY → TDD → 3-lens VALIDATE (for #273-family
  changes) → pre-PR CodeRabbit → PR → USER merge.
- **SHADOW integrity:** `convert.actionable` hard-`false`; `epistemicIndependence()` literal `WEAK`; all
  armable gates disarmed-by-default and byte-identical.

**The anti-metric (NS-9).** Lines shipped, modules built, and tests added are *scaffolding* velocity, not
trust velocity. Reporting a SHADOW/narrow mechanism as a hardening is the single most-guarded failure mode.

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation / status |
|---|---|---|---|
| **U2 is not just open but near-unclosable** — the gate-enabler may never close positively. | High (assessed) | The strong form of gating may never ship. | Decision already made: gating never rests on positive U2; ship the demote-only detector + conditional-validity readout. Contained, visible. |
| **The apex depends on an operator deploy the build agent cannot perform.** | Certain (by design) | Trust cannot advance from code alone. | Explicit in NS-7. The deploy is the USER's act; the mechanism is built and ready. |
| **Same-uid co-forge (#273)** inflates any weight that gates before a real custody boundary exists. | Certain until deployed | A gated weight would be forgeable. | Every weight is SHADOW (NS-8); nothing gates. The moment one would gate, an authenticated (signed / kernel-owned) minter is mandatory. |
| **Over-claiming reuse / narrowing as hardening** (the drift the whole discipline guards). | Low (heavily guarded) | Product credibility; a false sense of safety. | NS-9 close→narrow reflex, the per-wave honesty-auditor lens, the drift-detector §6 pre-flight. |
| **Wealthy attacker buys N human roots** (U1 not closed). | Open | Sybil at the human-root layer. | Stake arc contains (raises cost); on-chain slash (S6) would harden but is external/unbuilt. |

---

## 11. Appendix — canonical source map

| For… | Read |
|---|---|
| the apex + invariants + the inflection | [`PACT-NORTH-STAR.md`](PACT-NORTH-STAR.md) (point 12 = latest status) |
| what to build (build-grade) | [`PACT-spec-v1.1.md`](PACT-spec-v1.1.md) |
| why + the 12 landmines | [`PACT-intent-and-landmines.md`](PACT-intent-and-landmines.md) |
| the build-vs-borrow decision | [`research/10-synthesis-and-recommendation.md`](research/10-synthesis-and-recommendation.md) |
| the U2 negative verdict | [`research/24-world-anchored-u2-signal-feasibility.md`](research/24-world-anchored-u2-signal-feasibility.md) |
| the decision fork ledger | [`docs/FORKS.md`](docs/FORKS.md) |
| the world-anchored run evidence | [`docs/deployment/`](docs/deployment/) (`r-heap-run-2026-07-01.md`, `cross-uid-broker.md`, …) |
| per-wave how | [`plans/`](plans/) (`00`–`40` + `PLAN-CONVENTIONS.md`) |

---

*This PRD is a synthesis snapshot dated 2026-07-04. It decays like any status doc — re-probe the live suite
and the north-star before quoting it. Amend the north star, not this doc, when the direction moves.*
