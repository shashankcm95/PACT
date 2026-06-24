#!/usr/bin/env node
// PACT cross-uid deployment spike — identity/custody-verify.js  (plans/09 §1)
//
// The OUT-OF-BAND custody verifier: the operator runs this AS THE HOST UID on the deployed box to check
// every custody condition the host uid can OBSERVE, and to surface the one it CANNOT (that the running
// broker PROCESS is genuinely the other uid). It NEVER asserts custody-real (NS-9, the close→narrow reflex):
// it reports `custodyMechanismVerified` + `requiresOutOfBandUidConfirmation`. Per NS-7, only the operator's
// out-of-band uid attestation (`id` / `ls -l`) HARDENS — the kernel's EACCES under a genuinely separate uid
// is the world-anchored signal; this tool checks the necessary (not sufficient) condition.
//
// Design (plans/09 §10): a PURE `assessCustody(facts)` (the verdict — fully testable for the cross-uid TRUE
// branch via SYNTHETIC facts, which a same-uid box can never produce) + an impure `gatherCustodyFacts` (the
// I/O). C3 (a real sign+verify round-trip) is the load-bearing NON-VACUITY proof — it proves a real, usable
// key exists behind the broker WITHOUT the host needing to read or even stat it.

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { verifyRecordSig } = require('../lib/edge-attestation');
const { computeRecordId } = require('../lib/record');
const { lookupPublicKey } = require('./registry');

// the denial leg counts ONLY for these (hacker F1) — any OTHER open error (ELOOP symlink / ENXIO FIFO /
// EISDIR / ENOENT) is a custody-leg ERROR, never silently treated as "denied".
const DENIAL_ERRNOS = new Set(['EACCES', 'EPERM']);

/**
 * PURE verdict over observed facts. No I/O.
 * @param {{
 *   isRoot:boolean,
 *   keyStat:{ok:true,isFile:boolean,size:number,ownerUid:number}|{ok:false,errno:string},
 *   hostRead:{ok:true}|{ok:false,errno:string},
 *   runningUid:number|null,
 *   sign:{signed:boolean,personaMatches:boolean},
 *   wrapper:null|{ok:true,isFile:boolean,worldOrGroupWritable:boolean}|{ok:false,errno:string}
 * }} facts
 * @returns {{hostObservableChecksPassed:boolean, requiresOutOfBandUidConfirmation:boolean, checks:object[], residuals:string[]}}
 *   NOTE: deliberately NO `custodyReal` / `custodyMechanismVerified` field (NS-9) — the host cannot observe
 *   uid separation, so it never claims custody (or "the mechanism") VERIFIED, only that its checks passed.
 */
