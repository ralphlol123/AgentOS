# Handoff

## Current objective

Engine Run Handoff Notes first implementation is complete on branch `feat/engine-run-handoff-notes`. Await Ralph's approval before commit/push. Worktrees Optional + Installation Wizard and release prep remain intentionally on hold per Ralph.

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

- Implemented and verified the first production-ready Engine Run Handoff Notes slice.

## Files changed

- `.agentos/plans/2026-08-10-engine-run-handoff-notes.md`
- `.agentos/tasks.md`
- `.agentos/handoff.md`
- `README.md`
- `src/cli.ts`
- `src/core.ts`
- `test/core.test.js`
- `test/smoke.js`
- generated build output under `dist/`
- Obsidian note: `/mnt/c/_/Obsidian/Ralph/Projects/AgentOS/Plans/2026-08-10/engine-run-handoff-notes.md`

## Tests run

```bash
bun run check
bun run test
npm pack --dry-run
```

Also dogfooded packed CLI behavior in a temporary initialized Git repo:

```bash
node dist/cli.js run handoff --engine claude-code --role implementation --phase smoke --reason quota-risk
node dist/cli.js status
```

## Known failures

- None in final verification.

## Next exact action

Wait for Ralph. If Ralph approves this branch, run final diff review, then commit/push only with explicit approval.

## Protected files / do not touch

- Do not edit `/home/app/www/kargax/new`.
- Do not edit Photobooth repos as part of this AgentOS package feature.
- Do not publish npm package yet.
- Do not start release branch while release is on hold.
- Do not implement Worktrees Optional + Installation Wizard while it is on hold.
- Do not auto-switch engines; this feature is handoff notes only.
- Do not bulk-load the Obsidian vault; use linked notes only.

## Open decisions

- Whether to add proactive quota/risk detection later.
- Whether to add `--summary-file` for engine-written final summaries later.
- Whether phase-level summary generation belongs in the next slice.
- Whether lock files are needed later, or whether human-readable handoff notes are enough for the no-auto-switch model.
