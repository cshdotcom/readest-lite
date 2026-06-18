# Readest Lite — 部署与验证文档

## 1. 准备工作

### 1.1 系统要求

- Docker 24+
- Docker Compose v2+
- 至少 1GB 可用磁盘空间（数据库 + 书籍存储）

### 1.2 获取代码

```bash
git clone https://github.com/cshdotcom/readest-lite.git
cd readest-lite
```

> **注意**：本仓库不再依赖 Git submodule。原 readest 项目的 `packages/foliate-js`、`packages/simplecc-wasm` 等是 submodule，但本仓库的 `Dockerfile` 已改为在构建时直接 `git clone --depth 1` 这两个 web 构建必需的子模块，所以 `git clone` 时**不需要** `--recursive` 参数。

### 1.3 配置环境变量

```bash
cp .env.example .env
```

**必填项**（编辑 `.env`）：

```bash
# 管理员账号
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=YourStrongPassword123!

# JWT 密钥（必须 32+ 字符，强烈建议随机）
JWT_SECRET=$(openssl rand -hex 32)  # 在 shell 中执行后填回
```

**可选配置**：

```bash
# DeepL 翻译（不配置则翻译功能不可用）
DEEPL_FREE_API_KEYS=your-free-key:fx
DEEPL_PRO_API_KEYS=your-pro-key

# AI Gateway（不配置则 AI 聊天不可用）
AI_GATEWAY_API_KEY=your-key
```

## 2. 启动

### 2.1 Docker Compose（推荐）

```bash
docker compose up -d --build
```

首次构建约 5-10 分钟（包含 pnpm install + Next.js build + Prisma generate）。

### 2.2 直接 Docker

```bash
docker build -t readest-lite .
docker run -d \
  --name readest-lite \
  -p 8225:8225 \
  --env-file .env \
  -v readest_data:/data \
  readest-lite
```

### 2.3 查看启动日志

```bash
docker logs -f readest-lite
```

预期输出：

```
[entrypoint] initializing SQLite database...
[entrypoint] ensuring admin user...
[init] admin user created: your-email@example.com (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
[init] done.
[entrypoint] starting Next.js on port 8225...
▲ Next.js 16.x
- Local: http://0.0.0.0:8225
✓ Ready in 2.3s
```

## 3. 验证

### 3.1 基础访问

```bash
curl http://localhost:8225/
# 应返回登录页 HTML
```

### 3.2 登录测试

```bash
# 获取 access_token
TOKEN=$(curl -s http://localhost:8225/auth/v1/token?grant_type=password \
  -H "Content-Type: application/json" \
  -H "apikey: anon" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | jq -r .access_token)

echo "Token: $TOKEN"
```

### 3.3 验证同步 API

```bash
# 拉取初始同步数据
curl -s "http://localhost:8225/api/sync?since=0" \
  -H "Authorization: Bearer $TOKEN" | jq .
# 预期：{"books":[{"id":"0000...","book_hash":"0000...",...}],"configs":[],"notes":[],"statBooks":[],"statPages":[]}

# 推送一本书
curl -s -X POST "http://localhost:8225/api/sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"books":[{"hash":"test123","metaHash":"meta123","format":"EPUB","title":"Test Book","author":"Author","createdAt":1700000000000,"updatedAt":1700000000000}]}'
# 预期：{"books":[...],"configs":[],"notes":[]}
```

### 3.4 验证存储 API

```bash
# 申请上传 URL
UPLOAD_RESP=$(curl -s -X POST "http://localhost:8225/api/storage/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"Readest/Books/test.epub","fileSize":1024,"bookHash":"test123"}')

UPLOAD_URL=$(echo "$UPLOAD_RESP" | jq -r .uploadUrl)
FILE_KEY=$(echo "$UPLOAD_RESP" | jq -r .fileKey)
echo "Upload URL: $UPLOAD_URL"
echo "File Key: $FILE_KEY"

# 实际上传文件（模拟客户端 PUT）
echo "test content" | curl -s -X PUT "$UPLOAD_URL" --data-binary @-
# 预期：{"ok":true}

# 申请下载 URL
DOWNLOAD_URL=$(curl -s "http://localhost:8225/api/storage/download?fileKey=$FILE_KEY" \
  -H "Authorization: Bearer $TOKEN" | jq -r .downloadUrl)

# 下载文件
curl -s "$DOWNLOAD_URL"
# 预期：test content
```

### 3.5 验证分享功能

