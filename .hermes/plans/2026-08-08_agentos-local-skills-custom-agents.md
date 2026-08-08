# AgentOS Local Skills + Custom Agents Implementation Plan

> **For Hermes:** Use Claude Code or a direct TDD lane to implement this plan task-by-task when Ralph explicitly resumes the sprint. Do not use Codex while Codex quota is constrained.

**Goal:** Add production-ready project-local skill cards and custom/local agent support so AgentOS can port procedures and planning roles across Claude Code/OpenCode/Codex without relying on Hermes-only global skills.

**Architecture:** Keep AgentOS a context layer, not an execution runner. Add CLI surfaces for materializing skills and migrating Claude legacy context, preserve custom agents in YAML/doctor fix paths, and validate all behavior through `test/core.test.js` plus CLI/package smoke tests. Default to compact summaries; full skill bodies are opt-in.

**Tech Stack:** TypeScript CLI (`src/cli.ts`, `src/core.ts`), Node test runner (`test/core.test.js`), YAML package, Bun/npm/pnpm compatibility scripts.

---

## Guardrails

- Do **not** implement `agentos run`, daemons, dashboards, embeddings, cloud sync, or orchestration.
- Do **not** re-enable AgentOS in KargaX during implementation. Use temp fixtures for tests.
- Do **not** copy project-specific skills into default templates.
- Default skill mode must be compact summaries; full mode must be explicit.
- Preserve existing project YAML fields when patching.
- `doctor --fix` must not drop custom agents already declared in `.agentos/project.yaml`.

---

## Phase 0: Baseline and branch hygiene

### Task 0.1: Capture baseline

**Objective:** Verify clean starting state before feature work.

**Files:** none

**Commands:**

```bash
git status --short --branch
node dist/cli.js doctor
node dist/cli.js status
bun run check
bun run test
```

**Expected:** clean or only planned files modified; doctor/status OK; tests pass.

---

## Phase 1: Skill template model

### Task 1.1: Add built-in skill catalog constants

**Objective:** Define the common development-stage local skill catalog in source.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Catalog:**

```text
core:
- systematic-debugging
- test-driven-development
- shared-repo-git-safety
- agent-output-verification
- requesting-code-review
- secret-scanner-safe-edits
- grounded-codebase-docs
frontend:
- frontend-build-verification
- nuxt-e2e-testing
- ai-slop-design-review
- interface-feel-polish
backend:
- backend-service-verification
- nestjs-feature-implementation
- nestjs-auth-guards
- backend-pr-review
fullstack:
- full-system-rehearsal
github:
- github-pr-workflow
- github-code-review
- github-actions-verification
```

**Steps:**
1. Add a failing test that imports/runs a skill catalog API indirectly through a public function.
2. Add internal constants for category, skill ID, description, role mapping, and compact summary body.
3. Verify no Photobooth/KargaX-specific IDs exist in the catalog.

**Verification:**

```bash
bun run build
node --test --test-name-pattern "skills catalog"
```

---

### Task 1.2: Implement compact/full skill template rendering

**Objective:** Generate either compact summaries or full built-in templates.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Design:**

```ts
type SkillMode = 'summary' | 'full';
```

Default:

```text
summary
```

Full mode can initially be richer built-in text, not raw Hermes filesystem reads. Avoid runtime dependency on `~/.hermes/skills`.

**Steps:**
1. Add RED test: summary mode writes shorter `SKILL.md` with frontmatter, trigger/use-case, procedure, and verification.
2. Add RED test: full mode writes longer detailed template and is opt-in.
3. Implement `renderSkillTemplate(skill, mode)`.

**Verification:**

```bash
bun run build
node --test --test-name-pattern "skill template"
```

---

## Phase 2: `agentos skills add`

### Task 2.1: Add core API for adding skills

**Objective:** Materialize skills under `.agentos/skills/<category>/<skill>/SKILL.md` and update `.agentos/skills.md`.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**API idea:**

```ts
export async function skillsAgentOS(options: {
  cwd?: string;
  add?: string | string[];
  detected?: boolean;
  mode?: 'summary' | 'full';
  dryRun?: boolean;
})
```

