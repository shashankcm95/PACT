---
lifecycle: persistent
lens: integration / design-soundness (architect)
phase: proto-planning verification
created: 2026-06-21
---

# PACT — Integration / Design-Soundness Verdict (final HETS lens)

> Fed all four prior-art reports + both verification lenses + the two PACT docs.
> Job: adjudicate, find seam-level gaps, answer the architectural questions.

## 0. The seam the other lenses missed: "independence" is THREE predicates wearing one word
1. **Topological disjointness** (vertex/edge-disjoint paths) — **SOLVED** (Menger/Advogato max-flow).
   Cheap to compute, cheap for an attacker to *fabricate* (the k-root forge).
2. **Epistemic / substrate independence** (uncorrelated sources vs one model echoed N times) —
   **`[OPEN]`** = U2/L4. Provenance-semirings formalize the sharing structure but don't *measure* it.
3. **Config / actor-identity stability** (same keypair, swapped config inherits trust) —
   **`[OPEN]` and NOT EVEN NAMED in the spec** — the "Dissociative Identity" result.

PACT can ship #1 honestly today, must contain #2 forever, and doesn't acknowledge #3.
The single most dangerous move is letting #1 masquerade as #2.

## Q1 — Coherence: spine SOUND; 1 genuine + 2 latent contradictions
- **Spine coherent:** P1/P2 split + separate trust/grounding homes + reach-by-verification is clean SRP.
- **Contradiction #1 (RESOLVABLE): receiver-controlled trust (INV-2) vs network-wide REACH (§6.3).**
  Coherent ONLY if REACH is **emergent-descriptive** (the envelope of independent receiver-local
  accepts), never **computed-prescriptive** (a radius the network grants). As written it's ambiguous;
  the prescriptive reading violates INV-2 AND re-creates the L1 engine + an L6 throne. One-paragraph fix, currently absent.
- **Contradiction #2 (UNRESOLVED): the cap-setter / `EFFECTIVE`-presence definer is an unbound throne.**
  The design forbids a central verifier then introduces two unbound deciders (who defines "effective";
  who sets `cap` + runs U1 issuance — the most powerful seat in the network). Violates the design's own deepest principle (L6).
- **Contradiction #3 (latent): INV-10 "THE auditable log" presupposes a singular log; the network has N.**
  Contradicts INV-2's receiver-locality. Fix: per-receiver log + RFC 6962 consistency proofs.

