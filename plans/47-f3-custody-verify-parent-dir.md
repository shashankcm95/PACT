---
lifecycle: persistent
plan: 47
issue: 79
finding: F3
severity: medium-high
lens: offensive-security
---

# plans/47 — F3: custody-verify attests the wrapper file but not its parent dir

## Problem (premise-probed at source)

`custody-verify.js` check **C2.5** (the wrapper-integrity leg) inspects only the wrapper
**file**:

- gather (`gatherCustodyFacts`, lines 176-182): `fs.lstatSync(wrapperPath)` → `{ isFile, worldOrGroupWritable }`
- assess (`assessCustody`, lines 104-112): FAIL on non-regular / `&0o022`; else PASS *"sudo wrapper is a regular, non-group/world-writable file"*

It **never inspects the wrapper's parent directory.** Directory write permission governs
`rename`/`unlink`+recreate of an entry regardless of that entry's own mode — so a
`root:root 0755` wrapper inside a **host-writable dir** (host-owned, or group/world-writable)
is replaceable by the host: `mv wrapper wrapper.bak && cp evil wrapper`. sudo then execs the
attacker's `wrapper` **as the broker uid** → code-exec as the broker uid → broker-key exfil —
the exact privesc C2.5 claims to defend. The tool prints a false **"not hijackable" PASS** on
a hijackable deployment. For an operator TRUST tool, a false PASS on the precise privesc path
is worse than no check.

The **key file's** parent dir has the same rename/replace shape (partially disclosed at
`broker-core.js:126-127` "Dir-level write is a deeper residual"), though C3-liveness backstops
a key *substitution* (a swapped key → persona mismatch → C3 FAIL).

Issue #79. Kin to #76 (`registry-store.js` `assertTrustedDirStat` — root-owned parent).

## Runtime Probes

- Probe: `grep -n 'dirname\|wrapperDir\|keyDir' v0/src/identity/custody-verify.js` → **0 hits** — no parent-dir logic exists (gap confirmed).
- Probe: `head -20 v0/src/identity/custody-verify.js | grep require` → the file requires `fs`, `crypto`, and lib modules but **NOT `path`** → the fix must add `const path = require('path')`.
- Probe: POSIX semantics — write permission on a directory is necessary+sufficient to `rename`/`unlink` an entry in it, independent of the entry's own owner/mode (except the **sticky bit** `0o1000`, which restricts delete/rename in a group/world-writable dir to the entry's owner / dir owner / root).
- Probe: test harness — bespoke `test()`+`node:assert/strict`; `freshKey(mode)` builds a temp dir + key; `IS_ROOT` skips owner-deny tests under root. Dir-mode tests must mirror the `IS_ROOT` skip (a 000/host-owned dir does not constrain root).

## Design

Add a **parent-dir attestation** to C2.5 (wrapper) and a sibling leg for the key dir.

### Fact additions (`gatherCustodyFacts`)

```js
const path = require('path'); // add to the requires

// wrapper dir (only when wrapperPath provided)
let wrapperDir = null;
if (typeof wrapperPath === 'string' && wrapperPath.length) {
  try {
    const st = fs.lstatSync(path.dirname(wrapperPath)); // lstat: a symlinked parent is itself a hijack vector
    wrapperDir = { ok: true, isDir: st.isDirectory(), ownerUid: st.uid,
                   worldOrGroupWritable: !!(st.mode & 0o022), sticky: !!(st.mode & 0o1000) };
  } catch (e) { wrapperDir = { ok: false, errno: (e && e.code) || 'EUNKNOWN' }; }
}
// key dir — same shape (dirname(keyFile))
```

### Verdict (`assessCustody`)

`hostWritableDir(dir, runningUid)` predicate — a dir is host-hijackable iff **any**:
- `!dir.isDir` (symlink / non-dir final component — hijackable / unverifiable), OR
- `dir.ownerUid === runningUid` (host owns it → owner-write + can chmod), OR
- `dir.worldOrGroupWritable && !dir.sticky` (any non-owner can rename/delete; sticky exempts a non-host-owned entry).

