# Obsidian (optional)

Obsidian is a second *location* for the same Project Brain ([`docs/brain.md`](brain.md)), never a second store. Everything works without it: a "vault" here is just a folder of Markdown files. Configuration lives in `.agentos/project.yaml` under `knowledge.obsidian`; the code is `obsidianInitAgentOS` / `linkObsidianWorkspaceAgentOS` / `obsidianBinding` in `src/core.ts` and the location logic in `src/brain.ts` (`classify`, `loadBrain`, `vaultUnavailable`).

## No vault yet: `agentos obsidian init`

```bash
agentos obsidian init [--dir <path>] [--dry-run]
```

Creates a plain project knowledge folder (default `<root>/knowledge/`, or `--dir`) with one `index.md`: the project name and a link to every registered Brain record **by relative path** (`[Architecture](<../.agentos/brain/architecture.md>)`). The folder is useful as-is and can be opened in Obsidian as a vault. `.obsidian/` is **not** created; Obsidian creates it the first time you open the folder.

It registers the folder with `patchProjectYaml` (keys added only; comments, layout and `knowledge.docs` are kept):

```yaml
knowledge:
  obsidian:
    mode: workspace-folder
    vault: knowledge          # workspace-relative when inside the workspace, else absolute
    destination: .
    linked: []
    canonical: workspace
    index: index.md
```

It refuses (exit 1, zero writes) when `knowledge.obsidian` already exists or the index note exists. `--dry-run` writes nothing.

## Existing vault: `agentos obsidian link`

```bash
agentos obsidian link --vault <abs-path> --dest <sub/folder> [--canonical workspace|vault] [--create] [--dry-run]
```

Registers one dedicated project folder inside an existing vault. It creates only `<vault>/<dest>/` (with `--create`; without it a missing folder is an error) and `<vault>/<dest>/<Project> AgentOS Index.md`; nothing else in the vault is touched — no `.obsidian/` edits, no other notes (a test hashes the whole vault minus `<dest>` before and after). An existing index note is left unchanged. It also writes `.agentos/knowledge.md` and patches `knowledge.obsidian` (as above, with `vault: <abs-path>`, `destination: <dest>`, `canonical`, `index`).

`obsidian link` is `obsidian link-workspace` (boundary only, no index note, no `canonical`) plus the index note and the canonical location; both share one code path. `link-obsidian` (exact-note `link-only` mode) is unchanged and still works.

The config key is `destination` (the name existing configs use); a hand-written `dest` is read as an alias.

## Canonical location

`knowledge.obsidian.canonical: workspace | vault` (default `workspace`) says where the linked folder's records live. Every record is exactly one file; the other side holds links (the index note, `brain list`), never copies. There is no sync in either direction.

- `canonical: workspace` — records are workspace files. The vault folder holds links only: `brain register` of a note in it is refused ("canonical is workspace"), and `brain init --location vault` is refused.
- `canonical: vault` — Markdown notes in `<vault>/<dest>` can be Brain records. `brain register <note>`, `brain propose|apply|verify` and `brain init --location vault` work on them with the same contract as workspace records. Existing workspace records stay workspace records.

## Portable vs machine-specific identity

A vault record's identity is portable: `id` and `sources` are **vault-relative** (`sources: [Projects/Demo/AgentOS/design.md]`), and so are the derived `.agentos/brain/index.json` entry (`location: vault`) and proposal `target_path`. The machine-specific binding — the absolute vault path — lives only in `.agentos/project.yaml` (`knowledge.obsidian.vault`); `.agentos/knowledge.md` says where to find it instead of repeating it. Moving the vault means editing that one value. `brain list` and `brain show` print both the portable path and this machine's absolute file.

## Boundary

Agent reads, creates and updates of vault notes go through `agentos brain register|propose|apply`. A path must resolve inside `<vault>/<dest>`: anything else in the vault (another project folder, `Inbox/`, `.obsidian/`, any dot folder) is refused with exit 1 and zero writes; symlinked path components are refused as for workspace files. Proposals are still written under the workspace `.agentos/brain/proposals/`.

## External edits and an unavailable vault

- A note edited in Obsidian is detected like any record: `brain check` reports `changed` (hash drift), `doctor` warns, `brain verify` accepts it after review.
- When `<vault>/<dest>` is absent (vault unmounted, renamed, removed), every record last known there (from `index.json`) is `unavailable` in `brain check` and `brain list`. With `canonical: vault`, `agentos context` lists `vault unavailable: <path>` and each record under **Missing**; the bundle stays `ok: true` but never reads as complete, and `agentos context --require-complete` exits 1 (`INCOMPLETE`). With `canonical: workspace` no record lives there: the absent folder is a `context --json` warning only and `--require-complete` passes. `doctor` warns `Obsidian vault unavailable`. `brain check` exits 0 (only `invalid` exits 1). Brain writes keep the last known vault entries in `index.json` until the folder is back.
- A linked folder that exists but lacks its index note is reported by `doctor` and `obsidian status` ("not treated as linked"). Re-running `obsidian link` with the same `--vault`/`--dest` creates only the missing note; for an `obsidian init` folder, restore the note or remove `knowledge.obsidian` and re-run `obsidian init`.

## Disable the integration

Set `enabled: false` under `knowledge.obsidian` in `.agentos/project.yaml`. Nothing is deleted: the folder, the index note, the records and the rest of the block stay. `obsidian status` prints `DISABLED`, `context` drops the Obsidian rule line, and the linked folder is not read. Brain, context, checkpoint and resume keep working. Records that live only in the vault (`canonical: vault`) are then unavailable and listed under **Missing** (see [`docs/brain.md`](brain.md#independent-of-obsidian)); to keep them available, keep the integration enabled. Remove the key or set `enabled: true` to re-enable. An invalid `knowledge.obsidian` block (e.g. `canonical: bogus`) is treated the same way: ignored, with a `doctor` problem and a `context --json` warning.

## Not done

- No sync, no copying between the workspace and the vault, no conflict resolution between two copies (there are none by design).
- No vault-wide ingestion or search: only `<vault>/<dest>` is walked, only when `canonical: vault`, and only for files declaring `id: brain:…`.
- The index note is written once; it is not refreshed when records change (`brain list` is the live view).
- Relative links from a vault index note to workspace records leave the vault; Obsidian may not open them, a Markdown viewer or editor does.
- `agents remove` does not look for Brain references in the vault folder.
