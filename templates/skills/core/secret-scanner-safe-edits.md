---
name: secret-scanner-safe-edits
category: core
mode: full
summary: "use before touching config/env/credential files."
---

# Secret-Scanner-Safe Edits

Trigger: Use when a change touches config, env, or credential-adjacent files, or before staging a broad `git add`.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Never read, edit, or commit `.env` files or credential files without explicit approval.
2. Before staging with a broad `git add`, inspect `git status` for unexpected files (keys, tokens, dumps).
3. If a secret-looking value must be referenced, use a placeholder/env-var name in code, never the literal value.
4. If a secret is discovered already committed, flag it to the user instead of silently rewriting history.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- `git diff --staged` contains no literal credentials, tokens, or private keys.

## Notes

- Rotating a leaked secret is a security decision for the user/owner to make, not something to do unilaterally.
