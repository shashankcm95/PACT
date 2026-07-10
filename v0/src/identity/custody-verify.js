#!/usr/bin/env node
// PACT cross-uid deployment spike — identity/custody-verify.js  (plans/09 §1)
//
// The OUT-OF-BAND custody verifier: the operator runs this AS THE HOST UID on the deployed box to check
// every custody condition the host uid can OBSERVE, and to surface the one it CANNOT (that the running
// broker PROCESS is genuinely the other uid). It NEVER asserts custody-real (NS-9, the close→narrow reflex):
// it reports `hostObservableChecksPassed` + `requiresOutOfBandUidConfirmation` (never a custody-verified /
// mechanism-verified field — that over-claim was deliberately removed, see the return below). Per NS-7, only the operator's
// out-of-band uid attestation (`id` / `ls -l`) HARDENS — the kernel's EACCES under a genuinely separate uid
// is the world-anchored signal; this tool checks the necessary (not sufficient) condition.
//
// Design (plans/09 §10): a PURE `assessCustody(facts)` (the verdict — fully testable for the cross-uid TRUE
// branch via SYNTHETIC facts, which a same-uid box can never produce) + an impure `gatherCustodyFacts` (the
// I/O). C3 (a real sign+verify round-trip) is the load-bearing NON-VACUITY proof — it proves a real, usable
// key exists behind the broker WITHOUT the host needing to read or even stat it.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verifyRecordSig } = require('../lib/edge-attestation');
const { computeRecordId } = require('../lib/record');
const { lookupPublicKey } = require('./registry');

// the denial leg counts ONLY for these (hacker F1) — any OTHER open error (ELOOP symlink / ENXIO FIFO /
// EISDIR / ENOENT) is a custody-leg ERROR, never silently treated as "denied".
const DENIAL_ERRNOS = new Set(['EACCES', 'EPERM']);

// defensive cap on the ancestor walk; path.dirname strictly shortens the string each hop, so a real path
// terminates at the root fixpoint long before this — the bound only guards against a pathological input.
const MAX_ANCESTOR_WALK = 4096;

// F3 (#79): a wrapper ancestor is TRUSTED only if it is a real directory, root-owned (uid 0), and NOT
// group/world-writable — OR a root-owned SYMLINK (a root-owned symlink cannot be repointed in place, and its
// own containing dir is checked separately as its own ancestor; a NON-root symlink is host-repointable ->
// hijack). Mirrors registry-store.js assertTrustedDirStat's SHAPE, but ACCUMULATES a verdict (custody-verify
// never throws) instead of throwing. Returns null when every ancestor is clean, else the FAIL detail for the
// FIRST bad component (fail-closed: an unstattable / non-root-symlink / special-file / others-writable /
// non-root component stops the walk). root-owned is an ALLOWLIST {0}, not a host-uid denylist, so a
// THIRD-uid-owned dir -- hijackable by that uid via rename/unlink -- also fails (VERIFY H2). The caller walks
// BOTH the RAW and the resolved chains to / (sudo re-resolves the RAW path at exec — VALIDATE HIGH), so this
// also closes the grandparent-rename + symlinked-container bypasses.
function assessWrapperChain(ancestors) {
  if (!Array.isArray(ancestors) || ancestors.length === 0) {
    return 'the wrapper ancestor chain is unavailable — cannot attest the directory chain to /';
  }
  for (const a of ancestors) {
    if (!a.ok) return 'a wrapper ancestor dir (' + a.path + ') is not statable (' + (a.errno || 'unknown') + ') — cannot attest the chain to / (fail-closed; a locked-down root-owned ancestor also yields this — verify out-of-band)';
    if (a.isSymlink) {
      if (a.ownerUid !== 0) return 'a wrapper ancestor (' + a.path + ') is a non-root-owned symlink (uid ' + a.ownerUid + ') — the host can repoint it, so sudo re-resolves to an attacker target (privesc)';
      continue; // a root-owned symlink cannot be repointed; the resolved chain covers the dirs it points into
    }
    if (!a.isDir) return 'a wrapper ancestor (' + a.path + ') is not a directory (special file) — hijackable';
    if (a.worldOrGroupWritable) return 'a wrapper ancestor dir (' + a.path + ') is group/world-writable — the host can rename/replace a descendant (grandparent-rename privesc)';
    if (a.ownerUid !== 0) return 'a wrapper ancestor dir (' + a.path + ') is not root-owned (uid ' + a.ownerUid + ') — its owner can rename the wrapper subtree (grandparent-rename privesc)';
  }
  return null;
}

