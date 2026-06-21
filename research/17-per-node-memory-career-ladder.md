---
lifecycle: persistent
phase: proto-planning — design-direction synthesis
created: 2026-06-21
status: recommendation (adversarially verified, live-substrate probed)
---

# Per-node first-person memory + novice onboarding + career-ladder-not-rank — verdict

> 4-agent adversarially-verified workflow (`wavwixyft`). **Verdict: ADOPT_WITH_AMENDMENTS;
> reflects_intent: yes_with_corrections.** The per-node first-person model is the *correct*
> architecture — INV-2 made explicit + relational, prior-art-backed, a genuine escape from
> EigenTrust's global-rank + pre-trusted-seed throne. But it is **necessary-not-sufficient** and
> currently **named-not-mechanized**, and the live substrate is *already* the rank failure mode.

## The architecture is right (and well-trodden, not novel-risky)
Prior art backs every piece: **Massa-Avesani** prove *local* trust metrics **outperform** global
ones for contested targets (there is no single correct rank when receivers genuinely disagree —
validates INV-2 + M4); **Self-Other-Modeling / BDI / Theory-of-Mind nets** are the established form
of a node building a first-person model of peers from its own experience; **Glicko/TrueSkill** are
the decaying, *uncertainty-bearing* relative estimate that is the exact difference between a "current
belief" and a "fixed rank" (the uncertainty term *is* the novice/cold-start signal); and the
**gamification/Goodhart** literature names the landmine precisely — *the instant the ladder is a
published comparable status, agents optimize the ladder, not the work.*

## The five properties are the right line — but NOT sufficient. Three amendments:
The "career-ladder-not-rank" line holds **iff** all five — (1) first-person+relational [no global
number], (2) decaying+re-earned, (3) driver-not-tenure [L9], (4) lowers-own-scrutiny-never-raises-
others-deference [the note-16 inversion], (5) trust-lens-not-grounding-ledger [I2] — PLUS:
- **(A) The driver axis is BEHAVIORAL (caught-vs-uncaught), not TRUTH** (L5: a perfect liar earns a
  flawless history). Without this, the ladder re-imports the undecidable truth-question = a truth-throne.
- **(B) NEVER-COUNTS-NODES** (the note-14 theorem + L4). The model *verifies self-certifying records*
  (O-local re-check); it must never tally "how many peers confirm." The instant it counts, it leaves
  the Sybil-immune class and re-enters the quorum regime that presupposes U1 — and a correlated/Sybil
  flood farms the ladder. *(This is the live `rollupCounts` 5× inflation bug.)*
- **Sharpening of (4): DEFEASIBLE-FORWARD** — lowered scrutiny snaps back the instant adverse evidence
  lands (U4 sleeper / L8 repair). Else an earned ladder becomes *a sleeper's license*.

With A + B + defeasible folded in, it's a ladder; without them it drifts to a truth-throne, a
Sybil-farmable tier, or a sleeper's throne.

