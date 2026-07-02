---
lifecycle: persistent
status: SCOPED -- HELD behind the registry-binding reframe (USER, 2026-07-01); see §9 + plans/31
plan: 30
created: 2026-07-01
depends-on: plans/29 (the authenticated-minter template, design-only) ; plans/09/14/16/17/26 (the R1/R2-WHO/R2-WHAT/R-heap custody dogfoods) ; docs/deployment/cross-uid-broker.md + r-heap-run-2026-07-01.md
audience: the USER (go-ahead gate + the operator deploy) + a future build session
title: The provenance HARDEN arc -- a deployed cross-uid signer signing LIVE trust-graph edges (OQ-NS-6 apex)
---

# Plan 30 -- the provenance HARDEN arc (SCOPING)

> **HONEST-LABELING HEADER (read first).**
> This is the OQ-NS-6 **apex**: the FIRST time a PACT trust-graph edge would carry real **PROVENANCE**, not
> just integrity. Per OQ-NS-6 only a **world-anchored** signal HARDENS -- this arc HARDENS (it does not narrow)
> because the signing key lives on a **separate uid** the host cannot read (R1), cannot extract from the running
> broker's memory (R-heap), and cannot coerce into signing a foreign-persona edge (R2-WHAT).
>
> **PRECISELY WHAT HARDENS (VERIFY-hacker HIGH -- do NOT overclaim):** this closes the co-forge of an edge UNDER
> THE BROKER'S PERSONA -- the broker persona's KEY becomes uncompromisable same-uid. It does NOT make "the edge's
> existence proves who minted it" true in general, because `read-gate` keys on `lookupPublicKey(registry,
> src_persona_did)` and **the registry (the persona<->key binding) is host-writable** (`registry.js:22-29`, no
> provenance claim). A same-uid host still co-forges by registering ITS OWN persona and self-signing under it (the
> #273 family, on the READ side -- the FIFTH co-forge leg, §2). So the HARDEN is: the broker persona's key-custody
> is world-anchored; the registry P<->key binding and the fact that no consumer PRIVILEGES the broker persona are
> SEPARATE, still-open anchors this arc does NOT close.
>
> **Three boundaries stay LOUD and OPEN even on success:** (1) the edge's key-custody provenance still does NOT
> GATE -- the weight stays SHADOW until U2 closes (`convert.actionable` hardcoded false); (2) R3 / own-key forgery
> (U1) is untouched -- a legit key-holder still mints authentic records, and the host can self-register a persona;
> (3) the registry persona<->key binding is host-controlled -- key-custody != who-is-this-persona. The HARDEN is on
> the broker persona's KEY-CUSTODY layer ONLY, one box / one run / one axis (the R-heap ceiling carries).
>
> **THE DEPLOY IS THE USER'S.** The actual HARDEN is an operator act: create the broker uid, install the 0600 key,
> the root-owned wrapper, the sudoers rule, the require-frame + allowlist env, register the broker persona, and run
> the out-of-band attestation. **Claude NEVER creates a uid, writes to /etc, installs a key, edits sudoers, sets a
> deploy flag, or runs `--attested`.** Claude builds + verifies the WIRING and writes the runbook; the USER runs the
> deploy and attests. This doc is a scoping deliverable for an explicit go-ahead; the build does NOT start on it.

## §0 What this arc is (one paragraph)

Every custody axis this needs is ALREADY BUILT + DOGFOODED, piecewise: R1 (a cross-uid 0600 key the host uid
cannot read, `plans/14`), R2-WHO (caller-auth allowlist on `SUDO_UID`, `plans/16`), R2-WHAT (require-frame: the
broker signs only a `record_id` it RECOMPUTES from a presented frame declaring its OWN persona, `plans/11`/`plans/17`),
and R-heap (the signing key is non-exfiltrable from the running broker's memory under Linux `ptrace_scope=2`,
`plans/26`). The MECHANISM to sign through a cross-uid broker also exists: `crossUidBrokerSigner` ->
`createMinter({signer,...})` -> `buildFrame` (runbook `cross-uid-broker.md:141-143,211`, "zero seam change"). **What
has NEVER happened (phase-close CC#3): a deployed cross-uid broker signing a LIVE trust-graph edge** (a VOUCH /
CONFIRM that `read-gate.verifiedRecords` weights) -- the dogfoods signed only a C3-liveness control. This arc
COMPOSES the four axes into a broker that signs a live edge, and PROVES a same-uid host can no longer co-forge that
edge. It is primarily a COMPOSE-and-DOGFOOD arc, not a from-scratch build.

## §1 Runtime Probes (firsthand, this session)

- **claim:** the cross-uid signer VEHICLE exists and plugs into the minter with zero seam change.
  **probe:** Read `v0/src/identity/broker-launch.js:1-80` + `docs/deployment/cross-uid-broker.md:141-143,211`
  **observed:** `crossUidBrokerSigner({brokerUser, wrapperPath})` builds a validated `sudo -n -u <user> <wrapper>`
  argv (flag-injection-guarded); runbook: `const signer = crossUidBrokerSigner({...}); createMinter({signer, personaDid, humanUid})`; buildFrame "presents the body automatically -- zero seam change".
- **claim:** the broker signs only a recomputable own-persona frame (R2-WHAT), so it will NOT sign a foreign edge.
  **probe:** Read `v0/src/identity/request-auth.js:97-125` (authorizeRequest) + `broker-sign.js:94-108`
  **observed:** require-frame mode: `personaBinds` exact-byte compares the body's `src_persona_did` to the broker's
  configured persona (deny `persona-mismatch`); `recomputeBinds` signs `computeRecordId(parsed)` NEVER the argv id.
- **claim:** a live edge (VOUCH/CONFIRM) flows through the receiver-relative per-sender read gate.
  **probe:** Read `v0/src/trust/read-gate.js:25-50` + `v0/src/trust/convert.js:19-27` + `v0/src/grounding/cross-verify.js:90-97`
  **observed:** `verifiedRecords` verifies each record's sig under `lookupPublicKey(registry, rec.src_persona_did)`
  (read-gate.js:41,48) -- it proves KEY-integrity of the REGISTERED persona, NOT that the broker signed it; VOUCH
  consumed by convert (`buildVouchGraph`:19-27)/consensus, CONFIRM by cross-verify (perHumanDecay:90-97) -- all
  derived-on-read, SHADOW.
- **claim:** the R-heap ceiling is one-box/one-run/one-axis and leaves the R2 oracle + R3 + apex OPEN.
  **probe:** Read `docs/deployment/r-heap-run-2026-07-01.md:24-26,105-127,261-264`
  **observed:** "one box, one run, one axis"; the same-uid ORACLE residual (R2), hypervisor/root TCB, R3 own-key
  forgery, and the apex "remain OPEN"; `PACT_BROKER_PERSONA_DID` is policy, "NOT cryptographically bound to the held key".
- **claim:** even with real edge provenance, nothing GATES (U2 open).
  **probe:** Read `v0/src/trust/convert.js:134` + `v0/src/independence/weak-flag.js:66-68`
  **observed:** `actionable: false` hardcoded (INV-16, U2 open); `epistemicIndependence()` returns `'WEAK'` literal.

## §2 The composition (what the HARDEN actually is)

A same-uid host attacker today CAN co-forge any edge (the #273 co-forge, live-exploited in research/12): it reads
the env/file key and calls `signRecordId` directly. The HARDEN removes EACH leg of that:

| Leg the attacker needs | Closed by | Dogfood precedent |
|---|---|---|
| Read the signing key off disk | 0600 key owned by the broker uid; host uid gets `EACCES` | R1 (`plans/14`) |
| Extract the key from the running broker's memory | `ptrace_scope=2`; `ptrace_may_access` denies cross-uid + same-uid | R-heap (`plans/26`) |
| Ask the broker to sign a FOREIGN-persona edge | require-frame `personaBinds` exact-byte deny | R2-WHAT (`plans/11`/`17`) |
| Even reach the broker at all | caller-auth allowlist on `SUDO_UID` | R2-WHO (`plans/16`) |
| **Register an attacker persona + self-sign under it (the READ side)** | **NOT CLOSED by this arc** -- `read-gate` keys on the host-writable registry, which makes no provenance claim | the #273 family / U1 -- SEPARATE anchor (`registry.js:22-29`, `read-gate.js:41`) |

With the FIRST FOUR legs composed and the broker signing a LIVE VOUCH/CONFIRM edge, an edge claiming the BROKER'S
persona in `read-gate.verifiedRecords` only proves the registry-mapped key signed it (CodeRabbit #37 Major: not that
the broker persona is the durable source once the host-writable mapping can move -- that is exactly the plans/31
gap) -- the broker persona's KEY-CUSTODY is world-anchored (PROVENANCE OF THE KEY), not merely integrity. **This is the first
world-anchored key-custody signal on a trust-graph edge.** But the FIFTH leg stays OPEN: the host can self-register a
DIFFERENT persona and sign authentic edges under it (that is R3/U1, not broker-key compromise), and the registry
binding "DID P -> pubkey K" is itself host-writable -- so "the edge proves WHO" is FALSE in general; only "the
broker persona's key cannot be forged same-uid" is true. Meaningful ONLY once the registry binding is
provenance-anchored AND a consumer privileges the broker persona -- neither is in this arc.

## §3 The design-vs-deploy boundary (crisp)

**Claude BUILDS + VERIFIES (all SHADOW, no deploy):**
1. The live-edge minting WIRING -- `crossUidBrokerSigner` -> `createMinter` -> a VOUCH/CONFIRM frame ->
   `appendRecord` -> `read-gate.verifiedRecords` (the mechanism exists; this is a thin harness, possibly plus
   plans/29's freshness-bound producer if the USER wants freshness-binding -- Open Decision 2).
2. The ATTESTATION / proof harness -- positive control (a legit own-persona frame -> an accepted, weighted edge)
   + negative controls, each NON-VACUOUS: (a) host uid `cat` the key -> `EACCES`; (b) host presents a foreign-persona
   frame -> broker `persona-mismatch` deny, empty stdout; (c) host attempts an in-process `signRecordId` with no key
   -> fail; (d) [if R-heap re-run] `gcore`/`/proc/pid/mem` extract -> denied. The negative controls are the HARDEN
   proof; the positive control is the non-vacuity.
3. The RUNBOOK DELTA -- `docs/deployment/` gains the signing-into-the-graph procedure (vs the custody-VERIFY
   dogfoods): register the broker persona pubkey, set require-frame + allowlist, mint the live edge, attest.

**The USER RUNS (the operator deploy = the actual HARDEN):**
- Create the broker uid; install the key 0600 owned by it in a 0755 dir; the root-owned wrapper; the sudoers
  `NOPASSWD` + `env_reset,!setenv` rule; set `PACT_BROKER_PERSONA_DID` + `PACT_BROKER_ALLOWED_UIDS` +
  `PACT_BROKER_REQUIRE_FRAME=1`; register the broker persona in the registry; run the out-of-band attestation.
- **Claude does none of this** -- it is the operator's trust act (NS-7); the durable fact is the deployment state,
  re-verifiable any time by re-running the verifier + the manual checks.

## §4 The honest ceiling (LOUD, NS-9) -- what success does and does NOT buy

- **HARDENS:** the BROKER PERSONA'S KEY-CUSTODY -- a same-uid host can no longer forge an edge UNDER THE BROKER'S
  PERSONA (the first four legs closed). First world-anchored key-custody signal on a trust-graph edge (OQ-NS-6).
- **Does NOT prove "who minted it" in general (VERIFY-hacker HIGH):** `read-gate` keys on the host-writable
  registry (`read-gate.js:41`, `registry.js:22-29`). The host can self-register its OWN persona and sign authentic
  edges under it (the FIFTH co-forge leg, §2). Key-custody-of-P != the-registry-says-this-is-P. Closing THAT needs
  a provenance-anchored registry binding (U1-adjacent) AND a consumer that privileges the broker persona -- BOTH
  SEPARATE, still-open, out of this arc.
- **Does NOT gate:** the derived weight stays SHADOW -- `convert.actionable` is hardcoded false until U2 closes
  (probe). Real key-custody INFORMS; it does not yet GATE. (A provenance edge feeding a gate needs U2 too.)
- **Does NOT close R3 / U1:** a legitimate holder of their OWN persona key still mints authentic records
  (r-heap:264). Provenance-of-the-key is not uniqueness-of-the-human.
- **Does NOT resist REPLAY (VERIFY-hacker LOW):** the edge sig is over the BARE `record_id` (no approvedAt/nonce,
  `edge-attestation.js:87-103`; `appendRecord` INV-22 dedups DUPLICATE storage, not replay). A same-uid host can
  re-present a legitimately-broker-signed edge indefinitely. A NAMED open residual that MUST close (plans/29's
  freshness basis) before any weight this feeds gates -- see Open Decision 1 (freshness is now the default).
- **One box / one run / one axis:** the R-heap ceiling carries -- a scope downgrade, a hypervisor/root TCB, or a
  different box reopens it. The attestation is a point-in-time state, not a standing property.
- **`PERSONA_DID` is policy, not key-bound broker-side:** the host-side `assertBrokerPersona` round-trip is what
  proves the key matches the claimed persona (integrity != provenance, NS-2) -- the attestation MUST include it.

## §5 Sub-wave decomposition (IF greenlit)

- **W0 -- the live-edge minting harness + weighting seed + freshness.** Wire `crossUidBrokerSigner` -> `createMinter`
  -> VOUCH/CONFIRM -> `read-gate`, as a runnable harness with an INJECTED signer (a local same-uid broker for the
  SHADOW test; the cross-uid signer only at deploy). **SPLIT the positive control (architect MEDIUM -- provenance
  at read != weighted at consume):** assert (a) the edge PASSES `verifiedRecords` (the key-custody proof), AND (b)
  the edge is WEIGHTED nonzero (the consume proof) -- and SEED the weighting precondition explicitly: for VOUCH,
  build a me-graph where the broker edge lies on a path from `meDid` (else `disjoint_paths=0`); for CONFIRM, first
  mint a broker-persona CLAIM so `earnedStandingPersonas` includes it + confirmer-human != premise-creator (else it
  contributes 0). A zero-weight-but-verified edge must NOT read as success. Freshness-bound edge is the DEFAULT
  (Open Decision 1); a foreign-persona frame is denied.
- **W1 -- the attestation / proof harness.** Positive control (a seeded legit own-persona frame -> accepted +
  weighted) + negative controls, each NON-VACUOUS, machine-checkable (mirror `custody-verify.js assessCustody` ->
  `hostObservableChecksPassed`, NEVER a bare `hardened`): (a) host `cat` the key -> `EACCES`; (b) host foreign-persona
  frame -> broker `persona-mismatch` deny; (c) host in-process `signRecordId` no-key -> fail; (d) [if R-heap re-run]
  `gcore` extract -> denied; **(e) THE APEX NON-VACUOUS CONTROL (hacker MEDIUM): host generates a keypair,
  SELF-REGISTERS an attacker persona in the SAME registry `read-gate` uses, self-signs a VOUCH/CONFIRM under it (no
  broker) -> ASSERT the readout does NOT credit it with broker-equivalent standing.** Controls (a)/(b)/(d) re-prove
  BROKER properties (already dogfooded); (e) is the NEW read-side property -- without it the harness proves the old
  claim, not the apex one. Runs SHADOW same-uid in CI; the cross-uid legs run only at deploy.
- **W2 -- the runbook delta + the deploy-readiness checklist.** The signing-into-the-graph procedure; the exact
  operator steps; the attestation script. **MANDATORY attestation gates (architect LOW):** the DID-consistency triple
  (wrapper `PACT_BROKER_PERSONA_DID` == registry entry DID == verifier `--persona`), register the broker persona's
  PUBLIC key in the host registry, and run `assertBrokerPersona` (the NS-2 key<->persona proof the §4 ceiling names)
  -- a green `assertBrokerPersona` is the precondition for the W1 positive control to produce a verified edge (else
  the edge silently drops as `unregistered-sender`, a misconfig masquerading as a custody fault). No code deploy.
- **(USER) the deploy + attestation** -- the operator act; then Claude's verifier confirms the HARDEN out-of-band.

Each wave: plan -> VERIFY (architect + hacker, the hacker attacks the co-forge-closed claim) -> TDD build ->
VALIDATE 3-lens -> PR. SHADOW throughout; the deploy is separate.

## §6 What this does NOT do (NS-9)

- Does NOT gate any action or flip `convert.actionable` (U2 open). Real provenance INFORMS, does not gate.
- Does NOT deploy anything, create a uid, write /etc, install a key, edit sudoers, set a flag, or run `--attested`
  -- the operator deploy is the USER's (NS-7).
- Does NOT close R3 / own-key forgery (U1) -- a different frontier.
- Does NOT claim a standing HARDEN -- the attestation is one box / one run / one axis (R-heap ceiling).
- Does NOT report the provenance HARDEN as a TRUST close -- provenance != gating; the weight stays SHADOW (NS-9).

## §7 Open decisions for the USER

1. **Freshness: default ON (revised per VERIFY-hacker LOW).** The replay vector IS real -- the edge sig is over the
   bare `record_id` (no approvedAt/nonce; `appendRecord` dedups duplicates, not replays), so a same-uid host replays
   a legit broker-signed edge indefinitely. **Revised default: the freshness-bound edge (plans/29's approvedAt+nonce
   basis) is the DEFAULT, not a defer.** A BARE edge is acceptable ONLY while the weight is SHADOW AND §4 carries
   replay as a NAMED residual that MUST close before U2 gates. Decision for the USER: fold plans/29's freshness leaf
   into W0 now (more code, replay-resistant), or ship the bare edge with replay as a loud named residual (thinner,
   honest, closes before gating)?
2. **Which edge type carries the first provenance?** VOUCH (feeds convert/consensus) or CONFIRM (feeds cross-verify).
   Recommended: VOUCH (the most-consumed; convert is the flagship readout).
3. **Deploy target.** Reuse the `rheap` multipass Ubuntu VM or a fresh local cross-uid setup on the Mac (no
   `ptrace_scope=2`, so the memory-extract leg is weaker)? Recommended: the multipass VM (strongest axis). **RE-PROBE
   AT DEPLOY (architect LOW):** the resume anchor's "still deployed" is a decayable external-state claim; the
   r-heap ceiling notes the `ptrace_scope=2` / swapoff / `core_pattern` locks are NOT reboot-persistent. Before W3
   relies on it, re-verify on the live box: `sysctl kernel.yama.ptrace_scope` (=2), `swapon --show` (empty),
   `cat /proc/sys/kernel/core_pattern`. Treat "still deployed" as a claim to confirm, not a standing fact.
4. **Scope: this arc, or hold for U2?** Real edge provenance does not GATE until U2. Build the provenance HARDEN now
   (it is the honest world-anchored apex signal, standalone-valuable per OQ-NS-6), or hold until U2 is on the horizon
   so provenance + gating land together? Recommended: build now -- OQ-NS-6 says only a world-anchored signal HARDENS,
   and this is the first one available; U2 is a separate, harder (identifiability-bounded) frontier.

## §8 Pre-scope VERIFY board (2-lens, wf_e26a7bd2-375) -- folded

**architect SOUND-WITH-CHANGES · hacker SOUND-WITH-CHANGES.** The composition is sound at the KEY-CUSTODY layer
(all four broker-key legs verified firsthand); the folds sharpened the honest ceiling:

- **[hacker HIGH] the registry is host-writable -> the FIFTH co-forge leg.** `read-gate` keys on
  `lookupPublicKey(registry, src_persona_did)`, not "the broker signed this". A host self-registers its own persona
  + self-signs. FOLDED: added the 5th leg to §2, reframed the header + §4 -- the HARDEN is on the broker persona's
  KEY-CUSTODY, NOT "the edge proves who"; the registry binding + consumer-privileging are SEPARATE open anchors.
- **[hacker MEDIUM] proof vacuity.** Three of four negative controls re-prove already-dogfooded BROKER properties,
  not the new READ-side property. FOLDED: W1 gains control (e) -- host self-registers + self-signs -> assert the
  readout does NOT credit it with broker-equivalent standing (the apex non-vacuous control).
- **[hacker LOW] replay.** The bare-`record_id` sig is replayable. FOLDED: freshness is now the DEFAULT (Open
  Decision 1 revised); replay is a named §4 residual that MUST close before gating.
- **[architect MEDIUM] provenance-at-read != weighted-at-consume.** FOLDED: W0 splits the positive control into
  passes-verifiedRecords vs weighted-nonzero + seeds the weighting precondition (VOUCH graph path / CONFIRM earned
  standing).
- **[architect LOW] the broker-persona registration + `assertBrokerPersona` DID-consistency triple** is now an
  explicit W2 mandatory attestation gate. **[architect/hacker LOW] the multipass VM state** is re-probed at deploy
  (not reboot-persistent). **[architect LOW] cross-verify path citation** corrected in §1.

**Net:** the arc is worth building as the first world-anchored KEY-CUSTODY signal on a live edge (OQ-NS-6), scoped
HONESTLY -- it hardens the broker key's non-compromisability, NOT "the edge proves who." The registry-binding
provenance + consumer-privileging + U2-gating + replay-freshness are the named, still-open frontiers beyond it.

## §9 USER decision (2026-07-01) -- REFRAMED: registry-binding first

The VERIFY board's hacker HIGH (the host-writable registry = the 5th co-forge leg) reframed the honest ceiling:
this arc HARDENS the broker persona's KEY-CUSTODY, but `read-gate` trusts a host-writable persona<->key binding, so
"the edge proves who" stays FALSE. **USER decision: tackle the REGISTRY BINDING (registration-provenance) FIRST** --
key-custody without a trustworthy persona<->key binding is half the story, and the binding is arguably the bigger gap.

- **This broker-signing HARDEN arc is HELD** (SCOPED, not started) behind the registry-binding work. It resumes once
  registration-provenance is scoped/addressed -- the two compose (a custody-hardened broker key is only meaningful
  once the registry says-this-is-the-broker is itself anchored).
- **Recorded edge-shape decision for when it resumes: FRESHNESS-BOUND VOUCH** -- fold plans/29's approvedAt+nonce
  freshness leaf into W0 (closes the replay vector, hacker LOW) + VOUCH (most-consumed; simpler weighting seed than
  CONFIRM's earned-standing pair). This decision stands; the arc just waits its turn.
- **NEXT: plans/31** -- the registration-provenance scoping (the persona<->key binding anchor). See there.
