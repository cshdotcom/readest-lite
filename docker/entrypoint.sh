#!/bin/sh
# Readest Lite 容器启动入口
# 1. 初始化 SQLite 数据库 schema
# 2. 创建/更新管理员账号
# 3. 启动 Next.js standalone server
set -e

echo "[entrypoint] initializing SQLite database..."
mkdir -p /data/db /data/books /data/inbox

# prisma db push 同步 schema（无 migration 历史，直接 push）
cd /app/apps/readest-app
node /app/node_modules/prisma/build/index.js db push --schema=/app/prisma/schema.prisma --accept-data-loss=false

# 初始化管理员账号
echo "[entrypoint] ensuring admin user..."
cd /app/apps/readest-app
node --experimental-strip-types /app/apps/readest-app/scripts/init-admin.ts

# 启动 Next.js standalone server
echo "[entrypoint] starting Next.js on port ${PORT:-8225}..."
cd /app
exec node apps/readest-app/server.js
