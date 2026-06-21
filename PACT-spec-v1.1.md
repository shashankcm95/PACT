# PACT — Premise-Anchored Coordination/Trust Protocol
### Implementation Specification · v1.1 · *build-grade rev*

> **What this is.** A revision of `PACT-spec.md` (v1.0) that folds the 17 ratified
> decisions from the proto-planning research corpus (`research/00`–`research/19`).
> v1.0 was a faithful statement of the *thesis* and a stale statement of the *build*
> (the 3-lens implementation-readiness review found only ~4 of 17 ratified decisions
> reflected — `research/19`). This rev converts research-grade → **build-grade**: it
> closes the named ambiguities so a team can implement the v0 with minimal design
> guessing, and it does so **without new research** — every change cites the note that
> decided it (see §12 changelog).
>
> **This supersedes v1.0; it does not rewrite it.** v1.0 stays on disk as the
> historical record. Where this rev disagrees with v1.0, this rev wins, and §12 says why.
>
> **Reading guide for the implementer (Claude Code).** Tags:
> `[SOLVED]` integrate a mature crypto primitive ·
> `[ADOPT]` borrow a mature *standard* wholesale, do not rebuild (new in v1.1) ·
> `[BUILD]` assemble per this spec — the novel core, where the budget goes ·
> `[OPEN]` genuine frontier — implement the *containment*, never pretend elimination ·
> `[DECIDE]` a genuine design decision; a default is proposed, **user ratifies**.
> Build order is §10. The v0 definition-of-done is §10.5 — **read it first**; it is the
> single testable target. Power Loom reuse (corrected) is §11.
>
> **The one-sentence thesis (unchanged — it is sound).** The machine bears the
> *mechanical* burden (transport integrity, derivation validity, falsification-
> propagation, scope-intersection); the human bears the *truth* burden (premises,
> accountable, scored); and the coupling is gated so that neither confidence nor
> identity-count ever propagates further than genuine, **disjoint**, human-accountable
> evidence supports.
>
> **The one load-bearing correction (read before anything else).** The whole P2 defense
> rests on one word — **"independence" / "disjoint"** — and that word is **three distinct
> predicates** (topological, epistemic, config-stability), only one of which v0 can
> compute. v1.0 used the word as if it were one solved thing. **§4.5 is new and is the
> spine of this rev.** Every gate that touches independence must carry a visible **WEAK**
> flag and must never read the AND of the cheap axes as a substitute for the open one.

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

This split is `[SOLVED]`-as-design — all three review lenses ratified it (`research/19`:
"clean SRP, internally consistent"). It is INV-1 and the reason PACT is not "just
another A2A protocol." Everything below either reduces to mature crypto (P1) or *contains*
an open problem (P2); nothing below ever claims to *solve* P2.

---

## 1. Identity, Sybil anchor & delegation

### 1.1 The objects (now built on adopted standards)

`[ADOPT]` Persona/agent plumbing is **DID/VC** (`did:key` / `did:web` + Verifiable
Credentials), not bespoke. PACT's *only* additions on top are the human-root anchor and
the cap — that is the novel surface; the rest is borrowed (`research/10` §5).

```
HumanRoot   := { human_uid, K_root_pub }      // ONE per human. the SCARCITY ANCHOR.
                                              // [OPEN] one-human-one-root is irreducible — see §9 U1.
                                              // LOCALIZED here, one layer (one seam, one default).
Persona     := DID document { persona_did: K_pub, controller: human_uid, σ_root,
                              config_hash, abstraction_meta }   // [ADOPT] DID/VC
                                              // exposed face. user authors abstraction beneath root.
Agent       := a Persona acting autonomously  // an agent IS a persona's keypair + config + behavior.
config_hash := H(model_family ‖ checkpoint ‖ system_prompt ‖ tool_manifest)
                                              // BINDS trust to the operative config, not just the key (§1.4, M3)
```

### 1.2 Delegation (on-behalf-of) — the missing chain

`[ADOPT]` On-behalf-of delegation uses **RFC 8693 token exchange / RFC 7523 JWT
assertions**, shaped as an **attenuation-only, depth-bounded chain** (the AIP form), with
the **chain root bound to the scarce-human cap** (`research/11`, `research/10` §8 P0).

```
DelegationToken := { issuer_did, subject_did, scope ⊆ issuer.scope,   // ATTENUATION ONLY (never widen)
                     depth ≤ MAX_DELEGATION_DEPTH, chain_root: human_uid, exp, σ }
MAX_DELEGATION_DEPTH := 3   // RATIFIED 2026-06-21 (was [DECIDE]; ratified with §1.3 effective_presence).
                            //   a NAMED, signed-log threshold (§1.5 throne table), never an unbound constant;
                            //   changeable only via the bound delegation-depth-setter, not silently.

proc ACCEPT_DELEGATION(token):        // ENFORCED at frame-receipt (mirror §3.3's require-style), fail-CLOSED
   require depth(token.chain) ≤ MAX_DELEGATION_DEPTH
   require ∀ hop: hop.scope ⊆ parent(hop).scope            // attenuation-only, verified PER HOP (never widen)
   require chain_root(token) is a HumanRoot under cap (§1.3)
   require verify(σ) over the whole chain                  // each hop signed (INV-14)
   else DROP.                                              // a RULE asserted but un-enforced is no guard (v1.1 VALIDATE §13)
RULE: a delegated identity counts against its chain-root's effective_presence (§1.3) — but only
      ONCE IT SIGNS a network-facing frame (a dormant delegate costs 0). Therefore the cap is
      enforced at ACTIVATION-time: a burst of newly-activating delegates MUST be cap-checked
      ATOMICALLY in one window, else a pre-minted sleeper fan-out activates past the cap in a
      single window (U4-adjacent). (v1.1 VALIDATE §13)
```

### 1.3 Caps — `effective_presence()` is now a decidable function `[DECIDE]`

v1.0 left `effective_presence()` undefined *and* left its definer an unbound throne
(BLOCKER B4). Both are closed here.

```
cap(human_uid) = max EFFECTIVE network-facing identities under this root.

[RATIFIED 2026-06-21 — was [DECIDE]; the default below is the adopted definition]
effective_presence(human_uid) :=                         // a DECIDABLE PURE FUNCTION over the LOG
   | { distinct network-facing SIGNING identities in the delegation closure of human_uid } |
   computed solely from the per-receiver audit log (§7); no off-log input; replayable; deterministic.
   // counts EFFECTIVE participants (signing identities that actually emit frames), NOT nominal personas.
   // a persona that never signs a network-facing frame costs 0; ten that do cost 10.
   // RECEIVER-RELATIVE: §7 is per-receiver (no global log, INV-10) ⇒ the closure a single receiver can
   //   see is what ITS log witnessed; effective_presence is computed PER-RECEIVER-LOG, consistent with
   //   INV-2/INV-10. A globally-enforced cap (if ever needed) is reconciled at P4 as a phase contract —
   //   NOT by reintroducing a global log (the very state M2/INV-10 removed). (v1.1 VALIDATE §13)

INV-12 (unchanged): user authors the ABSTRACTION STRUCTURE beneath the root (sovereignty)
   but CANNOT EXPAND the identity-budget. Abstraction freedom organizes the budget; never grows it.
```

**Alternatives considered (for the ratifier):** (a) count distinct keypairs — rejected,
a dormant key is not "presence"; (b) count frames/volume — rejected, that gates on
engagement (L1); (c) count distinct *signing* identities in the delegation closure, over
the log — **proposed**, because it is decidable, replayable, engagement-neutral, and
attaches cost to actual network participation.

### 1.4 Configuration binding (the unnamed third independence predicate) `[BUILD]`

v1.0 bound trust to a *keypair*; a swapped model under the same key silently inherited
trust (MAJOR M3; `research/10` §7 amendment 5; `research/13`). Fix:

```
DIRECT trust (§5) is scoped to (persona_did, config_hash), NOT persona_did alone.
on config_hash change:  trust DECAYS / re-evaluates; it does NOT silently transfer.
attested code-hash (TPM/SGX/SEV-SNP/Nitro) MAY supply config_hash where available — as ONE
   WEAK-flagged signal on the config-STABILITY axis (§4.5), never as epistemic independence.
```

### 1.5 The relocated thrones — NAMED + BOUND (L6) `[BUILD]`

The design forbids a central verifier, then v1.0 quietly introduced four deciders. Per
L6 ("name where the power relocated; bind it"), each is named and bound here:

