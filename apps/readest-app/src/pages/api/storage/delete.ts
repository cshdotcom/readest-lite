// 改造自原 src/pages/api/storage/delete.ts。
// v8.19.0: 跨用户去重后的删除 —
//   - reference 行（originalFileKey != null）：硬删自己 + 把 owner.refCount - 1；
//     owner.refCount 归 0 时物理删除 owner 的文件并删除 owner 行
//   - owner 行（originalFileKey == null）：refCount - 1；归 0 物理删除 + 硬删；
//     仍 > 0 则软删自己 + 保留物理文件给其他 reference 用户
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject } from '@/utils/object';
import { prismaClient } from '@/utils/db';
import { deleteFileWithRefCount } from '@/utils/fileDedup';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    const { fileKey } = req.query;
    if (!fileKey || typeof fileKey !== 'string') return res.status(400).json({ error: 'Missing or invalid fileKey' });

    const fileRecord = await prismaClient.file.findFirst({
      where: { userId: user.id, fileKey, deletedAt: null },
    });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });
    if (fileRecord.userId !== user.id) return res.status(403).json({ error: 'Unauthorized access to the file' });

    try {
      await deleteFileWithRefCount(
        {
          id: fileRecord.id,
          userId: fileRecord.userId,
          fileKey: fileRecord.fileKey,
          originalFileKey: fileRecord.originalFileKey,
          refCount: fileRecord.refCount,
        },
        deleteObject,
      );
      return res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      return res.status(500).json({ error: 'Could not delete file from storage' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
