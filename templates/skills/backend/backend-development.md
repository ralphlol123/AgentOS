---
name: backend-development
category: backend
mode: full
summary: "use when implementing a new backend feature."
---

# Backend Development

Trigger: Use when implementing a new backend feature (endpoint/service/handler) in any backend stack.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual backend stack/version from its project files and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Follow the existing architecture and module/layer boundary conventions of the repo instead of inventing a new structure.
2. Validate input explicitly; do not trust unvalidated request bodies/parameters.
3. Keep the business-logic boundary clear — request handlers stay thin, domain logic lives in the service/domain layer.
4. Handle error paths deliberately with appropriate status codes/results, not just the happy path.
5. Wire the new component into the application's runtime graph and confirm it resolves/boots.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Application boots with the new code wired in; the new endpoint/service behaves as specified for valid and invalid input.

## Notes

- A missing wiring/dependency often surfaces as a boot-time error, not a test failure — always boot-check after wiring changes.
- For framework-specific structure (modules/providers/decorators), load the matching reference only when it applies to the assigned repo, e.g. `references/nestjs.md` for NestJS.
