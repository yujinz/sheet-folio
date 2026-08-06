#!/usr/bin/env bash
# ============================================================================
# backup.sh — Volume + export backup with SHA-based retention (keep last 5)
# ============================================================================
# Usage:
#   ./backup.sh                                                     # local backup only
#   ./backup.sh --with-export                                       # run export-data.sh first, then backup
#   ./backup.sh --r2-bucket my-bucket                               # + upload export to R2
#   ./backup.sh --r2-bucket my-bucket --r2-endpoint URL             # custom endpoint
#   ./backup.sh --export-dir /path/to/export-data                   # custom export dir
#   ./backup.sh --keep 10 --r2-keep 20                              # custom retention
#
# Environment variables for R2 (read by aws CLI):
#   AWS_ACCESS_KEY_ID       — R2 access key
#   AWS_SECRET_ACCESS_KEY   — R2 secret key
#   AWS_ENDPOINT_URL_S3     — (optional) R2 endpoint (if not in --r2-endpoint)
# ============================================================================
# Quick log check: tail -6 $HOME/logs/sheet-folio-backup.log

# cron runs with a minimal PATH; extend it so `aws` CLI is found
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"

set -euo pipefail

LOG_FILE="$HOME/logs/sheet-folio-backup.log"

log() { echo "[$(date)] $1" >> "$LOG_FILE"; }

BACKUP_LOG=$(mktemp /tmp/_backup_log.XXXXXX)
exec > >(tee "$BACKUP_LOG") 2>&1

trap '
  s=$?
  if [ $s -ne 0 ]; then
    echo "[$(date)] backup.sh failed (exit: $s), last 20 lines:" >> "$LOG_FILE"
    tail -20 "$BACKUP_LOG" >> "$LOG_FILE"
    echo "[$(date)] FAILED (exit: $s)" >> "$LOG_FILE"
  else
    echo "[$(date)] COMPLETE" >> "$LOG_FILE"
  fi
  rm -f "$BACKUP_LOG"
' EXIT

log "--- Running backup.sh ---"

cd "$(dirname "$0")"

# ------------------------------------------------------------------
# Auto-load .env file if present (keeps credentials out of the repo)
# ------------------------------------------------------------------
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
BACKUP_ROOT="${HOME}/backups/sheet-folio"
VOLUMES_DIR="${BACKUP_ROOT}/volumes"
EXPORTS_DIR="${BACKUP_ROOT}/exports"
KEEP=5
R2_KEEP=

VOLUME_SRC="volumes/app"
EXPORT_DEFAULT="export-data"

# ------------------------------------------------------------------
# Args (CLI overrides .env values)
# ------------------------------------------------------------------
EXPORT_DIR="$EXPORT_DEFAULT"
R2_BUCKET="${R2_BUCKET:-}"
R2_ENDPOINT="${R2_ENDPOINT:-}"
WITH_EXPORT=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --export-dir)    EXPORT_DIR="$2";  shift 2 ;;
    --r2-bucket)     R2_BUCKET="$2";   shift 2 ;;
    --r2-endpoint)   R2_ENDPOINT="$2"; shift 2 ;;
    --keep)          KEEP="$2";        shift 2 ;;
    --r2-keep)       R2_KEEP="$2";     shift 2 ;;
    --with-export)   WITH_EXPORT=1;     shift 1 ;;
    --help|-h)       sed -n '/^# /,/^$/p' "$0" | sed 's/^# //'; exit 0 ;;
    *)               echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Default R2_KEEP to same as KEEP if not explicitly set
: "${R2_KEEP:=$KEEP}"

# Resolve relative export dir to absolute
EXPORT_DIR="$(realpath -m "$EXPORT_DIR")"

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
info()  { echo "==> $*" >&2; }
err()   { echo "ERROR: $*" >&2; }
ts()    { date +%Y%m%d_%H%M%S; }

# sha256() -> prints first 12 hex chars of stdin's sha256
sha_prefix() {
  sha256sum | cut -c1-12
}

