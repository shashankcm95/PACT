---
lifecycle: persistent
phase: proto-planning — design-direction probe
created: 2026-06-21
status: recommendation (adversarially verified)
---

# Physical coordinates as an independence anchor — verdict

> **Question:** can we tie a spawned agent's independence to its physical coordinates, as a
> workaround for the bees' spatial-independence property that doesn't transfer to digital agents?
> **Verdict (4-agent adversarially-verified workflow `wvhk6i30r`): REJECT_FOR_U2 — but SALVAGE
> attested hardware for U1.** Physical coordinates do not and *cannot* solve epistemic independence
> (U2). They land on a different axis (U1 scarcity + the unnamed config-stability predicate), and
> mis-wired they are *worse than no signal*.

## Why it fails on the axis it was reaching for (U2)

The honeybee chain is `spatial separation → different brain → independent assessment` — and it holds
**only because each bee physically carries its own substrate**, so location and brain are the same
object. **For digital agents that middle term is severed:** the substrate U2 cares about is the
*model family + source corpus + checkpoint*, and that is fetched **independent of where the box sits.**

This holds **at the cryptographic root**, not as an implementation gap: remote attestation proves
*which binary* runs, **never what it does or which weights load at runtime**. Two TEE-attested
machines on opposite continents can pull *identical weights from the identical endpoint* and produce
**byte-correlated** assessments — and every layer of the location/attestation stack will still certify
them "distinct." It's **landmine L4 one layer down**: *physical-distinctness authenticity is not
epistemic independence*, exactly as cryptographic authenticity wasn't. Worse, the certificate
**disarms skepticism** (L4/L7) — N correlated agents now *look* independent, with a signed proof.

**This is empirically measured in the live substrate, not hypothetical:** a same-model re-roll is
byte-identical on a canonical fix (`earned-grounding-run.js:199,285`), and the repo already ships the
comment **"byte-distinct != logically-independent"** (`lesson-confirm.js:25`).

## What's provable about physical location (the research, cited)

| Mechanism | Provable guarantee | Cost / attacker model |
|---|---|---|
| **Distance-bounding** (Brands-Chaum, Hancke-Kuhn) | an **upper bound** on distance verifier↔prover (speed-of-light; an external relay can only make you look *farther*) | needs ns-class ranging hardware co-located with the prover; **collapses for a dishonest prover proving its OWN location** (terrorist fraud) — exactly PACT's case. Useless over open internet. |
| **Verifiable multilateration** (Capkun-Hubaux) | a **position region**, via ≥3 trusted non-colluding known-location anchors | a deployed local anchor network; no global build-out for arbitrary agents; economically prohibitive |
| **Proof-of-location nets** (FOAM/Helium/XYO) | heuristic radio **co-presence** on a ledger | **witness collusion is structural** (Helium polices mass-spoofing reactively via a near-daily denylist); not a physics bound |
| **Hardware attestation** (TPM/SGX/SEV-SNP/Nitro) | **binds code+key to a specific physical machine** (vendor-fused endorsement key) | the **PACT-realistic** primitive — no new infra. But proves *which binary*, **never what it does**; root-of-trust is the silicon vendor |
| **Self-asserted GPS / IP-geolocation** | **NOTHING** — the #273 self-asserted-field landmine | civilian GPS spoofs for **<$100**, GNSS is one-way/self-reported, even Galileo OSNMA falls to replay/forgery. **Forbidden as a trust input.** |

## Where it actually pays rent — U1 (scarcity), not U2

