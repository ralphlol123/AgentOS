---
name: systematic-debugging
category: core
mode: full
summary: "use for unclear bugs or inconsistent reproduction."
---

# Systematic Debugging

Trigger: Use when a bug's root cause is unclear or reproduction is inconsistent.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Reproduce the failure with the smallest possible input before changing any code.
2. Form a specific hypothesis about the cause; do not guess-and-check broadly.
3. Add logging/assertions or use a debugger to confirm or reject the hypothesis with real evidence.
4. Fix the confirmed root cause, not just the symptom.
5. Remove temporary debugging instrumentation before finishing.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Re-run the original failing case and confirm it now passes.
- Run the existing test suite to check for regressions.

## Notes

- Prefer binary search (bisecting commits/inputs) over linear scanning when the failure is intermittent.
- Write down the hypothesis and the evidence that confirmed/rejected it so the fix can be reviewed.
