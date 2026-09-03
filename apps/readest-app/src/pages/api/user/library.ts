import type { NextApiRequest, NextApiResponse } from 'next';
import { prismaClient } from '@/utils/db';
import { getAuthUser } from '@/utils/localAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Delete all books for this user via Prisma
    // Also delete related book_configs and book_notes (cascade)
    await prismaClient.$transaction([
      prismaClient.bookNote.deleteMany({ where: { userId: user.id } }),
      prismaClient.bookConfig.deleteMany({ where: { userId: user.id } }),
      prismaClient.book.deleteMany({ where: { userId: user.id } }),
    ]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete all books error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
