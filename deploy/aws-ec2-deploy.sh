#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <ec2-public-dns-or-ip> <ssh-key.pem> [https-domain]" >&2
  exit 2
fi

HOST="$1"
KEY="$2"
DOMAIN="${3:-$HOST}"
SSH_USER="${SSH_USER:-ec2-user}"
ACCESS_USER="${ACCESS_USER:-}"
ACCESS_PASSWORD="${ACCESS_PASSWORD:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d)"
ARCHIVE="$WORK_DIR/account-control-center.tar.gz"

read_env_value() {
  local key="$1"
  local line value
  [[ -f "$ROOT_DIR/.env" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == "$key="* ]]; then
      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
      if [[ "$value" == \'*\' && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
      printf '%s' "$value"
      return 0
    fi
  done < "$ROOT_DIR/.env"
}

OPENAI_API_KEY="${OPENAI_API_KEY:-$(read_env_value OPENAI_API_KEY)}"
OPENAI_MODEL="${OPENAI_MODEL:-$(read_env_value OPENAI_MODEL)}"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

chmod 600 "$KEY"
cd "$ROOT_DIR"
tar \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./.env.*' \
  --exclude='./data/*.json' \
  --exclude='./data/*.local' \
  --exclude='./data/*.dpapi' \
  --exclude='./data/*.sqlite' \
  --exclude='./data/*.sqlite-*' \
  --exclude='./tools/streamscribe/.venv' \
  --exclude='./tools/StreamScribe/.venv' \
  --exclude='./tools/streamscribe/data' \
  --exclude='./tools/StreamScribe/data' \
  --exclude='./tools/streamscribe/**/__pycache__' \
  --exclude='./tools/StreamScribe/**/__pycache__' \
  --exclude='./deploy/*.tar.gz' \
  -czf "$ARCHIVE" .

scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$ARCHIVE" "$SSH_USER@$HOST:/tmp/account-control-center.tar.gz"

REMOTE_ENV=(
  "DOMAIN=$DOMAIN"
  "ACCESS_USER=$ACCESS_USER"
  "ACCESS_PASSWORD=$ACCESS_PASSWORD"
)
if [[ -n "$OPENAI_API_KEY" ]]; then REMOTE_ENV+=("OPENAI_API_KEY=$OPENAI_API_KEY"); fi
if [[ -n "$OPENAI_MODEL" ]]; then REMOTE_ENV+=("OPENAI_MODEL=$OPENAI_MODEL"); fi
REMOTE_PREFIX=""
for item in "${REMOTE_ENV[@]}"; do
  REMOTE_PREFIX+=" $(printf '%q' "$item")"
done

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST" \
  "sudo env$REMOTE_PREFIX bash -s" \
  < "$ROOT_DIR/deploy/aws-ec2-remote.sh"
