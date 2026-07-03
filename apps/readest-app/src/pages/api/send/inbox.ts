// 改造自原 src/pages/api/send/inbox.ts。supabase → prisma；putObject 走本地。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { putObject } from '@/utils/object';
import { parseSubjectTag } from '@/services/send/sendAddress';
import { SEND_INBOX_BUCKET, SEND_INBOX_PENDING_LIMIT } from '@/services/constants';
import { prismaClient } from '@/utils/db';

const RECENT_LIMIT = 20;
const MAX_CLIP_HTML_BYTES = 5 * 1024 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  const { user } = await validateUserAndToken(req.headers['authorization']);
  if (!user) return res.status(403).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const items = await prismaClient.sendInbox.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' as const },
      take: RECENT_LIMIT,
    });
    return res.status(200).json({ items });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const count = await prismaClient.sendInbox.count({
    where: { userId: user.id, status: { in: ['pending', 'claimed'] } },
  });
  if (count >= SEND_INBOX_PENDING_LIMIT) {
    return res.status(429).json({ error: 'Inbox is full — open Readest to process pending items' });
  }

  const kind = String(req.body?.kind ?? 'url');

  if (kind === 'html') {
    const html = String(req.body?.html ?? '');
    if (!html) return res.status(400).json({ error: 'html is required' });
    const bytes = new TextEncoder().encode(html);
    if (bytes.byteLength > MAX_CLIP_HTML_BYTES) return res.status(413).json({ error: 'Page is too large to send' });
    const title = req.body?.title ? String(req.body.title).slice(0, 500) : null;
    const sourceUrl = req.body?.url ? String(req.body.url).slice(0, 2000) : null;

    const row = await prismaClient.sendInbox.create({
      data: {
        userId: user.id, kind: 'html', source: 'extension', url: sourceUrl, filename: title,
        byteSize: BigInt(bytes.byteLength), subjectTag: parseSubjectTag(title) ?? null,
      },
      select: { id: true },
    });

    const payloadKey = `inbox/${user.id}/${row.id}/page.html`;
    try {
      await putObject(payloadKey, bytes.buffer, 'text/html; charset=utf-8', SEND_INBOX_BUCKET);
    } catch (err) {
      await prismaClient.sendInbox.delete({ where: { id: row.id } });
      console.error('Inbox clip upload failed:', err);
      return res.status(500).json({ error: 'Could not store page' });
    }
    await prismaClient.sendInbox.update({ where: { id: row.id }, data: { payloadKey } });
    return res.status(200).json({ id: row.id });
  }

  // kind === 'url'
  const url = String(req.body?.url ?? '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'A valid http(s) URL is required' });
  const title = req.body?.title ? String(req.body.title) : null;

  const row = await prismaClient.sendInbox.create({
    data: {
      userId: user.id, kind: 'url', source: 'extension', url, filename: title,
      subjectTag: parseSubjectTag(title) ?? null,
    },
    select: { id: true },
  });
  return res.status(200).json({ id: row.id });
}
