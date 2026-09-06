// 改造自原 src/pages/api/storage/upload.ts。
// 改造点：
// 1. supabase → prisma
// 2. quota 检查改为查 files 表实际总和（无限配额，跳过 enforcement）
// 3. temp 路径仍走 putObject（本地文件系统）
// 4. uploadUrl 返回本地签名 PUT URL（/api/storage/_put）
// 5. v8.19.0: 跨用户去重 — 同 bookHash + 同扩展名的 owner row 存在时，
//    新用户创建 reference row（不复制物理文件），返回 { uploadUrl: null, deduped: true }
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken, getActualStorageUsage } from '@/utils/access';
import { getDownloadSignedUrl, getUploadSignedUrl, isSafeObjectKeyName } from '@/utils/object';
import { prismaClient } from '@/utils/db';
import { createFileWithDedup } from '@/utils/fileDedup';

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

    // v8.5: enforce storageQuotaMB（0 = 无限）
    const storageQuotaMB = user.storageQuotaMB ?? 0;
    if (storageQuotaMB > 0) {
      const currentUsage = await getActualStorageUsage(user.id);
      const newSize = Number(fileSize);
      const quotaBytes = storageQuotaMB * 1024 * 1024;
      if (currentUsage + newSize > quotaBytes) {
        return res.status(403).json({
          error: 'Storage quota exceeded',
          usage: currentUsage,
          quota: quotaBytes,
          quotaMB: storageQuotaMB,
        });
      }
    }

    // 兼容前端：0 = 无限时返回 100TB
    const usage = storageQuotaMB > 0 ? await getActualStorageUsage(user.id) : 0;
    const quota = storageQuotaMB > 0
      ? storageQuotaMB * 1024 * 1024
      : 100 * 1024 * 1024 * 1024 * 1024;

    const fileKey = `${user.id}/${fileName}`;
    const existing = await prismaClient.file.findUnique({ where: { fileKey } });
    let objSize = fileSize;

    if (existing) {
      // 已有 row（同 user + 同 fileKey）。可能是：
      //   (a) owner row 重新上传（正常覆盖）
      //   (b) reference row 重新上传（不应发生 — dedup 后客户端不会再 PUT）
      // 两种情况都直接返回签名 URL 让客户端覆盖（owner）/ 跳过（reference）。
      objSize = Number(existing.fileSize);
      const uploadUrl = await getUploadSignedUrl(fileKey, objSize, 1800);
      // 如果是 reference row，告诉客户端无需上传
      if (existing.originalFileKey) {
        return res.status(200).json({
          uploadUrl: null,
          fileKey,
          deduped: true,
          usage: usage + Number(existing.fileSize),
          quota,
        });
      }
      return res.status(200).json({ uploadUrl, fileKey, usage: usage + Number(fileSize), quota });
    }

    // v8.19.0: 跨用户去重 — 同 bookHash + 同扩展名的 owner row 存在时
    // 创建 reference row，不复制物理文件，返回 deduped: true 让客户端跳过 PUT。
    const createRes = await createFileWithDedup({
      userId: user.id,
      bookHash: bookHash ?? null,
      fileKey,
      fileSize: BigInt(fileSize),
      replicaKind: replicaKind ?? null,
      replicaId: replicaId ?? null,
    });

    if (createRes.kind === 'reference') {
      // 引用创建成功 — 不需要上传物理文件
      const refRow = await prismaClient.file.findUnique({ where: { id: createRes.fileId } });
      objSize = refRow ? Number(refRow.fileSize) : Number(fileSize);
      return res.status(200).json({
        uploadUrl: null,
        fileKey,
        deduped: true,
        usage: usage + objSize,
        quota,
      });
    }

    // 新 owner row — 返回签名 URL 让客户端 PUT
    const uploadUrl = await getUploadSignedUrl(fileKey, objSize, 1800);
    return res.status(200).json({ uploadUrl, fileKey, usage: usage + Number(fileSize), quota });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
