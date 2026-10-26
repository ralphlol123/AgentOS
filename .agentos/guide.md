<!-- agentos:managed:start -->
# AgentOS Guide

How to operate an AgentOS workspace from any coding engine. This is a command map, not project state: `agentos status` prints the objective, open tasks and verification commands; read `.agentos/handoff.md` and `.agentos/tasks.md` only when file reads work.

## Start

- Run `agentos status`. It finds the workspace root from any subdirectory and prints the current objective, the open tasks and, from a child repo, that repo's verification commands.
- Then `agentos context <engine> --task "<task>" --role <id>` (engine: `claude-code`, `codex`, `opencode`, `hermes`) prints the objective, read/edit scope, role card and relevant decisions. Reuse that `--task` value for `checkpoint` and `resume`.
- `Edit scope: not set` (no `task_scope`): edit only files the owner's task names; ask the owner to set `task_scope` in `.agentos/project.yaml`. Engines never edit that file.
- Declare your role (`.agentos/agents/`) and the repo scope before editing. Edit only inside that scope.
- If a command is unclear, run `agentos --help` or `<command> --help` instead of guessing flags.

## Setup and project knowledge

- `agentos init` (or `--existing`) also sets up the Brain: missing templates in `.agentos/brain/` mark unknowns; existing records and docs are adopted, never duplicated or rewritten. Safe to re-run.
- Context opens with a bounded overview (`.agentos/memory.md`); Brain records follow by reference when relevant (`agentos brain search <terms>`).
- Obsidian is optional: `agentos obsidian init` (folder to open as its own vault) or `agentos obsidian link --vault <abs-path> --dest <sub/folder> --create` (navigation note in an existing vault). The vault path is machine-local: `.agentos/local.yaml`.

## If you started inside a child repo

- This directory is one repo of a larger workspace. The AgentOS root is the nearest parent that has `.agentos/`.
- Run `agentos status`. It works from any subdirectory and needs no file reads.
- In some engines a refused read outside the start directory ends the session. Use the CLI first; read parent files only if reads work.
- `agentos handoff` prints the full handoff and the reading list when you need more than the status summary.

## Stopping, switching engines, decisions

- Before stopping or switching engines: `agentos checkpoint --task <id> --progress "<done>" --next "<remaining>" --check "<cmd>"`. Each `--check` runs as a receipt, from the workspace root or the `--cwd <dir>` after it (root-relative, or absolute inside the workspace); `--claim "<text>"` records what AgentOS did not observe.
- Next engine: `agentos resume --task <id>`, then `context`. No checkpoint was written: `agentos checkpoint --recover --task <id>`.
- Prefer these to `agentos run handoff`: it writes only a prose note, no receipts for `resume` to reconcile.
- After the checkpoint, ask: did this work change durable knowledge (architecture, decision, convention)? If yes: `agentos brain propose <id-or-path> --from <file|-> --task <id> --summary "<why>"` (ids: `agentos brain list`); else nothing. Engines propose, never apply; the owner runs `agentos brain preview <proposal>`, then `agentos brain apply <proposal> --by <owner>`.
- Engine role config (`claude-code`, `codex`): `agentos agents sync <engine> --role <id> --dry-run`, then without `--dry-run`. When `agentos doctor` prints `Synced config: STALE`, re-run the command it prints; add `--replace` only when that line does.

## Which command for which job

- Health check: `agentos doctor` (read-only). To repair, preview with `agentos doctor --fix --dry-run`, then run `agentos doctor --fix`.
- Handoff or tasks too long: `agentos compact --dry-run`, review the report, then `agentos compact`. It archives recognised history byte-for-byte and refuses ambiguous state. If it reports nothing to archive, rewrite the file as the rule below says instead of leaving it to grow.
- Add a workflow: `agentos skills list` shows the catalog, `agentos skills list --installed` shows what is installed, `agentos templates show <id>` reads one first, then `agentos skills add <skill-id> --dry-run` and `agentos skills add <skill-id>`.
- Roles: `agentos agents list`, `agentos agents list --installed`, `agentos agents add <agent-id> --dry-run`.
- Is this adapter file current? `agentos adapters explain <file>`.

## Rules

- Never hand-edit text between `agentos:managed` markers (AGENTS.md, CLAUDE.md, .hermes.md, child pointers, this guide). `agentos doctor --fix` regenerates it.
- Install skills and agents through the CLI. A SKILL.md written by hand is not listed in `.agentos/skills.md`, so other engines and `agentos skills list --installed` will not see it.
- Preview with `--dry-run` before any command that writes.
- Do not commit or push unless explicitly asked. Do not touch secrets, .env files, migrations or production config without approval.
- Verify with the commands `agentos status` lists for your repo (the same ones are in `.agentos/repos/<repo>.md` if file reads work), then update state before stopping: rewrite `.agentos/handoff.md` to the current state (objective, scope, what changed, tests run, next action), never append to it; delete finished tasks from `.agentos/tasks.md`. Before an older entry leaves either file, copy it into a note under `.agentos/runs/`; never discard history.
<!-- agentos:managed:end -->