```bash
# 创建分享
SHARE_RESP=$(curl -s -X POST "http://localhost:8225/api/share/create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bookHash":"test123","expirationDays":7,"title":"Test Book","format":"EPUB"}')

SHARE_TOKEN=$(echo "$SHARE_RESP" | jq -r .token)
echo "Share URL: http://localhost:8225/s/$SHARE_TOKEN"

# 公开访问分享元数据（无需 token）
curl -s "http://localhost:8225/api/share/$SHARE_TOKEN" | jq .
# 预期：{"title":"Test Book","author":null,"format":"EPUB","size":1024,...}

# 撤销分享
curl -s -X POST "http://localhost:8225/api/share/$SHARE_TOKEN/revoke" \
  -H "Authorization: Bearer $TOKEN"
# 预期：204 No Content

# 再次访问应返回 410
curl -s "http://localhost:8225/api/share/$SHARE_TOKEN"
# 预期：{"error":"Share has been revoked","code":"revoked"}
```

### 3.6 验证 Supabase Auth 兼容性

```bash
# supabase-js 启动时会拉 settings
curl -s "http://localhost:8225/auth/v1/settings" | jq .
# 预期：{"external":{"email":false,"phone":false},"disable_signup":true,...}

# 获取当前用户
curl -s "http://localhost:8225/auth/v1/user" \
  -H "Authorization: Bearer $TOKEN" | jq .user.email
# 预期："your-email@example.com"

# 刷新 token
REFRESH=$(curl -s "http://localhost:8225/auth/v1/token?grant_type=password" \
  -H "Content-Type: application/json" -H "apikey: anon" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r .refresh_token)

curl -s -X POST "http://localhost:8225/auth/v1/token?grant_type=refresh_token" \
  -H "Content-Type: application/json" -H "apikey: anon" \
  -d "{\"refresh_token\":\"$REFRESH\"}" | jq .access_token
# 预期：新 token 字符串

# 注册应被拒绝
curl -s -X POST "http://localhost:8225/auth/v1/signup" \
  -H "Content-Type: application/json" -H "apikey: anon" \
  -d '{"email":"new@example.com","password":"123"}' -w "\n%{http_code}\n"
# 预期：403 + {"error_code":"signup_disabled",...}
```

### 3.7 浏览器端验证

1. 打开 `http://localhost:8225`
2. 应跳转到 `/auth`，仅显示邮箱密码表单（无社交登录、无注册链接）
3. 用 ADMIN_EMAIL / ADMIN_PASSWORD 登录
4. 跳转到 `/library`
5. 上传一本 EPUB → 应能打开阅读
6. 修改阅读进度 → 刷新页面 → 进度保留
7. 设置菜单中无 "Upgrade to Readest Premium" 项
8. 进入 `/user` 页面：无方案对比卡片，无 Checkout 组件
9. 翻译一段文字：不报配额错误
10. 创建分享链接 → 复制到另一个浏览器（无登录）→ 应能看到分享落地页

## 4. 数据备份

### 4.1 数据卷位置

- `/data/db/readest.db` — SQLite 数据库
- `/data/books/` — 所有书籍文件 + 封面
- `/data/inbox/` — Send to Readest 入站文件

### 4.2 备份命令

```bash
# 完整备份
docker run --rm -v readest_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/readest-backup-$(date +%Y%m%d).tar.gz /data

# 仅备份数据库
docker cp readest-lite:/data/db/readest.db ./readest-$(date +%Y%m%d).db
```

### 4.3 恢复

```bash
docker stop readest-lite
docker run --rm -v readest_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/readest-backup-20260101.tar.gz -C /
docker start readest-lite
```

## 5. 升级

### 5.1 拉取新镜像

```bash
docker compose pull
docker compose up -d
```

容器启动时 `prisma db push` 会自动同步 schema（如有变更）。**数据库数据不会丢失**。

### 5.2 修改管理员密码

编辑 `.env` 中的 `ADMIN_PASSWORD`，然后：

```bash
docker compose restart
```

启动脚本会检测到密码变化并更新数据库中的管理员密码。

## 6. 故障排查

### 6.1 容器启动失败

```bash
docker logs readest-lite 2>&1 | tail -50
```

常见问题：

| 错误 | 解决方案 |
|---|---|
| `ADMIN_EMAIL and ADMIN_PASSWORD must be set` | 检查 .env 文件 |
| `Prisma schema validation error` | 检查 prisma/schema.prisma 是否完整 |
| `EADDRINUSE :::8225` | 端口被占用，修改 docker-compose.yml 端口映射 |
| `argon2: cannot find module` | Dockerfile 中 argon2 拷贝路径错误，检查 build stage |

### 6.2 登录失败

