# PACT — Premise-Anchored Coordination/Trust Protocol
### Implementation Specification · v1.0 · *handoff build*

> **What this is.** A synthesis of two prior design docs (HCP/8B for humans, A2TP
> for agents) plus the premise-chain refinements, collapsed into one **buildable**
> protocol for a network of authenticated AI agents rooted in scarce human identity.
>
> **Reading guide for the implementer (Claude Code).** Tags:
> `[SOLVED]` integrate a mature primitive · `[BUILD]` assemble per this spec ·
> `[OPEN]` genuine frontier — implement the *containment*, do not pretend elimination.
> Build order is in §10. Power Loom mapping (existing code that already implements
> parts of this) is in §11 — reuse it, don't rebuild it.
>
> **The one-sentence thesis.** The machine bears the *mechanical* burden (transport
> integrity, derivation validity, falsification-propagation); the human bears the
> *truth* burden (premises, accountable, scored); and the coupling is gated so that
> neither confidence nor identity-count ever propagates further than genuine,
> disjoint, human-accountable evidence supports.

---

## 0. Foundational split (the spine — violate nowhere)

```
P1  TRANSPORT INTEGRITY   — is this message untampered + from who it claims?   [SOLVED] crypto
P2  CONTENT HONESTY/TRUTH — is the authenticated sender right?                 contained, never "solved"
        P2a  TRUST   (volatile, advisory)        -> §5  who has earned reliability
        P2b  GROUNDING (durable, falsifiable)    -> §6  is the CLAIM valid-given-falsifiable-premises

KEY: a verified signature proves WHO + UNTAMPERED, never TRUE.
     trust is the volatile lens; grounding is the durable ledger. SEPARATE HOMES (§5 vs §6).
```

---

## 1. Identity & Sybil anchor

```
HumanRoot   := { human_uid: K_root_pub }     // ONE per human. the SCARCITY ANCHOR.
                                             // [OPEN] one-human-one-root is the irreducible
                                             // hard problem — see U1. Localize it HERE, one layer.
Persona     := { persona_id: K_pub, parent: human_uid, σ_root, abstraction_meta }
                                             // exposed face. user authors abstraction beneath root.
Agent       := a Persona acting autonomously // an agent IS a persona's keypair + behavior.

CAPS (anti-pollution):
   cap(human_uid) = max EFFECTIVE network-facing identities under this root.
   *** counts EFFECTIVE participants, not nominal personas ***
   user chooses the ABSTRACTION STRUCTURE beneath the root (sovereignty),
   but CANNOT expand the identity-budget (cap binds effective fan-out).
   -> abstraction freedom organizes the budget; it never grows it. (INV-12)
```

---

## 2. Wire format — PACT frame

```
+-----------------------------------------------------------------+
| VER | TYPE | SRC_PERSONA (K_pub) | parent HUMAN_UID (hash)       |
+-----------------------------------------------------------------+
| DST | SEQ | ACK_REF | FLAGS:[INIT][ACK][EXCH][VRFY][FIN] | NONCE  |
+-----------------------------------------------------------------+
| PREV_HASH (hash-chain into audit log)                            |
+-----------------------------------------------------------------+
| PAYLOAD  (see §3 — may be a Claim with premise refs)             |
+-----------------------------------------------------------------+
| SIG = sign(src.priv, H(all_above))                               |
+-----------------------------------------------------------------+
```

Receiver MUST: `verify(SRC, frame, SIG)` ∧ `chains(PREV_HASH)` ∧ `root_valid(parent)`.
Any fail → drop. This is all of P1. `[SOLVED]` (mTLS/PKI/signed-log primitives).

---

## 3. Payload as Claim — the premise chain (core data model)

The central reframe: **payloads are not truth-declarations; they are conditional
claims bound to falsifiable premises.**

