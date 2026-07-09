---
lifecycle: persistent
audience: the operator (out-of-band, NS-7) + the USER (the go-ahead gate)
created: 2026-07-09
purpose: recon the world-anchored deploy runs (signals 5/6/7) and lay out the HONEST Phase-C arming ladder -- what is built, what "arming" actually buys, and the one thing genuinely runnable now
canonical: sigma-root-deploy.md (the arm spine + Phase A-D) ; finish-root-broker-steps.md (the signal-7 broker deploy) ; plans/33 (the DARK admission gate) ; plans/39 (the wired read-path filter) ; plans/43 (the root-schema persist path, #74)
---

# Phase-C arming -- recon + the honest ladder (2026-07-09)

> **This is the operator's sheet, not Claude's (NS-7).** Claude wrote it and diagnosed the repo READ-ONLY;
> Claude runs NO arming step -- it seeds no live root, sets no flag, injects no `admissionArmed=true`, writes no
> `/etc`, and performs no attestation. The sole trust HARDEN is the operator's out-of-band act (A.3, already done
> as signal 6). Everything an in-process step does only NARROWS.

## 0. TL;DR

The Phase-C dependency chain (`sigma-root-deploy.md` §0) is now **all-green** on its named prereqs: P1 (the
read-path filter is wired, disarmed), P2 (the signer is deployed = signal 7), P3 (the root is attested = signal 6),
plus the #74 root-schema persist path. So arming is no longer NS-9 theater on the prereq axis. **But** two honest
realities decide what arming buys: the trust-convert read-path has **no live production caller** (it is SHADOW,
exercised only by tests/dogfoods), and even fully armed it only **NARROWS an advisory count** -- `convert.actionable`
stays hard-`false` (INV-16, U2 open). The one genuinely-meaningful action available today is the controlled
armed-admission **dogfood** (§4); a live arm (§5) is deferrable until a consumer reads the narrowed count.

## 1. Recon -- what the past runs banked

| Signal | Run record | Date | Axis world-anchored | `K_root_priv` location |
|---|---|---|---|---|
| **5** | [`live-edge-run-2026-07-04.md`](live-edge-run-2026-07-04.md) | 07-04 | **frame** broker key CUSTODY (uid 999, live edge on `rheap`) | n/a (frame key) |
| **6** | [`root-attestation-run-2026-07-05.md`](root-attestation-run-2026-07-05.md) | 07-05 | **root** PROVENANCE -- A.3 Sigstore/Rekor `logIndex 2079476377`, OIDC `merlin95` **(the sole trust HARDEN)** | Mac enclave `~/.pact-root`, `0600`, off-box |
| 6.B | (same record) | 07-05 | *not a signal* -- SHADOW enclave provision dogfood; the A.2 `registerRoot` seed ran in-memory | Mac enclave |
| **7** | [`root-broker-run-2026-07-08.md`](root-broker-run-2026-07-08.md) | 07-08 | **root** KEY-CUSTODY -- cross-uid `pact-root-broker` (uid 997) on `rheap`; the host uid cannot `read()` `K_root` | now ALSO on-box `/etc/pact-root/K_root.pem` `0600` under uid 997 |

**Current `rheap` state:** host `ubuntu`(1000), frame broker `pactbroker`(999), root broker `pact-root-broker`(997);
`K_root_pub` sha256 `47844a45...2342cf` = the attested Rekor subject; last-probed R-heap posture hardened
(`ptrace_scope=2`, no swap, `core_pattern=/dev/null`). The live `registry.json` is **persona-rows-only** -- no
seeded root persisted yet.

## 2. Where Phase-C arming stands -- the dependency chain is all-green

The canonical spine ([`sigma-root-deploy.md`](sigma-root-deploy.md) §0) names three prereqs. All three are met,
plus #74:

