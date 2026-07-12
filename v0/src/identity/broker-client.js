// PACT P-broker — identity/broker-client.js  (plans/05 §1)
//
// brokerSigner: the host-side custody CLIENT. Returns a SYNCHRONOUS signer(recordId)->base64sig|null that
// plugs into the EXISTING opts.signer seam (resolveSigner/signRecordId) with ZERO change to buildFrame /
// minter / resolveSigner. It invokes a separate-process broker via execFileSync and re-gates the output.
// It holds NO key material — a grep test asserts it never references `privateKeyPem`; the real guarantee
// is that the key path is set ONLY in the broker child's env (opts.keyFile), never read by the client.
//
// SECURITY (plans/05 §8 VERIFY board):
//   * env ALLOWLIST, never process.env (HIGH-1). The child env is built FROM SCRATCH — process.env is
//     NEVER spread — so NODE_OPTIONS / --require / LD_* cannot be inherited into the key-holding broker
//     child. This is a positive BOUNDED invariant (allowlist), not a denylist of known-bad vars.
//   * fixed command + args; record_id is the strict-hex64 FINAL arg; no shell -> no argv injection.
//   * bounded maxBuffer + timeout -> output-flood / hang DoS -> execFileSync throws -> null (fail closed).
//   * the canonical-base64 + 64-byte output re-gate is DEFENSE-IN-DEPTH (signRecordId re-gates too) — the
//     load-bearing NEW guards are the env-allowlist + DoS bounds + fixed-argv, not the format re-check.
//
// HONEST SCOPE: this is the custody MECHANISM (key out of the host heap), custody-real only cross-uid
// (R1) and it does NOT add access-control (R2 oracle-abuse) — see broker-sign.js / plans/05 §0.

'use strict';

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { isHex64, isCanonicalBase64, verifyRecordSig } = require('../lib/edge-attestation');
const { computeRecordId } = require('../lib/record');
const { lookupPublicKey } = require('./registry');

// TWO SEPARATE caller channels build the broker child's env (#100 / plans/53 — a config-vs-extras channel split
// so config cannot be injected via the extras channel, for every config var the broker honors — the set is kept in
// sync with the entrypoint reads by the drift tripwire in broker-config-channel.test.js):
//   * opts.config -- a POSITIVE allowlist (CONFIG_ENV_KEYS): the trusted caller's config/ARMING vars (the
//     sigma-root broker's SOLE arming path `PACT_ROOT_*`, the frame broker's `PACT_BROKER_*` config). Fail-closed
//     on ANY key not in the allowlist -- config is a finite, enumerable set, so a positive gate is sound.
//   * opts.env    -- a NEGATIVE gate for the UNBOUNDED benign tail (`SOME_BENIGN`, `NODE_ENV`). It rejects any
//     CONFIG_ENV_KEYS member (NEW: config goes through opts.config), any sudo caller-signal (CALLER_SIGNAL_ENV),
//     any prototype-polluting dunder key, and any CODE-EXECUTION / code-LOAD var (isReservedEnvKey, #85/F10) --
//     everything else passes. A positive allowlist is impossible here (no enumerable legit set), so the gate stays
//     negative; the NEW rejections make the extras channel provably config-free.
// Both channels reject a NON-STRING value LOUDLY (execFileSync coerces `${v}`, so a number/bool would silently
// mis-arm a security flag -- `0` -> "0" disables the frame gate). The child env is built with Object.create(null)
// so a `__proto__` key can never re-parent it (the VERIFY-hacker CRITICAL: a JSON.parse'd `__proto__` key is
// OWN-enumerable, and `env['__proto__']={…}` on a `{}` target invokes the setter -> the child inherits the config
// var straight through the gate; the dunder reject + null-proto target close it belt-and-suspenders).
//
// The code-exec reserved set (isReservedEnvKey) blocks ONLY the env->RCE class (#85/F10):
//   prefix-class: NODE_OPTIONS / NODE_REPL_ (node code-load), OPENSSL_ (node reads OPENSSL_CONF -> engine/provider
//                 .dylib load = RCE, VALIDATE F4), BASH_FUNC_ (bash exported-function import = RCE into a shell
//                 wrapper, VALIDATE F5), LD_/DYLD_ (loader preload), PACT_BROKER_KEY_FILE (dedicated: opts.keyFile).
//   exact-class : BASH_ENV/ENV (shell startup source), PATH/SHELLOPTS/BASHOPTS/PS4 (shell RCE), NODE_PATH (module
//                 shadow), NODE_V8_COVERAGE/NODE_COMPILE_CACHE (write-as-broker-uid). EXACT so benign NODE_ENV /
//                 ENVIRONMENT / PATH_FOO are not over-blocked.
const RESERVED_ENV_PREFIX = /^(NODE_OPTIONS|NODE_REPL_|OPENSSL_|BASH_FUNC_|LD_|DYLD_|PACT_BROKER_KEY_FILE)/;
const RESERVED_ENV_EXACT = new Set(['BASH_ENV', 'ENV', 'PATH', 'NODE_PATH', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'SHELLOPTS', 'BASHOPTS', 'PS4']);
function isReservedEnvKey(k) { return RESERVED_ENV_PREFIX.test(k) || RESERVED_ENV_EXACT.has(k); }

