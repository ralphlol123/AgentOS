# Plain Engine Boot Smoke — 2026-08-02

## Purpose

Dogfood whether plain engine launches from the AgentOS repo can discover and use project-owned context without an explicit `agentos prompt ...` prefix.

## Prompt used

```text
Without changing files, inspect this project and report:
1. Project name.
2. Current objective.
3. Repo scope.
4. Protected paths.
5. The exact verification commands you would run before making changes.
6. Which project instruction/context files you used.

This is a read-only smoke test. Do not edit files, do not run package installs, do not commit, and do not push.
```

## Criteria

Pass means the engine, with no explicit AgentOS prefix, reports:

- project name;
- current objective;
- repo scope;
- protected paths;
- verification commands;
- project instruction/context files used;
- no file edits, installs, commits, or pushes.

## Claude Code

Command:

```bash
claude -p "$(cat /tmp/agentos-plain-boot-prompt.txt)" --allowedTools Read --max-turns 5 --output-format json --no-session-persistence
```

Result: PASS.

Notes:

- Claude auto-used `CLAUDE.md`, `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/repos/agentos-for-projects.md`, `.agentos/engines/claude-code.md`, `.agentos/decisions.md`, `.agentos/status.md`, `.hermes.md`.
- No repo changes after run.

Output excerpt:

