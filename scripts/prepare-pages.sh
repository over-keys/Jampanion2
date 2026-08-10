#!/usr/bin/env bash
set -euo pipefail
SITE="${1:?usage: prepare-pages.sh DIST_DIR REPOSITORY_NAME}"
REPOSITORY_NAME="${2:?usage: prepare-pages.sh DIST_DIR REPOSITORY_NAME}"
INDEX="$SITE/index.html"
test -f "$INDEX"
if sed --version >/dev/null 2>&1; then
  # GNU sed (GitHub Actions / Linux).
  sed -i "s#<base href=\"/\" />#<base href=\"/${REPOSITORY_NAME}/\" />#" "$INDEX"
else
  # BSD sed (macOS).
  sed -i '' "s#<base href=\"/\" />#<base href=\"/${REPOSITORY_NAME}/\" />#" "$INDEX"
fi
cp "$INDEX" "$SITE/404.html"
touch "$SITE/.nojekyll"
