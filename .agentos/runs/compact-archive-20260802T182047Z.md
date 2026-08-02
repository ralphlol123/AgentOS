# AgentOS Compact Archive

Created: 2026-08-02T18:20:47.838Z

This archive preserves pre-compaction live state. The live files were rewritten deterministically; no LLM summarization was used.

## Previous handoff.md

# Handoff

## Current objective

Phase 1 agent model and Photobooth rollout are both done and verified. Holding on Phase 2 `agentos run` per Ralph; waiting for a new concrete AgentOS priority.

## Scope

- Workspace kind: single-repo
- Repo in scope: `agentos-for-projects` at `.`
- Files in scope: `src/core.ts`, `src/cli.ts`, tests, README, `.agentos/*`, AgentOS Obsidian notes
- Protected paths: secrets, npm tokens, unrelated repos, Photobooth app source repos unless explicitly requested

## Current state

Implemented Phase 1 core behavior:

- `agentos init` accepts `--agents minimal`, default `--agents detected`, and custom comma lists.
- Minimal team: `implementation`, `qa`, `code-reviewer`, `release-manager`.
- Detected profile adds only justified specialists for now: `frontend-engineer` and/or `backend-engineer` based on repo evidence.
- `.agentos/project.yaml` now writes `agents.profile`, `agents.capabilities`, and `agents.enabled`.
- Init generates `.agentos/skills.md` with `Policy: on-demand` and role-keyed skill recommendations.
- Doctor warns for missing `.agentos/skills.md`, missing enabled agent files, and capability/enabled mismatches.
- Adapters/pointers mention `.agentos/skills.md` so engines know where to find on-demand skills.
- Current dogfood AgentOS repo was updated to the minimal detected team and stale old agent files were removed.
- Photobooth was rolled over to the new detected profile and on-demand skills index, and verified.
- Claude Code plain-engine read-only smoke in Photobooth passed.

## Last completed step

Full Phase 1 verification passed, Claude Code review returned PASS/no merge blockers after the unknown-alias and stale-agent warning fixes, commit `0f68aa1` was pushed to `origin/main`, Photobooth's AgentOS install was updated/verified against the new detected profile and skills index, and the Claude Code plain-engine read-only smoke test in Photobooth passed.

The previously suggested Phase 2 feature `agentos run` is now ON HOLD / deferred — Ralph confirmed it is not needed at the moment.

## Files changed

- `src/core.ts`
- `src/cli.ts`
- `test/core.test.js`
- `README.md`
- `.agentos/project.yaml`
- `.agentos/skills.md`
- `.agentos/agents/implementation.md`
- `.agentos/agents/qa.md`
- `.agentos/agents/code-reviewer.md`
- `.agentos/agents/release-manager.md`
- `.agentos/tasks.md`
- `.agentos/status.md`
- `.agentos/handoff.md`
- Obsidian AgentOS Roadmap/Decisions notes

## Tests run

- `bun run build && node --test --test-name-pattern "agent profile|skills index|capabilities"` — PASS
- `bun run build && node --test --test-name-pattern "unknown custom|skills index|capabilities"` — PASS
- Claude Code diff review — PASS, no merge blockers
- `bun install --frozen-lockfile` — PASS
- `bun run build` — PASS
- `bun run check` — PASS
- `bun run test` — PASS, 24 tests pass / 0 fail
- `bun run smoke` — PASS
- `bun run test:package-managers` — PASS for npm, pnpm, Bun
- `bun run release:check` — PASS, includes npm publish dry-run
- `bun pm pack --dry-run` — PASS, no local tarball left
- `node dist/cli.js doctor --json` parsed with `python3 -m json.tool` — PASS
- `node dist/cli.js doctor` — PASS
- `node dist/cli.js status` — PASS
- Photobooth dry-run from parent root with new detected profile — PASS
- Photobooth rollout/update to new detected profile and on-demand skills index — PASS, verified
- Claude Code plain-engine read-only smoke in Photobooth — PASS

## Known failures

None currently known.

## Caveats

- Detected specialists intentionally only cover frontend/backend in Phase 1. Do not add database/devops/docs specialists until real detection and routing needs justify them.
- Skills are indexed, not installed or auto-loaded. Engines must load relevant skills on demand.

## Next exact action

Hold on `agentos run`. Wait for a new concrete AgentOS priority from Ralph; optionally maintain rollout docs or gather real-world feedback in the meantime.

## Protected files / do not touch

- `.env` files
- npm tokens / auth files
- auth tokens/secrets
- unrelated project repos
- Photobooth app source unless the user explicitly asks for Photobooth implementation work

## Open decisions

- Phase 2 `agentos run` is on hold / deferred per Ralph — do not resume without a new explicit go-ahead.

## Previous tasks.md

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
- [x] Commit and push Phase 1 agent model.
- [x] Reinstall/update AgentOS in Photobooth using the new detected profile and on-demand skills index. Verified.
- [x] Run Claude Code plain-engine read-only smoke in Photobooth. PASS.

## Now

- [ ] Waiting for Ralph's next concrete AgentOS priority. Do not start `agentos run` unless Ralph explicitly reopens it.

## Next

- [ ] (On hold) `agentos run` Phase 2 feature — deferred; Ralph said we do not need it at the moment.

## Later

- [ ] Consider real `npm publish` only after npm account, package ownership, and release version are confirmed.
- [ ] Optionally maintain rollout docs / gather real-world feedback while `agentos run` is on hold.

## Compact handoff.md written

# Handoff

## Current objective