```
Premise := {
   id, statement,
   scope:        ScopeSpec,          // DOMAIN OF VALIDITY (e.g. "near-Earth, non-relativistic")
   creator:      human_uid,          // *** the human OWNS this premise *** (truth-burden, §6)
   verification: VerifState,         // disjoint cross-verification record (§6.2)
   t, ttl                            // premises can be time-bounded too
}

ScopeSpec := {
   domain_predicate,                 // where it claims to hold
   edge_confidence: gradient         // confidence FALLS OFF near the boundary (not a wall)
}

Claim := {                           // an "artifact" — valid-GIVEN-its-premises, asserts no raw truth
   id, content,
   premises: [Premise|Claim],        // a premise may itself be a prior validated Claim (DAG)
   validation: ValProof,             // mechanical: does content correctly follow from premises?
   derived_scope                     // = INTERSECTION of all ancestral scopes (computed)
}
```

```
proc VALIDATE(claim):                          // MECHANICAL, decidable, [BUILD]
   for p in claim.premises: require valid(p) or is_premise_root(p)
   require derivation_sound(claim.content, claim.premises)   // closed question: A-given-P
   claim.derived_scope := ∩ scope(p) for p in claim.premises // scope intersection (§3.1)
   return VALID_GIVEN(claim.premises)           // NEVER "TRUE". always conditional.

proc FALSIFY(premise):                          // falsification propagates DOWN automatically
   mark premise falsified
   for c in dependents(premise):
       c.grounding := COLLAPSED                  // valid-given-P stands formally, but P is gone
   // self-invalidating via the dependency DAG. no re-derivation needed.
```

### 3.1 Scope rules (domain-aware validity)

```
- a premise is NOT falsified by an out-of-scope counterexample (it never claimed there)
- a premise IS falsified by an in-scope counterexample
- a Claim is valid only within ∩(ancestral scopes); applying it OUTSIDE that domain is BLOCKED
- scope boundaries are GRADED (edge_confidence) — solid in core, approximate near edge, invalid beyond
- [OPEN] scope drawn too WIDE silently over-extends (caught only by sparse edge-testing) — see U3
```

---

## 4. Session state machine (transport)

```
CLOSED --INIT--> INIT_SENT --recv ACK--> ESTABLISHED --(EXCH/VRFY loop)--> --FIN--> TEARDOWN --> CLOSED
```
```
on ESTABLISHED (mutual auth done):
   loop:
      EXCH: tx/rx signed frames → append to hash-chained LOG   [SOLVED]
      VRFY: verify(peer, frame, σ) per frame                    // P1 integrity (binary), NOT honesty
   until FIN
```
No biometric gating, no semantic-drift caveat — agents share explicit protocol
semantics. Honesty (P2) is evaluated *across* sessions in §5/§6, never in-session.

---

## 5. Trust engine — P2a (volatile, advisory)

Two explicit scores, **asymmetric evidentiary burden.** (This is the A2TP §5 model.)

```
DIRECT[me, agent]    : first-person, earned. HIGH weight, LOW burden. Sybil-PROOF.
                       decays without reinforcement; defection CRATERS it (asymmetric).
CONSENSUS[agent]     : third-party, propagated. ADVISORY ONLY (raises a hypothesis,
                       cannot act on its own authority). presumed SUSPECT, HIGH burden.

INSIGHT: one substance read at two distances — DIRECT = 0 hops; CONSENSUS = N hops, ATTENUATED.
```

