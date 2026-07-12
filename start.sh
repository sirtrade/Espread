#!/usr/bin/env bash
# Запуск проекта локально: cloudflared quick tunnel + сервер.
# Туннельный URL меняется при каждом запуске, скрипт сам прописывает его в server/.env.
set -euo pipefail

cd "$(dirname "$0")"

PORT=3000
TUNNEL_LOG=$(mktemp /tmp/lector-tunnel.XXXXXX)

# --- Убираем остатки прошлого запуска ---------------------------------------
pkill -f "cloudflared tunnel --url" 2>/dev/null && echo "Убил старый quick tunnel" || true
OLD_PID=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "Убиваю процесс на порту $PORT (pid $OLD_PID)"
  kill "$OLD_PID"
  sleep 1
fi

# --- Сборки (всегда, чтобы dist не отставал от исходников) -------------------
echo "Собираю сервер..." && (cd server && npm run build)
echo "Собираю webapp..." && (cd webapp && npm run build)

# --- Туннель -----------------------------------------------------------------
echo "Запускаю cloudflared quick tunnel..."
cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill $TUNNEL_PID 2>/dev/null || true' EXIT

TUNNEL_URL=""
for _ in $(seq 1 30); do
  TUNNEL_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$TUNNEL_LOG" | head -1 || true)
  [ -n "$TUNNEL_URL" ] && break
  sleep 1
done
if [ -z "$TUNNEL_URL" ]; then
  echo "Не дождался URL туннеля, лог: $TUNNEL_LOG" >&2
  exit 1
fi
echo "Туннель: $TUNNEL_URL"

# --- Прописываем URL в server/.env -------------------------------------------
sed -i '' "s|^WEBAPP_URL=.*|WEBAPP_URL=$TUNNEL_URL|" server/.env
echo "WEBAPP_URL обновлён в server/.env"

# --- Сервер (foreground; Ctrl+C останавливает и сервер, и туннель) ------------
cd server
echo "Запускаю сервер на порту $PORT..."
node --env-file=.env dist/main.js