function assessCustody(facts = {}) {
  if (facts === null || typeof facts !== 'object' || Array.isArray(facts)) facts = {}; // null/array/scalar -> every leg fails closed (the default param fires only for undefined; ported from assessHeapRead)
  const checks = [];
  const residuals = [];
  let verified = true;
  let denialLegTaken = false;
  const fail = (id, detail) => { checks.push({ id, status: 'FAIL', detail }); verified = false; };
  const pass = (id, detail) => checks.push({ id, status: 'PASS', detail });
  const note = (id, detail) => checks.push({ id, status: 'NOTE', detail });

  // C0 — root / uid-model guard (POSIX perms use the EFFECTIVE uid; isRoot folds getuid||geteuid===0; hacker
  // F6). A null runningUid (no getuid — non-POSIX) fails CLOSED: the owner-uid disambiguator below cannot run,
  // so cross-uid custody is unverifiable here (VALIDATE code-reviewer F2 / hacker H2).
  if (facts.isRoot) fail('C0-root', 'running as root (real or effective uid 0) — root bypasses file permissions; uid separation is unobservable from here');
  else if (facts.runningUid === null || facts.runningUid === undefined) fail('C0-root', 'uid model unavailable on this platform (getuid undefined) — cross-uid custody cannot be verified here');
  else pass('C0-root', 'not running as root (uid ' + facts.runningUid + ')');

  // C1 — non-vacuity, best-effort via lstat (NEVER a read — survives the real cross-uid case where the host
  // cannot read the broker key). C3 below is the load-bearing non-vacuity proof.
  const ks = facts.keyStat || {};
  if (ks.ok) {
    if (!ks.isFile) fail('C1-keypresent', 'key path is not a regular file (symlink/FIFO/dir) — no key to protect');
    else if (!(ks.size > 0)) fail('C1-keypresent', 'key file is empty — vacuous: no key to protect');
    else pass('C1-keypresent', 'key file present + non-empty (' + ks.size + ' bytes)');
  } else if (ks.errno && DENIAL_ERRNOS.has(ks.errno)) {
    note('C1-keypresent', 'cannot stat the key (the key directory is locked down — ' + ks.errno + '); non-vacuity rests on the C3 live sign');
  } else {
    fail('C1-keypresent', 'cannot stat the key path (' + (ks.errno || 'unknown') + ') — key absent / path broken');
  }

  // C2 — the custody (denial) leg. Branch ONLY on the open errno (hacker F1), and disambiguate MODE-vs-uid
  // via the key OWNER (architect HIGH-1 + hacker F2) so a same-owner mode-000 file can never false-pass.
  const hr = facts.hostRead || {};
  if (hr.ok) {
    fail('C2-denied', 'the host uid CAN read the key file — custody is NOT real (R1: same-uid / over-permissive)');
  } else if (hr.errno && DENIAL_ERRNOS.has(hr.errno)) {
    // The denial leg requires a POSITIVELY-PROVEN different owner (VALIDATE hacker C1). Owner-unknown is NOT a
    // pass: the host cannot distinguish a genuinely cross-uid key from its OWN locked-dir key, so it can prove
    // nothing — fail-closed (a same-uid box with a 000 key-dir was live-reproduced false-passing the old
    // owner-unknown auto-pass). A clean denial leg = host-denied AND lstat-readable owner that differs from us.
    if (ks.ok && typeof ks.ownerUid === 'number' && typeof facts.runningUid === 'number') {
      if (ks.ownerUid === facts.runningUid) {
        fail('C2-denied', 'host read denied (' + hr.errno + ') BUT the key is owned by the running uid (' + ks.ownerUid + ') — EACCES is from file MODE, not uid separation. NOT cross-uid custody.');
      } else {
        denialLegTaken = true;
        pass('C2-denied', 'host read denied (' + hr.errno + ') + key FILE owned by a DIFFERENT uid (' + ks.ownerUid + ' != ' + facts.runningUid + ') — NECESSARY only; it is still UNPROVEN that the running broker PROCESS is uid ' + ks.ownerUid + ' (the file-owner and the signer are NOT bound by this tool — attest out-of-band)');
      }
    } else {
      fail('C2-denied', 'host read denied (' + hr.errno + ') but the key OWNER is unreadable (the key directory is not traversable to the host) — the host cannot distinguish a cross-uid key from its own locked-dir key. Relax the key DIR to 0755 (the key stays 0600) so the owner is confirmable, or rely entirely on the out-of-band attestation. NOT verifiable from the host as-is.');
    }
  } else {
    fail('C2-denied', 'host read failed with ' + (hr.errno || 'unknown') + ' (not EACCES/EPERM) — the key path is a symlink/FIFO/dir/absent; cannot establish the custody leg');
  }

  // C3 — liveness: the load-bearing NON-VACUITY + functional proof. Two distinct diagnostics (architect HIGH-3).
  const sg = facts.sign || {};
  if (!sg.signed) fail('C3-liveness', 'broker returned NO signature — sudo/wiring/exec failure (check sudoers, wrapper perms, -n) or no usable key');
  else if (!sg.personaMatches) fail('C3-liveness', 'broker signed but as a DIFFERENT persona — key <-> registry mismatch (check the registered public key)');
  else pass('C3-liveness', 'broker produced a signature that verifies as the persona — a real, usable key exists behind the broker');

  // C2.5 — wrapper integrity (only if a wrapperPath was provided). A host-writable wrapper is a privesc path:
  // the host edits the script sudo execs as the broker uid → code execution as the broker uid → key exfil.
  if (facts.wrapper) {
    const w = facts.wrapper;
    if (!w.ok) note('C2.5-wrapper', 'sudo wrapper not statable (' + (w.errno || 'unknown') + ') — check the wrapperPath');
    else if (!w.isFile) fail('C2.5-wrapper', 'the sudo wrapper is not a regular file (symlink/dir) — hijackable');
    else if (w.worldOrGroupWritable) fail('C2.5-wrapper', 'the sudo wrapper is group/world-writable — the host can run code as the broker uid (privesc)');
    else pass('C2.5-wrapper', 'sudo wrapper is a regular, non-group/world-writable file');
  } else {
    note('C2.5-wrapper', 'wrapper integrity NOT checked — pass wrapperPath to enable');
  }

  // The bind-gap is UNCONDITIONAL on the passed path (VALIDATE hacker C2 / integrity!=provenance): C2 proves a
  // file is owned by a different uid; C3 proves a signer works; the tool NEVER binds the two (that the signing
  // PROCESS runs as that uid + uses that key) — only the operator can, out-of-band. So the field is named
  // `hostObservableChecksPassed`, NOT `custodyMechanismVerified`: it asserts the host-observable necessary
  // conditions hold, never that custody is verified (NS-9).
  if (denialLegTaken) {
    residuals.push('binding (out-of-band, the SOLE determiner): this tool checked only what the host uid can observe — that a key file is owned by another uid + the broker mechanism signs. It does NOT and CANNOT prove the signing PROCESS runs as that uid. Confirm out-of-band (`id`, `ls -l <key>`, `cat <key>` -> Permission denied) that the broker truly runs as the key-owner uid. ONLY that decides custody-real.');
  }
  return {
    // host-observable necessary conditions met — NOT a claim that custody is real (the host cannot observe
    // uid separation; that is the operator's out-of-band attestation, NS-7).
    hostObservableChecksPassed: verified,
    // the passed path ALWAYS needs the out-of-band uid attestation. Tracks the denial leg so the flag is set
    // whenever C2 is satisfied — the exit code can never be greener than the report.
    requiresOutOfBandUidConfirmation: denialLegTaken,
    checks,
    residuals,
  };
}

