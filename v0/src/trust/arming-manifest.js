// PACT v0 -- trust/arming-manifest.js  (plans/54 / EPIC #96 Wave 1: the fail-closed arming preflight)
//
// THE single, fail-closed all-or-none arming preflight (ADR-0001 Decisions 1-3). It resolves the FIXED canonical
// arm-set into ONE immutable context, so a gate reads its enable state from a single auditable source instead of
// a loose meCtx key or an ad-hoc per-gate arm read. It builds the #84 (F9) PREFLIGHT PRIMITIVE (the 'no coherence
// preflight' clause). The 4 live arm sites (admission=arming-coherence, anchoring/freshness=convert presence-arms,
// broker=resolveRequireCaller) still hold their fail-open defaults until Waves 2/3 route them through this -- so
// #84's fragmentation clause is NARROWED, not closed, by this dormant wave (NS-9: narrowed is never 'closed').
//
// DORMANT (NS-9): Wave 1 is a PURE primitive with NO live consumer -- import-dark, darkness-witnessed
// (arming-manifest-darkness-witness.test.js). It arms nothing, narrows nothing, hardens nothing. Setting an arm
// flag / arming a gate is an operator-only, NS-7-gated act; nothing here flips a live gate. The admission-gate
// rewire that CONSUMES this (#82-structural) is Wave 2 (VERIFY board §7 / Q2 -- deferred so a Wave-1 gate cannot
// supply anchoring/freshness and be forced into a subset-by-omission compromise, and to keep the C1 throw->reject
// contract inside the wave that reintroduces it).
//
// THREE fail-closed properties this leaf owns (each pinned by a test in arming-manifest.test.js):
//   1. ALL-OR-NONE over a FIXED set (H1): the caller CANNOT shrink the coherence set by OMISSION. An absent
//      required signal is NOT-armed; `armed` is true ONLY when every signal in SIGNAL_SET is strictly armed. This
//      is the F9 close -- {admission:true, signing:true} with anchoring/freshness omitted is a REFUSE, never
//      armed. SIGNAL_SET is static policy, not an env read, so DI purity is preserved (values still injected).
//   2. ASYMMETRIC, TYPE-GATED parse (H2): normalizeArmSignal is the single asymmetric-parse home. A garbage token
//      (the word 'true', a typo 'ture', a bare number 1, an object) can never silently arm NOR silently disarm --
//      it is a `misconfig` that fails closed AND emits. (A bare `parseEnabledFlag`/`assessEnableFlag` reuse is
//      insufficient: the former silently disarms a non-'1' string, the latter silently non-arms a real boolean
//      AND a number -- see arm-flags.js; this leaf type-gates to close both silent holes.)
//   3. NEVER-THROWS, fail-CLOSED on an unreadable input (H3): the raw object is read inside a guarded try (never
//      destructured in the signature -- a throwing getter would throw BEFORE the body and skip the emit). Any
//      getter-throw is INDETERMINATE -> fail CLOSED (armed:false, coherent:false) + emit, never fail-open.
//
// OBSERVABILITY (security.md -- a fail-closed decision must be OBSERVABLE): every fail-closed path emits via
// refuseAlert on TWO orthogonal channels -- (a) token validity: one `arm-flag-misconfig` per garbage signal;
// (b) arm coherence: at most one top-level `arming-incoherent` (partial arm) or `arm-context-unreadable`
// (getter-throw). A clean full arm and a clean disarmed baseline emit NOTHING (no alert-spam).
//
// CONSUMER CONTRACT (load-bearing): gate ONLY on `armed`. `coherent` is DIAGNOSTIC-ONLY -- it is true on BOTH the
// fully-armed state AND the honest disarmed baseline; `disarmedBaseline` distinguishes the two. A consumer that
// gates on `coherent` would admit-all on the disarmed baseline (the fail-open trap this leaf exists to prevent).
//
// LAYERING (NS-11): trust/ may import lib/ (the trust ban is ['grounding'] only). This imports ONLY
// ../lib/arm-flags (the strict parse) + ../lib/refuse-alert (observability) -- nothing upward, no cycle. It does
// NOT import ../trust/arming-coherence: the 4-signal all-or-none strictly IMPLIES the 2-signal both-or-neither,
// so composing it is redundant; keeping them independent avoids double-emit and leaves arming-coherence.js
// byte-identical for its own consumers (admission-gate + signing-armed-mint's deliberate signing-alone staging).