Physical presence is fundamentally a **scarcity anchor (U1-flavored, sibling of one-human-one-root)**,
not an independence estimator. Its real mechanism is raising the **per-presence minting cost** — it
feeds §1's effective-presence cap (INV-12) and §9 U1 containment (`cap × disjoint-paths → breach
EXPENSIVE and BOUNDED`). **Honest bound:** cost-to-fake is **~linear-per-region, credit-card-cheap**
(single-digit $/hr per attested enclave across AWS/Azure/GCP) — a modest cost *multiplier*, **not** a
Sybil *solution*, and never "expensive and bounded" independence.

It also mechanizes the **currently-unnamed third independence predicate (config-stability)** — the
attested **code-hash binding** is a stable, bindable host/config identity (kin to the feasibility
doc's config-hash binding, hard-gate #5). This is the strongest underused handle in the proposal and
it's nearly free. Use it to detect **config-swap laundering** (an agent silently changing substrate to
evade a stability check). It is config-STABILITY (did the box keep its config), **never** config-
INDEPENDENCE (do two boxes run different configs).

## The throne it relocates (L6) — must be bound

Removing "spatial independence emerges from physics" relocates the decider to the **silicon-vendor PKI
(Intel DCAP / AMD / AWS Nitro) + any anchor-network operator** — a **2-3-firm oligopoly the receiver
cannot audit, rotate, or contest**, wearing a "hardware root-of-trust" legitimacy costume (L7), and
**less bindable than a named central authority**. The verify-the-verifiers recursion is unterminated:
nothing proves the anchors are independent *of each other*, and a **single-vendor fleet (the common
AWS Nitro case) is correlated by construction** — one vendor backdoor / key-extraction (Foreshadow,
SEV glitch) / compromised CA collapses **every node's independence verdict at once.** Bindable only if
the spec NAMES this throne, mandates **multi-vendor attestation diversity**, and surfaces the
root-of-trust set as a visible/contestable/rotating input.

## The right frame: a 4-axis independence PORTFOLIO

Model independence as a portfolio of orthogonal axes — each **forgeable alone, costly jointly** (the
disjoint-paths intuition INV-11 lifted to the substrate):

1. **Human-root** (U1 §1) — the scarcity anchor.
2. **Attested-hardware** (this proposal, salvaged) — distinct endorsement keys ⇒ distinct machines;
   forgeable alone (rent N enclaves); must NAME + diversify its vendor-PKI throne.
3. **Network-path** (predicate #1 topological, DISJOINT_PATHS) — graph-disjoint vouch paths.
4. **Model-substrate** (U2, predicate #2) — uncorrelated model/source; **the OPEN core; the ONLY axis
   that observes epistemic independence; no estimator exists yet.**

**Critical discipline:** axes 1-3 are SCARCITY / TOPOLOGY / STABILITY signals; **only axis 4 is
epistemic.** A gate must **NEVER** read the AND of axes 1-3 as a substitute for axis 4 — that is the
live correctness cliff.

## Incorporate (each tagged) / reject
- **[buildable]** Attested hardware (TPM/SGX/SEV-SNP/Nitro) as ONE permanently-WEAK-flagged portfolio
  axis, wired EXCLUSIVELY into the U1 Sybil-cost / effective-presence path + predicate-#3 config-stability.
- **[buildable]** Attested presence as one OPTIONAL pluggable U1 root-issuance upgrade-anchor (§9 U1).
- **[buildable]** Attested code-hash → mechanize + NAME predicate #3 (config-stability) in the spec
  (currently unnamed = only 2-of-3-honest transparency).
- **[forbidden]** Self-asserted GPS / IP-geolocation as any trust input.
- **[open_frontier — DO NOT BUILD]** a global secure-positioning / proof-of-location anchor network
  (KISS/YAGNI — collusion-degradable, far higher cost, strictly weaker than TEE attestation).
- **[open_frontier — the real work]** the model+source-provenance scorer — the ONLY thing that observes
  U2 (§6.2 CROSS_VERIFY / §9 U2 / INV-11). Build THAT for epistemic independence.

## Bottom line
**REJECT as stated** (it can't solve U2 and mis-wired is worse than nothing), **SALVAGE attested
hardware** as one WEAK-flagged axis on the **U1 scarcity** path + the **config-stability** handle, never
self-asserted GPS, never as a U2 substitute. **Name + bind the vendor-PKI throne.** And the real answer
to "scale better?": a **small positive on U1-scarcity scaling, a hard zero on U2-independence scaling,
and a real downside if the relocated throne is left unbound.** U2 stays open; only model+source
provenance observes it — build that, and never confuse scarcity/stability with independence.
