# Readest Lite — 迭代提示词（v8.18.4）

> 这是 Readest Lite 的「持续迭代提示词」。每次新对话开始时把它丢给助手，能让助手
> 快速进入「Lite 维护者」上下文，避免每次都重复解释 Lite 与上游 Readest 的区别。

## 项目定位

**Readest Lite** = 上游 [Readest](https://github.com/readest/readest) 的自托管单容器分支。

### Lite 与上游的核心差异（绝不改回上游）

- **存储**：`local` 文件系统（不是 R2/S3）
- **数据库**：SQLite via Prisma（不是 Postgres + Supabase）
- **认证**：本地 JWT + 邮箱密码（不是 Supabase Auth/OAuth）
- **支付**：移除 — 所有用户视为 `Pro` 计划（无限配额）
- **Cloud sync**：WebDAV / S3 / GoogleDrive / OneDrive / iCloud 都是 stub
- **Native-only 功能**：ABS / LocalSend / Yomitan / Wordlens / Nix / Audiobook pairing 都是 stub
- **品牌**：所有用户可见字符串必须是「Readest Lite」，不是「Readest」

## Lite 自定义文件（绝对不能被上游同步覆盖盖）

```
apps/readest-app/src/services/appService.ts        # BaseAppService
apps/readest-app/src/services/constants.ts         # DEFAULT_SYSTEM_SETTINGS (Lite 默认值)
apps/readest-app/src/services/environment.ts       # getBaseUrl 用相对路径
apps/readest-app/src/services/runtimeConfig.ts     # 相对 URL 而非烤死的 localhost
apps/readest-app/src/types/{book,settings,system}.ts # 类型扩展
apps/readest-app/src/store/{libraryStore,readerStore}.ts
apps/readest-app/src/context/{AuthContext,VaultContext,PHContext}.tsx
apps/readest-app/src/app/library/page.tsx
apps/readest-app/src/app/library/components/{LibraryHeader,ImportMenu}.tsx
apps/readest-app/src/components/{AboutWindow,Quota,Providers,Landing}.tsx
apps/readest-app/src/services/translators/providers/google.ts  # 走 /api/translate/google
apps/readest-app/src/services/dictionaries/providers/{wikipedia,wiktionary}Provider.ts
apps/readest-app/src/services/dictionaries/chineseDict.ts      # 走 fetchViaWikiProxy
apps/readest-app/src/utils/{access,localStorage,db,localAuth,supabase,vaultState,proxy}.ts
apps/readest-app/src/utils/book.ts                  # getRemoteBookFilename (local 分支)
apps/readest-app/src/libs/storage.ts                # 相对 URL + requestOrigin
apps/readest-app/src/libs/shareServer.ts             # feed:// 书籍分享
apps/readest-app/src/libs/errors.ts                  # isWrongPassphraseError
apps/readest-app/src/libs/crypto/session.ts          # invalidatePassphrase
apps/readest-app/src/services/cloudService.ts       # feed:// 上传/下载 short-circuit
apps/readest-app/src/services/sync/cloudSyncActivation.ts # stub
apps/readest-app/src/services/sync/providers/{gdrive,onedrive}/...Connect.ts
apps/readest-app/src/store/{absServerStore,localsendStore}.ts
apps/readest-app/src/services/audiobook/*           # 全部 stub
apps/readest-app/src/services/localsend/*           # 全部 stub
apps/readest-app/src/services/dictionaries/plugins/*  # 全部 stub
apps/readest-app/src/services/sync/adapters/absServer.ts  # ReplicaAdapter 实现
apps/readest-app/src/services/sync/replicaCryptoMiddleware.ts # 上游版本
apps/readest-app/src/services/sync/passphraseGate.ts # 上游版本
apps/readest-app/src/libs/statsArchive.ts           # stub
apps/readest-app/src/types/{audiobookshelf,bookorbit,payment,webSource}.ts
apps/readest-app/src/components/localsend/LocalSendManager.tsx # 渲染 null
apps/readest-app/src/components/settings/integrations/{ABSForm,LocalSendForm,cloudSync}.tsx
apps/readest-app/src/app/reader/components/audiobook/AudiobookPairingDialog.tsx # 渲染 null
apps/readest-app/src/services/sync/providers/gdrive/googleDriveConnect.ts
apps/readest-app/src/services/sync/providers/onedrive/{onedriveConnect,webAuthCodeFlow}.ts
apps/readest-app/src/services/rss/favicon.ts       # v8.18.3 favicon 自动识别
apps/readest-app/src/services/rss/feedBook.ts       # v8.18.3 favicon 嵌入封面
apps/readest-app/src/app/library/components/RemoteDownloadDialog.tsx # v8.18.3 移除 Advanced Options
apps/readest-app/src/app/library/components/ShareBookDialog.tsx # v8.18.4 永久+日历
apps/readest-app/src/pages/api/storage/delete.ts   # v8.18.4 自动 revoke shares
apps/readest-app/src/pages/api/settings/{index,save}.ts # v8.18.4 加密设置同步
```

## 关键设计决策

### 1. 签名 URL 必须用相对 URL

`utils/localStorage.ts` 的 `getStorageBase()` 默认返回 `''`，让 buildPutUrl/buildGetUrl
输出 `/api/storage/_put?...` 这样的相对 URL。浏览器自动按当前页面 origin 解析，无论用户
从 `localhost` / IP / 域名访问都正确。

需要绝对 URL 的场景（如 `NextResponse.redirect`）由调用方传入 `requestOrigin`，从
请求 URL `new URL(request.url).origin` 派生。

**绝对不要**改回 `http://127.0.0.1:8225` 或烤死的 localhost — 浏览器无法访问容器内地址。

### 2. getRemoteBookFilename 必须返回非空

`utils/book.ts` 的 `local` 分支必须返回 `<hash>/<safe-title>.<ext>`，绝对不能返回 `''`。
返回空字符串会让 cloud path `cfp = 'Readest/Books/'` 出现空段，被 `isSafeObjectKeyName`
拒绝（'Invalid fileName'），同时上传写入的 `fileKey` 缺少文件名段，下载请求对不上 → 'File not found'。

### 3. 中文文件名安全

`utils/misc.ts` 的 `makeSafeFilename()` 已正确处理 Windows 保留字符、控制字符、超过 250 字节等。
不要在 `getRemoteBookFilename` 里再 escape 一次 — 双重 escape 会让签名 URL 不匹配。

### 4. 代理路由必须强制登录

- `/api/proxy/wiki`
- `/api/proxy/resource`
- `/api/translate/google`

这三个端点全部调用 `validateUserAndToken(authHeader)`，未登录返回 401。
**永远不要**为方便测试而改成 `optional auth` — 公开代理会被滥用为 SSRF 跳板。

### 5. feed:// 书籍同步

`uploadBook()` 在 `cloudService.ts` 中检测到 `book.url.startsWith('feed://')` 时跳过 blob 上传，
只上传封面 + 标记为已上传。`downloadBook()` 同理。这样 RSS 订阅能跟普通书一样走自动同步。

### 6. feed:// 书籍分享 — 接收方独立，owner 删除自动失效

**关键**：接收方 import 后是**完全独立**的副本 — 字节级复制到接收方命名空间
（`<recipientUid>/Readest/...`）+ 独立 DB row。原 owner 删除自己的书**不影响**接收方的副本。

- `shareServer.ts` 的 `resolveActiveShare` 检测到 `bookUrl.startsWith('feed://')` 时
  不要求 `bookFile`（cover 仍可上传），返回 `isFeedBook: true` + descriptor URL
- `share/create/route.ts` 在 `bookUrl` 为 feed:// 时跳过 file lookup，直接创建「无文件分享」
- `share/[token]/download/route.ts` 在 `isFeedBook` 时返回 descriptor JSON 而非文件 redirect
- `share/[token]/import/route.ts` 在 `isFeedBook` 时只复制 cover 到接收方命名空间，
  返回 descriptor 让接收方客户端重建订阅

**ACL 安全**：owner 删除书籍时，`pages/api/storage/delete.ts` 自动 revoke 该
`(userId, bookHash)` 的所有活跃 BookShare 行（`revokedAt = now()`）。接收方访问已 revoke
的分享链接时返回 410 `revoked`。

接收方已保存的副本不受影响 — 字节级复制后是独立 owner 的独立 row，
原 owner 的 file 删除不会级联到接收方的 file。

### 7. 分享过期时间 — 永久 + 自定义日历

`ShareBookDialog.tsx` 的「Expires in」选项：
- `[1, 3, 7]` 天 — 预设
- `Permanent` (expirationDays=0) — 服务端把 expiresAt 设为 9999-12-31
- `Custom` (expirationDays=-1) — 弹出 `<input type='date'>` 日历选择器，
  客户端计算天数（1-365）传给服务端

服务端 API 已支持 `expirationDays` 0 (永久) 和 1-365 任意整数。

### 8. 加密设置同步（v8.18.4 新增）

`UserSetting` 表（migration `016_user_settings.sql`）存储每个用户的：
- `scope = 'system'` — SystemSettings（KOSync、Readwise、OPDS、proxy 等）
- `scope = 'global_view'` — globalViewSettings（字体大小、主题、布局）
- `scope = 'global_read'` — globalReadSettings（翻页、自动滚动、TTS 等）

`encryptedPayload` = base64(JSON(CipherEnvelope))，用密码派生的 AES 密钥加密。
服务端只存密文，不解密 — 跨设备同步时其他设备 GET 后在客户端解密。

API：
- `GET /api/settings?scope=system` — 取最新密文
- `PUT /api/settings?scope=system` — 上传密文（upsert）

**安全**：服务端无法读取用户设置内容，只做存储转发。

### 9. 批量下载 URL 输入框语法

`RemoteDownloadDialog.tsx` 的「批量下载」tab 没有「Advanced Options」全局配置。
每个 URL 行自带指令：`URL | cookie:VALUE | header:Key: VALUE`。
绝对不要为「方便」加回全局 Cookies/Headers 输入框 — 那会让用户混淆「全局 vs per-URL」。

### 10. RSS 订阅源封面 — 自动识别站点 favicon

`services/rss/favicon.ts` 的 `fetchFeedFavicon()` 按以下顺序查找：
1. 站点 HTML `<link rel="icon" type="image/svg+xml">`
2. `<link rel="icon">`（任意类型）
3. `<link rel="apple-touch-icon">`
4. `<link rel="shortcut icon">`
5. `/favicon.ico`

走 `isProxyEnabled()` 时通过 `/api/proxy/resource` 服务端代理获取（绕过 GFW），
超时 5 秒。失败时回退到默认的 RSS 橙色图标，不影响订阅。

`feedBook.ts` 的 `ensureFeedBookCover()` 在生成 SVG 封面时把 favicon 作为 avatar 嵌入。

### 11. 删除文章批注点击的优雅降级

`BooknoteItem.handleClickItem` 用 try/catch 包住 `goTo(cfi)`。RSS 文章被删除但批注
仍在 config.json 时，跳转失败 → 显示 toast「The highlighted location is no longer
available in this book.」而不是让面板崩溃。

### 12. 阅读统计清除

`DELETE /api/usage/stats` 删除当前用户的 `StatPage` + `UsageStat` 行（需 Bearer auth）。
Danger Zone 中的「Clear Reading Statistics」按钮触发此 API。
书籍、进度、批注不受影响。

## 后端安全清单

所有 API 路由（`/api/*`）必须满足：

1. **认证**：`validateUserAndToken(authHeader)` → 401 when unauthenticated
2. **方法白名单**：开头判断 `req.method`，未知方法返回 405
3. **CORS**：`runMiddleware(req, res, corsAllMethods)` 或 `corsAllMethods`
4. **输入校验**：`trimText(value, max)` 限长 + 拒绝控制字符
5. **用户隔离**：所有 DB 查询 `where: { userId, ... }` 不能跨用户读
6. **SSRF 防护**：代理路由 `isPrivateHost()` 拒绝 localhost / 10.x / 172.16-31 / 192.168 / metadata
7. **配额**：`storageQuotaMB` / `translationQuotaKB` > 0 时按用户累计
8. **签名 URL TTL**：upload 1800s / download 1800s / share 视场景
9. **分享自动 revoke**：删除 file 时 `bookShare.updateMany` 撤销同 bookHash 的活跃分享

## CI 失败排查清单

CI 通常在 7-10 分钟内跑完。如果失败，按以下顺序查：

1. `Module not found` — 缺 stub 文件，看具体路径 → 新建空 stub
2. `error TS2xxx: Property 'xxx' does not exist on type 'Book'` — 上游加了字段，
   Lite 类型同步加（看 `apps/readest-app/src/types/book.ts` / `settings.ts`）
3. `error TS4113: cannot have an 'override' modifier` — 上游加了方法但 Lite
   BaseAppService 没有，把 `override` 删掉或加抽象方法
4. `error TS2345: Argument of type 'X' is not assignable to 'Y'` — 类型签名变化，
   看 `import` 是否上游覆盖了 Lite 自定义文件
5. `error TS2307: Cannot find module '@/...'` — 检查 `tsconfig.json` paths 别名
6. `Build failed because of webpack errors` — 通常是上面的 TS 错误导致 webpack 退出
7. `error TS6133: 'xxx' is declared but its value is never read` — noUnusedLocals
   严格模式，删掉未使用的变量或加 `_` 前缀

## Dockerfile OOM

`Dockerfile` 必须有 `ENV NODE_OPTIONS=--max-old-space-size=4096`，否则 Next.js 在
多语言 i18n 包 + foliate-js 编译时容易 OOM。

## 测试原则

- **绝不**为「让 TS 通过」而删掉 Lite 自定义文件的导出
- **绝不**用 `// @ts-ignore` 屏蔽类型错误 — 上游类型变就是真的变了，要修
- **绝不**回退到 `http://127.0.0.1:8225` 这种烤死 localhost 的 URL

## 版本管理

- 主版本号 `8.x.y` — Lite 版本号，与上游 `0.x.y` 解耦
- 每次 PR/修复 → bump patch（x.y.Z）
- 每次新增上游功能 → bump minor（x.Y.0）
- 大破坏性变更（schema 不兼容）→ bump major（X.0.0）

## 文档清单（每次迭代后检查更新）

- `README.md` — 版本徽章
- `CHANGELOG.md` — 新版本条目（用户视角的「修了什么」）
- `apps/readest-app/package.json` — `version` 字段
- `apps/readest-app/public/locales/zh-CN/translation.json` — 所有新字符串的中文翻译
- `ITERATION_PROMPT.md` — 更新设计决策 + Lite 自定义文件清单
- GitHub Release + tag（v8.x.y）+ GHCR image 自动构建

## 数据库 Migration 清单

每次 schema 变更都要：
1. 修改 `prisma/schema.prisma`
2. 在 `docker/volumes/db/migrations/` 加 `NNN_xxx.sql`
3. 容器启动时自动跑 migration（无需手动操作）
4. 已有 migration 不可修改（防止生产环境数据不一致）
