# CLAUDE.md

AgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, and `.agentos/engines/claude-code.md` first. Then load `.agentos/knowledge.md`, `.agentos/skills.md`, and only relevant repo/agent files for the task.

Rules: declare role + repo scope before editing; edit only in scope; backend only if in scope; no secrets/.env/migrations/prod config without approval; no commit/push unless explicitly asked; verify; update handoff/tasks before stopping.

If launched from a child repo, follow pointer files back to the parent AgentOS root.
