# GitHub Code Review Mechanics

Load this reference only when the review is hosted on GitHub. Do not assume other providers support these commands.

- Read the PR description and linked issue for intent before reading the diff.
- Review every changed file across all commits, not just the largest diff.
- Post inline comments on specific lines; distinguish must-fix from optional suggestions in the comment text.
- Use `gh pr review --request-changes` for blocking feedback and `gh pr review --approve` only after must-fix comments are resolved.
- Required status checks must be green before approving/merging.

Typical commands:

```bash
gh pr view <number> --json title,body,files
gh pr diff <number>
gh pr review <number> --comment --body "..."
gh pr review <number> --request-changes --body "..."
gh pr review <number> --approve
```
