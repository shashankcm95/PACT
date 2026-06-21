---
lifecycle: persistent
phase: proto-planning — feasibility verdict
created: 2026-06-21
status: recommendation (adversarially verified)
---

# Feasibility — can we build a SCALABLE, TRANSPARENT, AUDITABLE agent network on the PACT base?

> Verdict from an 8-agent adversarially-verified workflow: a fresh probe of the real Power Loom
> code + one design-feasibility analyst per property + one adversary attacking each feasibility
> claim + an architect integration. Every analyst said CONDITIONAL; every adversary DOWNGRADED
> confidence (not achievability); **none refuted**. Source: the run under
> `tasks/w3g2nf8yl` (994K tokens, 8 agents).

## Bottom line: **YES — WITH CONDITIONS.**

Feasible, and decisively so on the axis that matters most: **AUDITABLE and TRANSPARENT are
achievable WITHOUT solving the open frontier** — U1 (one-human-one-root) and U2 (epistemic
independence) are *containment parameters, not preconditions*. The only frontier-gated piece is
the **epistemic-trust-conversion sub-axis of scalability**, and even that is contained as a
visibly-WEAK-flagged parameter, never a blocker. It's `YES_WITH_CONDITIONS` rather than a clean
`YES` because the substrate is **further from "free" than the §11 mapping implies** — the
adversaries confirmed real crypto primitives exist but the scalable/provenance *shapes* are
named-not-mechanized.

## Per-property (analyst → adversary → adjudicated)

| Property | Verdict | Adversary | The honest state |
|---|---|---|---|
| **Auditable** | CONDITIONAL | DOWNGRADE (not refuted) | **Strongest.** Tamper-evidence is FREE + hardened today (live-confirmed verify-on-read). Provenance/non-repudiation (the #273 same-uid co-forge — *live-exploited in the probe*) and cross-N-log equivocation-detection are absent — but **pure [SOLVED]-class engineering, zero U1/U2 dependency** (ed25519 + Option-B custody + RFC 6962 Merkle proofs). |
| **Transparent** | CONDITIONAL | DOWNGRADE (not refuted) | **The property PACT is structurally BEST-suited to deliver** (M5 show-don't-resolve / M4 preserve-disagreement / M1 contain-don't-eliminate *are* a transparency mandate over a decidable-by-construction core) — but **~0% mechanized today**: every free primitive is *auditability* scaffolding. The SHOW surface (ATMS premise/claim DAG + DIRECT/CONSENSUS split + visible WEAK flag + a decidable `effective_presence()`) is greenfield — **none of it requires U1/U2 SOLVED, only HONESTLY DISPLAYED.** |
| **Scalable** | CONDITIONAL | DOWNGRADE (not refuted) | Node interior scales; every "network" axis is unbuilt boundary work with **mature off-the-shelf fixes** (per-receiver logs + RFC 6962; bounded depth-k attenuated `wcons`; config-hash binding). **Only the O(global-topology) independence estimator inherits U2** — containable as a WEAK-flagged parameter. |

## The crux — what's gated on the [OPEN] frontier vs what isn't

**NOT gated on U1/U2 (the deliverable core — pure [SOLVED]-class engineering):**
- **Auditable, in full** — tamper-evidence free; non-repudiation = ed25519 (built, reviewed) +
  Option-B key custody via the existing `resolveSigner` seam + *gating reads on verify*;
  equivocation-detection = RFC 6962 Merkle inclusion+consistency proofs + STH gossip.
- **Transparent's mechanizable core** — the SHOW surface is greenfield BUILD, not frontier.
  Transparency does **not** require *solving* U2; it requires **honestly displaying** that U2 is open
  (the visible WEAK flag). That is the M1 move: the open problem becomes a *rendered degraded mode*, not a blocker.
- **Scalable's transport/log/identity axes** — INV-10 global-log → per-receiver + consistency proofs;
  single-hop `wcons` islands → bounded depth-k attenuation; config-swap laundering → config-hash binding.

**GATED on the frontier (must be CONTAINED, never claimed solved):**
- **Scalable's epistemic-trust-conversion sub-axis only** — the substrate-diversity independence
  estimator is *both* an O(global-topology) cost term *and* the U2 correctness problem with no
  estimator in existence. Contained by shipping topological-disjointness with a visible WEAK flag and
  never letting a gate ACT on "independence" un-flagged before P5.
- **The honesty edge on transparency** — a WEAK flag is only honest if the boundary it draws is
  decidable, and "independence" is **three predicates** (topological=SOLVED, epistemic=U2-OPEN,
  config-stability=**not-even-named**). Shipping the flag while predicate #3 is unnamed = 2-of-3-honest transparency.
- **U1 underpins Sybil-resistance STRENGTH, not throughput** — a network can SCALE coordination-free
  on a WEAK root; it just cannot *claim* strong Sybil-resistance. U1 is a genuineness parameter, not a
  scalability cliff. Correctly DEFERRED until a 2nd untrusting root exists (no Sybil surface at single-uid).

**Net: 2.5 of 3 properties are buildable on mature crypto/standards with the frontier merely
CONTAINED; only the trust-conversion sub-axis of scalability genuinely needs U2.**

## What the fresh code probe corrected (the adversary's load-bearing catches)

The substrate is real but **§11's "nearly free" framing is too generous** — the accurate frame is
*"real primitives + greenfield boundary; build the scalable shapes, do not assume them."*
- **Auditable log** (`transaction-record.js` + `record-store.js`): verify-on-read + content-address
  integrity are REAL and hardened (a tampered/planted/forged-key file fail-softs to null). But the
  chain is **LINEAR + single-predecessor + UNSIGNED**, the store is a **non-fsync content-addressed
  CACHE** (not an ordered WAL), and there is **no Merkle tree / inclusion / consistency proof anywhere**
  → cross-writer **equivocation is structurally undetectable** today. ⇒ Merkle is a *re-shape*, not a bolt-on.
- **ed25519** (`edge-attestation.js`, `weight-minter.js`): REAL, reviewed, alg-pinned, fail-closed —
  a near drop-in for §2's SIG. But **SHADOW + same-uid** (key in process env, any same-uid caller
  co-forges a byte-valid record — *live-exploited*), it signs a 64-hex id not a persona/human-root,
  and **no read path gates on verify** (the live confirmed-by lane counts unsigned edges).