**Behavior:**

```bash
agentos skills add --detected
agentos skills add --detected --mode full
agentos skills add ai-slop-design-review
agentos skills add frontend-pack
```

**Steps:**
1. RED test: `--detected` in Nuxt/Nest multi-repo fixture writes frontend/backend/fullstack/core/github skills.
2. RED test: specific skill writes only that skill.
3. RED test: unknown skill fails loudly.
4. Implement filesystem writes and `.agentos/skills.md` role sections with `Details: .../SKILL.md` links.
5. Preserve `Policy: on-demand`.

**Verification:**

```bash
bun run build
node --test --test-name-pattern "skills add"
```

---

### Task 2.2: Wire CLI subcommand

**Objective:** Add `agentos skills add ...` command parsing.

**Files:**
- Modify: `src/cli.ts`
- Modify: `README.md` if command list exists there
- Test: `test/core.test.js` or CLI-focused test if present

**Steps:**
1. Add help text.
2. Parse nested command: `command === 'skills'`, first positional arg `add`.
3. Support flags `--detected`, `--mode summary|full`, `--dry-run`.
4. Print clear changed/would-change output.

**Verification:**

```bash
bun run build
node dist/cli.js skills add --help || true
```

---

## Phase 3: Doctor validation for local skills

### Task 3.1: Validate skill links and orphan local skills

**Objective:** Catch the exact KargaX issue where skill files existed but were unlisted, and links could be missing.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Rules:**

- Warn if `.agentos/skills.md` contains `Details: .agentos/skills/.../SKILL.md` and file is missing.
- Warn if `.agentos/skills/**/SKILL.md` exists but its relative path is not listed in `.agentos/skills.md`.
- Warn if a local skill file exceeds a simple size threshold, e.g. 20KB, as token-heavy.

**Verification:**

```bash
bun run build
node --test --test-name-pattern "doctor.*skills"
```

---

## Phase 4: Custom/local agents + project-manager

### Task 4.1: Preserve declared custom agents

**Objective:** Stop `doctor --fix` from dropping declared custom agents like `project-manager`.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Current bug:**

```ts
buildAgentSelection(...).filter((id) => AGENT_DEFINITIONS[id])
```

drops unknown IDs.

**New behavior:**

- Built-ins still get generated default `agentMd` files.
- Custom IDs in `.agentos/project.yaml` are allowed if `.agentos/agents/<id>.md` exists.
- `init --agents custom-id` should still fail unless there is a future `--allow-custom` flag; do not silently create arbitrary unknown roles from CLI typos.
- `doctor --fix` must preserve already-declared custom IDs from existing project YAML.

**RED tests:**

1. Fixture with `agents.enabled: [implementation, project-manager]` and `.agentos/agents/project-manager.md` should have no stale-agent warning.
2. `doctor --fix` should preserve `project-manager` in `project.yaml`.
3. Missing custom file should warn.

**Verification:**

```bash
bun run build
node --test --test-name-pattern "custom agent|project-manager"
```

---

### Task 4.2: Add optional built-in planning role

**Objective:** Support a planning capability and planning-only `project-manager` role.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**Design choice:** Prefer built-in optional role over arbitrary custom for this specific role.

**Agent definition:**

```text
project-manager: Break down coding/product requests into scoped, dependency-aware implementation plans before specialist agents edit files.
```

**Capability:**

```yaml
agents:
  capabilities:
    planning: project-manager
```

**Rules:**

- Planning role does not implement, commit, or push.
- It declares repo scope, protected paths, dependencies, role assignment, acceptance, and verification.
- Do not include in default `detected` yet unless explicitly requested, or use `--agents planning,...` alias.

**Aliases:**

```text
planning -> project-manager
pm -> project-manager
project-manager -> project-manager
```

**Verification:**

```bash
bun run build
node --test --test-name-pattern "project-manager|planning"
```

---

## Phase 5: Claude legacy migration

### Task 5.1: Implement migration core API

**Objective:** Automate preserve-but-disable `.claude` migration safely.

