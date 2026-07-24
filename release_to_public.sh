#!/usr/bin/env bash
#
# Release entry point: bump the version, commit, and push the commit + tag.
#
# Pushing the tag is all that is needed — .github/workflows/release.yml builds the
# plugin and publishes the GitHub release with main.js/manifest.json/styles.css
# attached, which is exactly what Obsidian's community-plugin installer downloads.
#
# Usage: ./release_to_public.sh [patch|minor|major]   (default: patch)
#        SKIP_E2E=1 ./release_to_public.sh            (skip the e2e gate)

set -euo pipefail

readonly RELEASE_BRANCH="master"
readonly DEFAULT_BUMP="patch"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

bump="${1:-${DEFAULT_BUMP}}"
case "${bump}" in
patch | minor | major) ;;
*)
	echo "ERROR: bump=[${bump}] must be one of: patch, minor, major" >&2
	exit 1
	;;
esac

log() { echo "[release] $*"; }

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "${branch}" != "${RELEASE_BRANCH}" ]; then
	echo "ERROR: releases must be cut from branch=[${RELEASE_BRANCH}], current=[${branch}]" >&2
	exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
	echo "ERROR: working tree is not clean — commit or stash first" >&2
	exit 1
fi

log "syncing with origin/${RELEASE_BRANCH}"
git pull --ff-only origin "${RELEASE_BRANCH}"

log "installing dependencies"
npm ci

log "gate: lint"
npm run lint

log "gate: build"
npm run build

if [ "${SKIP_E2E:-0}" = "1" ]; then
	log "gate: e2e SKIPPED (SKIP_E2E=1)"
else
	log "gate: e2e"
	npm run test:e2e
fi

# `npm version` bumps package.json, runs the `version` lifecycle script (which syncs
# manifest.json + versions.json), commits, and tags. .npmrc sets an empty
# tag-version-prefix so the tag is `1.2.3`, the form Obsidian requires.
log "bumping version (${bump})"
npm version "${bump}" -m "Release %s"

version="$(node -p "require('./manifest.json').version")"

log "pushing commit and tag=[${version}]"
git push origin "${RELEASE_BRANCH}"
git push origin "${version}"

repo_url="$(git remote get-url origin | sed -e 's#^git@github.com:#https://github.com/#' -e 's#\.git$##')"
log "done — GitHub Actions is publishing the release: ${repo_url}/releases/tag/${version}"
