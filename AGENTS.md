# AGENTS.md

AgentOS for Projects bootloader.

Workspace: single-repo
Repos: agentos-for-projects=. (cli-package/node-typescript-cli/npm; compatible with npm, pnpm, Bun)

Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, relevant `.agentos/repos/*`, `.agentos/agents/*`, `.agentos/engines/*`.

Rules: declare role + repo scope before editing; edit only in scope; never touch secrets/.env/migrations/prod config without approval; do not commit/push unless explicitly asked; verify; update handoff/tasks before stopping.
