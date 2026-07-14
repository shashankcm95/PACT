---
lifecycle: ephemeral
archive-after: 2026-08-15
plan: 57
epic: 96
wave: W3
issue: 83
status: BUILT (VERIFY + VALIDATE done; 902/0 green)
---

# plans/57 — W3: bind the sigma_root at registration (#83 / F8, EPIC #96)

## Context

EPIC #96 W1/W2a/W2b (MERGED #117/#118/#119) built the fail-closed arming manifest,
the admission-gate rewire, and the anchoring/freshness read-gate chokepoint. W3 is the
last buildable-SHADOW sub-issue in the cluster that is **independent + self-contained**:
`#83 (F8)` — *Unauthenticated `human_uid` at registration defeats the `rootOf`-keyed Sybil defense*.

Standing posture (unchanged): SHADOW / arms-nothing; USER merges the PR; NS-7 operator
boundary holds (this wave sets no flag, touches no `/etc/pact`, mints/installs no key).

## The defect (#83)

`registerPersona(reg, {personaDid, humanUid, publicKeyPem})` records a caller-supplied
`human_uid` with **no proof the registrant controls that root**, and `rootOf(did)` returns
it verbatim. The `sigma_root` binding that WOULD prove root-authorization exists only in the
**read-time DARK gate** — `filterAnchoredRecords` sources each persona's `sigma_root` from an
**out-of-band injected map** (`meCtx.regProvenance.sigmaRoots`), never from the registration.

The probe-confirmed fact (recon): `assessRegistrationFromRegistry` already sources **3 of the
4** sigma_root facts from the frozen registry row (`publicKeyPem` ← `lookupPublicKey`,
`controller` ← `rootOf`, `rootPublicKeyPem` ← `lookupRootKey`). **Only the `sigmaRoot` itself
is caller-supplied** — the one spoofable-at-read fact. That asymmetry IS the "binding lives
only in the DARK gate" gap.

The issue's fix has TWO parts, and the issue itself splits them:
1. **Bind persona→root via a root-signed `sigma_root` at registration (not only in the DARK
   gate).** ← W3 scope.
2. **Route ALL trust folds through the anchoring filter (fold with #F6).** ← the issue writes
   "fold with #F6"; this is the **negative-leg monotonic re-derivation** already NAMED as the
   W2b residual (routing CONTEST/SLASH/accusation legs through the per-persona anchoring filter
   silences un-anchored accusers → RAISES trust → inverts monotonic-narrow, NS-9). **NOT W3.**

## Scope decision (surface to USER at VERIFY)

W3 = **issue Part 1 only**: capture the `sigma_root` at registration + make the SHADOW
verifier source it from the frozen registry row (so the assessor is fully registry-sourced on
all 4 facts). Part 2 stays the deferred F6 residual (its own ADR-level design).

This NARROWS #83 (removes the out-of-band-map swap surface; binds authorization
first-writer-immutably at registration). It does **NOT CLOSE** it — the same-uid self-sign
recursion (a host self-generates + seeds + self-signs its own root key) stays open
(`registration-provenance.js:64-66`); full closure = the operator's **out-of-band root-key
attestation** (NS-7, operator-gated). Honest-partial, per W2b.

## Design

### D1 — capture `sigma_root` at registration (`registry.js`), RECORD-ONLY (INV-18)

`registerPersona(reg, {personaDid, humanUid, publicKeyPem, sigmaRoot})`:
- `sigmaRoot` is **optional**. If present, **boundary type-check only** (non-empty string, like
  the sibling fields) — **NO crypto verification at write** (INV-18: registry RECORDS, never an
  oracle; never rejects on trust). A malformed `sigmaRoot` (present, non-string/empty) → `TypeError`
  at the boundary, exactly as `personaDid`/`humanUid`/`publicKeyPem`.
- Store in the frozen row conditionally to preserve byte-identity for personas without one:
  `Object.freeze({ humanUid, publicKeyPem, ...(sigmaRoot !== undefined ? { sigmaRoot } : {}) })`.
- **First-writer immutability** extends to `sigmaRoot`: a re-register that would CHANGE, ADD, or
  REMOVE the `sigmaRoot` of an established row is REJECTED (fail-closed `TypeError`); an identical
  re-register (same 3-or-4 tuple) is the idempotent no-op. Rationale: a later writer must not be
  able to bind a `sigma_root` onto an established persona (the security point of the freeze). The
  conflict compare becomes exact over the full stored tuple.
