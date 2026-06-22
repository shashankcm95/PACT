---
lifecycle: persistent
created: 2026-06-22
wave: R2-deep (per-request auth — the WHAT axis)
status: PLAN (pre-VERIFY)
---

# Per-request auth (R2 deep) — the broker signs only a record_id it can RECOMPUTE from a presented P-frame body (SHADOW)

> The honestly-named residual from R2's WHO wave (`plans/10`). R2-WHO narrowed *who* may call the
> broker (uid allowlist on `SUDO_UID`). This wave narrows *what* may be signed: today an allowlisted
> caller obtains `sign_P(X)` for an **arbitrary 64-hex X** — the broker is a blind signing oracle. All
> SHADOW (gates no action). Anchor: PACT-NORTH-STAR §2.6 / NS-2 / NS-9.

## §0 Honest scope (read first — it bounds the DoD)

The broker holds **one persona P's** key and signs over an **opaque 64-hex** `record_id`: it reads argv +
hex64-gates (`broker-sign.js:52-53`) then the actual `crypto.sign(null, Buffer.from(recordId,'utf8'), key)`
runs in the crypto leaf (`edge-attestation.js:82`). Because `record_id`
is a **preimage-resistant content-address** (`computeRecordId` = sha256 of the canonical frame body minus
`{record_id, sig}` — `record.js:52`), the broker **structurally cannot** tell a well-formed PACT frame's
hash from any other 64-hex string. So per-request auth REQUIRES the broker see the **frame preimage**, not
just the hash. That is the whole shape of this wave.

**What this wave NARROWS (the non-vacuous core — VERIFY board ruled BUILD, §9):** converts the broker from
"signs any 64-hex" to "signs only `record_id`s it can recompute from a presented frame body that declares
**its own** persona." The broker will not lend P's signature to a hash whose preimage the caller cannot
reveal as a P-frame (narrows chosen-opaque-value / cross-protocol-reuse / confused-deputy). The board
split the honesty register (architect Q1; do NOT lump both halves as "near-vacuous"):
- **recompute-bind is non-vacuous TODAY**, single-uid single-persona. The operator's legitimate authority
  is "build *well-formed P-frames*"; the blind oracle additionally grants "`sign_P(X)` for an arbitrary
  64-hex with **no revealed preimage**" — a strictly larger, strictly more dangerous capability (enables
  cross-protocol signature reuse if P's key ever signs a 64-hex elsewhere; a chosen-hash confused deputy).
  recompute-bind removes exactly that surplus. Genuine domain separation, load-bearing now.
- **persona-bind is LOAD-BEARING, not defense-in-depth** (hacker CRITICAL, live-probed): `computeRecordId`
  does NOT throw on a persona-less array/scalar (`computeRecordId([1,2,3])` -> a valid 64-hex), so the
  persona-bind gate is the ONLY thing stopping a non-P / non-frame body from being signed. It is the
  closure gate, and its both-operands-non-empty-string check is therefore security-critical (§1.3).

**What this wave does NOT close (LOUD residuals — NS-9, do not let any summary call these closed):**
- **Single-operator payload authority.** The entitled operator of P can still make P assert ANY *payload*
  (that is their legitimate authority). present-the-frame binds the signed hash to a well-formed P-frame;
  it does NOT bound WHAT P claims. The marginal gain over the operator's existing authority is exactly the
  no-revealed-preimage surplus above — real, but it does not make the operator "answerable for content."
- **Payload-semantics ceiling.** Per-request auth does NOT bound WHAT P may *claim* — only that the signed
  hash is a well-formed P-frame. "Which claims may P make" is policy / U2, untouched here.
- **persona-did is NOT cryptographically bound to the held key, broker-side.** `PACT_BROKER_PERSONA_DID`
  (below) is a *policy declaration*; only the host-side `assertBrokerPersona` round-trip
  (`broker-client.js:82`) actually proves the broker keys P. A misconfigured persona-did fails CLOSED
  (refuses legit frames) or is caught downstream at `receiveFrame` (sig verifies under the wrong key →
  `bad-signature`). integrity != provenance (NS-2). Loud residual; not closed here.
