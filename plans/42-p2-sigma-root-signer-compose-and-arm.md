---
lifecycle: persistent
status: W1 DESIGNED -- pre-build 3-lens VERIFY PROCEED-WITH-FOLDS (folds baked into the W1 design below); ready to build (no code yet)
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

## Prerequisite security check -- owner-only broker key vet (ALREADY APPLIED; verify-only)

A Loom->PACT handoff (`~/Documents/claude-toolkit/docs/handoff-pact-broker-sign-keyperm.md`, 2026-06-24) flagged
that `broker-sign.js` masked `& 0o022` (write bits only), letting a `0644`/`0640` group/world-**READABLE** private
signing key pass the vet -- a custody-bypass-class hole. **RE-PROBED 2026-07-05: ALREADY FIXED.** PR #19
(`facf65d`) hardened the vet to owner-only (`broker-sign.js:149`, `& 0o077`), and `v0/test/integration/broker.test.js`
is non-vacuous (`0644` refused, `0640` refused, `0600` passes). The handoff doc's "not yet applied" status was
written BEFORE #19 merged and had decayed (status-decay). **So there is NO Wave 0 code fix -- it is a verified
precondition** for P2's sigma-root broker key install, which reuses the same vet. (The remaining `& 0o022` hits are
in `custody-verify.js` -- a separate, correct wrapper-WRITABLE check, not the private-key vet.)

## Runtime Probes (Wave 0 -- repo state decays; re-probe at build time)