| Throne | Power | Binding (auditable · plural · rotating · contestable) |
|---|---|---|
| **cap-setter** | sets `cap(human_uid)` | published policy; per-root, not global; appeals logged; changes are signed log entries |
| **delegation-depth-setter** | sets `MAX_DELEGATION_DEPTH` (§1.2) | published, signed-log threshold like cap-setter; ratify with `effective_presence()` (§1.3) — it changes the computed cap |
| **root-issuer** (U1) | mints HumanRoots | pluggable seam (§9 U1); a **registry, never an oracle** (INV below); coarse/batched, never per-spawn; never auto-mints a trust edge |
| **`effective_presence()` definer** | defines the count | **removed as a throne** — it is now a fixed pure function (§1.3), not a discretionary seat |
| **SHOW-curator** | what the audit surface displays | re-runnable WHY-trace (M5); display logic is itself in the log; no silent filtering |
| **attestation vendor-PKI** (§4.5 axis 2) | certifies "distinct machine" | MUST be multi-vendor-diverse; the root-of-trust set is a visible, contestable, rotating input (`research/13`) |

```
INV (new, registry-not-oracle): the U1 anchor RECORDS a root; it NEVER becomes a global
   score, an admission gate, or an auto-minted trust edge. The moment root-issuance grants a
   DIRECT edge, the Sybil-~0 result (§5/§9) collapses. (research/18, research/10 §7)
```

---

## 2. Wire format & transport — `[ADOPT]` (drop the bespoke frame)

v1.0's §2 binary frame + §4 FSM **re-derived JSON-RPC + the TLS handshake + FIPA-ACL's
performatives** — 1990s/2010s prior art (MAJOR M4; `research/10` §4.1/§5). v1.1 **drops the
bespoke wire format** and carries PACT semantics as payload over a mature transport.

```
[ADOPT] transport  := A2A / JSON-RPC 2.0 over mTLS (+ OAuth2/OIDC for human-bound auth).
[ADOPT] identity    := DID/VC (§1).
[ADOPT] signing     := ed25519 sign/verify (the SIG field is the only piece of v1.0 §2 kept verbatim).

PACT payload (the part PACT actually owns) rides as the JSON-RPC params:
   { ver, type, src_persona_did, parent_human_uid, dst, seq, ack_ref,
     flags:[INIT|ACK|EXCH|VRFY|FIN], nonce, inclusion_proof (§7), payload (§3 Claim), sig }

Receiver MUST: verify(src_did, msg, sig) ∧ inclusion_proof_valid(§7) ∧ root_valid(parent_human_uid).
Any fail → drop. This is all of P1. [SOLVED] (mTLS/PKI/signed-log/Merkle primitives).
```

> Note the change from v1.0: `chains(PREV_HASH)` (a linear chain) is replaced by
> `inclusion_proof_valid` against a **per-receiver Merkle log** (§7) — a linear chain
> cannot detect cross-node equivocation (MAJOR M2).

---

## 3. Payload as Claim — the premise chain **as an ATMS** (core data model) `[BUILD]`

The central reframe is unchanged and is the clearest idea in the doc (all 3 lenses):
**payloads are not truth-declarations; they are conditional claims bound to falsifiable
premises** (INV-4). What v1.1 fixes: v1.0's §3 was *an ATMS with its load-bearing
operators removed* — no acyclicity, no nogoods/contradiction, no belief revision, and a
**broken FALSIFY** (BLOCKERS B2, B3; `research/10` §3.2/§3.3). v1.1 re-specs §3 as a real
**Assumption-based Truth-Maintenance System** (de Kleer 1986), the named home PACT's §3
re-derives line-for-line (`research/10` §4.3).

### 3.1 ATMS vocabulary (the borrowed structure)

```
node          := a datum — a Claim or a Premise.
assumption    := a PREMISE ROOT — creator-owned, human-accountable (§6). the only thing that can be "assumed".
justification := "node  <-  {antecedent nodes}"  — the derivation edge (Claim <- its premises). a DAG edge.
environment   := a SET of assumptions.
label(node)   := the set of MINIMAL, CONSISTENT environments under which the node holds.
                 (this REPLACES v1.0's single VALID_GIVEN tag — it is the multi-context generalization.)
nogood        := an INCONSISTENT environment (a recorded contradiction). no label may contain a superset of a nogood.
```

### 3.2 Types

```
Premise := {                          // = an ATMS ASSUMPTION
   id, statement,
   scope:        ScopeSpec,           // DOMAIN OF VALIDITY (§3.4)
   creator:      human_uid,           // *** the human OWNS this premise *** (truth-burden, §6, INV-3)
   verification: VerifState,          // disjoint cross-verification record (§6.2) + independence label (§4.5)
   status:       ACTIVE | CONTESTED,  // NEW: contested ≠ collapsed (§3.5). default ACTIVE.
   t, ttl
}

ScopeSpec := {
   domain_predicate: TypedConstraintSet,   // §3.4 — a conjunction of typed constraints (NOT a glyph)
   edge_confidence:  gradient ∈ [0,1]      // confidence FALLS OFF near the boundary (not a wall)
}

Claim := {                            // = an ATMS NODE with justification(s)
   id, content,
   premises: [Premise | Claim],       // justification antecedents; a premise may be a prior Claim (DAG)
   derivation: DerivProof,            // mechanical: does content correctly follow from premises?
   label:        [Environment],       // computed (§3.3) — set of minimal consistent environments
   derived_scope: ScopeSpec           // = MEET of all ancestral scopes (§3.4), computed
}
```

### 3.3 VALIDATE — mechanical, decidable, **acyclic** `[BUILD]` *(B3 — v0-mandatory)*

```
proc VALIDATE(claim):                                   // MECHANICAL, decidable
   require ACYCLIC(claim)            // *** v0-MANDATORY (B3) ***  fail-CLOSED: a justification cycle is REJECTED
                                     //     (a real network forms cycles; an un-checked cycle makes FALSIFY loop)
   for p in claim.premises:
       require valid_label(p) or is_assumption(p)        // every antecedent has a non-empty consistent label
   require derivation_sound(claim.content, claim.premises)   // closed question: A-given-P
   claim.derived_scope := MEET( scope(p) for p in claim.premises )   // §3.4; empty meet ⇒ REJECT (no valid domain)
   claim.label := propagate_label(claim.premises)        // minimal consistent environments; drop any ⊇ a nogood
   require claim.label ≠ ∅                                // no consistent environment ⇒ not VALID
   return VALID_GIVEN(claim.label)                        // NEVER "TRUE". always conditional, always multi-context.
```

### 3.4 Scope algebra — a concrete meet + combinator (M9) `[BUILD]`

v1.0 left `domain_predicate` a type, `∩` a glyph, and edge-confidence combination
undefined (MAJOR M9). Pinned:

```
domain_predicate := a conjunction of TYPED CONSTRAINTS over a feature space:
   interval   (x ∈ [lo, hi]),  set/enum membership (x ∈ {…}),  boolean.   // all DECIDABLE
MEET(A, B)  := per-dimension constraint intersection:
   intervals → interval-intersection;  sets → set-intersection;  missing-dim → carried.
   if ANY dimension intersects to ∅  ⇒  MEET = ∅  ⇒  the claim has NO valid domain ⇒ VALIDATE REJECTS.
edge_confidence combinator := POSSIBILISTIC MIN (weakest-link):
   derived_confidence(claim) = min( edge_confidence(p) for p in ancestral premises ),
   further attenuated toward 0 as an application point approaches any ancestral boundary.
IN_SCOPE(x, scope) := domain_predicate(x) holds.   // out-of-scope ⇒ not falsifiable by x (§3.5, INV-5)

WORKED EXAMPLE (two premises):
   p1 "g ≈ 9.8 const"     scope { altitude ∈ [0,10]km, v ∈ [0,0.1]c },  edge_confidence 0.95
   p2 "air-drag ≈ 0"      scope { v ∈ [0,50] m/s,       ρ_obj > ρ0 },    edge_confidence 0.80
   Claim "projectile parabola" premises [p1,p2]:
      MEET scope = { altitude ∈ [0,10]km, v ∈ [0,50] m/s, ρ_obj > ρ0 }
      derived_confidence = min(0.95, 0.80) = 0.80
      apply at v = 100 m/s  → IN_SCOPE = false → BLOCKED (outside ∩ scope; INV-5).
```

