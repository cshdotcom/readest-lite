// 改造自原 src/pages/api/storage/list.ts。
// v8.21: 管理员可通过 ?userId=<id> 查看其他用户的文件，或 ?allUsers=1 查看所有
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

interface FileRecord {
  file_key: string; file_size: number; book_hash: string | null;
  replica_kind: string | null; replica_id: string | null;
  created_at: string; updated_at: string | null;
  user_id?: string; user_email?: string; user_display_name?: string | null;
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

    const reqQuery = req.query as {
      page?: string; pageSize?: string; sortBy?: string; sortOrder?: string;
      bookHash?: string; search?: string; userId?: string; allUsers?: string;
    };
    const page = parseInt(reqQuery.page as string) || 1;
    const pageSize = Math.min(parseInt(reqQuery.pageSize as string) || 50, 100);
    const sortBy = (reqQuery.sortBy as string) || 'createdAt';
    const sortOrder = ((reqQuery.sortOrder as string) === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
    const bookHash = reqQuery.bookHash as string | undefined;
    const search = reqQuery.search as string | undefined;
    const queryUserId = reqQuery.userId as string | undefined;
    const allUsers = reqQuery.allUsers === '1' || reqQuery.allUsers === 'true';

    // v8.21: 跨用户权限校验
    // v8.23: 增加 SUPER_ADMIN_EMAIL env fallback — 即使用户 DB role 没更新，
    // env 里配置的超级管理员邮箱也能通过校验
    const isAdmin =
      user.userRole === 'admin' ||
      user.userRole === 'super_admin' ||
      (process.env['SUPER_ADMIN_EMAIL'] &&
        user.email.toLowerCase() === process.env['SUPER_ADMIN_EMAIL'].toLowerCase().trim());
    let targetUserIds: string[] = [user.id];
    let crossUser = false;
    if (allUsers || (queryUserId && queryUserId !== user.id)) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      crossUser = true;
      if (queryUserId && !allUsers) {
        targetUserIds = [queryUserId];
      } else if (allUsers) {
        const allUsersRows = await prismaClient.user.findMany({ select: { id: true } });
        targetUserIds = allUsersRows.map((u) => u.id);
      }
    }

    const where: Record<string, unknown> = {
      deletedAt: null,
      NOT: { fileKey: { startsWith: 'avatar/' } },  // v8.19.7: 隐藏头像文件
      ...(targetUserIds.length === 1 ? { userId: targetUserIds[0] } : { userId: { in: targetUserIds } }),
      ...(bookHash ? { bookHash } : {}),
      ...(search ? { fileKey: { contains: search } } : {}),
    };

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
        const extra = await prismaClient.file.findMany({
          where: { userId: { in: targetUserIds }, deletedAt: null, bookHash: { in: bookHashes } },
        });
        extra.forEach((f) => fileMap.set(f.fileKey, f));
      }
      if (replicaIds.length > 0) {
        const extra = await prismaClient.file.findMany({
          where: { userId: { in: targetUserIds }, deletedAt: null, replicaId: { in: replicaIds } },
        });
        extra.forEach((f) => fileMap.set(f.fileKey, f));
      }
      allRelatedFiles = Array.from(fileMap.values());
    }

    // 跨用户场景下，附加 user_email / user_display_name 字段
    let userMap: Map<string, { email: string; displayName: string | null }> | null = null;
    if (crossUser) {
      const userIds = [...new Set(allRelatedFiles.map((f) => f.userId))];
      const users = await prismaClient.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true },
      });
      userMap = new Map(users.map((u) => [u.id, { email: u.email, displayName: u.displayName }]));
    }

    const response: ListFilesResponse = {
      files: allRelatedFiles.map((f) => {
        const base: FileRecord = {
          file_key: f.fileKey, file_size: Number(f.fileSize), book_hash: f.bookHash,
          replica_kind: f.replicaKind, replica_id: f.replicaId,
          created_at: f.createdAt.toISOString(), updated_at: f.updatedAt?.toISOString() ?? null,
        };
        if (crossUser && userMap) {
          const u = userMap.get(f.userId);
          base.user_id = f.userId;
          base.user_email = u?.email;
          base.user_display_name = u?.displayName ?? null;
        }
        return base;
      }),
      total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    };
    return res.status(200).json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
