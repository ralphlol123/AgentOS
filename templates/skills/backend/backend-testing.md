---
name: backend-testing
category: backend
mode: full
summary: "use for backend verification before declaring backend work done."
---

# Backend Testing

Trigger: Use when declaring backend work done, or when verifying a backend change end-to-end.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual backend stack/version and test tooling, and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not run migrations, destructive operations, or anything against production without explicit authorization.

## Procedure

1. Discover the project's test tooling and choose the right levels: unit, integration, api/e2e, and a real runtime boot check.
2. Start the service locally and confirm it boots without errors.
3. Exercise the changed endpoint(s) with a real request (HTTP client), not just unit tests.
4. Cover the meaningful cases: success, invalid input, unauthorized/denied, and failure/error paths.
5. When data is involved, verify the actual database behavior; be explicit about what is mocked vs. exercised against a real dependency.
6. Check logs for unexpected errors/warnings during the requests.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Real request to the changed endpoint returns the expected response for success and invalid/denied cases with no unexpected errors in logs.

## Notes

- Unit tests can pass while the service fails to boot due to config/DI issues — always do a real boot check.
- State clearly which checks used mocks and which exercised real dependencies so results are not overtrusted.
