---
id: brain:decisions
kind: decision
scope: .
status: accepted
sources:
  - .agentos/decisions.md
source_hash: 326de136fa4a7ef98d9b449c87d43391b36b0c855c3e95871bb4d41b109304fd
---
# Decisions

Durable decisions go here with date, reason, alternatives, and status.

## 2026-08-02 — Dogfood AgentOS in the AgentOS repo first

- Status: accepted
- Decision: Initialize `.agentos/` in `/home/hermes/agentos-for-projects` before reinstalling AgentOS into Photobooth.
- Reason: AgentOS should prove its own context model, commands, doctor checks, compaction, and Obsidian link flow on itself before managing larger client workspaces.
- Alternatives considered: reinstall directly into Photobooth; continue using chat/session memory only.
- Consequence: Future AgentOS tasks should read `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/tasks.md`, `.agentos/handoff.md`, and relevant linked Obsidian notes first.

## 2026-08-02 — Support npm, pnpm, and Bun consumers

- Status: accepted
- Decision: Treat npm, pnpm, and Bun as supported package managers for installing/executing the AgentOS CLI.
- Reason: Target workspaces may use different JavaScript package managers, and AgentOS should not force a project migration.
- Verification: `npm run test:package-managers` packs AgentOS, installs it with npm/pnpm/Bun in temporary projects, and executes the `agentos` bin.

## 2026-08-02 — Obsidian is link-only long-term knowledge

- Status: accepted
- Decision: AgentOS may create and link specific Obsidian notes, but agents must not bulk-load the vault.
- Reason: Obsidian should be a durable knowledge library, not unbounded runtime context.
- Consequence: `.agentos/knowledge.md` is the allowlist/index for relevant external notes.

## 2026-11-03 — Cross-engine continuity is the product goal

- Status: accepted (owner direction in the implementation request).
- Decision: Preserve project knowledge and task progress so a different engine can continue after the previous engine hits its usage limit. The owner starts the next engine manually.
- Reason: Useful continuation needs current code, decisions, remaining work and evidence; automatic provider switching and native chat transfer are unnecessary for this goal.
- Consequence: Prioritize reliable startup context and milestone checkpoints. Keep durable Brain knowledge separate from transient task progress. Obsidian stays optional.
- Alternatives considered: a universal engine launcher and automatic switching; deferred from the product scope.
