---
name: nuxt-e2e-testing
category: frontend
mode: full
summary: "use for Nuxt route/browser behavior."
---

# Nuxt E2E Testing

Trigger: Use when Nuxt route/browser behavior changes.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Start the Nuxt dev/preview server.
2. Exercise the changed route/component through real navigation and interaction, not just unit tests.
3. Check network requests and console for errors during the flow.
4. Run the project e2e test command if one is configured.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Manual or automated e2e pass on the changed route with no console/network errors.

## Notes

- Prefer testing the golden path plus at least one edge case (empty state, error state) over the golden path alone.