/** Gather the observed facts from real I/O (impure). */
function gatherCustodyFacts(opts = {}) {
  const { keyFile, signer, registry, personaDid, wrapperPath } = opts;
  const ruid = typeof process.getuid === 'function' ? process.getuid() : null;
  const euid = typeof process.geteuid === 'function' ? process.geteuid() : null;
  const isRoot = ruid === 0 || euid === 0;

  // C1 — lstat (path-level metadata, read-permitted on a present-but-unreadable file in a traversable dir).
  let keyStat;
  try {
    const st = fs.lstatSync(keyFile);
    keyStat = { ok: true, isFile: st.isFile(), size: st.size, ownerUid: st.uid };
  } catch (e) { keyStat = { ok: false, errno: (e && e.code) || 'EUNKNOWN' }; }

  // C2 — the open attempt (content-level). O_NOFOLLOW refuses a symlink atomically AT open (→ ELOOP);
  // O_NONBLOCK so a FIFO key path opens immediately instead of HANGING (broker-sign.js:47 learned this). A
  // successful open IS the readability signal (no read needed — avoids a FIFO EAGAIN); close immediately.
  let hostRead;
  try {
    const fd = fs.openSync(keyFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try { fs.closeSync(fd); } catch { /* */ }
    hostRead = { ok: true };
  } catch (e) { hostRead = { ok: false, errno: (e && e.code) || 'EUNKNOWN' }; }

  // C3 — the live sign probe: present a minimal P-frame body with a RANDOM nonce (mirrors assertBrokerPersona,
  // broker-client.js). The random nonce keeps the probe id un-special-caseable; declaring src_persona_did =
  // personaDid lets the probe pass a require-frame broker's persona-bind (R2-WHAT, plans/11 §1.8) so the
  // DEPLOYED verifier keeps working once require-frame is enabled. Works in BOTH modes (legacy ignores the body).
  let sign = { signed: false, personaMatches: false };
  try {
    const probeBody = { src_persona_did: personaDid, nonce: crypto.randomBytes(16).toString('hex') };
    const probe = computeRecordId(probeBody);
    const sig = typeof signer === 'function' ? signer(probe, probeBody) : null;
    if (sig) {
      sign.signed = true;
      const pub = lookupPublicKey(registry, personaDid);
      sign.personaMatches = !!(pub && verifyRecordSig(probe, sig, { publicKeyPem: pub }));
    }
  } catch { /* fail-closed — signed stays false */ }

  // C2.5 — wrapper integrity (optional). lstat (not follow) + the `& 0o022` group/world-writable bit-logic
  // from broker-sign.js:56.
  let wrapper = null;
  if (typeof wrapperPath === 'string' && wrapperPath.length) {
    try {
      const st = fs.lstatSync(wrapperPath);
      wrapper = { ok: true, isFile: st.isFile(), worldOrGroupWritable: !!(st.mode & 0o022) };
    } catch (e) { wrapper = { ok: false, errno: (e && e.code) || 'EUNKNOWN' }; }
  }

  return { isRoot, keyStat, hostRead, runningUid: ruid, sign, wrapper };
}

/** gather → assess. */
function verifyCrossUidCustody(opts = {}) {
  return assessCustody(gatherCustodyFacts(opts));
}

// ===================================== CLI (the operator runs this) =====================================

function formatReport(report) {
  const lines = [];
  for (const c of report.checks) lines.push('  [' + c.status.padEnd(4) + '] ' + c.id + ' — ' + c.detail);
  lines.push('');
  lines.push('hostObservableChecksPassed: ' + report.hostObservableChecksPassed);
  lines.push('requiresOutOfBandUidConfirmation: ' + report.requiresOutOfBandUidConfirmation);
  for (const r of report.residuals) lines.push('  residual: ' + r);
  lines.push('');
  if (report.hostObservableChecksPassed && report.requiresOutOfBandUidConfirmation) {
    lines.push('HOST-OBSERVABLE CHECKS PASSED — this is NOT a verification of custody-real. This tool cannot');
    lines.push('observe uid separation; only YOUR out-of-band check decides custody is real. Confirm that the');
    lines.push('key is owned by a genuinely DIFFERENT uid (run: `id` and `ls -l <key>` — the owner must differ');
    lines.push('from your uid; `cat <key>` must be Permission denied) AND that the broker runs as that uid.');
    lines.push('The --attested-cross-uid flag only records that YOU attested it — it changes the exit code,');
    lines.push('NOT the proof. (Custody-real is a deployment property; no flag and no green check establishes it.)');
  } else if (!report.hostObservableChecksPassed) {
    lines.push('NOT VERIFIED — a host-observable check FAILED; custody is not real here (see the FAIL line(s) above).');
  }
  return lines.join('\n');
}

const VALUE_FLAGS = { '--key': 'keyFile', '--persona': 'personaDid', '--broker-user': 'brokerUser', '--wrapper': 'wrapperPath', '--registry': 'registryFile', '--sudo': 'sudoPath' };

function parseArgv(argv, onError) {
  const die = typeof onError === 'function' ? onError : (m) => { throw new Error(m); };
  const o = { attested: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--attested-cross-uid') { o.attested = true; continue; }
    const field = VALUE_FLAGS[a];
    if (!field) { die('unknown argument: ' + a); return o; }
    // a value-taking flag must be followed by a real value — never the end of argv and never another flag
    // (so `--key --persona x` does NOT silently take "--persona" as the key path; code-reviewer F1).
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('-')) { die(a + ' requires a value'); return o; }
    o[field] = val; i++;
  }
  return o;
}

