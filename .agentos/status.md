# Status

Last updated: 2026-08-03

## Health

- AgentOS doctor/status: OK before optimization.
- Phase 1 agent model: shipped and pushed.
- Photobooth rollout: verified, including Claude Code plain-engine read-only smoke.
- Phase 2 `agentos run`: ON HOLD per Ralph.

## Token-efficiency hardening

Goal: reduce unnecessary context loading without changing AgentOS features.

Changed:

- Generated root adapters now load core AgentOS files first, then only relevant repo/agent/engine/skill files.
- Generated child pointers avoid wildcard role/engine reads and point at the specific repo note first.
- Generated `agentos prompt` text avoids `repos/*`, `agents/*`, and `engines/*` wildcard wording.
- `doctor --fix` now treats stale wildcard adapter text as stale and replaces it instead of appending a duplicate AgentOS section.
- Added regression tests for selective context loading and no duplicate adapter bootloaders.
- Compacted this repo's live `.agentos/handoff.md` + `.agentos/tasks.md`; archive kept in `.agentos/runs/`.

## Current phase

Token-efficiency hardening is verified and reviewed. No CLI features or command semantics were intentionally changed.

Verification:

- Full Bun verification passed with 27 tests / 0 fail.
- npm/pnpm/Bun package-manager compatibility passed.
- `bun run release:check`, npm publish dry-run, and `bun pm pack --dry-run` passed.
- `doctor --json`, `doctor`, and `status` passed.
- Claude Code review returned PASS after fixes for root/child stale wildcard adapter detection.
