---
lifecycle: persistent
audience: the operator (out-of-band, NS-7) + the USER (go-ahead gates)
consolidates: plans/32 (W1 verification substrate) + plans/33 (W2 armed gate) into one executable sequence
status: READY-TO-EXECUTE (the mechanism is merged SHADOW/DARK; every step below is the operator's out-of-band act)
---

# σ_root operator-deploy runbook — the out-of-band HARDEN

> **This is the USER's runbook, not Claude's (NS-7).** Claude wrote this document; Claude will **never** run any
> step in it. Claude never creates a uid, mints or installs a key, writes `/etc`, edits sudoers, sets a deploy
> flag, injects `admissionArmed=true` into a live path, arms the gate, or performs the root-key attestation.
> Those are operator acts, executed out-of-band on hosts Claude cannot reach.

The σ_root mechanism (`v0/src/identity/sigma-root.js` + `registry.js` + `registration-provenance.js` +
`trust/admission-gate.js`) is **merged and SHADOW/DARK**: the verifier is wired into no trust fold, and the
armed gate is disarmed-by-default (a byte-identical admit-all pass-through). This runbook is the sequence that
takes it from DARK to a **world-anchored HARDEN**. Only the last leg (**Phase A.3**, the out-of-band root-key
attestation) actually hardens trust; every other step only NARROWS (NS-9 / OQ-NS-6).

---

## 0. The dependency chain (read this first — the steps are NOT independent)

An **honest** production arm depends on two prior landings. Doing the arm without them is either inert (no
effect) or dishonest (asserting an arm you cannot back — NS-9 theater):

| # | Prerequisite | Why the arm needs it | Menu item / plan |
|---|---|---|---|
| P1 | **Read-path σ_root filter — ALREADY BUILT** as `registration-gate.js` (`filterAnchoredRecords`, plans/39), wired into `convert.disjointPaths`, disarmed-by-default. This row originally said "wire `admissionDecision`"; the equivalent read-path gate shipped as `registration-gate` instead — `admissionDecision` is a SEPARATE dormant reject-primitive (plans/33), wired to nothing. | **DONE** (SHADOW/disarmed) — arm by injecting `meCtx.regProvenance={sigmaRoots}`; even armed it only NARROWS the advisory count. | plans/39 |
| P2 | **Land the Phase-6 world-anchored signer** (`plans/30` broker-signing) | The arm is **both-or-neither** (`arming-coherence.js:48`): `admissionArmed(out) = admissionArmed && signingArmed`. Arming admission REQUIRES `signingArmed === true`, which is only HONEST once a real signer exists. Asserting it with no signer is NS-9 theater. | `plans/30` |
| P3 | **Genesis root minted + seeded + ATTESTED** (Phase A below) | The armed gate verifies σ_root against the seeded root key; the attestation is what makes a PASS mean anything. | this runbook, Phase A |

**Honest deploy order:** P1 (wire) is **DONE** (`registration-gate`, plans/39) → P3 (Phase A genesis + attest) → Phase B (provision personas) → P2 (signer) →
Phase C (arm) → Phase D (grandfather ramp). You CAN exercise the armed path as a **controlled dogfood** before P2
by injecting both flags in a throwaway harness — but that is a test, not a harden, and must never touch a live
registry or claim a trust advance.

---

## Phase A — Genesis root (the anchor)

### A.1 — Mint the root keypair OFF the deployed box

Run on a machine / enclave / separate-uid / HSM the deployed host process **cannot `read()`**. `K_root_priv`
must never enter the host uid's read scope — same-uid custody is INTEGRITY, not PROVENANCE (edge-attestation.js
header; plans/30's concern).

```js
// OUT-OF-BAND host only. NEVER commit K_root_priv; NEVER copy it to the deployed box.
const { generateEdgeKeypair } = require('./v0/src/lib/edge-attestation');
const { publicKeyPem: K_root_pub, privateKeyPem: K_root_priv } = generateEdgeKeypair(); // ed25519 spki/pkcs8 PEM
// -> store K_root_priv in the enclave/HSM; export ONLY K_root_pub to the deployment.
```

### A.2 — Seed the genesis root in a CLEAN registry (ordering invariant)

**Seed BEFORE any untrusted `registerRoot` access.** `registerRoot` is first-writer-immutable (registry.js:100)
— whoever seeds a `humanUid` first wins, and a conflicting re-seed THROWS. A same-uid attacker who seeds first
permanently squats the root (registry.js:94 residual). So the genesis seed must precede any untrusted access.

```js
const { createRegistry, registerRoot } = require('./v0/src/identity/registry');
const reg = createRegistry();
registerRoot(reg, { humanUid: '<your-scarce-human-uid>', rootPublicKeyPem: K_root_pub });
// NOTE: registerRoot records rootKeys ONLY — it does NOT roots.add (registry.js:111), so the live
// isKnownRoot gate stays single-writer. A seeded-but-persona-less root is correctly not frame-admissible.
```

`<your-scarce-human-uid>` is the world-anchored human root identifier for this deployment (the scarce identity
the whole substrate roots in). Use the same string as `controller` when signing bindings (Phase B).

### A.3 — Attest `K_root_pub` out-of-band  ← **THE step that HARDENS (NS-7)**

Record, in a channel the host cannot forge, that this public key belongs to a **distinct real human root**. This
is the analog of custody-verify's `id` / `ls -l` uid attestation, and it is the ONLY step that crosses
SHADOW→hardened. The crypto (Phases B–C) only ever proves *K_root authorized this binding*; it can NEVER prove
*K_root belongs to a real human* — a same-uid host can self-generate + seed + self-sign a root key and pass every
in-process check (registration-provenance.js:65 residual). Mechanisms (deployment's choice): a signed public
statement tying `humanUid ↔ K_root_pub`, a transparency-log entry, a notarized record, an in-person
key-signing. **This deployment chose the transparency-log mechanism — the concrete recipe is below.** **Until this is done, everything below only NARROWS.**

#### A.3 via transparency log — the Sigstore/cosign recipe (the `world-anchored`-tier mechanism)

To be **harden-eligible** — not merely a `world-read` narrow (the three-tier evidence model
`self-asserted` < `world-read` < `world-anchored`; #273: integrity != provenance) — the log entry must be a
**DSSE-signed attestation from an authenticated (OIDC-bound) producer**, logged with an inclusion proof; a bare
self-upload is only `world-read`. `cosign` keyless does it in one step: Fulcio issues an ephemeral cert for your
OIDC identity, signs a DSSE in-toto statement over `K_root_pub`, logs it to Rekor, and writes a bundle carrying
signature + cert + inclusion proof.

1. **Predicate** `root-binding.json` — the `(humanUid, K_root_pub)` binding (`rootPublicKeyPem` **byte-identical**
   to what A.2 seeds):

   ```json
   { "humanUid": "<your-scarce-human-uid>",
     "rootPublicKeyPem": "<K_root_pub>",
     "purpose": "PACT sigma_root HumanRoot genesis attestation",
     "deployment": "<host>", "seededAt": "<ISO timestamp>" }
   ```

2. **Attest keyless + log to Rekor** (omit `--key` for the interactive OIDC flow):

   ```sh
   cosign attest-blob K_root_pub.pem \
     --predicate root-binding.json --type custom \
     --bundle root-attestation.sigstore.json --yes
   ```

   `K_root_pub`'s digest lands in the in-toto **subject** (cryptographically bound); the predicate rides
   alongside. **Do NOT hardcode a Rekor URL** — Rekor v2 (GA 2025-10) rotates the public-good log; cosign
   resolves the current log from the published TrustedRoot.

3. **Verify — this asserts *who* signed (the anchor):**

   ```sh
   cosign verify-blob-attestation --bundle root-attestation.sigstore.json \
     --certificate-identity <you@your-idp> \
     --certificate-oidc-issuer <issuer-url> \
     --type custom K_root_pub.pem
   ```

4. **Record** the `root-attestation.sigstore.json` bundle + Rekor `logIndex` / `UUID` in the run record, next to
   the seeded registry. The bundle is self-verifying; "attested" becomes durable and re-checkable.

**Honest ceiling (NS-9).** This world-anchors the *assertion* (tamper-evident, timestamped, publicly auditable,
OIDC-bound) — a genuine HARDEN of the root key's provenance-to-an-identity. It does **not** prove that identity
is a *distinct real human* (that bottoms out in the OIDC provider = the U1 frontier), and a single log admits a
split view until an N-of-M witness network closes it. It world-anchors the *root*; it does not by itself
prove *who minted* any edge — the enabler to then close **B**. Gates nothing (`convert.actionable` stays `false`).

> **Machine-check seam (do NOT build now).** To later verify this attestation in-process, reuse the RFC-6962
> inclusion-proof primitives the Embers substrate already built (`verify-inclusion.js` over a
> `{leaf_hash, inclusion_proof:{leaf_index, tree_size, audit_path}, checkpoint:{root, tree_size}}` — the shape
> a Rekor proof provides). That is an Option-B build (an `attestationRef`-on-root field), a named residual.

**Sources:** cosign [signing with blobs](https://github.com/sigstore/docs/blob/main/content/en/cosign/signing/signing_with_blobs.md),
[attest-blob](https://github.com/sigstore/cosign/blob/main/doc/cosign_attest-blob.md),
[verify-blob-attestation](https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-blob-attestation.md);
[Rekor v2 GA](https://blog.sigstore.dev/rekor-v2-ga/).

---

## Phase B — Provision a persona under the root

Repeat per persona `P`. The persona keypair is separate from the root keypair.

```js
const { generateEdgeKeypair } = require('./v0/src/lib/edge-attestation');
const { registerPersona } = require('./v0/src/identity/registry');
const { signSigmaRoot } = require('./v0/src/identity/sigma-root');

// B.1 — mint the persona key
const { publicKeyPem: K_pub, privateKeyPem: K_priv } = generateEdgeKeypair();

// B.2 — register the persona under the root (first-writer immutable; controller = the humanUid)
registerPersona(reg, { personaDid: P, humanUid: '<your-scarce-human-uid>', publicKeyPem: K_pub });

// B.3 — the ROOT signs the binding OUT-OF-BAND (K_root_priv lives in the enclave, not here).
//        controller MUST equal the humanUid — assessRegistrationFromRegistry sources it via rootOf(reg, P).
const sigmaRoot = signSigmaRoot(
  { personaDid: P, publicKeyPem: K_pub, controller: '<your-scarce-human-uid>' },
  { privateKeyPem: K_root_priv } // OR { signer } for a custody-boundary root signer (plans/30 forward-compat)
);
// signSigmaRoot returns null (never throws) on a bad/unsignable binding -- GUARD it: a null must halt
// provisioning, never be persisted (a persona with a null sigmaRoot fails admission and masks the real error).
if (!sigmaRoot) throw new Error('signSigmaRoot returned null: bad binding field -- fix before persisting');
// -> persist (P, sigmaRoot) with the persona's registration record; the persona presents sigmaRoot at admission.
```

`signSigmaRoot` returns `null` (never throws) on a bad field or an unsignable binding — check for it. The
`{ privateKeyPem }` path is the provisioning/custody path (sigma-root.js:53); prefer the enclave `{ signer }`
seam once plans/30 lands so `K_root_priv` never materializes in a provisioning process either.

---

## Phase C — Arm the gate (the DARK→armed crossing)

> **Do not reach this phase until P1 (wire — DONE via `registration-gate`) and P2 (signer) are done** — see §0. Arming before P1 is inert;
> arming `signingArmed:true` before P2 asserts a signer PACT cannot back (NS-9).

The gate reads the arm on its own guarded path, independent of the attacker-influenced record fields
(admission-gate.js:48 — the C1 fail-open correction). To arm, inject **both** flags at the trusted call site:

```js
const { admissionDecision } = require('./v0/src/trust/admission-gate');

const decision = admissionDecision(
  {
    admissionArmed: true,   // BOTH must be === true (both-or-neither, arming-coherence.js:48).
    signingArmed:   true,   // honest ONLY once the Phase-6 signer is deployed (P2). XOR emits an alert + stays dark.
    registry: reg,          // trusted, crypto-GATED (a fake registry still needs a seeded root key + signed σ_root)
    personaDid: P,
    sigmaRoot,              // the persona-presented σ_root
  },
  { grandfather: legacyAllowlistFn } // TRUSTED policy arg — Phase D. NEVER sourced from the input record.
);
// disarmed -> { admit:true, armed:false, reason:'disarmed-passthrough' }  (byte-identical to today)
// armed + verified -> { admit:true, armed:true, reason:'sigma-root-verified', provenance }
// armed + unverified + not grandfathered -> { admit:false, armed:true, reason:'sigma-root-unverified' } + an alert
```

An XOR-incoherent arm (one flag true, the other not) is NOT armed: it falls through to the disarmed pass-through
and emits an `arming-incoherent` alert (arming-coherence.js:63) — observable, never a silent fail-closed.

---

## Phase D — Grandfather policy (the migration cliff)

An armed gate with no grandfather **rejects every persona that lacks a σ_root** — including legacy personas
registered before σ_root (plans/33 the "arming migration cliff"). The grandfather seam is the migration ramp:

- `grandfather` is a `(personaDid) => boolean` on the **separate trusted `policy` arg**, never the input record
  (admission-gate.js:97; CodeRabbit Major — a `() => true` callback must never be forwardable from an actor
  record). Default absent = `() => false` = strict fail-closed.
- A grandfather admission is **observable** — it emits `admission-grandfathered` (class `policy`,
  admission-gate.js:106) so an operator triaging by class never confuses a deliberate policy admit with a
  remediation gap.
- **Shrink the allowlist to empty over time**: as each legacy persona gets a real σ_root (Phase B), drop it from
  the list. When the list is empty, the migration is complete and the gate is fully σ_root-gated.

```js
const LEGACY = new Set(['did:...:legacyA', 'did:...:legacyB']); // known pre-σ_root personas, shrinking to ∅
const legacyAllowlistFn = (personaDid) => LEGACY.has(personaDid);
```

---

## Verify (a library call today; a `custody-verify`-style CLI is a later wave)

```js
const { assessRegistrationFromRegistry } = require('./v0/src/identity/registration-provenance');
const v = assessRegistrationFromRegistry(reg, { personaDid: P, sigmaRoot });
// v.sigmaRootChecksPassed === true  AND  v.requiresOutOfBandRootAttestation === true
```

**Branch on `sigmaRootChecksPassed`, never on `!requiresOutOfBandRootAttestation`** (registration-provenance.js:60):
on a FAILED check the flag is ALSO false ("fix the binding"), so it is never a "clean" signal. A PASS is
meaningful ONLY because Phase A.3 world-anchored the root key — the tool never claims that for you.

### End-to-end armed-admission smoke (proves the ARMED WIRING, not just the helper)

The `assessRegistrationFromRegistry` call above exercises the provenance HELPER only — it can PASS while the
armed `admissionDecision` path is mis-wired (the arm never reaching the gate). This smoke drives the **live armed
path** end-to-end against a **THROWAWAY** registry (never a live one — §0's dogfood caveat: this is a test, not a
harden). It asserts a verified admit, a forged-root reject, and the both-or-neither fall-through:

```js
const assert = require('assert');
const { generateEdgeKeypair } = require('./v0/src/lib/edge-attestation');
const { createRegistry, registerRoot, registerPersona } = require('./v0/src/identity/registry');
const { signSigmaRoot } = require('./v0/src/identity/sigma-root');
const { admissionDecision } = require('./v0/src/trust/admission-gate');

const HUMAN = 'did:human:smoke-root';
const P = 'did:key:zPersonaSmoke';

// A throwaway genesis root + persona (Phase A.2 + Phase B, in a clean registry).
const { publicKeyPem: K_root_pub, privateKeyPem: K_root_priv } = generateEdgeKeypair();
const { publicKeyPem: K_pub } = generateEdgeKeypair();
const reg = createRegistry();
registerRoot(reg, { humanUid: HUMAN, rootPublicKeyPem: K_root_pub });
registerPersona(reg, { personaDid: P, humanUid: HUMAN, publicKeyPem: K_pub });
const sigmaRoot = signSigmaRoot({ personaDid: P, publicKeyPem: K_pub, controller: HUMAN }, { privateKeyPem: K_root_priv });
assert(sigmaRoot, 'signSigmaRoot must not return null for a well-formed binding');

// (1) ARMED + verified -> the LIVE armed gate admits with reason 'sigma-root-verified'.
const ok = admissionDecision({ admissionArmed: true, signingArmed: true, registry: reg, personaDid: P, sigmaRoot });
assert.deepStrictEqual({ admit: ok.admit, armed: ok.armed, reason: ok.reason },
  { admit: true, armed: true, reason: 'sigma-root-verified' });

// (2) NEGATIVE control -- a sigmaRoot signed by a DIFFERENT (unregistered) root is REJECTED when armed
//     (and emits an integrity refuse-alert; a PASS here would mean the verifier is not actually gating).
const { privateKeyPem: evilRootPriv } = generateEdgeKeypair();
const forged = signSigmaRoot({ personaDid: P, publicKeyPem: K_pub, controller: HUMAN }, { privateKeyPem: evilRootPriv });
const bad = admissionDecision({ admissionArmed: true, signingArmed: true, registry: reg, personaDid: P, sigmaRoot: forged });
assert.deepStrictEqual({ admit: bad.admit, armed: bad.armed, reason: bad.reason },
  { admit: false, armed: true, reason: 'sigma-root-unverified' });

// (3) XOR-incoherent arm (both-or-neither, arming-coherence.js) -> falls through to the disarmed
//     pass-through (armed:false) and emits an 'arming-incoherent' alert; never a partial arm.
const xor = admissionDecision({ admissionArmed: true, signingArmed: false, registry: reg, personaDid: P, sigmaRoot });
assert.strictEqual(xor.armed, false, 'an XOR-incoherent arm must fall through to disarmed');

console.log('OK: armed-admission smoke passed (verified-admit + forged-root-reject + XOR-incoherent-passthrough)');
```

A GREEN run means the arm actually reaches the gate AND the verifier gates on it. Still SHADOW/NS-9: this proves
the WIRING, not a trust advance — the sole HARDEN remains the Phase A.3 out-of-band attestation.

---

## Safety invariants (bake these into execution)

1. **Root-private-key custody** — `K_root_priv` never enters the host uid's read scope. Mint + sign in an
   enclave / HSM / separate-uid. Same-uid custody is INTEGRITY, not PROVENANCE.
2. **Seed-order** — genesis `registerRoot` runs in a CLEAN registry before any untrusted `registerRoot` access
   (first-writer-immutable; else root-key squatting).
3. **First-writer immutability** — `registerRoot` / `registerPersona` are first-writer-wins; a conflicting
   re-seed/re-register THROWS. Get it right the first time; rotation = a NEW DID until σ_root rotation ships.
4. **Both-or-neither arm** — inject BOTH `admissionArmed` and `signingArmed` as `=== true`; and only honestly
   once the signer (P2) exists.
5. **Grandfather source** — the grandfather callback comes from the trusted `policy` arg ONLY, never the input
   record.
6. **The attestation (A.3) is the sole HARDEN** — everything else NARROWS. Reporting any in-process step as a
   trust close is NS-9.

---

## Honest status line (NS-9)

- **NARROWS (in-process, done by this runbook's crypto):** a persona's key is authorized by a root key, verified
  fail-closed, and — when armed — enforced as a reject on failure.
- **HARDENS (world-anchored, Phase A.3 only):** the operator's out-of-band attestation that `K_root_pub` belongs
  to a distinct real human root. This is the SOLE determiner (OQ-NS-6 / NS-7). No in-process step substitutes for
  it, and Claude never performs it.
