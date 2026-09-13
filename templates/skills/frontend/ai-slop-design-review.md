---
name: ai-slop-design-review
category: frontend
mode: full
summary: "use for UI polish/design review."
---

# AI-Slop Design Review

Trigger: Use when UI polish/design review, especially on AI-generated or AI-assisted UI changes.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Compare against the existing design system/spacing/typography scale instead of introducing new ad hoc values.
2. Check responsive behavior at common breakpoints, not just the default viewport.
3. Remove generic placeholder copy, redundant wrapper elements, and unused CSS introduced during generation.
4. Verify interactive states: hover, focus, disabled, loading, and error.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- UI matches existing design language; all interactive states are visibly implemented, not just the default state.

## Notes

- Watch for tells of ungrounded generation: inconsistent spacing units, unnecessary nested divs, and copy that does not match the product voice.
