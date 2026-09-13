---
name: nestjs-feature-implementation
category: backend
mode: full
summary: "use when implementing a new NestJS feature."
---

# NestJS Feature Implementation

Trigger: Use when implementing a new NestJS feature (module/controller/service).

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Follow the existing module boundary conventions (module/controller/service/DTO) instead of inventing a new structure.
2. Validate input DTOs explicitly; do not trust unvalidated request bodies.
3. Keep controllers thin; put business logic in services.
4. Wire the new provider into its module and confirm Nest resolves the dependency graph at boot.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Application boots with the new module wired in; the new endpoint/service behaves as specified for valid and invalid input.

## Notes

- A missing provider/module import surfaces as a boot-time DI error, not a test failure — always boot-check after wiring changes.
