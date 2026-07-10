---
lifecycle: persistent
plan: 48
issue: 80
finding: F4
severity: medium
lens: correctness
shadow: true
---

# plans/48 — F4: wcons keeps a stale VOUCH on revision (readdir order, not recency)

## Problem (premise-probed at source)

`wcons` (`v0/src/trust/consensus.js:47-56`) groups vouches by human, keeping each human's STRONGEST
vouching persona. The per-voucher weight `w = alpha(d.r + d.s) * d.b` is a function of the voucher
**persona's DIRECT reputation**, NOT of the specific VOUCH record. So two VOUCH records from the same
persona (an honest revision `0.95` then `0.02`) compute an **identical** `w`. The tie-break at `:55` is
strict `w > prev.weight`, so on a tie the **first-encountered** record wins — and `vouches` derives from
`fs.readdirSync` over content-addressed filenames (`record-store.js`), an order uncorrelated with recency.
A revision/revocation is silently dropped, and the result is non-deterministic across identical inputs.

Issue #80. Advisory/SHADOW today (wcons gates nothing, INV-6), but the result becomes incorrect the moment wcons/TRUST is wired toward gating.

## Runtime Probes (the issue's fix sketch keys on `vch.t` — probed)

- Probe: `grep 't' v0/src/frame/frame.js` → `frame.js:47  if (t !== undefined) body.t = t;` — **`t` is OPTIONAL** (created_at, epoch ms; set only when the emitter passes it). A VOUCH without `t` has NO `t` field.
- Consequence: the issue's `(vch.t ?? -Infinity)`-only tie-break is **not fully deterministic** — two `t`-less vouches tie at `-Infinity` and the first-encountered (readdir) still wins. The fix needs a fallback that is ALWAYS present.
- Probe: `record.js:11` schema + `read-gate.js` → every verified record carries `record_id` (string, required) and `seq` (required frame field; monotonic for a revising persona). Both are always present.

## Design

Replace the strict-`>` tie-break with a fully-deterministic recency chain. Greater weight wins; on a
**weight tie**, prefer the more RECENT vouch, with a total-order fallback so the winner never depends on
readdir order:

1. `t` (epoch ms) — the semantic recency signal, when present;
2. `seq` — always present, monotonic for a revising persona (a revision has a higher seq);
3. `record_id` — a lexicographic total order, so identical `(w, t, seq)` still resolves deterministically.

```js
// pure, side-effect-free comparator: is `vch` (weight w) a stricter winner than the incumbent `prev`?
function beats(w, vch, prev) {
  if (!prev) return true;
  if (w !== prev.weight) return w > prev.weight;
  const at = Number.isFinite(vch.t) ? vch.t : -Infinity;
  const bt = Number.isFinite(prev.t) ? prev.t : -Infinity;
  if (at !== bt) return at > bt;
  const as = Number.isFinite(vch.seq) ? vch.seq : -Infinity;
  const bs = Number.isFinite(prev.seq) ? prev.seq : -Infinity;
  if (as !== bs) return as > bs;
  return String(vch.record_id) > String(prev.record_id);
}
// in the loop: track t/seq/record_id on the incumbent so the comparator is total.
const prev = perHuman.get(vHuman);
if (beats(w, vch, prev)) perHuman.set(vHuman, { weight: w, vouch: clamp01(vch.payload.value), t: vch.t, seq: vch.seq, record_id: vch.record_id });
```

## OPEN QUESTIONS for the VERIFY board

1. **Cross-persona weight tie semantics.** Recency correctly picks the revision for the SAME persona. But when TWO DIFFERENT personas of the same human tie in weight, is "most recent" the right representative of the human's opinion, or should the tie resolve some other way (higher vouch value? just record_id determinism)? Recency is defensible (the human's latest opinion) + matches the issue — confirm.
2. **`t` trust.** `t` is emitter-supplied (not kernel-stamped) — a voucher could backdate/forward-date `t` to keep a stale vouch winning or force a revision. Is `seq` (harder to forge monotonically) the safer PRIMARY signal, with `t` demoted or dropped? (wcons is SHADOW; but the fix should not add a NEW forgeable lever.) Weigh `t`-first vs `seq`-first.
3. **Determinism completeness.** Is `t → seq → record_id` a genuine total order (no residual readdir dependence)? Any NaN/negative/duplicate-seq edge?

## RED test list (the current suite has NONE for a repeated VOUCH — that is why this is invisible)

- **the repro:** Alice earns DIRECT standing; VOUCH zTarget `0.95` @t=2000 then `0.02` @t=5000 → `wcons` returns `0.02` (the revision), not `0.95`.
- **order-independence:** emit the two vouches in BOTH orders → the fix returns the same result; the old code selected either record depending on content-addressed `readdir` order (the VALIDATE probe observed both `0.02` and `0.95` across trials — a readdir-order artifact, not a fixed outcome).
- **`t`-absent fallback:** two same-persona vouches with NO `t`, different `seq` → the higher-`seq` (later) wins deterministically.
- **full-tie determinism:** identical `(w, t, seq)` across two records → `record_id` breaks the tie (stable across runs).
- **revocation:** revise to `0.0` → reflected.
- **regression:** the existing wcons tests (strongest-persona, Sybil-~0, self-exclusion, cold-start) unchanged.

