// PACT v0 -- trust/registration-gate.js  (plans/39 -- the read-gate registration-provenance FILTER)
//
// The registration-provenance authorization filter that sits BETWEEN the sig-verify (read-gate.verifiedRecords)
// and the structural graph-build (convert.buildVouchGraph), inside disjointPaths -- the read-side analog of
// vouch-freshness.js. It is DISARMED BY DEFAULT: with no injected {sigmaRoots} map (every caller today -- no
// meCtx.regProvenance), it is an IDENTITY pass-through, byte-identical to the pre-plans/39 readout. It ARMS only by
// injection (PACT owns no live arm flag -- the plans/33 admission-gate idiom).
//
// ARMED, it enforces DROP-ALL-LEGACY (USER decision, plans/39): a record is KEPT only if its src_persona_did's
// sigma_root binding VERIFIES against the registry-seeded root key (via assessRegistrationFromRegistry -- the
// SAFE-DEFAULT wrapper that sources the root KEY from the frozen registry, NEVER a caller-supplied one). A persona
// absent from the injected map, unseeded, or carrying a non-verifying sigma_root is DROPPED. There is NO grandfather
// seam -- the operator arms only after their senders have migrated.
//
// NS-9: armed, this only NARROWS the ADVISORY disjoint_paths count (dropping records can hold-or-LOWER it, never
// raise it -- monotonic non-increase). convert.actionable stays hard-false; nothing gates. It NARROWS ATTACK (a)
// self-register (an unmapped self-registered persona's records drop); it does NOT CLOSE it -- a same-uid attacker
// that self-registerRoots its own human_uid + self-signs a valid sigma_root over its own binding PASSES even armed
// (the recursion: the crypto proves the root KEY authorized the binding, NEVER that the key belongs to a distinct
// real human root -- registration-provenance.js:64-66). "unanchored persona dropped" is NEVER "self-register closed".
// Only the operator's out-of-band root-key attestation HARDENS (OQ-NS-6/NS-7). The sigmaRoots map + the registry
// judge are TRUSTED non-actor deploy inputs (same posture as meCtx.freshness), read ONLY from the injected DI.

'use strict';

const { assessRegistrationFromRegistry, R3_VERIFIES } = require('../identity/registration-provenance');
const { refuseAlert } = require('../lib/refuse-alert');

// A PRESENT-but-malformed regProvenance is an ARMING-INTENT signal with a broken shape. A fail-OPEN of a security
// filter MUST be OBSERVABLE (security.md) -- so a partial arm EMITS then disarms, it is NEVER a silent pass-through.
function partialArm(cause) {
  refuseAlert('reg-partial-arm', { class: 'misconfig', cause });
  return { armed: false };
}

/**
 * Evaluate the arm signal ONCE and return the VALIDATED sigmaRoots ref (VALIDATE hacker Finding 1: a SINGLE,
 * try-wrapped read of `sigmaRoots` -- the caller must NOT re-read it off the opts, so a two-face getter [valid on
 * read 1, throws on read 2] cannot escape a second, unguarded read; the "TOTAL: never throws" contract stays true).
 * Returns { armed:true, sigmaRoots } when armed, else { armed:false }.
 * ARMED iff regProvenanceOpts is a plain object (NOT an array) whose `sigmaRoots` is itself a plain object (NOT an
 * array). ABSENT (undefined/null) -> DISARMED silently (byte-identical -- the every-caller-today path, no alert). A
 * PRESENT-but-malformed opts -> emit `reg-partial-arm` (misconfig) then disarm (F1/F2). The whole read is wrapped so
 * a hostile-Proxy opts disarms-with-alert, never throws (F3 -- total). `!Array.isArray` is load-bearing
 * (vouch-freshness.js:33): an array-shaped opts / sigmaRoots must DISARM, not arm.
 */
