---
name: interface-feel-polish
category: frontend
mode: full
summary: "use for interaction/motion/feedback polish."
---

# Interface Feel Polish

Trigger: Use when refining interaction/motion/feedback quality on an already-functional UI.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Check perceived responsiveness: interactive elements should give immediate visual feedback on click/tap.
2. Verify loading and empty states are handled, not just the happy path with data.
3. Confirm animations/transitions are subtle and consistent with the rest of the app, not one-off.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Interact with the feature end-to-end in a browser and confirm feedback/timing feels consistent with the rest of the app.

## Notes

- Prefer removing an animation that feels off over leaving an inconsistent one in.
