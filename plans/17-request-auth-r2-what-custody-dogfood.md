---
lifecycle: persistent
created: 2026-06-23
phase: R2-WHAT per-request-auth custody dogfood — the THIRD world-anchored hardening signal (WHAT-may-be-signed at the live broker boundary)
status: DONE — dogfood LIVE-PASSED (§9); VALIDATE A/NO-OVERCLAIM (§10); the THIRD world-anchored hardening signal
---

# R2-WHAT per-request-auth custody dogfood — prove the broker SIGNS a recomputable P-frame but DENIES what it cannot account for

> Chosen 2026-06-23 as the next PACT move (north-star §2.6 inflection + §5 mapped-next), immediately after the
> R2-WHO caller-auth dogfood (`plans/16`, MERGED #12). R1 (`plans/14`) hardened FILE-READ non-exfiltration; R2-WHO
> (`plans/16`) hardened WHO-may-invoke at the cross-uid boundary; §2.7 records **R2-WHAT (per-request entitlement)
> + R3 (forgery) UNTOUCHED**. This wave delivers the R2-WHAT hardening signal — the live, NON-VACUOUS proof that
> the deployed broker, in require-frame mode, signs only a `record_id` it can RECOMPUTE from a presented P-frame
> declaring its persona, and DENIES an arbitrary 64-hex / a wrong-persona frame / a non-object body. It mirrors the
> R2-WHO dogfood discipline (`plans/16`); it does NOT build code (`request-auth.js` is already built + unit-tested).

## §0 Honest scope (read first — it bounds the DoD; NS-7/NS-9)

`v0/src/identity/request-auth.js` is **already built + unit-tested** (`authorizeRequest` -> allow/deny/disabled on
the presented frame body <-> `PACT_BROKER_PERSONA_DID`; `broker-sign.js` calls it as gate-0.5 AFTER caller-auth
and BEFORE opening the key). This wave does NOT build code — it **world-anchors the guard**: a live dogfood on a
separate-uid deployment proving the per-request deny path FIRES, each deny PROVABLY caused by the bind under test
(the non-vacuity discipline — `security.md`: "a guard must be NON-VACUOUS; prove it can fail").

**What a PASS HARDENS (one axis, on one box — NS-7):** WHAT-may-be-signed is enforced **by the broker itself** —
it is no longer a blind oracle for an arbitrary 64-hex. The broker re-derives the signed id from the presented
preimage (`recompute-bind`) and refuses a frame that does not declare its configured persona (`persona-bind`), and
both denies are **observed firing against real, distinct, non-entitled requests**, not assumed.

**What it does NOT close (loud residuals — named, not papered; from `request-auth.js:18-21` + runbook §9):**
- **R2-WHAT NARROWS, it does not close R2.** The entitled operator can still make P assert **ANY payload**
  (single-operator payload authority / payload-semantics ceiling) — recompute-bind constrains the `record_id`'s
  derivability, NOT the payload's truth.
- **`PACT_BROKER_PERSONA_DID` is a POLICY declaration, NOT cryptographically bound to the held key** broker-side
  (integrity != provenance, NS-2). Only the host-side `assertBrokerPersona` round-trip proves the key matches the
  claimed persona; this dogfood verifies the gate enforces the configured literal, not that the literal keys the key.
- **R2-WHO is the prerequisite, not re-proven here — and NOT actually required for R2-WHAT non-vacuity (VERIFY
  hacker LOW).** A non-allowlisted caller is denied at gate-0 BEFORE R2-WHAT is reached (`plans/16` hardened that).
  This wave deploys R2-WHO ENABLED-and-passing for realism, but the R2-WHAT deny legs fire on the FRAME regardless
  of whether caller-auth is on: even if the allowlist were unset (caller-auth `disabled`), `broker-sign` PROCEEDS to
  gate-0.5 and the WHAT legs still deny. So a present `caller-auth DISABLED` notice is a SCOPE-CALIBRATION flag
  (report R2-WHO as off in the audited scope), NOT a run-aborting confound — the R2-WHAT result stands either way.
- **R3 (forgery) UNTOUCHED**; **same-uid compromise** still an oracle; **heap-read leg** narrowed-not-closed
  (macOS 2e PARTIAL; Linux `ptrace_scope=2` is the strongest form — R1's residual, unchanged here).
- All SHADOW — nothing gates an action.

## §1 The hardening claim + the NON-VACUITY criteria (the load-bearing axis)

The pass is meaningful ONLY if **each deny leg is exercised against a real, distinct, non-entitled request, through
the real `sudo` cross-uid path, and the deny is PROVABLY caused by the bind under test** — `persona-bind` vs
`recompute-bind` — NOT by a confounded gate-order, a misconfigured-unset persona, or a disabled mode.

**THE NEW non-vacuity subtlety (vs R2-WHO) — the gate-order confound (load-bearing):** in `authorizeRequest`,
`recomputeBinds` runs BEFORE `personaBinds` (`request-auth.js:121` then `:123`; broker-sign wires them at gate-0.5).
So a "wrong-persona" leg that does NOT first satisfy recompute-bind actually trips `record-id-mismatch`, NOT
`persona-mismatch` — and because `broker-sign.js:104` emits a FIXED `request not authorized` for ALL gate-0.5 deny
causes (anti-oracle — KEEP it), the wire CANNOT tell you which bind fired. **The runbook §9 example C is exactly
this trap live in our own docs:** it presents `{"src_persona_did":"did:key:zAttacker",...}` with a *random* `$HEX`,
labels it "persona-bind", but the random hex != `computeRecordId(body)` so recompute-bind fires first — it never
exercises persona-bind. (Folding that runbook fix is part of this wave — §7.)

**The construction that defeats the confound — one shared positive control, one perturbed input per deny leg:**
all legs share a common non-persona frame body; each leg changes EXACTLY ONE input from the signing baseline, so
the deny isolates one bind by construction (since the wire reason is uninformative). **The argv ids are ALL
host-computed using the DEPLOYED `/opt/pact/v0/src/lib/record.js` module (not a local copy), and its sha256 + the
sha256 of `canonical-json.js` are recorded — so "the broker recomputes the same id I claim" is checkable from
evidence, not assumed (VERIFY HIGH, both lenses).** The legs:
- **Leg-1 ALLOW (the shared positive control):** body `B = {src_persona_did: <BROKER_DID>, ...rest}`, argv id =
  `computeRecordId(B)`. Both binds pass -> SIGNS. This proves the config can SIGN a legit frame (persona set, the
  deployed module recomputes `B`'s id identically). **require-frame-ON is established SEPARATELY by the ABSENT
  `per-request-auth DISABLED` notice (§0a) — the signature ALONE is consistent with a disabled hex-passthrough
  (VERIFY MED); the absent notice is the load-bearing observation, not the sig.**
- **Leg-2 DENY persona-bind (perturb ONLY the persona):** body `B2 = {...B, src_persona_did: <ATTACKER_DID>}` —
  **literally leg-1's body with ONLY the `src_persona_did` field changed**, argv id = `computeRecordId(B2)`. Because
  `B2` shares EVERY non-persona field with `B` byte-for-byte, leg-1 signing IS the recompute positive-control for
  `B2`'s structure (the deployed module recomputed `B`'s identical-shape id correctly), so the ONLY input that can
  fail for `B2` is the persona value -> the deny can ONLY be `persona-mismatch`. **Non-vacuity is CONTINGENT on
  broker-recompute === host-compute (named, not assumed — VERIFY HIGH): closed by (a) `B2` differing from `B` in
  exactly one field [record both bodies byte-for-byte; a diff shows one line], and (b) the recorded deployed-module
  sha matching the module the host computed `computeRecordId(B2)` with.** This mirrors how `plans/16 §9` carried the
  leg-3 forge-discard as CONTINGENT on the leg-1 flip-counterfactual.
- **Leg-3 DENY recompute-bind (perturb ONLY the argv id):** body `B` (the leg-1 body, persona MATCHES) but a
  DIFFERENT, also-64-hex argv id (`computeRecordId(B2)`, or a random hex). persona would pass; the ONLY thing that
  fails is the id re-derivation -> the deny can ONLY be `record-id-mismatch`. This is the "no longer a blind oracle
  for an arbitrary hex" core guarantee. Non-vacuous (leg-1 proves the SAME body+correct-id signs).
- **Leg-4 NON-OBJECT REFUSED (redundantly gated — re-framed per VERIFY hacker MED, do NOT over-claim):** body
  `[<BROKER_DID>]` (a persona-less ARRAY that `computeRecordId` accepts — returns a valid 64-hex, does NOT throw),
  argv id = `computeRecordId([<BROKER_DID>])` (recompute would PASS). The body is REFUSED -> deny. **HONEST framing:
  this proves a persona-less non-object cannot be signed, but it does NOT uniquely isolate the `frame-not-an-object`
  gate (`request-auth.js:119`): an array has no `.src_persona_did` string, so even if `:119` were removed,
  `personaBinds` (`:123`) would still deny it. The non-object is REDUNDANTLY gated (`:119` OR `:123`) — defense-in-
  depth, NOT a "a missing gate would have signed" forge.** The earlier draft's claim that a missing `:119` would
  have signed was FALSE and is struck.

**Leg-0 — preconditions (must hold, else the run is VACUOUS — ABORT, do not record):**
- **(0a) require-frame ON, not disabled — asserted PER LEG (VERIFY MED):** `PACT_BROKER_PERSONA_DID` is SET, and
  EVERY leg (not just leg-1) captures stderr and shows NO `per-request-auth DISABLED (require-frame off)` notice —
  confirming require-frame was ON for THAT specific invocation. A disabled gate signs the argv hex (and the deny
  legs present a MATCHING argv, so disabled mode would SIGN them, not deny). The absent notice — not the leg-1 sig —
  is the load-bearing discriminator that require-frame is ON.
- **(0a.1) config stable across legs:** record the deployed wrapper file's sha256 ONCE and confirm it is unchanged
  at run-end — so an operator edit / env drift mid-run cannot silently flip a leg to a disabled broker.
- **(0a.2) persona literal pinned (VERIFY hacker MED):** record the EXACT `PACT_BROKER_PERSONA_DID` literal from the
  deployed wrapper (USER pastes it) and assert byte-equality with leg-1 body's `src_persona_did` and leg-2's
  non-persona structure. This makes "the body's persona IS the broker's configured persona" checkable, not assumed
  (a config-typo'd persona that happened to match a typo'd body would otherwise sign leg-1 and mis-attribute leg-2).
- **(0b) R2-WHO scope-calibration (NOT a run-blocker — VERIFY hacker LOW):** `PACT_BROKER_ALLOWED_UIDS` is SET to
  the calling uid and leg-1 must NOT be denied `caller not authorized` (a gate-0 deny would be the wrong axis). But a
  `caller-auth DISABLED` notice does NOT void the run — it only means R2-WHO is off; record it as a SCOPE flag
  (audited scope reports "R2-WHO off") since the R2-WHAT legs deny on the frame regardless. (R2-WHAT keys on the
  FRAME, not the caller uid, so a SINGLE allowlisted caller suffices — no second/excluded uid, unlike `plans/16`.)
- **(0c) broker-persona-unset masquerade discharged:** an unset `PACT_BROKER_PERSONA_DID` makes EVERY require-frame
  request deny `broker-persona-unset` — a gate that "denies everything" looks like it works but is misconfigured.
  Leg-1 SIGNING (a real base64 sig) discharges this by elimination: an unset persona could not have signed.

## §1.5 DoD gates (every box must be checkable from recorded evidence)

- [ ] The sha256 of the DEPLOYED `/opt/pact/v0/src/lib/record.js` AND `canonical-json.js` are recorded, and ALL argv
      ids were host-computed using THAT deployed module — so "the broker recomputes the id I claim" is evidence-backed.
- [ ] Leg-1 ALLOW returned a REAL base64 signature — the shared positive control proving the config signs a legit
      frame AND that the deployed module recomputes leg-1 body `B`'s id identically (the recompute control for `B2`).
- [ ] Leg-2 body `B2` differs from the leg-1 body `B` in EXACTLY the `src_persona_did` field (record both bodies
      byte-for-byte; a diff shows one line), argv = `computeRecordId(B2)` via the deployed module -> deny. Leg-2
      non-vacuity is carried as CONTINGENT on broker-recompute === host-compute (closed by the one-field diff + the
      recorded module sha), NOT silently assumed.
- [ ] Leg-3 used the leg-1 body `B` (persona matches) with a mismatched argv id -> deny (recompute-bind isolated;
      leg-1 proves the same body + correct id signs).
- [ ] Leg-4 used a persona-less non-object (`[<BROKER_DID>]`) -> deny, recorded as "non-object REFUSED (redundantly
      gated `:119` OR `:123`)" — NOT as a unique `frame-not-an-object` isolation (an array backstops at persona-bind).
- [ ] Leg-0a (PER LEG): no `per-request-auth DISABLED` notice on ANY leg (require-frame ON for each invocation).
- [ ] Leg-0a.1: deployed wrapper sha256 recorded once and confirmed unchanged at run-end (no mid-run env drift).
- [ ] Leg-0a.2: the exact wrapper `PACT_BROKER_PERSONA_DID` literal recorded == leg-1 body `src_persona_did` (byte-equal).
- [ ] Leg-0b: no `caller not authorized` on any leg; a `caller-auth DISABLED` notice (if present) recorded as a
      SCOPE flag (R2-WHO off), not a run-abort.
- [ ] Every leg's stdout + stderr + exit code captured; each deny's stderr is EXACTLY `broker-sign: request not
      authorized` AND none of the other fixed broker strings appears — `caller not authorized` (`:88`), `... DISABLED`
      (`:91`/`:107`), `frame channel:` (`:79`), `record_id must be 64-hex lowercase` (`:114`), `PACT_BROKER_KEY_FILE
      is required` (`:122`), `key file ...` (`:127`), `sign failed ...` (`:141`), `internal error` (`:148`). This pins
      the deny to gate-0.5 by exact-string match, not by the `empty-stdout + exit 1` a key/wiring fault also yields.
- [ ] key-never-opened recorded as source-ordering-precluded OR `fs_usage`-observed (state which); the three deny
      legs precede `openSync(keyFile)` by gate ordering (`broker-sign.js:104` before `:126`).
- [ ] §8 audited-scope statement written, calibrated to the deny-leg evidence actually recorded (NS-9; "narrowed"
      never "closed"; the payload-semantics + integrity-not-provenance residuals carried loud).

## §2 Deployment (USER runs the sudo/system-config; I provide commands + verify the OUTPUT)

The R2-WHO broker was torn down at the close of `plans/16` -> a fresh separate-uid deployment is needed. **This is
the SAME broker shape as `plans/16` with TWO changes:** (a) the wrapper sets `PACT_BROKER_PERSONA_DID` (require-frame
ON), and (b) only ONE caller uid is needed (the allowlisted one) — R2-WHAT keys on the frame, not the uid.

- Broker uid (e.g. `pact-broker`, uid 600) owns the `0600` key; the root-owned wrapper exports
  `PACT_BROKER_ALLOWED_UIDS=<CALLER_UID>` (R2-WHO passing) AND `PACT_BROKER_PERSONA_DID=did:key:zBroker`
  (require-frame ON). Use the SAME DID for the wrapper persona, the registry `personaDid`, and the verifier
  `--persona` (runbook §9 caveat — a mismatch reads like a custody fault but is a config typo).
- node `/usr/local/bin/node` (root:wheel, host-non-writable — NVM/Homebrew nodes are owner-writable = swap-unsafe);
  code `/opt/pact/v0` (root:wheel, `go-w`); sudoers `env_reset, !setenv` on the wrapper.
- Reuse `docs/deployment/cross-uid-broker.md` §§1-9 for the wrapper; the §9 fail-closed-on-unset-persona guard
  (`[ -n "$PACT_BROKER_PERSONA_DID" ] || exit 78`) is RECOMMENDED so a forgotten persona refuses rather than
  silently runs the blind oracle.

**Cross-substrate (§7):** borrow the toolkit `scripts/loom-broker-deploy-macos.sh` (#413) interpreter-swap HARDENING
(the ancestor-walk + root-owned-node refusal), NOT its env-var names / semantics (PACT uses
`PACT_BROKER_PERSONA_DID` / `src_persona_did`; verify each adapted line against `request-auth.js`, not the loom analog).

## §3 The dogfood procedure (per leg — capture stdout AND stderr AND exit code as evidence)

The frame bodies + argv ids are HOST-COMPUTED by me using the DEPLOYED `/opt/pact/v0/src/lib/record.js`
`computeRecordId` (NOT a local copy — its + `canonical-json.js`'s sha256 are recorded so it is provably the module
the broker recomputes with), and presented on stdin via the real `sudo -n -u pact-broker <wrapper>` path. For each
leg I record the presented body (byte-for-byte), the argv id, and stdout/stderr/exit. Each deny is pinned by EXACT
stderr string-match to `broker-sign: request not authorized` (gate-0.5), with the §1.5 exclusion list confirming no
other fixed broker string appears — so the deny is attributable to the gate, not to a shared `empty-stdout + exit 1`.

- **Leg-0 (prep + preconditions):** record the deployed `record.js` + `canonical-json.js` sha256, the wrapper
  sha256, and the exact wrapper `PACT_BROKER_PERSONA_DID` literal. Confirm leg-1 emits NO `per-request-auth
  DISABLED` notice (0a) and no `caller not authorized` (0b); leg-1 signing discharges the unset-persona masquerade (0c).
- **Leg-1 (allow — shared positive control):** present `B = {"src_persona_did":"<BROKER_DID>", ...rest}`, argv =
  `computeRecordId(B)` -> base64 sig + exit 0. Evidence: the sig + the ABSENT `per-request-auth DISABLED` notice
  (the require-frame-ON discriminator) + the persona literal matching the wrapper's.
- **Leg-2 (deny persona-bind):** present `B2 = {...B, "src_persona_did":"<ATTACKER_DID>"}` — leg-1's body with ONLY
  the persona field changed, argv = `computeRecordId(B2)` (deployed module) -> empty stdout, exit 1, stderr EXACTLY
  `broker-sign: request not authorized`. Evidence: `diff B B2` shows exactly the one persona line + both ids + the
  exact deny string + no other broker string. Non-vacuity CONTINGENT on the recorded module sha (named in §8).
- **Leg-3 (deny recompute-bind):** present `B` (leg-1 body, persona matches), argv = a DIFFERENT 64-hex
  (`computeRecordId(B2)` or random) -> empty stdout, exit 1, stderr EXACTLY `broker-sign: request not authorized`.
  Evidence: the body's true id (= leg-1's signed id) != the claimed argv id + the exact deny string.
- **Leg-4 (non-object refused — redundantly gated):** present `[<BROKER_DID>]` (a JSON array), argv =
  `computeRecordId([<BROKER_DID>])` -> empty stdout, exit 1, stderr EXACTLY `broker-sign: request not authorized`.
  Evidence: the array body + matching argv + the exact deny string. Recorded as "non-object REFUSED, redundantly
  gated (`:119` frame-not-an-object OR `:123` persona-bind)" — NOT as a unique `:119` isolation (an array has no
  `src_persona_did`, so persona-bind backstops it; the earlier "a missing gate would have signed" claim is struck).

