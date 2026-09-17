# AgentOS Quickstart

AgentOS is a project-owned context layer for coding agents. It creates a compact `.agentos/` brain plus root adapter files so different agents can work from the same scoped project context.

## Requirements

```text
Node >= 20
```

## Install

After publishing:

```bash
npm install -g agentos-for-projects
```

From a local checkout:

```bash
npm install -g /path/to/agentos-for-projects
```

Verify the CLI:

```bash
agentos --version
agentos help
```

## New project

```bash
mkdir my-product
cd my-product
agentos init --new --dry-run
agentos init --new
agentos status
agentos doctor
```

## Existing project or workspace

For a single repo:

```bash
cd /path/to/repo
agentos init --existing --dry-run
agentos init --existing
agentos status
agentos doctor
```

For a product workspace containing child repos:

```bash
cd /path/to/product-root
agentos init --existing --dry-run
agentos init --existing
agentos doctor
```

AgentOS detects child repos with package metadata and writes parent-managed pointer files. Child `.gitignore` files get an AgentOS managed block so app repos are not polluted by parent workspace adapters.

## Choose agents

Minimal delivery team (developer, tester, reviewer, release-manager):

```bash
agentos init --existing --agents minimal
```

Detected profile (same core team as minimal; frontend/backend specialists were absorbed into the single `developer` role):

```bash
agentos init --existing --agents detected
```

Custom list:

```bash
agentos init --existing --agents developer,tester,reviewer,release-manager
```

Add the optional planning-only planner after init:

```bash
agentos agents add planner
```

## Add local skills

List available skill templates and packs:

```bash
agentos skills list
```

Add the detected skills for this workspace:

```bash
agentos skills add --detected
```

Add a pack or individual skill:

```bash
agentos skills add frontend-pack
agentos skills add debugging --mode full
```

Local skills and their optional `references/` files are written under `.agentos/skills/<category>/<id>/` and indexed in `.agentos/skills.md`. Both modes preserve the complete procedure. Load references only for the assigned repo's actual stack; project conventions prevail.

Use `agentos skills list --installed` to distinguish installed cards from the available catalog. Merely listing a skill does not install it. Differing local cards/references require reviewed, explicit `--replace`; native engine copies remain untouched. See [the consolidated catalog and compatibility limits](templates.md).

## Use templates

List agent convenience templates:

```bash
agentos agents list
```

List the full repository template registry:

```bash
agentos templates list
```

Preview a template:

```bash
agentos templates show agent:planner
```

Copy a built-in registry template:

```bash
agentos templates copy agent:planner --dry-run
agentos templates copy agent:planner
agentos templates copy agent:planner --replace
agentos templates copy skill:frontend/frontend-design
```

Validate a template file:

```bash
agentos templates validate templates/agents/planner.md --type agent
```

Add a built-in or local agent template through the agent convenience command:

```bash
agentos agents add planner
agentos agents add ./my-agent.md --name my-agent --dry-run
```

## Import useful web/file templates safely

Dry-run first:

```bash
agentos templates import ./external-skill.md --type skill --name external-skill --dry-run
```

Write only after reviewing findings:

```bash
agentos templates import ./external-skill.md --type skill --name external-skill --yes
```

## Link Obsidian safely

Interactive:

```bash
agentos link-obsidian
```

Non-interactive:

```bash
agentos link-obsidian --vault /path/to/vault --dest "Projects/MyProduct/AgentOS" --create
```

AgentOS links specific notes only. It does not bulk-load a vault.

## Generate an engine prompt

```bash
agentos prompt claude
agentos prompt codex
agentos prompt opencode
agentos prompt hermes
```

## Keep context compact

```bash
agentos compact --dry-run
agentos compact
```

`compact --dry-run` gives a concise, write-free structural preview; add `--diff` when you need the detailed patch. Plain `compact` applies only when the combined live context strictly shrinks, after archiving and hash-verifying the exact originals. `compact --checkpoint` explicitly selects the older archive-and-link behavior, which retains all live text and may grow it. See [compaction](../README.md#compaction) and [the detailed policy](compaction.md) for collision, CRLF, and rollback behavior.

## Health checks

Human output:

```bash
agentos doctor
```

Machine-readable output:

```bash
agentos doctor --json
```