### 3.5 FALSIFY / REPAIR — **fixed**: a SHOW not a DECIDE, authorized both legs, anti-oscillation (B2) `[BUILD]` *(v0-mandatory)*

v1.0's FALSIFY was a **denial-of-grounding DoS**: one cheap, unauthorized, unverified
in-scope counterexample auto-`COLLAPSED` a whole sub-DAG (BLOCKER B2; `research/10` §3.2).
The guard was on the wrong side of the asymmetry. Three things fix it — the last two
surfaced at the v1.1 VALIDATE board (§13), which found the v1.0-style "same disjoint bar"
both **self-blocking** (CROSS_VERIFY is permanently WEAK, and INV-16 forbids a WEAK signal
from gating a high-stakes action — so a strength-gated FALSIFY is un-satisfiable) and
**asymmetric on the reverse leg** (REPAIR had no authz → a creator could un-falsify a
genuine refutation forever):

- **CONTESTED is a FLAG (a SHOW, M5), never an ACTION.** Setting `status := CONTESTED`
  *surfaces* a contest to receivers; it does NOT block propagation, refuse a claim, or erase
  grounding. This dissolves the WEAK-circularity: marking CONTESTED is not a "high-stakes
  action," so INV-16 does not forbid it; only an ACTION that *consumes* CONTESTED (a receiver
  refusing/down-weighting a claim) is the high-stakes gate — and THAT is where the WEAK flag
  forbids acting on topology alone. A contest's disjoint *strength* (§6.2) is computed and
  **surfaced** (it tells a receiver how much the flag should move them); it never gates
  whether the flag may be *set*.
- **Both legs are authorized + signed + anti-oscillating.** Setting OR clearing the flag
  needs an authorized, signed (INV-14), in-scope record — and re-contesting the *same* nogood
  costs **escalating** disjoint evidence, so neither side can ping-pong a premise for free
  (L8: "cost the gaming, never the changing").

```
proc FALSIFY(premise, counterexample, by):                       // *** v0-MANDATORY (B2) ***
   require AUTHORIZED_TO_FALSIFY(by, premise)        // who-may-falsify is SPECIFIED, not anonymous (§3.6)
   require SIGNED(counterexample, by) ∧ verify_minter(by)        // accountable, non-anonymous (INV-14)
   require IN_SCOPE(counterexample, premise.scope)   // out-of-scope counterexample ≠ falsification (INV-5)
   // v0 BAR = the three requires above (decidable today). the disjoint-STRENGTH of the contest
   //   (CROSS_VERIFY §6.2) is computed + SURFACED but is permanently WEAK (§4.5) ⇒ it INFORMS the
   //   receiver, it does NOT gate the flag. flagging is cheap-but-ACCOUNTABLE; weighing is the receiver's.
   record counterexample as a justification AGAINST premise   // contributes toward a nogood
   premise.status := CONTESTED                       // *** a FLAG / SHOW — NOT collapse, NOT an action, REVERSIBLE ***
   for c in dependents(premise):
       recompute label(c)                            // c → CONTESTED iff it has NO surviving consistent environment
   // dependents remain formally derivable; their grounding is FLAGGED contested, never silently erased.

proc REPAIR(premise, refutation, by):                // AGM belief-REVISION / un-falsify (L8: repair-not-penalty)
   require AUTHORIZED_TO_REPAIR(by, premise)          // *** symmetric authz — the missing leg (v1.1 VALIDATE §13) ***
   require SIGNED(refutation, by) ∧ verify_minter(by) // accountable, non-anonymous (INV-14)
   require refutation clears the SAME disjoint bar as the ORIGINAL grounding (§6.2)   // not merely "vs the counterexample"
   require ESCALATING_EVIDENCE(premise, nogood)       // re-repairing/re-contesting the SAME nogood costs MORE each cycle (anti-ping-pong, L8)
   premise.status := ACTIVE
   for c in dependents(premise): recompute label(c)   // grounding restored where environments become consistent again
```

v0 ships FALSIFY + REPAIR with the authz + signed + in-scope bar and the FLAG semantics; the
disjoint-STRENGTH scoring is surfaced-WEAK, never a gate — consistent with v0 omitting every
*action*-gate (§10.5). The original B2 DoS is defanged because there is no longer any cheap,
*irreversible* action: a fabricated counterexample only *flags* (accountably, signed), and an
authorized REPAIR with escalating evidence clears it.

### 3.6 Contradiction & preference (the missing adjudication, ASPIC+) `[BUILD]`

Two claims can each be valid-given-their-premises while contradicting each other; ASPIC+
proves you need *explicit preferences* to resolve conflict (`research/10` §3.3/§4.3). v1.1
adds it — but **adjudication SHOWS, it does not DECIDE** (M5):

```
on detect contradiction(claim_a, claim_b):
   record the joint environment as a NOGOOD                  // both can no longer hold together
   record an ATTACK relation (a ⟂ b)                         // Dung/ASPIC+ structure
   preference := order by (disjoint VERIFICATION_STRENGTH §6.2,  then CreatorStanding §6.1)
   SURFACE both, the attack, and the preference to the receiver — NEVER auto-suppress the loser.
   // who-may-falsify (§3.5) default: the premise.creator, any root that supplied a disjoint
   //   confirmation, or a root staking against it; recorded + signed; never anonymous.
```

### 3.7 Scope rules (carried from v1.0 §3.1, now mechanized by §3.4)

```
- a premise is NOT falsified by an OUT-of-scope counterexample (it never claimed there).   [INV-5]
- a premise IS falsified by an IN-scope counterexample that clears the disjoint bar (§3.5).
- a Claim is valid only within MEET(ancestral scopes); applying it OUTSIDE is BLOCKED (§3.4).
- scope boundaries are GRADED (edge_confidence) — solid in core, approximate near edge, invalid beyond.
- [OPEN] a scope drawn too WIDE silently over-extends; caught only by sparse edge-testing — see §9 U3.
```

---

## 4. Session & discovery `[ADOPT]`

v1.0's bespoke session FSM is dropped (it re-derived the TLS handshake). Sessions are the
adopted transport's (§2). What v1.1 **adds** is the table-stakes layer v1.0 was missing
entirely (MAJOR M4 — "PACT's biggest omission: no discovery story at all"; `research/10` §4.1):

```
[ADOPT] discovery := an Agent Card at /.well-known/agent.json  (A2A / ANP / AGNTCY form):
   { persona_did, parent_human_uid, capabilities, endpoints, supported PACT ver,
     config_hash, public attestation refs (§4.5), STH endpoint (§7) }

on ESTABLISHED (mutual auth via adopted transport):
   loop:  EXCH (signed frames → append to per-receiver Merkle log §7)
          VRFY (verify(peer, frame, σ) per frame — P1 integrity, BINARY, NOT honesty)
   until FIN
```

Honesty (P2) is evaluated *across* sessions in §5/§6, never in-session — unchanged.

---

## 4.5 Independence — the load-bearing word (three predicates + the WEAK flag) `[BUILD/OPEN]`

> **This section is new and is the spine of the v1.1 rev** (BLOCKER B1, B5; `research/13`;
> `research/10` §3.1). The entire P2 defense reduces to `cap × DISJOINT_PATHS`, and *both*
> factors were undefined nouns in v1.0. "Independence" is **not one thing**. Reading it as
> one thing is the single most dangerous error an implementer can make — it ships the exact
> L4 hole ("the crypto disarms skepticism") the whole design exists to prevent.

### 4.5.1 The three predicates

```
1. TOPOLOGICAL disjointness  — graph-path-disjoint vouch/verification paths.
   = Menger / Advogato max-flow at unit capacity.  [SOLVED to compute]  BUT cheap for an attacker
   to FABRICATE: mint k roots + earn k cheap probation edges → k topologically-disjoint,
   crypto-authenticated paths that pass DISJOINT_PATHS ≥ k BY CONSTRUCTION.
   *** This is the ONLY predicate v0 computes. ***

2. EPISTEMIC / substrate independence — uncorrelated model family / source corpus / checkpoint
   (vs one model echoed N times).  [OPEN] = U2/L4.  NO estimator exists. "implement independence
   estimation" is the entire hard problem restated as a verb. PERMANENTLY WEAK until §9 U2 / P5.

3. CONFIG-STABILITY — did this keypair keep its config, or swap substrate to evade a check?
   [OPEN], and UNNAMED in v1.0 (the "Dissociative Identity" failure for LM agents). Partially
   mechanizable via attested code-hash (§1.4, research/13) — config-STABILITY (did the box keep
   its config), NEVER config-INDEPENDENCE (do two boxes run different configs).
```

