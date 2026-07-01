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
const { refuseAlert } = require('../lib/refuse-alert');

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
    if (!rec || typeof rec.record_id !== 'string') {
      // defensive: listByReceiver already filters null / bad-record_id rows, so this is unreachable
      // in practice — a genuinely corrupt row if it ever appears (integrity).
      refuseAlert('malformed-record-in-store', { class: 'integrity', record_id: rec && rec.record_id });
      continue;
    }
    if (typeof rec.sig !== 'string') {
      // a content-valid but UNSIGNED record — a normal fail-closed drop (the sender did not sign);
      // most likely a producer MISCONFIG, NOT tamper. Kept out of the `integrity` (tamper) stream.
      refuseAlert('unsigned-record', { class: 'misconfig', sender: rec.src_persona_did, record_id: rec.record_id });
      continue;
    }
    const pub = lookupPublicKey(registry, rec.src_persona_did);
    if (!pub) {
      // unregistered sender — no key to verify against → contributes 0 (fail-closed, unchanged).
      // Likely a MISCONFIG (a legit sender not yet registered / a trust-anchor gap); operator triages.
      refuseAlert('unregistered-sender', { class: 'misconfig', sender: rec.src_persona_did, record_id: rec.record_id });
      continue;
    }
    if (verifyRecordSig(rec.record_id, rec.sig, { publicKeyPem: pub })) out.push(rec);
    // a stored record whose sig does NOT verify under the registered key is a forgery attempt (ATTACK).
    else refuseAlert('sig-verify-failed', { class: 'attack', sender: rec.src_persona_did, record_id: rec.record_id });
  }
  return out;
}

module.exports = { verifiedRecords };
