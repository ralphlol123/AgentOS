# GitHub PR Commands

Load this reference only when the assigned repo is hosted on GitHub. Do not assume other providers support these commands.

```bash
gh pr create --base <base> --head <branch> --title "..." --body "..."
gh pr view <number> --json state,mergeStateStatus,statusCheckRollup
gh pr checks <number>
gh pr merge <number> --squash   # only when authorized and checks are green
```

- Confirm the branch is pushed and up to date with its base before `gh pr create`.
- Use `gh pr checks` to confirm required status checks are green before merge.
- If PR creation is unavailable from the environment, provide the compare URL: `https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1`.