function main() {
  // lazy requires (only the CLI needs them) — keep the library import surface minimal.
  const { crossUidBrokerSigner } = require('./broker-launch');
  const { createRegistry, registerPersona } = require('./registry');
  const usage = 'usage: custody-verify --key <broker-key> --persona <did> --broker-user <user> --wrapper <abs-path> --registry <personas.json> [--sudo <abs-path>] [--attested-cross-uid]\n'
    + '  registry json: [{ "personaDid": "...", "humanUid": "...", "publicKeyPem": "..." }, ...]\n';
  const o = parseArgv(process.argv.slice(2), (m) => { process.stderr.write('custody-verify: ' + m + '\n' + usage); process.exit(2); });
  if (!o.keyFile || !o.personaDid || !o.brokerUser || !o.wrapperPath || !o.registryFile) {
    process.stderr.write(usage);
    process.exit(2);
  }
  let registry;
  try {
    const entries = JSON.parse(fs.readFileSync(o.registryFile, 'utf8'));
    registry = createRegistry();
    for (const e of entries) registerPersona(registry, e);
  } catch (e) { process.stderr.write('custody-verify: cannot load registry: ' + (e && e.message) + '\n'); process.exit(2); }

  const signer = crossUidBrokerSigner({ brokerUser: o.brokerUser, wrapperPath: o.wrapperPath, sudoPath: o.sudoPath });
  const report = verifyCrossUidCustody({ keyFile: o.keyFile, signer, registry, personaDid: o.personaDid, wrapperPath: o.wrapperPath });
  process.stdout.write(formatReport(report) + '\n');

  // F4 — the exit code is NEVER greener than the report. Exit 0 ONLY when the host-observable checks passed
  // AND the operator has explicitly attested the out-of-band uid check. (Structural invariant: a passed result
  // ALWAYS sets requiresOutOfBandUidConfirmation — the only non-fail C2 branch sets the denial leg — so the
  // `!requiresOutOfBandUidConfirmation` arm is defensive-only and never fires on a reachable path; if it ever
  // did, this gate would still demand `attested` for exit 0.)
  const clean = report.hostObservableChecksPassed && (!report.requiresOutOfBandUidConfirmation || o.attested);
  process.exit(clean ? 0 : 1);
}

if (require.main === module) main();

module.exports = { assessCustody, gatherCustodyFacts, verifyCrossUidCustody, formatReport };
