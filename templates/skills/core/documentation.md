---
name: documentation
category: core
mode: full
summary: "use when writing/updating docs about code behavior."
---

# Documentation

Trigger: Use when writing or updating documentation (README, agent context files, comments, guides) about how the code behaves.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual stack and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Read the actual current implementation before describing behavior; do not describe intended/legacy behavior from memory.
2. Prefer linking to file:line over duplicating logic in prose that can drift out of sync.
3. Verify commands/examples in the doc by actually running them.
4. Follow the project's existing documentation conventions and structure rather than imposing a new format.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Every command and code reference in the doc has been executed/checked against the current codebase.

## Notes

- Docs that describe aspirational behavior instead of real behavior are worse than no docs — they actively mislead.
