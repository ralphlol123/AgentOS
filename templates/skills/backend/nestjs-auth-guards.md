---
name: nestjs-auth-guards
category: backend
mode: full
summary: "use for NestJS auth/permission/guard work."
---

# NestJS Auth Guards

Trigger: Use when NestJS auth/permission/guard work.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Identify exactly which routes/resources the change affects and what identity/role model applies.
2. Implement authorization checks in guards/decorators, not scattered inline checks in controllers.
3. Fail closed: default to denying access when a check cannot be evaluated.
4. Add a test for both an authorized and an unauthorized request.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- An authorized request succeeds and an unauthorized request is rejected with the correct status code.

## Notes

- Treat auth/permission code as security-sensitive: prefer explicit allow-lists over implicit deny-by-omission.
