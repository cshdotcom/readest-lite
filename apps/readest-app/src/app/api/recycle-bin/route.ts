// v8.19.0: 回收站 API — 列出用户的回收站条目
// GET /api/recycle-bin — 列出当前用户的回收站条目（自动清理过期项）
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { cleanupExpiredItems, getRecycleBinExpireDays } from '@/utils/recycleBin';
import { prismaClient } from '@/utils/db';

export async function GET(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // v8.19.0: 自动清理过期条目（expiresAt < now）— 在每次 GET 时执行
  try {
    await cleanupExpiredItems(user.id);
  } catch (err) {
    console.error('Recycle bin cleanup failed (non-fatal):', err);
  }

  const items = await prismaClient.recycleBinItem.findMany({
    where: { userId: user.id },
    orderBy: { deletedAt: 'desc' },
  });

  return NextResponse.json({
    items: items.map((it) => ({
      id: it.id,
      bookHash: it.bookHash,
      bookTitle: it.bookTitle,
      bookFormat: it.bookFormat,
      fileKey: it.fileKey,
      deletedAt: it.deletedAt.toISOString(),
      expiresAt: it.expiresAt.toISOString(),
    })),
    expireDays: getRecycleBinExpireDays(),
  });
}
