# ───────────────────────────────────────────────────────────────────────────
# Readest Lite — 多阶段构建 Dockerfile
# 单镜像：Next.js standalone + Prisma + SQLite + 本地文件存储
# ───────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependencies ──────────────────────────────────────────────────
FROM docker.io/library/node:24-slim AS dependencies
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
# 安装 git 用于 clone 子模块（foliate-js 与 simplecc-wasm）
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 拷贝 monorepo 配置 + 应用 package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/readest-app/package.json ./apps/readest-app/
COPY patches/ ./patches/

# Clone 必需的 git submodule（原项目用 .gitmodules，但 Docker 构建上下文里这些目录为空，
# 这里直接 git clone --depth 1 取 main 分支）。
# 仅 clone web 构建需要的两个：foliate-js（workspace 包 + pdfjs vendors）+ simplecc-wasm（dist/web/*）。
# tauri/tauri-plugins/qcms/js-mdict 在 web 构建中不需要。
RUN git clone --depth 1 https://github.com/readest/foliate-js.git packages/foliate-js \
    && git clone --depth 1 https://github.com/readest/simplecc-wasm.git packages/simplecc-wasm

# 安装依赖（包含 Prisma CLI 与 argon2/jwt 等新增依赖）
# 注 1：原 lockfile 未包含新增的 @prisma/client/argon2/jsonwebtoken 等，所以用
# --no-frozen-lockfile 让 pnpm 解析并更新 lockfile。如需可重现构建，可在本地
# 跑一次 pnpm install 后提交更新后的 pnpm-lock.yaml，再改回 --frozen-lockfile。
# 注 2：pnpm 11 默认跳过依赖的 build scripts（安全考虑），但 @prisma/client /
# argon2 / prisma 都需要在 install 时跑 native build。用
# --config.dangerouslyAllowAllBuilds=true 显式放行（与 pnpm-workspace.yaml
# 的 onlyBuiltDependencies 二选一即可，这里双保险）。
RUN --mount=type=cache,id=pnpm,sharing=locked,target=/pnpm/store \
    pnpm install --no-frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# 验证 submodule 已正确 clone
RUN test -f packages/foliate-js/vendor/pdfjs/annotation_layer_builder.css \
    && test -d packages/simplecc-wasm/dist/web \
    || { printf '\nERROR: Required submodules are not initialized.\n'; exit 1; }

# 拷贝 vendor 资源到 public/vendor
RUN pnpm --filter @readest/readest-app setup-vendors

# ── Stage 2: build ─────────────────────────────────────────────────────────
FROM docker.io/library/node:24-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

# 构建参数（与原项目一致 — 但 SUPABASE_URL 指向本地）
ARG NEXT_PUBLIC_SUPABASE_URL=http://localhost:8225
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=anon
ARG NEXT_PUBLIC_APP_PLATFORM=web
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8225/api
ARG NEXT_PUBLIC_OBJECT_STORAGE_TYPE=local
ARG NEXT_PUBLIC_STORAGE_FIXED_QUOTA=0
ARG NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA=0

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_PLATFORM=$NEXT_PUBLIC_APP_PLATFORM
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_OBJECT_STORAGE_TYPE=$NEXT_PUBLIC_OBJECT_STORAGE_TYPE
ENV NEXT_PUBLIC_STORAGE_FIXED_QUOTA=$NEXT_PUBLIC_STORAGE_FIXED_QUOTA
ENV NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA=$NEXT_PUBLIC_TRANSLATION_FIXED_QUOTA

# 从 dependencies 阶段拷贝已安装好的 node_modules 和 packages 子模块
COPY --from=dependencies /app/node_modules /app/node_modules
COPY --from=dependencies /app/apps/readest-app/node_modules /app/apps/readest-app/node_modules
COPY --from=dependencies /app/apps/readest-app/public/vendor /app/apps/readest-app/public/vendor
COPY --from=dependencies /app/packages/foliate-js /app/packages/foliate-js
COPY --from=dependencies /app/packages/foliate-js/node_modules /app/packages/foliate-js/node_modules
COPY --from=dependencies /app/packages/simplecc-wasm /app/packages/simplecc-wasm

# 拷贝项目源码
COPY . .

WORKDIR /app/apps/readest-app

# 生成 Prisma Client
RUN pnpm exec prisma generate --schema=../../prisma/schema.prisma

# Opt-in standalone build
ENV BUILD_STANDALONE=true
RUN pnpm build-web

# ── Stage 3: production runtime ────────────────────────────────────────────
FROM docker.io/library/node:24-slim AS production
ENV NODE_ENV=production
ENV PORT=8225
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# 安装最小运行时依赖：openssl（argon2 需要）、sqlite3（prisma 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 拷贝 standalone 构建产物
COPY --from=build --chown=node:node /app/apps/readest-app/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/readest-app/.next/static ./apps/readest-app/.next/static
COPY --from=build --chown=node:node /app/apps/readest-app/public ./apps/readest-app/public

# 拷贝 Prisma schema + init 脚本
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/readest-app/scripts ./apps/readest-app/scripts

# 拷贝运行时需要的 node_modules（standalone trace 通常已包含 @prisma/client/argon2/jsonwebtoken，
# 但 prisma CLI 二进制需要单独拷贝用于 db push）。
COPY --from=build --chown=node:node /app/apps/readest-app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=build --chown=node:node /app/apps/readest-app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/apps/readest-app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=node:node /app/apps/readest-app/node_modules/argon2 ./node_modules/argon2
COPY --from=build --chown=node:node /app/apps/readest-app/node_modules/jsonwebtoken ./node_modules/jsonwebtoken
COPY --from=build --chown=node:node /app/apps/readest-app/node_modules/@types/jsonwebtoken ./node_modules/@types/jsonwebtoken

# 创建数据目录
RUN mkdir -p /data/db /data/books /data/inbox && chown -R node:node /data

USER node

EXPOSE 8225

# 启动脚本：先 prisma db push 同步 schema + 初始化管理员，再启 Next.js
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
