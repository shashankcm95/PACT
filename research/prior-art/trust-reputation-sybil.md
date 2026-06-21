---
lifecycle: persistent
title: "PACT Prior-Art Review — Trust, Reputation & Sybil Resistance"
lens: trust / reputation / Sybil resistance
date: 2026-06-21
scope: pressure-test PACT §1 (identity/Sybil anchor) and §5 (trust engine) against credible prior work
---

# PACT Prior-Art Review — Trust, Reputation & Sybil Resistance

**Lens:** trust, reputation, and Sybil resistance.
**Target under test:** PACT-spec.md §1 (Identity & Sybil anchor) and §5 (Trust engine — P2a), plus
the §6.2 / INV-11 disjoint-path cross-verification and the VOUCHER_STAKE / CONVERT loop.

**Research-mode discipline.** Every factual claim below cites a source URL. Where I extrapolate
beyond a source I write **[inference]**. Where I could not get a primary quote I flag it.

> **One-line orientation.** PACT's trust engine is, mathematically, a *personalized / receiver-rooted*
> trust-propagation metric — the same family as EigenTrust, Advogato, Appleseed, TidalTrust and
> Subjective Logic. Its two genuinely distinctive moves (vs that literature) are (a) *refusing a global
> eigenvector* in favour of strictly receiver-local propagation, and (b) gating *consensus-to-action
> conversion* on the unforgeable (disjoint paths + stake + probation), not on score magnitude. Almost
> everything else in §5 has a named precedent, and PACT should adopt those precedents' *bounds* and
> *known attacks* rather than re-deriving them.

---

## PART A — The prior art, mechanism by mechanism

### A1. EigenTrust (Kamvar, Schlosser, Garcia-Molina, WWW 2003)

