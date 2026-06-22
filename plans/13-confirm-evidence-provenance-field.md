---
lifecycle: persistent
created: 2026-06-22
wave: foundational pivot #2 — CONFIRM evidence-provenance field (FORK-2 deferred branch)
status: PLAN (pre-VERIFY)
---

# CONFIRM evidence-provenance field — the U2 estimator's first INPUT carrier (NARROWS/carries; does NOT harden)

> FORK-2's CONFIRM-provenance branch (the USER's choice after the U2 seam-correctness wave merged). The
> `research/23` RFC named this as the candidate estimator INPUT that touches the actual open U2 axis. This
> wave delivers the CARRIER (a CONFIRM-record field) + a SHADOW disjointness measure. Per OQ-NS-6 + the RFC's
> own forbidden-substitution list (§5.5): a SELF-ASSERTED provenance is NOT world-anchored — it only NARROWS;
> it must NEVER feed the U2 lift-point, change a score, or gate. It readies the estimator's first input slot.

## §0 Frame — the OQ-NS-6 honesty banner (read first)

**This wave does NOT harden trust and does NOT progress/close U2.** It adds a self-asserted CONFIRM field +
an advisory count. A self-asserted `evidence_provenance` is exactly the `config_hash` axis-3 shape that
cross-verify already calls "evasion-trivial ... permanently-WEAK ... NEVER read as independence (INV-16)"
(`cross-verify.js:14-15`): an attacker picks distinct provenance strings as trivially as distinct config
hashes. So the disjointness it measures is **WEAK and gates nothing**; `epistemicIndependence()` stays WEAK;
`strength`/`r`/`n_confirmers` are **unchanged**; `convert.actionable` stays `false`. The disjointness becomes
real ONLY when the provenance is **world-anchored** (a future wave / an authenticated provenance source — out
of scope). Per NS-9 this wave is NARROW/carrier-ready, never "U2 advanced."

## §1 The gap (firsthand — §5 has the probes)

`crossVerify` (`cross-verify.js:78-113`) counts **distinct EARNED-STANDING humans** confirming a premise
(`nConfirmers`, rootOf-keyed — one human = one confirmation). But it **cannot tell whether those humans'
EVIDENCE is independent**: two distinct humans can confirm from the *same* source / same model-family / same
corpus — correlated evidence that the count treats as two independent confirmations. That correlation IS the
U2 (epistemic-independence) axis. The count is passed as `topological: nConfirmers` into `independenceLabel`
with the honest caveat "k minted roots fabricate k" (`cross-verify.js:110`) — topological-WEAK, never
epistemic. There is today no field on the CONFIRM record carrying *where a confirmer's evidence came from*,
so disjointness cannot even be measured.

## §2 The design

1. **The carrier field.** Add an OPTIONAL `evidence_provenance` to the CONFIRM payload convention: a
   self-asserted string identifying the confirmer's evidence source / corpus / derivation (free-form id).
   `{ target_premise_id, evidence_provenance? }`. Documented in `record-schema.json` (the validator is
   lenient — `additionalProperties` is not enforced, forward-compat — so this is non-breaking; existing
   CONFIRMs without it stay valid).
2. **The advisory measure (cross-verify).** Among the SAME confirming records `crossVerify` already counts
   (real-target + earned + non-self, rootOf-keyed), compute `distinct_provenance` = the number of distinct
   non-empty `evidence_provenance` values asserted (keyed per-human to mirror the one-human-one-confirmation
   rule; a confirmer asserting none contributes to an `'unknown'` bucket, mirroring `direct.js:48`'s
   `config_hash ?? 'unknown'`). Add it to the return object as a NEW ADVISORY field, alongside `n_confirmers`.
3. **What it MUST NOT do (the load-bearing constraints — §3).** `distinct_provenance` does NOT change
   `strength`, `r`, or `n_confirmers`; does NOT feed `independenceLabel` (epistemic stays WEAK); does NOT gate.
   It is a PARALLEL advisory readout — the estimator's named input slot, not an input that is yet read.

