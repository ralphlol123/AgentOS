---
name: integration-testing
category: fullstack
mode: full
summary: "use before declaring cross-component/cross-service work done."
---

# Integration Testing

Trigger: Use when declaring a change done that spans multiple components or services (not only frontend+backend — any real cross-boundary interaction).

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned components' actual stacks and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Run the interacting components/services against each other for real, not against mocks/stubs of one another.
2. Exercise the full flow across the boundary end-to-end (e.g. through the real UI, real API calls, or real message/queue path).
3. Check logs/console/network on every participating component during the flow for errors.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- End-to-end flow completes successfully with all participating components running live, no unexpected errors in any log.

## Notes

- Passing each component's test suite independently does not guarantee they integrate correctly — always rehearse the full flow together.
