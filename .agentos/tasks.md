# Tasks

## Done

- [x] Initialize AgentOS context in the AgentOS repo itself.
- [x] Link AgentOS project context to Obsidian at `Projects/AgentOS`.
- [x] Record current supported package managers: npm, pnpm, Bun.
- [x] Capture current command surface and core product rules.
- [x] Verify dogfood context with `agentos doctor`, `agentos status`, full package tests, smoke tests, package-manager tests, and pack dry-run.
- [x] Add Bun-based GitHub Actions CI workflow.
- [x] Add `agentos doctor --json` for machine-readable health output.
- [x] Replace manual `.agentos/project.yaml` generation/parsing with the `yaml` package.
- [x] Improve global install/publish flow: package metadata, LICENSE, release scripts, metadata tests, CI publish dry-run.
- [x] Dogfood plain-engine boot behavior with Claude Code/OpenCode/Codex read-only tasks.
- [x] Implement Phase 1 agent model: minimal/detected/custom profiles, generated agent files, `.agentos/skills.md`, and doctor consistency warnings.
- [x] Run Claude Code review of Phase 1 diff: PASS, no merge blockers.
- [x] Run full Bun/release verification and Photobooth dry-run smoke.

## Now

- [x] Commit and push Phase 1 agent model.

## Next

- [ ] Reinstall/update AgentOS in Photobooth using the new detected profile and on-demand skills index.

## Later

- [ ] Consider real `npm publish` only after npm account, package ownership, and release version are confirmed.
