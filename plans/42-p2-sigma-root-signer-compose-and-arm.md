---
lifecycle: persistent
status: SCOPING -- plan authored; pre-build VERIFY pending (no code yet)
source: architect-led recon (p2-signer-recon workflow, 2026-07-05) + Loom->PACT handoff (broker key vet)
---

# Plan 42 -- P2: compose + arm the (already-built) sigma-root cross-uid signer

## TL;DR -- the reframe (recon-completeness)

"P2 -- land the Phase-6 world-anchored signer" is **NOT a from-scratch signer build.** An architect-led recon over
`plans/30` + the broker-signing arc (`plans/34`-`38`, W0-W4) + the arming path found that the signer, the cross-uid
vehicle, the `{signer}` seam, the arming primitive, the `signingArmed` consumer, the registration-provenance
anchor, and the persona-key custody check are **ALL already built and shipped**. The precondition `plans/30 §9`
named (registration-provenance -- `plans/31`/`32`/`39`) has **landed**. What remains is a thin **compose-and-arm**
layer, plus docs, plus **one** genuinely-unbuilt code seam.

## Built-vs-gap ledger

**ALREADY BUILT (cite -- do not rebuild):**

- The `{signer}` custody seam -- `v0/src/lib/edge-attestation.js:70-103` (`resolveSigner` / `signRecordId`; threads
  the frame body for R2-WHAT recompute-bind). There is no seam to add.
- The cross-uid signer vehicle -- `v0/src/identity/broker-launch.js` (`crossUidBrokerSigner`, sudo-flag-guarded,
  absolute-path-guarded) + `broker-sign.js` (the separate-process key loader) + `broker-client.js` (`brokerSigner`,
  canonical-base64 output re-gate).
- The sigma-root `{signer}` acceptance -- `v0/src/identity/sigma-root.js:52-61` (`signSigmaRoot` accepts `{signer}`
  OR `{privateKeyPem}`, `{signer}` precedence). Forward-declared at `:54`; never instantiated live.
- The arming primitive + consumer -- `v0/src/trust/arming-coherence.js:42-65` (strict `=== true` both-or-neither,
  observable-on-incoherent) + `v0/src/trust/admission-gate.js:45-64` (reads `signingArmed` on its own guarded path,
  fails closed).
- The registration-provenance anchor `plans/30 §9` REQUIRED FIRST -- `registry.registerRoot` / `lookupRootKey`
  (first-writer-immutable) + `registration-provenance.js` (#273-clean: re-derives from frozen rows, verifies
  ed25519, never trusts a self-asserted field) + the read-side filter `registration-gate.js` (`plans/39`,
  wired-live-disarmed into `convert.disjointPaths`). **The precondition is DONE.**
- The persona-key custody check -- `broker-client.js` `assertBrokerPersona` (one real broker round-trip; throws on
  key mismatch -- the NS-2 integrity-not-provenance guard `plans/30 §4` mandates).
- The DARK admission gate + proof-board pattern -- `admission-gate.js` + `test/integration/edge-provenance-proof.test.js`
  (the harness to mirror).

**THE GAP (the actual P2 work):**

1. **The one unbuilt code seam** -- no code path constructs `signSigmaRoot(binding, {signer: crossUidBrokerSigner(...)})`.
   `broker-sign.js` signs VOUCH/frame `record_id`s, NOT sigma-root bindings. The root-signing custody boundary is
   forward-declared only (`sigma-root.js:54`).
2. **The `signingArmed` PRODUCER + coherent compose-and-mint call site** -- `admissionDecision` CONSUMES
   `signingArmed`, but nothing in live code SETS it, and no module composes `armingDecision` -> a cross-uid signer
   -> a minted, weighted, sigma-root-anchored live edge.
3. **Docs** -- the signing-INTO-the-graph runbook + the deploy-readiness attestation (the DID-consistency triple)
   has never been written (`plans/32` covers only the root-key seed).

## The real gap (one paragraph)

