---
lifecycle: persistent
audience: the operator (out-of-band, NS-7)
purpose: the box-specific, copy-paste sheet to finish Option A from the current state (Parts 1+2 done = the 5th signal)
canonical: sigma-root-deploy.md (Phase A/B rationale + the cosign A.3 recipe + safety invariants) ; operator-deploy-A.md (the full ordered sequence)
---

# Finish Option A — the remaining operator sheet (Phase A + B)

> **This is the operator's sheet, not Claude's (NS-7).** Claude wrote it; Claude runs NO step — no key mint, no
> seed, no `cosign`, no arming. Canonical rationale + safety invariants live in
> [`sigma-root-deploy.md`](sigma-root-deploy.md) (Phase A/B + the cosign A.3 recipe); the whole-of-A ordered index
> is [`operator-deploy-A.md`](operator-deploy-A.md). This sheet is the copy-paste execution layer over them.

**You are here.** Parts 1 + 2 (cross-uid custody + the live freshness-bound edge) ran on the box `rheap` and are
the **5th world-anchored signal**. What remains to "finish A" is **Phase A (genesis root + attest) + Phase B
(provision a persona)**. **Phase C (arm the read-path) is deferred** — both-or-neither, gated on the P2 signer.

## Where each step runs — and WHY

| Step | Runs on | Why |
|---|---|---|
| A.1 mint root keypair | **Mac** (off-box) | `K_root_priv` must NEVER enter `rheap`'s read scope — same-uid custody is integrity, not provenance |
| A.2 seed genesis root | **Mac** | uses `K_root_pub` only; builds the registry construction |
| A.3 attest `K_root_pub` | **Mac** | needs `cosign` + a browser for the keyless OIDC flow; touches only the PUBLIC key |
| Phase B provision persona | **Mac** | the root signs the binding with `K_root_priv`, which lives on the Mac |
| (deferred) Phase C arm | `rheap` | copies the PUBLIC `K_root_pub` over + injects `regProvenance`; gated on P2 |

**The one rule that fixes the machine for every step: `K_root_priv` never touches `rheap`.** All of Phase A/B runs
on the Mac (from `~/Documents/PACT`). `rheap` already holds its custody broker + persona `registry.json` from
Parts 1-2; the genesis root is deliberately kept OFF it (that IS the provenance boundary). `rheap` re-enters only
at the deferred Phase C, and only ever receives the PUBLIC key.

> **Persistence note (honest).** `rheap`'s `/etc/pact/registry.json` is a persona-rows array
> (`{personaDid, humanUid, publicKeyPem}`, loaded via `registerPersona`) — it has **no root-row schema** today. So
> A.2/B build a registry *construction* + bindings; persisting them into the live read-path is the deferred SHADOW
> arming (Phase C). The HARDEN (A.1 + A.3) does not depend on it.

## Decide first (3 values, reused everywhere)

- `HUMAN_UID` — your scarce human-root id (the same string as `humanUid` AND `controller`).
- OIDC identity — the email/account you sign A.3 with (the world-anchor).
- Confirm the Mac tree is current: `git -C ~/Documents/PACT pull`.

## A.1 — mint the root keypair — Mac, from `~/Documents/PACT`

Save as `a1-mint.js`, run `node a1-mint.js`:

```js
const { generateEdgeKeypair } = require('./v0/src/lib/edge-attestation');
const fs = require('fs');
const { publicKeyPem, privateKeyPem } = generateEdgeKeypair();
fs.writeFileSync('K_root_pub.pem', publicKeyPem);
const rootDir = process.env.HOME + '/.pact-root';
const privPath = rootDir + '/K_root_priv.pem';
fs.mkdirSync(rootDir, { recursive: true, mode: 0o700 });
fs.chmodSync(rootDir, 0o700);   // enforce on rerun: mkdir's mode is ignored when the dir already exists
fs.writeFileSync(privPath, privateKeyPem, { mode: 0o600 });
fs.chmodSync(privPath, 0o600);  // enforce on rerun: writeFileSync's mode only applies when the file is created
console.log('K_root_pub.pem written; K_root_priv in ~/.pact-root (0600). NEVER copy priv to rheap, NEVER commit.');
```

