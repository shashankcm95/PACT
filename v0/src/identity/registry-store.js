// PACT v0 -- identity/registry-store.js  (plans/43 -- the live root-schema registry path, DARK)
//
// Persist the in-memory registry model (`personas` + `rootKeys`, registry.js) to/from disk so an ON-BOX
// read-path can carry a seeded root -- today the persisted `registry.json` is persona-rows-only, so the
// sigma-root gate finds `lookupRootKey -> null` (theater). This module (de)serializes the model and provides
// the ONE trusted-load path. It ARMS NOTHING, wires the gate into no live fold, and does NOT verify a persisted
// root against Rekor/A.3 (integrity != provenance -- a persisted root's TRUST comes from the operator seeding
// the attested key, not from its presence in the file).
//
// SECURITY (VERIFY + VALIDATE hacker H1/M1): persisting `rootKeys` WIDENS the file-write surface -- a file-only
// writer (who previously hit an unconditional fail-closed because the loader called only `registerPersona`) can
// now seed their own root and make the gate pass. `loadRegistryFile` closes the net-new CROSS-UID / others-
// writable vector by opening ATOMICALLY (`O_NOFOLLOW`) then stat+read-ing the SAME fd -- so the trust check and
// the read cannot be raced apart (TOCTOU) -- and REFUSING an untrusted file (foreign owner / group-or-world-
// writable / symlink / oversized), OBSERVABLY (a thrown reason, never a silent read).
// DISCLOSED RESIDUALS (NS-9): the SAME-UID self-seed is NOT closed -- a writer who is the loader's own uid is in
// the loader's trust domain and can seed a self-owned 0600 root; that is the pre-existing integrity != provenance
// residual (`registration-provenance.js:70`), NOT a new surface. A symlinked PARENT dir is still followed
// (`O_NOFOLLOW` guards only the final component). `process.getuid() === undefined` (Windows) skips the uid check.
// FORWARD NOTE (the arming wave): the eventual ARMED on-box loader should tighten to root-owned-only (`uid===0`)
// + a root-owned parent dir; the self-or-root allowance here fits the DARK dev/test + the reusable primitive.

'use strict';

const fs = require('node:fs');
const { createRegistry, registerPersona, registerRoot } = require('./registry');
const { canonicalJsonSerialize } = require('../lib/canonical-json');

// Bounds (VERIFY-hacker M2): a trust-anchor file is small. The byte cap gates the inbound read/parse (DoS);
// the row cap backstops a caller who hands `deserializeRegistry` a parsed array directly (bypassing the byte cap).
const MAX_REGISTRY_BYTES = 1024 * 1024;   // 1 MiB pre-parse read/DoS bound.
// Row cap = the replay backstop for a direct deserialize caller AND the "loadable ⟹ re-serializable" ceiling:
// canonical-json's MAX_CANONICAL_NODES=10000 caps a `{personas,rootKeys}` serialization at ~2500 rows
// (~4 nodes/persona-row), so 2000 keeps a loaded registry always re-serializable (VALIDATE code-reviewer).
const MAX_REGISTRY_ROWS = 2000;

// A file-trust refusal (foreign owner / others-writable / symlink / oversized) is a DISTINCT class from a
// malformed-JSON parse error or a first-writer immutability throw. Tag it so a caller (custody-verify) can
// classify the failure without message-matching (dependency inversion: the error carries its class).
const ERR_REGISTRY_UNTRUSTED = 'ERR_REGISTRY_UNTRUSTED';
function untrusted(message) {
  const e = new Error(message);
  e.code = ERR_REGISTRY_UNTRUSTED;
  return e;
}

/**
 * Serialize a registry's PERSISTABLE state to canonical JSON: `{ personas:[...], rootKeys:[...] }`.
 * Rows are SORTED (personas by personaDid, rootKeys by humanUid) BEFORE serialization -- `canonicalJsonSerialize`
 * sorts object KEYS but not array ELEMENTS, so unsorted rows would serialize in Map-insertion order
 * (non-deterministic). `roots` (the Set) is NOT persisted: it is DERIVED from personas on load (F3), and
 * persisting it would create a divergent/forgeable second source of `isKnownRoot`.
 * @param {object} reg a registry (createRegistry()-shaped)
 * @returns {string} canonical JSON
 */
