---
name: full-system-rehearsal
category: fullstack
mode: full
summary: "use before declaring cross-repo work done."
---

# Full System Rehearsal

Trigger: Use when declaring a cross-repo/full-stack change done.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Start both frontend and backend locally against each other, not against a mocked API.
2. Exercise the full user-facing flow end-to-end through the real UI.
3. Check both frontend console/network and backend logs during the flow for errors.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- End-to-end flow completes successfully with both services running live, no unexpected errors in either log.

## Notes

- Passing frontend and backend test suites independently does not guarantee they integrate correctly — always rehearse the full flow together.
