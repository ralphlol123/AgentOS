---
name: ci-verification
category: github
mode: full
summary: "use when adding/changing CI workflows."
---

# CI Verification

Trigger: Use when adding or changing continuous-integration workflows/pipelines, in any CI system.

## Scope and safety

- Read AgentOS project, memory, handoff, and tasks first. Confirm this skill is relevant to the assigned role and task; load only relevant repo/engine context.
- Declare repo scope and protected paths. Detect the assigned repo's actual CI system and use the project-specific verification commands from `.agentos/project.yaml` and the relevant repo notes; do not invent missing commands.
- Do not touch secrets, `.env`, production config, migrations, deployments, or unrelated work without explicit approval. Do not stage, commit, push, or merge unless explicitly assigned.

## Procedure

1. Confirm the workflow triggers match the intended events; overly broad triggers waste CI minutes and can create races.
2. Confirm permissions are scoped to what the jobs actually need (least privilege).
3. Check the runtime matrix (OS/language/version) actually covers the intended targets.
4. Verify secrets used in the pipeline are scoped to what the job needs and are never printed to logs.
5. Pin third-party actions/steps to a trusted version or commit, not a mutable branch ref.
6. Confirm the actual hosted run result, not just that the YAML parses.

## Verification

- Real command/check output is captured before declaring success; report failures, skipped checks, and blockers honestly.
- No out-of-scope files, secrets, production config, or migrations were touched without explicit approval.
- Workflow run succeeds on the intended trigger and does not expose secrets in logs.

## Notes

- Never disable a security-relevant CI check (e.g. a required status check) to unblock a merge without explicit approval.
- For provider-specific syntax and tooling, load the matching reference only when it applies, e.g. `references/github-actions.md` for GitHub Actions.
