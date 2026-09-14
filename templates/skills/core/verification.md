---
name: verification
category: core
mode: full
summary: "use before trusting a \"done\" report from a person, agent, or tool."
---

# Verification

Trigger: Use when a person, subagent, tool, or automated report claims work is done, tests pass, or a build is green.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual stack and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Do not trust a "done"/"tests pass" claim at face value; independently re-run the actual command yourself.
2. Check real evidence — file/git/terminal state, diffs, file contents, test output — rather than the summary text.
3. Confirm the change satisfies the original acceptance criteria/request, not just that something changed.
4. Judge evidence quality: prefer real command output over description, full runs over partial, and current output over cached/old results.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Independently reproduce the reported test/build result and confirm the diff matches the claimed change.
- Any check that was blocked, skipped, or could not be run is reported explicitly rather than assumed to pass.

## Notes

- Summaries describe intent, not guaranteed outcome — verify before reporting up the chain.
- A green build does not prove the acceptance criteria are met; map evidence back to the original request.