## HETS Spawn Plan

- **VERIFY board (read-only):** `architect` (the 3 OPEN QUESTIONS — esp. the `t`-forgeability + cross-persona-tie semantics) + `code-reviewer` (determinism completeness, NaN/edge, the comparator's totality). Parallel.
- **VALIDATE board (post-build):** `code-reviewer` (single lens — SHADOW/advisory correctness, not the high-stakes kernel/security class; Rule 2 → one lens suffices). Live-re-probe the repro against the BUILT code (Rule 2a).
- **pre-PR:** `coderabbit review --plain --base main`.

## VERIFY board result (architect + code-reviewer — both `sound-with-changes`; split on Q2, resolved)

Both PROBED and converged on the facts; the architect corrected THIS plan's premise.

- **Q1 cross-persona tie → recency chain, VALUE-BLIND.** A weight tie means equally-strong personas, so the "strongest persona" invariant holds regardless; recency just picks a deterministic representative. **Load-bearing: never tie-break on the vouch VALUE** — that reintroduces the persona-multiplication lever (add a persona vouching 1.0 to steer). record_id/recency are value-blind.
- **Q2 t-vs-seq → t-FIRST (keep the plan's comparator; FIX the justification).** The plan's "seq is harder to forge" was **factually FALSE** (architect+reviewer HIGH): `seq` is emitter-supplied + UNVALIDATED (`record.js` validateRecord only shape-checks; `signed-edge.js:48-50` "seq passes UNVALIDATED"), *and* documented "per-session" (`record-schema.json`) → **resets across sessions**, so seq-first would break the core case (a later-session revision carries a LOWER seq). `t` is wall-clock + cross-session, no more forgeable, and `direct.js` decay ALREADY trusts emitter `t` → reuses an existing surface, opens no new one.
- **Q3 determinism → `record_id` is the FLOOR that closes F4** (always present, content-addressed, unique per distinct nonce → distinct hash); `t`/`seq` are an advisory layer atop it. Exact-float `w` equality is intentional (`w` is persona-pure); harden the pre-tie guard `w <= 0` → `!(w > 0)` to also skip NaN.

Folded findings: forgeable-`t`/`seq` is tolerable ONLY under SHADOW + read-gate confinement → **named FORWARD-CONTRACT comment** (kernel-stamped receive-time / authenticated monotonic counter before wcons gates). Export `beats` for cheap edge unit-tests. Tests: a cross-persona-tie test (two personas of one human, identical histories → equal `w`); a seq-reset residual test (later record LOWER seq, no `t` → documents current behavior); a record_id-floor test.

## Finalized design (supersedes §Design)

Comparator `beats(w, vch, prev)` — `w` (greater wins) → `t` (finite, else -Inf) → `seq` (finite, else -Inf) → `String(record_id)` (the always-present total-order floor). Track `{weight, vouch, t, seq, record_id}` on the incumbent. Pre-tie guard `if (!(w > 0)) continue;` (skips non-positive AND NaN). Export `beats`. Header + inline comment: record_id is the determinism floor; t/seq advisory + forgeable + SHADOW; the forward-contract.

## VALIDATE result (code-reviewer, single lens — Rule 2 lower-stakes; live-re-probed)

Verdict **ship-with-nits**. The reviewer LIVE-probed the built code against the real signed-frame/record-store
pipeline (not the unit mocks): a 20-trial side-by-side old-vs-new comparator on real `readdir` output showed
OLD returns `[0.02, 0.95]` (non-deterministic, order-dependent — the bug) and NEW returns `[0.02]`
(deterministic). Confirmed: the NaN guard is a genuine fix (a NaN `w` on a first-encounter vouch would poison
the whole `num/den` aggregate); no regression in the fold (t/seq/record_id are book-keeping only); comments do
not over-claim.

Folded: **HIGH — 2 of 3 plan-committed tests were missing** (I shipped only the record_id-floor test). Added the
cross-persona-tie test (two personas of one human, identical histories → equal `w` → recency picks, value-blind
end-to-end — also fixes the LOW "arity check is a weak proxy") + the seq-reset residual unit test (pins the
documented no-t + session-reset residual). 33/0 trust, 789/0 full, eslint 0. NOTEs (direct() recomputed per-vouch;
seq-absent branch unreachable via the store) are pre-existing/defensive — not folded.

**Final:** 789/0 full suite (+13 F4 tests: 4 integration + 9 beats unit), eslint 0, CodeRabbit clean (below).

## Routing Decision

```json
{ "recommendation": "borderline", "rationale": "correctness fix to a SHADOW/advisory trust-consensus module; small + well-specified, but trust-substrate and a forgeable-`t` design question warrants a VERIFY lens. Right-sized: 2-lens VERIFY, 1-lens VALIDATE (not the full 3-lens kernel/security tier)." }
```
