# GitHub Actions Specifics

Load this reference only when the assigned repo uses GitHub Actions.

## Procedure

1. Confirm the workflow triggers (`on:`) match the intended events; overly broad triggers waste CI minutes and can create races.
2. Set `permissions:` explicitly at workflow or job level to least privilege.
3. Pin third-party actions to a commit SHA or trusted version tag, not a mutable branch ref.
4. Verify `secrets.*` used in the workflow are scoped to what the job actually needs.
5. Confirm the actual hosted run result with `gh run list` / `gh run view --log-failed`, not just local YAML validation.

## Notes

- Never disable a required status check to unblock a merge without explicit approval.
