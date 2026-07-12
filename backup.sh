#!/usr/bin/env bash
# ============================================================================
# backup.sh — Volume + export backup with SHA-based retention (keep last 5)
# ============================================================================
# Usage:
#   ./backup.sh                                         # local backup only
#   ./backup.sh --r2-bucket my-bucket                   # + upload export to R2
#   ./backup.sh --r2-bucket my-bucket --r2-endpoint URL # custom endpoint
#   ./backup.sh --export-dir /path/to/export-data       # custom export dir
#
# Environment variables for R2 (read by aws CLI):
#   AWS_ACCESS_KEY_ID       — R2 access key
#   AWS_SECRET_ACCESS_KEY   — R2 secret key
#   AWS_ENDPOINT_URL_S3     — (optional) R2 endpoint (if not in --r2-endpoint)
# ============================================================================
# Quick log check: tail -6 $HOME/logs/sheet-folio-backup.log
set -euo pipefail

LOG_FILE="$HOME/logs/sheet-folio-backup.log"

# Verbose mode: when stderr goes to terminal (interactive run), print progress to console too.
# When stderr is redirected (cron: 2>> file), stay quiet and only log to file.
if [ -t 2 ]; then
  VERBOSE=true
else
  VERBOSE=false
fi

log() {
  local msg="[$(date)] $1"
  echo "$msg" >> "$LOG_FILE"
  $VERBOSE && echo "$msg" >&2 || true
}

trap 's=$?; log "$( [ $s -eq 0 ] && echo COMPLETE || echo "FAILED (exit: $s)")"' EXIT

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

VOLUME_SRC="volumes/app"
EXPORT_DEFAULT="export-data"

# ------------------------------------------------------------------
# Args (CLI overrides .env values)
# ------------------------------------------------------------------
EXPORT_DIR="$EXPORT_DEFAULT"
R2_BUCKET="${R2_BUCKET:-}"
R2_ENDPOINT="${R2_ENDPOINT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --export-dir)    EXPORT_DIR="$2";  shift 2 ;;
    --r2-bucket)     R2_BUCKET="$2";   shift 2 ;;
    --r2-endpoint)   R2_ENDPOINT="$2"; shift 2 ;;
    --help|-h)       sed -n '/^# /,/^$/p' "$0" | sed 's/^# //'; exit 0 ;;
    *)               echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Resolve relative export dir to absolute
EXPORT_DIR="$(realpath -m "$EXPORT_DIR")"

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
info()  { local m="$*"; log "  $m"; echo "  $m" >&2; }
err()   { local m="$*"; log "  ERROR: $m"; echo "  ERROR: $m" >&2; }
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

  local tmpfile
  tmpfile="$(mktemp "/tmp/${prefix}-XXXXXX.tar.gz")"

  info "Packing $src -> $(basename "$tmpfile") ..."
  tar -czf "$tmpfile" -C "$(dirname "$src")" "$(basename "$src")"

  local sha
  sha="$(sha_prefix < "$tmpfile")"
  local ts_val
  ts_val="$(ts)"
  local final_name="${prefix}-${ts_val}-${sha}.tar.gz"
  local dst="${out}/${final_name}"

  # Dedup: if a file with the same SHA already exists, just touch it
  for existing in "${out}/${prefix}-"*"-${sha}.tar.gz"; do
    if [[ -f "$existing" ]]; then
      info "SHA $sha already exists as $(basename "$existing"), touching & skipping ..."
      touch "$existing"
      rm -f "$tmpfile"
      echo "$existing"
      return
    fi
  done

  mv "$tmpfile" "$dst"
  echo "$dst"
}

# prune_dir <dir> <keep>
#   Keeps the <keep> most recently modified files, deletes the rest.
prune_dir() {
  local dir="$1"
  local keep="$2"

  if [[ ! -d "$dir" ]]; then
    return
  fi

  local count
  count="$(find "$dir" -maxdepth 1 -type f -name '*.tar.gz' | wc -l)"
  if (( count <= keep )); then
    return
  fi

  info "Pruning $dir: keeping last $keep of $count archives ..."
  find "$dir" -maxdepth 1 -type f -name '*.tar.gz' -printf '%T@ %p\0' \
    | sort -rnz \
    | tail -n +$((keep + 1)) \
    | cut -z -d' ' -f2- \
    | xargs -0 -r rm -v
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
      done
}

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
  exp_archive="$(make_archive "$EXPORT_DIR" "$EXPORTS_DIR" "export")"
  info "Export archive: $exp_archive"
  prune_dir "$EXPORTS_DIR" "$KEEP"
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

  # Extract SHA from filename (format: export-YYYYMMDD_HHMMSS-<sha12>.tar.gz)
  sha="${local_exp_name##*-}"
  sha="${sha%.tar.gz}"

  # Check if this SHA already exists on R2
  r2_objects="$(r2_list_objects "$R2_BUCKET" "$R2_ENDPOINT")"
  if echo "$r2_objects" | grep -q "$sha"; then
    info "SHA $sha already exists on R2 — skipping upload"
  else
    info "Uploading $local_exp_name ..."
    aws s3 cp "$exp_archive" "s3://${R2_BUCKET}/${local_exp_name}" $endpoint_flag

    # Only prune R2 when we actually added a new object
    r2_prune "$R2_BUCKET" "export-" "$KEEP" "$R2_ENDPOINT"
  fi

  info "R2 backup complete"
fi

info "All done!"