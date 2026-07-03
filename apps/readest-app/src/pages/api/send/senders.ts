// 改造自原 src/pages/api/send/senders.ts。Pro 校验移除。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { normalizeSenderEmail } from '@/services/send/sendAddress';
import { prismaClient } from '@/utils/db';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) return res.status(403).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const senders = await prismaClient.sendAllowedSender.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' as const },
    });
    return res.status(200).json({ senders });
  }
  if (req.method === 'POST') {
    const email = normalizeSenderEmail(String(req.body?.email ?? ''));
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    const sender = await prismaClient.sendAllowedSender.upsert({
      where: { userId_email: { userId: user.id, email } },
      create: { userId: user.id, email, status: 'approved' },
      update: { status: 'approved' },
    });
    return res.status(200).json({ sender });
  }
  if (req.method === 'PATCH') {
    const id = String(req.body?.id ?? '');
    if (!id) return res.status(400).json({ error: 'Missing sender id' });
    const sender = await prismaClient.sendAllowedSender.updateMany({ where: { id, userId: user.id }, data: { status: 'approved' } });
    if (sender.count === 0) return res.status(404).json({ error: 'Sender not found' });
    const row = await prismaClient.sendAllowedSender.findUnique({ where: { id } });
    return res.status(200).json({ sender: row });
  }
  if (req.method === 'DELETE') {
    const id = String(req.body?.id ?? req.query['id'] ?? '');
    if (!id) return res.status(400).json({ error: 'Missing sender id' });
    await prismaClient.sendAllowedSender.deleteMany({ where: { id, userId: user.id } });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
