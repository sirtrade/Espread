#!/usr/bin/env bash
# Simple SQLite backup using the .backup command (safe for a live WAL-mode DB).
# Usage: ./scripts/backup-db.sh [dest_dir]
set -euo pipefail

DB_PATH="${DB_PATH:-/data/lector.db}"
DEST_DIR="${1:-/data/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST_FILE="${DEST_DIR}/lector-${TIMESTAMP}.db"

mkdir -p "$DEST_DIR"
sqlite3 "$DB_PATH" ".backup '${DEST_FILE}'"
echo "Backup written to ${DEST_FILE}"
