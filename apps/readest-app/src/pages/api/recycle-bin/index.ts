// v8.19.0: Recycle bin — list items, auto-cleanup expired
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

const DEFAULT_EXPIRE_DAYS = 30;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    // Auto-cleanup expired items
    await prismaClient.recycleBinItem.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    const items = await prismaClient.recycleBinItem.findMany({
      where: { userId: user.id },
      orderBy: { deletedAt: 'desc' },
    });

    return res.status(200).json({
      items: items.map((item) => ({
        id: item.id,
        bookHash: item.bookHash,
        bookTitle: item.bookTitle,
        bookFormat: item.bookFormat,
        deletedAt: item.deletedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
      expireDays: parseInt(process.env['RECYCLE_BIN_EXPIRE_DAYS'] || String(DEFAULT_EXPIRE_DAYS), 10),
    });
  } catch (error) {
    console.error('Recycle bin list failed:', error);
    return res.status(500).json({ error: 'Could not list recycle bin' });
  }
}
