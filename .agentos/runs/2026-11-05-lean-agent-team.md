# Lean agent team implementation

Task: lean-agent-team. Branch: feat/lean-agent-team. Baseline: 7396b6c, package 3.3.0 unchanged.

## Delivered locally

- Core default: Developer, Writer and Researcher. Existing configured teams and custom cards preserved; legacy minimal profile retained.
- Separate opt-in team export for Claude Code, Codex and OpenCode; coexisting role files and separate ownership records; no runtime scheduler.
- Transactional writes, overwrite refusal/backups, scope-flag conflict checks, source-manifest validation and ownership path constraints.
- Advisory economy/standard/deep preferences and explicit engine model mappings. Missing mappings inherit the session model; no automatic cost/availability claims.
- Documentation, migration instructions, packaged agent guide and regression coverage.

## Verification observed during implementation

- Final npm test: 876 tests, 870 passed, 6 skipped, 0 failures. Node 24.22.1, Linux, root. Skips are existing permission tests that cannot exercise denial as root.
- npm run check, npm run smoke, npm run test:metadata (3/3), npm run pack:dry-run: passed.
- Ten new team integration tests passed, covering default/legacy selections, three-engine exports, repeat sync, explicit models, owner edits, disabled-role cleanup, rollback, invalid models, path boundaries, custom cards and missing/legacy cards.
- Generated YAML inspected; all three generated Codex role files parsed using Python tomllib.
- git diff --check passed.
- Initial test attempts exposed old-default expectations, which were updated; an overlapping build invalidated one earlier run. The final consolidated run above completed without that interference.
- Temporary raw logs were removed by workspace maintenance after completion; the recorded totals are from the tool output of the completed final run.

## Limits and next step

No engine CLIs were installed here: native discovery, invocation, actual model selection, permission behavior and cost savings remain unverified. Engine format references and limits are in docs/agents.md. Team export does not satisfy the legacy task-scoped require-synced-config gate, and leaves existing engine settings intact.

No independent reviewer has signed off. Review the diff and run bounded engine trials. No commits, push, PR, version bump or publication were performed.

Prior active state is preserved in 2026-11-04-before-lean-agent-team.md. Existing unfinished tasks remain in tasks.md.