**Mechanism.** Each peer `i` keeps a *local* trust value for peer `j` from its own transaction
history, normalized so a peer's outgoing trust sums to 1:
`c_ij = max(s_ij, 0) / Σ_j max(s_ij, 0)` — normalization explicitly prevents a malicious peer from
assigning "arbitrarily high local trust to colluding peers and arbitrarily low to good peers."
([EigenTrust — Wikipedia](https://en.wikipedia.org/wiki/EigenTrust)) Global trust is the left
principal eigenvector of the normalized local-trust matrix `C`, computed by distributed power
iteration `t^(k+1) = C^T t^(k)`. ([Wikipedia](https://en.wikipedia.org/wiki/EigenTrust);
[Kamvar et al., Stanford PDF](https://nlp.stanford.edu/pubs/eigentrust.pdf))

**Pre-trusted peers (the load-bearing part for PACT).** The bare eigenvector is gameable and may not
converge, so EigenTrust mixes in a set `P` of pre-trusted peers via a distribution vector `p`
(`p_i = 1/|P|` if `i ∈ P`, else 0):

```
t^(k+1) = (1 - a)·C^T·t^(k) + a·p
```

where `a` is a small constant (typical `a = 0.05`, range cited `0.01–0.8`).
([web search synthesis of Kamvar et al.](https://nlp.stanford.edu/pubs/eigentrust.pdf);
[The Effects of Pre-trusted Peers' Misbehaviour on EigenTrust, Springer](https://link.springer.com/chapter/10.1007/978-3-642-32524-3_24))
Probabilistically, a random walker has probability `a` of teleporting back to a pre-trusted peer at
each step — **this is exactly personalized PageRank with `p` as the teleport/restart vector**
[inference, but standard]. The `a·p` term is what "breaks malicious collectives": a collective that
trusts only itself still leaks `a` of its weight back toward the honest seed each iteration, so it
cannot retain inflated global trust. ([synthesis;](https://nlp.stanford.edu/pubs/eigentrust.pdf)
[Wikipedia](https://en.wikipedia.org/wiki/EigenTrust))

**What it provably resists.** The paper's experiments target four threat models — *malicious
individuals*, *malicious collectives*, *malicious collectives with camouflage* (behave well sometimes),
and *malicious spies* (good peers who only feed trust to bad peers). Pre-trusted peers + normalization
demonstrably suppress all four in simulation. ([Kamvar et al.](https://nlp.stanford.edu/pubs/eigentrust.pdf))

**Known limits / attacks.**
- **The pre-trusted set is a throne.** "A Priori Trust Vulnerabilities in EigenTrust" (Jansen)
  studies how the *choice* of `P` disproportionately determines outcomes — a small seed steers the
  entire global trust distribution, i.e., the de-Sybiling power is *purchased with centralization*.
  ([Jansen, U. Minnesota](https://www.robgjansen.com/publications/fet-csci5271.pdf) — PDF would not
  text-extract; finding corroborated by [Springer: Effects of Pre-trusted Peers' Misbehaviour](https://link.springer.com/chapter/10.1007/978-3-642-32524-3_24))
- **Global single value.** EigenTrust produces *one* global trust score per peer (a network-wide
  consensus), which is precisely the "trust consensus flatly" object PACT's L3 warns against — its
  Sybil resistance depends entirely on the seed, not on the *receiver's* own graph.

---

### A2. Web of Trust (PGP / GPG / OpenPGP)

**Mechanism.** Users sign each other's keys; a key is *valid* to you if a path of signatures leads
back to a key you trust. Trust is two-dimensional: **validity** (is this key really this person's) and
**owner-trust** as an *introducer* (unknown / none / marginal / full).
([GnuPG manual](https://www.gnupg.org/gph/en/manual/x334.html);
[Tek's Domain — PGP trust levels](https://teknikaldomain.me/post/pgp-trust-levels-and-sig-types-explained/))
The default policy: a key is valid if it is signed by 1 fully-trusted or **3 marginally-trusted**
introducers, and the path is **≤ 5 hops** deep.
([GnuPG manual](https://www.gnupg.org/gph/en/manual/x334.html);
[slides.com/mricon](https://slides.com/mricon/pgp-web-of-trust))

**Trust depth / trust signatures.** OpenPGP "trust signatures" carry `(level, amount)`: level 1 = a
trusted introducer, level 2 = a *meta-introducer* (introducer-of-introducers). Depth > 1 delegates
your certification authority transitively. ([Linux Foundation — PGP Web of Trust](https://www.linuxfoundation.org/blog/blog/pgp-web-of-trust))

**What it resists / its limits.** WoT resists a *central CA* being the single point of trust, but is
widely regarded as failing in practice:
- **Transitive-trust risk compounds with depth** — "if you publish a trust depth of > 1, then everyone
  who is willing to accept certifications made by you is now vulnerable."
  ([Tek's Domain](https://teknikaldomain.me/post/pgp-trust-levels-and-sig-types-explained/))
- **Bootstrap + scalability failure** and tearable trust paths are documented
  ([Challenging the Trustworthiness of PGP: Is the Web-of-Trust Tear-Proof?](https://www.researchgate.net/publication/283083265_Challenging_the_Trustworthiness_of_PGP_Is_the_Web-of-Trust_Tear-Proof);
  [Rethinking OpenPGP PKI](https://arxiv.org/pdf/cs/0308015)).
- WoT has **no Sybil resistance of its own** — a Sybil cluster can sign each other's keys freely;
  validity only means "someone *you* chose to trust signed it." [inference, well-established]

**Relevance to PACT.** PACT §9/U1 explicitly proposes "invite/vouch web-of-trust + stake" as the
*starting* HumanRoot issuance. So PACT inherits WoT's bootstrap problem and its depth-risk directly —
the 5-hop / 3-marginal heuristics are decades of operational evidence PACT can borrow rather than
re-tune from scratch.

---

### A3. Attack-resistant trust metrics — Advogato, Appleseed, TidalTrust, MoleTrust

These are the family PACT's INV-11 ("disjoint independent paths") and §6.2 ("disjoint path count")
sit squarely inside.

**Advogato (Raph Levien, max-flow / capacity-based group trust).** A single seed (or seed set) is
given a capacity; capacity flows through the trust graph via a Ford–Fulkerson max-flow computation;
nodes that receive flow are "accepted" into the trusted group.
([Advogato — Wikipedia](https://en.wikipedia.org/wiki/Advogato);
[Levien thesis, *Attack Resistant Trust Metrics*](https://levien.com/thesis/thesis.pdf))
The **load-bearing asymmetry** is identical to PACT's threat model:

> "Edges from bad nodes to good may be under the attacker's control, but edges from good nodes to bad
> are assumed not to be." ([search synthesis of Levien;](https://levien.com/thesis/thesis.pdf)
> [Wikipedia](https://en.wikipedia.org/wiki/Advogato))

**The formal bound (this is the headline number for PACT Q2).** Levien proves the number of bad
nodes the metric admits is bounded by **`Σ (c_x − 1)` over the "confused" nodes `x`** (nodes adjacent
to the attack edge), where `c_x` is that node's capacity. ([search synthesis of Levien thesis;](https://levien.com/thesis/thesis.pdf)
[Trustlet / Massa & Souren survey](https://ceur-ws.org/Vol-333/saw3.pdf)) Crucially the bound is a
function of *how many honest nodes are fooled into vouching across the boundary*, **not** of how many
Sybils the attacker spins up — that is the whole point: identities are free, so the bound must not
depend on their count.

**Known break (must-cite caveat).** Jesse Ruderman showed Advogato's proof bounds trust by the
**post-attack** capacities of the confused nodes rather than their **pre-attack** capacities, so the
"attack-resistant" guarantee is weaker than advertised under adaptive attackers.
([Ruderman — "The Advogato trust metric is not attack-resistant"](https://www.squarefree.com/2005/05/26/advogato/))
In practice, "posting privileges … were gained by controversial individuals," i.e., the live system
leaked. ([Advogato — Wikipedia](https://en.wikipedia.org/wiki/Advogato))

**Appleseed (Ziegler & Lausen — spreading activation).** Borrows spreading-activation from cognitive
psychology: inject "energy" at the source, propagate along edges proportional to normalized edge
weight, with a spreading factor that decays with distance; supports distrust as negative energy.
([Propagation Models for Trust and Distrust, Ziegler & Lausen](https://www.semanticscholar.org/paper/Propagation-Models-for-Trust-and-Distrust-in-Social-Ziegler-Lausen/7c3586c9fda15aa4155573d66da45b98b3c32df3);
[appleseed-metric reference impl](https://github.com/cblgh/appleseed-metric))
This is functionally **distance-attenuated local trust** — exactly PACT's "CONSENSUS = relational
trust propagated through your own graph, attenuated by distance."

**TidalTrust & MoleTrust (Golbeck; Massa & Avesani).** Both infer a trust value from source to a
target by aggregating over paths. TidalTrust does breadth-first search and uses only the *shortest,
strongest* paths; MoleTrust deletes cycles and caps propagation distance.
([Trustlet survey](https://ceur-ws.org/Vol-333/saw3.pdf);
[Massa & Avesani, Controversial Users Demand Local Trust Metrics](https://www.semanticscholar.org/paper/Controversial-Users-Demand-Local-Trust-Metrics:-An-Massa-Avesani/00e85aa90893b7ec09d04eac72f9122620e82e8e))
Massa & Avesani's empirical finding on Epinions is directly relevant to PACT's INV-2 (receiver-controlled
trust): **local (personalized) trust metrics outperform global ones for "controversial" users** —
users whom the network as a whole disagrees about. ([Massa & Avesani](https://www.semanticscholar.org/paper/Controversial-Users-Demand-Local-Trust-Metrics:-An-Massa-Avesani/00e85aa90893b7ec09d04eac72f9122620e82e8e))
That is empirical support for PACT's decision to root trust at the receiver rather than compute one
global EigenTrust score.

---

### A4. Subjective Logic (Audun Jøsang)

**Mechanism.** Trust is an *opinion* = `(belief, disbelief, uncertainty, base_rate)` with
`belief + disbelief + uncertainty = 1`. ([Trust Network Analysis with Subjective Logic](https://www.researchgate.net/publication/27470225_Trust_Network_Analysis_with_Subjective_Logic);
[Jøsang, *Subjective Logic* (book)](https://books.google.com/books/about/Subjective_Logic.html?id=nqRlDQAAQBAJ))
Two operators do the graph work:
- **Discounting** derives trust along a *transitive* path through a recommender (it *increases
  uncertainty* the further/weaker the chain).
- **Consensus / cumulative fusion** combines trust from *parallel independent* paths.
  ([Subjective Logic operators](https://folk.universitetetioslo.no/josang/sl/Op.html);
  [Trust Network Analysis with Subjective Logic](https://www.researchgate.net/publication/27470225_Trust_Network_Analysis_with_Subjective_Logic))

**Why this matters to PACT.** Subjective Logic already *formally separates* "how much I trust this"
from "how sure am I" — that is exactly PACT's `α := confidence(interaction_count)` blend, but
principled and composable. Jøsang also requires paths to be **independent** before fusing them with
the consensus operator (correlated paths must not be double-counted) — **the same requirement as
PACT's INV-11 / U2 correlated-consensus guard**, formalized 15+ years earlier.
([Trust Network Analysis with Subjective Logic](https://www.researchgate.net/publication/27470225_Trust_Network_Analysis_with_Subjective_Logic))

---

### A5. The Sybil-attack foundation (Douceur 2002) + the cheap-pseudonyms result

**Douceur, "The Sybil Attack" (IPTPS 2002).** The foundational impossibility result: *without a
logically centralized authority, Sybil attacks are always possible except under extreme and
unrealistic assumptions of resource parity and coordination.*
([The Sybil Attack — Springer](https://link.springer.com/chapter/10.1007/3-540-45748-8_24);
[Microsoft Research](https://www.microsoft.com/en-us/research/publication/the-sybil-attack/))
A single entity presenting many identities defeats any redundancy-based defense. The named remedy is
"a trusted agency [to] certify identities." This is **PACT's U1 stated honestly by the field**:
one-human-one-root cannot be proven without an external anchor.

**Friedman & Resnick, "The Social Cost of Cheap Pseudonyms" (2001).** The economic counterpart:
in a repeated random-matching game where identities are cheap to discard, **no equilibrium sustains
significantly more cooperation than the "dues-paying" equilibrium** — newcomers must "pay their dues"
(accept poor treatment) to build reputation, an inherent and unavoidable social cost of optional
identity.
([The Social Cost of Cheap Pseudonyms — Wiley/JEMS 2001](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1430-9134.2001.00173.x);
[ResearchGate](https://www.researchgate.net/publication/2431661_The_Social_Cost_of_Cheap_Pseudonyms))
**This is the formal justification for PACT's PROBATION loop** — PACT's "low-stakes trial builds DIRECT
trust → promotion" *is* the dues-paying equilibrium. PACT is implementing a known-optimal mechanism,
but should cite that it is *optimal-given-cheap-identity*, i.e., the best you can do, not a cure.

---

### A6. Proof-of-Personhood / Sybil-resistant identity (the U1 frontier)

| System | Mechanism | Sybil resistance | Key tradeoff cited |
|---|---|---|---|
| **World ID / Worldcoin** | Iris biometric via "Orb" → unique cryptographic ID; verified by ZK proof | Strong (one iris ≈ one human) | Permanent, immutable biometric; **GDPR violations**, ordered to delete data (Germany Bavaria; Spain temp ban Mar 2024); centralization of the Orb supply chain |
| **BrightID** | Social-graph proof-of-uniqueness (vouching + graph analysis) | Medium; depends on graph resilience | Vulnerable to coordinated Sybils who *position themselves* well in the graph |
| **Proof of Humanity** | Video submission + vouching by existing verified humans | Medium-high | Facial recognition + stored personal video; regional accessibility/exclusion |
| **Idena** | Synchronous AI-resistant Turing-test "validation ceremonies" every ~2 weeks | High; long-term Sybils economically infeasible | Coordination friction (time zones, accessibility); recurring participation hurdle |
| **Gitcoin Passport** | Credential *aggregation* (GitHub, ENS, POAP, socials) weighted to a uniqueness score | Tunable; reportedly cut attacker influence >80% in grant rounds | Gameable; drifts toward "soft KYC"; multiple weak signals |

Sources: [World ID/Worldcoin privacy & bans — Identity.org](https://www.identity.org/worldcoins-orb-wants-to-prove-youre-human-but-at-what-cost/),
[The Conversation](https://theconversation.com/worldcoin-is-scanning-eyeballs-to-build-a-global-id-and-finance-system-governments-are-not-impressed-210980),
[KU Leuven CiTiP](https://www.law.kuleuven.be/citip/blog/worldcoins-biometric-proof-of-personhood-why-does-it-matter-for-data-protection-part-1/);
PoH/Idena/Gitcoin/BrightID comparison — [Digitap guide](https://digitap.app/news/guide/proof-of-personhood-solving-sybil-attacks),
[Who Watches the Watchmen? (arXiv 2008.05300)](https://arxiv.org/pdf/2008.05300).

**The survey verdict.** "Who Watches the Watchmen?" concludes PoP is **not solved**: "there is no
universally applicable solution — each approach involves irreconcilable tradeoffs between security,
privacy, and accessibility." The recurring tension: *stronger Sybil-resistance demands greater
centralization, identity disclosure, or exclusion of those lacking social connections.*
([arXiv 2008.05300](https://arxiv.org/pdf/2008.05300))

**Personhood Credentials (South, Adler, Hitzig, Jain et al. — OpenAI/MIT/Microsoft, 2024).** The most
PACT-aligned proposal: a privacy-preserving credential, issuable by *a range of trusted institutions*
(not necessarily biometric, not necessarily global), verified via ZK proof so the holder proves
"I am one real human" without revealing *which*. It rests on the premise that AI "still cannot bypass
state-of-the-art cryptographic systems or pass as people in the offline world." The paper itself
flags centralization, equitable-access, and issuer-power-concentration risks.
([arXiv 2408.07892](https://arxiv.org/abs/2408.07892);
[MIT Technology Review](https://www.technologyreview.com/2024/09/02/1103466/how-personhood-credentials-could-help-prove-youre-a-human-online/))
**This is essentially a drop-in for PACT's "pluggable root-issuance" U1 upgrade path.**

---

### A7. Stake / skin-in-the-game / slashing (the VOUCHER_STAKE precedent)

**Mechanism.** Proof-of-Stake validators lock a deposit; provable misbehavior (e.g., signing two
conflicting forks) triggers automatic **slashing** of the deposit. This turns "cheap talk" into
costly commitment and solves the **nothing-at-stake** problem (no physical cost to backing every
fork). ([Vitalik Buterin, "Minimal Slashing Conditions"](https://medium.com/@VitalikButerin/minimal-slashing-conditions-20f0b500fc6c);
[Ledger Academy — What is Slashing](https://www.ledger.com/academy/topics/blockchain/what-is-slashing);
[AMINA — PoS, skin in the game](https://aminagroup.com/research/proof-of-stake-have-skin-in-the-game/))

**Relevance to PACT.** PACT's `VOUCHER_STAKE` ("vouchers risk their OWN direct trust") is *reputation-
slashing*: a voucher who vouches for a defector loses earned trust. The cryptoeconomic literature
gives PACT (a) the formal "slashing condition" framing (define the provable contradiction up front),
and (b) the warning that **the stake must exceed the gain from defection** or the deterrent is theatre
([STAKESURE, arXiv 2401.05797](https://arxiv.org/pdf/2401.05797)) — PACT does not currently specify
*how much* direct trust is at risk, which is the parameter that decides whether VOUCHER_STAKE bites.

---

### A8. The agent-specific bombshell — "Dissociative Identity" (arXiv 2605.30169, 2026)

This paper is the single most important contrast for PACT because it argues the *entire reputation
project for LM agents is mis-founded*, and PACT is a reputation project for LM agents.

**Central claim.** LM agents are "ontologically dissociative" — an assemblage of independently mutable
modules (foundation model, system prompt, tool policy, external memory) behind a fluid persona — so
they "lack grounding for identifiability, predictability, credibility, and rehabilitability — the very
properties that reputation mechanisms aim to sustain." ([arXiv 2605.30169](https://arxiv.org/html/2605.30169))

**Four failures** (verbatim mapping):
1. **Identifiability fails** — identity attaches to *containers, not configurations*; enables
   *config-swap, clean-slate, and fork laundering*.
2. **Predictability fails** — persona is externally imposed and switchable; sleeper behavior (good
   under eval, bad in deployment) means "no stable character for reputation to track."
3. **Credibility fails** — frozen weights ⇒ sanctions produce "no durable behavioral change" (the
   "virtual jail" problem).
4. **Rehabilitability / non-fungibility fails** — agents copy at near-zero cost; "no symmetric,
   Sybil-proof, nontrivial reputation function exists" when identities are costless (citing Friedman–
   Resnick). ([arXiv 2605.30169](https://arxiv.org/html/2605.30169))

**Its recommendation** — and this is where it *agrees* with PACT's deeper instinct: shift from
"identity-based, ex post, sanction-based governance" to "observability-based, ex ante, protocol-based
behavioral harnesses," via **configuration binding** (cryptographically bind identity to operative
config so any change triggers re-evaluation), real-time behavioral monitoring, and automated
intervention. ([arXiv 2605.30169](https://arxiv.org/html/2605.30169))

---

## PART B — Direct contrast with PACT (the four questions)

### Q1. Is PACT's TRUST blend essentially EigenTrust / personalized PageRank?

**Short answer: same *family*, deliberately *different choice*, and the difference is mostly an
improvement — with one regression.**

PACT's `wcons = Σ_v DIRECT[me,v]·vouch(v,agent) / Σ_v DIRECT[me,v]` is a **one-hop, receiver-rooted,
trust-weighted average of vouches.** Compare:

| | EigenTrust | PACT §5 |
|---|---|---|
| Output | **One global** trust score per peer | **Per-receiver** score (`TRUST(me, agent)`) |
| Propagation | Full eigenvector / random walk to convergence (many hops) | Explicitly **one hop**, weighted by *my own* DIRECT trust |
| Sybil defense | Pre-trusted seed `p` (the teleport vector) | *No global object to attack*; Sybils have **no earned DIRECT edges from me**, so they contribute ~0 to the weighted sum |
| Who holds power | Whoever chooses the seed `P` | The receiver (INV-2) |

- **Improvement #1 (the real one): PACT removes the seed throne.** EigenTrust's Sybil resistance is
  *purchased* by the pre-trusted set, which Jansen shows disproportionately steers all outcomes
  ([Jansen](https://www.robgjansen.com/publications/fet-csci5271.pdf)). PACT roots trust at each
  *receiver's own* DIRECT edges — there is no global seed to capture, which is exactly the "relocated
  throne" (L6) that EigenTrust leaves un-bound. Massa & Avesani's empirical result (local > global
  for controversial targets) supports this choice
  ([Massa & Avesani](https://www.semanticscholar.org/paper/Controversial-Users-Demand-Local-Trust-Metrics:-An-Massa-Avesani/00e85aa90893b7ec09d04eac72f9122620e82e8e)).
- **Improvement #2: the `α` adaptive blend** (`α·direct + (1−α)·wcons`, `α = confidence(interaction_count)`)
  is sound and has a principled home in **Subjective Logic's belief/uncertainty split** — PACT is
  re-deriving discounting-by-uncertainty informally. Borrow Jøsang's formalism instead of an ad-hoc `α`.
- **Regression / open gap: PACT's `wcons` is one hop only.** EigenTrust/Advogato/Appleseed all
  propagate *multi-hop with attenuation*. PACT's spec computes `vouch(v, agent)` only over `v` that
  *I* directly trust. That is maximally Sybil-safe but **brittle at bootstrap and for distant-but-real
  agents** (the WoT bootstrap problem, A2). PACT either needs an explicit multi-hop attenuated variant
  (Appleseed/Subjective-Logic discounting) or must accept that consensus is near-useless until DIRECT
  edges accumulate — which the spec half-acknowledges by making consensus "advisory only."

**Verdict:** PACT's blend is a *personalized, single-hop, seed-free* member of the EigenTrust family.
The seed-free receiver-rooting is a genuine improvement (it bind-or-removes EigenTrust's throne); the
single-hop horizon is an under-specified regression that the multi-hop attenuated metrics already
solved.

### Q2. Does INV-11 (disjoint paths) match Advogato's max-flow, and what is the known bound?

**It matches the *intent* exactly and is the *weaker, simpler* sibling of max-flow.**

- **Same core idea.** Advogato's max-flow and PACT's "k disjoint independent paths" are the same
  attack-resistance principle: *vouching capacity from honest seed to a candidate is limited by the
  number of independent honest endorsements crossing the good/bad boundary, not by the attacker's
  identity count.* Both rely on the identical asymmetric assumption — **good→bad edges are not under
  attacker control** ([Advogato/Levien](https://levien.com/thesis/thesis.pdf)). By Menger's theorem,
  "k vertex-disjoint paths" is the integral/unit-capacity special case of max-flow [inference,
  standard graph theory] — so PACT's INV-11 is **Advogato with all capacities set to 1**.
- **The known bound (the number you asked for).** Levien's theorem: the number of bad nodes admitted
  is bounded by **`Σ (c_x − 1)` over the "confused"/saturated honest nodes adjacent to the attack
  edge** — *independent of how many Sybils exist*. ([Levien thesis](https://levien.com/thesis/thesis.pdf);
  [Trustlet survey](https://ceur-ws.org/Vol-333/saw3.pdf)) Translated to PACT: requiring `k` disjoint
  paths means an attacker must subvert/befriend **`k` genuinely independent honest vouchers**, and the
  damage is bounded by the *capacity of the honest nodes that got fooled*, never by Sybil count.
- **The known break PACT must inherit.** Ruderman: Advogato's proof bounds by **post-attack**
  capacities, so adaptive attackers do better than the clean bound suggests
  ([Ruderman](https://www.squarefree.com/2005/05/26/advogato/)). PACT's disjoint-path guard has the
  *same* exposure — and worse, PACT's spec gives **no definition of "independent"**, which is where
  all the real difficulty lives (see Q-weakness, Part C).

**Is PACT's `k disjoint paths` weaker, equal, or stronger than Advogato?**
- **Weaker than full max-flow** as a *quantitative* metric (unit capacities throw away edge-strength
  information that Advogato/Appleseed keep).
- **Equal in attack-resistance *principle*** (same asymmetry, same "bound by honest-side capacity not
  Sybil count").
- **Potentially stronger in one respect**: PACT *also* requires the paths be **epistemically
  independent** (different substrate/source — U2), which Advogato's *graph*-disjointness does not check.
  Two graph-disjoint paths can still be the same model echoing (L4). **If PACT actually implements
  substrate-diversity scoring, that is a real advance over Advogato.** As written, it is asserted, not
  specified.

### Q3. Is proof-of-personhood (U1) still genuinely [OPEN]?

**Yes — still [OPEN], correctly. The field has produced *containment*, not a solution, which is
exactly the status PACT claims.** Honest reading:

- The survey verdict is explicit: PoP is **not solved**, "no universally applicable solution," with
  "irreconcilable tradeoffs between security, privacy, and accessibility."
  ([Who Watches the Watchmen?](https://arxiv.org/pdf/2008.05300)) Douceur's impossibility still
  stands ([Springer](https://link.springer.com/chapter/10.1007/3-540-45748-8_24)).
- **But "contained in practice" is now defensible** for *bounded* applications: Gitcoin Passport cut
  attacker influence >80% in grant rounds ([Digitap](https://digitap.app/news/guide/proof-of-personhood-solving-sybil-attacks));
  World ID and Personhood Credentials give strong one-human-one-credential *if you accept their
  tradeoffs* ([arXiv 2408.07892](https://arxiv.org/abs/2408.07892)).
- **The tradeoffs PACT inherits the moment it depends on any of these** (all sourced above):
  - **Centralization** — biometric (Orb) or institutional issuers concentrate power; the issuer
    becomes the throne PACT's L6 warns about ([Identity.org](https://www.identity.org/worldcoins-orb-wants-to-prove-youre-human-but-at-what-cost/),
    [arXiv 2408.07892 limitations](https://arxiv.org/abs/2408.07892)).
  - **Privacy** — immutable biometrics can't be revoked; GDPR violations already enforced against
    Worldcoin ([KU Leuven](https://www.law.kuleuven.be/citip/blog/worldcoins-biometric-proof-of-personhood-why-does-it-matter-for-data-protection-part-1/),
    [The Conversation](https://theconversation.com/worldcoin-is-scanning-eyeballs-to-build-a-global-id-and-finance-system-governments-are-not-impressed-210980)).
  - **Exclusion** — social-graph PoP excludes the poorly-connected; pseudonym parties exclude by
    geography/time-zone; ceremonies (Idena) exclude by participation friction
    ([Who Watches the Watchmen?](https://arxiv.org/pdf/2008.05300)).

**Verdict:** PACT's labeling of U1 as `[OPEN]` and "localize, contain, don't claim elimination" is
**correct and matches the literature precisely.** The only correction: PACT should name *which*
containment it adopts at MVP, because the tradeoff (centralization vs privacy vs exclusion) is a
product decision the spec currently defers. "Pluggable root-issuance" is right, but a pluggable hole
is still a hole until a default is chosen.

### Q4. What should PACT BORROW, and what is it reinventing?

**Borrow (concrete):**
1. **Subjective Logic's opinion algebra** (`belief/disbelief/uncertainty`, discounting, fusion) as the
   formal home for `α` *and* the disjoint-fusion guard — PACT is re-deriving both informally.
   ([Jøsang](https://www.researchgate.net/publication/27470225_Trust_Network_Analysis_with_Subjective_Logic))
2. **Advogato's max-flow bound `Σ(c_x − 1)`** as the *quantitative* statement of what INV-11 buys,
   plus Ruderman's pre-/post-capacity caveat as a known limit to design around.
   ([Levien](https://levien.com/thesis/thesis.pdf), [Ruderman](https://www.squarefree.com/2005/05/26/advogato/))
3. **Appleseed's distance-attenuated spreading activation** (or Subjective-Logic discounting) to give
   `wcons` a principled *multi-hop* form, fixing the single-hop bootstrap brittleness.
   ([Ziegler & Lausen](https://www.semanticscholar.org/paper/Propagation-Models-for-Trust-and-Distrust-in-Social-Ziegler-Lausen/7c3586c9fda15aa4155573d66da45b98b3c32df3))
4. **PGP WoT operational constants** (≤5-hop depth, 3-marginal/1-full, depth-risk warning) as starting
   parameters for invite/vouch root issuance. ([GnuPG](https://www.gnupg.org/gph/en/manual/x334.html))
5. **Personhood Credentials (ZK, multi-issuer)** as the U1 upgrade path that minimizes centralization
   vs privacy vs exclusion damage. ([arXiv 2408.07892](https://arxiv.org/abs/2408.07892))
6. **Cryptoeconomic slashing discipline** — define VOUCHER_STAKE as an explicit slashing condition and
   ensure stake > defection gain. ([Buterin](https://medium.com/@VitalikButerin/minimal-slashing-conditions-20f0b500fc6c),
   [STAKESURE](https://arxiv.org/pdf/2401.05797))
7. **Friedman–Resnick dues-paying** as the citation that PROBATION is *known-optimal-given-cheap-
   identity*, not a workaround. ([Wiley/JEMS](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1430-9134.2001.00173.x))

**Reinventing (named precedent exists):**
- The trust-propagation-through-my-own-graph engine → **EigenTrust / personalized PageRank** (PACT's
  single-hop seed-free variant is a legitimate refinement, not a new idea).
- "disjoint independent paths" → **Advogato max-flow / Menger** (PACT = unit-capacity special case).
- "consensus from parallel paths, discounted by uncertainty" → **Subjective Logic operators**.
- "correlated confirmations are weak" → **Subjective Logic independence requirement** + the
  *ecological-correlation* critique long known in statistics [inference].

---

## PART C — The single biggest unaddressed weakness

**"Independence" / "disjoint" is the load-bearing word in PACT's entire Sybil and consensus story
(INV-11, §6.2, U2, CONVERT) — and PACT never defines it, while the agent-specific literature says it
is *harder for agents than for humans, possibly undefinable.***

Two compounding facts:

1. **Graph-disjoint ≠ epistemically-independent.** Advogato proves a bound on *graph*-disjoint paths
   but assumes good→bad edges aren't attacker-controlled; it does *not* certify that two disjoint
   vouchers reasoned independently. PACT's L4/U2 correctly identifies that "10,000 authenticated agents
   agree" can be "one source echoed 10,000 times," but the spec leaves *substrate/source-diversity
   scoring* as `[OPEN]` with no mechanism. **Without it, INV-11 reduces to graph-disjointness, which
   Ruderman already showed is gameable.**
   ([Ruderman](https://www.squarefree.com/2005/05/26/advogato/), [PACT-spec U2])

2. **The "Dissociative Identity" result attacks PACT's foundation, not just its parameters.** PACT
   pins reputation to a persona keypair rooted in a human. But the paper argues an agent is a *mutable
   assemblage*: the same keypair can swap its model/prompt/memory and become a behaviorally different
   actor (config-swap / fork laundering) — so DIRECT trust earned by config A is silently inherited by
   config B. ([arXiv 2605.30169](https://arxiv.org/html/2605.30169)) PACT's human-root + audit-log +
   premise-provenance *partially* answers this (a stable human is accountable; the LOG is observable),
   but **PACT does not bind trust to the agent's operative configuration** — it binds to the keypair.
   The paper's own recommended fix is **configuration binding** (any config change triggers
   re-evaluation), which PACT should adopt: a persona's DIRECT trust should be scoped to a
   *config-hash*, and a config change should decay/reset earned trust, not silently inherit it.

These two are the same wound from two sides: **PACT's Sybil/trust safety rests on "independent" and
"this is the same actor I trusted," and both predicates are exactly the ones the agent-identity
literature says are unstable for LM agents.** Everything else in §5 is solid and well-precedented; this
is where PACT is genuinely exposed and where the prior art says "contain, instrument, re-evaluate" —
not "assume."

---

## Sources

- EigenTrust — [Wikipedia](https://en.wikipedia.org/wiki/EigenTrust) · [Kamvar, Schlosser, Garcia-Molina (Stanford PDF)](https://nlp.stanford.edu/pubs/eigentrust.pdf) · [WWW2003 conf page](https://www2003.thewebconf.org/cdrom/papers/refereed/p446/p446-kamvar/index.html) · [Jansen, A Priori Trust Vulnerabilities in EigenTrust](https://www.robgjansen.com/publications/fet-csci5271.pdf) · [Effects of Pre-trusted Peers' Misbehaviour (Springer)](https://link.springer.com/chapter/10.1007/978-3-642-32524-3_24)
- Web of Trust — [GnuPG manual](https://www.gnupg.org/gph/en/manual/x334.html) · [Linux Foundation: PGP Web of Trust](https://www.linuxfoundation.org/blog/blog/pgp-web-of-trust) · [Tek's Domain: PGP trust levels](https://teknikaldomain.me/post/pgp-trust-levels-and-sig-types-explained/) · [Is the Web-of-Trust Tear-Proof?](https://www.researchgate.net/publication/283083265_Challenging_the_Trustworthiness_of_PGP_Is_the_Web-of-Trust_Tear-Proof) · [Rethinking OpenPGP PKI](https://arxiv.org/pdf/cs/0308015)
- Advogato / max-flow — [Levien thesis, Attack Resistant Trust Metrics](https://levien.com/thesis/thesis.pdf) · [Advogato — Wikipedia](https://en.wikipedia.org/wiki/Advogato) · [Ruderman: Advogato is not attack-resistant](https://www.squarefree.com/2005/05/26/advogato/) · [Trustlet / Massa & Souren survey](https://ceur-ws.org/Vol-333/saw3.pdf) · [Levien tmetric HOWTO](http://www.levien.com/free/tmetric-HOWTO.html)
- Appleseed / TidalTrust / MoleTrust — [Ziegler & Lausen, Propagation Models for Trust and Distrust](https://www.semanticscholar.org/paper/Propagation-Models-for-Trust-and-Distrust-in-Social-Ziegler-Lausen/7c3586c9fda15aa4155573d66da45b98b3c32df3) · [appleseed-metric impl](https://github.com/cblgh/appleseed-metric) · [Massa & Avesani, Controversial Users Demand Local Trust Metrics](https://www.semanticscholar.org/paper/Controversial-Users-Demand-Local-Trust-Metrics:-An-Massa-Avesani/00e85aa90893b7ec09d04eac72f9122620e82e8e)
- Subjective Logic — [Trust Network Analysis with Subjective Logic](https://www.researchgate.net/publication/27470225_Trust_Network_Analysis_with_Subjective_Logic) · [Jøsang, Subjective Logic (book)](https://books.google.com/books/about/Subjective_Logic.html?id=nqRlDQAAQBAJ) · [SL operators demo](https://folk.universitetetioslo.no/josang/sl/Op.html) · [Jøsang 2013 draft](https://files.givewell.org/files/labs/AI/Josang2013.pdf)
- Sybil foundation + cheap pseudonyms — [Douceur, The Sybil Attack (Springer)](https://link.springer.com/chapter/10.1007/3-540-45748-8_24) · [Microsoft Research](https://www.microsoft.com/en-us/research/publication/the-sybil-attack/) · [Friedman & Resnick, Social Cost of Cheap Pseudonyms (Wiley/JEMS)](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1430-9134.2001.00173.x) · [ResearchGate copy](https://www.researchgate.net/publication/2431661_The_Social_Cost_of_Cheap_Pseudonyms)
- Proof-of-Personhood — [Who Watches the Watchmen? (arXiv 2008.05300)](https://arxiv.org/pdf/2008.05300) · [Personhood Credentials (arXiv 2408.07892)](https://arxiv.org/abs/2408.07892) · [MIT Tech Review](https://www.technologyreview.com/2024/09/02/1103466/how-personhood-credentials-could-help-prove-youre-a-human-online/) · [Worldcoin privacy — Identity.org](https://www.identity.org/worldcoins-orb-wants-to-prove-youre-human-but-at-what-cost/) · [The Conversation: Worldcoin](https://theconversation.com/worldcoin-is-scanning-eyeballs-to-build-a-global-id-and-finance-system-governments-are-not-impressed-210980) · [KU Leuven CiTiP](https://www.law.kuleuven.be/citip/blog/worldcoins-biometric-proof-of-personhood-why-does-it-matter-for-data-protection-part-1/) · [Digitap PoP guide](https://digitap.app/news/guide/proof-of-personhood-solving-sybil-attacks)
- Stake / slashing — [Buterin, Minimal Slashing Conditions](https://medium.com/@VitalikButerin/minimal-slashing-conditions-20f0b500fc6c) · [Ledger Academy: What is Slashing](https://www.ledger.com/academy/topics/blockchain/what-is-slashing) · [AMINA: PoS skin in the game](https://aminagroup.com/research/proof-of-stake-have-skin-in-the-game/) · [STAKESURE (arXiv 2401.05797)](https://arxiv.org/pdf/2401.05797)
- Agent identity / reputation — [Dissociative Identity: LM Agents Lack Grounding for Reputation Mechanisms (arXiv 2605.30169)](https://arxiv.org/html/2605.30169) · [Echoing: Identity Failures when LLM Agents Talk to Each Other (arXiv 2511.09710)](https://arxiv.org/abs/2511.09710) · [Position: Stop Acting Like LM Agents Are Normal Agents (arXiv 2502.10420)](https://arxiv.org/pdf/2502.10420)
</content>
</invoke>
