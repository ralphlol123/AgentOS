<!-- agentos:managed:start -->
# CLAUDE.md

AgentOS for Projects. Read `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, and `.agentos/tasks.md` first. Then load `.agentos/knowledge.md`, `.agentos/skills.md`, and only relevant repo/agent files for the task.

Rules: declare role + repo scope before editing; edit only in scope; backend only if in scope; no secrets/.env/migrations/prod config without approval; no commit/push unless explicitly asked; verify.

State files: rewrite `.agentos/handoff.md` to the current state, never append to it; delete finished tasks from `.agentos/tasks.md`. Before an older entry leaves either file, copy it into a note under `.agentos/runs/`; never discard history.

Commands and workflows: `.agentos/guide.md` (load on demand). Run `agentos status` first.

If launched from a child repo, follow pointer files back to the parent AgentOS root.
<!-- agentos:managed:end -->
