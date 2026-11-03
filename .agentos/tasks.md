# Tasks

## Now

- [ ] Add the current next action to `agentos status` (`statusAgentOS` in `src/core.ts`), taken from the newest checkpoint record (task id `unify-current-task-state`).

## Acceptance criteria

- After `agentos checkpoint --task <id> --next "<action>"`, `agentos status`, `agentos context <engine> --task <id>` and `agentos resume --task <id>` present exactly one current next action: the most recently saved one.
- Older or contradicting next-action text in handoff.md or tasks.md is not presented as current; the next agent can tell it is superseded.
- Nothing is silently deleted.

## Next

- [ ] tasks.md § Now: mark items written before the checkpoint as superseded in `context` and in child-repo `status` ("Open tasks (Now)").
- [ ] Prose edited after the checkpoint: mark the checkpoint's Next as older in `context` instead of showing two unlabelled next actions.
- [ ] Release only after the Claude Code interruption trial (carried over from `reliable-engine-handoffs`).

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Make the default Obsidian layout expose the actual Brain records.