- **R2 multi-persona / capability-token frontiers** stay UNBUILT (§2 alternatives).

## §1 The design (VERIFY-folded — the board's CRITICAL/HIGH findings are baked in; see §9)

A broker mode `PACT_BROKER_REQUIRE_FRAME` that requires the **frame preimage** and binds the signature to
it. **DEFAULT-ON gated on `PACT_BROKER_PERSONA_DID` presence** (Q5, architect HIGH + hacker MED): on a box
that opted into R2-WHAT (persona-did set), require-frame is ON unless explicitly `=0`; a *dropped*
`PACT_BROKER_REQUIRE_FRAME` env therefore fails CLOSED (refuse), never silently reopens the blind oracle. A
box with no persona-did set stays legacy (loud notice). The flag is parsed by a STRICT allowlist
(`enabled = trim(env) === '1'` for the explicit-on form; `=0` is the only disable token) — NEVER `!!env`
(hacker MED: `"0"`/`"false"`/`"  "` are all truthy strings).

1. **Present-the-frame channel = the broker child's STDIN** (today `stdio[0]='ignore'`,
   `broker-client.js:65` — no stdin path exists, so this is purely additive). The host serializes the
   frame **preimage body** (`withKey`) to JSON and writes it on stdin; `record_id` stays the final argv.
   Rationale for stdin over argv: keeps the body off the process table / `ps` and off `ARG_MAX`. **The
   broker drains stdin to EOF BEFORE any gate that can `process.exit`** (hacker MED EPIPE: the host's
   `input:` write must complete even on a refuse path, else `execFileSync` throws EPIPE on the host). Legacy
   mode never reads stdin (`stdio[0]` stays `'ignore'` when no body is passed).
