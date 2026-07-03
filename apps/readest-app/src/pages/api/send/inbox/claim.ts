// 改造自原 src/pages/api/send/inbox/claim.ts。
// 替代 RPC claim_inbox_item（FOR UPDATE SKIP LOCKED）——
// SQLite 不支持 SKIP LOCKED；改用 status='pending' OR (status='claimed' AND claimedAt < now-15min) 的查询，
// 再用乐观更新（updateMany where 状态匹配）实现伪 SKIP LOCKED。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  const device = String(req.body?.device ?? '').slice(0, 100);
  if (!device) return res.status(400).json({ error: 'Missing device id' });

  const leaseExpired = new Date(Date.now() - 15 * 60 * 1000);
  // 找最旧的 pending 或租约过期的 claimed
  const candidate = await prismaClient.sendInbox.findFirst({
    where: {
      userId: user.id,
      OR: [{ status: 'pending' }, { status: 'claimed', claimedAt: { lt: leaseExpired } }],
    },
    orderBy: { createdAt: 'asc' as const },
  });
  if (!candidate) return res.status(200).json({ item: null });

  // 乐观更新：仅当状态未变时才认领
  const result = await prismaClient.sendInbox.updateMany({
    where: { id: candidate.id, status: candidate.status },
    data: { status: 'claimed', claimedBy: device, claimedAt: new Date(), updatedAt: new Date() },
  });
  if (result.count === 0) {
    // 被并发抢走，递归重试一次
    return handler(req, res);
  }
  const item = await prismaClient.sendInbox.findUnique({ where: { id: candidate.id } });
  return res.status(200).json({ item });
}