```bash
# 验证 admin 账号是否创建成功
docker exec readest-lite sqlite3 /data/db/readest.db \
  "SELECT id, email FROM User;"
```

### 6.3 同步不工作

```bash
# 检查 token 是否有效
curl -s "http://localhost:8225/auth/v1/user" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 如果返回 401，说明 token 过期，需要重新登录
```

### 6.4 文件上传失败

```bash
# 检查 /data/books 是否可写
docker exec readest-lite ls -la /data/books/

# 检查签名 URL 是否能解析
docker exec readest-lite sqlite3 /data/db/readest.db \
  "SELECT id, fileKey, fileSize FROM File LIMIT 10;"
```

## 7. 性能调优

### 7.1 SQLite WAL 模式

默认 Prisma 已启用 WAL 模式，提升并发读写性能。如需确认：

```bash
docker exec readest-lite sqlite3 /data/db/readest.db "PRAGMA journal_mode;"
# 预期：wal
```

### 7.2 数据库大小

```bash
docker exec readest-lite du -sh /data/db/
# 单用户场景，10万本书 + 100万条笔记 ≈ 200-500MB
```

### 7.3 文件存储大小

```bash
docker exec readest-lite du -sh /data/books/
```

## 8. GitHub Actions 部署

### 8.1 自动构建（已配置）

仓库已自带两个 workflow：

- `.github/workflows/ci.yml` — 每次 push 到 main/master 时构建 Docker 镜像 + 跑容器启动 smoke test
- `.github/workflows/docker-image.yml` — push 到 main/master 或打 `v*` tag 时构建并推送镜像到 GHCR

**CI 不需要任何 secret 配置**：`GITHUB_TOKEN` 是 Actions 自动提供的，用于推送 GHCR。

### 8.2 触发镜像构建

```bash
# 推送到 main 分支自动构建（tag: ghcr.io/<owner>/readest-lite:main）
git push origin main

# 打 tag 触发版本镜像
git tag v0.1.0
git push origin v0.1.0
# 产出：
#   ghcr.io/<owner>/readest-lite:0.1.0
#   ghcr.io/<owner>/readest-lite:0.1
#   ghcr.io/<owner>/readest-lite:sha-<commit>
```

### 8.3 从 GHCR 拉取运行

构建成功后：

```bash
docker pull ghcr.io/cshdotcom/readest-lite:main

docker run -d \
  --name readest-lite \
  -p 8225:8225 \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=YourPassword123! \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v readest_data:/data \
  ghcr.io/cshdotcom/readest-lite:main
```

### 8.4 本地 Docker 构建（无 GitHub Actions）

```bash
git clone https://github.com/cshdotcom/readest-lite.git
cd readest-lite
cp .env.example .env
# 编辑 .env 设置 ADMIN_EMAIL/ADMIN_PASSWORD/JWT_SECRET
docker compose up -d --build
```

Dockerfile 会自动 `git clone --depth 1` 需要的 foliate-js 与 simplecc-wasm 子模块，**不依赖**外部 `git submodule update --init`。

## 9. 安全建议

1. **修改默认 JWT_SECRET**：使用 `openssl rand -hex 32` 生成
2. **使用强管理员密码**：至少 16 字符，包含大小写字母、数字、符号
3. **反向代理 + HTTPS**：生产环境强烈建议在前面加 Nginx/Caddy 做 TLS 终止
4. **限制访问**：单账号模式没有 RLS，任何人拿到 token 都能访问所有数据；务必保护好管理员凭证
5. **定期备份**：至少每天备份一次 /data 卷

## 10. 与原版差异说明

| 功能 | 原版 | Lite 版 |
|---|---|---|
| 注册 | 邮箱/社交登录/OAuth | 完全禁用，仅一个管理员 |
| Pro/免费方案 | 4 套（free/plus/pro/purchase） | 单一 pro，所有功能无条件开放 |
| 支付 | Stripe + Apple IAP + Google IAP | 完全删除 |
| 配额 | 500MB/5GB/20GB | 无限 |
| 数据库 | Postgres + Supabase RLS | SQLite（单用户无需 RLS） |
| 对象存储 | R2/S3 + 预签名 URL | 本地文件系统 + HMAC 签名 URL |
| 邮件入站 | Cloudflare Email Worker | 不支持（API 保留） |
| 同步协议 | 完全一致 | 完全一致（1:1 复刻） |
| 分享 | 完全一致 | 完全一致（1:1 复刻） |
| 阅读器内核 | foliate-js | 完全一致（零改动） |
| AI/TTS/翻译 | 完全一致 | 完全一致（透传） |
