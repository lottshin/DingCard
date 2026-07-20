#!/usr/bin/env bash
# 全栈冒烟:起 compose 全套(前端 Nginx + 后端 + 卷),在栈活着时一次性验证
# 首页 / API 反代 / 图片上传+经 Nginx 直出(跨容器共享卷),最后无条件清理。
#
# 用完整链路证明部署可用。不留残留:EXIT 陷阱保证任何情况下都 down -v。
#
# 用法: bash deploy/compose-smoke.sh
set -u

PROJECT="${COMPOSE_SMOKE_PROJECT:-dinka-smoke}"
WEB_PORT="${COMPOSE_SMOKE_WEB_PORT:-8093}"
ENV_FILE="$(mktemp)"
HOME_BODY_FILE="$(mktemp)"
HEALTH_BODY_FILE="$(mktemp)"
IMAGE_FILE="$(mktemp)"
FAIL=0

# 临时测试用环境(密钥仅用于本次冒烟,不落仓库)。
cat >"$ENV_FILE" <<'EOF'
JWT_SECRET=compose-smoke-secret-not-for-prod
EOF

cleanup() {
  echo "=== 清理 ==="
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" down -v --remove-orphans >/dev/null 2>&1
  rm -f "$ENV_FILE" "$HOME_BODY_FILE" "$HEALTH_BODY_FILE" "$IMAGE_FILE" 2>/dev/null
  echo "已清理"
}
trap cleanup EXIT

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1  <-- $2"; FAIL=1; }

echo "=== build + up ==="
WEB_PORT="$WEB_PORT" docker compose -p "$PROJECT" --env-file "$ENV_FILE" up -d --build 2>&1 | tail -4

base="http://127.0.0.1:${WEB_PORT}"
ready=0
echo "=== 等首页和 API 就绪(最多 60 秒) ==="
for i in $(seq 1 60); do
  home_code=$(curl -sS --max-time 2 -o "$HOME_BODY_FILE" -w '%{http_code}' "$base/" 2>/dev/null || echo 000)
  health_code=$(curl -sS --max-time 2 -o "$HEALTH_BODY_FILE" -w '%{http_code}' "$base/api/health" 2>/dev/null || echo 000)
  health_ok=$(node -e "try{const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(v.ok===true?'true':'false')}catch{process.stdout.write('false')}" "$HEALTH_BODY_FILE")
  echo "  $i: home=$home_code api=$health_code ok=$health_ok"
  if [ "$home_code" = 200 ] && grep -q '<div id="root">' "$HOME_BODY_FILE" \
    && [ "$health_code" = 200 ] && [ "$health_ok" = true ]; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" = 1 ] \
  && pass "首页与 /api/health 在 60 秒内就绪" \
  || fail "首页/API 就绪" "home=$home_code api=$health_code body=$(cat "$HEALTH_BODY_FILE" 2>/dev/null)"

# 1) 注册经 /api 反代
reg=$(curl -s -X POST "$base/api/auth/register" -H 'content-type: application/json' \
  -d '{"username":"smoke","password":"1234"}')
token=$(printf '%s' "$reg" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{console.log(JSON.parse(s).token||'')}catch{console.log('')}})")
[ -n "$token" ] && pass "注册经 /api 反代拿到 token" || fail "注册" "$reg"

# 2) 上传图片经 web->server,写入 uploads 卷
node -e "require('fs').writeFileSync(process.argv[1],Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))" "$IMAGE_FILE"
CURL_IMAGE_FILE="$IMAGE_FILE"
if command -v cygpath >/dev/null 2>&1; then
  CURL_IMAGE_FILE="$(cygpath -w "$IMAGE_FILE")"
fi
up=$(curl -s -X POST "$base/api/images" -H "authorization: Bearer $token" \
  -F "file=@$CURL_IMAGE_FILE;type=image/png;filename=smoke.png")
imgurl=$(printf '%s' "$up" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{console.log(JSON.parse(s).url||'')}catch{console.log('')}})")
[ -n "$imgurl" ] && pass "上传经 /api 反代 (url=$imgurl)" || fail "上传" "$up"

# 3) 关键:后端写的图片,Nginx 能否经只读共享卷直出
if [ -n "$imgurl" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$base$imgurl")
  [ "$code" = 200 ] && pass "图片经 Nginx 直出 (跨容器共享卷 200)" || fail "图片直出" "HTTP $code"
fi

# 诊断信息(无论成败都抓,栈此刻还活着)
echo "=== 后端 maxUploadBytes 实际值 ==="
docker exec "${PROJECT}-server-1" node -e "import('./src/config.js').then(m=>console.log(m.config.maxUploadBytes))" 2>&1 | tail -1

echo "=== 后端日志尾部 ==="
docker logs "${PROJECT}-server-1" 2>&1 | tail -6

echo ""
[ "$FAIL" = 0 ] && echo "ALL PASSED" || echo "SOME FAILED"
exit $FAIL
