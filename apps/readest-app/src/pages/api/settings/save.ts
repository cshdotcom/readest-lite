// v8.18.4: 加密设置同步 — PUT /api/settings?scope=system
// 客户端把本地 SystemSettings 用 VaultContext 密钥加密后 POST 到这里。
// 服务端只存密文，不解密 — 跨设备同步时其他设备 GET 后在客户端解密。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { prismaClient } from '@/utils/db';

const ALLOWED_SCOPES = ['system', 'global_view', 'global_read'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(401).json({ error: 'Not authenticated' });

  const scope = req.query['scope'];
  if (typeof scope !== 'string' || !ALLOWED_SCOPES.includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' });
  }

  let body: { encryptedPayload?: unknown };
  try {
    body = req.body as { encryptedPayload?: unknown };
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const payload = typeof body.encryptedPayload === 'string' ? body.encryptedPayload.trim() : '';
  if (!payload) return res.status(400).json({ error: 'Missing encryptedPayload' });
  // 基本长度限制：base64(JSON(CipherEnvelope)) 通常 < 100KB
  if (payload.length > 512 * 1024) {
    return res.status(413).json({ error: 'Payload too large' });
  }

  try {
    // upsert — 同一 (userId, scope) 只保留最新版本
    await prismaClient.userSetting.upsert({
      where: { userId_scope: { userId: user.id, scope } },
      create: {
        userId: user.id,
        scope,
        encryptedPayload: payload,
      },
      update: {
        encryptedPayload: payload,
      },
    });
    return res.status(200).json({ ok: true, scope, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Save user setting failed:', error);
    return res.status(500).json({ error: 'Could not save settings' });
  }
}
