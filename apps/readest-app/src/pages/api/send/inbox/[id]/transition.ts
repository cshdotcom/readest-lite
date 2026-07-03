// 改造自原 src/pages/api/send/inbox/[id]/transition.ts。
// 替代 RPC renew_inbox_claim / complete_inbox_item / fail_inbox_item。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  const id = String(req.query['id'] ?? '');
  const action = String(req.body?.action ?? '');
  const device = String(req.body?.device ?? '').slice(0, 100);
  if (!id || !device) return res.status(400).json({ error: 'Missing item id or device' });

  let count = 0;
  if (action === 'renew') {
    count = (await prismaClient.sendInbox.updateMany({
      where: { id, userId: user.id, status: 'claimed', claimedBy: device },
      data: { claimedAt: new Date(), updatedAt: new Date() },
    })).count;
  } else if (action === 'complete') {
    count = (await prismaClient.sendInbox.updateMany({
      where: { id, userId: user.id, status: 'claimed', claimedBy: device },
      data: { status: 'done', error: null, updatedAt: new Date() },
    })).count;
  } else if (action === 'fail') {
    const error = String(req.body?.error ?? '').slice(0, 500);
    const cur = await prismaClient.sendInbox.findUnique({ where: { id } });
    if (cur && cur.userId === user.id && cur.status === 'claimed' && cur.claimedBy === device) {
      const newAttempts = cur.attempts + 1;
      const newStatus = newAttempts >= 3 ? 'failed' : 'pending';
      count = (await prismaClient.sendInbox.updateMany({
        where: { id, userId: user.id, status: 'claimed', claimedBy: device },
        data: {
          attempts: newAttempts,
          status: newStatus,
          error,
          claimedBy: null,
          claimedAt: null,
          updatedAt: new Date(),
        },
      })).count;
    }
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }
  return res.status(200).json({ ok: count > 0 });
}
