#!/usr/bin/env bash
set -euo pipefail

BASE_DOMAIN="${BASE_DOMAIN:?BASE_DOMAIN is required, for example 3.95.194.104.sslip.io}"
CONTROL_DOMAIN="${CONTROL_DOMAIN:-control.$BASE_DOMAIN}"
TRADEIFY_DOMAIN="${TRADEIFY_DOMAIN:-$BASE_DOMAIN}"
VEST_DOMAIN="${VEST_DOMAIN:-vest.$BASE_DOMAIN}"
ARCHIVE="${ARCHIVE:-/tmp/account-control-dual-update.tar.gz}"
APP_ROOT="/opt/account-control-center"
BACKUP_DIR="/opt/account-control-backups"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
TRADEIFY_DATA="$APP_ROOT/data-tradeify"
VEST_DATA="$APP_ROOT/data-vest"

if [[ ! -s "$ARCHIVE" ]]; then
  echo "Missing deployment archive: $ARCHIVE" >&2
  exit 1
fi

if command -v dnf >/dev/null 2>&1; then
  dnf install -y docker tar gzip curl
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io tar gzip curl
else
  echo "Unsupported Linux image: dnf or apt-get required" >&2
  exit 1
fi
systemctl enable --now docker

read_env_value() {
  local file="$1"
  local key="$2"
  local line value
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" == "$key="* ]]; then
      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"* && "$value" == *\" ]]; then value="${value:1:${#value}-2}"; fi
      if [[ "$value" == \'* && "$value" == *\' ]]; then value="${value:1:${#value}-2}"; fi
      printf '%s' "$value"
      return 0
    fi
  done < "$file"
}

LEGACY_ENV="$APP_ROOT/.env"
TRADEIFY_ENV="$APP_ROOT/tradeify.env"
VEST_ENV="$APP_ROOT/vest.env"
TRADEIFY_OPENAI_API_KEY="${TRADEIFY_OPENAI_API_KEY:-$(read_env_value "$LEGACY_ENV" OPENAI_API_KEY)}"
TRADEIFY_OPENAI_MODEL="${TRADEIFY_OPENAI_MODEL:-$(read_env_value "$LEGACY_ENV" OPENAI_MODEL)}"
TRADEIFY_PUBLISHING_STATUS="${TRADEIFY_OAUTH_PUBLISHING_STATUS:-$(read_env_value "$LEGACY_ENV" GOOGLE_OAUTH_PUBLISHING_STATUS)}"
TRADEIFY_MONITOR_HOURS="${TRADEIFY_OAUTH_TOKEN_MONITOR_HOURS:-$(read_env_value "$LEGACY_ENV" OAUTH_TOKEN_MONITOR_HOURS)}"
VEST_OPENAI_API_KEY="${VEST_OPENAI_API_KEY:-$(read_env_value "$VEST_ENV" OPENAI_API_KEY)}"
VEST_OPENAI_MODEL="${VEST_OPENAI_MODEL:-$(read_env_value "$VEST_ENV" OPENAI_MODEL)}"
VEST_PUBLISHING_STATUS="${VEST_OAUTH_PUBLISHING_STATUS:-$(read_env_value "$VEST_ENV" GOOGLE_OAUTH_PUBLISHING_STATUS)}"
VEST_MONITOR_HOURS="${VEST_OAUTH_TOKEN_MONITOR_HOURS:-$(read_env_value "$VEST_ENV" OAUTH_TOKEN_MONITOR_HOURS)}"
TRADEIFY_PUBLISHING_STATUS="${TRADEIFY_PUBLISHING_STATUS:-testing}"
TRADEIFY_MONITOR_HOURS="${TRADEIFY_MONITOR_HOURS:-24}"
VEST_PUBLISHING_STATUS="${VEST_PUBLISHING_STATUS:-testing}"
VEST_MONITOR_HOURS="${VEST_MONITOR_HOURS:-24}"

mkdir -p "$RELEASE_DIR" "$BACKUP_DIR"
if [[ -d "$APP_ROOT/data" ]]; then
  tar -czf "$BACKUP_DIR/legacy-data-$RELEASE_ID.tar.gz" -C "$APP_ROOT" data
  chmod 600 "$BACKUP_DIR/legacy-data-$RELEASE_ID.tar.gz"
fi
for name in data-tradeify data-vest; do
  if [[ -d "$APP_ROOT/$name" ]]; then
    tar -czf "$BACKUP_DIR/$name-$RELEASE_ID.tar.gz" -C "$APP_ROOT" "$name"
    chmod 600 "$BACKUP_DIR/$name-$RELEASE_ID.tar.gz"
  fi
done

tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
for directory in tradeify vest portal; do
  if [[ ! -d "$RELEASE_DIR/$directory" ]]; then
    echo "Deployment archive is missing $directory/." >&2
    exit 1
  fi
done

# The old one-instance deployment used /opt/account-control-center/data.
# Move it once before replacing code so existing Tradeify refresh tokens stay intact.
if [[ -d "$APP_ROOT/data" && ! -e "$TRADEIFY_DATA" ]]; then
  mv "$APP_ROOT/data" "$TRADEIFY_DATA"
fi
mkdir -p "$TRADEIFY_DATA" "$VEST_DATA"
chmod 700 "$TRADEIFY_DATA" "$VEST_DATA"

copy_if_missing() {
  local source="$1"
  local destination="$2"
  [[ -s "$source" && ! -e "$destination" ]] || return 0
  install -D -m 600 "$source" "$destination"
}

for name in oauth-client.json oauth-web-client.json; do
  copy_if_missing "$RELEASE_DIR/private/tradeify/$name" "$TRADEIFY_DATA/$name"
  copy_if_missing "$RELEASE_DIR/private/vest/$name" "$VEST_DATA/$name"
done
for name in admin-channel-catalog.json account-gmail-rules.json account-metadata.json form-metadata.json local-form-config.json; do
  copy_if_missing "$RELEASE_DIR/seed/vest/$name" "$VEST_DATA/$name"
done

for directory in tradeify vest portal; do
  rm -rf "$APP_ROOT/$directory"
  mv "$RELEASE_DIR/$directory" "$APP_ROOT/$directory"
done
rm -f "$APP_ROOT/.env"

write_instance_env() {
  local target="$1"
  local port="$2"
  local redirect="$3"
  local publishing_status="$4"
  local monitor_hours="$5"
  local openai_api_key="$6"
  local openai_model="$7"
  umask 077
  {
    printf 'NODE_ENV=production\n'
    printf 'CONTROL_CENTER_HOST=0.0.0.0\n'
    printf 'CONTROL_CENTER_PORT=%s\n' "$port"
    printf 'CONTROL_CENTER_DATA=/app/data\n'
    printf 'YOUTUBE_OAUTH_REDIRECT=%s\n' "$redirect"
    printf 'GOOGLE_OAUTH_PUBLISHING_STATUS=%s\n' "$publishing_status"
    printf 'OAUTH_TOKEN_MONITOR_HOURS=%s\n' "$monitor_hours"
    if [[ -n "$openai_api_key" ]]; then printf 'OPENAI_API_KEY=%s\n' "$openai_api_key"; fi
    if [[ -n "$openai_model" ]]; then printf 'OPENAI_MODEL=%s\n' "$openai_model"; fi
  } > "$target"
  chmod 600 "$target"
}

write_instance_env "$TRADEIFY_ENV" 8790 "https://$TRADEIFY_DOMAIN/oauth/callback" "$TRADEIFY_PUBLISHING_STATUS" "$TRADEIFY_MONITOR_HOURS" "$TRADEIFY_OPENAI_API_KEY" "$TRADEIFY_OPENAI_MODEL"
write_instance_env "$VEST_ENV" 8791 "https://$VEST_DOMAIN/oauth/callback" "$VEST_PUBLISHING_STATUS" "$VEST_MONITOR_HOURS" "$VEST_OPENAI_API_KEY" "$VEST_OPENAI_MODEL"

docker build -t account-control-tradeify:latest "$APP_ROOT/tradeify"
docker build -t account-control-vest:latest "$APP_ROOT/vest"
docker rm -f account-control-center account-control-tradeify account-control-vest >/dev/null 2>&1 || true

docker run -d \
  --restart unless-stopped \
  --name account-control-tradeify \
  --env-file "$TRADEIFY_ENV" \
  -v "$TRADEIFY_DATA:/app/data" \
  -p 127.0.0.1:8790:8790 \
  account-control-tradeify:latest

docker run -d \
  --restart unless-stopped \
  --name account-control-vest \
  --env-file "$VEST_ENV" \
  -v "$VEST_DATA:/app/data" \
  -p 127.0.0.1:8791:8791 \
  account-control-vest:latest

cat > "$APP_ROOT/Caddyfile" <<EOF
https://$CONTROL_DOMAIN {
  root * /srv/portal
  file_server
}

https://$TRADEIFY_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8790
}

https://$VEST_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8791
}
EOF

docker rm -f account-control-caddy >/dev/null 2>&1 || true
docker run -d \
  --restart unless-stopped \
  --name account-control-caddy \
  --network host \
  -v "$APP_ROOT/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$APP_ROOT/portal:/srv/portal:ro" \
  -v account_control_caddy_data:/data \
  -v account_control_caddy_config:/config \
  caddy:2-alpine

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8790/api/health >/dev/null && curl -fsS http://127.0.0.1:8791/api/health >/dev/null; then
    break
  fi
  sleep 1
done

docker ps --filter name=account-control --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
echo "COMMON_URL=https://$CONTROL_DOMAIN"
echo "TRADEIFY_URL=https://$TRADEIFY_DOMAIN"
echo "VEST_URL=https://$VEST_DOMAIN"
echo "TRADEIFY_OAUTH_REDIRECT=https://$TRADEIFY_DOMAIN/oauth/callback"
echo "VEST_OAUTH_REDIRECT=https://$VEST_DOMAIN/oauth/callback"
echo "ACTION_REQUIRED=Add VEST_OAUTH_REDIRECT to the vest Google OAuth web client before connecting vest accounts."
