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
const { lookupPublicKey } = require('./registry');

// opts.env is a caller-allowlisted EXTRAS channel — but it must not re-open the code-loading hole the env
// scrub closes, nor shadow the key-path channel. Refuse the node/linker hijack vars + PACT_BROKER_KEY_FILE.
const RESERVED_ENV = /^(NODE_OPTIONS|PACT_BROKER_KEY_FILE|LD_|DYLD_)/;

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
  // the SOLE key-path channel; opts.env extras are refused if they'd re-open the hole (RESERVED_ENV).
  const env = {};
  if (typeof opts.keyFile === 'string') env.PACT_BROKER_KEY_FILE = opts.keyFile;
  if (opts.env && typeof opts.env === 'object') {
    for (const k of Object.keys(opts.env)) {
      if (RESERVED_ENV.test(k)) throw new Error('brokerSigner: opts.env may not set a code-loading/key-path var (' + k + ') — use opts.keyFile for the key path');
      env[k] = opts.env[k];
    }
  }
  return function sign(recordId) {
    if (!isHex64(recordId)) return null; // never spawn on a bad id (and never let argv smuggle a flag)
    let out;
    try {
      out = execFileSync(command, [...args, recordId], {
        timeout, maxBuffer, env, stdio: ['ignore', 'pipe', 'ignore'],
      });
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
  // a RANDOM per-call 64-hex probe (NOT a fixed constant): a signer cannot special-case a value it cannot
  // predict, so a probe-special-casing decoy can't false-PASS the smoke check (VALIDATE hacker F2).
  const PROBE = crypto.randomBytes(32).toString('hex');
  const sig = signer(PROBE);
  if (!sig || !verifyRecordSig(PROBE, sig, { publicKeyPem: pub })) {
    throw new Error('assertBrokerPersona: signer does NOT sign as ' + personaDid + ' (broker key != registered key — mis-wired custody)');
  }
  return true;
}

module.exports = { brokerSigner, assertBrokerPersona };
