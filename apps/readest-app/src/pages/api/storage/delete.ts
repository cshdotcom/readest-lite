// 改造自原 src/pages/api/storage/delete.ts。
// v8.19.0: 改为回收站语义 —
//   - 单文件删除 = 软删 File 行（deletedAt = now）+ 创建/刷新 RecycleBinItem
//   - 不动物理文件，不动 refCount — 永久删除时由 /api/recycle-bin/clear 调用
//     deleteFileWithRefCount 处理引用计数 + 物理删除
//   - 仍校验权限：用户只能删自己的 File 行
//   - 幂等：同 fileKey 重复删除返回 200
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';
import { moveToRecycleBin } from '@/utils/recycleBin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    const { fileKey } = req.query;
    if (!fileKey || typeof fileKey !== 'string') return res.status(400).json({ error: 'Missing or invalid fileKey' });

    // v8.19.0: 查找 File row，包括软删的（幂等：已软删的也算"删除成功"）
    const fileRecord = await prismaClient.file.findFirst({
      where: { userId: user.id, fileKey },
    });
    if (!fileRecord) return res.status(404).json({ error: 'File not found' });
    if (fileRecord.userId !== user.id) return res.status(403).json({ error: 'Unauthorized access to the file' });

    try {
      // 已软删 → 幂等返回成功
      if (fileRecord.deletedAt) {
        return res.status(200).json({ message: 'File deleted successfully' });
      }

      // 有 bookHash → 走回收站流程（软删 + RecycleBinItem）
      if (fileRecord.bookHash) {
        await moveToRecycleBin(user.id, {
          id: fileRecord.id,
          fileKey: fileRecord.fileKey,
          bookHash: fileRecord.bookHash,
        });
      } else {
        // 无 bookHash（如 temp/img/... 或副本辅助文件）→ 直接软删
        await prismaClient.file.update({
          where: { id: fileRecord.id },
          data: { deletedAt: new Date(), updatedAt: new Date() },
        });
      }
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
