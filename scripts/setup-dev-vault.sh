#!/usr/bin/env bash
# Build the plugin and (re)assemble the `.dev-vault/` that the e2e harness copies
# per run (see e2e/obsidianHarness.ts). This is the ONE place that guarantees the
# vault contains the freshly built plugin plus a few note fixtures.
#
# Idempotent by design: note fixtures and `.obsidian/` config are written with a
# write_if_missing helper so a developer can hand-enrich them without this script
# clobbering the changes on the next run. The built plugin artifacts, however, are
# ALWAYS refreshed — a stale main.js is never what you want under test.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

PLUGIN_ID="foldable-embedded-notes" # matches manifest.json id; kept literal so this script has no jq dependency
DEV_VAULT_DIR="${REPO_ROOT}/.dev-vault"
OBSIDIAN_DIR="${DEV_VAULT_DIR}/.obsidian"
PLUGIN_DIR="${OBSIDIAN_DIR}/plugins/${PLUGIN_ID}"
TMP_DIR="${REPO_ROOT}/.tmp"

log() { echo "setup-dev-vault: $*" >&2; }

# write_if_missing <path> <<<"content": create a file only when absent, so locally
# enriched fixtures survive re-runs.
write_if_missing() {
	local target="$1"
	if [[ -e "${target}" ]]; then
		return 0
	fi
	mkdir -p "$(dirname "${target}")"
	cat >"${target}"
	log "seeded ${target#"${REPO_ROOT}/"}"
}

mkdir -p "${TMP_DIR}" "${DEV_VAULT_DIR}" "${PLUGIN_DIR}"

# --- Note fixtures: a small linked set INCLUDING an `![[ ]]` embed (the whole
#     point of this plugin) so e2e can exercise foldable embeds once implemented.
write_if_missing "${DEV_VAULT_DIR}/child.md" <<'EOF'
# Child note

This note is embedded by `parent.md`. Its body should appear inside the parent
when rendered in reading mode.

- A bullet in the child
- Another bullet in the child
EOF

write_if_missing "${DEV_VAULT_DIR}/parent.md" <<'EOF'
# Parent note

Some intro text before the embed.

![[child]]

A default-folded embed uses the `![[ ]]-` syntax:

![[child]]-

Some closing text after the embeds. See also [[sibling]].
EOF

write_if_missing "${DEV_VAULT_DIR}/sibling.md" <<'EOF'
# Sibling note

A plain linked note, referenced from [[parent]], with no embeds of its own.
EOF

# --- Minimal `.obsidian/` config so Obsidian boots clean and knows to load the
#     community plugin at runtime.
write_if_missing "${OBSIDIAN_DIR}/app.json" <<'EOF'
{}
EOF

write_if_missing "${OBSIDIAN_DIR}/appearance.json" <<'EOF'
{}
EOF

write_if_missing "${OBSIDIAN_DIR}/community-plugins.json" <<EOF
["${PLUGIN_ID}"]
EOF

# --- Build the plugin (verbose output parked in .tmp/ to spare the terminal) and
#     copy the release artifacts into the vault's plugin dir. Always refreshed.
log "building plugin (production)"
npm run build >"${TMP_DIR}/dev-vault-build.log" 2>&1

cp "${REPO_ROOT}/main.js" "${PLUGIN_DIR}/main.js"
cp "${REPO_ROOT}/manifest.json" "${PLUGIN_DIR}/manifest.json"
if [[ -f "${REPO_ROOT}/styles.css" ]]; then
	cp "${REPO_ROOT}/styles.css" "${PLUGIN_DIR}/styles.css"
fi

log "dev vault ready at ${DEV_VAULT_DIR#"${REPO_ROOT}/"} (plugin: ${PLUGIN_ID})"
