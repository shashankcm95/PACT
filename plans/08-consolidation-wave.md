---
lifecycle: persistent
created: 2026-06-22
phase: CONSOLIDATION (close the phase-close carried debt before any frontier)
status: PLAN (pre-VERIFY)
---

# 08 — Consolidation wave (discharge the phase-close debt)

## §0 Scope

The phase-close ([[plans/07]]) signed off CLOSEABLE-WITH-NOTES and decided: **consolidate before any
frontier** — the only honest in-process build left (everything else is SHADOW-multiplication or
deployment/frontier-gated). This wave closes the carried debt the checkpoint named. The **one net-new
enforcement** is the CONTEST discriminant (the single two-way seam in the one-way DAG); the rest are
labeling/doc/tidy. All SHADOW — nothing gates.

## §1 The fixes

### #1 (the real work) — CONTEST discriminant: mutual-exclusion in `validateRecord` (approach a′)

**Probed premise that reshaped the design:** `record-schema.json` IS enforced (via `validateRecord`), BUT
`validateRecord` (record.js:129) is a **hand-rolled subset** — `required[]` + a few HEX64/type spot-checks;
it explicitly does NOT interpret `if/then`/`oneOf`/`additionalProperties` (no `ajv`). So a JSON-schema
`if/then` discriminant (the originally-proposed (a)) would be **INERT**. The fix lives in the validator CODE.

**The invariant:** a record may carry **at most one** of `{target_claim_id, target_premise_id}` — never both.
The two are for disjoint purposes (`target_claim_id` = CONTEST(P2-defection) / ACCEPT(P3-REACH);
`target_premise_id` = CONFIRM / CONTEST-of-a-premise). Mutual-exclusion breaks **zero** legit records (every
type carries at most one; CLAIM/VOUCH/PREMISE carry neither — verified against record-schema.json:15-25).
A both-fields record is the cross-layer contamination the checkpoint flagged (feeds trust/direct AND
grounding/creator-standing simultaneously).

**Change (folded from VERIFY):** add to `validateRecord` (record.js) a **TYPE-BLIND** rejection — the
fields live in **`record.payload`** (every consumer reads `r.payload.target_*`; the schema nests them under
`properties.payload`), so the check is:
`if (record.payload && record.payload.target_claim_id != null && record.payload.target_premise_id != null)
errors.push(...)` — **no `type` predicate** (a forged `CLAIM` carrying both must ALSO fail; the store is not
a sandbox). It fires everywhere validation runs (`appendRecord` write, every load, `receiveFrame`).
Reconcile the constraint into the EXISTING `record-schema.json:21` payload-convention prose (DRY, don't
duplicate) + append the forward contract: *"the present target field selects the axis — `target_claim_id` ⇒
trust/direct claim-defection (or ACCEPT/REACH); `target_premise_id` ⇒ grounding premise-contest; a both-axis
contest MUST mint two records."* NOT the type-split (b) — VERIFY confirmed (b) touches ~5 consumers + ~14
test sites for zero safety delta (YAGNI); the doc-note carries the forward contract instead.

### #2 (labeling, mostly already covered) — the P4 sequencing guard as an explicit anchor

`trust.test.js` ALREADY asserts `convert().actionable===false` AND `mayGate` refuses high-stakes (both legs
exist). The gap (checkpoint) is they aren't tied to the `convert.js:82-85` comment ("`actionable` MUST NOT
flip until the per-path bar + U2") as an explicit, discoverable **P4 sequencing guard**. **Change:** a
dedicated, clearly-labeled test block (or rename/comment on the existing ones) that IS the machine-readable
guard — referencing convert.js:82-85 + the `epistemicIndependence()` P5 lift-point — so a future edit that
flips `actionable` or weakens `mayGate` goes red against a NAMED guard. Honest framing: consolidation +
labeling of existing assertions, NOT net-new coverage.

