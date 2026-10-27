# Obsidian (optional)

Obsidian is a second *location* for the same Project Brain ([`docs/brain.md`](brain.md)), never a second store. Everything works without it: a "vault" here is just a folder of Markdown files. Configuration lives in `.agentos/project.yaml` under `knowledge.obsidian`, except the host path of an external vault, which is machine-local ([below](#machine-local-vault-path-agentoslocalyaml)); the code is `obsidianInitAgentOS` / `linkObsidianWorkspaceAgentOS` / `obsidianBinding` in `src/core.ts` and the location logic in `src/brain.ts` (`classify`, `loadBrain`, `vaultUnavailable`, index note: `planNote`/`syncNote`).

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
    vault: knowledge          # workspace-relative when inside the workspace; an outside --dir goes to .agentos/local.yaml
    destination: .
    linked: []
    canonical: workspace
    index: index.md
```

It refuses (exit 1, zero writes) when `knowledge.obsidian` already exists or the index note exists; to recreate a deleted index note use `agentos brain index` (below). `--dry-run` writes nothing.

A relative `vault` is resolved against the workspace root, never the current directory: `obsidian status`, `brain` and `context` give the same answer from any subdirectory of the workspace.

This is the preferred Obsidian path: open the knowledge folder itself as a project vault ("Open folder as vault"). Obsidian then adds `.obsidian/` and you may add notes there; Brain writes and `agentos brain index` rewrite only the generated block of `index.md`, and leave `.obsidian/` and every other note byte- and mtime-identical (test-checked).

**What Obsidian can show.** Obsidian opens only files inside the vault folder. The default Brain records (set up by `agentos init`: `.agentos/brain/*.md`, `.agentos/decisions.md`) live outside `knowledge/`, so their links in `index.md` (`../.agentos/…`) leave the vault and Obsidian cannot open or edit them. The generated block says so: each such line ends with `— outside this vault: edit in your editor`, and one sentence above the list explains it. Edit those records in your editor or through `agentos brain propose|apply`. To have a record viewable and editable in Obsidian, create it inside the vault folder and register it in place: `agentos brain register knowledge/<note>.md` (that line is not marked). AgentOS never relocates, copies or symlinks a record to make it visible: each record has exactly one editable file.

## Existing vault: `agentos obsidian link`

```bash
agentos obsidian link --vault <abs-path> --dest <sub/folder> [--canonical workspace|vault] [--create] [--dry-run]
```

Registers one dedicated project folder inside an existing vault. It creates only `<vault>/<dest>/` (with `--create`; without it a missing folder is an error) and `<vault>/<dest>/<Project> AgentOS Index.md`; nothing else in the vault is touched — no `.obsidian/` edits, no other notes, no symlinks, no copies of records (tests snapshot the whole vault, bytes and mtimes, before and after, with an unrelated note and a `.obsidian/` settings file in it). An existing index note is left unchanged; re-running the same command changes nothing in the vault, `project.yaml`, `local.yaml` or `knowledge.md`. It also writes `.agentos/knowledge.md`, patches `knowledge.obsidian` in `project.yaml` with the portable keys (`destination: <dest>`, `canonical`, `index`) and writes the host path to `.agentos/local.yaml`.

With `canonical: workspace` this note is **navigation only**, and says so: it starts with frontmatter `tags: [agentos-navigation]` (a valid Obsidian property) and a `**Navigation only.**` paragraph — the records live in the workspace, outside the vault; the vault does not contain or sync them, and Obsidian may not open links that leave the vault. Obsidian edits only records stored inside the vault it opens; every record line here is marked `— outside this vault: edit in your editor` (see *What Obsidian can show* above).

Setup prints optional app guidance only: `Obsidian app: found (<path>)` or `Obsidian app: not found on PATH (optional; nothing above needs it) …`. The check is a `PATH` lookup (`obsidian`, `Obsidian.exe`); an AppImage, Flatpak or Windows-side install reads as not found. AgentOS never installs or launches the app.

**WSL → Windows path mapping.** Under WSL (`WSL_DISTRO_NAME` is set, or `/proc/sys/kernel/osrelease` contains `microsoft`), `obsidian init` and `obsidian link` add `Windows path (WSL): …` and `obsidian status` adds `Vault Windows path (WSL): …`, the folder a Windows Obsidian opens. The mapping is explicit string mapping, no `wslpath` call: `/mnt/<d>/rest` → `<D>:\rest`; any other absolute path → `\\wsl$\<distro>\rest` (`<distro>` from `WSL_DISTRO_NAME`; without it a Linux-side path is not mapped and no line is printed). Code: `wslWindowsPath` in `src/core.ts`.

`obsidian link --no-index` (formerly `obsidian link-workspace`, deprecated in 2.1.0) is the boundary only: no index note, no `canonical`; plain `obsidian link` adds the index note and the canonical location on the same code path. `obsidian link --note <path> [--vault --dest --create]` (formerly `link-obsidian --link`, deprecated in 2.1.0) is the older exact-note `link-only` mode, unchanged, with the same prompts on a terminal. Both old forms still work until 3.0.0 and print one notice.

The config key is `destination` (the name existing configs use); a hand-written `dest` is read as an alias.

## Index note

The index note (`index.md`, or `<Project> AgentOS Index.md` for `obsidian link`) is human prose plus **one generated block**:

```markdown
<!-- agentos:brain-index:start (generated by agentos brain; edits inside this block are replaced) -->
## Brain records

- [Architecture](<../.agentos/brain/architecture.md>) — `brain:architecture` (architecture, proposed)
<!-- agentos:brain-index:end -->
```

- Every successful Brain write (`brain init|register|verify|apply`) and `agentos brain index` rewrite only the bytes between the two markers; everything before and after is kept byte-for-byte. The list is in walk order (deterministic): unchanged records give a byte-identical note and the file is not rewritten. There is no daemon or watcher.
- A deleted note is recreated by the next Brain write or by `agentos brain index` (`--dry-run` previews). Nothing else is touched.
- An **older note without markers** (written by AgentOS 1.1 and earlier, possibly hand-edited) is never rewritten silently. Brain writes leave it alone and print `Warning: index note … has no agentos:brain-index markers …`. `agentos brain index` prints a preview diff; `agentos brain index --adopt` applies it: the old "Written once …" sentence is replaced, and the `## Brain records` section is replaced by the block only when every line in it is one AgentOS generated — otherwise the hand-written section stays and the block is appended after the note. Adopting twice is a no-op.
- **Damaged markers** (two start markers, an end before the start, …) are never written: `brain index` exits 1 and asks to fix them by hand; Brain writes warn.
- A note that cannot be written (read-only folder, unreadable vault) never undoes the Brain write: `Warning: index note … is stale` (`--json`: `note_stale: true`).
- With the integration disabled or invalid the note is not touched.

## Canonical location

`knowledge.obsidian.canonical: workspace | vault` (default `workspace`) says where the linked folder's records live. Every record is exactly one file; the other side holds links (the index note, `brain list`), never copies. There is no sync in either direction.

- `canonical: workspace` — records are workspace files. The vault folder holds links only: `brain register` of a note in it is refused ("canonical is workspace"), and `brain init --location vault` is refused.
- `canonical: vault` — Markdown notes in `<vault>/<dest>` can be Brain records. `brain register <note>`, `brain propose|apply|verify` and `brain init --location vault` work on them with the same contract as workspace records. Existing workspace records stay workspace records.

## Portable vs machine-specific identity

A vault record's identity is portable: `id` and `sources` are **vault-relative** (`sources: [Projects/Demo/AgentOS/design.md]`), and so are the derived `.agentos/brain/index.json` entry (`location: vault`) and proposal `target_path`. The machine-specific binding — the absolute vault path — is one value in `.agentos/local.yaml` (below); `.agentos/knowledge.md` says where to find it instead of repeating it. Moving the vault means editing that one value.

### Machine-local vault path: `.agentos/local.yaml`

```yaml
# Machine-local AgentOS settings for this checkout. Git-ignored (.agentos/.gitignore); never commit.
obsidian:
  vault: /home/me/Vaults/Personal
```

- **Precedence:** `.agentos/local.yaml` `obsidian.vault` (this machine) wins over `.agentos/project.yaml` `knowledge.obsidian.vault` (shared). Everything else (`mode`, `destination`, `canonical`, `index`, `enabled`) is shared and read from `project.yaml` only. A relative value is resolved against the workspace root. `obsidian status` prints where the path came from: `Vault: <path> (from .agentos/local.yaml)`.
- **New setups** (`obsidian link`, with or without `--no-index`, `obsidian init --dir <outside the workspace>`) write the host path there, never to `project.yaml`. `obsidian init` inside the workspace keeps its relative `vault: knowledge` in `project.yaml`: it is portable.
- **Git:** `agentos init` and every write of `local.yaml` ensure `.agentos/.gitignore` lists `local.yaml`.
- **Legacy setups** with an absolute `vault` in `project.yaml` keep working unchanged. To move one machine to the new layout, re-run the same `agentos obsidian link --vault … --dest …`: it rewrites `knowledge.obsidian` without the host path and writes `local.yaml`.
- **Another machine** (a clone without `local.yaml`): `obsidian status` exits 1 with `Obsidian vault not bound on this machine: set obsidian.vault in .agentos/local.yaml (or re-run agentos obsidian link)`; core commands treat the integration as off (a `context --json` warning), so Brain, context, checkpoint and resume keep working and vault-only records are listed as Missing, as for a disabled integration.
- An invalid `local.yaml` (not YAML, `vault` not a string) makes the integration invalid-and-ignored for core commands, like an invalid `knowledge.obsidian` block. `brain list` and `brain show` print both the portable path and this machine's absolute file.

## Boundary

Agent reads, creates and updates of vault notes go through `agentos brain register|propose|apply`. A path must resolve inside `<vault>/<dest>`: anything else in the vault (another project folder, `Inbox/`, `.obsidian/`, any dot folder) is refused with exit 1 and zero writes; symlinked path components are refused as for workspace files. Proposals are still written under the workspace `.agentos/brain/proposals/`.

## External edits and an unavailable vault

- A note edited in Obsidian is detected like any record: `brain check` reports `changed` (hash drift), `doctor` warns, `brain verify` accepts it after review.
- `obsidian status` (and `brain check`, `context`, `doctor`) tell three folder states apart: **absent** (`Workspace folder missing: …`, `vault unavailable: …` — removed, renamed or not mounted), **unreadable** (`Workspace folder unreadable: … (EACCES: permission denied)`, `vault unreadable: …` — a permission or I/O error, `brain check` exits 1 when records are known there) and **empty** while `index.json` still lists records there (`vault folder empty: … (N record(s) last known there; not mounted, or moved?)`, e.g. an empty mount point). In each case the records keep their last-known identity and, with `canonical: vault`, are **Missing**. An empty folder with no known records is just empty.
- When `<vault>/<dest>` is absent (vault unmounted, renamed, removed), every record last known there (from `index.json`) is `unavailable` in `brain check` and `brain list`. With `canonical: vault`, `agentos context` lists `vault unavailable: <path>` and each record under **Missing**; the bundle stays `ok: true` but never reads as complete, and `agentos context --require-complete` exits 1 (`INCOMPLETE`). With `canonical: workspace` no record lives there: the absent folder is a `context --json` warning only and `--require-complete` passes. `doctor` warns `Obsidian vault unavailable`. `brain check` exits 0 (only `invalid` exits 1). Brain writes keep the last known vault entries in `index.json` until the folder is back.
- A linked folder that exists but lacks its index note is reported by `doctor` and `obsidian status` ("not treated as linked"; both stay read-only). `agentos brain index` recreates only the missing note (and `index.json` if it is gone) from the records; re-running `obsidian link` with the same `--vault`/`--dest` also still works.

## Disable the integration

Migrating a legacy `link-obsidian` setup, or relocating vault-canonical records before disabling: [`docs/migration-project-brain.md`](migration-project-brain.md).

Set `enabled: false` under `knowledge.obsidian` in `.agentos/project.yaml`. Nothing is deleted: the folder, the index note, the records and the rest of the block stay. `obsidian status` prints `DISABLED`, `context` drops the Obsidian rule line, and the linked folder is not read. Brain, context, checkpoint and resume keep working. Records that live only in the vault (`canonical: vault`) are then unavailable and listed under **Missing** (see [`docs/brain.md`](brain.md#independent-of-obsidian)); to keep them available, keep the integration enabled. Remove the key or set `enabled: true` to re-enable. An invalid `knowledge.obsidian` block (e.g. `canonical: bogus`) is treated the same way: ignored, with a `doctor` problem and a `context --json` warning.

## Not done

- No sync, no copying between the workspace and the vault, no conflict resolution between two copies (there are none by design).
- No vault-wide ingestion or search: only `<vault>/<dest>` is walked, only when `canonical: vault`, and only for files declaring `id: brain:…`.
- The index note lists readable records only; records that are unavailable or unreadable right now appear in `brain list`/`brain check`, not in the note.
- Relative links from a vault index note to workspace records leave the vault; Obsidian may not open them, a Markdown viewer or editor does. The note says so (navigation only).
- `link-obsidian` (legacy exact-note `link-only` mode) still writes its vault path to `project.yaml`; it binds no Brain location. Use `obsidian link` for new setups.
- No UI trial: the setup paths are proven on filesystem fixtures; a real Obsidian app round trip is the Slice 4 trial (A17).
- `agents remove` does not look for Brain references in the vault folder.
