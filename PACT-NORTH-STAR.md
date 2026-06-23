# PACT — North Star

> **The apex anchor.** Above the spec (*what*), the intent+landmines (*why*), the research (*decisions*),
> and the plans (*how, per wave*). Read it before building and at every phase-close: *are we still building
> the right thing?* It anchors to **where the direction has moved to** — not the starting intent. **STABLE:**
> it changes only by deliberate, dated amendment (ADR-style), never by accretion. A wave that conflicts with
> it is wrong; if the north star is wrong, change **it** on purpose — never drift around it.

## §1 The apex (the durable core — survived every amendment)

**PACT lets mutually-untrusting AI agents coordinate on grounded, falsifiable knowledge — rooted in scarce
human identity — so that no agent's self-assertion, however authentic or popular, can launder itself into
legitimacy.**

The thesis underneath: *the machine bears mechanical certainty* (who · untampered · cycle-free · in-scope);
*the human bears the truth-burden* (only a human-accountable falsification decides truth); *their coupling is
gated only by disjoint, human-accountable evidence.* The build amended the *execution*, never this.

## §2 The direction so far (where we've moved to — anchor to THIS)

1. **Inverted build order — borrow the solved tiers, spend the build only on the novel core.** Reuse
   DID/VC · A2A transport · Agent-Card · RFC-6962 Merkle · ATMS · Subjective Logic wholesale; build only the
   premise→claim→validation chain, earned-relational trust, and the human root. (Five amendments fixed the
   original design: REACH is **emergent-descriptive**, never a prescriptive reach-engine/throne;
   the log is **per-receiver**, never global; **FALSIFY is reversible+gated+repairable**, never auto-collapse;
   **config-binding**; **throne-binding** of the cap-setter/root-issuer.)
2. **The spine reframe: "independence" was three predicates wearing one word.** Only the **topological** axis
   is computable; **epistemic independence (U2)** is the hard `[OPEN]` problem. Nothing acts on "independence"
   until U2 is estimated or flagged WEAK. The spec matured RESEARCH-GRADE → **BUILD-GRADE (v1.1)**.
3. **v0 is a standalone repo** that borrows the kernel primitives via an auditable transfer manifest
   (`v0/TRANSFER-PROVENANCE.md`) — the *mechanisms* reused, the *novel boundary* built greenfield (NS-10).
4. **BUILT so far, all SHADOW (153 tests — 148 at phase-close + 5 from the consolidation wave, `plans/08`):**
   v0 (ATMS) → P2 (trust) → P3 (grounding + REACH) → P-minter (require-custody) → P-broker (out-of-band
   signing *mechanism*) → CI → consolidation (the CONTEST cross-layer seam **closed**, `plans/08`). The
   phase-close signed the integrated substrate **CLOSEABLE-WITH-NOTES**.
