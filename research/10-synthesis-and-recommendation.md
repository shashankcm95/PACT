---
lifecycle: persistent
phase: proto-planning — DECISION
created: 2026-06-21
status: recommendation (awaiting user ratification)
---

# PACT — Synthesis & Build Recommendation

> **What this is.** The decision artifact of the proto-planning phase. A research team of six
> independent lenses (4 prior-art researchers + adversarial + honesty) plus an architect
> integration pass pressure-tested the PACT blueprint against the credible field and against
> the Power Loom substrate it would build on. This document answers: *what works, what doesn't,
> what credible prior art validates or contradicts it, what to borrow, and what to build.*
>
> **Headline decision: BUILD — with five named amendments and an inverted build order.**
> Not "build as specified" (the spec spends its novelty budget on the tier the field already
> solved, and ships one mechanism — FALSIFY — broken). Not "don't build" (the core thesis is
> genuine, unreplicated in the A2A field, and Power Loom hands you the two hardest primitives
> nearly free). See the supporting reports under `research/prior-art/` and `research/verification/`.

---

## 1. The verdict in one paragraph

PACT's **thesis is sound and genuinely novel**: divide the labor of knowing — the machine bears
mechanical certainty (transport integrity, derivation validity, falsification-propagation,
scope-intersection), the human bears the truth-burden (premises, accountable, scored), and the
coupling is gated so confidence/identity never outrun disjoint, human-accountable evidence. **No
surveyed agent-to-agent protocol does this** (Google A2A, MCP, IBM/BeeAI ACP, Cisco AGNTCY, ANP,
Agora, LOKA all treat the *agent* as a self-sovereign DID and none anchor in human scarcity).
But three things qualify the verdict: (a) most of PACT's *plumbing* re-derives mature standards
(its frame ≈ JSON-RPC+TLS, its §3 premise chain ≈ ATMS/JTMS truth-maintenance, its trust engine
≈ EigenTrust, its disjoint-paths ≈ Advogato, its audit log ≈ Certificate Transparency); (b) the
load-bearing word the whole Sybil/grounding defense rests on — **"independence" / "disjoint"** —
is never defined, and Power Loom's existing analog (`≥2-distinct JOIN`) has the *identical*
unsolved gap (its own code comment: "byte-distinct != logically-independent"); and (c) one
mechanism (FALSIFY) is a denial-of-grounding DoS as written. The fix is to **invert the build
order** — borrow the solved tiers wholesale, spend the entire build on the novel core, and
sequence so nothing that *acts on* "independence" ships before it is either estimated or
visibly flagged WEAK.

---

## 2. What WORKS (validated by prior art + verification)

| What | Why it holds | Evidence |
|---|---|---|
| **The P1 ≠ P2 layer-split** (signature ⇒ WHO+UNTAMPERED, never TRUE) | Internally consistent; honesty kept out-of-session; reduces to mature crypto | adversarial: "SOUND"; honesty: JUSTIFIED |
| **Reach gated by VERIFICATION not engagement** (INV-9, L1) | The genuine socio-technical inversion of the misinformation engine — PACT-original framing | epistemics: "the genuinely PACT-original bit" |
| **DIRECT-vs-CONSENSUS asymmetric, receiver-controlled trust** (§5) | A *real improvement* on EigenTrust — removes EigenTrust's pre-trusted-seed "throne" | trust report: "PACT's real improvement is removing EigenTrust's seed throne" |
| **Weighted-consensus math** (`wcons`: raw Sybil count → ~0) | Mechanized and correct — *while consensus stays advisory* | adversarial: "this part is mechanized and holds" |
| **Containment-not-elimination honesty** (U1-U4 marked `[OPEN]`) | The intent doc is a genuine distrust-curriculum; U4's scoping ("bounds damage, not the con") is the model | honesty: B grade, "trustworthy in direction" |
| **The premise.creator = human accountability coupling** (§6.1) | The ONE thing classical truth-maintenance lacks — genuinely PACT's | epistemics: "the genuinely PACT-original bit" |

---

## 3. What DOESN'T work (the gaps the build must fix)

### 3.1 The spine defect — "independence" is three undefined predicates wearing one word
This is the single most important finding; **3 lenses converged on it independently** and the
architect sharpened it. The entire P2 defense reduces to `cap × DISJOINT_PATHS`, and *both*
factors are undefined nouns. "Independence" is really:
1. **Topological disjointness** (graph paths) — **SOLVED** (Menger/Advogato). Cheap to compute,
   *cheap for an attacker to fabricate* (mint k roots + earn k cheap probation edges → k
   topologically-disjoint, crypto-authenticated paths that pass `DISJOINT_PATHS >= k` by construction).
