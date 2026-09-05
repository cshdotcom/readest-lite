// v8.18.4: 加密设置同步 — GET /api/settings?scope=system
// 返回当前用户最新版本的密文。客户端用 VaultContext 解密后合并到本地。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

const ALLOWED_SCOPES = ['system', 'global_view', 'global_read'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  const scope = req.query['scope'];
  if (typeof scope !== 'string' || !ALLOWED_SCOPES.includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' });
  }

  try {
    const row = await prismaClient.userSetting.findUnique({
      where: { userId_scope: { userId: user.id, scope } },
    });
    if (!row) return res.status(404).json({ error: 'No synced settings yet' });
    return res.status(200).json({
      scope: row.scope,
      encryptedPayload: row.encryptedPayload,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('Get user setting failed:', error);
    return res.status(500).json({ error: 'Could not load settings' });
  }
}
