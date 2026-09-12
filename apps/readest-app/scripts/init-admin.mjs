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
  // v8.1.0：可选的管理员显示名
  const displayName = (process.env.ADMIN_USERNAME || '').trim() || null;
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

    // v8.23: 计算 targetRole — 如果 SUPER_ADMIN_EMAIL == ADMIN_EMAIL，则 super_admin，否则 admin
    const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
    const targetRole = (superEmail && superEmail === email) ? 'super_admin' : 'admin';

    // 确保 role 正确（不要降级已有的 super_admin）
    if (existing.role !== targetRole) {
      updateData.role = targetRole;
      needUpdate = true;
    }

    // v8.1.0：如果 env 设了 ADMIN_USERNAME 且 DB 里 displayName 为空，回填一次
    // 不覆盖用户在 UI 里改过的 displayName
    if (displayName && !existing.displayName) {
      updateData.displayName = displayName;
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
    // v8.23: 用 targetRole 而非硬编码 admin
    const superEmail2 = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
    const targetRole2 = (superEmail2 && superEmail2 === email) ? 'super_admin' : 'admin';
    await prisma.user.create({
      data: {
        id: userId,
        email,
        encryptedPass,
        role: targetRole2,
        displayName,
      },
    });
    console.log(`[init] admin user created: ${email} (${userId}, role=${targetRole2})`);
  }

  // v8.19.0: 处理 SUPER_ADMIN_EMAIL — 把指定邮箱对应的用户提升为 super_admin
  // 通常是 ADMIN_EMAIL 自身；但也支持另一个独立用户（必须先用管理员创建该用户）。
  const superEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
  if (superEmail) {
    if (superEmail === email) {
      // 与 ADMIN_EMAIL 相同 — 直接把刚才确保过的 admin 升级为 super_admin
      const cur = await prisma.user.findUnique({ where: { id: userId } });
      if (cur && cur.role !== 'super_admin') {
        await prisma.user.update({ where: { id: userId }, data: { role: 'super_admin' } });
        console.log(`[init] super_admin role applied to ADMIN_EMAIL: ${email}`);
      } else if (cur && cur.role === 'super_admin') {
        console.log(`[init] super_admin already set: ${email}`);
      }
    } else {
      // 不同邮箱 — 必须已存在
      const existing = await prisma.user.findUnique({ where: { email: superEmail } });
      if (!existing) {
        console.warn(`[init] SUPER_ADMIN_EMAIL=${superEmail} but no such user. Create it via admin UI first.`);
      } else if (existing.role !== 'super_admin') {
        await prisma.user.update({ where: { id: existing.id }, data: { role: 'super_admin' } });
        console.log(`[init] super_admin role applied to: ${superEmail}`);
      } else {
        console.log(`[init] super_admin already set: ${superEmail}`);
      }
    }
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
