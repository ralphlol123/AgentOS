# Handoff

## Current objective

`agentos skills remove <skill-id>` has been built and verified for easier local AgentOS skill cleanup. Engine Run Handoff Notes first implementation is also complete on branch `feat/engine-run-handoff-notes`. Worktrees Optional + Installation Wizard and release prep remain intentionally on hold per Ralph.

## Scope

- Repo: `agentos-for-projects` only.
- Branch: `feat/engine-run-handoff-notes`.
- Implemented:
  - `agentos run handoff` CLI route
  - `runHandoffAgentOS` core function
  - engine-neutral `.agentos/runs/*handoff.md` generation
  - read-only Git status/diff stat/changed files/bounded diff snippets
  - `.agentos/tasks.md` and `.agentos/handoff.md` updates that preserve existing task sections
  - README and smoke/test coverage
- Out of scope/not implemented:
  - automatic engine switching
  - launching OpenCode/Codex/Claude
  - terminal/process management
  - quota API detection
  - lock files
  - commits/pushes/PRs
  - editing KargaX or Photobooth repos

## Current state

- Canonical plan saved:
  - `.agentos/plans/2026-08-10-engine-run-handoff-notes.md`
- Obsidian copy saved:
  - `/mnt/c/_/Obsidian/Ralph/Projects/AgentOS/Plans/2026-08-10/engine-run-handoff-notes.md`
- New command:

```bash
agentos skills remove <skill-id> [--dry-run]
```

- Behavior:
  - `--dry-run` reports matching local skill folders without deleting.
  - Apply removes `.agentos/skills/**/<skill-id>/` directories.
  - `.agentos/skills.md` is regenerated/cleaned so removed skill references disappear.
  - Native copies under `.claude/skills/` and `.opencode/skills/` are intentionally untouched.
  - Missing local skills fail loudly.
- Package version bumped to `0.2.0` for the new command.
- Latest packed tarball:
  - `/tmp/agentos-skills-remove-pack-dMF4DW/agentos-for-projects-0.2.0.tgz`
- Existing handoff command remains:

```bash
agentos run handoff \
  --engine claude-code \
  --role implementation \
  --phase smoke \
  --reason quota-risk
```

- The command writes `.agentos/runs/<timestamp>-<role>-<phase>-handoff.md`, updates task/handoff state, and never launches or closes an engine.
- Worktrees Optional + Installation Wizard remains on hold:
  - `.agentos/plans/2026-08-10-worktrees-optional-install-wizard.md`
  - `/mnt/c/_/Obsidian/Ralph/Projects/AgentOS/Plans/2026-08-10/worktrees-optional-install-wizard.md`
- Release branch `chore/release-0.1.0` remains on hold per Ralph.

## Last completed step

- Built and verified `agentos skills remove <skill-id>` plus the version bump to `0.2.0`.

## Files changed

- `.agentos/plans/2026-08-10-engine-run-handoff-notes.md`
- `.agentos/tasks.md`
- `.agentos/handoff.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `src/cli.ts`
- `src/core.ts`
- `test/core.test.js`
- generated build output under `dist/`
- Obsidian note: `/mnt/c/_/Obsidian/Ralph/Projects/AgentOS/Plans/2026-08-10/engine-run-handoff-notes.md`

## Tests run

```bash
npm test -- --test-name-pattern='skills remove'
npm test -- --test-name-pattern='skills remove|skills add with a specific|templates import --yes'
npm test
npm pack --pack-destination /tmp/agentos-skills-remove-pack-dMF4DW
```

Also dogfooded CLI behavior in a temporary initialized workspace:

```bash
node dist/cli.js skills add systematic-debugging,conventional-commit
node dist/cli.js skills remove systematic-debugging --dry-run
node dist/cli.js skills remove systematic-debugging
```

## Known warnings / failures

- None in final verification.

## Next exact action

PR branch is pushed. Automated PR creation is blocked in this environment because GitHub CLI is unavailable and no GitHub API token is configured. Use the compare URL or retry after adding auth.

## Open decisions

- Whether to add proactive quota/risk detection later.
- Whether to add `--summary-file` for engine-written final summaries later.
- Whether phase-level summary generation belongs in the next slice.
- Whether lock files are needed later, or whether human-readable handoff notes are enough for the no-auto-switch model.
