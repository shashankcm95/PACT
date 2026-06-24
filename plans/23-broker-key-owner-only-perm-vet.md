---
lifecycle: persistent
created: 2026-06-24
phase: broker-sign key-perm hardening — owner-only (reject group/world-READABLE), Loom -> PACT cross-improvement
status: PLANNED — pre-build. Security/custody fix (one mask constant + test).
---

# broker-sign owner-only key vet — reject a group/world-READABLE private signing key (Loom -> PACT)

> A cross-repo hardening flowing Loom -> PACT (the "improve each other where relevant" directive). Power Loom
> ported PACT's cross-uid broker; during Loom's hardening a CodeRabbit "Major" caught that the read-time key vet
> masked WRITE-only (`& 0o022`), letting a group/world-READABLE (`0644`/`0640`) private signing key through. PACT
> still carries the original `& 0o022`. This closes that loop. Source handoff:
> `claude-toolkit/docs/handoff-pact-broker-sign-keyperm.md` (treated as DATA — every claim premise-probed below).

## §0 The gap + why it matters (premise-probed firsthand @ `0145aed`)

`v0/src/identity/broker-sign.js:135` vets the broker's own private ed25519 signing key AFTER an `O_NOFOLLOW |
O_NONBLOCK` open + `fstat` on the resolved fd:

```js
if (st.mode & 0o022) { ...closeSync... return fail('key file must not be group- or world-writable'); }
```

`0o022` masks WRITE bits only. A `0644`/`0640` key — group/world-READABLE — passes, and the broker signs with it.
That defeats the entire cross-uid custody premise: any uid that can READ the key bytes can sign directly (no
`sudo`, no broker process) — the same severity class as a leaked signing key. The right mask for a PRIVATE key is
owner-only: reject ANY group/world bit (`& 0o077`). `0600` (the deployed perm) passes; `0640`/`0644`/`0666`/`0620`
are refused.

## §1 Runtime probes (firsthand — these CORRECT the handoff report)

- **P1 — the gap is real (`broker-sign.js:135`).** Mask is `& 0o022`; a `0644` key passes. CONFIRMED (read).
- **P2 — the report's "smoking gun" is INACCURATE.** The report claims `broker.test.js:198-199` "asserts a `0644`
  key is accepted." FALSE: the fixture creates EVERY key at `0600` (`broker.test.js:60`: `fs.chmodSync(keyFile,
  0o600)`), and `:199` uses that `a.keyFile` (0600) — it merely MISLABELS it "0644" in a stale comment. So `:199`
  actually tests `0600`-accepted (correct). **Do NOT "flip" `:199` to reject** — that would reject a legit `0600`
  key. CONFIRMED (read `:60`, `:198-199`; grep: the only `0644` token in the file is that comment).
- **P3 — the deployment ALREADY uses `0600`** (`docs/deployment/cross-uid-broker.md:36,42-43,50,53,56`: "the
  PRIVATE key is ... mode 0600"; `install ... -m 0600 broker.key`). The tightening MATCHES the runbook — no
  deployment break, no runbook change. CONFIRMED (grep).
- **P4 — `broker-sign.js` is the right + only place.** `custody-verify.js` C1 (`:143-144`) lstats the key for
  `isFile/size/ownerUid` — NO absolute-mode gate; C2 (`:152`) is host-read-denied; C2.5 (`:179`) is the WRAPPER's
  `& 0o022` (writable) check. None vets the key's read bits. So broker-sign's read-time vet is the backstop — it is
  just masking the wrong bits. CONFIRMED (read).
- **P5 — the wrapper `& 0o022` must STAY** (`custody-verify.js:179`, and the comment ref at `broker-sign.js`). A
  sudo WRAPPER being writable = privesc; a wrapper being READABLE is fine (it is not secret). Only the KEY vet
  changes; the wrapper mask is correct. CONFIRMED.
- **P6 — no happy-path test breaks.** Every `add()` key is `0600` (passes `& 0o077`); the only non-0600 keys are
  the existing refusal fixtures (`ww` 0666, `gw` 0620 — both still refused under the wider mask). grep: no test
  chmods a key to `0644`/`0640`. CONFIRMED.
- **P7 — no deploy scripts** (`*.sh` count = 0) — the Loom deploy-helper M-2 / portable-`resolve()` fixes are
  N/A to PACT (no skip-existing-key path, no shell `readlink -f`). CONFIRMED.

## §2 The build

1. **`broker-sign.js:135`** — `& 0o022` -> `& 0o077`; message -> `'key file must be owner-only (mode 0600) — not
   group/world accessible'`; update the comment at `:119-120` ("not group/world-writable" -> "owner-only / not
   group/world-accessible").
2. **`broker.test.js`** —
   - RELABEL `:198-199`: the key is `0600`, not `0644` — comment/message corrected to "an owner-only `0600` key is
     accepted (the vet is non-vacuous — a legit key works)". (Assertion unchanged: `0600` passes.)
   - ADD two refusal tests next to the existing `ww`(0666)/`gw`(0620) ones: a `0644` (world-readable) COPY and a
     `0640` (group-readable) COPY are REFUSED (`assert.equal(brokerFor(...)(RID), null, ...)`). This makes the new
     owner-only enforcement NON-VACUOUS (it can be shown to fail on a readable key) — the security-rule discipline.

