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

`init` also sets up the Project Brain: it creates the missing starting records under `.agentos/brain/` with unknowns marked `(unknown — fill in)`, adopts `.agentos/decisions.md` and `.agentos/architecture.md` in place, and names any covering doc (`ARCHITECTURE.md`, `docs/conventions.md`, …) with its `agentos brain register` command instead of duplicating it. Re-running `init` changes nothing that exists. See [brain.md](brain.md#setup-agentos-init).

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

Minimal delivery team (developer, tester, reviewer, release-manager; the same team you get without `--agents`). Add `--yes` (`-y`) to skip the confirmation prompt:

```bash
agentos init --existing --agents minimal --yes
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
agentos skills add debugging
agentos skills show debugging      # read a skill card (installed, else the catalog template)
```

Local skills and their optional `references/` files are written under `.agentos/skills/<category>/<id>/` and indexed in `.agentos/skills.md`. Every card holds the complete procedure. Load references only for the assigned repo's actual stack; project conventions prevail.

Use `agentos skills list --installed` to distinguish installed cards from the available catalog. Merely listing a skill does not install it. Differing local cards/references require reviewed, explicit `--replace`; native engine copies remain untouched. See [the consolidated catalog and compatibility limits](templates.md).

## Agent and skill templates

The built-in catalog is listed by `agents list` and `skills list` (the 2.0 `templates` command was removed in 3.0.0):

```bash
agentos agents list
agentos agents show planner                # catalog card when it is not installed
agentos agents add planner --dry-run
agentos agents add planner
agentos agents add planner --replace
agentos skills add frontend-design
```

Check a template file you wrote (prints the structure check, writes nothing):

```bash
agentos agents add ./my-agent.md --name my-agent --dry-run
agentos skills add ./my-skill.md --dry-run
```

## Import useful web/file templates safely

Preview first (nothing is written without `--yes`):

```bash
agentos skills add ./external-skill.md --name external-skill
agentos agents add https://example.com/agent.md --name external-agent
```

Write only after reviewing findings, pinned to the reviewed bytes:

```bash
agentos skills add ./external-skill.md --name external-skill --yes --expected-sha256 <sha256 from the preview>
```

## Start a session (any engine)

Every root bootloader (`CLAUDE.md`, `AGENTS.md`, `.hermes.md`) names the same loop with its own engine id:

```bash
agentos status
agentos context claude-code --task <id>     # codex | opencode | hermes
# ... work ...
agentos checkpoint --task <id> --progress "<done>" --next "<remaining>"
agentos resume --task <id>                  # next session or another engine; same <id>
```

`context` opens with a bounded overview from `.agentos/memory.md`. A task without a checkpoint starts clean: `resume` reports a clean start (exit 0) and invents no prior work. The full command map is `.agentos/guide.md` in every workspace (also shipped in the package, with this file, under `node_modules/agentos-for-projects/docs/`).

## Obsidian (optional)

Nothing needs Obsidian. Two setups ([obsidian.md](obsidian.md)):

```bash
agentos obsidian init                                                        # knowledge/ folder: open it as its own vault
agentos obsidian link --vault /path/to/vault --dest "Projects/MyProduct" --create   # one navigation note in an existing vault
```

The vault path of `obsidian link` is machine-local: it goes to `.agentos/local.yaml` (git-ignored), not to the shared `project.yaml`. Off switch: `knowledge.obsidian.enabled: false`. AgentOS links notes; it never bulk-loads a vault. Exact-note link-only mode: `agentos obsidian link --note <path> --vault <path> --dest <folder>` (`agentos link-obsidian` before 3.0.0).

## Short engine start prefix

```bash
agentos context claude --brief      # codex | opencode | hermes; `agentos prompt <engine>` before 3.0.0
```

`agentos status --full` adds the full handoff to the status summary.

## Keep context compact

```bash
agentos compact --dry-run
agentos compact
```

`compact --dry-run` gives a concise, write-free structural preview; add `--diff` when you need the detailed patch. Plain `compact` applies only when the combined live context strictly shrinks, after archiving and hash-verifying the exact originals. `compact --archive-only` explicitly selects the older archive-and-link behavior, which retains all live text and may grow it. See [compaction](../README.md#compaction) and [the detailed policy](compaction.md) for collision, CRLF, and rollback behavior.

## Health checks

Human output:

```bash
agentos doctor
```

Machine-readable output:

```bash
agentos doctor --json
```