## §3 Honesty constraints (forbidden-list compliance — research/23 §5.5, INV-16)

- **Self-asserted != world-anchored (NS-2).** `evidence_provenance` is asserted by the confirmer; it is the
  `config_hash`-class axis-3 signal (evasion-trivial). It is recorded + counted, NEVER read as independence.
- **It must not flow into the epistemic axis.** `independenceLabel({ topological: nConfirmers })` is UNCHANGED
  — `distinct_provenance` is NOT passed in, NOT mapped to epistemic/overall. The U2 lift-point is untouched.
- **It must not inflate any gating score.** Because `strength`/`r` are unchanged, `premise-score` (the
  consumer, `premise-score.js:59` reads `.r`) sees IDENTICAL output. No score an action could read moves.
- **Loud labeling.** The field's schema description + the cross-verify comment + the return-field name carry
  "self-asserted / WEAK / advisory / not-independence / world-anchored-only-when-the-provenance-is."

## §4 Test plan (TDD)

- `distinct_provenance` counts distinct asserted provenances among the counted confirmers (3 confirmers, 2
  distinct provenances -> 2; all same -> 1; none asserted -> the 'unknown' bucket semantics).
- **The load-bearing advisory pins:** adding/removing/changing `evidence_provenance` leaves `strength`, `r`,
  `n_confirmers`, and `independenceLabel(...).epistemic`/`.overall` BYTE-IDENTICAL; `convert.actionable` stays
  false. (A correlated set — N confirmers, 1 provenance — must NOT lower strength, and a "diverse" set must
  NOT raise it. The signal is read-only/advisory.)
- A non-string / empty `evidence_provenance` is treated as unasserted (fail-soft, never throws).
- Existing CONFIRM records (no field) still validate + score identically (the 230-suite stays green).

## §5 Runtime Probes (firsthand — this session, against the repo NOW)

- **P1** `crossVerify` counts distinct rootOf-keyed humans, no evidence-correlation signal: `cross-verify.js:88-101`
  + the "k minted roots fabricate k" caveat `:110`. CONFIRMED (read).
- **P2** the consumer reads only `.r`: `premise-score.js:59` (`crossVerify(...).r`); adding a return field is
  additive. CONFIRMED (read).
- **P3** `config_hash` is the self-asserted, evasion-trivial, permanently-WEAK axis-3 precedent (NEVER read as
  independence): `cross-verify.js:14-15`, `direct.js:48` (`config_hash ?? 'unknown'`). CONFIRMED (read).
- **P4** the validator is lenient (no `additionalProperties` enforcement — forward-compat): `record.js:28,123`;
  CONFIRM payload conventions are enforced ON READ. An optional new field is non-breaking. CONFIRMED (read).
- **P5** CONFIRM records are built `mint({type:'CONFIRM', payload:{target_premise_id}})` (`broker.test.js:107`,
  `record.test.js:117`, `grounding.test.js`); the field rides the same payload. CONFIRMED (grep).
- **P6** baseline suite is **230** green (`npm test`); re-run at the green step. CONFIRMED (ran this session).

## §6 DoD

- [ ] `evidence_provenance` documented in `record-schema.json` (optional CONFIRM payload field, self-asserted).
- [ ] `crossVerify` returns `distinct_provenance` (advisory), keyed per-human, 'unknown'-bucket for unasserted.
- [ ] **The advisory pins are GREEN:** `strength`/`r`/`n_confirmers`/`independenceLabel.epistemic`/`.overall`
      are byte-identical regardless of `evidence_provenance`; `convert.actionable` stays false (the signal
      changes NO gating score — proven by test, not asserted).
- [ ] full 230+-suite green + eslint clean.
- [ ] every artifact reads as NARROW/carrier-ready (NS-9): self-asserted/WEAK/not-independence stated LOUD; no
      line claims this hardens or that disjointness is real today; the world-anchored-only caveat carried.