- Add `lookupSigmaRoot(reg, personaDid)` → `row.sigmaRoot || null` (mirrors `lookupPublicKey` /
  `lookupRootKey`; a legacy persona without one → `null`). Export it.

### D2 — source the registration-bound `sigma_root` (`registration-provenance.js`)

`assessRegistrationFromRegistry(reg, opts)` currently reads `opts.sigmaRoot` (the injected map).
Change: source with **REGISTRY-WINS precedence**:
- If `lookupSigmaRoot(reg, personaDid)` returns a bound `sigma_root` → **use it (authoritative,
  immutable)**.
- Else fall back to `opts.sigmaRoot` (the migration path for personas registered before the field
  existed — the operator can still supply it out-of-band during migration).

**Precedence is REGISTRY-WINS, never opts-wins.** Security reason: the immutable registration
binding MUST win over the mutable injected opts, else a caller-supplied `opts.sigmaRoot` could
OVERRIDE/DOWNGRADE the registration binding — a downgrade surface. Registry-wins closes it. When a
persona has a bound `sigma_root`, `opts.sigmaRoot` is IGNORED (cannot override).

This makes the assessor **fully registry-sourced on all 4 sigma_root facts** — the elegant
completion of the existing 3-of-4 sourcing.

### D3 — persist the field (`registry-store.js`)

`serializeRegistry:64-66` maps only `{personaDid, humanUid, publicKeyPem}` — it would DROP a new
`sigmaRoot`. Update the persona-row map to carry `sigmaRoot` **conditionally** (spread only when
present) so a registry with no bound sigma_roots serializes byte-identically to today.
`deserializeRegistry` already round-trips via `registerPersona(reg, row)` (row spread carries the
field; `assertRowObject` + the row cap are unaffected). Both the object and legacy-bare-array
formats round-trip.

## Blast radius (the key VERIFY question)

`assessRegistrationFromRegistry` is called by BOTH `registration-gate.js:103` AND
`admission-gate.js:100`. Changing its sourcing (D2) therefore changes BOTH armed paths' behavior:
- **DISARMED (every caller today): byte-identical.** Both gates are identity pass-through when not
  armed; D2 only changes which `sigma_root` the assessor verifies, and the assessor is only reached
  on the ARMED path. Live behavior unchanged.
- **ARMED: provenance improves, still monotonic-narrow.** A persona registered WITH a verifying
  bound `sigma_root` anchors from its immutable registration (no injected-map entry needed); a
  bound-but-non-verifying `sigma_root` drops. Dropping is monotonic non-increase on these POSITIVE
  reads (unchanged NS-9). The board must bless that the cross-gate change is in-scope + safe.

## RED-first test plan (write failing FIRST)

`registry.test.js`:
- registerPersona captures `sigmaRoot` in the frozen row; `lookupSigmaRoot` returns it.
- a persona registered WITHOUT `sigmaRoot` → `lookupSigmaRoot` null (back-compat; row has no key).
- first-writer immutability: a re-register that CHANGES `sigmaRoot` → throws; ADDS (undefined→present)
  → throws; REMOVES (present→undefined) → throws; IDENTICAL 4-tuple → idempotent no-op.
- boundary type-check: a present non-string / empty `sigmaRoot` → `TypeError` (INV-18: type-check
  only, never a crypto verify).

`registration-provenance.test.js`:
- **#83 NARROW (the load-bearing one):** a persona registered WITH a valid bound `sigma_root`
  PASSES `assessRegistrationFromRegistry` with **NO `opts.sigmaRoot` supplied** — the binding
  travels with the registration. (A NARROW, NOT a close — the same-uid recursion stays open.)
- registry-WINS: a persona with a valid bound `sigma_root` + a DIFFERENT (bogus) `opts.sigmaRoot`
  → still PASSES on the bound one (opts cannot override / downgrade).
- migration fallback: a legacy persona (no bound `sigma_root`) + a valid `opts.sigmaRoot` → PASSES
  on the opts fallback (back-compat with the injected-map model).
- fail-closed: no bound + no opts `sigma_root` → FAIL (R1 absent).