/**
 * PURE verdict over observed facts. No I/O.
 * @param {{
 *   isRoot:boolean,
 *   keyStat:{ok:true,isFile:boolean,size:number,ownerUid:number}|{ok:false,errno:string},
 *   hostRead:{ok:true}|{ok:false,errno:string},
 *   runningUid:number|null,
 *   sign:{signed:boolean,personaMatches:boolean},
 *   wrapper:null
 *     |{ok:true,isFile:boolean,ownerUid:number,worldOrGroupWritable:boolean,ancestors:object[]}
 *     |{ok:false,errno?:string,pathInvalid?:boolean,reason?:string},
 *   keyDir:null|{ok:true,isDir:boolean,ownerUid:number,worldOrGroupWritable:boolean}|{ok:false,errno:string}
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

  // C2.5 — wrapper integrity (only if a wrapperPath was provided). A wrapper the host can MODIFY is a privesc
  // path: the host rewrites the script sudo execs as the broker uid -> code exec as the broker uid -> key exfil.
  // "Modify" has THREE faces, all checked here (F3 / #79): (a) the wrapper FILE is host-writable -- directly if
  // the host OWNS it (owner-write, no rename needed) or if it is group/world-writable; (b) any ANCESTOR dir up to
  // / is host-writable -- the host renames/replaces the wrapper (or a parent dir) regardless of the file's own
  // mode; (c) the wrapperPath is relative / ".."-bearing / a symlink -- it resolves to a DIFFERENT target than
  // attested. gatherCustodyFacts realpath-resolves the wrapperPath first, so the file + ancestors are the
  // RESOLVED topology. The whole leg is a SNAPSHOT (no openat in Node sync) -- see the residual on the PASS path.
  if (facts.wrapper) {
    const w = facts.wrapper;
    if (w.pathInvalid) {
      fail('C2.5-wrapper', 'the wrapperPath is ' + (w.reason === 'not-absolute' ? 'not absolute' : 'not canonical (contains "..")') + ' — refusing to attest a relative / non-canonical wrapper path (it would resolve to a different target than the one checked)');
    } else if (!w.ok) {
      fail('C2.5-wrapper', 'the sudo wrapper is absent / not statable (' + (w.errno || 'unknown') + ') — cannot attest a wrapper that is not there (a host-writable parent could let the host CREATE it)');
    } else if (!w.isFile) {
      fail('C2.5-wrapper', 'the sudo wrapper is not a regular file (symlink/dir) — hijackable');
    } else if (w.worldOrGroupWritable) {
      fail('C2.5-wrapper', 'the sudo wrapper is group/world-writable — the host can run code as the broker uid (privesc)');
    } else if (w.ownerUid !== 0) {
      fail('C2.5-wrapper', 'the sudo wrapper is not root-owned (owner uid ' + w.ownerUid + ') — its owner can rewrite the script sudo execs as the broker uid, with NO rename (privesc). chown root the wrapper.');
    } else {
      const chainFail = assessWrapperChain(w.ancestors);
      if (chainFail) {
        fail('C2.5-wrapper', chainFail);
      } else {
        pass('C2.5-wrapper', 'sudo wrapper is a root-owned, non-group/world-writable regular file, and every ancestor dir of BOTH the raw and the resolved wrapperPath to / is root-owned + not others-writable (a symlink component must be root-owned)');
        residuals.push('wrapper chain is a SNAPSHOT: C2.5 attested the wrapper file + every ancestor dir of BOTH the raw and the resolved wrapperPath to / at THIS instant via lstat. Two residual limits remain (NS-9): (1) Node sync has no openat, so this verifies the STATIC topology, NOT a post-check swap — a host who still controls a writable ancestor could rename a component AFTER this check and before sudo re-resolves the path at exec (mirrors registry-store.js:227); (2) writability is mode-based (`& 0o022`) and CANNOT see a POSIX ACL grant — verify `getfacl` out-of-band on the wrapper + its ancestor chain. Re-run immediately before arming AND confirm out-of-band.');
      }
    }
  } else {
    note('C2.5-wrapper', 'wrapper integrity NOT checked — pass wrapperPath to enable');
  }

  // C2.6 — key-directory hygiene (informational NOTE, NEVER gates the verdict). Dir-write lets the host
  // rename/replace the key FILE, but cannot READ a 0600 broker-owned key (read needs the file mode+owner, not
  // the dir), and C3-liveness already FAILs on a substituted key (persona mismatch) or a deleted key (no
  // signature). A hard-FAIL here would mass-false-alarm the NORMAL deployment (a broker-uid-owned key dir), so
  // this is a DISCLOSURE, not a gate (VERIFY board: key-dir severity = NOTE).
  if (facts.keyDir) {
    const kd = facts.keyDir;
    if (!kd.ok) note('C2.6-keydir', 'key directory not statable (' + (kd.errno || 'unknown') + ') — check the key path');
    else note('C2.6-keydir', 'key directory owner uid ' + kd.ownerUid + ', ' + (kd.worldOrGroupWritable ? 'GROUP/WORLD-WRITABLE' : 'not others-writable') + ' — a writable key dir lets the host rename/replace the key file (it cannot READ a 0600 key); C3-liveness backstops a substituted/deleted key. Attest the key dir out-of-band if it is host-writable.');
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

// F3 (#79): lstat a directory path into a fact for the ancestor walk / key-dir NOTE. lstat (NOT stat) so a
// symlinked component is reported AS a symlink (isSymlink:true, isDir:false), never followed — assessWrapperChain
// then requires it be root-owned. `& 0o022` = group/world-writable.
function statDir(dirPath) {
  try {
    const st = fs.lstatSync(dirPath);
    return { path: dirPath, ok: true, isDir: st.isDirectory(), isSymlink: st.isSymbolicLink(), ownerUid: st.uid, worldOrGroupWritable: !!(st.mode & 0o022) };
  } catch (e) {
    return { path: dirPath, ok: false, errno: (e && e.code) || 'EUNKNOWN' };
  }
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

  // C2.5 — wrapper integrity (optional). F3 (#79): validate the path is absolute + canonical BEFORE any fs op
  // (do NOT trust the launcher's validation transitively), realpath-resolve it ONCE (so a symlinked /var-style
  // path is not a false positive), then lstat the resolved FILE (ownerUid + `& 0o022` group/world-writable,
  // mirroring broker-sign.js:56) and walk EVERY resolved ancestor dir to / (statDir) for the chain check.
  let wrapper = null;
  if (typeof wrapperPath === 'string' && wrapperPath.length) {
    const notAbsolute = !path.isAbsolute(wrapperPath);
    if (notAbsolute || wrapperPath.split('/').includes('..')) {
      wrapper = { ok: false, pathInvalid: true, reason: notAbsolute ? 'not-absolute' : 'dotdot' };
    } else {
      let resolved = null;
      try { resolved = fs.realpathSync(wrapperPath); } catch { /* absent/broken link -> lstat below reports !ok */ }
      const target = resolved || wrapperPath;
      let fileFact;
      try {
        const st = fs.lstatSync(target);
        fileFact = { ok: true, isFile: st.isFile(), ownerUid: st.uid, worldOrGroupWritable: !!(st.mode & 0o022) };
      } catch (e) { fileFact = { ok: false, errno: (e && e.code) || 'EUNKNOWN' }; }
      // walk BOTH the RAW wrapperPath's ancestor chain AND the resolved target's chain to / (deduped by path).
      // sudo execs the RAW, un-resolved wrapperPath (broker-launch.js:64) and re-resolves it at EVERY exec, so a
      // symlink's OWN host-writable directory is a standing hijack surface even when the symlink points at a
      // root-owned target (VALIDATE HIGH). The RAW walk covers those literal-path dirs; the resolved walk covers
      // the canonical target's dirs (and avoids a macOS /var-style false-positive on the real file location).
      // Terminate at the dirname fixpoint; fail-closed handling lives in assessWrapperChain.
      const ancestors = [];
      const seenDirs = new Set();
      const walkAncestors = (startPath) => {
        let dir = path.dirname(startPath);
        let guard = 0;
        while (guard < MAX_ANCESTOR_WALK) {
          guard += 1;
          if (!seenDirs.has(dir)) { seenDirs.add(dir); ancestors.push(statDir(dir)); }
          const parent = path.dirname(dir);
          if (parent === dir) break; // reached the filesystem root
          dir = parent;
        }
      };
      walkAncestors(wrapperPath);                                  // the RAW path sudo actually re-resolves
      if (resolved && resolved !== wrapperPath) walkAncestors(resolved); // + the canonical target's chain
      wrapper = { ...fileFact, resolvedPath: resolved, ancestors };
    }
  }

  // C2.6 — key directory (informational NOTE only; assessCustody never gates on it). realpath so a symlinked
  // key-dir path is reported by its real location; fall back to the raw path if the key is absent/broken.
  let keyDir = null;
  if (typeof keyFile === 'string' && keyFile.length) {
    let kdTarget = keyFile;
    try { kdTarget = fs.realpathSync(keyFile); } catch { /* fall back to the raw path for the NOTE */ }
    keyDir = statDir(path.dirname(kdTarget));
  }

  return { isRoot, keyStat, hostRead, runningUid: ruid, sign, wrapper, keyDir };
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
  const { loadRegistryFile } = require('./registry-store');
  const usage = 'usage: custody-verify --key <broker-key> --persona <did> --broker-user <user> --wrapper <abs-path> --registry <personas.json> [--sudo <abs-path>] [--attested-cross-uid]\n'
    + '  registry json: [{ "personaDid": "...", "humanUid": "...", "publicKeyPem": "..." }, ...]  OR  { "personas": [...], "rootKeys": [{ "humanUid": "...", "rootPublicKeyPem": "..." }, ...] }\n';
  const o = parseArgv(process.argv.slice(2), (m) => { process.stderr.write('custody-verify: ' + m + '\n' + usage); process.exit(2); });
  if (!o.keyFile || !o.personaDid || !o.brokerUser || !o.wrapperPath || !o.registryFile) {
    process.stderr.write(usage);
    process.exit(2);
  }
  // plans/43: the ONE trusted-load path -- ownership/mode/symlink/size guard -> parse -> deserialize (personas
  // AND rootKeys). Classify the failure so the exit-2 diagnostic tells the operator WHICH fault it is.
  let registry;
  try {
    registry = loadRegistryFile(o.registryFile);
  } catch (e) {
    // Sanitize control chars (VALIDATE hacker M3): a hostile registry can embed ANSI/CR bytes in a persona DID /
    // humanUid that the registrar interpolates into its throw message; unsanitized, they reach the operator's
    // terminal and can spoof/hide the fault on a TRUST tool. Strip C0 + DEL before any stderr write.
    const msg = String((e && e.message) || '').replace(/[^\x20-\x7e]/g, '?');
    if (e && e.code === 'ERR_REGISTRY_UNTRUSTED') {
      // the file itself is not a trustworthy anchor (foreign owner / others-writable / symlink / oversized).
      process.stderr.write('custody-verify: registry-file-untrusted (' + msg + ')\n');
    } else if (e instanceof SyntaxError) {
      process.stderr.write('custody-verify: cannot load registry (unreadable / malformed JSON): ' + msg + '\n');
    } else if (e instanceof TypeError) {
      // DISTINCT from the malformed-JSON class: first-writer immutability (a CONFLICTING persona OR root row) or
      // an invalid registry shape. Name it so an operator debugging exit 2 can tell 'your JSON is broken' from
      // 'you have a conflicting row'. Same exit 2 (a config error, not a failed custody check = exit 1).
      process.stderr.write('custody-verify: registry-immutability-violation (a persona or root row conflicts with an established binding, or the registry shape is invalid -- dedup / fix the registry.json): ' + msg + '\n');
    } else {
      // fs errors (ENOENT / EACCES reading / ...) -- a load failure, not a trust or integrity verdict.
      process.stderr.write('custody-verify: cannot load registry (' + msg + ')\n');
    }
    process.exit(2);
  }

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