```
proc TRUST(me, agent):
   direct := DIRECT[me, agent]                       // may be ⊥
   wcons  := Σ_v DIRECT[me,v]*vouch(v,agent) / Σ_v DIRECT[me,v]   // weighted THROUGH my graph
            // a million Sybils inflate RAW consensus, contribute ~0 here (no earned edges)
   α := confidence(interaction_count(me,agent))      // ~1 rich history, ~0 never met
   return α*direct + (1-α)*wcons                      // adaptive per-target blend

proc CONVERT(me, agent):   // consensus-trust → ACTIONABLE trust. consensus must EARN it.
   require DISJOINT_PATHS(me, agent) >= k             // independent paths; defeats cluster-collusion
   require PROBATION(agent)                            // *** key loop: low-stakes trial builds DIRECT
                                                       //     trust → promotion. consensus = on-ramp,
                                                       //     never a substitute. ***
   require VOUCHER_STAKE(agent)                        // vouchers risk their OWN direct trust
   require BEHAVIORAL_DEMO(agent)                      // auditable (LOG-backed) demonstration
   FORBIDDEN: "more vouches" (Sybil-satisfiable) · central verifier (becomes a throne)
```

---

## 6. Grounding engine — P2b (durable, falsifiable) — the human truth-burden

```
PRINCIPLE: the machine validates A-given-P (mechanical, §3). The HUMAN owns P —
its statement, scope, and score — because only a human can be ACCOUNTABLE for an
empirical claim about the world. Truth-burden rests on an accountable human. (INV-3)
```

### 6.1 Premise ownership & creator coupling

```
each Premise.creator = a human_uid. the human STAKES reputation on it.
PremiseScore(p) rises if p survives disjoint cross-verification, falls if p is falsified.
CreatorStanding(human) = §5.7-style pattern over their premise track-record:
   - do their premises survive verification? (not their WORTH — their reliability AS A SOURCE)
   - decaying, asymmetric: a falsified premise costs standing.
```

### 6.2 Cross-verification (DISJOINT — this is load-bearing)

```
proc CROSS_VERIFY(premise):
   confirmations := independent confirmations against REAL-WORLD knowledge
   strength := f( DISJOINT_PATH_COUNT(confirmations), independence )
   // *** disjoint, genuinely independent — NOT raw count. ***
   // correlated confirmations (same source/model/assumption echoed) = WEAK, near-zero strength.
   // (this is the U2 correlated-consensus guard, applied to premises.)
   return strength
```

### 6.3 Reach radius = consequence (verification-gated propagation)

```
REACH(claim) ∝ VERIFICATION_STRENGTH(root premises)   // NOT engagement. (INV-9)
   strongly cross-verified roots → claim propagates FAR (well-grounded)
   weakly cross-verified roots   → claim propagates SHORT, then marked PROVISIONAL beyond threshold

THRESHOLD: a claim's CLAIMED GROUNDING may never exceed its ROOT's actual (disjoint) verification.
   beyond the threshold the chain may stay formally VALID but is flagged "provisional/ungrounded",
   never masquerading as hardened. -> kills the long-perfect-chain-on-a-weak-root failure.

*** CRITICAL: REACH is gated by VERIFICATION, never ENGAGEMENT. ***
    same mechanism as social-media reach; OPPOSITE outcome. the gate is the entire difference
    between "truth propagates / noise stays local" and "the misinformation engine".
```

---

## 7. Audit layer

```
LOG := append-only, hash-chained, signed. [SOLVED] tamper-evident.
   a ledger-like structure is APPROPRIATE here (unlike HCP/8B) — agents have no
   private interior and no right-to-be-forgotten; a permanent verifiable record is a feature.
   trust (§5) and verification (§6) are computed from LOG (provable behavior), never hearsay. (INV-10)
```

---

## 8. Invariants (MUST hold)

