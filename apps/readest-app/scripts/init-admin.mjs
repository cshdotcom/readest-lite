// init-admin.mjs — 自包含的管理员初始化脚本
// 不依赖 TypeScript 源码链，直接用 PrismaClient + argon2
// 容器启动时由 entrypoint.sh 调用
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// 用 createRequire 从 apps/readest-app 目录解析模块
// 这样能正确解析 pnpm 的符号链接结构
const appDir = '/app/apps/readest-app';
const require = createRequire(path.join(appDir, 'package.json'));

// 尝试多种路径加载 PrismaClient（pnpm 的符号链接结构可能不同）
let PrismaClient;
try {
  const prismaModule = require('@prisma/client');
  PrismaClient = prismaModule.PrismaClient;
} catch (e1) {
  try {
    // fallback: 直接从 .pnpm 目录加载
    const prismaPath = require.resolve('@prisma/client', { paths: [appDir] });
    const prismaModule = await import(pathToFileURL(prismaPath).href);
    PrismaClient = prismaModule.PrismaClient;
  } catch (e2) {
    console.error('[init] Cannot load @prisma/client:', e1.message, e2.message);
    process.exit(1);
  }
}

// 加载 argon2
let argon2;
try {
  argon2 = require('argon2');
} catch (e1) {
  try {
    const argon2Path = require.resolve('argon2', { paths: [appDir] });
    argon2 = (await import(pathToFileURL(argon2Path).href)).default;
  } catch (e2) {
    console.error('[init] Cannot load argon2:', e1.message, e2.message);
    process.exit(1);
  }
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'file:/data/db/readest.db' } },
});

// UUID v5 — 基于 ADMIN_EMAIL 生成确定性 UUID
const uuidV5 = (name, namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8') => {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }

  const userId = uuidV5(email);
  console.log('[init] looking for user:', userId);

  const existing = await prisma.user.findUnique({ where: { id: userId } });

  if (existing) {
    let needUpdate = false;
    try {
      needUpdate = !(await argon2.verify(existing.encryptedPass, password));
    } catch {
      needUpdate = true;
    }
    if (needUpdate) {
      const encryptedPass = await argon2.hash(password);
      await prisma.user.update({
        where: { id: userId },
        data: { encryptedPass, email },
      });
      console.log(`[init] admin password updated for ${email}`);
    } else {
      console.log(`[init] admin user exists: ${email} (password unchanged)`);
    }
  } else {
    const encryptedPass = await argon2.hash(password);
    await prisma.user.create({
      data: { id: userId, email, encryptedPass },
    });
    console.log(`[init] admin user created: ${email} (${userId})`);
  }
}

try {
  await main();
  console.log('[init] done.');
} catch (e) {
  console.error('[init] failed:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
