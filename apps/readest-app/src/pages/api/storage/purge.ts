// 改造自原 src/pages/api/storage/purge.ts。
// v8.19.0: 跨用户去重后的批量删除 — 使用 deleteFileWithRefCount 处理每个 row。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';
import { prismaClient } from '@/utils/db';
import { deleteFileWithRefCount } from '@/utils/fileDedup';

interface BulkDeleteResult {
  success: string[];
  failed: Array<{ fileKey: string; error: string }>;
  deletedCount: number;
  failedCount: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    const { fileKeys } = req.body;
    if (!fileKeys || !Array.isArray(fileKeys)) return res.status(400).json({ error: 'Missing or invalid fileKeys array' });
    if (fileKeys.length === 0) return res.status(400).json({ error: 'fileKeys array cannot be empty' });
    if (fileKeys.length > 100) return res.status(400).json({ error: 'Cannot delete more than 100 files at once' });
    if (!fileKeys.every((key: unknown) => typeof key === 'string')) return res.status(400).json({ error: 'All fileKeys must be strings' });

    const fileRecords = await prismaClient.file.findMany({
      where: { userId: user.id, fileKey: { in: fileKeys }, deletedAt: null },
    });
    if (fileRecords.length === 0) return res.status(404).json({ error: 'No matching files found' });

    const success: string[] = [];
    const failed: Array<{ fileKey: string; error: string }> = [];

    await Promise.allSettled(
      fileRecords.map(async (rec) => {
        try {
          await deleteFileWithRefCount(
            {
              id: rec.id,
              userId: rec.userId,
              fileKey: rec.fileKey,
              originalFileKey: rec.originalFileKey,
              refCount: rec.refCount,
            },
            deleteObject,
          );
          success.push(rec.fileKey);
        } catch (error) {
          failed.push({ fileKey: rec.fileKey, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }),
    );

    const foundFileKeys = new Set(fileRecords.map((r) => r.fileKey));
    fileKeys.filter((key: string) => !foundFileKeys.has(key)).forEach((key: string) => {
      failed.push({ fileKey: key, error: 'File not found or already deleted' });
    });

    const response: BulkDeleteResult = { success, failed, deletedCount: success.length, failedCount: failed.length };
    const statusCode = failed.length > 0 && success.length > 0 ? 207 : failed.length > 0 ? 500 : 200;
    return res.status(statusCode).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
