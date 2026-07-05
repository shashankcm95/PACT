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
