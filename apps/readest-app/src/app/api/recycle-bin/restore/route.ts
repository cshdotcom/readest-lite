// v8.19.0: 回收站 API — 还原条目
// POST /api/recycle-bin/restore — body: { ids: string[] }
// 还原流程：清 Book.deletedAt + 恢复 File 行（deletedAt = null）+ 删 RecycleBinItem
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import { restoreFromRecycleBin } from '@/utils/recycleBin';

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ids } = body as { ids?: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }
    if (!ids.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'All ids must be strings' }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot restore more than 100 items at once' }, { status: 400 });
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      const r = await restoreFromRecycleBin(user.id, id);
      results.push({ id, ok: r.ok, error: r.error });
    }
    const okCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - okCount;
    return NextResponse.json({
      results,
      restoredCount: okCount,
      failedCount,
    });
  } catch (error) {
    console.error('Recycle bin restore failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
