# Readest Lite

> Single-container, self-hostable fork of [Readest](https://github.com/readest/readest) — Supabase + R2/S3 replaced with SQLite + local filesystem, Pro/paywall removed, signup disabled, per-user AES-GCM encrypted vault, quota enforce, proxy toggle.

[![CI](https://github.com/cshdotcom/readest-lite/actions/workflows/ci.yml/badge.svg)](https://github.com/cshdotcom/readest-lite/actions/workflows/ci.yml)
[![Docker](https://github.com/cshdotcom/readest-lite/actions/workflows/docker-image.yml/badge.svg)](https://github.com/cshdotcom/readest-lite/actions/workflows/docker-image.yml)
[![Version](https://img.shields.io/badge/version-v8.5.0-6c5ce7)](https://github.com/cshdotcom/readest-lite/releases)

🌐 **官网**：https://cshdotcom.github.io/readestl/
📚 **部署教程**：https://cshdotcom.github.io/readestl/deploy.html

## 快速开始

```bash
# 一条命令拉起
docker run -d \
  --name readest-lite \
  -p 8225:8225 \
  -v readest-data:/data \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=changeme \
  -e ADMIN_USERNAME=Admin \
  --restart unless-stopped \
  ghcr.io/cshdotcom/readest-lite:latest

# 30 秒后访问 http://localhost:8225
```

**请务必修改默认密码**，生产环境使用 16 位以上随机字符串。

## Docker Compose 部署（推荐）

```bash
git clone https://github.com/cshdotcom/readest-lite.git
cd readest-lite
cp .env.example .env
# 编辑 .env：设置 ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_USERNAME
docker compose up -d
```

详细配置见 [部署教程](https://cshdotcom.github.io/readestl/deploy.html)。

## 环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `ADMIN_EMAIL` | ✅ | — | 管理员邮箱，首次启动自动创建账号 |
| `ADMIN_PASSWORD` | ✅ | — | 管理员密码，建议 16+ 位随机字符 |
| `ADMIN_USERNAME` | 可选 | — | v8.1：管理员显示名 |
| `PORT` | 可选 | 8225 | 容器内监听端口 |
| `JWT_SECRET` | 可选 | 派生值 | JWT 签名密钥，不设时由 ADMIN_EMAIL+ADMIN_PASSWORD 派生 |
| `PUBLIC_BASE_URL` | 可选 | http://localhost:8225 | 对外访问 URL，反向代理场景下必填 |
| `DEEPL_ENABLED` | 可选 | false | 设为 true 启用 DeepL 翻译 |
| `DEEPL_FREE_API_KEYS` | 可选 | — | DeepL Free API key，逗号分隔 |
| `DEEPL_PRO_API_KEYS` | 可选 | — | DeepL Pro API key，逗号分隔 |
| `AI_GATEWAY_API_KEY` | 可选 | — | AI 聊天网关 key |

指定特定版本：`ghcr.io/cshdotcom/readest-lite:8.5.0`（每个版本都有对应 git tag）。

完整说明见 [部署教程 - 环境变量](https://cshdotcom.github.io/readestl/deploy.html#env)。

## v8.0 → v8.5 功能列表

| 版本 | 核心改动 |
|---|---|
| v7.0 | 多用户管理 · 远程书籍下载 · Edge TTS · 字体本地化 · DeepL 可选 |
| v8.0 | 所有翻译/词典代理强制登录 |
| v8.1 | 远程下载写 Book 表（修复书架不显示）· ADMIN_USERNAME env · 删除 WebSearchPopup |
| v8.2 | 代理开关 proxyEnabled · 全站 Readest Lite 品牌 · GET health check |
| v8.3 | 账号切换数据隔离（登出清空 library/settings/cursor） |
| v8.4 | Per-user 加密 vault（服务端托管密钥 + AES-GCM 加密 library/settings） |
| **v8.5** | **配额真正 enforce · 真实配额 UI · SSRF 黑名单 · fire-and-forget 下载** |

## 数据持久化

所有数据存储在容器 `/data` 目录：

```
data/
├── db/             SQLite 数据库（用户、书籍、进度、批注）
│   └── readest.db
├── books/          书籍文件
│   ├── uploads/    上传的电子书
│   └── covers/     自动生成的封面
├── inbox/          Send to Readest 入站文件
└── config.json     运行时配置（自动生成）
```

通过卷挂载（`-v ./data:/data` 或 `-v readest-data:/data`）确保容器重建不丢失。

## 安全模型（v8.4+）

```
登录：密码 → KE → 解密 K_enc → K → 解密本地 .enc 文件
活跃：K 在内存，library/settings 自动 AES-GCM 加密写盘
登出：清 K（内存），加密数据保留磁盘，K_enc 在服务端
切换：不同 userId → 不同 .enc 文件 → 天然隔离
改密码：admin 清 K_enc → 用户下次登录生成新 K
```

- 密码不存客户端
- 浏览器存储只有密文
- 跨账号数据彻底隔离

## What changed vs upstream

| 关注点 | 上游 Readest | Readest Lite |
|---|---|---|
| 数据库 | Supabase Postgres + RLS | SQLite via Prisma |
| 对象存储 | R2/S3 预签名 URL | 本地文件系统 + HMAC 签名 URL |
| 鉴权 | Supabase GoTrue（邮箱/OAuth/Magic Link） | 本地 JWT **多用户**系统，`/auth/v1/*` 兼容 shim |
| Pro/付费 | Stripe + Apple IAP + Google IAP | 完全删除，所有功能无条件开放 |
| 注册 | 开放 | 禁用 — 管理员通过用户管理面板创建用户 |
| 数据加密 | — | v8.4：Per-user AES-GCM 加密 vault |
| 配额 | Pro 体系限制 | v8.5：管理员分配配额，真正 enforce |
| 代理 | 直连 | v8.2：服务器代理 + 用户可关代理走直连 |
| 同步协议 | — | 1:1 复刻（books/configs/notes/stats + CRDT replicas） |
| 分享协议 | — | 1:1 复刻（create/list/import/revoke/download/cover/og） |
| 阅读器内核 | foliate-js | 完全一致（零改动） |

## 文档

- 🌐 [官网](https://cshdotcom.github.io/readestl/)
- 📚 [部署教程](https://cshdotcom.github.io/readestl/deploy.html) — 完整部署指南
- 🔧 [迭代提示词](https://cshdotcom.github.io/readestl/aph.html) — AI 维护交接（隐藏页面）
- 📄 [DEPLOY.md](./DEPLOY.md) — 部署细节与验证
- 📝 [FRONTEND_CHANGES.md](./FRONTEND_CHANGES.md) — 前端改造清单
- 🗂️ [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) — 改造后目录结构
- 📦 [CHANGELOG.md](./CHANGELOG.md) — 详细变更日志

## 架构

```
┌──────────────────────────────────────────────────────────┐
│ Browser (Next.js web app, port 8225)                     │
│  └── utils/supabase.ts → pseudo client → /auth/v1/*      │
│  └── context/VaultContext → AES-GCM key (in-memory)      │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Next.js standalone server (single container)             │
│  ├── /auth/v1/*           — Supabase Auth compat shim    │
│  ├── /auth/v1/vault-key   — v8.4: encrypted vault key    │
│  ├── /api/sync            — books/configs/notes/stats    │
│  ├── /api/sync/replicas   — CRDT replicas (HLC merge)    │
│  ├── /api/storage/*       — files + HMAC-signed PUT/GET  │
│  ├── /api/usage           — v8.5: quota usage             │
│  ├── /api/share/*         — book shares + OG image       │
│  ├── /api/admin/users     — v7: multi-user management    │
│  ├── /api/translate/google— v8: proxy + v8.5: enforce    │
│  ├── /api/proxy/{wiki,resource} — v8.5: SSRF blacklist   │
│  ├── /api/books/download-url — v8.1: remote download     │
│  ├── /api/deepl/translate — v8.5: quota enforce           │
│  └── /api/{ai,tts,metadata,opds,hardcover,kosync}        │
└──────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────┐       ┌──────────────────────────┐
│ SQLite (Prisma)     │       │ Local filesystem         │
│  /data/db/readest.db│       │  /data/books/uploads/    │
│  14 tables +        │       │  /data/books/covers/     │
│  User.encryptedVaultKey│    │  /data/inbox/            │
└─────────────────────┘       └──────────────────────────┘
```

## 升级

```bash
docker compose pull      # 拉取最新镜像
docker compose up -d     # 重建容器（数据在 ./data 不受影响）
docker image prune -f    # 清理旧镜像
```

启动时自动检测数据库版本并执行迁移，无需手动操作。SQLite 自动迁移、数据卷持久化，旧数据无损。

## License

Inherited from upstream Readest — see [LICENSE](./LICENSE).
