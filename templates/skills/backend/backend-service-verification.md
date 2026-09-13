---
name: backend-service-verification
category: backend
mode: full
summary: "use for local backend service verification."
---

# Backend Service Verification

Trigger: Use when declaring backend work done.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Start the service locally and confirm it boots without errors.
2. Exercise the changed endpoint(s) with a real request (curl/HTTP client), not just unit tests.
3. Check logs for unexpected errors/warnings during the request.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Real request to the changed endpoint returns the expected response with no unexpected errors in logs.

## Notes

- Unit tests can pass while the service fails to boot due to config/DI issues — always do a real boot check.
