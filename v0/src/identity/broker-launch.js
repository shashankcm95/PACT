// PACT cross-uid deployment spike -- identity/broker-launch.js  (plans/09 sec.1)
//
// crossUidBrokerSigner: a VALIDATED argv builder that wires the existing brokerSigner to a cross-uid
// `sudo -n -u <broker-user> <wrapper>` invocation -- ZERO seam change (brokerSigner already accepts an
// arbitrary command/args; minter/frame/resolveSigner are untouched). The launcher's ONE job is to remove
// caller choice over the command (it is PINNED to sudo) and to validate the two attacker-influenced inputs:
//
//   * brokerUser -- a leading-dash or metachar username is a `sudo` FLAG-INJECTION vector -> strict POSIX
//     regex. (Probed: `sudo -n -u -x` treats `-x` as the username VALUE, not a flag -- so the regex is
//     belt-and-suspenders, not the sole defense -- but a metachar/space/over-length name is still refused.)
//   * wrapperPath / sudoPath -- a leading-dash or relative path in the COMMAND position IS parsed as a sudo
//     option (probed: `sudo -n -u root -x` -> "invalid option -- x") -> require an absolute, dotdot-free path.
//
// HONEST SCOPE (plans/09 sec.0): this builds the cross-uid LAUNCHER; custody-real is a DEPLOYMENT property the
// operator attests out-of-band (NS-7). The launcher validates the wiring SHAPE; ownership/perms of the
// wrapper + key are the custody-verifier's job (custody-verify.js), not the launcher's.

'use strict';

const { brokerSigner } = require('./broker-client');

// POSIX-portable username: starts with a letter or underscore, then [a-z0-9_-], max 32 chars. Rejects a
// leading dash, whitespace, shell metachars, uppercase, '/', and over-length. A POSITIVE bounded invariant.
const USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

function assertAbsoluteNoDotDot(p, label) {
  if (typeof p !== 'string' || p.length === 0) {
    throw new TypeError('crossUidBrokerSigner: ' + label + ' is required (an absolute path)');
  }
  if (p[0] !== '/') {
    throw new Error('crossUidBrokerSigner: ' + label + ' must be an ABSOLUTE path -- a relative or leading-dash value could be parsed by sudo as an option (got ' + JSON.stringify(p) + ')');
  }
  if (p.split('/').includes('..')) {
    throw new Error('crossUidBrokerSigner: ' + label + ' must not contain a ".." segment (got ' + JSON.stringify(p) + ')');
  }
  // reject NUL + control chars at VALIDATION (else a path with an embedded control byte or newline defers a
  // confusing failure to execFileSync spawn-time; not exploitable -- no shell -- but fail loud + early).
  // VALIDATE hacker M1. (charCode scan, not a control-char regex literal -- keeps eslint no-control-regex clean.)
  for (let i = 0; i < p.length; i++) {
    if (p.charCodeAt(i) < 0x20) throw new Error('crossUidBrokerSigner: ' + label + ' must not contain NUL or control characters');
  }
}

/**
 * Build the validated { command, args } for a cross-uid broker invocation. Exported for direct assertion in
 * tests (the argv is otherwise sealed in the brokerSigner closure).
 * @param {{brokerUser:string, wrapperPath:string, sudoPath?:string}} opts
 * @returns {{command:string, args:string[]}}
 * @throws {Error|TypeError} on a flag-injection user or a non-absolute / dotdot-bearing path.
 */
function crossUidSudoArgs(opts = {}) {
  const { brokerUser, wrapperPath } = opts;
  if (typeof brokerUser !== 'string' || !USERNAME_RE.test(brokerUser)) {
    throw new Error('crossUidBrokerSigner: brokerUser must match ' + USERNAME_RE + ' (a POSIX username; a leading-dash / metachar / over-length value is a sudo flag-injection risk) -- got ' + JSON.stringify(brokerUser));
  }
  assertAbsoluteNoDotDot(wrapperPath, 'wrapperPath');
  // sudoPath is the ONLY location seam (a non-/usr/bin/sudo deployment, or a test stub). The default bare
  // 'sudo' is resolved via execFileSync's PATH lookup; ANY override must be an absolute path so it can never
  // itself be interpreted as a flag. command is PINNED to sudo -- there is no arbitrary-command override.
  const sudoPath = opts.sudoPath === undefined ? 'sudo' : opts.sudoPath;
  if (sudoPath !== 'sudo') assertAbsoluteNoDotDot(sudoPath, 'sudoPath');
  // -n (non-interactive): sudo NEVER blocks on a password prompt -- it fails immediately, execFileSync throws,
  // the signer returns null (fail-closed). The brokerSigner timeout is the backstop.
  return { command: sudoPath, args: ['-n', '-u', brokerUser, wrapperPath] };
}

/**
 * A sync signer (recordId)->base64sig|null that signs THROUGH a separate-uid broker via
 * `sudo -n -u <broker-user> <wrapper> <recordId>`. Plugs into the existing opts.signer seam unchanged.
 * @param {{brokerUser:string, wrapperPath:string, sudoPath?:string, timeoutMs?:number, maxBytes?:number}} opts
 * @returns {(recordId:string)=>string|null}
 */
function crossUidBrokerSigner(opts = {}) {
  const { command, args } = crossUidSudoArgs(opts);
  return brokerSigner({ command, args, timeoutMs: opts.timeoutMs, maxBytes: opts.maxBytes });
}

module.exports = { crossUidBrokerSigner, crossUidSudoArgs, USERNAME_RE };