## §4 Runtime probes (firsthand — re-confirmed this session against the repo)

- **P1** `request-auth.js:97-125` — require-frame ON: deny on unset/empty broker persona, no/oversized/unparseable/
  non-object body, recompute mismatch, or persona mismatch; allow signs `computeRecordId(parsedBody)`. CONFIRMED (read).
- **P2** gate ORDER in `authorizeRequest`: `frame-not-an-object` (`:119`) -> `recomputeBinds` (`:121`) ->
  `personaBinds` (`:123`). The leg construction (§1) isolates each bind by perturbing one input, because this order
  + the FIXED wire message (`broker-sign.js:104`) make the reason unreadable off the wire. CONFIRMED (read).
- **P3** `resolveRequireFrame` (`request-auth.js:50-53`) — default-ON when `PACT_BROKER_PERSONA_DID` is a non-empty
  string; explicit `PACT_BROKER_REQUIRE_FRAME=1/0` overrides; a dropped flag with persona set fails CLOSED (ON). CONFIRMED.
- **P4** gate-0.5 runs AFTER gate-0 caller-auth (`broker-sign.js:98-104`) and BEFORE `openSync(keyFile)` (`:126`) —
  a gate-0.5 deny precludes the key open by ordering. CONFIRMED (read; key-never-opened is ordering-precluded unless `fs_usage`-observed).
