---
lifecycle: persistent
status: SCOPING -- awaiting USER go-ahead (the build does NOT start on this doc)
plan: 31
created: 2026-07-02
depends-on: plans/30 (the HELD broker-signing HARDEN arc, reframed behind this at §9) ; plans/18 (the U1 issuance-stake blueprint) ; plans/29 (the authenticated-minter template) ; research/11 (identity-layer buy-vs-build verdict) ; research/18 (U1 containment-not-elimination) ; research/24 (U2 observables-identifiability bound) ; PACT-spec-v1.1.md §1.1 (the σ_root designed-but-unbuilt field) ; PACT-NORTH-STAR.md §4 (U1) / NS-7 / NS-9
audience: the USER (go-ahead gate + the eventual operator attestation) + a future build session
title: Registration-provenance -- the persona<->key binding anchor (the reframed priority after plans/30's VERIFY-hacker HIGH)
---

# Plan 31 -- registration-provenance (SCOPING)

> **HONEST-LABELING HEADER (read first, NS-9).**
> The USER reframe (plans/30 §9, 2026-07-01) named this the arguably-bigger gap: `read-gate` -- the sole
> entry the trust engine weights through -- keys on a **host-writable persona<->key binding that carries ZERO
> provenance** (`registry.js:22-29`, `read-gate.js:41`, both re-probed firsthand this session). "Registration-
> provenance" is NOT one problem; it is THREE distinct bindings with THREE different closabilities, and
> conflating them is the failure this doc exists to prevent:
>
> 1. **persona<->key** ("key K was authorized as persona P by root R") -- **WORLD-ANCHORED-CLOSABLE, mechanism-
>    in-hand.** The spec ALREADY designs the fix (`σ_root`, `PACT-spec-v1.1.md:72`, DESIGNED-but-UNBUILT). Closing
>    it against a same-uid host reuses ed25519 + the exact cross-uid custody arc plans/30 dogfoods. It COMPOSES
>    with plans/30 rather than competing. But it HARDENS only IF the root key that signs the binding is itself
>    world-anchored (an out-of-band operator act) -- in-process it only NARROWS.
> 2. **persona<->human** ("persona P belongs to human H") -- self-asserted in the same host-writable call
>    (`registry.js:26-27`). Inherited by the entire `rootOf`-keyed trust/grounding fold. Anchoring it collapses
>    into (3).
> 3. **human<->real** ("root R is a distinct real person") -- **IDENTITY-BOUNDED. This IS U1** (`PACT-NORTH-STAR.md:137`,
>    Douceur's impossibility). NOT a fresh gap; the named, permanent frontier. World-anchored-NARROWABLE (stake /
>    Personhood-Credentials), **contained, never closed.**
>
> **IS THIS CLOSABLE IN-PROCESS? NO.** Registration-provenance CANNOT be CLOSED in-process -- it can only be
> NARROWED. Every purely-in-process mechanism relocates the unauthenticated / self-asserted boundary rather than
> eliminating it (LENS D, §"The recursion"). The honest close for the persona<->key half is a **world-anchored
> out-of-band act** (an operator-attested root key, mirroring custody-real); the human<->real half is U1 --
> contained-not-closed, per Douceur, forever. **"The edge proves WHO" stays FALSE in-process** and that phrasing
> is NS-9-load-bearing: a same-uid narrowing (did:key self-cert, immutability, stake-cost) is NEVER to be written
> up as a close.
>
> **THE ATTESTATION IS THE USER'S.** If plans/31 proceeds to the world-anchored option, the actual HARDEN is an
> operator act (attest the root key / the registry entries out-of-band). **Claude NEVER creates a uid, writes to
> /etc, installs a key, edits sudoers, sets a deploy flag, or performs the attestation.** Claude builds + verifies
> the WIRING and writes the runbook; the USER attests. This is a scoping deliverable for an explicit go-ahead.

## The unanchored binding(s)

Three bindings, all written by the same bare host call, ranked by what the trust engine actually depends on.

**Binding #1 -- persona<->key (`personaDid` -> `publicKeyPem`).** `registerPersona` records it with only a
non-empty-string type-check and returns the mutated registry (`registry.js:22-28`, re-probed firsthand). No
signature, no attestation, no derivation of `personaDid` from `publicKeyPem`. **This is the one `read-gate`
depends on:** `verifiedRecords` resolves `lookupPublicKey(registry, rec.src_persona_did)` and drops any record
whose sig does not verify under it (`read-gate.js:41,48`, re-probed). The gate proves KEY-INTEGRITY of the
REGISTERED persona -- that the holder of the recorded key signed the record -- NEVER that the legitimate party
registered the key. `frame.receiveFrame` keys identically (`frame.js:96`, LENS A/B/C/D concur). This is the exact
VERIFY-hacker HIGH (plans/30:209-212, folded as the 5th co-forge leg at 30:88).

**Binding #2 -- persona<->human (`personaDid` -> `humanUid`).** Same host call: `reg.personas.set(personaDid,
{humanUid, publicKeyPem})` (`registry.js:26`), read by `rootOf` (`registry.js:44-45`). Self-asserted -- nothing
binds a persona to its `humanUid` beyond the caller's assertion (LENS A.4). This is the Sybil-keying unit the
ENTIRE fold trusts: `consensus.js`, `direct.js`, `stake-anchor.js`, `convert.js`, `cross-verify.js`,
`premise-score.js`, `creator-standing.js`, `reach.js` all re-key by `rootOf(src_persona_did)` (LENS A.2, grep-
verified). A forged `parent_human_uid` body field is structurally IGNORED (the fold re-keys by the SIGNER's
registered root, `stake-anchor.js:11-13`) -- but "the SIGNER's *registered* root" IS the unanchored binding, not
a proven one.

**Binding #3 -- human<->real (`humanUid` -> a distinct real person).** Anchored to NOTHING. `isKnownRoot` is pure
set membership: a `humanUid` is "real" iff some `registerPersona` call `.add`ed it (`registry.js:27,33`, re-
probed). `frame.receiveFrame` step (3) gates `root_valid` on this bare membership (`frame.js:94`);
`issuance-policy.js:94` reads it as "the v0 admission fact" and the `no-stake` bar is "registration alone"
(`issuance-policy.js:43`, LENS A/C). NORTH-STAR names this the U1 frontier: "N distinct human roots is open ...
Contained, not solved" (`PACT-NORTH-STAR.md:137-139`, re-probed).

**Trust-dependency summary:** `read-gate.js:41` + `frame.js:96` depend on **#1**; the entire `rootOf`-keyed fold
+ `issuance-policy` depend on **#2** and **#3**. All three are host-writable / self-asserted with zero provenance.
The registry is a trust anchor by design decision (INV-18 "registry, never oracle", `registry.js:2`) -- that note
is about not AUTO-MINTING trust, NOT about authenticating the writer (LENS D through-line).

## Runtime Probes

> **Evidence basis: firsthand -- this session, against the repo NOW.** The four binding/gate probes below were
> re-run against the live tree while authoring; LENS D's four attack PoCs were run live-Node against `v0/src` by
> the recon actor (labelled as that tier). A probe result decays -- re-probe at build-time.

| # | Claim | Probe | Observed |
|---|---|---|---|
| 1 | `registerPersona` makes NO provenance/authorization check -- a bare `Map.set` + `Set.add` guarded only by non-empty-string type-checks | Read `v0/src/identity/registry.js:22-29` (firsthand this session) | `registerPersona(reg,{personaDid,humanUid,publicKeyPem})` throws only on non-string/empty (`:23-25`), then `reg.personas.set(personaDid,{humanUid,publicKeyPem}); reg.roots.add(humanUid)` (`:26-27`). Header: "RECORDS only -- mints no trust" (`:17`), "a REGISTRY, NEVER an ORACLE (INV-18)" (`:3`). No sig, no attestation, no `personaDid`<->`publicKeyPem` derivation, no caller-auth. |
| 2 | `read-gate` keys the whole trust engine on the host-writable binding and proves integrity, not provenance | Read `v0/src/trust/read-gate.js:25-53` (firsthand this session) | `verifiedRecords` calls `lookupPublicKey(registry, rec.src_persona_did)` (`:41`), pushes only if `verifyRecordSig(rec.record_id, rec.sig, {publicKeyPem:pub})` (`:48`). Header: "EVERY record the trust engine weights MUST pass through here first ... Store-presence is never provenance -- integrity != provenance (the #273 family)" (`:6-8`). |
| 3 | ATTACK (a) the 5th co-forge leg is LIVE end-to-end: a same-uid host self-registers its OWN persona + self-signs a VOUCH that `verifiedRecords` weights | LENS D: live-Node PoC against `v0/src` -- register `zATTACKER`, `buildFrame` a VOUCH signed with the attacker key, `appendRecord`, `verifiedRecords` | `receiveFrame.ok=true`; end-to-end "verifiedRecords weighted the SELF-REGISTERED attacker's VOUCH -> count = 1 (BYPASS CONFIRMED)". read-gate cannot distinguish it from a legitimate sender. |
| 4 | ATTACK (b) key-swap: a second `registerPersona` for an EXISTING DID silently re-maps it to the attacker's key (no immutability / first-writer-wins) | LENS D: live-Node PoC -- `registerPersona(zLEGIT, legitKey)` then `registerPersona(zLEGIT, attackerKey)` | "after re-register, `lookupPublicKey(zLEGIT) === attacker key`? true". `Map.set` overwrites unconditionally; any registry-writer takes over an established persona's DID. |
| 5 | ATTACK (d) root-spoof: a single `registerPersona` mints a FAKE foreign `humanUid` that `isKnownRoot` then accepts (satisfies `frame.js:94` root_valid) | LENS D: live-Node PoC -- register `zSPOOF` under `human:victim-org`, check `isKnownRoot` | "`isKnownRoot(human:victim-org)` now: true (attacker minted a fake root)". `registerPersona` is the SOLE writer of `reg.roots` (`registry.js:27`), so a fabricated `humanUid` passes receiveFrame's root_valid gate -- forging the crater quorum + Sybil-cost premise. |
| 6 | The spec DESIGNS the persona<->key provenance field (`σ_root`) but the live code stores/verifies NONE of it -- this is UNBUILT, not a newly-discovered frontier | Read `PACT-spec-v1.1.md:72` (firsthand) + LENS C/D grep of `v0/src` for `sigma_root\|controller\|verifyRoot\|root.sig` | spec:72 `Persona := DID document {persona_did:K_pub, controller:human_uid, σ_root, config_hash, ...}`. Live registry stores ONLY `{humanUid, publicKeyPem}` (`registry.js:26`). grep returns only comment/substring matches; NO code reads/verifies a root signature over the binding. `issuance-policy.js:40-46` gates on `isKnownRoot` + optional stake only. |
| 7 | did:key self-certification is NOT enforced -- the free in-process narrowing is unused | LENS D: grep `v0/src` for `multibase\|base58\|z6Mk\|decodePublicKey\|didToKey\|deriveDid\|didMatches` | Zero hits. `did:key`/`did:web` appear ONLY in `record-store.js:11` path-canonicalization comments, never in a resolve/verify path. Tests use `did:key:zAlice`-style ids (`read-gate.test.js:25`) but the method's built-in key<->id binding is never exploited. |
| 8 | plans/31 does not yet exist; the USER reframe pointing here lives in plans/30 §9 | Glob `plans/31*.md` (firsthand) + Read `plans/30:229-242` | Glob -> no files. plans/30:233-234 "USER decision: tackle the REGISTRY BINDING (registration-provenance) FIRST"; :242 "NEXT: plans/31". This doc IS plans/31. |

## What existing machinery gives

LENS B's verdict, re-stated with the delta: **the U1 stake / standing / crater / social machinery gives NOTHING
toward ANCHORING the binding -- it all READS the binding as already-trusted and keys on `rootOf`, which
presupposes it.**

- **STAKE / SLASH bind to the human ROOT via `rootOf`; they do not anchor the binding.** A STAKE is a custody-
  signed, root-bound presence record carrying only `{lock_expiry}` (the forgeable `amount` was dropped as D5,
  `stake.js:5-9`). `stakeOf` counts a stake only if it passes `verifiedRecords` and keys it by
  `rootOf(src_persona_did)` (`stake-anchor.js:100,105`) -- so a stake INHERITS the binding, reads THROUGH
  `lookupPublicKey`, and does not VERIFY it. A self-registered persona self-mints a zero-cost "locked until year
  9999" stake (plans/21:203-204). SLASH is identical in shape (`slash.js:1-9`) -- it forfeits a commitment, never
  validates a binding.
- **The social layer gives a WEIGHT, not an ANCHOR -- and the weight itself keys on `rootOf`.** Earned standing
  is persona-scoped but "EVERY consumer re-keys to `rootOf`" (`standing.js:13-16`). `direct.js` de-weights an
  unvouched contester to ~0 (`direct.js:16-17`); a crater needs >=2 distinct earned-standing human roots
  (`direct.js:75-87`). But `direct.js:20-22` names the residual verbatim: "keying by `rootOf` defeats persona-
  multiplication; a funded attacker with N distinct HUMAN roots remains the U1 frontier ... Everything here is
  SHADOW/advisory." A persona nobody vouches for gets a LOW score but is STILL ACCEPTED by both gates -- the
  social layer never REJECTS an unanchored binding, it only fails to CREDIT it. And a `rootOf`-keyed de-weight
  presupposes the very binding in question. **[CORRECTION to any assumption that the crater quorum resists a fresh
  attacker]:** it does not -- root-spoof (Probe 5) lets one host mint >=2 fake earned-standing roots, so the
  >=2-distinct quorum is forgeable same-uid (LENS D.1(d)).

**The reusable substrate that DOES exist (all firsthand-verified, LENS B/C):**

1. **A provenance-CLEAN read gate.** `verifiedRecords` drops any record whose sig does not verify under the
   recorded key, and `edge-attestation.js` has NO ambient/shared/env verify-key default (`edge-attestation.js:8-17`,
   LENS B). So a key CANNOT be forged for an ALREADY-registered persona -- the gap is strictly UPSTREAM, at who
   authorizes a NEW binding.
2. **A one-seam pluggable upgrade point.** `registry.js` is deliberately the single root-issuance seam
   (`registry.js:1-7`; `research/18:93-95` "localized to one seam ... SBT-now -> stronger-personhood-proof-later
   is a near drop-in"). Any binding-provenance anchor drops in HERE without touching the trust folds.
3. **A throne-free, root-bound custody minter** (`minter.js:15-16`, cross-root minting structurally impossible) --
   a candidate SIGNER vehicle for attested rows, though wiring it couples to the HELD plans/30 arc (Open Decision).
4. **A designed-but-unbuilt provenance field.** `σ_root` (spec:72) is the exact missing claim; building it is
   filling in a designed slot, not inventing a frontier (Probe 6).
5. **Named buy-vs-build shape.** DID/VC + RFC 8693/7523 delegation to BORROW (`research/11:79-86`); the scarce root
   to BUILD (`research/11:104-106`); SBT -> Personhood-Credentials / World-ID as the anchor-agnostic upgrade
   (`research/18:93-98`).

**THE TRUE DELTA (what is genuinely missing):** the binding's AUTHORIZATION has no minter, no attestation, no
caller-auth -- `registerPersona` is a naked host-writable write (`registry.js:22-29`). Nothing in the U1 stake/
root machinery touches it; the delta is a NEW anchor at the registry seam, orthogonal to (not a subset of) U1.

## Classification

**The load-bearing scoping move: registration-provenance is TWO bindings with DIFFERENT closability (LENS C/D
concur).** Sourced basis and NORTH-STAR placement below.

| Sub-binding | Closability class | Basis | NORTH-STAR placement |
|---|---|---|---|
| **#1 persona<->key** ("K authorized as P by root R") | **WORLD-ANCHORED-CLOSABLE (mechanism-in-hand)** -- HARDENS only via an out-of-band-anchored root key; in-process it NARROWS | The `σ_root` field is DESIGNED (spec:72, Probe 6); the close reuses ed25519 + the cross-uid custody arc plans/30 dogfoods (`plans/30:46` "MECHANISM to sign through a cross-uid broker also exists"; NS-10 reuse-the-earned-mechanism). It is a CRYPTO authorization fact, NOT an observables-inference. | **R3-adjacent / provenance-custody (NS §4).** NOT U1, NOT a fresh gap. plans/30:31 lists it as a SEPARATE open anchor: "the registry persona<->key binding is host-controlled -- key-custody != who-is-this-persona." |
| **#3 human<->real** ("R is a distinct real person") | **IDENTITY-BOUNDED -- contained, never closed** -- world-anchored-NARROWABLE (stake / Personhood-Credentials), permanently contained | Douceur's impossibility (`PACT-spec §9 U1`, "Do NOT claim elimination"); `direct.js:20-22` names the funded-N-roots residual. | **This IS U1** (`PACT-NORTH-STAR.md:137`). NOT a newly-discovered gap -- the existing named frontier. |

**Is #1 the same near-unclosable class as U2? NO (this is the sourced distinction, LENS C/D).** U2's positive
direction is believed near-unclosable because positive epistemic independence is `[SOURCED]` NOT identifiable from
OBSERVABLES (arXiv:2604.07650, `research/24`; `PACT-NORTH-STAR.md:143-150`). Binding #1 has no identifiability
wall -- it is a signable authorization fact, not an inference from outputs. So #1 is world-anchored-CLOSABLE where
U2 is not, and U1 is world-anchored-NARROWABLE (no identifiability wall either, just Douceur's headcount
irreducibility). Three different classes: **#1 closable (crypto) · U1/#3 narrowable-contained (headcount) · U2
near-unclosable (observables).**

**Central authority?** PACT REJECTS a central authority as ROOT (`research/11`: every IAM/AIP vendor "relocates
the Sybil throne"; NS-3/§5 reject a global rank; §7 "Not a global reputation oracle"). Registration-provenance
does NOT require one: #1 is decentralized crypto (a root self-signs its OWN persona delegations, verified per-
receiver -- no admission gate, no global object); #3 stays the pluggable registry-NOT-oracle seam it already is
(INV-18). Neither half forces the throne PACT refuses (LENS C/D concur).

## The option space (threat-ranked)

Strongest world-anchored candidate first; each labelled what-it-resists / its ceiling / world-anchored-vs-in-
process (LENS D.2, threat-ranked; LENS A/B recommend the same shapes).

**(iv) OUT-OF-BAND OPERATOR-ATTESTED REGISTRY -- the only HARDEN.** Resists ALL FOUR attacks (a self-register / b
key-swap / c persona-mult-underwrite / d root-spoof): an attacker cannot add an entry without the operator's out-
of-band act; entries become world-anchored to a human decision. **Ceiling:** centralized-per-deployment -- the
operator is a trust root, but a NAMED / BOUND / auditable one (the NS-4 "cap-setter/root-issuer throne stays
bound" model, not the rejected global throne). **WORLD-ANCHORED (HARDEN).** Mirrors `custody-verify.js`'s
`hostObservableChecksPassed` + `requiresOutOfBandUidConfirmation` precisely -- the tool checks host-observable
necessary conditions; only the operator's act HARDENS (LENS D.2).

**(i) HUMAN-ROOT-SIGNED registration (the `σ_root` check).** Resists (a) self-register (the attacker's entry
carries no valid root signature) and (b) key-swap (rotation must be signed by the prior/root key). **Ceiling:
RECURSION** -- what anchors the ROOT key? If it is host-generated and self-registered, this just moves the
unauthenticated boundary up one level. **IN-PROCESS/NARROWS on its own; HARDENS only if the root key's custody is
world-anchored** -- which is exactly (iv) / the plans/30 custody deploy. So (i) COMPOSES with (iv): (iv) anchors
the root key, (i) is what a held root key AUTHORIZES.

**(v) did:key SELF-CERTIFICATION + first-writer-wins immutability -- the free in-process narrowing.** Resists (b)
key-swap ENTIRELY for `did:key` DIDs (the DID commits to the pubkey; you cannot re-map without changing the DID).
Currently UNIMPLEMENTED (Probe 7). **Ceiling:** moves trust to SELF-ASSERTION -- self-cert proves key<->DID
consistency, NOT who the human is; USELESS against self-register / Sybil / root-spoof. `did:web` would move the
anchor to DNS (a relocated throne `research/11` is wary of). **did:key = IN-PROCESS/NARROWS.** A strict
improvement + a natural cheap first leaf; must be labelled NARROW.

**(ii) STAKE-GATED registration** (plans/18 S3, BUILT SHADOW). Resists nothing outright -- raises the COST of
(a)/(c)/(d). **Ceiling:** plans/18 §0 is explicit -- S1-S5 NARROW (simulated cost), only a really-deployed on-
chain S6 leans HARDEN, and even then "a wealthy attacker buys N roots" (`research/18`). A same-uid host self-mints
a zero-cost stake while SHADOW (`stake.js:5-10`). **IN-PROCESS/NARROWS until S6 real-value deploy.** **[CORRECTION
to plans/21's framing worth flagging]:** plans/21:34-39 rejected stake-AT-registration because it would turn the
registry into an admission THRONE AND brick bootstrap (the first persona's key is registered AT registration,
chicken-and-egg). So (ii) is a COST axis layered above the binding, not a binding anchor -- and cannot be the #1
close.

**(iii) SOCIAL / WEB-OF-TRUST vouching.** Resists (a)/(d) at scale (a fresh attacker persona has no vouchers).
**Ceiling:** BOOTSTRAP (the first roots are unanchored turtles) + COLLUSION (a ring of genuinely-earned attacker
roots vouches for new ones, `research/18`). Topology is forgeable. **IN-PROCESS/NARROWS -- never HARDENS.** WoT
"has NO Sybil resistance of its own" (`trust-reputation-sybil.md:76-106`); it anchors persona<->key VALIDITY,
never root<->human uniqueness.

**Optional integrity amplifier (not a provenance source):** publish bindings to the §7 CT-log (plans/15, RFC-6962)
so a root equivocating on a persona's key is PUBLICLY AUDITABLE. An anti-equivocation INTEGRITY sink that NARROWS;
adds NO provenance on its own (LENS C/D). **[Note]** in-toto / Rekor / SWHID / CONIKS / key-transparency are NOT
in PACT's corpus -- they are from the parent toolkit's GIN lessons-commons work (per that substrate's MEMORY), a
candidate BORROW for a stronger auditable-binding layer, not an existing PACT asset.

## The recursion / where trust bottoms out

Anchoring persona<->key pushes the trust DOWN to persona<->human<->real -- the turtles the question anticipates.
Every purely-in-process candidate relocates the boundary rather than eliminating it (LENS D.3):

- (i) self-signed root -> the root key is itself host-generated / self-registered.
- (ii) simulated stake -> self-minted at zero cost while SHADOW.
- (iii) topology -> forgeable (the U2-adjacent frontier).
- (v) did:key self-cert -> proves key<->DID consistency, NEVER human<->key.

**The regress bottoms out HONESTLY only at a WORLD ANCHOR:** an out-of-band human act (operator attestation, iv),
a deployed authority the host cannot forge (a separate-uid / HSM root key whose custody is itself world-anchored,
i + custody), or a scarce real-world credential (Personhood-Credentials / World-ID, NS §4's U1 upgrade, or a real-
value on-chain stake, ii-S6). This is precisely OQ-NS-6 / NS-7 applied to identity: **in-process signals NARROW;
only world-anchored signals HARDEN** (`PACT-NORTH-STAR.md:129`). The custody arc (plans/30) already found the same
bottom for KEY-CUSTODY; registration-provenance has the identical shape one layer up -- which is WHY the two
compose and WHY plans/30 was correctly held behind this (plans/30:236-238).

## What could ship (if anything)

The honest boundary, tiered by what each tier legitimately claims (NS-9):

1. **DESIGN/RESEARCH artifact only, until a world-anchored registration act -- this doc IS that artifact.** The
   TRUE close (the persona<->key HARDEN) is a world-anchored operator act; Claude cannot perform it (the
   attestation is the USER's, NS-7). So the honest deliverable absent a go-ahead-to-deploy is the scoping +
   option-classification you are reading.

2. **A SHADOW in-process narrowing leaf that ships NOW (if greenlit), labelled NARROW, never a close:**
   - **did:key self-certification** at `registerPersona` -- reject a `did:key` DID that does not commit to its
     registered pubkey. Closes key-swap (b) for did:key DIDs at ZERO external cost (Probe 7 -- currently unbuilt).
   - **first-writer-wins immutability** on `personas.set` -- blocks silent DID takeover for NON-did:key DIDs too
     (Probe 4 -- currently `Map.set` overwrites unconditionally). **[Watch]** this needs a legitimate rotation
     path (a root-signed re-register), else it bricks key rotation -- an architect/build call.
   - **a SHADOW registration-provenance verifier** mirroring `custody-verify.js assessCustody` ->
     `hostObservableChecksPassed`: it checks the in-process necessary conditions (did:key self-cert, `σ_root` well-
     formedness IF present, stake presence) and reports `requiresOutOfBandRegistrationAttestation` -- it NEVER
     asserts the binding is world-anchored without the operator's act (LENS D.4). Machine-checkable, non-vacuous
     (a planted mismatch must fire RED).
   - **a de-weight of unanchored personas?** -- **[CORRECTION / do-NOT-do]:** the fold ALREADY de-weights an
     unvouched persona to ~0 via `rootOf`-keyed standing (`direct.js`), and that de-weight PRESUPPOSES the binding
     (§"What existing machinery gives"). Adding another `rootOf`-keyed de-weight does NOT anchor #1 and risks
     reading as a provenance close when it is not. A de-weight is a WEIGHT, never an anchor -- do not scope it as
     the registration-provenance answer.

3. **The world-anchored HARDEN (option iv + i), IF the USER greenlights the deploy path:** Claude builds +
   verifies the `σ_root` verification wiring + the runbook + the attestation harness (non-vacuous positive +
   negative controls, including the apex control: host self-registers + self-signs -> assert the readout does NOT
   credit it); the USER attests the root key out-of-band. This COMPOSES with the resumed plans/30 (a custody-
   hardened broker key becomes meaningful once the registry-says-this-is-the-broker binding is itself anchored,
   plans/30:236-238).

**Recommended shape (handed to the architect/build, not decided here):** a did:key-self-cert + immutability SHADOW
W0 leaf (the free in-process narrowing, labelled NARROW) shipped alongside the `σ_root` world-anchored HARDEN as
the arc's apex -- with #3 human<->real explicitly RE-NAMED as the inherited U1 frontier, NOT reopened as a new
problem.

## What this does NOT do (NS-9)

- Does NOT CLOSE registration-provenance in-process -- it can only NARROW. The world-anchored close is an out-of-
  band operator act (Probe 3-5 confirm every in-process boundary is relocatable, not eliminable).
- Does NOT make "the edge proves WHO" true. Even a shipped `σ_root` HARDEN proves KEY-AUTHORIZATION only, and only
  against a same-uid host with a custody-hardened root key -- it does not identify the human (that needs U1).
- Does NOT close #3 human<->real / U1 -- that is the named, permanent, contained frontier (Douceur), RE-NAMED
  here, never reopened as a fresh gap.
- Does NOT gate any action or flip `convert.actionable` -- the weight stays SHADOW until U2 closes (NS-8; U2 is
  near-unclosable positively, `research/24`). Real binding-provenance INFORMS; it does not gate.
- Does NOT deploy anything, create a uid, write /etc, install a key, edit sudoers, set a flag, or perform the
  attestation -- the operator act is the USER's (NS-7).
- Does NOT report any NARROW (did:key self-cert, immutability, stake-cost, social de-weight, CT-log audit) as a
  HARDEN or a close (NS-9 -- the close->narrow reflex is the named failure).
- Does NOT introduce a central authority as root, a global rank, or a mutable score store (NS-3/NS-5/§5).

## Open decisions for the USER

1. **Scope: ship the free in-process narrowing NOW, hold for the world-anchored HARDEN, or both?** The did:key-
   self-cert + immutability leaf (option v) is cheap, closes key-swap, and is honest as a NARROW -- but does
   nothing against the CRITICAL self-register leg (Probe 3). The `σ_root` HARDEN (option i+iv) is the real close
   but requires the USER's attestation deploy. Recommended: build the SHADOW narrowing leaf + verifier now
   (labelled NARROW), scope the world-anchored HARDEN as the apex, decide the deploy separately.

2. **The bootstrap chicken-and-egg (architect call, flagged for the USER's awareness).** The first persona's key
   is registered AT registration, so any `σ_root` check that reads the registry to validate a NEW binding has no
   prior anchor for row #1 (plans/21:34-39). What SEEDS the first trusted binding -- an out-of-band-attested
   genesis root? This is THE load-bearing tension the build must resolve.

3. **The signer vehicle: does the world-anchored HARDEN reuse the plans/30 cross-uid broker as the root-key
   signer, or a separate root-key custody?** Reusing it couples the two arcs the USER chose to SEQUENCE apart
   (plans/30 §9). Recommended: keep the root-key custody conceptually separate from the broker-persona custody
   even if the deploy mechanism is shared -- they anchor different bindings.

4. **CT-log audit layer: in scope for #1's amplifier, or a later borrow?** Publishing bindings for equivocation-
   detection (RFC-6962, plans/15) is an integrity NARROW, not a provenance source. The stronger auditable-binding
   substrate (in-toto / Rekor / CONIKS) is a parent-toolkit borrow, not a PACT asset -- import now or later?

5. **Does plans/30 resume immediately after this, or after the world-anchored registration act?** The two compose
   (plans/30:236-238); a custody-hardened broker key is only meaningful once the registry binding is anchored.
   Recommended: resume plans/30 only after the registration-provenance HARDEN (not merely the narrowing leaf)
   lands, so they land coherent.
