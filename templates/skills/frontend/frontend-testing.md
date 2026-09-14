---
name: frontend-testing
category: frontend
mode: full
summary: "use before declaring frontend work done."
---

# Frontend Testing

Trigger: Use when declaring frontend work done, or when route/component/browser behavior changes.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual frontend framework/version and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Run the project build command and confirm it exits cleanly; run type-checking/linting if configured.
2. Start the dev/preview server and load the affected route/component in a real browser.
3. Exercise the changed route/component through real navigation and interaction, not just unit tests.
4. Check the browser console and network requests for errors during the flow.
5. Run the project's automated e2e/regression test command if one is configured; add a regression test for the fixed/changed behavior.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Build command exits 0; no new console/network errors on the affected pages.
- Manual or automated pass on the changed route covering the golden path plus at least one edge case (empty/error state).

## Notes

- A green build does not guarantee a working UI — always do a real browser pass for user-facing changes.
- For framework-specific e2e tooling and dev-server details, load the matching reference only when it applies to the assigned repo, e.g. `references/nuxt.md` for Nuxt.
