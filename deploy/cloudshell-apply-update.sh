#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
SECURITY_GROUP_ID="sg-0d7d975605f8e84ac"
HOST="ec2-3-95-194-104.compute-1.amazonaws.com"
ARCHIVE="$HOME/account-control-center-update.tar.gz"
KEY="$(ls -t "$HOME"/account-control-center-*.pem 2>/dev/null | head -n1 || true)"

if [[ ! -s "$ARCHIVE" ]]; then
  echo "Missing archive: $ARCHIVE" >&2
  exit 1
fi

if [[ -z "$KEY" ]]; then
  echo "Missing EC2 key: ~/account-control-center-*.pem" >&2
  exit 1
fi

chmod 600 "$KEY"

MY_IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '\r\n')"
aws ec2 authorize-security-group-ingress \
  --region "$REGION" \
  --group-id "$SECURITY_GROUP_ID" \
  --protocol tcp \
  --port 22 \
  --cidr "$MY_IP/32" >/dev/null 2>&1 || true

scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  "$ARCHIVE" "ec2-user@$HOST:/tmp/account-control-center.tar.gz"

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ec2-user@$HOST" 'sudo bash -s' <<'REMOTE'
set -euo pipefail

APP_DIR="/opt/account-control-center"
BACKUP_DIR="/opt/account-control-backups"
BACKUP_FILE="$BACKUP_DIR/data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
mkdir -p "$BACKUP_DIR"
if [[ -d "$APP_DIR/data" ]]; then
  tar -czf "$BACKUP_FILE" -C "$APP_DIR" data
  chmod 600 "$BACKUP_FILE"
  echo "DATA_BACKUP=$BACKUP_FILE"
fi
tar -xzf /tmp/account-control-center.tar.gz -C "$APP_DIR"
cd "$APP_DIR"

# Keep existing production choices, but enable the server-side OAuth monitor on
# older installations that do not yet have these settings.
if ! grep -q '^OAUTH_TOKEN_MONITOR_HOURS=' "$APP_DIR/.env"; then
  printf 'OAUTH_TOKEN_MONITOR_HOURS=24\n' >> "$APP_DIR/.env"
fi
if ! grep -q '^GOOGLE_OAUTH_PUBLISHING_STATUS=' "$APP_DIR/.env"; then
  printf 'GOOGLE_OAUTH_PUBLISHING_STATUS=testing\n' >> "$APP_DIR/.env"
fi

docker build -t account-control-center:latest .
docker rm -f account-control-center >/dev/null 2>&1 || true
docker run -d \
  --restart unless-stopped \
  --name account-control-center \
  --env-file "$APP_DIR/.env" \
  -v "$APP_DIR/data:/app/data" \
  -p 127.0.0.1:8790:8790 \
  account-control-center:latest

docker restart account-control-caddy >/dev/null 2>&1 || true
docker ps --filter name=account-control --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
REMOTE

echo "UPDATED"
