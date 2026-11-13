#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRADEIFY_DIR="${TRADEIFY_DIR:-$ROOT_DIR}"
VEST_DIR="${VEST_DIR:-$ROOT_DIR/../Account-Control-Center-2}"
OUTPUT="${1:-$ROOT_DIR/deploy/account-control-dual-update.tar.gz}"

TRADEIFY_DIR="$(cd "$TRADEIFY_DIR" && pwd)"
VEST_DIR="$(cd "$VEST_DIR" && pwd)"

if [[ "$TRADEIFY_DIR" == "$VEST_DIR" ]]; then
  echo "Tradeify and vest must be different folders." >&2
  exit 2
fi
if [[ ! -f "$TRADEIFY_DIR/package.json" || ! -f "$VEST_DIR/package.json" ]]; then
  echo "Both project folders must contain package.json." >&2
  exit 2
fi

WORK_DIR="$(mktemp -d)"
STAGE="$WORK_DIR/release"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

copy_source() {
  local source="$1"
  local destination="$2"
  mkdir -p "$destination"
  rsync -a --delete \
    --exclude='.git/' \
    --exclude='node_modules/' \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='data/' \
    --exclude='tools/streamscribe/.venv/' \
    --exclude='tools/StreamScribe/.venv/' \
    --exclude='tools/streamscribe/data/' \
    --exclude='tools/StreamScribe/data/' \
    --exclude='tools/streamscribe/**/__pycache__/' \
    --exclude='tools/StreamScribe/**/__pycache__/' \
    --exclude='*.tar.gz' \
    --exclude='*.zip' \
    "$source/" "$destination/"
}

copy_private_oauth_client() {
  local instance="$1"
  local source="$2"
  local name
  for name in oauth-client.json oauth-web-client.json; do
    if [[ -s "$source/data/$name" ]]; then
      install -d -m 700 "$STAGE/private/$instance"
      install -m 600 "$source/data/$name" "$STAGE/private/$instance/$name"
    fi
  done
}

copy_vest_seed_data() {
  local name
  for name in admin-channel-catalog.json account-gmail-rules.json account-metadata.json form-metadata.json local-form-config.json; do
    if [[ -s "$VEST_DIR/data/$name" ]]; then
      install -d -m 700 "$STAGE/seed/vest"
      install -m 600 "$VEST_DIR/data/$name" "$STAGE/seed/vest/$name"
    fi
  done
}

copy_source "$TRADEIFY_DIR" "$STAGE/tradeify"
copy_source "$VEST_DIR" "$STAGE/vest"
rsync -a --delete "$TRADEIFY_DIR/portal/" "$STAGE/portal/"
copy_private_oauth_client tradeify "$TRADEIFY_DIR"
copy_private_oauth_client vest "$VEST_DIR"
copy_vest_seed_data

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"
tar -czf "$OUTPUT" -C "$STAGE" .
chmod 600 "$OUTPUT"

echo "BUNDLE=$OUTPUT"
echo "Tradeify source: $TRADEIFY_DIR"
echo "vest source: $VEST_DIR"
echo "OAuth client files are included only for deployment; the archive is mode 600 and is Git-ignored."
