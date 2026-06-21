// PACT v0 — identity/registry.js  (spec §1 / §9 U1 — the pluggable root-issuance seam)
//
// The U1 anchor as a REGISTRY, NEVER an ORACLE (INV-18): it RECORDS a root + a persona's verify
// key; it never becomes a global score, an admission gate, or an auto-minted trust edge. The v0
// issuance policy (RATIFIED 2026-06-21) is invite/vouch + stake, instantiated here as explicit
// pre-registration of two roots — behind the seam, so SBT / Personhood-Credentials is a one-seam
// upgrade later. Per-sender verify keys live here (no shared default — VERIFY board).

'use strict';

/** A fresh, empty registry. */
function createRegistry() {
  return { roots: new Set(), personas: new Map() };
}

/**
 * Register a persona (and implicitly its root). RECORDS only — mints no trust. Returns the
 * registry (mutated in place: the registry is a stateful service, not a value object).
 * @param {object} reg
 * @param {{personaDid:string, humanUid:string, publicKeyPem:string}} entry
 */
function registerPersona(reg, { personaDid, humanUid, publicKeyPem }) {
  if (typeof personaDid !== 'string' || !personaDid) throw new TypeError('personaDid required');
  if (typeof humanUid !== 'string' || !humanUid) throw new TypeError('humanUid required');
  if (typeof publicKeyPem !== 'string' || !publicKeyPem) throw new TypeError('publicKeyPem required');
  reg.personas.set(personaDid, { humanUid, publicKeyPem });
  reg.roots.add(humanUid);
  return reg;
}

/** Is this human_uid a known (registered) root? (root_valid — spec §2 receipt rule.) */
function isKnownRoot(reg, humanUid) {
  return !!reg && reg.roots.has(humanUid);
}

/** The registered verify key for a persona, or null. PER-SENDER (never a shared default). */
function lookupPublicKey(reg, personaDid) {
  const p = reg && reg.personas.get(personaDid);
  return p ? p.publicKeyPem : null;
}

/** The root a persona belongs to, or null. */
function rootOf(reg, personaDid) {
  const p = reg && reg.personas.get(personaDid);
  return p ? p.humanUid : null;
}

module.exports = { createRegistry, registerPersona, isKnownRoot, lookupPublicKey, rootOf };