**Files:**
- Modify: `src/core.ts`
- Test: `test/core.test.js`

**API idea:**

```ts
export async function migrateClaudeAgentOS(options: {
  cwd?: string;
  preserve?: boolean;
  dryRun?: boolean;
})
```

**Behavior:**

- `.claude/agents` -> `.claude/agents.agentos-legacy-<timestamp>`
- `.claude/settings.local.json` -> `.claude/settings.local.json.agentos-legacy-<timestamp>`
- `.claude/settings.json` -> `.claude/settings.json.agentos-legacy-<timestamp>` if present
- Create `.claude/README.agentos.md`.
- Patch/create root `CLAUDE.md` with AgentOS canonical context block.
- Idempotent: rerun should not duplicate block or overwrite legacy backups.

**Tests:**

1. Preserves old files under legacy names.
2. Creates README.
3. Does not expose or inspect secrets from settings content.
4. Rerun is safe.

---

### Task 5.2: Wire CLI command

**Objective:** Add `agentos migrate claude --preserve`.

**Files:**
- Modify: `src/cli.ts`
- Modify: help/README as needed
- Test: CLI behavior if present

**Command:**

```bash
agentos migrate claude --preserve
agentos migrate claude --preserve --dry-run
```

**Verification:**

```bash
bun run build
node dist/cli.js migrate claude --preserve --dry-run
```

---

## Phase 6: Default Obsidian destination and permissions diagnostics

### Task 6.1: Change default destination

**Objective:** Make `agentos link-obsidian --create` default to `Projects/<ProjectName>/AgentOS`.

**Files:**
- Modify: `src/core.ts`
- Modify: `src/cli.ts`
- Test: `test/core.test.js`

**Current code:**

```ts
const destination = normalizeVaultRelativePath(options.dest || `Projects/${title(projectName).replace(/\s+/g, ' ')}`);
```

**New behavior:**

```text
Projects/<ProjectName>/AgentOS
```

**Tests:**

- Project `kargax` or `KargaX` defaults to `Projects/KargaX/AgentOS` if title/sanitizer supports it.
- Explicit `--dest` remains respected.

---

### Task 6.2: Improve EACCES diagnostics

**Objective:** Make Obsidian permission failures actionable.

**Files:**
- Modify: `src/core.ts`
- Test: optional if easy; otherwise manual smoke

**Behavior:** Catch mkdir/write `EACCES` and include:

```text
Permission denied creating <path>.
Check ownership/write permissions of parent folder.
For WSL/app-user workspaces, ensure the target Obsidian project folder is writable by the same user running agentos.
```

---

## Phase 7: Full verification

Run:

```bash
bun install --frozen-lockfile
bun run check
bun run test
bun run smoke
bun run test:package-managers
bun pm pack --dry-run
git diff --check
node dist/cli.js doctor
node dist/cli.js status
```

Optional read-only engine smoke after implementation, if usage budget allows:

```bash
claude -p "Use AgentOS read-only. Report available skills/custom-agent behavior. Do not edit files." --allowedTools Read --output-format json --no-session-persistence
```

Do not use Codex unless Ralph approves after quota recovery.

---

## Expected commit structure

Commit in small slices:

1. `feat: add AgentOS local skill templates`
2. `feat: add skills add command`
3. `feat: validate local skills in doctor`
4. `feat: preserve custom AgentOS agents`
5. `feat: add project-manager planning role`
6. `feat: add Claude legacy migration`
7. `fix: default Obsidian destination and permission diagnostics`

Do not squash until review is complete.

---

## Open questions before execution

1. Should `project-manager` be included in `--agents detected`, or only via explicit `--agents planning,...`?
   - Recommendation: explicit only for now.
2. Should full skill mode ship bundled full text, or should it import from Hermes at build time?
   - Recommendation: bundled curated full templates, no runtime Hermes dependency.
3. Should local skill templates be included in npm package as files or source constants?
   - Recommendation: source constants first for packaging simplicity; external template files only if content grows too large.
4. Should `agentos migrate claude --preserve` remove or only rename `.claude/settings.local.json`?
   - Recommendation: rename only, preserving fallback.
