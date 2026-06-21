# PACT Prior-Art Review — Computational Epistemics

**Lens:** truth maintenance, argumentation, belief revision, provenance, scoped/contextual truth.
**Subject:** PACT §3 (premise chain, VALIDATE/FALSIFY over a DAG, "valid-given-premises, never true"), §3.1 (scope/derived-scope/graded edges), §6 (grounding engine, REACH ∝ verification), §7 (audit log).
**Date:** 2026-06-21.
**Discipline:** every claim about a formalism cites a source URL. Inferences and unsourced judgements are flagged as such.

---

## 0. Executive verdict

PACT's epistemic core is, almost line for line, a **re-derivation of established 1979–2014 formalisms** — and that is *good news*, because the literature has already worked out the hard parts (efficient propagation, contradiction handling, multi-context reasoning, the algebra of confidence-along-a-chain) that PACT's spec currently hand-waves.

- §3's premise DAG + VALIDATE/FALSIFY is a **Truth Maintenance System** — specifically a **Justification-based TMS (JTMS, Doyle 1979)** by its current single-context design, and it *should* be an **Assumption-based TMS (ATMS, de Kleer 1986)** to get the things it is missing.
- §3's "Claim valid-given-premises within scope" is the **Toulmin model** (claim / data / warrant / qualifier within a domain) re-spelled, and its defeasibility is **Dung 1995 abstract argumentation** + **ASPIC+** structured argumentation.
- §3.1's "derived_scope = ∩ ancestral scopes" is **McCarthy's `ist(c,p)` context logic / Local Model Semantics**, and "graded edge_confidence" wants **possibilistic logic** or **fuzzy/weighted argumentation**.
- §6.3's "REACH ∝ verification strength; claimed grounding ≤ root verification" is the **possibilistic weakest-link principle** (`N(conclusion) = min` over the chain) and/or **provenance semirings** — *not novel*.
- §7's append-only hash-chained signed log is **Certificate Transparency / Merkle-DAG transparency logs** (RFC 6962), correctly tagged `[SOLVED]`.

The single most valuable adoption: **ATMS labels + nogoods** (replaces a hand-rolled DAG walk with a sound/complete/minimal/consistent multi-context label algebra that handles contradiction for free). The single biggest *logical gap*: **PACT has no defined semantics for cycles in the premise DAG, for two simultaneously-VALID-but-contradictory chains, or for the non-monotonic FALSIFY-then-recover case** — all three are exactly the cases TMS/argumentation theory was built to handle, and PACT's spec is silent on them.

---

## 1. Truth Maintenance Systems — PACT §3 *is* a TMS

### 1.1 What the literature establishes

