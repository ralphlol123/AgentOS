# Handoff

## Current objective

Maintain AgentOS dogfood state accurately while larger AgentOS implementation work is deferred.

## Scope

- Repo: `agentos-for-projects` only.
- In scope: `.agentos/tasks.md`, `.agentos/handoff.md`, roadmap alignment, current-state clarity.
- Out of scope: `agentos run`, local skills implementation, Claude legacy migration, custom/local agents implementation, npm publish, and re-installing AgentOS into KargaX.

## Current state

AgentOS core is stable. Latest verified package commit is `c9c9fc8 chore: optimize AgentOS context loading`; local `main` is aligned with `origin/main` before this state-only update.

Completed product state:

- TypeScript CLI MVP, init/status/doctor/handoff/prompt/compact/link-obsidian are implemented.
- npm/pnpm/Bun compatibility, Bun CI, `doctor --json`, YAML parser, package metadata, and dry-run publish flow are implemented.
- Phase 1 agent model is implemented: minimal delivery team plus detected frontend/backend specialists and on-demand skills index.
- Token-efficiency hardening is complete and pushed.

Recent KargaX findings:

- KargaX AgentOS trial showed local skill bodies are useful for non-Hermes engines because a skills index alone does not teach Claude/OpenCode the skill procedure.
- Full local `SKILL.md` copies can increase token usage; future default should be compact summaries with full mode opt-in.
- Custom/local agent support is incomplete: `doctor --fix` drops unknown agents such as `project-manager` because the current built-in role model does not preserve undeclared/custom IDs.
- KargaX Obsidian linking failed for the `app` user when the target folder was owned by `hermes:hermes`; cross-user permissions need clearer guidance/diagnostics.
- KargaX has been rolled back to `.claude`; AgentOS is no longer active in that workspace for now.

Deferred roadmap state:

- The Obsidian roadmap is the source of truth for deferred larger work.
- Deferred until usage budget recovers: AgentOS Local Skills + Legacy Claude Migration, custom/local AgentOS agents, planning/project-manager support.

## Last completed step

Updated dogfood task state to stop claiming token-efficiency hardening still needs commit/push and to record KargaX rollback/deferred sprint status.

## Files changed

- `.agentos/tasks.md`
- `.agentos/handoff.md`

## Tests run

- `node dist/cli.js doctor` — PASS.
- `node dist/cli.js status` — PASS.
- `git diff --check` — PASS.

## Known warnings / failures

None known in the AgentOS repo after this state-only update. KargaX AgentOS should not be resumed unless Ralph explicitly asks.

## Next exact action

Wait for Ralph's next concrete AgentOS priority. Do not start implementation work, do not resume KargaX AgentOS, and do not start `agentos run` unless explicitly reopened.

## Open decisions

- `agentos run` remains on hold unless Ralph explicitly reopens it.
- KargaX AgentOS remains stopped/rolled back unless Ralph explicitly asks to re-enable it.
- Local skills/custom agents sprint remains deferred until usage budget recovers and Ralph explicitly resumes it.
- Real npm publish remains blocked until npm package name/account/ownership/version are confirmed.