- **P5** `computeRecordId` (`record.js:52-60`) strips `{record_id, sig}` then sha256(canonical(rest)); it accepts
  arrays/scalars (returns a valid 64-hex, does NOT throw) — which is WHY the `frame-not-an-object` gate at
  `request-auth.js:119` is load-bearing (leg-4). CONFIRMED (read).
- **P6** the live R2-WHO box is GONE (torn down at `plans/16` close) — a fresh deploy is required; this one sets the
  persona-did (require-frame ON), which the R2-WHO run deliberately omitted.

## §5 Honest residuals (carry loud — §0 + into §8 at close)

R2-WHAT NARROWS WHAT-can-be-signed; it does NOT close R2 · the entitled operator can still make P assert ANY
payload (payload-semantics ceiling) · `PACT_BROKER_PERSONA_DID` is a policy declaration, NOT cryptographically
bound to the held key broker-side (integrity != provenance, NS-2) · R2-WHO is the prerequisite (not re-proven here)
· R3 (forgery) UNTOUCHED · same-uid allowlisted compromise = still an oracle · heap-read narrowed-not-closed
(macOS 2e PARTIAL; Linux `ptrace_scope=2` strongest).

## §6 VERIFY / VALIDATE plan

- **VERIFY (pre-deploy, 2-lens — architect + hacker) — COMPLETE, folded (§8).** Both `SOUND-WITH-CHANGES`; the
  headline catch was the gate-order confound recurring INSIDE leg-2 (recompute-pass assumed, never controlled) plus
  a leg-4 honesty over-claim — all folded plan-level (no code change).
