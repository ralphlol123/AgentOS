# Context builder (`agentos context`)

`agentos context <engine> [--task "<text>"] [--about "<phrase>"] [--role <agent-id>] [--scope <repo-or-path>,...] [--budget <tokens>] [--json] [--include-superseded] [--require-synced-config] [--require-enforcement] [--require-complete]`

Builds the context one engine needs for one task and one role. Read-only: it reads `.agentos/` state and never writes a file, lock or temp file (tested by hashing the whole fixture tree with a private `TMPDIR`). `agentos context --brief` (the short prefix `agentos prompt` printed before 3.0.0) is unchanged. Code: `src/context-builder.ts`; wiring: `contextAgentOS` in `src/core.ts`.

## Inputs

| Input | Rule |
|---|---|
| engine | Same normalisation as `prompt` (`claude` → `claude-code`, …). Unknown names pass through and get the generic overhead. |
| `--task` | Free text. Its words (3+ characters, trailing `s` dropped, minus stopwords) are the match terms. Without it only "always relevant" records are added. The stopwords (`STOPWORDS` in `src/context-builder.ts`, shared with `brain search`) are a few connectives (`the`, `and`, `for`, `should`, `must`, …) plus common English function words: question words (`how`, `what`, `when`, …), auxiliaries (`does`, `can`, `would`, …), determiners and pronoun-like words (`each`, `some`, `one`, `other`, …), prepositions and conjunctions (`before`, `after`, `out`, `between`, `while`, …) and generic verbs/adverbs (`keep`, `kept`, `take`, `very`, `even`, `both`, `time`, `long`, …). `get`, `make` and `about` are deliberately not stopwords (HTTP `GET`, the `make` tool, `--about`). A task id made only of such words matches nothing beyond the always-relevant records. |
| `--about` | Optional search phrase, separate from the task id. Its words become extra match terms (same rules as `--task`) that are also matched against the body of each Brain record, so a record with a generic title (`Decision 2026-10-12`) is found by a phrase in its text. Never used for the task id: `checkpoint`/`resume` do not take it, and the checkpoint `context` loads is still the `--task` one. Bodies are matched, not rendered: records stay by reference. Without `--about` selection is unchanged. |
| `--role` | Must be listed in `agents.enabled`; otherwise exit 1. Default: `agents.capabilities.implementation`, else the first enabled agent. A missing `.agentos/agents/<role>.md` is a `missing` warning, not fatal. |
| `--scope` | Comma list of repo IDs or workspace-relative paths, validated like `task_scope`. It replaces the read scope and keeps only the `task_scope.edit` entries it still covers, so it never widens edit. No `--scope` → `task_scope`; neither → read is the whole workspace (`.`) and edit is empty; the Scope section prints `Edit scope: not set (no task_scope in .agentos/project.yaml). Edit only the files the owner's task names; ask the owner to set task_scope.` with a warning. No default edit scope is invented. |
| `--budget` | Positive whole number of tokens; default 24000 for every engine. |
| `--require-synced-config` | Configuration presence: claude-code and codex, every file `agents sync` generated must still match its sync record and what sync would generate now for the recorded role/scope (`Synced config: OK/STALE/INVALID/MISSING/UNSUPPORTED`; exit 1 and nothing rendered unless OK). The `--role`/`--scope` of the `context` call do not change the check. See [engines.md](engines.md#synced-config-freshness). |
| `--require-enforcement` | Always exit 1 in v1, every engine (`Enforcement: UNSUPPORTED — …`, nothing rendered): AgentOS cannot establish enforcement. |
| `--require-complete` | Exit 1 when the bundle has Missing items (the bundle is still printed). |

## Records

Mandatory (placed first, never truncated): `objective` (`resolveObjective`, the resolver `status`/`doctor`/`compact` use), `constraints` (generated rules: the `prompt` rules line, the engine-specific rule lines and the Obsidian link-only line, plus the handoff "Protected files / do not touch" section or one of its aliases), `scope`, and `role:<id>` (the agent card).

The bounded project overview and active task checkpoint (when present) are mandatory too. Checkpoint receipts are reconciled using the same current Git evidence as `resume`: the section separates current passing checks from remaining/stale checks, prints drift, and labels progress as the previous engine's saved account. An incomplete checkpoint is listed under Missing (`--require-complete` exits 1). Drift/unavailable evidence produces a warning; it does not erase the saved progress or silently count stale passes as current. All warnings, including an empty registered Brain, appear in both human output and JSON. An empty Brain warning is not proof that other project documents do not exist.

Optional: `acceptance` (`## Acceptance criteria` in `tasks.md`, else `handoff.md`, else "(none recorded)"), `handoff:current-state`, `handoff:next-exact-action`, `repo:<id>` (`.agentos/repos/<id>.md`), `verify:<id>` (the repo's `*_command` values from `project.yaml`, `unknown` dropped), `read:<path>` (a read-scope path that is not a repo, by reference), `decision:<slug>` (every `##`/`###` heading of `decisions.md`), `skill:<id>` (each `- <id> — …` entry of `skills.md`, by reference; the card file is not read), and `knowledge:<note>` (each `[[note]]` in `knowledge.md`, by reference only; the vault is never read).

## Selection signals, in order

1. **Scope filter** → `out-of-scope`. A repo note or verification record is in scope when a read entry covers the whole repo (its ID, its path, an ancestor, or `.`). A path inside a repo does not bring the repo in: reading `api/contracts/openapi.yaml` does not include `repo:api`. A root repo (`path: .`) is in scope when some read entry lies outside every child repo. A skill path is in scope when it is under `.agentos/` or covered by read; absolute or `..` paths are always out.
2. **Status filter** → `superseded`. A heading containing `superseded`/`deprecated`, or a line `status: superseded|deprecated` (optionally bulleted or bold, frontmatter included). `--include-superseded` keeps them, labelled `[superseded]`; they never count as conflicts.
3. **Match filter** → `no-match`. Decisions, skills, linked notes and Brain records need at least one task term in their ID (without the `kind:` prefix), heading, skill-index heading, path, or Brain title/kind. Body text is not matched by `--task` terms; `--about` terms also match Brain record bodies (not `decisions.md` section bodies). The scope and status filters run first, so an out-of-scope or superseded record with the phrase stays omitted. Acceptance, handoff state, repo notes, verification and read paths are always relevant.
   A Brain record that would be `no-match` but whose file is already shown section by section (for example `brain:decisions` and the `decision:*` sections of `.agentos/decisions.md`) is reported as `covered` with `via: <section id>` (text: `covered by <section id> (same file, shown above)`), not as `no-match`.
4. **Rank**: score = 1 for always-relevant + number of matched terms; ties broken by freshness (a `YYYY-MM-DD` in the heading, else the file mtime), then source order.
5. **Brain first for `--about` hits, capped at three and never at the cost of task context**: the top three Brain records (in the order of step 4) that matched at least one `--about` term (after the stopwords) may move ahead of every other optional record, the always-relevant ones included (acceptance, handoff state, repo notes, verification, read paths). The rule, applied when packing the budget: pack the step-4 order and note which always-relevant items fit; then try the top 3, then 2, then 1 of those Brain hits first, followed by everything else in the step-4 order, and keep the first try in which every one of those always-relevant items still fits (no try fits → the step-4 order). So a promotion only takes room the task sections did not need: under a tight budget it displaces lower-ranked Brain records and anything that did not fit anyway. The 4th and later Brain hits, and a Brain record that matched only `--task` terms, keep their step-4 place. At the default budget everything usually fits, so the top three hits are simply listed first. Without `--about` (or when every `--about` word is a stopword) no record qualifies and the order and packing are unchanged.

## Conflicts and missing

- `conflicts`: two or more included, current decisions whose subject is equal. Subject = heading without a leading date and separator, up to the first `:`, lowercased. `Package manager: npm` and `Package manager: bun` conflict.
- `missing`: unresolved objective (fatal: `ok:false`, exit 1, no rendering), missing agent card, no role, a scope path that does not exist (warnings), and an unavailable linked Obsidian folder (`vault unavailable: <path>` plus one entry per record last known there; see `docs/obsidian.md`). `ok` stays true for these; `--require-complete` makes any `missing` entry exit 1 (`INCOMPLETE`, the bundle is still printed).

## Budget

- Tokens are estimated as `ceil(chars/4)`; every figure carries the label `estimate (chars/4)`. They are not tokenizer counts.
- Fixed per-engine overhead, reserved from the budget for what the engine reads before this context (its bootloader file, system prompt, tool scaffolding). **Assumptions, not measurements:** claude-code 2000, hermes 2000, codex 1500, opencode 1500, any other engine 1000.
- `budget.estimate` = overhead + `ceil(chars / 4)` of everything the engine receives: `text` (header, sections, and the Omitted/Conflicts/Missing/Warnings blocks) plus the engine's `ADVISORY:` lines (printed after `text` without `--json`, listed as `advisories` with it), i.e. `ceil([text, '', ...advisories].join('\n').length / 4)`. The figure is the same in human and `--json` output. Not counted: the human `Budget:` line and the `--require-synced-config` status line after it (they report on the budget), and the JSON envelope around `text`.
- **Guarantee:** every successful result (`ok:true`, exit 0) has `budget.estimate <= budget.limit`.
- Overflow: `needed` is the estimate of the smallest rendering: header and mandatory sections, no optional record, every optional record listed under Omitted (`budget`), plus Missing, Warnings and the advisories. If `needed` exceeds the limit, the result is `ok:false` with `overflow: {needed, budget, mandatory: [{id, kind, tokens}]}`, `AgentOS context: OVERFLOW` and an explanation instead of a rendering, and exit 1. Nothing is truncated. `--budget <needed>` succeeds; `--budget <needed - 1>` overflows.
- Optional records are added in rank order (with step 5 of the selection signals: up to three Brain `--about` hits first, while the always-relevant items that fit without them still fit). The first one that does not fit, and every one after it, is omitted with reason `budget`. If the whole rendering then exceeds the limit, the last optional records are dropped (reason `budget`) until it fits; with none left it fits, because `needed <= limit`. The Omitted list is never shortened.

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

Ranking is plain term overlap (an `--about` hit in a body counts like a hit in a title, and any one hit is enough): no stemming beyond a trailing `s`, no synonyms, no semantic deduplication. The overhead numbers are unmeasured. Scope is advisory, as in `prompt`: nothing AgentOS renders stops an engine from editing outside it (engine-side enforcement: [engines.md](engines.md#enforcement-vs-synced-configuration)).
