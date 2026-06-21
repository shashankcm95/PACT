# PACT — Design Intent & Landmines
### Companion to PACT-spec.md · the *why* behind the *what*

> **Purpose.** PACT-spec says *what to build*. This says *why each choice is
> load-bearing* and *what keeps going wrong*. Read this before changing the spec.
> Most "improvements" to a system like this are actually re-introductions of a
> landmine the design already paid to avoid. If you're about to simplify away a
> guard, check it against this document first.
>
> **The deepest single lesson.** Across the whole design, *power is conserved*.
> Every time you remove a decider, the deciding power doesn't vanish — it
> **relocates** to whoever controls the next layer up (who sets the inputs, who
> defines the rule, who draws the boundary, who teaches the rules). Almost every
> landmine below is this same throne reappearing in a new disguise. Learn to see
> the relocation and most of the design becomes obvious.

---

## PART 1 — CORE INTENT (preserve these or you've built something else)

### I1. Divide the labor of knowing
The machine bears the **mechanical** burden — things it can be *certain* about:
transport integrity, derivation validity (does claim A follow from premise P),
falsification propagation, scope intersection. The human bears the **truth**
burden — premises about the world — because *only a human can be accountable for
an empirical claim.* Never let the machine assert truth; never let the human's
unverified claim acquire mechanical certainty. The split is the whole design.