'use strict';

const { parseEnabledFlag } = require('../lib/arm-flags');
const { refuseAlert } = require('../lib/refuse-alert');

// The FIXED canonical arm-set (H1). Static policy -- membership is NOT caller-supplied and NOT an env read. The
// broker caller-auth is deliberately NOT here (Q3): its tri-state (true/false/null-AUTO) has no binary
// all-or-none mapping and it is already hardened (F2/#78, F10/#85) -- it folds in a later wave, as its own decision.
const SIGNAL_SET = Object.freeze(['admission', 'signing', 'anchoring', 'freshness']);

/**
 * Normalize ONE raw arm signal to a state token (H2 -- the single asymmetric-parse home). Type-gated so neither a
 * strict string token NOR an in-process boolean can slip through a silent hole:
 *   - boolean     -> 'armed' (true) / 'disarmed' (false)          [the DI idiom admission-gate uses today]
 *   - string      -> strict parseEnabledFlag: '1'->'armed', '0'->'disarmed'; present-but-empty -> 'absent';
 *                    any other present token ('true'/'ture'/'2') -> 'misconfig'
 *   - undefined   -> 'absent'
 *   - ANY other   (number incl. 1, null, object, symbol, bigint) -> 'misconfig'
 * Pure: it type-checks the VALUE and never throws (the only throw source is the property READ, guarded by the caller).
 * @param {*} raw
 * @returns {'armed'|'disarmed'|'absent'|'misconfig'}
 */
function normalizeArmSignal(raw) {
  if (raw === undefined) return 'absent';
  if (typeof raw === 'boolean') return raw ? 'armed' : 'disarmed';
  if (typeof raw === 'string') {
    // present-but-empty (empty / ASCII-whitespace-only) is NOT a signal -- matches arm-flags' `present` semantics.
    if (raw.replace(/^[ \t]+|[ \t]+$/g, '') === '') return 'absent';
    const p = parseEnabledFlag(raw); // '1'->true, '0'->false, else->null (the strict trim semantics, reused)
    if (p === true) return 'armed';
    if (p === false) return 'disarmed';
    return 'misconfig'; // a present-but-non-strict token ('true'/'ture'/'2')
  }
  return 'misconfig'; // number (incl. 1 -- the assessEnableFlag silent hole), null, object, symbol, bigint
}

/**
 * Resolve the arm signals all-or-none into ONE immutable armed context. Fail-CLOSED, never-throws.
 * @param {*} input  a trusted deploy-wiring object of arm signals (keys in SIGNAL_SET; extra keys IGNORED). A
 *   non-object (or absent) input is the honest disarmed baseline.
 * @returns {Readonly<{armed:boolean, coherent:boolean, reason:(string|null), disarmedBaseline:boolean, hadMisconfig:boolean, signals:Readonly<object>}>}
 *   Gate ONLY on `armed`. `coherent` is diagnostic-only (true on BOTH full-arm and disarmed-baseline);
 *   `disarmedBaseline` = armedCount===0 (arm-coherence); `hadMisconfig` = any signal was a garbage token (token
 *   validity -- orthogonal to coherence, so it can be true even on the disarmed baseline).
 */