function serializeRegistry(reg) {
  if (!reg || !(reg.personas instanceof Map) || !(reg.rootKeys instanceof Map)) {
    throw new TypeError('serializeRegistry: not a registry (expected {personas:Map, rootKeys:Map})');
  }
  const personas = [...reg.personas.entries()]
    .map(([personaDid, row]) => ({ personaDid, humanUid: row.humanUid, publicKeyPem: row.publicKeyPem }))
    .sort((a, b) => (a.personaDid < b.personaDid ? -1 : a.personaDid > b.personaDid ? 1 : 0));
  const rootKeys = [...reg.rootKeys.entries()]
    .map(([humanUid, rootPublicKeyPem]) => ({ humanUid, rootPublicKeyPem }))
    .sort((a, b) => (a.humanUid < b.humanUid ? -1 : a.humanUid > b.humanUid ? 1 : 0));
  return canonicalJsonSerialize({ personas, rootKeys });
}

/** Read an OWN array field (never inherited -- a JSON.parse `__proto__` key is an own prop, not the prototype;
 *  reading own-only also defends against a polluted Object.prototype). Absent -> []. Non-array -> throw. */
function ownArray(obj, key) {
  const has = Object.prototype.hasOwnProperty.call(obj, key);
  if (!has) return [];
  const v = obj[key];
  if (!Array.isArray(v)) throw new TypeError('deserializeRegistry: `' + key + '` must be an array (invalid registry shape)');
  return v;
}

/**
 * Rebuild a registry from a PARSED value (object OR the legacy bare array of persona rows). REPLAYS the
 * registrars (`registerPersona` / `registerRoot`) -- inheriting first-writer immutability + empty-field guards at
 * the load boundary, and rebuilding the derived `roots` Set for free -- rather than `Map.set`-ing directly.
 * PURE: no fs, no env. Fails CLOSED on every malformed shape (controlled TypeError).
 * @param {object|Array} parsed a JSON.parse result
 * @returns {object} a fresh registry
 */
function deserializeRegistry(parsed) {
  if (parsed === null || typeof parsed !== 'object') {
    throw new TypeError('deserializeRegistry: invalid registry shape (expected an array or {personas, rootKeys} object)');
  }
  let personas;
  let rootKeys;
  if (Array.isArray(parsed)) {
    personas = parsed;        // legacy bare-array format = persona rows only
    rootKeys = [];
  } else {
    personas = ownArray(parsed, 'personas');
    rootKeys = ownArray(parsed, 'rootKeys');
  }
  if (personas.length + rootKeys.length > MAX_REGISTRY_ROWS) {
    throw new TypeError('deserializeRegistry: too many rows (> ' + MAX_REGISTRY_ROWS + ' cap) -- refusing');
  }
  const reg = createRegistry();
  // Order-independent: registerRoot never reads personas; registerPersona never reads rootKeys. A conflicting
  // row THROWS (first-writer immutability) rather than silently overwriting -- inherited from the registrars.
  // A per-row object guard gives a clear message instead of a raw V8 destructure error (VALIDATE code-reviewer LOW).
  for (const row of rootKeys) { assertRowObject(row, 'rootKeys'); registerRoot(reg, row); }
  for (const row of personas) { assertRowObject(row, 'personas'); registerPersona(reg, row); }
  return reg;
}

/** A row must be a plain object (not null / array / scalar) before it reaches the registrars. */
function assertRowObject(row, which) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('deserializeRegistry: each `' + which + '` row must be an object (invalid registry shape)');
  }
}

/**
 * PURE trust policy for a registry file's lstat: THROW (observably) unless the file is a regular file, owned by
 * root or the loader's own uid, and NOT group/world-writable. Symlinks are refused (redirection guard). On a
 * platform with no uid (`selfUid == null`, e.g. Windows) the uid check is skipped but the mode check still holds.
 * Exported (and pure) so it is unit-testable with a synthetic stat -- no root required.
 * @param {{uid:number, mode:number, isFile:Function, isSymbolicLink:Function}} st an fs.lstat result
 * @param {{selfUid:(number|null)}} opts
 */
