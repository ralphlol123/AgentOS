# Handoff

## Current objective

Add an opt-in engine-neutral Unified Brain mapping and setup workflow while preserving generic Brain, checkpoints, handoffs and legacy Obsidian behavior.

## Scope

- Task: `unified-brain-contract`; branch: `feat/unified-brain-contract`; baseline: `a96729c831217f1caf76f8a5929f92cf205d7432` (3.3.0).
- Developer role: AgentOS source, setup script, tests, documentation and local state only.
- No external vault, global engine configuration, release, commit or push changes.

## Current state

- Implemented validated `knowledge.shared_memory` mapping, common engine instructions and explicit configured-unverified diagnostics.
- Packaged docs/shared-memory.md and scripts/setup-shared-memory.mjs; preview default, additive YAML changes, conflict refusal, repeat no-op, existing writer/atomic protections.
- Enabled external memory stays missing in context; `--require-complete` fails because this milestone cannot verify MCP retrieval. Normal local workflows remain usable.
- Unified Brain v0.2.1 separately fixes the five audited backend issues (34 tests passed). AgentOS guidance now includes task_id, retained request_id and conservative behavior for older/unknown servers.
- Full AgentOS suite: 883 passed, zero failures. Unified Brain: 26 passed. Smoke, metadata (3 tests) and npm package dry-run passed.
- Real vault and actual engine handoffs are unverified. No CLI executable trial against the user's PC is claimed.
- PR preparation authorized by the user; no merge or npm publication performed. Report: `.agentos/runs/2026-11-09-unified-brain-contract.md`.

## Next exact action

Open the reviewed feature PR, then run the documented actual-engine pilot before legacy deprecation or broader rollout.

## Protected files / do not touch

Secrets, production configuration, migrations, external vaults/client projects, workflow configuration and release version.

## Open decisions

- Keep legacy commands/configuration operational until record-level migration and actual engine validation succeed.
- Declared store labels are not verified vault identity. Future receipts need an identity and freshness protocol.
- Prior open tasks and original handoff/tasks are preserved in tasks.md and archived run notes.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: unified-brain-contract
- Record: `.agentos/checkpoints/unified-brain-contract/2026-11-09T02-43-55-048Z-b18a829a.json`
- Repos: agentos-for-projects feat/unified-brain-contract@a96729c (9 changed)
- Progress: Prepared opt-in shared-memory PR and v0.2.1 guidance. Typecheck, 883 tests, smoke and metadata pass.
- Blockers: none
- Next: Review PR and CI; run actual two-engine pilot. Bun compatibility and npm publication remain pending.
- Receipts: observed-pass 0, observed-fail 0, claimed 1, not-run 3, unavailable 0
- Resume: `agentos resume --task unified-brain-contract`
<!-- agentos:checkpoint:end -->