### 4.5.2 The 4-axis independence portfolio (`research/13`)

Model independence as a portfolio of orthogonal axes — **each forgeable alone, costly
jointly** (the disjoint-paths intuition INV-11, lifted to the substrate):

```
axis 1  HUMAN-ROOT        (U1 §1)            — the SCARCITY anchor.
axis 2  ATTESTED-HARDWARE (TPM/SGX/SEV/Nitro)— distinct endorsement keys ⇒ distinct machines;
                                               forgeable alone (rent N enclaves); vendor-PKI throne
                                               must be NAMED + MULTI-VENDOR-DIVERSE (§1.5). WEAK-flagged.
axis 3  NETWORK-PATH      (topological)       — predicate #1; DISJOINT_PATHS.
axis 4  MODEL-SUBSTRATE   (U2)               — predicate #2; the ONLY epistemic axis; OPEN; no estimator.

*** CRITICAL DISCIPLINE: axes 1-3 are SCARCITY / TOPOLOGY / STABILITY signals.
    ONLY axis 4 is epistemic. A gate MUST NEVER read the AND of axes 1-3 as a substitute
    for axis 4. That substitution is the live correctness cliff. ***  (research/13)
```

### 4.5.3 The WEAK flag — input, and consumer obligation (B5)

```
independence_label(record) := {
   topological:    computed (Menger over the per-receiver graph §7),
   epistemic:      WEAK   — until the U2 estimator exists (§9 U2); permanently WEAK in v0..P4,
   config_stability: from attestation if present, else WEAK,
   overall:        WEAK if ANY consumed axis is WEAK     // i.e. always WEAK until P5
}

CONSUMER OBLIGATION (the rule v1.0 lacked):
   - a WEAK record MAY INFORM a decision; it MUST NEVER GATE a high-stakes action.   [INV-16]
   - NEVER let a gate ACT on UN-flagged independence (absence of a flag is treated as WEAK).
   - NEVER read AND(axis1, axis2, axis3) as epistemic independence (axis 4).
   - the HIGH-STAKES THRESHOLD itself is a relocated throne (L6): the "stakes-setter" is NAMED + BOUND at
     P3 (a published, signed-log threshold like §1.5's others) so it does not silently relocate. v0 omits
     all action-gates, so v0 never draws it; flagged here for phase coherence. (v1.1 VALIDATE §13)
```

---

## 5. Trust engine — P2a (volatile, advisory, **first-person & relational**) `[BUILD]`

Two scores, **asymmetric evidentiary burden** (the A2TP model), now made explicitly
*receiver-local first-person* (INV-2 mechanized, `research/17`) and home in **Subjective
Logic** (`research/10` §4.2/§5):

```
DIRECT[me, agent@config_hash]  : first-person, earned, PRIVATE to me. HIGH weight, LOW burden. Sybil-PROOF.
                                 decays without reinforcement; defection CRATERS it (asymmetric, INV-8).
                                 scoped to config_hash (§1.4) — a config swap decays it, never inherits it.
CONSENSUS[agent]               : third-party, propagated. ADVISORY ONLY (raises a hypothesis, cannot act
                                 on its own authority, INV-6). presumed SUSPECT, HIGH burden.

[ADOPT] represent both as SUBJECTIVE-LOGIC opinions (belief, disbelief, uncertainty); the
   uncertainty term IS the novice / cold-start signal (Glicko/TrueSkill). transitivity uses SL
   DISCOUNT; combination uses SL FUSION — but only AFTER the path-independence check (§4.5/§6.2).
```

```
proc TRUST(me, agent):
   direct := DIRECT[me, agent@cfg]                          // may be ⊥ (uncertainty ~ 1 → novice)
   wcons  := Σ_v DIRECT[me,v] * vouch(v,agent) / Σ_v DIRECT[me,v]   // weighted THROUGH MY OWN graph
            // a million Sybils inflate RAW count, contribute ~0 here (no earned edges). [INV-11, L3]
   α := confidence(interaction_count(me, agent))            // ~1 rich history, ~0 never met
   return SL_blend(α, direct, wcons)                        // adaptive per-target; receiver-local. [INV-2]
```

### 5.1 CONVERT — consensus → actionable, demands the unforgeable (ships topological-only, WEAK)

```
proc CONVERT(me, agent):   // consensus-trust → ACTIONABLE. consensus must EARN it.
   require DISJOINT_PATHS(me, agent) ≥ k       // STRUCTURAL disjointness, NOT a peer-tally (§5.3); each path
                                               //   independently clears the unforgeable bar below; axis-3
                                               //   topological-WEAK in v0 (§4.5) ⇒ INFORMS, does not GATE (INV-16)
   require PROBATION(agent)                     // *** key loop: low-stakes trial builds DIRECT → promotion.
                                                //     consensus = on-ramp, NEVER a substitute. ***
   require VOUCHER_STAKE(agent)                 // vouchers risk their OWN direct trust (skin in the game)
   require BEHAVIORAL_DEMO(agent)               // auditable (LOG-backed) demonstration
   FORBIDDEN: "more vouches" (Sybil-satisfiable) · central verifier (a throne) · counting peers (§5.3)
   EXIT CONTRACT (P2, research/10 §8): this gate ships TOPOLOGICAL-ONLY with a VISIBLE WEAK flag and
      EXPLICITLY DOES NOT YET CONTAIN U2. No gate that acts on it may treat it as epistemic (§4.5/INV-16).
```

### 5.2 First-person model — private, with selective signed vouches (`research/17`)

```
- the per-node model is PRIVATE to its owner (no global, sortable, published list — that IS the rank throne).
- the ALGORITHM is public (L10); only each node's INSTANCE is private. evidence auditable (§7), verdict private (§5).
- propagate ONLY voluntary, scoped, signed, receiver-weighted VOUCHES drawn from the model (a vouch is itself
  a first-person conditional-validity claim) — else consensus propagation dies (trust islands).
- driver axis is BEHAVIORAL (caught-vs-uncaught), NOT truth (L5: a perfect liar earns a flawless history).
- lowered scrutiny is DEFEASIBLE-FORWARD: it snaps back the instant adverse evidence lands (U4 / L8).
```

### 5.3 Never counts nodes (M6 — new invariant) `[BUILD]`

```
INV-13 (NEW): NO boundary tallies confirmation COUNT. verification is a LOCAL RE-CHECK of a
   self-certifying record, NEVER a peer-count. The instant a gate counts "how many confirm," it
   leaves the Sybil-immune class and re-enters the quorum regime that presupposes U1 — and a
   correlated/Sybil flood farms it. (This is the live `rollupCounts` 5× inflation bug, research/17.)
   Hierarchical scale (§6.4) routes through Proof-Carrying re-verification, never aggregation.
```

**Disjointness is NOT a tally (the INV-13 ↔ DISJOINT_PATHS reconciliation; v1.1 VALIDATE §13).**
`DISJOINT_PATHS ≥ k` (§5.1) and `DISJOINT_PATH_COUNT` (§6.2) are **not** counts of *confirming
peers* — they are a **structural property of the vouch graph**: *k vertex/edge-disjoint paths,
each one independently clearing the unforgeable per-path bar* (earned trust + stake + behavioral
demo, §5.1). "k independent corroborations, each passing the unforgeable bar" is admissible;
"k peers said yes" is the forbidden tally. The distinction is load-bearing because k cheap minted
roots + k cheap probation edges pass a *count* of disjoint paths by construction (§4.5.1) — so in
**v0, DISJOINT_PATHS is topological-WEAK (§4.5) and therefore, per INV-16, MAY NOT GATE an action;
it only INFORMS**, until each path's bar is non-WEAK. What crosses any gating/weighting boundary
(including a §6.4 hierarchy layer) is a single re-checkable conditional-validity record
(Proof-Carrying Data), **never an aggregated count**; a descriptive roll-up may exist for *display*
but never crosses a gate as a count (INV-13/INV-14).

### 5.4 Novice = low-reach-until-earned (no new gate; `research/17`)

A fresh node participates from frame one; its claims simply propagate short (wcons ~0) and
are flagged provisional, earning up. The test: *"starts at the bottom of its own reach
radius, earning up"* (ladder — safe) vs *"cannot act until admitted"* (a U1 throne in an
onboarding costume — forbidden). `"unproven"` is **reach-shaping, never act-blocking**.