- Probe: `grep -n "signer" v0/src/identity/sigma-root.js` -> the `{signer}` seam still unwired live (forward-decl only).
- Probe: `grep -rn "signingArmed" v0/src/` -> `admission-gate.js` still the sole reader; nothing SETS it live.
- Probe: `grep -n "registration-gate\|filterAnchoredRecords" v0/src/trust/convert.js` -> still wired-live-disarmed.
- Probe: `grep -rn "crossUidBrokerSigner\|signSigmaRoot(" v0/src/` -> NO live sigma-root broker instantiation (expect none).
- Probe: `grep -n "0o077" v0/src/identity/broker-sign.js` -> owner-only key vet present (ALREADY hardened via #19; no fix needed).
- Probe: `grep -n "actionable" v0/src/trust/convert.js` -> `convert.actionable` still hard-false (U2 open).

## Plan skeleton (waves -- no code here; the build follows the VERIFY board)

- **Wave 0 -- re-probe + scope-lock.** Re-run the probes above against HEAD; record each `(claim, probe, result)`
  inline. VERIFY the owner-only broker key vet (already applied via #19 -- no code change; the sigma-root broker
  reuses it). Lock edge type = VOUCH, freshness-bound (`plans/30 §9` recorded decision). Settle the open questions below.
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
- **Wave 4 -- runbook + deploy-readiness attestation (docs only, no deploy).** [**SUPERSEDED by §W4.0-§W4.5 below**:
  this skeleton's frame-broker `PACT_BROKER_PERSONA_DID` / `assertBrokerPersona` DID-triple is WRONG for the root broker
  -- the root broker has NO persona; the check is a CONTROLLER triple and there is no `assertBrokerPersona` analog
  (recon-completeness). The as-built delta + placement are in §W4.] `docs/deployment/` gains the
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
  fstat-on-fd swap-resistance, owner-only `& 0o077` mode reject (already applied, #19), fixed no-echo errors, key bytes /
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
4. **Arm-signal shape** -- does the P2 mint producer reuse the `signingArmed` / `admissionArmed` both-or-neither
   pair, or take its OWN distinct deploy-DI opt-in (mirroring `plans/39`'s choice of a distinct `meCtx.regProvenance`
   to keep arms narrow, interface segregation)?

## Sequencing

W0 (re-probe + scope-lock + settle open Qs) gates W1. `plans/31` (the precondition `plans/30 §9` named) is DONE,
so the arc can resume. W1 -> W2 -> W3 are code (SHADOW/disarmed, byte-identical when off); W4 is docs; W5 is the
operator deploy + out-of-band attestation (USER, NS-7) -- the ONLY step that turns the SHADOW composition into a
world-anchored HARDEN, and the potential 7th signal.

## Pre-build VERIFY -- DONE (Wave 1): PROCEED-WITH-FOLDS

A 3-lens board (architect + code-reviewer + hacker) ran 2026-07-05 against a grounded W1 draft + the real files
(`sigma-root.js`, `request-auth.js`, `broker-sign.js`, `broker-client.js`, `broker-launch.js`, `edge-attestation.js`,
`record.js`, `caller-auth.js`, `arm-flags.js`). All three returned **PROCEED-WITH-FOLDS** -- zero CRITICAL, zero
NEEDS-REVISION. (Mechanism note: the first attempt was a schema'd Workflow that exhausted the StructuredOutput
retry cap; re-run as free-text parallel agents, which is what produced these findings. No schema, no choke.)

- **Architect (design/factoring):** PROCEED-WITH-FOLDS. Headline fold: do NOT copy-paste the TOCTOU-hardened key
  vet into a second entrypoint -- extract a shared `broker-core.js`. Second fold: the root broker needs its OWN
  WHO-allowlist, not the frame broker's. Keep the binding gate a SIBLING module (do not over-abstract).
- **Code-reviewer (correctness):** PROCEED-WITH-FOLDS. Confirmed the `signSigmaRoot` body-thread is back-compat
  (every existing caller passes `{privateKeyPem}`; `resolveSigner`'s closure ignores the 2nd arg,
  `edge-attestation.js:80`). Folds: mirror the trust-side-only ASCII-trim asymmetry; a grep forward-guard test; the
  `recordIdToSign: null`-on-every-deny invariant; preserve the per-branch close-before-fail control flow verbatim.
- **Hacker (adversarial, LIVE probes -- reproduced the collision, not paper reasoning):** PROCEED-WITH-FOLDS.
  Must-folds: state key separation as the PRIMARY invariant + a same-inode-refusal test (HIGH-1);
  `resolveRequireBinding` MANDATORY default-ON + asymmetric flag parse (HIGH-2); controller-bind byte-mirrors
  `personaBinds` (MED-1). Name the raised-stakes `#273` residual LOUD (MED-2).

### The decisive finding (hacker HIGH-1, proven live)

**KEY SEPARATION -- not the `_type` tag, not the disjoint-field set -- is the only thing that defuses cross-protocol
signature reuse.** `computeRecordId` (the FRAME hasher, `record.js:52-60`) is field-AGNOSTIC: feed the frame broker a
body that is byte-for-byte a binding preimage `{_type, controller, k_pub, persona_did}` and it computes and signs the
exact `computeBindingId` output. The hacker reproduced this live (`bindingId == frameId`, and the sigma-root sig
`verifyRecordSig`-accepted as a frame sig) **under a single key**. So if `PACT_ROOT_KEY_FILE` ever resolves to the
same inode as `PACT_BROKER_KEY_FILE`, the whole design silently collapses into a cross-protocol signing oracle for the
trust root. The `sigma-root.js:16-23` comment already hedges this ("computeRecordId is field-AGNOSTIC ... COULD be
made to collide"); the plan's earlier W1 skeleton had the rationale backwards (it leaned on the `_type` tag). The
load-bearing invariant is: **different keys + verifier-side domain-tag + recompute-bind-throws-on-a-frame-body.**

## Wave 1 -- detailed design (folds baked in)

### Recon-completeness correction to the gap statement

The built-vs-gap ledger above calls W1 "the one unbuilt code seam" -- `signSigmaRoot(binding, {signer: crossUidBrokerSigner(...)})`.
Grounding the design against HEAD showed that is an **undercount**. The cross-uid broker's entire WHAT-gate
(`authorizeRequest` -> `computeRecordId` + persona-bind on `src_persona_did`, `request-auth.js:90-118`) is
**frame-shaped**. A sigma-root binding has a DIFFERENT preimage (`computeBindingId`, `_type`-tagged, fields
`{personaDid, publicKeyPem, controller}` -- no `src_persona_did`). So merely wiring the `{signer}` seam does NOT
work: with require-frame ON the re-derived frame id `!=` the argv binding id -> `record-id-mismatch` (fail closed);
with require-frame OFF the root key signs the argv hex BLINDLY (a universal oracle). W1 therefore needs a
**binding-aware WHAT-gate + a custody-isolated root entrypoint**, not just the compose seam.

### The pieces (as folded)

**Piece A -- broker-side binding WHAT-gate (LOAD-BEARING, un-bypassable, runs in the separate uid).**
New pure module `v0/src/identity/binding-request-auth.js`, a SIBLING to `request-auth.js` (architect Q2: do NOT
unify behind a hasher-parameterized core -- the two hashers have OPPOSITE throw contracts; `computeRecordId` is
permissive on arrays/scalars while `computeBindingId` throws on any missing field, so a unified core would hide a
real security divergence). `authorizeBindingRequest({ requireBinding, claimedRecordId, presentedBodyRaw, brokerController })`:
- drain/parse the presented BINDING body (reuse the bounded stdin read + `MAX_FRAME_BYTES` cap).
- reject non-plain-object explicitly (MED-3: keep this even though `computeBindingId` would throw -- do not rely
  on the throw as the sole gate; a future `requireField` refactor could reopen it).
- **recompute-bind:** `id = computeBindingId(parsed)` wrapped in try/catch (a throw on a missing field -> fail
  closed, mirroring `recomputeBinds` at `request-auth.js:71-73`); require `id === claimedRecordId` -- sign the
  COMPUTED id, never the argv-asserted one.
- **controller-bind (MED-1 -- byte-mirror `personaBinds`, `request-auth.js:56-61`):** typecheck BOTH operands to
  non-empty string BEFORE the `===`; unset/whitespace-only `brokerController` -> explicit `deny('controller-unset')`.
  Do NOT lean on `computeBindingId`'s body-side throw to cover the equality gate -- they are orthogonal.
- ASCII-trim the TRUSTED side only (`brokerController` from env), byte-exact-untrimmed on the untrusted body's
  `controller` (code-reviewer: mirror the `request-auth.js:101` asymmetry + its rationale).
- every `deny` returns `{ decision, reason, recordIdToSign: null }` via a single `deny()` helper (code-reviewer:
  preserve the null-on-every-deny invariant structurally, not per-branch).

**Piece B -- extract `broker-core.js`; add a dedicated custody-isolated `sigma-root-broker.js` entrypoint.**
Architect F1 (highest-value fold): do NOT copy-paste the ~90 lines of swap-resistant key vet + bounded stdin drain +
caller-auth + fixed-no-echo fail + empty-stdout contract from `broker-sign.js` -- a forked copy of a TOCTOU-hardened
vet WILL diverge (a CodeRabbit Major already caught a mask bug in that exact vet once). Extract:
```
broker-core.js       (new)  -- runBroker({ keyFileEnv, authorizeFn, requireFlagName, policyEnvName, allowlistEnv, disabledNotice })
                               owns: readStdinBounded, authorizeCaller wiring, O_NOFOLLOW+fstat key vet (& 0o077),
                               close-before-fail control flow (verbatim -- do NOT consolidate into one try/finally),
                               fail()/stdout contract, last-resort main().catch.
broker-sign.js       (thin) -- runBroker({ keyFileEnv:'PACT_BROKER_KEY_FILE', authorizeFn:authorizeRequest,
                               requireFlagName:'PACT_BROKER_REQUIRE_FRAME', policyEnvName:'PACT_BROKER_PERSONA_DID',
                               allowlistEnv:'PACT_BROKER_ALLOWED_UIDS' })
sigma-root-broker.js (thin) -- runBroker({ keyFileEnv:'PACT_ROOT_KEY_FILE', authorizeFn:authorizeBindingRequest,
                               requireFlagName:'PACT_BROKER_REQUIRE_BINDING', policyEnvName:'PACT_ROOT_CONTROLLER',
                               allowlistEnv:'PACT_ROOT_ALLOWED_UIDS' })
```
Custody isolation is preserved because it lives at the PROCESS / uid / env boundary -- separate executables, separate
key-file envs, separate wrappers/uids. A shared LIBRARY does not co-locate the keys; only a shared PROCESS would.
- **HIGH-1 same-inode refusal (in `sigma-root-broker.js` / `broker-core`):** refuse if the resolved `PACT_ROOT_KEY_FILE`
  inode == the resolved `PACT_BROKER_KEY_FILE` inode. A mis-deploy that points both at one key is the cross-protocol
  oracle; fail closed + emit.
- **F2 independent WHO-gate:** the root broker reads `PACT_ROOT_ALLOWED_UIDS`, NEVER `PACT_BROKER_ALLOWED_UIDS` --
  reusing the frame allowlist would let anyone entitled to a K_broker frame sig also mint a K_root binding sig,
  defeating the isolation. Typically a NARROWER allowlist.
- **HIGH-2 mandatory fail-closed require-binding:** a new `resolveRequireBinding` mirroring `resolveRequireFrame`
  (`request-auth.js:43-47`) -- DEFAULT-ON gated on `PACT_ROOT_CONTROLLER` presence; explicit `1`/`0` override; run
  `assessEnableFlag('PACT_BROKER_REQUIRE_BINDING', raw)` for the misconfig alert; the deployed-signal reads through
  the asymmetric `isDeploySignalSet` so an operator TYPO fails CLOSED (a garbage token on a controller-unset box must
  NOT drop to the blind-argv passthrough -- that is a universal oracle for K_root). This promotes plan open-Q #3 from
  "open" to CLOSED-MANDATORY.

**Piece C -- host-side compose (thread the binding body).**
`sigma-root.js:57-61`: change `signRecordId(bindingId, rootSignerOpts || {})` to `signRecordId(bindingId, rootSignerOpts || {}, binding)`
-- pass the ALREADY-VALIDATED `binding` object as the preimage 3rd arg (code-reviewer: do not re-serialize; by that
point `computeBindingId` has already thrown-and-been-caught if malformed). Back-compat PROVEN: every existing
`signSigmaRoot` caller passes `{privateKeyPem}` (grep: `sigma-root.test.js`, `registration-gate*.test.js`,
`registration-provenance.test.js`, `admission-gate.test.js`); `resolveSigner`'s in-process closure is single-param
`(recordId)` (`edge-attestation.js:80`) so it ignores the body -- the direct path is inert. The cross-uid path uses
`crossUidBrokerSigner`/`brokerSigner`, which ALREADY forwards `body` on the child's stdin (`broker-client.js:66-68`),
so NO seam change is needed. Reuse `crossUidSudoArgs` verbatim for the root wrapper (LOW-2: no parallel argv builder).

**Piece D -- tests (non-vacuous; folds included).**
- unit `binding-request-auth`: valid binding -> allow (`id = computeBindingId`); a real, valid P-FRAME body ->
  deny AND assert `computeBindingId` THROWS on it (the non-vacuous proof of domain separation, code-reviewer T4);
  array/scalar -> deny; mismatched argv id -> `record-id-mismatch`; wrong controller -> `controller-mismatch`;
  unset controller -> `controller-unset`; whitespace-only controller -> deny (the trim asymmetry, T3); EACH deny
  asserts `recordIdToSign === null` and is proven to fire RED.
- `broker-core` / `sigma-root-broker`: a grep forward-guard test -- `sigma-root-broker.js` references
  `PACT_ROOT_*` and contains ZERO `PACT_BROKER_KEY_FILE` / `PACT_BROKER_PERSONA_DID` / `PACT_BROKER_ALLOWED_UIDS`
  (T1, the copy-paste-wrong-key catch); the same-inode refusal test (T2); fd-leak-across-N-iterations on the shared
  vet (T5); `broker-sign.js`'s EXISTING `broker.test.js` passes unchanged post-extraction (the behavioral-equivalence
  gate for W1a).
- integration: the full round-trip -- sign-through-broker -> `verifySigmaRoot` under the root PUBLIC key (T6,
  load-bearing: a broker that produces a sig that does not verify is the silent-mis-wire `assertBrokerPersona`
  exists to catch); a frame body refused; a blind argv hex (no body, require-binding ON) refused; the key vet still
  refuses `0640`/`0644`, passes `0600`.

### Sub-wave split (de-risk touching a live security file)

The `broker-core.js` extraction refactors `broker-sign.js` -- a LIVE, hardened, security-critical file. Split W1 so
the refactor is isolated and behavior-proven before any new signing path is added:
- **W1a -- extract `broker-core.js`** (behavior-preserving). Move the drain/caller-auth/key-vet/fail/stdout-contract
  into `broker-core`; `broker-sign.js` becomes a thin entrypoint injecting the frame params. GATE: `broker.test.js`
  (+ the whole suite) passes UNCHANGED -- that is the behavioral-equivalence proof. No new behavior in W1a.
- **W1b -- the binding path.** `binding-request-auth.js` + `sigma-root-broker.js` + the `signSigmaRoot` body-thread +
  `resolveRequireBinding` + the same-inode refusal + all Piece-D tests.

### Consolidated fold list (traceable to lens)

| # | Fold | Lens | Piece |
|---|---|---|---|
| F1 | Extract `broker-core.js`; do NOT copy-paste the key vet | architect | B / W1a |
| F2 | `PACT_ROOT_ALLOWED_UIDS` -- independent root WHO-gate (never reuse the frame allowlist) | architect + reviewer | B |
| F3 | Restate domain separation: recompute-bind-throw is the gate; `_type` tag + different keys are defense-in-depth | architect + hacker + reviewer | A |
| S1 | KEY SEPARATION is the PRIMARY invariant + a same-inode-refusal test (proven-live collision) | hacker HIGH-1 | B |
| S2 | `resolveRequireBinding` MANDATORY default-ON + asymmetric flag parse (typo fails CLOSED) | hacker HIGH-2 | B |
| S3 | controller-bind byte-mirrors `personaBinds` (both operands typechecked; unset -> explicit deny) | hacker MED-1 + reviewer | A |
| S4 | Name the raised-stakes `#273` residual LOUD in the module header (see residuals) | hacker MED-2 | A |
| C1 | Keep the explicit non-object reject (do not rely on the throw alone) | hacker MED-3 + reviewer | A |
| C2 | `deny()` always sets `recordIdToSign: null`; test asserts the field directly | reviewer | A |
| C3 | Preserve per-branch close-before-fail verbatim; do not consolidate into one try/finally | reviewer | B (subsumed by F1: one copy) |
| C4 | Sibling entrypoint needs its own last-resort `main().catch(() => fail('internal error'))` | reviewer | B |
| C5 | `signSigmaRoot` passes the already-validated `binding` object (no re-serialize) | reviewer | C |
| T1-T6 | Test folds: grep-guard, same-inode, whitespace-controller, valid-frame-throws, fd-leak, full verify round-trip | reviewer + architect | D |

### Environment variables (named before build -- F4)

- `PACT_ROOT_KEY_FILE` -- the K_root private key path (distinct inode from `PACT_BROKER_KEY_FILE` -- enforced).
- `PACT_ROOT_CONTROLLER` -- the root controller DID (e.g. `human:merlin95`); the policy env for controller-bind;
  unset -> fail closed in require-binding mode.
- `PACT_ROOT_ALLOWED_UIDS` -- the root broker's WHO-allowlist (independent of the frame broker's).
- `PACT_BROKER_REQUIRE_BINDING` -- the require-binding flag (default-ON when `PACT_ROOT_CONTROLLER` is set).

### Named NS-9 residuals (accepted for SHADOW; carried LOUD)

- **R1 (hacker MED-2) -- raised-stakes `#273` co-forge.** `computeBindingId` is exported and `k_pub`
  (`publicKeyPem`) is a CALLER-SUPPLIED string the root never independently authorized. controller-bind narrows to
  ONE controller, but WITHIN `human:merlin95` a same-uid caller who reaches the root broker can mint "K_root
  authorized MY key as persona P" for any P -- the payload-semantics ceiling, RAISED to the trust root. The
  `sigma-root-broker.js` module header MUST name this LOUD (do NOT inherit the frame broker's residual framing
  unchanged). Closes ONLY with a deployed + attested cross-uid signer (the same `#273`-close direction as the rest
  of the substrate); until then, integrity != provenance.
- **R2 (hacker LOW-1 + architect) -- replay/revocation is a `.v2` concern.** A sigma-root binding is idempotent
  (no nonce); a replayed signature re-asserts the same static (persona, key, controller) fact -- harmless WHILE the
  binding is a static truth. The risk emerges only if a later wave makes bindings REVOCABLE: a replayed
  pre-revocation sig. The `.v2` rotation-epoch format (`sigma-root.js:23`) is what carries the freshness/revocation
  field. Defer is safe ONLY with this assumption stated -- named here so the arm wave cannot forget it.
- **R3 -- back-compat callers are inert.** All current `signSigmaRoot` callers use `{privateKeyPem}`; the body 3rd
  arg is inert for them (probed, above). Open/Closed preserved.

### Open questions -- board dispositions

1. **Freshness scope (open-Q #1):** DEFER for SHADOW. `.v2` rotation-epoch carries revocation/freshness (R2). All
   three lenses concur.
2. **Deploy target + root uid (open-Q #2):** STILL a USER decision (rheap VM `ptrace_scope=2` vs a fresh Mac). The
   board's strong recommendation: the root key gets its OWN distinct uid + key file + allowlist (the whole point of
   Piece B's custody isolation). Re-probe `kernel.yama.ptrace_scope`, `swapon --show`, `core_pattern` at deploy.
3. **P2-now vs hold-for-U2 (open-Q #3):** BUILD NOW (recon recommended; USER ratified -- "start implementation").
   P2 is INFORM-only; `convert.actionable` stays hard-false.
4. **Arm-signal shape (open-Q #4):** DISTINCT `PACT_ROOT_*` opt-in (not a reuse of the frame broker's arms) --
   interface segregation, narrow arms (mirrors `plans/39`'s distinct `meCtx.regProvenance`). Settled by F2/F4.

### Runtime probes (re-run at W1 build time -- repo state decays)

- Probe: `grep -n "signRecordId(bindingId" v0/src/identity/sigma-root.js` -> confirm the body 3rd arg still unthreaded (Piece C target).
- Probe: `grep -rn "PACT_ROOT_KEY_FILE\|PACT_ROOT_CONTROLLER\|PACT_ROOT_ALLOWED_UIDS\|REQUIRE_BINDING" v0/src/` -> expect NONE (all new).
- Probe: `grep -n "readStdinBounded\|O_NOFOLLOW\|0o077\|authorizeCaller" v0/src/identity/broker-sign.js` -> the vet lines to extract into `broker-core` (W1a).
- Probe: `grep -n "function sign(recordId, body)\|spawnOpts.input" v0/src/identity/broker-client.js` -> confirm the stdin body-forward still present (Piece C rests on it).
- Probe: `grep -rn "computeRecordId(" v0/src/lib/record.js` -> confirm field-agnostic (the HIGH-1 collision premise).

## Pre-build VERIFY -- board transcript pointers

The three lens transcripts (architect / code-reviewer / hacker) ran 2026-07-05; their verdicts + folds are folded
into the Wave 1 design above. This section supersedes the earlier "PENDING" note. The next gate is the W1a build
(extract `broker-core`, behavior-preserving), then W1b (the binding path) -- both SHADOW/disarmed, byte-identical
when the require-binding flag is off.

## Wave 1 -- build result (as-built; accretion 2026-07-06)

- **W1a MERGED (#65)** -- `broker-core.js` extracted, `broker-sign.js` thinned. Behavior-preserving: the full
  suite passed UNCHANGED (`broker.test.js` 28/0); VALIDATE (code-reviewer + hacker) PROCEED, zero folds
  (code-reviewer ran a live 8-scenario byte-identity comparison; hacker 9 probes). CodeRabbit clean.
- **W1b BUILT** -- `binding-request-auth.js` (the WHAT-gate + `resolveRequireBinding`), `sigma-root-broker.js`
  (thin entrypoint), `broker-core.js` gained an OPTIONAL `distinctFromKeyFileEnv` same-inode refusal, and
  `sigma-root.js` threads the binding body (Piece C). Full suite 671/0, eslint clean, darkness-witness extended
  to prove the new modules stay import-dark.
- **W1b 3-lens VALIDATE (code-reviewer + hacker + honesty-auditor) on the built diff: all PROCEED.** Hacker ran
  40+ live probes, 0 K_root bypasses beyond the named residuals; honesty Grade A (no HIGH overclaim; #273
  named loud; SHADOW witnessed). Folds applied:
  - **Env rename (hacker M2):** the require-binding flag is **`PACT_ROOT_REQUIRE_BINDING`** as-built (uniform
    with the broker's other `PACT_ROOT_*` envs), NOT the design sketch's `PACT_BROKER_REQUIRE_BINDING` above
    (the mixed prefix was an operator footgun; it fails closed either way). The three `PACT_BROKER_REQUIRE_BINDING`
    mentions in the design sections above are superseded by this line.
  - **Distinct-inode-copy residual NAMED (honesty MEDIUM-3 + hacker M1):** the same-inode refusal catches an
    inode ALIAS (same file / symlink / hardlink), NOT a distinct-inode byte-identical COPY of K_root. That copy
    is a single logical key the guard misses; key-material distinctness is OPERATOR custody, and the LOAD-BEARING
    separation is the uid / process boundary. Carried loud in the `sigma-root-broker.js` header (NS-9).
  - Test-name hedge (honesty MEDIUM-1) + "proven live at VERIFY" citation tighten (honesty MEDIUM-2).
- **Residuals still open (NS-9, LOUD):** R1 raised-stakes #273 (a same-uid WHO-authorized caller mints
  "K_root authorized MY key as persona P" within the controller -- closes only with a deployed + attested
  cross-uid signer); the same-inode-not-same-material scope above; R2 replay/revocation -> `.v2` rotation-epoch.
  All SHADOW: the sigma-root broker is import-dark (darkness-witness), `convert.actionable` stays hard-false.
- **NEXT:** W2 (the `signingArmed` producer + compose-and-mint call site), then W3 (proof board), W4 (runbook),
  W5 (USER operator deploy + out-of-band attestation -- the only HARDEN, NS-7).

## Wave 2 -- design + build result (as-built; 3-lens pre-build VERIFY + build, accretion 2026-07-06)

### Recon-completeness correction (the SCAR-#30 probe -- VERIFIED by all 3 lenses)
The plan skeleton read W2 as "NEW `signing-armed-mint.js` that ... mints a freshness-bound VOUCH ... leaves it
for `verifiedRecords` -> `registration-gate` -> `convert`." Grounding at `951fda2` showed **two of the three are
ALREADY BUILT**: the mint (`identity/mint-fresh-vouch.js`, SHADOW/dormant) and the read-side
(`convert.disjointPaths` -> `vouch-freshness.filterFreshVouches`, wired-live-DISARMED = identity pass-through).
So W2's genuine net-new is ONLY the thin **arming-gated composition** + its darkness witnesses + the input-contract
split -- NOT a from-scratch mint or a read-side wiring.

### Pre-build 3-lens VERIFY -- all PROCEED-WITH-FOLDS (2026-07-06)
Free-text parallel agents (architect + code-reviewer + hacker), against the draft + the real files. Zero
NEEDS-REVISION. Decisive folds (baked into the build below):
- **[architect BLOCKING] Q2 -- gate the mint on the SIGNING arm ALONE**, not both-or-neither. Grounded firsthand
  in `arming-coherence.js:35-37`: the sign-then-admit STAGING contract (arm signing -> accumulate signed edges ->
  later arm admission) is the intended future contract, and `signingArmedMint` IS the edge-producer that makes it
  real; gating on both would foreclose the staging (and deadlock against admission-gate, which also gates on both).
  Coherence enforcement is the ADMISSION decision's job. (This OVERRODE the draft's + the code-reviewer's
  "gate on both" -- resolved by premise-probing the primitive.)
- **[architect BLOCKING] Placement -- `trust/`, not `identity/`** (NS-11: `identity/` may not import `trust/`; grep
  confirmed zero `identity->trust` edges). `signing-armed-mint.js` imports `trust/arming-coherence`.
- **[architect + code-reviewer] TOTAL contract (never-throws):** `mintFreshVouch` THROWS (not just `{ok:false}`);
  wrap it -> `{minted:false} + emit`. Map `{ok}`->`{minted}`.
- **[architect fold 6 + code-reviewer fold 6] `assertBrokerPersona` -> DEPLOY wiring (W4), not per-mint.** The
  signer is DI-injected pre-verified; the load-bearing custody check is the read-side sig-verify.
- **[architect fold 3/4 + hacker MED-1] input-contract split:** `deps` (static custody: signer/personaDid/humanUid/
  keyId) vs `request` (per-MINT: targetPersona/approvedAt/freshnessNonce/seq/nonce -- a fresh nonce EVERY mint).
- **[hacker MED-2] read the arms ONCE into locals inside the (a) try; pass LOCALS to `armingDecision`** (its
  destructure has no try/catch -- raw hostile input would escape uncaught = fail-SILENT).
- **[hacker HIGH-1] amend the EXISTING `mint-fresh-vouch-darkness-witness`** to a one-entry allowlist
  `[signing-armed-mint]` (else it snaps RED); + a new witness proves `signing-armed-mint` import-dark.
- **[hacker LOW-1] alert details** carry only `{class,cause}` -- never spread `deps`/`signer`/`input` (key-path leak).
- **[hacker MED-1 / R4] replay-within-TTL is UNBUILT** (`checkFreshnessWindow` is a `<=TTL` window, no
  consume-store): the deploy-DI MUST supply fresh high-entropy nonces per mint (`MIN_NONCE_LEN` is a floor).

### Built (all SHADOW / import-dark)
- **NEW `v0/src/trust/signing-armed-mint.js`** -- `signingArmedMint(input, deps, request)`, TOTAL. Arm read
  once-into-locals -> `armingDecision(locals)` for the incoherence EMIT only -> gate on `signingArmed === true`
  (disarmed -> no-mint, byte-identical) -> `mintFreshVouch(...)` in try/catch -> `{minted, frame?}`. Imports EXACTLY
  `{arming-coherence, mint-fresh-vouch, refuse-alert}`.
- **Amended** `mint-fresh-vouch-darkness-witness` (one-entry allowlist) + **amended** `arming-darkness-witness`
  (two-entry: `{admission-gate, signing-armed-mint}` -- the suite caught this THIRD containment witness) + **NEW**
  `signing-armed-mint-darkness-witness` (import-dark + exact-import-set).
- **NEW** `signing-armed-mint.test.js` (11 cases: disarmed/incoherent/arm-throw -> no-mint with a SPY signer
  proving the mint is never reached; staging + coherent -> mint; end-to-end round-trip through the real read path;
  mint-throw + `{ok:false}` -> `{minted:false}`+emit; two-nonce distinction; per-mint uniqueness).
- **GATE:** full suite 53 files / 688 passed / 0 failed; eslint clean.

### Residuals (NS-9, LOUD)
- **R1 #273 UNCHANGED** -- a same-uid holder mints an AUTHENTIC fresh VOUCH under its OWN key; the arming gate adds
  arm-coherence + a deploy wire-check, NOT provenance (verbatim from `mint-fresh-vouch.js:12-17`).
- **R4 (new) -- replay-within-TTL UNBUILT** -- `checkFreshnessWindow` is a `<=TTL` window, NO consume-store /
  nonce-burn; a minted VOUCH is replayable in-window by re-append. Deploy-DI supplies fresh high-entropy nonces
  per mint; the reader's one-shot consume-store is a future wave. Tolerable only because SHADOW + `actionable:false`.
- **R5 -- custody wire-check is a DEPLOY step** (W4); `signingArmedMint` assumes a pre-verified signer.
- **NEXT:** W3 (proof board), W4 (runbook + the deploy wire-check), W5 (USER operator deploy + attestation -- NS-7).

## Wave 3 -- design (the sigma-root PROVENANCE PROOF BOARD; pre-build 3-lens VERIFY PENDING)

> **HONEST-LABELING HEADER (read first).** W3 is the SIGMA-ROOT analog of the broker-signing arc's `plans/38` W4
> proof board -- it PROVES the composed registration-provenance read-side properties + the custody-boundary deny,
> WITHOUT deploying. **Everything is SHADOW.** W3 adds NO `src/` module, arms NO live flag, and does NOT deploy,
> seed a genesis root, install a key, write `/etc`, or set an arm flag (NS-7 -- the operator's act). It is a
> TEST-ONLY proof board (a new sibling to `edge-provenance-proof.test.js`) + a machine-checkable in-test verdict.

### §W3.0 Recon-completeness correction (SCAR-#30 -- the positive control is ALREADY BUILT)

The plan skeleton (Wave 3, above) reads W3 as "positive control SPLIT + negative controls." Grounding at `e4a3c07`
shows the **positive control + the armed-filter mechanics are ALREADY PROVEN** in
`v0/test/integration/registration-gate-convert.test.js`: a legit own-persona sigma-root-anchored VOUCH PASSES
`filterAnchoredRecords` and weighs nonzero (item 11b `dpArmed=1`), disarmed is byte-identical (item 10), armed
STRICTLY narrows unmapped personas (item 11b), and a committed 120-trial fuzz proves monotonic non-increase (item
11). That test already `registerRoot`s, `signSigmaRoot`s, arms `regProvenance`, and drops unanchored records.

So W3 REFERENCES that (does NOT re-prove the narrows fuzz). W3's genuine NET-NEW -- exactly as `plans/38 §0`
reused its positive control and made its net-new the read-side apex -- is:
1. **the APEX integrity-not-provenance SPLIT** (the one genuinely-new property, `plans/30 §5` W1 control e);
2. **the sigma-root broker custody-boundary DENY** (`authorizeBindingRequest`, control b -- the binding analog of
   `plans/38`'s frame-broker persona-mismatch deny);
3. **the composed proof board** -- a machine-checkable verdict helper (NO `hardened` field) that assembles the
   in-process controls as PASS + the deploy-only + disclosed-open legs as NOTE/residual.

### §W3.1 What W3 PROVES that is new -- the apex (NS-9, the one genuinely-new property)

A same-uid host attacker that SELF-`registerRoot`s its OWN human_uid + self-signs a valid `sigma_root` over its own
binding is **KEPT** by the armed `filterAnchoredRecords` (`assessRegistrationFromRegistry` verifies the ed25519
against the attacker's OWN seeded root key -- INTEGRITY holds), BUT it **cannot** anchor a binding to a DISTINCT
GENUINE root's controller without that root's key. "broker/root-privileged standing" is defined operationally as
"a record `filterAnchoredRecords` KEEPS whose `sigma_root` verifies under a GENUINE seeded root key the attacker
does not hold." The apex SPLITS:

- **(d1) KEPT -- EXPECTED SHADOW pass (the OPEN 5th leg).** The self-`registerRoot`+self-sign binding PASSES
  `assessRegistrationFromRegistry(...).sigmaRootChecksPassed === true` AND SURVIVES the armed filter. Proven by
  EXECUTING the forge (the `plans/38` honesty move -- disclose-an-open-leg by executing it, not by comment).
  Labeled EXPECTED-SHADOW-pass: KEPT is provably **integrity, not provenance** -- the crypto proves the root KEY
  authorized the binding, NEVER that the key belongs to a distinct real human root
  (`registration-provenance.js:64-66`; `registration-gate.js:17-20` already carries this exact language).
- **(d2) CLOSED -- cannot anchor to a GENUINE root (two in-process sub-facts).**
  - **(d2a)** `assert.throws(() => registerRoot(reg, {humanUid: GENUINE, rootPublicKeyPem: attackerRootPub}))` --
    cannot squat the genuine root key (first-writer immutability, `registry.js:105-106`).
  - **(d2b)** a persona registered under the GENUINE controller whose `sigma_root` is signed by the ATTACKER root
    key -> `assessRegistrationFromRegistry(...).sigmaRootChecksPassed === false` (`verifySigmaRoot` fails against the
    GENUINE seeded root key sourced by `lookupRootKey(reg, controller)`) -> DROPPED at the armed filter. TRACK the
    dropped `record_id` explicitly (5d -- falsifiable, not inferred).
- **(d-mutation) DISCLOSED OPEN (the H1-analog boundary -- NAME it, do NOT claim closed).** A same-uid attacker
  HOLDING the `reg` handle bypasses the first-writer guard via a direct `reg.rootKeys.set(GENUINE, attackerRootPub)`
  (`registry.js:38-41` discloses the persona analog; the same host-writable-registry leg applies to `rootKeys`).
  Demonstrated LIVE as an EXPECTED-OPEN leg (mirrors the edge board's (e2) `reg.personas.set` H1-boundary bypass,
  `edge-provenance-proof.test.js:143-145`), carried as the
  `apex-inprocess-rootkey-mutation-OPEN` NOTE/residual so the verdict NEVER reads as "the apex is closed
  in-process." Closes ONLY with a deployed + attested cross-uid signer (the #273 authenticated-minter direction),
  NOT this arc.

### §W3.2 The leg split (in-process asserted vs deploy-only NOTE)

| Leg | In-process (asserted PASS/FAIL) | Deploy-only (NOTE/residual) |
|---|---|---|
| (a) host `cat` the ROOT key -> EACCES | -- | NOTE (`custody-verify.js` at the cross-uid deploy) |
| (b)-logic-1 controller-mismatch deny | PASS -- `authorizeBindingRequest` deny `controller-mismatch` (id computed FIRST -- M2 ordering) | -- |
| (b)-logic-2 domain-sep: a FRAME body deny | PASS -- deny `binding-uncomputable` (`computeBindingId` THROWS on a frame -- the non-vacuous domain-separation proof) | -- |
| (b)-live wrapper deny + empty stdout | -- | NOTE (the real `sudo -n -u` round-trip at deploy) |
| (c) in-process `signRecordId` no-key -> null | PASS -- `signRecordId(id, {}) === null` (`edge-attestation.js:95-101`) | -- |
| (d-heap) gcore / `/proc/pid/mem` extract denied | -- | NOTE (R-heap re-run, Linux `ptrace_scope=2`) |
| (d1) self-`registerRoot` -> KEPT (crypto PASSES) | PASS -- EXPECTED SHADOW pass (the OPEN 5th leg; integrity-not-provenance) | -- |
| (d2) cannot anchor to a GENUINE root | PASS -- `registerRoot` squat THROWS + wrong-root-key binding DROPS | -- |
| (d-mutation) `reg.rootKeys.set` bypass | -- | NOTE (DISCLOSED OPEN -- closes with an authenticated minter, NOT this arc) |

### §W3.3 The in-test verdict helper (machine-checkable, never `hardened`)

> **DESIGN DRAFT -- SUPERSEDED by fold F1 (§W3.10):** the helper was EXTRACTED to a shared
> `v0/test/integration/_assess-controls.js` (parameterized on the pass-field), NOT kept as a local unexported
> closure. Read F1 + the build-result for the as-built shape; the paragraph below is the pre-fold design.

A LOCAL helper `assessProvenanceControls(checks)` in the W3 test (NOT an export -- FORK-A test-only, mirroring
`edge-provenance-proof.test.js:44` `assessReadControls` VERBATIM in shape). Returns
`{ inProcessProvenanceControlsPassed, checks, residuals }` -- **NO `hardened`/`provenanceReal` field** (NS-9; mirrors
`registration-provenance.js`'s deliberate omission of `sigmaRootWorldAnchored`). Fail-CLOSED: an unknown status
counts as FAIL and SURFACES in residuals; an empty/null checks array is NOT a pass; a null element / status-less
check normalizes to a fail-closed sentinel (the `security.md` "typo fails CLOSED" + the VALIDATE-hacker nits 1+2 from
`plans/38`). Every non-PASS leg (NOTE, FAIL, unknown) is named in residuals so a real FAIL cannot vanish.

### §W3.4 NS-9 framing (mis-reads, each PREVENTED)

1. If (d1) were labeled a "control the deploy closes" -> a false HARDEN. PREVENTED: (d1) is asserted as an EXPECTED
   SHADOW pass; the field is `inProcessProvenanceControlsPassed`, never `hardened`; the residual names the open leg.
2. If any deploy-only leg (a / b-live / d-heap) were asserted PASS in-process -> a false provenance claim. PREVENTED:
   NOTE/residual only.
3. If the apex were claimed CLOSED in-process -> a false close. PREVENTED: the `reg.rootKeys.set` bypass is
   demonstrated LIVE + carried as `apex-inprocess-rootkey-mutation-OPEN`.
4. If any assertion gated on `actionable` -> a gate. PREVENTED: the proof only READS `actionable` to assert it stays
   `false` (`convert.js:149`).

### §W3.5 Fixture factoring (FORK -- for the VERIFY board)

> **DESIGN DRAFT -- the muddled "mirrors `anchoredWorld`" rationale below is SUPERSEDED by fold F6 (§W3.10):** the
> as-built fixture is a thin LOCAL cap over `world()` (`seedRoot` / `signBindingUnderRoot` / `vrec`), NOT a mirror of
> `anchoredWorld`; `_world.js` is untouched. Read F6 for the corrected rationale.

W3 needs sigma-root anchoring helpers `world()` does not provide (`seedRoot(humanUid)` -> generate a root keypair +
`registerRoot` the pubkey + stash the root privkey; `signBinding(personaDid, humanUid)` -> `signSigmaRoot` the
persona's frozen binding under its controller's root key; an armed `regProvenance` ctx). Two options:
- **Option B (DRAFT REC) -- local helpers in the W3 file over `world()`** (mirrors `registration-gate-convert.test.js`'s
  OWN local `anchoredWorld`; FORK-A test-only precedent). Touches NO shared fixture -> zero blast radius on the two
  existing `_world.js` consumers; YAGNI (no third consumer yet).
- **Option A -- extend `_world.js` with additive sigma-root helpers** (honors "extend not fork"; keeps existing
  exports byte-identical; re-run the 2 consumers as the gate). Higher blast radius for a single new consumer.

DRAFT REC = Option B; flagged for the board (architect Q).

### §W3.6 Darkness cascade + layering -- DO NOT EXTEND

W3 adds NO dormant `src/` module. `sigma-root-darkness-witness.test.js` scans `src/` only (line 33 `SRC=...`) and
asserts EXACT importer sets (`sigma-root` <- `{binding-request-auth, registration-provenance}`; `registration-provenance`
<- `{admission-gate, registration-gate}`), so the W3 TEST importing `signSigmaRoot`/`assessRegistrationFromRegistry`
does NOT trip it. The build MUST re-run the sigma-root + registration-gate + admission-gate darkness witnesses +
`layering.test.js` to confirm they stay green (unchanged).

### §W3.7 TDD plan (RED first)

**File: NEW `v0/test/integration/sigma-root-provenance-proof.test.js`** (auto-discovered by `test/run.js` --
`**/*.test.js`; `_world.js` stays non-`.test.js`, not auto-run). The assertions:

1. **(b)-logic-1 controller-mismatch DENY (in-process).** Build a foreign-controller binding `{personaDid, publicKeyPem,
   controller: 'human:foreign'}`; compute `claimedRecordId = computeBindingId(binding)` FIRST (the M2 ordering trap --
   `recomputeBindingId` runs before `controllerBinds`, `binding-request-auth.js:134-136`); assert
   `authorizeBindingRequest({requireBinding:true, brokerController:'human:me', presentedBodyRaw, claimedRecordId}).reason
   === 'controller-mismatch'` (the RIGHT gate, NOT the masking `record-id-mismatch`). Non-vacuity: a matching-controller
   binding is ALLOWED.
2. **(b)-logic-2 domain separation (in-process).** Feed a FRAME-shaped body (a real VOUCH frame preimage, no
   `controller`/`publicKeyPem`) to `authorizeBindingRequest` -> deny `binding-uncomputable` AND assert
   `computeBindingId(frameBody)` THROWS (the non-vacuous proof that the binding gate is closed against a frame; the
   key-separation invariant's defense-in-depth companion).
3. **(c) in-process no-key sign -> null.** `signRecordId('a'.repeat(64), {}) === null` + garbage key -> null; non-vacuity
   with a real key -> a string.
4. **(d1) self-`registerRoot` -> KEPT (EXPECTED SHADOW pass, the OPEN leg).** Register an ATTACKER persona under
   `human:attacker`; `seedRoot('human:attacker')`; `signBinding(ATTACKER, 'human:attacker')` under the attacker's OWN
   root key; put the sigma_root in the armed map; assert `assessRegistrationFromRegistry(reg, {personaDid:ATTACKER,
   sigmaRoot}).sigmaRootChecksPassed === true` AND the ATTACKER's VOUCH SURVIVES `filterAnchoredRecords(armed)`. Labeled
   EXPECTED-SHADOW-pass (integrity-not-provenance).
5. **(d2) cannot anchor to a GENUINE root (CLOSED, API + key paths).** (d2a) `assert.throws(() => registerRoot(reg,
   {humanUid:'human:me', rootPublicKeyPem: attackerRootPub}))` -- cannot squat the genuine root key. (d2b) register a
   persona under `human:me`, sign its binding under the ATTACKER root key, map it -> assert
   `assessRegistrationFromRegistry(reg,{personaDid, sigmaRoot}).sigmaRootChecksPassed === false` AND the record DROPS from
   the armed `filterAnchoredRecords` (track the dropped `record_id`).
6. **(d-mutation) DISCLOSED OPEN.** `reg.rootKeys.set('human:me', attackerRootPub)` directly -> assert the (d2b) binding
   now PASSES `assessRegistrationFromRegistry` (the bypass admits) -- demonstrated LIVE as EXPECTED-OPEN, carried as the
   `apex-inprocess-rootkey-mutation-OPEN` residual.
7. **(apex non-vacuity).** EMPTY: before anchoring, the ATTACKER's VOUCH is DROPPED by the armed filter (so d1's KEPT is
   load-bearing, not vacuous). EXACT: the KEEP keys on `sigmaRootChecksPassed === true` (a boolean, exact), never a
   subset. The d2b DROP is a genuine crypto FAIL (re-seeding the genuine root with the attacker key THROWS; only the
   `rootKeys.set` bypass flips it) -- not a store miss.
8. **SHADOW invariant (NS-9).** `convert(armed, ME, <any>).actionable === false` throughout (READ-only).
9. **the verdict.** Assemble the in-process controls (b-logic-1, b-logic-2, c, d1, d2) as PASS + the deploy-only (a,
   b-live, d-heap) + `apex-inprocess-rootkey-mutation-OPEN` as NOTE; assert `inProcessProvenanceControlsPassed === true`,
   assert each NOTE/open leg is NAMED in `residuals`, assert NO `hardened` field.
10. **(H2) the verdict helper fails CLOSED.** A distinct RED test: empty -> false; unknown status -> false AND surfaces;
    a real FAIL -> false AND surfaces; a null element / status-less check -> fail-closed; all PASS/NOTE -> pass.

### §W3.8 What W3 does NOT do (NS-9)

- Does NOT close the apex (d1 is EXPECTED-open); does NOT close the `reg.rootKeys.set` in-process leg (d-mutation,
  disclosed); does NOT establish PROVENANCE in-process (a/b-live/d-heap are deploy-only NOTE); does NOT gate / flip
  `actionable`; does NOT add a `src/` module, a darkness witness, or a CLI; does NOT deploy / seed a genesis root /
  install a key / set an arm flag (NS-7). The only HARDEN is the operator's out-of-band root-key attestation.

### §W3.9 Runtime probes (re-run at build -- repo state decays)

- Probe: `grep -n "sigmaRootChecksPassed\|lookupRootKey" v0/src/identity/registration-provenance.js` -> the judge sources
  the root key from `lookupRootKey(reg, controller)` (the d1/d2 premise).
- Probe: `grep -n "reason: 'controller-mismatch'\|recomputeBindingId\|controllerBinds" v0/src/identity/binding-request-auth.js` -> the (b)-logic deny reasons + the M2 ordering.
- Probe: `grep -n "first-writer\|IMMUTABLE\|rootKeys.set" v0/src/identity/registry.js` -> the d2a squat-throw + the d-mutation bypass surface.
- Probe: `grep -n "actionable" v0/src/trust/convert.js` -> still hard-false (the SHADOW invariant).

### §W3.10 Pre-build VERIFY -- DONE: PROCEED-WITH-FOLDS (folds baked into the build)

A 3-lens board (architect + code-reviewer + hacker, free-text per SCAR-#31) ran against this design + the real
files. **All three PROCEED-WITH-FOLDS -- zero CRITICAL, zero NEEDS-REVISION.** The hacker ran 10 LIVE probes
against the real `v0/src` (0 exploitable bypasses beyond the design's own disclosed-open legs); every premise
reproduced. Convergent must-folds (baked into the build below):

- **F1 (architect HIGH + reviewer MED-1 + hacker M2) -- EXTRACT the verdict helper, do NOT copy-paste.** Copying the
  ~20-line fail-closed `assessReadControls` into a second file recapitulates the exact F1 "a forked hardened copy
  WILL diverge" anti-pattern this arc codified at W1a (`broker-core.js`), AND risks transcribing the STALE `plans/38
  §2a` pre-fold sketch (which still has the read-twice + null-element nits VALIDATE later fixed) instead of the BUILT
  `edge-provenance-proof.test.js:44-63`. **Fold:** lift the BUILT helper to a shared `v0/test/integration/_assess-controls.js`
  parameterized on the pass-field name (`assessControls(checks, passField) -> {[passField]:passed, checks, residuals}`,
  NEVER a `hardened` field -- NS-9 preserved); re-point `edge-provenance-proof.test.js` to it (a thin local alias so
  its call sites + field accesses stay byte-identical) and RE-RUN it (the behavioral-equivalence gate, like W1a
  re-ran `broker.test.js`); the W3 file uses `passField='inProcessProvenanceControlsPassed'`. This is the arc's OWN
  precedent: `plans/38 §0` lifted `world()` to `_world.js` the moment it got a second consumer -- W3 is the verdict
  helper's second consumer, so the YAGNI justification for FORK-A "keep it local" has expired.
- **F2 (reviewer HIGH-1 + hacker H1, LIVE-PROVEN) -- d2b MUST assert the EXACT `[R3_VERIFIES]` failed-set, not just
  `=== false`.** The hacker proved live that a store-miss (unseeded root) and a genuine forgery (seeded root, wrong-key
  sig) BOTH read `sigmaRootChecksPassed === false` -- but with DIFFERENT failed-sets (`['R-registry-source']` vs
  `['R3-verifies']`). A bare `=== false` would pass even if the persona/root were never set up, proving nothing about
  the CRYPTO. **Fold:** seed the genuine root FIRST (so R0/R1/R2 PASS), then
  `assert.deepEqual(prov.checks.filter(c => c.status==='FAIL').map(c => c.id), [R3_VERIFIES])` (import `R3_VERIFIES`
  from `registration-provenance.js`) -- mirroring the forgery whitelist at `registration-gate.js:108-109`. THE most
  load-bearing fold.
- **F3 (architect MED + reviewer LOW-1) -- d2a: seed the genuine `human:me` root FIRST, assert the throw MESSAGE**
  (`/already seeded with a DIFFERENT root key|IMMUTABLE/`), and prove non-vacuity (WITHOUT the pre-seed, `registerRoot`
  succeeds -- so the throw is genuinely the first-writer guard, not a malformed-arg `TypeError`). Mirrors the edge
  board's (e2) `registerPersona` first-writer squat-throw, `edge-provenance-proof.test.js:126-128`.
- **F4 (architect MED) -- d2b needs its POSITIVE complement:** the SAME persona's binding signed by the GENUINE root
  -> `sigmaRootChecksPassed === true` + KEPT, alongside the attacker-signed DROP -> so the DROP is provably KEY-caused
  (the non-vacuous-guard pair), not a construction miss.
- **F5 (architect MED + reviewer LOW-2) -- test `filterAnchoredRecords(recs, registry, {sigmaRoots})` DIRECTLY** for
  the KEEP/DROP controls (that path has NO freshness filter -- `convert.js:89-90`), and **arm ONLY `regProvenance`,
  DISARM freshness** (a both-armed ctx makes a drop ambiguous freshness-vs-anchoring, vacuating d1/d2). Reserve
  `convert(...)` ONLY for the item-8 `actionable === false` SHADOW invariant (with an explicit `meCtx` shape).
- **F6 (architect MED) -- fixture = a LOCAL cap over `world()`** (reuse its store/persona plumbing; add ~10 lines of
  root-seed + a `signBindingUnderRoot(personaDid, controller, rootPrivPem)` helper -- neither `world()` nor
  `anchoredWorld` can sign a persona's binding under an ARBITRARY (attacker) root privkey, which d2b requires). Do NOT
  extend `_world.js` (Option A over-generalizes root-seeding onto its 2 non-anchoring consumers -- ISP/YAGNI); do NOT
  lift `anchoredWorld` (no third consumer). The corrected §W3.5 rationale: "over `world()`" is a thin sigma-root cap,
  NOT "mirroring anchoredWorld" (two different fixtures were conflated in the draft).
- **F7 (hacker M1) -- strict `assert-DROP -> reg.rootKeys.set(...) -> assert-ADMIT` ordering** on a single `reg`
  handle for d2b/d-mutation (or a FRESH registry for d-mutation) -- else the mutation silently flips the d2b FAIL
  assertion to true (proven live). Mirrors the edge board's (e2) H1-boundary assert-DROP -> mutate -> assert-ADMIT
  block, `edge-provenance-proof.test.js:143-145`.
- **F8 (hacker M3) -- d1's verdict-check `detail` MUST carry the OPEN-leg language** ("EXPECTED SHADOW pass -- the
  crypto proves the root KEY authorized the binding, NEVER that the key is a distinct real human root; the 5th leg is
  OPEN"), mirroring `edge-provenance-proof.test.js:203`. A bare `PASS` lets `inProcessProvenanceControlsPassed===true`
  be skimmed as "provenance established in-process."
- **Framing sharpenings (architect LOW-MED + hacker L1/L2, plan-text only):** (a) d1's KEEP MECHANISM is REUSED
  (`registration-gate-convert.test.js` item 11b already keeps self-seeded-root personas); d1's genuine net-new is the
  ADVERSARIAL FRAMING + EXPECTED-SHADOW-pass label + the empty-before-anchor non-vacuity, NOT the keep itself. (b) d2
  closes CROSS-CONTROLLER impersonation but buys NO readout-visible privilege over d1 (the persona-blind
  indistinguishability IS the integrity-not-provenance disclosure). (c) label (b)-logic-1/2 + (c) as board-ASSEMBLY
  re-exercises (already unit-covered by W1b + W4), not new coverage. (d) the `apex-inprocess-rootkey-mutation-OPEN`
  residual text names BOTH host-writable Maps (`reg.rootKeys.set` AND `reg.personas.set`; `registry.js:38-41` discloses
  the persona analog, `rootKeys` by extension -- `registerRoot` has only the SQUAT residual at `:94-97`, no threat-
  boundary comment). (e) the "exact-set" discipline points at the R3-only failed-set (F2), not the boolean KEEP.

The build (below) bakes all of F1-F8 + the framing sharpenings, then runs the 3-lens VALIDATE on the built diff, the
pre-PR CodeRabbit CLI, and the PR.

## Wave 3 -- build result (as-built; 3-lens VALIDATE + folds applied)

### Built (all SHADOW / test-only -- NO src/ module changed)
- **NEW `v0/test/integration/_assess-controls.js`** -- the EXTRACTED shared fail-closed verdict helper (fold F1),
  `assessControls(checks, passField) -> {[passField]:passed, checks, residuals}` (NEVER a `hardened` field, NS-9).
- **NEW `v0/test/integration/sigma-root-provenance-proof.test.js`** -- the W3 proof board (9 controls: b-logic-1/2,
  c, d1 KEPT, d2 CLOSED, d-mutation OPEN, SHADOW, the verdict, H2). All F2-F8 baked in.
- **MODIFIED `v0/test/integration/edge-provenance-proof.test.js`** -- re-pointed to the shared helper via a thin
  local `assessReadControls` alias (F1). Behavioral-equivalence GATE: re-ran 9/9 UNCHANGED (the W1a-style proof).
- **GATE:** full suite 54 files / 697 / 0; eslint clean; the sigma-root / registration-gate / admission-gate
  darkness witnesses + `layering.test.js` all green (the proof board adds NO src importer -> the cascade does NOT
  extend, mirroring plans/38 W4).

### 3-lens VALIDATE on the built diff (code-reviewer + hacker + honesty-auditor): all PROCEED / PROCEED-WITH-FOLDS
- **code-reviewer: PROCEED (0 findings).** Verified firsthand: the extract is byte-behavior-identical (diffed the
  removed inline body vs `_assess-controls.js`; only the literal key + Set name parameterized); every control
  falsifiable-not-vacuous; resource hygiene clean (the 4 `world()` calls share `_world.js`'s per-process
  exit-cleanup, no leak); the plan §W3 matches the built code.
- **hacker (Rule 2a, LIVE re-probe of the BUILT code): PROCEED-WITH-FOLDS.** 10 probes, 0 exploitable bypasses
  beyond the disclosed-open legs; every load-bearing property HELD (exact-set immunity, non-vacuous negatives, honest
  EXPECTED-OPEN apex, live-executed bypass). Found + FOLDED 3 latent defense-in-depth defects in the shared helper
  (inherited verbatim from the pre-existing edge helper, unreachable by the current dense-literal callers, but they
  FALSIFY the helper's own header contract -- so the "one hardened copy" must actually be hardened):
  - **M1 (holey-array vacuous PASS):** `assessControls(new Array(3))` passed vacuously (`.map`/`.every` SKIP holes).
    FOLD: `Array.from(checks)` densifies holes -> `__MISSING__` fail-closed. Firsthand-proven before + after.
  - **L1 (throws on a hostile getter, breaking "never throws")** + **L2 (`c.status` read twice, breaking "snapshot
    ONCE"):** FOLD: read the status ONCE into a local inside a per-element try/catch. Both proven firsthand.
  - **L3 (F8 prose-only):** the d1 OPEN-leg disclosure is now MACHINE-asserted (`assert.match` on the d1 detail).
  - Locked with holey-array + throwing-getter cases added to the H2 suite.
- **honesty-auditor: Grade A, PROCEED-WITH-FOLDS (all advisory).** No CRITICAL/HIGH/MED; the board is exemplary on
  its honesty axes (apex integrity-not-provenance correctly labeled in all 3 places, disclose-by-execution genuinely
  executed, `hardened` provably absent, deploy-only legs demoted to NOTE, SCAR-#30 recon correctly deferred). 8/8
  folds F1-F8 confirmed applied. Two LOW folds APPLIED: **LOW-1** the strict-ordering mirror mis-cited
  `edge-provenance-proof.test.js:163-165` (stale post-extract) -> corrected to descriptive anchors (the (e2)
  `reg.personas.set` bypass `:143-145` + the `registerPersona` squat-throw `:126-128`); **LOW-2** the d-mutation test
  name used filter vocabulary ("DROP to admit") while asserting at the judge layer -> now demonstrates the flip at
  BOTH layers (judge `sigmaRootChecksPassed` AND the read-side `filterAnchoredRecords` pipeline). (The filter-level
  assertion caught a real opts-shape bug in the fold -- I passed the raw map instead of `{sigmaRoots:...}`, so the
  filter disarmed; fixed -- a non-vacuity dividend of Rule-2a re-probing the BUILT code.)

### Residuals (NS-9, LOUD)
- **The APEX is EXPECTED-OPEN** (d1) -- a same-uid self-`registerRoot`+self-sign is KEPT: integrity holds, provenance
  does NOT. The readout treats a self-anchored KEEP and a genuine-anchored KEEP IDENTICALLY (persona-blind) -- that
  indistinguishability IS the integrity-not-provenance disclosure. d2 closes CROSS-CONTROLLER impersonation only, with
  NO readout-visible privilege over d1.
- **The in-process `reg.rootKeys.set` / `reg.personas.set` leg is DISCLOSED OPEN** (d-mutation) -- the host-writable
  registry; closes ONLY with a deployed + attested cross-uid minter (the #273 direction), NOT this arc.
- **The cross-uid HARDEN legs (a key-cat-EACCES / b-live wrapper deny / d-heap extract) are DEPLOY-ONLY NOTE** -- run
  at the operator deploy, never asserted PASS in-process. The verdict field is `inProcessProvenanceControlsPassed`,
  never `hardened`. All SHADOW: `convert.actionable` stays hard-false; the only HARDEN is the operator's out-of-band
  root-key attestation (NS-7).
- **NEXT:** W4 (runbook + the deploy wire-check `assertBrokerPersona` sigma-root analog), W5 (USER operator deploy +
  out-of-band attestation -- the only HARDEN, NS-7).

## Wave 4 -- design (the cross-uid sigma-root BROKER deploy runbook; DOCS-ONLY; pre-build VERIFY PENDING)

> **HONEST-LABELING HEADER (read first).** W4 is DOCS-ONLY: a NEW operator runbook for deploying the cross-uid
> sigma-root BROKER (the W1b/W2 compose-and-arm layer). **Claude WRITES it; Claude NEVER runs any step** -- no uid
> creation, key install, `/etc` write, sudoers edit, arm flag, or attestation (NS-7; those are W5, the operator's).
> The runbook is SHADOW: the custody deploy only NARROWS (makes K_root non-host-readable = INTEGRITY); the SOLE
> HARDEN remains `sigma-root-deploy.md` Phase A.3's out-of-band attestation (integrity != provenance).

### §W4.0 Recon-completeness (SCAR-#30 -- the runbook DELTA, not a from-scratch runbook)

The plan skeleton (Wave 4, above) reads W4 as "write the signing-into-the-graph runbook + a deploy wire-check
`assertBrokerPersona`." Grounding at `38466c0` corrects this:
- **`docs/deployment/sigma-root-deploy.md` ALREADY EXISTS** and covers Phase A (genesis root: mint
  OFF-box -> seed CLEAN -> attest `K_root_pub` via cosign/Rekor) -> B (provision persona; the ROOT signs the binding)
  -> C (arm the admission gate) -> D (grandfather ramp) -> Verify -> safety invariants -> honest status. Its **B.3
  signs via the ENCLAVE `{ privateKeyPem: K_root_priv }` path** and only NOTES `{ signer }` as "plans/30 forward-compat."
- **`docs/deployment/cross-uid-broker.md`** is the FRAME broker custody deploy (create broker uid ->
  keypair 0600 -> root-owned wrapper -> sudoers env-pin -> register pubkey -> wire -> verify+attest -> caller-auth ->
  per-request auth). W4 MIRRORS this for the ROOT broker.
- **`docs/deployment/live-edge-provenance.md`** is the FRAME-broker live-edge signing runbook (composes
  `cross-uid-broker.md`). **W4 is its DIRECT sigma-root ANALOG.**
- **NO `assertBrokerPersona` sigma-root analog exists in code** (`grep` -> only the frame-broker `broker-client.js:88`).
  So the "deploy wire-check" is a DOCUMENTED manual verification (sign a test binding through the broker ->
  `verifySigmaRoot` under the seeded root pubkey -> PASS), NOT a built CLI -- mirroring `sigma-root-deploy.md`'s own
  "Verify (a library call today; a `custody-verify`-style CLI is a later wave)."

**W4's genuine DELTA:** the cross-uid sigma-root BROKER deploy -- how to make `sigma-root-deploy.md` B.3's `{ signer }`
seam REAL: install K_root under a SEPARATE uid (0600) the host process cannot `read()`, run it behind the W1b
`sigma-root-broker.js` entrypoint, and swap B.3 to `signSigmaRoot(binding, { signer: crossUidBrokerSigner(...) })`.

### §W4.1 Placement (arc FORK-D precedent)

A **NEW doc `docs/deployment/sigma-root-broker-deploy.md`** (SRP: distinct from the seed+arm `sigma-root-deploy.md`
and the frame-broker `cross-uid-broker.md`; DRY -- it COMPOSES both by reference, never duplicates). This mirrors the
`plans/38` FORK-D decision (a new `live-edge-provenance.md` composing `cross-uid-broker.md`, not an edit of it). Also
add a one-line cross-link from `sigma-root-deploy.md` B.3 ("for the cross-uid `{ signer }` deploy, see
`sigma-root-broker-deploy.md`") so the two docs reciprocate. **Fork for the board:** new-doc (rec) vs a new Phase in
`sigma-root-deploy.md`.

### §W4.2 The runbook spine (`sigma-root-broker-deploy.md`)

> **DESIGN SPINE -- steps 4 + 7 are CORRECTED by the §W4.5 folds F1/F2 (do NOT read them in isolation):** the same-inode
> code guard (step 4) is INERT in the separate-wrapper topology + a byte-copy evades an inode check, so the SHIPPED
> runbook mandates an out-of-band `ls -i` + `cmp` distinctness check (F1); and `PACT_ROOT_REQUIRE_BINDING` (step 7) is
> set EXPLICITLY `=1` with a MANDATORY wrapper guard refusing both `PACT_ROOT_CONTROLLER`-unset AND `=0` (F2). The
> built `sigma-root-broker-deploy.md` carries the corrected forms; this spine is the pre-fold design.

1. **Header + honest ceiling** -- SHADOW; Claude never runs it; the custody deploy HARDENS only K_root's KEY-custody
   (the host process cannot `read()` K_root), NOT provenance; the SOLE trust HARDEN is `sigma-root-deploy.md` A.3.
2. **Prerequisites (link, do NOT duplicate)** -- `sigma-root-deploy.md` Phase A (genesis root minted + seeded +
   attested) DONE; `cross-uid-broker.md` read (W4 mirrors its custody pattern for the ROOT broker).
3. **Create the ROOT broker uid** -- a SEPARATE system user, DISTINCT from the frame broker's uid AND the host uid.
4. **Install K_root `0600` under that uid.** THE KEY-SEPARATION INVARIANT (W1b HIGH-1, LOUD): `PACT_ROOT_KEY_FILE`
   MUST be a DISTINCT INODE from `PACT_BROKER_KEY_FILE` -- `sigma-root-broker.js`'s same-inode refusal fails closed on
   an alias/symlink/hardlink, but a distinct-inode byte-COPY is a single logical key the guard misses -> different key
   MATERIAL + a different uid is the load-bearing separation (operator custody, W1b honesty MEDIUM-3).
5. **Root-owned wrapper** (not host-writable) invoking `node .../sigma-root-broker.js`.
6. **Sudoers** -- host uid may run ONLY the root-broker wrapper as the root-broker user; PIN the env policy
   (`env_reset`, NO `SETENV`, forbid key-path injection); `SUDO_*` is the caller-auth signal.
7. **Root-broker envs (literal in the wrapper, never host-interpolated):** `PACT_ROOT_KEY_FILE`,
   `PACT_ROOT_CONTROLLER` (= the scarce `humanUid` from `sigma-root-deploy.md` A.2), `PACT_ROOT_ALLOWED_UIDS` (the
   root broker's OWN allowlist, NARROWER than the frame broker's -- W1b F2), `PACT_ROOT_REQUIRE_BINDING` (default-ON;
   a strict `'0'` is the ONLY disable; a typo fails CLOSED -- W1b HIGH-2 / `resolveRequireBinding`).
8. **Wire B.3 to the cross-uid signer** -- swap `signSigmaRoot(binding, { privateKeyPem: K_root_priv })` ->
   `signSigmaRoot(binding, { signer: crossUidBrokerSigner({ brokerUser, wrapperPath }) })`. K_root_priv NEVER
   materializes in the provisioning process. (`crossUidBrokerSigner` forwards `body` on the child's stdin so the
   broker's `authorizeBindingRequest` can recompute-bind -- W1b Piece C.)
9. **The wire-check (the DID/controller-consistency gate -- documented, not a CLI):** sign a TEST binding through the
   broker -> `verifySigmaRoot({ ...binding, sigmaRoot, rootPublicKeyPem: lookupRootKey(reg, controller) })` -> PASS is
   the precondition for a real binding to pass `assessRegistrationFromRegistry`. A non-verifying result = a mis-wired
   custody (wrong key/uid/controller). Name a built `assertRootBinding` wire-check as a FORWARD residual (YAGNI now;
   mirrors `sigma-root-deploy.md`'s "a CLI is a later wave").
10. **Verify AS THE HOST UID + the deny controls** (mirror `cross-uid-broker.md` §7-9): the host CANNOT `read()`
    K_root (EACCES); a foreign uid -> refuse, empty stdout; a FRAME body -> `binding-uncomputable` refuse; a
    FOREIGN-controller binding (id computed FIRST) -> `controller-mismatch` refuse. Then attest OUT-OF-BAND (A.3 is
    the sole HARDEN).
11. **Honest ceiling (LOUD, NS-9):** the cross-uid broker buys K_root KEY-custody (a host compromise cannot forge
    arbitrary root bindings without the broker uid). It does NOT close: the raised-stakes #273 R1 (a same-uid-as-the-
    BROKER caller reaching the root broker within the controller still mints "K_root authorized MY key as persona P"
    -- W1b R1); the W3 apex (a same-uid self-`registerRoot`+self-sign still passes -- integrity != provenance);
    provenance bottoms out at A.3 attestation + a deployed+attested cross-uid signer.

### §W4.3 What W4 does NOT do (NS-9)
No code, no deploy, no key, no uid, no `/etc`, no sudoers, no arm flag, no attestation (W5, NS-7). Does not modify the
built src (W1b/W2 are the mechanism; W4 documents its operation). Does not duplicate `sigma-root-deploy.md` /
`cross-uid-broker.md` -- composes them by reference.

### §W4.4 Runtime probes (re-run at build -- verify the cited surface against the built code)
- Probe: `grep -n "keyFileEnv\|allowlistEnv\|distinctFromKeyFileEnv\|requireMode" v0/src/identity/sigma-root-broker.js` -> confirm the PACT_ROOT_* env names + the same-inode arg as-built (`requireMode`, NOT the pre-build sketch's `requireFlagName`).
- Probe: `grep -n "crossUidBrokerSigner\|crossUidSudoArgs" v0/src/identity/broker-launch.js` -> the signer vehicle + wrapper argv the runbook cites.
- Probe: `grep -n "controller-mismatch\|binding-uncomputable\|broker-controller-unset" v0/src/identity/binding-request-auth.js` -> the exact deny reasons for the §W4.2-10 verify controls.
- Probe: `grep -n "signRecordId(bindingId, rootSignerOpts\|signer" v0/src/identity/sigma-root.js` -> B.3's `{ signer }` seam.
- Probe: `grep -n "typeof signer\|signer(recordId, body)\|opts.signer" v0/src/lib/edge-attestation.js` -> the `{signer}`-path body-forward (the mechanism step 8 rests on; multi-reviewer blessing != runtime verification, arch LOW-9).
- Probe: `grep -n "distinctFromKeyFileEnv\|UNSET other-env\|process.env\[distinctFromKeyFileEnv\]" v0/src/identity/broker-core.js` -> confirm the same-inode guard is INERT when the other-env is unset (hacker HIGH-1, the F1 fold).

### §W4.5 Pre-build VERIFY -- DONE: PROCEED-WITH-FOLDS (folds baked into the runbook)

A 3-lens board (architect + hacker + honesty-auditor, free-text) ran against the design + the real W1b/W2 modules +
the three sibling runbooks. **All three PROCEED-WITH-FOLDS -- zero CRITICAL; every cited env / module / call-shape
verified CORRECT against the built code** (`verifySigmaRoot`/`lookupRootKey`/`signSigmaRoot({signer})` all match).
The folds are all DOC-level (no code change). Two are load-bearing security corrections, firsthand-probed:

- **F1 (hacker HIGH-1, PROBED) -- the same-inode code guard is INERT in the mandated separate-wrapper topology.**
  `broker-core.js:145,150-152`: the same-inode refusal fires ONLY when `PACT_BROKER_KEY_FILE` is PRESENT in the
  broker's process env ("An UNSET other-env skips the check"). The root wrapper sets only `PACT_ROOT_*` and sudoers
  `env_reset` strips the host's value -> the guard NEVER evaluates. So §W4.2-4's "fails closed on an alias" is FALSE
  in the recommended deploy. **Fold:** the load-bearing distinctness check is OUT-OF-BAND -- `ls -i <K_root>
  <K_broker>` (distinct inodes) AND `cmp <K_root> <K_broker>` (distinct BYTES; a byte-copy evades an inode check
  anyway). Optionally set `PACT_BROKER_KEY_FILE` (read-only, the frame key path) in the root wrapper to ACTIVATE the
  code guard as defense-in-depth (catches an alias), but the out-of-band `cmp` is the real check. Do NOT claim the
  code guard protects the trust root in this topology.
- **F2 (architect HIGH-1, PROBED) -- a MANDATORY wrapper startup-guard against the blind K_root oracle.**
  `resolveRequireBinding` (`binding-request-auth.js:53-58`) is default-ON only when the box is DEPLOYED (controller
  set OR an intent token). If the operator installs the key+wrapper but forgets `PACT_ROOT_CONTROLLER` + sets no flag
  -> require-binding OFF -> `authorizeBindingRequest` `disabled` branch -> `broker-core.js` signs the argv 64-hex
  BLINDLY with K_root (a universal forgery oracle for the trust root, gated only by a stderr line). **Fold:** the
  wrapper MUST carry `[ -n "$PACT_ROOT_CONTROLLER" ] || { echo 'refusing: PACT_ROOT_CONTROLLER unset' >&2; exit 78; }`
  above the exec (mandatory for the root, vs the frame broker's "Recommended"); and §W4.2-7's "default-ON" is
  CONDITIONAL on the controller/flag.
- **F3 (architect HIGH-2) -- COMPOSE-by-reference-and-delta, do NOT re-document.** §W4.2 steps 3-7 must defer to
  `cross-uid-broker.md` §1-4 (create-uid / key-0600 / root-owned-wrapper / sudoers-env-pin) and enumerate ONLY the
  root deltas (distinct uid, the F1 distinctness check, `PACT_ROOT_*` envs, the narrower allowlist, require-binding,
  the F2 guard) -- else two hand-maintained sudoers copies diverge (the doc twin of the W1a broker-core extraction).
- **F4 (architect HIGH-3 + honesty MED-1 must-fold) -- articulate the broker-vs-enclave posture + reconcile the
  custody VERB.** (a) The enclave path (`sigma-root-deploy.md` A.1, K_root NEVER on the box, one-shot `{privateKeyPem}`
  signing) is STRONGER for static bindings; the cross-uid broker's value is ON-DEMAND signing at the cost of putting
  K_root on the box (R-heap-bounded). State when to prefer each. (b) Reconcile the verb: the custody deploy HARDENS
  the KEY-CUSTODY / non-exfiltration axis (world-anchored, per `cross-uid-broker.md:14` / `live-edge-provenance.md:92-95`)
  = INTEGRITY, but HARDENS NOTHING about trust/provenance; the SOLE trust HARDEN is A.3. (My header's "only NARROWS"
  under-claims the key-custody axis -- fix to "HARDENS key-custody, NOT provenance.")
- **MED cluster (all ADOPT):** end-to-end read-side confirm (`assessRegistrationFromRegistry` PASS +
  `convert.actionable===false`, arch MED-4); deny-control OBSERVABLE (`broker-core` collapses every deny to a fixed
  "request not authorized" + empty stdout + exit 1 -- NOT a grep for the internal reason) + the plans/17 §7 exact-body
  construction (compute `claimedRecordId=computeBindingId(body)` FIRST so controller-bind is the provable denier, not
  the masking record-id-mismatch) (arch MED-5 + hacker HIGH-2); caller-auth flip-test + the `env_keep.*SUDO_` +
  code-loading-var (`NODE_OPTIONS`/`LD_*`/`DYLD_*`/`BASH_ENV`) out-of-band scan (arch MED-6 + hacker HIGH-3); the
  persona-vs-controller asymmetry (the root broker has NO persona / NO `assertBrokerPersona` -- the check is a
  CONTROLLER triple) (arch MED-7); the R-heap one-box / re-probe caveat in the ceiling (arch MED-8 + hacker MED-1);
  the key-DIR `0755` so the host's owner-verify is not blind (hacker MED-2); the wire-check test binding's controller
  MUST equal `PACT_ROOT_CONTROLLER` (hacker LOW-1).
- **LOW cluster (ADOPT):** the §W4.4 probe token `requireFlagName` -> `requireMode` (as-built; honesty LOW-2); use a
  live `wc -l` not a frozen line-count (honesty LOW-3); a clause that R1 (#273) survives EVEN A.3 + a cross-uid signer
  (honesty LOW-4); a §W4.4 probe on `edge-attestation.js`'s `{signer}` body-forward (arch LOW-9); weave the reciprocal
  cross-link into `sigma-root-deploy.md` B.3's existing `{signer}` note, not a duplicate line (arch LOW-10).

The runbook (`docs/deployment/sigma-root-broker-deploy.md`) bakes ALL of the above; then a light VALIDATE (doc-vs-built
+ honest-ceiling) + the pre-PR CodeRabbit CLI + PR.
