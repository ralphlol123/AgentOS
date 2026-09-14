---
name: commit-messages
category: github
mode: full
summary: use when generating or reviewing commit messages from Git changes.
---

# Commit Messages

Trigger: Use when generating, reviewing, or preparing a commit message from current Git changes, in any repository or tooling.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual stack and conventions, and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Read-only default

- STAY READ-ONLY by default. Do not run `git add`, `git commit`, `git push`, `git reset`, `git checkout`, or any destructive/writing Git command unless the user explicitly requested that action.
- Read-only Git inspection (`git status`, `git diff`, `git log`) is expected and encouraged — do not avoid it.
- Do not run formatters or checks that modify files without authorization.
- Never default to `git add .`; when a command is explicitly requested, stage explicit intended paths.

## Procedure

1. Inspect the current Git state with read-only commands: `git status --short --branch`, then the staged diff (`git diff --staged --stat`, `git diff --staged`).
2. Prefer staged changes when staged files exist. If nothing is staged, generate the message from unstaged changes (`git diff --stat`, `git diff`) and clearly tell the user that nothing is staged — never imply changes are staged when they are not.
3. Handle untracked files explicitly: a plain `git diff` omits them, so run `git status`/`git ls-files --others --exclude-standard` to detect them. Report their presence, inspect the relevant non-sensitive ones, and never imply they are staged.
4. Produce SEPARATE messages per independent Git repository when the change spans more than one repo.
5. Detect whether the diff represents one coherent concern. If it mixes unrelated features, fixes, refactors, docs, or generated artifacts, recommend splitting into separate commits unless the user explicitly asks for one combined commit.
6. Stop before recommending a commit if the diff includes secrets, `.env` files, private keys, credentials, or production config. Treat migrations and config changes with appropriate review, not as secrets to hide.
7. DISCOVER the project's commit conventions before writing — check for commitlint config, a `.gitmessage`/CONTRIBUTING guide, or the existing `git log` style to learn allowed types, scopes, and line limits. Follow what the project actually uses instead of hardcoding your own limits.
8. If the user authorizes a check/formatter that modifies files, run it, report the real output, and re-inspect the updated Git diff before producing the final message.
9. Describe outcomes and intent, not filenames. Do not invent any change not visible in the inspected diff.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Git diff/status were inspected immediately before producing the message.
- The recommended message only describes changes present in the actual diff.
- Untracked files, sensitive files, secrets, generated artifacts, and unrelated changes were called out instead of silently folded into the message.
- Any authorized check/formatter run is reported with real command output, and the diff was re-inspected afterward.

## Output

Follow the project's discovered convention. A widely-used default is a short imperative subject line followed by outcome-focused body bullets:

```text
<summary of the outcome>

- <what changed and why>
- <what changed and why>
```

If the user asks for the exact command, prefer explicit staged paths over `git add .`:

```bash
git add <intended-file-1> <intended-file-2>
git commit -m "<summary>" -m "- <outcome bullet 1>
- <outcome bullet 2>"
```

## Notes

- A failed check means "not verified/ready", not "cannot describe the change" — you can still produce a message and report that verification did not pass.
- Generated artifacts should not dominate the message; summarize the source change that caused them.
- Conventional Commits is one supported convention, not a universal mandate. When the project uses it, load `references/conventional-commits.md`.