---

## 6. Grounding engine — P2b (durable, falsifiable) — the human truth-burden `[BUILD + OPEN]`

```
PRINCIPLE (INV-3, unchanged): the machine validates A-given-P (mechanical, §3). The HUMAN owns P —
its statement, scope, and score — because only a human can be ACCOUNTABLE for an empirical claim.
```

### 6.1 Premise ownership & creator coupling (stakes-weighted)

```
each Premise.creator = a human_uid; the human STAKES reputation on it (skin in the game).
PremiseScore(p)  rises if p survives disjoint cross-verification, falls if p is CONTESTED (§3.5).
CreatorStanding(human) := decaying, asymmetric, STAKES-WEIGHTED track-record over their premises —
   "do their premises survive disjoint verification?" (reliability AS A SOURCE, not their worth).
   *** the premise.creator = human-accountability coupling is the ONE thing classical TMS lacks —
       it is the genuinely PACT-original tier (research/10 §2). spend the build here. ***
```

### 6.2 Cross-verification — DISJOINT, weakest-link, correlation-discounted (M10) `[BUILD/OPEN]`

```
proc CROSS_VERIFY(premise):
   confirmations := independent confirmations against REAL-WORLD knowledge, EACH a signed record (§6.4/§7)
   strength := f( DISJOINT_PATH_COUNT(confirmations), independence_label )   // §4.5 WEAK flag; the "count" is
            //   STRUCTURAL disjoint paths each clearing the per-path bar, NOT a peer-tally (§5.3 reconciliation)
   // f is MONOTONE-DISCOUNTING on correlation: it adopts Subjective Logic's path-independence-BEFORE-fusion;
   //   correlated confirmations (shared substrate/source/assumption) ⇒ near-zero marginal strength. [U2/L4]
   return strength

VERIFICATION_STRENGTH(chain) := MIN over the chain to the DEEPEST EMPIRICAL ROOT   // possibilistic weakest-link
   // (research/10 §4.3; provenance-semiring / Dubois-Prade). a long chain is only as strong as its weakest root.
```

### 6.3 REACH = consequence — **emergent-descriptive, never computed-prescriptive** (M1) `[BUILD]`

v1.0's REACH contradicted receiver-controlled trust (INV-2): a network-wide radius cannot
be *granted* without re-creating the L1 engine + an L6 throne (MAJOR M1; `research/10`
§3.4/§7 amendment 1). Resolved:

```
REACH(claim) is EMERGENT-DESCRIPTIVE: it is the ENVELOPE of INDEPENDENT receiver-local accepts —
   an observed consequence, NEVER a radius the network computes and grants. (INV-2, INV-17)
   each receiver independently accepts/down-weights per its OWN graph (§5) + the claim's
   VERIFICATION_STRENGTH (§6.2); "reach" is just the union of those local decisions, after the fact.

THRESHOLD (INV-9, kept): a claim's CLAIMED grounding may NEVER exceed its root's actual (disjoint)
   verification. beyond it the chain may stay formally VALID but is flagged "provisional/ungrounded",
   never masquerading as hardened. → kills the long-perfect-chain-on-a-weak-root failure.

*** REACH is gated by VERIFICATION, never ENGAGEMENT (L1). Same mechanism as social-media reach;
    OPPOSITE outcome. This gate is the entire difference between "truth propagates / noise stays
    local" and "the misinformation engine." It is the genuinely PACT-original inversion. ***
```

### 6.4 Hierarchy past the flat boundary — verification-tree, not authority-tree (`research/16`)

```
when flat gossip/CRDT convergence flounders past its optimal boundary, scale HIERARCHICALLY —
   but the hierarchy is a VERIFICATION tree (proof-carrying: each layer RE-VERIFIES before propagating),
   NEVER an AUTHORITY tree (a layer that VOUCHES-BY-FIAT re-instantiates the throne).
   the tree is internally verifiable + auditable before propagating to the next layer. [INV-13 still holds]
   *** WHAT crosses each layer is a single RE-CHECKABLE conditional-validity record (Proof-Carrying Data),
       NEVER an aggregated COUNT (INV-13). a descriptive roll-up may exist for DISPLAY but never crosses a
       gating/weighting boundary as a count — the §6.4↔INV-13 reconciliation (research/16; v1.1 VALIDATE §13). ***
```

---

## 7. Audit layer — **per-receiver Merkle logs** (M2, B6) `[ADOPT + BUILD]`

v1.0's INV-10 assumed "THE auditable log" — a single global canonical log that **cannot
exist across N mutually-untrusting roots** (whose log is canonical?), and its linear
`PREV_HASH` chain cannot detect equivocation (MAJOR M2; `research/10` §4.3/§7 amendment 3).

```
[ADOPT] per-receiver MERKLE logs (Certificate Transparency / RFC 6962):
   each receiver maintains its OWN append-only Merkle log; cross-node trust uses
   INCLUSION proofs + CONSISTENCY proofs + Signed-Tree-Head (STH) GOSSIP.
   - inclusion proof  : "this frame is in my log at position i"
   - consistency proof: "my log at size n is an append-only extension of size m" (no rewrite)
   - STH gossip       : receivers exchange STHs → equivocation (two different logs to two peers) is DETECTABLE.
   there is NO global canonical log (reconciles INV-2 receiver-locality with auditability).

ledger-appropriateness (unchanged): agents have no private interior + no right-to-be-forgotten;
   a permanent verifiable record is a feature. trust (§5) + verification (§6) are computed from the
   LOG (provable behavior), never hearsay. (INV-10, now per-receiver)
```

### 7.1 The authenticated minter is a READ gate — integrity ≠ provenance (B6) `[BUILD]`

```
INV-14 (NEW): EVERY counting / weighting / gating boundary READS verify(signed-edge) from an
   AUTHENTICATED MINTER. Store-presence is NEVER provenance. A record's mere EXISTENCE in an
   open-writable store proves INTEGRITY (it is self-consistent), NEVER PROVENANCE (the legitimate
   producer made it) — anyone who can write the store can CO-FORGE a byte-indistinguishable record.
   (the repo's own #273 family; research/18, research/17 residual 1.)
MECHANISM (exists today, SHADOW): ed25519 (edge-attestation.js) + the resolveSigner seam + gate reads on
   verifyRecordSig. v0 WIRES this existing-but-unconsumed signer into the inter-node READ path — boundary
   work (per-persona key custody via resolveSigner), NOT a config toggle; the trust engine is 0-hits today
   (research/18). PROVENANCE caveat (firsthand, edge-attestation.js:14): the env-PEM default
   (LOOM_EDGE_SIGNING_KEY) is Option-A-equivalent — a SAME-UID caller can read the key and CO-FORGE; it
   closes INTEGRITY, never PROVENANCE. The same-uid close (Option B) needs an INJECTED opts.signer routing
   into a separate trust domain the host cannot read(). Until a weight gates an ACTION it stays SHADOW; a
   weight gated on the env-PEM default MUST stay SHADOW (integrity ≠ provenance, INV-14). (v1.1 VALIDATE §13)
```

---

## 8. Invariants (MUST hold)

