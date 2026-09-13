---
name: github-code-review
category: github
mode: full
summary: "use when reviewing a GitHub pull request."
---

# GitHub Code Review

Trigger: Use when reviewing a GitHub pull request.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Read the PR description and linked issue for intent before reading the diff.
2. Review every changed file, not just the ones with the largest diff.
3. Distinguish must-fix comments from optional suggestions explicitly.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Every must-fix comment is either resolved or explicitly acknowledged before approval.

## Notes

- A review that only checks style misses correctness/security issues — prioritize correctness and security first.
