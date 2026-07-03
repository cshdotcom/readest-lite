# Changelog

All notable changes to Readest Lite are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [v8.12.0] — 2026-07-02

### Added — 上游 v0.11.17 全量同步（逐文件对比）

#### 方法
逐文件对比 Lite 和上游 v0.11.17，分类处理：
- **163 个安全文件**：直接从上游复制（reader 组件/hooks/utils、settings 面板、OPDS、store、services、types、helpers、styles）
- **21 个新文件**：从上游添加（排除 Google Drive/payment/tests）
- **58 个 Lite 自定义文件**：**绝不覆盖**，只手动添加缺失字段

#### Lite 自定义保留（全部完整）
- VaultProvider（AES-GCM 加密）
- PHContext（safe atob，防 SSR 崩溃）
- 本地 JWT 认证（auth pages）
- Prisma + SQLite 后端
- 本地文件存储
- 登出清空逻辑
- 用户/demo 守卫
- syncViewSettings 开关
- Bookshelf group-empty 修复
- deeplink resolveWebBaseUrl
- proxyEnabled + WebDAVSyncLogEntry
- 下载任务（进度条/速度/ETA/日志/批量/Cookie/Headers）
- 阅读统计（总/今日/本周 + 书榜）
- 用户管理折叠
- RemoteDownloadDialog
- 所有 pages/api/* 文件（Supabase → Prisma）

#### 排除（不需要/不适用）
- Google Drive（gdrive provider, gdrive-callback, GoogleDriveForm）
- Stripe/Apple/payment（Plan*, Checkout, useAvailablePlans）
- 所有 __tests__/*

#### 手动添加的类型字段
webtoonMode, showStickyProgressBar, wordLensGlossFontSize/Color, SearchMode, mode,
abandoned(ReadingStatus), coverHash/coverUpdatedAt, fraction(BookProgress),
deletedAt+updatedAt(ProofreadRule), nearbyWords, segments+emphasized+text(SearchExcerpt),
refresh(HardwarePageTurner), biometricUnlockEnabled, WebDAVBrowseSortByType,
browseSortBy/browseSortAscending, synced_at/uploaded_at/downloaded_at(BookDataRecord)

### CI Status
- ✅ TypeScript 通过
- ✅ SSR Collecting page data 通过
- ✅ Docker Image workflow — success
- ✅ CI workflow — Smoke test success
- 镜像已推送：`ghcr.io/cshdotcom/readest-lite:8.12.0` / `8.12` / `latest`

---

## [v8.11.0] — 2026-07-01

### Added — 合并上游 v0.11.13-v0.11.17 功能

#### 1. Markdown (.md) 文件渲染 (#4816)
- 直接打开和阅读 Markdown 文件
- 布局/字体/主题设置与其他格式一致

#### 2. PDF/CBZ 对比度选项 (#4800)
- PDF/CBZ 视图菜单新增对比度调节
- 方便阅读扫描版 PDF

#### 3. TTS 高亮粒度设置 (#4807)
- TTS 朗读时按「单词」或「句子」高亮
- 设置面板中切换

#### 4. 最近阅读书架 (#4829)
- 书库顶部新增「最近阅读」轮播架
- 快速回到上次阅读位置
- 视图菜单可开关

#### 5. 自动翻页角落区域上限 (#4820)
- 自动翻页的角落触发区域 50px 上限
- 避免宽屏误触翻页

#### 6. 清理空高亮 (#4804)
- 取消高亮时如果笔记为空，自动清理占位记录

#### 7. foliate-js 自动更新
- Docker 构建时 `git clone --depth 1` 自动获取最新 foliate-js
- 包含：PDF 滚动模式 pinch-zoom 平滑 (#4817)、PDF 渲染延迟修复 (#4813)、翻页背景重排性能优化 (#4814)

### Not Merged — 双击选词 (#4846)
- 依赖链太深（5+ 个文件 API 修改：useTextSelector、Annotator、SelectionRangeEditor、sel.ts 等）
- cherry-pick 后类型不匹配，已回滚
- 留待未来完整合并

### CI Status
- ✅ Docker Image workflow — success
- ✅ CI workflow — Smoke test success
- 镜像：`ghcr.io/cshdotcom/readest-lite:8.11.0` / `8.11` / `latest`

---

## [v8.10.4] — 2026-06-26

### Added — 恢复跨设备视图设置同步（可选）

#### View Settings 跨设备同步开关
- **背景**：v8.6.0 合并上游 PR #4672 时把 view settings 改成设备本地，导致 A 设备改的字体/主题不会同步到 B 设备
- **实现**：
  - `settings.ts`：新增 `syncViewSettings?: boolean` 字段（默认 `false`）
  - `useProgressSync.ts`：`applyRemoteProgress` 检查 `settings.syncViewSettings`
    - `true`：合并远端 config 到本地（恢复 v8.6 之前行为）
    - `false`：保持 v8.6 设备本地行为（只同步 CFI）
  - `SyncCategoriesSection.tsx`：sync categories 列表下方加 toggle
- **用户操作**：用户中心 → Manage Sync → View Settings toggle

### CI Status
- ✅ Docker Image workflow — success
- ✅ CI workflow — Smoke test success
- 镜像：`ghcr.io/cshdotcom/readest-lite:8.10.4` / `8.10` / `latest`

---

## [v8.10.3] — 2026-06-24

### Fixed — 登出后书籍全部隐藏 + 移出分组不再踢出用户

#### 1. 登出后书籍全部隐藏（修复 demo books 残留）
- **问题**：登出后个别书还显示
- **根因**：`demoBooks` effect 在 `libraryLoaded=true` 时重新添加 demo books。登出时 `handleLogout` 清了 library，但 `initLibrary` 的 `!user` 守卫把 `libraryLoaded` 设为 `true`，`demoBooks` state 还在 → effect 触发 → demo books 加回来
- **修复**：`demoBooks` effect 加 `!token || !user` 守卫，登出后不添加 demo books

#### 2. 移出分组不再踢出用户（修复 group-empty auto-navigate）
- **问题**：用户在分组里把最后一本书移出 → `currentBookshelfItems.length === 0` → Bookshelf 的 effect 自动跳回全部书架，把用户踢出当前分组
- **修复**：只有当 `currentBookshelfItems.length === 0 && selectedGroup` 同时满足且不是用户主动操作时才跳转；用户主动移书不触发跳转

### CI Status
- ✅ Docker Image workflow — success
- ✅ CI workflow — Smoke test success
- 镜像：`ghcr.io/cshdotcom/readest-lite:8.10.3` / `8.10` / `latest`

---

## [v8.10.2] — 2026-06-24

### Fixed — 笔记导出链接绝对 URL + 用户管理折叠

#### 1. 笔记导出链接打不开（核心 bug）
- **问题**：导出笔记后，点击笔记里引用原书的链接，浏览器报「无法打开此书籍」
- **根因**：`buildAnnotationWebUrl` 用构建期常量 `READEST_WEB_BASE_URL`（在 Lite 里硬编码为 `''`），导出的链接是相对路径 `/o/book/{hash}/annotation/{id}`。用户在站外（GitHub/Obsidian/VS Code）点开相对路径，浏览器不知道指向哪个域名
- **修复**：新增 `resolveWebBaseUrl()` 运行时解析：
  1. 浏览器运行时：`runtimeConfig.apiBaseUrl`（`PUBLIC_BASE_URL` 注入的完整 URL，反代场景）
  2. 浏览器回退：`window.location.origin`（用户直接 IP:端口访问，没设 `PUBLIC_BASE_URL`）
  3. 服务端：构建期常量（SSR 场景，不会真正用于导出）
- **影响文件**：`utils/webUrl.ts`、`apps/readest-app/src/app/o/page.tsx`、`apps/readest-app/src/app/o/book/[hash]/annotation/[id]/page.tsx`

#### 2. Reader 书不在库里时自动重试加载
- **问题**：从笔记链接点回 reader，如果书不在本地 library，会停留在空白页
- **修复**：`useOpenAnnotationLink.ts` 检测到书不在 library 时，先 toast 提示「正在加载...」，然后导航到书库页让用户手动同步，而不是只 toast 就放弃

#### 3. 用户管理折叠
- **问题**：用户数量多时用户中心面板很长
- **修复**：用户管理列表默认折叠，点击「展开 (N)」按钮才展开

### CI Status
- ✅ Docker Image workflow — success
- ✅ CI workflow — Smoke test success
- 镜像：`ghcr.io/cshdotcom/readest-lite:8.10.2` / `8.10` / `latest`

---

## [v8.10.1] — 2026-06-23

### Added — 批量下载 per-URL Cookie/Headers 语法

#### 批量下载支持每行 URL 单独配 Cookie/Headers
- **问题**：v8.9 的批量下载只支持一组全局 Cookie/Headers 应用到所有 URL。如果 URL 来自不同认证网站，用户要手动分多次提交
- **解决**：扩展 textarea 语法，支持 per-URL 指令：

```
# 开头的行是注释
https://example.com/free.epub

https://site-a.com/book1.epub | cookie:sessionid=abc123

https://site-b.com/book2.epub | cookie:PHPSESSID=def | header:Referer: https://site-b.com
```

#### 语法规则
| 指令 | 格式 | 示例 |
|---|---|---|
| Cookie | `cookie:VALUE` | `cookie:sessionid=abc123; theme=dark` |
| Header | `header:Key: VALUE` | `header:Referer: https://site-b.com` |
| 多指令 | ` \| ` 分隔 | `cookie:abc \| header:Referer: https://x.com` |
| 注释 | `#` 开头 | `# 这是注释` |
| 空行 | 忽略 | — |

### CI Status
- ✅ Docker Image workflow — success
- ✅ CI workflow — Smoke test success
- 镜像：`ghcr.io/cshdotcom/readest-lite:8.10.1` / `8.10` / `latest`

---

## [v8.10.0] — 2026-06-23

### Added — 中文汉化 + 阅读统计 + 下载折叠

#### 1. 中文汉化（zh-CN + zh-TW）
- 补全 v8.7-v8.9 所有新增字符串的中文翻译（60 个 key）
- 包括：下载任务、进度条、日志、批量、高级选项、Cookie/Headers 等
- 阅读统计相关新字符串一并加入

#### 2. 阅读统计功能
- **新建 `GET /api/stats/aggregate` 端点**
  - 返回 `total` / `today` / `week` 聚合 + `books` 排行榜
  - 数据源：`StatPage` 表（每条记录是一次 page-read 事件）
  - 时间窗口：今日 0:00 / 本周周一 0:00 / 全部
- **`ReadingStatsCard.tsx`（用户中心顶部）**
  - 横向滚动卡片：总时间 / 今日 / 本周 / 日均
  - 前 3 本书迷你榜
  - 点击打开 `ReadingStatsModal`
  - 30 秒轮询
- **`ReadingStatsModal.tsx`**
  - Tab: 今日 / 本周 / 总计
  - 每个 Tab 显示总计 / 书籍数 / 日均
  - 书籍排行榜：按阅读时间排序（高到低/低到高切换）
  - 渐变进度条（根据阅读进度变色：红→黄→蓝→绿）
  - 搜索框筛选书籍

#### 3. 下载记录折叠
- `DownloadTasks.tsx` 默认只显示前 3 条
  超过 3 条时显示「查看全部 (N)」按钮
- 新建 `DownloadTasksModal.tsx`：完整列表，可滚动
  复用单条任务的渲染逻辑

### Fixed — 笔记链接手机 + 登出安全

#### 4. 笔记导出链接手机修复
- `/o/page.tsx`：手机（Android/iOS）默认直接跳 web reader，不再尝试启动 App
  - 原因：手机没装 App 时 `readest://` scheme 会触发「无法打开页面」错误
  - 桌面仍然尝试启动 App（桌面浏览器优雅处理 unknown scheme）
- `useOpenAnnotationLink.ts`：书不在库里时不要只弹 toast 就放弃
  改为提示用户并导航到书库页，避免停留在空白 reader

#### 5. 登出后残留书籍修复
- `useUserActions.handleLogout`：
  - 新增 `appService.saveLibraryBooks([])` 清空白名单明文 `library.json`
    防止登出后 `loadLibraryBooks` 走明文路径读到旧书
  - 新增 `useLibraryStore.setState({ libraryLoaded: false })`
    让下次登录时重新从磁盘加载
- `library/page.tsx`：`initLibrary` 加 `user/token` 守卫
  未登录时跳过 `loadLibraryBooks`，避免 vault 清空后走明文路径

### CI Status
- ✅ Docker Image workflow — `build-and-push` success
- ✅ CI workflow — `Build Docker image` + `Smoke test` 全部通过
- 镜像已推送：`ghcr.io/cshdotcom/readest-lite:8.10.0` / `8.10` / `latest`

## [v8.9.0] — 2026-06-22

### Added — 下载任务增强：进度/速度/ETA/日志/批量/自动重命名/Cookie

#### 1. Prisma schema 扩展

`DownloadTask` 表新增字段：
- `progress` (Int 0-100) — 实时下载百分比
- `downloadedBytes` (BigInt) — 已下载字节数
- `totalBytes` (BigInt?) — 总字节数（从 Content-Length）
- `speedBps` (Int) — 当前速度（字节/秒，5 秒滑动窗口）
- `etaSeconds` (Int?) — 预计剩余秒数
- `cookies` (String?) — 用户提供的 Cookie 头
- `customHeaders` (String?) — JSON 序列化的自定义 headers
- `originalUrl` / `originalFilename` — auto-rename 前的值（用于 UI 显示）

新建 `DownloadLog` 表：
- `id`, `taskId`, `level` (info|warn|error), `message`, `createdAt`
- `@@index([taskId, createdAt])` — 按任务查日志的索引
- `onDelete: Cascade` — 删 task 自动删日志

#### 2. `filenameDetect.ts` — 智能文件名识别

优先级：`Content-Disposition` > URL path > URL query `file=` > base64 decode > Content-Type > fallback

支持场景：
- 直接明文 URL: `https://example.com/book.epub` → `book.epub`
- URL 编码中文: `%E4%B8%AD%E6%96%87.epub` → `中文.epub`
- 带查询参数: `book.epub?file=abc` → `book.epub` (剥离 ?)
- URL query `?file=book.epub` → `book.epub` (从 query 提取)
- Base64 编码: `Zm9vYmFyLmVwdWI=` → `foobar.epub` (尝试解码)
- 完全无扩展名: 用 Content-Type 推断 .epub/.pdf/.mobi 等
- 乱码 fallback: `book-<timestamp>.epub`

#### 3. `downloadRunner.ts` — 共享下载执行器

被 `POST create` / `retry` / `batch retry_failed` / `batch resume_all` 共用：

- 流式读取 `response.body.getReader()`，实时统计字节数
- **每秒 throttle 写库**（progress / downloadedBytes / totalBytes / speedBps / etaSeconds）
- 速度算法：最近 5 秒滑动窗口样本平均
- ETA：`(totalBytes - downloadedBytes) / speedBps`
- **每 2 秒独立检查暂停状态**（不被进度更新干扰，确保快速响应暂停）
- 完整日志写入 `DownloadLog` 表（info / warn / error 三级）
- 支持 `cookies` + `customHeaders` 注入到 fetch headers
- 用 `filenameDetect` 在收到响应后智能识别文件名
- 完成后写 `File` + `Book` 表，更新 task 状态为 `completed`

#### 4. API 路由

- `GET /api/download-tasks` — 返回 progress / speed / eta / hasCookies / hasCustomHeaders
- `POST /api/download-tasks` — body 加 `cookies` / `headers` / `batch` 字段
  - `batch: string[]` → 批量创建任务
- `POST /api/download-tasks/[id]` — `retry` 调用 `runDownloadTask`
- `POST /api/download-tasks/batch` — 新增 `action=create` 支持 batch URL 提交
- `GET /api/download-tasks/[id]/logs` — **新端点**，返回任务完整日志
  - 支持 `?level=info|warn|error` & `limit=N` & `offset=N`

#### 5. `RemoteDownloadDialog` 重写 — 单任务 + 批量 + 高级选项

- Tab 切换: Single | Batch
- Single: URL + 可选 filename（提示自动检测）
- Batch: textarea 一行一个 URL，最多 20 个，实时计数
- **Advanced Options 折叠区**（单任务和批量都有）：
  - Cookies textarea（格式：`key1=val1; key2=val2`）
  - Custom Headers 列表（key-value 行，可增删）
  - 说明文字提示类似 `curl -H`

#### 6. `DownloadTasks.tsx` 重写 — 进度条 + 速度 + ETA + 用时

每行任务显示：
- 状态图标 + 文件名 + status badge
- **progress bar** (in_progress / paused / completed)
- `downloadedBytes / totalBytes` + 百分比
- **速度** (B/s, KB/s, MB/s) + **ETA** (5s, 2m30s, 1h5m)
- URL（点击复制）+ 创建时间 + **已用时**
- auto-renamed / cookie / headers badge
- 点击任务行 → 打开 `DownloadTaskDetailModal`
- 3 秒轮询任务列表（有 pending/in_progress 时）
- 1 秒 tick 重渲染刷新用时显示

#### 7. `DownloadTaskDetailModal.tsx` — 任务详情 Modal

- 显示完整日志（info / warn / error 三色）
- 筛选: All / INFO / WARN / ERROR
- Auto-scroll 开关（默认开启）
- 任务元信息: status / 原文件名 → 新文件名 / Cookie / Headers
- 2 秒轮询日志 + 任务状态
- 用 `useRef` + `useEffect deps=[task?.status]` 避免无限重渲染

### Fixed — v8.9.0 CI 稳定化

- `94cc02c` `filenameDetect.ts` `noUncheckedIndexedAccess` 修复
  - `starMatch[1]` → 加 `starMatch && starMatch[1]` 守卫
  - `plainMatch[1]` → 加 `plainMatch && plainMatch[1]` 守卫
  - `split(';')[0]` → 用中间变量 + `|| ''` 兜底

### CI Status
- ✅ Docker Image workflow — `build-and-push` success
- ✅ CI workflow — `Build Docker image` + `Smoke test` 全部通过
- 镜像已推送：`ghcr.io/cshdotcom/readest-lite:8.9.0` / `8.9` / `latest`

## [v8.8.0] — 2026-06-21

### Added — 分块上传规避 Cloudflare 524 超时
- `apps/readest-app/src/utils/localStorage.ts`
  - `createPartWriteStream(fileKey, index, total)` — 写第 N 块到
    `<fileKey>.parts/<NNNNN>`（5 位补零，确保字典序 == 数字序）。
    当 `index === 0` 时先清空 parts 目录，避免上次失败上传的残留 part
    干扰本次 merge 校验。
  - `mergePartsForKey(fileKey, expectedTotal)` — 校验 part 数量 + 名称
    后，用 `Readable.from(async generator)` + `stream/promises.pipeline`
    流式合并所有 parts 到 `<fileKey>`（不一次性 buffer 整个大文件到内存），
    最后删除 `.parts` 目录。
- `apps/readest-app/src/pages/api/storage/_put.ts` — 三个分支
  - `merge=1&total=M` → 调 `mergePartsForKey` 触发流式合并
  - `index=N&total=M` → 调 `createPartWriteStream` 写第 N 块
  - 无额外参数 → 旧的整文件直传路径（小文件 + Tauri 客户端）

### Changed — webUpload 自动分块
- `apps/readest-app/src/utils/transfer.ts` 的 `webUpload`
  - 文件 <= 5MB：单次 PUT（旧路径，零行为变化）
  - 文件  > 5MB：切成 5MB 块，串行 PUT 每块到
    `/api/storage/_put?...&index=N&total=M`，
    最后再发一次 `PUT &merge=1&total=M` 触发服务端合并
  - 进度回调跨块累计 `progress` / `total`，UI 显示连续进度条
  - URL 解析用 `window.location.href` 作 base，兼容绝对 URL
    （`PUBLIC_BASE_URL` 反代场景）和相对 URL（本地直连场景）

### Fixed — Cloudflare 反代下大文件上传 524 超时
- **问题**：用户走 Cloudflare 反代访问时，大文件（>50MB）整传超 100 秒
  触发 CF 524 状态码，上传中断。浏览器控制台报：
  `Failed to load resource: the server responded with a status of 524`
  `File upload failed: Error: Upload failed with status 524`
- **根因**：CF 默认 100 秒硬性 origin response timeout，源服务器在
  接收上传期间不发响应，超时即断。
- **修复**：5MB 块在慢带宽下也能在 ~30 秒内传完，远低于 100 秒限制。
  服务端流式合并在 SSD 上 ~5-10 秒/GB，HDD ~30-60 秒/GB，也不超时。

### Backward Compatibility
- 小文件（<=5MB）走原直传路径，行为完全不变
- Tauri 客户端用 `tauriUpload`（不是 `webUpload`），不受影响
- 旧版客户端继续向新服务端整文件 PUT，依然可用（_put.ts 第 3 分支）
- 新版客户端向旧服务端发 `&index=` 参数会被忽略走整传路径 — 但实际不会
  发生，因为新客户端只 PUT 文件本体，分块参数只在 webUpload 内部加

### CI Status
- ✅ Docker Image workflow — `build-and-push` success
- ✅ CI workflow — `Build Docker image` + `Smoke test` 全部通过
- 镜像已推送：`ghcr.io/cshdotcom/readest-lite:8.8.0` / `8.8` / `latest`

## [v8.7.0] — 2026-06-21

### Added — 跨设备下载任务队列
- `prisma/schema.prisma` — 新增 `DownloadTask` 表（id, userId, url, filename,
  status, error, bookHash, fileSize, createdAt, startedAt, completedAt）
  支持跨设备同步的远程下载任务队列
- `apps/readest-app/src/app/api/download-tasks/route.ts`
  - `GET /api/download-tasks` — 列出当前用户所有任务
  - `POST /api/download-tasks` — 创建任务（异步下载，后台 fetch → 写 File +
    Book 表 → 更新任务状态）
- `apps/readest-app/src/app/api/download-tasks/[id]/route.ts`
  - `DELETE /api/download-tasks/[id]` — 删除单个任务
  - `POST /api/download-tasks/[id]` — 重试 / 暂停 / 恢复（body: `{ action }`）
- `apps/readest-app/src/app/api/download-tasks/batch/route.ts`
  - `POST /api/download-tasks/batch` — 批量操作（retry_failed / pause_all /
    resume_all / clear_completed / clear_failed / clear_all）
- `apps/readest-app/src/app/user/components/DownloadTasks.tsx` — 用户中心
  新增下载任务面板：5s 轮询、状态图标、批量按钮、单条重试/暂停/恢复/删除、
  URL 一键复制
- `apps/readest-app/src/app/user/page.tsx` — 所有用户（不止 admin）可见
  DownloadTasks 面板

### Changed
- `RemoteDownloadDialog.tsx` 简化：POST 创建任务后 toast 提示去用户中心
  查看进度，不再前端 transferStore 跟踪（任务状态已落库，跨设备可见）
- `library/page.tsx` — `refresh-library` 事件改用 `useCallback` 稳定引用，
  确保 `eventDispatcher.off()` 能正确解绑（修复 v8.7.0 CI 失败：
  `Expected 2 arguments, but got 1`）

### Fixed — v8.7.0 CI 稳定化（3 个 follow-up commit）
- `78c0deb` 移除 `[id]/route.ts` 中未使用的 `ALLOWED_EXTENSIONS`
  常量（触发 TS `noUnusedLocals`）
- `78c0deb` 移除 `DownloadTasks.tsx` 中未使用的 `IoAlertCircleOutline`
  import（同样触发 `noUnusedLocals`）
- `e43a3a0` `eventDispatcher.off('refresh-library', handleRefreshLibrary)`
  改为传 2 个参数（API 签名要求 event + callback）

### CI Status
- ✅ Docker Image workflow — `build-and-push` 成功，镜像已推送：
  `ghcr.io/cshdotcom/readest-lite:8.7.0` / `8.7` / `sha-e43a3a0` / `latest`
- ✅ CI workflow — `Build Docker image` + `Smoke test — container starts and
  auth works` 均通过

## [0.1.0] — 2026-06-18

### Added — backend infrastructure
- `prisma/schema.prisma` — 14 tables fully aligned with original Supabase schema
  (User, Book, BookConfig, BookNote, File, BookShare, ReplicaKey, Replica,
  SendAddress, SendAllowedSender, SendInbox, StatBook, StatPage, UsageStat)
- `utils/db.ts` — Prisma client singleton
- `utils/localAuth.ts` — JWT (HS256) sign/verify + email/password login +
  admin user initialization (UUID v5 from ADMIN_EMAIL)
- `utils/localStorage.ts` — local filesystem storage with HMAC-SHA256 signed
  PUT/GET URLs (drop-in replacement for R2/S3 presigned URLs)
- `utils/crdt.ts` — CRDT merge functions reimplemented in TypeScript
  (hlcMax, crdtMergeFields, crdtComputeUpdatedAt, crdtMergeReplica,
  stripCipherEnvelopes) — equivalent to Postgres PL/pgSQL RPCs
  `crdt_merge_replica`, `crdt_merge_fields`, `crdt_compute_updated_at`,
  `hlc_max`, `replica_keys_forget`
- `utils/supabase.ts` — pseudo `@supabase/supabase-js` client that routes
  auth calls to local `/auth/v1/*` (zero frontend changes)
- `utils/access.ts` — `validateUserAndToken` rewritten to verify local JWT;
  all plan/quota helpers return unlimited (Pro system removed)
- `utils/object.ts` — unified facade over `localStorage`
- `utils/usage.ts` — translation usage stats backed by SQLite `UsageStat` table
  (replaces Supabase RPCs `increment_daily_usage` / `get_current_usage`)
- `app/api/auth/[...path]/route.ts` — Supabase Auth v1 compatibility shim
  implementing `signup` (403), `token?grant_type=password`,
  `token?grant_type=refresh_token`, `user`, `logout`, `magiclink` (403),
  `recover` (403), `reset` (403), `verify` (403), `settings`
- `pages/api/storage/_put.ts` — internal PUT endpoint receiving client
  direct-upload bytes (HMAC signature verified, streams to local file)
- `pages/api/storage/_get.ts` — internal GET endpoint streaming local file
  with HTTP Range support (HMAC signature verified)
- `apps/readest-app/scripts/init-admin.ts` — startup script that creates or
  updates the admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars
- `docker/entrypoint.sh` — startup script: `prisma db push` + `init-admin` +
  `node server.js`
- `.env.example` — full env var template
- `Dockerfile` — multi-stage build (dependencies → build → production)
- `docker-compose.yml` — single-container orchestration with `/data` volume
- `DEPLOY.md` — full deployment + verification guide
- `FRONTEND_CHANGES.md` — line-precise diff of frontend deletions
- `PROJECT_STRUCTURE.md` — directory layout after refactor
- `.github/workflows/ci.yml` — CI: install + Prisma generate + build-web + Docker build
- `.github/workflows/docker-image.yml` — build and push Docker image to GHCR

### Replaced — backend API routes (supabase → prisma)
- `pages/api/sync.ts` — main sync API (GET/POST) with last-writer-wins +
  soft-delete union + stat_pages pickWinningPages
- `pages/api/sync/replicas.ts` — CRDT replica sync (GET/POST) with
  `crdtMergeReplica` per-row merge
- `pages/api/sync/replica-keys.ts` — PBKDF2-600k-SHA256 salt list/create/forget
- `pages/api/storage/{upload,download,list,delete,purge,stats}.ts` —
  all storage endpoints; quota enforcement removed (unlimited)
- `pages/api/send/{address,senders,inbox,inbox/claim,inbox/file,
  inbox/[id]/payload,inbox/[id]/transition,fetch-url}.ts` —
  all Send-to-Readest endpoints; `claim` uses optimistic locking instead of
  `FOR UPDATE SKIP LOCKED`
- `pages/api/user/delete.ts` — disabled (protects the only admin)
- `pages/api/deepl/translate.ts` — usage stats written to SQLite `UsageStat`
- `app/api/share/{create,list,[token],[token]/download,[token]/download/confirm,
  [token]/import,[token]/revoke,[token]/cover,[token]/og.png}.ts` —
  all share endpoints with identical paths/status codes/error codes
- `libs/shareServer.ts` — `resolveActiveShare` + `rejectionToHttp` rewritten
  with Prisma

### Replaced — frontend
- `app/auth/page.tsx` — reduced from 454 lines (OAuth + Magic Link +
  Apple Sign-In + social login) to ~100 lines (email/password only)
- `hooks/useQuotaStats.ts` — returns unlimited quotas
- `services/constants.ts` — `DEFAULT_STORAGE_QUOTA` and
  `DEFAULT_DAILY_TRANSLATION_QUOTA` set to `Number.MAX_SAFE_INTEGER`
- `app/library/components/SettingsMenu.tsx` — removed "Upgrade to Readest
  Premium" menu item (lines 441-444) and `handleUpgrade` function
- `components/settings/integrations/SendToReadestForm.tsx` — removed
  `userPlan` state, `canUseEmailIn` gate, and the entire upgrade card
  UI block (lines 226-253); removed `getUserProfilePlan`/`isEmailInPlan`
  imports
- `app/user/page.tsx` — completely rewritten: removed `PlansComparison`,
  `Checkout`, all Stripe/IAP handlers, `useAvailablePlans` hook;
  kept account info, usage stats, account actions, storage manager,
  shared links, sync settings
- `app/user/components/UserInfo.tsx` — `planDetails` now optional
  (renders no badge when null)
- `services/translators/providers/deepl.ts` — removed `getSubscriptionPlan`/
  `getTranslationQuota` imports and plan-gated quota logic
- `hooks/useTranslator.ts` — replaced "Upgrade your plan" toast message with
  generic "Please try again later"

### Deleted — backend
- `app/api/stripe/{check,checkout,plans,portal,webhook}/` — 5 Stripe routes
- `app/api/apple/iap-verify/` — Apple IAP verification
- `app/api/google/iap-verify/` — Google IAP verification
- `libs/payment/` — entire payment library (Stripe + IAP + storage helper)

### Deleted — frontend
- `app/user/components/{PlanActionButton,PlanCard,PlanIndicators,
  PlanNavigation,PlansComparison,PurchaseCallToActions,Checkout}.tsx` —
  7 Pro UI components
- `app/user/utils/plan.ts` — plan details helper
- `app/user/subscription/` — subscription success page
- `hooks/useAvailablePlans.ts` — Stripe/IAP plan fetcher
- `types/payment.ts` — payment type definitions
- `app/auth/utils/` — Tauri-specific OAuth helpers (no longer used)

### Deleted — non-web infrastructure (out of scope for single-container)
- `apps/readest-app/src-tauri/` — Tauri native shell (desktop/mobile)
- `apps/readest.koplugin/` — KOReader plugin
- `fastlane/` — mobile release pipeline
- `data/`, `apps/readest-app/data/` — screenshots and metadata
- `apps/readest-app/{e2e,bench,workers,extensions,docs}/` — test/bench/worker
  code not needed for the lite build
- `apps/readest-app/src/__tests__/` — Vitest test suite (would require
  significant updates; CI runs build only)
- `.github/workflows/{android-e2e,nightly,release,scorecard,upload-to-r2,
  vercel-merge}.yml` — CI for upstream release infrastructure

### Preserved — untouched
- All reader core (foliate-js, pdfjs, simplecc-wasm, jieba-wasm)
- All client sync logic (`services/sync/*`, `libs/sync.ts`,
  `libs/replicaSyncClient.ts`, `libs/replicaSyncServer.ts`,
  `libs/replicaSchemas.ts`, `libs/crdt.ts`)
- All client share logic (`libs/share.ts`, `libs/shareImport.ts`)
- All client transfer logic (`services/transferManager.ts`, `utils/transfer.ts`)
- All transparent proxy routes (`kosync.ts`, `app/api/{ai,tts,metadata,opds,
  hardcover}/`) — only `validateUserAndToken` swapped to local impl
- `context/AuthContext.tsx` — works as-is via pseudo supabase client
- `helpers/auth.ts` — works as-is via pseudo supabase client
- `app/auth/{callback,error,recovery,update}/` — works as-is
- All UI components (except the 7 Pro components deleted)
- `middleware.ts` — CORS/COEP unchanged
- `next.config.mjs` — unchanged
- `services/send/sendAddress.ts` — address generation logic unchanged
- All Tauri-side `services/{nativeAppService,nodeAppService}.ts` (kept for
  type compatibility; not invoked in web-only build)

### Key contracts preserved (1:1 with upstream)
- `/api/sync` GET/POST — request shape, response shape, last-writer-wins,
  soft-delete union, stat_pages duration-wins, books.progress piggyback
- `/api/sync/replicas` GET/POST — HLC-based cursor, `cursors` batch pull,
  `rows` push, CRDT merge semantics (remove-wins, deviceId tiebreak,
  reincarnation, manifest null-preservation)
- `/api/sync/replica-keys` GET/POST/DELETE — `pbkdf2-600k-sha256` only,
  32-byte random salt, base64 wire format, cipher envelope stripping on forget
- `/api/storage/*` — `uploadUrl`/`downloadUrl`/`fileKey`/`usage`/`quota`
  response fields; `file_key` naming `${userId}/Readest/Books/<hash>.<ext>`;
  presigned URL TTL 1800s; temp upload TTL 3 days; `isSafeObjectKeyName`
  traversal protection
- `/api/share/*` — paths, status codes (400/404/409/410/429), error codes
  (`invalid_token`/`not_found`/`revoked`/`expired`/`source_deleted`/
  `book_not_uploaded`/`upload_incomplete`/`share_limit_reached`/
  `quota_exceeded`), `SHARE_MAX_PER_USER=50`, atomic `download_count`
  increment via conditional update
- `/auth/v1/*` — supabase-js compatible paths and response shapes;
  JWT HS256 with `sub`/`aud`/`exp`/`email`/`plan`/`storage_usage_bytes`/
  `storage_purchased_bytes` claims
- `runtime-config.js` — still returns `supabaseUrl`/`supabaseAnonKey`/
  `apiBaseUrl`/`objectStorageType`/`storageFixedQuota`/
  `translationFixedQuota` (frontend boot expects these)

### Operational notes
- Single Docker image, single container, port 8225
- Data volume `/data` (SQLite db at `/data/db/readest.db`, books at
  `/data/books/`, inbox at `/data/inbox/`)
- Container restart auto-runs `prisma db push` (schema sync) and
  `init-admin` (idempotent admin creation/password sync)
- JWT secret rotates via env var `JWT_SECRET`; access token TTL 7 days,
  refresh token TTL 30 days (configurable)
- SQLite WAL mode enabled by Prisma for concurrent read/write
- No file count or size limits (Pro system removed)
