# Deploying a live-edge signing broker (provenance — the broker persona's key-custody)

> **SHADOW / honest-labeling header (read first).** This runbook signs a **live trust-graph edge** (a VOUCH the
> `read-gate` / `convert` readout weights) with a **cross-uid-custodied** broker key. Per OQ-NS-6 only a
> world-anchored signal HARDENS, and only the **operator deploy** below is that signal — **Claude never runs any
> step here** (it does not create a uid, write `/etc`, install a key, edit sudoers, set a flag, or run
> `--attested`; NS-7). What success buys is narrow and stated in "The honest ceiling" at the end: it hardens the
> **broker persona's KEY-CUSTODY**, NOT "the edge proves who." The weight the edge feeds is **SHADOW**
> (`convert.actionable` is hardcoded `false`, U2 open) — provenance INFORMS, it does not gate.

This is distinct from the sibling runbooks in this directory, and composes one of them:

- [`cross-uid-broker.md`](cross-uid-broker.md) — the **custody-VERIFY** deploy (the broker holds a key the host uid
  cannot read). **This runbook's PREREQUISITE** — do it first; do not duplicate its steps here.
- [`r-heap-runbook.md`](r-heap-runbook.md) — the heap-read non-exfiltration axis (Linux `ptrace_scope=2`).
- `sigma-root-deploy.md` — the **registry-binding** root-key attestation (a SEPARATE concern; NOT a step here).

The SHADOW read-side proof for everything below is
[`v0/test/integration/edge-provenance-proof.test.js`](../../v0/test/integration/edge-provenance-proof.test.js)
(plans/38 W4) — it proves the in-process controls same-uid; the cross-uid legs (a/b-live/d) run ONLY at this deploy.

## Step 0 — prerequisite: the custody deploy is DONE and attested

Complete [`cross-uid-broker.md`](cross-uid-broker.md) §1–§9 and confirm its out-of-band attestation
(`custody-verify.js` → `hostObservableChecksPassed: true` + the four manual checks: `id`, `ls -l <key>`,
`cat <key>` → Permission denied, `sudo -u <broker> id -u` → the broker uid). Without a genuinely cross-uid,
non-host-readable key, the "provenance" below is only integrity — do not proceed until this holds.

Set (from that runbook): the broker uid, the `0600` key it owns in a `0755` dir, the root-owned wrapper, the
sudoers `NOPASSWD` + `env_reset,!setenv` rule, and `PACT_BROKER_REQUIRE_FRAME=1` + `PACT_BROKER_ALLOWED_UIDS`.

## Step 1 — register the broker persona's PUBLIC key in the host registry

The `read-gate` verifies each record's signature under `lookupPublicKey(registry, src_persona_did)`. Register the
broker persona's PUBLIC key (via `registerPersona`) in the registry the receiver reads:

```json
[{ "personaDid": "did:key:<broker>", "humanUid": "human:<broker-root>", "publicKeyPem": "<broker PUBLIC key PEM>" }]
```

**If you skip this, the minted edge silently DROPS as `unregistered-sender`** — a misconfig masquerading as a
custody fault. Registration is first-writer-immutable (`registry.js`): a conflicting re-register is refused; rotate
by a NEW DID, never by re-keying an established one.

## Step 2 — the DID-consistency triple (MANDATORY gate)

Three DIDs must be byte-identical, or the edge either drops or is signed under the wrong identity:

1. the wrapper's `PACT_BROKER_PERSONA_DID`,
2. the registry entry's `personaDid` (Step 1),
3. the `--persona` you pass the verifier.

Then run **`assertBrokerPersona`** (`v0/src/identity/broker-client.js`) — it makes the broker sign a probe and
verifies the signature under the registered key. A green result proves the held key matches the claimed persona
(the NS-2 key↔persona proof; integrity ≠ provenance). **A green `assertBrokerPersona` is the precondition for the
minted edge in Step 3 to pass `verifiedRecords`** — if it throws (`does NOT sign as …`), the broker key and the
registered key diverge; fix Step 1 before minting.

## Step 3 — mint the live edge through the cross-uid broker

Compose the deployed signer into the mint path (the mechanism exists — "zero seam change", per
`cross-uid-broker.md`):

```js
const { crossUidBrokerSigner } = require('../../v0/src/identity/broker-launch');
const { mintFreshVouch } = require('../../v0/src/identity/mint-fresh-vouch');

const signer = crossUidBrokerSigner({ brokerUser: '<broker>', wrapperPath: '<abs wrapper path>' });
const { ok, frame } = mintFreshVouch({
  signer, personaDid: 'did:key:<broker>', humanUid: 'human:<broker-root>',
  targetPersona: 'did:key:<target>',
  approvedAt: Date.now(), freshnessNonce: '<fresh random nonce, >= 8 chars>', keyId: '<broker key id>',
  seq: <n>, nonce: '<frame nonce>',
});
// appendRecord(frame, { receiverId: '<receiver>', stateDir: '<store>' })  -> the receiver's store
```

The edge is **freshness-bound** (Option A: `payload.freshness` inside the content-address) so a same-uid host
cannot replay it beyond the reader's TTL window (`{now, ttlMs}` — a deploy constant on the READER side, never
record-sourced). `mintFreshVouch` holds NO key: `signer` is the cross-uid custody boundary.

## Step 4 — attest out-of-band, then confirm the read-side

1. Re-run `custody-verify.js --key … --persona did:key:<broker> --broker-user <broker> --wrapper … --registry …`
   → `hostObservableChecksPassed: true`, then `--attested-cross-uid` after YOU confirm the four manual checks. The
   flag records YOUR attestation; it changes the exit code, NOT the proof.
2. Confirm the minted edge appears in `verifiedRecords(registry, storeOpts)` for the receiver and weighs where
   expected (`disjointPaths` / `convert`), and that `convert(...).actionable` is still `false` (SHADOW).

## The honest ceiling (LOUD — do NOT report as a trust close)

- **HARDENS:** the broker persona's KEY-CUSTODY — a same-uid host can no longer forge an edge **under the broker's
  persona** via the `registerPersona` API path or without the broker key (first-writer immutability + the read-gate
  sig-verify drop). A successful operator deploy (NOT this SHADOW proof) would make this the first world-anchored
  key-custody signal on a trust-graph edge. **One box / one run / one axis**
  (the R-heap ceiling: a scope downgrade, a hypervisor/root TCB, or a different box reopens it — re-probe
  `sysctl kernel.yama.ptrace_scope`, `swapon --show`, `core_pattern` at deploy; "still deployed" is a decayable
  claim, not a standing fact).
- **Does NOT prove "who minted it" in general:** `read-gate` keys on the **host-writable** registry. A same-uid
  attacker HOLDING the in-process registry handle can still forge a broker-attributed edge via a direct
  `reg.personas.set`/`delete` (the disclosed 5th co-forge leg — `registry.js` threat boundary; plans/30 §2 leg 5),
  and can self-register its OWN persona and sign authentic edges under it (equal own-persona standing — the
  persona-blind readout). Closing THAT needs a provenance-anchored registry binding (`sigma_root` / plans/31) AND a
  consumer that privileges the broker persona — BOTH out of this arc.
- **Does NOT gate:** the weight stays SHADOW (`convert.actionable` false, U2 open). Provenance informs; it does not
  gate.
- **Does NOT close R3 / U1:** a legitimate holder of their own persona key still mints authentic records —
  provenance-of-the-key is not uniqueness-of-the-human.

All operator steps above are the USER's trust act (NS-7). Claude builds and verifies the SHADOW wiring and writes
this runbook; it never performs the deploy or the attestation.
