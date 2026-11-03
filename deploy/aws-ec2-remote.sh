#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN is required}"
APP_DIR="/opt/account-control-center"
ARCHIVE="/tmp/account-control-center.tar.gz"

if command -v dnf >/dev/null 2>&1; then
  dnf install -y docker tar gzip
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io tar gzip
else
  echo "Unsupported Linux image: dnf or apt-get required" >&2
  exit 1
fi

systemctl enable --now docker

mkdir -p "$APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
mkdir -p "$APP_DIR/data"
chmod 700 "$APP_DIR/data"

if [[ -f "$APP_DIR/.env" ]]; then
  EXISTING_ACCESS_USER="$(awk -F= '/^CONTROL_CENTER_ACCESS_USER=/{print substr($0, index($0, "=") + 1)}' "$APP_DIR/.env" | tail -n1)"
  EXISTING_ACCESS_PASSWORD="$(awk -F= '/^CONTROL_CENTER_ACCESS_PASSWORD=/{print substr($0, index($0, "=") + 1)}' "$APP_DIR/.env" | tail -n1)"
else
  EXISTING_ACCESS_USER=""
  EXISTING_ACCESS_PASSWORD=""
fi

ACCESS_USER="${ACCESS_USER:-${EXISTING_ACCESS_USER:-admin}}"
ACCESS_PASSWORD="${ACCESS_PASSWORD:-${EXISTING_ACCESS_PASSWORD:-$(openssl rand -base64 24 | tr -d '=+/[:space:]' | cut -c1-24)}}"
SITE_SCHEME="https"
SITE_ADDRESS="$DOMAIN"
if [[ "$DOMAIN" =~ ^ec2-[^.]+\.compute-[0-9]+\.amazonaws\.com$ || "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SITE_SCHEME="http"
  SITE_ADDRESS="http://$DOMAIN"
fi

cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
CONTROL_CENTER_HOST=0.0.0.0
CONTROL_CENTER_PORT=8790
CONTROL_CENTER_DATA=/app/data
CONTROL_CENTER_ACCESS_USER=$ACCESS_USER
CONTROL_CENTER_ACCESS_PASSWORD=$ACCESS_PASSWORD
YOUTUBE_OAUTH_REDIRECT=$SITE_SCHEME://$DOMAIN/oauth/callback
EOF
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  printf 'OPENAI_API_KEY=%s\n' "$OPENAI_API_KEY" >> "$APP_DIR/.env"
fi
if [[ -n "${OPENAI_MODEL:-}" ]]; then
  printf 'OPENAI_MODEL=%s\n' "$OPENAI_MODEL" >> "$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env"

cd "$APP_DIR"
docker build -t account-control-center:latest .
docker rm -f account-control-center >/dev/null 2>&1 || true
docker run -d \
  --restart unless-stopped \
  --name account-control-center \
  --env-file "$APP_DIR/.env" \
  -v "$APP_DIR/data:/app/data" \
  -p 127.0.0.1:8790:8790 \
  account-control-center:latest

cat > "$APP_DIR/Caddyfile" <<EOF
$SITE_ADDRESS {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8790
}
EOF

docker rm -f account-control-caddy >/dev/null 2>&1 || true
docker run -d \
  --restart unless-stopped \
  --name account-control-caddy \
  --network host \
  -v "$APP_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v account_control_caddy_data:/data \
  -v account_control_caddy_config:/config \
  caddy:2-alpine

sleep 3
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo "URL=$SITE_SCHEME://$DOMAIN"
echo "OAUTH_REDIRECT=$SITE_SCHEME://$DOMAIN/oauth/callback"
echo "BASIC_AUTH_USER=$ACCESS_USER"
echo "BASIC_AUTH_PASSWORD=<set>"
