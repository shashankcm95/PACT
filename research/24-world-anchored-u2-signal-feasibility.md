# research/24 — a world-anchored U2 (epistemic-independence) signal — feasibility verdict

> **Question:** can a WORLD-ANCHORED signal ESTABLISH that two agents' evidence is epistemically independent
> (axis-4 / the model-substrate axis — `research/13`'s "OPEN core, the ONLY axis that observes epistemic
> independence, no estimator exists")? This is the signal that would HARDEN U2 (the gate-enabler) and populate
> the deferred CONFIRM-provenance carrier (`plans/13`, FORK-3).
>
> **Verdict (two epistemic statuses, kept distinct):** `[SOURCED]` positive independence is **NOT
> identifiable from OBSERVABLES** (outputs/agreement) — a 2026 identifiability result ("observable agreement
> ... is not identifiable with respect to independence", arXiv:2604.07650), NOT just PACT's reasoning.
> `[PACT-INFERENCE]` and since the only world-anchored handle (substrate-DISTINCTNESS attestation) is
> NECESSARY-NOT-SUFFICIENT, PACT INFERS no currently-conceivable world-anchored signal yields a positive
> STRONG — but this is an **open frontier, NOT a proven impossibility** (the literature bounds only the
> observables half; it does not rule out a future provenance authority). What IS achievable: (a) the
> **NEGATIVE direction** — DETECT entanglement (correlated confirmers) as a DEMOTING signal — but IN-PROCESS,
> so per OQ-NS-6 it NARROWS, never hardens; (b) a **world-anchored substrate-DISTINCTNESS** attestation
> (GPU-TEE weight-hash, newly feasible 2025) — NECESSARY-NOT-SUFFICIENT (distinct weights != independent
> evidence) AND throne-bound (vendor-PKI). **So U2's positive verdict stays WEAK** — by the identifiability
> bound on observables + the necessary-not-sufficiency of distinctness; the salvage is a DEMOTING entanglement
> detector + an OPTIONAL throne-named distinctness axis. Neither makes `epistemicIndependence()` return a
> positive STRONG — ever.

## §0 OQ-NS-6 honesty banner

This is a feasibility RFC. It builds NOTHING and hardens NOTHING. Its load-bearing output is a NEGATIVE
result: the positive U2 signal the substrate has been reserving a lift-point for **is not establishable from
observables** `[SOURCED]`, and PACT INFERS no currently-conceivable world-anchored signal establishes it
positively `[PACT-INFERENCE — an open frontier, not a proven impossibility]`. U2 stays WEAK + gates nothing.
Per NS-9 this is reported as a sharpened-frontier, never "progress toward closing U2." (If anything it makes
the WEAK flag look MORE durable — but as a current-best inference, not a theorem; see §4.)

## §1 The question, located on research/13's portfolio

`research/13` framed independence as a 4-axis portfolio: (1) human-root [U1 scarcity], (2) attested-hardware
[scarcity + config-stability], (3) network-path [topological/DISJOINT_PATHS], (4) **model-substrate [U2 — the
ONLY epistemic axis; the OPEN core]**. It concluded: "build the model+source-provenance scorer — the ONLY
thing that observes U2." This RFC is that scorer's feasibility study. The discipline from research/13 holds:
axes 1-3 are scarcity/topology/stability; only axis-4 is epistemic; a gate must NEVER read AND(1-3) as axis-4.

## §2 Why the POSITIVE direction is fundamentally hard (the identifiability constraint)

Establishing "these two agents reasoned independently" from their OUTPUTS is provably not identifiable. The
2026 statistical-auditing literature (arXiv:2604.07650, "How Independent are Large Language Models?") states
it directly: *"observable agreement or similarity alone is not identifiable with respect to independence:
models may agree because they reason independently, because they share contaminated benchmark exposure, or
because they inherit common decision structure."* Its framework can DETECT dependence but **"no mechanism for
proving independence exists"** in it. Causes of hidden dependence it names: *"shared pretraining data,
distillation, and alignment pipelines"*; *"student models can retain detectable traces of their teachers"*;
*"recursive reuse of synthetic data can further homogenize future models."*

This is `research/13`'s L4 landmine ("authenticity != independence") at the substrate layer, now with external
confirmation: two agents loading the same public weights from the same endpoint produce **correlated**
assessments (an empirical property of same-weights re-rolls; the "byte-distinct != logically-independent"
phrasing originates as a code comment in the PARENT power-loom substrate, NOT live PACT code — cite it as
inherited, per `research/23` §5.4, not as a PACT measurement); two DIFFERENT models trained on overlapping
corpora produce **error-correlated** ones (arXiv:2604.07650, "shared pretraining data"). Apparent agreement is
shared error modes, never independent validation. **The positive verdict ("independent") is epistemically
unavailable from observables.**

## §3 Candidate mechanisms — what's provable vs the limit (mirrors research/13's location table)

| Mechanism | Provable guarantee | The limit (why it does not establish U2) |
|---|---|---|
| **GPU-TEE weight-hash attestation** (NVIDIA GPU attest + Intel TDX/SEV; Phala, OLLM, 2025) | a WORLD-ANCHORED proof of *which model-weight HASH ran* inside the enclave, cryptographically bound to the response | (a) **distinctness != independence** — distinct hashes prove different weights, NOT independent evidence (two fine-tunes of one base, or one corpus, stay correlated); same public weights -> same hash -> correlated-by-construction (shared error manifold; NOT byte-identical outputs — sampling/hardware nondeterminism differ, so "our outputs differ therefore independent" is the L4 fallacy). NECESSARY-NOT-SUFFICIENT. (b) **throne-bound** — root-of-trust is the silicon-vendor PKI (Intel/NVIDIA/AMD), a 2-3-firm oligopoly the receiver cannot audit/rotate; a single-vendor fleet is correlated by construction (research/13 L6). (c) deployment-constrained (the agent must run in a TEE). |
| **Provider-signed provenance** (the model PROVIDER signs `{model_id, checkpoint, corpus_id}`) | IF offered, a world-anchored attestation of model lineage by the out-of-band authority (the provider) | no provider ships this; relocates the throne to the provider; and cross-provider CORPUS OVERLAP still correlates (the 2604.07650 "shared pretraining data" dependence) — lineage-distinct != evidence-independent. |
| **Behavioral-entanglement detection** (BEI / CIG, arXiv:2604.07650; focal-diversity, disagreement scores) | DETECTS *dependence* — synchronized failures on the error manifold give "statistically significant evidence of latent dependence" | **NEGATIVE-ONLY** (detects entanglement, never proves independence) AND **IN-PROCESS** (PACT measures the outputs) -> per OQ-NS-6 it NARROWS, never hardens; needs a shared probe battery + enough samples. |
| **Model fingerprinting** (logit/stylistic/token-timing; arXiv:2407.01235, FDLLM 2501.16029, 2502.20589) | probabilistic *model-family attribution* from outputs | in-process, evadable (an adversary perturbs style), probabilistic; useful only as a NEGATIVE "same-family -> correlated" demotion. |
| **Self-asserted provenance** (the deferred CONFIRM `evidence_provenance` string) | **NOTHING** — the #273 self-asserted-field landmine | an actor types N distinct provenance strings as trivially as N config hashes (`cross-verify.js:14`). FORBIDDEN as a trust input (research/23 §5.5). |
| **Multi-vendor M-of-N attestation** (TEE quotes from M of N COMPETING vendor PKIs) | the one lever that genuinely DILUTES the §3-row-1 vendor-PKI throne — independence of the ROOT-OF-TRUST set, not of the evidence | still only attests DISTINCTNESS (necessary-not-sufficient); raises the throne's collusion cost (research/13 L6 mitigation made concrete) but does not change the distinctness!=independence ceiling. The strongest throne-binding move IF the TEE axis is ever built. |
| **ZK proof of training provenance** (zkML / proof-of-training: attest "trained on corpus C" without revealing C) | IN PRINCIPLE a privacy-preserving lineage attestation | **research-only, infeasible at LLM scale today**; and even sound it yields LINEAGE-distinctness, which corpus-overlap shows `!= evidence-independence` — collapses into the provider-signed bucket (necessary-not-sufficient). Named-and-collapsed, not a separate path. |
| **C2PA / content-provenance standards** | artifact provenance (who/what produced a FILE) | **WRONG LAYER / out-of-axis** — attests artifact lineage, not model-substrate independence. Rejected so a future reader does not re-propose it. |

## §4 The honest verdict + the productive salvage

1. **U2's positive verdict stays WEAK** — `[SOURCED]` not identifiable from observables (§2); `[PACT-INFERENCE,
   open frontier]` no currently-conceivable world-anchored signal is positively sufficient (distinctness is
   necessary-not-sufficient). **`epistemicIndependence()` must NEVER return a positive STRONG.** This SHARPENS
   `research/23`'s contract: the estimator's non-WEAK direction can only be a DEMOTION — never a promotion to
   "independent." **The amendment must be applied as a well-specified change, NOT a bare range edit** (VERIFY
   architect — the current lift-point only ever LIFTS WEAK, it has no seam to demote BELOW it):
   - **Range:** `{WEAK, ENTANGLEMENT-DETECTED}` where `ENTANGLEMENT-DETECTED` is a DEMOTE-only flag. The
     ABSENCE of a detected-entanglement signal is **NOT** evidence of independence — it stays WEAK (the L4
     guard: a detector that fails to fire establishes nothing).
   - **Signature:** the demote verdict is inherently per-confirmer-SET, so it rides `research/23` §2's deferred
     per-record signature `epistemicIndependence(confirmerSet)`; the §2 migration-anchor now describes a
     DEMOTING estimator (the positive one it staged will never exist).
   - **Where the demotion lands:** NOT in `mayGate` (already fail-closed on WEAK) and NOT swallowed by
     `independenceLabel.overall` (which today has no state worse than WEAK — a `NOT-INDEPENDENT` fed through it
     collapses to `overall:'WEAK'`, silently). The demotion must act on the **advisory WEIGHT the label feeds**
     (`convert`/`cross-verify` — e.g. count an entangled set as fewer independent confirmations), which needs
     an explicit demotion sink the amendment specifies.
   - **NS-8 asymmetry carve-out:** `research/23` §4.4 blocks any NON-WEAK verdict behind the P3 stakes-throne.
     A NEGATIVE/demoting verdict only TIGHTENS (never unlocks), so it must be EXEMPT from §4.4 (which exists to
     prevent premature UNLOCKING); positive verdicts stay forbidden entirely.
2. **The salvage is a DEMOTING entanglement detector (honest negative, NARROWS).** PACT CAN run a
   behavioral-entanglement measure (BEI/CIG-style) over a premise's confirmers and DEMOTE a correlated set
   (synchronized failures -> count them as fewer independent confirmations). This is honest as a NEGATIVE and
   it is IN-PROCESS, so it NARROWS (it cannot harden); it must be WEAK-flagged and may DEMOTE but never
   PROMOTE, and never flip `convert.actionable`. It is the one mechanism that touches axis-4 without claiming
   the impossible positive. **Note it does NOT violate the no-AND(1-3)-as-axis-4 discipline** (research/23
   §5.1): that rule forbids substituting SCARCITY/TOPOLOGY/STABILITY for epistemic; this detector measures
   epistemic entanglement DIRECTLY, in the negative direction — a direct axis-4 reading, not the forbidden
   substitution.
3. **The world-anchored DISTINCTNESS axis (TEE weight-hash) is buildable but throne-bound + necessary-only.**
   Like research/13's salvaged attested-hardware axis: ONE permanently-WEAK portfolio axis, wired only as a
   necessary precondition, with the vendor-PKI throne NAMED + diversity-mandated. It HARDENS "different weights
   ran" (a real world-anchored fact), never "independent evidence."

## §5 Consequence for the CONFIRM-provenance carrier (FORK-3 / plans/13)

The deferred CONFIRM `evidence_provenance` field as a SELF-ASSERTED string is the WRONG carrier (row 5 above —
proves nothing). The RIGHT carriers, IF either is ever built: (a) a **TEE attestation quote** (world-anchored
weight-hash, throne-bound) the confirmer's enclave emits, or (b) a **behavioral-entanglement score** PACT
computes in-process (negative/demoting). The carrier-field wave stays deferred until §4.2 or §4.3 is chosen —
at which point the field carries an ATTESTED quote or an entanglement score, never a self-asserted string.

## §6 Incorporate / reject (each tagged, mirroring research/13)

- **[buildable, NEGATIVE-only, NARROWS]** a behavioral-entanglement DETECTOR over a premise's confirmers
  (BEI/CIG-style) — DEMOTES correlated confirmers; WEAK-flagged; never promotes; never gates. The honest axis-4
  salvage. (A future wave; needs a probe battery + the demote-only wiring + the full advisory-isolation pins.)
- **[buildable, NECESSARY-only, throne-bound]** GPU-TEE weight-hash attestation as ONE permanently-WEAK
  distinctness axis on the U1/portfolio path — NAME + diversify the vendor-PKI throne (research/13 L6).
- **[forbidden]** self-asserted provenance / output "agreement" read as independence (the §2 identifiability
  violation + the #273 self-asserted landmine).
- **[forbidden]** a POSITIVE establisher of epistemic independence FROM OBSERVABLES — the literature proves it
  is not identifiable (arXiv:2604.07650). Do NOT build a positive estimator on outputs; it cannot exist honestly.
- **[open_frontier — NOT proven impossible]** a POSITIVE establisher from a future WORLD-ANCHORED provenance
  authority — PACT infers none is currently conceivable (distinctness is necessary-not-sufficient), but the
  literature bounds only the observables half; do not foreclose it, do not wait on it.
- **[research-only]** provider-signed model-lineage provenance — depends on providers shipping it + on naming
  the provider throne; corpus-overlap still correlates. Revisit only if a provider attestation standard emerges.

## §7 Residuals (LOUD — NS-9)

- **U2's positive verdict stays WEAK** — `[SOURCED]` not identifiable from observables; `[PACT-INFERENCE, open
  frontier]` and no currently-conceivable world-anchored signal is positively sufficient. This is the sharpest
  residual: the substrate should stop reserving the lift-point for a POSITIVE estimator; the honest range is
  `{WEAK, ENTANGLEMENT-DETECTED}` (demote-only — absence of detected entanglement is NOT independence).
- The entanglement DETECTOR (if built) NARROWS, never hardens (in-process, OQ-NS-6).
- The TEE distinctness axis (if built) is throne-bound (vendor-PKI oligopoly) + necessary-not-sufficient.
- `convert.actionable` does NOT flip on any of these; everything SHADOW.
- This RFC is design-only; it ships no code. The `research/23` amendment (estimator range = demote-only) is
  the one concrete forward action it recommends.

## Sources

- arXiv:2604.07650 — *How Independent are Large Language Models? A Statistical Framework for Auditing
  Behavioral Entanglement* (the identifiability constraint; BEI / CIG; detect-dependence-not-prove-independence).
- arXiv:2407.01235 (*A Fingerprint for Large Language Models*); arXiv:2501.16029 (*FDLLM*); arXiv:2502.20589
  (*LLMs Have Rhythm* — inter-token-time fingerprinting) — model-family attribution from outputs.
- Phala GPU-TEE (OpenRouter, 2025); OLLM (Intel TDX + NVIDIA GPU attestation + execution-proof binding);
  arXiv:2504.04715 (*Auditing Model Substitution in LLM APIs*) — TEE weight-hash attestation state of the art.
- In-repo: `research/13` (the 4-axis portfolio + the location verdict + the vendor-PKI throne), `research/23`
  (the estimator interface contract this RFC amends), `PACT-NORTH-STAR.md` §4 (U2).

## Review (2-lens, 2026-06-22) — folded

**architect — SOUND-WITH-FIXES:** the core epistemic-impossibility claim HOLDS + is correctly bounded
(observables: impossible; throne-bound attestation: necessary-only). Folded: the demote-only amendment is
under-wired as a bare range edit — it must ride research/23 §2's per-record signature, land the demotion on the
advisory WEIGHT (not `overall`/`mayGate`, which only LIFT/fail-close), and carve negative verdicts out of the
§4.4 NS-8 gate (§4.1 now specifies all three); added the missing mechanism rows (multi-vendor M-of-N,
ZK-provenance, C2PA-out-of-axis); fixed "identical-by-construction" -> "correlated-by-construction".

**honesty — HONEST-WITH-FIXES** (NS-9 PASSED — negative never dressed as progress; the 2604.07650 quote
faithful): folded two HIGH over-reaches — (1) the `byte-correlated` claim was mis-attributed to PACT-local
`research/13`; re-attributed to the parent power-loom substrate per `research/23` §5.4 (the same inherited
`lesson-confirm.js` provenance error). (2) §0/§4 laundered the bounded "not identifiable from OBSERVABLES"
literature finding into an unbounded "epistemic NECESSITY" claim; now split `[SOURCED]` (observables) vs
`[PACT-INFERENCE, open frontier]` (the leap), matching §6's hedge. (3) renamed the range to
`{WEAK, ENTANGLEMENT-DETECTED}` so it can't misread as a positive capability + "absence is NOT independence."
