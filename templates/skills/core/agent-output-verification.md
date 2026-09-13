---
name: agent-output-verification
category: core
mode: full
summary: "use before trusting another agent's \"done\" report."
---

# Agent Output Verification

Trigger: Use when another agent, subagent, or automated report claims work is done.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Do not trust a "done"/"tests pass" claim at face value; re-run the actual command yourself.
2. Check the real file/git/terminal state (diff, file contents, test output) rather than the summary text.
3. Confirm the change addresses the original request, not just that something changed.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Independently reproduce the reported test/build result and confirm the diff matches the claimed change.

## Notes

- Subagent summaries describe intent, not guaranteed outcome — verify before reporting up the chain.
