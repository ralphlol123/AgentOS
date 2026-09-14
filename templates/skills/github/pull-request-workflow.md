---
name: pull-request-workflow
category: github
mode: full
summary: "use for PR lifecycle work."
---

# Pull Request Workflow

Trigger: Use when opening, updating, or merging pull/merge requests.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual hosting provider and conventions, and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Confirm the branch is up to date with its base before opening/updating a PR.
2. Write a PR description explaining why the change was made, with a test plan.
3. Respect the project's review gates: do not merge your own PR unless explicitly instructed; wait for required review/checks.
4. Merge only when authorized and required checks are green.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- PR description includes a test plan; required CI checks are green before merge.

## Notes

- Keep PRs scoped to one logical change — large mixed-purpose PRs are harder to review and revert.
- Provider commands differ; load the matching reference only when it applies, e.g. `references/github.md` for GitHub. Do not claim support for providers you have no guidance for.