## A.2 + Phase B — seed root + provision a persona — Mac

`registerRoot` / `registerPersona` are first-writer-immutable — seed in a clean construction, get it right once.
Save as `a2b-provision.js`, run `HUMAN_UID="<...>" P="did:key:<persona>" node a2b-provision.js`:

```js
const { createRegistry, registerRoot, registerPersona } = require('./v0/src/identity/registry');
const { generateEdgeKeypair } = require('./v0/src/lib/edge-attestation');
const { signSigmaRoot } = require('./v0/src/identity/sigma-root');
const fs = require('fs');

const reg = createRegistry();
registerRoot(reg, { humanUid: process.env.HUMAN_UID, rootPublicKeyPem: fs.readFileSync('K_root_pub.pem', 'utf8') });

const { publicKeyPem: Kpub, privateKeyPem: Kpriv } = generateEdgeKeypair();
registerPersona(reg, { personaDid: process.env.P, humanUid: process.env.HUMAN_UID, publicKeyPem: Kpub });
const kroot = fs.readFileSync(process.env.HOME + '/.pact-root/K_root_priv.pem', 'utf8');
const sigmaRoot = signSigmaRoot(
  { personaDid: process.env.P, publicKeyPem: Kpub, controller: process.env.HUMAN_UID },
  { privateKeyPem: kroot });
if (!sigmaRoot) throw new Error('signSigmaRoot returned null: bad binding -- fix before persisting');
console.log('persona', process.env.P, 'bound under root; persist (P, sigmaRoot, Kpub); guard the persona key.');
```

## A.3 — attest `K_root_pub` to the transparency log — Mac — THE HARDEN

Minimal HARDEN = A.1 then A.3. Full recipe + honest ceiling: [`sigma-root-deploy.md`](sigma-root-deploy.md) §A.3.
Write the predicate `root-binding.json` (`rootPublicKeyPem` byte-identical to `K_root_pub.pem`):

```json
{ "humanUid": "<HUMAN_UID>",
  "rootPublicKeyPem": "<paste K_root_pub.pem contents>",
  "purpose": "PACT sigma_root HumanRoot genesis attestation",
  "deployment": "rheap", "seededAt": "<ISO timestamp>" }
```

Attest keyless (a browser OIDC prompt launches — pick your identity), then verify:

```sh
cosign attest-blob K_root_pub.pem \
  --predicate root-binding.json --type custom \
  --bundle root-attestation.sigstore.json --yes

cosign verify-blob-attestation --bundle root-attestation.sigstore.json \
  --certificate-identity <you@your-idp> \
  --certificate-oidc-issuer <issuer-url> \
  --type custom K_root_pub.pem
```

Do NOT hardcode a Rekor URL — cosign resolves the current log from the published TrustedRoot. Keep
`root-attestation.sigstore.json` + the Rekor `logIndex` / `UUID`.

## Honest boundaries (NS-9)

- **A.3 is the sole HARDEN** — it world-anchors the *assertion* (tamper-evident, OIDC-bound, logged), NOT
  distinct-real-humanness (the U1 frontier). A.2 / B / C only narrow.
- **Phase C (arm the read-path) is deferred** — both-or-neither, gated on the P2 signer; arming without it is
  NS-9 theater.
- **Gates nothing** — `convert.actionable` stays `false`.

## Hand back when done

`root-attestation.sigstore.json` + Rekor `logIndex` / `UUID` + `K_root_pub.pem` + the seeded-registry
construction. Then the run record gets written and the honest call made on whether A.3 lands as a new §8 row or
stays the root-provenance enabler.
