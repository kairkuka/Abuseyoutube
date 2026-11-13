#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <ec2-public-dns-or-ip> <ssh-key.pem> [base-domain]" >&2
  echo "Example base-domain: 3.95.194.104.sslip.io" >&2
  exit 2
fi

HOST="$1"
KEY="$2"
BASE_DOMAIN="${3:-$HOST}"
SSH_USER="${SSH_USER:-ec2-user}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d)"
ARCHIVE="$WORK_DIR/account-control-dual-update.tar.gz"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

"$ROOT_DIR/deploy/build-aws-dual-bundle.sh" "$ARCHIVE"
chmod 600 "$KEY"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$ARCHIVE" "$SSH_USER@$HOST:/tmp/account-control-dual-update.tar.gz"

CONTROL_DOMAIN="${CONTROL_DOMAIN:-control.$BASE_DOMAIN}"
TRADEIFY_DOMAIN="${TRADEIFY_DOMAIN:-$BASE_DOMAIN}"
VEST_DOMAIN="${VEST_DOMAIN:-vest.$BASE_DOMAIN}"
REMOTE_ENV=(
  "BASE_DOMAIN=$BASE_DOMAIN"
  "CONTROL_DOMAIN=$CONTROL_DOMAIN"
  "TRADEIFY_DOMAIN=$TRADEIFY_DOMAIN"
  "VEST_DOMAIN=$VEST_DOMAIN"
  "ARCHIVE=/tmp/account-control-dual-update.tar.gz"
)
REMOTE_PREFIX=""
for item in "${REMOTE_ENV[@]}"; do
  REMOTE_PREFIX+=" $(printf '%q' "$item")"
done

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST" \
  "sudo env$REMOTE_PREFIX bash -s" \
  < "$ROOT_DIR/deploy/aws-ec2-dual-remote.sh"