2. **Recompute-bind (a core closure).** The broker reads stdin under a **hard MAX_BYTES cap AND a wall-clock
   read deadline** (hacker HIGH: a byte cap bounds VOLUME, not TIME — a directly-invoked broker on a
   never-EOF slow-loris pipe hangs forever; `fs.readFileSync(0)` is unbounded — FORBIDDEN). Cap reached
   before EOF -> refuse WITHOUT parsing; deadline hit -> refuse; zero-byte -> refuse. Then `JSON.parse`s it,
   **rejects a non-plain-object (array/scalar/null) body** (hacker CRITICAL #2), computes `id' =
   computeRecordId(parsed)`, and **signs `id'`, never the caller-asserted argv id; `parsed.record_id`/`sig`
   are IGNORED entirely** (architect HIGH; `computeRecordId` strips them — verified). The argv id must equal
   `id'` (else refuse). Malformed JSON / a depth-bound throw -> refuse (fail-closed).
3. **Persona-bind gate (LOAD-BEARING — NOT defense-in-depth; hacker CRITICAL).** Require BOTH operands to be
   **non-empty strings** before equality: `typeof brokerPersonaDid === 'string' && brokerPersonaDid.length
   && typeof parsed.src_persona_did === 'string' && parsed.src_persona_did === brokerPersonaDid`. In
   require-frame mode an **unset/empty `PACT_BROKER_PERSONA_DID` FAILS CLOSED (refuse all)** — never
   `undefined === undefined` / `"" === ""` authorize (hacker CRITICAL #1). No case-fold / no trim on the
   persona compare (exact bytes).
4. **A1 normalization (architect CRITICAL, live-probed).** `canonicalJsonSerialize` emits `undefined`,
   `null`, and omitted as THREE distinct hashes; only `undefined` fails the JSON round-trip
   (`computeRecordId({payload:undefined})` != `computeRecordId(JSON.parse(JSON.stringify(...)))`). So
   `buildFrame` MUST strip `undefined`-valued top-level keys from `withKey` BEFORE computing `record_id`
   (the only undefined-able key is `payload`; `config_hash`/`t` are already conditional — frame.js:31-32).
   SAFE: every existing frame passes a defined `payload`; no test asserts a payload-less hash literal;
   build+receive stay self-consistent (both hash the normalized body). This makes the host->wire->broker
   round-trip an identity for all bodies.
5. **Pure decision core, impure shell** (mirrors `caller-auth.js`). New `request-auth.js` exporting PURE
   `authorizeRequest({ presentedBodyRaw, claimedRecordId, brokerPersonaDid, requireFrame })` ->
   `{ decision:'allow'|'deny'|'disabled', reason, recordIdToSign }`, with two SEPARATELY-tested named
   predicates inside (architect MED): `recomputeBinds(parsedBody, claimedId)` and `personaBinds(parsedBody,
   brokerPersonaDid)` — so the multi-persona extension extends persona-bind without touching recompute-bind.
   `broker-sign.js` does the bounded I/O and calls it. Unit-testable without spawning.
6. **Order in `main()`:** drain stdin -> (0) R2-WHO caller-auth (unchanged) -> (0.5) **R2-WHAT
   request-auth (new)** -> (1) hex64 argv gate -> (2) key open -> (3) sign `recordIdToSign`. Request-auth
   runs BEFORE the key open so an unauthorized request never touches the TOCTOU/key surface.
7. **Seam-widening = additive optional 2nd param** `signer(recordId, body?)`. `signRecordId(recordId, opts,
   body?)` threads it; `buildFrame` passes the normalized `withKey`. Every in-process signer (`resolveSigner`'s
   closure, test signers) **ignores the 2nd arg** — back-compat by construction (Open/Closed). Crucially
   **frame.js / edge-attestation.js stay broker-AGNOSTIC** (they pass an opaque body object, no broker
   reference) so the broker.test.js:117 no-coupling tripwire stays GREEN.
8. **Liveness probes must present a frame** (architect MED, required for require-frame to coexist with the
   deployed verifier). `assertBrokerPersona` (broker-client.js:82) and `custody-verify` C3 (custody-verify.js:160)
   today sign a BARE random 64-hex probe -> under require-frame the broker refuses it. Fix: the probe presents
   a minimal well-formed P-frame body `{src_persona_did: <brokerPersona>, nonce: <random>}` (the random nonce
   keeps `id'` unpredictable, preserving the F2 anti-special-casing property) and verifies the sig over `id' =
   computeRecordId(probeBody)`. Works in BOTH modes (legacy ignores the body). Without this, enabling
   require-frame breaks the deployed custody verifier.

## §2 Alternatives considered (and why deferred, not chosen)

- **uid -> persona policy MAP** (extend R2-WHO's allowlist to `uid -> {personas}`). Load-bearing ONLY for a
  **multi-persona** broker (one key-store, several persona keys, per-uid entitlement + key SELECTION). The
  deployed broker is single-key/single-persona, so the map collapses to "the one allowlist -> the one
  persona" = vacuous today. **Deferred** as the named multi-persona frontier; present-the-frame is its
  prerequisite (persona selection == a content-level entitlement check).
- **Capability token** (a human-root-signed grant: "uid U may obtain P's sig over frames matching C").
  Real cross-party entitlement, but needs a minting authority + key + token format + revocation — the root
  key custody problem one level up. Over-engineered for SHADOW (YAGNI). **Deferred** as the cross-party
  frontier.
- **Domain-tag the signature** (`sign(H(tag || record_id))`). Cheaper domain separation but changes the
  signature scheme (verify side too) and gives **no persona-binding**. Rejected: present-the-frame
  subsumes it and stays within the existing ed25519-over-record_id scheme.

## §2.5 The open questions — RESOLVED by the VERIFY board (§9)

- **Q1 (vacuity).** RESOLVED **BUILD the core** (architect+hacker concur). recompute-bind is non-vacuous
  TODAY (domain-separation + chosen-hash closure, independent of multi-persona); persona-bind is
  LOAD-BEARING now (hacker proved `computeRecordId` signs persona-less bodies). §0 honesty split accordingly.
- **Q2 (seam).** RESOLVED right cut. All 3 existing `signer(recordId)` call sites confirmed unaffected by
  the optional 2nd arg; frame.js/edge-attestation.js stay broker-agnostic -> the no-coupling tripwire holds.
- **Q3 (stdin round-trip).** RESOLVED via the **A1 normalization** (§1.4): `undefined`-key strip makes
  `JSON.parse -> computeRecordId` an identity; all divergences fail CLOSED. PROBED, not reasoned.
- **Q4 (id provenance).** RESOLVED sign the COMPUTED id; ignore `parsed.record_id`/`sig`; argv mismatch refuses.
- **Q5 (downgrade).** RESOLVED **default-ON gated on `PACT_BROKER_PERSONA_DID` presence** + strict `=== '1'`
  flag parse (§1 head). A dropped env on an R2-WHAT box fails CLOSED.

## §3 Files

| File | Change |
|---|---|
| `v0/src/identity/request-auth.js` | NEW — pure `authorizeRequest(...)` with two named, separately-tested predicates `recomputeBinds` + `personaBinds`; strict flag parse; reject non-plain-object; both-operands-non-empty-string persona check. Mirrors `caller-auth.js`. |
| `v0/src/identity/broker-sign.js` | NEW gate (0.5): drain stdin (MAX_BYTES + read deadline) BEFORE the exit-capable gates -> `authorizeRequest` -> sign the computed id. Default-on-when-persona-set; loud DISABLED notice on the legacy path. Update `HONEST SCOPE` header (broker-sign.js:11, spaced not hyphenated) (R2-WHAT narrowed, residuals verbatim). |
| `v0/src/identity/broker-client.js` | `brokerSigner` returns `sign(recordId, body?)` -> serialize + write on the child's stdin (`stdio[0]='pipe'`, `input:`) when body present; back-compat when absent. `assertBrokerPersona` liveness presents a minimal P-frame body (§1.8). |
| `v0/src/lib/edge-attestation.js` | `signRecordId(recordId, opts, body?)` threads the optional body to `signer(recordId, body)`. resolveSigner's closure ignores it. Stays broker-agnostic. |
| `v0/src/frame/frame.js` | `buildFrame` strips `undefined`-valued top-level keys from `withKey` (A1), then passes the normalized body to `signRecordId`. Stays broker-agnostic. |
| `v0/src/identity/custody-verify.js` | C3 liveness presents a minimal P-frame body (§1.8) so the deployed verifier still passes against a require-frame broker. |
| `docs/deployment/cross-uid-broker.md` | NEW section: `PACT_BROKER_REQUIRE_FRAME` (default-on semantics) + reuse `PACT_BROKER_PERSONA_DID` in the wrapper; flip-test. |
| `v0/test/unit/request-auth.test.js` | NEW — pure `authorizeRequest` + each predicate (allow/deny/disabled; recompute mismatch; persona mismatch; **both-null persona bypass**; non-plain-object/array; oversized/malformed; embedded record_id/sig stripped; strict-flag `"0"/"false"/"  "`). |
| `v0/test/unit/broker.test.js` | Integration: spawn broker-sign with a presented body (match / argv-mismatch / persona-mismatch / persona-unset-fails-closed / no-body-in-require / zero-byte / oversized / mode-off legacy). |
| `v0/test/unit/custody-verify.test.js` | C3-presents-a-frame under a require-frame signer (liveness still passes). |

## §4 Threat model (the hacker lens pressure-tests; live-re-probe at VALIDATE per Rule 2a)

- **T1 body/argv-id mismatch** — present body hashing to id' != argv id -> MUST refuse (never sign argv).
- **T2 foreign-persona frame** — body.src = Q while broker keys P -> persona-bind refuses (and receiveFrame
  would too). Probe both legs.
- **T3 stdin flood** — multi-MB stdin -> bounded read -> refuse (no OOM / no hang).
- **T4 malformed JSON** — refuse (fail-closed, no throw to the caller).
- **T5 self-asserted id/sig fields** — body carries `record_id`/`sig` -> `computeRecordId` strips them ->
  binds to the true preimage (no laundering a chosen id through an embedded field).
- **T6 downgrade** — require-frame env dropped -> does it fail OPEN to blind-oracle? (Q5; the wrapper must
  set it; board rules on default-on.)
- **T7 short-read / partial pipe** — broker must read stdin to EOF before parse (no truncated-body parse).
- **T8 canonical drift** — a body that round-trips through JSON but canonicalizes differently host-vs-broker
  -> legit-sign fails closed (acceptable) but must never let a DIFFERENT body sign the same id.

## §5 Test plan (TDD — write first, red, then green)

Pure `authorizeRequest`: disabled (require-frame off) / allow (body hashes to claimed id, persona matches) /
deny: recompute-mismatch, persona-mismatch, oversized, malformed-JSON, non-object body, missing
src_persona_did, embedded record_id/sig stripped-and-still-bound. Integration (spawn): presented-body match
signs the computed id and verifies under P's key; argv/body mismatch refuses with empty stdout; persona
mismatch refuses; no-body-in-require-mode refuses; mode-off path still signs hex-only + emits the loud
notice. Back-compat: every existing broker/frame/minter test stays green (the optional 2nd param is inert).

## §6 Runtime Probes (verified against the repo at PLAN-TIME — not memory)

> **Line numbers are the PRE-BUILD snapshot** (probed when this plan was written, before the gate code
> landed). The build intentionally shifted `broker-sign.js` (the new stdin-drain + gate (0.5) pushed the
> argv/`isHex64` path down) and added lines to `broker-client.js`/`custody-verify.js` (the liveness-probe
> change). Post-build the loci moved (`broker-sign.js` argv+`isHex64` -> ~100/114; `broker-client.js` signer
> call -> ~99; `custody-verify.js` -> ~165; the `edge-attestation.js:80` resolveSigner closure is unchanged).
> P1 in particular documents the PRE-build blind-oracle the wave CHANGED; read it as the motivating state.
> (CodeRabbit PR #6 Major flagged the decay — a stale-line-number is the decay class the discipline
> names; the probes' FACTS still hold, only the line numbers moved.)

- **P1** broker signs an opaque 64-hex, no preimage: `broker-sign.js:52-53` (`argv[2]` -> `isHex64`) +
  `edge-attestation.js:82` (`crypto.sign(null, Buffer.from(recordId,'utf8'), key)`). CONFIRMED.
- **P2** `computeRecordId` strips `{record_id, sig}`, is pure + importable from `lib/record`, depth-bounded
  (throws): `record.js:52-60`. CONFIRMED — recompute path is fail-closed-able.
- **P3** signer seam is `signer(recordId)` at 3 call sites only (`broker-client.js:89`,
  `custody-verify.js:160`, the resolveSigner closure `edge-attestation.js:80`); `buildFrame` ->
  `signRecordId(record_id, signerOpts)` -> `signer(recordId)`. Widening to an optional 2nd arg is additive.
  CONFIRMED.
- **P4** broker child has NO stdin path today (`stdio: ['ignore','pipe','ignore']`, `broker-client.js:65`);
  adding stdin is purely additive. CONFIRMED.
- **P5** `minter.mint` is bound to ONE persona/root + rejects a binding override (`minter.js:61-73`); the
  broker is persona-agnostic in code but single-persona in deployment (`assertBrokerPersona`,
  `broker-client.js:82`). CONFIRMED — single-persona is the deployed shape (grounds Q1).

## §7 DoD

- [ ] `authorizeRequest` pure + fully unit-tested (allow/deny/disabled + all T-cases).
- [ ] broker recompute-binds + persona-binds in require-frame mode; signs the COMPUTED id; loud notice when off.
- [ ] seam widened additively; ALL existing tests green (back-compat proven, not assumed).
- [ ] hacker live-re-probes the BUILT broker (T1-T8) at VALIDATE — green TDD is NOT proof (Rule 2a).
- [ ] runbook documents the default-on semantics; the §0 residuals appear as NAMED PHRASES (the spaced-prose
      form, NOT kebab tokens) in broker-sign.js's `HONEST SCOPE` header (broker-sign.js:11) AND in
      `_SESSION-RESUME.md` -- the greppable phrases are "single-operator payload authority" /
      "payload-semantics ceiling" / "NOT cryptographically bound to the held key" / "integrity != provenance"
      (CodeRabbit honesty: the kebab form "single-operator-payload-authority" does NOT grep -- claim corrected
      from "VERBATIM" to "named phrases"); no summary line uses "closes" for this wave (honesty HIGH).
- [ ] full gate green (`npm test` + eslint, ASCII-only) + CodeRabbit real-surface clean.

## §8 Anchor check (north-star §6 pre-flight)

- NS-2 integrity != provenance: the persona-did policy residual is named LOUD (§0).
- NS-7 narrows-not-hardens: this NARROWS WHAT-can-be-signed; it does not HARDEN trust (no world-anchored act).
- NS-8/9 SHADOW + close->narrow reflex: gates nothing; residuals carried, none called "closed."

## §9 VERIFY board (pre-build) — RECORDED 2026-06-22

3-lens parallel board (read-only personas) against the pre-fold plan. All findings folded above.

**architect — VERDICT BUILD-WITH-CHANGES** (Q1 = BUILD the core):
- [CRITICAL] round-trip fidelity: serialize the EXACT normalized `withKey`; `JSON.stringify` drops
  `undefined`-valued keys -> recompute mismatch -> bricks legit payload-less signing. FOLD §1.4 (A1 strip)
  + the live probe. **PROBED: confirmed real** (`computeRecordId({payload:undefined})` != JSON round-trip).
- [HIGH] sign `argv === computeRecordId(parsed)`; IGNORE `parsed.record_id` entirely. FOLD §1.2.
- [HIGH] Q5: require-frame DEFAULT-ON once R2-WHAT config present; dropped env -> narrower capability. FOLD §1 head.
- [MED] `assertBrokerPersona`/custody-verify liveness probe (bare hex) refuses under require-frame -> present
  a minimal P-frame body. FOLD §1.8.
- [MED] split the pure core into `recomputeBinds` + `personaBinds`. FOLD §1.5.
- [MED] stdin: read-to-EOF + hard MAX_BYTES + read DEADLINE (slow-loris). FOLD §1.2.

**hacker — VERDICT BUILD-WITH-CHANGES** (blind-oracle closed; no preimage shortcut; T5/proto-pollution handled):
- [CRITICAL] persona-bind `undefined===undefined` / `""===""` bypass: persona-less body + unset/empty env ->
  gate passes. FOLD §1.3 (both-operands-non-empty-string; unset env fails CLOSED). **PROBED: confirmed.**
- [HIGH] persona-bind is LOAD-BEARING not DiD: `computeRecordId([1,2,3])`/`{}` return valid 64-hex, don't
  throw -> reject non-plain-object body. FOLD §0 + §1.2/§1.3. **PROBED: confirmed.**
- [HIGH] slow-loris stdin hang: byte cap bounds VOLUME not TIME; `readFileSync(0)` unbounded. FOLD §1.2 (deadline).
- [MED] downgrade fails OPEN; `"0"/"false"/"  "` truthy -> strict `=== '1'` parse. FOLD §1 head.
- [MED] host-side EPIPE if child exits before draining stdin -> drain BEFORE exit-capable gates. FOLD §1.1/§1.6.
- [LOW] NFC/number-form fail CLOSED (acceptable); pin the wire encoder; no second canonical encoder. FOLD §1.4.
- Confirmed HANDLED (don't over-engineer): T1 (argv mismatch), T4 (malformed JSON), T5 (embedded id/sig
  stripped — PROBED), `__proto__` benign (no prototype pollution from `JSON.parse`).

**honesty-auditor — VERDICT HONEST-WITH-FIXES** (matches plans/10's bar after fixes):
- [HIGH] title "ACCOUNT FOR" over-claims semantic accountability -> retitle to "RECOMPUTE from a presented
  P-frame body". FOLD (done).
- [MED] §0 "What this wave CLOSES" / "closes ..." violates the close->narrow reflex -> "NARROWS". FOLD (done).
- [MED] DoD #5 "carried LOUD" is self-attesting -> grep-checkable predicate. FOLD §7 (done).
- [LOW] §0 sign-cite -> `edge-attestation.js:82`, not `broker-sign.js:52`. FOLD (done).
- P1-P5 runtime probes all VERIFIED against cited source; persona-did residual already NS-2-correct.

**Disposition:** all CRITICAL/HIGH folded into §0/§1/§7; the 4 honesty wording fixes applied inline. The two
CRITICALs + T5 + the round-trip were live-PROBED (not reasoned) before the fold. Proceed to TDD build.

## §10 VALIDATE board (post-build) — RECORDED 2026-06-22

3-lens parallel board on the built diff (229/229 green, eslint clean). The hacker LIVE-re-probed the BUILT
CLI + modules (Rule 2a), not the plan.

**code-reviewer — VERDICT SHIP-WITH-NITS** (0 CRITICAL / 0 HIGH; "most important change: none"):
- [MED] `readStdinBounded` oversized path: `len` accumulated the overflow chunk asymmetrically (harmless
  today, fragile under refactor). FOLDED: push-then-check + clear `chunks` on overflow.
- [LOW] env-side persona trim vs body exact-bytes asymmetry (plan said "exact bytes"). FOLDED: a comment
  documents the INTENTIONAL trim (fail-closed; trusted env only; never lets an attacker claim a different
  persona) so a future reader does not "fix" it and soften the closed direction.
- [LOW] `deny()` omitted `recordIdToSign`. FOLDED: `deny()` returns `recordIdToSign: null` (explicit contract).
- Done-well: the `settled` once-only guard, immutable `stripUndefinedKeys`, fail-closed `main().catch`,
  drain-before-exit ordering, structural back-compat — all confirmed correct.

**hacker — VERDICT SHIP (security)** — 14 live-probe families against the REAL CLI + modules; could NOT
emit a bad signature, hang, or crash. CONFIRMED-CLOSED (with probe output): T1 argv/body mismatch, T2
foreign-persona, T3 slow-loris (refuses at ~2.04s via the deadline) + oversized (`too-large` at 36ms, no
OOM) + deep/wide (canonical depth/node bounds), T4 malformed JSON, T5 embedded id/sig strip, T6 strict
downgrade (only `'0'` disables; `'0\n'`/`'00'` -> ON), T7 chunked/partial pipe, T8 A1 round-trip identity,
the both-null persona bypass, the non-plain-object reject, host EPIPE (clean null on early refuse),
`__proto__` benign, the liveness-probe (decoy/replay both fail). Most-dangerous RESIDUAL (correctly scoped
OUT, named LOUD): the blind oracle is reachable by OMITTING `PACT_BROKER_PERSONA_DID` (silent legacy
fall-through). FOLDED a deployment-hardening note: a recommended wrapper guard that refuses to start when the
key is configured but the persona is unset (turns the silent fall-through into a startup fail-closed).

**honesty-auditor — VERDICT HONEST** — ran the falsifiable greps: the three §0 residuals appear as named
phrases (spaced prose, not kebab tokens) in broker-sign.js's `HONEST SCOPE` header (broker-sign.js:11 — the
greppable forms are "single-operator payload authority" / "payload-semantics ceiling" / "NOT cryptographically
bound to the held key"; CodeRabbit incremental corrected the earlier "VERBATIM" wording); ZERO "closes R2 / closes the oracle / makes custody real"
over-claims in the diff; recompute-bind genuinely signs `computeRecordId(parsed)` not the argv id; SHADOW
stated; test names narrowed to what they assert. Outstanding DoD #5 obligation: `_SESSION-RESUME.md` must
carry the same three residual strings verbatim + describe R2-WHAT as NARROWED (done in the resume update).

**Disposition:** SHIP. 0 CRITICAL/HIGH across all three lenses; 1 MED + 3 LOW + 1 deployment-note FOLDED;
re-gate green (229/229, eslint clean). The wave NARROWS WHAT-can-be-signed; R2 stays open; all SHADOW.
