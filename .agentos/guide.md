<!-- agentos:managed:start -->
# AgentOS Guide

How to operate an AgentOS workspace from any coding engine (Claude Code, OpenCode, Codex, Hermes). This is a command map, not project state. `agentos status` prints the current objective, open tasks and verification commands; read `.agentos/handoff.md` and `.agentos/tasks.md` for more only when file reads work.

## Start

- Run `agentos status`. It finds the workspace root from any subdirectory and prints the current objective, the open tasks and, from a child repo, that repo's verification commands.
- Declare your role (`.agentos/agents/`) and the repo scope before editing. Edit only inside that scope.
- If a command is unclear, run `agentos --help` instead of guessing flags.

## If you started inside a child repo

- This directory is one repo of a larger workspace. The AgentOS root is the nearest parent that has `.agentos/`.
- Run `agentos status`. It works from any subdirectory and needs no file reads.
- Some engines refuse file reads outside the directory they started in, and a refused read can end the session immediately instead of letting you continue. Use the CLI first and read parent files only if reads work.
- `agentos handoff` prints the full handoff and the reading list when you need more than the status summary.

## Which command for which job

- Health check: `agentos doctor` (read-only). To repair, preview with `agentos doctor --fix --dry-run`, then run `agentos doctor --fix`.
- Handoff or tasks too long: `agentos compact --dry-run`, review the report, then `agentos compact`. It archives the originals byte-for-byte and refuses ambiguous state. Do not trim these files by hand.
- Add a workflow: `agentos skills list` shows the catalog, `agentos skills list --installed` shows what is installed, `agentos templates show <id>` reads one first, then `agentos skills add <skill-id> --dry-run` and `agentos skills add <skill-id>`.
- Roles: `agentos agents list`, `agentos agents list --installed`, `agentos agents add <agent-id> --dry-run`.
- Switching engines or stopping mid-task: `agentos run handoff --dry-run` writes a continuation note without changing engines for you.
- Is this adapter file current? `agentos adapters explain <file>`.

## Rules

- Never hand-edit text between `agentos:managed` markers (AGENTS.md, CLAUDE.md, .hermes.md, child pointers, this guide). `agentos doctor --fix` regenerates it.
- Install skills and agents through the CLI. A SKILL.md written by hand is not listed in `.agentos/skills.md`, so other engines and `agentos skills list --installed` will not see it.
- Preview with `--dry-run` before any command that writes.
- Do not commit or push unless explicitly asked. Do not touch secrets, .env files, migrations or production config without approval.
- Verify with the commands `agentos status` lists for your repo (the same ones are in `.agentos/repos/<repo>.md` if file reads work), then update `.agentos/handoff.md` and `.agentos/tasks.md` before stopping.
<!-- agentos:managed:end -->
