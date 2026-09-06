// v8.19.1: User avatar upload — stores avatar URL in user record
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  
  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'PUT' || req.method === 'POST') {
    const { avatarUrl } = req.body as { avatarUrl?: string };
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'Missing avatarUrl' });
    }
    if (avatarUrl.length > 2048) {
      return res.status(400).json({ error: 'Avatar URL too long' });
    }

    try {
      await prismaClient.user.update({
        where: { id: user.id },
        data: { avatarUrl },
      });
      return res.status(200).json({ ok: true, avatarUrl });
    } catch (error) {
      console.error('Avatar update failed:', error);
      return res.status(500).json({ error: 'Could not update avatar' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prismaClient.user.update({
        where: { id: user.id },
        data: { avatarUrl: null },
      });
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Avatar delete failed:', error);
      return res.status(500).json({ error: 'Could not delete avatar' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