function resolveArmedContext(input) {
  // (a) GUARDED raw read (H3) -- never destructure in the signature. A throwing getter is INDETERMINATE -> fail
  //     CLOSED + emit, never fail-open. A non-object input is treated as all-absent (the disarmed baseline).
  const states = {};
  try {
    const src = (input && typeof input === 'object') ? input : {};
    for (const key of SIGNAL_SET) {
      // OWN-property read ONLY (A16 / security.md NON-BYPASSABLE): `src[key]` is a prototype-CHAIN lookup, so a
      // polluted Object.prototype would flip the disarmed baseline to armed:true via inherited signals the caller
      // never set. Object.hasOwn gates out that ambient trust; A15: keys outside SIGNAL_SET are ignored either way.
      const raw = Object.hasOwn(src, key) ? src[key] : undefined;
      states[key] = normalizeArmSignal(raw);
    }
  } catch {
    // getter-throw is INDETERMINATE -> fail CLOSED. `signals` is intentionally the EMPTY frozen set here (the read
    // never completed), unlike the three fold branches below which populate all 4 SIGNAL_SET keys -- a consumer
    // must gate on `armed`, never iterate `signals` without first checking `reason` / `armed`.
    refuseAlert('arm-context-unreadable', { class: 'integrity', cause: 'arm-getter-threw' });
    return Object.freeze({ armed: false, coherent: false, reason: 'arm-getter-threw', disarmedBaseline: false, hadMisconfig: false, signals: Object.freeze({}) });
  }

  // (b) ORTHOGONAL token-validity channel: emit one misconfig per garbage signal (independent of arm coherence),
  //     and carry the same signal in the RETURN VALUE via `hadMisconfig` so a consumer reading `disarmedBaseline`
  //     is not misled into 'clean input' when the operator plainly fat-fingered an arm token (stderr is not the
  //     only trace). `disarmedBaseline` is an arm-COHERENCE label (armedCount===0); `hadMisconfig` is TOKEN validity.
  const hadMisconfig = SIGNAL_SET.some((key) => states[key] === 'misconfig');
  for (const key of SIGNAL_SET) {
    if (states[key] === 'misconfig') refuseAlert('arm-flag-misconfig', { class: 'misconfig', flag: key });
  }

  // (c) ALL-OR-NONE fold over the FIXED set (H1). armedCount counts ONLY strictly-armed signals; absent /
  //     disarmed / misconfig all count as NOT-armed.
  const armedCount = SIGNAL_SET.reduce((n, key) => n + (states[key] === 'armed' ? 1 : 0), 0);
  const signals = Object.freeze({ ...states }); // flat string enums -> a single freeze is deep-safe

  if (armedCount === SIGNAL_SET.length) {
    return Object.freeze({ armed: true, coherent: true, reason: null, disarmedBaseline: false, hadMisconfig, signals });
  }
  if (armedCount === 0) {
    // the honest disarmed baseline: nothing armed -> coherent, NO coherence emit (byte-identical to today).
    // NOTE: disarmedBaseline:true can co-occur with hadMisconfig:true (all-garbage-token input) -- the two are
    // orthogonal channels; a consumer that wants 'clean AND disarmed' checks `disarmedBaseline && !hadMisconfig`.
    return Object.freeze({ armed: false, coherent: true, reason: null, disarmedBaseline: true, hadMisconfig, signals });
  }
  // 0 < armedCount < size: a PARTIAL arm -> incoherent, fail-closed, OBSERVABLE (the F9 close). Cause-keyed
  // (never reason-keyed): refuseAlert writes `reason` LAST/positional, so 'arming-incoherent' is authoritative
  // and the detail rides in cause/class (the egress-alert lesson, arming-coherence.js:56-57).
  refuseAlert('arming-incoherent', { class: 'misconfig', cause: 'partial-arm' });
  return Object.freeze({ armed: false, coherent: false, reason: 'partial-arm', disarmedBaseline: false, hadMisconfig, signals });
}

module.exports = { resolveArmedContext, normalizeArmSignal, SIGNAL_SET };