Conservative / fail-closed: an unknown owner (`runningUid` null) or an lstat error → cannot
prove safe → FAIL (mirrors C0/C2 fail-closed style).

- **C2.5-wrapperdir**: HARD FAIL when `hostWritableDir(wrapperDir, runningUid)` — this is the primary privesc vector.
- **key-dir leg**: see OPEN QUESTIONS — hard-FAIL vs loud residual (C3 backstops key substitution).

## OPEN QUESTIONS for the VERIFY board

1. **Sticky-bit exemption** — keep it (a world-writable *sticky* dir with a non-host-owned wrapper is genuinely not rename-hijackable, e.g. `/tmp`), or drop it as YAGNI/deployment-smell and fail any `&0o022` wrapper dir unconditionally (simpler, stricter, one fewer fact)? Wrappers in `/tmp` are not a real deployment.
2. **Key-dir severity** — hard-FAIL like the wrapper dir, or a loud NOTE/residual? C3-liveness already fails on a *substituted* key (persona mismatch), so a key-dir hijack is strictly weaker than a wrapper-dir hijack. Over-failing a legit deployment (key dir owned by the broker uid, not root) is a false alarm.
3. **Ownership predicate** — `ownerUid === runningUid` (host-owned = bad; broker-uid-owned dir is fine) vs the stricter #76 **root-owned-only**. The former passes a broker-uid-owned wrapper dir (a valid deployment); the latter matches #76 but false-FAILs it. Which is correct for the deployment model?
4. **Ancestor chain** — immediate parent only (this plan) vs the full chain to `/` (a host-writable *grandparent* lets the host rename the parent dir itself). Full-chain is more thorough but costlier + more false-positive-prone. Immediate-parent + a residual naming the chain gap?
5. **DRY vs #76** — extract a shared pure `dirTrust` predicate, or keep inline (paradigm mismatch: #76 THROWS + root-owned; here verdict-accumulate + not-host-owned)?

## RED-first test list (write failing, then implement)

Synthetic `assessCustody` (the cross-uid TRUE branch):
- wrapper dir host-owned (`ownerUid === runningUid`) → C2.5 (or C2.5-wrapperdir) FAIL, even with a clean wrapper file
- wrapper dir group/world-writable non-sticky → FAIL
- wrapper dir world-writable **sticky** + non-host-owned → PASS (if sticky exemption kept) / FAIL (if dropped) — pin the board's decision
- wrapper dir a symlink (`isDir:false`) → FAIL
- wrapper dir lstat error (`ok:false`) → FAIL (fail-closed)
- a clean wrapper file in a clean root-owned dir → still PASS (no regression on the happy path)
- key-dir leg per the board's severity decision

Real-I/O `gatherCustodyFacts` (same-uid, `IS_ROOT`-skipped where owner-deny is needed):
- a real host-owned wrapper dir → `wrapperDir.ownerUid === runningUid` detected
- a real `0777` wrapper dir → `worldOrGroupWritable:true`
- a real sticky `0o1777` dir → `sticky:true`

## HETS Spawn Plan

- **VERIFY board (pre-build, read-only):** `architect` (design soundness; resolve the 5 OPEN QUESTIONS; false-positive risk on legit deployments) + `hacker` (adversarial: bypass? new false-negative? the lstat-dir → sudo-exec TOCTOU window; bind-mounts; the `..`/symlink-parent case; does the sticky exemption itself open a hole?). Parallel.
- **VALIDATE board (post-build, 3-lens, Rule 2):** `code-reviewer` (correctness / edge / fd-safety) + `hacker` (LIVE re-probe the BUILT tool against real synthetic dirs — Rule 2a: a green suite is a hypothesis) + `honesty-auditor` (the PASS/residual wording does not over-claim; NS-9 honesty preserved; no un-filed "FILED" residual).
- **pre-PR:** `coderabbit review --agent --base main` (secret-free tree).

