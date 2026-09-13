---
name: frontend-build-verification
category: frontend
mode: full
summary: "use before declaring frontend work done."
---

# Frontend Build Verification

Trigger: Use when declaring frontend work done.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Run the project build command and confirm it exits cleanly.
2. Run type-checking/linting if configured.
3. Load the affected route/component in a real browser and check the console for errors.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Build command exits 0; no new console errors on the affected pages.

## Notes

- A green build does not guarantee a working UI — always do a real browser pass for user-facing changes.
