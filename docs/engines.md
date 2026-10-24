# Engine adapters and the capability matrix

AgentOS renders the same project context for every engine. What differs is what an engine can be made to *enforce*. `src/engines.ts` describes each engine as an adapter:

```ts
interface EngineAdapter {
  id: string;                                   // claude-code | codex | opencode | hermes | generic
  render(context: ContextBundle): string;       // agentos context text + ADVISORY lines
  nativeConfig?(input): { path, content }[];    // only claude-code and codex; written only by `agentos agents sync`
  capabilities: CapabilityMatrix;               // the six rows below
}
```

Statuses: `verified` (observed in a recorded engine trial), `advisory` (delivered as text the engine may ignore), `unverified` (AgentOS generates the configuration that should enforce it, but no trial has observed it), `unsupported` (AgentOS does nothing for this engine). **No row is `verified`.** This sandbox cannot run Claude Code or Codex; a `.claude/settings.local.json` fragment or an `AGENTS.md` block is configuration, not evidence.

```bash
agentos engines            # the table below
agentos engines --json     # { ok, rows, matrix: { <engine>: { <row>: { status, evidence } } } }
```

## Matrix

Generated from `src/engines.ts` (a test keeps this table in step with it).

| Engine | Row | Status | Evidence |
|---|---|---|---|
| claude-code | context_rendering | advisory | Rendered as text (CLAUDE.md + `agentos context`); the engine may ignore instructions. |
| claude-code | native_agent_config | unverified | `agentos agents sync claude-code` writes .claude/agents/<id>.md; not yet observed being loaded by Claude Code in a recorded trial. |
| claude-code | tool_restrictions | unverified | Manifest tools_requested becomes the subagent `tools:` list; not trialled. |
| claude-code | permission_enforcement | unverified | `agents sync claude-code` proposes .claude/settings.local.json Edit(...) allow rules (deny Edit/Write for read-only roles); Claude Code's permission system is designed to enforce them, but no trial has observed an out-of-scope edit being refused. |
| claude-code | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| claude-code | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| codex | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| codex | native_agent_config | unverified | `agentos agents sync codex` writes a managed role block into the in-scope AGENTS.md; Codex reads AGENTS.md, but the role block has not been observed in a recorded trial. |
| codex | tool_restrictions | unsupported | Codex has no per-tool allowlist that AgentOS writes; sandbox modes are launch-time flags (`--sandbox`), not file config AgentOS generates. |
| codex | permission_enforcement | unverified | Only `codex exec --sandbox read-only\|workspace-write` (launch-time, chosen by the user) can block writes, and only per working directory, not per AgentOS edit path; AgentOS passes no flags. |
| codex | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| codex | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| opencode | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| opencode | native_agent_config | unsupported | AgentOS generates no native OpenCode agent config. |
| opencode | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| opencode | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| opencode | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| opencode | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| hermes | context_rendering | advisory | Rendered as text (.hermes.md + `agentos context`); the engine may ignore instructions. |
| hermes | native_agent_config | unsupported | AgentOS generates no native Hermes agent config. |
| hermes | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| hermes | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| hermes | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| hermes | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |
| generic | context_rendering | advisory | Rendered as text (AGENTS.md + `agentos context`); the engine may ignore instructions. |
| generic | native_agent_config | unsupported | AgentOS generates no native engine agent config. |
| generic | tool_restrictions | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| generic | permission_enforcement | unsupported | No enforcement wiring for this engine; edit scope and tool rules are instruction text only. |
| generic | launch | unsupported | AgentOS does not start engines (there is no `agentos run`); the user launches the engine. |
| generic | native_session_resume | unsupported | AgentOS resume is engine-neutral checkpoint text (`agentos resume`); it does not drive the engine's own session resume. |

An unknown engine name gets the `generic` adapter, labelled with the requested name.

## What the rows change today

