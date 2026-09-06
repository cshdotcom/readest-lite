// v8.19.0: Permanently delete items from recycle bin
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { deleteObject } from '@/utils/object';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  const { ids, all } = req.body as { ids?: string[]; all?: boolean };

  try {
    let items;
    if (all) {
      items = await prismaClient.recycleBinItem.findMany({ where: { userId: user.id } });
    } else if (ids && Array.isArray(ids)) {
      items = await prismaClient.recycleBinItem.findMany({
        where: { userId: user.id, id: { in: ids } },
      });
    } else {
      return res.status(400).json({ error: 'Provide ids array or all: true' });
    }

    // Permanently delete Book rows + file refs + physical files
    for (const item of items) {
      // Delete Book row
      await prismaClient.book.deleteMany({
        where: { userId: user.id, bookHash: item.bookHash },
      });
      // Delete File rows
      const files = await prismaClient.file.findMany({
        where: { userId: user.id, bookHash: item.bookHash },
      });
      for (const file of files) {
        if (file.fileKey && file.originalFileKey === null) {
          // This is the original file — decrement refCount, delete if 0
          await prismaClient.file.updateMany({
            where: { fileKey: file.fileKey },
            data: { refCount: { decrement: 1 } },
          });
          const updated = await prismaClient.file.findUnique({ where: { fileKey: file.fileKey } });
          if (updated && updated.refCount <= 0) {
            try { await deleteObject(file.fileKey); } catch {}
          }
        } else if (file.fileKey && file.originalFileKey) {
          // Reference — decrement original's refCount
          await prismaClient.file.updateMany({
            where: { fileKey: file.originalFileKey },
            data: { refCount: { decrement: 1 } },
          });
        }
        await prismaClient.file.delete({ where: { id: file.id } });
      }
      // Delete recycle bin item
      await prismaClient.recycleBinItem.delete({ where: { id: item.id } });
    }

    return res.status(200).json({ ok: true, deleted: items.length });
  } catch (error) {
    console.error('Recycle bin clear failed:', error);
    return res.status(500).json({ error: 'Could not clear items' });
  }
}
