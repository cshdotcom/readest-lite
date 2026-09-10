# Readest Lite — 迭代提示词（v8.22.2）

> 这是 Readest Lite 的「持续迭代提示词」。每次新对话开始时把它丢给助手，能让
> 助手快速进入「Lite 维护者」上下文，避免每次都重复解释 Lite 与上游 Readest
> 的区别、为什么某个文件不能改、为什么某个 URL 必须是相对路径，等等。本文档
> 涵盖从 v8.0 到 v8.22.2 的所有设计决策、迁移、API 端点和 Lite 自定义文件。

## 项目定位

**Readest Lite** = 上游 [Readest](https://github.com/readest/readest) 的自托管
单容器分支。原版依赖 Supabase + R2 + Stripe，Lite 把这些全部替换成自托管组件：
SQLite via Prisma + 本地文件系统 + JWT 邮箱密码 + 移除支付（所有用户视为 Pro）。

### Lite 与上游的核心差异（绝不改回上游）

- **存储**：`local` 文件系统（不是 R2/S3）。`utils/object.ts` 重新导出
  `localStorage.ts`，签名 URL 走 HMAC-SHA256，TTL 1800 秒。
- **数据库**：SQLite via Prisma（不是 Postgres + Supabase）。容器启动时
  `prisma db push` 自动建表 + 跑 `docker/volumes/db/migrations/*.sql`。
- **认证**：本地 JWT + 邮箱密码（不是 Supabase Auth/OAuth）。
  `utils/localAuth.ts` 提供 `signAccessToken` / `verifyAccessToken` / `hashPass`
  / `comparePass` / `validateUserAndToken` / `validateAdmin`。
- **支付**：移除 — 所有用户视为 `Pro` 计划（无限配额）。
  `utils/access.ts` 中所有 `getXxxPlanData` 恒返回 100TB，`EMAIL_IN_PLANS` 恒 true。
- **Cloud sync**：WebDAV / S3 / GoogleDrive / OneDrive / iCloud 都是 stub。
  用户在「Integrations → Cloud Sync」面板里看到的是只读说明，不能配置。
  `services/sync/cloudSyncActivation.ts` 是空 stub，`providers/*` 是空类。
- **Native-only 功能**：ABS / LocalSend / Yomitan / Wordlens / Nix /
  Audiobook pairing 都是 stub。所有 stub 在 v8.19.4 之后必须**非阻塞** —
  返回 null / 空 / 原值，**不抛 Error**。
- **品牌**：所有用户可见字符串必须是「Readest Lite」，不是「Readest」。
  搜索 `apps/readest-app/src` 里残留的 `"Readest"` 字面量，逐个改成
  `"Readest Lite"`（除非是上游未改的依赖字符串，例如 `process.env['READEST_*']`）。

## Lite 自定义文件清单（绝对不能被上游同步覆盖）

下面这些文件被 Lite 重写或新建，**绝对不能**用上游版本覆盖。维护者每次合上游
PR 时要逐个对比，遇到上游改了其中之一就要把 Lite 的差异手动 backport 进来
（通常是几行 import 改动 + 一个 if 分支）。

```
# App service 与运行时配置
apps/readest-app/src/services/appService.ts        # BaseAppService
apps/readest-app/src/services/constants.ts         # DEFAULT_SYSTEM_SETTINGS (Lite 默认值)
apps/readest-app/src/services/environment.ts       # getBaseUrl / getAPIBaseUrl 用相对路径
apps/readest-app/src/services/runtimeConfig.ts     # 相对 URL 而非烤死的 localhost
apps/readest-app/src/types/{book,settings,system}.ts # 类型扩展（含 Lite 字段）

# Store
apps/readest-app/src/store/{libraryStore,readerStore}.ts

# Context
apps/readest-app/src/context/{AuthContext,VaultContext,PHContext}.tsx

# Library UI
apps/readest-app/src/app/library/page.tsx
apps/readest-app/src/app/library/components/{LibraryHeader,ImportMenu}.tsx

# 公共组件
apps/readest-app/src/components/{AboutWindow,Quota,Providers,Landing}.tsx

# 翻译 / 词典 / RSS
apps/readest-app/src/services/translators/providers/google.ts  # 走 /api/translate/google
apps/readest-app/src/services/dictionaries/providers/{wikipedia,wiktionary}Provider.ts
apps/readest-app/src/services/dictionaries/chineseDict.ts      # 走 fetchViaWikiProxy
apps/readest-app/src/services/rss/favicon.ts                   # v8.18.3 favicon 自动识别
apps/readest-app/src/services/rss/feedBook.ts                  # v8.18.3 favicon 嵌入封面

# Utils
apps/readest-app/src/utils/{access,localStorage,db,localAuth,supabase,vaultState,proxy}.ts
apps/readest-app/src/utils/book.ts                  # getRemoteBookFilename (local 分支)
apps/readest-app/src/libs/storage.ts                # 相对 URL + requestOrigin
apps/readest-app/src/libs/shareServer.ts            # feed:// 书籍分享
apps/readest-app/src/libs/errors.ts                 # isWrongPassphraseError
apps/readest-app/src/libs/crypto/session.ts         # invalidatePassphrase

# Cloud sync + Replica
apps/readest-app/src/services/cloudService.ts       # feed:// 上传/下载 short-circuit
apps/readest-app/src/services/sync/cloudSyncActivation.ts # stub
apps/readest-app/src/services/sync/providers/{gdrive,onedrive}/...Connect.ts
apps/readest-app/src/services/sync/replicaCryptoMiddleware.ts # 上游版本
apps/readest-app/src/services/sync/passphraseGate.ts # 上游版本
apps/readest-app/src/services/sync/adapters/absServer.ts  # ReplicaAdapter 实现
apps/readest-app/src/services/sync/encryptedSettingsSync.ts # v8.18.4 加密设置同步
apps/readest-app/src/services/sync/statsSync.ts            # v8.19.4 阅读统计加密同步

# Native stubs（v8.19.4 全部改为非阻塞）
apps/readest-app/src/services/audiobook/*           # 全部 stub
apps/readest-app/src/services/localsend/*           # 全部 stub
apps/readest-app/src/services/dictionaries/plugins/* # 全部 stub
apps/readest-app/src/store/{absServerStore,localsendStore}.ts

# 类型扩展（含 Lite 专用字段）
apps/readest-app/src/types/{audiobookshelf,bookorbit,payment,webSource}.ts

# Settings 集成面板（stub）
apps/readest-app/src/components/localsend/LocalSendManager.tsx # 渲染 null
apps/readest-app/src/components/settings/integrations/{ABSForm,LocalSendForm,cloudSync}.tsx
apps/readest-app/src/app/reader/components/audiobook/AudiobookPairingDialog.tsx # 渲染 null

# 用户管理（v8.19.0 + v8.19.4）
apps/readest-app/src/app/user/components/UserManagement.tsx # 含 AllUsersModal + UserDetailModal

# Pages Router API（Lite 专用，App Router `/api/admin/*` 由路由组而非文件构成）
apps/readest-app/src/pages/api/storage/delete.ts    # v8.18.4 自动 revoke shares
apps/readest-app/src/pages/api/settings/{index,save}.ts # v8.18.4 加密设置同步
apps/readest-app/src/pages/api/admin/users/[id]/books.ts       # v8.19.4 admin 用户书籍列表
apps/readest-app/src/pages/api/admin/users/[id]/recycle-bin.ts # v8.19.4 admin 用户回收站
apps/readest-app/src/pages/api/recycle-bin/{index,restore,clear}.ts # v8.19.0 回收站
apps/readest-app/src/pages/api/avatar/[id].ts       # v8.19.2 隐藏头像 URL

# Library / Remote download UI
apps/readest-app/src/app/library/components/RemoteDownloadDialog.tsx # v8.18.3 移除 Advanced Options
apps/readest-app/src/app/library/components/ShareBookDialog.tsx # v8.18.4 永久+日历
```

## 关键设计决策

### 1. 签名 URL 必须用相对 URL（CORS / URL 修复 #1）

`utils/localStorage.ts` 的 `getStorageBase()` 默认返回 `''`，让 buildPutUrl /
buildGetUrl 输出 `/api/storage/_put?...` 这样的相对 URL。浏览器自动按当前
页面 origin 解析，无论用户从 `localhost` / IP / 域名访问都正确。

需要绝对 URL 的场景（如 `NextResponse.redirect`）由调用方传入 `requestOrigin`，
从请求 URL `new URL(request.url).origin` 派生。

**绝对不要**改回 `http://127.0.0.1:8225` 或烤死的 localhost — 浏览器无法访问
容器内地址。这条规则适用于：
- `services/environment.ts` 的 `getBaseUrl` 在浏览器中返回 `''`
- `services/runtimeConfig.ts` 不再读 `localhost` 默认值
- `libs/storage.ts` 的 `getStorageBase()` 返回 `''`
- `services/cloudService.ts` 上传/下载用相对路径
- 任何 `new URL(...)` 调用必须传 `base` 参数

### 2. getRemoteBookFilename 必须返回非空（CORS / URL 修复 #2）

`utils/book.ts` 的 `local` 分支必须返回 `<hash>/<safe-title>.<ext>`，绝对
不能返回 `''`。返回空字符串会让 cloud path `cfp = 'Readest/Books/'` 出现空
段，被 `isSafeObjectKeyName` 拒绝（'Invalid fileName'），同时上传写入的
`fileKey` 缺少文件名段，下载请求对不上 → 'File not found'。

### 3. 中文文件名安全

`utils/misc.ts` 的 `makeSafeFilename()` 已正确处理 Windows 保留字符、控制字符、
超过 250 字节等。不要在 `getRemoteBookFilename` 里再 escape 一次 — 双重
escape 会让签名 URL 不匹配。

### 4. 代理路由必须强制登录（SSRF 防护）

- `/api/proxy/wiki`
- `/api/proxy/resource`
- `/api/translate/google`

这三个端点全部调用 `validateUserAndToken(authHeader)`，未登录返回 401。
**永远不要**为方便测试而改成 `optional auth` — 公开代理会被滥用为 SSRF 跳板。

`isProxyEnabled()` 在客户端默认 false，用户主动开启后才把 wiki / 字典请求
走代理。代理服务端 `isPrivateHost()` 拒绝 localhost / 10.x / 172.16-31 /
192.168 / metadata (169.254.169.254)。

### 5. feed:// 书籍同步

`uploadBook()` 在 `cloudService.ts` 中检测到 `book.url.startsWith('feed://')`
时跳过 blob 上传，只上传封面 + 标记为已上传。`downloadBook()` 同理。这样 RSS
订阅能跟普通书一样走自动同步，且不消耗存储配额。

### 6. feed:// 书籍分享 — 接收方独立，owner 删除自动失效

**关键**：接收方 import 后是**完全独立**的副本 — 字节级复制到接收方命名空间
（`<recipientUid>/Readest/...`）+ 独立 DB row。原 owner 删除自己的书**不影响**
接收方的副本。

- `shareServer.ts` 的 `resolveActiveShare` 检测到 `bookUrl.startsWith('feed://')`
  时不要求 `bookFile`（cover 仍可上传），返回 `isFeedBook: true` + descriptor URL
- `share/create/route.ts` 在 `bookUrl` 为 feed:// 时跳过 file lookup，直接创建
  「无文件分享」
- `share/[token]/download/route.ts` 在 `isFeedBook` 时返回 descriptor JSON
  而非文件 redirect
- `share/[token]/import/route.ts` 在 `isFeedBook` 时只复制 cover 到接收方
  命名空间，返回 descriptor 让接收方客户端重建订阅

**ACL 安全**：owner 删除书籍时，`pages/api/storage/delete.ts` 自动 revoke 该
`(userId, bookHash)` 的所有活跃 BookShare 行（`revokedAt = now()`）。接收方访问
已 revoke 的分享链接时返回 410 `revoked`。接收方已保存的副本不受影响 — 字节级
复制后是独立 owner 的独立 row，原 owner 的 file 删除不会级联到接收方的 file。

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
- `scope = 'reading_stats'` — ReadingStatsPayload（v8.19.4 新增，见 #9）

`encryptedPayload` = base64(JSON(CipherEnvelope))，用 vault key K 加密。
K 是从用户密码 PBKDF2 派生的 AES 密钥，存服务端为 `User.encryptedVaultKey`
（用密码派生的 KE 加密 K），登录后客户端解密拿到 K，存内存 `vaultState.ts`。
服务端只存密文，不解密 — 跨设备同步时其他设备 GET 后在客户端解密。

API：
- `GET /api/settings?scope=system` — 取最新密文
- `PUT /api/settings?scope=system` — 上传密文（upsert）

`ALLOWED_SCOPES = ['system', 'global_view', 'global_read', 'reading_stats']`
是服务端白名单，任何其他 scope 都返回 400。

**客户端推送**：`store/settingsStore.ts` 的 `saveSettings` 调用后，通过
`scheduleEncryptedPush(settings)` 3 秒 debounce 推送（拖滑块时不每个值都推）。
同时调用 `scheduleReadingStatsPush(envConfig)` 10 秒 debounce 推送阅读统计
（统计变化频率低，独立 timer 不阻塞 settings 推送）。

**客户端拉取**：`hooks/useLibrary.ts` 在 library 加载时按顺序拉 system →
global_view → global_read → reading_stats，last-writer-wins 合并到本地。

**安全**：服务端无法读取用户设置内容，只做存储转发。Vault key 永远不离开
客户端。改密码时清空 `User.encryptedVaultKey`，强制用户重新设置 vault。

### 9. 阅读统计加密同步（v8.19.4 新增）

**问题**：阅读统计（StatPage 行）此前只通过 KOSync / `/api/sync` 同步最新进度
（一本书一条 row），完整的每页阅读历史（KOReader `page_stat_data`）从未离开
设备。多设备用户切换设备时丢失每页时间数据。

**方案**：复用 v8.18.4 的加密设置同步通道，新增 `scope = 'reading_stats'`。
`services/sync/statsSync.ts` 提供 `pushReadingStats` / `pullReadingStats`：
- push：序列化本地 `statistics.db` 的全部 `page_stat_data` 行为
  `PageStatEvent[]`，加密后 PUT 到服务端。payload 形如
  `{ stats: PageStatEvent[], pushedAt: number }`。
- pull：GET 服务端密文，客户端解密，把事件交给
  `StatisticsDb.applyRemoteEvents([], events)`。该函数已实现
  last-writer-wins per (bookHash, page, startTime) — 在 INSERT 时
  `ON CONFLICT(id_book, page, start_time) DO UPDATE SET duration =
  max(duration, excluded.duration)`。

**为什么 books 数组传空**：Book 元数据本身已经通过 `/api/sync` 同步，stats
只需要 page 事件。`applyRemoteEvents` 在遇到无 books 记录的事件时调
`ensureBookId(e.bookMd5)` 创建占位书行（title = bookMd5），真实 title 由后续
`/api/sync` 拉取时 upsert 覆盖。

**推送时机**：`store/settingsStore.ts` 的 `saveSettings` 之后调度
`scheduleReadingStatsPush`，10 秒 debounce。10s 是因为统计变化频率远低于
settings — 一页平均看 60 秒，10s debounce 足以合并一连串翻页而不延迟「关书
关闭」太明显。失败时 `console.warn` + 不影响 settings 推送。

**拉取时机**：`hooks/useLibrary.ts` 在 library 加载时拉一次，best-effort，
失败时 `console.warn` 不阻塞 library 加载。`StatisticsDb.open(appService)`
是 per-tab 单例，与 ReadingStatsTracker 共享连接。

### 10. 批量下载 URL 输入框语法

`RemoteDownloadDialog.tsx` 的「批量下载」tab 没有「Advanced Options」全局
配置。每个 URL 行自带指令：`URL | cookie:VALUE | header:Key: VALUE`。
**绝对不要**为「方便」加回全局 Cookies/Headers 输入框 — 那会让用户混淆
「全局 vs per-URL」。

### 11. RSS 订阅源封面 — 自动识别站点 favicon

`services/rss/favicon.ts` 的 `fetchFeedFavicon()` 按以下顺序查找：
1. 站点 HTML `<link rel="icon" type="image/svg+xml">`
2. `<link rel="icon">`（任意类型）
3. `<link rel="apple-touch-icon">`
4. `<link rel="shortcut icon">`
5. `/favicon.ico`

走 `isProxyEnabled()` 时通过 `/api/proxy/resource` 服务端代理获取（绕过 GFW），
超时 5 秒。失败时回退到默认的 RSS 橙色图标，不影响订阅。

`feedBook.ts` 的 `ensureFeedBookCover()` 在生成 SVG 封面时把 favicon 作为
avatar 嵌入。

### 12. 删除文章批注点击的优雅降级

`BooknoteItem.handleClickItem` 用 try/catch 包住 `goTo(cfi)`。RSS 文章被删除
但批注仍在 config.json 时，跳转失败 → 显示 toast「The highlighted location
is no longer available in this book.」而不是让面板崩溃。

### 13. 阅读统计清除

`DELETE /api/usage/stats` 删除当前用户的 `StatPage` + `UsageStat` 行（需
Bearer auth）。Danger Zone 中的「Clear Reading Statistics」按钮触发此 API。
书籍、进度、批注不受影响。

### 14. 文件去重 + 引用计数（v8.19.0）

**问题**：多用户上传同一本书会占用双倍存储；同一用户重导入同一本书也会
重复存储。

**方案**：`File` 表新增 `contentHash` / `originalFileKey` / `refCount` 三列
（migration `018_file_dedup.sql`）。
- `contentHash`：书籍内容的 hash，去重 key。
- `originalFileKey`：引用文件指向 owner 的 fileKey；owner 自身为 NULL。
- `refCount`：多少用户引用此物理文件。owner = 1，reference = 0（引用自己
  不算自己的引用计数，只算 owner 的）。

**上传逻辑**：`storage/upload.ts` 在写入前查 `contentHash` 是否已存在：
- 不存在 → 写物理文件 + 创建 owner File row（refCount=1, originalFileKey=NULL）
- 已存在且当前用户不是 owner → 不写物理文件，创建 reference File row
  （refCount=0, originalFileKey=owner.fileKey），原子 bump owner.refCount

**删除逻辑**：`storage/delete.ts` / `recycle-bin/clear.ts`：
- owner File：decrement refCount，== 0 时物理删除文件 + File row
- reference File：decrement owner 的 refCount（owner 可能因此跌到 0），
  删自己的 reference File row

**Avatar 例外**：avatar 文件用 `fileKey = 'avatar/<userId>'`，不参与去重
（contentHash = NULL, originalFileKey = NULL, refCount = 1）。

### 15. 回收站（v8.19.0）

**问题**：用户误删书籍后无法恢复；物理删除太激进。

**方案**：`RecycleBinItem` 表（migration `019_recycle_bin.sql`）。
删除书籍时不立即物理删除，而是：
1. 把 Book.deletedAt 设为 now（软删除）
2. 创建 RecycleBinItem 行，记录 bookHash / bookTitle / bookFormat / fileKey /
   deletedAt / expiresAt = now + 30 天（默认，`RECYCLE_BIN_EXPIRE_DAYS`
   可配）
3. 不删 File 行 — 文件去重保证物理文件不会被误删

**API**：
- `GET /api/recycle-bin` — 列出当前用户的回收站条目（先自动清理过期的）
- `POST /api/recycle-bin/restore` `{ ids: string[] }` — 恢复：Book.deletedAt
  清回 null + 删 RecycleBinItem 行（File 行不动，去重 refCount 也不动）
- `POST /api/recycle-bin/clear` `{ ids: string[] } | { all: true }` — 永久
  删除：物理删 Book / File 行（按 #14 的去重规则），删 RecycleBinItem 行

**Admin 跨用户**（v8.19.4）：
- `GET /api/admin/users/[id]/recycle-bin` — 列出目标用户的回收站
- `POST /api/admin/users/[id]/recycle-bin?action=restore` `{ ids: string[] }`
- `POST /api/admin/users/[id]/recycle-bin?action=delete` `{ ids: string[] }`

**自动清理**：`GET /api/recycle-bin`（user 和 admin）会先
`deleteMany({ where: { expiresAt: { lt: now } } })`，所以前端不需要定时器。

**前端**：`app/user/components/RecycleBinDialog.tsx`（不在 Lite 自定义清单
里 — 沿用上游 UI）。`UserManagement.tsx` 的 UserDetailModal 里也展示回收站
条目（admin 视角）。

### 16. 角色层级（v8.19.0）

`User.role` 字段：`'user'` | `'admin'` | `'super_admin'`。
super_admin 由 `SUPER_ADMIN_EMAIL` 环境变量控制 — 该邮箱的用户在
`validateAdmin` 时被识别为 super_admin，**不**通过 DB role 字段。这样即使
DB 被篡改，攻击者也无法把自己升级为 super_admin。

**`utils/permissions.ts`**：
- `isSuperAdmin(user)`：role === 'super_admin' || email === SUPER_ADMIN_EMAIL
- `isAdmin(user)`：role === 'admin' || role === 'super_admin'
- `canManageUser(current, target)`：
  - 不能操作自己
  - super_admin 可以管理除自己外的所有人，但不能管理其他 super_admin
  - admin 只能管理 user
- `canCreateRole(current, role)`：
  - 不能创建 super_admin（永远）
  - 只有 super_admin 能创建 admin
  - admin 能创建 user

**`utils/access.ts`** 的 `validateAdmin` 同时检查 role 和 SUPER_ADMIN_EMAIL，
让 env-controlled super_admin 也能访问 /api/admin/*。

**API 保护**：
- `/api/admin/users` (GET / POST)：`validateAdmin`
- `/api/admin/users/[id]` (PUT / DELETE)：`validateAdmin` + `canManageUser`
- `/api/admin/users/[id]/books` (GET)：`validateUserAndToken` + `isAdmin`
- `/api/admin/users/[id]/recycle-bin` (GET / POST)：`validateUserAndToken` +
  `isAdmin`

**前端**（`UserManagement.tsx`）：
- `RoleBadge`：super_admin 金色徽章，admin 蓝色，user 不显示
- `canManageUserClient`：客户端权限判断（与 canManageUser 对应）
- `isSuperAdminClient`：基于 currentUser.userRole（Lite AuthUser 含 userRole
  字段；上游 Supabase User 不含，TS 类型是 Supabase User 所以用 `unknown`
  cast 安全读取）
- 「Edit」按钮只在 canManage 时显示
- 「Role」选择器只在 super_admin 编辑非 super_admin 时显示
- 不能删除最后一个 admin（API 校验）
- 不能降级最后一个 admin（API 校验）

### 17. 头像存储（v8.18.9）

**问题**：原版用户头像是 Supabase Storage，Lite 没有对象存储 UI。

**方案**：
- `User.avatarUrl` 字段（migration `017_user_avatar.sql` + `020_user_avatar_column.sql`）
  存任意 http(s) / data: URL。**拒绝 SVG**（XSS 风险，`<script>` 嵌入）。
- 上传：`POST /api/user/avatar` 接受 form-data，存到 `File` 表
  `fileKey = 'avatar/<userId>'`，更新 `User.avatarUrl` 指向
  `/api/avatar/<userId>`（隐藏真实 fileKey，绕过 file manager 的 list）
- 读取：`GET /api/avatar/[id]` 服务端流式返回 image/* + Cache-Control: public,
  max-age=3600。无需 auth（其他用户也能看到 avatar — 这是社交属性，不是
  隐私数据）
- Admin 头像 override：`ADMIN_AVATAR_URL` 环境变量若设置，admin 列表 API
  在返回时把 admin 的 avatarUrl 替换为该 env 值（让管理员自定义头像但 DB
  仍可存原始 URL）

**校验**：`utils/userValidation.ts` 的 `isValidAvatarUrl(url)` 检查：
- 必须是 `http://` / `https://` / `data:image/` 开头
- 不能是 `data:image/svg+xml` 或任何 SVG MIME

**前端**：`UserEditDialog.tsx` 含 URL 输入框 + 实时预览（onError 回退到 `?`
占位）。`UserManagement.tsx` 列表里优先显示 avatarUrl，无则回退
`PiUserCircle` 图标。

### 18. ABS / LocalSend / Audiobook stubs 必须非阻塞（v8.19.4）

**问题**：v8.18.x 之前的 stub 在用户误触上游 UI 路径时抛 `Error('xxx not
supported in Readest Lite')`，导致 TTS 启动崩溃、reader 模块崩溃。

**方案**：所有 stub 函数返回 null / 空 / 原值，**不抛 Error**：

- `services/audiobook/AudiobookController.ts` — 构造器只调 `super()`，不抛
- `services/audiobook/absPairing.ts`：
  - `buildAbsPairingSource` → 返回空 `{ serverId: '', itemId: '', title: '' }`
    （v8.18.x 是 `throw`）
  - `loadAbsPairingSource` → 返回原 source 不变（v8.18.x 是 `throw`）
  - `absNarrationTracks` → 返回 `null`（v8.18.x 已是）
  - `absPreviewClip` → 返回 `null`（v8.18.x 已是）
  - `listPairableAbsBooks` → 返回 `[]`（v8.18.x 已是）
- `services/audiobook/AudiobookPairingDialog.tsx` → 渲染 `null`（v8.18.x 已是）
- `services/localsend/*` → 全部返回 null/空
- `services/tts/TTSController.ts` 的 ABS 路径：
  - `await import('@/services/audiobook/absPairing')` 包 try/catch，失败时
    返回 `null`（让 `resolveTracks` 回退到单文件模式）
  - `loadBlob` 返回空 `Blob([], { type: 'audio/mpeg' })`（v8.18.x 是
    `throw new Error('Audiobookshelf server not found')`）。空 Blob 让 audio
    元素静默加载失败，比 throw 更安全 — TTS 启动不崩。

**绝对不要**在 stub 里加 `throw` — 即使是「这里应该 unreachable」的注释下。
stale config from restored backup、上游 PR 误改 import 路径、用户手动构造
pairedAudiobook config 都可能让 stub 被实际调用。返回空 / null 让上层
`.catch(() => null)` 兜底。

### 19. Admin 用户详情 Modal（v8.19.4）

**问题**：admin 在 AllUsersModal 里看到用户列表，但点开某个用户只能 Edit /
Delete，看不到该用户实际存了什么书、回收站里有什么。无法回答「这个用户
为什么占了 5GB 存储？」。

**方案**：`UserManagement.tsx` 新增 `UserDetailModal`：
- 触发：admin 在 AllUsersModal 里点击某个用户行的 chevron 按钮
- 内容：
  1. 用户信息卡（头像、邮箱、角色徽章、创建时间、最后登录、配额）
  2. 书籍列表（搜索 + 排序 by title / upload date / file size，可升降序）
  3. 回收站条目（多选 + 「Restore Selected」/ 「Permanently Delete
     Selected」按钮）

**API**：
- `GET /api/admin/users/[id]/books` — admin-only（isAdmin role），返回
  target 用户的 Book rows + File size（按 bookHash 关联，仅 owner File
  的 fileSize 算入，reference File 的 fileSize = 0）
- `GET /api/admin/users/[id]/recycle-bin` — admin-only，列出 target 用户
  的 RecycleBinItem 行（先自动清理过期的）
- `POST /api/admin/users/[id]/recycle-bin?action=restore` / `?action=delete`
  `{ ids: string[] }` — admin 跨用户操作回收站

**安全**：
- 服务端用 `validateUserAndToken` + `isAdmin` 双重校验
- 前端不传 canManageUser（防伪造），用 canManageUserClient 决定 UI 是否显示
  chevron 按钮（不能管理的用户连点开详情的入口都没有）
- recycle-bin 的 delete 路径走 #14 的去重逻辑，不会因为 admin 删了一本书
  就把另一个用户引用的同物理文件删掉

## CORS / URL 修复清单

所有 v8.18.x / v8.19.x 修过的 CORS / URL bug 集中在这里，新增功能时不要
重新引入：

1. `getBaseUrl()` 在浏览器返回 `''` — 不是烤死的 localhost
2. `getAPIBaseUrl()` 在浏览器返回 `/api` — 相对路径
3. `getStorageBase()` 返回 `''` — 签名 URL 自动相对
4. `getRemoteBookFilename('local', ...)` 返回 `<hash>/<safe-title>.<ext>` — 非空
5. `libs/storage.ts` 的 `requestOrigin` 参数 — 由调用方从 `new URL(req.url).origin`
   传入，用于 NextResponse.redirect 等需要绝对 URL 的场景
6. RSS favicon 走 `/api/proxy/resource` — 服务端代理，绕过浏览器 CORS
7. 词典 / wiki 走 `/api/proxy/wiki` — 服务端代理
8. Google 翻译走 `/api/translate/google` — 服务端代理 + API key 隐藏
9. 所有 /api/* 端点用 `corsAllMethods` 中间件 — 允许所有方法 + OPTIONS
10. Avatar 读取 `/api/avatar/[id]` 无需 auth — 但 list 不返回 avatar fileKey
11. feed:// 书籍分享的 descriptor URL 是相对的 — 接收方在自己 origin 解析

## 品牌变更清单

- 「Readest」→「Readest Lite」（用户可见字符串）
- 「Readest Cloud」→「Readest Lite Cloud」
- 「Sign in to Readest」→「Sign in to Readest Lite」
- 「About Readest」→「About Readest Lite」
- 任何 README / 部署文档 / GitHub Release 提到「Readest」时改为「Readest Lite」
- Logo / favicon / app icon 暂时沿用上游（视觉资产不属于字符串范畴）
- `process.env['READEST_*']` 等环境变量名**不改** — 那是上游接口契约
- `package.json` 的 `name` 字段保持 `@readest/readest-app` — npm 包名不改

## 后端安全清单

所有 API 路由（`/api/*`）必须满足：

1. **认证**：`validateUserAndToken(authHeader)` → 401 when unauthenticated；
   admin 端点用 `validateAdmin` 或 `validateUserAndToken` + `isAdmin` 双校验
2. **方法白名单**：开头判断 `req.method`，未知方法返回 405
3. **CORS**：`runMiddleware(req, res, corsAllMethods)`
4. **输入校验**：`trimText(value, max)` 限长 + 拒绝控制字符
5. **用户隔离**：所有 DB 查询 `where: { userId, ... }` 不能跨用户读
6. **SSRF 防护**：代理路由 `isPrivateHost()` 拒绝 localhost / 10.x /
   172.16-31 / 192.168 / metadata
7. **配额**：`storageQuotaMB` / `translationQuotaKB` > 0 时按用户累计
8. **签名 URL TTL**：upload 1800s / download 1800s / share 视场景
9. **分享自动 revoke**：删除 file 时 `bookShare.updateMany` 撤销同 bookHash
   的活跃分享
10. **Avatar 校验**：`isValidAvatarUrl` 拒绝 SVG
11. **displayName 校验**：`isValidDisplayName` 拒绝 `@` / `<>` / 引号 / 斜杠
12. **Role 操作**：`canManageUser` + `canCreateRole` 双校验，保护最后一个
    admin 不能被降级或删除

## CI 失败排查清单

CI 通常在 7-10 分钟内跑完。如果失败，按以下顺序查：

1. `Module not found` — 缺 stub 文件，看具体路径 → 新建空 stub
2. `error TS2xxx: Property 'xxx' does not exist on type 'Book'` — 上游加了
   字段，Lite 类型同步加（看 `apps/readest-app/src/types/book.ts` /
   `settings.ts`）
3. `error TS4113: cannot have an 'override' modifier` — 上游加了方法但 Lite
   BaseAppService 没有，把 `override` 删掉或加抽象方法
4. `error TS2345: Argument of type 'X' is not assignable to 'Y'` — 类型签名
   变化，看 `import` 是否上游覆盖了 Lite 自定义文件
5. `error TS2307: Cannot find module '@/...'` — 检查 `tsconfig.json` paths
   别名
6. `Build failed because of webpack errors` — 通常是上面的 TS 错误导致
   webpack 退出
7. `error TS6133: 'xxx' is declared but its value is never read` —
   noUnusedLocals 严格模式，删掉未使用的变量或加 `_` 前缀
8. `biome lint` 失败 — 看 biome.json 规则，通常 `useImportType` /
   `noConsole` 等，按提示改

## Dockerfile OOM

`Dockerfile` 必须有 `ENV NODE_OPTIONS=--max-old-space-size=4096`，否则
Next.js 在多语言 i18n 包 + foliate-js 编译时容易 OOM。

## 测试原则

- **绝不**为「让 TS 通过」而删掉 Lite 自定义文件的导出
- **绝不**用 `// @ts-ignore` 屏蔽类型错误 — 上游类型变就是真的变了，要修
- **绝不**回退到 `http://127.0.0.1:8225` 这种烤死 localhost 的 URL
- **绝不**在 stub 里加 `throw` — 即使是「unreachable」注释下也不行
- **绝不**为「方便测试」把 /api/proxy/* 改成 optional auth
- **绝不**为「方便」加回全局 Cookies/Headers 输入框到 RemoteDownloadDialog

## 版本管理

- 主版本号 `8.x.y` — Lite 版本号，与上游 `0.x.y` 解耦
- 每次 PR/修复 → bump patch（x.y.Z）
- 每次新增上游功能 → bump minor（x.Y.0）
- 大破坏性变更（schema 不兼容）→ bump major（X.0.0）
- 每次 release 在 `apps/readest-app/package.json` 改 version 字段 +
  `CHANGELOG.md` 加条目 + GitHub Release + tag（v8.x.y）+ GHCR image 自动构建

## 数据库 Migration 清单（20 个）

每次 schema 变更都要：
1. 修改 `prisma/schema.prisma`
2. 在 `docker/volumes/db/migrations/` 加 `NNN_xxx.sql`（NNN 是序号，已有
   到 020）
3. 容器启动时自动跑 migration（`docker/entrypoint.sh` 遍历 migrations 目录）
4. 已有 migration 不可修改（防止生产环境数据不一致）

现有 migration：
1. `001_add_rsvp_position.sql` — book_configs.rsvpPosition
2. `002_add_book_shares.sql` — book_shares 表
3. `003_add_replicas.sql` — replicas 表（CRDT）
4. `004_crdt_merge_replica_fn.sql` — CRDT 合并 RPC（Postgres 函数，Lite
   用 crdt.ts 在 JS 层合并）
5. `005_replica_manifest_cursor_updated_at.sql` — replicas.manifestCursor
   + updatedAt
6. `006_replica_more_kinds.sql` — replicas.kind 扩展
7. `007_files_replica_grouping.sql` — files.replicaKind / replicaId
8. `008_replica_keys_rpcs.sql` — replica_keys 表
9. `009_replica_opds_catalog.sql` — replicas OPDS catalog kind
10. `010_replica_keys_forget.sql` — replica_keys.forget
11. `011_replica_settings.sql` — replicas settings kind
12. `012_send_to_readest.sql` — send_addresses / send_allowed_senders /
    send_inbox 表
13. `013_add_book_notes_global.sql` — book_notes.global
14. `014_add_reading_stats.sql` — stat_books / stat_pages 表
15. `015_book_share_url.sql` — book_shares.bookUrl（feed:// 分享）
16. `016_user_settings.sql` — user_settings 表（v8.18.4 加密设置同步）
17. `017_user_avatar.sql` — users.avatarUrl（占位 migration）
18. `018_file_dedup.sql` — files.refCount / contentHash / originalFileKey
19. `019_recycle_bin.sql` — recycle_bin_items 表
20. `020_user_avatar_column.sql` — users.avatar_url 列（实际 ALTER TABLE）

注意：017 和 020 都是关于 avatar_url 的 — 017 是占位（写错了用 020 修），保留
两个 migration 不可修改是历史包袱。

## API 端点清单（Lite 专用）

### Pages Router (`src/pages/api/`)

**认证 / 用户**
- `auth/[...path]/route.ts`（App Router） — Supabase Auth 兼容层
- `user/library.ts` — GET 当前用户书库
- `user/delete.ts` — DELETE 当前用户账号
- `user/avatar.ts` — POST 上传头像
- `avatar/[id].ts` — GET 用户头像（无 auth）

**存储**
- `storage/_put.ts` — PUT 签名 URL（生成上传 URL）
- `storage/_get.ts` — GET 签名 URL（生成下载 URL）
- `storage/upload.ts` — POST 直传（含去重逻辑）
- `storage/download.ts` — GET 直读
- `storage/delete.ts` — DELETE 文件（自动 revoke 同 bookHash 的 shares）
- `storage/list.ts` — GET 文件列表
- `storage/stats.ts` — GET 存储用量
- `storage/purge.ts` — POST 批量清理

**设置同步（v8.18.4 + v8.19.4）**
- `settings/index.ts` — GET 加密设置（scope ∈ system / global_view /
  global_read / reading_stats）
- `settings/save.ts` — PUT 加密设置

**阅读统计**
- `usage/stats.ts` — GET / DELETE 阅读统计
- `usage/index.ts` — GET 翻译用量
- `sync.ts` — GET / POST 增量同步（books / book_configs / book_notes /
  stat_books / stat_pages）
- `kosync.ts` — GET / POST KOSync 兼容进度同步
- `sync/replicas.ts` — GET / POST CRDT replicas
- `sync/replica-keys.ts` — GET / POST replica keys

**回收站（v8.19.0）**
- `recycle-bin/index.ts` — GET 列表（自动清理过期）
- `recycle-bin/restore.ts` — POST 恢复
- `recycle-bin/clear.ts` — POST 永久删除

**Admin（v8.19.0 + v8.19.4）**
- `app/api/admin/users/route.ts` — GET / POST 用户列表 / 创建
- `app/api/admin/users/[id]/route.ts` — PUT / DELETE 单用户
- `pages/api/admin/users/[id]/books.ts` — GET target 用户书籍（v8.19.4）
- `pages/api/admin/users/[id]/recycle-bin.ts` — GET / POST target 用户
  回收站（v8.19.4）

**翻译 / 代理**
- `deepl/translate.ts` — POST DeepL 翻译（服务端 API key）
- `proxy/wiki` — GET wiki 代理（强制 auth）
- `proxy/resource` — GET 通用资源代理（强制 auth）
- `translate/google` — POST Google 翻译代理（强制 auth）

**分享 / Send**
- `share/*`（App Router） — 创建 / 列表 / 下载 / 导入 / 撤销 / OG
- `send/inbox.ts` — GET 收件箱
- `send/inbox/[id]/*` — 单条收件箱操作
- `send/address.ts` — GET / POST send 地址
- `send/senders.ts` — GET / POST 允许的发送方
- `send/fetch-url.ts` — POST 抓取 URL

### App Router (`src/app/api/`)

主要是 admin 用户管理 + auth 兼容层 + share + ai + tts + opds 等沿用上游的
路由。Lite 修改过的：
- `admin/users/route.ts` — 用 `validateAdmin` + `prismaClient`
- `admin/users/[id]/route.ts` — `canManageUser` 校验
- `auth/[...path]/route.ts` — Supabase Auth 兼容

## 文档清单（每次迭代后检查更新）

- `README.md` — 版本徽章 + 部署说明
- `CHANGELOG.md` — 新版本条目（用户视角的「修了什么」）
- `apps/readest-app/package.json` — `version` 字段
- `apps/readest-app/public/locales/zh-CN/translation.json` — 所有新字符串
  的中文翻译（ alphabetical 排序，2 空格缩进）
- `ITERATION_PROMPT.md` — 本文件，更新设计决策 + Lite 自定义文件清单 +
  migration 清单 + API 端点清单
- `PROJECT_STRUCTURE.md` — 项目目录结构
- `FRONTEND_CHANGES.md` — 前端改造清单（精确到行）
- `DEPLOY.md` — 部署与验证文档
- GitHub Release + tag（v8.x.y）+ GHCR image 自动构建

## 当前版本（v8.22.0）

### 已完成 — v8.22.0

- **上游 v0.12.7/v0.12.8 适配移植**：
  - **ReadEra 注释导入**（上游 #6032）：
    - 新增 API `POST /api/readera-import`（multipart/form-data）
    - 在 ImportAnnotationsDialog 新增「ReadEra」入口
    - 简化版：直接处理 library.json（zip 解压由用户手动），按书名匹配 → BookNote
  - **Notion 笔记同步**（上游 #5949）：
    - 新增 NotionSettings 类型字段 + DEFAULT_NOTION_SETTINGS
    - 新增 API：`POST/GET/PATCH /api/notion/[...path]` 通用代理 + `POST /api/notion/sync-all`
    - 新增 NotionForm 组件，集成到 IntegrationsPanel
    - 流程：配置 token/databaseId → 测试连接 → 同步全部书籍 notes 到 Notion 数据库
  - **带登录的网页小说导入**（上游 #6119）：
    - 新增 API `POST /api/novel/proxy`（服务器端代理抓取，绕过 CORS）
    - 在 ImportNovelDialog 新增「高级选项」可折叠面板：Cookie + 自定义请求头 JSON
    - SSRF 防护：复用 `isBlockedHost`
  - **Zoom 快捷键调字号**（上游 #6067）：已通过键盘快捷键支持，未额外移植
  - **库/阅读器独立主题模式**（上游 #6113）：lite 已 stub，未额外移植
  - **PDF 锁横向 pan toggle**（上游 #6030）：依赖阅读器原生代码，未移植
  - **Proofread TTS 规则**（上游 #6109）：依赖原生 UI，未移植

- **修复（v8.21.0 用户反馈的问题）**：
  - 分组管理点击没反应：
    - 根因：点击「分组管理」时先关闭 Dropdown，但 Dropdown 关闭会让 ViewMenu 卸载，导致 modal state 丢失
    - 修复：点击时**不关闭** Dropdown，GroupManagementModal 用 `createPortal` 渲染到 `document.body`，z-index=200 > Dropdown z-50
  - 有声书点击闪退：
    - 根因：Next.js 16 要求 `useSearchParams` 必须包在 `<Suspense>` 内
    - 修复：`/player` page 加 Suspense wrapper
  - 创建用户无所属用户组选项：
    - 之前 role select 只在 super_admin 才显示
    - 修复：role select 永远显示；普通 admin 时 disabled；加提示文本
  - AdminFileTransfer 用户列表可搜索：
    - 改用 `<input list="...">` + `<datalist>`，可输入搜索匹配

- **翻译补全**：v8.22 新增 32 个 zh-CN 键 + 48 个 en 键

### 已完成 — v8.21.x

- v8.21.1：修复 react-icons/MdFolderManage 不存在导致 CI 失败 → 改为 MdCreateNewFolder
- v8.21.0：
  - 回收站批量选择（每行 checkbox + 批量恢复/批量删除/全选/反选 + 工具栏）
  - 管理员跨用户文件管理（list ?userId= 与 ?allUsers=1 + 移动/复制端点 + AdminFileTransfer 组件）
  - 分组管理 Modal（书库三点菜单底部：搜索/添加/编辑/删除/上下移排序/滚动）
  - 49 个 zh-CN 键

### 已完成 — v8.19.5 到 v8.19.8

- v8.19.5: Share 0.0.0.0 URL 修复 + Audiobook player 页面 + RecycleBin 折叠
- v8.19.6: 审计日志 + 回滚 + 分组管理 v1（在 SelectModeActions 加「更多」下拉）+ 所有书籍上传按钮
- v8.19.7: 隐藏头像文件（avatar/ 前缀）不出现在文件管理器
- v8.19.8: 创建用户时角色选择 + SVG 头像支持 + 错误信息补全

### v8.19.4 已完成（之前）

- v8.19.4: 阅读统计加密同步到所有设备（scope='reading_stats'）
- v8.19.4: ABS / LocalSend / Audiobook stubs 全部改为非阻塞
- v8.19.4: Admin 用户详情 Modal（books + recycle-bin 跨用户操作）

### v8.19.3 及之前

- v8.19.3: UpdaterWindow changelog 空 URL guard + 404 fix
- v8.19.2: localize ALL external URLs + avatar storage tracking + hidden avatar serving
- v8.19.1: CORS fix, SVG avatar, remove email feature, avatar upload API, SW fix
- v8.19.0: 回收站 + 文件去重 + 角色层级 + recycleBin type fixes
- v8.18.9: 用户头像 URL + Admin avatar override
- v8.18.6: 用户列表搜索框
- v8.18.4: 加密设置同步（system / global_view / global_read scope）
- v8.18.3: feed:// 书籍分享 + RSS favicon
- v8.18.x: 多项 CORS / URL / stub fixes

### 下一版计划（占位）

- 上游 v0.12.7/v0.12.8 还有以下功能待评估移植：
  - Zoom 快捷键调字号（#6067）
  - 库/阅读器独立主题模式（#6113）
  - PDF 锁横向 pan toggle（#6030）
  - Proofread TTS 规则创建面板（#6109）
- 考虑给 GroupManagementModal 加拖拽排序（当前用上下移按钮）
- 考虑把 ReadEra zip 备份直接接收（用户当前需手动解压）
- 考虑给 NotionSync 加自动同步（当前仅手动触发）
