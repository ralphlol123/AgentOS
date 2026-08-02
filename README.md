# AgentOS for Projects

Project-owned context layer for model-agnostic coding agents.

## Core rule

```text
One AgentOS per product/workspace.
Many repos inside it.
Each task declares which repo(s) are in scope.
```

## What this MVP does

AgentOS v0.1 is a TypeScript CLI/package that installs a portable project brain into a repo or product workspace:

```text
.agentos/
  project.yaml
  memory.md
  handoff.md
  decisions.md
  tasks.md
  status.md
  agents/
  engines/
  repos/
  runs/
AGENTS.md
CLAUDE.md
```

It supports:

- new project initialization
- existing project import
- multi-repo workspace detection, e.g. parent folder with `photobooth-fe/` and `photobooth-be/`
- root `AGENTS.md` bootloader
- root `CLAUDE.md` Claude Code adapter
- subrepo pointer files for multi-repo projects
- automatic child-repo `.gitignore` entries for parent-managed pointer files
- status, handoff, and doctor checks
- deterministic live-context compaction: `agentos compact [--dry-run]`
- interactive/link-only Obsidian knowledge setup: `agentos link-obsidian`
- generated engine prompts: `agentos prompt [claude|codex|opencode|hermes]`
- agent selection profiles: `--agents minimal`, default `--agents detected`, or custom comma lists
- generated `.agentos/skills.md` with an on-demand skill-loading policy
- doctor diagnostics for duplicate task sections, stale handoff/task hints, agent/skills consistency, repo git branch/ahead-behind state, untracked adapter files, missing commands, and configured port usage
- real YAML parsing/writing for `.agentos/project.yaml` via the `yaml` package, not regex/string-splice parsing

## Commands

```bash
agentos init [--new|--existing] [--agents minimal|detected|frontend,qa,release] [--dry-run]
agentos status
agentos handoff
agentos doctor [--fix] [--json]
agentos compact [--dry-run]
agentos link-obsidian [--vault <path> --dest <folder> --link <note> --create]
agentos prompt [claude|codex|opencode|hermes]
```

Local development:

```bash
# preferred dogfood path
bun install
bun run build
bun run check
bun run test
bun run smoke
bun run test:package-managers
bun pm pack --dry-run

# release readiness without publishing
bun run release:check
bun run publish:dry-run

# npm still works
npm run build
npm test
npm run smoke
npm run test:package-managers
node dist/cli.js init --existing --dry-run
```

## CI

```bash
# GitHub Actions uses Bun as the primary dogfood package manager.
# The package-manager compatibility test still verifies npm, pnpm, and Bun installs.
.github/workflows/ci.yml
```

## Package / publish flow

The npm package is prepared for public publishing under:

```text
agentos-for-projects
```

Current registry check: `npm view agentos-for-projects` returned 404, so the name appears unpublished from this environment.

Release-readiness checks:

```bash
bun run release:check      # check + test + smoke + npm/pnpm/Bun package compatibility + npm publish dry-run
bun run publish:dry-run    # npm publish dry-run only
npm run pack:dry-run       # inspect package contents without publishing
```

The package publishes only runtime files declared by `files` plus npm's standard metadata files:

```text
dist/
README.md
LICENSE
package.json
```

Do not run real `npm publish` until the intended package name, npm account, and version are confirmed.

## Install / global usage

AgentOS ships as a Node CLI bin named `agentos`. It works with npm, pnpm, and Bun.

After publishing, users should be able to install from the registry:

```bash
npm install -g agentos-for-projects
pnpm add -g agentos-for-projects
bun add -g agentos-for-projects
```

From a local checkout:

```bash
# npm
npm install -g /path/to/agentos-for-projects

# pnpm
pnpm add -g /path/to/agentos-for-projects

# bun
bun add -g /path/to/agentos-for-projects
```

For development symlinks:

```bash
# npm
npm link

# pnpm
pnpm link --global

# bun
bun link
bun link agentos-for-projects
```

After installing, verify:

```bash
which agentos
agentos init --existing --dry-run
agentos doctor
```

Package-manager compatibility is tested by installing the packed tarball into temporary projects with npm, pnpm, and Bun and executing the `agentos` bin.

## Usage examples

Link Obsidian as a long-term knowledge library:

```bash
agentos link-obsidian
```

By default this launches an interactive setup. For automation:

```bash
agentos link-obsidian \
  --vault /mnt/c/_/Obsidian/Ralph \
  --dest "Projects/AgentOS" \
  --create
```

The link is safe by design: AgentOS creates `.agentos/knowledge.md`, creates/links specific notes, patches `.agentos/project.yaml`, and tells agents not to bulk-load the vault.

Compact live AgentOS context without losing history:

```bash
agentos compact --dry-run
agentos compact
```

`compact` archives old `.agentos/handoff.md` and `.agentos/tasks.md` under `.agentos/runs/`, then rewrites the live files into short deterministic sections. It does not compact `.agentos/memory.md`.

Existing multi-repo project:

```bash
cd /path/to/product-root
agentos init --existing --dry-run
agentos init --existing
agentos status
agentos doctor
agentos doctor --json
```

`agentos doctor --json` prints machine-readable health data for CI/automation with `ok`, `status`, `root`, `fix`, `problems`, `warnings`, `diagnostics`, and summary counts.

Agent profile selection:

```bash
agentos init --existing --agents minimal
agentos init --existing --agents detected        # default
agentos init --existing --agents frontend,qa,release
```

Profiles:

- `minimal` creates the default delivery team only: `implementation`, `qa`, `code-reviewer`, and `release-manager`.
- `detected` creates the minimal team plus specialists justified by repo evidence, currently `frontend-engineer` and/or `backend-engineer`.
- comma lists create a custom enabled set using friendly aliases such as `frontend`, `backend`, `qa`, `review`, and `release`.

AgentOS records the selected model in `.agentos/project.yaml`:

```yaml
agents:
  profile: detected
  capabilities:
    implementation: implementation
    frontend: frontend-engineer
    backend: backend-engineer
    qa: qa
    review: code-reviewer
    release: release-manager
  enabled:
    - implementation
    - frontend-engineer
    - backend-engineer
    - qa
    - code-reviewer
    - release-manager
```

Skills are on-demand. Init writes `.agentos/skills.md` as an index of relevant global/project skills by agent role, and adapters instruct engines to load only skills relevant to the assigned task rather than bulk-loading everything.

In parent-managed multi-repo workspaces, AgentOS creates child repo pointer files and adds this managed block to each child repo `.gitignore` so app repos are not polluted by local workspace adapters:

```gitignore
# AgentOS parent-workspace pointer files
/AGENTS.md
/CLAUDE.md
/.hermes.md
# End AgentOS parent-workspace pointer files
```

New project:

```bash
mkdir my-product
cd my-product
agentos init --new
```

## Design promise

AgentOS does **not** promise magical seamless model switching. The real engineering promise is:

```text
portable project context + deterministic engine handoff + independent verification
```

Claude Code, Codex, ChatGPT, OpenCode, and Hermes should all read the same project-owned context instead of treating hidden chat history as project memory.

## Current limitations

- No engine execution yet (`agentos run` is intentionally not in v0.1).
- Repo/framework detection is package-script based and should eventually support more ecosystems.
- Existing file merge is conservative append + backup, not semantic patching.
- Package is publish-ready by dry-run checks, but real `npm publish` still requires confirmed npm account/package ownership/version.