function evalArm(regProvenanceOpts) {
  if (regProvenanceOpts === undefined || regProvenanceOpts === null) return { armed: false }; // ABSENT -> silent disarm
  try {
    if (typeof regProvenanceOpts !== 'object' || Array.isArray(regProvenanceOpts)) return partialArm('opts-not-plain-object');
    const sigmaRoots = regProvenanceOpts.sigmaRoots;   // READ ONCE, inside the guard (Finding 1 -- no second read)
    if (!sigmaRoots || typeof sigmaRoots !== 'object' || Array.isArray(sigmaRoots)) return partialArm('sigmaRoots-not-plain-object');
    return { armed: true, sigmaRoots };
  } catch {
    return partialArm('opts-read-threw');
  }
}

/**
 * Filter a sig-verified record set to registration-ANCHORED records. DISARMED => the input array is returned
 * UNCHANGED (identity pass-through, === recs, byte-identical). ARMED => a record whose src_persona_did's sigma_root
 * binding does NOT verify (absent / unmapped / unseeded / tampered) is DROPPED (with an out-of-band refuseAlert).
 * The filter is PER-PERSONA (all record types -- "equal own-persona standing"), unlike the VOUCH-only freshness
 * filter. TOTAL: never throws.
 *
 * @param {object[]} recs  the sig-verified records from read-gate.verifiedRecords.
 * @param {object} registry  the judge source (meCtx.registry -- the SAME registry verifiedRecords used, MED-1). A
 *   null/bad registry does NOT disarm -- the judge fail-CLOSES (drop-all), never fail-open.
 * @param {{sigmaRoots:object}|undefined} regProvenanceOpts  the injected deploy-DI {personaDid -> sigmaRoot} map;
 *   absent/malformed => disarmed. Read ONLY here -- NEVER off a record.
 * @returns {object[]} recs unchanged (disarmed) or a NEW array of the anchored-kept records (armed).
 */
function filterAnchoredRecords(recs, registry, regProvenanceOpts) {
  const arm = evalArm(regProvenanceOpts);          // evaluate the arm ONCE (single, try-wrapped sigmaRoots read)
  if (!arm.armed) return recs;                     // DISARMED -- inert, no drops, byte-identical
  const sigmaRoots = arm.sigmaRoots;               // the VALIDATED ref -- NEVER re-read off the opts (Finding 1)
  if (!Array.isArray(recs)) return [];             // TOTAL: armed + a non-iterable recs -> [] (never a for..of throw)

  const out = [];
  for (const rec of recs) {
    try {
      if (!rec || typeof rec.src_persona_did !== 'string') {
        refuseAlert('reg-unanchored', { class: 'integrity', cause: 'malformed-record' });
        continue;                                  // a null/undefined/shape-broken element: DROP (never forward)
      }
      const did = rec.src_persona_did;
      // OWN-PROP ONLY (F4): never read an inherited __proto__/constructor value as a bogus sigma_root.
      const sigmaRoot = Object.hasOwn(sigmaRoots, did) ? sigmaRoots[did] : undefined;
      const prov = assessRegistrationFromRegistry(registry, { personaDid: did, sigmaRoot });
      if (prov && prov.sigmaRootChecksPassed === true) { out.push(rec); continue; } // KEEP -- binding verifies
      // DROP -- classed: a present-but-FAILING sigma_root (ONLY R3 failed) is forgery -> integrity; anything else
      // (absent/unmapped/unseeded/malformed binding) -> misconfig (the honest majority at arming = un-migrated legacy).
      // A WHITELIST, not an exclusion list (admission-gate.js:116-119): "R3 alone failed" is the ONLY forgery shape.
      const failed = (prov && Array.isArray(prov.checks) ? prov.checks : []).filter((c) => c && c.status === 'FAIL').map((c) => c.id);
      const isForgery = failed.length === 1 && failed[0] === R3_VERIFIES;
      refuseAlert('reg-unanchored', { class: isForgery ? 'integrity' : 'misconfig', sender: did, record_id: rec.record_id });
    } catch {
      // a hostile getter on rec.* threw. Do NOT touch rec.* again here -- emit class-only + DROP fail-closed
      // (the convert-DoS idiom, vouch-freshness.js:88-95). Unreachable via the JSON disk path (records parse off
      // disk, no getters); defense-in-depth for in-memory callers -- the totality claim demands it.
      refuseAlert('reg-unanchored', { class: 'integrity', cause: 'record-getter-threw' });
    }
  }
  return out;
}

module.exports = { filterAnchoredRecords };
