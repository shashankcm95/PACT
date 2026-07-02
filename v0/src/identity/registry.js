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
 *
 * FIRST-WRITER IMMUTABILITY (plans/31 W0 — the key-swap NARROW, NS-9): a persona DID's row is FROZEN at
 * first registration. A re-register with the IDENTICAL (humanUid, publicKeyPem) is an idempotent no-op; a
 * re-register that would CHANGE either field is REJECTED (fail-closed). This closes ATTACK (b) key-swap —
 * a same-uid host can no longer silently re-map an ESTABLISHED persona to its own key (`Map.set` previously
 * overwrote unconditionally). It is input-integrity at the boundary (like the empty-field throws above), NOT
 * an oracle/score — INV-18 ("RECORDS only") is preserved. It NARROWS, it does not close registration-
 * provenance: self-register (a) / Sybil (c) / root-spoof (d) stay OPEN (the world-anchored `sigma_root`
 * HARDEN + U1). Key ROTATION is deliberately deferred: until `sigma_root` ships a root-signed rotation
 * record, rotate by registering a NEW DID, never by re-keying an established one.
 *
 * NEW RESIDUAL this freeze INTRODUCES (VALIDATE honesty HIGH -- disclosed, not hidden, NS-9): FIRST-WRITER
 * SQUATTING. Because the first registration wins, an attacker who pre-registers an UNCLAIMED DID under its own
 * binding permanently DENIES that DID to the legitimate party (no override path until `sigma_root` rotation).
 * UNMITIGATED for opaque DIDs in this leaf; a well-formed did:key DID would resist it (the DID commits to a key
 * the squatter lacks) once did:key self-cert ships -- DEFERRED (needs a base58btc/multicodec impl; the fixtures
 * use non-did:key placeholder ids). The freeze trades an always-open key-swap for a bounded squatting cost.
 *
 * THREAT BOUNDARY (VALIDATE hacker LOW): the guard is enforced on the registerPersona PATH only. An in-process
 * holder of `reg` can still mutate `reg.personas` directly (delete-then-re-add, `Map.set`) -- out of scope
 * (same-uid in-process, the freeze's own threat model). The stored row is `Object.freeze`d as cheap
 * defense-in-depth against an in-place row mutation.
 * @param {object} reg
 * @param {{personaDid:string, humanUid:string, publicKeyPem:string}} entry
 * @throws {TypeError} on a missing field, or a re-register that would mutate an established persona's row.
 */
function registerPersona(reg, { personaDid, humanUid, publicKeyPem }) {
  if (typeof personaDid !== 'string' || !personaDid) throw new TypeError('personaDid required');
  if (typeof humanUid !== 'string' || !humanUid) throw new TypeError('humanUid required');
  if (typeof publicKeyPem !== 'string' || !publicKeyPem) throw new TypeError('publicKeyPem required');
  const existing = reg.personas.get(personaDid);
  if (existing !== undefined) {
    // established persona: exact-row idempotent OR fail-closed. A write-time INTEGRITY guard (reject a
    // conflicting overwrite), NOT a read-time trust/score decision -- INV-18 "registry, never oracle" holds.
    if (existing.humanUid !== humanUid || existing.publicKeyPem !== publicKeyPem) {
      throw new TypeError('registerPersona: persona ' + personaDid + ' is already registered with a different binding — the (humanUid, publicKeyPem) row is IMMUTABLE (first-writer-wins; a key-swap/rebind is refused). Rotate via a new DID.');
    }
    return reg; // idempotent no-op
  }
  reg.personas.set(personaDid, Object.freeze({ humanUid, publicKeyPem }));
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