- **The "free" receiver-local `wcons` trust primitive DOES NOT EXIST** — `grep wcons` = 0 hits; no
  DIRECT/CONSENSUS axis, no vouch edges, no asymmetric crater, decay is display-only. The scalable
  analyst cited mapping-row-4 as confirming it; **row 4 explicitly refutes it as over-claimed.** This
  is the single biggest "named-not-mechanized" correction.

## The minimal demonstrator (proves all three at once — = the v0, hardened)

**Two mutually-untrusting roots exchange ONE authenticated, premise-bound, scope-checked, falsifiable
claim — rendered transparently, on per-receiver Merkle logs — and a fabricated counterexample does NOT
silently collapse it.** Concretely (P0+P1; adopt mature standards, build only the novel core):

- **Auditable leg:** (free) reuse the content-addressed verify-on-read store for tamper-evidence;
  (build, ~half wiring) close #273 for two untrusting roots — per-persona ed25519 keypairs + flip the
  SHADOW signer to Option-B custody via `resolveSigner` + **gate reads on `verifyRecordSig`**;
  (build) replace the linear chain with an **RFC 6962 Merkle log + STH + one honest fork-detecting
  witness** (a fork-DETECTOR, never an independence-SCORER — that boundary keeps U2 out).
- **Transparent leg** (built on the auditable log — the 0%-present part): a minimal **ATMS-grade
  Premise/Claim/Scope model + VALIDATE** rendered as a re-runnable WHY-trace a third party reconstructs
  *without the system as intermediary*; the **visible WEAK flag** on every independence claim (and NAME
  all three predicates); name + bind the cap-setter/root-issuer **and SHOW-surface-curator** thrones with
  a **decidable** `effective_presence()` (binding WHO holds the throne while leaving WHAT IT COMPUTES
  undefined is still a transparency hole).
- **Scalable leg** (demonstrated by SHAPE, not load): per-receiver logs (no global "the log"); receiver-
  local trust compute; DEFER caps + the full independence estimator until the 2nd root creates a Sybil surface.

## Five hard gates (correctness, not features — land in v0)
1. **Close #273 provenance** — per-persona keys + Option-B custody + **gate reads on verify** (a
   signature nothing checks is not non-repudiation; the co-forge is live today).
2. **Re-shape the log to RFC 6962 Merkle + STH + one honest witness** (the linear non-fsync cache
   cannot detect equivocation — a re-architecture, not a bolt-on).
3. **Make `effective_presence()` a DECIDABLE pure function over the log** and bind every relocated
   throne, including the SHOW-surface curator.
4. **FALSIFY-fixed + acyclicity in v0** — a fabricated counterexample silently collapsing a sub-DAG is
   the exact M5 violation v0 exists to disprove.
5. **Render every independence/disjointness claim with the visible WEAK flag** and NAME all three
   independence predicates (topological=solved, epistemic=open, config-stability=currently-unnamed).

## The honest ceiling (do not claim)
- **You can deliver auditable + transparent + scalable-coordination.** ✅
- **You CANNOT deliver "trustworthy / correct."** PACT (M1/M5/L5) *deliberately refuses* to mechanize a
  judge of truth — that judge IS the throne/hive. A perfectly auditable log faithfully records a
  perfectly authenticated **lie**. Auditability certifies *what was said and by whom*, never that it was
  true. **Transparency is precisely what lets that refusal be safe** — the receiver sees the reasoning,
  so it need not trust the conclusion.
- **U1 (Sybil) and U2 (independence) are contained, not eliminated** — "Sybil cost is budgeted/bounded/
  auditable instead of zero," and the WEAK-flag containment of U2 is a *discipline*, not an enforced gate
  (if it slips — a consumer reads the cheap topological score as the expensive epistemic one — it is a
  live correctness cliff; the substrate *already ships the confusion*: `lesson-confirm.js`'s own comment
  "byte-distinct != logically-independent").

*Supersedes nothing; sharpens `10-synthesis-and-recommendation.md` §8/§9 with adversarial code-grounding.*
