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

Minimal delivery team:

```bash
agentos init --existing --agents minimal
```

Detected profile, which adds frontend/backend specialists based on repo evidence:

```bash
agentos init --existing --agents detected
```

Custom list:

```bash
agentos init --existing --agents frontend,backend,qa,review,release
```

Add the optional planning-only project manager after init:

```bash
agentos agents add project-manager
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
agentos templates show agent:project-manager
```

Copy a built-in registry template:

```bash
agentos templates copy agent:project-manager --dry-run
agentos templates copy agent:project-manager
agentos templates copy agent:project-manager --replace
agentos templates copy skill:frontend/frontend-design
```

Validate a template file:

```bash
agentos templates validate templates/agents/project-manager.md --type agent
```

Add a built-in or local agent template through the agent convenience command:

```bash
agentos agents add project-manager
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

`compact --dry-run` shows the exact proposed live files without writes. `compact` makes a deterministic archive checkpoint under `.agentos/runs/` and adds explicit archive links, retaining all original live text (including safety constraints and unfinished work). Unchanged repeats do not write. It intentionally does not promise size reduction or summarize arbitrary Markdown; reduce historical prose only through a separate reviewed edit. See [compaction safety](../README.md#compaction-safety) for collision, CRLF, and rollback behavior.

## Health checks

Human output:

```bash
agentos doctor
```

Machine-readable output:

```bash
agentos doctor --json
```
