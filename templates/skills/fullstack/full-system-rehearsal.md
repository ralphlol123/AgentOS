---
name: full-system-rehearsal
category: fullstack
mode: summary
source: built-in-agentos-template
---

# Full System Rehearsal

Trigger: Use before declaring cross-repo/full-stack changes complete.

## Procedure

1. Read AgentOS project, memory, handoff, and tasks first.
2. Confirm this skill is relevant to the assigned role and task before loading more context.
3. Apply the project-specific verification commands from `.agentos/project.yaml` and `.agentos/repos/*.md`.

## Verification

- Real command/check output is captured before declaring success.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.

## Notes

This repository template is portable source material. Project-local copies under `.agentos/skills/` may be customized for a workspace.