// A READ-ONLY membership set: `has` + iteration + `size`, but NO .add/.delete/.clear. Object.freeze(new Set(...))
// does NOT prevent those -- a Set's [[SetData]] is an internal slot, not a frozen property, so a frozen Set is
// STILL mutable via its methods; an EXPORTED frozen Set is a caller-widenable/emptyable allowlist (a .clear() on
// CONFIG_ENV_KEYS reopens the injection). Sealing the backing Set in a closure makes the gate non-bypassable at
// runtime (security.md: a guard must be non-bypassable). [CodeRabbit MAJOR]
function readonlyStringSet(members) {
  const backing = new Set(members);
  return Object.freeze({
    has: (k) => backing.has(k),
    get size() { return backing.size; },
    [Symbol.iterator]: () => backing[Symbol.iterator](),
  });
}

// CONFIG_ENV_KEYS -- the enumerable config/ARMING var set (the opts.config positive allowlist). EXACTLY the vars
// the two entrypoints read from process.env (a drift tripwire in broker-config-channel.test.js keeps this in
// sync). PACT_BROKER_KEY_FILE is DELIBERATELY EXCLUDED -- it owns the dedicated opts.keyFile channel + is reserved,
// so routing it through config too would recreate a two-channel collision for one var. Exported (read-only) so the
// tripwire imports the canonical set (no re-hardcode / DRY drift).
const CONFIG_ENV_KEYS = readonlyStringSet([
  'PACT_BROKER_REQUIRE_FRAME', 'PACT_BROKER_PERSONA_DID', 'PACT_BROKER_REQUIRE_CALLER', 'PACT_BROKER_ALLOWED_UIDS',
  'PACT_ROOT_KEY_FILE', 'PACT_ROOT_CONTROLLER', 'PACT_ROOT_REQUIRE_BINDING', 'PACT_ROOT_REQUIRE_CALLER', 'PACT_ROOT_ALLOWED_UIDS',
]);
// SUDO_UID is the SOLE WHO-gate input (broker-core.js); a caller-set value FORGES the gate on the in-process path
// (no sudo env_reset backstop there). NEVER a caller channel -- rejected on BOTH channels (VERIFY: architect
// BLOCKING-1 == hacker HIGH-1). SUDO_USER is root-spoofable and never authorized-on, but is barred for hygiene.
const CALLER_SIGNAL_ENV = readonlyStringSet(['SUDO_UID', 'SUDO_USER']);
// prototype-polluting keys: never a legit env var name; barred on both channels (the null-proto target already
// neutralizes the setter, this is the loud belt-and-suspenders reject).
const DUNDER_ENV_KEYS = readonlyStringSet(['__proto__', 'constructor', 'prototype']);