A **Truth Maintenance System** (a.k.a. *reason maintenance*) separates a network of propositions and their justifications from the domain reasoner, so beliefs can be revised when assumptions change or contradictions arise, without re-deriving everything. Jon Doyle (1979) was the first to make this separation explicit ([Scholarpedia / reason maintenance, Wikipedia](https://en.wikipedia.org/wiki/Reason_maintenance); [Doyle 1979, "A Truth Maintenance System," Semantic Scholar](https://www.semanticscholar.org/paper/A-Truth-Maintenance-System-Doyle/f08f699374a27cdbc2c1ecf050ae285b01bda723)).

**JTMS (Justification-based, Doyle 1979).** Each node ("a proposition") has a belief status of exactly one of two labels — **IN/BELIEVED** if it has at least one *valid* justification, **OUT/DISBELIEVED** otherwise. Justifications record *why* a derived fact is believed (support-list and conditional-proof forms). When a contradiction is found, the responsible statements are identified and **dependency-directed backtracking** retracts the minimal set ([Wikipedia, Reason maintenance](https://en.wikipedia.org/wiki/Reason_maintenance); [hbeck/jtms reference implementation](https://github.com/hbeck/jtms)). The JTMS holds **one context at a time**.

**ATMS (Assumption-based, de Kleer 1986).** The generalization. From de Kleer, *An Assumption-based Truth Maintenance System*, *Artificial Intelligence* 28:127–162 (1986) ([Semantic Scholar entry](https://www.semanticscholar.org/paper/An-Assumption-Based-TMS-Kleer/ed3f9263e936a879092ad7a2bf27e0f94089ccd8); [TU Wien ATMS chapter](https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf); [de Kleer, *Foundations of ATMS*, AAAI-87](https://cdn.aaai.org/AAAI/1987/AAAI87-033.pdf)):

- **node** = an assertion/proposition.
- **assumption** = a node taken as primitively true in any environment that contains it.
- **environment** = a set of assumptions (a context).
- **label** = the set of environments in which the node holds — a *compact encoding of all the contexts that support it*.
- **nogood** = a minimal *inconsistent* environment (a "conflict"); the ATMS keeps the set of minimal nogoods and never reasons inside one again.

The ATMS maintains every node's label so that it satisfies four properties (the standard de Kleer label properties; [TU Wien chapter](https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf)):

1. **Consistent** — no environment in any label is a superset of a nogood.
2. **Sound** — the node is derivable from every environment in its label.
3. **Complete** — every environment from which the node is derivable is represented (subsumed) in the label.
4. **Minimal** — no environment in the label is a superset of another in it.

The headline property the literature claims, and the one PACT most needs: an ATMS **reasons in all contexts simultaneously**, and label propagation is **incremental — no re-derivation** when assumptions are toggled; contradiction is handled by *pruning environments that subsume a nogood*, not by backtracking ([Wikipedia, Reason maintenance](https://en.wikipedia.org/wiki/Reason_maintenance); [TU Wien chapter](https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf)).

### 1.2 Mapping PACT §3 onto TMS terminology

| PACT §3 construct | TMS term | Notes |
|---|---|---|
| `Premise` (root, `is_premise_root`) | **assumption** | a node primitively held; in ATMS it seeds environments |
| `Premise.creator = human_uid` | (no TMS analog) | PACT's *provenance/accountability* annotation on an assumption — a genuine addition (see §4) |
| `Claim` with `premises:[…]` | **node** + its **justification(s)** | `premises` = the justification's antecedent list |
| `validation: ValProof` (derivation_sound) | the **justification** itself (the inference link) | "does content follow from premises" = a valid justification |
| `VALIDATE(claim) → VALID_GIVEN(premises)` | computing the node's **label** | "valid-given-P, never TRUE" = *the node holds in the environment {P…}*, exactly an ATMS label entry |
| `FALSIFY(premise)` → mark + collapse dependents | retracting an assumption → **label recomputation** | JTMS: flip status to OUT and propagate; ATMS: any environment containing the falsified assumption drops from labels |
| `c.grounding := COLLAPSED` (valid-given-P stands, P gone) | node becomes **OUT** / its label becomes ∅ | precisely the JTMS "no valid justification ⇒ DISBELIEVED" case |
| "self-invalidating via the DAG, no re-derivation needed" | **incremental label propagation** | this is *the* defining TMS efficiency claim — PACT asserts it; ATMS *proves and bounds* it |
| (absent) | **nogood / minimal inconsistent environment** | PACT has *no* contradiction primitive — see §6, the biggest gap |

**Inference (clearly flagged):** PACT §3 as written — a single live belief state, premises toggled true/false, dependents collapse — is behaviorally a **JTMS**. Doyle's JTMS and PACT's FALSIFY share the same defining move: a node is believed iff it has a valid justification whose antecedents are all believed; kill a root and the propagation is mechanical. The DAG, the "no re-derivation," the "conditional validity propagates up / falsification propagates down" (PACT intent §I4) are JTMS to the letter. This is not a criticism — it is a strong signal PACT should *reuse the formalism rather than re-implement its weaker half.*

### 1.3 What ATMS provides for free that PACT's spec does NOT mention

PACT §3 should adopt these — each is load-bearing for a multi-agent, multi-root network:

1. **Multiple simultaneous contexts (the whole point of ATMS).** In a network of mutually-untrusting roots (PACT §1, §11 "inter-node"), *different agents hold different premise sets that disagree.* A JTMS-style single belief state forces one global context; an ATMS represents "claim C holds in environment {P1,P2} but not {P1,P3}" natively. PACT's §3.1 scope-intersection is *trying* to express exactly this and would get it for free from environments. **Source:** ATMS's defining capability is "handle multiple contexts simultaneously" ([Wikipedia](https://en.wikipedia.org/wiki/Reason_maintenance); [TU Wien chapter](https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf)).

2. **Nogoods / contradiction handling.** PACT's FALSIFY only fires when a *human marks a premise falsified*. It has **no mechanism for the network to discover that two premises are jointly inconsistent.** ATMS nogoods are exactly that: a minimal inconsistent environment is recorded once and every dependent context is pruned. This directly serves PACT landmine L8 ("error vs malice") and intent I4 ("everything is defeasible") — a discovered contradiction should collapse the relevant context automatically. **Source:** [de Kleer 1986 / TU Wien chapter](https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf).

3. **Efficient, *proven* incremental propagation.** PACT claims "no re-derivation needed." ATMS gives the algorithm and the four label-correctness invariants (sound/complete/minimal/consistent) that make the claim true rather than aspirational. Without them, a naive DAG walk on FALSIFY can be O(dependents) per falsification and can leave the graph in an inconsistent state under concurrent updates (a real risk in PACT's multi-agent setting). **Source:** [TU Wien chapter](https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf).

4. **Dependency-directed backtracking** (JTMS) — minimal retraction on contradiction, instead of PACT's blunt "mark falsified + collapse all dependents." **Source:** [Wikipedia, Reason maintenance](https://en.wikipedia.org/wiki/Reason_maintenance).

**Net:** PACT §3 should be specified as *"an ATMS whose assumptions carry a `creator: human_uid` provenance annotation and a `scope: ScopeSpec`, and whose environments are the unit of scope-intersection."* That single reframe imports four decades of correctness results.

---

## 2. Abstract argumentation, defeasible logic, ASPIC+, Toulmin

### 2.1 Toulmin (1958) — PACT §3 is the Toulmin model

Toulmin's *The Uses of Argument* (1958) decomposes an argument into six parts: **claim**, **data/grounds** (evidence), **warrant** (the assumption linking grounds to claim), **backing** (justifies the warrant), **qualifier** (how strongly / how universally the claim holds), **rebuttal** (exceptions / conditions of defeat) ([McMaster / Hitchcock summary](https://www.humanities.mcmaster.ca/~hitchckd/toulmin.htm); [Cal State Pressbooks](https://pressbooks.calstate.edu/writingargumentsinstem/chapter/toulmin-argument-model/)). The first three are essential; the last three optional.

Direct map to PACT §3:

| Toulmin | PACT |
|---|---|
| Claim | `Claim.content` |
| Data / grounds | `Claim.premises` (the antecedent premises) |
| Warrant | `Claim.validation` / `derivation_sound` (the licence from premises to claim) |
| Backing | §6.2 `CROSS_VERIFY` (what justifies the warrant/premise) |
| **Qualifier** | **§3.1 `edge_confidence` + §6.3 grounding strength** — "how universally the claim applies" |
| **Rebuttal** | **§3 `FALSIFY` / the in-scope counterexample** — "exceptions to the claim" |

**Observation (inference):** PACT independently re-discovered Toulmin almost completely. The one Toulmin element PACT under-specifies is the **qualifier**: Toulmin's qualifier explicitly bounds *both* strength ("presumably", "almost certainly") *and* scope ("in the absence of X"). PACT splits these across `edge_confidence` (scope strength) and §6.3 (grounding strength) without unifying them — see §3 below.

### 2.2 Dung 1995 — abstract argumentation gives PACT its defeasibility semantics

Dung's framework (P.M. Dung, "On the acceptability of arguments…", *Artificial Intelligence* 1995) is the canonical formalism for *defeasible* reasoning. An **argumentation framework** is a pair `(A, R)`: arguments `A`, attack relation `R` ([Wikipedia, Argumentation framework](https://en.wikipedia.org/wiki/Argumentation_framework)). Key notions:

- **conflict-free** set: no member attacks another.
- **defended / acceptable** argument `a` w.r.t. set `E`: every attacker of `a` is attacked by some member of `E`.
- **admissible** set: conflict-free and self-defending.
- **complete extension**: admissible and contains every argument it defends.
- **grounded extension**: the *least* complete extension — **the least fixed point of the characteristic function `F`** — and *always unique* ([Wikipedia](https://en.wikipedia.org/wiki/Argumentation_framework)).
- **preferred extension**: a maximal admissible set.
- **stable extension**: a conflict-free set that attacks everything outside it.

**The deep correspondence (sourced + inference):** PACT's FALSIFY-propagation computes something structurally identical to a **grounded extension via a least-fixed-point of a monotone operator**. Wikipedia states the grounded extension is "the least fixed point of the characteristic function F" ([Argumentation framework](https://en.wikipedia.org/wiki/Argumentation_framework)); JTMS label recomputation is likewise a fixpoint over the justification graph ([Reason maintenance](https://en.wikipedia.org/wiki/Reason_maintenance)). PACT is doing fixpoint defeasible reasoning *without naming it*, which means it inherits the well-known pathologies (cycles, §6.4) without inheriting the well-known cures.

### 2.3 ASPIC+ and defeasible logic — the *structured* layer PACT needs

Dung is *abstract* (arguments are atoms). PACT's claims have internal structure (premises → derivation → conclusion), so the relevant prior art is **structured argumentation: ASPIC+** (Modgil & Prakken, "The ASPIC+ framework for structured argumentation: a tutorial," *Argument & Computation* 5(1), 2014) ([IOS Press](https://content.iospress.com/articles/argument-and-computation/869766); [KCL](https://kclpure.kcl.ac.uk/portal/en/publications/the-aspic-framework-for-structured-argumentation-a-tutorial/)) and **defeasible logic** (Nute).

ASPIC+ establishes exactly the distinction PACT blurs — two kinds of inference rule:

- **strict rules**: premises *guarantee* the conclusion (deductive).
- **defeasible rules**: premises only create a *presumption* for the conclusion.

And three attack points: **on uncertain premises**, **on defeasible inferences**, **on conclusions of defeasible inferences** ([ASPIC+ tutorial summary, IOS Press](https://content.iospress.com/articles/argument-and-computation/869766); [ResearchGate, "On ASPIC+ and Defeasible Logic"](https://www.researchgate.net/publication/305183649_On_ASPIC_and_Defeasible_Logic)).

**Gap this exposes (inference):** PACT's `VALIDATE` treats *all* derivations as if `derivation_sound` is a single binary strict check ("does A follow from P"). But PACT's whole epistemics is *defeasible* (intent I4). ASPIC+ shows you must distinguish strict from defeasible inference, because **conflict resolution requires explicit preferences over defeasible rules** ([IOS Press tutorial](https://content.iospress.com/articles/argument-and-computation/869766)). PACT has *no* preference relation to adjudicate two valid-but-conflicting chains — exactly the gap in §6.4.

---

## 3. Scope / contextual truth — §3.1 derived_scope and graded edges

### 3.1 McCarthy contexts and Local Model Semantics

PACT's `derived_scope = ∩(ancestral scopes)` and "a claim is valid only within ∩(ancestral scopes); applying it outside is BLOCKED" is **context logic**.

- **McCarthy & Buvač, *Formalizing Context*** introduces contexts as first-class objects with the relation **`ist(c, p)`** — "proposition `p` is true in context `c`" ([PhilPapers, McCarthy & Buvač](https://philpapers.org/rec/MCCFCE); [arXiv, "A Brief History of Context"](https://arxiv.org/pdf/0912.1838)). PACT's "valid within scope S" is literally `ist(S, claim)`.
- Two mature AI formalizations exist: the **Propositional Logic of Context (PLC)** (McCarthy, Buvač, Mason) and **Local Model Semantics / MultiContext Systems (LMS/MCS)** (Giunchiglia & Serafini 1994; Ghidini & Giunchiglia) ([arXiv, "A Brief History of Context"](https://arxiv.org/pdf/0912.1838); [Springer, "Two Formalizations of Context: A Comparison"](https://link.springer.com/chapter/10.1007/3-540-44607-9_7)). LMS/MCS formalizes contextual reasoning as **locality + compatibility**, with each context having its own language/theory and **bridge rules** relating contexts ([arXiv brief history](https://arxiv.org/pdf/0912.1838)).

**Verdict on §3.1:** "derived_scope = ∩ ancestral scopes" is *principled but under-formalized*. Context logic already supplies the machinery PACT needs:

- "Applying a claim outside ∩scope is BLOCKED" = a **bridge rule** that does not license `ist(S', claim)` for `S' ⊄ S`.
- Scope *intersection* is the natural compatibility relation when a claim is lifted into a context that must satisfy all its ancestors' constraints.
- **Crucially:** the ATMS connection (§1) gives the *same* structure for free — an ATMS **environment** *is* a context, and a node's label *is* the set of contexts where it holds. PACT does not need to invent scope-intersection; it falls out of "label = set of supporting environments" once scope is folded into the assumption set.

### 3.2 Graded edge_confidence — possibilistic, not ad hoc (but currently *specified* ad hoc)

PACT §3.1 says scope boundaries are "GRADED (edge_confidence) — solid in core, approximate near edge, invalid beyond." As written this is **ad hoc** (no aggregation rule is given). The principled formalisms:

- **Possibilistic logic** (Dubois & Prade): each formula carries a **necessity degree**; the **weakest-link principle** propagates the *minimum* degree through an inference chain: if `N(¬p∨q) ≥ α` and `N(p) ≥ β` then `N(q) ≥ min(α,β)` ([Semantic Scholar, "Possibilistic logic"](https://www.semanticscholar.org/paper/Possibilistic-logic-Dubois-Lang/0600fe15ea937af543c21926b5fe2a4200f4ebe0); search corroboration of the weakest-link rule). This is *exactly* what PACT §6.3 is reaching for (see §4 below).
- **Fuzzy / weighted bipolar argumentation** and **gradual semantics**: assign each argument a real-valued **acceptability degree** as its strength, propagated from initial weights along support/attack edges (Besnard & Hunter 2001; Amgoud & Ben-Naim; Cayrol & Lagasquie-Schiex) ([arXiv, "Ranking-based Argumentation Semantics"](https://arxiv.org/pdf/2307.16780); [AAAI, "Convergent Semantics for Weighted Bipolar Argumentation"](https://ojs.aaai.org/index.php/AAAI/article/download/39019/42981)). "Degrees of trust" on edges is an explicit topic ([Springer, "Gradual Acceptability … with Degrees of Trust"](https://link.springer.com/chapter/10.1007/978-3-319-60438-1_20)).

**Recommendation:** specify `edge_confidence` propagation as **either** possibilistic necessity (min over the chain — simplest, monotone, matches §6.3) **or** a named gradual-semantics weight propagation. Do not leave it as an un-aggregated gradient. The two even have a clean division of labor: possibilistic *min* for the "confidence ≤ weakest premise" backbone, gradual semantics if attacks/supports between sibling claims must also modulate strength.

---

## 4. §6.3 "REACH ∝ verification strength" — known idea, not novel

PACT's most-emphasized invariant (INV-9, intent I6, landmine L1): *"a claim's CLAIMED GROUNDING may never exceed its ROOT's actual (disjoint) verification."* Is this novel? **No — it is the possibilistic weakest-link principle, and/or a provenance-semiring aggregation.** Closest prior art, in order of fit:

1. **Possibilistic weakest-link principle (closest).** Dubois & Prade: *"the strength of an inference chain is that of the least certain formula involved"* and *"the necessity of a derived conclusion equals the minimum necessity of formulas in the derivation chain"* ([Semantic Scholar, Possibilistic logic](https://www.semanticscholar.org/paper/Possibilistic-logic-Dubois-Lang/0600fe15ea937af543c21926b5fe2a4200f4ebe0)). PACT's "claimed grounding ≤ root verification" is the *special case* where the bound is the minimum over the root premises. **This is the formalism PACT §6.3 should cite and adopt directly.** It also gives PACT the monotonicity guarantee it currently asserts informally ("never masquerading as hardened").

2. **Provenance semirings** (Green, Karvounarakis, Tannen, PODS 2007): facts are annotated with semiring elements; **joint use → multiply, alternative use → add** ([Green & Karvounarakis, PODS 2007](https://web.cs.ucdavis.edu/~green/papers/pods07.pdf); [Penn slides](https://www.cis.upenn.edu/~plclub/propr/greg-slides.pdf)). Confidence-along-a-derivation is a standard semiring instantiation (the *Viterbi*/fuzzy semiring uses `min`/`max`; the tropical semiring uses `min`/`+`). PACT's "grounding propagates along the premise DAG, bounded by the weakest disjoint root" is a **min-aggregation over a provenance polynomial**. The semiring framework additionally tells PACT *how to combine disjoint confirmations*: §6.2's "disjoint independent paths" is the **`+` (alternative-derivation) operator**, and the spec's worry that "correlated confirmations = near-zero" is precisely why you cannot use plain `+` on non-independent annotations — the semiring literature formalizes when aggregation is valid.

3. **Gradual / ranking-based argumentation strength** (Besnard & Hunter; Amgoud & Ben-Naim): an argument's acceptability degree is bounded/derived from its supports ([arXiv, ranking-based semantics](https://arxiv.org/pdf/2307.16780)). "Strength bounded by support strength" is a standard axiom in this family.

**Verdict:** §6.3's *mechanism* (reach proportional to verification) is **not novel** as a confidence-propagation rule — it is min-aggregation / weakest-link, well-formalized since the 1980s–2000s. What *is* genuinely PACT's own contribution is the **socio-technical framing**: tying that confidence bound to *propagation radius / reach* and contrasting it with engagement-driven reach (landmine L1). The *epistemic* engine is borrowed; the *application* of "confidence bound ⇒ propagation bound, opposite of social-media reach" is the novel synthesis. PACT should claim *that* and cite possibilistic logic for the rest.

---

## 5. Provenance & audit — §7 (correctly `[SOLVED]`)

- **W3C PROV-DM** (W3C Recommendation, 30 Apr 2013): entity / activity / agent, with `wasDerivedFrom(e2, e1, …)` connecting a generated entity to the one it derived from ([W3C PROV-DM](https://www.w3.org/TR/prov-dm/); [Wikipedia, W3C PROV](https://en.wikipedia.org/wiki/W3C_Prov)). PACT's §6.1 "premise creator ownership + provenance DAG" and §11 "built_by/graded_by" map cleanly: `Premise.creator` is a PROV **agent**, `wasAttributedTo`; the premise→claim derivation is `wasDerivedFrom`. **Recommendation:** adopt PROV vocabulary so the audit log is interoperable and the provenance DAG has a standard serialization (PROV-O/PROV-N). This is the one place PACT *adds* something TMS lacks (§1.2): TMS has no notion of *who is accountable for an assumption.* PROV is the right home for it.
- **Append-only hash-chained signed log (§7)** = **Certificate Transparency / Merkle-tree transparency logs**, RFC 6962 (Laurie, Langley, Kasper 2013), building on Crosby & Wallach, "Efficient Data Structures for Tamper-Evident Logging" (2009) ([RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.html); [research!rsc, "Transparent Logs for Skeptical Clients"](https://research.swtch.com/tlog)). The Merkle structure gives consistency proofs (any version is a superset of any prior version) and detects split-view attacks — directly relevant to a multi-agent network where a log might "show different things to different people." Correctly tagged `[SOLVED]`; PACT should cite RFC 6962 and use **consistency + inclusion proofs**, not just a linear PREV_HASH chain (the spec's §2 PREV_HASH is a hash chain, which is weaker than a Merkle log for efficient third-party auditing).

---

## 6. Where a TMS / argumentation theorist would immediately flag a gap

These are the issues a reviewer from this field raises on first read. Each is a place where PACT asserts a behavior the literature shows is *underdetermined* without an explicit semantics.

### 6.1 Cycles in the premise DAG — undefined behavior ⚠️ (biggest gap)

PACT calls it a **DAG** (§3: "a premise may itself be a prior validated Claim (DAG)"), but a real multi-agent network *will* form cycles (claim A cites B as a premise; later B is re-grounded partly on A). PACT specifies **no cycle detection and no semantics for a cyclic dependency.**

The literature is unambiguous that this is the central hard case:
- In argumentation, **odd-length cycles** are pathological: *"Stable semantics does not assign an extension to argumentation frameworks containing odd-length cycles"* and odd cycles cause counterintuitive results under preferred semantics ([Springer, "Solving Semantic Problems with Odd-Length Cycles"](https://link.springer.com/chapter/10.1007/978-3-540-45062-7_36); [Springer, "Weak Argumentation Semantics and Unsafe Odd Cycles"](https://link.springer.com/chapter/10.1007/978-3-031-43619-2_12)).
- A framework is **well-founded** (no infinite attack chain) iff all semantics coincide and yield a single grounded extension ([Wikipedia, Argumentation framework](https://en.wikipedia.org/wiki/Argumentation_framework)). PACT *assumes* well-foundedness by calling it a DAG but does not *enforce* it.
- In JTMS, self-supporting loops produce **unfounded support** — a node believed only because of a circular justification — which the TMS literature explicitly screens out during label computation ([Reason maintenance](https://en.wikipedia.org/wiki/Reason_maintenance)).

**PACT's FALSIFY would loop or leave nodes in undefined state on a cyclic dependency.** Fix: either (a) enforce acyclicity at VALIDATE (reject a premise edge that would close a cycle), or (b) adopt grounded-extension/least-fixpoint semantics with explicit unfounded-support detection (ATMS/JTMS already do this). Right now the spec quietly assumes (a) without implementing the check.

### 6.2 Two simultaneously-VALID, contradictory chains — no adjudication

PACT's VALIDATE returns `VALID_GIVEN(premises)` independently per claim. Nothing stops **two claims that are each valid-given-their-premises from directly contradicting each other** (C: "X holds in scope S", C': "¬X holds in scope S", both with sound derivations from non-falsified premises). PACT has:
- **no nogood primitive** to record the joint inconsistency (§1.3 #2),
- **no preference relation** over defeasible rules/premises to adjudicate (ASPIC+ §2.3 shows this is *required* for conflict resolution: *"conflicts between arguments are often resolved with explicit preferences"* — [IOS Press tutorial](https://content.iospress.com/articles/argument-and-computation/869766)),
- **no attack relation** in the Dung sense (§2.2).

A TMS theorist's immediate fix: add an explicit **contradiction node** (JTMS) or **nogood** (ATMS); an argumentation theorist's: add the **attack relation + a preference ordering** (ASPIC+) so the framework yields a grounded extension that excludes one of the two. Without either, PACT's "ledger" can hold two contradictory "valid" claims with no defined resolution — which silently violates intent M4/M5 (the *map* of disagreement is fine, but the spec implies a single coherent grounding state, and there is no operator to keep it coherent).

### 6.3 Non-monotonic recovery (FALSIFY then un-falsify) — undefined

PACT §3 marks a premise falsified and collapses dependents. What happens when the falsification is itself **retracted** (the counterexample was out-of-scope, or the falsifier was wrong — landmine L8 "repair not penalty")? AGM belief revision (Alchourrón, Gärdenfors, Makinson 1985) is the formalism for exactly this — **expansion / revision / contraction**, the **recovery postulate** (`K ⊆ (K−P)+P`), and the **Levi/Harper identities** linking them ([Wikipedia, Belief revision](https://en.wikipedia.org/wiki/Belief_revision)). PACT has *contraction* (FALSIFY) but no specified *revision* or *re-expansion*, and no **epistemic entrenchment** ordering to decide *which* premise to give up when a contradiction must be resolved with minimal change ([Wikipedia, Belief revision](https://en.wikipedia.org/wiki/Belief_revision)). A reviewer would note PACT is implementing one-third of AGM (contraction) and calling it the whole epistemics.

A subtle but important AGM point for PACT's design: AGM is **coherentist** (revise the deductively-closed belief set toward global consistency), whereas TMS/PACT is **foundationalist** (track *justifications*; a belief stands iff its support stands) ([Wikipedia, Belief revision](https://en.wikipedia.org/wiki/Belief_revision); [Gärdenfors, foundations-vs-coherence]). PACT is correctly foundationalist (premises = foundations, claims derived), which is *consistent with TMS* but means PACT should adopt **foundationalist belief-base revision** (Nebel, Hansson) rather than classical AGM — and should say so, because the recovery postulate that AGM debates is exactly the FALSIFY-then-repair case L8 cares about.

### 6.4 "disjoint paths" lacks an independence formalism (U2)

§6.2/§6.3 demand *disjoint, genuinely independent* confirmations and discount correlated ones to ~0, but give **no measure** of independence. The provenance-semiring framework (§4) is exactly where this is formalized: alternative derivations combine with `+` *only when the annotations are independent*; shared sub-derivations (correlated sources) appear as **shared factors in the provenance polynomial** and must *not* be double-counted ([Green & Karvounarakis, PODS 2007](https://web.cs.ucdavis.edu/~green/papers/pods07.pdf)). PACT's U2 ("correlated consensus") is a *known, formalized* problem in provenance: the polynomial structure *records* the sharing; PACT should compute independence from the provenance DAG's shared-ancestor structure rather than leaving "independence estimation" as an `[OPEN]` to hand-roll.

### 6.5 Minor: VALIDATE's `derivation_sound` is assumed decidable

§3 tags VALIDATE `[BUILD]` "MECHANICAL, decidable." For arbitrary claim content this is **not decidable** (first-order entailment is semi-decidable). The literature's escape is ASPIC+'s strict-vs-defeasible split (§2.3): only *strict* rules need sound entailment; *defeasible* steps are presumptions checked structurally. PACT should adopt that split or restrict `derivation_sound` to a decidable fragment, else the "decidable" claim is overstated (an honesty-audit flag against intent I8).

---

## 7. Consolidated recommendations (what to borrow, in priority order)

1. **Re-specify §3 as an ATMS with provenance-annotated assumptions.** Adopt nodes / justifications / assumptions / **environments** / **labels** / **nogoods** and the four label properties (sound, complete, minimal, consistent). This single move imports: multi-context reasoning (serves §3.1 + §11 inter-node), contradiction handling (fixes §6.2), proven incremental propagation (validates "no re-derivation"), and dependency-directed backtracking. *Source: de Kleer 1986.*
2. **Specify `edge_confidence` and §6.3 reach via possibilistic weakest-link** (`grounding(claim) = min` over disjoint-root necessities). Cite Dubois & Prade. Stop describing it as an un-aggregated gradient.
3. **Adopt provenance-semiring aggregation** for combining confirmations (`×` joint, `+` alternative) *and* for computing independence (U2) from shared factors in the provenance polynomial. Cite Green/Karvounarakis/Tannen PODS 2007.
4. **Add ASPIC+ strict-vs-defeasible rules + an explicit preference/attack relation** so two contradictory valid chains can be adjudicated (fixes §6.2). Cite Modgil & Prakken 2014.
5. **Adopt foundationalist belief-base revision (not pure AGM)** to define FALSIFY-then-repair (L8), with an entrenchment ordering for minimal-change contraction. Cite AGM 1985 + Nebel/Hansson for the base-revision variant.
6. **Use W3C PROV vocabulary** for §6.1/§11 provenance and **RFC 6962 Merkle transparency-log** (with inclusion/consistency proofs, not just a linear hash chain) for §7. Both `[SOLVED]`.
7. **Enforce acyclicity at VALIDATE or define grounded-extension semantics for cycles.** This is the unguarded edge in the current spec.

---

## 8. Source list

**Truth maintenance**
- de Kleer, *An Assumption-based Truth Maintenance System*, AIJ 28 (1986): https://www.semanticscholar.org/paper/An-Assumption-Based-TMS-Kleer/ed3f9263e936a879092ad7a2bf27e0f94089ccd8
- de Kleer, *Foundations of Assumption-based TMS*, AAAI-87: https://cdn.aaai.org/AAAI/1987/AAAI87-033.pdf
- ATMS chapter (label properties), TU Wien: https://www.dbai.tuwien.ac.at/staff/wotawa/atmschapter1.pdf
- Doyle, *A Truth Maintenance System* (1979): https://www.semanticscholar.org/paper/A-Truth-Maintenance-System-Doyle/f08f699374a27cdbc2c1ecf050ae285b01bda723
- Reason maintenance (JTMS vs ATMS, DDB), Wikipedia: https://en.wikipedia.org/wiki/Reason_maintenance
- JTMS reference implementation: https://github.com/hbeck/jtms

**Argumentation**
- Argumentation framework (Dung; grounded = least fixpoint of F), Wikipedia: https://en.wikipedia.org/wiki/Argumentation_framework
- Modgil & Prakken, *The ASPIC+ framework: a tutorial*, Argument & Computation 5(1) 2014: https://content.iospress.com/articles/argument-and-computation/869766
- *On ASPIC+ and Defeasible Logic*: https://www.researchgate.net/publication/305183649_On_ASPIC_and_Defeasible_Logic
- Ranking-based / gradual semantics: https://arxiv.org/pdf/2307.16780
- Weighted bipolar gradual semantics (AAAI): https://ojs.aaai.org/index.php/AAAI/article/download/39019/42981
- Gradual acceptability with degrees of trust (Springer): https://link.springer.com/chapter/10.1007/978-3-319-60438-1_20
- Odd-length cycles / no stable extension: https://link.springer.com/chapter/10.1007/978-3-540-45062-7_36 ; https://link.springer.com/chapter/10.1007/978-3-031-43619-2_12

**Toulmin**
- Toulmin model (claim/data/warrant/qualifier/rebuttal/backing): https://www.humanities.mcmaster.ca/~hitchckd/toulmin.htm ; https://pressbooks.calstate.edu/writingargumentsinstem/chapter/toulmin-argument-model/

**Belief revision**
- AGM postulates, Levi/Harper identities, entrenchment, foundationalism vs coherentism, Wikipedia: https://en.wikipedia.org/wiki/Belief_revision
- Belief revision handbook chapter: https://dai.fmph.uniba.sk/~sefranek/kri/handbook/chapter08.pdf

**Scoped / contextual truth**
- McCarthy & Buvač, *Formalizing Context* (`ist(c,p)`): https://philpapers.org/rec/MCCFCE
- *A Brief History of Context* (PLC vs LMS/MCS; bridge rules): https://arxiv.org/pdf/0912.1838
- *Two Formalizations of Context: A Comparison*: https://link.springer.com/chapter/10.1007/3-540-44607-9_7

**Confidence propagation**
- Possibilistic logic (weakest-link, necessity = min over chain), Dubois & Prade: https://www.semanticscholar.org/paper/Possibilistic-logic-Dubois-Lang/0600fe15ea937af543c21926b5fe2a4200f4ebe0
- Green, Karvounarakis, Tannen, *Provenance Semirings*, PODS 2007: https://web.cs.ucdavis.edu/~green/papers/pods07.pdf ; https://www.cis.upenn.edu/~plclub/propr/greg-slides.pdf

**Provenance & audit**
- W3C PROV-DM (entity/activity/agent, wasDerivedFrom): https://www.w3.org/TR/prov-dm/ ; https://en.wikipedia.org/wiki/W3C_Prov
- RFC 6962 Certificate Transparency (Merkle append-only log): https://www.rfc-editor.org/rfc/rfc6962.html
- *Transparent Logs for Skeptical Clients* (Cox): https://research.swtch.com/tlog

---

*Method note: PDF primary sources (de Kleer AAAI-87, TU Wien ATMS chapter) returned as binary via fetch; their content claims here are corroborated through the secondary-source summaries cited inline (Wikipedia Reason maintenance, the AAAI/Semantic-Scholar abstracts, and the ATMS chapter's indexed text). Label-property phrasing (sound/complete/minimal/consistent) is the standard de Kleer formulation as reported by the TU Wien chapter; treat the exact wording as paraphrase, not verbatim quote.*
