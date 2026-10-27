# 2.1 CLI: old form → new form

2.1.0 brings the CLI down to 11 commands: `init`, `status`, `doctor`, `context`, `checkpoint`, `resume`, `brain`, `agents`, `skills`, `obsidian`, `compact`. Nothing is removed in 2.x. Each old form below still works exactly as in 2.0 and prints **one** line on stderr:

```text
Deprecated: `agentos handoff` will be removed in 3.0.0; use `agentos status --full`.
```

With `--json` the line is not printed; the JSON gets a top-level `deprecations` array instead (`area: "cli-form"`, `message`, `removed_in: "3.0.0"`), so the output stays valid JSON. `agentos <old-command> --help` still works and shows the mapping.

| Old (works until 3.0.0, one notice) | New |
|---|---|
| `agentos handoff` | `agentos status --full` (status output, a blank line, then what `handoff` printed) |
| `agentos prompt [engine]` | `agentos context [engine] --brief` (byte-identical output) |
| `agentos adapters explain <file>` | `agentos doctor --explain <file>` |
| `agentos engines [--json]` | `agentos doctor --engines [--json]` |
| `agentos run handoff …` | `agentos checkpoint --task <id> …` before stopping, `agentos resume --task <id>` in the next engine (no direct replacement) |
| `agentos link-obsidian …` | `agentos obsidian link --note <path> …` (same exact-note, link-only behaviour; same prompts on a terminal) |
| `agentos obsidian link-workspace …` | `agentos obsidian link --no-index …` |
| `agentos brain validate <proposal>` | `agentos brain preview <proposal>` (prints the checks; exits 1 when validation rejects) |
| `agentos brain init` (workspace) | `agentos init` (it sets up the Brain). `agentos brain init --location vault` stays, without a notice. |
| `agentos agents manifest <id> --from-catalog` | `agentos doctor --fix` (gives every legacy card that byte-matches the catalog its manifest; anything else is refused, as before). Custom cards: keep using `agentos agents manifest <id> --custom` until 3.0 decides. |
| `agentos templates list` | `agentos agents list` and `agentos skills list` |
| `agentos templates show <id>` | `agentos agents show <id>` (the catalog card when it is not installed) or the new `agentos skills show <id>` |
| `agentos templates copy <id>` | `agentos agents add <id>` or `agentos skills add <id>` |
| `agentos templates validate <file> --type agent\|skill` | `agentos agents add <file> --dry-run` or `agentos skills add <file> --dry-run` (prints the same `Validation:` findings) |
| `agentos templates import <url\|file> --type … --name …` | `agentos agents add <url\|file> --name …` or `agentos skills add <url\|file> --name …`: the same hash pin (`--expected-sha256`), safety review, quarantine, `--replace`, `--mode` and `--yes`. An imported agent is now written as a manifest card, not a legacy card. |
| `agentos compact --checkpoint` | `agentos compact --archive-only` |

Silent (no notice, not scheduled for removal):

| Form | Same as |
|---|---|
| `agentos compact --rewrite` | `agentos compact` |
| `agentos init --agents detected` | `agentos init --agents minimal` (same team; help shows `minimal`) |
| `agentos skills add <id> --mode summary\|full` | `agentos skills add <id>` (no effect on catalog skills; for an imported skill it still picks the excerpt) |

Also new in 2.1: `agentos context --strict` (= `--require-synced-config --require-enforcement --require-complete`).

Known differences:

- `agents add <file> --dry-run` and `skills add <file> --dry-run` print the structure check but exit 0 when it fails, because a file that is not a template is previewed as a safe import (wrapped as reference material). `templates validate` exits 1. Use the printed `Validation: FAIL` line in scripts until 3.0.
- `templates copy skill:<id>` wrote `mode: full` in the card's frontmatter; `skills add <id>` writes `mode: summary` (the only difference; add `--mode full` for the same bytes).
- `agents add <file>` for a file that is already a valid agent template installs it directly (as in 2.0), now also refused on a BLOCK finding of the import review.

The legacy migrations (`doctor --fix --adopt-custom-adapters|--prune-retired|--normalize-repo-ids`, `migrate claude`) are also removed in 3.0.0; see [migration.md](migration.md#command-inventory).