- [ ] VALIDATE board folded.

## §7 VERIFY/VALIDATE plan

**VERIFY (pre-build, 2-lens):** architect (the design + the per-human-vs-per-record keying + the 'unknown'
semantics + THE vacuity question: is a self-asserted carrier worth shipping, or pure theater?) + honesty
(the self-asserted-WEAK framing; that nothing reads it as independence or lets it move a gating score; the
forbidden-list §5.5 compliance). **VALIDATE (post-build, 2-lens):** code-reviewer (the measure correctness +
the advisory-isolation — does distinct_provenance truly not leak into strength/epistemic?) + honesty (no
over-claim; the pins are real). Then the full suite + the north-star §6 drift pre-flight.

## §8 VERIFY board (pre-build) — RECORDED 2026-06-22 — SCOPE RECALIBRATION (paused for USER)

2-lens board (architect + honesty). Both INDEPENDENTLY converged: the advisory **count** is the problem; the
**carrier field** is the only worth-it part — and even it is contingent.

**architect — VERDICT BUILD-WITH-CHANGES ("BUILD the carrier, DROP/DEFER the count"):**
- The plan bundled two artifacts with OPPOSITE worth-it answers. **Carrier field** = worth it (the RFC §6
  named slot; a reservation so a future world-anchored source populates an existing field, no migration at the
  hard moment). **Advisory `distinct_provenance` count** = NOT worth it today: no consumer (plan §3 forbids
  every read), measures nothing real (self-asserted, §5.5), and "manufactures a number that looks like
  independence in the same object as `n_confirmers`" — the §5.3 most-tempting-wrong-substitution. "Building
  the FORBIDDEN-shaped thing one inch short of wiring it."
- If the count ever ships: [HIGH] don't co-locate it on the scored return object (leak vector); [HIGH]
  `config_hash` is TOP-LEVEL not in-payload — an in-payload field enters `record_id` + `idempotency_key`
  (two CONFIRMs differing only in provenance = distinct records — decide on purpose); [MED] per-human
  aggregation under-specified; [MED] 'unknown' bucket -> count=1 misleads (should be 0); [MED] add a NEGATIVE
  structural pin that the field can't reach `independenceLabel`; [LOW] document under `payload.properties`.

**honesty — VERDICT HONEST-WITH-FIXES** (load-bearing posture HOLDS — lift-point isolation verified, §0 leads
with "does NOT harden," config_hash analogy honestly quoted — but 3 HIGH framing seams, ALL on the count):
- [HIGH] "disjointness measure" reads as measuring REAL independence — it measures asserted-string
  distinctness, a NON-measure of disjointness (zero correlation with real independence). [HIGH]
  `distinct_provenance` name invites the L4 landmine. [HIGH] all-absent -> count=1 reads as "1 source" when
  it's "no signal" (must be 0). [MED] config_hash is never surfaced as a COUNT — the analogy under-protects
  the new exposure surface. [MED] §0 residual not as LOUD as plans/12's bar. [MED] the vacuity disposition is
  assumed-BUILD, not earned-and-recorded (plans/11 precedent) — and **DEFER may be the honest call if no
  world-anchored provenance source is near** (it is NOT — research/23 §7: the signal is the OPEN frontier).

**Disposition — RECALIBRATION (paused for USER, not auto-built):** dropping the count resolves every honesty
HIGH (they were all about the count). What remains is a CARRIER field whose worth is contingent on a
world-anchored provenance source that does NOT yet exist (it is the open U2 frontier). That makes the carrier
a *schema reservation*, not an epistemic gain — building it now reserves a slot before knowing what populates
it. This is a material scope change from the menu's "touches the actual U2 axis," so it is surfaced to the
USER (thin-carrier-reservation vs defer-and-do-the-world-anchored-signal-first vs pivot to U1-stake) rather
than power-through.

## §9 VALIDATE board (post-build) — TO BE RECORDED

## §9 VALIDATE board (post-build) — TO BE RECORDED
