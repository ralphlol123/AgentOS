---
name: requesting-code-review
category: core
mode: full
summary: "use for pre-commit/pre-merge review."
---

# Requesting Code Review

Trigger: Use when asking a human or another agent to review a change.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Run the full local verification suite (build/lint/test) and fix failures before requesting review.
2. Write a summary of what changed and why, not just what the diff shows.
3. Call out any known trade-offs, skipped edge cases, or follow-up work explicitly.
4. Keep the diff scoped to the stated task; split out unrelated cleanup into a separate change.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Review checklist: verification commands run and passing; summary written; scope matches the request.

## Notes

- A reviewer without your context should be able to understand the "why" from the summary alone.
