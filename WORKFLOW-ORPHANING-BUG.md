# Bug report — background Workflow tasks orphaned on session rotation/compaction

**Filed:** 2026-06-21 · **Context:** Claude Code (claude-code 2.1.181), during the PACT proto-planning
session. **Concerns:** the Claude Code **Workflow tool** (background multi-agent orchestration) +
background task lifecycle. Self-contained so another session can pick up the investigation.

## Summary
Long-running **background `Workflow` tasks silently stall and become untracked ("orphaned")** partway
through, when the owning session undergoes a **context compaction / session-id rotation**. The work
stops, no completion notification fires, and the task can no longer be stopped or resumed from the new
session. Observed **4 times in one session** (2 pairs).

## User-observed symptom
Workflows show as "stopped"/yellow in `/workflows`; the **tool-use counter stops incrementing** for
the run. User hypothesis: *"starting another conversation while previous workflows are running stops
them — may be a boundary set by Claude itself."* (See "Most likely cause" — the trigger appears to be
**compaction/rotation**, which can coincide with conversation activity, not new turns per se.)

## Evidence (firsthand, this session)
- **Simultaneous freeze signature.** Each orphaned pair stopped writing at the **exact same second**:
  - `w1kl86xtz` (hierarchical) + `wrvi2qgta` (NFT-provenance) → both last wrote `10:16:39`.
  - `wx83yk0lg` (interim-security) + `w86kreea4` (career-ladder) → both last wrote `11:00:12`.
  A simultaneous stop across independent runs points at a **shared parent event** (session lifecycle),
  not per-run failure.
- **Zero post-freeze activity.** `find <workflow-dir> -type f` newest mtime stopped at the freeze
  second; checked ~13 min later, still no new writes.
- **Tasks untracked in the new session.** `TaskStop <orphaned-id>` returns **`No task found with ID`**
  for every orphaned task — i.e. the current (post-rotation) session has no handle to them.
- **Session-id rotation correlates.** The session/transcript dir id changed across the freezes
  (`c6f86715-…` → `a999d087-…`). Output `.output` files for orphaned runs were created as **0-byte
  placeholders** (result only written on completion, which never came).
- Note: runs that completed *before* a rotation wrote full results (70–137 KB) and fired notifications
  normally — so the Workflow mechanism itself works; only **in-flight runs crossing a rotation** die.

## Most likely cause (hypothesis)
Background `Workflow` tasks are tied to the **owning session's runId / lifecycle**. Per a project memory
note: *"kernel `runId = sha256(session_id)[:16]` ROTATES at compaction."* When the context compacts
and the session rotates, the in-flight background task is **orphaned**: its worker stalls (no further
writes), the new session has no handle (`TaskStop` → not found), and no completion notification is
delivered. The user's "new conversation stops them" is consistent if a new turn/large context triggers
the compaction that rotates the session.

## Reproduction (suspected)
1. Launch one or more long-running (`~15–25 min`) `Workflow` background tasks.
2. Drive enough conversation to trigger a **context compaction** (or otherwise rotate the session id)
   before they finish.
3. Observe: in-flight workflows stop writing at the compaction instant; `TaskStop` → "No task found";
   no completion notification.

## Workaround (confirmed working)
**Relaunch fresh in the current session via the persisted script file:**
`Workflow({ scriptPath: "<…>/workflows/scripts/<name>-<runId>.js" })` — the script files persist on
disk under the session's `workflows/scripts/` dir, so a fresh launch re-runs the whole script in the
*current* session (properly tracked, notifies on completion). **`resumeFromRunId` is unreliable across
a rotation** (the prior run's cache/journal belongs to the rotated-away session; `TaskStop` already
shows it's untracked) — prefer a clean relaunch.

**More robust alternative for in-turn work:** run agents as **foreground `Agent` calls** (not
`run_in_background`, not `Workflow`). Foreground agents complete *within the turn*, so they cannot be
orphaned by a later rotation. Trade-off: no deterministic multi-phase pipeline, and a long turn.

## Suggested investigation (for the carrying-on session)
1. Confirm whether background `Workflow`/Task workers **keep running or stall** after a session
   rotation (ps for the worker pid vs the freeze timestamp — in this session the worker showed no file
   writes post-freeze, suggesting it stalls rather than continues headless).
2. Determine whether background tasks can be **re-parented / resumed** across a session rotation, or
   whether the runId binding is hard. If hard, consider persisting a task→run mapping that survives
   rotation so `TaskStop`/resume work cross-session.
3. Check whether **compaction can be deferred** while background tasks are in flight, or whether
   in-flight tasks can **pin** the session against rotation until they finish/checkpoint.
4. Consider emitting a **"task orphaned by rotation"** signal (instead of silent stall) so the new
   session can auto-relaunch from the persisted `scriptPath`.
5. Evaluate making `Workflow` runs **checkpoint to disk per agent** such that a post-rotation relaunch
   with `resumeFromRunId` reliably cache-hits (today same-session-only).

## Cross-references
- Project memory: `harness-runid-session-rotation` (runId rotates at compaction; agentId is the durable
  spawn key; the orchestrator can't self-compute runId post-rotation).
- This session relaunched all 4 orphaned runs successfully via the `scriptPath` workaround; all 8
  workflows ultimately completed.
