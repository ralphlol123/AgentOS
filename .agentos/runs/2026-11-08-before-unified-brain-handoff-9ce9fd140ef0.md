# Handoff

## Current objective

Implement a lean default team: Developer, Writer and Researcher, with portable project context and opt-in native team definitions. Keep testing, independent review, planning and release preparation as assignments rather than mandatory permanent agents.

## Scope

- Task: `lean-agent-team`; branch: `feat/lean-agent-team`; baseline: `7396b6c` (3.3.0).
- AgentOS source, role templates, tests, docs and state records. No release/version change, remote writes or Hermes work.
- Existing project role selections, custom cards and task-scoped sync behavior remain supported.

## Current state

- New init defaults to `core`: developer, writer, researcher. Explicit `minimal` and existing enabled teams remain compatible.
- `agents sync claude-code|codex|opencode --team` exports all enabled manifest cards into separate `agentos-<role>` files. Uses existing transactional sync protection and a separate ownership record.
- Model preference is advisory. Explicit per-engine model mappings are exported; absence inherits the session model. No automatic availability, price or fallback-model guesses.
- Coordinator owns shared handoff/checkpoint writes. Fresh Developer sessions can perform independent review; Researcher is read-only by intent, with engine-specific limits documented.
- `docs/agents.md` contains responsibilities, migration, native format references and limitations; it is now packaged.
- Final consolidated regression run: 876 tests, 870 passed, 6 skipped (root-permission tests), zero failures. Includes ten new team tests. Typecheck, smoke, metadata and package dry-run passed. Codex exports also parsed with Python tomllib. Results recorded in .agentos/runs/2026-11-05-lean-agent-team.md.
- Codex exports parsed with Python tomllib. No Claude Code, Codex or OpenCode executable is installed here; live discovery, invocation, permissions, model routing and cost savings remain unverified.
- Local uncommitted changes only. No push, PR, publish or live-engine trial.

## Next exact action

Review the local diff and run bounded live-engine team trials before treating the new exports as verified. Commit/push only when authorized.

## Protected files / do not touch

Secrets, production configuration, migrations, external vaults/client projects, workflow configuration and release version.

## Open decisions

- Live trial should check role discovery, model actually selected, read-only behavior, one shared-state writer, and independent review; measure cost and retries before claiming savings.
- Team exports intentionally do not satisfy task-scoped `context --require-synced-config`; inspect team drift via `agents sync <engine> --team --dry-run`.
- Previous unfinished tasks are preserved in tasks.md and the archived state.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: lean-agent-team
- Record: `.agentos/checkpoints/lean-agent-team/2026-11-05T02-53-26-102Z-79510e05.json`
- Repos: agentos-for-projects feat/lean-agent-team@7396b6c (21 changed)
- Progress: Implemented three-role defaults, coexisting team exports, explicit model configuration and migration documentation; automated verification completed.
- Blockers: none
- Next: Review the local diff and run live engine discovery, delegation and model-selection trials. Commit and push only when authorized.
- Receipts: observed-pass 1, observed-fail 0, claimed 1, not-run 3, unavailable 0
- Resume: `agentos resume --task lean-agent-team`
<!-- agentos:checkpoint:end -->
