// 改造自原 src/pages/api/storage/download.ts。
// supabase → prisma；getDownloadSignedUrl 改为返回本地签名 GET URL。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { getDownloadSignedUrl } from '@/utils/object';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    if (req.method === 'GET') {
      let { fileKey } = req.query;
      if (req.url?.includes('fileKey=') && req.url?.includes('&')) {
        const fileKeyFromUrl = req.url
          .substring(req.url.indexOf('fileKey=') + 8)
          .replace(/\+/g, '%20')
          .replace(/&/g, '%26')
          .replace(/=$/, '');
        fileKey = decodeURIComponent(fileKeyFromUrl);
      }
      if (!fileKey || typeof fileKey !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid fileKey' });
      }
      const downloadUrlsMap = await processFileKeys([fileKey], user.id);
      const downloadUrl = downloadUrlsMap[fileKey];
      if (!downloadUrl) return res.status(404).json({ error: 'File not found' });
      return res.status(200).json({ downloadUrl });
    }

    // POST
    const { fileKeys } = req.body;
    if (!fileKeys || !Array.isArray(fileKeys)) return res.status(400).json({ error: 'Missing or invalid fileKeys array' });
    if (fileKeys.length === 0) return res.status(400).json({ error: 'fileKeys array cannot be empty' });
    if (!fileKeys.every((key) => typeof key === 'string')) return res.status(400).json({ error: 'All fileKeys must be strings' });
    const downloadUrls = await processFileKeys(fileKeys, user.id);
    return res.status(200).json({ downloadUrls });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

async function processFileKeys(
  fileKeys: string[],
  userId: string,
): Promise<Record<string, string | undefined>> {
  const records = await prismaClient.file.findMany({
    where: { userId, fileKey: { in: fileKeys }, deletedAt: null },
    select: { userId: true, fileKey: true, bookHash: true },
  });
  const fileRecordMap = new Map(records.map((r) => [r.fileKey, r]));

  // fallback：同 book_hash 找同后缀
  const missing = fileKeys.filter((key) => !fileRecordMap.has(key) && key.includes('Readest/Book'));
  if (missing.length > 0) {
    const candidates = missing
      .map((key) => {
        const parts = key.split('/');
        if (parts.length === 5) {
          const bookHash = parts[3]!;
          const filename = parts[4]!;
          const ext = filename.split('.').pop() || '';
          return { originalKey: key, bookHash, ext };
        }
        return null;
      })
      .filter(Boolean) as Array<{ originalKey: string; bookHash: string; ext: string }>;
    if (candidates.length > 0) {
      const bookHashes = [...new Set(candidates.map((c) => c.bookHash))];
      const fallback = await prismaClient.file.findMany({
        where: { userId, bookHash: { in: bookHashes }, deletedAt: null },
      });
      for (const c of candidates) {
        const matched = fallback.find((f) => f.bookHash === c.bookHash && f.fileKey.endsWith(`.${c.ext}`));
        if (matched) fileRecordMap.set(c.originalKey, matched);
      }
    }
  }

  const downloadUrls: Record<string, string | undefined> = {};
  await Promise.all(
    fileKeys.map(async (fileKey) => {
      const rec = fileRecordMap.get(fileKey);
      if (!rec || rec.userId !== userId) {
        downloadUrls[fileKey] = undefined;
        return;
      }
      try {
        downloadUrls[fileKey] = await getDownloadSignedUrl(rec.fileKey, 1800);
      } catch {
        downloadUrls[fileKey] = undefined;
      }
    }),
  );
  return downloadUrls;
}
