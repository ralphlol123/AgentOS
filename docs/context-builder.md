# Context builder (`agentos context`)

`agentos context <engine> [--task "<text>"] [--role <agent-id>] [--scope <repo-or-path>,...] [--budget <tokens>] [--json] [--include-superseded] [--require-synced-config] [--require-enforcement] [--require-complete]`

Builds the context one engine needs for one task and one role. Read-only: it reads `.agentos/` state and never writes a file, lock or temp file (tested by hashing the whole fixture tree with a private `TMPDIR`). `agentos prompt` is unchanged. Code: `src/context-builder.ts`; wiring: `contextAgentOS` in `src/core.ts`.

## Inputs

| Input | Rule |
|---|---|
| engine | Same normalisation as `prompt` (`claude` → `claude-code`, …). Unknown names pass through and get the generic overhead. |
| `--task` | Free text. Its words (3+ characters, minus a few stopwords, trailing `s` dropped) are the match terms. Without it only "always relevant" records are added. |
| `--role` | Must be listed in `agents.enabled`; otherwise exit 1. Default: `agents.capabilities.implementation`, else the first enabled agent. A missing `.agentos/agents/<role>.md` is a `missing` warning, not fatal. |
| `--scope` | Comma list of repo IDs or workspace-relative paths, validated like `task_scope`. It replaces the read scope and keeps only the `task_scope.edit` entries it still covers, so it never widens edit. No `--scope` → `task_scope`; neither → read is the whole workspace (`.`) and edit is empty; the Scope section prints `Edit scope: not set (no task_scope in .agentos/project.yaml). Edit only the files the owner's task names; ask the owner to set task_scope.` with a warning. No default edit scope is invented. |
| `--budget` | Positive whole number of tokens; default 24000 for every engine. |
| `--require-synced-config` | Configuration presence: claude-code and codex, every file `agents sync` generated must still match its sync record and what sync would generate now for the recorded role/scope (`Synced config: OK/STALE/INVALID/MISSING/UNSUPPORTED`; exit 1 and nothing rendered unless OK). The `--role`/`--scope` of the `context` call do not change the check. See [engines.md](engines.md#synced-config-freshness). |
| `--require-enforcement` | Always exit 1 in v1, every engine (`Enforcement: UNSUPPORTED — …`, nothing rendered): AgentOS cannot establish enforcement. |
| `--require-complete` | Exit 1 when the bundle has Missing items (the bundle is still printed). |

## Records

Mandatory (placed first, never truncated): `objective` (`resolveObjective`, the resolver `status`/`doctor`/`compact` use), `constraints` (generated rules: the `prompt` rules line, the engine-specific rule lines and the Obsidian link-only line, plus the handoff "Protected files / do not touch" section or one of its aliases), `scope`, and `role:<id>` (the agent card).

Optional: `acceptance` (`## Acceptance criteria` in `tasks.md`, else `handoff.md`, else "(none recorded)"), `handoff:current-state`, `handoff:next-exact-action`, `repo:<id>` (`.agentos/repos/<id>.md`), `verify:<id>` (the repo's `*_command` values from `project.yaml`, `unknown` dropped), `read:<path>` (a read-scope path that is not a repo, by reference), `decision:<slug>` (every `##`/`###` heading of `decisions.md`), `skill:<id>` (each `- <id> — …` entry of `skills.md`, by reference; the card file is not read), and `knowledge:<note>` (each `[[note]]` in `knowledge.md`, by reference only; the vault is never read).

## Selection signals, in order

1. **Scope filter** → `out-of-scope`. A repo note or verification record is in scope when a read entry covers the whole repo (its ID, its path, an ancestor, or `.`). A path inside a repo does not bring the repo in: reading `api/contracts/openapi.yaml` does not include `repo:api`. A root repo (`path: .`) is in scope when some read entry lies outside every child repo. A skill path is in scope when it is under `.agentos/` or covered by read; absolute or `..` paths are always out.
2. **Status filter** → `superseded`. A heading containing `superseded`/`deprecated`, or a line `status: superseded|deprecated` (optionally bulleted or bold, frontmatter included). `--include-superseded` keeps them, labelled `[superseded]`; they never count as conflicts.
3. **Match filter** → `no-match`. Decisions, skills and linked notes need at least one task term in their ID (without the `kind:` prefix), heading, skill-index heading or path. Body text is not matched. Acceptance, handoff state, repo notes, verification and read paths are always relevant.
   A Brain record that would be `no-match` but whose file is already shown section by section (for example `brain:decisions` and the `decision:*` sections of `.agentos/decisions.md`) is reported as `covered` with `via: <section id>` (text: `covered by <section id> (same file, shown above)`), not as `no-match`.
4. **Rank**: score = 1 for always-relevant + number of matched terms; ties broken by freshness (a `YYYY-MM-DD` in the heading, else the file mtime), then source order.

## Conflicts and missing

- `conflicts`: two or more included, current decisions whose subject is equal. Subject = heading without a leading date and separator, up to the first `:`, lowercased. `Package manager: npm` and `Package manager: bun` conflict.
- `missing`: unresolved objective (fatal: `ok:false`, exit 1, no rendering), missing agent card, no role, a scope path that does not exist (warnings), and an unavailable linked Obsidian folder (`vault unavailable: <path>` plus one entry per record last known there; see `docs/obsidian.md`). `ok` stays true for these; `--require-complete` makes any `missing` entry exit 1 (`INCOMPLETE`, the bundle is still printed).

## Budget

- Tokens are estimated as `ceil(chars/4)`; every figure carries the label `estimate (chars/4)`. They are not tokenizer counts.
- Fixed per-engine overhead, reserved from the budget for what the engine reads before this context (its bootloader file, system prompt, tool scaffolding). **Assumptions, not measurements:** claude-code 2000, hermes 2000, codex 1500, opencode 1500, any other engine 1000.
- `budget.estimate` = overhead + `ceil(text.length / 4)` of the rendered text, including the Omitted/Conflicts/Missing blocks.
- Mandatory records: if overhead + header + mandatory sections exceed the limit, the result is `ok:false` with `overflow: {needed, budget, mandatory: [{id, kind, tokens}]}`, an explanation instead of a rendering, and exit 1. Nothing is truncated.
- Optional records are added in rank order. The first one that does not fit, and every one after it, is omitted with reason `budget`. If the trailer then pushes the total over the limit, the last optional record is dropped too.

## Output

`--json` prints only the bundle (runtime-checked by `assertContextBundle`):

```json
{ "ok": true, "engine": "claude-code", "task": "…", "role": "developer",
  "scope": { "repos": ["web=./web"], "read": ["web"], "edit": ["web"] },
  "budget": { "limit": 24000, "estimate": 3980, "overhead": 2000, "label": "estimate (chars/4)" },
  "included": [{ "id": "objective", "kind": "objective", "source": ".agentos/handoff.md#Current objective", "reason": "mandatory", "tokens": 101 }],
  "omitted": [{ "id": "decision:…", "kind": "decision", "reason": "superseded" }],
  "conflicts": [], "missing": [], "warnings": [], "text": "…" }
```

`overflow` is present only on overflow. Without `--json` the command prints `text` (prompt-style header, `Task:`/`Role:` lines, one `## <title>` section per included record with a `Source: <path>#<heading>` line, then `## Omitted (n)`, `## Conflicts` and `## Missing` when non-empty) followed by a `Budget:` line.

## Known limits

Ranking is plain term overlap: no stemming beyond a trailing `s`, no synonyms, no semantic deduplication. The overhead numbers are unmeasured. Scope is advisory, as in `prompt`: nothing AgentOS renders stops an engine from editing outside it (engine-side enforcement: [engines.md](engines.md#enforcement-vs-synced-configuration)).
