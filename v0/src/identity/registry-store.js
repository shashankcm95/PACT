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
// ARMED MODE (plans/44 -- DARK, no live consumer yet): the ARMED on-box loader tightening (root-owned-ONLY
// `uid===0` + a root-owned parent dir) is now the OPT-IN `loadRegistryFile(path, { requireRootOwned:true })`
// mode. The self-or-root DEFAULT (byte-identical to #74) fits the DARK dev/test + custody-verify's arbitrary
// `--registry` path; the armed mode is what a future on-box armed read-path will hard-code. Named residual: no
// `openat` in Node sync, so the parent guard refuses the static misconfig, not a parent-swap racer (see below).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
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
  // requireRootOwned (plans/44 -- the DARK ARMED mode; no live consumer, the armed on-box read-path is future).
  // Read the opt ONCE into a local (VALIDATE hacker Note A): a hostile TOGGLING getter handed directly to this
  // exported pure checker must not be read twice (typeof-then-===true) or it could pass validation as `true` and
  // then re-read `false` to disarm the file branch. Capture, then validate + branch on the SAME value. A present
  // non-boolean is a MALFORMED opt -> throw (fail-closed; undefined == absent == disarmed, matching the loader).
  const rroRaw = opts.requireRootOwned;
  if (rroRaw !== undefined && typeof rroRaw !== 'boolean') {
    throw new TypeError('assertTrustedFileStat: opts.requireRootOwned must be a boolean when present');
  }
  const requireRootOwned = rroRaw === true;
  if (st.isSymbolicLink()) {
    throw untrusted('registry file refused: it is a SYMLINK (redirection guard) -- a trust anchor must be a real regular file');
  }
  if (!st.isFile()) {
    throw untrusted('registry file refused: not a regular file');
  }
  // 0o020 = group-write, 0o002 = other-write. A trust anchor others could rewrite is not trustworthy. (Both modes.)
  if ((st.mode & 0o022) !== 0) {
    throw untrusted('registry file refused: it is group- or world-writable (mode ' + (st.mode & 0o777).toString(8) + ') -- refusing an others-writable trust anchor');
  }
  // ARMED: root-owned ONLY -- refuse a self-owned root (the same-uid self-seed the DISARMED mode tolerates for
  // dev/test). selfUid is irrelevant here, so the check can never silently skip (H1). DISARMED: self-OR-root (#74).
  if (requireRootOwned) {
    if (st.uid !== 0) {
      throw untrusted('registry file refused: armed mode requires root ownership (uid 0), got uid ' + st.uid);
    }
    return;
  }
  if (typeof selfUid === 'number') {
    if (st.uid !== 0 && st.uid !== selfUid) {
      throw untrusted('registry file refused: foreign owner (uid ' + st.uid + ') -- expected root or the loader uid (' + selfUid + ')');
    }
  }
}

/**
 * PURE trust policy for a registry file's PARENT DIRECTORY (plans/44 -- the DARK ARMED mode ONLY). THROW (via
 * `untrusted`, so a parent refusal carries ERR_REGISTRY_UNTRUSTED exactly like a file refusal) unless the stat is
 * a real directory, root-owned (`uid === 0`), and NOT group/world-writable. Closes #74's disclosed
 * symlinked-parent residual AND the net-new (previously-undisclosed) others-writable-parent vector for the strict
 * path -- the parent-swap TOCTOU racer stays a disclosed residual. Exported + pure so it is unit-testable with a
 * synthetic stat -- no root required.
 * @param {{uid:number, mode:number, isDirectory:Function}} dirSt an fs.fstat result for the parent directory
 */
function assertTrustedDirStat(dirSt) {
  if (!dirSt.isDirectory()) {
    throw untrusted('registry file refused: parent is not a directory');
  }
  if ((dirSt.mode & 0o022) !== 0) {
    throw untrusted('registry file refused: parent dir is group- or world-writable (mode ' + (dirSt.mode & 0o777).toString(8) + ') -- refusing an others-writable parent');
  }
  if (dirSt.uid !== 0) {
    throw untrusted('registry file refused: parent dir not root-owned (uid ' + dirSt.uid + ') -- armed mode requires a root-owned parent');
  }
}

/**
 * The ONE trusted-load path (both custody-verify and the future armed-gate loader use it). Impure shell:
 * [ARMED: parent-dir guard ->] atomic file open -> ownership/mode/symlink guard (assertTrustedFileStat) ->
 * size cap -> read -> JSON.parse -> deserializeRegistry. Every refusal THROWS with an observable reason.
 * DISARMED (default) is byte-identical to #74; ARMED (`requireRootOwned:true`, plans/44 -- DARK) narrows the file
 * owner to root-only AND requires a root-owned parent dir.
 * @param {string} filePath
 * @param {{maxBytes?:number, requireRootOwned?:boolean}} [opts]
 * @returns {object} a fresh registry
 */
function loadRegistryFile(filePath, opts) {
  const maxBytes = opts && typeof opts.maxBytes === 'number' ? opts.maxBytes : MAX_REGISTRY_BYTES;
  // Normalize the arm predicate ONCE (VERIFY H1): requireRootOwned must be a boolean or absent; a present
  // non-boolean THROWS (fail-closed on a malformed opt) so a truthy-non-true value can NEVER split the gates
  // (parent armed + file left self-or-root). `armed` then gates BOTH the parent check and the file narrowing,
  // and the NORMALIZED boolean (never the raw opt) is what reaches assertTrustedFileStat.
  const rro = opts ? opts.requireRootOwned : undefined;
  if (rro !== undefined && typeof rro !== 'boolean') {
    throw new TypeError('loadRegistryFile: opts.requireRootOwned must be a boolean or absent');
  }
  const armed = rro === true;
  const selfUid = typeof process.getuid === 'function' ? process.getuid() : null;
  const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0; // 0 on a platform without it (disclosed Windows residual)

  // ARMED (plans/44 -- DARK; no live consumer, the armed on-box read-path is future): the parent dir must be a
  // root-owned, non-others-writable REAL directory before we trust the file. `O_DIRECTORY | O_NOFOLLOW` rejects a
  // symlinked parent-final-component; the fd is fstat'd + released in a finally (no leak on the refusal path, M1).
  // DISCLOSED residual (M2/#74): no `openat` in Node sync, so the file is re-opened by full path below -- a parent
  // swap BETWEEN this check and the file open is unclosable here (refuses the static misconfig, not a racer).
  if (armed) {
    const O_DIRECTORY = fs.constants.O_DIRECTORY || 0;
    let dfd;
    try {
      dfd = fs.openSync(path.dirname(filePath), fs.constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
    } catch (e) {
      // A symlinked (ELOOP, Linux) or non-directory (ENOTDIR, macOS) parent is a TRUST refusal -- classed +
      // observable on both. ENOENT/EACCES propagate (still fail-closed; never a silent pass to the file open).
      if (e && (e.code === 'ELOOP' || e.code === 'ENOTDIR')) {
        throw untrusted('registry file refused: parent dir is a symlink or not a directory (' + e.code + ')');
      }
      throw e;
    }
    try {
      assertTrustedDirStat(fs.fstatSync(dfd));
    } finally {
      fs.closeSync(dfd);
    }
  }

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
    assertTrustedFileStat(st, { selfUid, requireRootOwned: armed }); // NORMALIZED boolean, never the raw opt (H1)
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
  assertTrustedDirStat,
  MAX_REGISTRY_BYTES,
  MAX_REGISTRY_ROWS,
  ERR_REGISTRY_UNTRUSTED,
};
