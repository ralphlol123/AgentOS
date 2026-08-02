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