2. **Epistemic/substrate independence** (uncorrelated sources vs one model echoed N times) —
   **`[OPEN]`** (U2/L4). No estimator exists; "IMPLEMENT independence estimation" is the entire hard problem restated as a verb.
3. **Config/actor stability** (same keypair, swapped model/prompt inherits trust) — **`[OPEN]` and
   not even named** in the spec (the "Dissociative Identity" failure mode for LM agents).

The danger: an implementer reading only §8 (invariants) + §10 (EXITs) + §11 (reuse table) builds
the *topological* check, marks INV-11 "satisfied," and ships the L4 failure ("the crypto disarms
skepticism") the whole design exists to prevent.

### 3.2 FALSIFY is BROKEN AS WRITTEN (denial-of-grounding DoS)
Establishing grounding requires expensive disjoint cross-verification; *destroying* it (FALSIFY)
requires one cheap in-scope counterexample and auto-propagates COLLAPSE down the DAG with **no
authorization and no symmetric verification of the counterexample**. Fabricate a counterexample
to a widely-depended-upon root → mass-collapse its entire sub-DAG in one move. The guard is on
the wrong side of the asymmetry.

### 3.3 No cycle / contradiction / belief-revision semantics
The spec calls the structure a DAG but never *enforces* acyclicity (a real network forms cycles;
FALSIFY then loops). Two claims can each be "valid-given-their-premises" while directly
contradicting each other, and PACT has no nogood / attack-relation / preference to adjudicate
(ASPIC+ proves explicit preferences are *required*). FALSIFY with no recovery operator is 1/3 of
AGM belief revision — yet L8 ("repair, not penalty") demands exactly the un-falsify path.

### 3.4 Three contradictions with the design's own principles
- **REACH (§6.3) vs receiver-controlled trust (INV-2):** reach is a network-wide/emergent property;
  trust is strictly receiver-local. Coherent ONLY if REACH is **emergent-descriptive** (the envelope
  of independent receiver-local accepts), never **computed-prescriptive** (a radius the network grants
  — that reading violates INV-2 and re-creates the L1 engine). The spec is ambiguous here.
- **The cap-setter / "EFFECTIVE-presence" definer is an unbound throne (L6 violation).** The design
  forbids a central verifier, then introduces two unbound deciders: whoever defines "effective
  presence" and whoever sets `cap` + runs U1 issuance (the most powerful seat in the network). The
  design's deepest principle (name + bind every relocated throne) is violated by its central mechanism.
- **INV-10 "THE auditable log" assumes global state** that cannot exist across N mutually-untrusting
  roots (whose log is canonical?) — contradicts INV-2's receiver-locality.

### 3.5 The strategic mis-allocation
PACT spends its novelty budget on the transport/identity tier the field has *already matured*,
while its genuinely-new tiers sit on the one `[OPEN]` foundation (U1 human-root) it admits it
can't close. The differentiator is also the unimplemented dependency.

---

## 4. The credible field — what validates / contrasts PACT (the "find the others" answer)

PACT is **not** alone; the field is crowded, and most of PACT's components have a named, mature home.

### 4.1 Agent-to-agent protocols (PACT §1/§2/§4)
- **Google A2A** (Linux Foundation), **MCP** (Anthropic, agent↔tool), **IBM/BeeAI ACP**, **Cisco
  AGNTCY / Internet of Agents**, **ANP**, **Agora**, **LOKA** — all treat the agent as a
  self-sovereign **DID**; transport is **JSON-RPC 2.0** (A2A/MCP) or REST+MIME (ACP); discovery is
  an **Agent Card at `/.well-known/`**.
- **Contrast:** *none* anchor in human scarcity → PACT's human-rooting is a **genuine
  differentiator**, but ANP *explicitly endorses* unlimited multi-identity (the exact pattern
  PACT's cap exists to defeat). A 2026 threat-model survey confirms Sybil-resistance is absent
  across the field — PACT is right that this is the field's open wound, but its own U1 concedes the cure is unsolved.
- **PACT's biggest omission:** **no discovery story at all** — every incumbent treats capability
  discovery as mandatory. **The single biggest thing to borrow: an Agent-Card-style descriptor.**
- **Reinvented:** the §2 binary frame + §4 FSM re-derive JSON-RPC + the TLS handshake + FIPA-ACL's
  ~20 speech-act performatives (1990s prior art).

### 4.2 Trust / reputation / Sybil (PACT §1/§5)
- **EigenTrust** (canonical P2P reputation) — PACT's `wcons` is a *receiver-rooted, single-hop,
  seed-free* variant. PACT's improvement (no pre-trusted seed) is real and L6-motivated.
- **Advogato / Appleseed / TidalTrust / MoleTrust** (attack-resistant trust metrics) — INV-11
  disjoint-paths = **Advogato's max-flow at unit capacity** (Menger's theorem). Known bound: bad
  nodes admitted ≤ Σ(cₓ−1) over fooled honest nodes, *independent of Sybil count* — but Ruderman's
  break shows adaptive attackers beat the bound (post-attack capacities). PACT is *quantitatively
  weaker* than Advogato (discards edge-strength) but potentially stronger *if* it implements the
  substrate-diversity check Advogato lacks.
- **Subjective Logic** (Jøsang) — the principled home for both PACT's ad-hoc `α` blend *and* its
  disjoint-fusion guard (SL already requires path-independence before fusing). **Borrow this.**
- **Proof-of-personhood** (World ID, BrightID, Proof of Humanity, Idena, Gitcoin Passport,
  Personhood Credentials [OpenAI/MIT/Microsoft, ZK + multi-issuer]) — U1 is correctly still `[OPEN]`
  (irreconcilable security/privacy/exclusion tradeoffs; Douceur's impossibility stands), but
  **"contained in practice"** for bounded uses (Gitcoin cut attacker influence >80%). Personhood
  Credentials is a near drop-in for "pluggable root-issuance."
- **Unaddressed weakness:** config-swap/fork laundering — PACT binds trust to a *keypair*, not the
  agent's operative config. Fix = **configuration binding** (scope trust to a config-hash, decay on change).

### 4.3 Epistemics (PACT §3/§6/§7)
- **Truth-Maintenance Systems — JTMS (Doyle 1979) / ATMS (de Kleer 1986):** PACT §3 is, line for
  line, a re-derivation. premises=assumptions, `premises:[…]`=justifications, `VALID_GIVEN`=label,
  `FALSIFY`=retract-assumption+recompute. **Adopt ATMS** → inherit for free: multi-context reasoning
  (what §3.1 scope + inter-node need), **nogoods** (automatic contradiction handling PACT lacks),
  and proven incremental label propagation (validates the "no re-derivation" claim).
- **Argumentation:** Toulmin model (claim/data/warrant/qualifier/rebuttal = premise/scope/claim),
  Dung 1995 abstract argumentation + ASPIC+ (defeasibility, and the proof that preferences are
  *required* to resolve conflict). **AGM** (belief revision) for the missing un-falsify operator.
- **Scope:** §3.1 `derived_scope = ∩ scopes` = **McCarthy's `ist(c,p)`** context logic / Local Model
  Semantics; graded `edge_confidence` wants **possibilistic logic** / gradual argumentation.
- **Reach = verification strength** = the **possibilistic weakest-link principle** (`N = min` over the
  chain) and/or **provenance semirings** (Green et al.) — *not novel as confidence-propagation*; the
  PACT-original bit is binding that bound to *propagation radius* + contrasting it with engagement.
- **Audit log** = **Certificate Transparency / RFC 6962** — correctly `[SOLVED]`, but should use
  **Merkle inclusion + consistency proofs**, not a linear PREV_HASH chain (the proofs are what detect
  cross-node equivocation). Provenance should adopt **W3C PROV**.

---

## 5. Build-vs-borrow — the inversion (the "more optimal parts to borrow" answer)

### ADOPT WHOLESALE (do not build — borrow the mature standard)
| Borrow | From | Replaces in PACT |
|---|---|---|
| **DID/VC** (`did:key`/`did:web` + Verifiable Credentials) | ANP/LOKA/AGNTCY | bespoke `SRC_PERSONA` plumbing (bolt human-root + cap on top) |
| **A2A/JSON-RPC transport + mTLS/OAuth2/OIDC** | A2A/ACP | custom binary frame §2 + session FSM §4 (carry PACT semantics as payload) |
| **Agent Card at `/.well-known/`** | A2A/ANP/AGNTCY | the *missing* discovery layer (largest table-stakes gap) |
| **RFC 6962 Merkle log + inclusion/consistency proofs** | Certificate Transparency | §7 linear PREV_HASH chain |
| **ATMS** (nodes/justifications/environments/labels/nogoods) | de Kleer 1986 | hand-rolled §3 DAG walk |
| **Possibilistic weakest-link + provenance semirings** | Dubois&Prade; Green et al. | §6.3 un-aggregated gradient |
| **Subjective Logic** (belief/disbelief/uncertainty, discount, fusion) | Jøsang | ad-hoc `α` blend |

### GENUINELY BUILD (the novel core — the whole point)
1. The **human-scarcity cap bound to `effective_presence()`** + a **bound** cap-setter throne.
2. **Verification-gated REACH as emergent-descriptive** (the anti-engagement inversion).
3. **DIRECT-vs-CONSENSUS seed-free trust** (the real EigenTrust improvement).
4. The **premise.creator = human accountability coupling** (the thing TMS lacks).

### DROP / DEFER
- **DROP** the bespoke frame (§2) + FSM (§4) — reinvented wheels (KISS/YAGNI).
- **DROP** the "we use humans" pitch → say "Sybil cost is a *budgeted, bounded, auditable* quantity instead of zero."
- **DEFER** identity caps until a 2nd mutually-untrusting root exists (no Sybil surface at single-uid).
- **DEFER** the global independence estimator (U2) — ship *topological* disjointness with an explicit
  visible **WEAK** flag; never ship CONVERT/CROSS_VERIFY as if `independence` is solved.

---

## 6. Power Loom as the single PACT node — what's free, what's the gap

The user's framing — `kernel → runtime → lab(evolution)` as one PACT node — **holds**: it is a
coherent PACT node *interior* and a real head start. But §11's mapping table over-claims; the code
verification (`research/prior-art/power-loom-mapping.md`, every claim cites file:line) found:

- **FREE / near-free primitives:** the **content-addressed, hash-chained, integrity-verified-on-read,
  idempotent append-only log** (`transaction-record.js` + `record-store.js`) = §7 *minus a signature*;
  and a reviewed **ed25519 sign/verify** already exists (`lab/edge-attestation.js`) + a signed-weight
  minter (`weight-minter.js`) = §2's `SIG` plugs straight in. Both are SHADOW + same-uid today.
- **ACCURATE §11 rows (5):** deterministic replayable envelope→§7; reputation-only-via-snapshot→§5/§6
  separation; pure-function gates / no-LLM-in-blocking-path→mechanical VALIDATE; enforced-floor/
  shadow-ceiling; source-blind consumer.
- **OVER-CLAIMED §11 rows (do not trust):** "contract verification = §3 VALIDATE *already
  premise-bound!*" (there is **no** premise/claim DAG, no derivation-soundness check, no scope, no
  falsify-propagation — §3 is **MISSING**); "DIRECT/CONSENSUS trust engine" (it's a flat
  `{pass,partial,fail}` per persona, no DIRECT/CONSENSUS axis, no asymmetric crater); "≥2-distinct
  JOIN = SAME mechanism as INV-11 disjoint paths" (three count-of-2 checks on weak keys, **none**
  verifies path-disjointness — the exact L4/INV-11 landmine, unsolved).
