// v8.19.6: Rollback an audit log entry
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user } = await validateAdmin(req.headers['authorization']);
  if (!user) return res.status(401).json({ error: 'Admin only' });

  const { ids } = req.body as { ids?: string[] };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Missing ids array' });
  }

  const results: { id: string; ok: boolean; reason?: string }[] = [];

  for (const logId of ids) {
    try {
      const log = await prismaClient.auditLog.findUnique({ where: { id: logId } });
      if (!log) {
        results.push({ id: logId, ok: false, reason: 'Log not found' });
        continue;
      }
      if (log.rolledBack) {
        results.push({ id: logId, ok: false, reason: 'Already rolled back' });
        continue;
      }

      const meta = log.metadata ? JSON.parse(log.metadata) : {};

      // Rollback logic per action type
      if (log.action === 'book_move') {
        // Restore book to original user
        if (meta.bookHash && meta.originalUserId) {
          await prismaClient.book.updateMany({
            where: { bookHash: meta.bookHash, userId: meta.targetUserId ?? '' },
            data: { userId: meta.originalUserId },
          });
        }
      } else if (log.action === 'book_delete') {
        // Restore from recycle bin
        if (meta.bookHash && meta.targetUserId) {
          await prismaClient.book.updateMany({
            where: { userId: meta.targetUserId, bookHash: meta.bookHash },
            data: { deletedAt: null },
          });
          await prismaClient.recycleBinItem.deleteMany({
            where: { userId: meta.targetUserId, bookHash: meta.bookHash },
          });
        }
      } else if (log.action === 'role_change') {
        // Restore original role
        if (meta.targetUserId && meta.originalRole) {
          await prismaClient.user.update({
            where: { id: meta.targetUserId },
            data: { role: meta.originalRole },
          });
        }
      } else if (log.action === 'user_delete') {
        results.push({ id: logId, ok: false, reason: 'Cannot rollback user deletion' });
        continue;
      } else {
        results.push({ id: logId, ok: false, reason: 'Action type not rollbackable' });
        continue;
      }

      // Mark as rolled back
      await prismaClient.auditLog.update({
        where: { id: logId },
        data: { rolledBack: true, rolledBackAt: new Date() },
      });
      results.push({ id: logId, ok: true });
    } catch (err) {
      results.push({ id: logId, ok: false, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return res.status(200).json({ ok: true, succeeded, failed, results });
}