# make_archive <src_dir> <out_dir> <name_prefix>
#   Creates <out_dir>/<name_prefix>-<ts>-<sha12>.tar.gz
#   Prints the archive path to stdout.
#   If a file with the same SHA already exists, just touches it and skips.
make_archive() {
  local src="$1"
  local out="$2"
  local prefix="$3"

  mkdir -p "$out"

  # Compute SHA over file content only (exclude tar metadata like mtime)
  # by making a reproducible tarball with --sort and --mtime.
  local content_sha
  content_sha="$(
    tar -czf /dev/stdout \
      --sort=name \
      --mtime='1970-01-01 00:00:00' \
      -C "$(dirname "$src")" "$(basename "$src")" \
      | sha_prefix
  )"

  # Dedup: if a file with the same content SHA already exists, just touch it
  for existing in "${out}/${prefix}-"*"-${content_sha}.tar.gz"; do
    if [[ -f "$existing" ]]; then
      info "Content SHA $content_sha already exists as $(basename "$existing"), touching & skipping ..."
      log "  SHA $content_sha already exists (skipping)"
      touch "$existing"
      echo "$existing"
      return
    fi
  done

  # No match — build the real tarball (with real mtimes preserved)
  local tmpfile
  tmpfile="$(mktemp "/tmp/${prefix}-XXXXXX.tar.gz")"
  info "Packing $src -> $(basename "$tmpfile") ..."
  tar -czf "$tmpfile" -C "$(dirname "$src")" "$(basename "$src")"

  local ts_val
  ts_val="$(ts)"
  local final_name="${prefix}-${ts_val}-${content_sha}.tar.gz"
  local dst="${out}/${final_name}"

  mv "$tmpfile" "$dst"
  log "  Created $(basename "$dst")"
  echo "$dst"
}

# adopt_export_zip <zip_src> <out_dir> <name_prefix>
#   Copies a pre-made export ZIP (produced by scripts/export-data.sh inside
#   Docker) into <out_dir>/<name_prefix>-<ts>-<sha12>.zip — no host-side
#   archiving needed (avoids installing zip).
#   Prints the destination archive path to stdout.
#   If a file with the same SHA already exists, just touches it and skips.
adopt_export_zip() {
  local zip_src="$1"
  local out="$2"
  local prefix="$3"

  mkdir -p "$out"

  if [[ ! -f "$zip_src" ]]; then
    err "Pre-made export zip not found: $zip_src (run ./scripts/export-data.sh first)"
    return 1
  fi

  # SHA of the archive content (deterministic — export-data.ts uses fixed dates)
  local content_sha
  content_sha="$(sha256sum "$zip_src" | cut -c1-12)"

  # Dedup: if a file with the same content SHA already exists, just touch it
  for existing in "${out}/${prefix}-"*"-${content_sha}.zip"; do
    if [[ -f "$existing" ]]; then
      info "Content SHA $content_sha already exists as $(basename "$existing"), touching & skipping ..."
      log "  SHA $content_sha already exists (skipping)"
      touch "$existing"
      echo "$existing"
      return 0
    fi
  done

  local ts_val
  ts_val="$(ts)"
  local final_name="${prefix}-${ts_val}-${content_sha}.zip"
  local dst="${out}/${final_name}"

  info "Adopting $zip_src -> $(basename "$dst") ..."
  cp "$zip_src" "$dst"
  log "  Created $(basename "$dst")"
  echo "$dst"
}

