// PACT v0 — identity/keypair.js  (spec §1)
//
// A per-persona ed25519 keypair (the signing identity). Thin wrapper over the transferred
// crypto primitive so the identity layer owns the persona-key concept (the frame's SIG, §2).

'use strict';

const { generateEdgeKeypair } = require('../lib/edge-attestation');

/** A fresh persona keypair: { publicKeyPem, privateKeyPem }. */
function newPersonaKeypair() {
  return generateEdgeKeypair();
}

module.exports = { newPersonaKeypair };
