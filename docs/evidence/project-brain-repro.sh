#!/usr/bin/env bash
# Reproduce F1–F10 (docs/evidence/project-brain-baseline.md) against one AgentOS build.
# Usage: CLI=/path/to/dist/cli.js bash docs/evidence/project-brain-repro.sh [F1 F2 ...]
# Disposable fixtures only, under "$TMPDIR/pb repro" (path with a space). Never touches a real vault.
set -u
CLI=${CLI:?set CLI to dist/cli.js}
BASE="${TMPDIR:-/tmp}/pb repro"
rm -rf "$BASE"; mkdir -p "$BASE"
a() { node "$CLI" "$@"; }
run() { echo "\$ agentos $*"; local out code; out=$(a "$@" 2>&1); code=$?; printf '%s\n' "$out" | sed "s#$BASE#\$BASE#g" | grep -v '^$' | head -${LINES_MAX:-12}; echo "[exit $code]"; }
# context output is long: show its exit code plus the Missing section / INCOMPLETE line only.
ctx() { echo "\$ agentos context $*"; local out code; out=$(a context "$@" 2>&1); code=$?; printf '%s\n' "$out" | sed "s#$BASE#\$BASE#g" | grep -E '^(- |## Missing|AgentOS context|agentos context)' | grep -A20 -E '## Missing|INCOMPLETE|FAIL|failed' | head -8; echo "[exit $code]"; }
ws() { local d="$BASE/$1 ws"; mkdir -p "$d"; cd "$d"; a init --existing --yes --agents minimal >/dev/null; printf '# Handoff\n\n## Current objective\n\nShip the demo.\n' > .agentos/handoff.md; }
yaml_obsidian() { printf 'knowledge:\n  obsidian:\n%s\n' "$1" >> .agentos/project.yaml; }
want() { for f in ${SEL:-F1 F2 F3 F4 F5 F6 F7 F8 F9 F10}; do [ "$f" = "$1" ] && return 0; done; return 1; }
SEL="$*"

if want F1; then echo "## F1 no Obsidian config"; ws F1
  run brain init; run brain list
  ctx claude --task "demo" --require-complete
  LINES_MAX=3 run checkpoint --task demo --progress "p1" --next "n1" --dry-run
  run checkpoint --task demo --progress "p1" --next "n1"
  LINES_MAX=4 run resume --task demo; fi

if want F2; then echo "## F2 invalid canonical in valid YAML"; ws F2; a brain init >/dev/null
  yaml_obsidian $'    mode: workspace-folder\n    vault: knowledge\n    destination: .\n    canonical: bogus'
  run brain list; ctx claude --task demo
  LINES_MAX=3 run checkpoint --task demo --progress p --next n --dry-run; LINES_MAX=2 run checkpoint --task demo --progress p --next n; LINES_MAX=3 run resume --task demo
  echo "-- corrupted core YAML (control)"; printf 'name: [unclosed\n' > .agentos/project.yaml
  LINES_MAX=3 run brain list; ctx claude --task demo; fi

if want F3; then echo "## F3 canonical: workspace, optional folder missing"; ws F3; a brain init >/dev/null
  a obsidian init >/dev/null; rm -rf knowledge
  ctx claude --task demo --require-complete; LINES_MAX=3 run brain check; fi

if want F4; then echo "## F4 vault-canonical record, vault offline"; ws F4; V="$BASE/F4 vault"; mkdir -p "$V/Projects"
  a obsidian link --vault "$V" --dest Projects/Demo --canonical vault --create >/dev/null
  printf '# Design\n\nThe API is versioned.\n' > "$V/Projects/Demo/design.md"; a brain register "$V/Projects/Demo/design.md" >/dev/null
  mv "$V" "$V-offline"
  ctx claude --task design --require-complete; LINES_MAX=4 run brain check; fi

if want F5; then echo "## F5 init creates no Brain records"; ws F5
  run brain list; ls .agentos/brain 2>&1 | sed "s#$BASE#\$BASE#g"; fi

if want F6; then echo "## F6 memory.md purpose not in context"; ws F6
  printf '# Memory\n\nPurpose: PB-PURPOSE-SENTINEL demo tracker.\n' > .agentos/memory.md
  echo "\$ agentos context claude --task demo | grep -c PB-PURPOSE-SENTINEL"; a context claude --task demo | grep -c PB-PURPOSE-SENTINEL
  echo "\$ agentos context claude --task demo | grep -n memory.md"; a context claude --task demo | grep -n 'memory.md' | head -3; fi

if want F7; then echo "## F7 Obsidian index note written once"; ws F7
  a obsidian init >/dev/null; a brain init >/dev/null
  echo '$ grep -c "](" knowledge/index.md'; grep -c '](' knowledge/index.md
  echo '$ tail -3 knowledge/index.md'; tail -3 knowledge/index.md; LINES_MAX=6 run brain list; fi

if want F8; then echo "## F8 relative vault, nested cwd"; ws F8; a obsidian init >/dev/null; mkdir -p sub/deeper
  LINES_MAX=3 run obsidian status; cd sub/deeper; LINES_MAX=12 run obsidian status; fi

if want F9; then echo "## F9 unreadable directory read as empty"; ws F9; mkdir -p docs/adr
  printf '# ADR 1\n\nUse Bun.\n' > docs/adr/0001.md; a brain register docs/adr/0001.md >/dev/null
  run brain list; chmod 000 docs/adr; run brain list; LINES_MAX=3 run brain check
  ctx claude --task adr --require-complete; chmod 755 docs/adr; fi

if want F10; then echo "## F10 machine-specific vault path; missing-index recovery"; ws F10; V="$BASE/F10 vault"; mkdir -p "$V"
  a obsidian link --vault "$V" --dest Projects/Demo --create >/dev/null
  echo '$ grep vault: .agentos/project.yaml'; grep 'vault:' .agentos/project.yaml | sed "s#$BASE#\$BASE#g"
  ws F10b; a obsidian init >/dev/null; rm knowledge/index.md
  LINES_MAX=14 run obsidian status; LINES_MAX=3 run obsidian init
  a brain init >/dev/null; rm .agentos/brain/index.json; run brain list >/dev/null; echo '$ ls .agentos/brain/index.json'; ls .agentos/brain/index.json 2>&1 | sed "s#$BASE#\$BASE#g"; fi