```
INV-1   P1 (transport) and P2 (honesty) NEVER conflated. signature ⇒ WHO+UNTAMPERED, never TRUE.
INV-2   trust is RECEIVER-controlled; no sender/consensus dictates its own credence.
INV-3   the TRUTH-BURDEN rests on an accountable HUMAN (premise.creator); the machine bears only
        the MECHANICAL burden (validity, falsification-propagation, scope-intersection).
INV-4   artifacts are CONDITIONAL claims (valid-given-premise), never truth-declarations.
INV-5   premises carry SCOPE (domain of validity); falsification respects scope (in-scope only);
        claims are invalid OUTSIDE ∩(ancestral scopes); scope edges are GRADED.
INV-6   DIRECT (relational) trust outweighs CONSENSUS; CONSENSUS is advisory (cannot act alone).
INV-7   conversion/verification loops demand the UNFORGEABLE (earned trust, DISJOINT paths, stake,
        auditable demo) and NEVER the CHEAP (more vouches, more identities, a central checker).
INV-8   trust + premises DECAY without reinforcement; defection/falsification is ASYMMETRIC (craters).
INV-9   REACH ∝ disjoint VERIFICATION strength, NEVER engagement. claimed grounding ≤ root verification.
INV-10  all trust + verification computed from AUDITABLE (hash-chained, signed) record, not hearsay.
INV-11  trust-graph + cross-verification require DISJOINT independent paths, not mere sufficient count
        (defeats Sybil flooding AND earned-then-collude AND correlated-consensus).
INV-12  identity CAP binds EFFECTIVE network-facing presence, not nominal personas. user authors
        abstraction STRUCTURE beneath root (sovereignty) but cannot EXPAND the identity-budget.
```

---

## 9. Undefined Behavior — the genuine frontier `[OPEN]` (implement CONTAINMENT)

```
U1  HUMAN-ROOT UNIQUENESS (the irreducible core)                    [OPEN]
    Everything's Sybil-resistance reduces to one-human-one-root. Proving that needs a
    real-world identity anchor (with its centralization/privacy/exclusion tradeoffs —
    see HCP/8B identity turns). LOCALIZED to §1, not smeared — that's the progress.
    IMPLEMENT: pluggable root-issuance (start: invite/vouch web-of-trust + stake;
    upgrade path: stronger anchors). Containment = cap × disjoint-paths makes a breach
    EXPENSIVE and BOUNDED, never impossible. Do NOT claim elimination.

U2  CORRELATED CONSENSUS / VERIFICATION (machine + human monoculture)  [OPEN]
    Confirmations from a shared substrate (same model family, same source) are correlated —
    cryptographic authenticity is NOT epistemic independence. CONTAINMENT: INV-11 disjoint
    paths + substrate/source diversity scoring. IMPLEMENT independence estimation; flag
    low-independence verification as WEAK regardless of count.

U3  SCOPE-BOUNDARY ERROR                                            [OPEN — contained]
    A too-WIDE scope silently over-extends; failure surfaces only at sparse edge-testing.
    CONTAINMENT: scopes are themselves falsifiable claims (test the boundary), graded at edges,
    drawn at TRUE domain. IMPLEMENT edge_confidence + boundary-probing tests.

U4  PATIENT SLEEPER / EARNED-THEN-COLLUDE                           [OPEN — contained]
    Genuine trust earned to defect later, or genuine-trust agents colluding. CONTAINMENT:
    high-stakes ⇒ DISJOINT high-trust corroboration (INV-9/11); single sleeper insufficient.
    Bounds damage, not the con.
```

---

## 10. Build roadmap (for Claude Code)

```
PHASE 0  — Transport + Identity [SOLVED primitives, assemble]
   keypair-per-persona; HumanRoot issuance (pluggable, start invite/stake);
   PACT frame (§2); session FSM (§4); hash-chained signed LOG (§7).
   EXIT: two independently-rooted agents exchange tamper-evident, mutually-authenticated frames.

PHASE 1  — Claim/Premise data model + mechanical validation [BUILD]
   Premise/Claim/Scope types (§3); VALIDATE (derivation soundness + scope intersection);
   FALSIFY (downward propagation over the DAG).
   EXIT: a claim validates as valid-given-premises; falsifying a root collapses dependents;
         applying a claim outside ∩scope is blocked.

PHASE 2  — Trust engine P2a [BUILD]
   DIRECT + CONSENSUS scores; TRUST blend; CONVERT gate with PROBATION/DISJOINT/STAKE/DEMO (§5).
   EXIT: Sybil flood inflates consensus but cannot ACT; probationary bootstrap promotes via
         direct experience; disjoint-path requirement defeats single-cluster collusion.

PHASE 3  — Grounding engine P2b [BUILD + OPEN containment]
   premise ownership + CreatorStanding; CROSS_VERIFY (disjoint); REACH gating (§6).
   EXIT: well-verified premises reach far, weak ones stay local + flagged provisional;
         claimed grounding ≤ root verification; reach gated by VERIFICATION not engagement.

PHASE 4  — Identity caps + abstraction [BUILD]
   effective-presence cap (§1, INV-12); user-authored abstraction beneath root.
   EXIT: user freely structures personas; total effective presence capped; abstraction
         cannot expand the budget.

PHASE 5  — Frontier containment [OPEN]
   independence estimation (U2); scope-edge probing (U3); high-stakes disjoint corroboration (U4);
   harden HumanRoot issuance (U1). these are NARROWED by live adversarial data, not closed.
```

