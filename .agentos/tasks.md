# Tasks

## Now

- [ ] Confirm CI on the new head of `fix/reliable-engine-handoffs` (PR #69) after the review fixes are pushed. The Codex → Hermes continuation trial passed (2026-11-03).

## Acceptance criteria

- Context and resume distinguish current passing checks from stale receipts after code or Git changes.
- Missing Git evidence never counts as current verification.
- A damaged checkpoint is visible to `context --require-complete`; read-only inspection changes no files.
- The active checkpoint is retained or context reports budget overflow.
- Empty Brains are visible and inspection does not initialize them.
- All engine bootloaders advise milestone checkpoints and consistent task ids.

## Next

- [ ] Merge decision: Ralph. Release only after the Claude Code interruption trial (Claude Code interrupted mid-task, another engine continues with task id `reliable-engine-handoffs`).

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Consolidate current task views around checkpoints.
- [ ] Make the default Obsidian layout expose the actual Brain records.
