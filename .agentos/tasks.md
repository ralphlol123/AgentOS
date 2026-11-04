# Tasks

## Now

- [ ] tasks.md § Now: mark items written before the checkpoint as superseded in `context` and in child-repo `status` ("Open tasks (Now)") (task id `unify-current-task-state`).

## Acceptance criteria

- After `agentos checkpoint --task <id> --next "<action>"`, `agentos status`, `agentos context <engine> --task <id>` and `agentos resume --task <id>` present exactly one current next action: the most recently saved one.
- Older or contradicting next-action text in handoff.md or tasks.md is not presented as current; the next agent can tell it is superseded.
- Nothing is silently deleted.

## Next

- [ ] Next-action truncation in the managed handoff block (300 characters) and `status` across several tasks: tracked separately.
- [ ] Bare `agentos checkpoint` (no `--task`) still writes under the objective slug while bare `resume`/`context` read the checkpoint task (docs/checkpoints.md); decide whether writes follow the same rule.
- [ ] `.agentos/brain/index.json` rewritten with CRLF in a `core.autocrlf=true` checkout (`brain index --dry-run`: Would refresh; content-identical): tracked separately.

## Later

- [ ] Body-text retrieval beyond Brain records: `brain search` and `decisions.md` section bodies (`context --about` covers Brain record bodies; the task id stays separate from the phrase).
- [ ] `brain propose --from <read-only copy>`: strip the copy's frontmatter and banner (today it is refused).
