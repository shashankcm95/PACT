// PACT P2 -- trust/vouch-freshness.js  (plans/36 W2 -- the read-gate freshness FILTER)
//
// The freshness authorization filter that sits BETWEEN the sig-verify (read-gate.verifiedRecords) and the
// structural graph-build (convert.buildVouchGraph), inside disjointPaths. It is DISARMED BY DEFAULT: with no
// deploy-constant {now, ttlMs} injected (every caller today -- no meCtx.freshness), it is an IDENTITY
// pass-through, byte-identical to the pre-W2 readout. It ARMS only by injection (PACT owns no live arm flag --
// the plans/33 admission-gate idiom).
//
// ARMED, it enforces the H1 AUTHORIZATION POST-CONDITION: a VOUCH is KEPT only if it AFFIRMATIVELY presents a
// well-formed, in-window payload.freshness object. no-freshness => DROP (NEVER skip-when-absent -- the "reject a
// token missing exp" analog; security.md exact-set post-condition). A DROP contributes 0 edges; it is NEVER a
// throw (the filter faces attacker-controlled store bytes and must be TOTAL -- a throw would propagate through
// buildVouchGraph and DoS the whole convert readout, the exact failure agentStakeAxis guards at convert.js:104).
//
// NS-9: armed, this only NARROWS the ADVISORY disjoint_paths count (dropping edges can hold-or-LOWER it, never
// raise it -- monotonic non-increase). convert.actionable stays hard-false; nothing gates. It NARROWS replay
// (drops edges outside the <=TTL window); it does NOT HARDEN trust -- a same-uid attacker co-forges its OWN
// fresh VOUCH under its OWN key and it PASSES (integrity != provenance, #273). Only a deployed cross-uid signer
// hardens. {now, ttlMs} are read ONLY from freshnessOpts (the injected deploy DI), NEVER from a record.

'use strict';

const { checkFreshnessWindow, isValidNonce } = require('../lib/edge-freshness');
const { refuseAlert } = require('../lib/refuse-alert');

/**
 * ARMED iff freshnessOpts is a PLAIN object (not an array) carrying a finite-number `now` AND a finite-number
 * `ttlMs > 0` (mirrors checkFreshnessWindow's own bad-ttl guard -- a non-finite/non-positive ttlMs would neuter
 * the window). Any other shape => disarmed. `!Array.isArray` is load-bearing (VERIFY-hacker F4): an array with
 * string-keyed now/ttlMs must DISARM, not arm.
 */
function isArmed(freshnessOpts) {
  if (!freshnessOpts || typeof freshnessOpts !== 'object' || Array.isArray(freshnessOpts)) return false;
  const { now, ttlMs } = freshnessOpts;
  return typeof now === 'number' && Number.isFinite(now)
      && typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0;
}

/**
 * Filter a sig-verified record set to fresh VOUCHes. DISARMED => the input array is returned UNCHANGED (identity
 * pass-through, byte-identical). ARMED => stale / future / no-freshness / malformed-freshness VOUCHes are DROPPED
 * (with an out-of-band refuseAlert); non-VOUCH records pass through untouched (freshness is not their concern --
 * SRP; buildVouchGraph already ignores non-VOUCH). TOTAL: never throws.
 *
 * @param {object[]} recs  the sig-verified records from read-gate.verifiedRecords.
 * @param {{now:number, ttlMs:number}|undefined} freshnessOpts  the DEPLOY-CONSTANT window (meCtx.freshness);
 *   absent/malformed => disarmed. now/ttlMs are read ONLY here -- NEVER off a record.
 * @returns {object[]} recs unchanged (disarmed) or a NEW array of the fresh-kept records (armed).
 */
function filterFreshVouches(recs, freshnessOpts) {
  if (!isArmed(freshnessOpts)) return recs;              // DISARMED -- inert, no drops, no alerts, byte-identical
  const { now, ttlMs } = freshnessOpts;
  if (!Array.isArray(recs)) return [];                   // TOTAL (CodeRabbit): armed + a non-iterable recs must not
                                                         // throw at `for...of` (OUTSIDE the per-record try/catch).
                                                         // Fail CLOSED to [] (no records -> no edges) rather than
                                                         // forward a non-array to buildVouchGraph (which would throw).
                                                         // Unreachable live (verifiedRecords always returns an array);
                                                         // the totality contract demands it -- symmetric with the
                                                         // null-element + hostile-getter guards below.

  const out = [];
  for (const rec of recs) {
    try {
      if (!rec) {                                                           // a null/undefined element: DROP -- do NOT
        refuseAlert('malformed-freshness', { class: 'integrity' });        // forward it to buildVouchGraph, which throws
        continue;                                                          // on a null r.type (VALIDATE code-reviewer:
      }                                                                     // symmetric with the F1 catch -- unreachable
      if (rec.type !== 'VOUCH') { out.push(rec); continue; }               // via the live path, but the totality claim
      const payload = rec.payload;                                         // demands it; a non-VOUCH passes through).
      if (!payload || typeof payload !== 'object') { out.push(rec); continue; } // degenerate VOUCH -- 0 edges anyway
      const fr = payload.freshness;
      if (!fr || typeof fr !== 'object' || Array.isArray(fr)) {
        refuseAlert('no-freshness', { class: 'misconfig', sender: rec.src_persona_did, record_id: rec.record_id });
        continue;                                                            // DROP -- absent/non-object freshness
      }
      const approvedAt = fr.approved_at;                                     // snapshot ONCE (C1 read-twice guard)
      const nonce = fr.nonce;
      if (typeof approvedAt !== 'number' || !Number.isFinite(approvedAt) || !isValidNonce(nonce)) {
        refuseAlert('no-freshness', { class: 'misconfig', sender: rec.src_persona_did, record_id: rec.record_id });
        continue;                                                            // DROP -- shape-malformed freshness
      }
      const w = checkFreshnessWindow({ approvedAt, nonce, now, ttlMs });     // now/ttlMs from the DEPLOY, not rec
      if (!w.fresh) {
        refuseAlert('stale-or-future', { class: 'integrity', sender: rec.src_persona_did, record_id: rec.record_id, reason_detail: w.reason });
        continue;                                                            // DROP -- outside the <=TTL window
      }
      out.push(rec);                                                         // KEEP -- fresh, well-formed VOUCH
    } catch {
      // a hostile getter on rec.* threw (F1). Do NOT touch rec.* again here -- it may re-throw OUTSIDE
      // refuseAlert's own guard and escape this catch. Emit class-only + DROP fail-closed. (Unreachable via the
      // JSON disk path -- listByReceiver parses records off disk and JSON carries no getters -- so this is
      // defense-in-depth for in-memory callers; the totality claim still demands it.)
      refuseAlert('malformed-freshness', { class: 'integrity' });
      continue;
    }
  }
  return out;
}

module.exports = { filterFreshVouches };