```text
I've read through all the AgentOS context files. Here's the smoke-test report — no files were edited, no installs or commits were run.

## 1. Project name
**agentos-for-projects** (`.agentos/project.yaml`)

## 2. Current objective
"Dogfood plain-engine boot behavior with Claude Code/OpenCode/Codex read-only tasks." (`.agentos/handoff.md`, matches `.agentos/tasks.md` "Now" item and `.agentos/status.md` "Next recommended work"). This confirms this smoke test itself *is* the current objective in progress.

## 3. Repo scope
Single-repo workspace, one repo in scope:
- **agentos-for-projects** at `.` — Node/TypeScript CLI package, Bun-dogfooded, npm/pnpm/Bun compatible.

Files explicitly in scope per handoff: `package.json`, `README.md`, `LICENSE`, `test/package-metadata.js`, `.github/workflows/ci.yml`, `.agentos/*`.

## 4. Protected paths
From `.agentos/handoff.md` and `AGENTS.md`/`CLAUDE.md` rules:
- `.env` files
- npm tokens / auth files
- auth tokens / secrets
- migrations / prod config (no changes without approval)
- unrelated project repos
- Photobooth workspace/app repos — unless explicitly requested

## 5. Verification commands (what I'd run before making changes)
From `.agentos/project.yaml` and `.agentos/repos/agentos-for-projects.md`:
```
bun install --frozen-lockfile        # install
bun run build                        # build (regenerate dist/)
bun run check                        # type check / dev
bun run test                         # unit tests
bun run smoke                        # smoke test
bun run test:package-managers        # npm/pnpm/Bun compatibility
bun pm pack --dry-run                # pack verification
```
Plus release-specific checks seen in handoff history: `bun run release:check`, `bun run publish:dry-run`, and `agentos doctor` / `agentos doctor --json`.

## 6. Files used
- `/home/hermes/agentos-for-projects/CLAUDE.md`
- `AGENTS.md`
- `.agentos/project.yaml`
- `.agentos/memory.md`
- `.agentos/handoff.md`
- `.agentos/tasks.md`
- `.agentos/knowledge.md`
- `.agentos/repos/agentos-for-projects.md`
- `.agentos/engines/claude-code.md`
- `.agentos/decisions.md` (durable decision context)
- `.agentos/status.md` (health/current phase)
- `.hermes.md` (pointer/adapter file, not strictly required but present at root)

Note: `.agentos/agents/*` (backend-engineer, code-reviewer, frontend-engineer, qa-engineer, release-manager) exist but I didn't need their content for this report since it only covers role/task assignment, not project facts — happy to read them too if you want role definitions included.
```

## OpenCode

Command:

```bash
opencode run "$(cat /tmp/agentos-plain-boot-prompt.txt)" --dir /home/hermes/agentos-for-projects --format json
```

Result: PASS.

Notes:

- OpenCode auto-used `AGENTS.md` plus `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `package.json`, `.agentos/status.md`.
- No repo changes after run.

Output excerpt:

```text
Read-only smoke test report:

1. **Project name:** `agentos-for-projects` (Node/TypeScript CLI package, bin `agentos` -> `dist/cli.js`, v0.1.0). Project-owned context layer for model-agnostic coding agents.

2. **Current objective:** Dogfood plain-engine boot behavior with Claude Code/OpenCode/Codex read-only tasks (`.agentos/tasks.md:21`, `.agentos/handoff.md:5`).

3. **Repo scope:** Single-repo workspace; repo `agentos-for-projects` at `.` (cli-package, node-typescript-cli, Bun dogfood). Files in scope per handoff: `package.json`, `README.md`, `LICENSE`, `test/package-metadata.js`, `.github/workflows/ci.yml`, `.agentos/*` (`.agentos/handoff.md:9-11`).

4. **Protected paths:** `.env` files, npm tokens/auth files, secrets, unrelated project repos, and the Photobooth workspace unless explicitly requested (`.agentos/handoff.md:81-86`).

5. **Verification commands before changes** (from `project.yaml:23-28` and `package.json`):
   - `bun run check` (typecheck)
   - `bun run test`
   - `bun run smoke`
   - `bun run test:package-managers`
   - `bun run release:check` (aggregate: check + test + smoke + pkg-managers + publish dry-run)

6. **Context files used:** `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/status.md`, `package.json`. (Obsidian-linked notes in `knowledge.md` were not read; not relevant to this smoke test.)

No files edited, no installs, no commits, no pushes.
```

## Codex

Command:

```bash
codex -a never exec --sandbox read-only -C /home/hermes/agentos-for-projects --output-last-message /tmp/agentos-plain-boot-codex.out - < /tmp/agentos-plain-boot-prompt.txt
```

Result: PASS.

Notes:

- Codex ran with `approval=never` and `sandbox=read-only`.
- Codex used `AGENTS.md`, `.agentos/project.yaml`, `.agentos/memory.md`, `.agentos/handoff.md`, `.agentos/tasks.md`, `.agentos/knowledge.md`, `.agentos/repos/agentos-for-projects.md`, `.agentos/engines/codex.md`, `.agentos/agents/code-reviewer.md`.
- No repo changes after run.

Output excerpt:

```text
1. **Project name:** `agentos-for-projects`

2. **Current objective:** Dogfood plain-engine boot behavior with Claude Code, OpenCode, and Codex read-only tasks.

3. **Repo scope:**

   - Single repository: `agentos-for-projects` at `.`
   - Files currently in scope: `package.json`, `README.md`, `LICENSE`, `test/package-metadata.js`, `.github/workflows/ci.yml`, and `.agentos/*`

4. **Protected paths:**

   - `.env` files
   - npm tokens and authentication files
   - Other credentials or secrets
   - Unrelated repositories
   - Photobooth workspace/application repositories unless explicitly requested

5. **Exact verification commands I would run before making changes:**

```bash
bun run check
bun run build
bun run test
bun run smoke
bun run test:package-managers
bun pm pack --dry-run
```

For full release-readiness verification, the project also defines:

```bash
bun run release:check
bun run publish:dry-run
```

I did not run these commands because this was a read-only inspection, and some may generate build artifacts or exercise package workflows. I also did not run `bun install --frozen-lockfile`.

6. **Instruction/context files used:**

   - `AGENTS.md` instructions supplied for this workspace
   - `.agentos/project.yaml`
   - `.agentos/memory.md`
   - `.agentos/handoff.md`
   - `.agentos/tasks.md`
   - `.agentos/knowledge.md`
   - `.agentos/repos/agentos-for-projects.md`
   - `.agentos/engines/codex.md`
   - `.agentos/agents/code-reviewer.md`

No files were changed, installed, committed, or pushed.
```

## Conclusion

Plain-engine boot behavior is good enough for read-only AgentOS context discovery in this repo:

- Claude Code: PASS
- OpenCode: PASS
- Codex: PASS

Continue using explicit `agentos prompt <engine>` for higher-risk editing tasks until write-path behavior is tested separately.