// INVARIANTS (VALIDATE board): (a) the negative gates are CASE-SENSITIVE (POSIX env names are case-sensitive; the
// child reads exact-case `SUDO_UID` / `PACT_*`, so a `sudo_uid` near-miss is inert AT THE CHILD -- do not casefold).
// (b) opts.config is the TRUSTED caller's channel (config keys are ACCEPTED there); the whole defense assumes a
// caller never routes attacker-influenced data into opts.config -- only opts.env is the untrusted-extras surface.
// a NUL/control char in a value fails CLOSED at execFileSync but SILENTLY (the sign() bare catch -> null); reject it
// LOUDLY at construction so a tamper/misconfig is observable, not an invisible null (security.md: a fail-closed
// decision must be OBSERVABLE). charCode scan, not a control-char regex literal (keeps eslint no-control-regex clean;
// mirrors broker-launch.js's path validator).
function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 0x20) return true;
  return false;
}
// A caller channel is either absent (undefined -> skip) or a plain object; a truthy non-object (a string/number
// from a caller typo) must FAIL LOUD, not silently no-op the channel (the same fail-closed-must-be-OBSERVABLE
// discipline the value gates apply -- else a mistyped opts.config leaves the broker UNARMED with no error).
// [CodeRabbit nitpick]
function requireChannelObject(v, name) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new TypeError('brokerSigner: ' + name + ' must be a plain object when set (a mistyped channel would otherwise silently no-op)');
  }
  return v;
}
// Assign each key of a caller channel into the (null-proto) child env, applying the shared discipline (dunder
// reject -> channel-specific membership `reject(k)` -> string-value gate -> control-char gate) then the assignment.
// `reject` returns an error message (throw) or null (allow). A single leaf so the two channels can't diverge.
function assignChannel(env, srcObj, channel, reject) {
  for (const k of Object.keys(srcObj)) {
    if (DUNDER_ENV_KEYS.has(k)) throw new Error('brokerSigner: ' + channel + ' may not set a prototype-polluting key (' + k + ')');
    const msg = reject(k);
    if (msg) throw new Error(msg);
    const v = srcObj[k];
    if (typeof v !== 'string') throw new TypeError('brokerSigner: ' + channel + ' value for ' + k + ' must be a string (execFileSync would coerce a non-string and silently mis-arm)');
    if (hasControlChar(v)) throw new Error('brokerSigner: ' + channel + ' value for ' + k + ' must not contain NUL or control characters (a fail-closed spawn error would otherwise be a silent null)');
    env[k] = v;
  }
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 4096;

/**
 * A sync signer over a separate-process broker.
 * @param {{command?:string, args?:string[], keyFile?:string, config?:object, env?:object, timeoutMs?:number, maxBytes?:number}} opts
 *   command  — the broker executable (default: this node). args — fixed leading args (e.g. the broker script).
 *   keyFile  — convenience: sets PACT_BROKER_KEY_FILE in the (allowlisted) child env.
 *   config   — the trusted caller's config/ARMING vars; keys MUST be CONFIG_ENV_KEYS members (fail-closed).
 *   env      — the benign-EXTRAS tail; rejects config/sudo/dunder/code-exec keys (process.env is never inherited).
 * @returns {(recordId:string)=>string|null}  base64 sig, or null (fail-closed) on any error.
 * @throws {Error|TypeError} on a non-allowlisted config key, a config/sudo/dunder/reserved key in env, or a
 *   non-string value in either channel.
 */
function brokerSigner(opts = {}) {
  const command = opts.command || process.execPath;
  const args = Array.isArray(opts.args) ? opts.args : [];
  // positive guards: a 0 / negative value falls back to the default (execFileSync treats timeout:0 as
  // "no timeout" — a footgun — so require a POSITIVE integer; same for the maxBuffer bound).
  const timeout = (Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBuffer = (Number.isInteger(opts.maxBytes) && opts.maxBytes > 0) ? opts.maxBytes : DEFAULT_MAX_BYTES;
  // env ALLOWLIST: build from scratch; NEVER spread process.env (the NODE_OPTIONS defense). Object.create(null)
  // target so a __proto__ key can never re-parent it. opts.keyFile is the SOLE frame-key-path channel.
  const env = Object.create(null);
  if (typeof opts.keyFile === 'string') env.PACT_BROKER_KEY_FILE = opts.keyFile;
  // (1) config channel — a positive allowlist (fail-closed on any non-config key). The allowlist IS the gate; a
  // reserved/sudo/benign key is refused simply by NOT being a CONFIG_ENV_KEYS member (no second gate needed).
  const configObj = requireChannelObject(opts.config, 'opts.config');
  if (configObj) {
    assignChannel(env, configObj, 'opts.config', (k) =>
      CONFIG_ENV_KEYS.has(k) ? null : 'brokerSigner: opts.config may only set an allowlisted config var (' + k + ' is not one — a benign extra goes in opts.env)');
  }
  // (2) extras channel — a negative gate over the unbounded benign tail. Order: config-member (use opts.config) ->
  // sudo caller-signal (WHO-forge) -> reserved code-exec (#85). The config-member arm fires INDEPENDENTLY of the
  // reserved arm, so a future reserved-set edit cannot drop a config key back into the benign tail.
  const extrasObj = requireChannelObject(opts.env, 'opts.env');
  if (extrasObj) {
    assignChannel(env, extrasObj, 'opts.env', (k) => {
      if (CONFIG_ENV_KEYS.has(k)) return 'brokerSigner: opts.env may not set the config var ' + k + ' — use opts.config';
      if (CALLER_SIGNAL_ENV.has(k)) return 'brokerSigner: opts.env may not set the sudo caller-signal ' + k + ' (not a caller channel — it forges the WHO gate)';
      if (isReservedEnvKey(k)) return 'brokerSigner: opts.env may not set a reserved broker-child environment variable (' + k + ')' + (k === 'PACT_BROKER_KEY_FILE' ? ' — use opts.keyFile for the key path' : '');
      return null;
    });
  }
  return function sign(recordId, body) {
    if (!isHex64(recordId)) return null; // never spawn on a bad id (and never let argv smuggle a flag)
    // R2-WHAT (plans/11): when a preimage `body` is presented, write it on the child's stdin so a
    // require-frame broker can recompute-bind. Absent a body, stdin stays 'ignore' (legacy, back-compat).
    const spawnOpts = { timeout, maxBuffer, env, stdio: ['ignore', 'pipe', 'ignore'] };
    if (body !== undefined && body !== null) {
      spawnOpts.input = typeof body === 'string' ? body : JSON.stringify(body);
      spawnOpts.stdio = ['pipe', 'pipe', 'ignore'];
    }
    let out;
    try {
      out = execFileSync(command, [...args, recordId], spawnOpts);
    } catch { return null; } // spawn error / non-zero exit / timeout / maxBuffer overflow -> fail closed
    const sig = out.toString('utf8').trim();
    if (!isCanonicalBase64(sig)) return null;             // defense-in-depth (signRecordId re-gates too)
    return Buffer.from(sig, 'base64').length === 64 ? sig : null;
  };
}

/**
 * Opt-in wire-time smoke check (plans/05 §8, architect MED #1): does `signer` actually sign as
 * `personaDid`? The persona-agnostic broker + persona-bound minter can be mis-wired (a broker holding the
 * WRONG persona's key) — which fails CLOSED at receiveFrame, but SILENTLY. This converts that silent
 * mis-wire into a LOUD construction-time throw. One real broker round-trip; NOT forced into createMinter
 * (no registry coupling / no mandatory round-trip at construction — YAGNI for SHADOW v0).
 * @throws {TypeError|Error} on a non-function signer, an unregistered persona, or a key mismatch.
 */
function assertBrokerPersona(signer, { registry, personaDid } = {}) {
  if (typeof signer !== 'function') throw new TypeError('assertBrokerPersona: signer must be a function');
  const pub = lookupPublicKey(registry, personaDid);
  if (!pub) throw new Error('assertBrokerPersona: no registered key for ' + personaDid);
  // Present a minimal well-formed P-frame body with a RANDOM nonce (NOT a fixed/predictable id): the random
  // nonce makes the probe id unpredictable, so a probe-special-casing decoy can't false-PASS (VALIDATE
  // hacker F2), AND declaring src_persona_did = personaDid lets the probe pass a require-frame broker's
  // persona-bind (R2-WHAT, plans/11 §1.8). Works in BOTH modes (legacy ignores the body). This also
  // STRENGTHENS the check: it confirms the broker signs a frame FOR personaDid, not just an arbitrary hex.
  const probeBody = { src_persona_did: personaDid, nonce: crypto.randomBytes(16).toString('hex') };
  const probeId = computeRecordId(probeBody);
  const sig = signer(probeId, probeBody);
  if (!sig || !verifyRecordSig(probeId, sig, { publicKeyPem: pub })) {
    throw new Error('assertBrokerPersona: signer does NOT sign as ' + personaDid + ' (broker key != registered key — mis-wired custody)');
  }
  return true;
}

module.exports = { brokerSigner, assertBrokerPersona, CONFIG_ENV_KEYS, CALLER_SIGNAL_ENV };
