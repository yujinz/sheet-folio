#!/bin/bash
# Export data from the running sheet-folio instance.
#
# Streams the SQLite DB directly from the running container (bypassing
# NAS filesystem quirks and WAL checkpoint issues), then runs the
# export-data Docker image to produce pieces.json, tags.json, images/.
#
# Usage:
#   ./scripts/export-data.sh
#
# Environment variables:
#   CONTAINER_NAME  – Docker container name (default: sheet-folio-sheet-folio-1)

set -euo pipefail

cd "$(dirname "$0")/.."
CONTAINER_NAME="${CONTAINER_NAME:-sheet-folio-sheet-folio-1}"

echo "=== Sheet-folio data export ==="
echo "Time: $(date)"
echo "Container: $CONTAINER_NAME"

# Stream DB directly from the running container.
# Copy all WAL files too so better-sqlite3 can read uncheckpointed transactions.
echo ""
echo "--- Streaming DB from container ---"
docker cp "$CONTAINER_NAME":/app/data/sheet-folio.db /tmp/sheet-folio.db
# WAL/SHM files may not exist if no uncheckpointed writes — ignore errors silently
docker cp "$CONTAINER_NAME":/app/data/sheet-folio.db-wal /tmp/sheet-folio.db-wal 2>/dev/null || true
docker cp "$CONTAINER_NAME":/app/data/sheet-folio.db-shm /tmp/sheet-folio.db-shm 2>/dev/null || true
echo "   Copied $(stat --printf='%s' /tmp/sheet-folio.db) bytes"

# Build export image if needed
echo ""
echo "--- Building export image ---"
docker build -f Dockerfile.export -t sheet-folio-export .

# Run export
echo ""
echo "--- Exporting data ---"
docker run --rm \
  -v /tmp:/app/data \
  -v $PWD/volumes/app/uploads:/app/data/uploads \
  -v $PWD/export-data:/app/export-data \
  sheet-folio-export

echo ""
echo "=== Export complete ==="
ls -lh export-data/