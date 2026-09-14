---
name: git-safety
category: core
mode: full
summary: "use before commit/push/merge or when touching config/env/credential files in shared repos."
---

# Git Safety

Trigger: Use when running any git command that rewrites history or touches files you did not author this session, before staging a broad `git add`, or when a change touches config, env, or credential-adjacent files — especially in shared/team repos.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual conventions and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Run `git status` before any destructive operation (checkout/reset/clean/restore) to see what would be affected.
2. Never force-push to a shared branch without explicit approval.
3. Preserve unrelated in-progress work in place. Do not stash, commit, discard, or move another owner's work without explicit approval; use an isolated worktree or stop when a branch switch/rebase would disturb it.
4. Review a broad `git add` with `git status`/`git diff --staged` before committing to avoid pulling in unrelated or secret files. Prefer staging explicit intended paths over `git add .`.

## Secret handling (absorbed safeguards)

- Never read, edit, or commit `.env` files or credential files without explicit approval.
- Before staging, inspect `git status` and `git diff --staged` for unexpected files (keys, tokens, dumps) and unexpected literal values.
- If a secret-looking value must be referenced, use a placeholder/env-var name in code, never the literal value.
- If a secret is discovered already committed, flag it to the user instead of silently rewriting history. Rotating a leaked secret is a security decision for the user/owner, not something to do unilaterally.
- Treat migrations and config changes as review-worthy, not as secrets to hide.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- `git status --short --branch` shows only the intended changes before commit/push.
- `git diff --staged` contains no literal credentials, tokens, or private keys.

## Notes

- Prefer `git revert` over `git reset --hard`/force-push once a commit is shared with others.
- Treat `--no-verify` and `--no-gpg-sign` as last resorts; investigate hook failures instead of bypassing them.
