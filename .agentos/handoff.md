# Handoff

## Current objective

Decide next: reinstall AgentOS in Photobooth or first run one tiny controlled write-path AgentOS smoke in this repo.

## Scope

- Workspace kind: single-repo
- Repo in scope: `agentos-for-projects` at `.`
- Files in scope: root adapters, `.agentos/*`, and read-only engine smoke outputs
- Protected paths: secrets, npm tokens, unrelated repos, Photobooth app repos unless explicitly requested

## Current state

- Ran a plain, no-AgentOS-prefix read-only prompt from the repo root:
  - project name
  - current objective
  - repo scope
  - protected paths
  - exact verification commands
  - project instruction/context files used
- Claude Code PASS:
  - command used `claude -p ... --allowedTools Read --output-format json --no-session-persistence`
  - output correctly identified `agentos-for-projects`, the active objective, scope, protected paths, verification commands, and context files.
- OpenCode PASS:
  - command used `opencode run ... --dir /home/hermes/agentos-for-projects --format json`
  - output correctly identified `agentos-for-projects`, the active objective, scope, protected paths, verification commands, and context files.
- Codex PASS:
  - command used `codex -a never exec --sandbox read-only -C /home/hermes/agentos-for-projects --output-last-message ...`
  - output correctly identified `agentos-for-projects`, the active objective, scope, protected paths, verification commands, and context files.
- Evidence log written to `.agentos/runs/plain-engine-boot-20260802.md`.
- `git status --short --branch` stayed clean after the smoke runs; only AgentOS record files were updated afterward.

## Last completed step

Plain-engine boot smoke passed for Claude Code, OpenCode, and Codex in read-only mode; evidence committed and pushed.

## Files changed

- `.agentos/runs/plain-engine-boot-20260802.md`
- `.agentos/tasks.md`
- `.agentos/status.md`
- `.agentos/handoff.md`

## Tests run

- `git status --short --branch` before/after each smoke class
- `agentos doctor`
- `agentos status`
- Claude Code read-only smoke
- OpenCode read-only smoke
- Codex read-only smoke with read-only sandbox and approval never

## Known failures

None for read-only boot.

## Caveats

- This proves read-only context discovery, not safe editing behavior.
- Continue using explicit `agentos prompt <engine>` for higher-risk editing work until write-path behavior is dogfooded with a tiny controlled change.
- Claude Code output reported `num_turns: 13` despite a `--max-turns 5` invocation; the run succeeded and remained read-only, but do not rely on that flag alone for cost control in this environment.

## Next exact action

Decide whether to reinstall AgentOS in Photobooth now or first run one tiny controlled write-path AgentOS smoke in this repo.

## Protected files / do not touch

- `.env` files
- npm tokens / auth files
- auth tokens/secrets
- unrelated project repos
- Photobooth workspace unless the user explicitly asks to reinstall AgentOS there

## Open decisions

- Whether to reinstall AgentOS in Photobooth next or first run a tiny controlled write-path AgentOS smoke in this repo.
