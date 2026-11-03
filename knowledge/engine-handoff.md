---
id: brain:engine-handoff
kind: convention
scope: .
status: accepted
sources:
  - knowledge/engine-handoff.md
source_hash: 0fe64093608d54059341d766404c6de2d1e8a83c335bbfc4e17032623e16fe4b
---
# Engine handoff workflow

Owner direction, 2026-11-03: work in one engine, save project knowledge and task progress, and manually open another engine when needed to continue. Engine launching, automatic provider switching and native conversation transfer are outside this goal.

## Start or continue

Run `agentos status`, then `agentos context <engine> --task <id>`. Reuse that task id across engines. Read relevant Brain records and inspect current files before editing. Context reconciles an existing checkpoint's verification with current Git state; `agentos resume --task <id>` gives detailed drift or recovery evidence.

## While working

Checkpoint after meaningful implementation milestones, checks and decisions, and before stopping. Record accomplished work, blockers and the next concrete action. Use `--check` for checks AgentOS actually executes; `--claim` is not observed verification. Do not wait until an engine hits its limit.

Durable changes go through Brain proposals and the configured approval policy. Progress belongs in checkpoints; architecture and decisions belong in knowledge records. Do not turn a successful check into a claim that all prose is correct.

## Interrupted work

The latest checkpoint may precede unsaved work. Inspect current changes and re-run stale checks. Without a checkpoint, resume offers Git evidence, not a reconstruction of the previous engine's intentions. Keep unknown work and next actions explicitly unknown until investigated.

## Sources

- `AGENTS.md` and `.agentos/guide.md`: generated operating instructions.
- `docs/checkpoints.md`: checkpoint, receipt and recovery contracts.
- `docs/brain.md`: record lifecycle and approval policy.
- `src/checkpoint.ts` and `src/core.ts`: implementation of startup reconciliation.
