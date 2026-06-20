// 改造自原 src/app/api/share/create/route.ts。
// 改造点：supabase → prisma；quota 检查跳过（无限）。
import { NextResponse } from 'next/server';
import { prismaClient } from '@/utils/db';
import { validateUserAndToken } from '@/utils/access';
import { generateShareToken } from '@/libs/shareServer';
import { objectExists } from '@/utils/object';
import {
  SHARE_CFI_MAX_LENGTH,
  SHARE_EXPIRATION_DAYS,
  SHARE_MAX_PER_USER,
} from '@/services/constants';

interface CreateShareBody {
  bookHash?: unknown; expirationDays?: unknown; title?: unknown;
  author?: unknown; format?: unknown; cfi?: unknown;
}

const isAllowedExpiration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 365;

const trimText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

const isControlChar = (s: string): boolean => /[\u0000-\u001f\u007f]/.test(s);

export async function POST(request: Request) {
  const { user, token } = await validateUserAndToken(request.headers.get('authorization'));
  if (!user || !token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: CreateShareBody;
  try { body = (await request.json()) as CreateShareBody; } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const bookHash = trimText(body.bookHash, 64);
  if (!bookHash) return NextResponse.json({ error: 'Missing or invalid bookHash' }, { status: 400 });

  if (!isAllowedExpiration(body.expirationDays)) {
    return NextResponse.json({ error: `expirationDays must be an integer between 1 and 365`, code: 'invalid_expiration' }, { status: 400 });
  }
  const expirationDays = body.expirationDays;

  const title = trimText(body.title, 512);
  if (!title) return NextResponse.json({ error: 'Missing or invalid title' }, { status: 400 });
  const author = trimText(body.author, 256);
  const format = trimText(body.format, 16);
  if (!format) return NextResponse.json({ error: 'Missing or invalid format' }, { status: 400 });

  let cfi: string | null = null;
  if (body.cfi != null) {
    cfi = trimText(body.cfi, SHARE_CFI_MAX_LENGTH);
    if (cfi && isControlChar(cfi)) return NextResponse.json({ error: 'cfi contains invalid characters' }, { status: 400 });
  }

  // 活跃分享计数
  const activeCount = await prismaClient.bookShare.count({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (activeCount >= SHARE_MAX_PER_USER) {
    return NextResponse.json({ error: `You have reached the maximum of ${SHARE_MAX_PER_USER} active shares.`, code: 'share_limit_reached' }, { status: 429 });
  }

  // 找到该 book_hash 的非封面文件
  const bookFiles = await prismaClient.file.findMany({
    where: { userId: user.id, bookHash, deletedAt: null },
    select: { fileKey: true, fileSize: true },
  });
  if (bookFiles.length === 0) {
    return NextResponse.json({ error: 'Book is not uploaded yet', code: 'book_not_uploaded' }, { status: 409 });
  }
  const bookFile = bookFiles.find((f) => !/\.(png|jpe?g|webp|gif)$/i.test(f.fileKey));
  if (!bookFile) {
    return NextResponse.json({ error: 'Book file row not found', code: 'book_not_uploaded' }, { status: 409 });
  }
  const size = Number(bookFile.fileSize);

  // 验证文件字节确实存在
  const exists = await objectExists(bookFile.fileKey);
  if (!exists) {
    return NextResponse.json({ error: 'Book upload is incomplete; please retry', code: 'upload_incomplete' }, { status: 409 });
  }

  const { raw, hash } = await generateShareToken();
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

  await prismaClient.bookShare.create({
    data: {
      tokenHash: hash, token: raw, userId: user.id, bookHash,
      bookTitle: title, bookAuthor: author, bookFormat: format,
      bookSize: BigInt(size), cfi, expiresAt,
    },
  });

  return NextResponse.json({ token: raw, url: `${process.env['PUBLIC_BASE_URL'] || ''}/s/${raw}`, expiresAt: expiresAt.toISOString() });
}