Phase 1 agent model and Photobooth rollout are both done and verified. Holding on Phase 2 `agentos run` per Ralph; waiting for a new concrete AgentOS priority.

## Scope

- Workspace kind: single-repo
- Repo in scope: `agentos-for-projects` at `.`
- Files in scope: `src/core.ts`, `src/cli.ts`, tests, README, `.agentos/*`, AgentOS Obsidian notes
- Protected paths: secrets, npm tokens, unrelated repos, Photobooth app source repos unless explicitly requested

## Current state

Implemented Phase 1 core behavior:

- `agentos init` accepts `--agents minimal`, default `--agents detected`, and custom comma lists.
- Minimal team: `implementation`, `qa`, `code-reviewer`, `release-manager`.
- Detected profile adds only justified specialists for now: `frontend-engineer` and/or `backend-engineer` based on repo evidence.
- `.agentos/project.yaml` now writes `agents.profile`, `agents.capabilities`, and `agents.enabled`.
- Init generates `.agentos/skills.md` with `Policy: on-demand` and role-keyed skill recommendations.
- Doctor warns for missing `.agentos/skills.md`, missing enabled agent files, and capability/enabled mismatches.
- Adapters/pointers mention `.agentos/skills.md` so engines know where to find on-demand skills.
- Current dogfood AgentOS repo was updated to the minimal detected team and stale old agent files were removed.
- Photobooth was rolled over to the new detected profile and on-demand skills index, and verified.
- Claude Code plain-engine read-only smoke in Photobooth passed.

## Last completed step

Full Phase 1 verification passed, Claude Code review returned PASS/no merge blockers after the unknown-alias and stale-agent warning fixes, commit `0f68aa1` was pushed to `origin/main`, Photobooth's AgentOS install was updated/verified against the new detected profile and skills index, and the Claude Code plain-engine read-only smoke test in Photobooth passed.

The previously suggested Phase 2 feature `agentos run` is now ON HOLD / deferred — Ralph confirmed it is not needed at the moment.

## Files changed

- `src/core.ts`
- `src/cli.ts`
- `test/core.test.js`
- `README.md`
- `.agentos/project.yaml`
- `.agentos/skills.md`
- `.agentos/agents/implementation.md`
- `.agentos/agents/qa.md`
- `.agentos/agents/code-reviewer.md`
- `.agentos/agents/release-manager.md`
- `.agentos/tasks.md`
- `.agentos/status.md`
- `.agentos/handoff.md`
- Obsidian AgentOS Roadmap/Decisions notes

## Tests run

- `bun run build && node --test --test-name-pattern "agent profile|skills index|capabilities"` — PASS
- `bun run build && node --test --test-name-pattern "unknown custom|skills index|capabilities"` — PASS
- Claude Code diff review — PASS, no merge blockers
- `bun install --frozen-lockfile` — PASS
- `bun run build` — PASS
- `bun run check` — PASS
- `bun run test` — PASS, 24 tests pass / 0 fail
- `bun run smoke` — PASS
- `bun run test:package-managers` — PASS for npm, pnpm, Bun
- `bun run release:check` — PASS, includes npm publish dry-run
- `bun pm pack --dry-run` — PASS, no local tarball left
- `node dist/cli.js doctor --json` parsed with `python3 -m json.tool` — PASS
- `node dist/cli.js doctor` — PASS
- `node dist/cli.js status` — PASS
- Photobooth dry-run from parent root with new detected profile — PASS
- Photobooth rollout/update to new detected profile and on-demand skills index — PASS, verified
- Claude Code plain-engine read-only smoke in Photobooth — PASS

## Known warnings / failures

None currently known.

## Next exact action

Hold on `agentos run`. Wait for a new concrete AgentOS priority from Ralph; optionally maintain rollout docs or gather real-world feedback in the meantime.

## Open decisions

- Phase 2 `agentos run` is on hold / deferred per Ralph — do not resume without a new explicit go-ahead.

## Compact tasks.md written

# Tasks

## Done

- [x] Verify dogfood context with `agentos doctor`, `agentos status`, full package tests, smoke tests, package-manager tests, and pack dry-run.
- [x] Add Bun-based GitHub Actions CI workflow.
- [x] Add `agentos doctor --json` for machine-readable health output.
- [x] Replace manual `.agentos/project.yaml` generation/parsing with the `yaml` package.
- [x] Improve global install/publish flow: package metadata, LICENSE, release scripts, metadata tests, CI publish dry-run.
- [x] Dogfood plain-engine boot behavior with Claude Code/OpenCode/Codex read-only tasks.
- [x] Implement Phase 1 agent model: minimal/detected/custom profiles, generated agent files, `.agentos/skills.md`, and doctor consistency warnings.
- [x] Run Claude Code review of Phase 1 diff: PASS, no merge blockers.
- [x] Run full Bun/release verification and Photobooth dry-run smoke.
- [x] Commit and push Phase 1 agent model.
- [x] Reinstall/update AgentOS in Photobooth using the new detected profile and on-demand skills index. Verified.
- [x] Run Claude Code plain-engine read-only smoke in Photobooth. PASS.

## Now

- [ ] Waiting for Ralph's next concrete AgentOS priority. Do not start `agentos run` unless Ralph explicitly reopens it.

## Next

- [ ] (On hold) `agentos run` Phase 2 feature — deferred; Ralph said we do not need it at the moment.

## Later

- [ ] Consider real `npm publish` only after npm account, package ownership, and release version are confirmed.
- [ ] Optionally maintain rollout docs / gather real-world feedback while `agentos run` is on hold.
