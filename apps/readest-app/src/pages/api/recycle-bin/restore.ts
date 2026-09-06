// v8.19.0: Restore items from recycle bin
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  const { ids } = req.body as { ids?: string[] };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Missing ids array' });
  }

  try {
    const items = await prismaClient.recycleBinItem.findMany({
      where: { userId: user.id, id: { in: ids } },
    });

    // Restore: undelete the Book row + delete recycle bin item
    for (const item of items) {
      await prismaClient.book.updateMany({
        where: { userId: user.id, bookHash: item.bookHash },
        data: { deletedAt: null, updatedAt: new Date() },
      });
      await prismaClient.recycleBinItem.delete({ where: { id: item.id } });
    }

    return res.status(200).json({ ok: true, restored: items.length });
  } catch (error) {
    console.error('Recycle bin restore failed:', error);
    return res.status(500).json({ error: 'Could not restore items' });
  }
}
