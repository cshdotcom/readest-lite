// 文件移动 API — POST /api/storage/move
// body: { fileKeys: string[], targetUserId: string }
// 仅 admin / super_admin 可调用
// 副作用：
//   1. 物理移动文件 /data/books/<sourceUid>/... → /data/books/<targetUid>/...
//   2. 删除源 File 行
//   3. 在 targetUserId 下创建新的 File 行（fileKey 用 targetUid 前缀）
//   4. 写 AuditLog
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { validateAdmin } from '@/utils/localAuth';
import { prismaClient } from '@/utils/db';

const BOOKS_DIR = process.env['BOOKS_DIR'] || '/data/books';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user, token } = await validateAdmin(req.headers.get('authorization'));
  if (!user || !token) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { fileKeys, targetUserId } = body;
    if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
      return NextResponse.json({ error: 'No fileKeys provided' }, { status: 400 });
    }
    if (typeof targetUserId !== 'string' || !targetUserId) {
      return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
    }

    const targetUser = await prismaClient.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const files = await prismaClient.file.findMany({
      where: { fileKey: { in: fileKeys }, deletedAt: null },
    });

    if (files.length === 0) {
      return NextResponse.json({ error: 'No matching files' }, { status: 404 });
    }

    let moved = 0;
    let failed = 0;
    const errors: { fileKey: string; error: string }[] = [];

    for (const file of files) {
      try {
        const parts = file.fileKey.split('/');
        if (parts.length < 2 || parts[0] !== file.userId) {
          failed++;
          errors.push({ fileKey: file.fileKey, error: 'fileKey does not start with source userId' });
          continue;
        }
        parts[0] = targetUserId;
        const newFileKey = parts.join('/');

        const existing = await prismaClient.file.findUnique({ where: { fileKey: newFileKey } });
        if (existing) {
          failed++;
          errors.push({ fileKey: file.fileKey, error: 'Target file already exists' });
          continue;
        }

        const srcPath = path.join(BOOKS_DIR, file.fileKey);
        const dstPath = path.join(BOOKS_DIR, newFileKey);
        await fs.mkdir(path.dirname(dstPath), { recursive: true });
        await fs.rename(srcPath, dstPath).catch(async () => {
          // 跨设备时 rename 会失败，降级为 copy + unlink
          await fs.copyFile(srcPath, dstPath);
          await fs.unlink(srcPath).catch(() => {});
        });

        await prismaClient.file.create({
          data: {
            userId: targetUserId,
            fileKey: newFileKey,
            fileSize: file.fileSize,
            bookHash: file.bookHash,
            replicaKind: file.replicaKind,
            replicaId: file.replicaId,
          },
        });
        await prismaClient.file.delete({ where: { id: file.id } });
        moved++;
      } catch (err) {
        failed++;
        errors.push({ fileKey: file.fileKey, error: err instanceof Error ? err.message : 'unknown error' });
      }
    }

    // 写审计日志
    await prismaClient.auditLog.create({
      data: {
        userId: user.id,
        targetUserId,
        action: 'book_move',
        description: `Moved ${moved} file(s) from ${files[0]?.userId ?? '?'} to ${targetUserId}`,
        metadata: JSON.stringify({ moved, failed, fileKeys: fileKeys.slice(0, 20) }),
      },
    }).catch(() => { /* audit log failure should not block operation */ });

    return NextResponse.json({ moved, failed, errors });
  } catch (error) {
    console.error('Move files error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to move files' },
      { status: 500 },
    );
  }
}