```
INV-1   P1 (transport) and P2 (honesty) NEVER conflated. signature ⇒ WHO+UNTAMPERED, never TRUE.
INV-2   trust is RECEIVER-controlled + FIRST-PERSON (private model); no sender/consensus dictates its credence.
INV-3   the TRUTH-BURDEN rests on an accountable HUMAN (premise.creator); the machine bears only the
        MECHANICAL burden (validity, falsification-propagation, scope-meet).
INV-4   artifacts are CONDITIONAL claims (valid-given-premise), never truth-declarations.
INV-5   premises carry SCOPE; falsification respects scope (in-scope only); claims invalid OUTSIDE
        MEET(ancestral scopes); scope edges are GRADED.
INV-6   DIRECT (relational) trust outweighs CONSENSUS; CONSENSUS is advisory (cannot act alone).
INV-7   conversion/verification loops demand the UNFORGEABLE (earned trust, DISJOINT paths, stake,
        auditable demo) and NEVER the CHEAP (more vouches, more identities, a central checker).
INV-8   trust + premises DECAY without reinforcement; defection/falsification is ASYMMETRIC (craters).
INV-9   REACH ∝ disjoint VERIFICATION strength, NEVER engagement; claimed grounding ≤ root verification.
INV-10  all trust + verification computed from AUDITABLE record — now PER-RECEIVER Merkle logs + RFC 6962
        proofs + STH gossip, NOT a single global log. (amended, M2)
INV-11  trust-graph + cross-verification require DISJOINT independent paths, not mere count (defeats Sybil
        flooding AND earned-then-collude AND correlated-consensus) — see §4.5 (independence is THREE predicates).
INV-12  identity CAP binds EFFECTIVE network-facing presence (§1.3 decidable function), not nominal personas.
--- new in v1.1 ---
INV-13  NEVER-COUNTS-NODES: no boundary tallies confirmation count; verification is local re-check, never a
        peer-count; hierarchical scale routes through proof-carrying re-verification, not aggregation. (M6, research/17)
INV-14  AUTHENTICATED-MINTER READ GATE: every counting/weighting/gating boundary reads verify(signed-edge);
        store-presence is never provenance; integrity ≠ provenance. (B6, research/18)
INV-15  CONFIG-BINDING: DIRECT trust is scoped to (persona, config_hash); a config change decays/re-evaluates,
        never silently inherits. (M3, research/13)
INV-16  INDEPENDENCE-WEAK: never gate a high-stakes action on un-flagged independence; never read AND(axes 1-3)
        as a substitute for axis 4 (epistemic). every non-topological axis is permanently WEAK until U2. (B1/B5)
INV-17  REACH is EMERGENT-DESCRIPTIVE (envelope of independent receiver-local accepts), never computed-prescriptive
        (a radius the network grants). (M1, research/10)
INV-18  REGISTRY-NOT-ORACLE: the U1 anchor records a root; it never becomes a global score / admission gate /
        auto-minted trust edge; coarse/batched, never per-spawn. (M7, research/18)
```

---

## 8.5 Threat model & trust boundaries (M8) `[BUILD]`

v1.0 had no explicit threat model (MAJOR M8). The trust boundary is **per-root**: a root's
own store is writable by that root — **the store is not a sandbox** (the #273 lesson). Each
boundary that crosses roots re-verifies (INV-14).

| Attacker | Move | Contained by | Residue |
|---|---|---|---|
| **Sybil flooder** | mint N identities, manufacture consensus | wcons through earned graph (~0 contribution, INV-11); cap (§1.3) | bounded-local influence, linear in cost |
| **Collusion ring** (earned) | genuinely-earned identities co-vouch | disjoint paths + voucher stake | bounded by U2-WEAK (see below) |
| **Patient sleeper** (U4) | earn trust, defect at a high-stakes moment | disjoint high-trust corroboration + asymmetric crater (INV-8) + catchability | first betrayal still lands (M2/M1) |
| **Eclipser** | partition a node, feed a consistent false graph | TRANSPORT-layer: diverse bootstrap + STH gossip + fork-detecting witnesses (§7) | cost independent of network size; not a trust-metric gate |
| **Config-swapper** | swap model under a trusted key | config-binding (INV-15) + attested code-hash (§1.4) | config-INDEPENDENCE still OPEN (§4.5) |
| **Counterexample fabricator** | mass-collapse a sub-DAG via fake FALSIFY | symmetric disjoint bar + authz + reversible CONTESTED (§3.5) | fixed in v1.1 (was the B2 DoS) |
| **Throne-capturer** | seize a central authority/score | there is none to seize — no admission gate, no global score, no global log (research/18) | CONTROL is structurally prevented, U1-independent |

> **The clean U1-independent result (`research/18`):** there is **no control to take** —
> "take control" requires a global object (central authority, forced-validate, network-wide
> propagation dominance) that PACT structurally refuses. This is theorem-backed
> (Personalized Hitting Time / TraceRank: Sybils contribute ~0 to a receiver-rooted metric).
> What U1-open leaves reachable is *only bounded-local influence*. **Precondition:** keep
> every weight SHADOW until INV-14 (minter read) + INV-16 (live WEAK flag) + the §10 P2
> holes are built.

---

## 9. Undefined Behavior — the genuine frontier `[OPEN]` (implement CONTAINMENT)

```
U1  HUMAN-ROOT UNIQUENESS (the irreducible core)                          [OPEN]
    All Sybil-resistance reduces to one-human-one-root (Douceur's impossibility stands).
    LOCALIZED to §1 — one seam, one default — that is the progress. CONTAINMENT = cap × disjoint-paths
    makes a breach EXPENSIVE + BOUNDED, never impossible. "contained in practice" for bounded uses
    (Gitcoin cut attacker influence >80%). Do NOT claim elimination.
    [DECIDE] v0 issuance default — see §10.5.

U2  CORRELATED CONSENSUS / EPISTEMIC INDEPENDENCE (the DEEPEST hole)      [OPEN]
    = predicate #2 / axis #4 (§4.5). cryptographic + physical + topological distinctness are NOT
    epistemic independence (L4; research/13 proved physical-coords cannot reach it). CONTAINMENT:
    ship topological disjointness + a PERMANENT visible WEAK flag (INV-16); the real P5 work is a
    model+source-provenance / substrate-diversity ESTIMATOR — the ONLY thing that observes U2.
    *** the containments for earned-then-betray + collusion DEPEND on disjoint corroboration, so a
        live WEAK flag is what keeps U2-open from collapsing them. ***

U3  SCOPE-BOUNDARY ERROR                                                  [OPEN — contained]
    a too-WIDE scope silently over-extends; surfaces only at sparse edge-testing. CONTAINMENT:
    scopes are themselves falsifiable claims (§3.7), graded at edges (§3.4); IMPLEMENT edge-probing tests.

U4  PATIENT SLEEPER / EARNED-THEN-COLLUDE                                 [OPEN — contained]
    genuine trust earned to defect later. CONTAINMENT: high-stakes ⇒ disjoint high-trust corroboration
    (INV-9/11), WEAK-aware; single sleeper insufficient; asymmetric crater. Bounds damage, not the con.

ORTHOGONAL (not a U-frontier, but must not be confused with one):
  COLD-START / ECLIPSE — attacks graph POSITION, not identity count; U1-IRRELEVANT (closing U1 does
    NOT close it — Friedman-Resnick: free-novice-entry AND whitewashing-immunity are jointly
    unattainable without a scarce anchor). Defense is TRANSPORT-layer (§7/§8.5), never a trust-metric gate.
  CONFIG-STABILITY — predicate #3 (§4.5); named in v1.1 (was unnamed in v1.0); contained by INV-15.
```

---

## 10. Build roadmap — **inverted** (buildable → frontier; every `[OPEN]` dep named) `[BUILD]`

The inversion (the central strategic finding, `research/10` §5/§8): **borrow the solved
tiers wholesale, spend the entire build on the novel core, and ship nothing that *acts on*
"independence" before it is estimated or visibly flagged WEAK.**

| Phase | `[OPEN]` dep | Content | Power Loom reuse |
|---|---|---|---|
| **P0 — Boundary** | none | `[ADOPT]` DID/VC + A2A transport + Agent Card + Merkle proofs; per-persona keypair; RFC 8693/7523 attenuation-only depth-bounded delegation (§1.2); U1 issuance **stub w/ one default**; inter-node signing — WIRE the existing ed25519 signer into the read path (the same-uid close needs a SEPARATE-trust-domain `opts.signer`; the env-PEM default is integrity-only, §7.1). **EXIT: two *distinct-keyed* roots exchange tamper-evident frames — proves distinct-keyed, NOT human-independent.** | `edge-attestation.js`, `transaction-record.js`, `resolveSigner` seam |
| **P1 — Claim/Premise as ATMS** | none — the thesis core | `[BUILD]` Premise/Claim/Scope + VALIDATE (A-given-P, MEET scope via possibilistic min) + **FALSIFY-fixed (B2)** + **acyclicity (B3)** + nogoods/preference (§3.6). **P0 + P1 = the coherent v0.** | greenfield (§3 absent today) |
| **P2 — Trust P2a** | **U2 (flagged WEAK)** | `[BUILD]` seed-free DIRECT/CONSENSUS (Subjective Logic) + config-binding + bounded multi-hop wcons + never-counts-nodes. **CONVERT ships topological-only w/ visible WEAK flag; EXIT NAMES it does NOT yet contain U2.** | flat reputation store (rebuild the DIRECT/CONSENSUS axis) |
| **P3 — Grounding P2b + REACH** | **U2/U3 (named)** | `[BUILD]` stakes-weighted CreatorStanding; semiring CROSS_VERIFY (weakest-link, correlation-discount); REACH emergent-descriptive. EXIT annotated w/ P5 dependency. | verdict-attestation, causal-edge |
| **P4 — Caps** | **U1; defer until 2nd root** | `[BUILD]` `effective_presence()` (§1.3) + bound thrones (§1.5). | — |
| **P5 — Frontier containment** | **U1–U4 — narrowed by live data, never closed** | substrate-diversity independence estimator (U2); scope-edge probing (U3); high-stakes disjoint corroboration (U4); harden U1 → Personhood Credentials. | — |

**The discipline that makes it honest:** every phase ≥ P2 declares its `[OPEN]` dependency
*as a phase contract*; no gate that *acts on* "independence" ships before P5 without a
visible WEAK flag (INV-16). That converts the adversarial lens's most dangerous finding (a
live topology-only gate window) from a latent exploit into an acknowledged, contained,
visibly-degraded mode — exactly what M1 (containment-not-elimination) requires.