`registry-store.test.js`:
- serialize/deserialize round-trips a bound `sigma_root`; a registry with none serializes
  byte-identically to the pre-W3 form (conditional-spread proof).

Structural (must stay green, unmodified): `sigma-root-darkness-witness`,
`registration-gate-darkness-witness`, `admission-gate-darkness-witness`,
`registration-gate-convert`, `authenticated-read` — the SHADOW/monotonic posture is preserved.

## SHADOW / NS-9 posture (honest)

- `registerPersona` still RECORDS ONLY (INV-18) — `sigma_root` is boundary-type-checked, NEVER
  crypto-verified at write, NEVER a registration reject-on-trust.
- Disarmed read behavior byte-identical; armed behavior NARROWS (monotonic non-increase) on the
  positive folds it already covers.
- **#83 NARROWED, not CLOSED** — same-uid self-sign recursion open; full close = operator
  out-of-band root-key attestation (NS-7).

## Named residuals (deferred, disclosed)

- **Issue Part 2 ("route all folds")** = the F6 negative-leg monotonic re-derivation (the W2b
  residual). An ADR-level design; NOT W3.
- **Full #83 closure** = operator out-of-band root-key attestation (NS-7, operator-gated).
- Key ROTATION of a bound `sigma_root` stays deferred (rotate via a new DID; consistent with the
  existing first-writer freeze note, `registry.js:28`).

## Runtime Probes (empirical, this session)

- **Node-cap boundary** (`node` probe against `canonicalJsonSerialize`): a persona row is 4 canonical
  nodes (obj + 3 strings), 5 with a bound `sigma_root`. `2000` no-sigma rows serialize; `2000`
  all-sigma rows THROW; the exact max all-sigma rows that serialize is **1999** (`2000*5=10000` +
  wrapper > `MAX_CANONICAL_NODES=10000`). → confirms HACKER MEDIUM-3; `MAX_REGISTRY_ROWS` must drop.
- **Sole-consumer** (grep): `authenticatedAnchoredRecords` is imported ONLY by `trust/convert.js:89`
  (already enforced by the `authenticated-read.test.js` CONTAINED monotonicity guard) — no
  negative-leg consumer, so D2's registry-wins shift is monotonic-safe today.
- **Existing own-prop closures** (read): `registration-gate.js:102` (F4), `admission-gate.js:118`
  (W2a HIGH), `registry-store.js:75` (`ownArray`) — the 3 sites the codebase already hardened; the
  new optional `sigmaRoot` reads must join them (HACKER HIGH-1).

## VERIFY board result (architect + hacker, both APPROVE-WITH-CHANGES; no redesign)

Both lenses APPROVED the design shape (D1/D2/D3 coherent, INV-18/NS-9/byte-identity preserved,
blast-radius enumeration complete, scope-honesty accurate). The board caught 3 build-blockers +
several prose/test refinements — all FOLDED below. The design shape is unchanged (no scope fork).

### BLOCKING (must fix in the build)

- **B1 — HACKER HIGH-1 (prototype pollution / inherited reads).** `sigmaRoot` is OPTIONAL, so a
  no-sigma row has NO own property and a plain `row.sigmaRoot` read falls through to
  `Object.prototype` — re-opening the sibling-read class closed 3x. ALL THREE new reads become
  own-property (`Object.hasOwn`):
  - `lookupSigmaRoot(reg, did)` → `const p = reg && reg.personas.get(did); return p && Object.hasOwn(p,'sigmaRoot') ? p.sigmaRoot : null;` (own-prop + null-safe, per ARCH NIT-5).
  - D1 conflict-compare → `(Object.hasOwn(existing,'sigmaRoot') ? existing.sigmaRoot : undefined) !== sigmaRoot`.
  - D3 serialize → `...(Object.hasOwn(row,'sigmaRoot') ? { sigmaRoot: row.sigmaRoot } : {})`.
  - RED test: pollute `Object.prototype.sigmaRoot`; assert a no-sigma persona still reads `null` /
    serializes byte-identically (mirror `registration-gate.test.js` pollution test).
