// v8.19.6: Delete audit log entries (super admin only)
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';
import { isSuperAdmin } from '@/utils/permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user } = await validateAdmin(req.headers['authorization']);
  if (!user) return res.status(401).json({ error: 'Admin only' });

  // Only super admin can delete audit logs
  if (!isSuperAdmin({ role: user.role, email: user.email })) {
    return res.status(403).json({ error: 'Super admin only' });
  }

  const { ids, all } = req.body as { ids?: string[]; all?: boolean };

  try {
    if (all) {
      const result = await prismaClient.auditLog.deleteMany({});
      return res.status(200).json({ ok: true, deleted: result.count });
    } else if (ids && Array.isArray(ids)) {
      const result = await prismaClient.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      return res.status(200).json({ ok: true, deleted: result.count });
    } else {
      return res.status(400).json({ error: 'Provide ids array or all: true' });
    }
  } catch (error) {
    console.error('Audit log delete failed:', error);
    return res.status(500).json({ error: 'Could not delete audit logs' });
  }
}
