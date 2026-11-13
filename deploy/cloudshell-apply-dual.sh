#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-east-1}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:-sg-0d7d975605f8e84ac}"
HOST="${HOST:-ec2-3-95-194-104.compute-1.amazonaws.com}"
BASE_DOMAIN="${BASE_DOMAIN:-3.95.194.104.sslip.io}"
ARCHIVE="${ARCHIVE:-$HOME/account-control-dual-update.tar.gz}"
KEY="${KEY:-$(ls -t "$HOME"/account-control-center-*.pem 2>/dev/null | head -n1 || true)}"
REMOTE_SCRIPT="$(mktemp)"
cleanup() { rm -f "$REMOTE_SCRIPT"; }
trap cleanup EXIT

if [[ ! -s "$ARCHIVE" ]]; then
  echo "Missing archive: $ARCHIVE" >&2
  exit 1
fi
if [[ -z "$KEY" ]]; then
  echo "Missing EC2 key: ~/account-control-center-*.pem" >&2
  exit 1
fi

tar -xOf "$ARCHIVE" ./tradeify/deploy/aws-ec2-dual-remote.sh > "$REMOTE_SCRIPT"
chmod 600 "$KEY"

MY_IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '\r\n')"
aws ec2 authorize-security-group-ingress \
  --region "$REGION" \
  --group-id "$SECURITY_GROUP_ID" \
  --protocol tcp \
  --port 22 \
  --cidr "$MY_IP/32" >/dev/null 2>&1 || true

scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  "$ARCHIVE" "ec2-user@$HOST:/tmp/account-control-dual-update.tar.gz"

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

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ec2-user@$HOST" \
  "sudo env$REMOTE_PREFIX bash -s" \
  < "$REMOTE_SCRIPT"