- **B2 — HACKER MEDIUM-3 (row-cap recompute).** With 5-node rows an all-sigma registry at 2000
  loads but can't re-serialize (probe: max 1999). Lower `MAX_REGISTRY_ROWS` 2000 → **1900** (clean
  headroom: `1900*5=9500 < 10000`, absorbs the wrapper + a rootKeys mix + a future field), update
  the `registry-store.js:37-38` rationale comment to the 5-node worst case. RED test: `1900`
  all-sigma rows serialize; `> MAX_REGISTRY_ROWS` refused at load. (Disclose: a pre-W3 registry of
  1901-2000 no-sigma rows would now be refused at load — a v0/placeholder-fixture non-issue.)
- **B3 — HACKER MEDIUM-4 (conflict-compare sentinel).** The compare MUST use the raw `undefined`
  sentinel own-prop (B1 form), NOT `lookupSigmaRoot`'s null-normalized value (else a legit identical
  legacy re-register throws — `null !== undefined`). Structural note (hacker): a late
  undefined→present ADD cannot INJECT (set() runs only when `existing===undefined`); this is a
  conflict-DETECTION + idempotency fix. RED tests: CHANGE/ADD/REMOVE throw; identical 4-tuple +
  identical legacy no-sigma re-register idempotent; `deserialize` of a same-DID conflicting-sigma
  pair throws.

### FOLDED (prose + test refinements, no design change)

- **HACKER HIGH-2 / ARCH LOW-3 (trust-source relocation — QUALIFY + DISCLOSE).** registry-wins is
  only as trustworthy as the armed registry-population path. **The armed registry MUST be loaded
  from a trusted operator-owned file (`deserializeRegistry` over an operator registry.json), NOT
  built at runtime from unauthenticated `registerPersona`/`registerRoot` calls** — under that
  deployment invariant (the same posture as the existing root-key-squatting runbook,
  `registry.js:94-97`), registry-wins is safe. It is NOT an NS-9 violation (the armed filter still
  keeps a subset of disarmed) — it is an arming-EFFICACY trade: registry-wins removes the operator
  map's persona-level allowlist (a defense-in-depth that mattered only when registration/seeding is
  NOT fully operator-controlled — which the invariant assumes away). Opts-provenance asymmetry:
  `registration-gate` opts = the TRUSTED deploy map; `admission-gate` opts = the ATTACKER-presented
  frame field — BOTH R3-crypto-gated, which is why the shared registry-wins change is safe for both.
- **ARCH MEDIUM-1 (garbage-bound brick — DISCLOSE).** A present-but-non-verifying bound `sigma_root`
  (passes the record-only type-check, fails R3) drops/rejects the persona at BOTH gates forever,
  un-rescuable by opts (registry-wins) + un-fixable (first-writer). Fail-closed + monotonic-safe, but
  an availability foot-gun → Named residual; recommend the registration CALLER `verifySigmaRoot`
  out-of-band BEFORE binding (the registry itself must not — INV-18).
- **ARCH MEDIUM-2 (anti-downgrade test).** Add the inverse RED test: NON-verifying bound + VALID
  opts → still FAILS (opts cannot rescue a failing bound) — proves registry-wins is not a downgrade.
- **LOW-5 (type-check idiom).** Guard `sigmaRoot !== undefined && (typeof sigmaRoot !== 'string' || !sigmaRoot)` (the M1 lesson — reject `[]`/`{}`/boxed-String), not a bare falsiness test.
- **LOW-4 (migration-path reword).** opts is a PERMANENT parallel fallback, not a bridge — a legacy
  persona reaches the bound state only via a NEW DID (consistent with `registry.js:28`).
- **NIT-6 (D3 prose).** The round-trip depends on D1 adding `sigmaRoot` to `registerPersona`'s
  DESTRUCTURE (not a "row spread").
- **NIT-7 x2 (forward-compat + doc-drift).** A W3-serialized registry loaded by pre-W3 code silently
  strips the binding (monotonic-safe) → D3 residual. The deployment runbooks describe the pre-W3
  `opts.sigmaRoot` read → flag for a follow-up doc refresh (off-box, non-blocking).

### Named residuals (updated)

- Issue Part 2 ("route all folds") = the F6 negative-leg monotonic re-derivation (W2b residual).
- Full #83 closure = operator out-of-band root-key attestation (NS-7, operator-gated).
- Garbage-bound `sigma_root` bricks the persona at both gates (fail-closed, new-DID recovery).
- registry-wins removes the operator map's persona-level allowlist; safe under the operator-owned
  armed-registry deployment invariant; an attacker-bound sigma is un-correctable via the map.
