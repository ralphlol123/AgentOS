---
name: test-driven-development
category: core
mode: full
summary: "use when adding or changing behavior."
---

# Test-Driven Development

Trigger: Use when adding or changing behavior that can be exercised by an automated test.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Write a failing test that encodes the new/changed behavior before writing implementation code.
2. Run the test and confirm it fails for the expected reason (RED).
3. Write the minimum implementation needed to make the test pass (GREEN).
4. Refactor with the test suite green, without changing behavior.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Run the test suite and confirm the new test passes along with all existing tests.

## Notes

- A RED test that fails for the wrong reason (e.g. a typo) is not a valid RED step — fix the test itself first.
- Keep each RED/GREEN cycle small; commit-sized increments make review easier.