### #3..#6 — small items (bundled)
- **v0/README.md** count-drift: "121 tests" → 148; add `broker-sign.js`/`broker-client.js` to the src/ Layout table.
- **broker-sign.js** fd tidy: the interior `fail()` calls sit inside `try{…}finally{closeSync}`; `process.exit`
  skips `finally` → the fd leaks (OS-reclaimed; impure). **Fix MUST preserve check-before-read** (never read a
  FIFO/device/world-writable file's content first — the `isFile`/perm checks gate the read). So: `fstat(fd)` →
  if a check fails, `closeSync(fd)` THEN `fail()`; else `read` + `close`. (NOT "read then check after" — that
  would read untrusted content first; flaw caught in plan review.)
- **weak-flag.js** `mayGate`: a one-line note that it is currently **UNCONSUMED** (zero action paths; its
  true-branch authorizes nothing today) — so a future caller inherits the SHADOW obligation explicitly.
- **stale "first Actions run pending"** in README/plans/06 → now green (the push-to-main + PR #1 runs went
  green on node 20+22). Reconcile the wording.
- (optional) a composed P1->P2->P3 real-path acceptance test — mostly covered by minter.test.js's integrated
  test; include only if cheap. NOT load-bearing.

## §2 Files

| File | Change |
|---|---|
| `v0/src/lib/record.js` | EDIT — `validateRecord`: reject both-`target_*` (the discriminant, code-enforced) |
| `v0/src/lib/record-schema.json` | EDIT — doc note on the mutual-exclusion constraint (readers; not the enforcement) |
| `v0/test/unit/record.test.js` | EDIT — cross-contamination test (both-fields → invalid) + single-field legit regressions |
| `v0/test/unit/trust.test.js` | EDIT — the explicit, labeled P4-sequencing-guard test block |
| `v0/src/identity/broker-sign.js` | EDIT — fd-close-before-fail restructure |
| `v0/src/independence/weak-flag.js` | EDIT — one-line `mayGate`-is-unconsumed note |
| `v0/README.md` | EDIT — count 121->148 + broker files in the Layout table |
| `README.md` + `plans/06` | EDIT — "Actions run pending" -> green |

## §3 Runtime Probes (verified, not memory)

| Claim | Probe | Observed |
|---|---|---|
| record-schema.json is enforced (not dormant) | grep `loadSchema`/`validateRecord` usage | CONFIRMED — record.js:31/134; called in appendRecord (record-store.js:82), every load (:129), receiveFrame (frame.js:55) |
| validateRecord is hand-rolled (no if/then) -> JSON discriminant would be INERT | read record.js:129-156 | CONFIRMED — required[] + HEX64/type spot-checks only; "LENIENT, no additionalProperties"; no ajv |
| the two target_* fields' purposes are disjoint (mutual-exclusion breaks nothing) | read record-schema.json:15-25 | CONFIRMED — claim_id = CONTEST/ACCEPT; premise_id = CONFIRM/CONTEST-of-premise; CLAIM/VOUCH/PREMISE carry neither |
| convert.actionable is hard-false + the guard is comment-only | read convert.js:82-97 | CONFIRMED — `actionable:false` (INV-16); the bar is a comment at :82-85 |
| the P4-guard assertions already partly exist | checkpoint + trust.test.js | CONFIRMED — `actionable===false` + `mayGate` refuses high-stakes both already tested; the gap is LABELING |
| mayGate refuses high-stakes, ignores caller label | read weak-flag.js:33-40 | CONFIRMED — `highStakes && epistemicIndependence()==='WEAK'` -> false; `void label` |

## §4 Test plan (TDD)
1. **RED**: a record with BOTH `target_claim_id` + `target_premise_id` → `validateRecord` returns invalid
   (write the test first; it FAILS on current code).
2. **GREEN**: add the mutual-exclusion check → the test passes; **regressions**: a CONTEST w/ only
   `target_claim_id`, a CONFIRM w/ only `target_premise_id`, a CLAIM w/ neither → all still valid.
3. **store boundary**: `appendRecord` rejects a both-fields record (the contamination can't enter the log).
4. the labeled **P4-sequencing-guard** test: `convert().actionable===false` AND `mayGate(label,{highStakes:true})===false`, tied by comment to convert.js:82-85.
5. broker fd restructure: existing broker tests stay green (symlink/world-writable/non-ed25519 still rejected).

## §5 DoD
- [ ] CONTEST mutual-exclusion enforced in `validateRecord` + cross-contamination test (RED→GREEN) + legit-single-field regressions green.
- [ ] both-fields record rejected at the `appendRecord` store boundary (test).
- [ ] explicit labeled P4-sequencing-guard test tied to convert.js:82-85.
- [ ] broker fd-close-before-fail restructure; all broker tests green.
- [ ] doc/tidy items folded (v0/README count + broker files; mayGate note; stale "Actions pending" → green).
- [ ] full suite green (148 + the new tests); eslint clean; clean-env dogfood green.
- [ ] all SHADOW — nothing gates.

## §6 VERIFY board (pre-build) — RECORDED 2026-06-22

Foreground 2-lens (architect + code-reviewer). Both **PASS-WITH-CHANGES**. Two load-bearing catches (each
would have produced a passing-but-INERT fix). All folded:

1. **(code-reviewer HIGH) payload nesting** — `target_*` live in `record.payload`, not top-level. Checking
   `record.target_claim_id` is inert (always false); a top-level test passes vacuously. → check
   `record.payload && record.payload.target_claim_id != null && record.payload.target_premise_id != null`;
   tests construct both fields IN the payload.
2. **(architect F2) TYPE-BLIND** — reject both-fields on ANY record, not gated on `type==='CONTEST'` (a
   forged `CLAIM` with both must fail too; store-is-not-a-sandbox). + a non-CONTEST both-fields test.
3. **(code-reviewer MED) broker fd** — the "else read+close" still leaks if `readFileSync` THROWS. → keep a
   minimal `try { pem = readFileSync(fd) } finally { closeSync(fd) }` around ONLY the read, AFTER the
   `isFile`/perm checks (which `closeSync(fd)` then `fail()`). Preserves check-before-read AND closes on the
   read-throws path.
4. **(architect F3) P4-guard** — pin `epistemicIndependence()==='WEAK'` (the CAUSE / sole P5 lift-point,
   weak-flag.js:52) in the labeled guard, not just `mayGate` (the symptom) + `convert().actionable===false`.
5. **(architect F1/F4/F6) doc-note** — reconcile into the EXISTING record-schema.json:21 prose (DRY) + add
   the forward contract ("field selects the axis; a both-axis contest mints two records").
6. **(architect F5) broker = security-path** — add a non-regular (directory) key-path test (closes the
   untested `isFile` guard + evidences check-before-read); the hacker RE-PROBES the built fd path at VALIDATE.

**CARRIED (confirmed):** (a′) is right vs (b) type-split (YAGNI — (b) = ~5 consumers + ~14 test sites, no
safety delta); ZERO regression (no existing test carries both fields — grep-confirmed); 148 = 138 unit + 10
acceptance; the P4-guard infra already exists (trust.test.js freshWorld + mayGate-high-stakes — labeling, not
net-new); mutual-exclusion breaks no legit record (every type carries ≤1 target_*).

## §7 VALIDATE board (post-build) — RECORDED 2026-06-22

Foreground 2-lens (code-reviewer + hacker-Rule-2a-reprobe). Both **PASS-WITH-CHANGES**. Suite 148→153, all
green, eslint clean, clean-env dogfood green.

**Hacker live re-probe — the discriminant held against every bypass class** (built throwaway probes vs the
BUILT modules): array-coercion (#273 family), falsy-present (`''`/`0`/`false`), nested/prototype-chain,
type-blind (a forged CLAIM with both → rejected), and — critically — the **planted-file read-path is closed**
(a content-valid, signed both-fields record written straight to the store dir → `readById`/`verifiedRecords`
return null, because `loadRecordFile` runs `validateRecord` on read). The guard's property-access path matches
both consumers' reads exactly (load-bearing). Broker fd: no double-close, no leak on any of the 6 paths.

**Folded:**
1. **(hacker LOW — the one that mattered) FIFO hang** — the broker blocked at `openSync` on a FIFO key-path
   (pre-existing, commit 718a0a4), BUT the comment I added THIS wave claimed FIFO-safety it didn't have. Made
   the claim TRUE: added `O_NONBLOCK` (opens non-blocking → `fstat().isFile()` rejects the FIFO before any
   read; no-op for a regular file) + a FIFO test (direct invoke, short timeout, asserts non-zero exit + NO
   kill-signal = rejected-not-hung).
2. **(code-reviewer LOW) README count** 148→153 (both READMEs).

**CARRIED (pre-existing, not churned):** broker read-throws prints a stack rather than the clean `fail()`
message — pre-existing, NO key leak (the throw precedes the key entering `pem`), and the code-reviewer verified
the current fd block correct on all paths; not churning a verified security path for a cosmetic. Noted hygiene.

**CONFIRMED clean:** `!= null` is the right discriminant predicate (empty-string is present + malformed →
correctly rejected); zero regression (no existing test carries both fields); the labeled P4-guard is
non-vacuous (3 independently load-bearing legs); the doc-note is DRY + accurate.

**Net:** the one cross-layer two-way seam is closed (write + read paths), the carried debt is discharged,
all SHADOW. Wave CLOSEABLE.