- Deployment runbooks describe the pre-W3 `opts.sigmaRoot` read (doc-refresh follow-up).

**Verdict: proceed to RED-first TDD with B1/B2/B3 folded.** No scope fork — the design shape is
board-approved; the refinements harden it.

## VALIDATE board result (3-lens on the BUILT diff; all APPROVE-WITH-CHANGES; no CRITICAL, no auth-bypass)

code-reviewer (correctness) + hacker (Rule-2a live-probe) + honesty-auditor (claim-vs-evidence) all
APPROVED the built shape. The hacker's 5 live probes CONFIRMED every auth-direction defense HOLDS
(registry-wins holds; opts cannot rescue a failing bound; deserialize fail-closes on dup-DID/array-row/
`__proto__`; the 1900-row cap holds + round-trips byte-stable; #83 honestly NARROWED — the same-uid
recursion PASSES and is disclosed). The board caught ONE real class the VERIFY board + my B1 read-side
sweep MISSED, plus honesty/coverage refinements — ALL FOLDED (re-probed neutralized on the real path).

### BLOCKING (fixed + re-probed)

- **V1 — the WRITE/MINT-site own-prop gap (reviewer HIGH + hacker HIGH-1, both probe-confirmed).** B1
  hardened the three READS of the optional `sigmaRoot`, but `registerPersona`'s parameter DESTRUCTURE
  `{...sigmaRoot}` is itself a `[[Get]]` that walks the prototype chain — a polluted
  `Object.prototype.sigmaRoot` at registration time is BAKED into the frozen row as an OWN property,
  defeating every read-side guard upstream (reaches the trusted-load replay; bricks the opts-migration
  fallback; breaks serialize byte-identity). FIX: object-rest destructure + `Object.hasOwn(rest,...)`
  own-prop read at the mint. **The full "sweep ALL sibling reads" now includes the WRITE site, not just
  the reads** — the graduating self-improve signal, 12th instance.
- **V2 — the opts-destructure SIBLING (hacker MEDIUM-2).** The same class at
  `assessRegistrationFromRegistry`'s `{ sigmaRoot: optsSigma } = opts` — a direct caller omitting the
  key inherits the polluted proto, flipping R1-present on a value never supplied (corrupts the gates'
  misconfig-vs-integrity telemetry class; the 2 armed consumers pass an explicit key so are unaffected).
  FIX: own-prop both opts reads. Completes the sweep.
- **V3 — test OVERCLAIM (honesty MEDIUM-1).** A test was named `W3 #83 CLOSE`, contradicting the wave's
  NARROW-not-CLOSE scope (a leak into a #83 close-comment would falsely assert the Sybil defense
  complete). Renamed to `W3 #83 NARROW`; plan wording `close`→`narrow`.

### FOLDED (tests + prose)

- 2 new RED tests: pollute-BEFORE-register (mint-site own-prop) + pollute + identical no-sigma
  re-register stays idempotent (conflict-compare own-prop, both sides — honesty LOW-4 coverage).
- JSDoc `@param` gains `sigmaRoot?:string` (reviewer LOW). Comment tightened: "all 4 facts" → "for a
  BOUND persona; a legacy persona sources sigma from the opts fallback" (honesty LOW-3). Frontmatter
  status → BUILT (honesty LOW-2). Golden-string byte pin (honesty NIT-5) — SKIPPED (the cap +
  pollution tests already guard byte-identity; KISS).

### New residual (disclosed)

- **Pre-existing REQUIRED-field inherited-read** (reviewer, out-of-scope): the signature destructure of
  `personaDid`/`humanUid`/`publicKeyPem` is ALSO inherited-vulnerable, but only on an already-malformed
  row (a MISSING required field) — a narrow, pre-existing (not W3-introduced) gap, deliberately left
  out of #83's scope. Same class at the opts `personaDid` read (own-prop'd for parity, fail-closed
  regardless). Named here rather than silently left.

Re-probe (against the FIXED code): all 3 exploits (mint leak / load-path brick / opts-omitted) return
`null`/`FAIL` — neutralized. Full suite 902/0, eslint clean. **VALIDATE closed — proceed to pre-PR
CodeRabbit + PR.**
