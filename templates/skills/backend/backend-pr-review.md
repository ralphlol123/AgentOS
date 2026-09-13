---
name: backend-pr-review
category: backend
mode: full
summary: "use for reviewing backend pull requests."
---

# Backend PR Review

Trigger: Use when reviewing backend pull requests.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Check for missing input validation and unhandled error paths.
2. Check for N+1 queries or unbounded loops over external calls/DB rows.
3. Confirm migrations (if any) are backward compatible with the currently deployed code.
4. Confirm secrets/config are read from environment/config service, not hardcoded.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Review comments cover validation, error handling, performance, and migration safety, or explicitly note none apply.

## Notes

- A backward-incompatible migration deployed before the code that needs it is a common source of production incidents.