- **VALIDATE (post-dogfood, honesty lens):** grade the §8 result against the legs ACTUALLY observed — was each deny
  run against a request that isolates exactly one bind (only-persona-differs for leg-2; only-argv-differs for leg-3;
  matching-recompute-non-object for leg-4), with the leg-1 positive control on the identical config? NS-9:
  "narrowed" never reported as "closed"; the payload-semantics + integrity-not-provenance residuals carried loud.

## §7 Cross-substrate sync + the runbook §9-C fix (toolkit <-> PACT — standing directive)

- **Fold the runbook §9-C mislabel (this wave):** `docs/deployment/cross-uid-broker.md` example C claims to prove
  `persona-bind` but presents a wrong-persona frame with example B's RANDOM `$HEX` (line 219, reused at 224) ->
  recompute-bind fires first -> the deny is `record-id-mismatch`, NOT `persona-mismatch`. Rewrite C to compute its
  OWN id from the EXACT body it presents, via the deployed module — `HEX_C=$(node -e 'process.stdout.write(
  require("/opt/pact/v0/src/lib/record").computeRecordId({src_persona_did:"did:key:zAttacker",nonce:"x"}))')` — and
  pass `"$HEX_C"` (NOT `$HEX`) so recompute passes and the deny is provably `persona-mismatch`. Add an example D
  presenting the legit `zBroker` body with a WRONG id (example B's `$HEX`) for the recompute-bind case. Verify each
  adapted `node -e` path points at `/opt/pact/v0`'s `record.js` (the deployed module), per §2's cross-substrate rule.
- **Borrow the HARDENING, not the semantics:** the toolkit `egress/` per-request path + `loom-broker-deploy-macos.sh`
  (#413) derive from PACT's broker; take the interpreter-swap refusal, verify each adapted line against
  `request-auth.js`. Feed R2-WHAT dogfood learnings back. Memory: `pact-toolkit-cross-substrate-sync`.

## §8 VERIFY board result — RECORDED 2026-06-23 (architect + hacker; workflow `wf_212d219d`; all folded above)

2-lens board, BOTH `SOUND-WITH-CHANGES`. The hacker reproduced all four legs through the REAL `authorizeRequest`
and confirmed leg-2 -> `persona-mismatch`, leg-3 -> `record-id-mismatch`, leg-4 -> `frame-not-an-object`, exactly as
the gate order (`request-auth.js:119 -> :121 -> :123`) predicts. The convergent theme: the dogfood DESIGN was sound
but **non-vacuity hinged on UNSTATED, INVISIBLE invariants the broker's fixed `request not authorized` wire message
cannot certify** — the gate-order confound recurring INSIDE the anti-confound construction. Every fix was plan-level
(no code change). The guard itself was confirmed SOUND.

- **HIGH (architect + hacker, CONVERGENT — the headline) — leg-2 recompute-pass assumed, never controlled.**
  FOLDED §1 leg-2 / §1.5 / §3: `B2 = {...B, src_persona_did: ATTACKER}` (leg-1's body, ONE field changed) so leg-1
  signing IS the recompute control for `B2`'s structure; argv computed via the recorded-sha DEPLOYED module; leg-2
  non-vacuity carried CONTINGENT on broker-recompute === host-compute (named, like `plans/16 §9`'s leg-3 contingency).
- **HIGH (hacker) — deny evidence `empty-stdout + exit 1` is shared by key/wiring faults.** FOLDED §1.5 / §3: each
  deny pinned by EXACT stderr `broker-sign: request not authorized` AGAINST an exclusion list of every other fixed
  broker string (`:79`/`:88`/`:91`/`:107`/`:114`/`:122`/`:127`/`:141`/`:148`).
- **MED (hacker — honesty catch) — leg-4 does NOT uniquely isolate `frame-not-an-object`.** FOLDED §1 leg-4 / §1.5 /
  §3: re-framed as "non-object REFUSED, redundantly gated (`:119` OR `:123`)"; the false "a missing gate would have
  signed" claim STRUCK (an array has no `src_persona_did` -> persona-bind backstops it).
- **MED (architect + hacker) — require-frame-ON must be asserted PER LEG; persona literal must be pinned.** FOLDED
  §1 leg-0a/0a.1/0a.2: no `per-request-auth DISABLED` on ANY leg; wrapper sha256 unchanged across legs; the exact
  wrapper persona literal recorded == leg-1 body `src_persona_did`.
- **MED (architect) — leg-1 sig alone does not prove require-frame ON.** FOLDED §1 leg-1: the ABSENT DISABLED notice
  is the load-bearing discriminator, not the signature (a disabled hex-passthrough also signs).
- **LOW (hacker) — R2-WHO need not be passing for R2-WHAT non-vacuity.** FOLDED §0 / §1 leg-0b: down-scoped to a
  SCOPE-CALIBRATION flag (report R2-WHO off if the notice appears), not a run-abort.
- **MED (hacker) — runbook §9-C rewrite must compute its OWN id via the deployed module, not inherit `$HEX`.** FOLDED
  §7: explicit `HEX_C` via `/opt/pact/v0` + an example D for the recompute-bind case.
- **LOW confirmations (no change) — single-allowlisted-caller CORRECT** (gate-0 uid axis orthogonal to gate-0.5
  frame axis; one allowlisted uid genuinely suffices, unlike `plans/16`); **runbook §9-C trap REAL**;
  **key-never-opened honestly scoped** (source-ordering-precluded unless `fs_usage`-observed); **§0/§5 residuals
  calibrated to NS-9**.

## §9 Dogfood RESULT — RECORDED 2026-06-24 (LIVE on the user's MacBookAir; the THIRD world-anchored signal)

**Deployment shape:** broker `pact-broker` (uid 600, key `/etc/pact/broker.key` owner pact-broker `0600`) · node
`/usr/local/bin/node` (root:wheel, host-non-writable) · code `/opt/pact/v0` (root:wheel, `go-w`) · wrapper
`/usr/local/bin/pact-broker-sign` (root:wheel `0755`, sha256 `a6db7a0a3057…b7c240`, with the §9 fail-closed-on-
unset-persona guard) · sudoers `env_reset, !setenv`. **Require-frame ON** (`PACT_BROKER_PERSONA_DID=did:key:zBroker`,
wrapper line 4) AND **R2-WHO passing** (`PACT_BROKER_ALLOWED_UIDS=501`, the host uid, wrapper line 3) — the realistic
both-gates-active config, R2-WHAT the axis under test.

**Recompute-equivalence PROVEN (closes the VERIFY HIGH leg-2 contingency):** the DEPLOYED `/opt/pact/v0/src/lib/
record.js` (sha256 `e35c23d4…43aa1`) AND `canonical-json.js` (sha256 `e8a47334…45a0`) are **byte-identical to the
repo modules the VERIFY board reviewed** — so the broker recomputes the id with the exact module the host computed
the argv with. All argv ids were host-computed via that deployed module. Leg-2 non-vacuity is therefore NOT a bare
assumption: `B2` differs from the signing body `B` in EXACTLY `src_persona_did` (one-field diff, verified), and the
sha match certifies the broker's recompute of `B2` equals the host argv.

**Custody re-confirmed (R1, live, free):** `cat /etc/pact/broker.key` -> `Permission denied` (host uid 501 cannot
read the key owned by uid 600). Not this wave's claim, but a free re-anchor of R1 on the fresh deploy.

**The four legs (actual output — all run from the host uid 501, the allowlisted caller, through the real
`sudo -n -u pact-broker <wrapper>` path):**
- **Leg-1 ALLOW (shared positive control):** body `B`, argv `idB=4fd9e3ee…5414` -> stdout `v2cWNqjaeZB3Gi3X47v7vrR
  arw6WgcO49L5rgGYyZSdnuEUH7mZQ+WTHiB8p5PPHUD8kjmxf9oSduktdS0asBA==` (base64 sig), stderr **NONE**, `exit=0`. The
  ABSENT `per-request-auth DISABLED` notice (not the sig) is the require-frame-ON discriminator; the ABSENT
  `caller-auth DISABLED` confirms R2-WHO is on; the signing discharges the broker-persona-unset masquerade (0c).
- **Leg-2 DENY persona-bind:** body `B2` (= `B` with ONLY `src_persona_did` -> `did:key:zAttacker`), argv
  `idB2=f43a4ad0…1b35` (its OWN correct id, so recompute-bind PASSES) -> empty stdout, stderr EXACTLY
  `broker-sign: request not authorized`, `exit=1`. Because recompute passes (same structure as the signing `B`, sha-
  certified) and ONLY the persona differs, the deny can ONLY be `persona-mismatch`. **Non-vacuous.**
- **Leg-3 DENY recompute-bind:** body `B` (persona MATCHES the broker), argv `idB2` (a WRONG id — `B`'s true id is
  `idB`) -> empty stdout, stderr EXACTLY `broker-sign: request not authorized`, `exit=1`. persona would pass; the
  ONLY failure is the id re-derivation -> `record-id-mismatch`. The broker signs what it RECOMPUTES, not the claimed
  argv — no longer a blind oracle for an arbitrary hex. **Non-vacuous.**
- **Leg-4 NON-OBJECT REFUSED (redundantly gated):** body `["did:key:zBroker"]` (array), argv `idArr=4be5b06d…17ac`
  (recompute PASSES) -> empty stdout, stderr EXACTLY `broker-sign: request not authorized`, `exit=1`. A persona-less
  non-object is refused. **HONEST scope:** redundantly gated (`:119` frame-not-an-object OR `:123` persona-bind — an
  array has no `src_persona_did`, so even sans `:119` it denies at persona-bind; firsthand-confirmed
  `recomputeBinds(arr) ok=true`, `personaBinds(arr)=false`). NOT a unique `:119` isolation.

**Deny-string exclusion (the gate-attribution, HIGH-2):** every deny leg's FULL stderr was EXACTLY
`broker-sign: request not authorized` and NOTHING else — none of `caller not authorized` / `... DISABLED` /
`frame channel:` / `record_id must be 64-hex` / `key file ...` / `sign failed` / `internal error` appeared. So each
deny is attributable to gate-0.5 by exact-string match, not inferred from a `empty-stdout + exit 1` that a key/
wiring fault also yields. **This exclusion ALSO discharges the per-leg require-frame-ON check (§1.5 0a) for legs
2-4:** the absence of any `per-request-auth DISABLED` notice on each deny leg confirms require-frame was ON for that
specific invocation (not just leg-1's), so a disabled-mode hex-passthrough — which would SIGN the matching argv,
not deny — is ruled out per leg.

**key-never-opened:** source-ordering-precluded — a gate-0.5 deny `fail()`/`exit(1)` at `broker-sign.js:104` runs
BEFORE `openSync(keyFile)` at `:126` (confirmed by read; NOT separately observed via `fs_usage` — stated honestly,
as `plans/16 §9`).

**AUDITED SCOPE (calibrated — NS-9, "narrowed" never "closed"):** **R2-WHAT per-request-auth HARDENED — WHAT-may-be-
signed, deny-legs-OBSERVED on a live deployed require-frame broker: persona-bind isolated (one-field diff from a
sha-certified signing baseline), recompute-bind isolated (broker signs the RECOMPUTED id, not an arbitrary hex), and
a persona-less non-object refused. ONE box, ONE run.** Still OPEN (loud): R2-WHAT NARROWS, does NOT close R2 — the
entitled operator can still make P assert ANY payload (payload-semantics ceiling); `PACT_BROKER_PERSONA_DID` is a
POLICY declaration, NOT cryptographically bound to the held key broker-side (integrity != provenance, NS-2); R2-WHO
is the prerequisite (re-anchored here, not the claim); R3 (forgery) UNTOUCHED; same-uid allowlisted compromise still
an oracle; heap-read narrowed-not-closed (macOS 2e PARTIAL; Linux `ptrace_scope=2` strongest). All SHADOW — nothing
gates an action.

**DoD (§1.5):** deployed-module sha recorded + sha-matched + argv via it ✅ · leg-1 real sig (positive + recompute
control) ✅ · leg-2 one-field diff, contingency closed by sha-match ✅ · leg-3 same-body-wrong-id ✅ · leg-4 non-
object refused, redundantly-gated (not over-claimed) ✅ · per-leg no `per-request-auth DISABLED` ✅ · wrapper sha
recorded ✅ · persona literal == leg-1 body src_persona_did (byte-equal) ✅ · no `caller not authorized` on any leg ✅
· each deny EXACTLY the gate-0.5 string, exclusion list clean ✅ · key-never-opened source-ordering-precluded ✅ ·
audited scope written ✅.

## §10 VALIDATE result — GRADE A / NO-OVERCLAIM (`honesty-auditor`, agentId `ab4c06cafb1f43590`)

Single-lens honesty VALIDATE (claim-vs-evidence + NS-9), grading §9 against the live evidence. **12/12 DoD gates
FOLLOWED; no over-claim.** The auditor confirmed all five load-bearing §9 code attributions firsthand against source
(gate order `:119 -> :121 -> :123`; the collapsed wire message `broker-sign.js:104`; `computeRecordId`'s array-
acceptance; `personaBinds`'s array rejection; key-open `:104` before `:126`). Headline calibration checks:
- **leg-2 recompute-equivalence contingency genuinely CLOSED**, not papered over — the deployed-module sha-match to
  the reviewed repo + the verified one-field diff discharge "broker-recompute === host-compute" with checkable
  evidence. "The strongest part of the result."
- Every deny-leg cause-attribution correctly held as a **construction-forced INFERENCE** (the fixed wire message
  makes the reason unreadable; §9 never claims to read it). The deny-string exclusion is the one thing genuinely
  **OBSERVED**, and reported as such.
- **R2-WHAT reported as NARROWED, never closed**; persona-bind explicitly NOT claimed key-bound (integrity !=
  provenance loud); leg-4 honestly "redundantly gated", not a unique `:119` isolation; key-never-opened source-
  ordering-precluded, NOT `fs_usage`-observed. All seven residuals carried loud.
- **Rater-drift: SAFE direction** — leg-4 reported MORE conservatively than the §8 board predicted (the board's own
  MED honesty catch tightened it). No optimism drift.
- **One cosmetic LOW** (per-leg DISABLED-absence consolidated in the exclusion paragraph rather than restated per
  bullet; DoD legitimately met) — FOLDED into §9's deny-string exclusion paragraph (now explicit it discharges 0a
  for legs 2-4). Holds the same A/NO-OVERCLAIM bar as `plans/16 §9`.
