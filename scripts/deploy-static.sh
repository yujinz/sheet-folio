#!/bin/bash
# Deploy the static export to Codeberg Pages (or any Git-based static host).
#
# This script exports the static site from the database, then pushes
# the result to a Git branch that serves as Pages source.
#
# Authentication (choose one):
#   A. SSH key - add the public key to your Codeberg account (Settings ->
#      SSH/GPG Keys). Set DEPLOY_KEY to the path of the private key, or
#      leave unset to use the default SSH agent.
#   B. Personal access token - create a token on Codeberg (Settings ->
#      Applications -> Generate Token) with repo write access. Set
#      DEPLOY_TOKEN and the script will use HTTPS + token auth.
#
# Usage:
#   ./scripts/deploy-static.sh
#
# Environment variables:
#   TARGET_REPO   - Git remote URL (e.g. git@codeberg.org:user/repo.git)
#                   Defaults to the origin of the current repo.
#   TARGET_BRANCH - Branch to push to (default: pages)
#   DEPLOY_KEY    - Path to SSH private key (optional; SSH method)
#   DEPLOY_TOKEN  - Personal access token (optional; HTTPS method)
#   TARGET_DIR    - Scratch directory (default: /tmp/sheet-folio-deploy)
#   DB_PATH       - passed through to export-static.ts
#   UPLOAD_DIR    - passed through to export-static.ts
#
# Cron example (daily at 3am):
#   0 3 * * * cd /path/to/sheet-folio && DEPLOY_KEY=/path/to/key ./scripts/deploy-static.sh >> /tmp/deploy.log 2>&1
#   # or with a token:
#   0 3 * * * cd /path/to/sheet-folio && DEPLOY_TOKEN=abc123 ./scripts/deploy-static.sh >> /tmp/deploy.log 2>&1

set -euo pipefail

TARGET_REPO="${TARGET_REPO:-}"
TARGET_BRANCH="${TARGET_BRANCH:-pages}"
DEPLOY_KEY="${DEPLOY_KEY:-}"
DEPLOY_TOKEN="${DEPLOY_TOKEN:-}"
TARGET_DIR="${TARGET_DIR:-/tmp/sheet-folio-deploy}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Sheet Folio static deploy ==="
echo "Time: $(date)"
echo "Project: $PROJECT_DIR"

# If TARGET_REPO is not set, auto-detect from the project's git origin
if [ -z "$TARGET_REPO" ]; then
  TARGET_REPO="$(cd "$PROJECT_DIR" && git remote get-url origin 2>/dev/null || true)"
  if [ -z "$TARGET_REPO" ]; then
    echo "ERROR: TARGET_REPO is not set and could not detect git origin."
    exit 1
  fi
  echo "Auto-detected remote: $TARGET_REPO"
fi

# Configure authentication method
if [ -n "$DEPLOY_KEY" ]; then
  echo "Using SSH key: $DEPLOY_KEY"
  export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new -i $DEPLOY_KEY"
elif [ -n "$DEPLOY_TOKEN" ]; then
  echo "Using personal access token"
  # Rewrite remote URL to HTTPS + token auth
  if echo "$TARGET_REPO" | grep -q '^git@'; then
    # git@codeberg.org:user/repo.git -> https://codeberg.org/user/repo.git
    REPO_PATH="$(echo "$TARGET_REPO" | sed 's|^git@[^:]*:||')"
    REMOTE_URL="https://:$DEPLOY_TOKEN@codeberg.org/$REPO_PATH"
  elif echo "$TARGET_REPO" | grep -q '^https://'; then
    REMOTE_URL="$(echo "$TARGET_REPO" | sed "s|://|://:$DEPLOY_TOKEN@|")"
  else
    echo "ERROR: Cannot inject token into remote URL: $TARGET_REPO"
    exit 1
  fi
else
  echo "Using default SSH agent"
  export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"
fi

# Step 1: Run the static export
echo ""
echo "--- Step 1: Exporting static site ---"
cd "$PROJECT_DIR"
npx tsx scripts/export-static.ts

echo ""
echo "--- Step 2: Preparing deploy directory ---"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# Create a fresh git repo
git init
git checkout -b "$TARGET_BRANCH" 2>/dev/null || git checkout "$TARGET_BRANCH" 2>/dev/null || true

if [ -n "${REMOTE_URL:-}" ]; then
  git remote add origin "$REMOTE_URL"
else
  git remote add origin "$TARGET_REPO"
fi
git fetch origin "$TARGET_BRANCH" 2>/dev/null || echo "  (branch '$TARGET_BRANCH' does not exist yet, will create)"

# Checkout or create the branch
if git rev-parse origin/"$TARGET_BRANCH" >/dev/null 2>&1; then
  git reset --hard origin/"$TARGET_BRANCH"
  echo "Checked out existing branch '$TARGET_BRANCH'"
else
  echo "Creating new branch '$TARGET_BRANCH'"
fi

echo ""
echo "--- Step 3: Copying static-export contents ---"
git rm -rf . 2>/dev/null || true
cp -r "$PROJECT_DIR/static-export/"* .
touch .nojekyll

echo ""
echo "--- Step 4: Committing and pushing ---"
git add .

if git diff --cached --quiet; then
  echo "No changes to deploy (static export is identical to current deployment)."
  echo "Done."
  rm -rf "$TARGET_DIR"
  exit 0
fi

git commit -m "Deploy static site $(date '+%Y-%m-%d %H:%M:%S')"
git push origin "$TARGET_BRANCH"

echo ""
echo "=== Deploy complete! ==="
echo "Pushed to $TARGET_REPO branch $TARGET_BRANCH"

rm -rf "$TARGET_DIR"