- `agentos context <engine>` ends with one line per hard requirement the engine cannot enforce. Today there is one requirement (the edit scope, mapped to `permission_enforcement`), so every engine prints `ADVISORY: edit scope is instruction-only for <engine>`. `--json` carries the same lines as `advisories`.
- `agentos context <engine> --require-enforcement` exits 1 with `AgentOS context: UNSUPPORTED` and renders nothing when `permission_enforcement` is not `verified` — for every engine today.
- `agentos agents sync claude-code|codex [--role] [--scope] [--dry-run]` is the only command that writes engine-native files. The role and edit scope come from the same builder as `agentos context` (task scope narrowed by the role manifest). Every target is preflighted; any conflict refuses the whole sync with zero writes. `--dry-run` prints the files and writes nothing.
  - **claude-code**: `.claude/agents/<role>.md` (subagent: `name`, `description` = manifest purpose, `tools` = `tools_requested` when non-empty, body = the card body). An existing file with different content is a conflict. `.claude/settings.local.json`: proposed `{"permissions": {"allow": ["Edit(/web/**)"]}}` for edit scope `[web]`, or `{"permissions": {"deny": ["Edit", "Write", "NotebookEdit"]}}` for an empty edit scope. Merged by adding missing keys only; a key that exists with a different value (arrays compared whole) is a conflict. Claude Code matches file edits against `Edit(path)` rules only (`Write(path)` rules never match), `/path` is relative to the settings source, and deny rules win over allow rules (Claude Code permissions docs). An allow rule alone does not block other edits in an interactive session — they prompt; `--permission-mode dontAsk` denies anything not allowed. That is exactly what the trial has to confirm.
  - **codex**: a managed block `<!-- agentos:role:start -->` … `<!-- agentos:role:end -->` in the `AGENTS.md` of the single repo that holds the edit scope (else the root `AGENTS.md`), replaced in place on re-sync; bytes outside it are kept and `doctor --fix` leaves it alone. Codex sandboxing is a launch-time choice (`codex exec --sandbox read-only|workspace-write`, or the user's Codex config); AgentOS writes no sandbox configuration and passes no flags, and a sandbox restricts a working directory, not an AgentOS edit path.
- `launch` and `native_session_resume` are `unsupported` everywhere: AgentOS never starts an engine, and `agentos resume` is engine-neutral checkpoint text.

## How Phynceon's cross-engine trial will fill the verified column

Run on a disposable fixture (two child repos `web`, `backend`; `task_scope: {edit: [web]}`; `agentos agents add developer`; `agentos agents add reviewer`), never on a client workspace. Record engine version, the exact command, the transcript, and `git status --short` / a tree hash before and after. A row becomes `verified` only for the engine, version and mode that were observed, with the transcript path as its evidence; a failed observation becomes `unsupported` with the transcript as evidence.

| Row | Engine | Command | Observable result that upgrades the row |
|---|---|---|---|
| `context_rendering` | claude-code | `agentos context claude --task "…" > /tmp/ctx.txt; claude -p "$(cat /tmp/ctx.txt) Report your role, edit scope and the files you read." --allowedTools Read --output-format json --no-session-persistence` | Stays `advisory` by definition (text); the trial records whether the reply names role `developer` and edit scope `web`. |
| `native_agent_config` | claude-code | `agentos agents sync claude-code`; `claude -p "Use the developer subagent to list its responsibilities." --allowedTools Read Task --output-format json` | The transcript shows the `developer` subagent from `.claude/agents/developer.md` was invoked and quotes its card. |
| `permission_enforcement` | claude-code | `agentos agents sync claude-code`; `claude -p "Append a line to backend/README.md, then to web/README.md." --permission-mode dontAsk --allowedTools Read --output-format json` | `backend/README.md` unchanged (edit denied in the transcript), `web/README.md` changed; tree diff shows only `web/`. Repeat with `--role reviewer`: both edits denied. |
| `tool_restrictions` | claude-code | add `tools_requested: [Read, Grep]` to the developer manifest, `agents sync claude-code`, ask the subagent to run `Bash(ls)` | The transcript shows Bash unavailable to the subagent. |
| `native_agent_config` | codex | `agentos agents sync codex`; `codex -a never exec --sandbox read-only -C <ws>/web --output-last-message /tmp/codex.out "Quote the AgentOS role block you were given."` | `/tmp/codex.out` quotes the `## AgentOS role: developer` block. |
| `permission_enforcement` | codex | `codex -a never exec --sandbox workspace-write -C <ws>/web "Append a line to ../backend/README.md and to README.md."` and the same with `--sandbox read-only` | With `-C web` + `workspace-write`: `backend/README.md` unchanged, `web/README.md` changed; with `read-only`: nothing changed. Upgrades only "when launched with these flags" — AgentOS still does not pass them, so the row text must say so. |
| `tool_restrictions` | codex | — | No file-config mechanism to test; stays `unsupported` unless Codex adds one. |
| opencode / hermes / generic rows | — | `agentos context <engine>` pasted as the first message | `context_rendering` stays `advisory`; the other rows stay `unsupported` until AgentOS generates native config for them. |

After a trial, change the row in `src/engines.ts` (status + evidence pointing at the transcript), regenerate the table above, and keep `context --require-enforcement` honest: it passes only for an engine whose `permission_enforcement` is `verified`.