# prune_dir <dir> <keep>
#   Keeps the <keep> most recently modified unique-SHA files, deletes the rest.
#   If multiple files share the same content SHA, only the newest is kept
#   before applying the <keep> limit (truly SHA-based retention).
prune_dir() {
  local dir="$1"
  local keep="$2"

  if [[ ! -d "$dir" ]]; then
    return
  fi

  local total
  total="$(find "$dir" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.zip' \) | wc -l)"
  if (( total <= keep )); then
    return
  fi

  info "Pruning $dir: keeping last $keep unique-SHA of $total archives ..."

  # Group files by SHA (last 12 hex chars before .tar.gz or .zip).
  # For each SHA, keep only the most recently modified file.
  # Then keep the <keep> most recent of those survivors.
  find "$dir" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.zip' \) -printf '%T@ %p\0' \
    | sort -rnz \
    | awk -v keep="$keep" 'BEGIN { RS="\0"; FS=" " }
      {
        # Rejoin fields in case path has spaces (first field is timestamp)
        ts = $1; sub(/^[^ ]* /, "", $0); path = $0
        # Extract SHA from filename: prefix-YYYYMMDD_HHMMSS-<sha12>.tar.gz|.zip
        name = path; gsub(/^.*\//, "", name)
        if (match(name, /-[0-9a-f]{12}\.(tar\.gz|zip)$/)) {
          sha = substr(name, RSTART + 1, 12)
          if (!(sha in seen)) {
            seen[sha] = 1
            sorted[++n] = path
          }
        } else {
          # Fallback: files without SHA in name are kept as-is
          sorted[++n] = path
        }
      }
      END {
        for (i = keep + 1; i <= n; i++) print sorted[i]
      }' \
    | while IFS= read -r file; do
        name="$(basename "$file")"
        sha="$(echo "$name" | sed -n 's/.*-\([0-9a-f]\{12\}\)\.\(tar\.gz\|zip\)$/\1/p')"
        date_part="$(echo "$name" | sed -n 's/.*-\([0-9]\{8\}_[0-9]\{6\}\)-.*/\1/p')"
        info "  Removing $name${sha:+ (SHA $sha)}"
        rm -f "$file"
        log "  Pruned $name (created ${date_part:-?}${sha:+, SHA $sha})"
      done
}

# r2_list_objects <bucket> [endpoint-url]
#   Prints "LastModified<tab>Key" lines for objects in the bucket, sorted oldest first.
r2_list_objects() {
  local bucket="$1"
  local endpoint="${2:+--endpoint-url $2}"

  aws s3api list-objects-v2 \
    --bucket "$bucket" \
    $endpoint \
    --query 'Contents[].[LastModified, Key]' \
    --output text 2>/dev/null || true
}

# r2_prune <bucket> <prefix> <keep> [endpoint-url]
r2_prune() {
  local bucket="$1"
  local prefix="$2"
  local keep="$3"
  local endpoint="${4:+--endpoint-url $4}"

  local objects
  objects="$(r2_list_objects "$bucket" "$endpoint")"

  if [[ -z "$objects" ]]; then
    return
  fi

  # Filter to keys matching the prefix, sort by LastModified descending
  local matches
  matches="$(echo "$objects" | grep "$prefix" | sort -k1,1r)"

  local count
  count="$(echo "$matches" | wc -l)"
  if (( count <= keep )); then
    return
  fi

  info "Pruning R2 bucket $bucket (prefix $prefix): keeping last $keep of $count ..."
  echo "$matches" \
    | tail -n +$((keep + 1)) \
    | awk '{print $2}' \
    | while read -r key; do
        info "  Deleting s3://${bucket}/${key}"
        aws s3 rm "s3://${bucket}/${key}" $endpoint
        name="$(basename "$key")"
        date_part="$(echo "$name" | sed -n 's/.*-\([0-9]\{8\}_[0-9]\{6\}\)-.*/\1/p')"
        log "  Pruned from R2: $name (created $date_part)"
      done
}

# ------------------------------------------------------------------
# 0. Optional: run export-data.sh first
# ------------------------------------------------------------------
if [[ -n "$WITH_EXPORT" ]]; then
  info "Step 0: Running export-data.sh ..."
  ./scripts/export-data.sh
  info "Export complete, proceeding to backup."
fi

# ------------------------------------------------------------------
# 1. Volume backup (local)
# ------------------------------------------------------------------
info "Step 1: Volume backup"
if [[ ! -d "$VOLUME_SRC" ]]; then
  err "Volume source $VOLUME_SRC not found — skipping"
else
  vol_archive="$(make_archive "$VOLUME_SRC" "$VOLUMES_DIR" "volumes-app")"
  info "Volume archive: $vol_archive"
  prune_dir "$VOLUMES_DIR" "$KEEP"
fi

# ------------------------------------------------------------------
# 2. Export backup (local)
# ------------------------------------------------------------------
info "Step 2: Export backup"
if [[ ! -d "$EXPORT_DIR" ]]; then
  err "Export directory $EXPORT_DIR not found — skipping"
else
  if exp_archive="$(adopt_export_zip "$EXPORT_DIR/sheet-folio-export.zip" "$EXPORTS_DIR" "export")"; then
    info "Export archive: $exp_archive"
    prune_dir "$EXPORTS_DIR" "$KEEP"
  else
    info "Skipping export backup (no zip available)"
  fi
fi

# ------------------------------------------------------------------
# 3. R2 upload (conditional)
# ------------------------------------------------------------------
if [[ -n "$R2_BUCKET" ]]; then
  info "Step 3: Upload export archive to R2 bucket $R2_BUCKET"

  if ! command -v aws &>/dev/null; then
    err "aws CLI not found — install it (apt install awscli) or skip --r2-bucket"
    exit 1
  fi

  endpoint_flag=""
  if [[ -n "$R2_ENDPOINT" ]]; then
    endpoint_flag="--endpoint-url $R2_ENDPOINT"
  elif [[ -n "${AWS_ENDPOINT_URL_S3:-}" ]]; then
    endpoint_flag="--endpoint-url $AWS_ENDPOINT_URL_S3"
  fi

  local_exp_name="$(basename "$exp_archive")"

  # Extract SHA from filename (format: export-YYYYMMDD_HHMMSS-<sha12>.zip)
  sha="${local_exp_name##*-}"
  sha="${sha%.zip}"

  # Check if this SHA already exists on R2
  r2_objects="$(r2_list_objects "$R2_BUCKET" "$R2_ENDPOINT")"
  if echo "$r2_objects" | grep -q "$sha"; then
    info "SHA $sha already exists on R2 — skipping upload"
    log "  SHA $sha already exists on R2 (skipping upload)"
  else
    info "Uploading $local_exp_name ..."
    aws s3 cp "$exp_archive" "s3://${R2_BUCKET}/${local_exp_name}" $endpoint_flag

    # Only prune R2 when we actually added a new object
    r2_prune "$R2_BUCKET" "export-" "$R2_KEEP" "$R2_ENDPOINT"
  fi

  info "R2 backup complete"
fi

info "All done!"