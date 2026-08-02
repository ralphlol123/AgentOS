# Tasks

## Done

- [x] Initialize AgentOS context in the AgentOS repo itself.
- [x] Link AgentOS project context to Obsidian at `Projects/AgentOS`.
- [x] Record current supported package managers: npm, pnpm, Bun.
- [x] Capture current command surface and core product rules.
- [x] Verify dogfood context with `agentos doctor`, `agentos status`, full package tests, smoke tests, package-manager tests, and pack dry-run.
- [x] Commit and push the AgentOS dogfood context.

## Now

- [ ] Add GitHub Actions CI for build/test/smoke/package-manager checks.

## Next

- [ ] Add `agentos doctor --json` for machine-readable status.
- [ ] Replace manual YAML generation/parsing with a real YAML parser.
- [ ] Improve global install/publish flow once the package is ready to publish.

## Later

- [ ] Dogfood plain-engine boot behavior with Claude Code/OpenCode/Codex read-only tasks.
- [ ] Reinstall AgentOS in Photobooth only after dogfood context and CI are stable.
