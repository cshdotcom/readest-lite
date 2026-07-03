// 改造自原 src/pages/api/send/address.ts。
// Pro 校验移除（plan 永远为 pro）；supabase → prisma。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import {
  generateSendAddress,
  buildSendAddress,
  sanitizeSlug,
  isReservedSlug,
  normalizeSenderEmail,
} from '@/services/send/sendAddress';
import { SEND_EMAIL_DOMAIN } from '@/services/constants';
import { prismaClient } from '@/utils/db';

const MAX_COLLISION_RETRIES = 5;
const fullAddress = (localPart: string) => `${localPart}@${SEND_EMAIL_DOMAIN}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  // Pro 校验移除（恒为 pro）

  if (req.method === 'GET') {
    const data = await prismaClient.sendAddress.findUnique({ where: { userId: user.id } });
    if (data) {
      return res.status(200).json({ address: fullAddress(data.address), enabled: data.enabled });
    }
    // 懒创建
    const created = await insertWithRetry(user.id, user.email ?? user.id);
    if (!created) return res.status(500).json({ error: 'Could not allocate an address' });
    if (user.email) await seedOwnEmail(user.id, user.email);
    return res.status(200).json({ address: fullAddress(created), enabled: true });
  }

  if (req.method === 'POST') {
    let customSlug: string | undefined;
    if (req.body?.slug !== undefined) {
      customSlug = sanitizeSlug(String(req.body.slug));
      if (!customSlug) return res.status(400).json({ error: 'Name must contain letters or digits' });
      if (isReservedSlug(customSlug)) return res.status(400).json({ error: 'That name is reserved' });
    }
    for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
      const localPart = customSlug ? buildSendAddress(customSlug) : generateSendAddress(user.email ?? user.id);
      try {
        await prismaClient.sendAddress.upsert({
          where: { userId: user.id },
          create: { userId: user.id, address: localPart, enabled: true, rotatedAt: new Date() },
          update: { address: localPart, enabled: true, rotatedAt: new Date() },
        });
        return res.status(200).json({ address: fullAddress(localPart), enabled: true });
      } catch (err) {
        // SQLite UNIQUE 约束违反：地址冲突 → 重试
        if (!String((err as Error).message).includes('UNIQUE')) {
          return res.status(500).json({ error: (err as Error).message });
        }
      }
    }
    return res.status(500).json({ error: 'Could not allocate an address' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function seedOwnEmail(userId: string, email: string) {
  const normalized = normalizeSenderEmail(email);
  if (!normalized) return;
  await prismaClient.sendAllowedSender.upsert({
    where: { userId_email: { userId, email: normalized } },
    create: { userId, email: normalized, status: 'approved' },
    update: { status: 'approved' },
  });
}

async function insertWithRetry(userId: string, identity: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
    const localPart = generateSendAddress(identity);
    try {
      await prismaClient.sendAddress.create({ data: { userId, address: localPart, enabled: true } });
      return localPart;
    } catch (err) {
      if (String((err as Error).message).includes('UNIQUE')) {
        const existing = await prismaClient.sendAddress.findUnique({ where: { userId } });
        if (existing) return existing.address;
      } else {
        return null;
      }
    }
  }
  return null;
}
