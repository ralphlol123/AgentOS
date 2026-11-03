# Claude Code → Hermes controlled interruption trial: `unify-current-task-state` (2026-11-03)

**Type: controlled interruption.** Phynceon told Claude Code to stop at a chosen point. It did not hit a real usage limit or crash. The trial shows that a second engine can recover work done after the last checkpoint. It does not show behaviour under a real limit or interrupt.

## What happened (Phynceon's private record, written before engine B started)

- Base: `a1286e9` (main after PR #69).
- Engine A: Claude Code 2.1.311, print mode. One session was resumed once.
- **Milestone:**
  - Commit `a16062d`: context marks handoff prose older than the active checkpoint as superseded.
  - Checkpoint `2026-11-03T09-05-27-224Z-af1f3cdc` at `a16062d`. Saved Next: "In src/core.ts statusAgentOS, print one 'Current next action' line from the newest checkpoint … and add a test …".
- **After the checkpoint:** one more edit. Engine A added a failing test to `test/handoff-continuity.test.js`: status shows the newest checkpoint's Next exactly once. It made no source change, no commit and no checkpoint, and then stopped.
- Engine B: Hermes developer (Choco), in a fresh session. Its only context was the workspace path and the task id.

## Engine B's reconstruction, compared with the record

Engine B wrote its reconstruction at 17:09:30 +0800. Its first repo edit was at 17:09:47.

| Point | Record | Engine B | Match |
|---|---|---|---|
| Checkpoint and saved Next | af1f3cdc at a16062d; status line plus a test | Same, quoted verbatim | yes |
| Changes since the checkpoint | One uncommitted test, no `src/` change, HEAD unchanged | Same; also saw `resume` report `drifted`, "new changed paths: test/handoff-continuity.test.js" | yes |
| What can be verified | The new test fails because `statusAgentOS` is not implemented | It ran the test: 1 test, 0 pass, 1 fail, at `:194`, with no "Current next action" line | yes |
| Next step | Implement `statusAgentOS` so the test passes | Same; it kept the test unchanged and committed it as `ecd8cfa` | yes |
| Why A stopped | Controlled stop | Marked **unknown** | correctly unknown |

Engine B did not ask a human anything. Its session log shows it did not read Phynceon's private record.

## Outcome

- **Trial: passed (controlled interruption).** Engine B recovered the checkpoint, the uncommitted work done after it and the correct next step, using only repo artifacts.
- **Gaps Engine B reported:**
  - The RED run done after the checkpoint is recorded nowhere.
  - The managed handoff block cuts Next off at 300 characters.
  - `guide.md` does not mention the status next-action line.
  - Status picks the newest checkpoint across all tasks.
- **Not covered:** a real Claude Code usage-limit or crash interruption.
