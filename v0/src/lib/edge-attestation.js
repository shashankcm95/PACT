// PACT v0 — edge-attestation.js (ed25519 sign/verify)
//
// SURGICALLY DERIVED from kernel _lib/edge-attestation.js (see TRANSFER-PROVENANCE.md).
// KEEPS: ed25519 alg-pinning (defends algorithm-confusion), canonical-base64 + 64-byte
// output gate (malleability defense), the resolveSigner Option-B trust-domain SEAM, and
// fail-closed verify. RENAMED edge_id -> record_id (PACT signs the frame's content-address).
//
// ADAPTED for the PACT inter-node boundary (VERIFY board, cluster "no shared default"):
//   * loadPublicKey takes opts.publicKeyPem ONLY — NO LOOM_EDGE_VERIFY_KEY env fallback.
//     Each sender's verify key is resolved PER-SENDER from the U1 registry (a shared default
//     would make verify accept-all-from-the-default-minter, collapsing the multi-root distinction).
//   * the signing key has NO ambient env default (the LOOM_EDGE_SIGNING_KEY fallback was REMOVED at
//     P-minter — it was Option-A-equivalent: same-uid readable, INTEGRITY not PROVENANCE). Signing now
//     REQUIRES an injected opts.signer (a custody boundary) OR an explicit opts.privateKeyPem (tests
//     only; a grep gate keeps it out of non-test src/). Custody REQUIRES real out-of-band separation
//     (separate uid / enclave / HSM) — a deployment property, proven OUT-OF-BAND; crypto cannot show
//     separateness, and same-uid in-process custody stays OPEN by physics (see plans/04 §0/§7).
//
// PURE crypto: parameterized over (recordId, sig, key) only.

'use strict';

const crypto = require('crypto');

const SIG_ALG = 'ed25519';
const HEX64 = /^[0-9a-f]{64}$/;

function isHex64(v) { return typeof v === 'string' && HEX64.test(v); }

// Canonical base64: the string must round-trip decode+encode unchanged (rejects
// whitespace-injected / non-canonical encodings — a malleability defense) AND non-strings/empties.
function isCanonicalBase64(s) {
  if (typeof s !== 'string' || s.length === 0) return false;
  let buf;
  try { buf = Buffer.from(s, 'base64'); } catch { return false; }
  if (buf.length === 0) return false;
  return buf.toString('base64') === s;
}

// Resolve an ed25519 PRIVATE KeyObject from opts.privateKeyPem ONLY (the ambient env default was
// REMOVED at P-minter — no LOOM_EDGE_SIGNING_KEY fallback). PINS ed25519 (a non-ed25519 key is refused
// — algorithm-confusion defense). opts.privateKeyPem is test-only (a grep gate keeps it out of src/).
function loadPrivateKey(opts) {
  const pem = (opts && opts.privateKeyPem) || null;
  if (typeof pem !== 'string' || pem.length === 0) return null;
  let key;
  try { key = crypto.createPrivateKey(pem); } catch { return null; }
  return key.asymmetricKeyType === 'ed25519' ? key : null;
}

// Resolve an ed25519 PUBLIC KeyObject from opts ONLY (NO env default — per-sender resolution;
// see header). Absent -> null -> verify fails CLOSED. PINS ed25519 (refuses a wrong-type key).
function loadPublicKey(opts) {
  const pem = (opts && opts.publicKeyPem) || null;
  if (typeof pem !== 'string' || pem.length === 0) return null;
  let key;
  try { key = crypto.createPublicKey(pem); } catch { return null; }
  return key.asymmetricKeyType === 'ed25519' ? key : null;
}

// A fresh ed25519 keypair as PEM strings (tests + per-persona provisioning).
function generateEdgeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

// resolveSigner(opts) -> a signer fn (hex64) -> base64-sig | null, or null. THE Option-B
// trust-domain SEAM: an injected opts.signer routes signing into a domain the host cannot read()
// (a separate-uid broker), so the host process never holds the key. opts.signer takes precedence;
// a non-function opts.signer is IGNORED and falls through to an explicit opts.privateKeyPem (tests
// only — there is NO ambient env default anymore), so absent both it returns null → sign fails CLOSED.
// (The minter layer hard-throws on a non-fn signer so a custody-wiring bug surfaces loudly upstream.)
function resolveSigner(opts = {}) {
  if (opts && typeof opts.signer === 'function') return opts.signer;
  const key = loadPrivateKey(opts);
  if (!key) return null;
  return (recordId) => {
    if (!isHex64(recordId)) return null; // the closure self-guards (it is exported via resolveSigner)
    try { return crypto.sign(null, Buffer.from(recordId, 'utf8'), key).toString('base64'); }
    catch { return null; }
  };
}

// signRecordId(recordId, opts, body?) -> base64 ed25519 signature over a 64-hex content-address, or null.
// Fail-soft: a non-HEX64 id (input gate FIRST), no signer, a throwing signer, or a malformed/
// non-canonical/non-64-byte signer OUTPUT -> null. Never throws.
//
// `body` (optional) is the frame PREIMAGE that hashed to recordId. It is passed through to the signer as an
// OPTIONAL 2nd arg (signer(recordId, body)) so a custody-boundary signer (the cross-uid broker) can present
// it for per-request recompute-binding (R2-WHAT, plans/11). This stays broker-AGNOSTIC: the in-process
// resolveSigner closure ignores the 2nd arg, so every existing call site is unaffected (Open/Closed).
function signRecordId(recordId, opts = {}, body) {
  if (!isHex64(recordId)) return null;
  const signer = resolveSigner(opts);
  if (typeof signer !== 'function') return null;
  let sig;
  try { sig = signer(recordId, body); } catch { return null; }
  if (!isCanonicalBase64(sig)) return null;
  return Buffer.from(sig, 'base64').length === 64 ? sig : null;
}

// verifyRecordSig(recordId, sigB64, opts) -> boolean. Fail-CLOSED: a non-HEX64 id, a non-canonical/
// malformed sig, or no loadable ed25519 verify key -> false (never accept-all). Never throws.
function verifyRecordSig(recordId, sigB64, opts = {}) {
  if (!isHex64(recordId)) return false;
  if (!isCanonicalBase64(sigB64)) return false;
  const key = loadPublicKey(opts);
  if (!key) return false;
  let sig;
  try { sig = Buffer.from(sigB64, 'base64'); } catch { return false; }
  try { return crypto.verify(null, Buffer.from(recordId, 'utf8'), key, sig); }
  catch { return false; }
}

// Whether a loadable ed25519 verify key is configured (opts). Lets a caller distinguish
// "no key to adjudicate with" from "key present, sig failed".
function hasVerifyKey(opts = {}) {
  return loadPublicKey(opts) != null;
}

module.exports = {
  SIG_ALG,
  isHex64,
  isCanonicalBase64,
  generateEdgeKeypair,
  resolveSigner,
  signRecordId,
  verifyRecordSig,
  hasVerifyKey,
};