## Q2 — Scaling single-node → network: interior scales, boundary has 4 cliffs
1. **INV-10 global-log assumption** — no "the log" across mutually-untrusting roots; N logs, equivocation
   possible. Fix = per-receiver verified-observation set + Merkle consistency/inclusion proofs (CP→AP trade; *catch* forks, don't prevent — = M6 trust-while-watching).
2. **`wcons` is single-hop** — maximally Sybil-safe but the network stays disconnected trust islands
   (WoT bootstrap problem). Fix = *bounded* multi-hop attenuation (Appleseed / Subjective-Logic discount), depth a hard small audited constant.
3. **`independence` estimator is O(global topology) AND ships in Phases 2-3 before Phase 5 builds it**
   — a live topology-only gate for three phases = the L4 trap in production. The scaling cliff that is also a correctness cliff.
4. **Config-swap / fork-laundering** — trust binds to a keypair; config B inherits config A's trust.
   Only bites at network scale. Fix = configuration binding (trust scoped to config-hash, decays on change).

## Q3 — Build-vs-borrow (the strategic inversion)
**ADOPT WHOLESALE:** DID/VC (identity) · A2A/JSON-RPC transport + mTLS/OAuth2 · Agent Card `/.well-known/`
(the missing discovery layer) · RFC 6962 Merkle log w/ proofs (replaces linear PREV_HASH) · **ATMS**
(replaces hand-rolled §3 DAG — imports nogoods/multi-context/incremental propagation) · possibilistic
weakest-link + provenance semirings (§6.3 aggregation) · Subjective Logic (the §5 blend + fusion).
**GENUINELY BUILD (the novel core):** the human-scarcity cap bound to `effective_presence()` + bound
throne · verification-gated REACH as emergent-descriptive · DIRECT-vs-CONSENSUS seed-free trust (a real
improvement on EigenTrust) · the premise.creator=human accountability coupling (the one thing TMS lacks).
**DROP/DEFER:** bespoke binary frame §2 + session FSM §4 (reinvented JSON-RPC+TLS+FIPA) · the "we use
humans" pitch (say "Sybil cost is a *budgeted bounded auditable* quantity instead of zero") · identity
caps until a 2nd root exists (no Sybil surface at single-uid) · the global independence estimator (ship topological + WEAK flag).

## Q4 — Minimal coherent v0 (does NOT depend on solving U1/U2)
**v0 = two mutually-untrusting roots exchange ONE authenticated, premise-bound, scope-checked,
falsifiable claim — and a fabricated counterexample does NOT silently collapse it.**
Maps ~1:1 onto power-loom: keypair+sign/verify (reuse `edge-attestation.js`), Merkle log (reuse
`transaction-record.js`+`record-store.js`, add proofs), U1 issuance STUB (one default), Premise/Claim/
Scope + VALIDATE (greenfield), FALSIFY **fixed**, inter-node signing via `resolveSigner` seam (Option B).
**v0 EXCLUDES** DIRECT/CONSENSUS, CONVERT, CROSS_VERIFY, REACH, caps (each `[OPEN]`-dependent or no surface yet).
**Why U1/U2 are NOT preconditions:** both are *containment* problems (M1) = parameters, not preconditions.
Localize U1 to one seam + one chosen default; flag U2 independence WEAK + never silently count strong.
The thesis is provable on the grounding+identity axis without the trust-conversion axis.
**Two corrections are correctness, not features — land in v0:** (1) FALSIFY fixed (counterexample clears
the same disjoint bar; dependents → CONTESTED reversible not COLLAPSED; authz + revision operator for L8
repair); (2) acyclicity enforced at VALIDATE (fail-closed load-time boundary).

## Q5 — Decision: BUILD WITH AMENDMENTS, re-scoped, inverted order
**Five named amendments (do not proceed without):** ① REACH emergent-descriptive not prescriptive ·
② bind the cap-setter/root-issuer throne + define `effective_presence()` · ③ INV-10 per-receiver +
consistency proofs · ④ FALSIFY fixed + acyclicity + revision operator · ⑤ config-binding (trust scoped to config-hash).

**Phased order (buildable → frontier; every `[OPEN]` dep named at its phase):**
- **P0 Boundary** [no OPEN dep]: DID/VC + A2A transport + Agent Card + Merkle proofs; reuse ed25519 +
  record-store; U1 issuance stub w/ one default; inter-node signing (Option B, closes #273 same-uid). EXIT proves *distinct-keyed*, NOT human-independent.
- **P1 Claim/Premise as ATMS** [no OPEN dep — the thesis core]: types + VALIDATE + FALSIFY-fixed +
  acyclicity. **P0+P1 = the coherent v0.**
- **P2 Trust P2a** [DEPENDS U2 — flagged]: seed-free DIRECT/CONSENSUS + config-binding + bounded multi-hop;
  CONVERT ships topological-only w/ visible WEAK flag; EXIT names it does NOT yet contain U2.
- **P3 Grounding P2b + REACH** [DEPENDS U2/U3 — named]: stakes-weighted CreatorStanding, semiring
  CROSS_VERIFY, REACH emergent-descriptive. EXIT annotated w/ Phase-5 dependency.
- **P4 Caps** [DEPENDS U1; defer until 2nd root]: `effective_presence()` + bound throne.
- **P5 Frontier containment** [U1-U4, narrowed by live data never closed].

**Discipline that makes it honest:** every phase ≥2 declares its `[OPEN]` dependency AS A PHASE CONTRACT;
no gate acting on `independence` ships before P5 without a visible WEAK flag. Converts the adversarial
lens's most dangerous finding (topology-only live-gate window) from latent exploit into acknowledged contained degraded mode (= M1).

## BOTTOM LINE
Build PACT — but invert the spec's build order and ship five amendments first. The thesis is genuine and
unreplicated in the A2A field; power-loom hands you the two hardest primitives nearly free (hardened
content-addressed hash-chained log = §7 minus a signature; reviewed ed25519 = §2's SIG). Spend zero effort
rebuilding transport/identity — adopt DID/VC + A2A + Agent Card + RFC 6962 wholesale, and re-specify §3 as
an ATMS. v0 = two roots exchanging one authenticated premise-bound falsifiable claim, and it does NOT
depend on solving U1/U2 (containment = parameter, not precondition). Non-negotiable in v0: fix FALSIFY
(today a denial-of-grounding DoS) and enforce acyclicity. Then sequence so every gate acting on
"independence" ships after the estimator OR with a WEAK flag — because "independence" is three predicates
(topological=solved, epistemic=open, config-stability=not-even-named) and the worst move is letting #1
masquerade as #2. Resolve before any code: name and bind the cap-setter/root-issuer throne — the one
unbound seat the design swears it refuses.
