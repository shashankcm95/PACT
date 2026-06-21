// PACT P2 — trust/read-gate.js  (spec §7.1, INV-14 — THE root fix from the VERIFY board)
//
// The authenticated-minter READ gate. The per-receiver store verifies the content-address (INTEGRITY)
// but NEVER the signature — sig-verify lives only in frame.receiveFrame, and appendRecord does not
// require a sig. So the raw store is locally forgeable (it "is not a sandbox"). EVERY record the trust
// engine weights MUST pass through here first: its signature must verify under the SENDER's registered
// key. An unsigned / bad-sig / unregistered-sender record is DROPPED (contributes 0). Store-presence is
// never provenance — integrity != provenance (the #273 family).

'use strict';

const { listByReceiver } = require('../lib/record-store');
const { verifyRecordSig } = require('../lib/edge-attestation');
const { lookupPublicKey } = require('../identity/registry');

/**
 * Return only the records in the receiver's store whose signature verifies under the SENDER's
 * registered verify key. This is the SOLE entry point the trust engine reads through.
 *
 * @param {object} registry  the U1 registry (per-sender verify keys)
 * @param {{receiverId:string, stateDir?:string}} storeOpts
 * @returns {object[]} the sig-verified records (possibly empty)
 */
function verifiedRecords(registry, storeOpts) {
  const all = listByReceiver(storeOpts);
  const out = [];
  for (const rec of all) {
    if (!rec || typeof rec.sig !== 'string' || typeof rec.record_id !== 'string') continue;
    const pub = lookupPublicKey(registry, rec.src_persona_did);
    if (!pub) continue; // unregistered sender — no key to verify against → contributes 0 (fail-closed)
    if (verifyRecordSig(rec.record_id, rec.sig, { publicKeyPem: pub })) out.push(rec);
  }
  return out;
}

module.exports = { verifiedRecords };
