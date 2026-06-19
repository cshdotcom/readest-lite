// 改造自原 src/pages/api/storage/upload.ts。
// 改造点：
// 1. supabase → prisma
// 2. quota 检查改为查 files 表实际总和（无限配额，跳过 enforcement）
// 3. temp 路径仍走 putObject（本地文件系统）
// 4. uploadUrl 返回本地签名 PUT URL（/api/storage/_put）
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { getDownloadSignedUrl, getUploadSignedUrl, isSafeObjectKeyName } from '@/utils/object';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  const { fileName, fileSize, bookHash, replicaKind, replicaId, temp = false } = req.body;
  if (!isSafeObjectKeyName(fileName)) return res.status(400).json({ error: 'Invalid fileName' });

  if (temp) {
    try {
      const datetime = new Date();
      const timeStr = datetime.toISOString().replace(/[-:]/g, '').replace('T', '').slice(0, 10);
      const userStr = user.id.slice(0, 8);
      const fileKey = `temp/img/${timeStr}/${userStr}/${fileName}`;
      const uploadUrl = await getUploadSignedUrl(fileKey, fileSize, 1800);
      const downloadUrl = await getDownloadSignedUrl(fileKey, 3 * 86400);
      return res.status(200).json({ uploadUrl, downloadUrl });
    } catch (error) {
      console.error('Error creating presigned post for temp file:', error);
      return res.status(500).json({ error: 'Could not create presigned post' });
    }
  }

  try {
    if (!fileName || !fileSize) return res.status(400).json({ error: 'Missing file info' });

    // Pro 体系已删除 → 100TB 配额
    const usage = 0;
    const quota = 100 * 1024 * 1024 * 1024 * 1024; // 100TB

    const fileKey = `${user.id}/${fileName}`;
    const existing = await prismaClient.file.findUnique({ where: { fileKey } });
    let objSize = fileSize;
    if (existing) {
      objSize = Number(existing.fileSize);
    } else {
      await prismaClient.file.create({
        data: {
          userId: user.id,
          bookHash: bookHash ?? null,
          replicaKind: replicaKind ?? null,
          replicaId: replicaId ?? null,
          fileKey,
          fileSize: BigInt(fileSize),
        },
      });
    }

    const uploadUrl = await getUploadSignedUrl(fileKey, objSize, 1800);
    return res.status(200).json({ uploadUrl, fileKey, usage: usage + fileSize, quota });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