## Your private-model refinement — CONFIRMED as the structural anti-rank guard
Your instinct from the prior turn (bind the model private-to-owner; don't disclose to the network) is
exactly what makes property (1) enforceable: **the rank-in-disguise drift (gossip internal scores →
emergent global "level") is *prevented* only by "never publish one sortable list + receiver-local."**
And it does **not** tamper with transparency — *evidence auditable (the §7 log), verdict private (the
§5 lens)*; the algorithm stays public (L10), only each node's *instance* is private. The one caveat
holds: keep the *model* private but allow **voluntary, scoped, signed, receiver-weighted vouches**
drawn from it (a vouch is itself a first-person conditional-validity claim) — else consensus
propagation dies (trust islands). Private model + selective vouches = no rank + propagation survives.

## The killer finding: the live substrate IS the rank failure mode today
The hacker probed the real code, and the gap between the corrected design and today's implementation
*is the deliverable*:
- **`trust-scoring.js` `tierOf` already emits a single GLOBAL, comparable, sortable tier**
  ("high/medium/low-trust") from raw passRate — *that is the leaderboard rank the proposal must not
  become.*
- **The receiver-local first-person primitive the whole story rests on — `wcons` / `DIRECT[me,agent]`
  — is ZERO hits across `packages/`.** "The rank is the substrate; the first-person veneer is the new
  code."
- **Experience-farming is exploitable on main:** `tierOf({pass:5})` of *trivial* tasks → `high-trust`
  → 0 challengers. Five cheap passes buy the top tier (stakes feed only the score *bonus*, never the
  tier). Farm-then-spend, with a working exploit.

## What it strengthens — and what it does NOT
- **Eclipse-resistance (monotonic-with-experience):** a node carrying its own DIRECT priors resists a
  partition because the attacker's false local view must overcome *pre-existing earned edges*, not
  paint a blank canvas. Real — but only for the *verify-self-certifying-record* class, never a
  tallying memory.
- **Sybil-flood:** a million minted identities have ~0 earned edges → contribute ~0 to wcons. First-
  person modeling makes this the *default* posture.
- **M4 / independence-support:** N per-receiver subjective models *are* the distribution of vantages;
  keeping them distinct (never one score) is M4. Harder to correlate than one global vector (though it
  does **not** solve U2).
- **Does NOT help cold-start:** a fresh node has an *empty* model → zero eclipse-resistance until edges
  accrue. The proposal hardens the eclipse leg *over time* but cannot pre-load cold-start without
  becoming a vouched-in U1 throne (**Friedman-Resnick: free-novice-entry AND whitewashing-immunity are
  jointly unattainable without a scarce-identity anchor**).

## Novice = low-reach-until-earned (the only safe form; needs NO new gate)
Falls out of L1/INV-9 for free once wcons exists: an unconnected node's claims propagate short
(wcons ~0) and are flagged provisional — full participation from frame one, no admitting party, no
quorum vote. The test: *"starts at the bottom of its own reach radius, earning up"* (ladder, safe) vs
*"cannot act until admitted"* (gate = the U1 throne in an onboarding costume). Keep `"unproven"`
*reach-shaping, never act-blocking*.

## Build elements (tagged)
- **[free]** the live **never-hard-exclude** posture (`reputation-gate` recommends proceed/down-weight/
  reroute; advisory; display-only) — PRESERVE verbatim; it's what keeps the lens from overriding
  mechanical verification (M5).
- **[buildable]** the **wcons / DIRECT[me,agent] receiver-local primitive** (the single biggest
  deliverable — zero hits today); the **stakes-weighted tier** (replace the farmable raw-count tier);
  the **live decay/asymmetric-crater influence path** (today display-only); the **note-16 inversion +
  defeasible-forward** as a hard consumer property; **private-model + selective signed vouches**;
  novice-onboarding (needs nothing beyond wcons + the §5 CONVERT probation loop).
- **[open_frontier]** the **authenticated minter** (signed/kernel-writer edges — closes the
  grooming-co-forge; the live source-check is a self-documented *mis-wire guard, not authentication*);
  **cold-start hardening** (contained via dues-paying low-reach + CONVERT disjoint paths + the U1 cap,
  never closed); the **U2 estimator** (the never-counts-nodes *rule* is buildable now as a structural
  constraint; the substrate-diversity *estimator* stays [OPEN]).

## Residual (loud, per I8/M1)
1. **Grooming / co-forge [OPEN, CONTAINED]** — receiver-locality bounds the blast radius (warps one
   node, doesn't scale), but integrity ≠ provenance: favorable records are co-forgeable until the
   authenticated minter ships. Tolerable only while the weight is shadow/advisory and gates no action.
2. **Cold-start / fresh-node eclipse [OPEN, CONTAINED]** — the named maximally-vulnerable interim; the
   proposal does nothing for an empty model and must not "fix" it by becoming a throne.
3. **Lens-mistaken-for-truth [PREVENTED while 3 rules hold]** — the model gates scrutiny-intensity
   never skip-verification; lowered scrutiny is defeasible-forward; the lens stays in §5, never moving
   a §6 chain. Preserve the never-hard-exclude guard.

## Bottom line
**ADOPT the spine; build the first-person relational primitive FIRST (it doesn't exist); fold the
three amendments; keep the model private + propagate only selective signed vouches; and never let the
ladder count nodes, gate on tenure, or be published as one sortable list.** It's the correct
architecture and a genuine escape from the global-rank throne — but it is necessary-not-sufficient and
named-not-mechanized, and the live tier is *already* the rank pathology (farmable in 5 trivial passes).
The gap between the corrected design and the default build **is** the deliverable. Reflects your intent
faithfully once "strengthens cold-start" is corrected to "strengthens eclipse-over-time, not
cold-start," and the three amendments are absorbed.
