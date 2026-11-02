---
id: brain:architecture
kind: architecture
scope: .
status: proposed
sources:
  - knowledge/architecture.md
source_hash: 634c911cce25cf7716a7c91f91c1a1bb0f0636e5d67ef4fcf19eb27bc8f6858e
---
# AgentOS project architecture

AgentOS is a local Node/TypeScript CLI that keeps project context independent of the current AI engine. One workspace may contain several repositories; the nearest parent `.agentos/` selects the workspace, and nested independent workspaces have separate Brains.

## Responsibilities

- `src/cli.ts` parses commands; `src/core.ts` coordinates workspace/config loading, adapters and command operations.
- `src/context-builder.ts` selects and budgets project context. `src/checkpoint.ts` records progress and check receipts and reconciles saved evidence with current Git state for context and resume.
- `src/brain.ts` manages Markdown knowledge records, proposals, metadata and derived indexes. `src/brain-policy.ts` implements manual, auto-append and autonomous application policies. Attribution labels are not authentication; schemas and hashes do not prove prose correctness.
- `src/engines.ts` renders engine-specific instructions and optional native configuration. It does not launch engines or transfer native sessions.
- `src/workspace-lock.ts` coordinates cooperating CLI writers. Atomic file writes and in-process rollback live in `src/core.ts`; they do not provide crash-safe multi-file transactions or concurrent engine editing.

## Sources and boundaries

Durable knowledge is project Markdown; `.agentos/project.yaml` describes the workspace. Task checkpoints and receipts live under `.agentos/checkpoints/`. Current handoff/tasks are working views, not proof that code or tests are current. Code, Git and executed checks provide implementation evidence.

Obsidian is optional. Existing linking and canonical-location behavior is described in `docs/obsidian.md`; this change does not relocate records, sync vaults or edit external vaults.

## Verification and limits

Package commands are defined in `package.json`: check, test, smoke, test:metadata and test:package-managers. CI configuration is `.github/workflows/ci.yml`. Engine trial evidence under `docs/evidence/` applies only to the versions and modes recorded there.

Retrieval currently matches record metadata rather than body text. Milestone saving depends on engine instruction-following. Git evidence is bounded and excludes sensitive/runtime paths, ignored files and external state. See `docs/context-builder.md` and `docs/checkpoints.md`.