- **The honest gap to a 2-node PACT is mostly greenfield boundary work:** a persona is a *string*,
  not a keypair; there is no human root, no Sybil cap, no PKI. This is the repo's own **#273 residual**
  ("store proves integrity not provenance → signed/kernel-writer edges") — *the same gap*, restated as
  the inter-node boundary. Phase 0 (per-persona keypair + frame + flipping the SHADOW signer to
  per-persona key custody via the existing `resolveSigner` seam) is the largest single chunk but ~half
  wiring; the §3 Premise/Claim model + the §5 P2 engine are net-new.

---

## 7. The five non-negotiable amendments (ship before / within the build)

1. **REACH is emergent-descriptive, never computed-prescriptive** — resolves INV-2/§6.3; avoids re-creating the L1 engine + an L6 throne.
2. **Bind the cap-setter & root-issuer throne** (L6) — name them; make them auditable/plural/rotating/contestable; define `effective_presence()` over the LOG.
3. **INV-10 is per-receiver + RFC 6962 consistency proofs**, not a single global log — resolves the global-state scaling cliff + the INV-2 contradiction.
4. **FALSIFY fixed + acyclicity enforced + revision operator** — *correctness, lands in v0*: counterexample clears the same disjoint bar as grounding; dependents → `CONTESTED` (reversible) not auto-`COLLAPSED`; specify who-may-falsify; add the un-falsify path (mechanizes L8 "repair not penalty").
5. **Configuration-binding** — DIRECT trust scoped to a config-hash; a config change decays/re-evaluates rather than silently inherits (the unnamed third "independence").

