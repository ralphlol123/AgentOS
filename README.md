# AgentOS for Projects

Project-owned context layer for model-agnostic coding agents.

AgentOS installs a portable `.agentos/` project brain into a single repo or product workspace so Claude Code, Codex, OpenCode, Hermes, ChatGPT, and other agents can share the same scoped project context without bulk-loading every file.

## Core rule

```text
One AgentOS per product/workspace.
Many repos inside it.
Each task declares which repo(s) are in scope.
```

## What v0.1 does

AgentOS v0.1 is a TypeScript CLI/package that supports:

- new project initialization;
- existing single-repo and multi-repo workspace import;
- root adapters: `AGENTS.md`, `CLAUDE.md`, `.hermes.md`, and `.opencode/AGENTS.md`;
- child repo pointer files for parent-managed multi-repo workspaces;
- generated `.agentos/project.yaml`, `memory.md`, `handoff.md`, `tasks.md`, `decisions.md`, `status.md`, `skills.md`, `agents/`, `engines/`, `repos/`, and `runs/`;
- agent selection profiles: `minimal`, `detected`, and custom comma lists;
- optional planning-only `project-manager` role;
- local project skills under `.agentos/skills/`;
- local custom agents under `.agentos/agents/`;
- reusable repository templates under `templates/`;
- guarded import of useful web/file agents or skills;
- Obsidian link-only knowledge setup;
- deterministic live-context compaction;
- doctor/status/handoff checks and JSON health output;
- Claude legacy migration preservation.

## Install

AgentOS ships as a Node CLI bin named `agentos`.

Requirements:

```text
Node >= 20
```

After publishing:

```bash
npm install -g agentos-for-projects
pnpm add -g agentos-for-projects
bun add -g agentos-for-projects
```

From a local checkout:

```bash
npm install -g /path/to/agentos-for-projects
pnpm add -g /path/to/agentos-for-projects
bun add -g /path/to/agentos-for-projects
```

Verify:

```bash
which agentos
agentos --version
agentos init --existing --dry-run
```

## Quickstart

New project:

```bash
mkdir my-product && cd my-product
agentos init --new
agentos status
agentos doctor
```

Existing single-repo or multi-repo workspace:

```bash
cd /path/to/product-root
agentos init --existing --dry-run
agentos init --existing
agentos status
agentos doctor
```

Generate an engine prompt:

```bash
agentos prompt claude
agentos prompt codex
agentos prompt opencode
agentos prompt hermes
```

More detail: [docs/quickstart.md](docs/quickstart.md).

## Commands

```bash
agentos init [--new|--existing] [--agents minimal|detected|frontend,qa,release] [--dry-run]
agentos status
agentos handoff
agentos doctor [--fix] [--json]
agentos compact [--dry-run]
agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]
agentos skills list
agentos skills add [--detected] [skill-id|category-pack,...] [--mode summary|full] [--dry-run]
agentos agents list
agentos agents add <agent-id|template-file> [--name id] [--dry-run]
agentos templates import <url-or-file> --type agent|skill --name <id> [--mode summary|full] [--dry-run] [--yes]
agentos migrate claude --preserve [--dry-run]
agentos prompt [claude|codex|opencode|hermes]
```

## Agent profiles

```bash
agentos init --existing --agents minimal
agentos init --existing --agents detected
agentos init --existing --agents frontend,backend,qa,review,release
```

Profiles:

- `minimal`: `implementation`, `qa`, `code-reviewer`, `release-manager`.
- `detected`: minimal team plus specialists justified by repo evidence, currently `frontend-engineer` and/or `backend-engineer`.
- custom comma list: friendly aliases such as `frontend`, `backend`, `qa`, `review`, `release`, `planning`, and `pm`.

`project-manager` is optional and planning-only. It is not enabled by default detected profile.

```bash
agentos agents add project-manager
```

## Local skills

List built-in skills and packs:

```bash
agentos skills list
```

Add detected skill pack for the current workspace:

```bash
agentos skills add --detected
```

Add specific skills or category packs:

```bash
agentos skills add systematic-debugging
agentos skills add frontend-pack
agentos skills add backend-pack,github-pack --mode full
```

Skills are written project-locally:

```text
.agentos/skills/<category>/<skill>/SKILL.md
```

`.agentos/skills.md` remains an on-demand index. Agents should load only skills relevant to the current role/task.

## Templates

The repo ships portable source templates:

```text
templates/agents/
templates/skills/
templates/schemas/
templates/examples/
```

Use them through CLI commands:

```bash
agentos agents list
agentos agents add project-manager
agentos agents add ./my-agent.md --name data-engineer --dry-run
```

Template docs: [docs/templates.md](docs/templates.md).

## Safe imports

Import is designed to be review-first and project-local by default.

Dry-run a local or web source:

```bash
agentos templates import ./external-skill.md --type skill --name external-review --dry-run
agentos templates import https://example.com/agent.md --type agent --name security-reviewer --dry-run
```

Write only after review:

```bash
agentos templates import ./external-skill.md --type skill --name external-review --yes
```

The importer shows source, SHA256, byte size, target path, and safety findings. Prompt-injection-like instructions block import. Secret-like words, dangerous command patterns, missing license hints, and large content produce warnings.

Safe-import docs: [docs/safe-imports.md](docs/safe-imports.md).

## Obsidian link-only knowledge

Interactive:

```bash
agentos link-obsidian
```

Automation:

```bash
agentos link-obsidian \
  --vault /mnt/c/_/Obsidian/Ralph \
  --dest "Projects/AgentOS" \
  --create
```

AgentOS links specific notes only. It does not bulk-load the vault.

When `--dest` is omitted, AgentOS defaults to:

```text
Projects/<ProjectName>/AgentOS
```

## Claude legacy migration

Preserve old Claude files before switching to AgentOS canonical context:

```bash
agentos migrate claude --preserve --dry-run
agentos migrate claude --preserve
```

This renames active `.claude` files to timestamped `.agentos-legacy-*` backups, writes `.claude/README.agentos.md`, and patches `CLAUDE.md` with the AgentOS canonical block.

## Development

```bash
bun install
bun run build
bun run check
bun run test
bun run smoke
bun run test:package-managers
```

Release-readiness without publishing:

```bash
bun run release:check
bun run publish:dry-run
npm run pack:dry-run
```

npm also works:

```bash
npm run build
npm test
npm run smoke
npm run test:package-managers
```

## Package / publish flow

The npm package is prepared for public publishing under:

```text
agentos-for-projects
```

The package publishes runtime files declared by `files` plus npm standard metadata:

```text
dist/
templates/
README.md
LICENSE
package.json
```

Do not run real `npm publish` until the intended package name, npm account, and version are confirmed.

Release checklist: [docs/release-readiness.md](docs/release-readiness.md).

## CI

GitHub Actions uses Bun as the primary dogfood package manager. The package-manager compatibility test verifies npm, pnpm, and Bun installs.

```text
.github/workflows/ci.yml
```
