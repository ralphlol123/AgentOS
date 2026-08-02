# Status

Last updated: 2026-08-03

## Health

- AgentOS doctor: OK after Phase 1 agent model changes.
- AgentOS status: OK.
- Full Bun/release verification: OK.
- Package-manager compatibility: npm/pnpm/Bun OK.
- npm publish dry-run: OK.
- Photobooth dry-run with new detected profile: OK.
- Photobooth rollout/update to new detected profile and on-demand skills index: OK, verified.
- Claude Code plain-engine read-only smoke in Photobooth: OK, passed.

## Phase 1 agent model

Implemented:

- default minimal delivery team: `implementation`, `qa`, `code-reviewer`, `release-manager`
- default `detected` profile: minimal team plus repo-evidence specialists
- detected specialists currently limited to `frontend-engineer` and `backend-engineer`
- custom comma-list aliases such as `frontend,qa,release`
- unknown custom aliases fail loudly instead of silently dropping roles
- `.agentos/project.yaml` shape: `agents.profile`, `agents.capabilities`, `agents.enabled`
- generated `.agentos/skills.md` with `Policy: on-demand`
- doctor warnings for missing skills index, missing agent files, capability/enabled mismatches, and stale extra agent files

## Claude Code review

- Claude Code reviewed the updated Phase 1 diff after fixes.
- Verdict: PASS, no merge blockers.
- Non-blocking note: `doctor --fix` warns about orphaned agent files instead of auto-deleting them, which is intentionally safer.

## Current phase

Phase 1 is verified, committed, pushed, and remote HEAD is verified. Photobooth rollout to the new detected profile and on-demand skills index is done and verified, including a passing Claude Code plain-engine read-only smoke test.

## Phase 2

`agentos run` is ON HOLD / deferred — Ralph confirmed it is not needed at the moment. Next AgentOS action: hold on `agentos run`; wait for a new concrete AgentOS priority, or optionally maintain rollout docs / gather real-world feedback.