---

## 8. Recommended build order (buildable → frontier; every `[OPEN]` dep named)

| Phase | `[OPEN]` dep | Content | Power Loom reuse |
|---|---|---|---|
| **P0 — Boundary** | none | DID/VC + A2A transport + Agent Card + Merkle proofs; per-persona keypair; **RFC 8693/7523 on-behalf-of delegation tokens shaped as an attenuation-only, depth-bounded chain (the AIP form), chain-root bound to the scarce-human cap** (see [§identity-layer](11-identity-layer-integration.md)); U1 issuance **stub w/ one default**; inter-node signing (Option B → closes #273 same-uid). **EXIT: two *distinct-keyed* roots exchange tamper-evident frames — proves distinct-keyed, NOT human-independent.** | `edge-attestation.js`, `transaction-record.js`, `resolveSigner` seam |
| **P1 — Claim/Premise as ATMS** | none — the thesis core | Premise/Claim/Scope + VALIDATE (A-given-P, ∩scope via possibilistic min) + **FALSIFY-fixed** + **acyclicity**. **P0 + P1 = the coherent v0.** | greenfield (§3 absent today) |
| **P2 — Trust P2a** | **U2 (flagged)** | seed-free DIRECT/CONSENSUS (Subjective Logic) + config-binding + bounded multi-hop `wcons`. **CONVERT ships topological-only w/ visible WEAK flag; EXIT names it does NOT yet contain U2.** | flat reputation store (rebuild the axis) |
| **P3 — Grounding P2b + REACH** | **U2/U3 (named)** | stakes-weighted CreatorStanding; semiring CROSS_VERIFY; REACH emergent-descriptive. EXIT annotated w/ Phase-5 dependency. | verdict-attestation, causal-edge |
| **P4 — Caps** | **U1; defer until 2nd root** | `effective_presence()` + bound throne. | — |
| **P5 — Frontier containment** | **U1-U4 — narrowed by live data, never closed** | substrate-diversity independence est. (U2); scope-edge probing (U3); high-stakes disjoint corroboration (U4); harden U1 → Personhood Credentials. | — |

**The discipline that makes it honest:** every phase ≥ P2 declares its `[OPEN]` dependency *as a
phase contract*; no gate that *acts on* "independence" ships before P5 without a visible WEAK flag.
That converts the adversarial lens's most dangerous finding (a live topology-only gate window) from
a latent exploit into an acknowledged, contained, visibly-degraded mode — exactly what M1 requires.

---

## 9. v0 — the smallest thing worth building (proves the thesis, no U1/U2 dependency)

> **Two mutually-untrusting roots exchange ONE authenticated, premise-bound, scope-checked,
> falsifiable claim — and a fabricated counterexample does NOT silently collapse it.**

This proves "machine bears mechanical certainty, human bears truth-burden, coupling gated by
disjoint-verified evidence" on the *grounding-and-identity axis*, which is honestly buildable today
on Power Loom — **without** shipping any gate (CONVERT/CROSS_VERIFY/REACH/caps) that genuinely needs
the frontier solved. U1/U2 are *containment* problems = parameters, not preconditions: localize U1
to one seam + one chosen default, flag U2 WEAK. **Non-negotiable in v0:** FALSIFY-fixed + acyclicity.

---

## 10. Open decisions for the user (ratify before we plan the v0 build)

1. **Scope of next phase** — do we (a) proceed to a v0 *build plan* (P0+P1, the 2-node falsifiable
   claim), (b) first fold the five amendments into an amended `PACT-spec.md v1.1`, or (c) deepen a
   specific research thread (e.g., a focused ATMS-vs-§3 design spike, or a PoP/U1-issuance decision)?
2. **U1 default** — which root-issuance default does v0 ship behind the pluggable seam: invite/vouch
   + stake (true MVP), or Personhood Credentials (ZK, multi-issuer — stronger, heavier)?
3. **Build-on-Power-Loom vs clean-room** — v0 reuses the Power Loom log + ed25519 primitives. Confirm
   PACT builds *on* the toolkit repo (as a new package/tier) vs. a standalone repo that vendors them.
4. **The "independence" research bet** — U2 (epistemic/substrate independence estimation) is the
   frontier the whole design's value rests on. Is narrowing it (substrate-diversity scoring) a
   first-class research track we fund now, or strictly deferred to P5?

---

*Supporting artifacts: `research/prior-art/{a2a-protocols, trust-reputation-sybil, epistemics,
power-loom-mapping}.md` · `research/verification/{adversarial, honesty, architect}.md` ·
`research/00-research-plan.md`. Every prior-art report carries its own cited source list.*
