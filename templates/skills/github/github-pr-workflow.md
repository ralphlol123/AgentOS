---
name: github-pr-workflow
category: github
mode: full
summary: "use for PR lifecycle work."
---

# GitHub PR Workflow

Trigger: Use when creating, updating, or merging pull requests.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Confirm the branch is up to date with its base before opening/updating a PR.
2. Write a PR description explaining why the change was made, with a test plan.
3. Do not merge your own PR unless explicitly instructed; wait for required review/checks.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- PR description includes a test plan; required CI checks are green before merge.

## Notes

- Keep PRs scoped to one logical change — large mixed-purpose PRs are harder to review and revert.
