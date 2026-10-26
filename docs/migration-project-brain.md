# Migrating to the Project Brain (1.1 → Unreleased)

The Project Brain ([brain.md](brain.md)) works without Obsidian; Obsidian is an optional second *location* ([obsidian.md](obsidian.md)). Nothing below runs automatically: `doctor --fix` never moves records or rewrites `knowledge.obsidian`. Each path was run on a scratch workspace with the branch build (2026-10-26).

## Legacy link-only setups (`link-obsidian`)

`agentos link-obsidian --vault <path> --link <note>` (`mode: link-only`, absolute `vault` in `project.yaml`) still works unchanged and binds no Brain location.

To move to the current layout, run `agentos obsidian link --vault <abs-vault> --dest <sub/folder> --create` (add `--dry-run` first). It rewrites `knowledge.obsidian` to `mode: workspace-folder` without the host path, writes the path to `.agentos/local.yaml` (git-ignored) and creates the index note in `<vault>/<dest>/`. Check before you run it: the legacy `linked:` list is replaced by `linked: []`. The linked notes themselves are not touched, so copy the list into the index note or `.agentos/knowledge.md` first if you still want it.

## Machine bindings

`.agentos/local.yaml` `obsidian.vault` (this machine) wins over `.agentos/project.yaml` `knowledge.obsidian.vault` (shared). An absolute `vault` already in `project.yaml` keeps working. To move it to `local.yaml`, re-run the same `obsidian link --vault … --dest …`. On a clone without `local.yaml`, `obsidian status` exits 1 and says how to bind the vault, and the core commands treat the integration as off. `obsidian status` prints where the path came from.

## Vault-canonical records (`canonical: vault`)

A record stored in the vault is available only while the vault is mounted and the integration is enabled. When the vault is offline, unbound on this machine, or `enabled: false`, the record is listed under **Missing** and `context --require-complete` exits 1. To keep a record when you disable the integration or drop the vault, **relocate it first**.

Do not copy it into the workspace and `brain register` the copy: that leaves two editable files, which AgentOS does not support (there is no sync). Relocation is a manual step that the owner reviews:

1. With the vault mounted, run `agentos brain check`. The record must be `ok`.
2. **Move** (not copy) the note into the workspace, e.g. `mv "<vault>/<dest>/design.md" .agentos/brain/design.md`. `brain check` now reports it `invalid: sources does not list this file … was it moved or copied?`.
3. Edit only the frontmatter `sources:` entry to the new workspace-relative path (`- .agentos/brain/design.md`). Keep `id` and the body unchanged. `brain check` reports `ok`, with the same `source_hash`.
4. Run `agentos brain verify brain:<id> --by <owner>`. This refreshes `.agentos/brain/index.json` (the entry loses `location: vault`) and the index note, and sets the status to `verified`.
5. Check the result: `brain list` shows the workspace path; the vault folder no longer contains the file; `git diff` shows only the new file and the derived index.

## Disabling the integration without losing knowledge

Relocate the vault-canonical records first (above). Then set `enabled: false` under `knowledge.obsidian`. Nothing is deleted. `obsidian status` prints `DISABLED`, and Brain, context, checkpoint and resume keep working on the workspace records. Set `enabled: true` again (or remove the key) to re-enable.

## Records outside the vault folder

Obsidian opens only files inside the vault. Workspace records (`.agentos/brain/*.md`, `.agentos/decisions.md`) are listed in the index note with `— outside this vault: edit in your editor`. Edit them in an editor or through `brain propose|apply`. To edit a record in Obsidian, create it inside `<vault>/<dest>` and `brain register` it there; that needs `canonical: vault` for a linked vault. AgentOS never copies or symlinks a record to make it visible.

## WSL

Under WSL, `obsidian init|link|status` also print the Windows path that a Windows Obsidian opens: `/mnt/c/…` → `C:\…`, and other paths → `\\wsl$\<distro>\…`. Store the Linux path (`/mnt/c/…`) in `local.yaml`, because AgentOS runs on the Linux side.
