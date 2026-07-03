---
lifecycle: persistent
status: VALIDATE DONE (3-lens: code-reviewer APPROVE + hacker SHIP-WITH-NITS + honesty A-, all folded) -> pre-PR CodeRabbit -> PR
plan: 38
created: 2026-07-03
depends-on: plans/34 (W0 freshness primitive) ; plans/35 (W1 signed-edge producer) ; plans/36 (W2 read-gate filter) ; plans/37 (W3 mint harness -- the `world()` fixture this extends) ; plans/30 §5-W1/W2 (the arc scope for this wave) ; the W4 design-exploration architect (this session, wf a982109b)
audience: a build session (W4) + the USER (go-ahead gate + the operator deploy)
title: broker-signing arc W4 -- the provenance PROOF BOARD (read-side apex control + runbook delta; SHADOW, arc closer)
---

# Plan 38 -- broker-signing W4 (the provenance proof board)

> **HONEST-LABELING HEADER (read first).**
> W4 = **plans/30 §5-W1 (the attestation / proof harness)** + **§5-W2 (the runbook delta + deploy-readiness
> checklist)** -- the CLOSER of the broker-signing arc (W0-W3 shipped the freshness MECHANISM; W4 PROVES the
> composed read-side properties + writes the operator procedure). **Everything is SHADOW.** W4 builds + verifies
> the in-process read-side proof; it does NOT deploy, arm, attest, create a uid, write /etc, install a key, edit
> sudoers, or set a flag (NS-7 -- the deploy is the USER's operator act).
>
> **What W4 PROVES that is new (NS-9 -- the one genuinely-new property):** the READ-SIDE apex control (leg e).
> A same-uid host attacker that SELF-REGISTERS its OWN persona + self-signs a VOUCH (no broker) is admitted with
> its OWN-persona standing (the 5th co-forge leg is OPEN -- honestly disclosed, EXPECTED SHADOW pass), BUT it
> cannot produce an edge the read gate attributes to the BROKER'S persona DID **via the `registerPersona` API path
> OR without the broker key** (first-writer immutability blocks re-registering the broker DID; an edge claiming
> `src_persona_did == BROKER` signed under a non-broker key DROPS at `verifiedRecords`). "broker-EQUIVALENT
> standing" is defined operationally as "an edge `verifiedRecords` attributes to the broker persona DID" -- via
> those two paths the attacker gets ZERO of those while getting EQUAL own-persona weight.
>
> **SCOPE CAVEAT (VERIFY-hacker H1 -- do NOT over-claim "gets ZERO" as absolute):** a same-uid attacker HOLDING the
> in-process `reg` handle CAN still forge a broker-attributed edge by mutating `reg.personas.set`/`delete` directly
> (bypassing `registerPersona`'s first-writer guard) -- this is EXACTLY the disclosed FIFTH co-forge leg
> (`registry.js:38-41` "an in-process holder of `reg` can still mutate ... out of scope"; plans/30 §2 leg 5, the
> host-writable registry). W4's "gets ZERO" is scoped to the API + key paths ONLY; the in-process handle-mutation
> leg stays OPEN and is carried as a NAMED residual (§5 item 4 + §6). It closes only with a provenance-anchored
> registry binding (plans/31) -- NOT this arc.
>
> **What W4 does NOT prove (the LOUD ceiling, unchanged from plans/30 §4):** it does NOT close the 5th leg (a
> host self-registers its OWN persona + signs authentic edges under it -- that is R3/U1, SEPARATE); it does NOT
> gate (`convert.actionable` hard-false, U2 open); it does NOT establish PROVENANCE in-process (the cross-uid
> HARDEN legs -- host `cat` key -> EACCES, the live wrapper persona-mismatch deny, gcore extract -- run ONLY at
> the operator deploy, and are represented here as NOTE/residual, NEVER asserted passed). The verdict field is
> named `inProcessReadControlsPassed` -- it can NEVER read as "hardened" / "provenance verified" (mirrors
> `custody-verify.js`'s `hostObservableChecksPassed`, and its documented reason for having no `custodyReal` field).
>
> **DESIGN settled by the W4 design-exploration architect (this session), all 4 forks decisive** (§7).

## §0 What W4 is (one paragraph)

W4 adds NO `src/` module. It is (1) a comprehensive integration PROOF test that EXTENDS the W3 `world()` fixture
(lifted to a shared `v0/test/integration/_world.js` so W4 extends it, not forks it -- honoring W3's documented
forward-contract) with the read-side controls, carrying an in-test machine-checkable verdict helper
(`assessReadControls(checks) -> {inProcessReadControlsPassed, checks[], residuals[]}` -- a LOCAL helper, NOT an
export, mirroring `custody-verify.js assessCustody`, with NO bare `hardened` field); and (2) a NEW runbook
`docs/deployment/live-edge-provenance.md` -- the operator's signing-into-the-graph procedure, composing
`cross-uid-broker.md` (the custody deploy) as a prerequisite. It changes NO src module, adds NO darkness witness
(no new dormant module), and touches NO deploy artifact.

## §1 Runtime Probes (firsthand, this session)

- **claim:** `custody-verify.js assessCustody` is the SHAPE to mirror -- a pure verdict with `checks[]`/`residuals[]`
  and NO bare `hardened`/`custodyReal` field (NS-9).
  **probe:** Read `custody-verify.js:38-131` (the JSDoc + the return object).
  **observed:** returns `{hostObservableChecksPassed, requiresOutOfBandUidConfirmation, checks, residuals}`; the
  JSDoc (`:38-40`, `:117-118`) documents WHY there is no `custodyReal` field (the host cannot observe uid
  separation). W4's local helper mirrors this shape with `inProcessReadControlsPassed`.
- **claim:** the readout (`disjoint_paths`) is persona-BLIND -- a self-registered attacker's own VOUCH weighs the
  SAME as a broker's (so a naive "attacker gets 0" apex assertion would be FALSE/vacuous).
  **probe:** Read `convert.js:20-27` (`buildVouchGraph`) + `:35-72` (`maxVertexDisjointPaths`, unit vertex cap).
  **observed:** edges keyed on `src_persona_did`/`payload.target_persona` with ZERO persona privileging; every
  verified VOUCH edge has unit vertex capacity. -> the apex control MUST assert own-persona PARITY (e1), not zero.
- **claim:** first-writer immutability blocks re-registering the BROKER DID under an attacker key.
  **probe:** Read `registry.js:50-58`.
  **observed:** a re-register with a CONFLICTING `(humanUid, publicKeyPem)` THROWS (`registry.js:54-56`). -> e2
  assertion: `registerPersona(reg, {personaDid: BROKER, publicKeyPem: attackerKey, ...})` throws.
- **claim:** an edge claiming `src_persona_did == BROKER` but signed under the attacker key DROPS at the read gate.
  **probe:** Read `read-gate.js:41-50`.
  **observed:** `lookupPublicKey(registry, BROKER)` returns the REAL broker key; a sig under the attacker key fails
  `verifyRecordSig` -> DROP (`sig-verify-failed`, attack class, `read-gate.js:50`). -> e2 assertion: the forged
  broker-attributed edge is ABSENT from `verifiedRecords`.
- **claim:** the (b) persona-mismatch DENY is a PURE, in-process function -- but `recomputeBinds` runs BEFORE
  `personaBinds`, so a wrong `claimedRecordId` denies with the WRONG reason (the `cross-uid-broker.md` §9-C trap).
  **probe:** Read `request-auth.js:90-118` (order: recompute at `:114`, persona at `:116`).
  **observed:** to get a genuine `persona-mismatch` (not `record-id-mismatch`), the foreign body's
  `claimedRecordId` MUST be `computeRecordId(foreignBody)`. -> the (b)-logic test computes the id correctly first.
- **claim:** `signRecordId` is fail-SOFT (an in-process attacker with no key cannot produce a signature).
  **probe:** Read `edge-attestation.js:88-98` (the JSDoc: "no signer ... -> null. Never throws").
  **observed:** `signRecordId(id, {})` -> null. -> control (c): `signRecordId(id, {}) === null`.
- **claim:** `assertBrokerPersona` exists (the DID-consistency proof §5-W2 names) + a live-edge runbook is a NEW doc.
  **probe:** `grep -n assertBrokerPersona v0/src/identity/broker-client.js` ; `ls docs/deployment/`.
  **observed:** `broker-client.js:88` `assertBrokerPersona(signer, {registry, personaDid})` throws on a key<->
  persona mismatch; deployment docs are `cross-uid-broker.md` (custody dogfood) / `r-heap-*` / `sigma-root-deploy.md`
  (the SEPARATE registry-binding runbook -- its own PR, stays OUT). -> FORK D: a NEW `live-edge-provenance.md`.

## §2 The design -- a test-only proof board + a runbook (NO src module)

### 2a -- the in-test verdict helper (machine-checkable, never `hardened`)

A LOCAL helper in the W4 test (mirrors `custody-verify.js assessCustody`, NOT an export -- FORK A test-only).
**FAIL-CLOSED on an unknown status + empty checks (VERIFY-hacker H2 -- the `security.md` "typo fails CLOSED"
discipline + the `arm-flags.js` asymmetric-parse convention):** any status not in `{PASS, FAIL, NOTE}` counts as
FAIL (a typo'd `NOET` must NOT silently pass AND must NOT vanish from the report), and an EMPTY checks array is
NOT a pass (a vacuous `[].every()===true`):

```js
const READ_CONTROL_STATUSES = new Set(['PASS', 'FAIL', 'NOTE']);
// checks: [{ id, status: 'PASS'|'FAIL'|'NOTE', detail }]. Deploy-only legs are NOTE (never PASS).
function assessReadControls(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    return { inProcessReadControlsPassed: false, checks: checks || [], residuals: ['no checks recorded -- vacuous'] };
  }
  // fail-CLOSED: an unrecognized status is treated as FAIL (never swallowed as pass), and every non-PASS/NOTE
  // leg surfaces in residuals so a typo cannot make a deploy-only leg VANISH from the report.
  const passed = checks.every((c) => c.status === 'PASS' || c.status === 'NOTE');
  // residuals = EVERY non-PASS leg (NOTE, FAIL, unknown) so a real FAIL is NAMED, not just counted (CodeRabbit).
  const residuals = checks
    .filter((c) => c.status !== 'PASS')
    .map((c) => c.id + ': ' + (READ_CONTROL_STATUSES.has(c.status) ? c.detail : 'UNKNOWN-STATUS(' + c.status + ') -- fail-closed'));
  return { inProcessReadControlsPassed: passed, checks, residuals };  // NO `hardened` field (NS-9)
  // (the BUILT helper additionally snapshots each c.status ONCE + guards a null element -- VALIDATE-hacker; see §11)
}
```

The proof assembles the in-process legs as PASS/FAIL checks + the cross-uid legs as NOTE, then asserts
`assessReadControls(checks).inProcessReadControlsPassed === true` AND asserts the deploy-only legs are present as
residuals (so the report can NEVER silently claim the cross-uid HARDEN was proven in-process). A RED test plants a
`NOET` typo + an empty array + a PASS-mislabeled deploy leg and asserts the helper fails CLOSED on each (H2).

### 2b -- the leg split (FORK C): in-process (asserted) vs deploy-only (NOTE/residual)

| Leg | In-process (asserted PASS/FAIL) | Deploy-only (NOTE/residual) |
|---|---|---|
| (a) host `cat` key -> EACCES | -- | NOTE (proven by `custody-verify.js` C2 at deploy) |
| (b)-logic persona-mismatch deny | PASS -- `authorizeRequest` deny `persona-mismatch` (`request-auth.js:116`) | -- |
| (b)-live wrapper deny + empty stdout | -- | NOTE (the real `sudo -n -u` round-trip at deploy) |
| (c) in-process `signRecordId` no-key -> null | PASS -- `signRecordId(id, {}) === null` (`edge-attestation.js:98`) | -- |
| (d) gcore / `/proc/pid/mem` extract denied | -- | NOTE (R-heap re-run, Linux `ptrace_scope=2`) |
| (e1) self-register own persona -> weighs === a broker edge (PARITY) | PASS (EXPECTED SHADOW pass -- the OPEN 5th leg) | -- |
| (e2) cannot mint a broker-ATTRIBUTED edge | PASS -- `registerPersona` throw + `verifiedRecords` drop | -- |
| DID-consistency wiring | PASS -- `assertBrokerPersona` accepts the matched signer (`broker-client.js:88`) | live wrapper triple at deploy |

### 2c -- NS-9 framing (three mis-reads, each PREVENTED)

1. If e1 (own-persona parity) were labeled a "control the deploy closes" -> a false HARDEN. PREVENTED: e1 is
   asserted as an EXPECTED SHADOW pass (the 5th leg is OPEN -- plans/30 §2 leg 5); the test comment says so.
2. If any deploy-only leg (a/b-live/d) were asserted PASS in-process -> a false provenance claim. PREVENTED: they
   are NOTE/residual only; the verdict field is `inProcessReadControlsPassed`, never `hardened`.
3. If any assertion flipped/gated on `actionable` -> a gate. PREVENTED: the proof only READS `actionable` to assert
   it stays `false` (`convert.js:142`).

## §3 Darkness-witness cascade -- DOES NOT EXTEND (FORK A)

W4 adds NO dormant `src/` module, so NO new `importers == []` witness is needed and the cascade does NOT extend.
The existing witnesses (`mint-fresh-vouch-darkness-witness.test.js`, `signed-edge-darkness-witness.test.js`) stay
UNCHANGED and green: they scan `src/` only (`mint-fresh-vouch-darkness-witness.test.js:19,28-36`), so W4's TEST
importing `mintFreshVouch`/`world()` does NOT trip them. **The build MUST re-run both witnesses to confirm they
stay green (the lift of `world()` to `_world.js` is in `test/`, invisible to the src-only scan).**

## §4 Layering (NS-11)

W4 touches NO `src/`. The shared `_world.js` is a TEST helper (imports `src/` producers, never imported BY `src/`).
`layering.test.js` scans `src/` only -> NO new assertion, NO change. The build re-runs it to confirm no accidental
edge.

## §5 TDD plan (RED first)

**Files:**
- **NEW `v0/test/integration/_world.js`** -- the LIFTED shared fixture: `world()` (register ME + personas, ME's
  store, `seedVouch` via `buildFrame`, `mint` via the harness) + the constants (`NOW`, `DAY`, `ARMED`, `FRESH`) +
  the `process.on('exit')` tmp-dir cleanup. Exported: `{ world, NOW, DAY, ARMED, FRESH }`. (Not `*.test.js` -> the
  runner does NOT auto-run it; eslint DOES lint it -- keep ASCII-clean.)
- **MODIFY `v0/test/integration/mint-fresh-vouch.test.js`** -- replace the inline `world()`/constants (lines ~36-80)
  with `const { world, NOW, DAY, ARMED, FRESH } = require('./_world');`. MECHANICAL; the build re-runs the W3 test
  to confirm it stays 5/5 green (honoring "extend, not fork" without breaking the merged W3 proof).
- **NEW `v0/test/integration/edge-provenance-proof.test.js`** -- the W4 proof board (the assertions below).

**The proof board assertions** (the W4 file; extends `world()`; local `assessReadControls` helper):

1. **(b)-logic persona-mismatch DENY (in-process)** -- build a foreign-persona body `{src_persona_did: ATTACKER,
   payload: {...}}`; compute `claimedRecordId = computeRecordId(body)` FIRST (the §9-C ordering trap); assert
   `authorizeRequest({requireFrame:true, brokerPersonaDid: BROKER, presentedBodyRaw: JSON.stringify(body),
   claimedRecordId}).decision === 'deny'` AND `.reason === 'persona-mismatch'` (NOT `record-id-mismatch` -- prove
   the RIGHT gate fired). PASS check.
2. **(c) in-process no-key sign -> null** -- `assert.equal(signRecordId('a'.repeat(64), {}), null)` AND with a
   garbage `privateKeyPem` -> null. PASS check (the in-process attacker with no key cannot sign).
3. **(e1) self-register + own-persona PARITY (EXPECTED SHADOW pass -- the OPEN 5th leg)** -- on a `world()`, register
   an ATTACKER persona (own keypair) + a TARGET; seed `ME -> ATTACKER` (fresh); mint `ATTACKER -> TARGET` under the
   attacker's OWN key via the harness. Assert it PASSES `verifiedRecords`, SURVIVES the armed filter, and
   `disjointPaths(armed, ME, TARGET) === 1`. Build a STRUCTURALLY-IDENTICAL broker baseline (`ME -> BROKER ->
   TARGET2`, single-intermediary, vertex-identical) and assert `disjointPaths(armed, ME, TARGET2) === 1` -- so
   `attackerOwnPersonaWeight === brokerBaselineWeight` (PARITY: persona-blindness = the 5th leg is OPEN). Labeled
   EXPECTED-SHADOW-pass. **M3 note (VERIFY-hacker -- do NOT let e1 be mis-read as "attacker weight is BOUNDED by
   broker weight"):** parity holds on this FIXED single-intermediary topology; persona-blindness ALSO admits the
   spec-§4.5.1 k-paths property (a self-registered attacker who gets ME to vouch K personas fabricates K disjoint
   paths -- `convert.js:5-9`, a KNOWN topological-WEAK property, NOT an e1 regression). The containment is that the
   attacker cannot fabricate ME's OUT-edges without ME's key (a forged `ME->A` under the attacker key DROPS,
   live-confirmed) -- ME's out-edge key-authority, NOT any broker privilege. e1 asserts PARITY only, never a bound.
4. **(e2) cannot mint a broker-ATTRIBUTED edge via the API + key paths (the CLOSED key-custody)** -- two sub-facts,
   both in-process: (4a) `assert.throws(() => registerPersona(reg, {personaDid: BROKER, humanUid: 'human:attacker',
   publicKeyPem: attackerKp.publicKeyPem}))` -- cannot squat the BROKER DID (first-writer immutability,
   `registry.js:54`). (4b) craft a VOUCH frame with `src_persona_did: BROKER` signed under the ATTACKER key
   (via `buildFrame` with the attacker privateKeyPem), append it, then assert `verifiedRecords(...).some(r =>
   r.record_id === forged.record_id) === false` -- the broker-attributed forgery DROPS (`sig-verify-failed`).
   Track the forged `record_id` EXPLICITLY (do not infer). PASS check.
   **H1 BOUNDARY (VERIFY-hacker -- name it in the test + carry it as a NOTE/residual, do NOT claim "closed"):** e2
   is scoped to the `registerPersona` API path (4a) + the no-broker-key path (4b). A same-uid attacker holding the
   `reg` handle CAN still forge a broker-attributed edge via a direct `reg.personas.set(BROKER, attackerKey)` /
   `delete`-then-re-add (bypassing the first-writer guard -- `registry.js:38-41` discloses this; plans/30 §2 leg 5,
   the host-writable registry). Add a NOTE check `e2-inprocess-mutation-OPEN` so `assessReadControls.residuals`
   names it -- the report NEVER reads as "broker attribution is closed in-process." It closes only with a
   provenance-anchored registry binding (plans/31), NOT this arc. (Do NOT try to "fix" it here -- it is the arc's
   disclosed frontier.)
5. **(e) the apex NON-VACUITY (avoid the vacuity traps -- VERIFY-hacker attacked these; keep them RED-able)** --
   (5a) EMPTY-GRAPH: before minting the attacker's own edge, `disjointPaths(armed, ME, ATTACKER_TARGET) === 0`
   (so e1's `=== 1` is load-bearing, not vacuously-anything); a GENUINE broker edge DOES appear in `verifiedRecords`
   (so the "forgery absent" assertion is falsifiable, not empty-store-vacuous). (5b) EXACT-SET: the
   broker-attributed filter uses `r.src_persona_did === BROKER` (exact, NEVER `.includes`/`startsWith`/substring --
   the `security.md` exact-set-not-subset discipline). (5c) SUPERSTRING DECOY (M1): register a
   `did:key:zBroker-evil` persona under the ATTACKER key (a valid own-persona co-forge edge) -- assert it is
   COUNTED under its OWN DID and gets ZERO broker attribution under an exact `=== BROKER` filter, while a
   `.includes(BROKER)` filter would FALSELY over-count it (the test asserts the exact filter yields 1 broker edge,
   the `.includes` count would be 2 -- so a future refactor to `.includes` fails RED). (5d) the forged `record_id`
   is TRACKED explicitly, so "zero broker-attributed attacker edges" is falsifiable, not inferred.
6. **DID-consistency wiring (in-process positive)** -- `assertBrokerPersona(matchedSigner, {registry, personaDid:
   BROKER})` does NOT throw when the signer signs as the registered BROKER key; a MISMATCHED signer throws
   (`broker-client.js:101`). PASS check (the unit-scale analog of the §5-W2 deploy DID-triple).
7. **SHADOW invariant (NS-9)** -- `convert(armed, ME, <any>).actionable === false` throughout (READ-only).
8. **the deploy-only legs are NOTE/residual** -- assert `assessReadControls(checks).residuals` NAMES leg (a),
   (b)-live, (d) AND the `e2-inprocess-mutation-OPEN` H1 residual (so the report cannot silently claim the
   cross-uid HARDEN OR broker-attribution was proven closed in-process); assert `inProcessReadControlsPassed
   === true` on the assembled real checks.
9. **the verdict helper fails CLOSED (VERIFY-hacker H2 -- a distinct RED test on `assessReadControls`)** --
   `assessReadControls([])` -> `inProcessReadControlsPassed === false` (empty = vacuous, not a pass);
   a check with `status: 'NOET'` (typo) -> `false` AND the leg SURFACES in residuals (not swallowed);
   a deploy-only leg mislabeled `status: 'PASS'` still leaves `inProcessReadControlsPassed` honest (a PASS is a
   PASS, but the H1/deploy residuals must still be asserted present by item 8 -- the mislabel cannot make the
   NOTE/residual VANISH). These prove the helper cannot fail-open (the `security.md` "typo fails CLOSED").

## §6 What W4 does NOT do (NS-9)

- Does NOT close the 5th co-forge leg -- e1 DISCLOSES it OPEN (a self-registered attacker gets EQUAL own-persona
  standing). Closing it needs a provenance-anchored registry binding (plans/31) + a broker-privileging consumer --
  BOTH out of this arc.
- Does NOT close the in-process `reg.personas.set`/`delete` broker-attribution forge (VERIFY-hacker H1) -- e2 is
  scoped to the `registerPersona` API path + the no-broker-key path; the same-uid handle-mutation leg
  (`registry.js:38-41`, plans/30 §2 leg 5) stays OPEN and is carried as the `e2-inprocess-mutation-OPEN` residual.
  It closes with plans/31, NOT this arc.
- Does NOT establish PROVENANCE in-process -- the cross-uid HARDEN legs (a/b-live/d) run ONLY at the operator
  deploy; W4 represents them as NOTE/residual, never asserted passed.
- Does NOT gate / flip `actionable` / privilege the broker persona in the readout (`disjointPaths` stays purely
  structural -- e1's parity leg depends on it staying un-privileged).
- Does NOT add a `src/` module, a darkness witness, or a CLI; does NOT touch `sigma-root-deploy.md` (its own PR).
- Does NOT deploy, arm, attest, create a uid, write /etc, install a key, or edit sudoers (NS-7 -- the USER's).

## §7 Architect design-exploration -- the 4 forks (FOLDED)

- **FORK A = TEST-ONLY** (no new src module). custody-verify.js already IS the deploy-time key-custody verifier;
  W4's new property is read-side + in-process; a new dormant module buys nothing (YAGNI) + would add a 4th witness
  burden. The machine-checkable verdict lives as a LOCAL `assessReadControls` helper. -- §2a.
- **FORK B = the two-leg apex control**, sharpened: "broker-equivalent standing" := "an edge `verifiedRecords`
  attributes to the broker DID". e1 (OPEN, EXPECTED pass) = own-persona PARITY (weighs === a broker edge, NOT
  zero); e2 (CLOSED) = cannot mint a broker-attributed edge (`registerPersona` throw + read-gate drop). Exact-set
  `=== BROKER`, tracked forged `record_id`, incremental + empty-graph + decoy non-vacuity. -- §5 items 3-5.
- **FORK C = NOTE/residual mirror**; field `inProcessReadControlsPassed` (never `hardened`); (b) SPLITS into
  in-process decision-logic (asserted) + deploy-only live-enforcement (NOTE). -- §2b.
- **FORK D = a NEW doc `docs/deployment/live-edge-provenance.md`** (SRP: distinct from the custody-VERIFY
  `cross-uid-broker.md`, which it references as a prerequisite; DRY -- links, does not duplicate). Keep
  `sigma-root-deploy.md` strictly out. -- §8.
- **Also:** darkness cascade does NOT extend (§3); positive control is REUSED via the lifted `world()`, not rebuilt
  (§5); plans/30 §7 open decisions are SETTLED by §9 (freshness ON, VOUCH, multipass VM) -- not re-litigated here.

**Punch-list:** (1) lift `world()`+constants to `_world.js`; (2) re-point the W3 import + re-run W3 (5/5); (3) the
W4 proof board test (§5 items 1-8) with the local `assessReadControls` helper; (4) the 4 vacuity traps pre-closed
(empty-graph / exact-set / decoy / tracked id); (5) the runbook `live-edge-provenance.md` (§8); (6) register the
W4 test in the integration runner (auto-discovered); (7) re-run both darkness witnesses + layering (unchanged,
green); (8) NEVER a bare `hardened` field / never assert a deploy-only leg passed.

## §8 The runbook -- `docs/deployment/live-edge-provenance.md` (FORK D)

A NEW doc, SHADOW-labeled throughout (mirror `cross-uid-broker.md:9,18`). Spine (composition, honest ceiling):

1. **Header + honest ceiling** -- "this signs a LIVE trust-graph edge with a cross-uid-custodied broker key; the
   weight it feeds is SHADOW (`convert.actionable` false); it HARDENS the broker persona's KEY-CUSTODY only, NOT
   'the edge proves who' (the registry binding is host-writable -- plans/30 §2 leg 5 / §4)."
2. **Prerequisite (link, do NOT duplicate)** -- `cross-uid-broker.md` §1-9 DONE + attested (the uid, 0600 key,
   root-owned wrapper, sudoers, require-frame + allowlist). W4's doc adds only the live-edge delta.
3. **Register the broker persona pubkey** in the host registry (`registry.js registerPersona`) -- else the minted
   edge silently DROPS as `unregistered-sender` (a misconfig masquerading as a custody fault).
4. **The DID-consistency triple (MANDATORY gate)** -- wrapper `PACT_BROKER_PERSONA_DID` == registry entry DID ==
   verifier `--persona`; run `assertBrokerPersona` (`broker-client.js:88`, the NS-2 key<->persona proof) -- a green
   result is the PRECONDITION for the minted edge to pass `verifiedRecords`.
5. **Mint the live edge** -- `crossUidBrokerSigner -> createMinter -> mintFreshVouch` (the W3 harness), append to
   the receiver store.
6. **Attest out-of-band** -- run `custody-verify.js` (the key non-readability + liveness) + the 4 manual checks
   (`id`, `ls -l <key>`, `cat <key>` -> Permission denied, `sudo -u <broker> id -u`). The `--attested-cross-uid`
   flag records the operator's attestation; it changes the exit code, NOT the proof.
7. **The honest ceiling (LOUD)** -- what success buys (broker persona key-custody, one box/run/axis) and what it
   does NOT (the 5th leg / registry-binding provenance / U2 gating / R3-U1 -- the named open frontiers).

## §9 Settled inputs (plans/30 §7, NOT re-litigated)

- **Freshness = ON** (done in W0-W2; the minted edge is freshness-bound, replay NARROWED to the TTL window).
- **Edge type = VOUCH** (most-consumed; the flagship `convert` readout).
- **Deploy target = the multipass VM** (strongest axis, `ptrace_scope=2`) -- but RE-PROBE at deploy (the "still
  deployed" state is decayable; the runbook says to re-verify `sysctl kernel.yama.ptrace_scope` / `swapon --show`
  / `core_pattern` before relying on it). These are the USER's operator inputs, NOT W4 code.

## §10 VERIFY board (pre-build) -- architect design-exploration DONE; hacker LIVE-probe DONE + FOLDED

- **architect (design-exploration):** all 4 forks settled DECISIVELY (§7); the sharpest risk named -- e1
  mislabeled as a "close" OR e2 passing vacuously (empty-graph / `.includes` / untracked forged id). Pre-closed by
  the EXPECTED-SHADOW-pass label on e1 + the exact-set/tracked-id/empty-graph/decoy non-vacuity on e2 (§5 item 5).
- **hacker (LIVE-probe) DONE + FOLDED. Verdict SOUND-WITH-CHANGES; no redesign, no src change.** 6 `/tmp` probes
  requiring the REAL src drove `verifiedRecords`/`disjointPaths`/`registerPersona`/`authorizeRequest`/`signRecordId`/
  `assertBrokerPersona`; 14 attack classes. **0 CRITICAL** (no probe produced a broker-attributed edge via any
  API/DID-normalization/type-confusion route). Every asserted leg (e1 parity, e2's two API-path sub-facts, b-logic,
  c, the four vacuity traps, `assertBrokerPersona`) HELD against the real code. **FOLDS applied to this plan:**
  - **H1 (e2 header over-claim) -> FOLDED (header SCOPE CAVEAT + §5 item 4 H1 BOUNDARY + §6):** the in-process
    `reg.personas.set`/`delete` bypass IS the disclosed 5th leg (`registry.js:38-41`; plans/30 §2 leg 5) -- a
    LABELING gap, not a code bug. "gets ZERO" narrowed to the API + key paths; the handle-mutation leg carried as
    the `e2-inprocess-mutation-OPEN` residual.
  - **H2 (`assessReadControls` fail-open) -> FOLDED (§2a helper + §5 item 9):** an unknown status is now FAIL
    (never a silent pass, never vanishing from residuals); an empty checks array is NOT a pass. A dedicated RED
    test proves each fail-closed (the `security.md` "typo fails CLOSED" + `arm-flags.js` asymmetric-parse).
  - **M1 (exact-set) -> FOLDED (§5 item 5c):** the `did:key:zBroker-evil` SUPERSTRING decoy is now an explicit
    fixture -- `=== BROKER` yields 1, `.includes` would yield 2, so a future `.includes` refactor fails RED.
  - **M2 (b-logic ordering) -> CONFIRMED in-spec (§5 item 1):** compute `claimedRecordId = computeRecordId(body)`
    first + assert `.reason === 'persona-mismatch'` (NOT just `decision==='deny'`) so the RIGHT gate is proven.
  - **M3 (e1 parity over-read) -> FOLDED (§5 item 3 M3 note):** parity is on a FIXED single-intermediary topology;
    the spec-§4.5.1 k-paths property is a KNOWN topological-WEAK trait (NOT an e1 regression); the containment is
    ME's out-edge key-authority (a forged `ME->A` drops), never broker privilege.
  - **L1/L2 -> no fix (documented env-trim asymmetry; deploy-only legs un-provable in-process, closed by H2).**

## §11 VALIDATE result (3-lens, post-build) -- DONE + FOLDED

Ran as a parallel 3-lens board over the BUILT diff (`_world.js` lift + the W3 re-point + the 9-test proof board +
the runbook). **code-reviewer APPROVE (0 findings) · hacker (Rule-2a) SHIP-WITH-NITS (no false green) ·
honesty-auditor A- SHIP-WITH-NITS.** All three ran the suite; the code-reviewer + hacker re-probed the built code.

- **code-reviewer (APPROVE) -- 0 findings.** Confirmed via `git diff` + live runs: the W3 lift is byte-faithful
  (only the tmp prefix + one comment changed; the 4 W3 bodies untouched, 4/4 green); `_world.js` resource-safety is
  correct (each `*.test.js` runs in its OWN child process via `test/run.js:59` `spawnSync` -> the shared `_allDirs`
  + exit-cleanup is per-process, no leak; `_world.js` correctly not auto-run); the apex/decoy/fail-closed
  assertions are genuinely FALSIFIABLE (independently verified against real `convert.js`/`registry.js`/`read-gate.js`
  -- e1 parity is a real comparison on vertex-identical topologies, e2 tracks the forged `record_id`, the decoy
  proves `.includes` over-counts); the runbook `require()` paths resolve + the `crossUidBrokerSigner`/`mintFreshVouch`
  call shapes match the real signatures. Suite 596/0, lint clean.
- **hacker (Rule-2a, SHIP-WITH-NITS) -- no FALSE GREEN found across 6 live `/tmp` probes.** e1 parity is genuinely
  independent (perturbing the attacker topology moves its weight; the broker mint does not change the attacker's
  sink -- not trivially-both-1); e2's forgery-drop is a REAL sig-verify drop (re-registering the attacker key AS the
  broker key flips the IDENTICAL bytes to PASS -> the drop is the key/sig mismatch, not a store miss); the only
  exact-`===`-BROKER forgery path is the disclosed `reg.personas.set` H1 leg (uppercase/whitespace/ZWSP/combining/
  array `src_persona_did` variants all register as a DIFFERENT persona or are rejected by `validateRecord`); the
  exact `===` filter beats SHARPER decoys than the test enumerates; the fail-closed helper resists object/number/
  undefined/`__proto__`-string statuses; NS-9 clean (the H1 residual genuinely surfaces in the assembled verdict,
  `hardened` asserted absent). **2 NITS (non-reachable in the built artifact -- the helper only ever gets literal
  arrays -- FOLDED anyway as cheap fail-closed hardening):** (nit 1) `assessReadControls` read `c.status` twice
  across `.every`/`.filter` (a toggling-getter read-twice, `security.md` C1) -> FOLDED: snapshot each status ONCE
  into `rows` first; (nit 2) `assessReadControls([null])` threw on a null ELEMENT -> FOLDED: a null/non-string
  status normalizes to a `__MISSING__` sentinel = fail-closed. Both proven by 2 added H2 assertions (§5 item 9).
- **honesty-auditor (A-, SHIP-WITH-NITS) -- no provenance-direction over-claim; the W3 plan-vs-code gap does NOT
  recur.** CONFIRMED: e1 is labeled EXPECTED-SHADOW-pass ("OPEN, NOT closed"; "integrity, NOT provenance") and
  asserts PARITY, never a bound (the M3 k-paths note is honest under-labeling); the e2 H1 boundary is disclosed by
  EXECUTING the bypass and asserting the forgery LANDS (`:153-155`), not by comment alone (the strongest honesty
  move in the wave); the verdict field is `inProcessReadControlsPassed` with `hardened` asserted ABSENT; the runbook
  ceiling matches plans/30 §4 (same 5 open frontiers). Every §5 assertion has a committed test (mapped item->line).
  **2 cosmetic NITS FOLDED:** (a) plan cited `convert.js:143` for `actionable:false` -> corrected to `:142`
  (status-decay line-drift); (b) runbook "First world-anchored ... signal" reworded to the deploy-conditional form
  ("a successful operator deploy ... WOULD make this the first ...") so a skim cannot read it as already-achieved.

**Post-fold suite:** 45 files · 596/0 (9 W4 proof + the rest), layering 9/9, all 4 darkness witnesses green
(unchanged -- the lift is in `test/`, invisible to the src-only scan), eslint clean. No src change; the folds are
2 test-helper hardening lines + 2 added H2 assertions + 2 doc/plan reword nits.

**Session honesty pattern (worth promoting):** "disclose-an-open-leg by EXECUTING the forgery, not by comment" --
an OPEN residual is CONFIRMED-honest only when the test PROVES the forgery lands (e2 `:153-155`), not merely names it.

**pre-PR CodeRabbit CLI (`review --plain --base main --type uncommitted`) -- 3 findings, 1 IN-SCOPE folded:**
- **minor (IN SCOPE, `assessReadControls` residuals) -> FOLDED:** a real `FAIL` leg made `inProcessReadControlsPassed`
  false but DISAPPEARED from `residuals` (only NOTE + unknown were surfaced), weakening the fail-closed audit trail.
  Premise-probed TRUE. Fold: `residuals` now names EVERY non-PASS leg (`filter(status !== 'PASS')`) + an added H2
  assertion that a FAIL surfaces in residuals.
- **major + minor (OUT OF SCOPE, `docs/deployment/sigma-root-deploy.md`) -> CARRIED, NOT folded:** the CLI reviews
  UNTRACKED working-tree files, so it flagged the separately-carried sigma-root runbook (Phase C-vs-A.3 reference +
  a `!sigmaRoot` guard) -- NOT part of the W4 diff. Carried for that runbook's OWN PR (the W3 precedent).

**PR #45 async CodeRabbit -- RATE-LIMITED (spending cap), NOT a real re-review** (the green "Review completed"
check is the cap-reached state, not a review; SCAR: a green async-bot check can mean rate-limited). It selected the
5 files but the org hit its usage cap ("next review in 26 min"). The CodeRabbit-class review was already delivered
by the pre-push CLI (same engine, the exact diff, the in-scope FAIL-residuals finding FOLDED into the pushed
commit), so the async pass would be redundant. Shipped on CI (ESLint + Tests node 20/22 green) + the 3-lens VALIDATE
boards + the CLI + the verified fold -- the #11/#31/#32/#34/#38 cap precedent. A renudge before the countdown is a
documented no-op on an already-seen commit.
