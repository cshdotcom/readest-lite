#!/bin/sh
# Readest Lite 容器启动入口
# 1. 初始化 SQLite 数据库 schema
# 2. 创建/更新管理员账号
# 3. 启动 Next.js standalone server
set -e

echo "[entrypoint] initializing data directories..."
mkdir -p /data/db /data/books/uploads /data/books/covers /data/inbox

# 如果 config.json 不存在，写入默认配置
if [ ! -f /data/config.json ]; then
  echo '{"version":1,"createdAt":"'$(date -Iseconds)'"}' > /data/config.json
fi

# prisma db push 同步 schema（无 migration 历史，直接 push）
# 用 apps/readest-app/node_modules 下的 prisma CLI（完整依赖树）
echo "[entrypoint] pushing prisma schema..."
cd /app/apps/readest-app
node ./node_modules/prisma/build/index.js db push --schema=/app/prisma/schema.prisma --accept-data-loss=false 2>&1 | tail -5

# 初始化管理员账号（幂等：存在则更新密码，不存在则创建）
echo "[entrypoint] ensuring admin user..."
node --experimental-strip-types /app/apps/readest-app/scripts/init-admin.ts 2>&1 | tail -3

# 启动 Next.js standalone server
echo "[entrypoint] starting Next.js on port ${PORT:-8225}..."
cd /app
exec node apps/readest-app/server.js
