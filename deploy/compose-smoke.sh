#!/usr/bin/env bash
# End-to-end smoke for the single DingCard app container, including migration
# from the legacy server/web topology. Every run uses isolated resources.
set -u

PROJECT="${COMPOSE_SMOKE_PROJECT:-dingcard-smoke-$$}"
SMOKE_VERSION="smoke-${PROJECT}"
SMOKE_IMAGE="ghcr.io/lottshin/dingcard:$SMOKE_VERSION"
free_port() {
  node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
}
if [ -n "${COMPOSE_SMOKE_WEB_PORT:-}" ]; then
  WEB_PORT="$COMPOSE_SMOKE_WEB_PORT"
else
  WEB_PORT=$(free_port)
fi
LEGACY_API_PORT=$(free_port)
while [ "$LEGACY_API_PORT" = "$WEB_PORT" ]; do LEGACY_API_PORT=$(free_port); done
ENV_FILE="$(mktemp)"
LEGACY_COMPOSE_FILE="$(mktemp)"
HOME_BODY_FILE="$(mktemp)"
HEALTH_BODY_FILE="$(mktemp)"
IMAGE_FILE="$(mktemp)"
FAIL=0

cat >"$ENV_FILE" <<'EOF'
JWT_SECRET=compose-smoke-secret-not-for-prod
EOF

cat >"$LEGACY_COMPOSE_FILE" <<EOF
services:
  server:
    image: "$SMOKE_IMAGE"
    environment:
      JWT_SECRET: compose-smoke-secret-not-for-prod
    volumes:
      - db:/data
      - uploads:/data/uploads
    ports:
      - "127.0.0.1:$LEGACY_API_PORT:3000"
  web:
    image: "$SMOKE_IMAGE"
    command: ["node", "-e", "setInterval(() => {}, 2147483647)"]
    volumes:
      - uploads:/uploads:ro
    ports:
      - "127.0.0.1:$WEB_PORT:3000"
volumes:
  db:
  uploads:
EOF

cleanup() {
  status=$?
  echo "=== 清理 ==="
  if DINGCARD_VERSION="$SMOKE_VERSION" WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" down -v --remove-orphans >/dev/null 2>&1; then
    echo "已清理 Compose 资源"
  else
    echo "  x Compose 资源清理失败" >&2
    status=1
  fi
  if docker image inspect "$SMOKE_IMAGE" >/dev/null 2>&1; then
    if ! docker image rm "$SMOKE_IMAGE"; then
      echo "  x Smoke image cleanup failed: $SMOKE_IMAGE" >&2
      status=1
    else
      echo "已清理 smoke 镜像标签"
    fi
  else
    echo "smoke 镜像标签不存在，视为已清理"
  fi
  if ! rm -f "$ENV_FILE" "$LEGACY_COMPOSE_FILE" "$HOME_BODY_FILE" "$HEALTH_BODY_FILE" "$IMAGE_FILE" 2>/dev/null; then
    echo "  x 临时文件清理失败" >&2
    status=1
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup EXIT

pass() { echo "  PASS $1"; }
fail() { echo "  FAIL $1 <-- $2"; FAIL=1; }

echo "=== build app image ==="
if build_output=$(DINGCARD_VERSION="$SMOKE_VERSION" WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" build app 2>&1); then
  printf '%s\n' "$build_output" | tail -4
else
  printf '%s\n' "$build_output" | tail -4
  fail "build app image" "docker compose failed"
  exit "$FAIL"
fi

echo "=== seed legacy server/web stack ==="
if ! docker compose -f "$LEGACY_COMPOSE_FILE" -p "$PROJECT" up -d; then
  fail "legacy stack" "docker compose failed"
  exit "$FAIL"
fi

legacy_base="http://127.0.0.1:${LEGACY_API_PORT}"
legacy_ready=0
deadline=$((SECONDS + 60))
while [ "$SECONDS" -lt "$deadline" ]; do
  legacy_health=$(curl -sS --connect-timeout 2 --max-time 2 -o /dev/null -w '%{http_code}' "$legacy_base/api/health" 2>/dev/null || echo 000)
  if [ "$legacy_health" = 200 ]; then legacy_ready=1; break; fi
  sleep 1
done
if [ "$legacy_ready" != 1 ]; then
  fail "legacy API readiness" "HTTP $legacy_health"
  exit "$FAIL"
fi

legacy_reg=$(curl -sS --connect-timeout 2 --max-time 10 -X POST "$legacy_base/api/auth/register" -H 'content-type: application/json' \
  -d '{"username":"migration","password":"1234"}')
legacy_token=$(printf '%s' "$legacy_reg" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).token||'')}catch{}})")
[ -n "$legacy_token" ] && pass "legacy account created" || fail "legacy registration" "$legacy_reg"

