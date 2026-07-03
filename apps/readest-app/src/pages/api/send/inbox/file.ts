// 改造自原 src/pages/api/send/inbox/file.ts。supabase → prisma；putObject 走本地。
import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { deleteObject, putObject } from '@/utils/object';
import { parseSubjectTag } from '@/services/send/sendAddress';
import { SEND_INBOX_BUCKET, SEND_INBOX_FILE_MAX_BYTES, SEND_INBOX_PENDING_LIMIT } from '@/services/constants';
import { prismaClient } from '@/utils/db';

export const config = { api: { bodyParser: false, responseLimit: false } };

const MAX_TITLE_LENGTH = 500;
const MAX_URL_LENGTH = 2000;
const ALLOWED_MIME = new Set(['application/epub+zip', 'application/octet-stream']);

function header(req: NextApiRequest, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function decodeRfc5987(value: string): string {
  const m = value.match(/^UTF-8''(.+)$/i);
  if (m) { try { return decodeURIComponent(m[1]!); } catch { return ''; } }
  return value;
}

async function readBody(req: NextApiRequest, max: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > max) {
        reject(Object.assign(new Error('Payload too large'), { code: 'payload_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user } = await validateUserAndToken(req.headers['authorization']);
  if (!user) return res.status(403).json({ error: 'Not authenticated' });

  const contentType = header(req, 'content-type') ?? '';
  const baseType = contentType.split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME.has(baseType)) return res.status(415).json({ error: 'Unsupported content type' });

  const titleRaw = header(req, 'x-readest-title');
  const urlRaw = header(req, 'x-readest-url');
  const title = titleRaw ? decodeRfc5987(titleRaw).slice(0, MAX_TITLE_LENGTH) : null;
  const sourceUrl = urlRaw ? decodeRfc5987(urlRaw).slice(0, MAX_URL_LENGTH) : null;
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return res.status(400).json({ error: 'Invalid source URL' });

  const count = await prismaClient.sendInbox.count({
    where: { userId: user.id, status: { in: ['pending', 'claimed'] } },
  });
  if (count >= SEND_INBOX_PENDING_LIMIT) {
    return res.status(429).json({ error: 'Inbox is full — open Readest to process pending items' });
  }

  let body: Buffer;
  try {
    body = await readBody(req, SEND_INBOX_FILE_MAX_BYTES);
  } catch (err) {
    if ((err as { code?: string }).code === 'payload_too_large') return res.status(413).json({ error: 'File is too large' });
    return res.status(400).json({ error: 'Could not read request body' });
  }
  if (body.byteLength === 0) return res.status(400).json({ error: 'Empty file' });

  const row = await prismaClient.sendInbox.create({
    data: {
      userId: user.id, kind: 'file', source: 'extension', url: sourceUrl, filename: title,
      byteSize: BigInt(body.byteLength), subjectTag: parseSubjectTag(title) ?? null,
    },
    select: { id: true },
  });

  const payloadKey = `inbox/${user.id}/${row.id}/clip.epub`;
  const payloadBuffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(payloadBuffer).set(body);
  try {
    await putObject(payloadKey, payloadBuffer, 'application/epub+zip', SEND_INBOX_BUCKET);
  } catch (err) {
    await prismaClient.sendInbox.delete({ where: { id: row.id } });
    console.error('Inbox file upload failed:', err);
    return res.status(500).json({ error: 'Could not store EPUB' });
  }

  try {
    await prismaClient.sendInbox.update({ where: { id: row.id }, data: { payloadKey } });
  } catch (err) {
    await prismaClient.sendInbox.delete({ where: { id: row.id } });
    try { await deleteObject(payloadKey, SEND_INBOX_BUCKET); } catch {}
    return res.status(500).json({ error: (err as Error).message });
  }
  return res.status(200).json({ id: row.id });
}
