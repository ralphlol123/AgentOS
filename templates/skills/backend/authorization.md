---
name: authorization
category: backend
mode: full
summary: "use for auth/permission/access-control work."
---

# Authorization

Trigger: Use when implementing or changing authentication/authorization, permissions, resource ownership, or tenant boundaries, in any backend stack.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual stack/version and existing auth model, and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Identify exactly which routes/resources the change affects and what identity/role model applies.
2. Enforce resource ownership and tenant boundaries — a valid identity is not automatically authorized for a specific resource.
3. Centralize authorization checks in the project's established mechanism rather than scattering ad hoc inline checks.
4. Fail closed: default to denying access when a check cannot be evaluated.
5. Add a test for both an authorized and an unauthorized request.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- An authorized request succeeds and an unauthorized request is rejected with the correct status code.

## Notes

- Treat auth/permission code as security-sensitive: prefer explicit allow-lists over implicit deny-by-omission.
- Do not assume a specific framework mechanism (e.g. NestJS guards) is universal; use the assigned repo's idiom. For NestJS specifics load `references/nestjs.md` only when it applies.