5. **What the build crystallized** (the real deepening — these now outrank the intent doc's phrasing):
   **integrity ≠ provenance ≠ validity** (three orthogonal layers); the **close→narrow honesty reflex**
   (every "close" was walked back to "narrow/mechanism-not-real" under the board); **OQ-NS-6 adopted** as the
   trust law; **derived-on-read / no-mutable-score-store made structural**; the **per-wave 3-lens board** that
   changes the work, not rubber-stamps it.
6. **▶ THE INFLECTION — the live anchor (as of 2026-06-22, post-consolidation):** the in-process mechanisms
   are **built** and the carried seams **closed** (consolidation shut the CONTEST cross-layer leak). Per
   OQ-NS-6, **more in-process SHADOW code will NOT *harden* trust** — the trust-*mover* from here is a
   **world-anchored deployment** (cross-uid custody — the live next) or **solving the deep frontiers
   (U1/U2)**. Seam-closing + U2-research-prep still have value (they keep the seams from leaking when a
   frontier arrives) — but they *narrow*, never *harden*. The drift to avoid: building SHADOW machinery
   **expecting it to harden trust.**
7. **▶ 2026-06-23 — the inflection's FIRST world-anchored signal landed (R1 file-read ONLY).** The cross-uid
   custody dogfood ran LIVE on a separate-uid deployment (MacBookAir, broker uid 600): host uid 501 is denied
   (kernel `EACCES`) reading the `0600`/600 broker key — PACT's first signal that **HARDENS one axis**
   (OQ-NS-6/NS-7), not narrows. **Scope: R1 FILE-READ non-exfiltration ONLY**; the heap-read leg is
   **narrowed-not-closed** (macOS 2e PARTIAL — host shares the `staff` group with the broker + `task_for_pid`
   coarseness; the strongest form is a Linux `ptrace_scope=2` box), and **R2 (authorization) + R3 (forgery) stay
   UNTOUCHED**. The deployed broker is a **stale pre-R2-WHAT snapshot** (the R1 claim is filesystem/uid-based,
   code-version-independent — the broker code itself was not validated by this run). Verified via a 3-lens VERIFY
   board + a VALIDATE honesty pass (graded B->A: the over-claim of a fully-discharged 2e was caught + corrected).
   Evidence: `plans/14` §8. It does NOT harden trust broadly — one axis, on one box.

## §3 Invariants that must never drift (the current load-bearing set)

| # | Invariant | Origin |
|---|---|---|
| **NS-1** | **Divide the labor of knowing.** Machine = mechanical certainty; human = truth-burden. The machine never asserts truth; an unverified human claim never acquires mechanical certainty. | intent I1 |
| **NS-2** | **Three orthogonal layers: integrity ≠ provenance ≠ validity.** Untampered ≠ produced-by-the-legitimate-party ≠ true. Never collapse them. | crystallized (the #273 family) |
| **NS-3** | **Trust is EARNED + RECEIVER-CONTROLLED + RELATIONAL.** The receiver weights; direct (earned) outweighs consensus (advisory — raises a hypothesis, never acts alone). **NEVER a global rank / score / ordering** — the throne is the recurring enemy. | intent I7 + L6 |
| **NS-4** | **The Sybil unit is the HUMAN root (`rootOf`), never the cheap persona.** Cap **effective presence**, never nominal identities; the cap-setter/root-issuer throne stays bound (auditable/plural/contestable). | L11 + amendment 2 |
| **NS-5** | **Falsifiability is structural + derived-on-read.** Validity is recomputed from current premise state (no mutable score store). Falsification is a **flag** (never auto-collapse), **gated** (authorized + in-scope), **repairable**; cycles rejected fail-closed; propagates down the DAG. | intent I3/I4 + amendment 4 |
| **NS-6** | **Confidence never outruns evidence.** Claimed grounding ≤ the weakest disjoint-verified root. **Reach is gated by VERIFICATION, never ENGAGEMENT,** and is **emergent-descriptive, never computed-prescriptive.** Artifacts are conditional ("valid given P, within scope S"), never "true." | intent I6/I3 + L1 + amendment 1 |
| **NS-7** | **The trust law (OQ-NS-6): engineered / in-process signals NARROW trust; ONLY world-anchored signals HARDEN it.** A backtest, a self-assertion, an LLM-judge → narrows. A real out-of-band cost / custody / falsification → hardens. | adopted — the OQ-NS-6 trust law (originated in the parent substrate; the same law holds here) |
| **NS-8** | **SHADOW until the residuals close.** No weight gates an irreversible action while U1 / U2 / provenance-custody (§4) are open. Everything advisory until then. | intent I8 + the build |
| **NS-9** | **Containment, not elimination — and loud honesty.** Contain the irreducible problems; keep them visible. **"Narrowed" is NEVER reported as "closed"** (the close→narrow reflex). | intent I8/M1 + crystallized |
| **NS-10** | **Build the novel boundary greenfield, not reuse.** Reuse the *earned* mechanisms (content-address · verify-on-read · ed25519 · INV-22); never over-claim that reuse covers the *novel* boundary (provenance · inter-node · gating). | the plugin recon |
| **NS-11** | **Separate homes: trust ≠ grounding.** Trust is volatile / advisory / decaying (the *lens*); grounding is durable / auditable (the *ledger*). They live apart — the one-way DAG `lib→atms→trust→grounding` is tripwire-guarded; a trust score moving **never** moves a validated grounding chain. | intent I2 + the layering tripwire |

## §4 The irreducible frontiers (sharpened by the build — permanently visible)

- **U1 — human-uniqueness:** `rootOf` defeats persona-multiplication; **N distinct *human* roots is open.**
  v0 issuance = invite/vouch + stake (DID-VC registry, behind the seam); SBT/Personhood-Credentials later.
  Contained, not solved.
- **U2 — epistemic-independence (THE gate-enabler — nothing gates until it closes):** an estimator for "are
  two agents' evidence independent?" — **world-anchored only, never in-process-modeled.** Lives at the single
  `epistemicIndependence()` lift-point; the WEAK flag lifts there and only there.
- **Provenance / custody:** integrity≠provenance closes only with a **real out-of-band custody boundary**
  (separate uid / enclave / HSM) — a **deployment** property. P-minter/P-broker built the *mechanism*; the
  *hardening* is the deployment (the inflection, §2.6).

## §5 Directions decided (so the build doesn't re-open them)

- **Deferred-with-a-home (the mapped next):** cross-uid deployment spike (the real trust-mover) → then
  caller-auth (**vacuous in-process; meaningful only at the cross-uid boundary** — hence *after* deployment) →
  U2 *research*. Smart contracts → only the U1 **stake** (non-transferable, registry-not-oracle,
  no on-chain ranking) [[research/21]]. Personalized PageRank = already the model; falsification-propagation
  freshness-gate trio for the network phase [[research/22]].
- **Rejected (do not revive without amending this doc):** a transferable token / NFT as provenance
  (=laundering); a **global** rank / PageRank / EigenTrust (=the throne); the standalone-persona product
  (collapses to the plugin); cross-model review by exfiltrating the delta to a vendor.

## §6 Drift detector — you have drifted if…

- …a weight **gates an irreversible action while a residual (§4) is open** (NS-8) — *or* you're building more
  SHADOW machinery expecting it to **harden** trust (NS-7 / the inflection §2.6).
- …reach/trust is gated by **engagement/popularity** (L1) or computed-prescriptively (amendment 1); a guard
  is satisfied by the **cheap** not the **unforgeable** thing (L2); **consensus is trusted flatly** (L3).
- …**authenticity** is treated as **independence** (L4); **"untampered"** as **"true"** (L5); a **global
  rank/ordering** appeared (L6); **control wears the costume** of protection-against-control (L7).
- …**error is punished as malice** or **change as gaming** (L8); **nominal identities** are capped instead of
  **effective presence** (L11); scope is drawn too wide (L12).
- …**"closed" is claimed when only "narrowed"** (NS-9); **reuse is over-claimed** for the novel boundary (NS-10);
  or a **rejected direction (§5) is revived** without amending this doc.
- …a **mutable score / rank store** is introduced, or validity/trust stops being **derived-on-read** (NS-5/NS-11);
  a **reverse edge** appears in the `lib→atms→trust→grounding` DAG, or a trust signal bleeds into the grounding
  ledger (NS-11); the **CONTEST discriminant is reopened** so one record targets both a claim and a premise (the
  latent two-way path); or `convert.actionable` flips to **act-on before U2 closes** (NS-8).
- …a **contestation is collapsed into a single "resolved" answer** instead of surfacing the disagreement (M4/M5);
  trust is gated on **stability / low-volatility** (L9); or the system **documents itself to be trusted rather
  than checked**, with no external reference (L10).

## §7 What PACT is NOT (scope guard)

- **Not a consensus blockchain / global ledger** — per-receiver state; no global ordering.
- **Not a global reputation oracle** — trust is relational + receiver-controlled.
- **Not a replacement for the LLM** — it gates the **seams**; the machine still does the work.
- **Not a truth oracle, and not a consensus-collapser** — it surfaces *conditional validity* + the
  *distribution of disagreement*; it shows evidence the receiver weighs, **never resolves to one voice** or
  pronounces a verdict (intent M4/M5); **humans bear truth.**
- **A wrong premise never voids the human root** — falsification flags the *claims built on it*, not the identity.
- **Not "secure because authentic"** — authenticity ≠ independence ≠ provenance.

## §8 How to anchor a wave to this

1. **Pre-build + at VALIDATE/phase-close:** run §6 as a pre-flight; check the wave against §1 + §2.6 (the
   inflection) + the §3 invariants. Judge the **whole substrate's** coherence, not phase-local criteria.
2. **On conflict between lower docs** (spec / intent / research / plan), this north star resolves it.
3. **The frontiers (§4) + the inflection (§2.6) stay loud** in every wave's residuals — never silently downgraded.
4. **Amend deliberately:** if reality forces a change to an invariant or a decided direction, edit *this doc*
   with a dated rationale (ADR-style) — never let the build quietly diverge from it.

---

*Companion docs: [`PACT-spec-v1.1.md`](PACT-spec-v1.1.md) (what) · [`PACT-intent-and-landmines.md`](PACT-intent-and-landmines.md) (why + the 12 landmines in full) · [`research/10`](research/10-synthesis-and-recommendation.md) (the build-vs-borrow inversion + the 5 amendments) · [`research/`](research/) (decisions + deferred frontiers) · [`plans/07`](plans/07-phase-close-checkpoint.md) (the phase-close + the inflection).*
