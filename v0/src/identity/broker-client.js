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

// opts.env is the trusted caller's config/ARMING + extras channel (the sigma-root broker's SOLE arming path is
// `env: PACT_ROOT_*`), but it must NEVER carry a CODE-EXECUTION / code-LOAD var -- an env var that turns "set a var"
// into "run arbitrary code" in the `#!/bin/sh` wrapper or the `node` child (defense-in-depth vs a caller accidentally
// spreading a host NODE_OPTIONS/PATH). This guard blocks ONLY that class -- NOT the broker's config (PACT_ROOT_*,
// PACT_BROKER_* config), which is the trusted caller's legit arming channel (#85/F10). (A config-vs-extras channel
// SEPARATION -- so config cannot be injected via extras at all -- is a filed follow-up, not this fix.)
//   prefix-class: NODE_OPTIONS / NODE_REPL_ (node code-load), OPENSSL_ (node reads OPENSSL_CONF -> engine/provider
//                 .dylib load = RCE, VALIDATE F4), BASH_FUNC_ (bash exported-function import = RCE into a shell
//                 wrapper, VALIDATE F5), LD_/DYLD_ (loader preload), PACT_BROKER_KEY_FILE (dedicated: opts.keyFile).
//   exact-class : BASH_ENV/ENV (shell startup source), PATH/SHELLOPTS/BASHOPTS/PS4 (shell RCE), NODE_PATH (module
//                 shadow), NODE_V8_COVERAGE/NODE_COMPILE_CACHE (write-as-broker-uid). EXACT so benign NODE_ENV /
//                 ENVIRONMENT / PATH_FOO are not over-blocked.
const RESERVED_ENV_PREFIX = /^(NODE_OPTIONS|NODE_REPL_|OPENSSL_|BASH_FUNC_|LD_|DYLD_|PACT_BROKER_KEY_FILE)/;
const RESERVED_ENV_EXACT = new Set(['BASH_ENV', 'ENV', 'PATH', 'NODE_PATH', 'NODE_V8_COVERAGE', 'NODE_COMPILE_CACHE', 'SHELLOPTS', 'BASHOPTS', 'PS4']);
function isReservedEnvKey(k) { return RESERVED_ENV_PREFIX.test(k) || RESERVED_ENV_EXACT.has(k); }

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 4096;

/**
 * A sync signer over a separate-process broker.
 * @param {{command?:string, args?:string[], keyFile?:string, env?:object, timeoutMs?:number, maxBytes?:number}} opts
 *   command  — the broker executable (default: this node). args — fixed leading args (e.g. the broker script).
 *   keyFile  — convenience: sets PACT_BROKER_KEY_FILE in the (allowlisted) child env. env — extra
 *              caller-ALLOWLISTED child vars (explicit; process.env is never inherited).
 * @returns {(recordId:string)=>string|null}  base64 sig, or null (fail-closed) on any error.
 */
function brokerSigner(opts = {}) {
  const command = opts.command || process.execPath;
  const args = Array.isArray(opts.args) ? opts.args : [];
  // positive guards: a 0 / negative value falls back to the default (execFileSync treats timeout:0 as
  // "no timeout" — a footgun — so require a POSITIVE integer; same for the maxBuffer bound).
  const timeout = (Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxBuffer = (Number.isInteger(opts.maxBytes) && opts.maxBytes > 0) ? opts.maxBytes : DEFAULT_MAX_BYTES;
  // env ALLOWLIST: build from scratch; NEVER spread process.env (the NODE_OPTIONS defense). opts.keyFile is
  // the SOLE key-path channel; opts.env extras are refused if they'd re-open the hole (isReservedEnvKey).
  const env = {};
  if (typeof opts.keyFile === 'string') env.PACT_BROKER_KEY_FILE = opts.keyFile;
  if (opts.env && typeof opts.env === 'object') {
    for (const k of Object.keys(opts.env)) {
      if (isReservedEnvKey(k)) {
        const hint = k === 'PACT_BROKER_KEY_FILE' ? ' — use opts.keyFile for the key path' : '';
        throw new Error('brokerSigner: opts.env may not set a reserved broker-child environment variable (' + k + ')' + hint);
      }
      env[k] = opts.env[k];
    }
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

module.exports = { brokerSigner, assertBrokerPersona };
