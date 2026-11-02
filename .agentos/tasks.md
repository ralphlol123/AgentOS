# Tasks

## Now

- [ ] Review `fix/reliable-engine-handoffs` and run a real cross-engine continuation trial using task id `reliable-engine-handoffs`.

## Acceptance criteria

- Context and resume distinguish current passing checks from stale receipts after code or Git changes.
- Missing Git evidence never counts as current verification.
- A damaged checkpoint is visible to `context --require-complete`; read-only inspection changes no files.
- The active checkpoint is retained or context reports budget overflow.
- Empty Brains are visible and inspection does not initialize them.
- All engine bootloaders advise milestone checkpoints and consistent task ids.

## Next

- [ ] Decide merge and release only after review and the live continuation trial.

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Consolidate current task views around checkpoints.
- [ ] Make the default Obsidian layout expose the actual Brain records.
