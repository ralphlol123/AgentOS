---
name: conventional-commit
category: github
mode: full
summary: use when generating or reviewing commit messages from Git changes.
---

# Conventional Commit

Trigger: Use when generating, reviewing, or preparing a commit message from current Git changes.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Capture a fresh Git baseline before message generation: `git status --short --branch`, then inspect staged changes first with `git diff --staged --stat` and `git diff --staged`; if nothing is staged, inspect unstaged changes with `git diff --stat` and `git diff`.
2. Prefer staged changes when staged files exist. If only unstaged changes exist, generate the message from unstaged changes and clearly tell the user that nothing is staged.
3. Never run `git add`, `git commit`, `git push`, `git reset`, `git checkout`, or destructive Git commands unless the user explicitly requested that action.
4. Stop before recommending a commit if the diff includes secrets, `.env` files, private keys, credentials, production config, migrations, or unrelated work that should be split.
5. Run available project quality checks before finalizing the message when safe and configured, using the project commands from `.agentos/project.yaml` and `.agentos/repos/*.md`; skip missing commands instead of inventing them.
6. If formatting/check commands changed files, notify the user and re-inspect the updated Git diff before generating the final message.
7. Detect whether the diff represents one coherent concern. If it mixes unrelated features, fixes, refactors, docs, or generated artifacts, recommend split commits unless the user explicitly asks for one combined commit.
8. Choose a Conventional Commit type: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `build`, `ci`, `chore`, or `revert`.
9. Choose a scope from the business or product domain first. Use technical scopes like `api`, `db`, `ui`, `build`, `deps`, or `tests` only when no clear product domain exists.
10. Write the subject in imperative mood, max 72 characters, focused on the outcome rather than filenames.
11. Write body bullets in past tense, grouping related outcomes instead of listing files. Do not invent any change not visible in the inspected diff.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Git diff/status were inspected immediately before producing the message.
- The recommended message only describes changes present in the actual diff.
- Sensitive files, secrets, generated artifacts, and unrelated changes were called out instead of silently folded into the message.
- Any quality checks or formatter runs are reported with real command output, and the diff was re-inspected afterward.

## Output

Recommended format:

```text
<type>(<scope>): <imperative summary>

- <Past-tense outcome bullet>
- <Past-tense outcome bullet>
```

If the user asks for the exact command, prefer explicit staged paths over `git add .` when possible:

```bash
git add <intended-file-1> <intended-file-2>
git commit -m "<type>(<scope>): <summary>" \
  -m "- <Past-tense bullet 1>
- <Past-tense bullet 2>"
```

## Notes

- Generated artifacts should not dominate the message; summarize the source change that caused them.

This is a generalized version of Ralph's KargaX commit-message workflow. Project-local copies may add domain-specific scope priorities, package-manager commands, or repository-specific quality gates.
