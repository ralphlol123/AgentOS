# AgentOS Templates

AgentOS ships reusable templates in the repository so users can copy or install common agent and skill context without searching through source code.

## Template directories

```text
templates/
  agents/
  skills/
  schemas/
  examples/
```

These files are portable source material. Project-local runtime copies live under `.agentos/` and may be customized per workspace.

## Template registry commands

List all repository templates:

```bash
agentos templates list
```

Show a template by ID:

```bash
agentos templates show agent:project-manager
agentos templates show skill:frontend/ai-slop-design-review
agentos templates show skill:github/conventional-commit
```

Copy a template into the current project's `.agentos/` runtime context:

```bash
agentos templates copy agent:security-reviewer --dry-run
agentos templates copy agent:security-reviewer
agentos templates copy agent:security-reviewer --replace
agentos templates copy skill:frontend/ai-slop-design-review
agentos templates copy skill:github/conventional-commit
```

Validate a local template file before copying/importing it:

```bash
agentos templates validate templates/agents/project-manager.md --type agent
agentos templates validate templates/skills/frontend/ai-slop-design-review.md --type skill
```

Template IDs use:

```text
agent:<agent-name>
skill:<category>/<skill-name>
```

`templates copy` writes agents to `.agentos/agents/<id>.md` and skills to `.agentos/skills/<category>/<skill>/SKILL.md`. Agent copies are registered in `.agentos/project.yaml`; skill copies update `.agentos/skills.md`. Existing files are not overwritten unless `--replace` is provided.

## Agent templates

Current built-in agent template files:

```text
templates/agents/implementation.md
templates/agents/frontend-engineer.md
templates/agents/backend-engineer.md
templates/agents/qa.md
templates/agents/code-reviewer.md
templates/agents/release-manager.md
templates/agents/project-manager.md
templates/agents/security-reviewer.md
templates/agents/data-engineer.md
```

List available built-in agent templates:

```bash
agentos agents list
```

Add a built-in template to the current AgentOS project:

```bash
agentos agents add project-manager
```

Dry-run a custom local template:

```bash
agentos agents add ./my-agent.md --name my-agent --dry-run
```

Write a custom local template:

```bash
agentos agents add ./my-agent.md --name my-agent
```

Agent files are written to:

```text
.agentos/agents/<agent-id>.md
```

`project.yaml` is patched so the local agent is enabled.

## Skill templates

Current repository skill templates include:

```text
templates/skills/core/systematic-debugging.md
templates/skills/core/test-driven-development.md
templates/skills/core/shared-repo-git-safety.md
templates/skills/frontend/ai-slop-design-review.md
templates/skills/frontend/frontend-build-verification.md
templates/skills/backend/backend-service-verification.md
templates/skills/backend/nestjs-feature-implementation.md
templates/skills/fullstack/full-system-rehearsal.md
templates/skills/github/conventional-commit.md
templates/skills/github/github-pr-workflow.md
templates/skills/github/github-actions-verification.md
```

List built-in skill IDs and packs:

```bash
agentos skills list
```

Add detected local skills for the workspace:

```bash
agentos skills add --detected
```

Add packs:

```bash
agentos skills add core-pack
agentos skills add frontend-pack
agentos skills add backend-pack,github-pack
```

Add a specific skill:

```bash
agentos skills add systematic-debugging
agentos skills add conventional-commit
```

Use compact summary mode, the default:

```bash
agentos skills add frontend-build-verification --mode summary
```

Use full mode when the project needs more procedural detail:

```bash
agentos skills add frontend-build-verification --mode full
```

Local skill files are written to:

```text
.agentos/skills/<category>/<skill>/SKILL.md
```

AgentOS also updates:

```text
.agentos/skills.md
```

## Schemas and examples

Schema files currently document the intended shape for future validation tooling:

```text
templates/schemas/agent-template.schema.json
templates/schemas/skill-template.schema.json
```

Import examples:

```text
templates/examples/imported-agent.example.md
templates/examples/imported-skill.example.md
```

## Design rule

Repository templates are reusable source material.

Project-local files under `.agentos/agents/` and `.agentos/skills/` are runtime context for a specific workspace.

Do not edit repository templates just to customize one project; copy/add them into that project's `.agentos/` directory instead.
