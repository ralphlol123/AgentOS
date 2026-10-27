# 3.0 CLI: removed form → new form

3.0.0 brings the CLI down to 11 commands: `init`, `status`, `doctor`, `context`, `checkpoint`, `resume`, `brain`, `agents`, `skills`, `obsidian`, `compact`. The forms deprecated in 2.1.0 are **removed in 3.0.0**. Each prints one line on stderr and exits 1, writing nothing (also with `--help`; with `--json` stdout stays empty):

```text
agentos handoff was removed in 3.0.0; use agentos status --full
```

**Older workspaces that still need a legacy migration** (pre-managed-block adapters with custom text, retired pre-0.4.0 cards, unsafe repository IDs, old `.claude` files): run `npx agentos-for-projects@2 doctor --fix` once first (add the flag its report names), then upgrade. The 2.x line keeps every legacy migration; 3.0.0 only reports them (`doctor --json` `migration` inventory).

| Removed in 3.0.0 | Use |
|---|---|
| `agentos handoff` | `agentos status --full` (status output, a blank line, then the reading list and handoff excerpt) |
| `agentos run handoff …` | `agentos checkpoint --task <id> …` before stopping, `agentos resume --task <id>` in the next engine |
| `agentos prompt [engine]` | `agentos context [engine] --brief` (byte-identical output) |
| `agentos adapters explain <file>` | `agentos doctor --explain <file>` |
| `agentos engines [--json]` | `agentos doctor --engines [--json]` |
| `agentos templates list` | `agentos agents list` and `agentos skills list` |
| `agentos templates show <id>` | `agentos agents show <id>` (the catalog card when it is not installed) or `agentos skills show <id>` |
| `agentos templates copy <id>` | `agentos agents add <id>` or `agentos skills add <id>` |
| `agentos templates validate <file> --type agent\|skill` | `agentos agents add <file> --dry-run` or `agentos skills add <file> --dry-run` (prints the `Validation:` findings; exit 1 when they fail) |
| `agentos templates import <url\|file> --type … --name …` | `agentos agents add <url\|file> --name …` or `agentos skills add <url\|file> --name …` (same hash pin, safety review, quarantine, `--replace`, `--yes`; an imported agent is a manifest card) |
| `agentos link-obsidian …` | `agentos obsidian link --note <path> …` (same exact-note, link-only behaviour; same prompts on a terminal) |
| `agentos obsidian link-workspace …` | `agentos obsidian link --no-index …` |
| `agentos brain validate <proposal>` | `agentos brain preview <proposal>` (exit 1 when validation rejects) |
| `agentos brain init` (workspace) | `agentos init` (it sets up the Brain). `agentos brain init --location vault` stays. |
| `agentos agents manifest <id> --from-catalog` | `agentos doctor --fix` (gives every legacy card that byte-matches the catalog its manifest). `agentos agents manifest <id> --custom` stays. |
| `agentos compact --checkpoint` | `agentos compact --archive-only` |
| `agentos compact --rewrite` | `agentos compact` |
| `agentos skills add … --mode summary\|full` | `agentos skills add …` (catalog cards are always complete; an imported skill keeps a summary excerpt) |
| `agentos init --agents detected` | `agentos init --agents minimal` (the same team; also the default without `--agents`) |
| `agentos doctor --fix --adopt-custom-adapters` | `npx agentos-for-projects@2 doctor --fix --adopt-custom-adapters` once, then upgrade (or move your text outside a fresh managed block by hand) |
| `agentos doctor --fix --prune-retired` | `npx agentos-for-projects@2 doctor --fix --prune-retired` once (or `agentos skills remove <old>` + `agentos skills add <new>`) |
| `agentos doctor --fix --normalize-repo-ids` | `npx agentos-for-projects@2 doctor --fix --normalize-repo-ids` once (or rename the key and `.agentos/repos/<id>.md` by hand) |
| `agentos migrate claude --preserve` | `npx agentos-for-projects@2 migrate claude --preserve` once (or rename the `.claude` files by hand) |

Also gone: the 2.1 `Deprecated:` notices and the `deprecations` field of `--json` output (including `migration.deprecations` in `doctor --json`). `doctor --fix` no longer migrates retired agent cards (2.x did, for byte-matched cards); it still canonicalises retired agent IDs in `project.yaml`.

Still read, unchanged: configs written by removed commands, e.g. `knowledge.obsidian.mode: link-only` (from `link-obsidian`) or `mode: workspace-folder` without `canonical`/`index` and with an absolute `vault` in `project.yaml` (from `obsidian link-workspace` before 2.0), skill cards written with `mode: full`, legacy agent cards from `templates import`, retired agent/skill IDs in `project.yaml`.

Library callers (`dist/core.js` is not a public API): `templatesAgentOS`, `runHandoffAgentOS`, `migrateClaudeAgentOS` and `normalizeRepoIdsAgentOS` are gone; `doctorAgentOS` ignores `adoptCustomAdapters`/`pruneRetired`; `compactAgentOS` takes `archiveOnly` (not `checkpoint`/`rewrite`).
