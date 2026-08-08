# Handoff

## Current objective

Finalize the AgentOS Local Skills + Custom Agents sprint implementation on branch `feat/local-skills-custom-agents`.

## Scope

- Repo: `agentos-for-projects` only.
- In scope: local skill templates, `agentos skills add`, local skill doctor validation, custom/local agent preservation, optional `project-manager` planning role, `agentos migrate claude --preserve`, default Obsidian destination, EACCES diagnostics, tests, generated `dist/`.
- Out of scope: `agentos run`, execution orchestration, real npm publish, and re-installing AgentOS into KargaX.

## Current state

Branch: `feat/local-skills-custom-agents`.

Implemented:

- `agentos skills add [--detected] [skill-id|category-pack,...] [--mode summary|full] [--dry-run]`.
- Built-in common development skill catalog with compact summary mode by default and full mode opt-in.
- Local skill materialization under `.agentos/skills/<category>/<skill>/SKILL.md`.
- `.agentos/skills.md` update with `Details: .agentos/skills/.../SKILL.md` links and on-demand policy.
- Doctor validation for missing local skill links, unlisted local skill files, and token-heavy local skills.
- Custom/local agent preservation: declared custom agents with matching `.agentos/agents/<id>.md` are valid and preserved by `doctor --fix`.
- Optional built-in planning-only `project-manager` role via `planning`, `pm`, or `project-manager` aliases; not enabled by default detected profile.
- `agentos migrate claude --preserve [--dry-run]` for preserve-but-disable `.claude/agents`, `.claude/settings.local.json`, and `.claude/settings.json`, plus canonical AgentOS `CLAUDE.md` block and `.claude/README.agentos.md`.
- Default Obsidian destination changed to `Projects/<ProjectName>/AgentOS` when `--dest` is omitted in core API.
- Link-Obsidian EACCES diagnostics now explain parent-folder ownership/write-permission fixes.

Claude Code started the implementation but was killed after running too long; the remaining missing pieces were completed manually and verified.

## Last completed step

Full verification passed after adding the missing CLI helper, Claude migration command, default Obsidian destination, and migration/default tests.

## Files changed

- `src/core.ts`
- `src/cli.ts`
- `test/core.test.js`
- `dist/core.d.ts`
- `dist/core.js`
- `dist/core.js.map`
- `dist/cli.js`
- `dist/cli.js.map`
- `.agentos/tasks.md`
- `.agentos/handoff.md`

## Tests run

- `bun run build` — PASS.
- `bun run test` — PASS, 42 tests / 0 failures.
- `bun run check` — PASS.
- `bun run smoke` — PASS.
- `bun run test:package-managers` — PASS for npm, pnpm, and Bun tarball installs.
- `node dist/cli.js doctor` — PASS.
- `node dist/cli.js status` — PASS.
- `git diff --check` — PASS.
- CLI help smoke: `node dist/cli.js help` shows `skills add` and `migrate claude --preserve`.

## Known warnings / failures

- KargaX AgentOS remains intentionally rolled back; do not use KargaX as a write-path dogfood target unless Ralph explicitly asks.
- The smoke script still passes an explicit Obsidian destination, so the new default is covered by unit test rather than smoke output.
- Real npm publish remains blocked until npm package name/account/ownership/version are confirmed.

## Next exact action

Inspect final diff, commit the sprint branch, push it, then report branch/commit and verification summary.

## Open decisions

- Whether to merge `feat/local-skills-custom-agents` into `main` immediately or review first.
- Whether `project-manager` should ever become part of `--agents detected`; current implementation keeps it explicit only.
- `agentos run` remains on hold unless Ralph explicitly reopens it.
