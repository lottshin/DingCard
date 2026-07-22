#!/usr/bin/env bash
# End-to-end smoke for the single DingCard app container. Every run uses an
# isolated Compose project, environment file, host port, and named volumes.
set -u

PROJECT="${COMPOSE_SMOKE_PROJECT:-dingcard-smoke-$$}"
if [ -n "${COMPOSE_SMOKE_WEB_PORT:-}" ]; then
  WEB_PORT="$COMPOSE_SMOKE_WEB_PORT"
else
  WEB_PORT=$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
fi
ENV_FILE="$(mktemp)"
HOME_BODY_FILE="$(mktemp)"
HEALTH_BODY_FILE="$(mktemp)"
IMAGE_FILE="$(mktemp)"
FAIL=0

cat >"$ENV_FILE" <<'EOF'
JWT_SECRET=compose-smoke-secret-not-for-prod
EOF

cleanup() {
  status=$?
  echo "=== 清理 ==="
  if WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" down -v --remove-orphans >/dev/null 2>&1; then
    echo "已清理 Compose 资源"
  else
    echo "  x Compose 资源清理失败" >&2
    status=1
  fi
  if ! rm -f "$ENV_FILE" "$HOME_BODY_FILE" "$HEALTH_BODY_FILE" "$IMAGE_FILE" 2>/dev/null; then
    echo "  x 临时文件清理失败" >&2
    status=1
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

pass() { echo "  PASS $1"; }
fail() { echo "  FAIL $1 <-- $2"; FAIL=1; }

echo "=== build + up ==="
if up_output=$(WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" up -d --build 2>&1); then
  printf '%s\n' "$up_output" | tail -4
else
  printf '%s\n' "$up_output" | tail -4
  fail "build + up" "docker compose failed"
  exit "$FAIL"
fi

APP_ID=$(WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" ps -q app)
if [ -z "$APP_ID" ]; then
  fail "container lookup" "app container was not created"
  exit "$FAIL"
fi

base="http://127.0.0.1:${WEB_PORT}"
ready=0
echo "=== wait for homepage and API (up to 60 seconds) ==="
deadline=$((SECONDS + 60))
attempt=0
home_code=000
health_code=000
while [ "$SECONDS" -lt "$deadline" ]; do
  attempt=$((attempt + 1))
  remaining=$((deadline - SECONDS))
  request_timeout=$remaining
  [ "$request_timeout" -gt 2 ] && request_timeout=2
  home_code=$(curl -sS --connect-timeout "$request_timeout" --max-time "$request_timeout" -o "$HOME_BODY_FILE" -w '%{http_code}' "$base/" 2>/dev/null || echo 000)

  remaining=$((deadline - SECONDS))
  [ "$remaining" -le 0 ] && break
  request_timeout=$remaining
  [ "$request_timeout" -gt 2 ] && request_timeout=2
  health_code=$(curl -sS --connect-timeout "$request_timeout" --max-time "$request_timeout" -o "$HEALTH_BODY_FILE" -w '%{http_code}' "$base/api/health" 2>/dev/null || echo 000)
  health_ok=$(node -e "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(v.ok===true?'true':'false')}catch{process.stdout.write('false')}" "$HEALTH_BODY_FILE")
  echo "  $attempt: home=$home_code api=$health_code ok=$health_ok"
  if [ "$home_code" = 200 ] && grep -q '<div id="root">' "$HOME_BODY_FILE" \
    && [ "$health_code" = 200 ] && [ "$health_ok" = true ]; then
    ready=1
    break
  fi
  [ "$SECONDS" -lt "$deadline" ] && sleep 1
done
if [ "$ready" = 1 ]; then
  pass "homepage and /api/health became ready"
else
  fail "homepage/API readiness" "home=$home_code api=$health_code body=$(cat "$HEALTH_BODY_FILE" 2>/dev/null)"
  exit "$FAIL"
fi

asset_path=$(node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');const m=s.match(/(?:src|href)=[\"'](\/assets\/[^\"']+)[\"']/);if(m)process.stdout.write(m[1])" "$HOME_BODY_FILE")
if [ -n "$asset_path" ]; then
  asset_code=$(curl -sS --connect-timeout 2 --max-time 10 -o /dev/null -w '%{http_code}' "$base$asset_path")
  [ "$asset_code" = 200 ] && pass "built asset $asset_path returned 200" || fail "built asset" "HTTP $asset_code"
else
  fail "built asset" "homepage did not reference /assets/..."
fi

reg=$(curl -sS --connect-timeout 2 --max-time 10 -X POST "$base/api/auth/register" -H 'content-type: application/json' \
  -d '{"username":"smoke","password":"1234"}')
token=$(printf '%s' "$reg" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).token||'')}catch{}})")
[ -n "$token" ] && pass "registration returned a token" || fail "registration" "$reg"

node -e "require('fs').writeFileSync(process.argv[1],Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))" "$IMAGE_FILE"
CURL_IMAGE_FILE="$IMAGE_FILE"
if command -v cygpath >/dev/null 2>&1; then
  CURL_IMAGE_FILE="$(cygpath -w "$IMAGE_FILE")"
fi
up=$(curl -sS --connect-timeout 2 --max-time 10 -X POST "$base/api/images" -H "authorization: Bearer $token" \
  -F "file=@$CURL_IMAGE_FILE;type=image/png;filename=smoke.png")
imgurl=$(printf '%s' "$up" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).url||'')}catch{}})")
[ -n "$imgurl" ] && pass "upload returned $imgurl" || fail "upload" "$up"

if [ -n "$imgurl" ]; then
  image_code=$(curl -sS --connect-timeout 2 --max-time 10 -o /dev/null -w '%{http_code}' "$base$imgurl")
  [ "$image_code" = 200 ] && pass "Fastify served the upload directly" || fail "uploaded image" "HTTP $image_code"
fi

echo "=== app maxUploadBytes ==="
docker exec "$APP_ID" node -e "import('./src/config.js').then(m=>console.log(m.config.maxUploadBytes))" 2>&1 | tail -1

echo "=== app log tail ==="
docker logs "$APP_ID" 2>&1 | tail -6

echo ""
[ "$FAIL" = 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit "$FAIL"
