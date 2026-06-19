// 改造自原 src/app/api/share/list/route.ts。
import { NextResponse } from 'next/server';
import { prismaClient } from '@/utils/db';
import { validateUserAndToken } from '@/utils/access';
// SHARE_BASE_URL removed — uses process.env.PUBLIC_BASE_URL at runtime

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const { user, token } = await validateUserAndToken(request.headers.get('authorization'));
  if (!user || !token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(request.url);
  const rawCursor = url.searchParams.get('cursor');
  // 原 Supabase 版用复合 cursor；SQLite 简化为按 createdAt+id 排序后 take PAGE_SIZE+1
  // cursor 参数解析仅用于响应 nextCursor 的格式约定（兼容前端）
  void rawCursor;

  // SQLite 不支持复合 cursor or 查询，简化为基于 createdAt+id 的字符串比较
  const rows = await prismaClient.bookShare.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: PAGE_SIZE + 1,
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page.length > 0 ? page[page.length - 1] : null;
  const nextCursor = hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null;

  return NextResponse.json({
    shares: page.map((row) => ({
      id: row.id,
      token: row.token,
      bookHash: row.bookHash,
      title: row.bookTitle,
      author: row.bookAuthor,
      format: row.bookFormat,
      size: Number(row.bookSize),
      hasCfi: !!row.cfi,
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      downloadCount: row.downloadCount,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor,
    shareUrlBase: `${process.env['PUBLIC_BASE_URL'] || ''}/s`,
  });
}