P2 is not "build a signer" -- the `{signer}` seam, the cross-uid signer vehicle, the sigma-root `{signer}`
acceptance, the strict both-or-neither arming primitive, the `signingArmed` consumer, the registry root-key anchor,
the SHADOW sigma-root verifier, and the `assertBrokerPersona` custody check are all already built and shipped
(registration-provenance landed via `plans/31`/`32`/`39`, which `plans/30 §9` named as P2's precondition). The
precise remaining work is a thin compose-and-arm layer: (a) instantiate a live sigma-root cross-uid broker by
passing `crossUidBrokerSigner(...)` as the `{signer}` into `signSigmaRoot` (the one unbuilt code seam) so the root
key that authorizes persona bindings lives on a separate uid the host cannot read; (b) add the `signingArmed`
producer + a coherent call site that composes `armingDecision` with that signer and mints a world-anchored VOUCH
edge which `verifiedRecords` verifies and `registration-gate` / `convert.disjointPaths` weights on read; (c) write
the signing-into-the-graph runbook + the mandatory DID-consistency-triple deploy attestation. All of it ships
SHADOW/disarmed (byte-identical when disarmed, per the `plans/36`/`39` wired-live-disarmed precedent). The actual
HARDEN is the operator's out-of-band root-key attestation and arm-flag set (NS-7), which Claude never performs. It
informs, it does not gate -- U2 stays open, so `convert.actionable` remains hard-false.

## Prerequisite security fix (folded into Wave 0) -- owner-only broker key vet

A Loom->PACT handoff (`~/Documents/claude-toolkit/docs/handoff-pact-broker-sign-keyperm.md`) surfaced that
`broker-sign.js:135` masks `& 0o022` (write bits only), so a `0644`/`0640` group/world-**READABLE** private signing
key PASSES the vet -- a custody-bypass-class hole (a third uid in the broker's group can read the signing key and
sign directly, no `sudo`, no broker process). Power Loom hit the identical bug (CodeRabbit Major) and hardened to
`& 0o077` (owner-only). **P2's sigma-root broker installs a NEW private root key -- this vet must be owner-only
FIRST.** Fix: `broker-sign.js:135` `& 0o022` -> `& 0o077` + the message/comment; **flip** `broker.test.js:198-199`
(a `0644` key must now be REFUSED; keep a `0600`-passes case so the vet stays non-vacuous). This resolves the
recon's open question about the handoff doc.

## Runtime Probes (Wave 0 -- repo state decays; re-probe at build time)

- Probe: `grep -n "signer" v0/src/identity/sigma-root.js` -> the `{signer}` seam still unwired live (forward-decl only).
- Probe: `grep -rn "signingArmed" v0/src/` -> `admission-gate.js` still the sole reader; nothing SETS it live.
- Probe: `grep -n "registration-gate\|filterAnchoredRecords" v0/src/trust/convert.js` -> still wired-live-disarmed.
- Probe: `grep -rn "crossUidBrokerSigner\|signSigmaRoot(" v0/src/` -> NO live sigma-root broker instantiation (expect none).
- Probe: `sed -n '135p' v0/src/identity/broker-sign.js` -> `& 0o022` still present (the vet to harden).
- Probe: `grep -n "actionable" v0/src/trust/convert.js` -> `convert.actionable` still hard-false (U2 open).

## Plan skeleton (waves -- no code here; the build follows AFTER the VERIFY board)

- **Wave 0 -- re-probe + scope-lock + the key-vet fix.** Re-run the probes above against HEAD; record each
  `(claim, probe, result)` inline. Apply the owner-only broker key-vet fix (`& 0o022` -> `& 0o077` + test flip).
  Lock edge type = VOUCH, freshness-bound (`plans/30 §9` recorded decision). Settle the open questions below.
- **Wave 1 -- the live sigma-root cross-uid broker (the one unbuilt code seam).** NEW `v0/src/identity/sigma-root-broker.js`
  (or extend `broker-sign.js` to sign sigma-root BINDINGS while keeping the CLI/loader custody boundary) composing
  `signSigmaRoot(binding, {signer: crossUidBrokerSigner({brokerUser, wrapperPath})})`. **No new seam** -- reuse the
  `{signer}` precedence already in `signRecordId` / `resolveSigner`. Assert the root broker signs ONLY sigma-root
  bindings (`BINDING_TYPE` tag + disjoint-required-field separator, `sigma-root.js:24`) so it can never be coerced
  into signing a frame `record_id`. Tests: unit (signs a binding `verifySigmaRoot` accepts under the seeded root
  pubkey; a foreign binding refused); integration (sudo-shaped stub -> `assessRegistrationFromRegistry` returns
  `sigmaRootChecksPassed=true`).
- **Wave 2 -- the `signingArmed` PRODUCER + coherent compose-and-mint call site.** NEW `v0/src/trust/signing-armed-mint.js`
  that (i) calls `armingDecision({admissionArmed, signingArmed})` FIRST on its own guarded path (mirror
  `admission-gate.js:45-64`), (ii) only when coherent+armed constructs `createMinter({signer: crossUidBrokerSigner(...),
  personaDid, humanUid})`, (iii) runs `assertBrokerPersona` at wire time (loud mis-wire throw), (iv) mints a
  freshness-bound VOUCH, (v) leaves it for `verifiedRecords` -> `registration-gate.filterAnchoredRecords` ->
  `convert.disjointPaths` to verify + weight on read. **DISARMED by default = byte-identical.** Tests: unit
  (disarmed = no mint, byte-identical; armed-but-incoherent emits + fails closed; armed+coherent mints);
  integration (real mint -> read-gate -> convert: armed adds a world-anchored edge to the disjoint-path count,
  `actionable` STILL false); darkness witness (exact-set importer allowlist; no live fold pulls this in when disarmed).
- **Wave 3 -- the proof board + non-vacuous negative controls (mirror `plans/38`).** Positive control SPLIT
  (`plans/30 §5` W0 architect MEDIUM): a seeded legit own-persona sigma-root-anchored VOUCH -> PASSES `verifiedRecords`
  AND is weighted nonzero. Negative controls EACH PROVEN able to fire RED: (a) host `cat` the key -> `EACCES`;
  (b) foreign-persona frame -> broker persona-mismatch deny, empty stdout; (c) in-process `signRecordId` no-key ->
  fail; (d) **THE APEX** (`plans/30 §5` W1 control e): host self-`registerRoot`s + self-signs under its OWN persona
  -> ASSERT KEPT-but-not-broker-privileged (SHADOW pass, NARROW not close; the self-seed POSITIVELY passes the
  crypto judge, so KEPT is provably integrity-not-provenance). Every control asserts a machine-checkable field,
  never a bare "hardened".
- **Wave 4 -- runbook + deploy-readiness attestation (docs only, no deploy).** `docs/deployment/` gains the
  signing-INTO-the-graph procedure (distinct from `plans/32`'s root-key-seed runbook): seed the genesis root in a
  clean registry (root-key-squat ordering invariant), install the sigma-root broker key `0600` under the broker
  uid, set `REQUIRE_FRAME` + `ALLOWED_UIDS` + `PERSONA_DID`, and the MANDATORY DID-consistency triple gate (wrapper
  `PACT_BROKER_PERSONA_DID` == registry entry DID == verifier `--persona`) with a green `assertBrokerPersona` as the
  precondition. Name every residual LOUD. Claude writes it; the USER runs deploy + arms + attests (NS-7).
- **Wave 5 (USER, not Claude) -- the operator deploy + out-of-band attestation.** Create the broker uid, install
  keys, edit sudoers, set the arm flag (`signingArmed`), register the broker persona, attest `K_root_pub`
  out-of-band. Then Claude's verifier re-confirms the HARDEN out-of-band. **This is the ONLY step that turns the
  SHADOW composition into a world-anchored HARDEN** -- the operator's trust act (the potential 7th signal).

## Security invariants (load-bearing)

- **#273 authenticated-minter:** trust is derived from an AUTHENTICATED minter (a cross-uid broker the caller
  cannot invoke, signing a sigma-root the verifier re-derives and re-verifies on read), NEVER from a record's mere
  presence in an open-writable store. `assessRegistrationFromRegistry` re-derives the binding from the FROZEN
  registry rows and re-verifies ed25519 -- the injected sigma-root map value is a HINT, never trusted. Integrity
  (self-consistent record) != provenance (legitimate minter signed it): P2 hardens the broker persona's
  KEY-custody only; the same-uid self-`registerRoot`+self-sign co-forge stays OPEN and must be labeled NARROW-not-close.
- **Key never materializes in the host process:** the sigma-root root key lives under a different OS uid, `0600`,
  loaded ONLY in-process in the separate broker (the `broker-sign.js` pattern: `O_NOFOLLOW` atomic open,
  fstat-on-fd swap-resistance, owner-only `& 0o077` mode reject [Wave 0 fix], fixed no-echo errors, key bytes /
  `err.stack` NEVER printed). `createMinter` structurally rejects any option but `{signer, personaDid, humanUid}` --
  passing raw `privateKeyPem` must throw loudly, never silently degrade to an ambient key.
- **Exact-set / strict authorization, never subset or truthy:** `armingDecision` strict-coerces BOTH arms
  `=== true` -- a truthy non-boolean must never fake an armed state; both-or-neither coherence. The forgery
  classification stays a WHITELIST (`failed.length === 1 && failed[0] === R3_VERIFIES`), never an exclusion list.
  The armed path reads the arm on its OWN guarded path BEFORE the attacker-influenced record fields, so a poisoned
  getter fails CLOSED, never collapses to disarmed-admit-all.
- **Fail-closed AND observable:** every reject on the signing/arming path emits telemetry (`refuseAlert`), never a
  silent `{ok:false}` -- an incoherent arm, a body-hash / persona mismatch, an unseeded root, or a verifier throw
  must surface. A deploy FLAG that gates the privileged signing path parses ASYMMETRICALLY -- a garbage/typo token
  fails CLOSED (intent-to-deploy -> refuse), never silently runs the unprivileged direct path. VALIDATE env/flag
  fuzz MUST include typos/garbage tokens, not just the valid on/off set.
- **Non-vacuous + non-bypassable guards:** every negative control in the proof board must be PROVEN able to fire
  RED (inject the violation, watch it fail, revert) -- a control asserted against an absent precondition passes
  vacuously and proves nothing (the APEX self-register control asserts the self-seed POSITIVELY passes the crypto
  judge, so KEPT is provably integrity-not-provenance = exactly why NARROW != close). SHADOW throughout:
  `convert.actionable` stays hard-false; disarmed = byte-identical; the HARDEN is ONLY the operator's out-of-band
  attestation, never an in-process claim.

## What P2 does NOT do (NS-9 residuals -- stay LOUD)

- Does NOT gate -- `convert.actionable` stays hard-false; provenance INFORMS, never GATES. U2 is the separate,
  harder frontier (`plans/41`).
- Does NOT close the 5th co-forge leg -- a same-uid host self-`registerRoot`s + self-signs under its OWN persona and
  passes even armed; recursion bottoms out ONLY at the operator's out-of-band root-key attestation (NS-7).
- Does NOT close R3/U1 own-key forgery (the issuance-cost frontier).
- One-box / one-run -- the R-heap ceiling; SHADOW throughout; disarmed = byte-identical.

## Open questions (USER decisions -- settle before Wave 1)

1. **Freshness scope for the root-signing path** -- does the sigma-root BINDING itself need a freshness/rotation
   epoch (`key_epoch` is a disclosed forward residual), or is binding-replay acceptable while SHADOW (name it a loud
   residual)? Fold rotation now, or defer?
2. **Deploy target + custody posture** -- reuse the rheap multipass VM (`ptrace_scope=2`, strongest R-heap axis) or
   a fresh Mac cross-uid setup (weaker memory-extract leg)? Does the root key share the broker uid or get its OWN
   distinct uid (`plans/32` keeps root custody SEPARATE from broker-persona custody)? Re-probe
   `kernel.yama.ptrace_scope`, `swapon --show`, `core_pattern` at deploy (decayable external state).
3. **Scope boundary -- P2 now, or hold for U2?** Provenance does NOT gate until U2 closes (`convert.actionable`
   hard-false). Build the world-anchored signing HARDEN standalone now (OQ-NS-6: only a world-anchored signal
   HARDENS, and this is the first available), or hold until U2 so provenance + gating land together? Recon
   recommends build-now; the USER ratifies given P2 is INFORM-only.
4. ~~The handoff doc~~ -- **RESOLVED** (read; the owner-only broker-key-vet fix is folded into Wave 0 above).
5. **Arm-signal shape** -- does the P2 mint producer reuse the `signingArmed` / `admissionArmed` both-or-neither
   pair, or take its OWN distinct deploy-DI opt-in (mirroring `plans/39`'s choice of a distinct `meCtx.regProvenance`
   to keep arms narrow, interface segregation)?

## Sequencing

W0 (re-probe + key-vet fix + settle open Qs) gates W1. `plans/31` (the precondition `plans/30 §9` named) is DONE,
so the arc can resume. W1 -> W2 -> W3 are code (SHADOW/disarmed, byte-identical when off); W4 is docs; W5 is the
operator deploy + out-of-band attestation (USER, NS-7) -- the ONLY step that turns the SHADOW composition into a
world-anchored HARDEN, and the potential 7th signal.

## Pre-build VERIFY -- PENDING

Per the kernel/security/auth 3-lens discipline, run a VERIFY board (architect + code-reviewer + hacker) against
this plan BEFORE building W1. Not yet done. `/verify-plan`, or an explicit 3-lens spawn, is the next gate.
