#!/usr/bin/env bash
# A11 proof: pack this checkout, install the tarball into a disposable prefix (no global install), and drive the
# installed `agentos` bin: init (Brain + guide), machine-local Obsidian binding, packaged setup docs.
# Usage: bash docs/evidence/project-brain-package-proof.sh   (fixtures in a fresh "$TMPDIR/pb3-pkg.XXXXXX"; paths with spaces)
set -eu
REPO=$(cd "$(dirname "$0")/../.." && pwd)
T=$(mktemp -d "${TMPDIR:-/tmp}/pb3-pkg.XXXXXX")   # fresh each run; never deletes anything
mkdir -p "$T/pack" "$T/prefix"
export npm_config_cache="${npm_config_cache:-$T/npm-cache}"   # the host's ~/.npm is not writable here
step() { echo; echo "\$ $*"; }

cd "$REPO"; echo "commit: $(git rev-parse --short HEAD)"
TGZ=$(npm pack --pack-destination "$T/pack" 2>/dev/null | tail -1)
step tar -tzf "$TGZ" "| grep docs/"; tar -tzf "$T/pack/$TGZ" | grep docs/
npm install --prefix "$T/prefix" "$T/pack/$TGZ" >/dev/null 2>&1
PKG="$T/prefix/node_modules/agentos-for-projects"; BIN="$T/prefix/node_modules/.bin/agentos"
step ls '<prefix>/node_modules/agentos-for-projects/docs'; ls "$PKG/docs"
step agentos --version; "$BIN" --version

P="$T/proj with space"; V="$T/Vault With Space"
mkdir -p "$P" "$V/.obsidian"; echo '{"sentinel":1}' > "$V/.obsidian/app.json"; printf '# Unrelated\n' > "$V/Unrelated.md"
cd "$P"; git init -q .
step agentos init --new --yes; "$BIN" init --new --yes | sed "s#$T#\$T#g"
step agentos brain list; "$BIN" brain list
step grep '## Setup and project knowledge' .agentos/guide.md; grep -n '## Setup and project knowledge' .agentos/guide.md
step grep 'Startup loop' .hermes.md; grep -o 'Startup loop: [^(]*' .hermes.md
step agentos obsidian link --vault '$V' --dest Projects/Demo --create; "$BIN" obsidian link --vault "$V" --dest Projects/Demo --create | grep -E 'local.yaml|portable|Obsidian app' | sed "s#$T#\$T#g"
step grep -c '$V' .agentos/project.yaml; grep -c "$V" .agentos/project.yaml || true
step cat .agentos/local.yaml; sed "s#$T#\$T#g" .agentos/local.yaml
step git check-ignore -v .agentos/local.yaml; git check-ignore -v .agentos/local.yaml
step agentos obsidian status; "$BIN" obsidian status | head -3 | sed "s#$T#\$T#g"
step cat '$V/.obsidian/app.json' '$V/Unrelated.md'; cat "$V/.obsidian/app.json" "$V/Unrelated.md"
step "agentos context hermes --task demo | sed -n '/## Project overview/,/## Objective/p'"; "$BIN" context hermes --task demo | sed -n '/## Project overview/,/## Objective/p'