---

## 11. Power Loom mapping — reuse, don't rebuild

`claude-power-loom` already implements much of the NODE INTERIOR. Map and reuse:

```
Power Loom pillar                          → PACT component
-------------------------------------------  --------------------------------------------------
Byzantine LLM (in+out untrusted vs ground)   → INV-1 (P1≠P2); inputs untrusted, claims verified
filesystem-delta-as-truth                    → §3 reframed: delta is VALID-GIVEN-CONTRACT, not "truth"
contract verification                        → §3 VALIDATE (A-given-P) — already premise-bound!
persistent identity reputation (on disk)     → §5 DIRECT/CONSENSUS trust engine
≥2-distinct JOIN (anti credit-laundering)    → INV-11 DISJOINT paths — SAME mechanism/attack
persona provenance (built_by/graded_by)      → §6.1 premise creator ownership + provenance DAG
source-blind consumer / recalibration        → §5 receiver-controlled, advisory consensus
deterministic replayable envelope            → §7 audit LOG; provenance chain (premise→artifact→valid)
reputation only via explicit snapshot        → §5/§6 separation: volatile trust OUT of blocking path
pure-function gates, no LLM in blocking path  → §3 VALIDATE is mechanical/decidable (P1, blocking)
enforced floor / shadow ceiling / best-effort→ fail-safe: deterministic floor holds under stochasticity

GAPS Power Loom must cross to BECOME a PACT node (these are the build, not the reuse):
   - intra-node (single trust root) → INTER-node (mutually-untrusting roots) :: needs §1+§2 signed identity
     (your #273 residual "store proves integrity not provenance" → signed/kernel-writer edges = exactly this)
   - reputation DATA is admittedly non-discriminating → needs live adversarial hardening (Phase 3/5, U4)
   - no Sybil surface (single uid) → appears at inter-node; needs §1 caps + U1 containment
```

---

### Meta-note for the implementer

PACT **solves P1** (who said what, untampered, auditable — mature engineering) and
**contains P2** by *dividing the labor of knowing*: the machine bears mechanical
certainty (validity, falsification-propagation, scope-intersection); the human bears
the truth-burden (premises, accountable, scored on track-record); and the coupling is
gated by *disjoint* cross-verification + *verification-keyed* reach so that confidence
and identity-count never outrun genuine, independent, human-accountable evidence.

It does **not** make a signed message true, make human-roots provably unique, or make
correlated sources independent — those are the `[OPEN]` set (U1–U4), implemented as
*containment, not elimination*. That honesty is load-bearing: the system's integrity
comes from never claiming more certainty than its weakest disjoint-verified root earns.

Start at Phase 0, reuse Power Loom per §11, and treat every `[OPEN]` as a containment
to narrow with live data — never as a gap to paper over.

*v1.0 — handoff build. P1 ships on mature primitives. P2 trust+grounding engines are
assemblable per spec. The frontier (U1–U4) is small, localized, and narrowed by
adversarial data — the same residue every honest open network carries.*
