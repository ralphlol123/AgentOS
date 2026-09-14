---
name: frontend-design
category: frontend
mode: full
summary: "use for UI design, design review, and interaction/feel polish."
---

# Frontend Design

Trigger: Use when creating new UI, reviewing UI changes (especially AI-generated), or refining interaction/motion/feedback on an already-functional UI.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual UI stack/version and design system, and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## New design vs refinement

- New design: establish structure that reuses the existing design system; do not introduce a parallel set of ad hoc values.
- Refinement: improve interaction quality without changing structure or behavior; prefer removing something inconsistent over adding a one-off.

## Procedure

1. Compare against the existing design system/spacing/typography scale instead of introducing new ad hoc values.
2. Check responsive behavior at common breakpoints, not just the default viewport.
3. Verify accessibility basics: semantic elements, labels, focus order, and sufficient contrast.
4. Verify all interactive states: hover, focus, disabled, loading, empty, and error — not just the default state with data.
5. Confirm interactive elements give immediate visual feedback; animations/transitions are subtle and consistent with the rest of the app.
6. Remove generic placeholder copy, redundant wrapper elements, and unused styles introduced during generation.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- UI matches the existing design language; all interactive states are visibly implemented, not just the default state.
- Interact with the feature end-to-end in a browser and confirm feedback/timing feels consistent with the rest of the app.

## Notes

- Watch for tells of ungrounded generation: inconsistent spacing units, unnecessary nested elements, and copy that does not match the product voice.
