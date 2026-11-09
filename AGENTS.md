<!-- agentos:managed:start -->
# AGENTS.md

AgentOS for Projects bootloader.

Workspace: single-repo
Repos: agentos-for-projects=. (cli-package/node-typescript-cli/bun)

Read first: `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`. Then load `.agentos/knowledge.md`, `.agentos/skills.md`, and only the repo/agent files relevant to the assigned task.

Commands and workflows: `.agentos/guide.md` (load on demand). Run `agentos status` first.
Startup loop: `agentos status` → `agentos context codex|opencode --task <id>` → work → `agentos checkpoint --task <id> --progress "<done>" --next "<remaining>"`. Checkpoint at milestones, before limits interrupt work. If project.yaml declares knowledge.shared_memory, follow its mapping and the shared-memory workflow in .agentos/guide.md before planning. Durable knowledge: `agentos brain propose <record> --from <file> --task <id>`; `agentos brain policy` is manual by default. Apply only with `--auto --by <self>` if permitted; otherwise leave pending. Next engine: repeat context with the same task id; `agentos resume --task <id>` for details or recovery.

Rules: declare role + repo scope before editing; edit only in scope; never touch secrets/.env/migrations/prod config without approval; do not commit/push unless explicitly asked; verify.

State files: rewrite `.agentos/handoff.md` to the current state, never append to it; delete finished tasks from `.agentos/tasks.md`. Before an older entry leaves either file, copy it into a note under `.agentos/runs/`; never discard history.
<!-- agentos:managed:end -->
