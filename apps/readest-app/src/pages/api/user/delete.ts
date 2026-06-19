// 改造自原 src/pages/api/user/delete.ts。
// 管理员不能被删除（保护唯一管理员）；普通用户可以删除自己。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

    // 管理员不能删除自己
    if (user.userRole === 'admin') {
      return res.status(403).json({ error: 'Admin account cannot be deleted' });
    }

    // 普通用户可以删除自己（级联删除所有数据）
    await prismaClient.user.delete({ where: { id: user.id } });
    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
