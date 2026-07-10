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

const { parseEnabledFlag, isDeploySignalSet } = require('../lib/arm-flags');

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
 * Resolve the FRAME broker's require-CALLER mode from its arm flag (PACT_BROKER_REQUIRE_CALLER), read ONCE in the
 * entrypoint (single-arming-source). Tri-state so an UNSET flag can fall to the per-request SUDO_UID marker:
 *   - strict '1' -> true (force require); strict '0' -> false (explicit opt-out, legacy even under sudo);
 *   - a PRESENT-but-non-strict token (a typo like 'ture') -> true (typo-fails-closed, via isDeploySignalSet);
 *   - genuinely unset (or a recognized-falsey non-'0' token like 'false') -> null (AUTO: the marker decides).
 * @param {*} flagRaw
 * @returns {boolean|null}
 */
function resolveRequireCaller(flagRaw) {
  const explicit = parseEnabledFlag(flagRaw); // '1'->true, '0'->false, else null
  if (explicit !== null) return explicit;
  return isDeploySignalSet(flagRaw) ? true : null; // present-non-strict typo -> ON; unset / falsey-non-'0' -> AUTO
}

/**
 * Decide whether the caller may request a signature.
 * @param {{sudoUid:string|undefined, allowlistRaw:string|undefined, requireCaller?:boolean|null}} opts
 *   requireCaller (F2/#78) governs the UNSET-allowlist default -- resolved by resolveRequireCaller in the FRAME
 *   entrypoint and threaded here. `undefined` (a caller that does NOT thread it -- the sigma-root broker, whose
 *   mandatory-default-ON WHAT gate compensates) keeps the legacy `disabled`; only the FRAME's explicit `null`
 *   reaches the SUDO_UID AUTO marker (`undefined !== null`, the shared-gate contract).
 * @returns {{decision:'allow'|'deny'|'disabled', reason:string}}
 *   'disabled' -> proceed (opt-in OFF; broker-sign emits a LOUD notice). R2-WHO OPEN.
 *   'deny'     -> fail-closed: malformed allowlist, absent/malformed SUDO_UID, caller not in the allowlist, OR an
 *                 unconfigured allowlist on a DEPLOYED broker (F2: flag-forced, or AUTO with SUDO_UID present).
 *   'allow'    -> allowlist SET + SUDO_UID parses + is a member.
 */
function authorizeCaller(opts = {}) {
  const al = parseAllowlist(opts.allowlistRaw);
  if (!al.configured) {
    // F2 (#78): an unconfigured WHO gate on a DEPLOYED broker is a default-open K_broker signing oracle -> fail
    // CLOSED. The PRIMARY, host-untamperable anchor is the broker-side flag (requireCaller, set in the root-owned
    // wrapper -- the faithful mirror of the sigma-root's broker-side controllerPresent). The SUDO_UID AUTO marker
    // is an ADDITIONAL per-request SAFETY NET for the sudo runbook, NOT a guarantee: its integrity rests on the
    // deployed env_reset,!setenv sudoers (which this code CANNOT verify), and a non-sudo deploy (setuid/systemd)
    // injects no SUDO_UID -> it MUST arm the flag. NS-9: this NARROWS the default-open oracle; it does not close it.
    const rc = opts.requireCaller;
    if (rc === true) return { decision: 'deny', reason: 'allowlist-unset-but-required' };       // flag forced ON
    if (rc === false) return { decision: 'disabled', reason: 'allowlist-unset-opted-out' };     // strict '0' opt-out
    if (rc === undefined) return { decision: 'disabled', reason: 'allowlist-unset' };           // sigma-root legacy (not threaded)
    if (rc === null) {
      // FRAME AUTO: a PRESENT SUDO_UID (ANY form -- a correct sudo always sets it well-formed, so an
      // empty/whitespace/garbage value is a tamper/anomaly, NOT dev) means a cross-uid caller -> fail closed.
      // Genuine ABSENCE (no sudo ran) is same-uid dev -> legacy disabled.
      return typeof opts.sudoUid === 'string'
        ? { decision: 'deny', reason: 'allowlist-unset-but-deployed' }
        : { decision: 'disabled', reason: 'allowlist-unset' };
    }
    // ANY other requireCaller value is a MISWIRING (a future entrypoint threading a raw string/number instead of
    // the resolveRequireCaller tri-state) -> fail CLOSED. The WHO gate's own state machine must NOT fall OPEN on an
    // unrecognized state (security.md: a guard must be NON-BYPASSABLE + fail-closed by default).
    return { decision: 'deny', reason: 'allowlist-unset-bad-requirecaller-state' };
  }
  if (al.malformed || !al.set) return { decision: 'deny', reason: 'allowlist-malformed' };
  const uid = parseUid(opts.sudoUid);
  if (uid === null) return { decision: 'deny', reason: 'sudo-uid-absent-or-malformed' };
  if (!al.set.has(uid)) return { decision: 'deny', reason: 'caller-not-in-allowlist' };
  return { decision: 'allow', reason: 'authorized' };
}

module.exports = { authorizeCaller, resolveRequireCaller, parseAllowlist, parseUid, UID_MAX };