## §3 TDD order

Add the `0644`/`0640`-refused tests FIRST -> run against the current `& 0o022` impl -> they FAIL (current impl
ACCEPTS a readable key; `brokerFor(wr)(RID)` returns a sig, not `null`). That failing pair IS the spec. Then change
the mask -> the new tests pass AND every existing test stays green (0600 fixtures unaffected). Then relabel `:198`.

## §4 VALIDATE plan (security/custody/auth diff — 3-lens)

- `hacker` — LIVE-probe the BUILT broker: a `0644`/`0640`/`0666`/`0620` key is refused; a `0600`/`0400` key still
  signs; the vet is non-bypassable (still after `O_NOFOLLOW`/`fstat`-on-fd, check-before-read preserved); the
  wrapper `& 0o022` was not touched.
- `code-reviewer` — the mask change + message + the test relabel/add; no happy-path regression; comment accuracy.
- `honesty-auditor` — the test relabel is honest (0600 not 0644); the fix matches the runbook; no over-claim that
  this makes custody "real" (custody is still a DEPLOYMENT property — same-uid is still open; this closes ONE
  custody hole, the readable-key class).

## §5 Residuals

- Custody-real remains a DEPLOYMENT property (same-uid is still open — `broker.test.js` HONEST SCOPE); this fix
  closes the readable-key class only, it does not make custody real. Carried.
- Dir-level write (a writable key DIR lets a swap) is a deeper residual, out of scope (`broker-sign.js:120`,
  plans/05 §8) — unchanged by this fix.

## §6 VERIFY / VALIDATE result — VALIDATE recorded in §7 post-build (no pre-build board: the change is a single
mask constant fully recon-probed firsthand above; the rigor is the post-build 3-lens VALIDATE).

## §7 VALIDATE result — RECORDED 2026-06-24 (3-lens; post-build; workflow `wf_ae4cc2fa`)

3-lens security tier. **hacker APPROVE (LOW only); code-reviewer CHANGES-REQUESTED (2 LOW); honesty APPROVE (no
findings).** broker suite 25/0, eslint clean on both files. The fix is correct, non-vacuous, non-bypassable, runbook-
matching, no over-claim.

- **hacker — APPROVE (live-probed the BUILT broker).** Spawned `broker-sign.js` per mode: `0644/0640/0604/0660/0606/
  0666/0444` all REFUSED (exit 1, empty stdout, fixed message); `0600/0400/0700/0500` SIGN (valid sig verifies). A
  REVERT-to-`& 0o022` copy proved the new tests exercise genuinely-new behavior (old mask signed 0644/0640). NON-
  BYPASSABLE: O_NOFOLLOW (symlink refused), check-before-read (0644 FIFO refused, no hang; 0700 dir refused), no
  TOCTOU (mode on the fstat'd fd inode; a 4000-iter 0600<->0644 race → a sig ONLY ever from a 0600 snapshot). Wrapper
  `& 0o022` byte-unchanged. LOW: isFile()-before-mode ordering (correct, optional comment); `& 0o077` masks only
  group/world bits so 0700/0500/4600 still sign (CORRECT — owner-only, not strict-0600; a strict check would
  false-refuse a 0400 key); a scope note (other workstreams in the tree → commit with an explicit pathspec).
- **code-reviewer — CHANGES-REQUESTED (2 LOW) — FOLDED.** (1) the test NAME omitted "readable" though the body now
  covers it → renamed to "...world-or-group-readable / world-or-group-writable...". (2) a `--`-vs-em-dash in the
  failure MESSAGE string → ASCII `--` (PACT's other fail-messages are ASCII; the comment em-dashes are house-style
  prose, ESLint-clean, kept). Confirmed: mask arithmetic correct; old-mask gap real (`0o640 & 0o022 === 0`); 25/25
  green; relabel accurate.
- **honesty — APPROVE (no findings).** Relabel HONEST (fixture is 0600 @ `broker.test.js:60`; the old "0644" was a
  stale mislabel; the report's "flip :198" would have rejected a legit key — correctly NOT done). No over-claim that
  custody is REAL (same-uid stays open; this closes the readable-key class only). Runbook-already-0600 TRUE
  (`cross-uid-broker.md:43`). custody-verify not a parallel offender; the wrapper `& 0o022` correctly untouched.
  §5 residual honestly carries custody-as-deployment-property.

**LANDING NOTE:** built on branch `feat/u1-stake-s4-slash` (which carries the USER's S4 SLASH commit `5b57009`,
unrelated). The broker fix is INDEPENDENT and must land as its OWN PR off fresh `origin/main` (`0145aed`), NOT on the
S4 branch — commit with an explicit pathspec (hacker LOW). Landing approach is the USER's call (active concurrent
work in the tree).
