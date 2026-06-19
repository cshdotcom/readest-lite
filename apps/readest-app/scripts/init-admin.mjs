// init-admin.mjs — 管理员初始化脚本（多用户版）
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const appDir = '/app/apps/readest-app';
const require = createRequire(path.join(appDir, 'package.json'));

let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e1) {
  const prismaPath = require.resolve('@prisma/client', { paths: [appDir] });
  PrismaClient = (await import(pathToFileURL(prismaPath).href)).PrismaClient;
}

let argon2;
try {
  argon2 = require('argon2');
} catch (e1) {
  const argon2Path = require.resolve('argon2', { paths: [appDir] });
  argon2 = (await import(pathToFileURL(argon2Path).href)).default;
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL || 'file:/data/db/readest.db' } },
});

const uuidV5 = (name, namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8') => {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
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
  console.log('[init] looking for admin user:', userId);

  const existing = await prisma.user.findUnique({ where: { id: userId } });

  if (existing) {
    let needUpdate = false;
    const updateData = {};

    // 检查密码
    try {
      if (!(await argon2.verify(existing.encryptedPass, password))) {
        updateData.encryptedPass = await argon2.hash(password);
        needUpdate = true;
      }
    } catch {
      updateData.encryptedPass = await argon2.hash(password);
      needUpdate = true;
    }

    // 确保 role 是 admin
    if (existing.role !== 'admin') {
      updateData.role = 'admin';
      needUpdate = true;
    }

    if (needUpdate) {
      await prisma.user.update({ where: { id: userId }, data: updateData });
      console.log(`[init] admin user updated: ${email}`);
    } else {
      console.log(`[init] admin user exists: ${email} (no changes needed)`);
    }
  } else {
    const encryptedPass = await argon2.hash(password);
    await prisma.user.create({
      data: {
        id: userId,
        email,
        encryptedPass,
        role: 'admin',
      },
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
