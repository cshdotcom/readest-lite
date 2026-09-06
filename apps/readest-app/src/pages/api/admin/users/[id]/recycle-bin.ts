// v8.19.4: Admin — recycle bin for a specific user.
// GET    /api/admin/users/[id]/recycle-bin          — list target user's items
// POST   /api/admin/users/[id]/recycle-bin?action=restore  — restore items
// POST   /api/admin/users/[id]/recycle-bin?action=delete   — permanently delete items
//
// Body for POST: { ids: string[] } (omit/empty for "all" when action=delete).
//
// Auth: validateUserAndToken + isAdmin(role). Mirrors the user-facing
// /api/recycle-bin/{index,restore,clear}.ts logic but operates on a target
// user (admin cross-user action). We auto-cleanup expired items on every
// GET so the admin doesn't see stale rows that have already been garbage
// collected. Permanently-delete mirrors the user-facing clear.ts: it
// deletes the Book row, decrements the dedup refCount, and (when it hits
// 0) physically deletes the underlying file.
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { isAdmin } from '@/utils/permissions';
import { deleteObject } from '@/utils/object';

const DEFAULT_EXPIRE_DAYS = 30;

interface RecycleBinItemWire {
  id: string;
  bookHash: string;
  bookTitle: string;
  bookFormat: string;
  fileKey: string | null;
  deletedAt: string;
  expiresAt: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });
  if (!isAdmin({ role: user.role })) return res.status(403).json({ error: 'Admin only' });

  const targetUserId = String(req.query['id'] ?? '');
  if (!targetUserId) return res.status(400).json({ error: 'Missing user id' });

  if (req.method === 'GET') {
    try {
      // Auto-cleanup expired items so the admin sees the true live state.
      await prismaClient.recycleBinItem.deleteMany({
        where: { userId: targetUserId, expiresAt: { lt: new Date() } },
      });

      const items = await prismaClient.recycleBinItem.findMany({
        where: { userId: targetUserId },
        orderBy: { deletedAt: 'desc' },
      });

      const wire: RecycleBinItemWire[] = items.map((item) => ({
        id: item.id,
        bookHash: item.bookHash,
        bookTitle: item.bookTitle,
        bookFormat: item.bookFormat,
        fileKey: item.fileKey,
        deletedAt: item.deletedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      }));

      return res.status(200).json({
        items: wire,
        expireDays: parseInt(
          process.env['RECYCLE_BIN_EXPIRE_DAYS'] || String(DEFAULT_EXPIRE_DAYS),
          10,
        ),
      });
    } catch (error) {
      console.error('Admin recycle bin list failed:', error);
      return res.status(500).json({ error: 'Could not list recycle bin' });
    }
  }

  if (req.method === 'POST') {
    const action = String(req.query['action'] ?? '');
    if (action !== 'restore' && action !== 'delete') {
      return res
        .status(400)
        .json({ error: "Missing or invalid ?action= (must be 'restore' or 'delete')" });
    }
    const body = req.body as { ids?: string[] };
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Missing ids array' });
    }

    try {
      const items = await prismaClient.recycleBinItem.findMany({
        where: { userId: targetUserId, id: { in: ids } },
      });

      if (action === 'restore') {
        // Mirror /api/recycle-bin/restore.ts: undelete the Book row + drop
        // the recycle-bin item. We don't restore the underlying File here —
        // file dedup means the original File row is still alive (refCount
        // just dipped); restoring a soft-deleted Book is enough for the
        // user to see + re-open the book, and the File row is recreated by
        // the regular upload path if the user re-imports.
        for (const item of items) {
          await prismaClient.book.updateMany({
            where: { userId: targetUserId, bookHash: item.bookHash },
            data: { deletedAt: null, updatedAt: new Date() },
          });
          await prismaClient.recycleBinItem.delete({ where: { id: item.id } });
        }
        return res.status(200).json({ ok: true, restored: items.length });
      }

      // action === 'delete' — permanently delete. Mirror /api/recycle-bin/clear.ts:
      // for each item, delete the Book row, decrement dedup refCount, drop the
      // physical file when refCount hits 0, then drop the recycle-bin item.
      for (const item of items) {
        await prismaClient.book.deleteMany({
          where: { userId: targetUserId, bookHash: item.bookHash },
        });
        const files = await prismaClient.file.findMany({
          where: { userId: targetUserId, bookHash: item.bookHash },
        });
        for (const file of files) {
          if (file.fileKey && file.originalFileKey === null) {
            // Original — decrement own refCount, delete if 0
            await prismaClient.file.updateMany({
              where: { fileKey: file.fileKey },
              data: { refCount: { decrement: 1 } },
            });
            const updated = await prismaClient.file.findUnique({
              where: { fileKey: file.fileKey },
            });
            if (updated && updated.refCount <= 0) {
              try {
                await deleteObject(file.fileKey);
              } catch {
                // best-effort — file may already be gone
              }
            }
          } else if (file.fileKey && file.originalFileKey) {
            // Reference — decrement the original owner's refCount
            await prismaClient.file.updateMany({
              where: { fileKey: file.originalFileKey },
              data: { refCount: { decrement: 1 } },
            });
          }
          await prismaClient.file.delete({ where: { id: file.id } });
        }
        await prismaClient.recycleBinItem.delete({ where: { id: item.id } });
      }
      return res.status(200).json({ ok: true, deleted: items.length });
    } catch (error) {
      console.error('Admin recycle bin action failed:', error);
      return res.status(500).json({ error: 'Could not perform recycle bin action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
