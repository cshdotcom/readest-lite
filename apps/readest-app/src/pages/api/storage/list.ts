// 改造自原 src/pages/api/storage/list.ts。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

interface FileRecord {
  file_key: string; file_size: number; book_hash: string | null;
  replica_kind: string | null; replica_id: string | null;
  created_at: string; updated_at: string | null;
}
interface ListFilesResponse {
  files: FileRecord[]; total: number; page: number; pageSize: number; totalPages: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    const reqQuery = req.query as { page?: string; pageSize?: string; sortBy?: string; sortOrder?: string; bookHash?: string; search?: string };
    const page = parseInt(reqQuery.page as string) || 1;
    const pageSize = Math.min(parseInt(reqQuery.pageSize as string) || 50, 100);
    const sortBy = (reqQuery.sortBy as string) || 'createdAt';
    const sortOrder = ((reqQuery.sortOrder as string) === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const bookHash = reqQuery.bookHash as string | undefined;
    const search = reqQuery.search as string | undefined;

    // v8.19.7: Exclude hidden avatar files from file manager list
    const where = { userId: user.id, deletedAt: null, NOT: { fileKey: { startsWith: 'avatar/' } }, ...(bookHash ? { bookHash } : {}), ...(search ? { fileKey: { contains: search } } : {}) };

    const validSortColumns = ['createdAt', 'updatedAt', 'fileSize', 'fileKey'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'createdAt';

    const [total, files] = await Promise.all([
      prismaClient.file.count({ where }),
      prismaClient.file.findMany({
        where,
        orderBy: { [sortColumn]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // 拉取相关 group 文件（同 book_hash / 同 replica_id）
    const bookHashes = [...new Set(files.map((f) => f.bookHash).filter(Boolean))] as string[];
    const replicaIds = [...new Set(files.map((f) => f.replicaId).filter(Boolean))] as string[];
    let allRelatedFiles = files;
    if (bookHashes.length > 0 || replicaIds.length > 0) {
      const fileMap = new Map(allRelatedFiles.map((f) => [f.fileKey, f]));
      if (bookHashes.length > 0) {
        const extra = await prismaClient.file.findMany({ where: { userId: user.id, deletedAt: null, bookHash: { in: bookHashes } } });
        extra.forEach((f) => fileMap.set(f.fileKey, f));
      }
      if (replicaIds.length > 0) {
        const extra = await prismaClient.file.findMany({ where: { userId: user.id, deletedAt: null, replicaId: { in: replicaIds } } });
        extra.forEach((f) => fileMap.set(f.fileKey, f));
      }
      allRelatedFiles = Array.from(fileMap.values());
    }

    const response: ListFilesResponse = {
      files: allRelatedFiles.map((f) => ({
        file_key: f.fileKey, file_size: Number(f.fileSize), book_hash: f.bookHash,
        replica_kind: f.replicaKind, replica_id: f.replicaId,
        created_at: f.createdAt.toISOString(), updated_at: f.updatedAt?.toISOString() ?? null,
      })),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    };
    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
