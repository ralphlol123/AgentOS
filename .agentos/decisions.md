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
