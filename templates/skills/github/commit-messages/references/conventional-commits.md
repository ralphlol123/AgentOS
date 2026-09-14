# Conventional Commits

Load this reference only when the assigned repo uses the Conventional Commits convention (e.g. it has a commitlint config or its `git log` follows the pattern). Do not impose these rules on a project that does not use them.

## Format

```text
<type>(<scope>): <imperative summary>

- <outcome bullet>
- <outcome bullet>
```

## Types

`feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`. Confirm the project's allowed types from its commitlint config rather than assuming this exact set.

## Scope and style

- Choose a scope from the business/product domain first. Use technical scopes like `api`, `db`, `ui`, `build`, `deps`, or `tests` only when no clear product domain exists.
- Confirm allowed scopes and line limits from the project's commitlint/config; do not hardcode a length if the project specifies one.
- Write the subject focused on the outcome rather than filenames.
- Group related outcomes in body bullets instead of listing files.

This is a generalized version of a project-specific commit-message workflow. Project-local copies may add domain-specific scope priorities, package-manager commands, or repository-specific quality gates.
