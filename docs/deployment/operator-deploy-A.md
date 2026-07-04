---
lifecycle: persistent
audience: the operator (out-of-band, NS-7) + the USER (go-ahead gates)
consolidates: cross-uid-broker.md + live-edge-provenance.md + sigma-root-deploy.md into one dependency-ordered sequence
status: READY-TO-EXECUTE (the mechanism is merged SHADOW; every step below is the operator's out-of-band act)
---

# Operator deploy — Option A, the ordered sequence (the 5th world-anchored HARDEN)

> **This is the USER's runbook, not Claude's (NS-7).** Claude wrote this document and will **never** run a step
> in it: it does not create a uid, mint or install a key, write `/etc`, edit sudoers, set `ptrace_scope`, set an
> arming flag, run `--attested-cross-uid`, or perform the root-key attestation. Those are operator acts, executed
> out-of-band on hosts Claude cannot reach.

**What this file is.** The three sibling runbooks in this directory each cover one axis; this one is the *ordered
index across them* for **Option A** — deploying a live-edge signing broker under a genuinely separate OS uid, the
single move that advances the trust apex (PRD §9). It does **not** replace them: each source runbook remains the
**source-of-truth** for its own command detail, and is cited per part. Follow the order here; open the cited
runbook for the full step.

**What "done" buys, honestly (NS-9).** Parts 1+2 deliver the **5th world-anchored HARDEN** — the broker persona's
**key-custody** on a live trust-graph edge, *one box / one run / one axis*. Part 3's **A.3 attestation** is the
*only* step that world-anchors the root key, and it is what later lets you close **B** (the registration-binding
co-forge leg). Everything else **narrows**: `convert(...).actionable` stays hard-`false`, nothing gates, and no
in-process step substitutes for the out-of-band attestation.

---

## 0. Dry run FIRST — see the mechanism green before you provision anything

None of this hardens (no uid, no attestation, no live registry) — it confirms the *substrate side* behaves as
specified, so a later failure is a *deployment* fault, not a code fault.

```sh
# (a) the whole mechanism is sound
node test/run.js                                            # expect: N files, all passed, 0 failed

# (b) PART 2 read-side — the named SHADOW provenance proof (mint -> verify -> weigh, actionable stays false)
node v0/test/integration/edge-provenance-proof.test.js     # expect: all passed (incl. the OPEN 5th-leg residual)

# (c) PART 3 gate — the armed-admission smoke is embedded in sigma-root-deploy.md (throwaway registry only):
#     verified-admit + forged-root-reject + XOR-incoherent-passthrough, each with an observable alert.
```

**Part 1 dry run is deliberately a REFUSAL.** Run `custody-verify.js` against a key your *own* uid owns and it
reports `hostObservableChecksPassed: false` — the `C2` leg reads `the host uid CAN read the key -- custody is NOT
real`. That is *correct*: the `C2` denial can only flip to PASS on a genuinely separate uid, and no in-process
trick fakes it. Seeing the honest `false` here is the proof that the world-anchored leg is exactly the part you
must do out-of-band.

---

## 1. The dependency order (the steps are NOT independent)

**P1 (wire the gate into the read-gate)** -> **Part 1 custody deploy** -> **Part 2 live edge** -> **Part 3: A
(genesis root + attest)** -> **B (provision personas)** -> **P2 (Phase-6 signer)** -> **C (arm)** -> **D
(grandfather ramp)**. Arming (C) before P1 is inert; arming `signingArmed:true` before P2 asserts a signer PACT
cannot back (NS-9 theater). See `sigma-root-deploy.md` §0 for the full prerequisite table.

Fix two values once and reuse them everywhere: your **host uid** (`id -u`, e.g. `501`) and one **broker DID**
(`did:key:zBroker`). This guide assumes the `v0/` tree at `/opt/pact`.

---

## 2. PART 1 — cross-uid broker (custody)

**Source-of-truth: [`cross-uid-broker.md`](cross-uid-broker.md) §1-§9** (this is a compressed index; open it for the full text, the caller-auth flip test §8, and the per-request-auth refuse tests §9).

1. **Broker system user** (no login): `useradd --system … pact-broker` (Linux) / `sysadminctl -addUser` (macOS).
2. **Private key `0600` owned by `pact-broker`** in a `0755` dir at `/etc/pact/broker.key`; delete the host copy.
   (The dir is `0755` on purpose so the host uid can confirm a *different* owner — the verifier's necessary condition.)
3. **Root-owned wrapper** `/usr/local/bin/pact-broker-sign` (`root:root`, `0755`) that sets `PACT_BROKER_KEY_FILE`,
   `PACT_BROKER_ALLOWED_UIDS` (R2-WHO), `PACT_BROKER_PERSONA_DID` (R2-WHAT), and refuses to start if the persona is
   unset. The host names only this wrapper, never the key path.
4. **sudoers** — the host may run ONLY the wrapper as `pact-broker`, `NOPASSWD`; pin `env_reset, !setenv`; then
   audit `sudo -l -U <hostuser> | grep -iE 'env_keep.*SUDO_'` prints nothing.
5. **Register the broker PUBLIC key** in the registry the receiver reads (`/etc/pact/registry.json`).
6. **(Linux) `kernel.yama.ptrace_scope=2`** — the heap-read axis; see [`r-heap-runbook.md`](r-heap-runbook.md).
7. **Verify as host uid, then ATTEST out-of-band:**
   ```sh
   node /opt/pact/v0/src/identity/custody-verify.js --key /etc/pact/broker.key --persona did:key:zBroker \
     --broker-user pact-broker --wrapper /usr/local/bin/pact-broker-sign --registry /etc/pact/registry.json
   id; ls -l /etc/pact/broker.key; cat /etc/pact/broker.key   # owner=pact-broker (NOT you); read = Permission denied
   node …/custody-verify.js … --attested-cross-uid            # exits 0 ONLY after you confirm the three checks
   ```

---

## 3. PART 2 — mint a LIVE edge through it (the 5th world-anchored HARDEN)

**Source-of-truth: [`live-edge-provenance.md`](live-edge-provenance.md).** Prerequisite: Part 1 done and attested.

1. Broker PUBLIC key registered (Part 1 step 5) — else the edge silently drops as `unregistered-sender`.
2. **DID-consistency triple** byte-identical: wrapper `PACT_BROKER_PERSONA_DID` == registry `personaDid` ==
   verifier `--persona`. Then a green `assertBrokerPersona` (proves the held key matches the claimed persona).
3. **Mint the live edge** through the cross-uid signer (freshness-bound; `mintFreshVouch` holds no key):
   ```js
   const { crossUidBrokerSigner } = require('/opt/pact/v0/src/identity/broker-launch');
   const { mintFreshVouch }       = require('/opt/pact/v0/src/identity/mint-fresh-vouch');
   const signer = crossUidBrokerSigner({ brokerUser: 'pact-broker', wrapperPath: '/usr/local/bin/pact-broker-sign' });
   const { ok, frame } = mintFreshVouch({ signer, personaDid: 'did:key:zBroker', humanUid: 'human:you',
     targetPersona: 'did:key:<target>', approvedAt: Date.now(), freshnessNonce: '<random, >= 8>',
     keyId: '<broker key id>', seq: /* n */ 0, nonce: '<frame nonce>' });
   // appendRecord(frame, { receiverId: '<receiver>', stateDir: '<store>' });
   ```
4. **Attest + confirm the read-side:** re-run `custody-verify … --attested-cross-uid` after the manual checks;
   confirm the edge appears in `verifiedRecords(...)`, weighs where expected, and `convert(...).actionable` is
   **still `false`** (SHADOW).

---

## 4. PART 3 — σ_root root-key attestation (the enabler to close B)

**Source-of-truth: [`sigma-root-deploy.md`](sigma-root-deploy.md).** Order: **A -> B -> (P2) -> C -> D.**

- **A.1** mint the root keypair **OFF the deployed box** — `K_root_priv` never enters the host uid's read scope
  (same-uid custody is INTEGRITY, not PROVENANCE).
- **A.2** seed the genesis root in a **CLEAN** registry (`registerRoot` is first-writer-immutable — seed before
  any untrusted access).
- **A.3 attest `K_root_pub` out-of-band <- THE step that HARDENS.** Record, in a channel the host cannot forge,
  that `K_root_pub` belongs to a distinct real human root (signed public statement / transparency-log entry /
  notarized record / in-person key-signing). Until A.3, everything else only narrows.
- **B** provision a persona under the root; the root signs the binding out-of-band (guard the `null` return of
  `signSigmaRoot`).
- **C** arm the gate (only after P1 wire + P2 signer; **both** `admissionArmed` and `signingArmed` `=== true`).
- **D** grandfather ramp: a `(personaDid) => boolean` on the trusted `policy` arg only; shrink the allowlist to ∅
  as each legacy persona gets a real σ_root.

---

## 5. The one-line truth (NS-9)

- **Part 1 + Part 2 = the 5th world-anchored HARDEN** — broker key-custody on a live edge. One box / one run / one axis.
- **Part 3 A.3 = the sole step that world-anchors the root** -> the enabler to then close **B** (the "who minted"
  co-forge leg). It does **not** prove "who minted" in general on its own, and it does not gate.
- Everything else **narrows**. `convert(...).actionable` stays `false`; nothing gates.
- **"Still deployed" decays** — re-probe `kernel.yama.ptrace_scope`, `swapon --show`, and `core_pattern` at deploy
  time; a past green is not a standing fact.

When you have run it and attested, hand back the `custody-verify` output plus your attestation record: the PRD §8
scoreboard moves **4 -> 5**, and **B** can then be scoped off the now-attested root.