node -e "require('fs').writeFileSync(process.argv[1],Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))" "$IMAGE_FILE"
CURL_IMAGE_FILE="$IMAGE_FILE"
if command -v cygpath >/dev/null 2>&1; then
  CURL_IMAGE_FILE="$(cygpath -w "$IMAGE_FILE")"
fi
legacy_upload=$(curl -sS --connect-timeout 2 --max-time 10 -X POST "$legacy_base/api/images" -H "authorization: Bearer $legacy_token" \
  -F "file=@$CURL_IMAGE_FILE;type=image/png;filename=migration.png")
legacy_imgurl=$(printf '%s' "$legacy_upload" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).url||'')}catch{}})")
[ -n "$legacy_imgurl" ] && pass "legacy upload created" || fail "legacy upload" "$legacy_upload"

legacy_draft_body=$(node -e "process.stdout.write(JSON.stringify({mode:'markdown-card',schemaVersion:2,title:'Migration draft',document:{source:'# Migration draft\\n\\n![]('+process.argv[1]+')',images:{}}}))" "$legacy_imgurl")
legacy_draft=$(curl -sS --connect-timeout 2 --max-time 10 -X POST "$legacy_base/api/drafts" \
  -H 'content-type: application/json' -H "authorization: Bearer $legacy_token" -d "$legacy_draft_body")
legacy_draft_ok=$(printf '%s' "$legacy_draft" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).title==='Migration draft'?'true':'false')}catch{process.stdout.write('false')}})")
[ "$legacy_draft_ok" = true ] && pass "legacy draft created" || fail "legacy draft" "$legacy_draft"

echo "=== stop legacy stack without deleting volumes ==="
if docker compose -f "$LEGACY_COMPOSE_FILE" -p "$PROJECT" down --remove-orphans; then
  pass "legacy server/web containers removed"
else
  fail "legacy shutdown" "docker compose failed"
  exit "$FAIL"
fi
legacy_containers=$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")
[ -z "$legacy_containers" ] && pass "no legacy containers remain" || fail "legacy cleanup" "$legacy_containers"
if docker volume inspect "${PROJECT}_db" "${PROJECT}_uploads" >/dev/null 2>&1; then
  pass "legacy db/uploads volumes remain"
else
  fail "legacy volumes" "db or uploads volume is missing"
  exit "$FAIL"
fi

echo "=== start single app with migrated volumes ==="
if up_output=$(DINGCARD_VERSION="$SMOKE_VERSION" WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" up -d --no-build 2>&1); then
  printf '%s\n' "$up_output" | tail -4
else
  printf '%s\n' "$up_output" | tail -4
  fail "single app startup" "docker compose failed"
  exit "$FAIL"
fi

APP_ID=$(DINGCARD_VERSION="$SMOKE_VERSION" WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" ps -q app)
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

migration_login=$(curl -sS --connect-timeout 2 --max-time 10 -X POST "$base/api/auth/login" -H 'content-type: application/json' \
  -d '{"username":"migration","password":"1234"}')
migration_token=$(printf '%s' "$migration_login" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(s).token||'')}catch{}})")
[ -n "$migration_token" ] && pass "migrated account can log in" || fail "migrated account" "$migration_login"

migration_drafts=$(curl -sS --connect-timeout 2 --max-time 10 "$base/api/drafts" -H "authorization: Bearer $migration_token")
migration_draft_ok=$(printf '%s' "$migration_drafts" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const v=JSON.parse(s);process.stdout.write(v.some(d=>d.title==='Migration draft')?'true':'false')}catch{process.stdout.write('false')}})")
[ "$migration_draft_ok" = true ] && pass "migrated draft is readable" || fail "migrated draft" "$migration_drafts"

migration_image_code=$(curl -sS --connect-timeout 2 --max-time 10 -o /dev/null -w '%{http_code}' "$base$legacy_imgurl")
[ "$migration_image_code" = 200 ] && pass "migrated upload is readable" || fail "migrated upload" "HTTP $migration_image_code"

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