### I2. Separate the volatile signal from the durable signal
**Trust** is volatile, advisory, fast-reacting, decaying — it is *supposed* to be
jumpy. **Grounding** (the premise→artifact→validation chain) is durable, auditable,
stable. They need *separate homes*. The recurring bug is conflating them — making
trust try to be both the fast alarm and the stable foundation (it can't be both),
or letting a validated chain move when a trust score moves (it shouldn't). Keep
them apart: trust is the lens, grounding is the ledger.

### I3. Artifacts are conditional, not true
An artifact/claim asserts "valid **given** premise P (within scope S)," never "true."
This converts the *undecidable* question ("is it true") into the *decidable* one
("does it correctly follow from its stated premise"), and **quarantines** the
truth-question to a small, explicit, contestable set of root premises instead of
smearing it (disguised) across every artifact. The win is: undecidable uncertainty
becomes *small and visible* rather than *pervasive and hidden*.

### I4. Falsifiability is structural
Premises are *not-yet-falsified*, never *proven*. Conditional validity propagates
*up* the chain; falsification propagates *down* (kill a root, dependents collapse —
mechanically, via the dependency DAG, no re-derivation). Everything is **defeasible**:
a fully-validated chain can still be overturned if a root falls. This is not a
weakness — it is the honest condition of all empirical knowledge, faithfully
represented. A system that claims more (certainty, permanence) has become a hive.

### I5. Premises carry scope (domain of validity)
"Gravity is constant" is false globally, true within "near-Earth, non-relativistic."
Scope is *part of the premise.* Out-of-scope counterexamples don't falsify;
in-scope ones do. A claim is valid only within the *intersection* of its ancestral
scopes, and applying it outside that domain is **blocked**. Scope boundaries are
**gradients**, not walls — confidence falls off near the edge.

### I6. Confidence must never outrun evidence
A claim's *claimed grounding* may never exceed its *root's actual (disjoint)
verification.* Weakly-verified premises propagate *short* and get flagged
provisional; strongly-verified ones propagate *far*. This kills the cardinal
failure: the long, formally-perfect chain on a weak root that *looks* authoritative
because every link checks. Reach is the consequence, and **reach is gated by
verification, never engagement** (see L1).

### I7. Trust must be earned and receiver-controlled
No sender, and no "consensus," dictates how much it is believed. The *receiver*
weights. Direct (first-person, earned) trust outweighs consensus (third-party,
advisory). Consensus *raises a hypothesis*; it cannot *act* until it earns
conversion through loops that demand the unforgeable (see L2, L3).

### I8. Keep the irreducible problems visible, not hidden
The `[OPEN]` set (human-root uniqueness, correlated consensus, scope-boundary error,
patient sleeper) is *contained, not eliminated.* The system's integrity comes from
**never claiming more certainty than its weakest disjoint-verified root earns** —
and from marking the open problems loudly rather than papering over them. Honesty
about what isn't solved is a feature, not a disclaimer.

---

## PART 2 — THE LANDMINES (recurring failure modes; each one bit us in the conversation)

### L1. Gating reach by engagement instead of verification ⚠️ HIGHEST RISK
**The trap:** reach-radius looks like social-media reach (more views → more reach),
so it's tempting to let attention/virality drive propagation. **Why it's fatal:**
that is *exactly* the misinformation engine — engagement rewards what *provokes*,
not what's *true*. Same mechanism, opposite outcome. **The rule:** reach ∝ disjoint
*verification* strength, NEVER engagement. This single choice is the entire
difference between "truth propagates / noise stays local" and the outrage machine.

### L2. Letting a guard be satisfied by the *cheap* thing instead of the *unforgeable* thing
**The trap:** a verification/conversion loop that can be passed by "more vouches,"
"more identities," or "more consensus." **Why it's fatal:** identities and vouches
are *free*, so any loop satisfiable by quantity-of-consensus is Sybil-satisfiable —
consensus verifying itself, circular. **The rule:** every loop must demand the
*unforgeable* — earned relational trust, **disjoint independent paths**, voucher
stake, auditable behavioral demonstration. Never the cheap. If you can pass it by
spinning up more agents, it's not a guard.

### L3. Trusting "consensus" flatly (the Sybil hole)
**The trap:** treating the network's aggregate opinion as a real signal. **Why it's
fatal:** a million colluding identities manufacture consensus for free. **The rule:**
consensus is only ever *relational trust propagated through your own graph,
attenuated by distance* — so Sybils (no earned edges) contribute ~0 to the
*weighted* score even while inflating the *raw* count. Anchor on the score they
can't fake (direct), use consensus only as a discounted prior weighted through
agents *you* already trust.

### L4. Mistaking cryptographic authenticity for epistemic independence ⚠️ SUBTLE
**The trap:** "10,000 authenticated agents agree" feels like overwhelming
verification. **Why it's fatal:** if those agents share a substrate (same model
family, same source), their agreement is *one source echoed 10,000 times* — and
the signatures make it *look* independent. Certified false consensus is *more*
dangerous than uncertified, because the crypto disarms skepticism. **The rule:**
authentication proves agents are *real*, never *independent*. Require **disjoint
paths** and score *substrate/source diversity*; flag low-independence verification
as WEAK regardless of count. (Same trap appears for humans: two people agreeing
isn't confirmation if both got it from the same place.)

### L5. Conflating "untampered" with "true"
**The trap:** a verified signature feels like a guarantee of correctness. **Why it's
fatal:** the signature proves *who sent it* and *that it's unaltered* — it says
*nothing* about whether the content is true. A perfectly authenticated message can
be a perfectly authenticated lie. **The rule:** P1 (transport integrity) and P2
(content honesty) are *never* conflated. Solve P1 with crypto; *contain* P2 with
trust + grounding. Keep them in separate layers and never let one masquerade as the
other.

### L6. The relocated throne — failing to see where power went after you removed a decider
**The trap:** "we removed the central authority" / "the people decide" / "the AI just
assists." **Why it's fatal:** power is conserved. Remove the executor → power goes to
whoever sets the *agenda*. Remove the agenda-setter → to whoever defines the
*verification rule*. Make decisions "emerge" → to whoever shapes the *inputs*
(will-formation). Scope participation to "the affected" → to whoever draws the
*boundary*. Make the system self-teaching → to whoever controls *how you understand
it*. **The rule:** every time you strip a decider, *name where the deciding power
relocated* and bind it (auditable, plural, contestable, rotating). An unbound
relocated throne is more dangerous than the one you removed, because it's *less
visible* and wears a more legitimate costume.

### L7. The costume of legitimacy — control disguised as the thing that protects against control
**The trap:** the most dangerous power always wears the most reassuring label.
"This emerged from all of us" (so your dissent is illegitimate). "We amplify the
true voices" (someone defines 'true'). "We suppress manipulators" (someone defines
'manipulation'). "We're just teaching you how the system works" (controlling
understanding = controlling choice). "We redistribute power away from the
over-mighty" (perfect cover for seizing it). **Why it's fatal:** each *sounds* like
a safeguard while *being* the capture. **The rule:** be most suspicious of the
component that claims to be fighting the very thing it's positioned to do. The
anti-concentration mechanism must itself be anti-concentrated; the educator must
teach you to distrust it; "informed consent" must not become choice-shaping.

### L8. Punishing the wrong thing (error treated as malice; change treated as gaming)
**The trap:** a system that can't tell honest error from malice, or honest
mind-change from strategic gaming, punishes both identically. **Why it's fatal:** it
drives *concealment* — if disclosing a mistake or changing your mind is punished,
people hide both, killing the error-correction the system runs on. It also selects
for rigidity (the worst trait for a learning system). **The rule:** default
disposition toward a deviation is **repair, not penalty**; penalty is reserved for
the *malice pattern over time* (correlates with self-interest, concealed, recurs
after correction), never the isolated act. Voluntary disclosure must be
*trust-positive*. Errors decay; only the pattern persists. **Cost the gaming, never
the changing** — anchor conviction to real stakes so contradicting your own stakes
is expensive, while updating on evidence stays free.

### L9. Stability as a virtue / requirement
**The trap:** "agents/people should prove their beliefs are stable to be trusted."
**Why it's fatal:** stability and rigidity are indistinguishable; the honest
evidence-updater and the gamer both look "volatile," so a stability gate punishes
the updater (the ideal behavior) and selects for the rigid — building a network that
*cannot learn* (engineered monoculture). **The rule:** never gate on stability.
Measure *what drives change* (evidence = healthy and free; convenience = gaming and
costly), not the *rate* of change. The goal was never stable beliefs (that's a hive)
— it's *honest* beliefs, held as firmly as evidence warrants and revised as readily
as new evidence demands.

### L10. The self-certifying loop (a system that teaches you to trust it)
**The trap:** making the system self-documenting/self-diagnostic so it explains its
own rules and verifies its own health. **Why it's fatal:** a system that teaches you
how to understand it can teach you to understand it *favorably*; "reducing
complexity for you" and "controlling what you understand" are the same act. It closes
the last escape hatch. **The rule:** the system must teach you to *distrust* it
(document its own failure modes, make you a better critic over time, not a more
comfortable trustor); there must be a **reference outside the system** (rules
checkable *without* the system as intermediary); and **fail-safe defaults** must
protect you regardless of how well or honestly you were taught. A self-documenting
system is good only if its first lesson is how to catch it lying.

### L11. Capping nominal identities instead of effective presence
**The trap:** "limit personas per human" — but let the user build arbitrary
abstraction beneath their root. **Why it's fatal:** abstraction freedom becomes a
*cap-evasion* vector — nested sub-personas/delegated identities exceed the visible
cap and pollute the network. **The rule:** the cap binds **effective network-facing
presence**, not nominal personas. The user authors the abstraction *structure*
(sovereignty) but can never *expand* the identity-budget. Sovereignty over
arrangement, not over quantity.

### L12. Drawing scope too wide (silent over-extension)
**The trap:** a premise's declared domain of validity is broader than where it
actually holds. **Why it's fatal:** the chain *claims* validity in a regime where
the premise breaks, and falsification-propagation won't catch it unless someone
tests *near the mis-drawn edge* — which is exactly where testing is sparsest. **The
rule:** scopes are themselves falsifiable claims (you can test and falsify a
mis-drawn boundary by finding the premise breaking *inside* its claimed domain),
graded at the edges (confidence falls off), and drawn at the *true* domain — neither
conveniently wide (over-claims) nor defensively narrow (hides the informative break).

---

## PART 3 — THE META-PRINCIPLES (the philosophy that makes the choices non-arbitrary)

### M1. Containment, not elimination
Several core problems (human-root uniqueness, correlated consensus, the patient
sleeper, sophisticated manipulation) are **structurally unsolvable** — not unsolved.
The reason manipulation can't be eliminated: the manipulator's power *is* reasoning
power, so the adversary scales with your defense; you can *narrow* the gap forever
but never close it. The achievable win is *containing it better than the status quo*
— and that delta is vast (the difference between systems that function and ones that
collapse). **Do not mistake the irreducible residue for a design failure. It's the
integrity of refusing the only thing that would "solve" it — a judge of truth, which
is the throne, which is the hive.**

### M2. The price of freedom is a permanent, contained problem
The only way to *eliminate* (not contain) manipulation/bad-faith is to appoint
someone with the power to declare what's true / who's manipulating — and that power
is more dangerous than the problem. So a free system carries a *permanent, managed*
version of the problem *because* it's free. The residue isn't the design falling
short; it's the design correctly declining the tyrannical shortcut. **The space
between "contained" and "eliminated" is exactly where freedom lives.**

### M3. No chaos-free path to legitimate order
Order *installed* top-down is the hive; order that's *legitimate* had to **emerge**
from disorder, because the disorder *is* the system finding its order rather than
being handed one. Every clean, frictionless variant collapses to a hive. The system's
job is not to *produce* order but to be a **chaos-metabolizer** — to let participants
process disagreement faster and more humanely than raw chaos would, so order can
emerge without turning catastrophic. *Productive, metabolized disagreement is the
steady state of a free system, not a phase it passes through.*

### M4. Preserve disagreement; never resolve it into one voice
A "collective voice" is not a unified will to be surfaced — it's the *distribution of
genuine disagreement.* The disagreement IS the signal, not noise obscuring it. Any
mechanism that *produces* consensus where none existed has *manufactured* it
(overridden someone). The goal is never agreement (agreement was always the failure
mode) — it's keeping participants in *better contact with reality and each other*,
which means *more* preserved independent vantages, more cracks for correction, not
fewer. **One clean answer — even a true one — is steering; a map of the real
disagreement is tethering.**

### M5. Don't decide reality for people — show it to them
The deepest distinction in the whole design: a system that **resolves** reality for
you (hands you the answer) is a hive; one that **shows** reality to you (the
auditable map, you retain the judgment) is the thing worth building. Every component
should *surface evidence the receiver weighs*, never *pronounce a verdict the
receiver adopts.* The receiver/human stays the final author.

### M6. Verification is what lets trust be safely extended
Trust and verification are not opposites. Verification *enables* trust by making
betrayal *catchable* — every catchable-but-not-taken defection is a deposit in the
trust account. The goal is not blind trust (credulous) nor pure verification
(can't scale) but **trust-while-watching**: extend trust because the breaches get
caught, so the cooperative tendency can operate at scale. Trust that has to ignore
breaches is fragile; trust that *catches* them is the only kind that holds.

---

## PART 4 — QUICK-REFERENCE: "AM I ABOUT TO STEP ON A LANDMINE?"

Before changing the design, ask:

```
□ Does this gate reach/influence by ENGAGEMENT instead of VERIFICATION?         → L1, stop
□ Can this guard be satisfied by MORE IDENTITIES / MORE VOUCHES (the cheap thing)? → L2/L3, stop
□ Am I treating AUTHENTICATED as INDEPENDENT (or as TRUE)?                       → L4/L5, stop
□ Did I remove a decider without naming where the power RELOCATED?              → L6, bind it
□ Does this component claim to fight the very thing it's positioned to do?       → L7, suspect it
□ Does this punish ERROR like malice, or CHANGE like gaming?                     → L8, default to repair
□ Am I gating on STABILITY / rewarding rigidity?                                → L9, measure the driver not the rate
□ Does the system teach you to TRUST it rather than to CHECK it?                → L10, add external reference + distrust curriculum
□ Does this cap NOMINAL identity but leave abstraction to evade it?             → L11, cap effective presence
□ Is a premise's SCOPE wider than where it actually holds?                      → L12, make scope falsifiable + graded
□ Am I claiming a problem is SOLVED when it's only CONTAINED?                   → M1/M2, mark it [OPEN]
□ Does this RESOLVE reality for the user instead of SHOWING it?                 → M5, surface evidence, don't pronounce
```

If any box is checked, you are probably re-introducing a landmine the design already
paid to avoid. The fix is almost always: **make it disjoint, make it auditable, make
it contestable, keep the human accountable, and never let confidence (or identity, or
authenticity) propagate further than genuine independent evidence supports.**

---

*Companion to PACT-spec.md. The spec tells you what to build; this tells you what not
to optimize away. The single thread through all of it: the machine bears mechanical
certainty, the human bears the truth-burden, and everything between is gated by
disjoint, auditable, human-accountable verification — because the moment confidence,
identity, or authenticity is allowed to outrun the genuine independent evidence
beneath it, the system stops being a tool for knowing and becomes a very convincing
way to be wrong, or a very legitimate-looking throne.*