function assertTrustedFileStat(st, opts) {
  // Fail-CLOSED on missing config: a security-policy fn must not silently default to skipping the owner check
  // (VALIDATE code-reviewer MED). A platform with no uid passes `selfUid: null` EXPLICITLY.
  if (!opts || !('selfUid' in opts)) {
    throw new TypeError('assertTrustedFileStat: opts.selfUid is REQUIRED (pass null explicitly on a platform with no uid) -- refusing to default-skip the owner check');
  }
  const selfUid = opts.selfUid;
  // Validate the VALUE, not just the key's presence (pre-PR CodeRabbit): `{ selfUid: undefined }` satisfies the
  // `in` check above but would fall through the `typeof === 'number'` branch below and SILENTLY skip the uid check
  // -- the exact bypass this guard exists to prevent. Only a number or an EXPLICIT null is a valid selfUid.
  if (selfUid !== null && typeof selfUid !== 'number') {
    throw new TypeError('assertTrustedFileStat: opts.selfUid must be a number or explicit null (an `undefined` value would silently skip the owner check)');
  }
  if (st.isSymbolicLink()) {
    throw untrusted('registry file refused: it is a SYMLINK (redirection guard) -- a trust anchor must be a real regular file');
  }
  if (!st.isFile()) {
    throw untrusted('registry file refused: not a regular file');
  }
  // 0o020 = group-write, 0o002 = other-write. A trust anchor others could rewrite is not trustworthy.
  if ((st.mode & 0o022) !== 0) {
    throw untrusted('registry file refused: it is group- or world-writable (mode ' + (st.mode & 0o777).toString(8) + ') -- refusing an others-writable trust anchor');
  }
  if (typeof selfUid === 'number') {
    if (st.uid !== 0 && st.uid !== selfUid) {
      throw untrusted('registry file refused: foreign owner (uid ' + st.uid + ') -- expected root or the loader uid (' + selfUid + ')');
    }
  }
}

/**
 * The ONE trusted-load path (both custody-verify and the future armed-gate loader use it). Impure shell:
 * lstat -> ownership/mode/symlink guard (assertTrustedFileStat) -> size cap -> read -> JSON.parse ->
 * deserializeRegistry. Every refusal THROWS with an observable reason (the caller logs + exits).
 * @param {string} filePath
 * @param {{maxBytes?:number}} [opts]
 * @returns {object} a fresh registry
 */
function loadRegistryFile(filePath, opts) {
  const maxBytes = opts && typeof opts.maxBytes === 'number' ? opts.maxBytes : MAX_REGISTRY_BYTES;
  const selfUid = typeof process.getuid === 'function' ? process.getuid() : null;
  const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0; // 0 on a platform without it (disclosed Windows residual)
  let fd;
  try {
    // Atomic check-and-use (VALIDATE H1): open ONCE (O_NOFOLLOW rejects a final-component symlink), then stat +
    // read the SAME fd -- so an attacker cannot swap the path between the trust check and the read (TOCTOU).
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | O_NOFOLLOW);
  } catch (e) {
    if (e && e.code === 'ELOOP') throw untrusted('registry file refused: it is a SYMLINK (redirection guard, O_NOFOLLOW)');
    throw e; // ENOENT / EACCES / ... -- a load error the caller classifies, not a trust verdict
  }
  try {
    const st = fs.fstatSync(fd);               // stat the OPEN fd, not the path -- same inode as the read below
    assertTrustedFileStat(st, { selfUid });
    if (st.size > maxBytes) {
      throw untrusted('registry file refused: size ' + st.size + ' exceeds the ' + maxBytes + '-byte cap');
    }
    const parsed = JSON.parse(fs.readFileSync(fd, 'utf8'));
    return deserializeRegistry(parsed);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  serializeRegistry,
  deserializeRegistry,
  loadRegistryFile,
  assertTrustedFileStat,
  MAX_REGISTRY_BYTES,
  MAX_REGISTRY_ROWS,
  ERR_REGISTRY_UNTRUSTED,
};