---

## 10.5 v0 — the definition-of-done (the single testable target) `[BUILD]`

> **Two mutually-untrusting roots (distinct-keyed; human-independence is U1-OPEN — contained, not
> proven) exchange ONE authenticated, premise-bound, scope-checked, falsifiable claim — and a
> fabricated counterexample does NOT silently collapse it.**

This proves "machine bears mechanical certainty, human bears truth-burden, coupling gated
by disjoint-verified evidence" on the **grounding-and-identity axis**, honestly buildable
today on Power Loom — **without** shipping any gate (CONVERT / CROSS_VERIFY / REACH / caps)
that genuinely needs the frontier solved. U1/U2 are *containment* problems = **parameters,
not preconditions**: localize U1 to one seam + one chosen default; flag U2 WEAK.

```
v0 scope            = P0 (Boundary) + P1 (Claim/Premise as ATMS).
v0 NON-NEGOTIABLE   = FALSIFY-fixed (B2, §3.5: authz BOTH legs + anti-ping-pong + CONTESTED-is-a-FLAG)
                      + acyclicity enforced (B3, §3.3). these land IN v0, not deferred.
v0 PROVENANCE GATE  = the "authenticated" claim is met by a SEPARATE-UID signer in the test harness
                      (Option B), NOT the env-PEM default; a weight on the env default proves INTEGRITY,
                      not the PROVENANCE INV-14 promises, and stays SHADOW. (v1.1 VALIDATE §13)
v0 explicitly OMITS = CONVERT, CROSS_VERIFY scoring, REACH, caps — anything that acts on independence.
v0 depends on       = NEITHER U1 NOR U2 (both contained parameters).

[RATIFIED 2026-06-21] U1 v0 issuance behind the pluggable seam:
   CHOSEN = invite/vouch + STAKE (true MVP — lightest; registry-not-oracle, INV-18), structured as a
            DID-VC registry so the SBT + Personhood-Credentials upgrades are a one-seam drop-in (Open/Closed).
   upgrade path (NOT v0) = SBT / DID-VC non-transferable (research/15) → Personhood Credentials
            (ZK, multi-issuer; research/10 §4.2). the seam stays a REGISTRY, never an ORACLE, on upgrade.
```

---

## 11. Power Loom mapping — reuse, don't rebuild (corrected per-row) (M5) `[reference]`

v1.0's §11 **over-claimed** — it told a planner the hardest novel tier was already done
(MAJOR M5; `research/10` §6 / `research/prior-art/power-loom-mapping.md`, every claim
file:line-cited). Corrected with explicit verdicts:

```
Power Loom pillar                          verdict        → PACT component
-----------------------------------------  -------------    ----------------------------------------
content-addressed hash-chained log         ACCURATE         §7 audit log MINUS a signature (free primitive)
  (transaction-record.js + record-store.js)                 (integrity-verified-on-read, idempotent)
ed25519 sign/verify (edge-attestation.js)  ACCURATE         §2 SIG plugs straight in (SHADOW + same-uid today)
deterministic replayable envelope          ACCURATE         §7 audit LOG; provenance chain
reputation only via explicit snapshot      ACCURATE         §5/§6 separation: volatile trust out of blocking path
pure-function gates, no LLM in block path   ACCURATE        §3 VALIDATE is mechanical/decidable (P1, blocking)
source-blind consumer / recalibration      ACCURATE         §5 receiver-controlled, advisory consensus
enforced floor / shadow ceiling             ACCURATE        fail-safe deterministic floor under stochasticity
Byzantine LLM (in+out untrusted vs ground) ACCURATE         INV-1 (P1≠P2): inputs untrusted, claims verified —
                                                            subsumed BY INV-1, not a standalone component
filesystem-delta-as-truth                  ACCURATE-FRAMING §3 reframe: delta is VALID-GIVEN-CONTRACT, not "truth"
                                           but BUILD         — but §3 is greenfield, so this is BUILD, not reuse
-----------------------------------------  -------------    ----------------------------------------
"contract verification = §3 — already      OVER-CLAIMED     §3 is MISSING: no premise/claim DAG, no derivation-
   premise-bound!"                                          soundness, no scope, no falsify-propagation. GREENFIELD.
"DIRECT/CONSENSUS trust engine"            OVER-CLAIMED     it's a flat {pass,partial,fail} per persona; no
                                                            DIRECT/CONSENSUS axis, no asymmetric crater. REBUILD.
"≥2-distinct JOIN = INV-11 disjoint paths" OVER-CLAIMED     three count-of-2 checks on weak keys; NONE verifies
                                                            path-disjointness. the exact L4/INV-11 landmine, unsolved.
persona provenance (built_by/graded_by)    MOVE TO GAP      not §6.1 reuse; it's the #273 residual (integrity≠
                                                            provenance) — needs signed/kernel-writer edges (INV-14).
-----------------------------------------  -------------    ----------------------------------------
GAPS Power Loom must cross to BECOME a PACT node (the build, not the reuse):
   - intra-node (single trust root) → INTER-node (mutually-untrusting roots) :: §1+§2 signed identity
     (the #273 residual "store proves integrity not provenance" → signed/kernel-writer edges = exactly this)
   - a persona is a STRING, not a keypair; no human root, no Sybil cap, no PKI — greenfield boundary work
   - reputation DATA is admittedly non-discriminating → needs live adversarial hardening (P3/P5, U4)
```

**Honest framing for the planner:** v0 = real primitives (log + ed25519) + a **greenfield
boundary + a greenfield §3 ATMS + a greenfield §5 engine**. Budget the novel core as
greenfield, not "reuse + wiring" — that mis-budget is the single most damaging v1.0
overclaim (`research/19` PM lens).

---

## 12. Changelog — v1.0 → v1.1 (each edit → the research note that decided it)

