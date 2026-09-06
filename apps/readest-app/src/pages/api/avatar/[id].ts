// v8.19.2: Serve user avatar — hidden from file manager
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { prismaClient } from '@/utils/db';
import { openReadStream } from '@/utils/object';

export const config = { api: { bodyParser: false, responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = String(req.query['id'] ?? '');
  if (!userId) return res.status(400).json({ error: 'Missing user id' });

  try {
    const avatarKey = `avatar/${userId}`;
    const file = await prismaClient.file.findFirst({ where: { fileKey: avatarKey, deletedAt: null } });
    if (!file) return res.status(404).json({ error: 'Avatar not found' });

    const stream = openReadStream(avatarKey);
    stream.on('open', () => {
      res.setHeader('Content-Type', 'image/*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      stream.pipe(res);
    });
    stream.on('error', () => res.status(500).end());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return res.status(404).json({ error: 'Avatar not found' });
    console.error('Avatar serve failed:', err);
    return res.status(500).json({ error: 'Could not serve avatar' });
  }
}
