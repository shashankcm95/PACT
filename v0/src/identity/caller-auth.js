// PACT R2 caller-auth -- identity/caller-auth.js  (plans/10 sec.1/9)
//
// PURE caller-authorization for the broker (no I/O): given the sudo-injected caller uid (SUDO_UID) and the
// broker-side allowlist (PACT_BROKER_ALLOWED_UIDS), decide allow / deny / disabled. broker-sign.js calls this
// as its gate (0), BEFORE opening the key. SHADOW (gates no action).
//
// HONEST SCOPE (plans/10 sec.0): this is COARSE caller-auth (uid-level WHO), NOT per-request auth -- an
// allowlisted caller can still request a signature over an ARBITRARY record_id (R2 WHAT-can-be-signed stays
// OPEN; per-request authorization is the deeper, separate frontier). It NARROWS oracle-abuse, does not close it.
//
// TRUST MODEL: SUDO_UID is sudo-injected from the REAL invoking uid -- LIVE-PROBED (plans/10 sec.6): under the
// deployed `env_reset, !setenv` policy, a host-forged SUDO_UID is discarded and overwritten from ruid. NEVER
// authorize on SUDO_USER -- it is root-spoofable (man sudoers). The allowlist is set BROKER-SIDE in the
// root-owned wrapper (host cannot tamper it); its VALUE's provenance (not just the wrapper file's integrity)
// is the trust anchor (NS-2 integrity != provenance).

'use strict';

// a uid token: 1-10 digits (the regex admits up to 10 digits, i.e. values past 2^32 -- the integer bound below
// rejects those). Anything else (empty, whitespace, sign, non-digit, >10 digits) fails CLOSED.
const UID_RE = /^[0-9]{1,10}$/;
const UID_MAX = 0xffffffff; // reject the (uid_t)-1 / "nobody" sentinel (4294967295) and anything above

/**
 * Strictly parse a single uid token -> a non-negative integer < UID_MAX, or null (fail-closed).
 * Trims surrounding ASCII spaces ONLY; rejects empty / signed / non-digit / Unicode-whitespace-padded /
 * overflow / the (uid_t)-1 sentinel.
 * @param {*} s
 * @returns {number|null}
 */
function parseUid(s) {
  if (typeof s !== 'string') return null;
  // strip ONLY ASCII spaces (operator-written allowlist entries like "501, 600"). NOT String.trim() -- that
  // strips the whole Unicode whitespace class (NBSP / em-space / BOM), which would let a padded token normalize
  // to a uid (VALIDATE hacker LOW). A real sudo-injected SUDO_UID is bare digits; reject any other padding.
  const t = s.replace(/^ +| +$/g, '');
  if (!UID_RE.test(t)) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n >= UID_MAX) return null;
  return n;
}

/**
 * Parse the allowlist env. UNSET (undefined/null) => { configured:false } (opt-in OFF). PRESENT => a Set<number>
 * of every entry, parsed through the SAME parseUid path as the caller (type-consistent comparison). A SINGLE
 * malformed entry fails the WHOLE parse (exact-set discipline: never silently drop a bad entry and authorize on
 * the survivors); an empty/whitespace-only PRESENT value is malformed (fail-closed), NOT "disabled".
 * @param {*} raw
 * @returns {{configured:boolean, set:Set<number>|null, malformed?:boolean}}
 */
function parseAllowlist(raw) {
  if (raw === undefined || raw === null) return { configured: false, set: null };
  const parts = String(raw).split(',');
  const out = new Set();
  for (const p of parts) {
    const n = parseUid(p);
    if (n === null) return { configured: true, set: null, malformed: true };
    out.add(n);
  }
  // out.size >= 1 here: split(',') always yields >= 1 part, and any null parseUid returned malformed inside the
  // loop, so every surviving entry is a number. (A present-but-empty raw -> [''] -> parseUid('') -> malformed.)
  return { configured: true, set: out };
}

/**
 * Decide whether the caller may request a signature.
 * @param {{sudoUid:string|undefined, allowlistRaw:string|undefined}} opts
 * @returns {{decision:'allow'|'deny'|'disabled', reason:string}}
 *   'disabled' -> allowlist UNSET (opt-in OFF; the caller proceeds; broker-sign emits a LOUD notice). R2 OPEN.
 *   'deny'     -> fail-closed: malformed allowlist, absent/malformed SUDO_UID, or caller not in the allowlist.
 *   'allow'    -> allowlist SET + SUDO_UID parses + is a member.
 */
function authorizeCaller(opts = {}) {
  const al = parseAllowlist(opts.allowlistRaw);
  if (!al.configured) return { decision: 'disabled', reason: 'allowlist-unset' };
  if (al.malformed || !al.set) return { decision: 'deny', reason: 'allowlist-malformed' };
  const uid = parseUid(opts.sudoUid);
  if (uid === null) return { decision: 'deny', reason: 'sudo-uid-absent-or-malformed' };
  if (!al.set.has(uid)) return { decision: 'deny', reason: 'caller-not-in-allowlist' };
  return { decision: 'allow', reason: 'authorized' };
}

module.exports = { authorizeCaller, parseAllowlist, parseUid, UID_MAX };
