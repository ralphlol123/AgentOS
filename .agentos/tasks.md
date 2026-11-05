# Tasks

## Now

- [ ] Independent review and live-engine validation for `lean-agent-team`; local implementation and automated verification are complete.

## Acceptance criteria

- New projects receive Developer, Writer and Researcher; explicit legacy and existing/custom teams remain preserved.
- Enabled role definitions coexist for Claude Code, Codex and OpenCode, with dry-run, overwrite protection and atomic rollback.
- Explicit model mappings are validated and exported; absent mappings visibly inherit the engine model.
- Documentation distinguishes configuration from live engine enforcement and measured cost savings.

## Next

- [ ] Run bounded live-engine discovery/delegation/model trials; keep exports marked unverified until evidence exists.
- [ ] Review and commit/push the lean-team changes when authorized; no release is part of this task.
- [ ] Prior task: mark tasks.md § Now entries predating the checkpoint as superseded in context/child status (`unify-current-task-state`).


- [ ] Next-action truncation in the managed handoff block (300 characters) and `status` across several tasks: tracked separately.
- [ ] Bare `agentos checkpoint` (no `--task`) still writes under the objective slug while bare `resume`/`context` read the checkpoint task (docs/checkpoints.md); decide whether writes follow the same rule.
- [ ] `.agentos/brain/index.json` rewritten with CRLF in a `core.autocrlf=true` checkout (`brain index --dry-run`: Would refresh; content-identical): tracked separately.

## Later

- [ ] Body-text retrieval beyond Brain records: `brain search` and `decisions.md` section bodies (`context --about` covers Brain record bodies; the task id stays separate from the phrase).
- [ ] `brain propose --from <read-only copy>`: strip the copy's frontmatter and banner (today it is refused).