## Routing Decision

```json
{ "recommendation": "route", "rationale": "security fix to a trust primitive (custody-verify) touching auth/custody logic; Rule 2 mandates the 3-lens tier; multi-file (src + test)" }
```

## VERIFY board result (architect + hacker, both `needs-revision` — converged)

The board caught that the dir-only plan **leaves a more direct hole open** and expanded the fix
to the full "the host can modify the wrapper sudo execs" attack class. Resolutions:

| Open question | Decision |
|---|---|
| Sticky exemption | **DROP** — fail any group/world-writable wrapper dir unconditionally (KISS; zero FP on real deployments). |
| Key-dir severity | **NOTE, not FAIL** — broker-uid-owned key dirs are normal; dir-write can't exfil a 0600 key; C3 backstops substitution. Report owner+writability, cross-ref C3. |
| Ownership predicate | **root-owned-only allowlist `{0}`** for the wrapper file+dir+ancestors (the denylist had a third-uid false-negative). |
| Ancestor chain | **FULL chain to `/`** — immediate-parent-only misses grandparent-rename. Each component root-owned + not `&0o022`. |
| DRY vs #76 | **INLINE** — mirror #76's SHAPE (`isDir` + `&0o022` + `uid===0`, disclosed residual); rule-of-three before extracting. |

Two **HIGH** findings folded (both agents, independently):
- **H1 — the wrapper FILE owner is unchecked.** A host-owned `0755`/`0700` wrapper in a root-owned dir passes today (owner always holds write; no rename/dir-write needed) — more direct than the dir vector. → add `ownerUid` to the wrapper file fact; FAIL when `!== 0`.
- **H2 — root-owned-only allowlist** (see table) replaces the denylist; fail-closed by construction.

