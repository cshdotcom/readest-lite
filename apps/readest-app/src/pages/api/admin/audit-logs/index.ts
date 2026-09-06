// v8.19.6: Audit log list — admin only, supports search/filter/sort
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user } = await validateAdmin(req.headers['authorization']);
  if (!user) return res.status(401).json({ error: 'Admin only' });

  const { action, targetUserId, search, sort = 'desc', page = '1', limit = '50' } = req.query;
  const pageNum = parseInt(String(page), 10) || 1;
  const limitNum = Math.min(parseInt(String(limit), 10) || 50, 200);
  const skip = (pageNum - 1) * limitNum;

  const where: { action?: string; targetUserId?: string; OR?: { description: { contains: string } }[] } = {};
  if (action && typeof action === 'string') where['action'] = action;
  if (targetUserId && typeof targetUserId === 'string') where['targetUserId'] = targetUserId;
  if (search && typeof search === 'string') {
    where['OR'] = [
      { description: { contains: search } },
    ];
  }

  try {
    const [logs, total] = await Promise.all([
      prismaClient.auditLog.findMany({
        where,
        orderBy: { createdAt: sort === 'asc' ? 'asc' : 'desc' },
        skip,
        take: limitNum,
      }),
      prismaClient.auditLog.count({ where }),
    ]);

    return res.status(200).json({
      logs: logs.map((l) => ({
        id: l.id,
        userId: l.userId,
        targetUserId: l.targetUserId,
        action: l.action,
        description: l.description,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
        rolledBack: l.rolledBack,
        rolledBackAt: l.rolledBackAt?.toISOString() ?? null,
      })),
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('Audit log list failed:', error);
    return res.status(500).json({ error: 'Could not list audit logs' });
  }
}
