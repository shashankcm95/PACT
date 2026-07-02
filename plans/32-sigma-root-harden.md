---
lifecycle: persistent
status: SCOPING -> VERIFY -> TDD build (W1 = the SHADOW verification substrate; the ARMED gate + the deploy are LATER)
plan: 32
created: 2026-07-02
depends-on: plans/31 (registration-provenance -- the three-binding classification + the USER decisions this builds on) ; plans/30 (the HELD broker-signing arc, resumes AFTER this) ; plans/09 (the custody-verify SHADOW-verifier shape this mirrors) ; PACT-spec-v1.1.md §1.1 (the σ_root DESIGNED-but-UNBUILT field) ; PACT-NORTH-STAR.md NS-6/NS-7/NS-9
audience: a build session (W1) + the eventual operator (the out-of-band root-key attestation) + the USER (go-ahead gates)
title: σ_root -- the world-anchored persona<->key root-signature (the registration-provenance apex; W1 = SHADOW verification wiring)
---

# Plan 32 -- σ_root HARDEN (the apex of the registration-provenance arc)

> **HONEST-LABELING HEADER (read first, NS-9).**
> This wave builds the σ_root **VERIFICATION WIRING** the spec designed (`PACT-spec-v1.1.md:72`) but never
> built. **W1 (this wave) is SHADOW: an ADVISORY verifier that gates NO action and enforces NOTHING** -- it
> computes whether a persona<->key binding carries a valid root-signature and REPORTS it, exactly as
> `custody-verify.js` reports `hostObservableChecksPassed` + `requiresOutOfBandUidConfirmation` without ever
> asserting custody-real.
>
> **σ_root NARROWS in-process; it HARDENS only when the ROOT KEY is world-anchored** (OQ-NS-6 / NS-7). A
> same-uid host can self-generate a root keypair, seed it, and self-sign its own persona's binding -- the crypto
> checks PASS, but that only moves the unauthenticated boundary UP one level (the recursion, plans/31:213-229).
> The regress bottoms out HONESTLY only at an **out-of-band operator act**: the operator attests that
> `K_root_pub` genuinely belongs to a distinct real human root. **Claude builds + verifies the WIRING and writes
> the runbook; the USER attests.** Claude NEVER creates a uid, writes /etc, installs a key, edits sudoers, sets a
> deploy flag, or performs the attestation (NS-7).
>
> **What σ_root proves even fully-hardened: KEY-AUTHORIZATION, not WHO.** A verified σ_root proves "the holder of
> root key `K_root` authorized `K_pub` as persona `P`." It does NOT identify the human behind `K_root` -- that is
> binding #3 human<->real = U1, the named permanent frontier (Douceur), contained-never-closed. σ_root closes /
> narrows binding #1 (persona<->key) and, because the signature spans the controller, binds #2 (persona<->human)
> to the same root -- it never touches #3.

## What this wave delivers (W1 -- the SHADOW verification substrate)

Three source units + the operator runbook. All SHADOW/advisory; nothing wired into a trust fold, nothing
enforced, byte-identical live behavior for every existing flow (the fold reads NONE of this in W1).

