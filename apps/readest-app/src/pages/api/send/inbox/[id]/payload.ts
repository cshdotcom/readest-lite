// 改造自原 src/pages/api/send/inbox/[id]/payload.ts。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { getDownloadSignedUrl } from '@/utils/object';
import { SEND_INBOX_BUCKET } from '@/services/constants';
import { prismaClient } from '@/utils/db';

const DOWNLOAD_TTL_SECONDS = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user } = await validateUserAndToken(req.headers['authorization']);
  if (!user) return res.status(403).json({ error: 'Not authenticated' });

  const id = String(req.query['id'] ?? '');
  if (!id) return res.status(400).json({ error: 'Missing inbox item id' });

  const row = await prismaClient.sendInbox.findUnique({
    where: { id },
    select: { userId: true, payloadKey: true },
  });
  if (!row || row.userId !== user.id) return res.status(404).json({ error: 'Inbox item not found' });
  if (!row.payloadKey) return res.status(409).json({ error: 'Inbox item has no file payload' });

  try {
    const downloadUrl = await getDownloadSignedUrl(row.payloadKey, DOWNLOAD_TTL_SECONDS, SEND_INBOX_BUCKET);
    return res.status(200).json({ downloadUrl });
  } catch (err) {
    console.error('Inbox payload sign failed:', err);
    return res.status(500).json({ error: 'Could not sign payload URL' });
  }
}