| Prereq | State | Evidence |
|---|---|---|
| **P1 -- wire the read-path sigma_root filter** | **DONE (disarmed)** | `registration-gate.js` `filterAnchoredRecords` is live-wired into `convert.disjointPaths` (`convert.js:89`); an identity pass-through until `meCtx.regProvenance` is injected |
| **P2 -- land the Phase-6 signer** (`signingArmed=true` honest) | **DONE** | the cross-uid broker deployed = signal 7 (#65-73) |
| **P3 -- genesis root minted + seeded + ATTESTED** | **DONE** | A.3 = signal 6 (`logIndex 2079476377`) |
| **(+) root-schema PERSIST path** (so an on-box `lookupRootKey` is not `null`) | **DONE** | #74 `registry-store.js` |

## 3. The honest ceiling -- read before arming

- **There is NO live production caller of `convert()`.** The whole trust-convert read-path is SHADOW -- invoked
  only from tests and dogfoods (`grep 'convert(' v0/src | grep -v test` -> empty). Even a fully-armed read-path
  narrows a count nothing live consumes.
- **Armed, it only NARROWS an advisory count.** `convert.actionable` stays hard-`false` (INV-16, U2 open). Nothing
  gates an irreversible action (NS-8).
- **The read-path arm (`registration-gate`) is DROP-ALL-LEGACY** -- no grandfather. Every live persona must carry a
  verifying sigma_root BEFORE you arm, or all its records drop. That migration is a prerequisite, not a flag-flip.
- **The arm signal is a DI injection**, not a `PACT_*` env flag. `arm-flags.js` stages the lenient
  `isDeploySignalSet` predicate as a forward-contract, but no `PACT_ROOT_*` -> `regProvenance` plumbing is built --
  arming today means injecting `meCtx.regProvenance={sigmaRoots}` at the call site in code.
- **The grandfather path** (`admission-gate.js`, `admissionArmed`/`signingArmed`) is a SEPARATE dormant primitive
  wired to nothing -- exercisable only as the dogfood below.
- **Unchanged residuals (NS-9):** does NOT close R1/#273 (a same-uid allowlisted caller still mints "K_root
  authorized MY key as persona P"), the replay/`.v2` concern, or the W3 apex; one box / one run.

## 4. Runnable NOW -- the armed-admission DOGFOOD (recommended)

The one action that actually exercises the armed path today, and it is **safe**: a throwaway in-memory registry,
never a live one. It proves the arm reaches the gate and the verifier gates on it (verified-admit /
forged-root-reject / XOR-incoherent-passthrough). It is a **test, not a harden**. Canonical source:
`sigma-root-deploy.md` "End-to-end armed-admission smoke" (`:243-291`).

**You run it (NS-7); Claude does not.** On the Mac repo (or `/opt/pact` on the box):

```sh
cd ~/Documents/PACT && node -e '
const assert = require("assert");
const { generateEdgeKeypair } = require("./v0/src/lib/edge-attestation");
const { createRegistry, registerRoot, registerPersona } = require("./v0/src/identity/registry");
const { signSigmaRoot } = require("./v0/src/identity/sigma-root");
const { admissionDecision } = require("./v0/src/trust/admission-gate");
const HUMAN="did:human:smoke-root", P="did:key:zPersonaSmoke";
const r=generateEdgeKeypair(), k=generateEdgeKeypair(), reg=createRegistry();
registerRoot(reg,{humanUid:HUMAN,rootPublicKeyPem:r.publicKeyPem});
registerPersona(reg,{personaDid:P,humanUid:HUMAN,publicKeyPem:k.publicKeyPem});
const sr=signSigmaRoot({personaDid:P,publicKeyPem:k.publicKeyPem,controller:HUMAN},{privateKeyPem:r.privateKeyPem});
const ok=admissionDecision({admissionArmed:true,signingArmed:true,registry:reg,personaDid:P,sigmaRoot:sr});
assert.deepStrictEqual({a:ok.admit,r:ok.reason},{a:true,r:"sigma-root-verified"});
const ev=generateEdgeKeypair();
const forged=signSigmaRoot({personaDid:P,publicKeyPem:k.publicKeyPem,controller:HUMAN},{privateKeyPem:ev.privateKeyPem});
const bad=admissionDecision({admissionArmed:true,signingArmed:true,registry:reg,personaDid:P,sigmaRoot:forged});
assert.deepStrictEqual({a:bad.admit,r:bad.reason},{a:false,r:"sigma-root-unverified"});
const xor=admissionDecision({admissionArmed:true,signingArmed:false,registry:reg,personaDid:P,sigmaRoot:sr});
assert.strictEqual(xor.armed,false);
console.log("OK: armed-admission smoke passed (verified-admit + forged-reject + XOR-passthrough)");
'
```

Green = the armed wiring is sound. Still SHADOW: it proves the WIRING, not a trust advance.

## 5. The LIVE read-path arm (the real Phase C -- heavier; deferrable)

Only worth doing once something live consumes the narrowed count. Every step is **operator-run, out-of-band
(NS-7)**; Claude never seeds a live root, sets a flag, writes `/etc`, or arms.

1. **Seed the attested root** into the on-box `registry.json` in the #74 `{personas, rootKeys}` schema (row:
   `{humanUid:"human:merlin95", rootPublicKeyPem:<the attested K_root_pub, byte-identical to the Rekor subject>}`).
   Ownership: root- or loader-uid-owned, not group/world-writable (`loadRegistryFile` refuses otherwise). For a
   live arm, prefer the ROOT-OWNED-ONLY tightening (§6 item 1).
2. **Migrate every live persona** -- provision each under the root via the deployed broker (Phase B,
   `{signer: crossUidBrokerSigner(...)}`), so each carries a broker-signed sigma_root. This is the DROP-ALL-LEGACY
   prerequisite.
3. **Arm** -- inject `meCtx.regProvenance={sigmaRoots:{...}}` at the `convert`/`disjointPaths` call site. Armed,
   records from a persona whose sigma_root does not verify against the seeded root are dropped.
4. **Re-probe R-heap** at deploy (`sysctl kernel.yama.ptrace_scope`, `swapon --show`, `core_pattern`) -- "still
   deployed" decays.

Loud caveat on all four: it narrows an advisory count only, there is no live consumer, and `actionable` stays false.

## 6. Small code follow-ups (Claude-buildable -- NOT operator)

Both surfaced by the recon; neither blocks §4.

1. **Tighten the ARMED on-box loader to root-owned-only** (`uid===0`) + a root-owned parent dir -- the plans/43
   FORWARD note. Today's `loadRegistryFile` allows self-or-root (right for the DARK dev/test primitive; too loose
   for a live arm). **IN PROGRESS this session -- `plans/44`, DARK opt-in mode, arms nothing.**
2. **Optional `PACT_ROOT_*` flag -> `regProvenance` plumbing** if you would rather arm by env flag than a
   code-level DI (the `isDeploySignalSet` forward-contract is already staged). DEFERRED.

## 7. Recommendation

Run **§4 (the dogfood)** -- the honest, safe, and only currently-meaningful "arm" action, validating everything #74
+ the signal-7 broker unlocked. Hold **§5 (the live arm)** until a live `convert` consumer exists (otherwise you
migrate personas and arm a path nothing reads). §6 item 1 lands the loader tightening so a future live arm has the
strict on-box load path ready.
