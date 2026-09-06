// v8.19.0: 回收站 API — 永久删除条目
// POST /api/recycle-bin/clear — body: { ids: string[] } 或 { all: true }
// 永久删除流程：
//   - 用 deleteFileWithRefCount 处理物理删除 + 引用计数
//   - 删除 Book / BookConfig / BookNote 行
//   - 删除 RecycleBinItem
import { NextRequest, NextResponse } from 'next/server';
import { validateUserAndToken } from '@/utils/access';
import {
  permanentlyDeleteFromRecycleBin,
  permanentlyDeleteAllFromRecycleBin,
} from '@/utils/recycleBin';

export async function POST(req: NextRequest) {
  const { user, token } = await validateUserAndToken(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ids, all } = body as { ids?: string[]; all?: boolean };

    if (all === true) {
      const result = await permanentlyDeleteAllFromRecycleBin(user.id);
      return NextResponse.json({
        ok: true,
        cleared: true,
        deletedCount: result.deletedCount,
        failedCount: result.failedCount,
      });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required (or set all: true)' }, { status: 400 });
    }
    if (!ids.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'All ids must be strings' }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot clear more than 100 items at once' }, { status: 400 });
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      const r = await permanentlyDeleteFromRecycleBin(user.id, id);
      results.push({ id, ok: r.ok, error: r.error });
    }
    const okCount = results.filter((r) => r.ok).length;
    const failedCount = results.length - okCount;
    return NextResponse.json({
      results,
      deletedCount: okCount,
      failedCount,
    });
  } catch (error) {
    console.error('Recycle bin clear failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
