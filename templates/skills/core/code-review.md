---
name: code-review
category: core
mode: full
summary: "use when preparing a change for review or performing a review."
---

# Code Review

Trigger: Use when asking a human or agent to review a change (PREPARING), or when reviewing someone else's change (PERFORMING).

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual stack/version and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

Pick the section that matches your role in the review.

### Preparing a review (as author)

1. Run the full local verification suite (build/lint/test as the project defines them) and fix failures before requesting review.
2. Write a summary of what changed and why, not just what the diff shows.
3. Call out any known trade-offs, skipped edge cases, or follow-up work explicitly.
4. Keep the diff scoped to the stated task; split out unrelated cleanup into a separate change.

### Performing a review (as reviewer)

1. Read the change description and linked issue/task for intent before reading the diff.
2. Review every changed file, not just the ones with the largest diff.
3. Prioritize correctness and security over style; a review that only checks style misses the important issues.
4. Distinguish must-fix comments from optional suggestions explicitly.
5. Load the domain checklist only when the change touches that domain: backend concerns → `references/backend-review.md`; security-sensitive code → `references/security-review.md`.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- As author: verification commands run and passing; summary written; scope matches the request.
- As reviewer: Do not approve while a must-fix finding remains unresolved. Acknowledgment alone is not resolution; report remaining blockers and require the project's review/check gates before approval.

## Notes

- A reviewer without your context should be able to understand the "why" from the summary alone.
- For provider-specific review mechanics (posting inline comments, requesting changes, approvals), load the matching provider reference, e.g. `references/github-review.md` for GitHub.