| v1.1 change | Kind | Source |
|---|---|---|
| §1.1 persona plumbing → DID/VC | `[ADOPT]` | M4 · `research/10` §5 |
| §1.2 RFC 8693/7523 attenuation-only delegation chain | `[ADOPT]` | `research/11` · `research/10` §8 P0 |
| §1.2 `MAX_DELEGATION_DEPTH` default (=3) + `ACCEPT_DELEGATION` require-procedure | **`[DECIDE]`** + FOLD | `research/11` · v1.1 VALIDATE §13 |
| §1.3 `effective_presence()` = decidable function over the LOG (per-receiver-relative) | **`[DECIDE]`** (B4 definition-half) | `research/19` · `research/10` §7 amendment 2 |
| §1.4 config-hash binding (the unnamed 3rd predicate) | FOLD M3 | `research/10` §7 amendment 5 · `research/13` |
| §1.5 name + bind the relocated thrones (incl. delegation-depth-setter) | FOLD L6 + B4 throne-binding-half | `research/10` §3.4 / §7 amendment 2 |
| §2 drop bespoke frame → A2A/JSON-RPC + ed25519 | `[ADOPT]` M4 | `research/10` §4.1/§5 |
| §3 re-spec as an ATMS (nodes/justifications/environments/labels/nogoods) | FOLD B3 | `research/10` §4.3 |
| §3.3 acyclicity enforced at VALIDATE (fail-closed) | **FOLD B3 — v0-mandatory** | `research/10` §3.3 |
| §3.4 concrete scope algebra (typed constraints + meet + possibilistic-min combinator + worked example) | FOLD M9 | `research/19` · `research/10` §4.3 |
| §3.5 FALSIFY/REPAIR fixed (CONTESTED-is-a-FLAG-not-action + authz BOTH legs + signed + anti-ping-pong) | **FOLD B2 — v0-mandatory** | `research/10` §3.2 / §7 amendment 4 · v1.1 VALIDATE §13 |
| §3.6 contradiction/nogood + ASPIC+ preference, surfaced not auto-suppressed | FOLD B3 | `research/10` §3.3/§4.3 |
| §4 drop bespoke FSM; ADD Agent-Card `/.well-known/` discovery | `[ADOPT]` M4 | `research/10` §4.1 |
| **§4.5 NEW** — independence = 3 predicates + 4-axis portfolio + WEAK flag rule | FOLD B1/B5 | `research/13` · `research/10` §3.1 |
| §5 first-person/relational trust (Subjective Logic; private model + selective signed vouches) | FOLD §5-rebuild (research/19 absorbs this into the §5-rebuild line, not a numbered B/M) | `research/17` · `research/10` §4.2 |
| §5.3 never-counts-nodes invariant (INV-13) | FOLD M6 | `research/17` |
| §6.2 VERIFICATION_STRENGTH = min weakest-link + correlation-discount | FOLD M10 | `research/10` §4.3 |
| §6.3 REACH emergent-descriptive, never computed-prescriptive (INV-17) | FOLD M1 | `research/10` §3.4 / §7 amendment 1 |
| §6.4 hierarchy = verification-tree not authority-tree | FOLD | `research/16` |
| §7 per-receiver Merkle logs + RFC 6962 proofs + STH gossip (INV-10 amended) | FOLD M2 | `research/10` §4.3 / §7 amendment 3 |
| §7.1 authenticated-minter READ gate; integrity ≠ provenance (INV-14) | FOLD B6 | `research/18` |
| §8 invariants INV-13..18 added; INV-10 amended | FOLD | (each row above) |
| §8.5 NEW — threat model + trust-boundary map + attacker tiers | FOLD M8 | `research/18` · `research/16` |
| §9 U2 sharpened as deepest hole; config-stability named; cold-start/eclipse marked orthogonal | FOLD | `research/13` · `research/17` · `research/18` |
| §10 inverted build order; each phase ≥ P2 names its `[OPEN]` dep as a phase contract | FOLD M4 | `research/10` §8 |
| §10.5 NEW — v0 definition-of-done verbatim + U1 default `[DECIDE]` | **`[DECIDE]`** + FOLD M11 | `research/10` §9/§10 · `research/19` |
| §11 corrected per-row ACCURATE/OVER-CLAIMED/MISSING/MOVE-TO-GAP | FOLD M5 | `research/10` §6 |

### The genuine design DECISIONs — RATIFIED 2026-06-21 (everything else folded mechanically)

1. **`effective_presence()` definition + `MAX_DELEGATION_DEPTH` (§1.3 / §1.2)** — **RATIFIED:**
   *count of distinct network-facing signing identities in the delegation closure, over the
   (per-receiver) LOG*, with `MAX_DELEGATION_DEPTH = 3`.
2. **U1 v0 issuance default (§10.5)** — **RATIFIED:** *invite/vouch + stake, structured as a
   DID-VC registry* (SBT- / Personhood-Credentials-upgradeable behind the seam).

Both gates are now closed → the v0 build plan (P0 + P1, §10.5) is unblocked.

---

## 13. v1.1 VALIDATE result (post-build HETS board)

This rev was authored, then VALIDATED by a 3-lens HETS board against the research corpus
(full record: `research/20-spec-v1.1-validation.md`). The board confirmed the rev is a
faithful, build-grade fold — and surfaced a small set of genuine gaps, all folded above.

| Lens | Verdict |
|---|---|
| **PM / delivery-fidelity** (honesty-auditor) | **BUILD_GRADE** — all 11 folds genuine (not name-dropped); both DECIDEs flagged not silently-settled; B2/B3 land in v0; no v1.0 overclaim reintroduced; changelog accurate. MINOR-only. |
| **Software-architect** (build-grade + consistency) | **BUILD_GRADE** — v0 buildable with no undecided choices; INV-13..18 mutually consistent; 2 MAJORs (`MAX_DELEGATION_DEPTH` undefined; §6.4-vs-INV-13 under-specified). |
| **Adversarial-security** (hacker) | **NEEDS_REVISION** — 3 MAJORs: REPAIR-leg missing authz/anti-ping-pong (v0); FALSIFY self-blocked by the WEAK circularity (v0); INV-13 vs `DISJOINT_PATHS ≥ k` count. All folded. |

**Folds applied this pass (all referenced inline as "(v1.1 VALIDATE §13)"):**

1. **§3.5 FALSIFY/REPAIR** — `CONTESTED` is a FLAG/SHOW (M5), never an action ⇒ dissolves the
   WEAK-vs-INV-16 circularity (a flag is not a high-stakes action; only *consuming* it is);
   `AUTHORIZED_TO_REPAIR` + signed (INV-14) + same-original-bar + `ESCALATING_EVIDENCE`
   anti-ping-pong (L8). *(hacker MAJOR 2+3 — v0-mandatory)*
2. **§5.3 / §5.1 / §6.2 / §6.4** — reconciled INV-13 (never-counts) with `DISJOINT_PATHS ≥ k`:
   disjointness is a *structural per-path-bar property*, not a peer-tally; what crosses a gate
   is a re-checkable record (PCD), never an aggregated count; v0 DISJOINT_PATHS is
   topological-WEAK ⇒ informs, doesn't gate. *(hacker MAJOR 1 + architect MAJOR 2)*
3. **§1.2 / §1.3 / §1.5** — `MAX_DELEGATION_DEPTH = 3` (a named, ratifiable, signed-log
   threshold) + an enforced `ACCEPT_DELEGATION` require-procedure (attenuation + depth +
   chain-root, fail-closed) + activation-time cap-check for dormant fan-out; `effective_presence`
   marked receiver-relative (P4 reconciliation, no global log). *(architect MAJOR 1 + MINORs, hacker MINOR)*
4. **§7.1 / §10 P0 / §10.5** — softened "flip signer ON" → "wire the existing-but-unconsumed
   signer (boundary work)"; env-PEM default is integrity-only (same-uid forgeable,
   firsthand-grounded at `edge-attestation.js:14`); v0 PROVENANCE gate requires a separate-uid
   signer; weights on the env default stay SHADOW. *(hacker MINOR — grounded against live code)*
5. **§4.5.3** — named the high-stakes-threshold setter as a P3 bound throne (so it doesn't
   silently relocate). *(architect MINOR)*
6. **§10.5 headline** — "(distinct-keyed; human-independence is U1-OPEN, contained not proven)"
   to block the human-independence over-read. *(architect MINOR)*
7. **§11 / §12** — completed the supersession (two dropped v1.0 rows verdict-marked);
   changelog labels normalized (B4 halves; `M-trust`→§5-rebuild; §7-amendment anchors). *(PM MINORs)*

**Residue carried (in-scope by design, marked loud per I8/M1):** the env-PEM same-uid co-forge
(integrity ≠ provenance) survives into v0 unless an Option-B separate-uid signer is injected —
v0 weights gated on it stay SHADOW; full provenance close (signed/kernel-writer edges) is the
post-v0 step. No BLOCKER remained; v0 (P0+P1, §10.5) is buildable as written.

---

### Meta-note for the implementer (unchanged in spirit)

PACT **solves P1** (who said what, untampered, auditable — mature engineering) and
**contains P2** by *dividing the labor of knowing*: the machine bears mechanical certainty;
the human bears the truth-burden; and the coupling is gated by *disjoint* cross-verification
+ *verification-keyed* reach so confidence and identity-count never outrun genuine,
independent, human-accountable evidence. It does **not** make a signed message true, make
human-roots provably unique, or make correlated sources independent — those are the
`[OPEN]` set (U1–U4), implemented as *containment, not elimination*. **The one word that
carries the whole defense — "independence" — is three predicates (§4.5); reading it as one
is the cardinal error.** Start at P0, build v0 to §10.5, reuse Power Loom per the corrected
§11, and treat every `[OPEN]` as a containment to narrow with live data — never a gap to
paper over.

*v1.1 — build-grade rev. Folds 11 mechanical decisions + 2 flagged design decisions from
`research/00`–`research/19`. P1 ships on adopted standards. The novel core (§3 ATMS, §5
seed-free trust, §6.1 creator-coupling, §6.3 emergent REACH) is the build. The frontier
(U1–U4) is small, localized, and narrowed by adversarial data — never claimed solved.*