1. **`v0/src/identity/sigma-root.js` (NEW, pure crypto).** The σ_root primitive, reusing the earned ed25519
   mechanism (`edge-attestation.js`: alg-pinned, canonical-base64, 64-byte gate, per-key resolution, fail-closed
   -- NS-10 reuse-the-earned-mechanism):
   - `BINDING_TYPE = 'pact.sigma_root.binding.v1'` -- a **domain-separation tag** (VERIFY architect HIGH; refined by
     VALIDATE hacker NIT-1). σ_root and a frame `record_id` are BOTH ed25519-over-a-64-hex-`sha256(canonicalJson
     (...))`, signed by the same `signRecordId`, potentially under the same key -- a cross-protocol signature-reuse
     surface. The load-bearing separator against a VALID frame is the DISJOINT required-field set (a frame REQUIRES
     ver/type/src_persona_did/parent_human_uid/seq/nonce, so its canonical form can never equal a binding's); the
     `_type` tag is explicit defense-in-depth ON TOP of that (a hand-crafted non-frame object COULD be made to
     collide, but is not a reachable frame), and the `.v1` versions the frozen preimage so a future rotation-epoch
     format is a clean `.v2`, not a break.
   - `computeBindingId({ personaDid, publicKeyPem, controller })` -> 64-hex =
     `sha256hex(canonicalJsonSerialize({ _type: BINDING_TYPE, controller, k_pub: publicKeyPem, persona_did:
     personaDid }))`. **Injective canonical form** (sorted-key JSON, quoted) -- NOT string concat (defends the
     concat-ambiguity attack: `"z"+"Akey"` vs `"zA"+"key"` collide under concat, never under canonical JSON).
     Spanning the `controller` binds persona<->human into the same signature and blocks a cross-root replay by
     construction. **FULL type-gate on every field** (VERIFY hacker M1): `typeof v !== 'string' || v.length === 0`
     -> `TypeError`, exactly as `registry.js:46-48` / `edge-attestation.js:45` (a bare `!v` truthiness test passes
     `[]`/`{}` -- LIVE-PROVEN -- letting non-key garbage into the signed set).
   - `signSigmaRoot({ personaDid, publicKeyPem, controller }, rootSignerOpts)` -> base64 σ_root | null.
     **Wraps `computeBindingId` in try/catch -> null** (VERIFY hacker C1: `canonicalJsonSerialize` THROWS past its
     depth-100/node-10000 bound, and `computeBindingId` throws on a bad field -- neither may propagate). Then signs
     via `signRecordId(bindingId, rootSignerOpts)`. `rootSignerOpts` = `{ privateKeyPem }` (provisioning/test) OR
     `{ signer }` (a custody-boundary root signer, forward-compat with plans/30). Fail-soft -> null (NEVER throws).
   - `verifySigmaRoot({ personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem })` -> boolean,
     **fail-CLOSED**. **Wraps `computeBindingId` in try/catch -> false** (C1 -- copies the `record.js:112-118`
     `deriveIdempotencyKey` fail-closed template verbatim). Verifies via
     `verifyRecordSig(bindingId, sigmaRoot, { publicKeyPem: rootPublicKeyPem })`. Any missing input, a wrong root
     key, a tampered binding, a pathological field, or a non-ed25519 root key -> false. NEVER throws.

2. **`v0/src/identity/registry.js` (MODIFIED, PURELY ADDITIVE).** The root-key model the spec's `HumanRoot :=
   { human_uid, K_root_pub }` designs. Every existing export (`registerPersona`, `lookupPublicKey`, `rootOf`,
   `isKnownRoot`, `createRegistry`) is behaviorally UNCHANGED (INV-18 preserved -- the registry still RECORDS,
   never an oracle):
   - `createRegistry()` gains a `rootKeys: new Map()` (alongside `roots`/`personas`).
   - `registerRoot(reg, { humanUid, rootPublicKeyPem })` -- **first-writer immutable, mirroring `registerPersona`'s
     W0 guard exactly** (full type-gate, M1): non-empty-string checks; an identical re-register is an idempotent
     no-op; a conflicting re-register THROWS (the root key is IMMUTABLE first-writer-wins). Records ONLY
     `rootKeys.set(humanUid, pem)` -- **it does NOT `roots.add`** (VERIFY architect F3): `roots` stays SINGLE-WRITER
     (`registerPersona`), so `isKnownRoot` -- a predicate the LIVE fold reads at `frame.js:94` -- gains no new
     writer, and a seeded-but-persona-less root is not frame-admissible (correct: no persona under it => nothing to
     admit). `rootKeys` is fully independent of both live-read structures. The first-writer guard is what makes
     "seed once, out-of-band" meaningful -- it is the in-process protection for the seeded genesis anchor (F1).
   - `lookupRootKey(reg, humanUid)` -> rootPublicKeyPem | null (per-root, no ambient default -- same discipline as
     `lookupPublicKey`).
   - **`registerPersona` is DELIBERATELY UNTOUCHED.** It does NOT verify or reject on σ_root (that would turn the
     registry into an admission ORACLE and brick bootstrap + every existing σ_root-free flow). The σ_root check is
     ADVISORY, in the separate verifier below. Enforcement is a DARK, armed, LATER wave (see "Deferred").

3. **`v0/src/identity/registration-provenance.js` (NEW) -- the SHADOW verifier, mirroring `custody-verify.js`.**
   - `assessRegistrationProvenance({ personaDid, publicKeyPem, controller, sigmaRoot, rootPublicKeyPem })` ->
     `{ sigmaRootChecksPassed, requiresOutOfBandRootAttestation, checks, residuals }`. **PURE** over its inputs; it
     COMPUTES the crypto check from the primitive (never trusts a pre-passed boolean -- the #273 lesson: verify the
     thing, don't read a self-asserted field).
   - Checks: **R0** binding well-formed (personaDid + publicKeyPem + controller non-empty); **R1** σ_root PRESENT
     (absent -> FAIL: the binding carries no root authorization -- the self-register leg is wide open); **R2** a root
     key is present to verify against (`rootPublicKeyPem` -- absent -> FAIL: nothing to anchor to); **R3** σ_root
     VERIFIES over the binding under the root key (the load-bearing crypto check -- a planted mismatch MUST fire
     RED, non-vacuity).
   - `sigmaRootChecksPassed` = R0..R3 all PASS -- **the PRIMARY verdict a consumer branches on**.
   - **`requiresOutOfBandRootAttestation` IS the pass-leg (`= sigmaRootChecksPassed`)** (VERIFY hacker H1 + architect
     F5; wording corrected per VALIDATE honesty HIGH-1 -- the earlier "not merely `= checksPassed`" over-stated a
     structural derivation the code does not carry). Unlike custody-verify -- where the analog tracks a SEPARATE
     denial leg that can diverge from the checks -- σ_root has a SINGLE pass-leg (R3 already ANDs R0..R2), so
     custody-verify's structural DECOUPLING does not apply and the invariant `sigmaRootChecksPassed === true =>
     requiresOutOfBandRootAttestation === true` holds BY IDENTITY (tested). It is a PASS-STATE QUALIFIER: passing
     the crypto check is NECESSARY, NEVER SUFFICIENT (the root PUBLIC KEY can be host-self-generated -- the
     recursion), so a PASS still only NARROWS. **A consumer MUST NOT read `!requiresOutOfBandRootAttestation` as
     "clean"** -- on a FAILED check the flag is also `false`, meaning "the binding failed R0..R3, fix it," NOT
     "nothing pending."
   - **DELIBERATELY NO `sigmaRootWorldAnchored` / `provenanceReal` field** (NS-9) -- exactly as `assessCustody` has
     no `custodyReal` field. The verifier reports host-checkable necessary conditions, never a world-anchored close.
   - residuals: names the out-of-band root attestation as the SOLE determiner (mirrors custody-verify's residual).
   - **`assessRegistrationFromRegistry(reg, { personaDid, sigmaRoot })` -- the SAFE-PATH-BY-DEFAULT wrapper**
     (VERIFY hacker H2). The pure `assessRegistrationProvenance` trusts its caller-supplied triple + root key -- a
     malicious consumer could pass the ATTACKER's own self-generated `rootPublicKeyPem` and get a clean pass. This
     wrapper BINDS the verified triple to the registry's frozen rows: it sources `publicKeyPem = lookupPublicKey(reg,
     personaDid)`, `controller = rootOf(reg, personaDid)`, `rootPublicKeyPem = lookupRootKey(reg, controller)`, and
     **fail-closes on ANY null** (an unseeded root key -> not verifiable, never a pass). Note `isKnownRoot` (the
     `roots` Set) and `lookupRootKey` (the `rootKeys` Map) are DIFFERENT predicates -- a persona-seeded `humanUid`
     is a "known root" with a `null` root key; the σ_root anchor is ONLY `lookupRootKey`, NEVER `isKnownRoot`. Every
     consumer (and W2's armed gate) MUST source through this wrapper, never the record-under-test.

## The bootstrap chicken-and-egg -- RESOLVED BY RELOCATION to the out-of-band root seam (in-process it still only NARROWS; plans/31 Open Decision 2, the load-bearing tension)

plans/31:298-301 flagged: "the first persona's key is registered AT registration, so any σ_root check has no prior
anchor for row #1." **Resolution: the ROOT key is the genesis anchor, seeded OUT-OF-BAND, and is a DISTINCT seam
from the persona keys it authorizes.** The turtle stops at the operator-attested root key, not at a persona key:

1. The operator generates a root keypair `(K_root_priv, K_root_pub)` OFF the box (or in an enclave/HSM/separate
   uid -- the custody posture is plans/30's concern; here we require only that `K_root_pub` is world-anchored).
2. The operator seeds `registerRoot(reg, { humanUid, rootPublicKeyPem: K_root_pub })` -- the genesis row.
3. Each persona registration is authorized by a σ_root the root SIGNS over `(persona_did, K_pub, controller)`.
4. The verifier checks σ_root against the SEEDED `K_root_pub`. The persona key `K_pub` is NEVER the anchor -- the
   ROOT key is, and it is seeded out-of-band. **That out-of-band seeding + attestation is what makes σ_root a
   HARDEN rather than a NARROW** (NS-7). Absent it, the whole chain is a same-uid narrowing.

## Runtime Probes (firsthand this session, against the repo NOW -- re-probe at build-time)

| # | Claim | Probe | Observed |
|---|---|---|---|
| 1 | The registry is `{ roots:Set, personas:Map }`; a `rootKeys` Map + `registerRoot`/`lookupRootKey` is purely additive (no consumer reads a root key today) | Read `registry.js:12-13,45-80` + grep every consumer | `createRegistry` returns `{ roots:new Set(), personas:new Map() }`. Consumers: `rootOf`/`lookupPublicKey`/`isKnownRoot`/`registerPersona` only. NONE reads a root key. Additive extension breaks nothing. |
| 2 | `edge-attestation.js` signs/verifies ed25519 over a 64-hex string, fail-closed, no ambient key default -- σ_root reuses it verbatim | Read `edge-attestation.js:87-116` | `signRecordId(hex64, {privateKeyPem\|signer}, body?)` -> base64\|null; `verifyRecordSig(hex64, sigB64, {publicKeyPem})` -> bool fail-closed. `isHex64` gate + canonical-base64 + 64-byte gate + ed25519 alg-pin. `generateEdgeKeypair()` -> PEM pair. |
| 3 | A canonical 64-hex content-address over an object exists + is depth/node-bounded -- reuse for the binding id | Read `record.js:52-60` + `canonical-json.js:39-56` | `computeRecordId` = `sha256hex(canonicalJsonSerialize(rest))`; `canonicalJsonSerialize` sorts keys, no whitespace, bounded (`MAX_CANONICAL_DEPTH 100` / `MAX_CANONICAL_NODES 10000`, throws past). `sha256hex` + `canonicalJsonSerialize` re-exported from `record.js`. |
| 4 | `custody-verify.js assessCustody` is the SHADOW-verifier shape to mirror (host-observable checks + `requiresOutOfBand...`, NO `custodyReal` field) | Read `custody-verify.js:28-132` | `assessCustody(facts)` -> `{hostObservableChecksPassed, requiresOutOfBandUidConfirmation, checks, residuals}`; header `:39-40` "deliberately NO `custodyReal`/`custodyMechanismVerified` field (NS-9)". The exact template. |
| 5 | The spec designs σ_root but no code reads/verifies it (UNBUILT) | Read `PACT-spec-v1.1.md:72` + grep `v0/src` for σ_root/sigma_root/root.sig | spec:72 `Persona := {persona_did:K_pub, controller:human_uid, σ_root, config_hash}`. grep -> only comment/substring hits in `registry.js`; no verify path. |
| 6 | `registerPersona` untouched keeps INV-18 -- the fold gates on `isKnownRoot`/`lookupPublicKey`, never a σ_root | Read `frame.js:81-100` + `read-gate.js:25-53` | `receiveFrame` gates root_valid via `isKnownRoot` (step 3) + per-sender verify (step 4); `verifiedRecords` keys `lookupPublicKey`. Neither reads σ_root. A SHADOW verifier wired to nothing changes no live path. |

## Operator runbook (the out-of-band HARDEN -- the USER's act, NOT Claude's; written here, executed later)

> Ships as a doc alongside the code; NOT run in this wave. The attestation is the operator's (NS-7).

1. **Generate the root keypair off the deployed box** (or in an enclave / separate uid / HSM). Keep `K_root_priv`
   out of the host uid's read scope -- its custody is plans/30's concern; σ_root only requires `K_root_pub` be
   world-anchored.
2. **Attest `K_root_pub` out-of-band** -- record, in a channel the host cannot forge, that this public key belongs
   to a distinct real human root (the analog of custody-verify's `id`/`ls -l` uid attestation). This is the
   world-anchor; nothing in-process substitutes for it (NS-7).
3. **Seed the genesis root in a CLEAN registry** (root-key-squatting ordering invariant, VERIFY hacker M2):
   `registerRoot(reg, { humanUid, rootPublicKeyPem: K_root_pub })` MUST run before any same-uid actor can call
   `registerRoot` for that `humanUid` -- first-writer immutability means whoever seeds first wins, so the genesis
   seeding has to precede any untrusted `registerRoot` access to the registry.
4. **Authorize each persona**: the root signs `signSigmaRoot({ personaDid, publicKeyPem, controller: humanUid },
   { privateKeyPem: K_root_priv })` (or via the custody-boundary `signer`), and the σ_root travels with the
   persona's registration record.
5. **Verify** (a LIBRARY call in W1, not a CLI -- the operator-facing `custody-verify`-style CLI wrapper is W2):
   `assessRegistrationFromRegistry(reg, { personaDid, sigmaRoot })` reports `sigmaRootChecksPassed=true` +
   `requiresOutOfBandRootAttestation=true`. The PASS is meaningful ONLY because step 2 world-anchored the root key;
   the tool never claims that for you.

## Deferred (NOT this wave -- disclosed, NS-9)

- **The ARMED enforcement gate.** Wiring a σ_root REJECT into `registerPersona` / a read-gate pre-filter, behind
  the P5 arming coherence (`arming-coherence.js`, both-or-neither, DARK by default -> byte-identical), is the NEXT
  sub-wave (W2). W1 ships the verification substrate only; it enforces NOTHING.
- **did:key self-certification.** Folds in here later (the W0 deferral, plans/31:343-348): a well-formed did:key
  DID commits to its key, resisting first-writer squatting for did:key DIDs. Needs a hand-rolled base58btc/
  multicodec encoder. Scoped into this arc, built when the fixtures move off placeholder ids.
- **The deploy + attestation.** The operator's out-of-band act (runbook above). A separate later go-ahead; Claude
  never performs it (NS-7).
- **Resuming plans/30** (broker-signing key-custody). Resumes AFTER this lands, so a custody-hardened broker key is
  meaningful against an anchored registry binding (plans/31 USER decision 2 -- root-key custody stays SEPARATE
  from broker-persona custody; share the deploy mechanism, scope the arcs distinct).

## What this does NOT do (NS-9)

- Does NOT arm or enforce anything -- W1 is a SHADOW verifier wired to no fold; every live path is byte-identical.
- Does NOT CLOSE registration-provenance in-process -- σ_root NARROWS; the HARDEN is the operator's out-of-band
  root-key attestation (the recursion bottoms out only at a world anchor, plans/31 / OQ-NS-6).
- Does NOT close the self-register leg (a) in-process -- an attacker who self-generates + seeds + self-signs a root
  key passes the crypto checks; `requiresOutOfBandRootAttestation` stays TRUE and no field reports it closed.
- **INTRODUCES a NEW residual: ROOT-KEY SQUATTING** (VERIFY hacker M2, disclosed not hidden -- NS-9). `registerRoot`
  first-writer immutability means a same-uid attacker who calls `registerRoot(humanUid, attackerKey)` BEFORE the
  operator seeds the genesis root permanently binds that `humanUid` to the attacker's root key -- strictly worse
  than persona squatting (the root anchors EVERY persona under it). Mitigation is a DEPLOYMENT-ORDERING invariant,
  not a code fix: the genesis `registerRoot` MUST run in a clean registry the attacker cannot pre-touch (runbook
  step 3). Named here + in the runbook + `registry.js`'s docstring.
- **Does NOT freeze a rotation epoch (forward residual, VERIFY architect key_epoch-MED).** The binding
  `{_type, controller, k_pub, persona_did}` carries no `key_epoch`/`not_before`, so a superseded σ_root over an old
  key still verifies once the deferred rotation path lands. YAGNI-deferred (rotation is unbuilt, plans/31); the
  `.v1` `_type` tag makes a future epoch-carrying `.v2` a clean break, not a silent one. Disclosed, not silently
  frozen.
- **Does NOT resolve the W2 arming migration cliff (forward residual, VERIFY architect F7).** W1's R1-absent-is-FAIL
  means that when W2 arms enforcement, EVERY existing σ_root-free legacy persona fails R1 -> the gate would reject
  all of them. Arming therefore requires a re-registration campaign (each persona gets a σ_root) or a grandfather
  predicate -- a W2 concern, named here so the trap is not sprung silently.
- `config_hash` is DELIBERATELY out of the binding -- the root authorizes the KEY, not the config; config-binding
  (spec §1.4 / M3) is a separate trust axis, not a registration-provenance one (VERIFY architect F2-LOW).
- Does NOT make "the edge proves WHO" true -- σ_root proves KEY-AUTHORIZATION under a root key, never the human
  behind it (#3 = U1, contained-not-closed, Douceur; RE-NAMED, never reopened).
- Does NOT gate any action or flip `convert.actionable` -- the whole substrate stays SHADOW (NS-8; U2 near-
  unclosable positively).
- Does NOT change `registerPersona` behavior / turn the registry into an oracle (INV-18 preserved -- the σ_root
  check is a separate advisory verifier, not a registration reject).
- Does NOT deploy, create a uid, write /etc, install a key, edit sudoers, set a flag, or attest (NS-7).
- Does NOT report the SHADOW verifier's PASS as a world-anchored close (NS-9 -- the named failure reflex).

## HETS Spawn Plan (the VERIFY board -- pre-build, this is auth/identity/registration-provenance = the Rule-2 high-stakes class)

Two read-only lenses in parallel BEFORE the build (the pre-build VERIFY analog of `/verify-plan`):

- **architect** -- σ_root design soundness: is the bootstrap resolution honest? is the binding injective + replay-
  safe? does the additive registry extension preserve INV-18? is the SHADOW/advisory boundary sound (does W1 truly
  gate nothing)? is the `requiresOutOfBandRootAttestation`-always-on-a-pass invariant correct?
- **hacker** -- adversarial: can the binding be forged / cross-bound / replayed across roots or personas? can a
  self-generated root key make the verifier over-claim? is there a fail-OPEN path (missing input treated as pass)?
  is `requiresOutOfBandRootAttestation` ever silently dropped on a passing path (the exit-greener-than-report bug
  custody-verify's F4 guards)? does the canonical binding have a collision/ambiguity surface?

Findings fold into a `## Pre-Approval Verification` section here before the TDD build begins.

## Pre-Approval Verification (2026-07-02 -- the 2-lens VERIFY board, pre-build)

**architect: PROCEED-WITH-FOLDS · hacker: BUILD-WITH-FOLDS (core crypto held under ~30 live probes -- injective
binding, full-triple replay-spanning, ed25519 pinning all LIVE-PROVEN; no DESIGN-HOLE).** All must-folds are
folded into the design above BEFORE the TDD build; each carries a RED non-vacuity test.

| # | Sev | Lens | Finding | Disposition (folded above) |
|---|-----|------|---------|----------------------------|
| C1 | CRITICAL | hacker | `canonicalJsonSerialize` THROWS past its bound; a naive `verifySigmaRoot` throws on an attacker-controlled deep/bad field -> a consumer swallowing the throw around a pre-truthy `pass` fails OPEN (LIVE-PROVEN) | `signSigmaRoot`/`verifySigmaRoot` WRAP `computeBindingId` in try/catch -> null/false (copies `record.js:112-118`). RED test: >100-deep AND >10000-node field + missing field -> false/null, never a throw. |
| -- | HIGH | architect | No domain-separation tag -- σ_root + frame `record_id` share the ed25519-over-64-hex space (cross-protocol signature reuse) | binding gains `_type: 'pact.sigma_root.binding.v1'` -- closes it by construction + versions the frozen preimage. |
| -- | HIGH | architect | The SHADOW "byte-identical" claim is asserted, not witnessed (and `registry.js` -- imported by the fold -- now gains exports) | darkness-witness structural test: no `trust/**`/`grounding/**` requires the new modules; fold byte-identical with/without `registerRoot`. |
| H1 | HIGH | hacker | `requiresOutOfBandRootAttestation=false` on a FAILED check reads "greener" than a pass (the custody-verify F4 inversion) | flag derived from the positive pass-leg + documented "branch on `sigmaRootChecksPassed` first, never `!requiresOutOfBand`" + the `checksPassed => requiresOutOfBand` invariant test. |
| H2 | HIGH | hacker | The pure verifier trusts a caller-supplied triple + root key -- an attacker passes its OWN self-generated `rootPublicKeyPem` and gets a clean pass | `assessRegistrationFromRegistry(reg, ...)` sources the triple + root key from the frozen registry rows (safe-path-by-default), fail-closes on any null, anchors ONLY on `lookupRootKey` never `isKnownRoot`. |
| M1 | MED | hacker | `[]`/`{}` pass a `!v` truthiness "non-empty" gate; non-key garbage gets signed (LIVE-PROVEN) | full `typeof === 'string' && length > 0` gate on every `computeBindingId`/`registerRoot` field (matches `registry.js:46-48`). |
| F3 | MED | architect | `registerRoot` `roots.add` adds a 2nd writer to the live-gated `roots` Set | `registerRoot` writes ONLY `rootKeys`; `roots` stays single-writer; a seeded-persona-less root is not frame-admissible. |
| M2 | MED | hacker | root-key squatting (first-writer immutability on the ROOT key) | disclosed as a named residual + a clean-registry genesis-ordering runbook invariant + the `registry.js` docstring. |
| key_epoch | MED | architect | freezing the preimage without a rotation epoch forces a v2 later | YAGNI-deferred + disclosed as a forward residual; the `.v1` tag makes a `.v2` clean. |
| F7 | MED | architect | W2 arming rejects every σ_root-free legacy persona (R1) | disclosed as a forward residual (re-registration campaign or grandfather predicate, a W2 concern). |
| F5/L | LOW | architect | runbook step 5 is a library call, not a CLI; the CLI is W2 | clarified in the runbook. |
| F1/F2-LOW | LOW | architect | bootstrap-§ cross-ref to root-key immutability; `config_hash`-omission rationale | both added above. |
| L1 | LOW | hacker | the self-generated-root over-claim is safe ONLY once H1+H2 land | contingent -- both folded. |
| F6/DRY | LOW | architect | a latent shared "verify a signed content-addressed binding under a resolved key" reader (σ_root C3 read-gate) | YAGNI watch-item for W2's third consumer -- NOT extracted in W1. |

## VALIDATE result (2026-07-02 -- the 3-lens post-build board, on the BUILT diff)

**SHIPPED = the SHADOW sigma_root verification substrate**: `sigma-root.js` (the primitive) + additive `registry.js`
root-key model (`registerRoot`/`lookupRootKey`) + `registration-provenance.js` (the advisory verifier +
registry-sourced safe-path wrapper). **28 new tests -> full suite 493/0; eslint exit 0.** Nothing wired into any
fold; the darkness witness (`require.cache` graph over trust/grounding/frame) is GREEN.

**3-lens board (all findings folded, apply-then-close):**

- **code-reviewer: SHIP-WITH-NITS** (0 must-fix). Live-confirmed the C1 fold held for field-values (50k-deep field
  -> false, no throw), fail-closed correctness across every branch, registerRoot/F3 consistency. HIGH (non-blocking):
  darkness-witness was a textual regex -> **FOLDED to `require.cache` introspection + `frame/` coverage**. LOW: the
  H2 `.length` arity check -> **FOLDED to a source-verified no-`rootPublicKeyPem`-param assertion**.
- **hacker (Rule 2a live-probe): CHANGES-REQUIRED -> FOLDED.** **H-1 (HIGH, LIVE-PROVEN)**: the C1 never-throws fold
  was INCOMPLETE -- `verifySigmaRoot`/`assessRegistrationProvenance`/`assessRegistrationFromRegistry` destructured
  the arg IN THE SIGNATURE, so a `null` arg or a throwing-getter field threw OUTSIDE the try (a consumer swallowing
  it around a pre-truthy flag fails OPEN -- LIVE-PROVEN via probe6). **FOLDED**: positional arg + type-guard +
  destructure-inside-try on all three; regression tests added; the hacker's own probe6 now returns `pass=false` on
  both the null-arg and getter paths. NIT-1 domain-sep overstatement -> **FOLDED** (the real separator is the frame's
  disjoint required-field set; `_type` is defense-in-depth). M2 root-key squatting + malleability + prototype-
  pollution -> LIVE-confirmed as DISCLOSED / non-exploitable, ship-as-is. Zero live-reachable bypass (no callers).
- **honesty-auditor: B / MINOR-OVERCLAIMS** (zero NARROW-as-HARDEN -- the cardinal failure ABSENT). **HIGH-1**: the
  flag prose claimed a structural derivation ("not merely `= checksPassed`") the code (`= sigmaRootChecksPassed`)
  does not carry -> **FOLDED** (reworded: the single pass-leg makes custody-verify's decoupling inapplicable; the
  invariant holds by identity). **HIGH-2**: darkness witness blind to `frame/` -> **FOLDED** (same fold as the
  code-reviewer HIGH). MED-1 (attach the executed run) -> this section. MED-2 ("RESOLVED" header) + LOW-2 ("only
  path" -> "safe default") -> **FOLDED**. Every disclosed residual (root-key squatting, open self-register, arming
  cliff, rotation epoch) confirmed ACCURATE against the code.

**INV-18 CONFIRMED preserved** (registerPersona untouched; the sigma_root check is a separate advisory verifier).
**SHADOW CONFIRMED** (require.cache witness over trust+grounding+frame is empty; behavioral witness byte-identical
with/without registerRoot). NARROW-not-HARDEN labeling holds end-to-end.

## Sequencing

W1 SHADOW verification substrate (this wave: plan -> VERIFY -> TDD RED-first -> VALIDATE 3-lens -> pre-PR
CodeRabbit -> PR) -> W2 the DARK armed enforcement gate (behind arming-coherence) -> [operator deploy + attest,
the USER's act] -> resume plans/30 -> the composed whole. Each step is its own go-ahead; the deploy is never
Claude's.