Folded **MEDIUM/LOW**: `realpathSync` the wrapperPath once, then lstat-walk the RESOLVED ancestors (else macOS `/var`→`/private/var` false-positives); validate wrapperPath absolute + no-`..` inside custody-verify (don't trust the launcher transitively); an explicitly-provided **absent** wrapper → FAIL (not a soft NOTE); a loud **NS-9 snapshot/TOCTOU residual** (lstat is a point-in-time snapshot; Node sync has no `openat`, so it attests static topology, not a post-check ancestor swap) mirroring `registry-store.js:227-228`.

**Trade-off accepted (articulated, per architect):** root-owned-only false-FAILs a *broker-uid-owned* wrapper (a non-standard but safe posture) and a *locked-down `0700` root ancestor* (host can't traverse to verify → EACCES → fail-closed). Both are HONEST "cannot attest from the host" verdicts consistent with the tool's existing fail-closed-on-cannot-prove stance (C2 owner-unknown); the operator resolves out-of-band (NS-7). The message names the `chown root` remedy.

## Finalized design (supersedes §Design above where they differ)

**gather** — add `const path = require('path')`; a local `statDir(p)` helper (lstat → `{ok,isDir,ownerUid,worldOrGroupWritable}|{ok:false,errno}`):
- wrapper: validate absolute + no `..` → `realpathSync` (fallback to raw on throw) → lstat the file (`{ok,isFile,ownerUid,worldOrGroupWritable}`) → walk `path.dirname(resolved)` up to `/` collecting `statDir` per component (loop guard: stop when `dirname(x)===x`).
- keyDir: `statDir(dirname(keyFile))` (name-based is fine for a NOTE).

**assess** — C2.5 wrapper ladder: pathInvalid→FAIL · !ok(absent/unreachable)→FAIL · !isFile→FAIL · worldOrGroupWritable→FAIL · `ownerUid!==0`→FAIL(chown root) · else walk ancestors (`assessWrapperChain`: first component that is unstattable / non-dir / `&0o022` / `uid!==0` → FAIL) · else PASS + push the snapshot residual. New **C2.6-keydir** NOTE (owner+writability, C3 cross-ref) — never gates `verified`.

## RED test list (final — supersedes the list above)

Synthetic `assessCustody` (`WRAP_OK` constant updated to `{ok:true,isFile:true,ownerUid:0,worldOrGroupWritable:false,ancestors:[{path:'/',ok:true,isDir:true,ownerUid:0,worldOrGroupWritable:false}]}`):
- host-owned wrapper FILE (`ownerUid:501`) → C2.5 FAIL /root-owned|chown/
- third-uid wrapper FILE (`ownerUid:1234`) → FAIL (not just the running uid)
- clean file but a **non-root ancestor** (`ownerUid:1234`) → FAIL /ancestor|grandparent/
- clean file but a **group/world-writable ancestor** (`&0o022`) → FAIL
- a **symlink/non-dir ancestor** (`isDir:false`) → FAIL
- an **unstattable ancestor** (`ok:false`) → FAIL (fail-closed)
- `pathInvalid` (relative / `..`) wrapper fact → FAIL
- **absent** wrapper (`ok:false, errno:ENOENT`) → FAIL (not NOTE)
- clean file + clean chain → PASS **and** a snapshot residual present
- key-dir NOTE emitted (C2.6-keydir) and does NOT flip `hostObservableChecksPassed`
- regression: every existing leg test still passes with the updated `WRAP_OK`

Real-I/O `gatherCustodyFacts` (`IS_ROOT`-skipped where owner-deny is needed):
- host-owned wrapper dir → an ancestor fact with `ownerUid === runningUid` (and `!== 0`)
- a `0777` ancestor → `worldOrGroupWritable:true`
- `realpathSync` resolves a symlinked wrapperPath before the walk (no `/var` false-positive)
- keyDir fact present with `ownerUid`

## VALIDATE board result (3-lens; code-reviewer + hacker live-probe + honesty-auditor)

Verdicts: reviewer **needs-fix**, hacker **needs-fix**, honesty **ship-with-nits**. One real HIGH (both technical
lenses, live-proven), all folded:

- **HIGH — symlink-container gap (live-proven).** The walk validated only the REALPATH-RESOLVED target's ancestry, never the directory that literally holds a symlinked `wrapperPath`. `sudo` execs the RAW path (`broker-launch.js:64`) and re-resolves it at every exec, so a host-writable dir holding a symlink-to-a-root-owned-wrapper was a standing hijack that C2.5 PASSed. **Fix:** walk the ancestors of BOTH the raw `wrapperPath` AND the resolved target (deduped), with a symlink-aware rule (`statDir.isSymlink`; a symlink ancestor is clean ONLY if root-owned — it cannot be repointed in place; a non-root symlink FAILs). Re-probed live: DIR-A now appears in the chain and the verdict FAILs (was absent + PASS before).
- **MEDIUM (honesty) — stale header docstring** named `custodyMechanismVerified` (the field NS-9 deliberately removed). Rewritten to name `hostObservableChecksPassed`.
- **MEDIUM (honesty) — no integrated real-path test.** Added: an integrated `verifyCrossUidCustody` pipe test + a seam test feeding REAL gathered `ancestors` into `assessCustody`.
- **LOW (hacker) — POSIX-ACL blind spot** (`& 0o022` cannot see an ACL grant): disclosed in the PASS residual (`getfacl` out-of-band) — parsing ACLs is YAGNI for SHADOW.
- **LOW (reviewer) — magic number** `4096` → `MAX_ANCESTOR_WALK` constant.
- Reviewer NOTE-level: SRP extraction of the C2.5 ladder — deferred (scope discipline on a security fix; the ladder mirrors the existing `assessWrapperChain` pattern and stays readable).

Honesty compliance check: full compliance with the VERIFY-board contract (sticky dropped, key-dir=NOTE, root-owned-only allowlist, full chain, inline mirror of #76, NS-9 residuals honest, no un-filed "FILED" residual).

**Final:** 776/0 full suite (+20 F3 tests), eslint 0, live adversarial probe confirms the HIGH closed.
