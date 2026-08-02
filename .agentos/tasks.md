# Tasks

## Done

- [x] Initialize AgentOS context in the AgentOS repo itself.
- [x] Link AgentOS project context to Obsidian at `Projects/AgentOS`.
- [x] Record current supported package managers: npm, pnpm, Bun.
- [x] Capture current command surface and core product rules.
- [x] Verify dogfood context with `agentos doctor`, `agentos status`, full package tests, smoke tests, package-manager tests, and pack dry-run.
- [x] Commit and push the AgentOS dogfood context.
- [x] Add Bun-based GitHub Actions CI workflow.
- [x] Add `bun.lock` and make Bun the preferred dogfood package manager while preserving npm/pnpm/Bun compatibility tests.
- [x] Add `agentos doctor --json` for machine-readable health output.
- [x] Add CI step for `node dist/cli.js doctor --json`.
- [x] Replace manual `.agentos/project.yaml` generation/parsing with the `yaml` package.
- [x] Improve global install/publish flow: package metadata, LICENSE, release scripts, metadata tests, CI publish dry-run.
- [x] Dogfood plain-engine boot behavior with Claude Code/OpenCode/Codex read-only tasks.
- [x] Commit and push plain-engine boot findings.

## Now

- [ ] Decide next: reinstall AgentOS in Photobooth or first run one tiny controlled write-path AgentOS smoke in this repo.

## Later

- [ ] Consider real `npm publish` only after npm account, package ownership, and release version are confirmed.
